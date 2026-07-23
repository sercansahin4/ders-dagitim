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

## EK 2: Vite paketleme doğrulaması (19 Tem 2026)

Ortam: Linux sandbox (arm64, zayıf tek çekirdek), headless Chromium 149,
Vite 7.3.6 + React 18 iskeleti (Karar 24, Adım 1). Yöntem: kanıt ekranı
Playwright ile uçtan uca sürüldü; sandbox'ın 45 sn komut sınırı yüzünden
örnek okulun süre bütçesi test tarafında (ağ katmanında, uygulama kodu
değişmeden) 6-8 sn'ye indirildi. Varsayılan bütçe 60 sn'dir (model.ts);
gerçek donanımda tam koşu süresi bütçe-güdümlüdür.

### Paketleme

- Rollup, or-tools-wasm'ın `new URL("../wasm/...", import.meta.url)`
  desenini tanıdı; .wasm dosyaları asset olarak doğru taşındı. Ek
  eklenti (vite-plugin-wasm vb.) GEREKMEDİ. Yeterli olan yapılandırma:
  `optimizeDeps.exclude: ["or-tools-wasm"]` (dev'de esbuild
  ön-paketlemesi göreli wasm yollarını koparıyor) + `worker.format:
  "es"` (çözücü worker'ı dinamik import kullanıyor).
- Bilinen bedel: loader TÜM runtime'ları (routing, mathopt, pdlp...)
  URL'lediği için dist ~156 MB; yalnız cp-sat gerekli. Budama ileride
  ayrı iş (ağdan yalnız istenen runtime iner; disk boyutu kozmetik).

### COOP/COEP bulgusu — Karar 24 hipotezi ÇÜRÜTÜLDÜ

- Hipotez "tek işçi (Karar 20) SharedArrayBuffer/COOP-COEP ihtiyacını
  muhtemelen kaldırır" idi. Ölçüm: paketin TARAYICI yapıları (asyncify
  dahil) pthread'li; açılışta numSearchWorkers'tan bağımsız kendi
  worker havuzunu kurup wasm belleğini (SAB) aktarıyor. Başlıksız
  sayfada `DataCloneError: SharedArrayBuffer transfer requires
  self.crossOriginIsolated` ile takılıyor — dev ve üretim paketinde
  aynen.
- Çözüm: COOP/COEP başlıkları vite.config.ts'e kalıcı eklendi (dev +
  preview). Statik barındırma (GitHub Pages başlık gönderemez) için
  seçenekler EK 1'deki gibi geçerli: coi-serviceworker veya başlık
  destekleyen barındırıcı (Cloudflare Pages). Ayrı adımda karara
  bağlanacak.

### Uçtan uca sonuçlar (başlıklarla)

| Mod | Sonuç |
|---|---|
| dev (5173) | OPTIMAL / Geçiş 2 FEASIBLE, kilit 0 (Python altını ile birebir), karne ekranda, konsol temiz |
| build + preview (4173) | Aynı davranış, aynı çıktı |
| Sayaç kanıtı | Çözüm sırasında sn sayacı akıyor → çözücü worker'da, arayüz donmuyor |
| Süre (8 sn bütçe) | worker-içi 8,1 sn (bütçeyi tüketiyor, beklenen); sayfa toplamı +0,3 sn yük |
| Testler | vitest 46/46 + tsc temiz; pytest 20/20 (deney/ dokunulmadı) |

Not: süre ölçümleri bütçe-güdümlü olduğundan donanım kıyası anlamlı
değil; anlamlı sayı, wasm+worker başlatma yükünün ~0,3 sn oluşu.

Güncelleme (aynı gün, ikinci oturum): budama YAPILDI (Karar 25 ön
koşulu). vite.config.ts'teki or-tools-budama eklentisi cp_sat dışı
runtime URL'lerini derlemede yer tutucuyla değiştirir: dist 156 MB ->
20 MB; en büyük dosya 12,0 MB (Cloudflare 25 MiB sınırının altında).
Budanmış paket headless Chromium'da uçtan uca yeniden doğrulandı
(OPTIMAL, kilit 0, konsol temiz). _headers dosyası (COOP/COEP)
public/ üzerinden dist köküne taşınıyor.

## EK 3: JSON yükleme akışı doğrulaması (23 Tem 2026)

Ortam: Linux sandbox (arm64), headless Chromium 149, üretim paketi
(vite build) + COOP/COEP başlıklı statik sunucu. Kanıt ekranı Adım 3
(dosya yükle -> veri özeti + A-katmanı -> worker'da çöz) Playwright
ile uçtan uca sürüldü; örnek okulun süre bütçesi test DOSYASINDA
6 sn'ye indirildi (uygulama kodu değişmeden).

| Senaryo | Sonuç |
|---|---|
| Bozuk JSON yükle | Türkçe "okunamadı" mesajı, çözüm başlamıyor |
| A-katmanı hatalı okul (atamada listede olmayan öğretmen) | Hata listesi ekranda, Çöz düğmesi kilitli |
| Geçerli dosya yükle -> Çöz | Özet doğru (3 şube / 9 öğretmen / 39 atama / 89 saat), OPTIMAL + Geçiş 2 FEASIBLE, kilit 0, çizelge tablosu çizildi |
| Örnek okul düğmesi | Aynı kanaldan akıyor; özet aynı, Çöz aktif |

Konsol temiz (tek 404 tarayıcının otomatik favicon isteği; sayfayla
ilgisiz). Testler: vitest 46/46 + tsc temiz.
