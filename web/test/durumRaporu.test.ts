/**
 * durumRaporu.ts testleri (Karar 29). taslak.test.ts / cizelge.test.ts deseni:
 * React yok, çözücü yok — saf metin ve sıralama mantığı doğrudan sınanır.
 *
 * Fixture, docs/gercek-okul-bulgulari.md'deki gerçek bulgunun KÜÇÜLTÜLMÜŞ
 * karşılığıdır: bir öğretmenin yükü kapasitesine tam eşittir (%100 doluluk).
 * Gerçek veri kullanılmaz (Karar 11).
 */
import { describe, expect, it } from "vitest";
import { varsayilanIzgara, varsayilanKuralAyarlari } from "../src/model.js";
import type { Okul, Ogretmen } from "../src/model.js";
import {
  enDoluOgretmenlerMetni,
  ogretmenDoluluklari,
  sureYetmediMesaji,
} from "../src/durumRaporu.js";

/** Izgara 5x8 = 40 dilim; B3 rezervi 8 dilim (muaf olmayanda). */
function ogretmen(
  ad: string,
  kapaliGunler: number[] = [],
  dersler: string[] = ["Fizik"],
): Ogretmen {
  return {
    ad,
    verebilecegi_dersler: dersler,
    bos_gun_tercihi: null,
    kapanislar: kapaliGunler.map((gun) => ({
      gun,
      dilimler: [1, 2, 3, 4, 5, 6, 7, 8],
      neden: "DIS_OKUL" as const,
    })),
  };
}

function atama(ders: string, saat: number, ogretmenAdi: string) {
  return {
    ders,
    haftalik_saat: saat,
    blok_deseni: [saat],
    subeler: ["9-A"],
    ogretmenler: [ogretmenAdi],
    sabit_dilimler: null,
    birlestirilebilir: false,
  };
}

/**
 * Sıkı: 2 tam gün kapalı + B3 boş gün rezervi -> kapasite 40-16-8 = 16,
 * yük 16 => %100. Gevşek: kapanışsız -> kapasite 32, yük 8 => %25.
 */
function ornekOkul(): Okul {
  return {
    izgara: varsayilanIzgara(),
    dersler: [{ ad: "Fizik", kategori: "SAYISAL" }],
    ogretmenler: [ogretmen("Gevsek"), ogretmen("Sikisik", [1, 2])],
    subeler: [{ ad: "9-A", sinif_rehber_ogretmeni: null }],
    ders_atamalari: [atama("Fizik", 8, "Gevsek"), atama("Fizik", 16, "Sikisik")],
    kural_ayarlari: varsayilanKuralAyarlari(),
  };
}

describe("ogretmenDoluluklari", () => {
  it("yük/kapasite oranını hesaplar ve azalan sırada döndürür", () => {
    const doluluklar = ogretmenDoluluklari(ornekOkul());
    expect(doluluklar[0]?.ad).toBe("Sikisik");
    expect(doluluklar[0]).toMatchObject({ yuk: 16, kapasite: 16, oran: 1 });
    expect(doluluklar[1]).toMatchObject({ ad: "Gevsek", yuk: 8, kapasite: 32 });
  });

  it("ders atanmamış öğretmende oran 0'dır (bölme hatası vermez)", () => {
    const okul = ornekOkul();
    okul.ogretmenler.push(ogretmen("Bos"));
    const bos = ogretmenDoluluklari(okul).find((d) => d.ad === "Bos");
    expect(bos?.yuk).toBe(0);
    expect(bos?.oran).toBe(0);
  });
});

describe("enDoluOgretmenlerMetni", () => {
  it("yalnız %80 üstünü listeler ve %100'ü ayrıca işaretler", () => {
    const metin = enDoluOgretmenlerMetni(ornekOkul());
    expect(metin).toContain("Sikisik: 16 / 16 dilim (%100) — hiç boşluk yok");
    expect(metin).not.toContain("Gevsek");
  });

  it("kimse sıkışık değilse boş metin döner (gereksiz gürültü yok)", () => {
    const okul = ornekOkul();
    okul.ders_atamalari = [atama("Fizik", 8, "Gevsek")];
    okul.ogretmenler = [ogretmen("Gevsek")];
    expect(enDoluOgretmenlerMetni(okul)).toBe("");
  });
});

describe("sureYetmediMesaji — UNKNOWN artık sessiz değil", () => {
  it("çizelge bulunduysa kullanılabilirliğini söyler ve karnesizliği açıklar", () => {
    const metin = sureYetmediMesaji(ornekOkul(), true, 60);
    expect(metin).toContain("ÇİZELGE BULUNDU");
    expect(metin).toContain("60 sn");
    expect(metin).toContain("kural ihlali içermiyor");
  });

  it("çizelge bulunamadıysa bunun 'çözüm yok' OLMADIĞINI açıkça söyler", () => {
    const metin = sureYetmediMesaji(ornekOkul(), false, 60);
    expect(metin).toContain('"çözüm yok" demek DEĞİLDİR');
    expect(metin).toContain("Süre bütçesini artırın");
  });

  it("her iki hâlde de en sıkışık öğretmeni gösterir (nereye bakılacağı)", () => {
    for (const bulundu of [true, false]) {
      expect(sureYetmediMesaji(ornekOkul(), bulundu, 60)).toContain("Sikisik");
    }
  });

  it("bütçeyi mesaja gerçek değerinden yazar (sabit 60 varsayılmaz)", () => {
    expect(sureYetmediMesaji(ornekOkul(), false, 300)).toContain("300 sn");
  });
});
