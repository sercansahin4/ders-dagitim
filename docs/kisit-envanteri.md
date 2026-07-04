# Kısıt Envanteri — Kullanıcının Okulu

Tarih: 3 Temmuz 2026 · Durum: Hafta 1 tamamlandı · Kaynak: dört bloklu kısıt envanteri görüşmesi (kullanıcı = okul yöneticisi/alan uzmanı) · İlişkili belge: emsal-analizi.md

## Amaç ve kullanım

Bu belge, kullanıcının okulunun gerçekliğinden çıkarılan veri modeli kararlarını ve kısıt katalogunu (v1) kaydeder. Emsal-analizi.md'deki katalog v0'ın sahada doğrulanmış, düzeltilmiş ve genişletilmiş halidir; v0'dan farklar §7'de izlenebilir. Hafta 2'nin (veri modeli + çözücü fizibilitesi) doğrudan girdisidir.

Yöntem hatırlatması: her bilgi üç seviyede işlendi (gerçek dünya → veri modeli → kısıt) ve kullanıcıya doğrulatıldı. SERT = ihlal edilemez; YUMUŞAK = amaç fonksiyonunda cezalı tercih.

## 1. Okul profili

| Başlık | Değer |
|---|---|
| Okul türü | Anadolu lisesi (tek program; Fen ayağı kapsam dışı bırakıldı) |
| Ölçek | 6 şube · 15 öğretmen · ~85 öğrenci |
| Izgara | 5 gün × 8 saat = 40 dilim/şube; tek öğretim; ortak giriş-çıkış |
| Öğle arası | 5. saatten sonra (5+3); **bloklara şeffaf** — 2'lik blok 5.+6. saat olabilir |
| Mekân | Fiilen kısıt yok (müzik sınıfı tek öğretmenle otomatik çakışmasız) |
| Dış okul ilişkisi | 4-5 öğretmen (~%30) başka okullarda da derste; tam gün veya **yarım gün** olabilir. Gelen öğretmen de var; iki yönde de mekanizma aynı: müsaitlik kapatma |
| Seçmeli | Bugün şube içi; **gelecek dönem** şubeler arası karma seçmeli ve eşzamanlı ortak ders (iki şube × aynı öğretmen × aynı an) bilinen ihtiyaç |

**Başat risk tespiti:** Bu ölçekte problem çözücü için kolaydır; asıl risk performans değil **fizibilite** (müsaitlik darlığı: dış okul günleri + zorunlu boş günler). Tanılama özelliği bu okulda hayati; ürün tezi kendi okulunda doğrulanmıştır.

## 2. Mevcut süreç (kıyas çizgisi)

| Başlık | Değer |
|---|---|
| Araç | Kaşif (~6.750 TL/yıl + KDV); yapan: okul yönetimi |
| Süre | Toplam 1-2 gün; veri girişi yalnızca 2-3 saat — asıl maliyet **koşu-bekle-kıyasla döngüsü** (çözücü defalarca çalıştırılıp sonuçlar elle karşılaştırılıyor) |
| Revizyon | Yılda 3-4 kez (öğretmen değişiklikleri) |
| Çözümsüzlükte yöntem | Deneme-yanılma → blok kombinasyonu değiştirme → (son çare) müsaitlik değişikliği. Müsaitlik değişikliği 2-3 okulu zincirleme etkiler; kaçınılır |
| Acı A | Çözümsüzlüğün nedeni ve çaresi bilinmiyor (teşhissiz uyarı) |
| Acı B | "1-2 değişiklikle daha iyi dağılım var mı?" bilinmiyor |
| Acı C | Aynı öğretmen aynı şubeye aynı gün arka arkaya 5 saate varan derse giriyor (farklı derslerle; mevcut araçların ders-bazlı kuralları yakalamıyor) |

**Kaşif'e dair yapısal gözlem:** "Blok deseni değiştirme" ritüeli (2+2+1 → 2+1+2) aslında aynı desenin gün sırasını değiştirmektir — çözücünün karar değişkeni olması gereken şey kullanıcıya manuel iş olarak yıkılmış. Doğru modelde (desen = sırasız çoklu küme) bu ritüel tamamen ortadan kalkar. Ayrıca Kaşif'in koşudan koşuya farklı sonuç vermesi sezgisel çözücü rastgeleliğidir; CP-SAT deterministiktir — "birkaç kez çalıştırıp iyisini seç" döngüsünün yerini "kural/ağırlık değiştir → tek koşu → karne kıyasla" alır.

## 3. Veri modeli kararları

1. **Müsaitlik: dilim düzeyinde nedenli kapanış.** "Dış okul günü" ayrı kavram değildir; her kapanış dilim taneciğinde tutulur ve bir **neden** taşır: `dışOkul | boşGün | idari | kişiselTercih`. Yarım günlük dış okul bu sayede doğru modellenir. Neden alanı tanılamada dokunulmazlık ayrımını (dışOkul → gevşetme önerilmez; kişiselTercih → aday) ve toplantı penceresi raporunun açıklamalarını besler.
2. **Blok deseni: sırasız çoklu küme** (örn. `{2,2,1}`). Gün ataması çözücünün işidir. Desen toplamı = HDS doğrulaması korunur (emsal bulgusu).
3. **`Ders.kategori`** alanı: `sayısal | sözel | dil | sanatSpor | rehberlikDiğer`. Kategori ardışıklığı cezasını ve "ağır ders" tanımını besler. Taksonomi: sayısal (mat, fizik, kimya, biyoloji), sözel (edebiyat, tarih, coğrafya, felsefe, din), dil (İngilizce, Almanca), sanat-spor (beden, müzik, görsel sanatlar).
4. **`Öğretmen.boşGünTercihi`** alanı (yumuşak kısıtı besler) + şube→sınıf rehber öğretmeni ilişkisi (rehberlik atamasını besler).
5. **Grup/birleştirme minimal ama modelde var:** `DersAtaması.birleştirilebilir` — tek atama birden fazla şubeye bağlanabilir (eşzamanlı ortak ders). Karma seçmeli için `grup` kavramı veri modelinde temsil edilir; MVP arayüzü derinleştirmez. Gerekçe spekülatif değil: gelecek dönemin bilinen ihtiyacı.
6. **Fiziki mekân MVP veri modelinde yok** (kapı açık: ileride `paylaşılanKaynak` etiketi ile eklenebilir).
7. **Izgara okul geneli tek yapı** (MVP arayüzü); veri modelinde şube-bazlı ızgaraya kapı açık (emsal bulgusu 4). Öğle arası dilim değil, dilimler arası **işarettir**; "öğle arası blokları böler mi?" okul-bağımlı **açık/kapalı ayar** (bu okulda: bölmez).
8. **Pencere (karnıyarık) tanımı:** öğretmenin aynı gün iki dersi arasındaki, dersi olmayan VE kapanışı olmayan dilimler. Kapanışlı dilimler (örn. öğleden sonra dış okul) bekleme sayılmaz.

## 4. Kısıt katalogu v1

### A. Tutarlılık kuralları (çözücü öncesi, nedenli mesajla)

- Şube toplam HDS ≤ 40; her atamanın öğretmeni var; branş-ders uyumu. *(v0'dan korundu)*
- Blok çoklu kümesi toplamı = HDS; blok sayısı ≤ 5 (her blok ayrı güne gideceği için). *(güncellendi)*
- Öğretmen atanabilir kapasitesi = toplam dilim − tüm kapanışlar − garanti edilecek 1 boş günün dilimleri ≥ atanmış yük. *(boş gün kuralıyla güncellendi — bu okulda çözümsüzlüğün muhtemel ana kaynağı)*
- Her ders için: dersi verebilecek öğretmen(ler)in müsait kapasitesi ≥ HDS. *(güçlendirildi)*
- Her şubenin sınıf rehber öğretmeni tanımlı ve rehberlik saati için müsait dilimi var. *(yeni)*

### B. Sert kısıtlar

| # | Kural | Kaynak |
|---|---|---|
| B1 | Öğretmen/şube/grup çakışmazlığı; aynı öğrenci grubu aynı anda tek yerde | v0 |
| B2 | Müsaitlik kapanışları ihlal edilemez | v0 |
| B3 | **Her öğretmene ≥1 tam boş gün:** o gün ne bu okulda dersi ne `dışOkul` kapanışı var | Blok 3 — v0'da yumuşaktı, SERT'e taşındı |
| B4 | Blok deseni uygulanır; **her blok ayrı bir güne** düşer | Blok 3 — "farklı günlere yayılım" v0'da yumuşaktı, SERT'e taşındı. Sertlik derecesi okul-bağımlı olabilir; varsayılan SERT, gevşetilebilir ayar |
| B5 | Rehberlik dersine o şubenin sınıf rehber öğretmeni girer | v0 doğrulandı (zaman kilidi değil, öğretmen ataması kısıtı) |
| B6 | **Hiçbir pencere ≥4 saat olamaz** | Blok 4 netleştirmesi — "kabul edilemez" beyanı; çözümsüzlükte tanılamanın gevşetme adayı |
| B7 | Eşzamanlı ortak ders: birleştirilmiş atama tüm bağlı şubelerde aynı dilimi doldurur | Blok 3 (kullanıldığında) |
| B8 | Sabitlenen atamalara dokunulmaz | v0 — altyapı MVP'de, arayüz önceliği düşük (bugün ihtiyaç yok) |

### C. Yumuşak kısıtlar — iki katmanlı kademeli (lexicographic) mimari

Kullanıcının "kabul edilebilir program" tanımı gereği amaç fonksiyonu düz ağırlıklı toplam değil, **iki ardışık optimizasyon**dur: önce üst katman çözülür ve değeri kilitlenir; alt katman kalan serbestlikte iyileştirilir. Alt katman uğruna üst katman asla kötüleştirilemez. **Kabul sınırı = üst katmanı sağlanmış program.**

**Üst katman** (katman içi öncelik sırasıyla):

| # | Kural | Not |
|---|---|---|
| C1 | Boş günün öğretmenin tercih ettiği gün olması | En yüksek öncelik |
| C2 | Öğretmen×şube **günlük toplam** sınırı (varsayılan ≤3, ayarlanabilir) | Acı C'nin birincil ilacı |
| C3 | 3 saatlik pencere cezası (yüksek) | Karnıyarığın üst-katman bileşeni; ≥4 zaten SERT (B6) |

**Alt katman** (katman içi öncelik sırasıyla):

| # | Kural | Not |
|---|---|---|
| C4 | Tek saatlik günlerin azaltılması | v0'dan |
| C5 | Öğretmen×şube **ardışıklık** sınırı (varsayılan ≤2 farklı-atama zinciri; blok içi muaf) | C2'nin artığını temizler |
| C6 | 1-2 saatlik pencerelerin hafif cezası | Azı yine iyidir; kabul sınırını etkilemez |
| C7 | **Kategori ardışıklığı cezası:** aynı şubede aynı kategoriden iki *farklı* ders ardışık dilimlere düşmesin (blok içi muaf; `dil` kategorisi tamamen muaf) | Yeni — öğrenci ekseni; emsallerde yok |
| C8 | Ağır dersler sabah dilimlerine, sanat-spor son saatlere (olabildiğince) | Öğrenci ekseni; düşük ağırlık, karnede izlenir |
| C9 | Ders-zaman tercihleri (ağırlıklı uygunluk matrisi) | İlk feda edilen — hem beyan hem fiili pratik örtüştü |
| C10 | Revizyon modunda: değişiklik minimizasyonu (yalnızca koruyucu modda aktif) | Blok 2 |

Ağırlık sıralaması kullanıcı beyanı: C1 > C2 > karnıyarık > C4 > C5 > C9; beyan ile fiili feda pratiği tutarlı bulundu. (Not: ilk teknik tahmin ardışıklığı günlük toplamın üstüne koymuştu; kullanıcı sıralaması daha tutarlı çıktı — günlük toplam sağlanınca uzun zincir zaten imkânsızlaşır.)

### Karnıyarık eşik tablosu (özet)

| Pencere uzunluğu | Muamele |
|---|---|
| 1-2 saat | Kabul; hafif ceza (C6, alt katman) |
| 3 saat | İstenmez; yüksek ceza (C3, üst katman) |
| ≥4 saat | Kabul edilemez; SERT (B6) |

Kaşif'in metriği (toplam pencere sayısı) ile doğrudan kıyaslanamaz; karne/kıyas ekranlarında belirtilmeli.

## 5. Tanılama tasarım girdileri

- Çözümsüzlükte **çelişen minimal kısıt kümesi** (CP-SAT unsat core) Türkçe, eyleme dönük cümleye çevrilir.
- Gevşetme önerilerinin sırası = sahadaki maliyet hiyerarşisi: (1) desen değişikliği önerileri, (2) tercih/sabitleme gevşetmeleri, (3) **en son ve uyarılı** müsaitlik — `dışOkul` nedenli kapanışlar hiç önerilmez, `kişiselTercih` nedenliler adaydır. Müsaitlik önerileri "çok-okul zinciri" uyarısı taşır.
- Kaşif'teki "blok kombinasyonu değiştirerek yeniden deneme" basamağı bizim modelde gevşetme değildir (çözücünün olağan arama alanı).
- Kalite karnesine **ceza kaynak dökümü**: toplam cezanın hangi kısıt/öğretmen/şubeden geldiği ("nereyi kurcalasam" sezgisi — tam karşı-olgusal öneri motorunun ucuz MVP tohumu).

## 6. MVP kapsam güncellemeleri (emsal-analizi.md kapsam kararlarına ek)

**Eklenen:**
- **Koşu kıyas görünümü:** sürümleme + kalite karnesi birleşimi; iki çözümün karneleri yan yana. Asıl işlevi kural setlerini karşılaştırmak (deterministik çözücüde koşular değil kurallar değişir). Revizyonda iki modun (koruyucu / serbest) kıyası da buradan yapılır; karar kullanıcının.
- **Revizyon iki modu:** koruyucu (C10 aktif) / serbest; kıyas görünümüyle sunulur.
- **Toplantı penceresi analizi** (karne bölümü): her gün×dilim için ±1 saat toleransla katılabilir öğretmen sayısı; en iyi 2-3 pencere + eksiklerin nedenli listesi ("X: dış okul, Y: boş gün"). Optimizasyon hedefi değil, yalnız rapor (kullanıcı kararı). Emsallerde yok.
- **Kalite karnesi bölümleri kesinleşti:** karnıyarık dökümü (eşik tablosuna göre), ihlal edilen tercihler, öğretmen bazlı özet, ceza kaynak dökümü, toplantı penceresi analizi.

**Güncellenen gerekçe:**
- e-Okul içe alma MVP+1 #1 olarak kalır ama bu okulun acısı değildir (veri girişi 2-3 saat); asıl kazanç koşu döngüsünün ortadan kalkmasındadır.
- Karşı-olgusal öneri motoru ("şunu gevşetirsen karne şöyle iyileşir") İleride listesine **#7** olarak eklendi; gerçek ihtiyaç kanıtlı, maliyeti MVP'ye sığmıyor.

**Kapsam dışı kesinleşen:** meslek alan/dal derinliği (okul türü sorusu kapandı), fiziki mekân, okul geneli kilitli dilim arayüzü, toplantı penceresi hedefli optimizasyonu.

## 7. Emsal katalogu (v0) değişiklik izi

| v0 maddesi | Değişiklik | Kaynak |
|---|---|---|
| "Öğretmen boş günü korunması" (yumuşak) | İkiye ayrıldı: ≥1 boş gün SERT (B3) + tercih günü YUMUŞAK (C1) | Blok 3 |
| "Aynı dersin oturumları farklı günlere" (yumuşak) | SERT'e taşındı (B4); okul-bağımlı ayar notu | Blok 3 netleştirme |
| "Rehberlik saatine sınıf öğretmeni girer" | Doğrulandı; zaman kilidi değil öğretmen ataması kısıtı olarak netleşti | Blok 1+3 |
| Karnıyarık = pencere sayısı minimizasyonu | Metrik yeniden tanımlandı: pencere **uzunluğu** eşikli (1-2 / 3 / ≥4) | Blok 4 netleştirme |
| "Belirli ders çiftleri aynı güne/arka arkaya gelmesin" | Kategori düzeyine genelleştirildi (C7) | Blok 4 |
| Blok deseni gösterimi (Kaşif "112" sıralı) | Model hatası tespit edildi; sırasız çoklu küme benimsendi | Blok 3 |
| "MVP'de mekân basit tutulur" | "MVP'de mekân yok, kapı açık" olarak keskinleşti | Blok 1 netleştirme |
| Kısmi yeniden çözüm senaryoları | Üç saha senaryosu kaydedildi: öğretmen ayrılması, dış okulun program değişikliği, yıl içi 3-4 revizyon | Blok 2-3 |
| **Yeni kısıtlar** | C2, C5 (öğretmen×şube sınırları), C7 (kategori ardışıklığı), B6 (pencere ≥4), C10 (değişiklik minimizasyonu) | Blok 2-4 |

## 8. Hafta 2 girdileri ve açık sorular

**Bağlayıcı notlar:**
1. Fizibilite deneyi **iki veri setiyle**: kullanıcının okulu (doğruluk + kısıt kapsaması) + sentetik büyük okul ~40+ şube / ~90 öğretmen (performans; tarayıcı-yerel mimari kararı **yalnızca** bununla verilir). Kaşif referansı: 43 şube / 86 öğretmen → 18 dk 29 sn.
2. Amaç fonksiyonu iki ardışık CP-SAT çözümü olarak kurulur (üst katmanı çöz → kilitle → alt katman).
3. Unsat core → Türkçe eylem cümlesi çevirisinin ilk prototipi Hafta 2 deneyine dahil edilmeli (en riskli ikinci parça).

**Açık sorular (güncel):**
1. Kod içi adlandırma dili (eğilim: Türkçe alan terimleri) — veri modeli haftasında karar. *(v0'dan devam)*
2. B6 (pencere ≥4 SERT) bu okulun verisinde çözümsüzlük üretiyor mu? Üretiyorsa tanılama çıktısının ilk gerçek testi olur.
3. Karma seçmeli / eşzamanlı ortak ders gelecek dönem netleşince grup modelinin arayüz derinliği.
4. C2/C5 varsayılan değerleri (3 ve 2) ilk gerçek çözümde doğrulanacak.

**Kapanan açık sorular:** okul türü (v0 #1) ✓ · e-Okul aciliyeti (v0 #4 — MVP+1'de kalır, gerekçe güncellendi) ✓
