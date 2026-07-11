/**
 * Ders dağıtım probleminin veri modeli — deney/model.py çevirisi.
 *
 * Python gerçeklemesi referanstır (Karar 22): buradaki tipler, JSON
 * çevrimi ve A-katmanı doğrulaması model.py ile davranış ve MESAJ
 * düzeyinde bire bir eşdeğer tutulur; eşdeğerlik test/altin.test.ts
 * altın testleriyle denetlenir. Python tarafında değişiklik yapmadan
 * burada davranış değiştirmek yasaktır (tersi de geçerli).
 *
 * Adlandırma Karar 7'deki karma modeli izler: alan kavramları Türkçe
 * (Okul, Ogretmen, aKatmaniDogrulama), dil mekaniği TypeScript
 * gelenekleri (camelCase fonksiyonlar, interface tipler). Interface
 * alan adları bilinçli olarak JSON şemasıyla (snake_case) aynıdır;
 * ekstra bir eşleme katmanı, eşleme hatası demektir.
 */

// --- Sabit değer kümeleri -------------------------------------------------

/** Bir müsaitlik kapanışının nedeni (tanılamada dokunulmazlık ayrımını besler). */
export const KAPANIS_NEDENLERI = [
  "DIS_OKUL",
  "BOS_GUN",
  "IDARI",
  "KISISEL_TERCIH",
] as const;
export type KapanisNedeni = (typeof KAPANIS_NEDENLERI)[number];

/** Bir dersin kategori-ardışıklığı cezasında kullanılan sınıfı. */
export const DERS_KATEGORILERI = [
  "SAYISAL",
  "SOZEL",
  "DIL",
  "SANAT_SPOR",
  "REHBERLIK_DIGER",
] as const;
export type DersKategorisi = (typeof DERS_KATEGORILERI)[number];

// --- Varlık tipleri -------------------------------------------------------

/** Okulun gün×dilim çerçevesi ve öğle arasının bloklarla ilişkisi. */
export interface Izgara {
  gun_sayisi: number;
  dilim_sayisi: number;
  ogle_arasi_sonrasi_dilim: number;
  ogle_arasi_bloklari_boler: boolean;
}

/** Bir dersin adı ve kategorisi. */
export interface Ders {
  ad: string;
  kategori: DersKategorisi;
}

/** Bir öğretmenin belirli gün ve dilimlerdeki, nedeni etiketli müsaitlik kapanışı. */
export interface Kapanis {
  gun: number;
  dilimler: number[];
  neden: KapanisNedeni;
}

/** Bir öğretmenin verebileceği dersler, boş gün tercihi ve kapanışları. */
export interface Ogretmen {
  ad: string;
  verebilecegi_dersler: string[];
  bos_gun_tercihi: number | null;
  kapanislar: Kapanis[];
}

/** Bir şubenin adı ve sınıf rehber öğretmeni. */
export interface Sube {
  ad: string;
  sinif_rehber_ogretmeni: string | null;
}

/** Bir dersin hangi şube(ler)e, hangi öğretmen(ler)le, hangi blok deseninde okutulacağı. */
export interface DersAtamasi {
  ders: string;
  haftalik_saat: number;
  blok_deseni: number[];
  subeler: string[];
  ogretmenler: string[];
  sabit_dilimler: number[][] | null;
  birlestirilebilir: boolean;
}

/** Yumuşak kısıt eşikleri ve pencere/ceza parametreleri (Karar 12 ve 17 dahil). */
export interface KuralAyarlari {
  ogretmen_sube_gunluk_toplam: number;
  ardisiklik_siniri: number;
  pencere_sert_esigi: number;
  pencereyi_bolmeyen_nedenler: Set<KapanisNedeni>;
  /** Karar 17: bu kümedeki öğretmenler için B3 boş gün garantisi aranmaz. */
  b3_muaf_ogretmenler: Set<string>;
  sayisal_dilim_cezasi: number[];
  sanat_spor_dilim_cezasi: number[];
  sure_butcesi_saniye: number;
  ust_katman_sure_orani: number;
  /** Bu kümedeki C kuralları hiç kurulmaz (bkz. model.py açıklaması). */
  kapali_kurallar: Set<string>;
}

/** Çözücü çıktısında tek bir bloğun gün, başlangıç dilimi ve süresi. */
export interface YerlesimGirdisi {
  ders_atamasi_index: number;
  gun: number;
  baslangic_dilim: number;
  sure: number;
}

/** Çözücü çıktısı: tüm ders atamalarının yerleştirildiği gün/dilimler. */
export interface Yerlesim {
  girdiler: YerlesimGirdisi[];
}

/** Bir okulun tüm veri modeli. */
export interface Okul {
  izgara: Izgara;
  dersler: Ders[];
  ogretmenler: Ogretmen[];
  subeler: Sube[];
  ders_atamalari: DersAtamasi[];
  kural_ayarlari: KuralAyarlari;
}

// --- Varsayılanlar --------------------------------------------------------
// model.py'deki dataclass varsayılanlarının tek kaynaklı karşılığı.

export function varsayilanIzgara(): Izgara {
  return {
    gun_sayisi: 5,
    dilim_sayisi: 8,
    ogle_arasi_sonrasi_dilim: 5,
    ogle_arasi_bloklari_boler: false,
  };
}

export function varsayilanKuralAyarlari(): KuralAyarlari {
  return {
    ogretmen_sube_gunluk_toplam: 3,
    ardisiklik_siniri: 2,
    pencere_sert_esigi: 4,
    pencereyi_bolmeyen_nedenler: new Set(),
    b3_muaf_ogretmenler: new Set(),
    sayisal_dilim_cezasi: [0, 0, 0, 0, 1, 2, 3, 4],
    sanat_spor_dilim_cezasi: [4, 3, 2, 1, 0, 0, 0, 0],
    sure_butcesi_saniye: 60.0,
    ust_katman_sure_orani: 0.6,
    kapali_kurallar: new Set(),
  };
}

// --- JSON çevrimi ---------------------------------------------------------
// model.py'deki from_dict/to_dict çiftlerinin karşılığı. Girdi tipi
// `any` yerine dar bir JSON sözlüğü olarak ele alınır; eksik alanlar
// Python'daki .get(...) varsayılanlarını aynen izler.

type JsonSozluk = Record<string, unknown>;

function izgaraFromDict(veri: JsonSozluk): Izgara {
  const v = varsayilanIzgara();
  return {
    gun_sayisi: (veri["gun_sayisi"] as number | undefined) ?? v.gun_sayisi,
    dilim_sayisi: (veri["dilim_sayisi"] as number | undefined) ?? v.dilim_sayisi,
    ogle_arasi_sonrasi_dilim:
      (veri["ogle_arasi_sonrasi_dilim"] as number | undefined) ??
      v.ogle_arasi_sonrasi_dilim,
    ogle_arasi_bloklari_boler:
      (veri["ogle_arasi_bloklari_boler"] as boolean | undefined) ??
      v.ogle_arasi_bloklari_boler,
  };
}

function dersFromDict(veri: JsonSozluk): Ders {
  return {
    ad: veri["ad"] as string,
    kategori: veri["kategori"] as DersKategorisi,
  };
}

function kapanisFromDict(veri: JsonSozluk): Kapanis {
  return {
    gun: veri["gun"] as number,
    dilimler: [...(veri["dilimler"] as number[])],
    neden: veri["neden"] as KapanisNedeni,
  };
}

function ogretmenFromDict(veri: JsonSozluk): Ogretmen {
  return {
    ad: veri["ad"] as string,
    verebilecegi_dersler: [
      ...((veri["verebilecegi_dersler"] as string[] | undefined) ?? []),
    ],
    bos_gun_tercihi: (veri["bos_gun_tercihi"] as number | null | undefined) ?? null,
    kapanislar: ((veri["kapanislar"] as JsonSozluk[] | undefined) ?? []).map(
      kapanisFromDict,
    ),
  };
}

function subeFromDict(veri: JsonSozluk): Sube {
  return {
    ad: veri["ad"] as string,
    sinif_rehber_ogretmeni:
      (veri["sinif_rehber_ogretmeni"] as string | null | undefined) ?? null,
  };
}

function dersAtamasiFromDict(veri: JsonSozluk): DersAtamasi {
  return {
    ders: veri["ders"] as string,
    haftalik_saat: veri["haftalik_saat"] as number,
    blok_deseni: [...(veri["blok_deseni"] as number[])],
    subeler: [...(veri["subeler"] as string[])],
    ogretmenler: [...(veri["ogretmenler"] as string[])],
    sabit_dilimler:
      (veri["sabit_dilimler"] as number[][] | null | undefined) ?? null,
    birlestirilebilir: (veri["birlestirilebilir"] as boolean | undefined) ?? false,
  };
}

function kuralAyarlariFromDict(veri: JsonSozluk): KuralAyarlari {
  const v = varsayilanKuralAyarlari();
  return {
    ogretmen_sube_gunluk_toplam:
      (veri["ogretmen_sube_gunluk_toplam"] as number | undefined) ??
      v.ogretmen_sube_gunluk_toplam,
    ardisiklik_siniri:
      (veri["ardisiklik_siniri"] as number | undefined) ?? v.ardisiklik_siniri,
    pencere_sert_esigi:
      (veri["pencere_sert_esigi"] as number | undefined) ?? v.pencere_sert_esigi,
    pencereyi_bolmeyen_nedenler: new Set(
      (veri["pencereyi_bolmeyen_nedenler"] as KapanisNedeni[] | undefined) ?? [],
    ),
    b3_muaf_ogretmenler: new Set(
      (veri["b3_muaf_ogretmenler"] as string[] | undefined) ?? [],
    ),
    sayisal_dilim_cezasi: [
      ...((veri["sayisal_dilim_cezasi"] as number[] | undefined) ??
        v.sayisal_dilim_cezasi),
    ],
    sanat_spor_dilim_cezasi: [
      ...((veri["sanat_spor_dilim_cezasi"] as number[] | undefined) ??
        v.sanat_spor_dilim_cezasi),
    ],
    sure_butcesi_saniye:
      (veri["sure_butcesi_saniye"] as number | undefined) ?? v.sure_butcesi_saniye,
    ust_katman_sure_orani:
      (veri["ust_katman_sure_orani"] as number | undefined) ??
      v.ust_katman_sure_orani,
    kapali_kurallar: new Set(
      (veri["kapali_kurallar"] as string[] | undefined) ?? [],
    ),
  };
}

/** JSON sözlüğünden bir Okul nesnesi kurar (model.py okul_from_dict karşılığı). */
export function okulFromDict(veri: JsonSozluk): Okul {
  return {
    izgara: izgaraFromDict((veri["izgara"] as JsonSozluk | undefined) ?? {}),
    dersler: ((veri["dersler"] as JsonSozluk[] | undefined) ?? []).map(dersFromDict),
    ogretmenler: ((veri["ogretmenler"] as JsonSozluk[] | undefined) ?? []).map(
      ogretmenFromDict,
    ),
    subeler: ((veri["subeler"] as JsonSozluk[] | undefined) ?? []).map(subeFromDict),
    ders_atamalari: (
      (veri["ders_atamalari"] as JsonSozluk[] | undefined) ?? []
    ).map(dersAtamasiFromDict),
    kural_ayarlari: kuralAyarlariFromDict(
      (veri["kural_ayarlari"] as JsonSozluk | undefined) ?? {},
    ),
  };
}

/** JSON metninden bir Okul nesnesi kurar (model.py okul_yukle'nin tarayıcı karşılığı). */
export function okulYukleMetinden(metin: string): Okul {
  return okulFromDict(JSON.parse(metin) as JsonSozluk);
}

// --- A-katmanı doğrulama (kisit-envanteri.md §4-A) ------------------------
// Her fonksiyon tek bir tutarlılık kuralını kontrol eder ve ihlalde
// eyleme dönük Türkçe mesajlar döndürür; ihlal yoksa boş liste döner.
// Mesaj metinleri model.py ile KARAKTER-KARAKTER aynıdır (Karar 22).

/** Her şubenin haftalık ders saati toplamının ızgara kapasitesini aşmadığını doğrular. */
export function kontrolSubeToplamHds(okul: Okul): string[] {
  const toplamDilim = okul.izgara.gun_sayisi * okul.izgara.dilim_sayisi;
  const hatalar: string[] = [];
  for (const sube of okul.subeler) {
    let toplamHds = 0;
    for (const a of okul.ders_atamalari) {
      if (a.subeler.includes(sube.ad)) toplamHds += a.haftalik_saat;
    }
    if (toplamHds > toplamDilim) {
      hatalar.push(
        `${sube.ad} şubesinin haftalık ders saati toplamı (${toplamHds}) ` +
          `ızgaranın taşıyabileceği ${toplamDilim} dilimi aşıyor: bu şubeye ` +
          `atanan derslerden birinin saatini azaltın veya başka şubeye taşıyın.`,
      );
    }
  }
  return hatalar;
}

/** Her ders atamasının en az bir öğretmene sahip olduğunu doğrular. */
export function kontrolAtamaOgretmenAtanmis(okul: Okul): string[] {
  const hatalar: string[] = [];
  for (const atama of okul.ders_atamalari) {
    if (atama.ogretmenler.length === 0) {
      hatalar.push(
        `${atama.ders} dersi (${atama.subeler.join(", ")} şube(ler)i) için ` +
          `hiç öğretmen atanmamış: bu ders atamasına bir öğretmen ekleyin.`,
      );
    }
  }
  return hatalar;
}

/** Her ders atamasındaki öğretmenlerin o dersi verebilecek branşta olduğunu doğrular. */
export function kontrolBransDersUyumu(okul: Okul): string[] {
  const ogretmenSozlugu = new Map(okul.ogretmenler.map((o) => [o.ad, o]));
  const hatalar: string[] = [];
  for (const atama of okul.ders_atamalari) {
    for (const ogretmenAdi of atama.ogretmenler) {
      const ogretmen = ogretmenSozlugu.get(ogretmenAdi);
      if (ogretmen === undefined) {
        hatalar.push(
          `${atama.ders} dersine atanan '${ogretmenAdi}' adlı öğretmen ` +
            `öğretmen listesinde bulunamadı: adı düzeltin veya öğretmeni ekleyin.`,
        );
      } else if (!ogretmen.verebilecegi_dersler.includes(atama.ders)) {
        hatalar.push(
          `${ogretmen.ad}, ${atama.ders} dersini verebileceği dersler ` +
            `listesinde görünmüyor: ya bu dersi öğretmenin ` +
            `verebilecegi_dersler listesine ekleyin ya da atamayı branşı ` +
            `uygun bir öğretmene verin.`,
        );
      }
    }
  }
  return hatalar;
}

/** Her ders atamasının blok deseni toplamının haftalık ders saatine eşit olduğunu doğrular. */
export function kontrolBlokDeseniToplami(okul: Okul): string[] {
  const hatalar: string[] = [];
  for (const atama of okul.ders_atamalari) {
    const toplam = atama.blok_deseni.reduce((t, b) => t + b, 0);
    if (toplam !== atama.haftalik_saat) {
      hatalar.push(
        `${atama.ders} dersinin blok deseni toplamı (${toplam}) haftalık ` +
          `ders saatiyle (${atama.haftalik_saat}) eşleşmiyor: blok_deseni ` +
          `listesini haftalik_saat toplamına eşitleyin.`,
      );
    }
  }
  return hatalar;
}

/** Her ders atamasının blok sayısının haftalık gün sayısını aşmadığını doğrular. */
export function kontrolBlokSayisiSiniri(okul: Okul): string[] {
  const hatalar: string[] = [];
  for (const atama of okul.ders_atamalari) {
    if (atama.blok_deseni.length > okul.izgara.gun_sayisi) {
      hatalar.push(
        `${atama.ders} dersinin ${atama.blok_deseni.length} bloğu var ama ` +
          `haftada yalnız ${okul.izgara.gun_sayisi} gün mevcut (her blok ` +
          `ayrı güne düşer): blok sayısını azaltın veya blokları birleştirin.`,
      );
    }
  }
  return hatalar;
}

/**
 * dışOkul kapanışı olmayan günler arasından açık dilimi en az olan günün
 * açık dilim sayısını döndürür (gerekçe: model.py'deki eşadlı fonksiyonun
 * docstring'i; min→max regresyonu test_model.py'de belgelidir).
 */
export function bosGunIcinRezerveEdilecekAcikDilim(
  okul: Okul,
  ogretmen: Ogretmen,
): number {
  const gunBasiKapanis = new Map<number, number>();
  const disOkulGunleri = new Set<number>();
  for (const kapanis of ogretmen.kapanislar) {
    gunBasiKapanis.set(
      kapanis.gun,
      (gunBasiKapanis.get(kapanis.gun) ?? 0) + kapanis.dilimler.length,
    );
    if (kapanis.neden === "DIS_OKUL") disOkulGunleri.add(kapanis.gun);
  }

  const uygunGunler: number[] = [];
  for (let g = 1; g <= okul.izgara.gun_sayisi; g++) {
    if (!disOkulGunleri.has(g)) uygunGunler.push(g);
  }
  if (uygunGunler.length === 0) {
    // Her gün dışOkul kapanışlı: garanti edilebilecek bir boş gün yok;
    // en kötü durum varsayılıp tam bir gün rezerve edilir.
    return okul.izgara.dilim_sayisi;
  }

  const enCokKapanisliGununKapanisi = Math.max(
    ...uygunGunler.map((g) => gunBasiKapanis.get(g) ?? 0),
  );
  return okul.izgara.dilim_sayisi - enCokKapanisliGununKapanisi;
}

/** Bir öğretmenin atanabilir kapasitesini hesaplar (B3 muafiyetinde rezerv 0). */
export function ogretmenKapasitesi(okul: Okul, ogretmen: Ogretmen): number {
  const toplamDilim = okul.izgara.gun_sayisi * okul.izgara.dilim_sayisi;
  let kapanisDilimSayisi = 0;
  for (const k of ogretmen.kapanislar) kapanisDilimSayisi += k.dilimler.length;
  const rezerve = okul.kural_ayarlari.b3_muaf_ogretmenler.has(ogretmen.ad)
    ? 0
    : bosGunIcinRezerveEdilecekAcikDilim(okul, ogretmen);
  return toplamDilim - kapanisDilimSayisi - rezerve;
}

/** Her öğretmenin müsait kapasitesinin atanmış toplam ders yüküne yettiğini doğrular. */
export function kontrolOgretmenKapasitesi(okul: Okul): string[] {
  const hatalar: string[] = [];
  for (const ogretmen of okul.ogretmenler) {
    let yuk = 0;
    for (const a of okul.ders_atamalari) {
      if (a.ogretmenler.includes(ogretmen.ad)) yuk += a.haftalik_saat;
    }
    const kapasite = ogretmenKapasitesi(okul, ogretmen);
    if (kapasite < yuk) {
      hatalar.push(
        `${ogretmen.ad}: atanmış yük (${yuk} saat) müsait kapasiteyi ` +
          `(${kapasite} dilim, kapanışlar ve garanti boş gün düşülmüş) ` +
          `aşıyor: yükünü azaltın, kapanışlarından birini kaldırın veya ` +
          `bir dersini başka öğretmenle paylaştırın.`,
      );
    }
  }
  return hatalar;
}

/** Her ders için yetkin öğretmenlerin toplam kapasitesinin toplam talebi karşıladığını doğrular. */
export function kontrolDersIcinYeterliOgretmenKapasitesi(okul: Okul): string[] {
  const hatalar: string[] = [];
  for (const ders of okul.dersler) {
    let talep = 0;
    for (const a of okul.ders_atamalari) {
      if (a.ders === ders.ad) talep += a.haftalik_saat;
    }
    if (talep === 0) continue;
    const yetkinOgretmenler = okul.ogretmenler.filter((o) =>
      o.verebilecegi_dersler.includes(ders.ad),
    );
    if (yetkinOgretmenler.length === 0) {
      hatalar.push(
        `${ders.ad} dersini verebilecek hiç öğretmen yok ama toplam ` +
          `${talep} saat talep var: en az bir öğretmenin ` +
          `verebilecegi_dersler listesine ${ders.ad}'i ekleyin.`,
      );
      continue;
    }
    let toplamKapasite = 0;
    for (const o of yetkinOgretmenler) toplamKapasite += ogretmenKapasitesi(okul, o);
    if (toplamKapasite < talep) {
      hatalar.push(
        `${ders.ad} dersini verebilecek öğretmenlerin toplam kapasitesi ` +
          `(${toplamKapasite} dilim) toplam talebi (${talep} saat) ` +
          `karşılamıyor: bu branştan başka öğretmen ekleyin veya ` +
          `mevcut öğretmenlerin kapanışlarını azaltın.`,
      );
    }
  }
  return hatalar;
}

/** Her şubenin sınıf rehber öğretmeninin tanımlı ve rehberlik dersine atanmış olduğunu doğrular (B5). */
export function kontrolSinifRehberOgretmeni(okul: Okul): string[] {
  const ogretmenSozlugu = new Map(okul.ogretmenler.map((o) => [o.ad, o]));
  const dersSozlugu = new Map(okul.dersler.map((d) => [d.ad, d]));
  const hatalar: string[] = [];
  for (const sube of okul.subeler) {
    if (!sube.sinif_rehber_ogretmeni) {
      hatalar.push(
        `${sube.ad} şubesinin sınıf rehber öğretmeni tanımlı değil: ` +
          `Sube.sinif_rehber_ogretmeni alanını doldurun.`,
      );
      continue;
    }
    if (!ogretmenSozlugu.has(sube.sinif_rehber_ogretmeni)) {
      hatalar.push(
        `${sube.ad} şubesinin sınıf rehber öğretmeni olarak gösterilen ` +
          `'${sube.sinif_rehber_ogretmeni}' öğretmen listesinde yok: adı ` +
          `düzeltin veya öğretmeni ekleyin.`,
      );
      continue;
    }
    const rehberlikAtamalari = okul.ders_atamalari.filter(
      (a) =>
        a.subeler.includes(sube.ad) &&
        dersSozlugu.get(a.ders)?.kategori === "REHBERLIK_DIGER",
    );
    if (rehberlikAtamalari.length === 0) {
      hatalar.push(
        `${sube.ad} şubesi için rehberlik kategorisinde (REHBERLIK_DIGER) ` +
          `bir ders ataması bulunamadı: bu şubeye rehberlik dersi ekleyin.`,
      );
    } else if (
      !rehberlikAtamalari.some((a) =>
        a.ogretmenler.includes(sube.sinif_rehber_ogretmeni as string),
      )
    ) {
      hatalar.push(
        `${sube.ad} şubesinin rehberlik dersine sınıf rehber öğretmeni ` +
          `'${sube.sinif_rehber_ogretmeni}' değil başka bir öğretmen ` +
          `girmiş: B5 kuralı gereği rehberlik dersine sınıf rehber ` +
          `öğretmeni girmelidir.`,
      );
    }
  }
  return hatalar;
}

/** Kısıt envanteri §4-A'daki tüm tutarlılık kurallarını çalıştırıp nedenli hata mesajlarını toplar. */
export function aKatmaniDogrulama(okul: Okul): string[] {
  const kontroller = [
    kontrolSubeToplamHds,
    kontrolAtamaOgretmenAtanmis,
    kontrolBransDersUyumu,
    kontrolBlokDeseniToplami,
    kontrolBlokSayisiSiniri,
    kontrolOgretmenKapasitesi,
    kontrolDersIcinYeterliOgretmenKapasitesi,
    kontrolSinifRehberOgretmeni,
  ];
  const hatalar: string[] = [];
  for (const kontrol of kontroller) hatalar.push(...kontrol(okul));
  return hatalar;
}
