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

Kapsam durumu: veri modeli + JSON çevrimi + A-katmanı çevrildi.
Çözücü (`or-tools-wasm`, tek işçi + sabit seed) ve arayüz (Vite)
sonraki adımlarda eklenecek.

```
npm install
npm test        # altın testler
npm run typecheck
```
