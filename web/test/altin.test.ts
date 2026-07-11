/**
 * Altın testler (Karar 22): TS gerçeklemesinin A-katmanı çıktısı,
 * Python referansının (deney/altin_uret.py) ürettiği beklenen mesaj
 * listeleriyle bire bir karşılaştırılır. Fixture girdileri ve beklenen
 * çıktılar depoda sabittir; bu test hiçbir şey üretmez, yalnız okur.
 *
 * Bir test kırıldıysa iki gerçekleme ayrışmıştır. Doğru akış: önce
 * hangi tarafın kasıtlı değiştiğine karar ver, iki tarafı eşitle,
 * python3 altin_uret.py ile altını yenile, birlikte commit'le.
 * Beklenen dosyayı elle düzenlemek yasaktır.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { aKatmaniDogrulama, okulYukleMetinden } from "../src/model.js";

const DENEY = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "deney");

const beklenen: Record<string, string[]> = JSON.parse(
  readFileSync(join(DENEY, "veri", "altin", "a_katmani_beklenen.json"), "utf-8"),
);

const girdiler = Object.keys(beklenen);

describe("A-katmanı altın eşdeğerliği (Python referansına karşı)", () => {
  it("beklenen dosyası boş değil ve temiz + hatalı fixture'lar birlikte var", () => {
    expect(girdiler.length).toBeGreaterThanOrEqual(10);
    const hataliSayisi = girdiler.filter((g) => beklenen[g]!.length > 0).length;
    expect(hataliSayisi).toBeGreaterThanOrEqual(8);
    expect(hataliSayisi).toBeLessThan(girdiler.length);
  });

  it.each(girdiler)("%s", (girdi) => {
    const okul = okulYukleMetinden(readFileSync(join(DENEY, girdi), "utf-8"));
    expect(aKatmaniDogrulama(okul)).toEqual(beklenen[girdi]);
  });
});
