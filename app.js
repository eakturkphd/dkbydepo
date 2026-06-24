import { firebaseConfig, adminEmails } from "./firebase-config.js";
import { COURSES, ROOMS, DAYS, SLOTS } from "./data/courses.js";

const $ = (id) => document.getElementById(id);
const demoModeForced = !firebaseConfig.apiKey || firebaseConfig.apiKey.includes("YOUR_") || firebaseConfig.projectId.includes("YOUR_");

const DEMO_USERS = [
  { id: "admin", username: "admin", email: "admin@demo.local", password: "DKB2026!", displayName: "Yetkili Kullanıcı", role: "admin" },
  { id: "hoca1", username: "hoca1", email: "hoca1@demo.local", password: "123456", displayName: "Hoca 1", role: "teacher" },
  { id: "hoca2", username: "hoca2", email: "hoca2@demo.local", password: "123456", displayName: "Hoca 2", role: "teacher" },
  { id: "hoca3", username: "hoca3", email: "hoca3@demo.local", password: "123456", displayName: "Hoca 3", role: "teacher" }
];

const LS_KEY = "dkb_schedule_demo_v1";

let fb = null;
let state = {
  mode: demoModeForced ? "demo" : "firebase",
  user: null,
  users: [],
  assignments: {},
  courseParts: {},
  bookings: [],
  selectedSemester: 1,
  selectedRoom: "ALL"
};

function initialDemoStore() {
  return {
    users: DEMO_USERS.map(({ password, ...u }) => u),
    assignments: {},
    courseParts: {},
    bookings: []
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
    const parsed = JSON.parse(raw);
    return {
      users: parsed.users || initialDemoStore().users,
      assignments: parsed.assignments || {},
      courseParts: parsed.courseParts || {},
      bookings: parsed.bookings || []
    };
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
  if (demoModeForced) return;
  try {
    const [appMod, authMod, fsMod] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js")
    ]);
    const app = appMod.initializeApp(firebaseConfig);
    fb = {
      app,
      auth: authMod.getAuth(app),
      db: fsMod.getFirestore(app),
      signInWithEmailAndPassword: authMod.signInWithEmailAndPassword,
      signOut: authMod.signOut,
      onAuthStateChanged: authMod.onAuthStateChanged,
      collection: fsMod.collection,
      doc: fsMod.doc,
      getDoc: fsMod.getDoc,
      getDocs: fsMod.getDocs,
      setDoc: fsMod.setDoc,
      deleteDoc: fsMod.deleteDoc,
      writeBatch: fsMod.writeBatch,
      runTransaction: fsMod.runTransaction,
      serverTimestamp: fsMod.serverTimestamp
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
  setTimeout(() => { el.className = "toast"; }, 4200);
}

function isAdmin() {
  return state.user?.role === "admin";
}

function getCourse(courseId) {
  return COURSES.find(c => c.id === courseId);
}

function teacherName(id) {
  if (!id) return "Atanmamış";
  const u = state.users.find(u => u.id === id);
  return u ? u.displayName : id;
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

function rangesOverlap(aStart, aDuration, bStart, bDuration) {
  const aEnd = Number(aStart) + Number(aDuration) - 1;
  const bEnd = Number(bStart) + Number(bDuration) - 1;
  return Number(aStart) <= bEnd && Number(bStart) <= aEnd;
}

function blockSlots(startSlot, duration) {
  return Array.from({ length: duration }, (_, i) => Number(startSlot) + i);
}

function validateTimeBlock(course, roomId, day, startSlot, duration) {
  if (!DAYS.includes(day)) return "Geçersiz gün seçimi.";
  if (!ROOMS.some(r => r.id === roomId)) return "Geçersiz derslik seçimi.";
  if (course.year === 1 && roomId !== "109") {
    return "1. sınıf dersleri yalnızca 109 no'lu dersliğe yerleştirilebilir.";
  }
  if (Number(startSlot) < 0 || Number(startSlot) + Number(duration) > SLOTS.length) {
    return "Seçilen başlangıç saati ders süresi için uygun değil.";
  }
  const period = SLOTS[Number(startSlot)].period;
  const crossesLunch = blockSlots(startSlot, duration).some(slot => SLOTS[slot].period !== period);
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
      return `${SLOTS[startSlot].label} bloğu ${ROOMS.find(r => r.id === roomId)?.name} için dolu.`;
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
  const placements = [];

  orderedCourses.forEach((gc, idx) => {
    const targetRoom = orderedRooms[idx];
    placements.push({
      id: bookingId(gc.id, partIndex),
      course: gc,
      courseId: gc.id,
      teacherId: state.assignments[gc.id],
      roomId: targetRoom,
      day,
      startSlot: Number(startSlot),
      duration,
      partIndex: Number(partIndex),
      electiveGroup: gc.electiveGroup || null
    });
  });

  return placements;
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
  const { db, doc, getDoc, setDoc, runTransaction, serverTimestamp } = fb;
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
  toast("Ders programa yerleştirildi.", "success");
}

async function deleteBooking(courseId, partIndex = 0) {
  const course = getCourse(courseId);
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
    const store = getDemoStore();
    state.users = store.users;
    state.assignments = store.assignments;
    state.courseParts = store.courseParts;
    state.bookings = store.bookings;
  }
  render();
}

async function loginDemo(identifier, password) {
  const found = DEMO_USERS.find(u => (u.username === identifier || u.email === identifier) && u.password === password);
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
      await fb.setDoc(userRef, { email, displayName: "Yetkili Kullanıcı", role: "admin" });
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
  $("userBadge").textContent = `${state.user.displayName || state.user.email} · ${state.user.role === "admin" ? "Yetkili" : "Hoca"}`;
  $("backendBadge").textContent = state.mode === "firebase" ? "Firebase veri tabanı" : "Tarayıcı içi demo";
  renderFilters();
  renderMyCourses();
  renderSchedule();
  renderAdmin();
}

function renderFilters() {
  const sem = $("semesterFilter");
  sem.innerHTML = Array.from({ length: 8 }, (_, i) => `<option value="${i + 1}">${i + 1}. yarıyıl / ${Math.ceil((i + 1) / 2)}. sınıf</option>`).join("");
  sem.value = String(state.selectedSemester);

  const room = $("roomFilter");
  room.innerHTML = `<option value="ALL">Tüm derslikler</option>` + ROOMS.map(r => `<option value="${r.id}">${r.name}</option>`).join("");
  room.value = state.selectedRoom;
}

function startOptions(duration) {
  return SLOTS.map(s => {
    const err = Number(s.index) + Number(duration) > SLOTS.length || blockSlots(s.index, duration).some(slot => SLOTS[slot].period !== s.period);
    return `<option value="${s.index}" ${err ? "disabled" : ""}>${s.label}</option>`;
  }).join("");
}

function roomOptions(course, selected = "109") {
  return ROOMS.map(r => {
    const disabled = course.year === 1 && r.id !== "109";
    return `<option value="${r.id}" ${selected === r.id ? "selected" : ""} ${disabled ? "disabled" : ""}>${r.name}${disabled ? " · 1. sınıf için kapalı" : ""}</option>`;
  }).join("");
}

function bookingForCoursePart(courseId, partIndex) {
  return state.bookings.find(b => b.id === bookingId(courseId, partIndex));
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

  target.innerHTML = visibleCourses.map(course => {
    const partRows = partsFor(course.id).map((duration, idx) => {
      const b = bookingForCoursePart(course.id, idx);
      if (b) {
        return `<div class="courseAction booked">
          <strong>${idx + 1}. parça:</strong> ${duration} saat · ${b.day} · ${SLOTS[b.startSlot].label} · ${ROOMS.find(r => r.id === b.roomId)?.name || b.roomId}
          <button class="danger small" data-action="delete-booking" data-course="${course.id}" data-part="${idx}">Programdan kaldır</button>
        </div>`;
      }
      return `<div class="courseAction">
        <label>${idx + 1}. parça / ${duration} saat</label>
        <select data-role="day" data-course="${course.id}" data-part="${idx}">${DAYS.map(d => `<option value="${d}">${d}</option>`).join("")}</select>
        <select data-role="start" data-course="${course.id}" data-part="${idx}">${startOptions(duration)}</select>
        <select data-role="room" data-course="${course.id}" data-part="${idx}">${roomOptions(course, course.year === 1 ? "109" : "EK")}</select>
        <button class="primary small" data-action="book" data-course="${course.id}" data-part="${idx}">Yerleştir</button>
      </div>`;
    }).join("");

    const assigned = teacherName(state.assignments[course.id]);
    const elective = course.electiveGroup ? `<span class="pill elective">${course.electiveGroup}</span>` : "";
    const split = partsFor(course.id).length > 1 ? `<span class="pill warn">Yetkili tarafından bölündü: ${partsFor(course.id).join("+")}</span>` : "";
    return `<article class="courseCard">
      <div class="courseHead">
        <div><strong>${course.code}</strong> · ${course.name}<br><span class="muted">T:${course.t} U:${course.u} · süre:${course.duration} saat · hoca: ${assigned}</span></div>
        <div>${elective}${split}</div>
      </div>
      ${partRows}
    </article>`;
  }).join("");
}

function renderSchedule() {
  const target = $("scheduleGrid");
  const rooms = state.selectedRoom === "ALL" ? ROOMS : ROOMS.filter(r => r.id === state.selectedRoom);
  const semester = Number(state.selectedSemester);

  target.innerHTML = rooms.map(room => {
    const header = SLOTS.map(s => `<th>${s.label}</th>`).join("");
    const rows = DAYS.map(day => {
      const cells = SLOTS.map(slot => {
        const b = state.bookings.find(x => {
          const c = getCourse(x.courseId);
          return c?.semester === semester && x.roomId === room.id && x.day === day && Number(slot.index) >= Number(x.startSlot) && Number(slot.index) < Number(x.startSlot) + Number(x.duration);
        });
        if (!b) return `<td class="free">Boş</td>`;
        const course = getCourse(b.courseId);
        const isStart = Number(slot.index) === Number(b.startSlot);
        return `<td class="busy ${isStart ? "start" : "cont"}">
          ${isStart ? `<strong>${course.code}</strong><br>${course.name}<br><span>${teacherName(b.teacherId)}</span>${course.electiveGroup ? `<br><em>${course.electiveGroup}</em>` : ""}` : "↳"}
        </td>`;
      }).join("");
      return `<tr><th>${day}</th>${cells}</tr>`;
    }).join("");

    return `<section class="roomBlock">
      <h3>${room.name}</h3>
      <p class="muted">${room.note}</p>
      <div class="tableWrap"><table class="schedule"><thead><tr><th>Gün</th>${header}</tr></thead><tbody>${rows}</tbody></table></div>
    </section>`;
  }).join("");
}

function renderAdmin() {
  const panel = $("adminPanel");
  if (!isAdmin()) {
    panel.classList.add("hidden");
    panel.innerHTML = "";
    return;
  }
  panel.classList.remove("hidden");
  const teachers = state.users.filter(u => u.role === "teacher" || u.role === "admin");
  const courses = COURSES.filter(c => c.semester === state.selectedSemester);
  const teacherOptions = (selected) => `<option value="">Atanmamış</option>` + teachers.map(t => `<option value="${t.id}" ${selected === t.id ? "selected" : ""}>${t.displayName || t.email}</option>`).join("");

  panel.innerHTML = `
    <h2>Yetkili Paneli</h2>
    <div class="adminGrid">
      <section class="card">
        <h3>Hoca-ders atamaları</h3>
        <p class="muted">Bu yarıyıldaki dersler için sorumlu hocayı seçin. Seçmeli havuzların eşzamanlı çalışması için havuzdaki tüm derslerin hocaları atanmış olmalıdır.</p>
        <div class="assignmentList">
          ${courses.map(c => `
            <div class="assignmentRow">
              <div><strong>${c.code}</strong> ${c.name}<br><span class="muted">${c.electiveGroup || "Zorunlu"} · T:${c.t} U:${c.u}</span></div>
              <select data-role="assign" data-course="${c.id}">${teacherOptions(state.assignments[c.id])}</select>
              <button class="small" data-action="assign" data-course="${c.id}">Kaydet</button>
            </div>
          `).join("")}
        </div>
      </section>
      <section class="card">
        <h3>Yetkili ders bölme işlemi</h3>
        <p class="muted">Normal kullanıcı dersi bölemez. Burada örn. 4 saatlik dersi <code>2,2</code> yaparsanız hoca iki ayrı blok seçebilir. Tek blok için <code>4</code> yazın.</p>
        <label>Ders</label>
        <select id="splitCourseSelect">${courses.map(c => `<option value="${c.id}">${c.code} · ${c.name} · ${c.duration} saat</option>`).join("")}</select>
        <label>Parça kuralı</label>
        <input id="splitPartsInput" placeholder="Örn: 4 veya 2,2" />
        <button class="primary" id="saveSplitBtn">Parça kuralını kaydet</button>
        <hr>
        <h3>Veri işlemleri</h3>
        <button id="exportBtn">Programı JSON indir</button>
        ${state.mode === "demo" ? `<button class="danger" id="resetDemoBtn">Demo verisini sıfırla</button>` : `<p class="muted">Firebase modunda silme/sıfırlama işlemlerini Firestore Console üzerinden veya ileride eklenecek yönetim ekranından yapın.</p>`}
      </section>
    </div>`;

  const select = $("splitCourseSelect");
  const input = $("splitPartsInput");
  const syncInput = () => { input.value = partsFor(select.value).join(","); };
  select.addEventListener("change", syncInput);
  syncInput();
  $("saveSplitBtn").addEventListener("click", async () => {
    try { await setCourseParts(select.value, input.value); }
    catch (err) { toast(err.message, "error"); }
  });
  $("exportBtn").addEventListener("click", exportSchedule);
  const resetBtn = $("resetDemoBtn");
  if (resetBtn) resetBtn.addEventListener("click", async () => {
    if (!confirm("Demo atamalar ve program sıfırlansın mı?")) return;
    localStorage.removeItem(LS_KEY);
    await loadData();
    toast("Demo verisi sıfırlandı.", "success");
  });
}

function exportSchedule() {
  const payload = {
    exportedAt: new Date().toISOString(),
    courses: COURSES,
    rooms: ROOMS,
    slots: SLOTS,
    days: DAYS,
    users: state.users,
    assignments: state.assignments,
    courseParts: state.courseParts,
    bookings: state.bookings
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "dkb-ders-programi.json";
  a.click();
  URL.revokeObjectURL(url);
}

function bindEvents() {
  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const identifier = $("loginUser").value.trim();
    const password = $("loginPass").value;
    try {
      if (state.mode === "firebase" && !demoModeForced) await loginFirebase(identifier, password);
      else await loginDemo(identifier, password);
      toast("Giriş yapıldı.", "success");
    } catch (err) {
      toast(err.message, "error");
    }
  });

  $("logoutBtn").addEventListener("click", logout);
  $("refreshBtn").addEventListener("click", loadData);
  $("semesterFilter").addEventListener("change", (e) => { state.selectedSemester = Number(e.target.value); render(); });
  $("roomFilter").addEventListener("change", (e) => { state.selectedRoom = e.target.value; render(); });

  document.body.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const courseId = btn.dataset.course;
    const part = Number(btn.dataset.part || 0);
    try {
      if (action === "book") {
        const day = document.querySelector(`select[data-role="day"][data-course="${courseId}"][data-part="${part}"]`).value;
        const start = document.querySelector(`select[data-role="start"][data-course="${courseId}"][data-part="${part}"]`).value;
        const room = document.querySelector(`select[data-role="room"][data-course="${courseId}"][data-part="${part}"]`).value;
        await bookCourse(courseId, part, day, start, room);
      }
      if (action === "delete-booking") {
        if (!confirm("Bu dersi programdan kaldırmak istiyor musunuz? Seçmeli havuz ise eşzamanlı havuz kayıtları da kaldırılır.")) return;
        await deleteBooking(courseId, part);
      }
      if (action === "assign") {
        const sel = document.querySelector(`select[data-role="assign"][data-course="${courseId}"]`);
        await setAssignment(courseId, sel.value);
      }
    } catch (err) {
      toast(err.message, "error");
    }
  });
}

async function boot() {
  await initFirebaseIfConfigured();
  bindEvents();
  if (state.mode === "demo") {
    const store = getDemoStore();
    state.users = store.users;
  }
  render();
}

boot();
