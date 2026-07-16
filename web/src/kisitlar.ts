/**
 * Kısıt katalogundaki kuralların CP-SAT çevirileri — deney/kisitlar.py çevirisi.
 *
 * Python gerçeklemesi referanstır (Karar 22): buradaki kurulum,
 * kisitlar.py ile davranış düzeyinde bire bir eşdeğer tutulur;
 * eşdeğerlik test/altin.test.ts çözücü altınlarıyla (Karar 23)
 * denetlenir. Python tarafında değişiklik yapmadan burada davranış
 * değiştirmek yasaktır (tersi de geçerli).
 *
 * Dosyanın haritası docs/cevrim-tablosu.md'dir: §0 temel karar
 * değişkenleri, §1 B1-B8 sert kuralları; her kural = bir fonksiyon.
 *
 * İki modlu kurulum (cevrim-tablosu.md §4, kararlar.md Karar 13):
 * HIZLI mod kapanışları arama uzayı budaması olarak uygular (anahtar
 * hiç yaratılmaz); TANILAMA modu kapanışları varsayım (assumption)
 * anahtarına bağlı gerçek kısıt olarak yazar ki unsat core'da
 * görünebilsinler. Ayrıntı için kisitlar.py modül yorumuna bakınız.
 *
 * Sözlük anahtarları: Python'un tuple anahtarlı sözlükleri burada
 * "|" ile birleştirilmiş string anahtarlı Map'lerdir (ör. basla
 * anahtarı `${a}|${b}|${g}|${s}`). Öğretmen/şube adları anahtar
 * bileşeni olduğundan ayraç olarak adlarda geçemeyecek "|" seçildi.
 */

import { CpModel, LinearExpr } from "or-tools-wasm/cp-sat";
import type { BoolVar, IntVar } from "or-tools-wasm/cp-sat";

import type {
  DersAtamasi,
  DersKategorisi,
  KapanisNedeni,
  Ogretmen,
  Okul,
} from "./model.js";
import { DERS_KATEGORILERI } from "./model.js";

/** Map anahtarı kurucuları (Python tuple anahtarlarının karşılığı). */
export const anahtar2 = (a: number | string, b: number | string): string =>
  `${a}|${b}`;
export const anahtar3 = (
  a: number | string,
  b: number | string,
  c: number | string,
): string => `${a}|${b}|${c}`;
export const anahtar4 = (
  a: number | string,
  b: number | string,
  c: number | string,
  d: number | string,
): string => `${a}|${b}|${c}|${d}`;

/**
 * Tanılama modunda bir sert kural grubunu temsil eden varsayım
 * (assumption) anahtarını tutar.
 *
 * tur: "B3" | "B4" | "B6" | "KAPANIS". Diğer alanlar türe göre
 * doldurulur (öğretmen kuralları için ogretmenAdi, B4 için
 * atamaIndex, kapanış grubu için ogretmenAdi + neden).
 */
export interface VarsayimAnahtari {
  tur: "B3" | "B4" | "B6" | "KAPANIS";
  literal: BoolVar;
  ogretmenAdi?: string;
  atamaIndex?: number;
  neden?: KapanisNedeni;
}

/** Pencere değişkeni: segment sınırında sabit 0 (sayı) olabilir. */
export type PencereDegeri = BoolVar | 0;

/** CP-SAT modelini, okul verisini ve cevrim-tablosu §0 temel karar değişkenlerini bir arada tutar. */
export interface KisitModeli {
  model: CpModel;
  okul: Okul;
  gunler: number[];
  dilimler: number[];
  tanilamaModu: boolean;
  /** basla[a|b|g|s] — yalnızca geçerli konumlar için anahtar var. */
  basla: Map<string, BoolVar>;
  /**
   * (a|g) -> [(b_idx, s0, var)] — basla'nın gün indeksli görünümü.
   * Gerekçe: dolu kurulumu ile C5/C7 köprü aramaları büyük okulda tüm
   * basla sözlüğünü taramamalı (43 şubede kurulum dakikalara çıkıyordu).
   */
  baslaGunIndeksi: Map<string, Array<[number, number, BoolVar]>>;
  /** dolu[a|g|s] */
  dolu: Map<string, BoolVar>;
  /** calisiyor[ogretmenAdi|g|s] */
  calisiyor: Map<string, BoolVar>;
  /** subeDolu[subeAdi|g|s] */
  subeDolu: Map<string, BoolVar>;
  /** gunBos[ogretmenAdi|g] */
  gunBos: Map<string, BoolVar>;
  /** pencere[ogretmenAdi|g|s] — segment sınırında sabit 0 olabilir. */
  pencere: Map<string, PencereDegeri>;
  /** Tanılama modunda oluşturulan tüm varsayım anahtarları (sırayla). */
  varsayimlar: VarsayimAnahtari[];
}

/** Bir öğretmenin (gün|dilim) çiftlerinden kapanış nedenine sözlük kurar. */
function kapanisDilimleri(ogretmen: Ogretmen): Map<string, KapanisNedeni> {
  const sozluk = new Map<string, KapanisNedeni>();
  for (const kapanis of ogretmen.kapanislar) {
    for (const dilim of kapanis.dilimler) {
      sozluk.set(anahtar2(kapanis.gun, dilim), kapanis.neden);
    }
  }
  return sozluk;
}

/**
 * Cevrim-tablosu §1 B2: bir bloğun geçerli (gün, başlangıç) konumlarını hesaplar.
 *
 * Izgara sınırı ve öğle arası ayarı HER ZAMAN uygulanır — bunlar
 * gevşetilebilir varsayımlar değil, ızgaranın yapısıdır.
 *
 * kapanislariBudamaOlarakUygula=true (HIZLI mod, varsayılan): kapalı
 * dilime denk gelen konumlar tamamen elenir. false (TANILAMA modu):
 * kapanışlar burada göz ardı edilir — etkisi, çağıran tarafından
 * varsayıma bağlı kısıt olarak eklenir (bkz. kisitlar.py b2 yorumu).
 */
export function b2Kapanislar(
  okul: Okul,
  atama: DersAtamasi,
  uzunluk: number,
  gunler: number[],
  dilimler: number[],
  kapanislariBudamaOlarakUygula = true,
): Array<[number, number]> {
  const kapanislar = okul.ogretmenler
    .filter((o) => atama.ogretmenler.includes(o.ad))
    .map(kapanisDilimleri);
  const gecerli: Array<[number, number]> = [];
  for (const g of gunler) {
    for (const s of dilimler) {
      if (s + uzunluk - 1 > okul.izgara.dilim_sayisi) continue;
      if (okul.izgara.ogle_arasi_bloklari_boler) {
        const sinir = okul.izgara.ogle_arasi_sonrasi_dilim;
        if (s <= sinir && sinir < s + uzunluk - 1) continue;
      }
      if (kapanislariBudamaOlarakUygula) {
        let kapali = false;
        for (let d = s; d < s + uzunluk && !kapali; d += 1) {
          for (const kapanis of kapanislar) {
            if (kapanis.has(anahtar2(g, d))) {
              kapali = true;
              break;
            }
          }
        }
        if (kapali) continue;
      }
      gecerli.push([g, s]);
    }
  }
  return gecerli;
}

/**
 * Cevrim-tablosu §1 B1: her (öğretmen,g,s) ve (şube,g,s) için doluluğu
 * BoolVar'a eşitleyerek çakışmazlığı kurar.
 *
 * calisiyor/subeDolu bir BoolVar'a eşitlendiğinden (0/1 dışına
 * çıkamaz), ilgili dolu toplamı zaten "en fazla 1" ile sınırlanmış
 * olur — bu eşitlik B1'in kendisidir. B1 hiçbir modda varsayıma
 * bağlanmaz: çakışmazlık geçerli bir programın tanımıdır.
 */
function b1Cakismazlik(km: KisitModeli): void {
  for (const ogretmen of km.okul.ogretmenler) {
    const ilgili = km.okul.ders_atamalari
      .map((atama, aIdx) => [atama, aIdx] as const)
      .filter(([atama]) => atama.ogretmenler.includes(ogretmen.ad))
      .map(([, aIdx]) => aIdx);
    for (const g of km.gunler) {
      for (const s of km.dilimler) {
        const degisken = km.model.newBoolVar(`calisiyor_${ogretmen.ad}_${g}_${s}`);
        const toplam = LinearExpr.sum(
          ilgili.map((aIdx) => km.dolu.get(anahtar3(aIdx, g, s))!),
        );
        km.model.add(degisken.eq(toplam));
        km.calisiyor.set(anahtar3(ogretmen.ad, g, s), degisken);
      }
    }
  }

  for (const sube of km.okul.subeler) {
    const ilgili = km.okul.ders_atamalari
      .map((atama, aIdx) => [atama, aIdx] as const)
      .filter(([atama]) => atama.subeler.includes(sube.ad))
      .map(([, aIdx]) => aIdx);
    for (const g of km.gunler) {
      for (const s of km.dilimler) {
        const degisken = km.model.newBoolVar(`sube_dolu_${sube.ad}_${g}_${s}`);
        const toplam = LinearExpr.sum(
          ilgili.map((aIdx) => km.dolu.get(anahtar3(aIdx, g, s))!),
        );
        km.model.add(degisken.eq(toplam));
        km.subeDolu.set(anahtar3(sube.ad, g, s), degisken);
      }
    }
  }
}

/** Tanılama modundaysa yeni bir varsayım literali yaratıp kaydeder; hızlı modda null döner. */
function yeniVarsayim(
  km: KisitModeli,
  isim: string,
  alanlar: Omit<VarsayimAnahtari, "literal">,
): BoolVar | null {
  if (!km.tanilamaModu) return null;
  const literal = km.model.newBoolVar(isim);
  km.model.addAssumption(literal);
  km.varsayimlar.push({ literal, ...alanlar });
  return literal;
}

/**
 * Cevrim-tablosu §1 B3: dışOkul kapanışı olmayan günler üzerinden her
 * öğretmene en az bir tam boş gün garanti eder (öğretmen başına bir
 * varsayım anahtarı, tanılama modunda).
 *
 * Karar 17: kural_ayarlari.b3_muaf_ogretmenler kümesindeki öğretmen
 * için kısıt hiç kurulmaz (varsayım anahtarı da yaratılmaz — muaf
 * öğretmen unsat core'da B3 ile görünmemeli).
 */
function b3BosGunGarantisi(km: KisitModeli): void {
  for (const ogretmen of km.okul.ogretmenler) {
    if (km.okul.kural_ayarlari.b3_muaf_ogretmenler.has(ogretmen.ad)) continue;
    const disOkulGunleri = new Set(
      ogretmen.kapanislar
        .filter((k) => k.neden === "DIS_OKUL")
        .map((k) => k.gun),
    );
    const uygunGunler = km.gunler.filter((g) => !disOkulGunleri.has(g));
    const varsayim = yeniVarsayim(km, `varsayim_b3_${ogretmen.ad}`, {
      tur: "B3",
      ogretmenAdi: ogretmen.ad,
    });
    const kisit = km.model.add(
      LinearExpr.from(
        LinearExpr.sum(uygunGunler.map((g) => km.gunBos.get(anahtar2(ogretmen.ad, g))!)),
      ).ge(1),
    );
    if (varsayim !== null) kisit.onlyEnforceIf(varsayim);
  }
}

/**
 * Cevrim-tablosu §1 B4: her ders ataması için aynı güne en fazla bir blok
 * başlayabilir (atama başına bir varsayım anahtarı, tanılama modunda).
 */
function b4AyriGuneDagilim(km: KisitModeli): void {
  km.okul.ders_atamalari.forEach((_atama, aIdx) => {
    const varsayim = yeniVarsayim(km, `varsayim_b4_a${aIdx}`, {
      tur: "B4",
      atamaIndex: aIdx,
    });
    for (const g of km.gunler) {
      const anahtarlar = (km.baslaGunIndeksi.get(anahtar2(aIdx, g)) ?? []).map(
        ([, , degisken]) => degisken,
      );
      if (anahtarlar.length > 0) {
        const kisit = km.model.add(LinearExpr.from(LinearExpr.sum(anahtarlar)).le(1));
        if (varsayim !== null) kisit.onlyEnforceIf(varsayim);
      }
    }
  });
}

// B5 — Rehberlik öğretmeni: çözücü kısıtı GEREKMEZ. Veri kurulumunda
// rehberlik dersinin ogretmenler listesi sınıf rehber öğretmenini
// içerecek şekilde girilir; tutarlılığı model.ts'teki
// kontrolSinifRehberOgretmeni (A-katmanı) doğrular. Tablo-kod eşlemesi
// eksiksiz görünsün diye açıklayıcı not olarak konmuştur.

/**
 * Cevrim-tablosu §1 B6: her öğretmen için her ardışık pencere_sert_esigi'lik
 * dilim penceresinde en fazla (esik-1) pencere dilimine izin verir
 * (öğretmen başına bir varsayım anahtarı, tanılama modunda).
 */
function b6PencereUstSiniri(km: KisitModeli): void {
  const esik = km.okul.kural_ayarlari.pencere_sert_esigi;
  for (const ogretmen of km.okul.ogretmenler) {
    const varsayim = yeniVarsayim(km, `varsayim_b6_${ogretmen.ad}`, {
      tur: "B6",
      ogretmenAdi: ogretmen.ad,
    });
    for (const g of km.gunler) {
      for (const s of km.dilimler) {
        if (s + esik - 1 > km.okul.izgara.dilim_sayisi) break;
        const parcalar: PencereDegeri[] = [];
        for (let s2 = s; s2 < s + esik; s2 += 1) {
          parcalar.push(km.pencere.get(anahtar3(ogretmen.ad, g, s2))!);
        }
        const pencereToplami = LinearExpr.sum(parcalar);
        const kisit = km.model.add(LinearExpr.from(pencereToplami).le(esik - 1));
        if (varsayim !== null) kisit.onlyEnforceIf(varsayim);
      }
    }
  }
}

// B7 — Eşzamanlı ortak ders: ayrı bir kısıt GEREKMEZ. Birleştirilmiş
// (çok şubeli) bir DersAtamasi'nın tek bir dolu/basla kümesi vardır ve
// bu doluluk atama.subeler listesindeki TÜM şubelerin subeDolu
// toplamına aynı anda sayılır (bkz. b1Cakismazlik).

/**
 * Cevrim-tablosu §1 B8: sabitlenen ders atamalarının basla anahtarını 1'e
 * kilitler (varsayıma bağlanmaz — kullanıcı kararıdır, tartışmaya kapalıdır).
 */
function b8Sabitleme(km: KisitModeli): void {
  km.okul.ders_atamalari.forEach((atama, aIdx) => {
    if (!atama.sabit_dilimler || atama.sabit_dilimler.length === 0) return;
    atama.sabit_dilimler.forEach((konum, bIdx) => {
      const [g, s] = konum as [number, number];
      const anahtar = anahtar4(aIdx, bIdx, g, s);
      const degisken = km.basla.get(anahtar);
      if (degisken === undefined) {
        throw new Error(
          `${atama.ders} (${atama.subeler.join(", ")}) için sabitlenen ` +
            `(gün=${g}, dilim=${s}) konumu bu bloğun geçerli başlangıçları ` +
            `arasında değil (kapanış, ızgara sınırı ya da öğle arası ` +
            `kuralıyla çakışıyor): sabit_dilimler değerini düzeltin.`,
        );
      }
      km.model.add(degisken.eq(1));
    });
  });
}

/** Bir kapanış-bölünmesiz segment içindeki dilimler için pencere[ogretmen,gun,s] değişkenlerini kurar. */
function pencereSegmentKur(
  km: KisitModeli,
  ogretmen: Ogretmen,
  gun: number,
  segment: number[],
): void {
  segment.forEach((s, i) => {
    const calisiyorVar = km.calisiyor.get(anahtar3(ogretmen.ad, gun, s))!;
    const oncesi = segment.slice(0, i);
    const sonrasi = segment.slice(i + 1);
    if (oncesi.length === 0 || sonrasi.length === 0) {
      // Segmentin ilk/son dilimi: önünde ya da ardında ders olamaz,
      // tanım gereği pencere olamaz (sabit 0).
      km.pencere.set(anahtar3(ogretmen.ad, gun, s), 0);
      return;
    }

    const oncekiVar = km.model.newBoolVar(`onceki_ders_${ogretmen.ad}_${gun}_${s}`);
    km.model.addMaxEquality(
      oncekiVar,
      oncesi.map((s2) => km.calisiyor.get(anahtar3(ogretmen.ad, gun, s2))!),
    );
    const sonrakiVar = km.model.newBoolVar(`sonraki_ders_${ogretmen.ad}_${gun}_${s}`);
    km.model.addMaxEquality(
      sonrakiVar,
      sonrasi.map((s2) => km.calisiyor.get(anahtar3(ogretmen.ad, gun, s2))!),
    );

    const pencereVar = km.model.newBoolVar(`pencere_${ogretmen.ad}_${gun}_${s}`);
    km.model
      .addBoolAnd([calisiyorVar.not(), oncekiVar, sonrakiVar])
      .onlyEnforceIf(pencereVar);
    km.model
      .addBoolOr([calisiyorVar, oncekiVar.not(), sonrakiVar.not()])
      .onlyEnforceIf(pencereVar.not());
    km.pencere.set(anahtar3(ogretmen.ad, gun, s), pencereVar);
  });
}

/**
 * TANILAMA modunda: her (öğretmen, kapanış nedeni) grubu için bir varsayım
 * anahtarı kurar ve "bu dilimlerde ders olamaz" kısıtını buna bağlar.
 *
 * Taneciklik öğretmen×neden düzeyindedir (cevrim-tablosu.md §4) —
 * unsat core neden gruplarını birbirinden ayırt edebilsin diye.
 */
function kapanisVarsayimlariEkle(km: KisitModeli): void {
  for (const ogretmen of km.okul.ogretmenler) {
    const nedeneGore = new Map<KapanisNedeni, Array<[number, number]>>();
    for (const kapanis of ogretmen.kapanislar) {
      for (const dilim of kapanis.dilimler) {
        if (!nedeneGore.has(kapanis.neden)) nedeneGore.set(kapanis.neden, []);
        nedeneGore.get(kapanis.neden)!.push([kapanis.gun, dilim]);
      }
    }

    for (const [neden, gunDilimListesi] of nedeneGore) {
      const varsayim = yeniVarsayim(
        km,
        `varsayim_kapanis_${ogretmen.ad}_${neden}`,
        { tur: "KAPANIS", ogretmenAdi: ogretmen.ad, neden },
      );
      for (const [g, s] of gunDilimListesi) {
        const kisit = km.model.add(
          km.calisiyor.get(anahtar3(ogretmen.ad, g, s))!.eq(0),
        );
        if (varsayim !== null) kisit.onlyEnforceIf(varsayim);
      }
    }
  }
}

/**
 * Cevrim-tablosu §0'daki basla/dolu/calisiyor/subeDolu/gunBos/pencere
 * değişkenlerini kurar ve B1'i (BoolVar tanımıyla) örtük olarak uygular.
 *
 * tanilamaModu=false (varsayılan, HIZLI): kapanışlar B2 aracılığıyla
 * budanır, hiçbir varsayım anahtarı yaratılmaz. true: kapanışlar
 * budanmaz; her öğretmen×neden grubu için varsayım anahtarına bağlı
 * "dilim boş kalsın" kısıtı eklenir (bkz. kapanisVarsayimlariEkle).
 */
export function kurTemelDegiskenler(okul: Okul, tanilamaModu = false): KisitModeli {
  const model = new CpModel();
  const gunler = Array.from({ length: okul.izgara.gun_sayisi }, (_, i) => i + 1);
  const dilimler = Array.from({ length: okul.izgara.dilim_sayisi }, (_, i) => i + 1);
  const km: KisitModeli = {
    model,
    okul,
    gunler,
    dilimler,
    tanilamaModu,
    basla: new Map(),
    baslaGunIndeksi: new Map(),
    dolu: new Map(),
    calisiyor: new Map(),
    subeDolu: new Map(),
    gunBos: new Map(),
    pencere: new Map(),
    varsayimlar: [],
  };

  // basla[a,b,g,s] — HIZLI modda B2 uygulanmış; TANILAMA modunda
  // kapanışlar hariç tutulmaz. Her iki modda da: her blok tam bir kez
  // başlar (ExactlyOne) + simetri kırma.
  okul.ders_atamalari.forEach((atama, aIdx) => {
    const blokGecerlileri: Array<Array<[number, number]>> = [];
    atama.blok_deseni.forEach((uzunluk, bIdx) => {
      const gecerli = b2Kapanislar(
        okul,
        atama,
        uzunluk,
        gunler,
        dilimler,
        !tanilamaModu,
      );
      if (gecerli.length === 0) {
        throw new Error(
          `${atama.ders} (${atama.subeler.join(", ")}): ${uzunluk} saatlik ` +
            `blok için hiçbir uygun (gün, başlangıç) konumu yok -- ` +
            `ızgara sınırı ya da öğle arası kuralı tüm konumları kapatıyor.`,
        );
      }
      blokGecerlileri.push(gecerli);
      for (const [g, s] of gecerli) {
        const degisken = model.newBoolVar(`basla_a${aIdx}_b${bIdx}_g${g}_s${s}`);
        km.basla.set(anahtar4(aIdx, bIdx, g, s), degisken);
        const gunAnahtari = anahtar2(aIdx, g);
        if (!km.baslaGunIndeksi.has(gunAnahtari)) {
          km.baslaGunIndeksi.set(gunAnahtari, []);
        }
        km.baslaGunIndeksi.get(gunAnahtari)!.push([bIdx, s, degisken]);
      }
      model.addExactlyOne(
        gecerli.map(([g, s]) => km.basla.get(anahtar4(aIdx, bIdx, g, s))!),
      );
    });

    // Simetri kırma: aynı uzunluktaki ardışık bloklar için gün sırası
    // artan olsun — arama uzayı küçülür, çözüm kümesi değişmez.
    for (let bIdx = 0; bIdx < atama.blok_deseni.length - 1; bIdx += 1) {
      if (atama.blok_deseni[bIdx] === atama.blok_deseni[bIdx + 1]) {
        const gunB = LinearExpr.weightedSum(
          blokGecerlileri[bIdx]!.map(([g, s]) =>
            km.basla.get(anahtar4(aIdx, bIdx, g, s))!,
          ),
          blokGecerlileri[bIdx]!.map(([g]) => g),
        );
        const gunB1 = LinearExpr.weightedSum(
          blokGecerlileri[bIdx + 1]!.map(([g, s]) =>
            km.basla.get(anahtar4(aIdx, bIdx + 1, g, s))!,
          ),
          blokGecerlileri[bIdx + 1]!.map(([g]) => g),
        );
        model.add(LinearExpr.from(gunB).le(gunB1));
      }
    }
  });

  // dolu[a,g,s] — bloğun kapladığı dilimlere basla'nın yayılımı
  // (B4 sayesinde eşitlik olarak bağlanır). Kapsama haritası basla
  // üzerinden TEK geçişte kurulur (gün indeksi notuna bakınız).
  const kapsayanHaritasi = new Map<string, BoolVar[]>();
  for (const [anahtar, degisken] of km.basla) {
    const [aIdx, bIdx, g, s0] = anahtar.split("|").map(Number) as [
      number,
      number,
      number,
      number,
    ];
    const uzunluk = okul.ders_atamalari[aIdx]!.blok_deseni[bIdx]!;
    for (let s = s0; s < s0 + uzunluk; s += 1) {
      const kapsamAnahtari = anahtar3(aIdx, g, s);
      if (!kapsayanHaritasi.has(kapsamAnahtari)) {
        kapsayanHaritasi.set(kapsamAnahtari, []);
      }
      kapsayanHaritasi.get(kapsamAnahtari)!.push(degisken);
    }
  }
  okul.ders_atamalari.forEach((_atama, aIdx) => {
    for (const g of gunler) {
      for (const s of dilimler) {
        const kapsayanlar = kapsayanHaritasi.get(anahtar3(aIdx, g, s));
        const doluVar = model.newBoolVar(`dolu_a${aIdx}_g${g}_s${s}`);
        if (kapsayanlar !== undefined && kapsayanlar.length > 0) {
          model.add(doluVar.eq(LinearExpr.sum(kapsayanlar)));
        } else {
          model.add(doluVar.eq(0));
        }
        km.dolu.set(anahtar3(aIdx, g, s), doluVar);
      }
    }
  });

  // calisiyor[t,g,s] / subeDolu[c,g,s] — B1 çakışmazlığıyla birlikte.
  b1Cakismazlik(km);

  // TANILAMA modunda: kapanışların etkisi burada, varsayım anahtarlı
  // kısıt olarak eklenir (HIZLI modda zaten B2 ile budanmıştı).
  if (tanilamaModu) {
    kapanisVarsayimlariEkle(km);
  }

  // gunBos[t,g] — açıksa o gün Σ calisiyor = 0. Tek yön (=>) B3 için
  // yeterli; ters yön de eklenir ki gunBos ileride (C1) güvenle
  // "gün gerçekten boş mu" anlamında okunabilsin.
  for (const ogretmen of okul.ogretmenler) {
    for (const g of gunler) {
      const degisken = model.newBoolVar(`gun_bos_${ogretmen.ad}_${g}`);
      const toplam = LinearExpr.from(
        LinearExpr.sum(
          dilimler.map((s) => km.calisiyor.get(anahtar3(ogretmen.ad, g, s))!),
        ),
      );
      model.add(toplam.eq(0)).onlyEnforceIf(degisken);
      model.add(toplam.ge(1)).onlyEnforceIf(degisken.not());
      km.gunBos.set(anahtar2(ogretmen.ad, g), degisken);
    }
  }

  // pencere[t,g,s] — kapanış-bölünmesiz segmentler içinde kurulur;
  // "pencereyi bölen" kapanış (Karar 12) segmenti ikiye ayırır.
  // (Not: TANILAMA modunda kapanış dilimlerinde de calisiyor=0
  // varsayımla sağlandığından, segment hesaplaması her iki modda da
  // aynı veri — ogretmen.kapanislar — üzerinden yapılabilir.)
  for (const ogretmen of okul.ogretmenler) {
    const kapanislar = kapanisDilimleri(ogretmen);
    const bolmeyenNedenler = okul.kural_ayarlari.pencereyi_bolmeyen_nedenler;
    for (const g of gunler) {
      let segment: number[] = [];
      for (const s of dilimler) {
        const neden = kapanislar.get(anahtar2(g, s));
        const bolen = neden !== undefined && !bolmeyenNedenler.has(neden);
        if (bolen) {
          pencereSegmentKur(km, ogretmen, g, segment);
          segment = [];
          // Bölen kapanış dilimi hiçbir segmente girmez, kendisi asla
          // pencere sayılmaz (sabit 0) — B6'nın kayan penceresi her
          // dilime bakacağından anahtar eksik kalmasın.
          km.pencere.set(anahtar3(ogretmen.ad, g, s), 0);
        } else {
          segment.push(s);
        }
      }
      pencereSegmentKur(km, ogretmen, g, segment);
    }
  }

  return km;
}

/** B3, B4, B6, B8'i sırayla modele ekler (B1/B2 zaten kurTemelDegiskenler içinde; B5/B7 çözücü kısıtı gerektirmez). */
export function sertKurallariUygula(km: KisitModeli): void {
  b3BosGunGarantisi(km);
  b4AyriGuneDagilim(km);
  b6PencereUstSiniri(km);
  b8Sabitleme(km);
}

// --- C-katmanı: yumuşak kısıtlar (kisit-envanteri.md §4-C) -----------------
//
// Her kural bir fonksiyon; her fonksiyon etiketli CezaTerimi listesi
// döndürür. Amaç fonksiyonuna girmezler — katmanlama ve ağırlıklandırma
// coz.kademeliCoz'un işidir.
//
// ÖNEMLİ modelleme ilkesi — çift yönlü kanal: her ceza değişkeni gerçek
// duruma İKİ YÖNLÜ eşitlenir ("ceza=1 <=> ihlal var"). Gerekçe için
// kisitlar.py'deki C-katmanı modül yorumuna bakınız (Geçiş 2 kilidi ve
// karne mutabakatı gevşek değişkene tahammül edemez).
//
// Rehberlik muafiyeti: REHBERLIK_DIGER kategorisindeki atamalar C2 ve
// C5 sayımlarına girmez.

/**
 * Tek bir yumuşak-kısıt ceza teriminin etiketlerini ve çözücü değişkenini tutar.
 *
 * Terimin koşudaki fiili cezası = katsayi × degisken değeri;
 * ustSinir = katsayi × değişkenin üst sınırı (baskınlık ağırlığı
 * hesabının girdisi). Etiket alanları karne kırılımını besler.
 */
export interface CezaTerimi {
  kural: string;
  katsayi: number;
  degisken: IntVar;
  ustSinir: number;
  ogretmen?: string | null;
  sube?: string | null;
  gun?: number | null;
}

export const UST_KATMAN_SIRASI = ["C1", "C2", "C3"];
export const ALT_KATMAN_SIRASI = ["C4", "C5", "C6", "C7", "C8"];

/** C2/C5 sayımından muaf (REHBERLIK_DIGER kategorili) atamaların indekslerini döndürür. */
function c2C5MuafAtamaIndeksleri(okul: Okul): Set<number> {
  const kategori = new Map(okul.dersler.map((d) => [d.ad, d.kategori]));
  const muaf = new Set<number>();
  okul.ders_atamalari.forEach((atama, aIdx) => {
    if (kategori.get(atama.ders) === "REHBERLIK_DIGER") muaf.add(aIdx);
  });
  return muaf;
}

/**
 * (öğretmen|şube) çiftlerinden o çifte ait C2/C5-sayılır atama indekslerine
 * sözlük kurar. Dönen Map'in anahtar listesi Python'daki sorted(...)
 * gezinme sırasıyla eşleşsin diye sıralı kurulur.
 */
function ogretmenSubeAtamalari(okul: Okul): Map<string, number[]> {
  const muaf = c2C5MuafAtamaIndeksleri(okul);
  const ciftler = new Map<string, [string, string, number[]]>();
  okul.ders_atamalari.forEach((atama, aIdx) => {
    if (muaf.has(aIdx)) return;
    for (const ogretmenAd of atama.ogretmenler) {
      for (const subeAd of atama.subeler) {
        const anahtar = anahtar2(ogretmenAd, subeAd);
        if (!ciftler.has(anahtar)) {
          ciftler.set(anahtar, [ogretmenAd, subeAd, []]);
        }
        ciftler.get(anahtar)![2].push(aIdx);
      }
    }
  });
  // Python: sorted(dict.items()) — (öğretmen, şube) çiftine göre eleman
  // bazlı sıralama. Türkçe adlar BMP içinde kaldığından JS'in kod birimi
  // sıralaması Python'un kod noktası sıralamasıyla aynı sonucu verir.
  const sirali = [...ciftler.values()].sort((a, b) => {
    if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
    if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
    return 0;
  });
  return new Map(sirali.map(([o, s, liste]) => [anahtar2(o, s), liste]));
}

/**
 * Kisit-envanteri C1: boş günü tercih ettiği güne denk gelmeyen öğretmene
 * 1 ceza (tercihi olmayana terim kurulmaz).
 *
 * gunBos çift yönlü kanallı olduğundan ceza = 1 - gunBos eşitliği
 * yeterlidir. B3'ten muaf öğretmenin de tercihi varsa terim kurulur:
 * boş günü garanti değildir ama tercih günü denk gelirse ödüllenir.
 */
function c1BosGunTercihGunu(km: KisitModeli): CezaTerimi[] {
  const terimler: CezaTerimi[] = [];
  for (const ogretmen of km.okul.ogretmenler) {
    const g = ogretmen.bos_gun_tercihi;
    if (g === null || !km.gunler.includes(g)) continue;
    const ceza = km.model.newBoolVar(`ceza_c1_${ogretmen.ad}`);
    km.model.add(
      ceza.eq(LinearExpr.affine(km.gunBos.get(anahtar2(ogretmen.ad, g))!, -1, 1)),
    );
    terimler.push({
      kural: "C1",
      katsayi: 1,
      degisken: ceza,
      ustSinir: 1,
      ogretmen: ogretmen.ad,
      gun: g,
    });
  }
  return terimler;
}

/**
 * Kisit-envanteri C2: öğretmenin aynı şubeye bir günde girdiği toplam saat
 * sınırı; sınır üstü her saat 1 ceza.
 *
 * Ceza değişkeni max(0, günlük toplam - sınır) değerine İKİ YÖNLÜ
 * eşitlenir (addMaxEquality). Çiftin haftalık toplamı zaten sınırı
 * aşamıyorsa hiç terim kurulmaz (ceza yapısal 0).
 */
function c2GunlukToplamSiniri(km: KisitModeli): CezaTerimi[] {
  const sinir = km.okul.kural_ayarlari.ogretmen_sube_gunluk_toplam;
  const terimler: CezaTerimi[] = [];
  for (const [ciftAnahtari, atamaIndeksleri] of ogretmenSubeAtamalari(km.okul)) {
    const [ogretmenAd, subeAd] = ciftAnahtari.split("|") as [string, string];
    const haftalik = atamaIndeksleri.reduce(
      (toplam, i) => toplam + km.okul.ders_atamalari[i]!.haftalik_saat,
      0,
    );
    const gunlukTavan = Math.min(haftalik, km.okul.izgara.dilim_sayisi);
    if (gunlukTavan <= sinir) continue;
    for (const g of km.gunler) {
      const doluVarlari: BoolVar[] = [];
      for (const i of atamaIndeksleri) {
        for (const s of km.dilimler) {
          doluVarlari.push(km.dolu.get(anahtar3(i, g, s))!);
        }
      }
      const fark = km.model.newIntVar(
        -sinir,
        gunlukTavan - sinir,
        `c2_fark_${ogretmenAd}_${subeAd}_${g}`,
      );
      km.model.add(fark.eq(LinearExpr.from(LinearExpr.sum(doluVarlari)).plus(-sinir)));
      const asim = km.model.newIntVar(
        0,
        gunlukTavan - sinir,
        `ceza_c2_${ogretmenAd}_${subeAd}_${g}`,
      );
      km.model.addMaxEquality(asim, [fark, km.model.newConstant(0)]);
      terimler.push({
        kural: "C2",
        katsayi: 1,
        degisken: asim,
        ustSinir: gunlukTavan - sinir,
        ogretmen: ogretmenAd,
        sube: subeAd,
        gun: g,
      });
    }
  }
  return terimler;
}

/**
 * Bir öğretmenin gününde kosuUzunlugu ardışık pencere dilimi oluşan her
 * konum için çift yönlü kanallı 1 ceza kurar (C3'ün yardımcısı).
 */
function pencereKosusuTerimleri(
  km: KisitModeli,
  kural: string,
  kosuUzunlugu: number,
): CezaTerimi[] {
  const terimler: CezaTerimi[] = [];
  for (const ogretmen of km.okul.ogretmenler) {
    for (const g of km.gunler) {
      for (const s of km.dilimler) {
        if (s + kosuUzunlugu - 1 > km.okul.izgara.dilim_sayisi) break;
        const pencereler: PencereDegeri[] = [];
        for (let s2 = s; s2 < s + kosuUzunlugu; s2 += 1) {
          pencereler.push(km.pencere.get(anahtar3(ogretmen.ad, g, s2))!);
        }
        // Segment sınırındaki sabit 0'lar koşuyu imkânsız kılar.
        if (pencereler.some((p) => typeof p === "number")) continue;
        const boolPencereler = pencereler as BoolVar[];
        const kosu = km.model.newBoolVar(
          `ceza_${kural.toLowerCase()}_${ogretmen.ad}_${g}_${s}`,
        );
        km.model.addBoolAnd(boolPencereler).onlyEnforceIf(kosu);
        km.model
          .addBoolOr(boolPencereler.map((p) => p.not()))
          .onlyEnforceIf(kosu.not());
        terimler.push({
          kural,
          katsayi: 1,
          degisken: kosu,
          ustSinir: 1,
          ogretmen: ogretmen.ad,
          gun: g,
        });
      }
    }
  }
  return terimler;
}

/** Kisit-envanteri C3: 3 ardışık pencere dilimi oluşan her konuma yüksek katman cezası (≥4 zaten SERT, B6). */
function c3UcSaatlikPencere(km: KisitModeli): CezaTerimi[] {
  return pencereKosusuTerimleri(km, "C3", 3);
}

/** Kisit-envanteri C4: öğretmenin bir günde toplam 1 saat dersi olması (1 saat için okula gelme) 1 ceza. */
function c4TekSaatlikGun(km: KisitModeli): CezaTerimi[] {
  const terimler: CezaTerimi[] = [];
  for (const ogretmen of km.okul.ogretmenler) {
    for (const g of km.gunler) {
      const toplam = LinearExpr.from(
        LinearExpr.sum(
          km.dilimler.map((s) => km.calisiyor.get(anahtar3(ogretmen.ad, g, s))!),
        ),
      );
      const tekli = km.model.newBoolVar(`ceza_c4_${ogretmen.ad}_${g}`);
      km.model.add(toplam.eq(1)).onlyEnforceIf(tekli);
      km.model.add(toplam.ne(1)).onlyEnforceIf(tekli.not());
      terimler.push({
        kural: "C4",
        katsayi: 1,
        degisken: tekli,
        ustSinir: 1,
        ogretmen: ogretmen.ad,
        gun: g,
      });
    }
  }
  return terimler;
}

/**
 * Kisit-envanteri C5: öğretmenin aynı şubede sınır+1 ardışık dilim
 * doldurduğu her konuma, dilimlerin tümü TEK bloğa ait değilse 1 ceza
 * (blok içi muaf).
 *
 * "Farklı-atama zinciri" modellemesi: kisitlar.py c5 yorumuna bakınız
 * (zincir_dolu + ayni_blok çift yönlü kanallanır; ceza <=> zincir_dolu
 * VE DEĞİL ayni_blok).
 */
function c5ArdisiklikSiniri(km: KisitModeli): CezaTerimi[] {
  const sinir = km.okul.kural_ayarlari.ardisiklik_siniri;
  const pencereBoyu = sinir + 1;
  const terimler: CezaTerimi[] = [];
  for (const [ciftAnahtari, atamaIndeksleri] of ogretmenSubeAtamalari(km.okul)) {
    const [ogretmenAd, subeAd] = ciftAnahtari.split("|") as [string, string];
    const haftalik = atamaIndeksleri.reduce(
      (toplam, i) => toplam + km.okul.ders_atamalari[i]!.haftalik_saat,
      0,
    );
    if (haftalik < pencereBoyu) continue;
    for (const g of km.gunler) {
      for (const s of km.dilimler) {
        if (s + pencereBoyu - 1 > km.okul.izgara.dilim_sayisi) break;
        const doluluklar: BoolVar[] = [];
        for (const i of atamaIndeksleri) {
          for (let s2 = s; s2 < s + pencereBoyu; s2 += 1) {
            doluluklar.push(km.dolu.get(anahtar3(i, g, s2))!);
          }
        }
        const zincirDolu = km.model.newBoolVar(
          `c5_zincir_${ogretmenAd}_${subeAd}_${g}_${s}`,
        );
        const doluluk = LinearExpr.from(LinearExpr.sum(doluluklar));
        km.model.add(doluluk.eq(pencereBoyu)).onlyEnforceIf(zincirDolu);
        km.model.add(doluluk.le(pencereBoyu - 1)).onlyEnforceIf(zincirDolu.not());

        const kapsayanlar: BoolVar[] = [];
        for (const aIdx of atamaIndeksleri) {
          for (const [bIdx, s0, degisken] of
            km.baslaGunIndeksi.get(anahtar2(aIdx, g)) ?? []) {
            if (
              s0 <= s &&
              s0 + km.okul.ders_atamalari[aIdx]!.blok_deseni[bIdx]! - 1 >=
                s + pencereBoyu - 1
            ) {
              kapsayanlar.push(degisken);
            }
          }
        }
        const ceza = km.model.newBoolVar(`ceza_c5_${ogretmenAd}_${subeAd}_${g}_${s}`);
        if (kapsayanlar.length > 0) {
          const ayniBlok = km.model.newBoolVar(
            `c5_ayni_blok_${ogretmenAd}_${subeAd}_${g}_${s}`,
          );
          km.model.addMaxEquality(ayniBlok, kapsayanlar);
          km.model.addBoolAnd([zincirDolu, ayniBlok.not()]).onlyEnforceIf(ceza);
          km.model.addBoolOr([zincirDolu.not(), ayniBlok]).onlyEnforceIf(ceza.not());
        } else {
          km.model.add(ceza.eq(zincirDolu));
        }
        terimler.push({
          kural: "C5",
          katsayi: 1,
          degisken: ceza,
          ustSinir: 1,
          ogretmen: ogretmenAd,
          sube: subeAd,
          gun: g,
        });
      }
    }
  }
  return terimler;
}

/**
 * Kisit-envanteri C6: her pencere dilimine hafif (birim) ceza.
 *
 * Modelleme notu: ceza pencere-başına değil DİLİM-başına verilir.
 * 3 saatlik pencerenin dilimleri de burada sayılır; C3 aynı pencereyi
 * üst katmanda ayrıca cezalandırır — bilinçli üst üste binme.
 */
function c6PencereDilimCezasi(km: KisitModeli): CezaTerimi[] {
  const terimler: CezaTerimi[] = [];
  for (const [anahtar, p] of km.pencere) {
    if (typeof p === "number") continue;
    const [ogretmenAd, g] = anahtar.split("|") as [string, string, string];
    terimler.push({
      kural: "C6",
      katsayi: 1,
      degisken: p,
      ustSinir: 1,
      ogretmen: ogretmenAd,
      gun: Number(g),
    });
  }
  return terimler;
}

/**
 * Kisit-envanteri C7: aynı şubede aynı kategoriden iki FARKLI ders ardışık
 * dilimlere düşerse 1 ceza (blok içi muaf; DIL kategorisi tamamen muaf).
 *
 * Modelleme ayrıntısı için kisitlar.py c7 yorumuna bakınız (cift_dolu +
 * kopru kanallanır; ceza <=> cift_dolu VE DEĞİL kopru).
 */
function c7KategoriArdisikligi(km: KisitModeli): CezaTerimi[] {
  const kategori = new Map(km.okul.dersler.map((d) => [d.ad, d.kategori]));
  const terimler: CezaTerimi[] = [];
  for (const sube of km.okul.subeler) {
    for (const kat of DERS_KATEGORILERI) {
      if (kat === "DIL") continue;
      const ilgili: number[] = [];
      km.okul.ders_atamalari.forEach((atama, aIdx) => {
        if (atama.subeler.includes(sube.ad) && kategori.get(atama.ders) === kat) {
          ilgili.push(aIdx);
        }
      });
      const farkliDersler = new Set(
        ilgili.map((i) => km.okul.ders_atamalari[i]!.ders),
      );
      if (farkliDersler.size < 2) continue; // Tek ders: ya blok içi ya imkânsız (B4).
      for (const g of km.gunler) {
        for (const s of km.dilimler.slice(0, -1)) {
          const cift: BoolVar[] = [];
          for (const i of ilgili) {
            for (const s2 of [s, s + 1]) {
              cift.push(km.dolu.get(anahtar3(i, g, s2))!);
            }
          }
          const ciftDolu = km.model.newBoolVar(`c7_cift_${sube.ad}_${kat}_${g}_${s}`);
          const ciftToplami = LinearExpr.from(LinearExpr.sum(cift));
          km.model.add(ciftToplami.eq(2)).onlyEnforceIf(ciftDolu);
          km.model.add(ciftToplami.le(1)).onlyEnforceIf(ciftDolu.not());

          const kapsayanlar: BoolVar[] = [];
          for (const aIdx of ilgili) {
            for (const [bIdx, s0, degisken] of
              km.baslaGunIndeksi.get(anahtar2(aIdx, g)) ?? []) {
              if (
                s0 <= s &&
                s0 + km.okul.ders_atamalari[aIdx]!.blok_deseni[bIdx]! - 1 >= s + 1
              ) {
                kapsayanlar.push(degisken);
              }
            }
          }
          const ceza = km.model.newBoolVar(`ceza_c7_${sube.ad}_${kat}_${g}_${s}`);
          if (kapsayanlar.length > 0) {
            const kopru = km.model.newBoolVar(`c7_kopru_${sube.ad}_${kat}_${g}_${s}`);
            km.model.addMaxEquality(kopru, kapsayanlar);
            km.model.addBoolAnd([ciftDolu, kopru.not()]).onlyEnforceIf(ceza);
            km.model.addBoolOr([ciftDolu.not(), kopru]).onlyEnforceIf(ceza.not());
          } else {
            km.model.add(ceza.eq(ciftDolu));
          }
          terimler.push({
            kural: "C7",
            katsayi: 1,
            degisken: ceza,
            ustSinir: 1,
            sube: sube.ad,
            gun: g,
          });
        }
      }
    }
  }
  return terimler;
}

/**
 * Kisit-envanteri C8: sayısal dersler sabaha, sanat-spor son saatlere —
 * kategoriye göre dilim ceza vektörü × doluluk.
 *
 * Yeni değişken kurulmaz: dolu zaten çift yönlü kanallıdır; terim,
 * katsayısı vektörden gelen mevcut dolu değişkenidir.
 */
function c8DilimTercihleri(km: KisitModeli): CezaTerimi[] {
  const kategori = new Map(km.okul.dersler.map((d) => [d.ad, d.kategori]));
  const vektorler = new Map<DersKategorisi, number[]>([
    ["SAYISAL", km.okul.kural_ayarlari.sayisal_dilim_cezasi],
    ["SANAT_SPOR", km.okul.kural_ayarlari.sanat_spor_dilim_cezasi],
  ]);
  const terimler: CezaTerimi[] = [];
  km.okul.ders_atamalari.forEach((atama, aIdx) => {
    const kat = kategori.get(atama.ders);
    const vektor = kat === undefined ? undefined : vektorler.get(kat);
    if (vektor === undefined) return;
    const subeEtiketi = atama.subeler.join(",");
    for (const g of km.gunler) {
      for (const s of km.dilimler) {
        const katsayi = s - 1 < vektor.length ? vektor[s - 1]! : 0;
        if (katsayi <= 0) continue;
        terimler.push({
          kural: "C8",
          katsayi,
          degisken: km.dolu.get(anahtar3(aIdx, g, s))!,
          ustSinir: katsayi,
          ogretmen: atama.ogretmenler.length > 0 ? atama.ogretmenler[0]! : null,
          sube: subeEtiketi,
          gun: g,
        });
      }
    }
  });
  return terimler;
}

/**
 * C1-C8 ceza terimlerini kurup kural adına göre sözlükte toplar (amaç
 * fonksiyonu kurmaz — o coz.kademeliCoz'un işidir).
 *
 * KuralAyarlari.kapali_kurallar kümesindeki kurallar hiç kurulmaz:
 * sözlükte boş listeyle yer alırlar (katman toplamına 0 katkı,
 * baskınlık hesabında 0 tavan); denetçi mutabakatı da aynı kümeyi
 * gözettiğinden kapalı kural karnede "kapalı" görünür.
 */
export function yumusakKurallariKur(km: KisitModeli): Map<string, CezaTerimi[]> {
  const kurucular: Array<[string, (km: KisitModeli) => CezaTerimi[]]> = [
    ["C1", c1BosGunTercihGunu],
    ["C2", c2GunlukToplamSiniri],
    ["C3", c3UcSaatlikPencere],
    ["C4", c4TekSaatlikGun],
    ["C5", c5ArdisiklikSiniri],
    ["C6", c6PencereDilimCezasi],
    ["C7", c7KategoriArdisikligi],
    ["C8", c8DilimTercihleri],
  ];
  const kapali = km.okul.kural_ayarlari.kapali_kurallar;
  return new Map(
    kurucular.map(([kural, kurucu]) => [kural, kapali.has(kural) ? [] : kurucu(km)]),
  );
}

/**
 * Katman içi öncelik sırası için baskınlık ağırlıklarını hesaplar.
 *
 * İlke (onaylı uygulama kararı): bir kuralın birim cezası, kendinden
 * düşük öncelikli TÜM kuralların ulaşabileceği ağırlıklı toplam
 * cezadan büyük olmalı — böylece üstteki kuralın 1 birim iyileşmesi
 * alttakilerin hiçbir kombinasyonuyla takas edilemez. Ağırlıklar elle
 * sabitlenmez; her koşuda terimlerin üst sınırlarından hesaplanır.
 */
export function baskinlikAgirliklari(
  oncelikSirasi: string[],
  terimler: Map<string, CezaTerimi[]>,
): Map<string, number> {
  const agirliklar = new Map<string, number>();
  let altAgirlikliTavan = 0;
  for (const kural of [...oncelikSirasi].reverse()) {
    agirliklar.set(kural, altAgirlikliTavan + 1);
    const kuralTavani = (terimler.get(kural) ?? []).reduce(
      (toplam, t) => toplam + t.ustSinir,
      0,
    );
    altAgirlikliTavan += agirliklar.get(kural)! * kuralTavani;
  }
  return agirliklar;
}
