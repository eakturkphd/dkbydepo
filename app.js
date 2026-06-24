import { firebaseConfig, adminEmails, functionRegion } from "./firebase-config.js";
import { COURSES, ROOMS, DAYS, SLOTS } from "./data/courses.js";

const $ = (id) => document.getElementById(id);
const PLACEHOLDER = !firebaseConfig.apiKey || firebaseConfig.apiKey.includes("YOUR_") || firebaseConfig.projectId.includes("YOUR_");
const LS_KEY = "dkb_schedule_demo_v2";

const DEMO_USERS = [
  { id: "admin", username: "admin", email: "admin@demo.local", password: "DKB2026!", displayName: "Yetkili Kullanıcı", title: "Bölüm Başkanı", role: "admin" },
  { id: "hoca1", username: "hoca1", email: "hoca1@demo.local", password: "123456", displayName: "Hoca 1", title: "Öğretim Elemanı", role: "teacher" },
  { id: "hoca2", username: "hoca2", email: "hoca2@demo.local", password: "123456", displayName: "Hoca 2", title: "Öğretim Elemanı", role: "teacher" },
  { id: "hoca3", username: "hoca3", email: "hoca3@demo.local", password: "123456", displayName: "Hoca 3", title: "Öğretim Elemanı", role: "teacher" }
];

let fb = null;
let state = {
  mode: PLACEHOLDER ? "demo" : "firebase",
  user: null,
  users: [],
  assignments: {},
  courseParts: {},
  bookings: [],
  invitations: [],
  selectedSemester: 1,
  selectedRoom: "ALL",
  activePlacement: null
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function initialDemoStore() {
  return {
    users: DEMO_USERS.map(u => ({ ...u })),
    assignments: {},
    courseParts: {},
    bookings: [],
    invitations: []
  };
}

function normalizeStore(parsed = {}) {
  const fresh = initialDemoStore();
  const usersById = new Map(fresh.users.map(u => [u.id, u]));
  (parsed.users || []).forEach(u => usersById.set(u.id, { ...u }));
  return {
    users: [...usersById.values()],
    assignments: parsed.assignments || {},
    courseParts: parsed.courseParts || {},
    bookings: parsed.bookings || [],
    invitations: parsed.invitations || []
  };
}

function getDemoStore() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) {
    const fresh = initialDemoStore();
    localStorage.setItem(LS_KEY, JSON.stringify(fresh));
    return fresh;
  }
  try {
    return normalizeStore(JSON.parse(raw));
  } catch {
    const fresh = initialDemoStore();
    localStorage.setItem(LS_KEY, JSON.stringify(fresh));
    return fresh;
  }
}

function setDemoStore(next) {
  localStorage.setItem(LS_KEY, JSON.stringify(next));
}

async function initFirebaseIfConfigured() {
  if (PLACEHOLDER) return;
  try {
    const [appMod, authMod, fsMod, fnMod] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js"),
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js")
    ]);
    const app = appMod.initializeApp(firebaseConfig);
    fb = {
      app,
      auth: authMod.getAuth(app),
      db: fsMod.getFirestore(app),
      functions: fnMod.getFunctions(app, functionRegion || "europe-west1"),
      signInWithEmailAndPassword: authMod.signInWithEmailAndPassword,
      signOut: authMod.signOut,
      collection: fsMod.collection,
      doc: fsMod.doc,
      getDoc: fsMod.getDoc,
      getDocs: fsMod.getDocs,
      setDoc: fsMod.setDoc,
      deleteDoc: fsMod.deleteDoc,
      writeBatch: fsMod.writeBatch,
      runTransaction: fsMod.runTransaction,
      serverTimestamp: fsMod.serverTimestamp,
      httpsCallable: fnMod.httpsCallable
    };
  } catch (err) {
    console.warn("Firebase başlatılamadı; demo moda geçildi.", err);
    state.mode = "demo";
  }
}

function toast(message, type = "info") {
  const el = $("toast");
  el.textContent = message;
  el.className = `toast show ${type}`;
  setTimeout(() => { el.className = "toast"; }, 4400);
}

function isAdmin() {
  return state.user?.role === "admin";
}

function isTeacher() {
  return state.user?.role === "teacher";
}

function getCourse(courseId) {
  return COURSES.find(c => c.id === courseId);
}

function getRoom(roomId) {
  return ROOMS.find(r => r.id === roomId);
}

function teacherName(id) {
  if (!id) return "Atanmamış";
  const u = state.users.find(u => u.id === id);
  return u ? `${u.title ? `${u.title} ` : ""}${u.displayName}` : id;
}

function visibleTeachers() {
  return state.users
    .filter(u => u.role === "teacher" || u.role === "admin")
    .sort((a, b) => (a.displayName || "").localeCompare(b.displayName || "", "tr"));
}

function courseLabel(course) {
  return `${course.code} · ${course.name}`;
}

function partsFor(courseId) {
  const course = getCourse(courseId);
  const parts = state.courseParts[courseId];
  if (Array.isArray(parts) && parts.length) return parts.map(Number).filter(n => n > 0);
  return [course.duration];
}

function bookingId(courseId, partIndex = 0) {
  return `${courseId}__p${partIndex}`;
}

function blockSlots(startSlot, duration) {
  return Array.from({ length: duration }, (_, i) => Number(startSlot) + i);
}

function rangesOverlap(aStart, aDuration, bStart, bDuration) {
  const aEnd = Number(aStart) + Number(aDuration) - 1;
  const bEnd = Number(bStart) + Number(bDuration) - 1;
  return Number(aStart) <= bEnd && Number(bStart) <= aEnd;
}

function bookingForCoursePart(courseId, partIndex) {
  return state.bookings.find(b => b.id === bookingId(courseId, partIndex));
}

function bookingAt(roomId, day, slot) {
  return state.bookings.find(b => b.roomId === roomId && b.day === day && b.startSlot === Number(slot));
}

function bookingCovering(roomId, day, slot) {
  return state.bookings.find(b => b.roomId === roomId && b.day === day && Number(slot) >= Number(b.startSlot) && Number(slot) < Number(b.startSlot) + Number(b.duration));
}

function canDeleteBooking(b) {
  return isAdmin() || b.teacherId === state.user?.id || b.createdBy === state.user?.id;
}

function validateTimeBlock(course, roomId, day, startSlot, duration) {
  if (!course) return "Ders bulunamadı.";
  if (!DAYS.includes(day)) return "Geçersiz gün seçimi.";
  if (!ROOMS.some(r => r.id === roomId)) return "Geçersiz derslik seçimi.";
  if (course.year === 1 && roomId !== "109") {
    return "1. sınıf dersleri yalnızca 109 no'lu dersliğe yerleştirilebilir.";
  }
  if (Number(startSlot) < 0 || Number(startSlot) + Number(duration) > SLOTS.length) {
    return "Seçilen başlangıç saati ders süresi için uygun değil.";
  }
  const period = SLOTS[Number(startSlot)].period;
  const crossesLunch = blockSlots(startSlot, duration).some(slot => !SLOTS[slot] || SLOTS[slot].period !== period);
  if (crossesLunch) {
    return "Ders bloğu öğle arasını geçemez; aynı ders sabah ve öğleden sonra arasında parçalanamaz.";
  }
  return null;
}

function validateAgainstBookings(placement, proposed = []) {
  const { course, roomId, day, startSlot, duration, teacherId, partIndex } = placement;
  const basicError = validateTimeBlock(course, roomId, day, startSlot, duration);
  if (basicError) return basicError;

  const thisBookingId = bookingId(course.id, partIndex);
  const groupKey = course.electiveGroup || null;

  for (const b of state.bookings) {
    const existingCourse = getCourse(b.courseId);
    if (!existingCourse) continue;
    if (b.id === thisBookingId) return `${course.code} için bu parça zaten programa yerleştirilmiş.`;
    if (b.day !== day) continue;
    if (!rangesOverlap(startSlot, duration, b.startSlot, b.duration)) continue;

    if (b.roomId === roomId) {
      return `${SLOTS[startSlot].label} bloğu ${getRoom(roomId)?.name} için dolu.`;
    }
    if (b.teacherId === teacherId) {
      return `${teacherName(teacherId)} aynı zaman aralığında başka bir derse atanmış.`;
    }
    const sameSemester = existingCourse.semester === course.semester;
    const sameElectivePool = groupKey && existingCourse.electiveGroup === groupKey;
    if (sameSemester && !sameElectivePool) {
      return `${course.semester}. yarıyıl için aynı zaman aralığında başka bir ders var.`;
    }
  }

  for (const p of proposed) {
    if (p.day !== day) continue;
    if (!rangesOverlap(startSlot, duration, p.startSlot, p.duration)) continue;
    if (p.roomId === roomId) return "Aynı işlem içinde iki ders aynı dersliğe yerleştirilemez.";
    if (p.teacherId === teacherId) return "Aynı hoca aynı zaman aralığında iki farklı derse atanamaz.";
    const sameSemester = p.course.semester === course.semester;
    const sameElectivePool = groupKey && p.course.electiveGroup === groupKey;
    if (sameSemester && !sameElectivePool) return "Aynı yarıyıl dersleri çakışıyor.";
  }
  return null;
}

function buildPlacements(courseId, partIndex, day, startSlot, roomId) {
  const course = getCourse(courseId);
  const duration = partsFor(courseId)[partIndex];
  const teacherId = state.assignments[courseId];
  if (!course) throw new Error("Ders bulunamadı.");
  if (!teacherId) throw new Error(`${course.code} için önce hoca ataması yapılmalı.`);

  const groupCourses = course.electiveGroup
    ? COURSES.filter(c => c.semester === course.semester && c.electiveGroup === course.electiveGroup)
    : [course];

  if (course.electiveGroup) {
    if (groupCourses.length > ROOMS.length) {
      throw new Error(`${course.electiveGroup} için yeterli derslik yok. ${groupCourses.length} ders, ${ROOMS.length} derslik mevcut.`);
    }
    for (const gc of groupCourses) {
      if (!state.assignments[gc.id]) throw new Error(`${course.electiveGroup} içindeki ${gc.code} için hoca ataması yapılmamış.`);
      const gp = partsFor(gc.id)[partIndex] || partsFor(gc.id)[0];
      if (gp !== duration) throw new Error(`${course.electiveGroup} içindeki derslerin süreleri eşit değil; otomatik eşzamanlı atama yapılamaz.`);
    }
  }

  const orderedRooms = [roomId, ...ROOMS.map(r => r.id).filter(id => id !== roomId)];
  const orderedCourses = [course, ...groupCourses.filter(gc => gc.id !== courseId)];

  return orderedCourses.map((gc, idx) => ({
    id: bookingId(gc.id, partIndex),
    course: gc,
    courseId: gc.id,
    teacherId: state.assignments[gc.id],
    roomId: orderedRooms[idx],
    day,
    startSlot: Number(startSlot),
    duration,
    partIndex: Number(partIndex),
    electiveGroup: gc.electiveGroup || null
  }));
}

function validatePlacements(placements) {
  const checked = [];
  for (const p of placements) {
    const err = validateAgainstBookings(p, checked);
    if (err) throw new Error(err);
    checked.push(p);
  }
}

function occupancyKeysForPlacement(p) {
  const keys = [];
  for (const slot of blockSlots(p.startSlot, p.duration)) {
    keys.push({ key: `room__${p.roomId}__${p.day}__${slot}`, kind: "room", electiveGroup: p.electiveGroup });
    keys.push({ key: `teacher__${p.teacherId}__${p.day}__${slot}`, kind: "teacher", electiveGroup: p.electiveGroup });
    keys.push({ key: `cohort__sem${p.course.semester}__${p.day}__${slot}`, kind: "cohort", electiveGroup: p.electiveGroup });
  }
  return keys;
}

function placementToBooking(p, extra = {}) {
  return {
    id: p.id,
    courseId: p.courseId,
    teacherId: p.teacherId,
    roomId: p.roomId,
    day: p.day,
    startSlot: p.startSlot,
    duration: p.duration,
    partIndex: p.partIndex,
    electiveGroup: p.electiveGroup,
    createdBy: state.user.id,
    createdAt: new Date().toISOString(),
    occupancyKeys: occupancyKeysForPlacement(p).map(k => k.key),
    ...extra
  };
}

async function saveBookingLocal(placements) {
  const store = getDemoStore();
  const newBookings = placements.map(p => placementToBooking(p));
  store.bookings = [...store.bookings, ...newBookings];
  setDemoStore(store);
  await loadData();
}

async function saveBookingFirebase(placements) {
  const { db, doc, runTransaction, serverTimestamp } = fb;
  await runTransaction(db, async (tx) => {
    const bookingRefs = placements.map(p => doc(db, "bookings", p.id));
    for (const ref of bookingRefs) {
      const snap = await tx.get(ref);
      if (snap.exists()) throw new Error("Bu ders/parça daha önce programa yerleştirilmiş.");
    }

    const occMap = new Map();
    for (const p of placements) {
      for (const item of occupancyKeysForPlacement(p)) {
        if (!occMap.has(item.key)) occMap.set(item.key, item);
      }
    }

    for (const item of occMap.values()) {
      const ref = doc(db, "occupancy", item.key);
      const snap = await tx.get(ref);
      if (!snap.exists()) continue;
      const data = snap.data();
      const sameElectiveCohort = item.kind === "cohort" && item.electiveGroup && data.electiveGroup === item.electiveGroup;
      if (!sameElectiveCohort) throw new Error("Bu zaman aralığı başka bir kullanıcı tarafından az önce dolduruldu.");
    }

    for (const p of placements) {
      tx.set(doc(db, "bookings", p.id), placementToBooking(p, { createdAt: serverTimestamp() }));
    }
    for (const item of occMap.values()) {
      tx.set(doc(db, "occupancy", item.key), {
        kind: item.kind,
        electiveGroup: item.electiveGroup || null,
        updatedAt: serverTimestamp()
      });
    }
  });
  await loadData();
}

async function bookCourse(courseId, partIndex, day, startSlot, roomId) {
  const placements = buildPlacements(courseId, Number(partIndex), day, Number(startSlot), roomId);
  validatePlacements(placements);
  if (state.mode === "firebase" && fb) await saveBookingFirebase(placements);
  else await saveBookingLocal(placements);
  state.activePlacement = null;
  toast("Ders programa yerleştirildi.", "success");
}

async function deleteBooking(courseId, partIndex = 0) {
  const course = getCourse(courseId);
  const existing = bookingForCoursePart(courseId, partIndex);
  if (existing && !canDeleteBooking(existing)) throw new Error("Bu dersi programdan kaldırma yetkiniz yok.");

  const idsToDelete = course.electiveGroup
    ? COURSES.filter(c => c.semester === course.semester && c.electiveGroup === course.electiveGroup).map(c => bookingId(c.id, partIndex))
    : [bookingId(courseId, partIndex)];

  if (state.mode === "firebase" && fb) {
    const { db, doc, getDoc, writeBatch } = fb;
    const batch = writeBatch(db);
    const occKeys = new Set();
    for (const bid of idsToDelete) {
      const ref = doc(db, "bookings", bid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const b = snap.data();
        (b.occupancyKeys || []).forEach(k => occKeys.add(k));
        batch.delete(ref);
      }
    }
    occKeys.forEach(k => batch.delete(doc(db, "occupancy", k)));
    await batch.commit();
  } else {
    const store = getDemoStore();
    store.bookings = store.bookings.filter(b => !idsToDelete.includes(b.id));
    setDemoStore(store);
  }
  await loadData();
  toast(course.electiveGroup ? "Seçmeli havuz eşzamanlı programdan kaldırıldı." : "Ders programdan kaldırıldı.", "success");
}

async function setAssignment(courseId, teacherId) {
  if (!isAdmin()) throw new Error("Bu işlem için yetkili kullanıcı gerekir.");
  if (state.mode === "firebase" && fb) {
    const { db, doc, setDoc, deleteDoc, serverTimestamp } = fb;
    if (teacherId) {
      await setDoc(doc(db, "assignments", courseId), { courseId, teacherId, updatedBy: state.user.id, updatedAt: serverTimestamp() });
    } else {
      await deleteDoc(doc(db, "assignments", courseId));
    }
  } else {
    const store = getDemoStore();
    if (teacherId) store.assignments[courseId] = teacherId;
    else delete store.assignments[courseId];
    setDemoStore(store);
  }
  await loadData();
  toast("Atama güncellendi.", "success");
}

async function setCourseParts(courseId, partText) {
  if (!isAdmin()) throw new Error("Bu işlem için yetkili kullanıcı gerekir.");
  const course = getCourse(courseId);
  const parts = partText.split(",").map(x => Number(x.trim())).filter(n => Number.isFinite(n) && n > 0);
  if (!parts.length) throw new Error("Parça bilgisi boş olamaz. Örn: 4 veya 2,2");
  const total = parts.reduce((a, b) => a + b, 0);
  if (total !== course.duration) throw new Error(`Parça toplamı ders süresine eşit olmalı. ${course.code} toplam süre: ${course.duration}`);

  if (state.mode === "firebase" && fb) {
    const { db, doc, setDoc, serverTimestamp } = fb;
    await setDoc(doc(db, "courseParts", courseId), { courseId, parts, updatedBy: state.user.id, updatedAt: serverTimestamp() });
  } else {
    const store = getDemoStore();
    store.courseParts[courseId] = parts;
    setDemoStore(store);
  }
  await loadData();
  toast("Ders parça kuralı güncellendi.", "success");
}

function selectedInviteCourses() {
  return [...document.querySelectorAll("[data-invite-course]:checked")].map(el => el.value);
}

async function inviteTeacher(form) {
  if (!isAdmin()) throw new Error("Bu işlem için yetkili kullanıcı gerekir.");
  const displayName = form.displayName.value.trim();
  const title = form.title.value.trim();
  const email = form.email.value.trim().toLowerCase();
  const username = form.username.value.trim() || email;
  const password = form.demoPassword?.value || "123456";
  const courseIds = selectedInviteCourses();

  if (!displayName || !email) throw new Error("Ad soyad ve e-posta zorunludur.");

  if (state.mode === "firebase" && fb) {
    const callInvite = fb.httpsCallable(fb.functions, "inviteTeacher");
    const result = await callInvite({ displayName, title, email, courseIds });
    await loadData();
    const data = result.data || {};
    renderInviteResult(data.emailSent
      ? `Davet e-postası gönderildi: ${email}`
      : `Davet kaydı oluşturuldu ancak e-posta gönderilmedi. Davet linki: ${data.inviteLink || "Fonksiyon yanıtında link yok."}`);
    toast(data.emailSent ? "Davet e-postası gönderildi." : "Davet oluşturuldu; mail ayarı yoksa linki manuel paylaşın.", data.emailSent ? "success" : "info");
    return;
  }

  const store = getDemoStore();
  const id = username.replace(/[^a-zA-Z0-9_@.-]/g, "_").toLowerCase();
  const existingIndex = store.users.findIndex(u => u.id === id || u.email === email);
  const teacher = { id, username, email, password, displayName, title, role: "teacher" };
  if (existingIndex >= 0) store.users[existingIndex] = { ...store.users[existingIndex], ...teacher };
  else store.users.push(teacher);
  for (const courseId of courseIds) store.assignments[courseId] = id;
  store.invitations.push({ email, displayName, courseIds, createdAt: new Date().toISOString(), status: "demo" });
  setDemoStore(store);
  await loadData();
  renderInviteResult(`Demo mod: Gerçek e-posta gönderilmedi. Kullanıcı girişi: ${username} / ${password}`);
  toast("Demo kullanıcı eklendi ve dersleri atandı.", "success");
}

function renderInviteResult(message) {
  const target = $("inviteResult");
  if (!target) return;
  target.classList.remove("hidden");
  target.textContent = message;
}

async function loadData() {
  if (state.mode === "firebase" && fb && state.user) {
    const { db, collection, getDocs } = fb;
    const jobs = [
      getDocs(collection(db, "users")),
      getDocs(collection(db, "assignments")),
      getDocs(collection(db, "courseParts")),
      getDocs(collection(db, "bookings"))
    ];
    if (isAdmin()) jobs.push(getDocs(collection(db, "invitations")));
    const [userSnap, assignSnap, partsSnap, bookingSnap, inviteSnap] = await Promise.all(jobs);
    state.users = userSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    state.assignments = Object.fromEntries(assignSnap.docs.map(d => [d.id, d.data().teacherId]));
    state.courseParts = Object.fromEntries(partsSnap.docs.map(d => [d.id, d.data().parts]));
    state.bookings = bookingSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    state.invitations = inviteSnap ? inviteSnap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
  } else {
    const store = getDemoStore();
    state.users = store.users.map(({ password, ...u }) => u);
    state.assignments = store.assignments;
    state.courseParts = store.courseParts;
    state.bookings = store.bookings;
    state.invitations = store.invitations || [];
  }
  render();
}

async function loginDemo(identifier, password) {
  const store = getDemoStore();
  const found = store.users.find(u => (u.username === identifier || u.email === identifier || u.id === identifier) && u.password === password);
  if (!found) throw new Error("Demo kullanıcı adı/şifre hatalı.");
  const { password: _pw, ...safe } = found;
  state.user = safe;
  state.mode = "demo";
  await loadData();
}

async function loginFirebase(email, password) {
  if (!fb) throw new Error("Firebase başlatılamadı.");
  const cred = await fb.signInWithEmailAndPassword(fb.auth, email, password);
  const uid = cred.user.uid;
  const userRef = fb.doc(fb.db, "users", uid);
  let snap = await fb.getDoc(userRef);

  if (!snap.exists() && adminEmails.includes(email)) {
    try {
      await fb.setDoc(userRef, { email, displayName: "Yetkili Kullanıcı", role: "admin", title: "Bölüm Başkanı" });
      snap = await fb.getDoc(userRef);
    } catch (err) {
      console.warn("Admin kullanıcı dokümanı otomatik oluşturulamadı.", err);
    }
  }

  if (!snap.exists()) {
    throw new Error("Giriş başarılı ancak users koleksiyonunda yetki kaydı yok. Adminin bu kullanıcıyı Firestore users koleksiyonuna eklemesi gerekir.");
  }
  state.user = { id: uid, email, ...snap.data() };
  await loadData();
}

async function logout() {
  if (state.mode === "firebase" && fb) await fb.signOut(fb.auth).catch(() => {});
  state.user = null;
  state.activePlacement = null;
  render();
}

function renderLogin() {
  $("loginPanel").classList.remove("hidden");
  $("appPanel").classList.add("hidden");
  $("modeBadge").textContent = state.mode === "firebase" ? "Firebase" : "Demo";
  $("demoInfo").classList.toggle("hidden", state.mode === "firebase");
}

function render() {
  if (!state.user) return renderLogin();
  $("loginPanel").classList.add("hidden");
  $("appPanel").classList.remove("hidden");
  $("modeBadge").textContent = state.mode === "firebase" ? "Firebase" : "Demo";
  $("userBadge").textContent = `${state.user.displayName || state.user.email} · ${state.user.role === "admin" ? "Yetkili" : "Hoca"}`;
  $("backendBadge").textContent = state.mode === "firebase" ? "Firebase veri tabanı" : "Tarayıcı içi demo";
  renderActiveBadge();
  renderFilters();
  renderStats();
  renderAdmin();
  renderMyCourses();
  renderSchedule();
}

function renderActiveBadge() {
  const el = $("activePlacementBadge");
  if (!state.activePlacement) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  const course = getCourse(state.activePlacement.courseId);
  const duration = partsFor(course.id)[state.activePlacement.partIndex];
  el.classList.remove("hidden");
  el.textContent = `Seçili: ${course.code} · ${duration} saat`;
}

function renderStats() {
  const coursesInSem = COURSES.filter(c => c.semester === state.selectedSemester);
  const assigned = coursesInSem.filter(c => state.assignments[c.id]).length;
  const placed = coursesInSem.filter(c => partsFor(c.id).every((_, idx) => bookingForCoursePart(c.id, idx))).length;
  const teacherCount = visibleTeachers().filter(u => u.role === "teacher").length;
  const electiveGroups = new Set(coursesInSem.filter(c => c.electiveGroup).map(c => c.electiveGroup)).size;
  $("statsGrid").innerHTML = [
    ["Seçili yarıyıl dersleri", coursesInSem.length],
    ["Hoca ataması yapılan", assigned],
    ["Programa yerleşen", placed],
    ["Sistemdeki hoca", teacherCount || 0],
    ["Seçmeli havuz", electiveGroups]
  ].map(([label, value]) => `<div class="statCard"><div class="statLabel">${label}</div><div class="statValue">${value}</div></div>`).join("");
}

function renderFilters() {
  const sem = $("semesterFilter");
  sem.innerHTML = Array.from({ length: 8 }, (_, i) => `<option value="${i + 1}">${i + 1}. yarıyıl / ${Math.ceil((i + 1) / 2)}. sınıf</option>`).join("");
  sem.value = String(state.selectedSemester);

  const room = $("roomFilter");
  room.innerHTML = `<option value="ALL">Tüm derslikler</option>` + ROOMS.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join("");
  room.value = state.selectedRoom;
}

function startOptions(duration, selected = 0) {
  return SLOTS.map(s => {
    const err = Number(s.index) + Number(duration) > SLOTS.length || blockSlots(s.index, duration).some(slot => !SLOTS[slot] || SLOTS[slot].period !== s.period);
    return `<option value="${s.index}" ${Number(selected) === s.index ? "selected" : ""} ${err ? "disabled" : ""}>${s.label}</option>`;
  }).join("");
}

function roomOptions(course, selected = "109") {
  return ROOMS.map(r => {
    const disabled = course.year === 1 && r.id !== "109";
    return `<option value="${r.id}" ${selected === r.id ? "selected" : ""} ${disabled ? "disabled" : ""}>${escapeHtml(r.name)}</option>`;
  }).join("");
}

function dayOptions(selected = DAYS[0]) {
  return DAYS.map(d => `<option value="${d}" ${selected === d ? "selected" : ""}>${d}</option>`).join("");
}

function renderMyCourses() {
  const target = $("myCourses");
  const visibleCourses = COURSES
    .filter(c => c.semester === state.selectedSemester)
    .filter(c => isAdmin() || state.assignments[c.id] === state.user.id)
    .sort((a, b) => a.code.localeCompare(b.code, "tr"));

  if (!visibleCourses.length) {
    target.innerHTML = `<div class="empty">Bu yarıyılda size atanmış ders bulunmuyor.</div>`;
    return;
  }

  target.innerHTML = `<div class="courseGrid">${visibleCourses.map(course => {
    const assignedTeacher = state.assignments[course.id];
    const partRows = partsFor(course.id).map((duration, idx) => {
      const existing = bookingForCoursePart(course.id, idx);
      const isActive = state.activePlacement?.courseId === course.id && Number(state.activePlacement?.partIndex) === idx;
      if (existing) {
        return `<div class="courseAction booked">
          <span class="partLabel">Parça ${idx + 1}</span>
          <span class="pill ok">${existing.day} · ${SLOTS[existing.startSlot].label} · ${getRoom(existing.roomId)?.name}</span>
          ${canDeleteBooking(existing) ? `<button class="small danger" type="button" data-action="delete-booking" data-course-id="${course.id}" data-part-index="${idx}">Kaldır</button>` : ""}
        </div>`;
      }
      return `<div class="courseAction" data-course-row="${course.id}__${idx}">
        <span class="partLabel">${duration} ders saati</span>
        <button class="small ${isActive ? "selected" : ""}" type="button" data-action="select-placement" data-course-id="${course.id}" data-part-index="${idx}">Tablodan yerleştir</button>
        <select data-quick-day="${course.id}__${idx}">${dayOptions()}</select>
        <select data-quick-slot="${course.id}__${idx}">${startOptions(duration)}</select>
        <select data-quick-room="${course.id}__${idx}">${roomOptions(course, course.year === 1 ? "109" : "EK")}</select>
        <button class="primary small" type="button" data-action="quick-book" data-course-id="${course.id}" data-part-index="${idx}">Yerleştir</button>
      </div>`;
    }).join("");

    return `<article class="courseCard">
      <div class="courseHead">
        <div>
          <div class="courseTitle">${escapeHtml(courseLabel(course))}</div>
          <div class="courseSub">${course.semester}. yarıyıl · T:${course.t} U:${course.u} · ${course.duration} ders saati · AKTS:${course.ects}</div>
        </div>
        <div>
          ${course.electiveGroup ? `<span class="pill elective">${escapeHtml(course.electiveGroup)}</span>` : `<span class="pill gray">Zorunlu</span>`}
          <span class="pill ${assignedTeacher ? "ok" : "warn"}">${escapeHtml(teacherName(assignedTeacher))}</span>
        </div>
      </div>
      ${partRows}
    </article>`;
  }).join("")}</div>`;
}

function teacherOptions(selected = "") {
  return `<option value="">Atanmamış</option>` + visibleTeachers().map(u => `<option value="${escapeHtml(u.id)}" ${selected === u.id ? "selected" : ""}>${escapeHtml(teacherName(u.id))}</option>`).join("");
}

function renderAdmin() {
  const panel = $("adminPanel");
  if (!isAdmin()) {
    panel.classList.add("hidden");
    panel.innerHTML = "";
    return;
  }
  panel.classList.remove("hidden");
  const semesterCourses = COURSES.filter(c => c.semester === state.selectedSemester).sort((a, b) => a.code.localeCompare(b.code, "tr"));
  const teacherRows = visibleTeachers().map(u => {
    const assignedCourses = COURSES.filter(c => state.assignments[c.id] === u.id).map(c => c.code);
    return `<div class="teacherRow">
      <div>
        <strong>${escapeHtml(teacherName(u.id))}</strong><br>
        <span class="muted">${escapeHtml(u.email || u.username || u.id)}</span>
      </div>
      <div>${assignedCourses.length ? assignedCourses.map(code => `<span class="pill gray">${code}</span>`).join("") : `<span class="pill warn">Ders ataması yok</span>`}</div>
    </div>`;
  }).join("") || `<div class="empty">Henüz hoca yok.</div>`;

  const courseChecks = semesterCourses.map(c => `<label class="checkboxItem">
    <input type="checkbox" value="${c.id}" data-invite-course>
    <span><strong>${c.code}</strong> · ${escapeHtml(c.name)}<br><small>${c.electiveGroup ? escapeHtml(c.electiveGroup) : "Zorunlu"} · ${c.duration} saat</small></span>
  </label>`).join("");

  const assignmentRows = semesterCourses.map(c => {
    const partsValue = partsFor(c.id).join(",");
    return `<div class="assignmentRow">
      <div class="assignmentMeta">
        <strong>${escapeHtml(courseLabel(c))}</strong><br>
        <span class="muted">${c.semester}. yarıyıl · T:${c.t} U:${c.u} · toplam ${c.duration} saat ${c.electiveGroup ? `· ${escapeHtml(c.electiveGroup)}` : ""}</span>
      </div>
      <div class="assignmentControls">
        <label>
          Hoca
          <select data-assignment-course="${c.id}">${teacherOptions(state.assignments[c.id] || "")}</select>
        </label>
        <label>
          Parça
          <input class="partInput" data-part-input="${c.id}" value="${escapeHtml(partsValue)}" title="Örn: 4 veya 2,2" />
        </label>
        <button class="small" type="button" data-action="save-parts" data-course-id="${c.id}">Kaydet</button>
      </div>
    </div>`;
  }).join("");

  const inviteRows = state.invitations.length ? state.invitations.slice(-5).reverse().map(i => `<div class="teacherRow">
    <div><strong>${escapeHtml(i.displayName || i.email)}</strong><br><span class="muted">${escapeHtml(i.email || "")}</span></div>
    <span class="pill ${i.status === "accepted" ? "ok" : "gray"}">${escapeHtml(i.status || "bekliyor")}</span>
  </div>`).join("") : `<div class="empty">Davet geçmişi boş.</div>`;

  panel.innerHTML = `
    <div class="sectionHead">
      <div>
        <h2>Yönetici paneli</h2>
        <p class="muted">Hoca ekleme, davet gönderme, ders atama ve yalnızca yöneticiye açık ders parçalama işlemleri.</p>
      </div>
    </div>
    <div class="adminGrid">
      <div class="card">
        <h3>Hoca ekle / davet gönder</h3>
        <p class="muted">Firebase Functions kurulduğunda hoca e-posta linkinden kendi şifresini belirler. Demo modda gerçek e-posta gönderilmez.</p>
        <form id="inviteTeacherForm" class="stackForm">
          <div class="formGrid">
            <label>Ad soyad<input name="displayName" required placeholder="Örn. Dr. A Hoca"></label>
            <label>Unvan<input name="title" placeholder="Örn. Dr. Öğr. Üyesi"></label>
            <label>E-posta / kullanıcı adı<input name="email" type="email" required placeholder="hoca@kastamonu.edu.tr"></label>
            <label>Alternatif kullanıcı adı<input name="username" placeholder="Demo için isteğe bağlı"></label>
            <label class="${state.mode === "firebase" ? "hidden" : ""}">Demo şifre<input name="demoPassword" value="123456"></label>
          </div>
          <label>Atanacak dersler · seçili yarıyıl</label>
          <div class="checkboxGrid">${courseChecks}</div>
          <button class="primary" type="submit">Hocayı ekle ve davet oluştur</button>
        </form>
        <div id="inviteResult" class="inviteResult hidden"></div>
      </div>
      <div class="card">
        <h3>Hocalar</h3>
        <div class="teacherList">${teacherRows}</div>
        <hr>
        <h3>Son davetler</h3>
        <div class="teacherList">${inviteRows}</div>
      </div>
    </div>
    <div class="card" style="margin-top:18px">
      <h3>Ders-hoca atamaları ve parça kuralı</h3>
      <p class="muted">Normal hocalar dersi parçalayamaz. Buradaki parça alanı yalnızca yönetici içindir. Örn. <code>4</code> tek blok, <code>2,2</code> iki ayrı blok.</p>
      <div class="assignmentList">${assignmentRows}</div>
    </div>`;
}

function renderSchedule() {
  const target = $("scheduleGrid");
  const rooms = state.selectedRoom === "ALL" ? ROOMS : ROOMS.filter(r => r.id === state.selectedRoom);
  target.innerHTML = rooms.map(room => {
    const rows = SLOTS.map(slot => `<tr>
      <th>${slot.label}</th>
      ${DAYS.map(day => renderScheduleCell(room.id, day, slot.index)).join("")}
    </tr>`).join("");
    return `<section class="roomBlock">
      <div class="roomHeader">
        <div>
          <h3>${escapeHtml(room.name)}</h3>
          <p class="muted">${escapeHtml(room.note || "")}</p>
        </div>
      </div>
      <div class="tableWrap">
        <table class="schedule">
          <thead><tr><th>Saat</th>${DAYS.map(d => `<th>${d}</th>`).join("")}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
  }).join("");
}

function renderScheduleCell(roomId, day, slotIndex) {
  const starts = bookingAt(roomId, day, slotIndex);
  if (starts) {
    const course = getCourse(starts.courseId);
    return `<td class="busy">
      <div class="bookingCode">${escapeHtml(course?.code || starts.courseId)}</div>
      <div class="bookingName">${escapeHtml(course?.name || "")}</div>
      <div class="bookingMeta">${escapeHtml(teacherName(starts.teacherId))}</div>
      <div class="bookingMeta">${starts.duration} saat ${starts.electiveGroup ? `· ${escapeHtml(starts.electiveGroup)}` : ""}</div>
      ${canDeleteBooking(starts) ? `<button class="small danger" type="button" data-action="delete-booking" data-course-id="${starts.courseId}" data-part-index="${starts.partIndex}">Kaldır</button>` : ""}
    </td>`;
  }
  const covered = bookingCovering(roomId, day, slotIndex);
  if (covered) return `<td class="busy cont">↳</td>`;

  const active = state.activePlacement;
  if (!active) return `<td class="free">Boş</td>`;
  const course = getCourse(active.courseId);
  const duration = partsFor(active.courseId)[active.partIndex];
  const basicError = validateTimeBlock(course, roomId, day, slotIndex, duration);
  if (basicError) return `<td class="free notFit" title="${escapeHtml(basicError)}">Uygun değil</td>`;
  return `<td class="free clickable" data-action="grid-book" data-room-id="${roomId}" data-day="${day}" data-slot-index="${slotIndex}">
    <span class="cellHint">${escapeHtml(course.code)} yerleştir</span>
    <span class="muted">${duration} saatlik blok</span>
  </td>`;
}

async function handleAppClick(event) {
  const btn = event.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  try {
    if (action === "select-placement") {
      state.activePlacement = { courseId: btn.dataset.courseId, partIndex: Number(btn.dataset.partIndex) };
      render();
      toast("Ders seçildi. Program tablosunda uygun boş hücreye tıklayın.", "info");
    }
    if (action === "clear-active") {
      state.activePlacement = null;
      render();
    }
    if (action === "quick-book") {
      const key = `${btn.dataset.courseId}__${btn.dataset.partIndex}`;
      const day = document.querySelector(`[data-quick-day="${key}"]`)?.value;
      const slot = document.querySelector(`[data-quick-slot="${key}"]`)?.value;
      const room = document.querySelector(`[data-quick-room="${key}"]`)?.value;
      await bookCourse(btn.dataset.courseId, Number(btn.dataset.partIndex), day, Number(slot), room);
    }
    if (action === "grid-book") {
      if (!state.activePlacement) throw new Error("Önce yerleştirilecek dersi seçin.");
      await bookCourse(state.activePlacement.courseId, state.activePlacement.partIndex, btn.dataset.day, Number(btn.dataset.slotIndex), btn.dataset.roomId);
    }
    if (action === "delete-booking") {
      if (!confirm("Bu ders programdan kaldırılsın mı?")) return;
      await deleteBooking(btn.dataset.courseId, Number(btn.dataset.partIndex));
    }
    if (action === "save-parts") {
      const input = document.querySelector(`[data-part-input="${btn.dataset.courseId}"]`);
      await setCourseParts(btn.dataset.courseId, input.value);
    }
  } catch (err) {
    console.error(err);
    toast(err.message || "İşlem yapılamadı.", "error");
  }
}

async function handleAppChange(event) {
  const assignment = event.target.closest("[data-assignment-course]");
  if (!assignment) return;
  try {
    await setAssignment(assignment.dataset.assignmentCourse, assignment.value);
  } catch (err) {
    console.error(err);
    toast(err.message || "Atama güncellenemedi.", "error");
  }
}

async function handleAppSubmit(event) {
  const form = event.target.closest("#inviteTeacherForm");
  if (!form) return;
  event.preventDefault();
  try {
    await inviteTeacher(form);
    form.reset();
    if (form.demoPassword) form.demoPassword.value = "123456";
  } catch (err) {
    console.error(err);
    toast(err.message || "Davet işlemi yapılamadı.", "error");
  }
}

function bindStaticEvents() {
  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const identifier = $("loginUser").value.trim();
    const password = $("loginPass").value;
    try {
      if (state.mode === "firebase" && fb && identifier.includes("@")) await loginFirebase(identifier, password);
      else await loginDemo(identifier, password);
      toast("Giriş başarılı.", "success");
    } catch (err) {
      console.error(err);
      toast(err.message || "Giriş yapılamadı.", "error");
    }
  });

  $("semesterFilter").addEventListener("change", (e) => {
    state.selectedSemester = Number(e.target.value);
    state.activePlacement = null;
    render();
  });
  $("roomFilter").addEventListener("change", (e) => {
    state.selectedRoom = e.target.value;
    render();
  });
  $("refreshBtn").addEventListener("click", () => loadData().catch(err => toast(err.message, "error")));
  $("logoutBtn").addEventListener("click", () => logout().catch(err => toast(err.message, "error")));
  $("clearActiveBtn").addEventListener("click", () => {
    state.activePlacement = null;
    render();
  });
  $("appPanel").addEventListener("click", handleAppClick);
  $("appPanel").addEventListener("change", handleAppChange);
  $("appPanel").addEventListener("submit", handleAppSubmit);
}

async function init() {
  await initFirebaseIfConfigured();
  bindStaticEvents();
  render();
}

init();
