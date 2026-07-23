/**
 * Çizelge türetme birim testleri (Karar 27): cizelge.cizelgeSatirlariHazirla
 * SAF bir fonksiyondur; iki eksende (şube/öğretmen) blok yerleşimini, satır
 * listesini ve kaplı (colspan devamı) hücreleri elle kurulmuş küçük bir
 * okulla sınar. Python referansı YOKTUR (görünüm-only mantık) — bu yüzden
 * altın değil doğrudan birim testtir. Fikir, memory'deki "iki görünüm çapraz
 * doğrulama" alışkanlığının kod hâli: aynı yerleşim iki eksenden tutarlı
 * okunmalı.
 */
import { describe, expect, it } from "vitest";

import { varsayilanIzgara, varsayilanKuralAyarlari } from "../src/model.js";
import type { Ogretmen, Okul, Sube, Yerlesim } from "../src/model.js";
import { cizelgeAnahtar, cizelgeSatirlariHazirla } from "../src/cizelge.js";

function sb(ad: string): Sube {
  return { ad, sinif_rehber_ogretmeni: null };
}
function ogr(ad: string): Ogretmen {
  return { ad, verebilecegi_dersler: [], bos_gun_tercihi: null, kapanislar: [] };
}

// Küçük okul: 2 şube, 4 öğretmen (biri hiç ders vermez), 2 atama.
//  - Fizik: 9A, ÇOK-ÖĞRETMENLİ (Ali+Ayşe), 1 saat, (gün 1, dilim 1).
//  - Beden: 9A+9B BİRLEŞİK, Mehmet, 2 saatlik tek blok, (gün 2, dilim 3-4).
const okul: Okul = {
  izgara: varsayilanIzgara(),
  dersler: [
    { ad: "Fizik", kategori: "SAYISAL" },
    { ad: "Beden", kategori: "SANAT_SPOR" },
  ],
  ogretmenler: [
    ogr("Ali Veli"),
    ogr("Ayşe Kaya"),
    ogr("Mehmet Demir"),
    ogr("Boş Öğretmen"),
  ],
  subeler: [sb("9A"), sb("9B")],
  ders_atamalari: [
    {
      ders: "Fizik",
      haftalik_saat: 1,
      blok_deseni: [1],
      subeler: ["9A"],
      ogretmenler: ["Ali Veli", "Ayşe Kaya"],
      sabit_dilimler: null,
      birlestirilebilir: false,
    },
    {
      ders: "Beden",
      haftalik_saat: 2,
      blok_deseni: [2],
      subeler: ["9A", "9B"],
      ogretmenler: ["Mehmet Demir"],
      sabit_dilimler: null,
      birlestirilebilir: true,
    },
  ],
  kural_ayarlari: varsayilanKuralAyarlari(),
};

const yerlesim: Yerlesim = {
  girdiler: [
    { ders_atamasi_index: 0, gun: 1, baslangic_dilim: 1, sure: 1 },
    { ders_atamasi_index: 1, gun: 2, baslangic_dilim: 3, sure: 2 },
  ],
};

describe("cizelgeAnahtar", () => {
  it("varlık|gün|dilim biçiminde birleştirir", () => {
    expect(cizelgeAnahtar("9A", 1, 3)).toBe("9A|1|3");
  });
});

describe("cizelgeSatirlariHazirla — şube ekseni", () => {
  const v = cizelgeSatirlariHazirla(okul, yerlesim, "sube");

  it("satırlar tüm şubeler, veri sırasında", () => {
    expect(v.satirlar).toEqual(["9A", "9B"]);
  });

  it("çok-öğretmenli tek-saat ders 9A'da başlar ve iki öğretmeni de taşır", () => {
    const b = v.baslangiclar.get("9A|1|1");
    expect(b?.ders).toBe("Fizik");
    expect(b?.sure).toBe(1);
    expect(b?.ogretmenler).toEqual(["Ali Veli", "Ayşe Kaya"]);
    expect(b?.subeler).toEqual(["9A"]);
  });

  it("birleşik 2-saat blok her iki şubede başlar; devamı kaplı", () => {
    expect(v.baslangiclar.get("9A|2|3")?.ders).toBe("Beden");
    expect(v.baslangiclar.get("9B|2|3")?.ders).toBe("Beden");
    expect(v.baslangiclar.get("9A|2|3")?.sure).toBe(2);
    expect(v.kapli.has("9A|2|4")).toBe(true);
    expect(v.kapli.has("9B|2|4")).toBe(true);
  });

  it("yalnız başlangıçlar haritalanır; kaplı hücreler ayrı", () => {
    expect(v.baslangiclar.size).toBe(3); // 9A|1|1, 9A|2|3, 9B|2|3
    expect(v.kapli.size).toBe(2); // 9A|2|4, 9B|2|4
  });
});

describe("cizelgeSatirlariHazirla — öğretmen ekseni", () => {
  const v = cizelgeSatirlariHazirla(okul, yerlesim, "ogretmen");

  it("satırlar TÜM öğretmenler (boş haftalı dahil), veri sırasında", () => {
    expect(v.satirlar).toEqual([
      "Ali Veli",
      "Ayşe Kaya",
      "Mehmet Demir",
      "Boş Öğretmen",
    ]);
  });

  it("çok-öğretmenli ders her iki öğretmenin satırına düşer", () => {
    expect(v.baslangiclar.get("Ali Veli|1|1")?.ders).toBe("Fizik");
    expect(v.baslangiclar.get("Ayşe Kaya|1|1")?.ders).toBe("Fizik");
  });

  it("birleşik ders öğretmen satırında iki şubeyi de taşır; devamı kaplı", () => {
    const b = v.baslangiclar.get("Mehmet Demir|2|3");
    expect(b?.subeler).toEqual(["9A", "9B"]);
    expect(b?.sure).toBe(2);
    expect(v.kapli.has("Mehmet Demir|2|4")).toBe(true);
  });

  it("boş haftalı öğretmenin hiç bloğu yoktur (satırda ama yerleşimsiz)", () => {
    const bosBlokVar = [...v.baslangiclar.keys()].some((k) =>
      k.startsWith("Boş Öğretmen|"),
    );
    expect(bosBlokVar).toBe(false);
  });
});
