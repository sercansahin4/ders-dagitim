/**
 * Çözücü altın testleri (Karar 22 + Karar 23): TS gerçeklemesinin
 * kademeli çözüm çıktısı, Python referansının (deney/altin_uret.py
 * cozucu_uret) ürettiği beklenen değerlerle karşılaştırılır.
 *
 * Ölçüt (Karar 23):
 *   - Kural-altkümeli fixture'larda (gecis2_altin_mi=true) iki geçiş de
 *     OPTIMAL olmak ve amaç değerleri (kilit + alt katman cezası)
 *     Python'a eşit olmak zorundadır. OPTIMAL amaç değeri makineden
 *     bağımsızdır; eşitsizlik iki gerçeklemenin ayrıştığının kanıtıdır.
 *   - Tam-kurallı fixture'da yalnız Geçiş 1 (OPTIMAL kanıtlanabiliyor)
 *     karşılaştırılır; Geçiş 2 bütçeyle kesildiği için amaç değeri
 *     makineye bağlıdır ve altın DEĞİLDİR.
 *   - INFEASIBLE fixture durum eşlemesini test eder.
 *
 * Köprü: çözüm üreten her fixture için TS çözümü
 * deney/veri/altin/ts_cozumler/<ad>.json dosyasına yazılır; Python
 * tarafında `python3 ts_denetle.py` bu dosyaları çözücüden BAĞIMSIZ
 * kurallarla denetler (coz.cozum_denetle + karne mutabakatı + kilit
 * koruması). npm test tek başına yeterli değildir; tam doğrulama akışı
 * web/README.md'dedir.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { okulYukleMetinden } from "../src/model.js";
import { kademeliCoz } from "../src/coz.js";

const DENEY = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "deney");
const TS_COZUM_DIZINI = join(DENEY, "veri", "altin", "ts_cozumler");

interface CozucuBeklenen {
  girdi: string;
  acik_kurallar: string[];
  durum_ust: string;
  durum_alt: string | null;
  kilit_degeri: number | null;
  alt_katman_cezasi: number | null;
  gecis2_altin_mi: boolean;
}

const beklenen: Record<string, CozucuBeklenen> = JSON.parse(
  readFileSync(join(DENEY, "veri", "altin", "cozucu_beklenen.json"), "utf-8"),
);

const fixtureAdlari = Object.keys(beklenen);

describe("Çözücü altın eşdeğerliği (Python referansına karşı)", () => {
  it("beklenen dosyası tüm kuralları tek tek ve birlikte kapsıyor", () => {
    const tekKurallilar = fixtureAdlari.filter(
      (ad) => beklenen[ad]!.acik_kurallar.length === 1,
    );
    const kapsanan = new Set(tekKurallilar.map((ad) => beklenen[ad]!.acik_kurallar[0]));
    expect([...kapsanan].sort()).toEqual([
      "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8",
    ]);
    expect(fixtureAdlari.some((ad) => beklenen[ad]!.acik_kurallar.length === 8)).toBe(
      true,
    );
    expect(fixtureAdlari.some((ad) => beklenen[ad]!.durum_ust === "INFEASIBLE")).toBe(
      true,
    );
  });

  it.each(fixtureAdlari)(
    "%s",
    async (ad) => {
      const kayit = beklenen[ad]!;
      const okul = okulYukleMetinden(
        readFileSync(join(DENEY, kayit.girdi), "utf-8"),
      );
      const sonuc = await kademeliCoz(okul);

      expect(sonuc.durumUst).toBe(kayit.durum_ust);
      if (kayit.durum_ust === "INFEASIBLE") {
        expect(sonuc.yerlesim).toBeNull();
        return;
      }

      expect(sonuc.kilitDegeri).toBe(kayit.kilit_degeri);
      if (kayit.gecis2_altin_mi) {
        expect(sonuc.durumAlt).toBe(kayit.durum_alt);
        expect(sonuc.altKatmanCezasi).toBe(kayit.alt_katman_cezasi);
      } else {
        // Tam kural kümesi: Geçiş 2 bütçeyle kesilir, amaç altın değildir;
        // çözümün kendisi köprü üzerinden Python denetçisine gider.
        expect(["OPTIMAL", "FEASIBLE"]).toContain(sonuc.durumAlt);
      }

      // Köprü dosyası: Python'un bağımsız denetçisi (ts_denetle.py) için.
      expect(sonuc.yerlesim).not.toBeNull();
      mkdirSync(TS_COZUM_DIZINI, { recursive: true });
      writeFileSync(
        join(TS_COZUM_DIZINI, `${ad}.json`),
        JSON.stringify(
          {
            girdi: kayit.girdi,
            durum_ust: sonuc.durumUst,
            durum_alt: sonuc.durumAlt,
            kilit_degeri: sonuc.kilitDegeri,
            ust_katman_cezasi: sonuc.ustKatmanCezasi,
            alt_katman_cezasi: sonuc.altKatmanCezasi,
            kural_cezalari: Object.fromEntries(sonuc.kuralCezalari),
            yerlesim: sonuc.yerlesim,
          },
          null,
          2,
        ) + "\n",
        "utf-8",
      );
    },
    { timeout: 120_000 },
  );
});
