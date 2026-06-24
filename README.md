# DKB Ders Programı Sistemi - v2

Bu sürüm GitHub Pages üzerinde çalışan ders programı arayüzünü geliştirir. Demo modda yalnızca tarayıcı içinde test yapılır. Gerçek çok-kullanıcılı kullanım, e-posta daveti ve şifre belirleme için Firebase Authentication, Firestore ve Cloud Functions gerekir.

## 1. GitHub Pages dosyaları

Repository kök dizinine şu dosyaları yükleyin veya mevcut dosyalarla değiştirin:

- `index.html`
- `styles.css`
- `app.js`
- `firebase-config.js`
- `firestore.rules`
- `accept-invite.html`
- `accept-invite.js`
- `data/courses.js`
- `README.md`

GitHub Pages adresiniz:

```text
https://eakturkphd.github.io/dkbydepo/
```

## 2. Demo girişleri

Firebase ayarları yapılmadığında sistem demo modda çalışır.

```text
Yetkili: admin / DKB2026!
Hoca: hoca1 / 123456
Hoca: hoca2 / 123456
Hoca: hoca3 / 123456
```

Demo modda admin yeni hoca ekleyebilir ve ders ataması yapabilir. Ancak gerçek e-posta gönderimi yapılmaz; sistem demo giriş bilgisini ekranda gösterir.

## 3. Yeni özellikler

- Yönetici hoca ekleyebilir.
- Yönetici yeni hocaya ders atayabilir.
- Firebase Functions kurulduğunda hocaya davet e-postası gider.
- Hoca e-postadaki linkten kendi şifresini belirler.
- Ders yerleştirme artık haftalık program tablosundaki boş hücreye tıklayarak yapılabilir.
- Kart içinden klasik gün/saat/derslik seçimi de korunmuştur.
- Seçmeli ders havuzundaki dersler aynı gün ve aynı saatte farklı dersliklere otomatik yerleşir.
- Normal hoca dersi parçalayamaz. Parçalama yalnızca yönetici panelindeki `Parça` alanından yapılabilir.

## 4. Firebase yapılandırması

`firebase-config.js` dosyasındaki değerleri Firebase Console > Project settings > Web app config bölümünden doldurun.

```js
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

İlk admin e-posta adresinizi de aynı dosyada tanımlayın:

```js
export const adminEmails = [
  "emre.akturk@kastamonu.edu.tr"
];
```

## 5. Firestore kuralları

Firebase Console > Firestore Database > Rules bölümüne `firestore.rules` içeriğini yapıştırıp yayınlayın.

## 6. Cloud Functions kurulumu

E-posta daveti ve davet linkinden şifre belirleme için `functions` klasörü gerekir.

Terminalde proje kökünde:

```bash
firebase init functions
```

Ardından bu paketteki `functions/index.js`, `functions/package.json` ve `functions/.env.example` dosyalarını Firebase projenizdeki `functions` klasörüne kopyalayın.

`.env.example` dosyasını `.env` olarak çoğaltıp alanları doldurun:

```bash
FUNCTION_REGION=europe-west1
SITE_URL=https://eakturkphd.github.io/dkbydepo
FROM_EMAIL=dkb-program@yourdomain.edu.tr
SENDGRID_API_KEY=SG_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Paketleri kurun ve fonksiyonları yayınlayın:

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

## 7. Davet süreci

1. Admin giriş yapar.
2. Yönetici panelinden hocanın adını, unvanını ve e-postasını girer.
3. Atanacak dersleri seçer.
4. `Hocayı ekle ve davet oluştur` butonuna basar.
5. Firebase Functions kurulmuş ve SendGrid ayarlanmışsa hocaya e-posta gider.
6. Hoca e-postadaki linkten `accept-invite.html` sayfasına gelir.
7. Kendi şifresini belirler.
8. Sistem hocayı Firebase Authentication içine ekler, Firestore `users` kaydını oluşturur ve ders atamalarını yapar.

## 8. Dosya notları

- `data/courses.js`: Müfredat, derslikler, günler ve saat blokları.
- `app.js`: Ana uygulama mantığı, admin paneli, ders yerleştirme, Firestore işlemleri.
- `accept-invite.js`: Davet linkinden şifre belirleme akışı.
- `functions/index.js`: Hoca daveti ve kullanıcı oluşturma fonksiyonları.
- `firestore.rules`: Firestore güvenlik kuralları.

## 9. Bilinen sınır

GitHub Pages statik yayın yaptığı için kendi başına güvenli kullanıcı oluşturma veya e-posta gönderme işlemi yapmaz. Bu nedenle gerçek e-posta daveti için Firebase Cloud Functions veya benzeri bir backend zorunludur.
