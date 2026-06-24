# DKB Ders Programı – GitHub Pages deneme sayfası

Bu klasör, Doğa Koruma ve Biyoçeşitlilik Yönetimi Bölümü ders programı için statik GitHub Pages uyumlu bir deneme uygulamasıdır.

## Özellikler

- GitHub Pages üzerinde çalışır.
- Firebase ayarları yapılmazsa tarayıcı içi demo modda açılır.
- Yetkili kullanıcı ders-hoca ataması yapabilir.
- Hocalar yalnızca kendilerine atanmış dersleri programa yerleştirir.
- First come first serve mantığı Firebase Firestore transaction + occupancy dokümanlarıyla uygulanır.
- Dersler T+U toplam süresi kadar blok olarak yerleştirilir.
- Öğle arası geçişi engellenir.
- Normal kullanıcı ders parçalayamaz; yetkili kullanıcı `2,2` gibi parça kuralı tanımlayabilir.
- 1. sınıf dersleri yalnızca 109 no'lu derslikte yapılır.
- Seçmeli havuzdaki dersler aynı gün/saatte farklı dersliklere otomatik atanır.

## Demo giriş bilgileri

Firebase ayarları yapılmadan:

- Yetkili: `admin` / `DKB2026!`
- Hoca: `hoca1` / `123456`
- Hoca: `hoca2` / `123456`
- Hoca: `hoca3` / `123456`

Demo mod yalnızca aynı tarayıcı içinde çalışır. Farklı bilgisayarlardan gerçek eşzamanlı seçim için Firebase gereklidir.

## Dosyalar

- `index.html`: Ana sayfa
- `styles.css`: Görsel tasarım
- `app.js`: Uygulama mantığı
- `firebase-config.js`: Firebase bağlantı bilgileri
- `data/courses.js`: Müfredat, saatler, günler, derslikler
- `firestore.rules`: Önerilen Firestore güvenlik kuralları

## GitHub Pages kurulumu

1. GitHub'da yeni bir repository açın. Örn: `dkb-ders-programi`.
2. Bu klasördeki dosyaları repository kök dizinine yükleyin.
3. Repository içinde **Settings > Pages** bölümüne girin.
4. **Build and deployment > Source** kısmında **Deploy from a branch** seçin.
5. Branch olarak `main`, klasör olarak `/root` seçin ve kaydedin.
6. Birkaç dakika sonra sayfa şu formatta yayınlanır:
   `https://KULLANICI_ADI.github.io/dkb-ders-programi/`

## Firebase ile gerçek çok kullanıcılı kullanım

1. Firebase Console'da yeni proje oluşturun.
2. Authentication > Sign-in method bölümünden Email/Password sağlayıcısını açın.
3. Firestore Database oluşturun.
4. Project settings > General > Your apps bölümünden Web App ekleyin ve config bilgilerini alın.
5. `firebase-config.js` içindeki placeholder değerleri gerçek değerlerle değiştirin.
6. Firestore Rules bölümüne `firestore.rules` içeriğini yapıştırıp yayınlayın.
7. Authentication bölümünden hocalar için e-posta/şifre kullanıcıları oluşturun.
8. Firestore `users` koleksiyonunda her kullanıcı için Auth UID ile aynı doküman ID'sine sahip kayıt oluşturun.

Örnek `users/{uid}` dokümanı:

```json
{
  "email": "hoca1@kastamonu.edu.tr",
  "displayName": "Hoca Adı Soyadı",
  "role": "teacher"
}
```

Yetkili için:

```json
{
  "email": "emre.akturk@kastamonu.edu.tr",
  "displayName": "Doç. Dr. Emre Aktürk",
  "role": "admin"
}
```

## Önemli güvenlik notu

GitHub Pages statik bir yayın ortamıdır. Gerçek kullanıcı adı/şifreleri JavaScript dosyalarının içine yazmayın. Demo moddaki şifreler sadece arayüz testi içindir. Gerçek kullanımda Firebase Authentication ve Firestore kuralları kullanılmalıdır.
