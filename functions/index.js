const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();
const AUTH_EMAIL_DOMAIN = "dkby.kastamonu.edu.tr";

function normalizeUsername(value) {
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

function usernameToEmail(username) {
  const value = String(username || "").trim().toLowerCase();
  return value.includes("@") ? value : `${value}@${AUTH_EMAIL_DOMAIN}`;
}

async function requireAdmin(uid) {
  if (!uid) throw new HttpsError("unauthenticated", "Oturum doğrulanamadı.");
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists || snap.data().role !== "admin") {
    throw new HttpsError("permission-denied", "Bu işlem yalnızca yetkili kullanıcı tarafından yapılabilir.");
  }
  return snap.data();
}

async function assertTeacher(userId) {
  const ref = db.collection("users").doc(userId);
  const snap = await ref.get();
  if (!snap.exists || snap.data().role !== "teacher") {
    throw new HttpsError("not-found", "Öğretim üyesi kaydı bulunamadı.");
  }
  return { ref, data: snap.data() };
}

exports.createInstructor = onCall({ region: "europe-west1" }, async (request) => {
  await requireAdmin(request.auth && request.auth.uid);

  const data = request.data || {};
  const displayName = String(data.displayName || "").trim();
  const title = String(data.title || "").trim();
  const username = normalizeUsername(data.username);
  const password = String(data.password || "");

  if (!displayName) throw new HttpsError("invalid-argument", "Ad soyad alanı zorunludur.");
  if (!username || username.length < 3) throw new HttpsError("invalid-argument", "Kullanıcı adı en az üç karakter olmalıdır.");
  if (!password || password.length < 6) throw new HttpsError("invalid-argument", "Şifre en az altı karakter olmalıdır.");

  const email = usernameToEmail(username);
  let existing = null;
  try {
    existing = await admin.auth().getUserByEmail(email);
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
  }
  if (existing) throw new HttpsError("already-exists", "Bu kullanıcı adı daha önce tanımlanmıştır.");

  const userRecord = await admin.auth().createUser({
    email,
    password,
    displayName,
    emailVerified: true,
    disabled: false
  });
  await admin.auth().setCustomUserClaims(userRecord.uid, { role: "teacher" });

  await db.collection("users").doc(userRecord.uid).set({
    username,
    email,
    displayName,
    title,
    role: "teacher",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: request.auth.uid
  }, { merge: true });

  return { uid: userRecord.uid, username, displayName };
});

exports.updateInstructor = onCall({ region: "europe-west1" }, async (request) => {
  await requireAdmin(request.auth && request.auth.uid);

  const data = request.data || {};
  const userId = String(data.userId || "").trim();
  const displayName = String(data.displayName || "").trim();
  const title = String(data.title || "").trim();
  const username = normalizeUsername(data.username);
  const password = String(data.password || "");

  if (!userId) throw new HttpsError("invalid-argument", "Güncellenecek öğretim üyesi belirlenemedi.");
  if (!displayName) throw new HttpsError("invalid-argument", "Ad soyad alanı zorunludur.");
  if (!username || username.length < 3) throw new HttpsError("invalid-argument", "Kullanıcı adı en az üç karakter olmalıdır.");
  if (password && password.length < 6) throw new HttpsError("invalid-argument", "Şifre en az altı karakter olmalıdır.");

  const { ref } = await assertTeacher(userId);
  const email = usernameToEmail(username);

  try {
    const other = await admin.auth().getUserByEmail(email);
    if (other.uid !== userId) throw new HttpsError("already-exists", "Bu kullanıcı adı başka bir öğretim üyesi tarafından kullanılmaktadır.");
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
  }

  const authUpdate = { email, displayName, disabled: false };
  if (password) authUpdate.password = password;
  await admin.auth().updateUser(userId, authUpdate);
  await admin.auth().setCustomUserClaims(userId, { role: "teacher" });

  await ref.set({
    username,
    email,
    displayName,
    title,
    role: "teacher",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: request.auth.uid
  }, { merge: true });

  return { uid: userId, username, displayName };
});

exports.deleteInstructor = onCall({ region: "europe-west1" }, async (request) => {
  await requireAdmin(request.auth && request.auth.uid);

  const userId = String((request.data || {}).userId || "").trim();
  if (!userId) throw new HttpsError("invalid-argument", "Kaldırılacak öğretim üyesi belirlenemedi.");
  await assertTeacher(userId);

  const batch = db.batch();
  batch.delete(db.collection("users").doc(userId));

  const assignments = await db.collection("assignments").where("teacherId", "==", userId).get();
  assignments.docs.forEach((doc) => batch.delete(doc.ref));

  const bookings = await db.collection("bookings").where("teacherId", "==", userId).get();
  const occupancyKeys = new Set();
  bookings.docs.forEach((doc) => {
    const data = doc.data();
    (data.occupancyKeys || []).forEach((key) => occupancyKeys.add(key));
    batch.delete(doc.ref);
  });
  occupancyKeys.forEach((key) => batch.delete(db.collection("occupancy").doc(key)));

  await batch.commit();
  await admin.auth().deleteUser(userId);

  return {
    uid: userId,
    removedAssignments: assignments.size,
    removedBookings: bookings.size
  };
});
