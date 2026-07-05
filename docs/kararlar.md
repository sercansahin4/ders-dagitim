# Karar Kaydı — ders-dagitim

Bu belge projenin mimari ve süreç kararlarını gerekçeleriyle kaydeder.
Kurallar: yeni karar sona tarih ve gerekçeyle eklenir; eski karar
silinmez, gerekirse yeni bir kararla geçersiz kılındığı belirtilir.
Bilinçli feragatler (kabul edilen dezavantajlar) açıkça yazılır.

## 1. Açık kaynak + GitHub (Hafta 1)

Proje açık kaynak olacak ve GitHub'da barındırılacak.
Gerekçe: gönüllü sürdürülebilirlik, güven, katkıya açıklık.

## 2. Veri-yerel mimari hedefi (Hafta 1 — kısmen açık)

İşletme maliyeti ~0 hedefi: verinin hiç sunucuya gitmediği, tarayıcıda
çalışan mimari (statik barındırma; KVKK yükü yok). Çözücünün tarayıcıda
(WebAssembly) yeterli performansla çalışması AÇIK mühendislik sorusudur;
Hafta 2 deneyinin Aşama 3'üyle bağlanacak. B planı: karma yapı.

Güncelleme (3 Tem 2026): `or-tools-wasm` paketi (npm, Apache 2.0)
CP-SAT'ı TypeScript API ile tarayıcıya taşıyor; yol var ama topluluk
bakımında — risk notu Karar 10'da.

## 3. Çözücü: OR-Tools CP-SAT (Hafta 1)

Gerekçe: kısıt programlama problemine biçilmiş, açık kaynak, olgun,
unsat core desteği tanılama tezimizi mümkün kılıyor. Deterministik
oluşu "koşu-bekle-kıyasla" döngüsünü "kural değiştir → tek koşu →
karne kıyasla" akışına çevirir.

## 4. Kod içi adlandırma dili (Hafta 1'de AÇIK bırakıldı)

Karar 7 ile bağlandı — oraya bakınız.

## 5. Amaç fonksiyonu: iki katmanlı kademeli (lexicographic) optimizasyon (3 Tem 2026)

Üst katman {boş gün tercihi, öğretmen×şube günlük toplam, karnıyarık}
önce çözülüp kilitlenir; alt katman kalan serbestlikte iyileştirilir.
Gerekçe: kullanıcının "kabul edilebilir program" tanımı — alt katman
uğruna üst katman feda edilemez; düz ağırlıklı toplamda bu takas
sızabilir, kademeli yapıda yapısal olarak imkânsızdır.
Ayrıntı: kisit-envanteri.md §4-C.

## 6. Blok deseni: sırasız çoklu küme (3 Tem 2026)

Örn. `{2,2,1}`; gün ataması çözücünün karar değişkenidir.
Gerekçe: sıralı desen modeli (Kaşif) gün sırası değiştirmeyi
kullanıcıya manuel ritüel olarak yıkıyor; doğru modelde bu ritüel
ortadan kalkar. Ayrıntı: kisit-envanteri.md §2-3.

## 7. Kod içi adlandırma: karma model (3 Tem 2026)

Alan sözlüğü kavramları ASCII-Türkçe (`Ogretmen`, `DersAtamasi`,
`blok_deseni`, `karniyarik`); teknik altyapı ve genel programlama
kavramları İngilizce (`solve`, `validate`, `config`).
Gerekçe: (a) ürün tezi alan dilinin baştan Türkçe kurulmasıdır, kodun
kalbinde terk edilemez; (b) kullanıcı kodu okuyup yönetecek —
`karniyarik_cezasi` çeviri katmanı gerektirmez; (c) unsat core ve
karne mesajları Türkçe üretilecek — kod kavramı ile kullanıcı mesajı
aynı sözcük olunca kod↔mesaj çeviri tablosu ihtiyacı kalkar.
Unicode yerine ASCII: klavye/araç zinciri sürtünmesi.
Bilinçli feragat: Türkçe bilmeyen katkıcı dışarıda kalır; hedef
katkıcı profili zaten alan bilgisi gerektirdiğinden kabul edildi.
Ayrıntı: adlandirma.md. Karar 4'ü kapatır.

## 8. Lisans: GPL-3.0 (3 Tem 2026)

Gerekçe: rakip alan ticari satıcılardan oluşuyor; izinli lisans
(MIT/Apache) kodun kapalı ticari ürünlere gömülmesine izin verir —
gönüllü emeğin ticari mülke dönüşmesi kâr-amaçsız tezle çelişir.
Copyleft türev işleri açık tutmaya zorlar. AGPL değerlendirildi,
gerekli görülmedi: mimari istemci-taraflı, sunucu-servis açığı yok.
Bilinçli feragat: copyleft bazı kurumsal katkıcıları caydırabilir.

## 9. Depo çalışma adı: ders-dagitim (3 Tem 2026)

Nihai ürün adı pilot hazırlığında (Hafta 8) yeniden değerlendirilecek;
GitHub yeniden adlandırmada otomatik yönlendirme yaptığı için erteleme
maliyeti düşük. Erken ad cilalamasından bilinçli kaçınıldı.

## 10. Deney dili: Aşama 1-2 Python, Aşama 3 TypeScript / `or-tools-wasm` (3 Tem 2026)

Gerekçe: Aşama 1-2'nin asıl işi doğru modeli bulmak; Python API olgun,
unsat core mekanizması belgeli, iterasyon hızlı. Model doğrulanınca
TS çevirisi mekaniktir (paket Python API biçimini aynalıyor). B planı
senaryosunda Python kodu üretim çözücüsü olarak yaşar — hiçbir
senaryoda çöp değil.
Risk notu: `or-tools-wasm` topluluk paketi (tek bakımcı görünümlü,
Apache 2.0); terk edilirse fork ile sürdürme kapısı açık. Deneyde
doğrulanacak kritik bilinmez: unsat core / assumptions API'sinin
wasm katmanında erişilebilirliği.

## 11. Gerçek okul verisi hiçbir biçimde depoya girmez (4 Tem 2026)

Anonimleştirilmiş versiyon (okul_anonim.json) dahil. Gerekçe: depo
sahibi hesap gerçek ad taşıyor; okul kimliği dolaylı olarak bilinebilir
ve küçük kadroda "kod + branş + dış okul deseni" kombinasyonu kişiyi
fiilen tanımlar (tekil branşlar: müzik, görsel sanatlar vb.).
Depodaki kamusal veri: (a) tamamen uydurma küçük örnek okul,
(b) sentetik büyük okul üreteci. Gerçek okulun anonim versiyonu yalnız
yerel makinede, depo dışındaki ham veri klasöründe yaşar; deney kodu
onu depo dışı yoldan okur. .gitignore ikinci savunma hattı olarak
`okul_anonim*` kalıbını içerir.
Not: "veri cihazdan çıkmaz" tezini savunan projenin kendi verisi
konusunda kusursuz olması itibar gereğidir.

## 12. Pencere tanımı: varsayılanda tüm kapanışlar pencereyi böler;
bölmeyen nedenler parametrik (4 Tem 2026)

KuralAyarlari.pencereyi_bolmeyen_nedenler kümesi (varsayılan boş)
hangi kapanış nedenlerinin bekleme sayılacağını belirler. Gerekçe:
(a) bu okulun başat riski fizibilite — en gevşek yorum çözüm uzayını
daraltmaz; (b) "kapanışta öğretmen nerede?" sorusunun cevabı nedene
ve kişiye göre değişiyor (idari = dolu mesai, bekleme değil) — sabit
kural değil ayar gerektirir. Kör nokta telafisi: kalite karnesine
"kapanış bitişiğindeki bekleme dilimleri" bilgi satırı eklenir
(kısıt değil, rapor). Ayrıntı: cevrim-tablosu.md §0 ve §5.

## 13. İki modlu model kurulumu: hızlı / tanılama (4 Tem 2026)

Hızlı modda kapanışlar değişken budamasıdır (en ucuz). Budanan
değişken unsat core'da görünemeyeceğinden tanılama modunda
kapanışlar varsayım anahtarlı kısıt olarak modellenir. Akış:
hızlı çöz → UNSAT ise tanılama modunda yeniden kur → core çıkar.
Maliyet: çözümsüz durumda ikinci model kurulumu (bu ölçekte
önemsiz). Ayrıntı: cevrim-tablosu.md §4.

## 14. Gevşetme önerisi politikası + doğrulama döngüsü (4 Tem 2026)

Öneriler unsat core girdilerinden değil, core'da adı geçen
varlıkların bağlamından üretilir. Basamaklar: desen değişikliği →
yük devri → sabitleme/tercih (yalnız veri destekliyorsa) →
kişisel tercih kapanışı (çok-okul uyarısı yalnız çok-okullu
öğretmende) → idari kapanış (yalnız üst basamaklar doğrulanmış
çözüm vermediyse; saha gerçeği: idari kapanışlar zorunlu nedenlerle
konur). dışOkul ve boşGün asla önerilmez. Her aday hipotetik
uygulanıp hızlı modda yeniden çözülür; rapora yalnız çözüm açan
adaylar girer ("denendi" etiketi). Bu döngü, İleride #7
karşı-olgusal motorun MVP'ye sığan çekirdeğidir. Kapsam sınırı:
yalnız üretilen adaylar denenir, arama yapılmaz.

## Karar 15 — Tanılama öneri motoruna kural-muafiyeti aday sınıfı (5 Tem 2026)

**Karar:** Gevşetme öneri hiyerarşisi, veri değişikliklerinin (desen değişikliği,
yük devri, sabitleme/tercih gevşetme, kapanış gevşetme) ötesine genişletilecek:
**öğretmen-bazlı kural muafiyeti** yeni bir aday sınıfı olarak eklenecek. İlk
somut örnek: dış okul yükü nedeniyle boş günün yapısal olarak imkânsız olduğu
öğretmenler için B3'ün (boş gün garantisi) o öğretmene özel kapatılması önerisi.
Muafiyet adayları da diğer adaylar gibi yeniden-çöz doğrulamasından geçer.

**Gerekçe:** Mutasyon testi (dışOkul kapanışı senaryosu, "Deniz" vakası) mevcut
hiyerarşinin çıkmazını gösterdi: pazartesi–perşembe dış okulda olan bir öğretmen
için B3 tanım gereği sağlanamaz (bu okulda tek ders bile alsa cuma dolu; cuma
boş kalsa bu okulda hiç dersi yok). Mevcut aday sınıflarının hiçbiri doğrulanmış
öneri üretemedi ve rapor "hiçbir aday çözüm açmadı" ile kapandı — dürüst ama
eyleme dönük değil. Oysa KuralAyarlari veri modelinde mevcut ve kisit-envanteri
B4 için "gevşetilebilir ayar" ilkesini zaten kaydetmişti; kural parametreleri de
meşru gevşetme adaylarıdır.

**Kapsam ve zamanlama:** Uygulama Hafta 3–4 (çözücü çekirdeği). Hafta 2 geçme
kriterini etkilemez: teşhis anlamlıdır, eksik olan öneri katmanıdır.

**Açık alt soru (uygulamadan önce yanıtlanacak):** Muafiyet önerisinin uyarı
metni sahadaki yönetim pratiğine göre yazılacak — böyle bir öğretmen için okul
yönetimi bunu olağan durum mu, norm/görevlendirme düzeyinde çözülmesi gereken
anomali mi sayar?
