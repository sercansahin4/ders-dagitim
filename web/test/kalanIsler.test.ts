/**
 * kalanIsler.ts testleri. En değerli test sonuncusudur: gruplandırmanın
 * A-katmanından hiçbir maddeyi DÜŞÜRMEDİĞİNİ ve hiçbir madde UYDURMADIĞINI
 * doğrular. Böylece "yeni kural yazılmadı" iddiası kodla bağlanmış olur.
 */
import { describe, expect, it } from "vitest";
import { aKatmaniDogrulama } from "../src/model.js";
import type { Okul } from "../src/model.js";
import { baslangicAdimlari, kalanIsler } from "../src/kalanIsler.js";
import { bosOkul, taslakReducer } from "../src/taslak.js";

/** Küçük ama A-katmanını gerçekten çalıştıran bir okul kurar. */
function kurulmusOkul(): Okul {
  let okul = bosOkul({
    gun_sayisi: 5,
    dilim_sayisi: 8,
    ogle_arasi_sonrasi_dilim: 5,
    ogle_arasi_bloklari_boler: false,
  });
  okul = taslakReducer(okul, { tip: "subeEkle", ad: "9-A" });
  okul = taslakReducer(okul, { tip: "dersEkle", ad: "Fizik", kategori: "SAYISAL" });
  okul = taslakReducer(okul, {
    tip: "dersEkle",
    ad: "Rehberlik",
    kategori: "REHBERLIK_DIGER",
  });
  okul = taslakReducer(okul, { tip: "ogretmenEkle", ad: "Ayşe" });
  okul = taslakReducer(okul, {
    tip: "ogretmenBrans",
    ogretmen: "Ayşe",
    dersler: ["Fizik", "Rehberlik"],
  });
  okul = taslakReducer(okul, {
    tip: "subeRehberOgretmeni",
    sube: "9-A",
    ogretmen: "Ayşe",
  });
  okul = taslakReducer(okul, {
    tip: "atamaEkle",
    atama: {
      ders: "Rehberlik",
      haftalik_saat: 1,
      blok_deseni: [1],
      subeler: ["9-A"],
      ogretmenler: ["Ayşe"],
      sabit_dilimler: null,
      birlestirilebilir: false,
    },
  });
  return okul;
}

describe("kalanIsler", () => {
  it("boş okulda başlangıç adımlarını gösterir, kapı sorunu yoktur", () => {
    const rapor = kalanIsler(bosOkul());
    expect(rapor.eksik.length).toBeGreaterThan(0);
    expect(rapor.eksik.join(" ")).toContain("şube");
    expect(rapor.celiskili).toHaveLength(0);
    // Boş okulun A-katmanı sorunu yoktur: başlangıç adımları kapıyı
    // ETKİLEMEZ (kural değil, yol göstericidir).
    expect(rapor.kapiSorunSayisi).toBe(0);
  });

  it("öğretmensiz atama EKSİK sayılır", () => {
    const okul = taslakReducer(kurulmusOkul(), {
      tip: "atamaEkle",
      atama: {
        ders: "Fizik",
        haftalik_saat: 2,
        blok_deseni: [2],
        subeler: ["9-A"],
        ogretmenler: [],
        sabit_dilimler: null,
        birlestirilebilir: false,
      },
    });
    const rapor = kalanIsler(okul);
    expect(rapor.eksik.join(" ")).toContain("hiç öğretmen atanmamış");
    expect(rapor.celiskili.join(" ")).not.toContain("hiç öğretmen atanmamış");
  });

  it("blok deseni tutmayan atama ÇELİŞKİLİ sayılır", () => {
    const okul = taslakReducer(kurulmusOkul(), {
      tip: "atamaSaat",
      atamaIndex: 0,
      saat: 3,
    });
    const rapor = kalanIsler(okul);
    expect(rapor.celiskili.join(" ")).toContain("blok deseni");
    expect(rapor.eksik.join(" ")).not.toContain("blok deseni");
  });

  it("gruplandırma A-katmanından madde düşürmez ve madde uydurmaz", () => {
    for (const okul of [kurulmusOkul(), bosOkul()]) {
      const bozuk = taslakReducer(okul, {
        tip: "atamaEkle",
        atama: {
          ders: "Fizik",
          haftalik_saat: 3,
          blok_deseni: [2],
          subeler: ["9-A"],
          ogretmenler: [],
          sabit_dilimler: null,
          birlestirilebilir: false,
        },
      });
      const rapor = kalanIsler(bozuk);
      const rehberlik = new Set(baslangicAdimlari(bozuk));
      const gruplanmis = [...rapor.eksik, ...rapor.celiskili].filter(
        (m) => !rehberlik.has(m),
      );
      const akatman = aKatmaniDogrulama(bozuk);
      expect(gruplanmis.length).toBe(akatman.length);
      expect(new Set(gruplanmis)).toEqual(new Set(akatman));
      expect(rapor.kapiSorunSayisi).toBe(akatman.length);
    }
  });
});
