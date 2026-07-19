/**
 * Vite yapılandırması (Karar 24 — kanıt ekranı iskeleti).
 *
 * or-tools-wasm notları:
 *   - optimizeDeps.exclude: paketin tarayıcı sürümü .wasm dosyalarını
 *     `new URL("../wasm/...", import.meta.url)` ile bulur; esbuild
 *     ön-paketlemesi bu göreli yolları koparır. Paket dışlanınca dev
 *     sunucusu dosyaları node_modules'ten olduğu gibi servis eder,
 *     üretim derlemesinde ise Rollup aynı deseni tanıyıp .wasm'ı
 *     asset olarak taşır.
 *   - worker.format "es": çözücü Web Worker içinde koşar (Karar 24) ve
 *     or-tools-wasm dinamik import kullanır; varsayılan "iife" biçimi
 *     worker içinde kod bölmeyi desteklemez.
 *   - server.fs.allow: örnek okul fixture'ı depo kökündeki deney/
 *     altından ?raw ile okunur; Vite'ın dosya erişim sınırı web/
 *     olduğundan üst dizine izin açılır.
 *   - COOP/COEP başlıkları ZORUNLU (19 Tem 2026 ölçümü): paketin
 *     tarayıcı yapıları (asyncify dahil) pthread'lidir ve açılışta
 *     kendi worker havuzunu kurup SharedArrayBuffer aktarır; başlıklar
 *     yoksa DataCloneError ile takılır. Karar 24'teki "tek işçi
 *     SAB ihtiyacını muhtemelen kaldırır" hipotezi bu ölçümle
 *     ÇÜRÜTÜLDÜ (ayrıntı: docs/wasm-duman-testi.md EK 2). Statik
 *     barındırma (GitHub Pages) için coi-serviceworker veya başlık
 *     destekleyen barındırıcı ayrı adımda değerlendirilecek.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const kok = dirname(fileURLToPath(import.meta.url));

const izolasyonBasliklari = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { exclude: ["or-tools-wasm"] },
  server: {
    fs: { allow: [resolve(kok, "..")] },
    headers: izolasyonBasliklari,
  },
  preview: { headers: izolasyonBasliklari },
  worker: { format: "es" },
  build: { target: "es2022" },
});
