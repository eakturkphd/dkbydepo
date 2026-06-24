export const ROOMS = [
  { id: "109", name: "109 Derslik", note: "1. sınıf için öncelikli/zorunlu derslik" },
  { id: "EK", name: "Ek Derslik", note: "İsim/numara verilmemiş ikinci derslik" }
];

export const DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma"];

export const SLOTS = [
  { index: 0, label: "08:30-09:15", period: "morning" },
  { index: 1, label: "09:30-10:15", period: "morning" },
  { index: 2, label: "10:30-11:15", period: "morning" },
  { index: 3, label: "11:30-12:15", period: "morning" },
  { index: 4, label: "13:30-14:15", period: "afternoon" },
  { index: 5, label: "14:30-15:15", period: "afternoon" },
  { index: 6, label: "15:30-16:15", period: "afternoon" },
  { index: 7, label: "16:30-17:15", period: "afternoon" }
];

const c = (code, name, semester, t, u, uk, ects, electiveGroup = null) => ({
  id: code,
  code,
  name,
  semester,
  year: Math.ceil(semester / 2),
  t,
  u,
  uk,
  ects,
  electiveGroup,
  duration: t + u,
  mandatory: electiveGroup === null
});

export const COURSES = [
  // 1. yarıyıl
  c("DKB101", "Genel Biyoloji", 1, 2, 1, 3, 4),
  c("DKB103", "Doğa Koruma ve Biyoçeşitliliğe Giriş", 1, 2, 1, 3, 3),
  c("DKB105", "Genel Kimya", 1, 2, 1, 3, 4),
  c("DKB107", "Genel Matematik", 1, 2, 0, 2, 3),
  c("DKB109", "Bilgisayar Teknolojileri ve Programlama", 1, 2, 2, 4, 4),
  c("DKB111", "Mesleki Etik ve Deontoloji", 1, 2, 0, 2, 3),
  c("TDI101", "Türk Dili I", 1, 2, 0, 2, 2),
  c("AIT101", "Atatürk İlkeleri ve İnkılap Tarihi I", 1, 2, 0, 2, 2),
  c("YD101", "Yabancı Dil I", 1, 2, 0, 2, 2),
  c("OSDF101", "Ortak Seçmeli Dersler", 1, 2, 0, 2, 3),

  // 2. yarıyıl
  c("DKB102", "Genel Ekoloji", 2, 2, 1, 3, 3),
  c("DKB104", "Genel Botanik", 2, 2, 1, 3, 3),
  c("DKB106", "Genel Zooloji", 2, 2, 1, 3, 3),
  c("DKB108", "Biyocoğrafya", 2, 2, 0, 2, 3),
  c("DKB110", "İklim Bilgisi", 2, 2, 1, 3, 3),
  c("TDI102", "Türk Dili II", 2, 2, 0, 2, 2),
  c("AIT102", "Atatürk İlkeleri ve İnkılap Tarihi II", 2, 2, 0, 2, 2),
  c("YD102", "Yabancı Dil II", 2, 2, 0, 2, 2),
  c("OSDF102", "Ortak Seçmeli Dersler", 2, 2, 0, 2, 3),
  c("SEC112", "Biyokimya", 2, 2, 0, 2, 3, "Seçmeli Ders 1"),
  c("SEC114", "Ekolojik Okur Yazarlık", 2, 2, 0, 2, 3, "Seçmeli Ders 1"),
  c("SEC116", "Ekolojik Malzemeler", 2, 2, 0, 2, 3, "Seçmeli Ders 2"),
  c("SEC118", "Ölçme ve Harita Bilgisi", 2, 2, 0, 2, 3, "Seçmeli Ders 2"),

  // 3. yarıyıl
  c("DKB201", "Yaban Hayatı Bilgisi", 3, 2, 1, 3, 4),
  c("DKB203", "Bitki Ekolojisi", 3, 2, 0, 2, 2),
  c("DKB205", "Coğrafi Bilgi Sistemleri (CBS)", 3, 2, 2, 4, 4),
  c("DKB207", "İş Sağlığı ve Güvenliği", 3, 2, 0, 2, 2),
  c("DKB209", "Uygulamalı İstatistik", 3, 2, 2, 4, 4),
  c("DKB211", "Doğa Koruma Politikaları ve Hukuku", 3, 2, 0, 2, 2),
  c("DKB213", "Bitki Sistematiği", 3, 2, 1, 3, 3),
  c("DKB215", "Tohumsuz Bitkiler", 3, 2, 0, 2, 3),
  c("SEC217", "Genel Jeoloji", 3, 2, 0, 2, 3, "Seçmeli Ders 3"),
  c("SEC219", "Doğal Süs Bitkileri", 3, 2, 0, 2, 3, "Seçmeli Ders 3"),
  c("SEC221", "Mesleki İngilizce", 3, 2, 0, 2, 3, "Seçmeli Ders 4"),
  c("SEC223", "Ekopsikoloji", 3, 2, 0, 2, 3, "Seçmeli Ders 4"),

  // 4. yarıyıl
  c("DKB202", "İklim Değişikliği", 4, 2, 0, 2, 2),
  c("DKB204", "Ornitoloji", 4, 2, 1, 3, 3),
  c("DKB206", "Entomoloji", 4, 2, 1, 3, 3),
  c("DKB208", "Tohumlu Bitkiler I", 4, 2, 2, 4, 4),
  c("DKB212", "Uzaktan Algılama", 4, 2, 2, 4, 4),
  c("DKB214", "Temel Genetik", 4, 2, 1, 3, 3),
  c("DKB216", "Staj I", 4, 0, 2, 2, 2),
  c("SEC218", "İstilacı Türler", 4, 2, 0, 2, 3, "Seçmeli Ders 5"),
  c("SEC220", "Yaban Hayvanları Üretim Teknikleri", 4, 2, 0, 2, 3, "Seçmeli Ders 5"),
  c("SEC222", "Ekosistem Hizmetleri", 4, 2, 0, 2, 3, "Seçmeli Ders 6"),
  c("SEC224", "Kirlilik ve Atık Yönetimi", 4, 2, 0, 2, 3, "Seçmeli Ders 6"),
  c("SEC226", "Doğaya Uygun Ormancılık", 4, 2, 0, 2, 3, "Seçmeli Ders 7"),
  c("SEC228", "Palinoloji", 4, 2, 0, 2, 3, "Seçmeli Ders 7"),

  // 5. yarıyıl
  c("DKB301", "Biyokıymetlendirme", 5, 2, 0, 2, 3),
  c("DKB303", "Genel Mikoloji", 5, 2, 1, 3, 4),
  c("DKB305", "Ekolojide Sürdürülebilirlik", 5, 2, 0, 2, 3),
  c("DKB307", "Floristik Biyoçeşitlilik Envanteri", 5, 2, 1, 3, 4),
  c("DKB309", "Tohumlu Bitkiler II", 5, 2, 2, 4, 4),
  c("DKB311", "Sulak Alan Ekolojisi", 5, 2, 1, 3, 4),
  c("DKB313", "Toprak Bilgisi", 5, 2, 0, 2, 2),
  c("SEC315", "Biyolojik Mücadele", 5, 2, 0, 2, 3, "Seçmeli Ders 8"),
  c("SEC317", "Araknoloji", 5, 2, 0, 2, 3, "Seçmeli Ders 8"),
  c("SEC319", "Ekolojide Kantitatif Analizler", 5, 2, 0, 2, 3, "Seçmeli Ders 9"),
  c("SEC321", "Bitkilerde İklimsel Göç", 5, 2, 0, 2, 3, "Seçmeli Ders 9"),

  // 6. yarıyıl
  c("DKB302", "Koruma Biyolojisi", 6, 2, 0, 2, 2),
  c("DKB304", "Ekolojik Ayak İzi ve Karbon Yönetimi", 6, 2, 1, 3, 3),
  c("DKB306", "Doğal Kaynaklardan Faydalanma", 6, 2, 1, 3, 3),
  c("DKB308", "Ekoloji Temelli Doğa Eğitimi", 6, 2, 1, 3, 4),
  c("DKB310", "Doğal Afetler", 6, 2, 0, 2, 3),
  c("DKB312", "Habitat Restorasyonu", 6, 2, 2, 4, 4),
  c("DKB314", "Staj II", 6, 0, 2, 2, 2),
  c("SEC316", "Biyolojik Müze Yöntemleri", 6, 2, 0, 2, 3, "Seçmeli Ders 10"),
  c("SEC318", "Denizsel Ekosistemler ve Korunması", 6, 2, 0, 2, 3, "Seçmeli Ders 10"),
  c("SEC320", "Doğa Korumada Halkla İlişkiler", 6, 2, 0, 2, 3, "Seçmeli Ders 11"),
  c("SEC322", "Ekolojide Kalitatif Analizler", 6, 2, 0, 2, 3, "Seçmeli Ders 11"),
  c("SEC324", "Biyoetik ve Biyokaçakçılıkla Mücadele", 6, 2, 0, 2, 3, "Seçmeli Ders 12"),
  c("SEC326", "Ekoturizm ve Doğa Rehberliği", 6, 2, 0, 2, 3, "Seçmeli Ders 12"),

  // 7. yarıyıl
  c("DKB401", "Arazi Uygulama ve Değerlendirme I", 7, 2, 2, 4, 4),
  c("DKB403", "Korunan Alanların Planlaması", 7, 2, 1, 3, 3),
  c("DKB405", "Yangın Ekolojisi ve Yönetimi", 7, 2, 1, 3, 3),
  c("DKB407", "Mekânsal Veri Üretimi ve Analizi", 7, 2, 1, 3, 3),
  c("DKB409", "Yeşil Ekonomi ve Pazarlama", 7, 2, 0, 2, 3),
  c("DKB411", "Faunistik Biyoçeşitlilik Envanteri", 7, 2, 0, 2, 3),
  c("DKB413", "Proje", 7, 0, 2, 2, 2),
  c("SEC415", "Geofitler", 7, 2, 0, 2, 3, "Seçmeli Ders 13"),
  c("SEC417", "Çevresel Modelleme", 7, 2, 0, 2, 3, "Seçmeli Ders 13"),
  c("SEC419", "Amfibi ve Sürüngenler", 7, 2, 0, 2, 3, "Seçmeli Ders 14"),
  c("SEC421", "Hızlı Alan Değerlendirmesi", 7, 2, 0, 2, 3, "Seçmeli Ders 14"),
  c("SEC423", "Avcılık ve Avlak Yönetimi", 7, 2, 0, 2, 3, "Seçmeli Ders 15"),
  c("SEC425", "Ekolojik Girişimcilik", 7, 2, 0, 2, 3, "Seçmeli Ders 15"),

  // 8. yarıyıl
  c("DKB402", "Arazi Uygulama ve Değerlendirme II", 8, 2, 2, 4, 4),
  c("DKB404", "Tür Koruma Eylem Planı ve Projelendirme", 8, 2, 2, 4, 4),
  c("DKB406", "Ekosistem Değerlendirme Metodolojisi", 8, 2, 1, 3, 3),
  c("DKB408", "Korunan Alanların Yönetimi", 8, 2, 0, 2, 3),
  c("DKB410", "Bitirme Çalışması", 8, 0, 2, 2, 2),
  c("DKB412", "Yapay Zekâ ve Ekolojide Uygulamaları", 8, 2, 1, 3, 3),
  c("DKB414", "Çevre ve İklim Hukuku", 8, 2, 0, 2, 2),
  c("SEC416", "Kentsel Ekosistemler", 8, 2, 0, 2, 3, "Seçmeli Ders 16"),
  c("SEC418", "Sürdürülebilir Havza Yönetimi", 8, 2, 0, 2, 3, "Seçmeli Ders 16"),
  c("SEC420", "Ağaçlandırma", 8, 2, 0, 2, 3, "Seçmeli Ders 17"),
  c("SEC422", "Uluslararası Doğa Koruma Uygulamaları", 8, 2, 0, 2, 3, "Seçmeli Ders 17"),
  c("SEC424", "Endemik ve Tehdit Altındaki Türler", 8, 2, 0, 2, 3, "Seçmeli Ders 18"),
  c("SEC426", "Biyokütle ve Yenilenebilir Enerji Kaynakları", 8, 2, 0, 2, 3, "Seçmeli Ders 18")
];
