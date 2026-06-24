import { firebaseConfig, functionRegion } from "./firebase-config.js";

const $ = (id) => document.getElementById(id);
const PLACEHOLDER = !firebaseConfig.apiKey || firebaseConfig.apiKey.includes("YOUR_") || firebaseConfig.projectId.includes("YOUR_");
const params = new URLSearchParams(window.location.search);
const token = params.get("token") || "";
let fb = null;

function toast(message, type = "info") {
  const el = $("toast");
  el.textContent = message;
  el.className = `toast show ${type}`;
  setTimeout(() => { el.className = "toast"; }, 4400);
}

async function initFirebase() {
  if (PLACEHOLDER) return;
  const [appMod, authMod, fnMod] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js")
  ]);
  const app = appMod.initializeApp(firebaseConfig);
  fb = {
    auth: authMod.getAuth(app),
    functions: fnMod.getFunctions(app, functionRegion || "europe-west1"),
    httpsCallable: fnMod.httpsCallable,
    signInWithEmailAndPassword: authMod.signInWithEmailAndPassword
  };
}

async function acceptInvite(password) {
  if (!token) throw new Error("Davet token bilgisi bulunamadı.");
  if (!fb) throw new Error("Firebase yapılandırılmadığı için davet kabul edilemez.");
  const callAccept = fb.httpsCallable(fb.functions, "acceptInvite");
  const result = await callAccept({ token, password });
  const data = result.data || {};
  if (!data.email) throw new Error("Hesap oluşturuldu ancak e-posta bilgisi alınamadı.");
  await fb.signInWithEmailAndPassword(fb.auth, data.email, password);
  return data.email;
}

function bind() {
  const form = $("acceptInviteForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pass = $("newPassword").value;
    const again = $("newPasswordAgain").value;
    if (pass !== again) {
      toast("Şifreler aynı değil.", "error");
      return;
    }
    try {
      const email = await acceptInvite(pass);
      toast(`Hesap oluşturuldu: ${email}`, "success");
      setTimeout(() => { window.location.href = "./index.html"; }, 900);
    } catch (err) {
      console.error(err);
      toast(err.message || "Davet kabul edilemedi.", "error");
    }
  });
}

async function init() {
  bind();
  if (!token) {
    $("inviteStatus").textContent = "Bu bağlantıda davet token bilgisi yok.";
    return;
  }
  if (PLACEHOLDER) {
    $("inviteStatus").textContent = "Firebase yapılandırılmadığı için bu sayfa yalnızca gerçek kurulumdan sonra çalışır.";
    return;
  }
  try {
    await initFirebase();
    $("inviteStatus").textContent = "Davet bağlantısı hazır. Lütfen yeni şifrenizi belirleyin.";
    $("acceptInviteForm").classList.remove("hidden");
  } catch (err) {
    console.error(err);
    $("inviteStatus").textContent = "Firebase başlatılamadı. Yapılandırma bilgilerini kontrol edin.";
  }
}

init();
