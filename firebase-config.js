// Firebase yapılandırması
// GitHub Pages üzerinde ortak kullanıcı yönetimi ve ortak ders programı için Firebase kullanılmalıdır.
// Kullanıcı adıyla girişte sistem, kullanıcı adını aşağıdaki kurumsal sanal alan adıyla e-posta formatına çevirir.

export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// İlk yetkili kullanıcı Firebase Authentication içinde manuel oluşturulduktan sonra
// bu listeye ilgili e-posta/sanal e-posta yazılır. Örn: "admin@dkby.kastamonu.edu.tr"
export const adminEmails = [
  "admin@dkby.kastamonu.edu.tr"
];

// Kullanıcı adı "ayse.yilmaz" ise Firebase Auth e-postası "ayse.yilmaz@dkby.kastamonu.edu.tr" olur.
export const authEmailDomain = "dkby.kastamonu.edu.tr";

export const functionRegion = "europe-west1";
