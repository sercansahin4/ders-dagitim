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

## 15. Tanılama öneri motoruna kural-muafiyeti aday sınıfı (5 Tem 2026)

Gevşetme öneri hiyerarşisi, veri değişikliklerinin (desen değişikliği,
yük devri, sabitleme/tercih gevşetme, kapanış gevşetme) ötesine
genişletilecek: öğretmen-bazlı kural muafiyeti yeni bir aday sınıfı
olarak eklenecek. İlk somut örnek: dış okul yükü nedeniyle boş günün
yapısal olarak imkânsız olduğu öğretmenler için B3'ün (boş gün
garantisi) o öğretmene özel kapatılması önerisi. Muafiyet adayları da
diğer adaylar gibi yeniden-çöz doğrulamasından geçer.

Gerekçe: Mutasyon testi (dışOkul kapanışı senaryosu, "Deniz" vakası)
mevcut hiyerarşinin çıkmazını gösterdi: pazartesi–perşembe dış okulda
olan bir öğretmen için B3 tanım gereği sağlanamaz (bu okulda tek ders
bile alsa cuma dolu; cuma boş kalsa bu okulda hiç dersi yok). Mevcut
aday sınıflarının hiçbiri doğrulanmış öneri üretemedi ve rapor
"hiçbir aday çözüm açmadı" ile kapandı — dürüst ama eyleme dönük
değil. Oysa KuralAyarlari veri modelinde mevcut ve kisit-envanteri
B4 için "gevşetilebilir ayar" ilkesini zaten kaydetmişti; kural
parametreleri de meşru gevşetme adaylarıdır.

Kapsam ve zamanlama: uygulama Hafta 3–4 (çözücü çekirdeği). Hafta 2
geçme kriterini etkilemez: teşhis anlamlıdır, eksik olan öneri
katmanıdır.

Açık alt soru (uygulamadan önce yanıtlanacak): muafiyet önerisinin
uyarı metni sahadaki yönetim pratiğine göre yazılacak — böyle bir
öğretmen için okul yönetimi bunu olağan durum mu, norm/görevlendirme
düzeyinde çözülmesi gereken anomali mi sayar?

## 16. Veri modeli v0 donduruldu (kayıt: 5 Tem 2026; karar: 3 Tem 2026)

Varlıklar: Izgara, Ders, Ogretmen, Kapanis, Sube, DersAtamasi,
Yerlesim, KuralAyarlari (+ Okul kapsayıcısı). C9 deney v0 kapsamı
dışı; gunluk_maks_saat alanı yok (gerçek kural bulunamadı);
rehberlik = sıradan DersAtamasi + doğrulama kuralları.
Ayrıntı: docs/adlandirma.md çekirdek sözlüğü.
Not: karar 3 Temmuz'da alınmış, o gün yalnız proje talimatlarına
yazılmıştı; kanonik kayıt buraya taşındı.

## 17. B3 öğretmen muafiyeti — veri tarafı öne alındı (5 Tem 2026)

KuralAyarlari'na `b3_muaf_ogretmenler` alanı (öğretmen adı kümesi,
varsayılan boş) eklenir: kümede olan öğretmen için boş gün garantisi
(B3) kurulmaz; A-katmanı kapasite hesabında boş gün rezervi düşülmez;
bağımsız denetçi (cozum_denetle) B3 kontrolünde bu öğretmenleri atlar.

Gerekçe: İlk gerçek veri koşusu, Karar 15'in öngördüğü yapısal B3
imkânsızlığının kendi okulumuzda iki öğretmende (ağır dış okul yüklü
profil) fiilen var olduğunu gösterdi; yürürlükteki program da bu iki
öğretmende boş günsüz. Gerçek veriyle çözüm elde edebilmek için
muafiyetin VERİ tarafı (ayar alanı + kısıt atlaması) öne alındı.
Karar 15'in asıl gövdesi — tanılamanın bu muafiyeti doğrulanmış aday
olarak ÖNERMESİ — Hafta 3-4'te kalır; bugünkü haliyle muafiyet yalnız
elle ayarlanabilir.

Kapsam notu: Veri modeli v0 dondurması (Karar 16) ihlal edilmemiştir;
varlık setine dokunulmuyor, KuralAyarlari zaten parametrik ayar
taşıyıcısıdır (bkz. Karar 12 emsali).

Saha bulgusu (Karar 15'in açık alt sorusuna girdi): 12 öğretmenin
2'sinde muafiyet fiilen mevcut durum; uyarı metni "istisnai anomali"
değil "çok-okullu ağır yük profilinde bilinen durum" tonunda
yazılmalı. Nihai ifade kullanıcının saha yorumuyla kesinleşecek.
(11 Tem 2026: kullanıcı sahaya dönük uyarı cümlesinin tonunu onayladı;
açık soru kapandı, şablon bu tonla kalır.)

Güncelleme (10 Tem 2026): "iki öğretmen de muaf olmalı" varsayımı
fazlaymış. Karar 21'in yinelemeli teşhisi asgari muafiyet kümesinin
yalnız {O12} olduğunu kanıtladı; O06'nın boş günü kurallar ihlal
edilmeden verilebiliyor (üst katman maliyeti: 2 birim ek C2 aşımı).
Kullanıcı kararıyla veri dosyasında muafiyet yalnız O12'ye indirildi —
yürürlükteki elle yapılmış programda O06'nın boş günü yoktu; bunun
modelin değil o programın kısıtı olduğu ortaya çıktı. Ayrıntı:
ham-veri klasöründe rapor_dorduncu_kosu.txt.

## 18. C-katmanı uygulama kararları: baskınlık ağırlığı, <= kilit,
devirli süre bütçesi, çözüm anı ceza toplama (10 Tem 2026)

Karar 5'in (iki katmanlı kademeli amaç) uygulamasını bağlayan dört
karar; kod: kisitlar.py C-katmanı bölümü + coz.kademeli_coz + karne.py.

a) **Katman içi öncelik baskınlık ağırlığıyla sağlanır.** Bir kuralın
birim cezası, kendinden düşük öncelikli tüm kuralların ulaşabileceği
ağırlıklı toplam cezadan büyük seçilir; üstteki kuralın 1 birim
iyileşmesi alttakilerin hiçbir kombinasyonuyla takas edilemez.
Ağırlıklar elle sabitlenmez, her koşuda terimlerin üst sınırlarından
hesaplanır (okul büyüdükçe kendiliğinden ölçeklenir).
Bilinçli feragat / izlenecek risk: alt katmanda 5 kural iç içe
baskınlık gerektirdiğinden ağırlıklar hızla büyür (örnek okulda
~5×10^10). int64 sınırının çok altında; ancak sentetik büyük okul
deneyinde hem taşma payı hem çözüm hızına etkisi izlenecek.

b) **Kilit <= kısıtıyla konur, == ile değil.** Geçiş 2'de üst katman
ceza ifadesi "<=  Geçiş 1 değeri" kısıtına bağlanır: alt katman
iyileştirilirken üst katmanın tesadüfen daha da iyileşmesi serbesttir;
kötüleşmesi yapısal olarak imkânsızdır.

c) **Süre bütçesi %60 üst / %40 alt, devirli.** Toplam bütçe
(KuralAyarlari.sure_butcesi_saniye, varsayılan 60 sn) geçişlere
ust_katman_sure_orani ile bölünür; Geçiş 1 payını erken bitirirse
artan süre Geçiş 2'ye devreder. Geçiş 1 çözümü Geçiş 2'ye başlangıç
ipucu (hint) olarak verilir: Geçiş 2 süre yetmese bile en kötü
ihtimalle kilidi sağlayan hazır çözümle döner.

d) **Cezalar çözüm anında, etiketli değişkenlerden toplanır.** Her
ceza terimi modele kural+öğretmen+şube+gün etiketli değişken olarak
girer; karne dökümü bu değişkenlerden okunur. Bunun ön koşulu olarak
tüm ceza değişkenleri ÇİFT YÖNLÜ kanallıdır ("ceza=1 <=> ihlal var"):
yalnız alt sınırla bağlanan bir değişken, Geçiş 2'nin <= kilidi
altında gevşek kalıp fiili ihlalden büyük görünebilirdi. Bağımsız
denetçi ayağı: karne.py cezaları yalnız Okul+Yerlesim'den yeniden
hesaplar; kural bazında uyuşmazlık koşuyu geçersiz sayar (cozum_denetle
ilkesinin C-katmanına genişletilmesi).

Ek modelleme notları:
- C3/C6 bilinçli üst üste binme: 3 saatlik pencerenin dilimleri C6'nın
  dilim sayımına da girer (uzun pencere iki ölçekte de kötüdür);
  katmanlar ayrı optimize edildiğinden takas sızdırmaz.
- Rehberlik muafiyeti REHBERLIK_DIGER kategorisi üzerinden uygulanır
  (C2/C5); DIL kategorisi C7'den tamamen muaftır (kisit-envanteri §4-C).
- KuralAyarlari.kapali_kurallar kümesi bir C kuralını bütünüyle kapatır
  (terim kurulmaz, karne "KAPALI" gösterir); B4'ün "gevşetilebilir
  ayar" ilkesinin (kisit-envanteri) C-katmanındaki karşılığıdır.

## 19. Geliştirme tek kanaldan: aynı anda tek yapay zekâ oturumu
(10 Tem 2026)

Geliştirme Cowork oturumunda yürütülür; Claude Code eşzamanlı
KULLANILMAZ (tersi de geçerli: hangisi kullanılıyorsa o an tektir).

Gerekçe: 10 Temmuz'da aynı yerel klonda iki oturum (Cowork + Claude
Code) eşzamanlı çalıştı; sonuç dal sapması, rebase'te Karar 17 metni
çakışması ve iki oturumun birbirinin işini "paralel akış" diye
raporlaması oldu. Bu kez veri kaybı yaşanmadı; ancak iki oturumun
aynı dosyaya yazması sessiz kayıp üretebilirdi.

Yürürlükteki git sözleşmesi korunur: her oturumun ilk işi git pull
(GitHub web düzenlemeleri hâlâ mümkün olduğundan sapma riski sıfır
değildir); oturum sonunda iş commit'lenir ve push edilir -- bekleyen
lokal commit bırakılmaz.

## 20. Veri-yerel mimari ana plan olarak kesinleşti -- şartlı (10 Tem 2026)

Karar 2'nin açık bıraktığı performans sorusu sentetik büyük okul
deneyiyle yanıtlandı (docs/performans-deneyi.md): 43 şube / 92
öğretmen, native CP-SAT'ta ~32 sn'de temiz ve denetlenmiş çözüm
(Kaşif referansı: aynı boyutta 18 dk 29 sn). wasm'ın 2-5× yavaşlık
payıyla bile tarayıcı koşusu dakikalar mertebesinde kalır.

Karar: veri-yerel (tarayıcıda çözücü) mimari ANA PLANDIR. Nihai
kesinleşme Aşama 3 başındaki wasm duman testine bağlıdır; test iki
şeyi doğrulamalı: (a) tarayıcıda iş parçacığı kısıtının süreye etkisi
(native koşu çok çekirdek kullandı; tek iş parçacığında ceza 5-10×
olabilir), (b) unsat core / assumptions API'sinin wasm katmanında
erişilebilirliği (Karar 10'daki bilinen risk). İkisinden biri
sağlanamazsa B planı (karma yapı: yerel veri + sunucuda çözücü)
devreye girer; B planının Python çözücüsü zaten üretim kalitesinde
yaşıyor.

Bilinçli feragat: karar sunucu sınıfı CPU'da ölçülen sürelere
dayanıyor; okul donanımı payı wasm duman testinde ayrıca ölçülecek.

Güncelleme (11 Tem 2026): her iki şart da KAPANDI, veri-yerel mimari
KESİNLEŞTİ. (b) assumptions/unsat core wasm'da çalışıyor (Node +
tarayıcı doğrulaması); (a) gerçek tarayıcı testi (kullanıcının Mac'i):
43 şubelik sentetik okul TEK işçiyle 25,4 sn'de çözüldü — thread
gereksinimi bile kalmadı. Beklenmedik bulgu: 8 işçi wasm'da tek
işçiden yavaş (67 sn); tarayıcı varsayılanı numSearchWorkers=1
olacak. Ayrıntı: docs/wasm-duman-testi.md EK bölümü.

## 21. Muafiyet basamağında sınırlı yinelemeli teşhis (10 Tem 2026)

Karar 14'ün kapsam sınırı ("yalnız üretilen adaylar denenir, arama
yapılmaz") kural-muafiyeti basamağı (Karar 15) için SINIRLI biçimde
genişletildi: muafiyet kümesi hipotetik uygulanır; çözüm açılmazsa
aynı hipotetik okul yeniden teşhis edilir ve core'un yeni gösterdiği
B3 öğretmenleri kümeye eklenerek yeniden denenir (tavan 4 tur).

Gerekçe: unsat core MİNİMALDİR -- birden çok öğretmenin B3'ü aynı
anda imkânsızken core yalnız birini gösterebilir (çözümsüzlüğü
kanıtlamaya o yeter). Tekil muafiyet adayı bu yüzden doğrulamadan
geçemez ve motor 'hiçbir aday çözüm açmadı' ile kapanırdı; oysa kendi
okulumuzda muafiyet iki öğretmende BİRLİKTE gerekiyordu (Karar 17).
İki-öğretmenli uydurma ikiz vaka test_tanilama.py'de kalıcı testtir.

Kapsam sınırı korunur: yineleme yalnız muafiyet basamağında ve tavanlı;
diğer basamaklarda aday-listesi yaklaşımı değişmedi. Genel karşı-olgusal
arama hâlâ İleride #7'dir.

Onay (11 Tem 2026): ilke değişikliği kullanıcı tarafından okundu ve
açıkça onaylandı; Karar 18-22 kayıtlarının okunması da tamamlandı.

## 22. Çift gerçekleme disiplini: Python referans, TS altın testlerle eşitlenir (11 Tem 2026)

Aşama 3 (Karar 20) model mantığının TypeScript'te ikinci bir
gerçeklemesini zorunlu kılar. İki gerçeklemenin sessizce ayrışması
(drift) bundan sonraki en büyük teknik risk kabul edildi ve şu
disiplinle karşılanır:

- **Python (deney/) referans gerçeklemedir.** Davranış tanımı orada
  yaşar; TS (web/) çeviridir. Davranış değişikliği önce Python'da
  yapılır (veya iki tarafta birlikte), asla yalnız TS'te.
- **Altın testler:** deney/altin_uret.py sabit fixture okulları
  üzerinde beklenen çıktıları deney/veri/altin/ altına yazar; web/
  tarafında Vitest aynı girdi dosyalarından TS çıktısının bire bir
  eşitliğini şart koşar. Beklenen dosya elle düzenlenmez; yalnız
  altin_uret.py ile yenilenir ve iki taraf birlikte commit'lenir.
- **Eşitlik ölçütü mesaj metnidir (bilinçli katı):** kapasite/rezerv
  gibi sayısal hesaplar mesajın içinde geçtiğinden metin eşitliği hem
  mantığı hem kullanıcıya dönük Türkçe ifadeyi aynı anda doğrular.
  Bekçinin çalıştığı kasıtlı tek-karakter sapmayla doğrulandı
  (test kırıldı, geri alınca 15/15 yeşile döndü).
- **Kapsam kademeli genişler:** bugün A-katmanı (14 fixture, 8 kontrolün
  tamamı). Çözücü çevirisi geldiğinde ölçüt genişler: iki kademenin
  amaç değerleri eşit + TS çözümü Python bağımsız denetçisinden
  (karne.py) geçer. Güncelleme (12 Tem 2026): "amaç değerleri eşit"
  ölçütünün genel fixture'da uygulanamadığı ölçüldü; uygulanabilir
  biçimi Karar 23'tür (kural-altkümeli altınlar). Proto-düzeyi karşılaştırma bilinçli reddedildi:
  değişken/kısıt sıralaması farkı sahte alarm üretir, davranışsal
  eşdeğerlik ürünün umursadığı şeydir.
- **Araç seti asgari tutuldu:** web/ şimdilik yalnız TypeScript
  (strict) + Vitest. Vite arayüz faziyle, or-tools-wasm (0.9.1,
  tarayıcı testindeki sürüm) çözücü çevirisiyle eklenir. Arayüz
  çerçevesi kararı (React vs alternatifler) arayüz fazı başında ayrı
  bir karar kaydıyla verilecek.

## 23. Çözücü altınları: kural-altkümeli fixture yaklaşımı (12 Tem 2026)

Karar 22'nin çözücü ölçütü ("iki kademenin amaç değerleri eşit")
uygulamaya geçirilirken şu ölçüldü: baskınlık ağırlıkları (Karar 18)
tam kural kümesinde 1 -> ~10^10 aralığına yayılıyor ve CP-SAT'ın alt
sınır kanıtını pratikte imkânsızlaştırıyor -- Geçiş 2, 2 şubelik
sentetik okulda bile 25 sn'de OPTIMAL kanıtlayamıyor (bound negatif
kalıyor); örnek okulda 38 sn'de gap kapanmıyor. Bütçeyle kesilen
FEASIBLE'ın amaç değeri makineye/süreye bağlıdır; altın eşitlik yalnız
OPTIMAL'de tanımlıdır. Bu donanım sorunu değil, ağırlık şemasının
yapısal sonucudur.

Karar (kullanıcı onayı 12 Tem 2026): altın ölçüt kural-altkümeli
fixture'larla uygulanır; davranış değişikliği yoktur.

- **Tek-kural fixture'ları (8 adet):** her C kuralı için yalnız o kural
  açık (kapali_kurallar verisiyle; ağırlık=1) bir fixture. sabit_dilimler
  (B8) pinleri cezayı yapısal olarak zorlar ki altın değer 0 olmasın
  (C1=1, C2=1, C3=1, C4=1, C5=2, C6=3, C7=1, C8=7). İki geçiş de
  saniyeler içinde OPTIMAL kanıtlanır; amaç değerleri makineden
  bağımsız altındır.
- **ust_karma_pin:** C1+C2+C3 birlikte -- baskınlık ağırlığı HESABININ
  kendisi altın eşitliğe girer (kilit 17749).
- **tam_kurallar:** tüm kurallar açık; yalnız Geçiş 1 amacı (OPTIMAL
  kanıtlanabiliyor) altındır. Üretici bunun için kademeli_coz'a eklenen
  yalniz_gecis1 bayrağını kullanır (ürün akışında kullanılmaz).
  TS tarafı tam kademeli koşar; Geçiş 2 çözümü amaçla değil köprüyle
  denetlenir.
- **sabit_cakisma_unsat:** INFEASIBLE durum eşlemesinin tanığı.
- **Köprü (amaç eşitliğinin tamamlayıcısı):** npm test, çözüm üreten her
  fixture için TS çözümünü veri/altin/ts_cozumler/ altına yazar
  (.gitignore'da); deney/ts_denetle.py bu çözümleri çözücüden bağımsız
  denetler: sert kurallar (coz.cozum_denetle) + karne mutabakatı
  (kisitlar.ts <-> karne.py ikizi) + kilit koruması. Tam doğrulama =
  pytest + npm test + ts_denetle.py (akış web/README.md'de).
- **Üretici disiplini:** bütçe içinde OPTIMAL kanıtlanamayan fixture
  üretici hatasıdır (yüksek sesle durur); sessizce FEASIBLE altın
  yazmak yasaktır. Pin tasarımında simetri kırma etkileşimine dikkat:
  eşit uzunlukta blokların ilki son güne pinlenemez (tanılama motoru
  buldu; c1 bu yüzden tek bloklu Rehberlik'i pinler).

Bekçi kanıtı: kisitlar.ts'te kasıtlı tek-karakter sapma (C7 çift
eşiği 2->1) c7 altınını kırdı; geri alınca 12/12 yeşile döndü.

İleriye dönük seçenek (karar verilmedi, İleride adayı): katman içi
tek ağırlıklı geçiş yerine kural başına ardışık gerçek leksikografik
çözüm (8-9 küçük amaç) -- her adım OPTIMAL kanıtlanabilir olur, altın
eşitlik tam kural kümesine genişler ve ürün "kanıtlı en iyi" diyebilir.
Maliyeti: Python referansında davranış değişikliği + geçiş başına
bütçe yönetimi; ayrı karar kaydı gerektirir.

## 24. Arayüz çerçevesi: React + Vite + TypeScript strict (19 Tem 2026)
Arayüz fazı React 18 + Vite + TypeScript (strict) ile kurulur.
Gerekçe: kod yapay zekâ ile üretilip kullanıcı tarafından okunarak
yönetildiğinden belirleyici kriterler alışılmıştan farklıdır:
(a) yapay zekâ üretim kalitesi/tutarlılığı en yüksek çerçeve;
(b) en geniş gönüllü katkıcı havuzu; (c) API istikrarı (hooks
2019'dan beri kırıcı değişiklik yok). Değerlendirilen alternatifler:
Svelte (modeller 4/5 sözdizimini karıştırıyor, yakın tarihli kırıcı
sürüm geçmişi), Vue (iki API stili çıktı tutarsızlığı), saf TS
(form-ağır veri girişinde elle durum yönetimi = en hatalı üretim
türü). Bilinçli feragat: bağımlılık ağırlığı + JSX okuma yükü.
Sınırlar: durum yönetimi ve bileşen/UI kütüphanesi ŞİMDİ EKLENMEZ;
ihtiyaç kanıtlanırsa ayrı kararla gelir ("önce somut").
Teknik bağlayıcılar: çözücü Web Worker içinde koşar (arayüz donmaz);
tek işçi varsayılanı (Karar 20) SharedArrayBuffer/COOP-COEP
ihtiyacını muhtemelen kaldırır — iskeletin İLK doğrulama maddesidir
(statik barındırma yolunu açar).

## 25. Barındırma: Cloudflare Pages; ön koşul dist budaması (19 Tem 2026)
Üretim dağıtımı Cloudflare Pages üzerinden yapılır (_headers dosyasıyla
gerçek COOP/COEP; ücretsiz katman; GitHub'dan otomatik dağıtım).
Gerekçe: EK 2 bulgusu (wasm-duman-testi.md) COOP/COEP'i zorunlu kıldı;
GitHub Pages özel başlık gönderemez. coi-serviceworker alternatifi
reddedildi ama YEDEK YOL olarak saklanır: bozulma kipleri tarayıcıya
bağlı ve sessizdir (service worker kapalı gizli pencereler, kısıtlı
okul tarayıcıları) — "çözüm yok yerine neden göster" ilkesini savunan
ürünün altyapısı sessizce bozulmamalı. Hedef kitle bu riski büyütür.
ÖN KOŞUL: dist budaması. 156 MB'lık dist barındırıcıdan bağımsız ürün
sorunudur (okul internetinde kurulumsuz-tarayıcıdan tezini öldürür) ve
Cloudflare'in 25 MiB/dosya sınırına 25+ MB'lık gereksiz runtimelar
(mp_solver 33,0 MB, mathopt 28,9 MB) takılır. Ölçüm (19 Tem): cp-sat'ın
kendi dosyaları 7,4 MB + 12,0 MB — sınırın rahat altında; budama
sonrası tek dosya sınırı sorun değildir. Budama sonrası beklenmedik
biçimde 25 MiB aşılırsa yedek yol GH Pages + coi-serviceworker'dır.
KVKK/veri-yerel: barındırıcı yalnız statik dosya sunar; okul verisi
tarayıcıdan çıkmaz; mimari (Karar 2/20) değişmez.

Güncelleme (23 Tem 2026): dağıtım YAPILDI ve doğrulandı. Cloudflare'in
Git entegrasyonu projeyi klasik Pages yerine Workers statik varlık
altyapısıyla kurdu; _headers orada da işliyor (canlı sayfada
crossOriginIsolated=true ölçüldü). Canlı adres:
https://ders-dagitim.sercansahin4.workers.dev — örnek okul kullanıcı
donanımında uçtan uca çözüldü (OPTIMAL, kilit 0, karne + çizelge).
Kurulum notu: Root directory=web ayarı zorunlu (ilk deneme kökte
package.json bulamayıp düştü). Her push otomatik yeniden dağıtır.

## 25a. .gitignore: package-lock kuralı daraltıldı (19 Tem 2026)
Kök .gitignore'daki genel "package-lock.json" kuralı (tarayici-testi
için eklenmişti) deney/tarayici-testi/package-lock.json ile
sınırlandırıldı; web/package-lock.json depoya girer. Gerekçe: farklı
günlerde farklı yapay zekâ oturumları npm install çalıştırıyor; kilit
dosyası yoksa sürümler sessizce kayar (örnek: plugin-react 6'nın
vite 8 zorunluluğu ile vitest 3 çakışması elle sabitlendi — kilit
dosyası tam bu sınıf sorunu önler).

## 26. cloudflare/workers-autoconfig dalı reddedildi; depo-içi wrangler config-as-code İleride'ye park (23 Tem 2026)
Cloudflare'in Git entegrasyonunun otomatik açtığı cloudflare/workers-autoconfig
dalı SİLİNDİ (birleştirilmedi). Dal, main'in (ac3a8b4) tam üstünde tek commit
("Add Cloudflare Workers configuration"), sapmasız (0 geride). İçeriği:
web/wrangler.jsonc ekliyor (assets.not_found_handling=single-page-application,
compatibility_flags=[nodejs_compat], observability); @cloudflare/vite-plugin +
wrangler'ı devDependency yapıyor (web/package-lock.json +1081 satır — Karar 25a
gereği bu dosya depoya girdiğinden gerçek bir değişiklik); vite.config.ts
plugins dizisine cloudflare() ekliyor; deploy/preview script'lerini wrangler'a
çeviriyor.

Gerekçe (birleştirme yerine silme): Mevcut dağıtım (Karar 25 güncellemesi)
çalışıyor ve DOĞRULANMIŞ — Workers statik varlık, panodan Root=web, her push
otomatik, canlı sayfada crossOriginIsolated=true ölçüldü. Dal bu yolu
DOĞRULANMAMIŞ bir build-zinciri değişikliğiyle değiştiriyor: cloudflare()
eklentisi build hattına giriyor ve üç doğrulanmış özelliği riske atabilir —
(a) COOP/COEP (EK 2/wasm-duman-testi ile zorunlu), (b) dist budaması
(156→20 MB, Karar 25 ön koşulu, cp-sat-only), (c) or-tools Web Worker
yapılandırması (worker:{format:'es'}, Karar 24 teknik bağlayıcısı). Ek olarak
+2 ağır devDependency, Karar 24'ün "önce somut / durum-UI kütüphanesi şimdi
eklenmez / bağımlılık ağırlığı feragatı" çizgisine aykırı. Config-as-code
kazanımı (tekrarlanabilir altyapı, wrangler dev) gerçek ama MVP'de gerekli
değil.

Dürüst kayıt: Bir merge'in bu özellikleri KESİN bozacağı ölçülmedi; gerekçe
asimetrik risk — çalışan+doğrulanmış tek canlı demoyu, gerekmeyen bir kolaylık
için doğrulanmamış değişikliğe açmamak ("her aşamada çalışan bir şey"). Silme
güvenli: canlı dağıtım main + Root=web'den beslenir, bu daldan değil; silmek
üretimi etkilemez. Cloudflare ileride öneri dalını yeniden açabilir (zararsız;
yine silinir).

İleride (park; MVP sonrası bilinçli ele alınır): Depo-içi config-as-code
(wrangler.jsonc) şu doğrulama kapıları geçilerek benimsenebilir — (1) build
sonrası canlıda crossOriginIsolated=true korunuyor; (2) dist budaması hâlâ
cp-sat-only ve tek-dosya 25 MiB sınırının altında; (3) or-tools Web Worker
sorunsuz build ediyor; (4) headless tarayıcı testleri + canlı dağıtım yeşil.
Kurtarılabilirlik için dalın wrangler.jsonc içeriği (14 satır) aşağıda saklanır:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "ders-dagitim",
  "compatibility_date": "2026-07-23",
  "observability": { "enabled": true },
  "assets": { "not_found_handling": "single-page-application" },
  "compatibility_flags": ["nodejs_compat"]
}
```

## 27. Çizelge tablosu iki eksenli: Şube ⇄ Öğretmen (23 Tem 2026)
Çizelge ekranı tek (şube) eksen yerine İKİ eksende gösterilir; üstteki
sekmeyle şube-satırlı ve öğretmen-satırlı ızgara arasında geçilir. Model:
aynı `yerlesim`in iki referans çerçevesi (transpose) — bloklar değişmez,
yalnız hangi satıra düştükleri değişir. Bunu temiz kılan değişmez gözlem:
fizibıl çizelgede sert kısıtlar bir varlığı (öğretmen ya da şube) aynı anda
iki blokta yasakladığından her (varlık, gün, dilim) hücresinde EN ÇOK bir
blok başlar; bu yüzden tek bir colspan/kaplı makinesi iki eksende de çalışır.

Mimari: blok-türetme saf mantığı web/src/cizelge.ts'e çıkarıldı
(cizelgeSatirlariHazirla(okul, yerlesim, eksen)); CizelgeTablosu.tsx ince
görünüm katmanı olarak onu çağırır. Gerekçe: model/coz/karne deseni — mantık
saf ve React'sız olunca render çalıştırmadan doğrudan vitest'lenir
(test/cizelge.test.ts, 9 test: çok-öğretmenli atama iki öğretmen satırına,
birleşik atama her şube satırına düşüyor mu; 2-saat blok colspan+kaplı;
eksene göre hücre içeriği). Öğretmen görünümünde satırlar TÜM öğretmenlerdir
(boş haftalı idareci dahil) — ders atanmamış öğretmeni gözle yakalatır.

Kapsam (önce somut): bu adım "tüm satırlar + sekme" genel ızgarasıdır.
İleride: tek bir öğretmeni/şubeyi seçip yazdırılabilir tek program (duvara
asılan hâl) — ayrı ve değerli iş, ayrı kararla gelir. Hücre ipucu (title)
artık eksenden bağımsız ders + öğretmenler + şubeleri birlikte gösterir.
