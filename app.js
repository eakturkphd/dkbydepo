import { firebaseConfig, adminEmails, authEmailDomain, functionRegion } from "./firebase-config.js";
import { COURSES, ROOMS, DAYS, SLOTS } from "./data/courses.js";

const $ = (id) => document.getElementById(id);
const CONFIGURED = Boolean(firebaseConfig?.apiKey) && !firebaseConfig.apiKey.includes("YOUR_") && !firebaseConfig.projectId.includes("YOUR_");
const LOCAL_KEY = "dkb_schedule_v4_local";
const DEFAULT_ADMIN_EMAIL = `admin@${authEmailDomain || "dkby.kastamonu.edu.tr"}`;
const DEFAULT_ADMIN = {
  id: "admin",
  username: "admin",
  email: DEFAULT_ADMIN_EMAIL,
  password: "dkby2026",
  displayName: "Yetkili Kullanıcı",
  title: "Bölüm Başkanı",
  role: "admin"
};

let fb = null;

const state = {
  mode: CONFIGURED ? "firebase" : "local",
  user: null,
  users: [],
  assignments: {},
  courseParts: {},
  bookings: [],
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

function slugUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .replace(/[^a-z0-9._-]/g, ".")
    .replace(/\.+/g, ".")
    .replace(/^\.|\.$/g, "");
}

function usernameToEmail(identifier) {
  const clean = String(identifier || "").trim().toLowerCase();
  if (clean.includes("@")) return clean;
  const username = slugUsername(clean);
  return `${username}@${authEmailDomain || "dkby.kastamonu.edu.tr"}`;
}

function emailToUsername(email) {
  const suffix = `@${authEmailDomain || "dkby.kastamonu.edu.tr"}`;
  const value = String(email || "").toLowerCase();
  return value.endsWith(suffix) ? value.slice(0, -suffix.length) : value;
}

function initialStore() {
  return {
    users: [{ ...DEFAULT_ADMIN }],
    assignments: {},
    courseParts: {},
    bookings: []
  };
}

function normalizeStore(parsed = {}) {
  const base = initialStore();
  const map = new Map(base.users.map(u => [u.id, u]));
  (parsed.users || []).forEach(u => map.set(u.id, { ...u }));
  const admin = { ...(map.get("admin") || {}), ...DEFAULT_ADMIN };
  map.set("admin", admin);
  return {
    users: [...map.values()],
    assignments: parsed.assignments || {},
    courseParts: parsed.courseParts || {},
    bookings: parsed.bookings || []
  };
}

function getLocalStore() {
  const raw = localStorage.getItem(LOCAL_KEY);
  if (!raw) {
    const fresh = initialStore();
    localStorage.setItem(LOCAL_KEY, JSON.stringify(fresh));
    return fresh;
  }
  try {
    return normalizeStore(JSON.parse(raw));
  } catch {
    const fresh = initialStore();
    localStorage.setItem(LOCAL_KEY, JSON.stringify(fresh));
    return fresh;
  }
}

function setLocalStore(next) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
}

async function initFirebaseIfConfigured() {
  if (!CONFIGURED) return;
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
}

function toast(message, type = "info") {
  const el = $("toast");
  if (!el) return;
  el.textContent = message;
  el.className = `toast show ${type}`;
  setTimeout(() => { el.className = "toast"; }, 4200);
}

function isAdmin() {
  return state.user?.role === "admin";
}

function getCourse(courseId) {
  return COURSES.find(c => c.id === courseId);
}

function getRoom(roomId) {
  return ROOMS.find(r => r.id === roomId);
}

function teacherName(id) {
  if (!id) return "Atanmamış";
  const u = state.users.find(user => user.id === id);
  if (!u) return id;
  return `${u.title ? `${u.title} ` : ""}${u.displayName || u.username || u.email}`.trim();
}

function visibleTeachers() {
  return state.users
    .filter(u => u.role === "teacher")
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
  return Array.from({ length: Number(duration) }, (_, i) => Number(startSlot) + i);
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
  return state.bookings.find(b => b.roomId === roomId && b.day === day && Number(b.startSlot) === Number(slot));
}

function bookingCovering(roomId, day, slot) {
  return state.bookings.find(b => b.roomId === roomId && b.day === day && Number(slot) > Number(b.startSlot) && Number(slot) < Number(b.startSlot) + Number(b.duration));
}

function canDeleteBooking(booking) {
  return isAdmin() || booking.teacherId === state.user?.id || booking.createdBy === state.user?.id;
}

function validateTimeBlock(course, roomId, day, startSlot, duration) {
  if (!course) return "Ders bilgisi bulunamadı.";
  if (!DAYS.includes(day)) return "Gün seçimi geçersiz.";
  if (!ROOMS.some(r => r.id === roomId)) return "Derslik seçimi geçersiz.";
  if (course.year === 1 && roomId !== "109") return "1. sınıf dersleri 109 no'lu derslikte yürütülmelidir.";
  if (Number(startSlot) < 0 || Number(startSlot) + Number(duration) > SLOTS.length) return "Seçilen saat aralığı ders süresi için uygun değildir.";
  const period = SLOTS[Number(startSlot)]?.period;
  const crossesBreak = blockSlots(startSlot, duration).some(slot => !SLOTS[slot] || SLOTS[slot].period !== period);
  if (crossesBreak) return "Ders bloğu öğle arasını geçemez. Gerekirse ders yalnızca yetkili kullanıcı tarafından parçalanmalıdır.";
  return null;
}

function validateAgainstBookings(placement, proposed = []) {
  const { course, roomId, day, startSlot, duration, teacherId, partIndex } = placement;
  const basicError = validateTimeBlock(course, roomId, day, startSlot, duration);
  if (basicError) return basicError;

  const currentId = bookingId(course.id, partIndex);
  const groupKey = course.electiveGroup || null;

  for (const b of state.bookings) {
    const existingCourse = getCourse(b.courseId);
    if (!existingCourse) continue;
    if (b.id === currentId) return `${course.code} için ilgili ders bloğu daha önce programa yerleştirilmiş.`;
    if (b.day !== day) continue;
    if (!rangesOverlap(startSlot, duration, b.startSlot, b.duration)) continue;

    if (b.roomId === roomId) return `${getRoom(roomId)?.name || roomId} bu zaman aralığında doludur.`;
    if (b.teacherId === teacherId) return `${teacherName(teacherId)} aynı zaman aralığında başka bir derse atanmıştır.`;

    const sameSemester = existingCourse.semester === course.semester;
    const sameElectivePool = groupKey && existingCourse.electiveGroup === groupKey;
    if (sameSemester && !sameElectivePool) return `${course.semester}. yarıyıl için bu zaman aralığında başka bir ders bulunmaktadır.`;
  }

  for (const p of proposed) {
    if (p.day !== day) continue;
    if (!rangesOverlap(startSlot, duration, p.startSlot, p.duration)) continue;
    if (p.roomId === roomId) return "Aynı işlem içinde iki ders aynı dersliğe yerleştirilemez.";
    if (p.teacherId === teacherId) return "Aynı öğretim üyesi aynı zaman aralığında iki farklı derse atanamaz.";
    const sameSemester = p.course.semester === course.semester;
    const sameElectivePool = groupKey && p.course.electiveGroup === groupKey;
    if (sameSemester && !sameElectivePool) return "Aynı yarıyıldaki dersler çakışmaktadır.";
  }
  return null;
}

function buildPlacements(courseId, partIndex, day, startSlot, roomId) {
  const course = getCourse(courseId);
  const duration = partsFor(courseId)[Number(partIndex)];
  const teacherId = state.assignments[courseId];
  if (!course) throw new Error("Ders bulunamadı.");
  if (!teacherId) throw new Error(`${course.code} için önce öğretim üyesi ataması yapılmalıdır.`);

  const groupCourses = course.electiveGroup
    ? COURSES.filter(c => c.semester === course.semester && c.electiveGroup === course.electiveGroup)
    : [course];

  if (course.electiveGroup) {
    if (groupCourses.length > ROOMS.length) throw new Error(`${course.electiveGroup} için yeterli derslik bulunmamaktadır.`);
    for (const gc of groupCourses) {
      if (!state.assignments[gc.id]) throw new Error(`${course.electiveGroup} içindeki ${gc.code} için öğretim üyesi ataması yapılmamıştır.`);
      const groupPart = partsFor(gc.id)[Number(partIndex)] || partsFor(gc.id)[0];
      if (groupPart !== duration) throw new Error(`${course.electiveGroup} içindeki derslerin süreleri eşit olmalıdır.`);
    }
  }

  const orderedRooms = [roomId, ...ROOMS.map(r => r.id).filter(id => id !== roomId)];
  const orderedCourses = [course, ...groupCourses.filter(c => c.id !== course.id)];

  return orderedCourses.map((gc, index) => ({
    id: bookingId(gc.id, Number(partIndex)),
    course: gc,
    courseId: gc.id,
    teacherId: state.assignments[gc.id],
    roomId: orderedRooms[index],
    day,
    startSlot: Number(startSlot),
    duration: Number(duration),
    partIndex: Number(partIndex),
    electiveGroup: gc.electiveGroup || null
  }));
}

function validatePlacements(placements) {
  const proposed = [];
  for (const placement of placements) {
    const err = validateAgainstBookings(placement, proposed);
    if (err) throw new Error(err);
    proposed.push(placement);
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
  const store = getLocalStore();
  store.bookings = [...store.bookings, ...placements.map(p => placementToBooking(p))];
  setLocalStore(store);
  await loadData();
}

async function saveBookingFirebase(placements) {
  const { db, doc, runTransaction, serverTimestamp } = fb;
  await runTransaction(db, async (tx) => {
    const bookingRefs = placements.map(p => doc(db, "bookings", p.id));
    for (const ref of bookingRefs) {
      const snap = await tx.get(ref);
      if (snap.exists()) throw new Error("Bu ders bloğu daha önce programa yerleştirilmiştir.");
    }

    const occupancy = new Map();
    for (const p of placements) {
      for (const item of occupancyKeysForPlacement(p)) {
        if (!occupancy.has(item.key)) occupancy.set(item.key, item);
      }
    }

    for (const item of occupancy.values()) {
      const ref = doc(db, "occupancy", item.key);
      const snap = await tx.get(ref);
      if (!snap.exists()) continue;
      const data = snap.data();
      const sameElectiveCohort = item.kind === "cohort" && item.electiveGroup && data.electiveGroup === item.electiveGroup;
      if (!sameElectiveCohort) throw new Error("Seçilen zaman aralığı başka bir kullanıcı tarafından doldurulmuştur.");
    }

    for (const p of placements) tx.set(doc(db, "bookings", p.id), placementToBooking(p, { createdAt: serverTimestamp() }));
    for (const item of occupancy.values()) {
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
  const placements = buildPlacements(courseId, partIndex, day, startSlot, roomId);
  validatePlacements(placements);
  if (state.mode === "firebase" && fb) await saveBookingFirebase(placements);
  else await saveBookingLocal(placements);
  state.activePlacement = null;
  toast("Ders programa yerleştirildi.", "success");
}

async function deleteBooking(courseId, partIndex = 0) {
  const course = getCourse(courseId);
  const existing = bookingForCoursePart(courseId, partIndex);
  if (existing && !canDeleteBooking(existing)) throw new Error("Bu dersi programdan kaldırma yetkiniz bulunmamaktadır.");

  const idsToDelete = course.electiveGroup
    ? COURSES.filter(c => c.semester === course.semester && c.electiveGroup === course.electiveGroup).map(c => bookingId(c.id, partIndex))
    : [bookingId(courseId, partIndex)];

  if (state.mode === "firebase" && fb) {
    const { db, doc, getDoc, writeBatch } = fb;
    const batch = writeBatch(db);
    const occKeys = new Set();
    for (const id of idsToDelete) {
      const ref = doc(db, "bookings", id);
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
    const store = getLocalStore();
    store.bookings = store.bookings.filter(b => !idsToDelete.includes(b.id));
    setLocalStore(store);
  }

  await loadData();
  toast(course.electiveGroup ? "Seçmeli ders havuzu programdan kaldırıldı." : "Ders programdan kaldırıldı.", "success");
}

async function setAssignment(courseId, teacherId) {
  if (!isAdmin()) throw new Error("Bu işlem yetkili kullanıcı tarafından yapılabilir.");
  if (state.mode === "firebase" && fb) {
    const { db, doc, setDoc, deleteDoc, serverTimestamp } = fb;
    if (teacherId) await setDoc(doc(db, "assignments", courseId), { courseId, teacherId, updatedBy: state.user.id, updatedAt: serverTimestamp() });
    else await deleteDoc(doc(db, "assignments", courseId));
  } else {
    const store = getLocalStore();
    if (teacherId) store.assignments[courseId] = teacherId;
    else delete store.assignments[courseId];
    setLocalStore(store);
  }
  await loadData();
  toast("Ders-öğretim üyesi ataması güncellendi.", "success");
}

async function setCourseParts(courseId, raw) {
  if (!isAdmin()) throw new Error("Ders parçalama işlemi yalnızca yetkili kullanıcı tarafından yapılabilir.");
  const course = getCourse(courseId);
  const parts = String(raw || "").split(",").map(x => Number(x.trim())).filter(n => Number.isFinite(n) && n > 0);
  if (!parts.length) throw new Error("Parça bilgisi boş bırakılamaz. Örnek: 4 veya 2,2");
  const total = parts.reduce((sum, n) => sum + n, 0);
  if (total !== course.duration) throw new Error(`Parça toplamı ders süresine eşit olmalıdır. ${course.code}: ${course.duration} ders saati.`);

  if (state.mode === "firebase" && fb) {
    const { db, doc, setDoc, serverTimestamp } = fb;
    await setDoc(doc(db, "courseParts", courseId), { courseId, parts, updatedBy: state.user.id, updatedAt: serverTimestamp() });
  } else {
    const store = getLocalStore();
    store.courseParts[courseId] = parts;
    setLocalStore(store);
  }
  await loadData();
  toast("Ders blok yapısı güncellendi.", "success");
}

function instructorPayloadFromForm(form) {
  const userId = form.userId?.value?.trim() || "";
  return {
    userId,
    displayName: form.displayName.value.trim(),
    title: form.title.value.trim(),
    username: slugUsername(form.username.value),
    password: form.password.value
  };
}

function validateInstructorPayload(payload, isEdit = false) {
  if (!payload.displayName) throw new Error("Ad soyad alanı zorunludur.");
  if (!payload.username || payload.username.length < 3) throw new Error("Kullanıcı adı en az üç karakter olmalıdır.");
  if (!isEdit && (!payload.password || payload.password.length < 6)) throw new Error("Şifre en az altı karakter olmalıdır.");
  if (isEdit && payload.password && payload.password.length < 6) throw new Error("Şifre en az altı karakter olmalıdır.");
}

async function createInstructor(form) {
  if (!isAdmin()) throw new Error("Bu işlem yetkili kullanıcı tarafından yapılabilir.");
  const payload = instructorPayloadFromForm(form);
  validateInstructorPayload(payload, false);
  const { displayName, title, username, password } = payload;

  if (state.mode === "firebase" && fb) {
    const call = fb.httpsCallable(fb.functions, "createInstructor");
    await call({ displayName, title, username, password });
  } else {
    const store = getLocalStore();
    const id = username;
    const email = usernameToEmail(username);
    const exists = store.users.some(u => u.id === id || u.username === username || u.email === email);
    if (exists) throw new Error("Bu kullanıcı adı daha önce tanımlanmıştır.");
    const user = { id, username, email, password, displayName, title, role: "teacher" };
    store.users.push(user);
    setLocalStore(store);
  }
  await loadData();
  toast("Öğretim üyesi kaydı tamamlandı.", "success");
}

async function updateInstructor(form) {
  if (!isAdmin()) throw new Error("Bu işlem yetkili kullanıcı tarafından yapılabilir.");
  const payload = instructorPayloadFromForm(form);
  validateInstructorPayload(payload, true);
  if (!payload.userId) throw new Error("Güncellenecek öğretim üyesi belirlenemedi.");

  if (state.mode === "firebase" && fb) {
    const call = fb.httpsCallable(fb.functions, "updateInstructor");
    await call(payload);
  } else {
    const store = getLocalStore();
    const idx = store.users.findIndex(u => u.id === payload.userId && u.role === "teacher");
    if (idx < 0) throw new Error("Öğretim üyesi kaydı bulunamadı.");
    const duplicate = store.users.some(u => u.id !== payload.userId && (u.username === payload.username || u.email === usernameToEmail(payload.username)));
    if (duplicate) throw new Error("Bu kullanıcı adı başka bir öğretim üyesi tarafından kullanılmaktadır.");
    const current = store.users[idx];
    store.users[idx] = {
      ...current,
      username: payload.username,
      email: usernameToEmail(payload.username),
      displayName: payload.displayName,
      title: payload.title,
      ...(payload.password ? { password: payload.password } : {})
    };
    setLocalStore(store);
  }
  await loadData();
  toast("Öğretim üyesi bilgileri güncellendi.", "success");
}

async function deleteInstructor(userId) {
  if (!isAdmin()) throw new Error("Bu işlem yetkili kullanıcı tarafından yapılabilir.");
  const instructor = state.users.find(u => u.id === userId && u.role === "teacher");
  if (!instructor) throw new Error("Öğretim üyesi kaydı bulunamadı.");

  const assignedCount = Object.values(state.assignments).filter(id => id === userId).length;
  const bookingCount = state.bookings.filter(b => b.teacherId === userId).length;
  const message = assignedCount || bookingCount
    ? `${teacherName(userId)} kaydı kaldırılacak. Bu işlem ilgili ${assignedCount} ders atamasını ve ${bookingCount} program kaydını da temizleyecektir. Devam edilsin mi?`
    : `${teacherName(userId)} kaydı kaldırılacak. Devam edilsin mi?`;
  if (!confirm(message)) return;

  if (state.mode === "firebase" && fb) {
    const call = fb.httpsCallable(fb.functions, "deleteInstructor");
    await call({ userId });
  } else {
    const store = getLocalStore();
    store.users = store.users.filter(u => u.id !== userId);
    Object.keys(store.assignments).forEach(courseId => {
      if (store.assignments[courseId] === userId) delete store.assignments[courseId];
    });
    store.bookings = store.bookings.filter(b => b.teacherId !== userId);
    setLocalStore(store);
  }
  state.activePlacement = null;
  await loadData();
  toast("Öğretim üyesi kaydı kaldırıldı.", "success");
}

function resetInstructorForm() {
  const form = document.querySelector("#createInstructorForm");
  if (!form) return;
  form.reset();
  form.userId.value = "";
  form.password.required = true;
  form.password.placeholder = "En az 6 karakter";
  const title = form.querySelector("[data-form-title]");
  const button = form.querySelector("[data-save-instructor]");
  const cancel = form.querySelector("[data-action='cancel-instructor-edit']");
  if (title) title.textContent = "Öğretim üyesi tanımlama";
  if (button) button.textContent = "Öğretim üyesini kaydet";
  if (cancel) cancel.classList.add("hidden");
}

function fillInstructorForm(userId) {
  const form = document.querySelector("#createInstructorForm");
  const instructor = state.users.find(u => u.id === userId && u.role === "teacher");
  if (!form || !instructor) return;
  form.userId.value = instructor.id;
  form.title.value = instructor.title || "";
  form.displayName.value = instructor.displayName || "";
  form.username.value = instructor.username || emailToUsername(instructor.email) || "";
  form.password.value = "";
  form.password.required = false;
  form.password.placeholder = "Değişmeyecekse boş bırakınız";
  const title = form.querySelector("[data-form-title]");
  const button = form.querySelector("[data-save-instructor]");
  const cancel = form.querySelector("[data-action='cancel-instructor-edit']");
  if (title) title.textContent = "Öğretim üyesi bilgilerini düzenleme";
  if (button) button.textContent = "Bilgileri güncelle";
  if (cancel) cancel.classList.remove("hidden");
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function loadData() {
  if (state.mode === "firebase" && fb && state.user) {
    const { db, collection, getDocs } = fb;
    const [userSnap, assignSnap, partsSnap, bookingSnap] = await Promise.all([
      getDocs(collection(db, "users")),
      getDocs(collection(db, "assignments")),
      getDocs(collection(db, "courseParts")),
      getDocs(collection(db, "bookings"))
    ]);
    state.users = userSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    state.assignments = Object.fromEntries(assignSnap.docs.map(d => [d.id, d.data().teacherId]));
    state.courseParts = Object.fromEntries(partsSnap.docs.map(d => [d.id, d.data().parts]));
    state.bookings = bookingSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  } else {
    const store = getLocalStore();
    state.users = store.users.map(({ password, ...u }) => u);
    state.assignments = store.assignments;
    state.courseParts = store.courseParts;
    state.bookings = store.bookings;
  }
  render();
}

async function loginLocal(identifier, password) {
  const store = getLocalStore();
  const clean = String(identifier || "").trim().toLowerCase();
  const found = store.users.find(u =>
    (String(u.username || "").toLowerCase() === clean || String(u.email || "").toLowerCase() === clean || String(u.id || "").toLowerCase() === clean) &&
    u.password === password
  );
  if (!found) throw new Error("Kullanıcı adı veya şifre hatalı.");
  const { password: _pw, ...safe } = found;
  state.user = safe;
  await loadData();
}

async function loginFirebase(identifier, password) {
  if (!fb) throw new Error("Firebase bağlantısı başlatılamadı.");
  const email = usernameToEmail(identifier);
  const cred = await fb.signInWithEmailAndPassword(fb.auth, email, password);
  const uid = cred.user.uid;
  const userRef = fb.doc(fb.db, "users", uid);
  let snap = await fb.getDoc(userRef);

  if (!snap.exists() && adminEmails.map(x => x.toLowerCase()).includes(email.toLowerCase())) {
    await fb.setDoc(userRef, {
      email,
      username: emailToUsername(email),
      displayName: "Yetkili Kullanıcı",
      title: "Bölüm Başkanı",
      role: "admin"
    });
    snap = await fb.getDoc(userRef);
  }

  if (!snap.exists()) throw new Error("Kullanıcı yetki kaydı bulunamadı. Lütfen yetkili kullanıcıya başvurunuz.");
  state.user = { id: uid, email, ...snap.data() };
  await loadData();
}

async function logout() {
  if (state.mode === "firebase" && fb) await fb.signOut(fb.auth).catch(() => {});
  state.user = null;
  state.activePlacement = null;
  render();
}

function semesterOptions(selected = state.selectedSemester) {
  return Array.from({ length: 8 }, (_, i) => {
    const semester = i + 1;
    return `<option value="${semester}" ${Number(selected) === semester ? "selected" : ""}>${semester}. yarıyıl / ${Math.ceil(semester / 2)}. sınıf</option>`;
  }).join("");
}

function renderLogin() {
  $("loginPanel").classList.remove("hidden");
  $("appPanel").classList.add("hidden");
}

function render() {
  if (!state.user) return renderLogin();
  $("loginPanel").classList.add("hidden");
  $("appPanel").classList.remove("hidden");
  $("userBadge").textContent = `${teacherName(state.user.id)} · ${state.user.role === "admin" ? "Yetkili kullanıcı" : "Öğretim üyesi"}`;
  $("systemBadge").textContent = state.mode === "firebase" ? "Ortak veri tabanı" : "Yerel kayıt";
  renderFilters();
  renderStats();
  renderAdmin();
  renderActiveBadge();
  renderMyCourses();
  renderSchedule();
}

function renderFilters() {
  const sem = $("semesterFilter");
  sem.innerHTML = semesterOptions(state.selectedSemester);
  sem.value = String(state.selectedSemester);
  const room = $("roomFilter");
  room.innerHTML = `<option value="ALL">Tüm derslikler</option>` + ROOMS.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join("");
  room.value = state.selectedRoom;
}

function renderStats() {
  const courses = COURSES.filter(c => c.semester === state.selectedSemester);
  const assigned = courses.filter(c => state.assignments[c.id]).length;
  const placed = courses.filter(c => partsFor(c.id).every((_, idx) => bookingForCoursePart(c.id, idx))).length;
  const teachers = visibleTeachers().filter(u => u.role === "teacher").length;
  const electiveGroups = new Set(courses.filter(c => c.electiveGroup).map(c => c.electiveGroup)).size;
  $("statsGrid").innerHTML = [
    ["Seçili yarıyıl dersi", courses.length],
    ["Ataması yapılan ders", assigned],
    ["Programa yerleşen ders", placed],
    ["Tanımlı öğretim üyesi", teachers],
    ["Seçmeli ders havuzu", electiveGroups]
  ].map(([label, value]) => `<article class="statCard"><span>${label}</span><strong>${value}</strong></article>`).join("");
}

function teacherOptions(selected = "") {
  return `<option value="">Atanmamış</option>` + visibleTeachers()
    .map(u => `<option value="${escapeHtml(u.id)}" ${selected === u.id ? "selected" : ""}>${escapeHtml(teacherName(u.id))}</option>`)
    .join("");
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
    const assignedCodes = COURSES.filter(c => state.assignments[c.id] === u.id).map(c => c.code);
    return `<div class="teacherRow">
      <div>
        <strong>${escapeHtml(teacherName(u.id))}</strong>
        <span>${escapeHtml(u.username || emailToUsername(u.email) || u.id)}</span>
        <div class="teacherCourseCodes">${assignedCodes.length ? assignedCodes.map(code => `<em>${code}</em>`).join("") : `<small>Atama yok</small>`}</div>
      </div>
      <div class="teacherActions">
        <button type="button" class="mini" data-action="edit-instructor" data-user-id="${escapeHtml(u.id)}">Düzenle</button>
        <button type="button" class="mini danger" data-action="delete-instructor" data-user-id="${escapeHtml(u.id)}">Kaldır</button>
      </div>
    </div>`;
  }).join("");

  const assignRows = semesterCourses.map(c => {
    const partsValue = partsFor(c.id).join(",");
    return `<tr>
      <td><strong>${escapeHtml(c.code)}</strong><span>${escapeHtml(c.name)}</span></td>
      <td>T:${c.t} U:${c.u} UK:${c.uk} AKTS:${c.ects}</td>
      <td>${c.electiveGroup ? `<b class="poolTag">${escapeHtml(c.electiveGroup)}</b>` : "Zorunlu"}</td>
      <td><select data-assignment-course="${c.id}">${teacherOptions(state.assignments[c.id] || "")}</select></td>
      <td class="partCell"><input data-part-input="${c.id}" value="${escapeHtml(partsValue)}" title="Örn. 4 veya 2,2"><button type="button" class="mini" data-action="save-parts" data-course-id="${c.id}">Kaydet</button></td>
    </tr>`;
  }).join("");

  panel.innerHTML = `
    <section class="card adminCard">
      <div class="sectionHead compactHead">
        <div>
          <p class="eyebrow">Yetkili kullanıcı işlemleri</p>
          <h2>Yönetici paneli</h2>
        </div>
      </div>

      <div class="adminGrid">
        <form id="createInstructorForm" class="adminBox stackForm">
          <input type="hidden" name="userId" />
          <h3 data-form-title>Öğretim üyesi tanımlama</h3>
          <div class="formGrid">
            <label>Unvan<input name="title" placeholder="Dr. Öğr. Üyesi"></label>
            <label>Ad soyad<input name="displayName" required placeholder="Ad Soyad"></label>
            <label>Kullanıcı adı<input name="username" required placeholder="ornek.kullanici"></label>
            <label>Şifre<input name="password" type="password" required minlength="6" placeholder="En az 6 karakter"></label>
          </div>
          <div class="formActions">
            <button class="primary" type="submit" data-save-instructor>Öğretim üyesini kaydet</button>
            <button class="ghost hidden" type="button" data-action="cancel-instructor-edit">Vazgeç</button>
          </div>
        </form>

        <div class="adminBox">
          <h3>Öğretim üyeleri</h3>
          <div class="teacherList">${teacherRows || `<div class="empty">Tanımlı öğretim üyesi bulunmamaktadır.</div>`}</div>
        </div>
      </div>

      <div class="assignmentPanel">
        <div class="assignmentTop">
          <div>
            <h3>Ders-öğretim üyesi atamaları</h3>
            <p class="muted">Yarıyıl seçildiğinde ilgili dersler, kredi bilgileri ve öğretim üyesi atama alanları listelenir.</p>
          </div>
          <label>Yarıyıl<select id="adminSemesterSelect">${semesterOptions(state.selectedSemester)}</select></label>
        </div>
        <div class="assignmentTableWrap">
          <table class="assignmentTable">
            <thead><tr><th>Ders</th><th>Kredi</th><th>Tür</th><th>Öğretim üyesi</th><th>Blok</th></tr></thead>
            <tbody>${assignRows}</tbody>
          </table>
        </div>
      </div>
    </section>`;
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
  el.innerHTML = `<strong>Seçili ders:</strong> ${escapeHtml(course.code)} · ${escapeHtml(course.name)} <span>${duration} ders saati</span>`;
}

function renderMyCourses() {
  const target = $("myCourses");
  const courses = COURSES
    .filter(c => c.semester === state.selectedSemester)
    .filter(c => isAdmin() || state.assignments[c.id] === state.user.id)
    .sort((a, b) => a.code.localeCompare(b.code, "tr"));

  if (!courses.length) {
    target.innerHTML = `<div class="empty">Seçili yarıyıl için atanmış ders bulunmamaktadır.</div>`;
    return;
  }

  target.innerHTML = courses.map(course => {
    const parts = partsFor(course.id);
    const partButtons = parts.map((duration, idx) => {
      const existing = bookingForCoursePart(course.id, idx);
      if (existing) {
        return `<div class="partRow placed">
          <span>${existing.day} · ${SLOTS[existing.startSlot].label} · ${getRoom(existing.roomId)?.name}</span>
          ${canDeleteBooking(existing) ? `<button type="button" class="mini danger" data-action="delete-booking" data-course-id="${course.id}" data-part-index="${idx}">Kaldır</button>` : ""}
        </div>`;
      }
      const active = state.activePlacement?.courseId === course.id && Number(state.activePlacement.partIndex) === idx;
      return `<button type="button" class="placeBtn ${active ? "active" : ""}" data-action="select-placement" data-course-id="${course.id}" data-part-index="${idx}">${duration} ders saati yerleştir</button>`;
    }).join("");

    return `<article class="compactCourse">
      <div>
        <strong>${escapeHtml(course.code)}</strong>
        <span>${escapeHtml(course.name)}</span>
        <small>T:${course.t} U:${course.u} · ${course.electiveGroup ? escapeHtml(course.electiveGroup) : "Zorunlu"}</small>
      </div>
      ${partButtons}
    </article>`;
  }).join("");
}

function renderSchedule() {
  const rooms = state.selectedRoom === "ALL" ? ROOMS : ROOMS.filter(r => r.id === state.selectedRoom);
  $("scheduleGrid").innerHTML = rooms.map(room => {
    const rows = SLOTS.map(slot => `<tr>
      <th>${slot.label}</th>
      ${DAYS.map(day => renderScheduleCell(room.id, day, slot.index)).join("")}
    </tr>`).join("");
    return `<section class="roomBlock">
      <div class="roomHeader"><h3>${escapeHtml(room.name)}</h3><span>${escapeHtml(room.note || "")}</span></div>
      <table class="schedule">
        <thead><tr><th>Saat</th>${DAYS.map(d => `<th>${d}</th>`).join("")}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
  }).join("");
}

function renderScheduleCell(roomId, day, slotIndex) {
  const starts = bookingAt(roomId, day, slotIndex);
  if (starts) {
    const course = getCourse(starts.courseId);
    return `<td class="busy">
      <strong>${escapeHtml(course?.code || starts.courseId)}</strong>
      <span>${escapeHtml(course?.name || "")}</span>
      <small>${escapeHtml(teacherName(starts.teacherId))}</small>
      ${starts.electiveGroup ? `<em>${escapeHtml(starts.electiveGroup)}</em>` : ""}
      ${canDeleteBooking(starts) ? `<button type="button" class="mini danger" data-action="delete-booking" data-course-id="${starts.courseId}" data-part-index="${starts.partIndex}">Sil</button>` : ""}
    </td>`;
  }

  const covered = bookingCovering(roomId, day, slotIndex);
  if (covered) return `<td class="busy continuation">↳</td>`;

  if (!state.activePlacement) return `<td class="free">Boş</td>`;
  const course = getCourse(state.activePlacement.courseId);
  const duration = partsFor(course.id)[state.activePlacement.partIndex];
  const error = validateTimeBlock(course, roomId, day, slotIndex, duration);
  if (error) return `<td class="notFit" title="${escapeHtml(error)}">—</td>`;
  return `<td class="free clickable" data-action="grid-book" data-room-id="${roomId}" data-day="${day}" data-slot-index="${slotIndex}">
    <strong>${escapeHtml(course.code)}</strong>
    <span>Yerleştir</span>
  </td>`;
}

async function handleClick(event) {
  const item = event.target.closest("[data-action]");
  if (!item) return;
  const action = item.dataset.action;
  try {
    if (action === "select-placement") {
      state.activePlacement = { courseId: item.dataset.courseId, partIndex: Number(item.dataset.partIndex) };
      render();
      toast("Ders seçildi. Program tablosunda uygun boş hücreye tıklayınız.", "info");
    }
    if (action === "grid-book") {
      if (!state.activePlacement) throw new Error("Önce yerleştirilecek dersi seçiniz.");
      await bookCourse(state.activePlacement.courseId, state.activePlacement.partIndex, item.dataset.day, Number(item.dataset.slotIndex), item.dataset.roomId);
    }
    if (action === "delete-booking") {
      if (!confirm("Seçilen ders programdan kaldırılsın mı?")) return;
      await deleteBooking(item.dataset.courseId, Number(item.dataset.partIndex));
    }
    if (action === "save-parts") {
      const input = document.querySelector(`[data-part-input="${item.dataset.courseId}"]`);
      await setCourseParts(item.dataset.courseId, input.value);
    }
    if (action === "edit-instructor") {
      fillInstructorForm(item.dataset.userId);
    }
    if (action === "cancel-instructor-edit") {
      resetInstructorForm();
    }
    if (action === "delete-instructor") {
      await deleteInstructor(item.dataset.userId);
    }
  } catch (err) {
    console.error(err);
    toast(err.message || "İşlem gerçekleştirilemedi.", "error");
  }
}

async function handleChange(event) {
  const assignment = event.target.closest("[data-assignment-course]");
  if (assignment) {
    try {
      await setAssignment(assignment.dataset.assignmentCourse, assignment.value);
    } catch (err) {
      console.error(err);
      toast(err.message || "Atama güncellenemedi.", "error");
    }
    return;
  }

  if (event.target.id === "adminSemesterSelect") {
    state.selectedSemester = Number(event.target.value);
    state.activePlacement = null;
    render();
  }
}

async function handleSubmit(event) {
  const form = event.target.closest("#createInstructorForm");
  if (!form) return;
  event.preventDefault();
  try {
    if (form.userId.value) await updateInstructor(form);
    else await createInstructor(form);
    resetInstructorForm();
  } catch (err) {
    console.error(err);
    toast(err.message || "Öğretim üyesi işlemi tamamlanamadı.", "error");
  }
}

function bindEvents() {
  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const identifier = $("loginUser").value.trim();
    const password = $("loginPass").value;
    try {
      if (state.mode === "firebase") await loginFirebase(identifier, password);
      else await loginLocal(identifier, password);
      toast("Giriş başarılı.", "success");
    } catch (err) {
      console.error(err);
      toast(err.message || "Giriş yapılamadı.", "error");
    }
  });

  $("semesterFilter").addEventListener("change", (event) => {
    state.selectedSemester = Number(event.target.value);
    state.activePlacement = null;
    render();
  });
  $("roomFilter").addEventListener("change", (event) => {
    state.selectedRoom = event.target.value;
    render();
  });
  $("clearActiveBtn").addEventListener("click", () => {
    state.activePlacement = null;
    render();
  });
  $("refreshBtn").addEventListener("click", () => loadData().catch(err => toast(err.message, "error")));
  $("logoutBtn").addEventListener("click", () => logout().catch(err => toast(err.message, "error")));
  $("appPanel").addEventListener("click", handleClick);
  $("appPanel").addEventListener("change", handleChange);
  $("appPanel").addEventListener("submit", handleSubmit);
}

async function init() {
  try {
    await initFirebaseIfConfigured();
  } catch (err) {
    console.warn("Firebase başlatılamadı. Yerel kayıt moduna geçildi.", err);
    state.mode = "local";
  }
  bindEvents();
  render();
}

init();
