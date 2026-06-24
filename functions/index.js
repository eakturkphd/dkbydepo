const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const sgMail = require("@sendgrid/mail");

admin.initializeApp();
setGlobalOptions({ region: process.env.FUNCTION_REGION || "europe-west1" });

const db = admin.firestore();
const SITE_URL = (process.env.SITE_URL || "https://eakturkphd.github.io/dkbydepo").replace(/\/$/, "");
const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@example.com";
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";

if (SENDGRID_API_KEY) sgMail.setApiKey(SENDGRID_API_KEY);

function cleanString(value, max = 200) {
  return String(value || "").trim().slice(0, max);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function assertAdmin(context) {
  const uid = context.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Giriş yapılmamış.");
  const userSnap = await db.collection("users").doc(uid).get();
  if (!userSnap.exists || userSnap.data().role !== "admin") {
    throw new HttpsError("permission-denied", "Bu işlem için admin yetkisi gerekir.");
  }
  return { uid, ...userSnap.data() };
}

async function sendInviteEmail({ to, displayName, inviteLink, courseIds }) {
  if (!SENDGRID_API_KEY) return { emailSent: false, reason: "SENDGRID_API_KEY tanımlı değil." };
  const courseText = Array.isArray(courseIds) && courseIds.length ? courseIds.join(", ") : "Henüz ders ataması yok";
  const subject = "DKB Ders Programı Sistemi Daveti";
  const text = `Sayın ${displayName},\n\nDoğa Koruma ve Biyoçeşitlilik Yönetimi Bölümü ders programı sistemine davet edildiniz.\n\nAtanan dersler: ${courseText}\n\nŞifrenizi belirlemek ve sisteme giriş yapmak için bağlantı:\n${inviteLink}\n\nBu bağlantı 7 gün geçerlidir.`;
  const html = `
    <p>Sayın <strong>${displayName}</strong>,</p>
    <p>Doğa Koruma ve Biyoçeşitlilik Yönetimi Bölümü ders programı sistemine davet edildiniz.</p>
    <p><strong>Atanan dersler:</strong> ${courseText}</p>
    <p><a href="${inviteLink}" style="display:inline-block;padding:12px 16px;background:#1f6f4a;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Şifremi belirle</a></p>
    <p>Bağlantı çalışmazsa aşağıdaki adresi tarayıcınıza kopyalayın:</p>
    <p>${inviteLink}</p>
    <p>Bu bağlantı 7 gün geçerlidir.</p>`;
  await sgMail.send({ to, from: FROM_EMAIL, subject, text, html });
  return { emailSent: true };
}

exports.inviteTeacher = onCall({ cors: true }, async (request) => {
  const adminUser = await assertAdmin(request);
  const displayName = cleanString(request.data?.displayName, 120);
  const title = cleanString(request.data?.title, 80);
  const email = cleanString(request.data?.email, 160).toLowerCase();
  const courseIds = Array.isArray(request.data?.courseIds)
    ? request.data.courseIds.map(x => cleanString(x, 40)).filter(Boolean)
    : [];

  if (!displayName) throw new HttpsError("invalid-argument", "Ad soyad zorunludur.");
  if (!isEmail(email)) throw new HttpsError("invalid-argument", "Geçerli e-posta adresi girilmelidir.");

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const inviteLink = `${SITE_URL}/accept-invite.html?token=${token}`;

  await db.collection("invitations").doc(token).set({
    email,
    displayName,
    title,
    courseIds,
    invitedBy: adminUser.uid,
    status: "pending",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt
  });

  const emailResult = await sendInviteEmail({ to: email, displayName, inviteLink, courseIds });
  await db.collection("invitations").doc(token).set({ emailSent: !!emailResult.emailSent, emailSendReason: emailResult.reason || null }, { merge: true });

  return { inviteLink, emailSent: !!emailResult.emailSent, reason: emailResult.reason || null };
});

exports.acceptInvite = onCall({ cors: true }, async (request) => {
  const token = cleanString(request.data?.token, 128);
  const password = String(request.data?.password || "");
  if (!token) throw new HttpsError("invalid-argument", "Davet token bilgisi eksik.");
  if (password.length < 6) throw new HttpsError("invalid-argument", "Şifre en az 6 karakter olmalıdır.");

  const inviteRef = db.collection("invitations").doc(token);
  const inviteSnap = await inviteRef.get();
  if (!inviteSnap.exists) throw new HttpsError("not-found", "Davet bulunamadı.");
  const invite = inviteSnap.data();
  if (invite.status === "accepted") throw new HttpsError("failed-precondition", "Bu davet daha önce kullanılmış.");
  if (invite.expiresAt && invite.expiresAt.toMillis() < Date.now()) throw new HttpsError("deadline-exceeded", "Davet bağlantısının süresi dolmuş.");

  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(invite.email);
    userRecord = await admin.auth().updateUser(userRecord.uid, {
      password,
      displayName: invite.displayName,
      disabled: false
    });
  } catch (err) {
    if (err.code !== "auth/user-not-found") throw err;
    userRecord = await admin.auth().createUser({
      email: invite.email,
      password,
      displayName: invite.displayName,
      disabled: false
    });
  }

  const batch = db.batch();
  batch.set(db.collection("users").doc(userRecord.uid), {
    email: invite.email,
    displayName: invite.displayName,
    title: invite.title || "",
    role: "teacher",
    createdFromInvite: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  for (const courseId of invite.courseIds || []) {
    batch.set(db.collection("assignments").doc(courseId), {
      courseId,
      teacherId: userRecord.uid,
      updatedBy: invite.invitedBy || "invite",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  batch.set(inviteRef, {
    status: "accepted",
    acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
    acceptedUid: userRecord.uid
  }, { merge: true });

  await batch.commit();
  return { email: invite.email, uid: userRecord.uid };
});
