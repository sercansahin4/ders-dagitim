/**
 * taslak.ts saf durum mantığının testleri (Karar 28 ilk artış). cizelge
 * .test.ts deseni: React yok, saf reducer + referans bütünlüğü doğrulanır.
 * Fixture bilinçli olarak elle ve küçüktür; ornek_okul.json'a bağlanmaz.
 */
import { describe, expect, it } from "vitest";
import { varsayilanIzgara, varsayilanKuralAyarlari } from "../src/model.js";
import type { Okul } from "../src/model.js";
import {
  bosOkul,
  dersSilinebilir,
  izgaraDisiKalanlar,
  ogretmenKullanimlari,
  ogretmenSilinebilir,
  ogretmenYenidenAdlandir,
  sonucBayatMi,
  subeDersTablosuKopyala,
  subeSilinebilir,
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

describe("ikinci artış — sıfırdan okul kurma", () => {
  it("bosOkul boş dizilerle ve varsayılan ayarlarla başlar", () => {
    const okul = bosOkul();
    expect(okul.subeler).toHaveLength(0);
    expect(okul.dersler).toHaveLength(0);
    expect(okul.ogretmenler).toHaveLength(0);
    expect(okul.ders_atamalari).toHaveLength(0);
    expect(okul.kural_ayarlari.b3_muaf_ogretmenler.size).toBe(0);
  });

  it("aynı adla ikinci şube/ders/öğretmen eklenmez (değişmez döner)", () => {
    const okul = ornekOkul();
    expect(taslakReducer(okul, { tip: "subeEkle", ad: "9-A" })).toBe(okul);
    expect(
      taslakReducer(okul, { tip: "dersEkle", ad: "Fizik", kategori: "SAYISAL" }),
    ).toBe(okul);
    expect(taslakReducer(okul, { tip: "ogretmenEkle", ad: "Ayşe" })).toBe(okul);
    expect(taslakReducer(okul, { tip: "subeEkle", ad: "   " })).toBe(okul);
  });

  it("yeni şube eklenir ve rehber öğretmeni atanabilir", () => {
    let okul = taslakReducer(ornekOkul(), { tip: "subeEkle", ad: "9-B" });
    expect(okul.subeler.map((s) => s.ad)).toEqual(["9-A", "9-B"]);
    okul = taslakReducer(okul, {
      tip: "subeRehberOgretmeni",
      sube: "9-B",
      ogretmen: "Ayşe",
    });
    expect(okul.subeler[1]?.sinif_rehber_ogretmeni).toBe("Ayşe");
  });

  it("kullanımdaki şube silinmez, nedeni söylenir", () => {
    const okul = ornekOkul();
    const karar = subeSilinebilir(okul, "9-A");
    expect(karar.silinebilir).toBe(false);
    expect(karar.neden).toContain("Fizik");
    expect(taslakReducer(okul, { tip: "subeSil", ad: "9-A" })).toBe(okul);
  });

  it("şube yeniden adlandırma İKİ referansı birden günceller", () => {
    const okul = taslakReducer(ornekOkul(), {
      tip: "subeYenidenAdlandir",
      eski: "9-A",
      yeni: "9-C",
    });
    expect(okul.subeler[0]?.ad).toBe("9-C");
    expect(okul.ders_atamalari[0]?.subeler).toEqual(["9-C"]);
  });

  it("ders yeniden adlandırma ÜÇ referansı birden günceller", () => {
    const okul = taslakReducer(ornekOkul(), {
      tip: "dersYenidenAdlandir",
      eski: "Fizik",
      yeni: "Fizik II",
    });
    expect(okul.dersler.map((d) => d.ad)).toContain("Fizik II");
    expect(okul.ders_atamalari[0]?.ders).toBe("Fizik II");
    // Üçüncüsü kolay unutulan: branş listesi de ders ADINA bağlıdır.
    expect(
      okul.ogretmenler.find((o) => o.ad === "Ayşe")?.verebilecegi_dersler,
    ).toEqual(["Fizik II"]);
  });

  it("ders silme hem atamayı hem branş listesini gözetir", () => {
    const okul = ornekOkul();
    expect(dersSilinebilir(okul, "Fizik").neden).toContain("9-A");
    // Atamayı kaldırınca bu kez branş listesi engeller.
    const atamasiz = taslakReducer(okul, { tip: "atamaSil", atamaIndex: 0 });
    const karar = dersSilinebilir(atamasiz, "Fizik");
    expect(karar.silinebilir).toBe(false);
    expect(karar.neden).toContain("Ayşe");
    // Branştan da çıkınca silinebilir.
    const branssiz = taslakReducer(atamasiz, {
      tip: "ogretmenBrans",
      ogretmen: "Ayşe",
      dersler: [],
    });
    expect(dersSilinebilir(branssiz, "Fizik").silinebilir).toBe(true);
    expect(
      taslakReducer(branssiz, { tip: "dersSil", ad: "Fizik" }).dersler.length,
    ).toBe(1);
  });

  it("B3 muafiyeti açılıp kapanır", () => {
    let okul = taslakReducer(ornekOkul(), {
      tip: "ogretmenB3Muafiyeti",
      ogretmen: "Mehmet",
      muaf: true,
    });
    expect(okul.kural_ayarlari.b3_muaf_ogretmenler.has("Mehmet")).toBe(true);
    okul = taslakReducer(okul, {
      tip: "ogretmenB3Muafiyeti",
      ogretmen: "Ayşe",
      muaf: false,
    });
    expect(okul.kural_ayarlari.b3_muaf_ogretmenler.has("Ayşe")).toBe(false);
  });

  it("atama eklenir ve silinir", () => {
    const okul = taslakReducer(ornekOkul(), {
      tip: "atamaEkle",
      atama: {
        ders: "Rehberlik",
        haftalik_saat: 1,
        blok_deseni: [1],
        subeler: ["9-A"],
        ogretmenler: [],
        sabit_dilimler: null,
        birlestirilebilir: false,
      },
    });
    expect(okul.ders_atamalari).toHaveLength(2);
    expect(taslakReducer(okul, { tip: "atamaSil", atamaIndex: 1 }).ders_atamalari).toHaveLength(1);
  });

  it("kopyalama ders tablosunu taşır ve öğretmenleri boşaltır", () => {
    let okul = taslakReducer(ornekOkul(), { tip: "subeEkle", ad: "9-B" });
    okul = taslakReducer(okul, {
      tip: "atamaEkle",
      atama: {
        ders: "Rehberlik",
        haftalik_saat: 1,
        blok_deseni: [1],
        subeler: ["9-A"],
        ogretmenler: ["Mehmet"],
        sabit_dilimler: null,
        birlestirilebilir: false,
      },
    });

    const sonuc = subeDersTablosuKopyala(okul, "9-A", "9-B");
    expect(sonuc.kopyalandi).toBe(2);
    expect(sonuc.atlandiVar).toBe(0);
    expect(sonuc.atlandiCokSubeli).toBe(0);

    const kopyalar = sonuc.okul.ders_atamalari.filter((a) => a.subeler.includes("9-B"));
    expect(kopyalar).toHaveLength(2);
    // Ders tablosu gelir, ders dağıtımı gelmez: öğretmenler BOŞ.
    expect(kopyalar.every((a) => a.ogretmenler.length === 0)).toBe(true);
    const fizik = kopyalar.find((a) => a.ders === "Fizik");
    expect(fizik?.haftalik_saat).toBe(4);
    expect(fizik?.blok_deseni).toEqual([2, 2]);
    // Kaynak şube bozulmadı.
    expect(
      sonuc.okul.ders_atamalari.filter((a) => a.subeler.includes("9-A")),
    ).toHaveLength(2);
  });

  it("kopyalama hedefte zaten olanı ve çok şubeli atamayı atlar", () => {
    let okul = taslakReducer(ornekOkul(), { tip: "subeEkle", ad: "9-B" });
    okul = taslakReducer(okul, { tip: "dersEkle", ad: "Müzik", kategori: "SANAT_SPOR" });
    // Hedefte zaten var olacak ders (9-A'da da bulunacak)
    okul = taslakReducer(okul, {
      tip: "atamaEkle",
      atama: {
        ders: "Rehberlik",
        haftalik_saat: 1,
        blok_deseni: [1],
        subeler: ["9-B"],
        ogretmenler: ["Mehmet"],
        sabit_dilimler: null,
        birlestirilebilir: false,
      },
    });
    okul = taslakReducer(okul, {
      tip: "atamaEkle",
      atama: {
        ders: "Rehberlik",
        haftalik_saat: 1,
        blok_deseni: [1],
        subeler: ["9-A"],
        ogretmenler: ["Mehmet"],
        sabit_dilimler: null,
        birlestirilebilir: false,
      },
    });
    // Çok şubeli (birleşik) atama: kopyalanmaz
    okul = taslakReducer(okul, {
      tip: "atamaEkle",
      atama: {
        ders: "Müzik",
        haftalik_saat: 2,
        blok_deseni: [2],
        subeler: ["9-A", "9-B"],
        ogretmenler: ["Ayşe"],
        sabit_dilimler: null,
        birlestirilebilir: true,
      },
    });

    const sonuc = subeDersTablosuKopyala(okul, "9-A", "9-B");
    expect(sonuc.kopyalandi).toBe(1); // yalnız Fizik
    expect(sonuc.atlandiVar).toBe(1); // Rehberlik hedefte zaten var
    expect(sonuc.atlandiCokSubeli).toBe(1); // birleşik Müzik ataması
  });

  it("kopyalama kendine veya olmayan şubeye yapılmaz", () => {
    const okul = ornekOkul();
    expect(subeDersTablosuKopyala(okul, "9-A", "9-A").okul).toBe(okul);
    expect(subeDersTablosuKopyala(okul, "9-A", "yok").kopyalandi).toBe(0);
  });

  it("ızgara küçültmede aralık dışı kalacak kayıtlar sayılır", () => {
    let okul = ornekOkul();
    okul = taslakReducer(okul, {
      tip: "kapanisEkle",
      ogretmen: "Mehmet",
      kapanis: { gun: 5, dilimler: [7, 8], neden: "IDARI" },
    });
    const dar = { ...okul.izgara, gun_sayisi: 4, dilim_sayisi: 6 };
    expect(izgaraDisiKalanlar(okul, dar).kapanis).toBe(1);
    expect(izgaraDisiKalanlar(okul, okul.izgara).kapanis).toBe(0);
  });
});
