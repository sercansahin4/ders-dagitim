# wasm Duman Testi (Node) — Karar 20'nin Şartına İlk Cevaplar

Tarih: 10 Temmuz 2026 · Ortam: Node 22 + or-tools-wasm 0.9.1 (npm,
Apache-2.0), Linux sandbox · Yöntem: Python'da kurulan CP-SAT modelleri
`ExportToFile` ile serileştirilip wasm çözücüde AYNEN çözüldü (model
kodu porte edilmeden gerçek ölçüm — `CpSat.solve(Uint8Array)`).

## Sonuçlar

| Test | Sonuç |
|---|---|
| assumptions / unsat core (çözümsüz mikro model, tanılama modu) | ✅ ÇALIŞIYOR: INFEASIBLE 0,74 sn; `sufficient_assumptions_for_infeasibility` core'u döndü |
| Proto kestirmesi (Python model → wasm çözüm) | ✅ ÇALIŞIYOR: 4,5-7 MB modeller sorunsuz yüklendi |
| 43 şube fizibilite, wasm (tek işçi) | ⚠️ 35 sn'de UNKNOWN |
| 43 şube fizibilite, wasm ("8 işçi" + worker bridge) | ⚠️ 35 sn'de UNKNOWN — Node köprüsü aramayı paralelleştirmiyor |
| 43 şube fizibilite, native ÇOK işçi | OPTIMAL 9,2 sn |
| 43 şube fizibilite, native TEK işçi | 38 sn'de UNKNOWN |
| Gerçek okul (6 şube) fizibilite, native TEK işçi | OPTIMAL 29,5 sn (çok işçili ~6 sn → ~5× ceza) |

## Okuma

1. **Karar 10'un kritik bilinmezi KAPANDI (olumlu):** unsat core /
   assumptions API'si wasm katmanında erişilebilir. Tanılama tezi
   tarayıcıda yaşayabilir.
2. **wasm'ın kendi ek yükü felaket değil:** wasm tek-işçi ≈ native
   tek-işçi (ikisi de 43 şubede 35-38 sn'de çözemedi; fark gürültü
   düzeyinde). Asıl değişken iş parçacığı sayısı.
3. **Gerçek darboğaz paralellik:** CP-SAT'ın gücü paralel portföy
   aramasından geliyor. Tek işçide gerçek okul (6 şube!) bile 29,5 sn;
   43 şube dakikalar mertebesine uzayabilir (38 sn'de hâlâ yok).
4. **Node ölçümü tarayıcıyı temsil etmiyor olabilir:** paket, tarayıcıda
   COOP/COEP başlıklarıyla ÇOK İŞ PARÇACIKLI wasm vadediyor; Node
   köprüsü bunu sağlamadı. Nihai cevap gerçek tarayıcı testinde.
5. **Barındırma çıkarımı (yeni, önemli):** wasm thread'leri
   SharedArrayBuffer ister; o da COOP/COEP başlıkları ister. GitHub
   Pages özel başlık GÖNDEREMEZ — "statik barındırma ~0 maliyet" tezi
   için ya coi-serviceworker geçici çözümü ya da başlık destekleyen
   statik barındırıcı (Cloudflare Pages vb.) gerekir. Aşama 3'te
   çözülmeli.

## Karar 20'nin şartı için durum

- Şart (b) assumptions API: ✅ kapandı.
- Şart (a) iş parçacığı: ❌ Node'da kapanamadı; gerçek tarayıcıda
  (COOP/COEP'li sayfa + SharedArrayBuffer) test edilmeli. Kapanmazsa
  tek-işçi gerçekliği şudur: küçük okul ~30 sn (kabul edilebilir),
  büyük okul dakikalar (sınırda) → B planı (karma yapı) büyük okullar
  için devrede kalır.

## Yeniden üretim

Python tarafı: deney/ içinden model kur + `model.ExportToFile(yol)`.
Node tarafı: `CpSat.solve(new Uint8Array(readFileSync(yol)), {maxTimeInSeconds: N})`.

## EK — Gerçek tarayıcı sonuçları (11 Tem 2026, kullanıcının Mac'i, Chrome)

Ortam: deney/tarayici-testi kiti; crossOriginIsolated=true,
SharedArrayBuffer açık, 8 çekirdek.

| Test | Sonuç |
|---|---|
| assumptions (çözümsüz mikro, tanılama modu) | INFEASIBLE 0,3 sn, core boyutu 2 ✅ |
| 43 şube fizibilite, TEK işçi | **OPTIMAL 25,4 sn** ✅ |
| 43 şube fizibilite, 8 işçi | OPTIMAL 67,2 sn (tek işçiden YAVAŞ) |

Okuma:

1. **Karar 20'nin şartı (a) kapandı — beklenenden de iyi:** thread
   pazarlığına gerek bile kalmadı; modern bir istemcide TEK işçi,
   Kaşif-referans okulu 25 sn'de çözüyor (Kaşif: 18,5 dk). Sandbox'taki
   olumsuz tek-işçi ölçümleri sunucu CPU'sunun tek-çekirdek zayıflığını
   yansıtıyormuş; kullanıcı donanımı belirleyici ve lehte.
2. **Çok işçi wasm'da ters tepiyor** (67 sn > 25 sn): wasm pthread
   havuzunun ek yükü + verimlilik çekirdekleri muhtemel neden. Ürün
   varsayılanı tarayıcıda numSearchWorkers=1 olmalı; bu aynı zamanda
   determinizm gündemini de sadeleştirir (tek işçi + sabit seed,
   koşudan koşuya çok daha kararlı).
3. COOP/COEP barındırma sorusu yine geçerli (SharedArrayBuffer için)
   ama artık performans-kritik değil; tek işçi SAB'siz de çalışır —
   Aşama 3'te başlıksız (GitHub Pages) dağıtım yeniden değerlendirilebilir.
