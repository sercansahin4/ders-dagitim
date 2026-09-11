# Gerçek okul koşularından çıkan bulgular

Bu belge, kullanıcının kendi okulunun verisiyle yapılan koşulardan çıkan
ÖLÇÜM ve BULGULARI kalıcı kılar. **Veri buraya girmez** (Karar 11): okul
JSON'u yalnız `~/ders-dagitim-ham-veri/` altında yaşar. Buraya yalnız
sayılar, oranlar ve dersler yazılır; öğretmen kodları (O01…) zaten
anonimdir ve gerçek kişiye bağlanamaz.

**Neden bu belge var:** 10 Temmuz 2026'da yapılan koşular "bu okul 60 sn
varsayılan bütçenin altına inilmemesi gereken sınıfta" sonucuna varmıştı.
Bu bulgu depo dışında bir rapor dosyasında kaldı ve ürüne taşınmadı;
14 gün sonra aynı sorun canlı ekranda `UNKNOWN` olarak geri geldi
(Karar 29). Gerçek veri depoya giremez ama gerçek veriden ÖĞRENİLEN
girebilir — ve girmezse her oturum aynı duvara yeniden çarpar.

## Okulun profili (24 Tem 2026)

| Ölçü | Değer |
|---|---|
| Şube | 6 |
| Öğretmen | 12 |
| Ders | 39 |
| Ders ataması | 94 |
| Toplam yük | 240 saat/hafta |
| Izgara | 5 gün × 8 dilim = 40 dilim |

## Bulgu 1 — Şube ekseninde sıfır boşluk

Altı şubenin **altısı da 40/40 dolu**. Yani her şubenin her hücresi
dolmak zorunda: bu bir yerleştirme değil, tam örtme problemidir.

Karşılaştırma: `deney/sentetik_uret.py` şube başına 38 saat üretir ve
gerekçesini kendi kaynağında yazar — *"40 dilimlik ızgarada 2 dilim boş
kalır: çözüm uzayı tamamen kilitlenmesin diye bilinçli pay."* Yani
**Karar 20'nin 43 şube / 25,4 sn ölçümü kasten gevşetilmiş bir okulda
yapıldı.** Ölçüm yanlış değil, başka bir soruyu ölçüyor: büyüklük.
Gerçek okulun başat zorluğu büyüklük değil YOĞUNLUK.

MEB gerçeği: ortaöğretimde haftalık 40 ders saati normdur. Yani %100
doluluk patoloji değil, TİPİK durumdur. Performans kanıtımızın tipik
durumu kapsamaması ciddi bir boşluktur.

## Bulgu 2 — Yapısal kilit tek bir öğretmende

Doluluk = yük / kapasite; kapasite = 40 dilim − kapanışlar − (B3 muaf
değilse) garanti boş gün rezervi.

| Öğretmen | Yük | Kapasite | Doluluk |
|---|---|---|---|
| O06 | 16 | 16 | **%100** |
| O07 | 23 | 24 | %96 |
| O03 | 29 | 32 | %91 |
| O02 | 21 | 24 | %88 |
| O12 | 14 | 16 | %88 (B3 muaf) |
| *toplam* | *240* | *328* | *%73* |

O06'nın iki tam günü dış okul kapalı; B3 bir gün daha boş bırakmayı
garanti ediyor. Geriye iki gün, yani 16 dilim kalıyor ve yükü tam
16 saat. **Sıfır boşluk.** Toplam doluluk %73 iken bağlayıcı kısıt
tek bir öğretmendedir — ortalamalar bu problemi gizler.

Bu durum bir kullanıcı kararının sonucudur ve karar doğruydu: dördüncü
koşuda (10 Tem) O06'nın B3 muafiyeti kaldırıldı, çünkü boş günü kurallar
ihlal edilmeden verilebiliyordu. Ölçülen bedel: Geçiş 1, 8,8 sn'de
OPTIMAL'den ~38 sn'de yalnız FEASIBLE'a düştü. İnsani olarak doğru olan
karar, örneği kombinatoryal olarak köşeye sıkıştırdı.

## Bulgu 3 — A-katmanı sayılabilirliği denetler, çözülebilirliği değil

`kontrolOgretmenKapasitesi` `kapasite ≥ yük` arar; O06 için 16 ≥ 16
geçer ve A-katmanı **"0 sorun"** der. Doğru davranış, ama kullanıcıya
36 saniye beklemeden söylenebilecek bir şey söylenmiyor.

İleride adayı (Karar 22 gereği önce Python): A-katmanına HATA/UYARI
ayrımı. *"O06 yükü kapasitesine tam eşit (16/16) — çözüm bulunabilir ama
zor olacak, süre bütçesini artırmanız gerekebilir."*

## Bulgu 4 — İki gerçekleme farklı çözücü rejiminde koşuyor (AÇIK SORUN)

```
deney/*.py    : num_search_workers  -> HİÇ SET EDİLMİYOR (CP-SAT varsayılanı, çok işçi)
web/src/*.ts  : numSearchWorkers: 1 -> altı yerde (Karar 20, wasm ölçümü)
```

Sonuç: `docs/` ve ham-veri raporlarındaki BÜTÜN performans kanıtı çok
işçili native Python'da alındı; ürün tek işçili wasm'da koşuyor. "60 sn
yeter" sonucu ürüne taşınamaz.

Bu, Karar 22/23'ün eşdeğerlik disiplininde bir KAPSAM boşluğudur, bir
hata değil: altın testler iki tarafın AMAÇ DEĞERLERİNİ sabitler ve küçük
fixture'larda ikisi de OPTIMAL kanıtladığı için işçi sayısı sonucu
değiştirmez. Gerçek okulda değiştirir. **Performans eşdeğerliği hiç test
edilmiyor.**

Seçenekler (karar verilmedi): (1) Python'u da tek işçiye sabitlemek —
referans ürünle aynı rejime girer, ama deney koşuları yavaşlar;
(2) işçi sayısını KuralAyarlari'na taşımak — iki taraf aynı alanı okur;
(3) olduğu gibi bırakıp farkı belgelemek. Ayrı karar gerektirir.

## Ölçümler

| Ne | Rejim | Sonuç |
|---|---|---|
| Saf fizibilite (amaçsız, B1-B8) | tek işçi, native Linux | **OPTIMAL, 28,1 sn** |
| Kademeli Geçiş 1 (C1-C3) | tek işçi, wasm, 36 sn bütçe | **UNKNOWN** (hiç çözüm yok) |
| Kademeli Geçiş 1 | çok işçi, native, ~35 sn | FEASIBLE, C1=6 *(10 Tem)* |
| Kademeli Geçiş 1, %90 oran | çok işçi, native, 42 sn | C1=0 *(10 Tem)* |
| Kademeli Geçiş 1, O06 muaf | çok işçi, native | OPTIMAL, 8,8 sn *(10 Tem)* |

Okunuşu: **36 saniyelik Geçiş 1 bütçesi, amaç fonksiyonu olmadan bile
gereken sürenin altında.** Karar 29'un bütçe matematiği buradan çıktı.

Eksik ölçüm (yapılmalı, tarayıcıda): tek-işçi/wasm rejiminde ilk çözüm
kaç saniyede geliyor, OPTIMAL kanıtı hangi bütçede geliyor? Varsayılan
`sure_butcesi_saniye` bu ölçülmeden değiştirilmemelidir.

## Ölçüm protokolü — süre bütçesi (Karar 30 adayı)

Aranan iki sayı, ikisi de TOPLAM bütçe B cinsinden (varsayılan da o
birimde yazılır; Geçiş 1 zaten 0,6 × B alır, Karar 18):

- **B\*** : Geçiş 1'in ilk kez çizelge verdiği en küçük bütçe (FEASIBLE).
- **B\*\*** : Geçiş 1'in OPTIMAL kanıtladığı en küçük bütçe.

**Yöntem: ikili arama, doğrusal tarama değil.** Gerekçe: tek işçili
CP-SAT determinist (Karar 20) ve süre limiti tek yönlüdür — B çalışıyorsa
B+ de çalışır. Monotonluk ikili aramayı meşru kılar; aynı B'de tekrar
koşmaya gerek yoktur. Her koşu B saniye beklemek demek olduğundan koşu
sayısı doğrudan maliyettir.

| Sıra | B (sn) | Gerekçe |
|---|---|---|
| 1 | 300 | Üst çapa. Burada da UNKNOWN gelirse varsayılan-bütçe yolu ölüdür; iş A-katmanı uyarısına (Bulgu 3) döner. |
| 2 | 150 | Bilinen 60 (UNKNOWN) ile 300 arasını böler. |
| 3+ | ikili arama | Aralık ±25 sn'ye inince dur. |

**Ortam koşulu:** wasm'da süre limiti duvar saatidir; makine yükü sonucu
kaydırır. Şarja takılı (macOS pilde CPU kısar), tek sekme, başka ağır
uygulama kapalı. Yoksa ölçülen şey okul değil, makinedir.

Koşu kaydı (doldurulacak):

| B (sn) | durumUst | Ekrandaki süre | Geri düşüş? | Karne geldi mi | C1 / C2 / C3 |
|---|---|---|---|---|---|
| 60 | UNKNOWN | 37,2 | *(Karar 29 öncesi ölçüm)* | hayır | — |
| 60 | UNKNOWN | 47,6 | **evet — çizelge bulundu** | hayır (tasarım gereği) | — |
| 300 | FEASIBLE / Geçiş 2 FEASIBLE | 300,1 (bütçe tamamen tüketildi) | hayır | **evet** | 4 / 2 / 0 — kilit 312830 |
| 150 | UNKNOWN | 102,1 (geri düşüş erken bitirdi) | **evet — çizelge bulundu** | hayır (tasarım gereği) | — |
| 187 | FEASIBLE / Geçiş 2 FEASIBLE | 187,1 | hayır | **evet** | 4 / 5 / 0 — kilit 313445 |
| 225 | FEASIBLE / Geçiş 2 FEASIBLE | 225,1 | hayır | **evet** | 4 / 5 / 0 |
| 300 | FEASIBLE / Geçiş 2 FEASIBLE | 300,2 | hayır | **evet** | 4 / 5 / 0 |

Alt katman (9 Ağu B=300 koşusu): C4=0, C5=6, C6=28, C7=21, C8=97.

Son dört satır 11 Eyl 2026 koşularıdır (kullanıcının Mac'i, Chrome; tarayıcı
otomasyonu altında alındı — Bulgu 7'deki çekinceye bakınız). Alt katmanları:
B=187 ve B=225 birebir aynı (C4=0, C5=5, C6=29, C7=21, C8=127);
B=300 ise C4=0, C5=5, C6=29, C7=22, C8=124.

**B\* bugünkü koşullarda (150, 187] aralığına sıkıştırıldı:** 150'de Geçiş 1
çizelge veremedi (geri düşüş verdi), 187'de verdi; protokolün ±25 sn hedefi
sayısal olarak sağlandı. Ama Bulgu 7 bu sayının tekrarlanabilirliğini
tartışmalı kılıyor. **B\*\* > 300** artık iki bağımsız koşuda doğrulanmıştır.

### Bulgu 6 — B=300'de çözülüyor, ama HİÇBİR katman OPTIMAL kanıtlamıyor

B\* ≤ 300 kesinleşti: Geçiş 1, 180 sn'lik payıyla bir çözüm buldu, kilitledi,
Geçiş 2 kalan 120 sn'de alt katmanı iyileştirdi. Ürün ilk kez gerçek okulda
uçtan uca çalıştı — çizelge + karne.

Ama iki durum da **FEASIBLE**, OPTIMAL değil; toplam süre 300,1 yani bütçe
sonuna kadar tüketildi. Yani **B\*\* > 300** ve bu okulda karne "en iyi
çizelgenin dökümü" DEĞİL, "bulunabilen çizelgenin dökümü"dür. C değerleri
daha fazla süreyle düşebilir; ne kadar düşeceğini bilmiyoruz.

Bu, Karar 29'un dürüstlük ilkesinin doğal devamıdır ve arayüzde karşılığı
yoktur: ekran FEASIBLE ile OPTIMAL'i ayırt edilebilir biçimde söylemiyor.
İleride adayı.

**Kilit değerinin okunuşu.** `kilitDegeri`, üst katmanın (C1-C3) baskınlık
ağırlıklı amaç değeridir (`baskinlikAgirliklari`: her kuralın ağırlığı, alt
öncelikli kuralların ağırlıklı tavanı + 1). Yani tek bir sayıya kodlanmış
sözlüksel (C1, C2, C3) sıralamasıdır: **küçük = daha iyi.** 312830 ↔ (4, 2, 0).

Karşılaştırma kuralı: farklı bütçelerin C4-C8 değerleri ancak **kilit değeri
eşitse** adil karşılaştırılır. Kilit farklıysa Geçiş 2 başka bir kısıt altında
çalışmıştır.

### Ölçüm maliyeti üzerine not (İleride adayı)

Geçiş 1 OPTIMAL kanıtlayamadığı sürece her koşu bütçenin TAMAMINI tüketir;
bu yüzden B\*'ı ikili aramayla bulmak koşu başına B saniye demektir. Ucuzu
var: çözücüye çözüm geri çağırması takıp **ilk çözümün bulunduğu anı**
ölçmek. Tek koşuda kesin cevap verir. Ama `coz.ts` Python ikizidir
(Karar 22), enstrümantasyon iki tarafa birden gider — ayrı ve daha büyük bir
iştir. Bugünkü ölçüm ikili aramayla bitirilir.

### Bulgu 5 — native çapa kullanıcının makinesine taşınamaz

İkinci 60 sn koşusu (Karar 29 canlıda, kullanıcının Mac'i) fizibilite geri
düşüşünün ÇALIŞTIĞINI gösterdi: Geçiş 1 UNKNOWN döndü, geri düşüş sert
kurallara uyan bir çizelge buldu, ürün iki durumu da doğru dillendirdi.

Yan ürün olarak bir sayı çıktı. **Çıkarım, ölçüm değil** — ekran yalnız
toplam süreyi gösteriyor, iki evreyi ayrı ayrı değil:

```
toplam                       47,6 sn
− kademeliCoz (Geçiş 1, 0,6 × 60 = 36 sn bütçe; ilk koşuda 37,2 ölçüldü)
= fizibilite geri düşüşü   ≈ 10,4 sn
```

Yani amaç fonksiyonsuz saf fizibilite, kullanıcının Mac'inde wasm/tek
işçiyle **~10 saniyede** çözülüyor. Bu belgede çapa olarak kullanılan
**28,1 sn'lik native ölçüm, geliştirme sandbox'ında (kaynak sınırlı Linux)
alınmıştı** ve kullanıcının makinesinden ~2,7 kat yavaş çıkıyor.

Sonuç, Bulgu 4'ü genişletir: iki gerçekleme yalnız İŞÇİ SAYISI rejiminde
değil, DONANIM rejiminde de ayrışıyor. Ürün kararlarını besleyecek tek
geçerli ölçüm, kullanıcının makinesinde tarayıcıda alınandır; native
sayılar yön gösterir, eşik belirlemez.

Doğrudan sonucu: bu okulda darboğaz fizibilite değil, C1-C3 amaç
fonksiyonudur. 36 saniyenin ~10'u zaten yetiyor olmalıydı; kalan 26 saniye
amaç fonksiyonuna yetmiyor. B\* tahminini aşağı çeker.

**Varsayılan seçimi — ölçümden SONRA verilecek karar.** Varsayılanı B\*'a
eşitlemek yanlış olur: ölçüm tek okul, tek makine. Öneri B\* × ~1,5,
insan okunur bir sayıya yuvarlanmış, ve "bu sayı bir söz değil, bir
başlangıç noktasıdır; kol kullanıcıda" dürüst kaydıyla. Okul
büyüklüğünden formülle bütçe türetmek (atama sayısı × katsayı) N=1'den
genellemedir — "önce somut, sonra genelleme" gereği İleride'ye park.

**Dürüst çerçeve:** varsayılanı büyütmek aslında bir kullanılabilirlik
boşluğunu yamar — kullanıcı 300 sn'yi hiçbir geri bildirim almadan
bekler. Asıl çözüm ilerleme göstergesi / erken durdurmadır; ayrı ve daha
büyük bir iştir, bu ölçümle karıştırılmamalıdır.


## Bulgu 7 — aynı veri, aynı bütçe, farklı sonuç (ölçüm yönteminin sınırı)

9 Ağustos ve 11 Eylül'de AYNI okul, AYNI depo sürümü (main @ 9 Ağu), AYNI
makine ve AYNI B=300 bütçesiyle koşuldu. Sonuçlar farklı:

| Koşu | C1 / C2 / C3 | Kilit | Alt katman (C4..C8) |
|---|---|---|---|
| 9 Ağu | 4 / 2 / 0 | **312830** | 0 / 6 / 28 / 21 / 97 |
| 11 Eyl | 4 / 5 / 0 | **313445** | 0 / 5 / 29 / 22 / 124 |

Kilit küçük olan daha iyidir (Bulgu 6): 11 Eylül koşusu üst katmanda
9 Ağustos'takinden KÖTÜ bir noktada durdu.

**Veri farkı elenmiştir.** Tarayıcıdaki taslak (IndexedDB) ile
`~/ders-dagitim-ham-veri/okul_anonim.json` alan alan karşılaştırıldı: ders
atamaları, dersler, şubeler ve ızgara üzerinde aynı kanonikleştirmeyle
hesaplanan sağlama iki tarafta da 6143 karakter / [507650, 37803]; öğretmen
kapanışları, boş gün tercihleri ve kural_ayarlari birebir aynı. Taslakta
fazladan yalnız `sure_butcesi_saniye` (300) ve varsayılan alanlar var —
bunlar çözücü ayarı, model girdisi değil.

**Nedeni: süre limiti duvar saatidir.** Bu belgenin ortam koşulu notu zaten
uyarıyordu; şimdi sonucu ölçüldü. Karar 20'nin "tek işçi = determinizm
bonusu" ifadesi DETERMİNİST BİR LİMİT altında geçerlidir; duvar saati limiti
altında değildir. Makine hızı/yükü değişince CP-SAT arama ağacında başka bir
yerde durur.

**Ölçüm protokolüne etkisi.** Protokol ikili aramayı şöyle
meşrulaştırıyordu: "tek işçili CP-SAT determinist ve süre limiti tek
yönlüdür — B çalışıyorsa B+ de çalışır; aynı B'de tekrar koşmaya gerek
yoktur." Bu gerekçenin ikinci yarısı düşmüştür. FİZİBİLİTE için monotonluk
gözlemle hâlâ uyumlu (60 ve 150 başarısız; 187, 225, 300 başarılı), KALİTE
için değil. Tek koşuluk ikili arama, gürültüsü ölçülmemiş bir eşik verir.

**Çekince (dürüst kayıt).** 11 Eylül koşuları, sayfayı ~30 saniyede bir
yoklayan bir tarayıcı otomasyonuyla alındı; bu, protokolün "tek sekme, başka
ağır uygulama kapalı" koşulunu ihlal eder ve aynı makineden CPU çalar.
11 Eylül sonuçlarının 9 Ağustos'takinden kötü çıkması bununla tutarlıdır.
Yani Bulgu 7 iki şeyi birden gösteriyor: (a) sonuç ortam koşuluna gerçekten
duyarlı, (b) bu oturumun sayıları temiz koşulda alınmış sayılmaz —
9 Ağustos'un B=300 satırı daha temiz ölçümdür.

**Sonuç:** duvar saati eşiği kovalamak yanlış alettir. Doğru alet bu belgede
zaten yazılı (bkz. "Ölçüm maliyeti üzerine not"): çözücüye çözüm geri
çağırması takıp ilk çözümün bulunduğu anı ölçmek. Bulgu 7 onu "ucuz
seçenek" olmaktan çıkarıp tek güvenilir yol hâline getiriyor.

## Karar 30 adayı — güncellenmiş öneri (karar VERİLMEDİ)

Önceki öneri (B\* × ~1,5 → 240 sn) Bulgu 7'den ÖNCE yazılmıştı. Bulgu 7
sonrası öneri şudur; onaya sunulmadan uygulanmamalıdır:

1. **Varsayılanı 60 → 240 sn yap, GEÇİCİ etiketiyle.** 60, bu okulda
   yapısal olarak yetersiz (iki bağımsız koşuda UNKNOWN). 240, gözlenen
   eşiğin (150-187) üstünde makul bir pay bırakır. 300 yerine 240, çünkü
   Bulgu 6 gereği bütçe her başarılı koşuda TAMAMEN tüketilir; fazladan
   60 saniye ölçülebilir bir kalite getirmiyor, yalnızca bekletiyor.
2. **Sayıyı bir eşik gibi sunma.** Bulgu 7'den sonra "B\* şudur" demek
   yanıltıcıdır; varsayılan, gürültüsü ölçülmemiş bir dağılımın üstünde
   seçilmiş bir paydır. Ürün metni zaten doğru dili kullanıyor
   ("büyük veya sıkışık okullarda artırın").
3. **Asıl iş sabit değil, enstrümantasyon.** İlk çözüm anını ölçen geri
   çağırma + ilerleme göstergesi + iyileşme durunca erken durdurma; bunlar
   varsayılanı doğru seçmekten daha çok kazandırır ve Bulgu 6'nın "bütçe
   tamamen tüketiliyor" sorununu kökünden çözer. Ayrı karar(lar).

## Kabul testi kusur listesi (11 Eyl 2026, gerçek veriyle)

Aynı oturumda ürün bir yönetici gibi uçtan uca kullanıldı. GEÇENLER:
taslağın yedi hafta sonra IndexedDB'den geri yüklenmesi; A-katmanı kapısının
canlı çalışması (haftalık saat 1→3 yapılınca iki sorunu ayrı ayrı bildirip
Çöz'ü kilitledi); korumalı silme; Karar 29 geri düşüşünün HER İKİ kolu
(çizelge bulunamadı / bulundu); Karar 27'nin iki eksenli çizelgesi
(idareci O05 dahil 12 öğretmen satırı); 300 saniye boyunca donmayan arayüz.

Bulunan kusurlar, öncelik sırasıyla:

1. **Eski sonuç ekranda kalıyor.** Veri düzenlendikten sonra önceki koşunun
   durum raporu ve çizelgesi duruyor; "artık geçerli değil" uyarısı yok.
   Ürünün dürüstlük tezine doğrudan aykırı. Öneri: taslak değiştiğinde
   sonucu temizle veya "veri değişti — tekrar çözün" rozeti göster.
2. **İlerleme bilgisi yok.** Sayaç yalnız geçen süreyi gösteriyor; hangi
   geçişte olunduğu, çizelge bulunup bulunmadığı görünmüyor. Bulgu 6
   (bütçe tamamen tüketiliyor) bunu ağırlaştırıyor: kullanıcı 240-300 sn
   boyunca hiçbir geri bildirim almadan bekliyor.
3. **Türkçe sıralama yok.** Ekrandaki listelerde Ç ve İ, Z'den sonra
   sıralanıyor ("… Türk Kültür Medeniyet Tarihi, Çağdaş Türk ve Dünya
   Tarihi, İngilizce …"). Gerçek okulda Çiğdem/İsmail/Şule listenin dibine
   düşer. DİKKAT: serileştirmedeki `.sort()` Python `sorted()` altınına
   bağlıdır (model.ts serileştirme notu) ve DEĞİŞMEMELİDİR; yalnız görünüm
   katmanı `localeCompare("tr")` kullanmalı.
4. **Korumalı silme mesajı tekrar ediyor.** Ders adları atama başına
   listeleniyor ve şube yok: "Adabı Muaşeret, Adabı Muaşeret, Düşünme
   Eğitimi, Düşünme Eğitimi, …". "Adabı Muaşeret (9A, 9B)" daha okunur.
5. **Karar 12'nin telafisi karnede yok (doğrulanmalı).** cevrim-tablosu.md
   §5 karneye "kapanış bitişiğindeki bekleme dilimleri" bilgi satırını
   taahhüt ediyor; karnede "kapanış" sözcüğü hiç geçmiyor.
6. **Çizelge 40 sütun, yatay kaydırma gerekiyor (bilgi).** Duvara asılacak
   tek program çıktısı (Karar 27'de "İleride") bu gözlemle daha acil.

**Yanlış alarm (kayda geçsin).** Test sırasında O06'ya (16/16) İdari kapanış
eklendi, A-katmanı susunca "kapı imkânsız okulu geçiriyor" sanıldı. Yanlıştı:
`ogretmenKapasitesi` + `bosGunIcinRezerveEdilecekAcikDilim` okunduğunda,
kapanan dilimler kapasiteden düşerken B3 boş gün rezervinin de aynı kadar
küçüldüğü görüldü — kapanan gün zaten boş gün olarak ayrılacaktı. Kapasite
16'da kalıyor ve doğru kalıyor.
