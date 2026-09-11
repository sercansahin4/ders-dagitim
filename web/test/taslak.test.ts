/**
 * taslak.ts saf durum mantığının testleri (Karar 28 ilk artış). cizelge
 * .test.ts deseni: React yok, saf reducer + referans bütünlüğü doğrulanır.
 * Fixture bilinçli olarak elle ve küçüktür; ornek_okul.json'a bağlanmaz.
 */
import { describe, expect, it } from "vitest";
import { varsayilanIzgara, varsayilanKuralAyarlari } from "../src/model.js";
import type { Okul } from "../src/model.js";
import {
  ogretmenKullanimlari,
  ogretmenSilinebilir,
  ogretmenYenidenAdlandir,
  sonucBayatMi,
  taslakReducer,
} from "../src/taslak.js";

function ornekOkul(): Okul {
  return {
    izgara: varsayilanIzgara(),
    dersler: [
      { ad: "Fizik", kategori: "SAYISAL" },
      { ad: "Rehberlik", kategori: "REHBERLIK_DIGER" },
    ],
    ogretmenler: [
      { ad: "Ayşe", verebilecegi_dersler: ["Fizik"], bos_gun_tercihi: null, kapanislar: [] },
      { ad: "Mehmet", verebilecegi_dersler: ["Rehberlik"], bos_gun_tercihi: 3, kapanislar: [] },
    ],
    subeler: [{ ad: "9-A", sinif_rehber_ogretmeni: "Mehmet" }],
    ders_atamalari: [
      {
        ders: "Fizik",
        haftalik_saat: 4,
        blok_deseni: [2, 2],
        subeler: ["9-A"],
        ogretmenler: ["Ayşe"],
        sabit_dilimler: null,
        birlestirilebilir: false,
      },
    ],
    kural_ayarlari: { ...varsayilanKuralAyarlari(), b3_muaf_ogretmenler: new Set(["Ayşe"]) },
  };
}

describe("taslakReducer — değişmezlik", () => {
  it("boş gün eylemi girdiye dokunmaz, yeni nesne döndürür", () => {
    const okul = ornekOkul();
    const yeni = taslakReducer(okul, { tip: "ogretmenBosGun", ogretmen: "Mehmet", bosGun: null });
    expect(okul.ogretmenler[1]?.bos_gun_tercihi).toBe(3); // girdi korunur
    expect(yeni.ogretmenler[1]?.bos_gun_tercihi).toBeNull();
    expect(yeni).not.toBe(okul);
  });
});

describe("taslakReducer — liste düzenleme", () => {
  it("kapanış ekler ve siler", () => {
    const okul = ornekOkul();
    const eklendi = taslakReducer(okul, {
      tip: "kapanisEkle",
      ogretmen: "Ayşe",
      kapanis: { gun: 1, dilimler: [1, 2], neden: "IDARI" },
    });
    expect(eklendi.ogretmenler[0]?.kapanislar).toHaveLength(1);
    const silindi = taslakReducer(eklendi, { tip: "kapanisSil", ogretmen: "Ayşe", kapanisIndex: 0 });
    expect(silindi.ogretmenler[0]?.kapanislar).toHaveLength(0);
  });

  it("blok deseni çip ekler/siler ve haftalık saati günceller", () => {
    const okul = ornekOkul();
    const eklendi = taslakReducer(okul, { tip: "atamaBlokEkle", atamaIndex: 0, blok: 1 });
    expect(eklendi.ders_atamalari[0]?.blok_deseni).toEqual([2, 2, 1]);
    const silindi = taslakReducer(eklendi, { tip: "atamaBlokSil", atamaIndex: 0, blokIndex: 2 });
    expect(silindi.ders_atamalari[0]?.blok_deseni).toEqual([2, 2]);
    const saat = taslakReducer(okul, { tip: "atamaSaat", atamaIndex: 0, saat: 5 });
    expect(saat.ders_atamalari[0]?.haftalik_saat).toBe(5);
  });
});

describe("taslakReducer — süre bütçesi (Karar 29)", () => {
  it("bütçeyi günceller ve diğer kural ayarlarına dokunmaz", () => {
    const okul = ornekOkul();
    const yeni = taslakReducer(okul, { tip: "sureButcesi", saniye: 300 });
    expect(yeni.kural_ayarlari.sure_butcesi_saniye).toBe(300);
    expect(okul.kural_ayarlari.sure_butcesi_saniye).toBe(60); // girdi korunur
    expect(yeni.kural_ayarlari.b3_muaf_ogretmenler).toBe(
      okul.kural_ayarlari.b3_muaf_ogretmenler,
    );
  });

  it("0 ve negatif bütçeyi 1 saniyeye çeker (çözücüye anlamsız değer gitmez)", () => {
    const okul = ornekOkul();
    expect(
      taslakReducer(okul, { tip: "sureButcesi", saniye: 0 }).kural_ayarlari
        .sure_butcesi_saniye,
    ).toBe(1);
    expect(
      taslakReducer(okul, { tip: "sureButcesi", saniye: -5 }).kural_ayarlari
        .sure_butcesi_saniye,
    ).toBe(1);
  });
});

describe("referans bütünlüğü — yeniden adlandırma dört yeri birlikte günceller", () => {
  it("ders atamasındaki ve b3 muafiyetindeki referansı taşır", () => {
    const okul = ornekOkul();
    const yeni = ogretmenYenidenAdlandir(okul, "Ayşe", "A. Yılmaz");
    expect(yeni.ogretmenler.map((o) => o.ad)).toContain("A. Yılmaz");
    expect(yeni.ders_atamalari[0]?.ogretmenler).toEqual(["A. Yılmaz"]);
    expect(yeni.kural_ayarlari.b3_muaf_ogretmenler.has("A. Yılmaz")).toBe(true);
    expect(yeni.kural_ayarlari.b3_muaf_ogretmenler.has("Ayşe")).toBe(false);
  });

  it("sınıf rehber öğretmeni referansını taşır", () => {
    const okul = ornekOkul();
    const yeni = ogretmenYenidenAdlandir(okul, "Mehmet", "M. Demir");
    expect(yeni.subeler[0]?.sinif_rehber_ogretmeni).toBe("M. Demir");
  });
});

describe("referans bütünlüğü — silme koruması", () => {
  it("bir atamada kullanılan öğretmen silinemez, neden Türkçe döner", () => {
    const okul = ornekOkul();
    const sonuc = ogretmenSilinebilir(okul, "Ayşe");
    expect(sonuc.silinebilir).toBe(false);
    expect(sonuc.neden).toContain("Fizik");
  });

  it("sınıf rehber öğretmeni silinemez", () => {
    const okul = ornekOkul();
    const sonuc = ogretmenSilinebilir(okul, "Mehmet");
    expect(sonuc.silinebilir).toBe(false);
    expect(sonuc.neden).toContain("9-A");
  });

  it("hiçbir yerde kullanılmayan öğretmen silinebilir", () => {
    const okul = ornekOkul();
    okul.ogretmenler.push({
      ad: "Boşta",
      verebilecegi_dersler: [],
      bos_gun_tercihi: null,
      kapanislar: [],
    });
    expect(ogretmenSilinebilir(okul, "Boşta").silinebilir).toBe(true);
    expect(ogretmenKullanimlari(okul, "Boşta")).toEqual([]);
  });
});

describe("ogretmenSil eylemi — invaryant UI hatasına dayanıklı", () => {
  it("güvenliyse öğretmeni kaldırır", () => {
    const okul = ornekOkul();
    okul.ogretmenler.push({
      ad: "Boşta",
      verebilecegi_dersler: [],
      bos_gun_tercihi: null,
      kapanislar: [],
    });
    const yeni = taslakReducer(okul, { tip: "ogretmenSil", ogretmen: "Boşta" });
    expect(yeni.ogretmenler.some((o) => o.ad === "Boşta")).toBe(false);
  });

  it("güvenli değilse değişmez döndürür (silmeyi reddeder)", () => {
    const okul = ornekOkul();
    const yeni = taslakReducer(okul, { tip: "ogretmenSil", ogretmen: "Ayşe" });
    expect(yeni.ogretmenler.some((o) => o.ad === "Ayşe")).toBe(true);
    expect(yeni).toBe(okul);
  });
});

describe("sonucBayatMi — ekrandaki sonuç güncel mi (Kusur 1)", () => {
  it("sonuç yoksa veya taslak yoksa bayat değildir", () => {
    const okul = ornekOkul();
    expect(sonucBayatMi(null, okul)).toBe(false);
    expect(sonucBayatMi(okul, null)).toBe(false);
    expect(sonucBayatMi(null, null)).toBe(false);
  });

  it("taslak hiç değişmediyse bayat değildir", () => {
    const okul = ornekOkul();
    expect(sonucBayatMi(okul, okul)).toBe(false);
  });

  it("gerçek bir düzenlemeden sonra bayattır", () => {
    const okul = ornekOkul();
    const sonra = taslakReducer(okul, {
      tip: "ogretmenBosGun",
      ogretmen: "Ayşe",
      bosGun: 2,
    });
    expect(sonra).not.toBe(okul);
    expect(sonucBayatMi(okul, sonra)).toBe(true);
  });

  it("REDDEDİLEN bir düzenlemeden sonra bayat DEĞİLDİR", () => {
    // Korumalı silme değişmez döndürür: veri değişmediyse sonuç da bayat
    // değildir. Derin karşılaştırma yapsaydık bu ayrım kaybolmazdı ama
    // pahalı olurdu; referans kıyası bunu bedava veriyor.
    const okul = ornekOkul();
    const sonra = taslakReducer(okul, { tip: "ogretmenSil", ogretmen: "Ayşe" });
    expect(sonra).toBe(okul);
    expect(sonucBayatMi(okul, sonra)).toBe(false);
  });
});
