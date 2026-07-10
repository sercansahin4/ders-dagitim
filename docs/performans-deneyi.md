# Sentetik Büyük Okul Performans Deneyi

Tarih: 10 Temmuz 2026 · Durum: Hafta 2 kapanış deneyi · Amaç: veri-yerel
(tarayıcı) mimari kararının (kararlar.md #2) deney girdisi · Veri:
sentetik_uret.py (tamamen uydurma; Karar 11 gereği gerçek veri yok)

## Yöntem

Üreteç: parametrik, deterministik (seed=42), branş bazlı öğretmen havuzu,
şube başına 38 saatlik gerçekçi Anadolu lisesi ders tablosu, ~%25
öğretmende tam-gün dışOkul kapanışı, %60'ında boş gün tercihi. Bilinçli
sadelik: kapanışlar gevşek tutuldu — bu deney DARLIK değil ÖLÇEK ölçer
(darlık senaryosu gerçek okulda ayrıca doğrulandı). Her koşuda: A-katmanı
→ iki geçişli kademeli çözüm (C1-C8) → bağımsız denetçi → mutabakat.

Ortam: Linux sandbox (sunucu sınıfı CPU, çok çekirdek). Okul
bilgisayarları ve wasm için düzeltme payı aşağıda tartışılıyor.

## Sonuçlar

| Ölçek | Öğretmen | Atama | Kurulum | Geçiş 1 | Geçiş 2 | Sert ihlal | Mutabakat |
|---|---|---|---|---|---|---|---|
| 12 şube | 31 | 192 | 0,4 sn | 5,1 sn OPTIMAL | 6,9 sn FEASIBLE | 0 | ✓ |
| 24 şube | 51 | 384 | 0,9 sn | 9,8 sn OPTIMAL | 14,4 sn FEASIBLE | 0 | ✓ |
| 43 şube | 92 | 688 | 1,6 sn | 18,2 sn FEASIBLE (kilit 14) | 12,0 sn FEASIBLE | 0 | ✓ |
| 43 şube (36 sn G1) | 92 | 688 | 1,6 sn | 36,4 sn FEASIBLE (kilit 8) | 3,8 sn UNKNOWN* | 0 | ✓ |

\* Geçiş 2 süre yetmeyince tasarım gereği Geçiş 1 çözümüne düşer (kilit
yine sağlanır; çift yönlü kanal sayesinde ceza okumaları geçerli kalır).

Kıyas çizgisi: Kaşif, 43 şube / 86 öğretmende **18 dk 29 sn** (kullanıcı
ölçümü). Bizim toplam: **~32 sn** (30 sn bütçeyle, temiz ve denetlenmiş
çözüm) — kaba oran ~35×.

## Bulgular

1. **Kurulum ölçekleniyor** (0,4 → 1,6 sn): basla gün-indeksi
   düzeltmesinden sonra darboğaz değil. (Düzeltme öncesi (a,g,s) başına
   tam sözlük taraması 43 şubede kurulumu dakikalara taşıyordu —
   deneyin ilk somut kazancı bu refaktör oldu.)
2. **Sert katman + alt katman her ölçekte temiz:** 0 ihlal, mutabakat
   birebir, 43 şubede dahi çözüm ~30 sn içinde.
3. **Üst katmanın optimallik KANITI 43 şubede 36 sn'ye sığmıyor**
   (kilit 14 → 8'e indi, hâlâ FEASIBLE). Çözüm kalitesi süreyle artıyor;
   "iyi çözüm hızlı, en-iyi kanıtı pahalı" tipik CP-SAT davranışı.
4. **Süre bütçesi paylaşımı ölçekte önem kazanıyor:** %90/10 denemesinde
   Geçiş 2'ye 3,8 sn kaldı ve UNKNOWN'a düştü; %60/40 varsayılanı 43
   şubede dengeli.

## Mimari kararı #2 için değerlendirme

Lehte: Python/native CP-SAT bu ölçeği yarım dakikada çözüyor. wasm'ın
2-5× yavaşlık payıyla bile 1-3 dakikalık tarayıcı koşusu, 18,5 dakikalık
mevcut duruma karşı güçlü; "kural değiştir → tek koşu → karne" akışı
için yeterli.

İhtiyat (karar kesinleşmeden kapanması gerekenler):
- **wasm iş parçacığı sorusu:** native koşu çok çekirdek kullandı;
  tarayıcıda tek iş parçacığına düşülürse ceza 2-5× değil 5-10× olabilir.
- **unsat core / assumptions API'sinin wasm'da erişilebilirliği**
  (Karar 10'daki bilinen risk) hâlâ doğrulanmadı.
- Sunucu CPU'su okul bilgisayarından hızlıdır; okul donanımında pay
  bırakılmalı.

Öneri: veri-yerel mimari **ana plan olarak sürdürülür**; nihai
kesinleşme Aşama 3 başında küçük bir wasm duman testine (aynı 43 şube
sentetiği, tarayıcıda) bağlanır. B planı (karma yapı) canlı tutulur.
Karar kullanıcınındır (kararlar.md #2 güncellemesi).

## Yeniden üretim

```
python sentetik_uret.py 43 --seed 42 --kaydet /tmp/s43.json
python coz.py /tmp/s43.json
```
