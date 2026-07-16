/**
 * Karne + bağımsız denetçi altın testleri (Karar 22): karne.cezalariHesapla,
 * karneMetni ve coz.cozumDenetle SAF fonksiyonlardır; çıktıları Python
 * referansının ürettiği veri/altin/karne_beklenen.json ile BAYT-BAYT
 * karşılaştırılır (üretici: deney/karne_altin_uret.py).
 *
 * Fixture 1 (elyapimi_ihlaller) elle kurulmuş, bilerek bozuk bir
 * yerleşimdir: kapsam testi her C kuralının fiilen tetiklendiğini ayrıca
 * doğrular — altın "hepsi sıfır"a sessizce çürümesin diye.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { okulYukleMetinden, yerlesimYukleMetinden } from "../src/model.js";
import type { Okul, Yerlesim } from "../src/model.js";
import { cozumDenetle } from "../src/coz.js";
import {
  C_KURAL_SIRASI,
  cezalariHesapla,
  karneMetni,
  kuralToplamlari,
} from "../src/karne.js";

const ALTIN = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "deney",
  "veri",
  "altin",
);

const beklenen = JSON.parse(readFileSync(join(ALTIN, "karne_beklenen.json"), "utf-8"));

function oku(dosya: string): string {
  return readFileSync(join(ALTIN, "karne_girdiler", dosya), "utf-8");
}

const fixturelar: Record<string, { okul: Okul; yerlesim: Yerlesim }> = {
  elyapimi_ihlaller: {
    okul: okulYukleMetinden(oku("elyapimi_okul.json")),
    yerlesim: yerlesimYukleMetinden(oku("elyapimi_yerlesim.json")),
  },
  ornek_okul_cozum: {
    okul: okulYukleMetinden(
      readFileSync(
        join(ALTIN, "..", "ornek_okul.json"),
        "utf-8",
      ),
    ),
    yerlesim: yerlesimYukleMetinden(oku("ornek_okul_yerlesim.json")),
  },
};

describe("Karne + denetçi altın eşdeğerliği (Python referansına karşı)", () => {
  for (const [ad, { okul, yerlesim }] of Object.entries(fixturelar)) {
    const b = beklenen[ad];

    it(`${ad}: kural toplamları bire bir`, () => {
      const toplamlar = Object.fromEntries(kuralToplamlari(cezalariHesapla(okul, yerlesim)));
      expect(toplamlar).toEqual(b.kural_toplamlari);
    });

    it(`${ad}: satır açıklamaları bire bir (sıra dahil)`, () => {
      const dokum = cezalariHesapla(okul, yerlesim);
      const satirlar = Object.fromEntries(
        [...dokum.entries()].map(([kural, liste]) => [kural, liste.map((s) => s.aciklama)]),
      );
      expect(satirlar).toEqual(b.satirlar);
    });

    it(`${ad}: karne metni bayt-bayt aynı`, () => {
      expect(karneMetni(okul, cezalariHesapla(okul, yerlesim))).toBe(b.karne_metni);
    });

    it(`${ad}: bağımsız denetçi çıktısı bire bir (sıra dahil)`, () => {
      expect(cozumDenetle(okul, yerlesim)).toEqual(b.denetci);
    });
  }

  it("elyapimi kapsamı: her C kuralı fiilen tetikleniyor (altın çürümesin)", () => {
    const { okul, yerlesim } = fixturelar["elyapimi_ihlaller"]!;
    const toplamlar = kuralToplamlari(cezalariHesapla(okul, yerlesim));
    for (const kural of C_KURAL_SIRASI) {
      expect(toplamlar.get(kural), kural).toBeGreaterThan(0);
    }
    expect(cozumDenetle(okul, yerlesim).length).toBeGreaterThanOrEqual(5);
  });
});
