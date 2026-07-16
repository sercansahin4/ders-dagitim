# web/ — tarayıcı-içi TypeScript gerçeklemesi

Aşama 3'ün (veri-yerel mimari, Karar 20) TypeScript tarafı. Python
(`deney/`) **referans gerçeklemedir**; buradaki çeviri, her adımda
altın testlerle (Karar 22) Python'a bire bir eşitlenir:

- `deney/altin_uret.py` sabit fixture okulları üzerinde beklenen
  çıktıları `deney/veri/altin/` altına yazar.
- `npm test` (Vitest) aynı girdi dosyalarını okur ve TS çıktısının
  mesaj-mesaj, karakter-karakter eşit olmasını şart koşar.

Python tarafında A-katmanına dokunan her değişiklikten sonra
`python3 altin_uret.py` yeniden koşulmalı, iki taraf birlikte
commit'lenmelidir.

Kapsam durumu: veri modeli + JSON çevrimi + A-katmanı + kısıt modeli
(kisitlar.ts: B1-B8, C1-C8) + kademeli çözücü (coz.ts, `or-tools-wasm`,
tek işçi) çevrildi. Arayüz (Vite) sonraki adımda.

Çözücü eşdeğerliği iki bacaklıdır (Karar 23):
1. `npm test` — altın testler: kural-altkümeli fixture'larda iki geçişin
   OPTIMAL amaç değerleri Python'a eşit olmalı; ayrıca çözüm üreten her
   fixture için TS çözümü `deney/veri/altin/ts_cozumler/` altına yazılır.
2. `python3 ts_denetle.py` (deney/ içinden, npm test SONRASI) — TS
   çözümlerini çözücüden bağımsız denetler: sert kurallar + karne
   mutabakatı + kilit koruması.

Tam doğrulama akışı (herhangi bir tarafta davranış değişikliğinden sonra):

```
cd deney && python3 -m pytest -q     # Python referansı yeşil mi
python3 altin_uret.py                # altınları yenile (determinist)
cd ../web && npm install
npm run typecheck
npm test                             # altın testler + köprü dosyaları
cd ../deney && python3 ts_denetle.py # bağımsız denetçi
```
