// Firebase'i kullanmak istediğinizde bu dosyadaki değerleri Firebase Console > Project settings > Web app config alanından doldurun.
// Değerler boş/placeholder kalırsa uygulama sadece tarayıcı içi DEMO MODDA çalışır.
// DEMO MOD gerçek çok-kullanıcılı değildir; ilk deneme ve arayüz testi içindir.

export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// İlk kurulum kolaylığı için. Güvenlik için nihai sürümde admin yetkisi Firestore users koleksiyonunda tutulmalıdır.
export const adminEmails = [
  "emre.akturk@kastamonu.edu.tr"
];
