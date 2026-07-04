# Emsal Analizi — Ders Dağıtım Motoru

Tarih: 2 Temmuz 2026 · Durum: Hafta 1 (ön çalışma) · Kaynaklar: web sayfaları + ekran görüntüleri (Kaşif, Yabil), web sayfası (TimetableMaster, Bilsa), önceki FET araştırması

## Amaç
Dört emsal ürünün incelenmesiyle: (a) ürün konumumuzu doğrulamak/düzeltmek, (b) alan sözlüğünü toplamak, (c) veri modeli ve kısıt katalogu için kanıta dayalı girdi üretmek, (d) MVP kapsam sınırlarını netleştirmek.

## Rekabet haritası özeti

| Ürün | Model | Platform | Fiyat | Güçlü yanı | Zayıf yanı |
|---|---|---|---|---|---|
| FET | Açık kaynak | Masaüstü (çok platform) | Ücretsiz | Algoritma gücü, esneklik | Türkçe çeviri eksik, kavramsal model yabancı, kullanılabilirlik |
| Kaşif (Musavvirsoft) | Ticari | Windows masaüstü | ~6.750 TL/yıl + KDV | 20 yıllık alan bilgisi, karnıyarık optimizasyonu, erken imkansızlık uyarısı | 2002 paradigması arayüz, video/telefon desteğine bağımlı, Windows-only |
| Yabil SDD | Ticari | Windows masaüstü | Lisans (şifre) | Meslek lisesi alan/dal modeli, iki fazlı yer atama, veri testi | Eski arayüz, ders/blok model hatası, sığ doğrulama çıktısı |
| TimetableMaster | Ticari SaaS | Web (bulut) | Freemium | Modern UX, 6 adımlı akış, vekil yönetimi, paylaşım | Türkçe/MEB bağlamı yok, veri bulutta |
| Bilsa Web HDD | Ticari SaaS | Web (bulut) | Lisans (paket) | e-Okul/merkezi sistem entegrasyonu, KBS gönderimi, Türkçe | Büyük pakete bağlı, ticari, veri bulutta |

**Konumumuz (güncellenmiş):** ücretsiz + açık kaynak + veri-yerel (KVKK-temiz, veri cihazdan çıkmaz) + bağımsız/hafif + kendini açıklayan Türkçe arayüz + açıklanabilir çözücü. Not: "web tabanlı Türkçe ürün yok" tezi Bilsa ile çürüdü; farkımız web olmak değil, ücretsiz/açık/veri-yerel olmak.

## Alan sözlüğü (eşanlamlılarla)

| Terim | Anlam | Kaynak / eşanlamlı |
|---|---|---|
| Karnıyarık | Öğretmenin dersleri arasındaki boş saatler | Kaşif; Yabil'de "pencere" |
| Kapalı saat / kapalı gün | Öğretmen veya sınıfın müsait olmadığı dilimler | Kaşif, Yabil |
| Çarşaf liste | Tüm okulun tek tabloda ana çizelgesi | Kaşif, Yabil, Bilsa |
| El programı | Öğretmen/sınıf bireysel program çıktısı (resmi tebliğ evrakı) | Kaşif, Yabil, Bilsa |
| Sabitleme / çakma | Dersi belirli saate kilitleme | Kaşif "sabitleme", Yabil "çakma" |
| HDS | Haftalık ders saati | Kaşif, Yabil |
| Dağılım / bloklar | Haftalık saatin gün içi bloklara bölünme deseni (örn. 2+1+1) | Kaşif "112" gösterimi, Yabil blok sütunları |
| Alan/Dal | Meslek lisesinde şube içi meslek dalları | Yabil |
| Ortak ders | Şubenin/dalların birlikte gördüğü ders | Yabil |
| Dönerli nöbet | Haftadan haftaya dönen nöbet çizelgesi | Bilsa |
| Maaş/ücret karşılığı dersler | Ek ders hesabına giden saat dökümü | Bilsa, Yabil ekosistemi |
| Ders yükü | Öğretmene atanan toplam saat (zümre/branş analizi yapılır) | Yabil |

## Veri modeli bulguları

1. **Ders ≠ DersAtaması.** Yabil'de blok deseni dersin kimliğine gömülü olduğu için "İngilizce" 5 ayrı kayıt olmuş (model hatası). Bizde: `Ders` (kimlik), `DersAtamasi` (şube/grup × ders: haftalıkSaat + blokDeseni [toplamı = HDS doğrulaması] + bölünebilir/birleştirilebilir bayrakları).
2. **Atomik birim şube değil, öğrenci grubu.** Alan/dal (meslek), seçmeli kümeler (Anadolu), kız/erkek (İHL) aynı soyutlamanın örnekleri. Kural: aynı öğrenci aynı anda iki yerde olamaz. FET'in years/groups/subgroups yapısının Türkçe giydirilmişi: şube → grup.
3. **Müsaitlik tek soyut yapı, her varlığa takılır** (öğretmen, şube/grup, ders, fiziki yer). Üç üründe simetrik ekranlarla doğrulandı. İncelik (Yabil): hücreler boolean değil kapasiteli olabilir ("bu dilimde bu dersten en fazla N saat").
4. **Zaman ızgarası şube bazlı** (okul geneli değil): ikili öğretim, açık lise akşam kullanımı, farklı giriş-çıkış saatleri (Kaşif sınıf ekranı, Yabil 14 saatlik çarşaf liste). Yemek arası ve rehberlik/kulüp gibi ortak kilitli dilimler ızgara modelinin parçası.
5. **Fiziki yer:** kapasite + uygunluk; zaman ataması ve mekân ataması ayrıştırılabilir iki faz (Yabil deseni). MVP'de mekân basit tutulur, kapı açık kalır.
6. **Öğretmen:** ad, branş (atama doğrulaması için), müsaitlik takvimi, günlük maksimum saat, sınıf öğretmenliği ve kulüp ilişkileri.
7. **Çoklu öğretmen:** bir derse birden fazla öğretmen atanabilir (Kaşif "dersi veren öğretmen sayısı").

## Kısıt katalogu (ilk sürüm — üç katman)

**A. Tutarlılık kuralları (çözücü öncesi doğrulama):**
- Şube toplam HDS ≤ ızgara kapasitesi; blok deseni toplamı = HDS; her atamanın öğretmeni var; öğretmen yükü ≤ müsait saat toplamı; branş-ders uyumu.
- Sektör standardı: üç üründe de var (Kaşif matematiksel imkansızlık uyarısı, Yabil test ekranı, TimetableMaster verification adımı). Fark fırsatımız: "Uygun/Uygun değil" yerine neden + öneri.

**B. Sert kısıtlar:**
- Öğretmen/şube/grup çakışmasızlığı; aynı öğrenci grubu aynı anda tek yerde.
- Müsaitlik (kapalı saat) ihlal edilemez — öğretmen, şube, ders, yer düzeyinde.
- Sabitlenen/çakılan atamalara dokunulmaz; kilitleme iki taneciklikte (blok, öğretmen programı tamamı).
- Blok deseni uygulanır (2+1+1 → bir gün 2 saat bitişik + iki ayrı gün 1'er).
- "Aynı anda olsun" eşzamanlılık (dal/grup dersleri paralel).
- Rehberlik saatine o şubenin sınıf öğretmeni girer.
- Tam gün dışarıda olma (staj/işletme günleri) — şube düzeyi tüm gün kapalı.

**C. Yumuşak kısıtlar / amaç fonksiyonu:**
- Karnıyarık (pencere) minimizasyonu — öğretmen mutluluğu çekirdek metriği.
- Öğretmen boş günü korunması.
- Aynı dersin oturumları farklı günlere; belirli ders çiftleri aynı güne/arka arkaya gelmesin.
- Ders-zaman tercihi (ağırlıklı uygunluk matrisi; kapasiteli hücreler).
- Ortak ↔ dal/grup dersi geçişi günde en fazla 1 (öğrenci mekik dokuması minimizasyonu) — öğrenci mutluluğu ekseni.
- Tek saatlik günleri azalt (Kaşif seçeneği).

## İş akışı ve UX desenleri

- **6 adımlı akış** (TimetableMaster): veri girişi → doğrulama → üretim → sürükle-bırak düzeltme + yeniden üretim → (devamsızlık) → paylaşım/çıktı. MVP iskeleti olarak benimsenecek (devamsızlık hariç).
- **Anytime çözücü davranışı** (Kaşif): ilerleme + canlı kalite metriği (karnıyarık sayacı) güven verir; ama iki fazlı optimizasyonun yönetimi kullanıcıya manuel ritüel olarak yıkılmamalı (Kaşif'in 15 dk + Esc prosedürü anti-örnek). Bizde: yerleştir + iyileştir tek akışta, zaman sınırıyla otomatik.
- **Bitiş ekranı = kalite karnesi:** "%100 yerleşti" yetmez; karnıyarık toplamı, ihlal edilen tercihler, öğretmen bazlı özet (Kaşif anti-örneği).
- **Kurallar tek görünümde:** Kaşif/Yabil'de kısıtlar arayüze dağılmış, kullanıcı toplamını göremiyor. Bizde tek "Kurallar" ekranı — tanılamanın doğal zemini.
- **Kendini açıklayan arayüz zorunlu:** emsallerin desteğe bağımlılığı ("önce yardım videosunu izleyin" yazısı, jargon: HDS/KY/Kpl/TGS, F-tuşu ezberi) gönüllü modelde kopyalanamaz.
- **Sürümleme/anlık görüntü** (Yabil dinamik arşiv): "dünkü denemeye dön" — düşük maliyet, gerçek ihtiyaç.
- **Resmi evrak formatı:** el programları sayı/tarih/tebliğ ifadesi/imza alanı taşır (Yabil çıktıları). PDF şablonları resmi yazışma düzenini desteklemeli. Yabancı araçların bilmediği yerellik farkı.
- Program yıl boyunca yaşar: öğretmen ayrılınca ders devri (Yabil "öğretmenler arası ders aktarma"), kilitle + kısmi yeniden çözüm bu senaryonun altyapısı.

## Kapsam kararları

**MVP'de VAR:** veri girişi (şube/grup, ders, öğretmen, atama), tutarlılık doğrulaması (nedenli), otomatik çözücü (sert + yumuşak, kalite karnesi), sabitleme + elle düzenleme + kısmi yeniden çözüm, çarşaf liste + el programı (PDF, resmi format) + makine-okunur dışa aktarım (Excel/CSV atama listesi — ek ders/KBS zincirinin girdisi), sürümleme.

**MVP'de YOK (İleride listesi, öncelik sırasıyla):**
1. e-Okul Excel dışa aktarımlarından içe alma (MVP+1'in bir numarası; veri girişi sürtünmesini öldürür — Bilsa kanıtı)
2. Vekil/görevlendirme yönetimi (günlük acı; TimetableMaster'ın en çok pazarladığı özellik)
3. Nöbet çizelgesi (dağıtımın tüketicisi; dışa aktarım veriyi taşımalı)
4. Öğrenci bazlı seçmeli grup OLUŞTURMA (ayrı optimizasyon problemi; MVP'de gruplar veri olarak girilir)
5. Salt-okunur çevrimiçi yayınlama (bilinçli feragat: MVP'de paylaşım = çıktı/dışa aktarma; gerekçe: veri-yerel mimari + okul kültüründe basılı çıktı normu)
6. Doğal dilli asistan ("10-A'nın matematiğini salıya taşı")

## Performans referansı
Kaşif: 43 şube, 86 öğretmen, tüm öğretmenlere boş gün → 18 dk 29 sn; karnıyarık 324 → 109 (86 öğretmen). Hafta 2'deki tarayıcı-yerel çözücü fizibilite testinin kıyas noktası.

## Açık sorular
1. Kullanıcının okul türü (meslek/Anadolu/İHL?) → grup modelinin MVP derinliği.
2. Tarayıcıda CP-SAT sınıfı çözücünün bu ölçekte performansı (Hafta 2 deneyi).
3. Kod içi adlandırma dili (eğilim: Türkçe alan terimleri).
4. e-Okul içe alma MVP'ye mi MVP+1'e mi?
