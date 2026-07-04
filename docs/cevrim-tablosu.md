# Kısıt Katalogu → CP-SAT Çevrim Tablosu

Tarih: 4 Temmuz 2026 · Durum: donduruldu (Hafta 2) · Dayanak:
kisit-envanteri.md §4 · Bu belge `deney/kisitlar.py` ve `deney/coz.py`
modüllerinin haritasıdır; kod ile bu tablo arasında bire bir
izlenebilirlik hedeflenir (her kural = bir fonksiyon).

## 0. Temel karar değişkenleri

- **`basla[a, b, g, s]`** (BoolVar): a atamasının b bloğu, g günü
  s diliminde başlıyor. Her blok için geçerli (g, s) konumlarına
  birer anahtar; blok başına `ExactlyOne`.
- **`dolu[a, g, s]`**: a ataması o dilimde ders işliyor
  (= bloğun kapladığı dilimlere yayılım; B4 sayesinde eşitlik
  olarak bağlanır).
- **`calisiyor[t, g, s]`** / **`sube_dolu[c, g, s]`**: ilgili
  atamaların `dolu` toplamı.
- **`gun_bos[t, g]`** (BoolVar): açıksa o gün `Σ calisiyor = 0`.
- **`pencere[t, g, s]`**: o dilimde ders yok VE **pencereyi bölen**
  kapanış yok VE aynı gün öncesinde ders var VE sonrasında ders var
  (birikimli `var_oncesi`/`var_sonrasi` anahtarlarıyla).

**Pencere bölme parametresi (Karar 12):** varsayılan davranışta TÜM
kapanışlar pencereyi böler (en gevşek yorum). `KuralAyarlari.
pencereyi_bolmeyen_nedenler` kümesine eklenen nedenler (örn.
KISISEL_TERCIH) bekleme dilimi sayılır. Deney v0: boş küme.

**Simetri kırma:** desendeki özdeş bloklara (örn. {2,2,1}'in iki
2'liği) "gün sırası artan" kısıtı — arama uzayı küçülür, çözüm
kümesi değişmez.

## 1. Sert kurallar (B)

| # | Kural | CP-SAT ifadesi |
|---|---|---|
| B1 | Çakışmazlık | Her (t,g,s): `Σ dolu ≤ 1` öğretmenin atamaları üzerinden; aynı yapı her şube için |
| B2 | Kapanışlar | Kapalı dilime denk gelen `basla` anahtarları 0'a sabitlenir (arama uzayı budaması) |
| B3 | ≥1 tam boş gün | dışOkul kapanışı olmayan günler üzerinden `Σ gun_bos[t,·] ≥ 1` |
| B4 | Her blok ayrı güne | Her (a,g): `Σ_b Σ_s basla ≤ 1` |
| B5 | Rehberlik öğretmeni | Çözücü kısıtı değil: veri kurulumu + A-katmanı doğrulaması |
| B6 | Pencere ≥4 yasak | Her 4'lü ardışık dilim penceresi: `Σ pencere ≤ 3` (kayan pencere) |
| B7 | Eşzamanlı ortak ders | Kısıt gerekmez: çok-şubeli atamanın `dolu`su tüm bağlı şubelere sayılır (model bedava sağlar) |
| B8 | Sabitleme | İlgili `basla` anahtarı 1'e sabitlenir |

## 2. Yumuşak kurallar (C)

| # | Kural | CP-SAT ifadesi | Katman |
|---|---|---|---|
| C1 | Tercih edilen boş gün | Ceza: `1 − gun_bos[t, tercih(t)]` | Üst |
| C2 | Öğretmen×şube günlük toplam ≤3 | `asim ≥ Σ dolu − sınır`, `asim ≥ 0`; ceza `Σ asim` | Üst |
| C3 | 3'lük pencere | Ardışık 3 dilim üçlü-VE anahtarı; ceza toplamı | Üst |
| C4 | Tek saatlik gün | `tek[t,g] ⇔ Σ calisiyor = 1` (reified); ceza | Alt |
| C5 | Ardışıklık ≤2 (farklı atama zinciri) | 3 ardışık t×c dolu dilim VE tek blokla örtülmüyor → ceza | Alt |
| C6 | 1-2'lik pencere | `Σ pencere`, hafif ağırlık (C3 ile kısmi çift sayım ağırlıkça önemsiz; karnede not edilir) | Alt |
| C7 | Kategori ardışıklığı | Aynı kategoriden iki FARKLI atamanın ardışık dilimleri → ceza; DIL kategorisi muaf. Not: B4 sayesinde aynı atama otomatik muaf — blok içi muafiyet bedava | Alt |
| C8 | Ağır ders sabaha / sanat-spor sona | Doğrusal terim: kategori doluluğu × dilim ceza vektörü | Alt |

**Rehberlik muafiyeti:** rehberlik ataması C2 sayacına ve C5
zincirine dahil edilmez (rehberlik sabit haftalık görevdir, "aynı
sınıfa fazla girme" acısının parçası değildir). B1 çakışmazlıkta
elbette sayılır.

**C8 varsayılan vektörleri** (dilim 1→8):
- SAYISAL ceza: `[0,0,0,0,1,2,3,4]` (ilk 4 dilim ideal)
- SANAT_SPOR ceza: `[4,3,2,1,0,0,0,0]` (son 4 dilim ideal)
Kademeli artış "6. saat 8. saatten iyidir" bilgisini de taşır.

## 3. Katmanlama mekaniği (coz.py)

İki ardışık çözüm: (1) üst katman cezası minimize edilir → en iyi
değer U* kısıt olarak kilitlenir (`üst_ceza ≤ U*`), (2) alt katman
minimize edilir. Katman içi öncelik (C1 > C2 > C3) ağırlık ayrımıyla:
C1'in bir birimi, C2+C3'ün ulaşabileceği maksimum toplamdan büyük
seçilir — çözücü hiçbir C1 ihlalini alttakilerle takas edemez.

## 4. Unsat core mekaniği (tanilama.py)

Sert kısıt grupları varsayım (assumption) anahtarlarına bağlanır —
taneciklik: öğretmen başına B3, öğretmen başına B6, atama başına B4
vb. Çözümsüzlükte CP-SAT'ın döndürdüğü "birlikte imkânsız" varsayım
listesi, anahtar başına hazır Türkçe şablon cümleye çevrilir.
Gevşetme önerisi sırası: kisit-envanteri.md §5 hiyerarşisi
(desen → tercih/sabitleme → en son ve uyarılı müsaitlik;
DIS_OKUL nedenli kapanış asla önerilmez, KISISEL_TERCIH adaydır).
A-katmanı kuralları CP-SAT'a hiç gitmez: düz Python kontrolleri,
en ucuz teşhis.

## 5. Kalite karnesi bilgi satırları

Karar 12'nin telafisi: "kapanış bitişiğindeki bekleme dilimleri"
karneye bilgi satırı olarak yazılır (kısıt değil, rapor). Örn.
"T öğretmeni, Çarşamba: 2×1 saatlik pencere + kapanış bitişik
2 dilim". Böylece gevşek pencere tanımının kör noktası kullanıcıya
görünür kalır.

## 6. İlk gerçek çözümde doğrulanacaklar

- C2 varsayılanı (3) ve C5 varsayılanı (2) — kisit-envanteri.md
  açık soru 4
- B6'nın gerçek veride çözümsüzlük üretip üretmediği — açık soru 2;
  üretiyorsa tanılamanın ilk gerçek testi
- Rehberlik C2/C5 muafiyeti kullanıcı gözlemiyle teyit edilecek
