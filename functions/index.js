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

exports.createInstructor = onCall({ region: "europe-west1" }, async (request) => {
  await requireAdmin(request.auth && request.auth.uid);

  const data = request.data || {};
  const displayName = String(data.displayName || "").trim();
  const title = String(data.title || "").trim();
  const username = normalizeUsername(data.username);
  const password = String(data.password || "");
  const courseIds = Array.isArray(data.courseIds) ? data.courseIds.map(String) : [];

  if (!displayName) throw new HttpsError("invalid-argument", "Ad soyad alanı zorunludur.");
  if (!username || username.length < 3) throw new HttpsError("invalid-argument", "Kullanıcı adı en az üç karakter olmalıdır.");
  if (!password || password.length < 6) throw new HttpsError("invalid-argument", "Şifre en az altı karakter olmalıdır.");

  const email = usernameToEmail(username);
  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(email);
    userRecord = await admin.auth().updateUser(userRecord.uid, {
      password,
      displayName,
      disabled: false
    });
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    userRecord = await admin.auth().createUser({
      email,
      password,
      displayName,
      emailVerified: true,
      disabled: false
    });
  }

  const batch = db.batch();
  batch.set(db.collection("users").doc(userRecord.uid), {
    username,
    email,
    displayName,
    title,
    role: "teacher",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: request.auth.uid
  }, { merge: true });

  for (const courseId of courseIds) {
    batch.set(db.collection("assignments").doc(courseId), {
      courseId,
      teacherId: userRecord.uid,
      updatedBy: request.auth.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  await batch.commit();
  return {
    uid: userRecord.uid,
    username,
    displayName,
    assignedCourseCount: courseIds.length
  };
});
