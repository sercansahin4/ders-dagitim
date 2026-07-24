/**
 * Serileştirme altın testi (Karar 22): TS okulToDict çıktısı, Python
 * referansının (deney/serilestirme_altin_uret.py) ürettiği beklenen
 * sözlükle karşılaştırılır. Bu test hiçbir şey üretmez, yalnız okur.
 *
 * Kırılırsa iki gerçekleme ayrışmıştır: önce hangi tarafın kasıtlı
 * değiştiğine karar ver, iki tarafı eşitle, python3 serilestirme_altin_uret.py
 * ile altını yenile, birlikte commit'le. Beklenen dosyayı elle düzenlemek yasaktır.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { okulToDict, okulYukleMetinden } from "../src/model.js";

const DENEY = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "deney");

const beklenen = JSON.parse(
  readFileSync(join(DENEY, "veri", "altin", "okul_serilestirme_beklenen.json"), "utf-8"),
) as Record<string, unknown>;

describe("okul serileştirme altın eşdeğerliği (Python okul_to_dict'e karşı)", () => {
  it("okulToDict(ornek_okul), Python okul_to_dict altınına eşit", () => {
    const okul = okulYukleMetinden(
      readFileSync(join(DENEY, "veri", "ornek_okul.json"), "utf-8"),
    );
    expect(okulToDict(okul)).toEqual(beklenen);
  });
});
