// Firebase yapılandırması
// Ortak kullanıcı yönetimi ve ortak ders programı verisi Firebase Authentication + Firestore ile yürütülür.
// GitHub Pages yalnızca arayüz dosyalarını yayınlar.

export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

export const adminEmails = [
  "admin@dkby.kastamonu.edu.tr"
];

export const authEmailDomain = "dkby.kastamonu.edu.tr";

export const functionRegion = "europe-west1";
