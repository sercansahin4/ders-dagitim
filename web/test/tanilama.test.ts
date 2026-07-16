/**
 * Tanılama çevirisinin testleri — iki katman:
 *
 * 1. ALTIN (Karar 22): saf metin fonksiyonları (iyelik eki, gün listesi,
 *    çekirdek cümleleri, muafiyet metni) Python referansının ürettiği
 *    veri/altin/tanilama_beklenen.json ile bire bir karşılaştırılır.
 *    Kırılırsa: iki taraftan hangisinin kasıtlı değiştiğine karar ver,
 *    eşitle, python3 tanilama_altin_uret.py ile altını yenile.
 *
 * 2. DAVRANIŞ AYNASI: çözücüye bağlı akışlar (unsat core, öneri
 *    doğrulama, yinelemeli muafiyet) test_tanilama.py'deki Deniz ve
 *    çift-Deniz vakalarının aynısıyla sınanır. Bunlar altın DEĞİLDİR:
 *    core minimaldir ama tekil değildir; bayt sabitlemek yalancı
 *    kırmızı üretir. İki taraf aynı ÖZELLİKLERİ garanti eder.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import type { Okul } from "../src/model.js";
import { varsayilanIzgara, varsayilanKuralAyarlari } from "../src/model.js";
import type { VarsayimAnahtari } from "../src/kisitlar.js";
import { coz } from "../src/coz.js";
import {
  cekirdekCumleleri,
  gunleriMetneCevir,
  iyelikEki,
  muafiyetMetni,
  nedenOnerilmiyorBolumu,
  tanila,
  tanilamaModundaCoz,
  teknikReferans,
} from "../src/tanilama.js";

const DENEY = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "deney");
const beklenen = JSON.parse(
  readFileSync(join(DENEY, "veri", "altin", "tanilama_beklenen.json"), "utf-8"),
);

const TUM_DILIMLER = Array.from({ length: 8 }, (_, i) => i + 1);

/** test_tanilama._deniz_okulu ikizi: pazartesi-perşembe dış okullu öğretmen. */
function denizOkulu(): Okul {
  return {
    izgara: varsayilanIzgara(),
    dersler: [
      { ad: "Matematik", kategori: "SAYISAL" },
      { ad: "Rehberlik", kategori: "REHBERLIK_DIGER" },
    ],
    ogretmenler: [
      {
        ad: "Uydurma Deniz",
        verebilecegi_dersler: ["Matematik"],
        bos_gun_tercihi: null,
        kapanislar: [1, 2, 3, 4].map((gun) => ({
          gun,
          dilimler: [...TUM_DILIMLER],
          neden: "DIS_OKUL" as const,
        })),
      },
      {
        ad: "Uydurma Rehber",
        verebilecegi_dersler: ["Rehberlik"],
        bos_gun_tercihi: null,
        kapanislar: [],
      },
    ],
    subeler: [{ ad: "9A", sinif_rehber_ogretmeni: "Uydurma Rehber" }],
    ders_atamalari: [
      {
        ders: "Matematik",
        haftalik_saat: 2,
        blok_deseni: [2],
        subeler: ["9A"],
        ogretmenler: ["Uydurma Deniz"],
        sabit_dilimler: null,
        birlestirilebilir: false,
      },
      {
        ders: "Rehberlik",
        haftalik_saat: 1,
        blok_deseni: [1],
        subeler: ["9A"],
        ogretmenler: ["Uydurma Rehber"],
        sabit_dilimler: null,
        birlestirilebilir: false,
      },
    ],
    kural_ayarlari: varsayilanKuralAyarlari(),
  };
}

/** test_tanilama._cift_deniz_okulu ikizi: İKİ öğretmenin B3'ü yapısal imkânsız. */
function ciftDenizOkulu(): Okul {
  const okul = denizOkulu();
  okul.dersler.push({ ad: "Fizik", kategori: "SAYISAL" });
  okul.ogretmenler.push({
    ad: "Uydurma Derin",
    verebilecegi_dersler: ["Fizik"],
    bos_gun_tercihi: null,
    kapanislar: [1, 2, 3, 4].map((gun) => ({
      gun,
      dilimler: [...TUM_DILIMLER],
      neden: "DIS_OKUL" as const,
    })),
  });
  okul.ders_atamalari.push({
    ders: "Fizik",
    haftalik_saat: 2,
    blok_deseni: [2],
    subeler: ["9A"],
    ogretmenler: ["Uydurma Derin"],
    sabit_dilimler: null,
    birlestirilebilir: false,
  });
  return okul;
}

/** Altın üreticinin literal'siz anahtar kurgusunun TS karşılığı. */
function va(
  tur: VarsayimAnahtari["tur"],
  alanlar: Partial<Omit<VarsayimAnahtari, "tur" | "literal">> = {},
): VarsayimAnahtari {
  return { tur, literal: null as never, ...alanlar };
}

describe("Tanılama altın eşdeğerliği (Python referansına karşı)", () => {
  it("iyelik eki tüm altın adlarda bire bir", () => {
    for (const [ad, ek] of Object.entries(beklenen.iyelik as Record<string, string>)) {
      expect(iyelikEki(ad), ad).toBe(ek);
    }
  });

  it("gün listesi metni tüm altın listelerde bire bir", () => {
    for (const [anahtar, metin] of Object.entries(
      beklenen.gun_listeleri as Record<string, string>,
    )) {
      expect(gunleriMetneCevir(JSON.parse(anahtar)), anahtar).toBe(metin);
    }
  });

  it("çekirdek cümleleri, teknik referans ve neden-önerilmiyor senaryolarda bire bir", () => {
    const okul = denizOkulu();
    const senaryolar: Record<string, VarsayimAnahtari[]> = {
      b3_ve_dis_okul: [
        va("B3", { ogretmenAdi: "Uydurma Deniz" }),
        va("KAPANIS", { ogretmenAdi: "Uydurma Deniz", neden: "DIS_OKUL" }),
      ],
      b4_tek_atama: [va("B4", { atamaIndex: 0 })],
      b6_kapanissiz: [va("B6", { ogretmenAdi: "Uydurma Rehber" })],
      kapanis_tek_basina: [
        va("KAPANIS", { ogretmenAdi: "Uydurma Deniz", neden: "DIS_OKUL" }),
      ],
    };
    for (const [ad, cekirdek] of Object.entries(senaryolar)) {
      const b = beklenen.cekirdekler[ad];
      expect(cekirdekCumleleri(okul, cekirdek), ad).toEqual(b.cumleler);
      expect(teknikReferans(okul, cekirdek), ad).toBe(b.teknik_referans);
      expect(nedenOnerilmiyorBolumu(cekirdek), ad).toEqual(b.neden_onerilmiyor);
    }
  });

  it("muafiyet metni (tekil ve çoklu) bire bir", () => {
    const okul = denizOkulu();
    expect(muafiyetMetni(okul, ["Uydurma Deniz"])).toBe(
      beklenen.muafiyet_metinleri.tekil,
    );
    expect(muafiyetMetni(okul, ["Uydurma Deniz", "Uydurma Rehber"])).toBe(
      beklenen.muafiyet_metinleri.coklu,
    );
  });
});

describe("Deniz vakası davranış aynası (test_tanilama.py karşılığı)", () => {
  it("vaka gerçekten çözümsüz (ön koşul)", async () => {
    const sonuc = await coz(denizOkulu());
    expect(sonuc.yerlesim).toBeNull();
    expect(sonuc.durum).toBe("INFEASIBLE");
  });

  it("core, Deniz'in B3 varsayımını içeriyor", async () => {
    const { cekirdek } = await tanilamaModundaCoz(denizOkulu());
    const b3 = cekirdek.filter((v) => v.tur === "B3").map((v) => v.ogretmenAdi);
    expect(b3).toContain("Uydurma Deniz");
  });

  it("rapor, doğrulanmış muafiyet önerisi içeriyor (Karar 17 tonunda)", async () => {
    const rapor = await tanila(denizOkulu());
    expect(rapor).toContain("Boş gün garantisi kuralını");
    expect(rapor).toContain("Uydurma Deniz öğretmeni için");
    expect(rapor).toContain("denendi: program kurulabiliyor");
    expect(rapor).toContain("bilinen bir durumdur");
    expect(rapor).not.toContain("Üretilen hiçbir aday çözüm açmadı");
  });

  it("muafiyet elle uygulanınca okul gerçekten çözülüyor (önerinin vaadi)", async () => {
    const okul = denizOkulu();
    okul.kural_ayarlari.b3_muaf_ogretmenler = new Set(["Uydurma Deniz"]);
    const sonuc = await coz(okul);
    expect(sonuc.yerlesim).not.toBeNull();
    expect(["OPTIMAL", "FEASIBLE"]).toContain(sonuc.durum);
  });
});

describe("Birleşik muafiyet davranış aynası (Karar 21)", () => {
  it("tekil muafiyet yetmiyor (ön koşul)", async () => {
    const okul = ciftDenizOkulu();
    okul.kural_ayarlari.b3_muaf_ogretmenler = new Set(["Uydurma Deniz"]);
    const sonuc = await coz(okul);
    expect(sonuc.yerlesim).toBeNull();
    expect(sonuc.durum).toBe("INFEASIBLE");
  });

  it("rapor iki öğretmenin birlikte muafiyetini doğrulanmış öneriyor (yinelemeli teşhis)", async () => {
    const rapor = await tanila(ciftDenizOkulu());
    expect(rapor).toContain("birlikte kapatmayı");
    expect(rapor).toContain("Uydurma Deniz");
    expect(rapor).toContain("Uydurma Derin");
    expect(rapor).toContain("denendi: program kurulabiliyor");
    expect(rapor).not.toContain("Üretilen hiçbir aday çözüm açmadı");
  });
});
