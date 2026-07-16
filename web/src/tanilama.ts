/**
 * Unsat core'un Türkçe eylem cümlesine çevrimi — deney/tanilama.py çevirisi.
 *
 * Python gerçeklemesi referanstır (Karar 22); saf metin fonksiyonları
 * (iyelik eki, gün listesi, çekirdek cümleleri, muafiyet metni) altın
 * testlerle bire bir sabitlenir (veri/altin/tanilama_beklenen.json).
 * Çözücüye bağlı davranışlar (core içeriği, öneri doğrulama) altın
 * DEĞİLDİR — core minimaldir ama tekil değildir; onlar iki tarafta
 * aynalanmış davranış testleriyle korunur (test_tanilama.py karşılığı:
 * web/test/tanilama.test.ts).
 *
 * Akış (kararlar.md Karar 13/14/15/21): hızlı mod UNSAT ise model
 * tanılama modunda yeniden kurulur; sufficient_assumptions çekirdeği
 * Türkçe rapora çevrilir; gevşetme adayları basamak sırasıyla üretilip
 * her biri hipotetik olarak yeniden çözülür; muafiyet basamağı sınırlı
 * yinelemeli teşhisle çalışır.
 *
 * Python'dan bilinçli sapmalar (davranış değil, mekanik):
 *   - Çözücü çağrıları async'tir; tanila() Promise<string> döndürür.
 *   - deepcopy yerine structuredClone (Set alanları korunur).
 */

import { CpSolver } from "or-tools-wasm/cp-sat";

import type { DersAtamasi, KapanisNedeni, Okul } from "./model.js";
import {
  aKatmaniDogrulama,
  ogretmenKapasitesi,
} from "./model.js";
import type { VarsayimAnahtari } from "./kisitlar.js";
import {
  b2Kapanislar,
  kurTemelDegiskenler,
  sertKurallariUygula,
} from "./kisitlar.js";

const GUN_ADLARI_KUCUK = ["pazartesi", "salı", "çarşamba", "perşembe", "cuma"];

/** Enum adları kullanıcı metnine sızmaz; okunaklı Türkçe karşılıklar. */
const NEDEN_KULLANICI_METNI: Record<KapanisNedeni, string> = {
  DIS_OKUL: "dış okul görevi (başka okuldaki dersleri)",
  BOS_GUN: "planlı boş gün düzenlemesi",
  IDARI: "idari görev",
  KISISEL_TERCIH: "kişisel tercih günü/saatleri",
};

const MAKS_ADAY_ATAMA_BASINA_DESEN = 2;
const MAKS_ADAY_ATAMA_BASINA_YUK_DEVRI = 2;
const MAKS_TOPLAM_DENEME = 12;
const MAKS_EK_DENEME_MUAFIYET = 4;
const MAKS_EK_DENEME_IDARI = 3;

const KALIN_DUZ = new Set("aı");
const INCE_DUZ = new Set("ei");
const KALIN_YUVARLAK = new Set("ou");
const INCE_YUVARLAK = new Set("öü");
const UNLULER = new Set([...KALIN_DUZ, ...INCE_DUZ, ...KALIN_YUVARLAK, ...INCE_YUVARLAK]);

/**
 * Bir özel adı Türkçe ünlü uyumuna uygun iyelik ekiyle birleştirir
 * (örn. "Aylin Kaptan" -> "Aylin Kaptan'ın"); tanilama.py _iyelik_eki ikizi.
 */
export function iyelikEki(ad: string): string {
  const kelimeler = ad.split(" ").filter((k) => k.length > 0);
  const sonKelime = kelimeler.length > 0 ? kelimeler[kelimeler.length - 1]! : ad;
  const kucuk = sonKelime.toLocaleLowerCase("tr");
  let sonUnlu: string | null = null;
  for (let i = kucuk.length - 1; i >= 0; i--) {
    if (UNLULER.has(kucuk[i]!)) {
      sonUnlu = kucuk[i]!;
      break;
    }
  }

  let ek: string;
  if (sonUnlu !== null && KALIN_DUZ.has(sonUnlu)) ek = "ın";
  else if (sonUnlu !== null && KALIN_YUVARLAK.has(sonUnlu)) ek = "un";
  else if (sonUnlu !== null && INCE_YUVARLAK.has(sonUnlu)) ek = "ün";
  else ek = "in";

  const sonHarf = sonKelime[sonKelime.length - 1]!.toLocaleLowerCase("tr");
  if (UNLULER.has(sonHarf)) return `${ad}'n${ek}`;
  return `${ad}'${ek}`;
}

/** Gün indeksini (1-5) küçük harfli Türkçe gün adına çevirir. */
function gunAdiKucuk(gun: number): string {
  return gun >= 1 && gun <= GUN_ADLARI_KUCUK.length
    ? GUN_ADLARI_KUCUK[gun - 1]!
    : `${gun}. gün`;
}

/** Gün indekslerini "ve" bağlaçlı okunaklı Türkçe listeye çevirir. */
export function gunleriMetneCevir(gunler: number[]): string {
  const adlar = [...new Set(gunler)].sort((a, b) => a - b).map(gunAdiKucuk);
  if (adlar.length === 0) return "";
  if (adlar.length === 1) return adlar[0]!;
  return adlar.slice(0, -1).join(", ") + " ve " + adlar[adlar.length - 1];
}

/** Bir öğretmenin belirli nedenli kapanışlarının düştüğü günleri (tekrarsız, sıralı) döndürür. */
function kapanisGunleriniBul(okul: Okul, ogretmenAdi: string, neden: KapanisNedeni): number[] {
  const ogretmen = okul.ogretmenler.find((o) => o.ad === ogretmenAdi)!;
  return [...new Set(
    ogretmen.kapanislar.filter((k) => k.neden === neden).map((k) => k.gun),
  )].sort((a, b) => a - b);
}

/**
 * Modeli TANILAMA modunda kurar, çözer ve (varsa) çözümsüzlüğe yeten
 * varsayım anahtarlarını döndürür.
 */
export async function tanilamaModundaCoz(
  okul: Okul,
): Promise<{ cozucu: CpSolver; cekirdek: VarsayimAnahtari[] }> {
  const km = kurTemelDegiskenler(okul, true);
  sertKurallariUygula(km);

  const cozucu = new CpSolver();
  const durum = await cozucu.solve(km.model, {
    maxTimeInSeconds: 60,
    numSearchWorkers: 1,
  });

  if (cozucu.statusName(durum) !== "INFEASIBLE") {
    return { cozucu, cekirdek: [] };
  }

  const indexToVarsayim = new Map(km.varsayimlar.map((va) => [va.literal.index, va]));
  const cekirdekIndex =
    cozucu.response()?.sufficientAssumptionsForInfeasibility ?? [];
  const cekirdek = cekirdekIndex
    .map((i) => indexToVarsayim.get(Number(i)))
    .filter((va): va is VarsayimAnahtari => va !== undefined);
  return { cozucu, cekirdek };
}

// --- Ana teşhis cümleleri (kural kodları burada geçmez; bkz. teknikReferans) --

/** Bir atamanın en uzun bloğu için, kapanışlara göre en az bir geçerli başlangıcı olan günler. */
function b4UygunGunler(okul: Okul, atamaIndex: number): number[] {
  const atama = okul.ders_atamalari[atamaIndex]!;
  const enUzun = Math.max(...atama.blok_deseni);
  const gunler = Array.from({ length: okul.izgara.gun_sayisi }, (_, i) => i + 1);
  const dilimler = Array.from({ length: okul.izgara.dilim_sayisi }, (_, i) => i + 1);
  const gecerli = b2Kapanislar(okul, atama, enUzun, gunler, dilimler, true);
  return [...new Set(gecerli.map(([g]) => g))].sort((a, b) => a - b);
}

function b3Cumlesi(okul: Okul, ogretmenAdi: string, kapanisNedenleri: KapanisNedeni[]): string {
  if (kapanisNedenleri.length === 0) {
    return (
      `${iyelikEki(ogretmenAdi)} haftada en az bir tam boş günü garanti ` +
      `edilemiyor: mevcut ders yüküyle hiçbir gün tamamen boşaltılamıyor.`
    );
  }
  const parcalar = kapanisNedenleri.map(
    (neden) =>
      `${gunleriMetneCevir(kapanisGunleriniBul(okul, ogretmenAdi, neden))} ` +
      `günlerindeki ${NEDEN_KULLANICI_METNI[neden]}`,
  );
  return (
    `${iyelikEki(ogretmenAdi)} boş gün garantisi, ` +
    parcalar.join(" ve ") +
    ` ile birlikte sağlanamıyor.`
  );
}

function b6Cumlesi(okul: Okul, ogretmenAdi: string, kapanisNedenleri: KapanisNedeni[]): string {
  if (kapanisNedenleri.length === 0) {
    return (
      `${ogretmenAdi} için bir günde 4 saatten uzun boş bekleme oluşmaması ` +
      `kuralı sağlanamıyor: mevcut ders dağılımıyla bazı günlerde art arda ` +
      `çok uzun boşluk çıkıyor.`
    );
  }
  const parcalar = kapanisNedenleri.map(
    (neden) =>
      `${gunleriMetneCevir(kapanisGunleriniBul(okul, ogretmenAdi, neden))} ` +
      `günlerindeki ${NEDEN_KULLANICI_METNI[neden]}`,
  );
  return (
    `${ogretmenAdi} için uzun bekleme yasağı, ` +
    parcalar.join(" ve ") +
    ` ile birlikte sağlanamıyor.`
  );
}

function b4Cumlesi(okul: Okul, atamaIndex: number): string {
  const atama = okul.ders_atamalari[atamaIndex]!;
  const gerekli = atama.blok_deseni.length;
  const uygunGunler = b4UygunGunler(okul, atamaIndex);
  const gunEki = uygunGunler.length > 0 ? ` (${gunleriMetneCevir(uygunGunler)})` : "";
  return (
    `${atama.ders} dersinin (${atama.subeler.join(", ")}) bloklarının her biri ` +
    `ayrı bir güne düşmeli: ${gerekli} ayrı gün gerekiyor; yalnız ` +
    `${uygunGunler.length} uygun gün var${gunEki}.`
  );
}

/** Çekirdeği, her biri bir neden cümlesi olacak şekilde Türkçeye çevirir. */
export function cekirdekCumleleri(okul: Okul, cekirdek: VarsayimAnahtari[]): string[] {
  const b3Ogretmenler = [...new Set(
    cekirdek.filter((va) => va.tur === "B3").map((va) => va.ogretmenAdi!),
  )].sort();
  const b6Ogretmenler = [...new Set(
    cekirdek.filter((va) => va.tur === "B6").map((va) => va.ogretmenAdi!),
  )].sort();
  const b4Atamalar = [...new Set(
    cekirdek.filter((va) => va.tur === "B4").map((va) => va.atamaIndex!),
  )].sort((a, b) => a - b);
  const kapanisGruplari = cekirdek
    .filter((va) => va.tur === "KAPANIS")
    .map((va) => [va.ogretmenAdi!, va.neden!] as const);

  const kullanilanlar = new Set<string>();
  const cumleler: string[] = [];

  for (const ogretmenAdi of b3Ogretmenler) {
    const eslesenler = kapanisGruplari.filter(([o]) => o === ogretmenAdi).map(([, n]) => n);
    cumleler.push(b3Cumlesi(okul, ogretmenAdi, eslesenler));
    for (const n of eslesenler) kullanilanlar.add(`${ogretmenAdi}|${n}`);
  }

  for (const ogretmenAdi of b6Ogretmenler) {
    const eslesenler = kapanisGruplari
      .filter(([o, n]) => o === ogretmenAdi && !kullanilanlar.has(`${o}|${n}`))
      .map(([, n]) => n);
    cumleler.push(b6Cumlesi(okul, ogretmenAdi, eslesenler));
    for (const n of eslesenler) kullanilanlar.add(`${ogretmenAdi}|${n}`);
  }

  for (const aIdx of b4Atamalar) {
    cumleler.push(b4Cumlesi(okul, aIdx));
  }

  for (const [ogretmenAdi, neden] of kapanisGruplari) {
    if (kullanilanlar.has(`${ogretmenAdi}|${neden}`)) continue;
    const gunler = gunleriMetneCevir(kapanisGunleriniBul(okul, ogretmenAdi, neden));
    cumleler.push(
      `${iyelikEki(ogretmenAdi)} ${gunler} günlerindeki ` +
        `${NEDEN_KULLANICI_METNI[neden]}, bu programı imkânsız kılan ` +
        `nedenlerden biri.`,
    );
  }

  return cumleler;
}

/** Kural kodlarını (B3/B4/B6) tek bir teknik referans satırında toplar. */
export function teknikReferans(okul: Okul, cekirdek: VarsayimAnahtari[]): string {
  const parcalar: string[] = [];
  for (const va of cekirdek) {
    if (va.tur === "B3") parcalar.push(`B3 (${va.ogretmenAdi})`);
    else if (va.tur === "B6") parcalar.push(`B6 (${va.ogretmenAdi})`);
    else if (va.tur === "B4") {
      const atama = okul.ders_atamalari[va.atamaIndex!]!;
      parcalar.push(`B4 (${atama.ders}, ${atama.subeler.join(", ")})`);
    }
  }
  return parcalar.length > 0 ? "Teknik referans: " + parcalar.join("; ") : "";
}

/** dışOkul ve boşGün nedenli kapanışların hiç önerilmeme gerekçesi. */
export function nedenOnerilmiyorBolumu(cekirdek: VarsayimAnahtari[]): string[] {
  const gruplar = [...new Map(
    cekirdek
      .filter((va) => va.tur === "KAPANIS")
      .map((va) => [`${va.ogretmenAdi}|${va.neden}`, [va.ogretmenAdi!, va.neden!] as const]),
  ).values()].sort(([a1, n1], [a2, n2]) =>
    a1 === a2 ? n1.localeCompare(n2) : a1.localeCompare(a2),
  );
  const satirlar: string[] = [];
  for (const [ogretmenAdi, neden] of gruplar) {
    if (neden === "DIS_OKUL") {
      satirlar.push(
        `${ogretmenAdi} öğretmeninin dış okul görevi hiç öneri listesine ` +
          `alınmadı: bu, başka bir okula karşı verilmiş bir taahhüttür.`,
      );
    } else if (neden === "BOS_GUN") {
      satirlar.push(
        `${ogretmenAdi} öğretmeninin planlı boş günü hiç öneri listesine ` +
          `alınmadı: bu günün korunması zaten amaçlanan sonuçtur.`,
      );
    }
  }
  return satirlar;
}

// --- Gevşetme önerisi motoru (Karar 14/15/21) ------------------------------

interface OneriAdayi {
  basamak: number;
  aciklama: string;
  okul: Okul;
}

/** Bir dersin kategorisini bulur (Rehberlik'i yük devrinden hariç tutmak için). */
function dersKategorisi(okul: Okul, dersAdi: string) {
  return okul.dersler.find((d) => d.ad === dersAdi)?.kategori ?? null;
}

/** Bir öğretmenin atanmış yükü düşüldükten sonra kalan serbest kapasitesi. */
function ogretmenSerbestKapasite(okul: Okul, ogretmenAdi: string): number {
  const ogretmen = okul.ogretmenler.find((o) => o.ad === ogretmenAdi)!;
  const toplam = ogretmenKapasitesi(okul, ogretmen);
  const yuk = okul.ders_atamalari
    .filter((a) => a.ogretmenler.includes(ogretmenAdi))
    .reduce((t, a) => t + a.haftalik_saat, 0);
  return toplam - yuk;
}

/** Basamak 1: blok birleştirme ve bölme adayları (atama başına sınırlı). */
function desenAdaylari(okul: Okul, atamaIndeksleri: number[]): OneriAdayi[] {
  const adaylar: OneriAdayi[] = [];
  for (const aIdx of atamaIndeksleri) {
    const atama = okul.ders_atamalari[aIdx]!;
    const desen = atama.blok_deseni;
    const anahtarUret = (d: number[]) => [...d].sort((a, b) => b - a).join(",");
    const uretilenler = new Set([anahtarUret(desen)]);
    const buAtamaninAdaylari: OneriAdayi[] = [];

    // Birleştirme: iki bloğu tek bloğa indirger.
    dis: for (let i = 0; i < desen.length; i++) {
      for (let j = i + 1; j < desen.length; j++) {
        if (buAtamaninAdaylari.length >= MAKS_ADAY_ATAMA_BASINA_DESEN) break dis;
        const yeniDesen = desen.filter((_, k) => k !== i && k !== j);
        yeniDesen.push(desen[i]! + desen[j]!);
        const anahtar = anahtarUret(yeniDesen);
        if (uretilenler.has(anahtar)) continue;
        uretilenler.add(anahtar);
        const yeniOkul = structuredClone(okul);
        yeniOkul.ders_atamalari[aIdx]!.blok_deseni = [...yeniDesen].sort((a, b) => b - a);
        buAtamaninAdaylari.push({
          basamak: 1,
          aciklama:
            `${atama.ders} dersinin (${atama.subeler.join(", ")}) blok ` +
            `desenini [${desen.join(", ")}] yerine [${[...yeniDesen].sort((a, b) => b - a).join(", ")}] ` +
            `yapmayı (iki bloğu birleştirmeyi) deneyin`,
          okul: yeniOkul,
        });
      }
    }

    // Bölme: bir bloğu ikiye ayırır.
    for (let i = 0; i < desen.length; i++) {
      if (buAtamaninAdaylari.length >= MAKS_ADAY_ATAMA_BASINA_DESEN) break;
      const uzunluk = desen[i]!;
      if (uzunluk < 2) continue;
      const buyuk = uzunluk - Math.floor(uzunluk / 2);
      const kucuk = Math.floor(uzunluk / 2);
      const yeniDesen = [...desen.filter((_, k) => k !== i), buyuk, kucuk];
      const anahtar = anahtarUret(yeniDesen);
      if (uretilenler.has(anahtar)) continue;
      uretilenler.add(anahtar);
      const yeniOkul = structuredClone(okul);
      yeniOkul.ders_atamalari[aIdx]!.blok_deseni = [...yeniDesen].sort((a, b) => b - a);
      buAtamaninAdaylari.push({
        basamak: 1,
        aciklama:
          `${atama.ders} dersinin (${atama.subeler.join(", ")}) blok ` +
          `desenini [${desen.join(", ")}] yerine [${[...yeniDesen].sort((a, b) => b - a).join(", ")}] ` +
          `yapmayı (bir bloğu bölmeyi) deneyin`,
        okul: yeniOkul,
      });
    }

    adaylar.push(...buAtamaninAdaylari);
  }
  return adaylar;
}

/** Basamak 2: branşı uygun VE kapasitesi yeten alternatif öğretmen adayları (rehberlik hariç, B5). */
function yukDevriAdaylari(okul: Okul, atamaIndeksleri: number[]): OneriAdayi[] {
  const adaylar: OneriAdayi[] = [];
  for (const aIdx of atamaIndeksleri) {
    const atama = okul.ders_atamalari[aIdx]!;
    if (dersKategorisi(okul, atama.ders) === "REHBERLIK_DIGER") continue;
    const buAtamaninAdaylari: OneriAdayi[] = [];
    for (const ogretmen of okul.ogretmenler) {
      if (buAtamaninAdaylari.length >= MAKS_ADAY_ATAMA_BASINA_YUK_DEVRI) break;
      if (atama.ogretmenler.includes(ogretmen.ad)) continue;
      if (!ogretmen.verebilecegi_dersler.includes(atama.ders)) continue;
      if (ogretmenSerbestKapasite(okul, ogretmen.ad) < atama.haftalik_saat) continue;
      const yeniOkul = structuredClone(okul);
      yeniOkul.ders_atamalari[aIdx]!.ogretmenler = [ogretmen.ad];
      const eskiOgretmen = atama.ogretmenler[0] ?? "(atanmamış)";
      buAtamaninAdaylari.push({
        basamak: 2,
        aciklama:
          `${atama.ders} dersini (${atama.subeler.join(", ")}) ` +
          `${eskiOgretmen} yerine ${ogretmen.ad} öğretmenine devretmeyi deneyin`,
        okul: yeniOkul,
      });
    }
    adaylar.push(...buAtamaninAdaylari);
  }
  return adaylar;
}

/** Basamak 3: yalnız veride gerçekten sabitleme varsa gevşetme adayı üretir. */
function sabitlemeAdaylari(okul: Okul, atamaIndeksleri: number[]): OneriAdayi[] {
  const adaylar: OneriAdayi[] = [];
  for (const aIdx of atamaIndeksleri) {
    const atama = okul.ders_atamalari[aIdx]!;
    if (!atama.sabit_dilimler || atama.sabit_dilimler.length === 0) continue;
    const yeniOkul = structuredClone(okul);
    yeniOkul.ders_atamalari[aIdx]!.sabit_dilimler = null;
    adaylar.push({
      basamak: 3,
      aciklama:
        `${atama.ders} dersindeki (${atama.subeler.join(", ")}) sabitlenmiş ` +
        `saat(ler)i gevşetmeyi deneyin`,
      okul: yeniOkul,
    });
  }
  return adaylar;
}

/** Basamak 4: kişisel tercih nedenli kapanışları gevşetme adayları (çok-okul uyarısı yalnız uygunsa). */
function kisiselTercihAdaylari(
  okul: Okul,
  kapanisGruplari: ReadonlyArray<readonly [string, KapanisNedeni]>,
): OneriAdayi[] {
  const adaylar: OneriAdayi[] = [];
  for (const [ogretmenAdi, neden] of kapanisGruplari) {
    if (neden !== "KISISEL_TERCIH") continue;
    const yeniOkul = structuredClone(okul);
    const yeniOgretmen = yeniOkul.ogretmenler.find((o) => o.ad === ogretmenAdi)!;
    const gunler = [...new Set(
      yeniOgretmen.kapanislar
        .filter((k) => k.neden === "KISISEL_TERCIH")
        .map((k) => k.gun),
    )].sort((a, b) => a - b);
    const cokOkullu = yeniOgretmen.kapanislar.some((k) => k.neden === "DIS_OKUL");
    yeniOgretmen.kapanislar = yeniOgretmen.kapanislar.filter(
      (k) => k.neden !== "KISISEL_TERCIH",
    );

    let aciklama =
      `${ogretmenAdi} öğretmeninin ${gunleriMetneCevir(gunler)} günlerindeki ` +
      `kişisel tercih günü/saatlerini gözden geçirmeyi deneyin`;
    if (cokOkullu) {
      aciklama +=
        " (uyarı: bu öğretmen başka bir okulda da ders veriyor, müsaitlik " +
        "değişikliği o okulun programını da etkileyebilir -- çok-okul zinciri)";
    }
    adaylar.push({ basamak: 4, aciklama, okul: yeniOkul });
  }
  return adaylar;
}

/** Basamak 6 (son çare): idari kapanışları gevşetme adayları. */
function idariAdaylari(
  okul: Okul,
  kapanisGruplari: ReadonlyArray<readonly [string, KapanisNedeni]>,
): OneriAdayi[] {
  const adaylar: OneriAdayi[] = [];
  for (const [ogretmenAdi, neden] of kapanisGruplari) {
    if (neden !== "IDARI") continue;
    const yeniOkul = structuredClone(okul);
    const yeniOgretmen = yeniOkul.ogretmenler.find((o) => o.ad === ogretmenAdi)!;
    const gunler = [...new Set(
      yeniOgretmen.kapanislar.filter((k) => k.neden === "IDARI").map((k) => k.gun),
    )].sort((a, b) => a - b);
    yeniOgretmen.kapanislar = yeniOgretmen.kapanislar.filter((k) => k.neden !== "IDARI");
    adaylar.push({
      basamak: 5,
      aciklama:
        `${ogretmenAdi} öğretmeninin ${gunleriMetneCevir(gunler)} ` +
        `günlerindeki idari görevini azaltmayı ya da başka güne almayı ` +
        `deneyin (okul yönetiminin zorunlu kararı -- ancak başka yol ` +
        `görünmediği için öneriliyor)`,
      okul: yeniOkul,
    });
  }
  return adaylar;
}

/** Basamak 5 öneri cümlesi (tekil/birleşik; Karar 17 tonu: "bilinen durum"). */
export function muafiyetMetni(okul: Okul, adlar: string[]): string {
  const disOkullu: string[] = [];
  for (const ad of adlar) {
    const ogretmen = okul.ogretmenler.find((o) => o.ad === ad)!;
    const gunler = [...new Set(
      ogretmen.kapanislar.filter((k) => k.neden === "DIS_OKUL").map((k) => k.gun),
    )].sort((a, b) => a - b);
    if (gunler.length > 0) {
      disOkullu.push(`${ad} (${gunleriMetneCevir(gunler)} dış okulda)`);
    }
  }
  let kisi: string;
  let gerekce: string;
  if (adlar.length === 1) {
    kisi = `${adlar[0]} öğretmeni için`;
    gerekce =
      disOkullu.length > 0
        ? `${disOkullu[0]!.split("(")[1]!.replace(/\)$/, "")} olduğundan bu okulda tam ` +
          `boş gün bırakmak yapısal olarak mümkün görünmüyor`
        : "mevcut ders yükü dağılımıyla hiçbir gün tamamen boşaltılamıyor";
  } else {
    kisi = `${adlar.join(" ve ")} öğretmenleri için birlikte`;
    gerekce =
      "dış okul yükleri nedeniyle bu okulda tam boş gün bırakmak yapısal " +
      "olarak mümkün görünmüyor" +
      (disOkullu.length > 0 ? ` (${disOkullu.join("; ")})` : "");
  }
  return (
    `Boş gün garantisi kuralını ${kisi} kapatmayı değerlendirin: ${gerekce}; ` +
    `bu, çok okullu ağır yük profilinde bilinen bir durumdur (kural ` +
    `ayarlarına kayıt düşülerek uygulanır, diğer öğretmenlerin garantisi ` +
    `etkilenmez)`
  );
}

/**
 * Bir okulun hipotetik durumunun HIZLI modda çözülüp çözülemediğini denetler.
 * Dönüş üç durumlu: "cozuluyor" | "cozulmuyor" | "belirsiz" (bkz.
 * tanilama.py: UNKNOWN, 'çözülmüyor' ile aynı şey DEĞİLDİR).
 */
async function hizliModdaCozulebilirMi(
  okul: Okul,
): Promise<"cozuluyor" | "cozulmuyor" | "belirsiz"> {
  if (aKatmaniDogrulama(okul).length > 0) return "cozulmuyor";
  let km;
  try {
    km = kurTemelDegiskenler(okul, false);
  } catch {
    return "cozulmuyor";
  }
  sertKurallariUygula(km);
  const cozucu = new CpSolver();
  const durum = cozucu.statusName(
    await cozucu.solve(km.model, {
      maxTimeInSeconds: Math.max(10, okul.kural_ayarlari.sure_butcesi_saniye / 3),
      numSearchWorkers: 1,
    }),
  );
  if (durum === "OPTIMAL" || durum === "FEASIBLE") return "cozuluyor";
  if (durum === "INFEASIBLE") return "cozulmuyor";
  return "belirsiz";
}

/**
 * Basamak 5 (Karar 15 + 21): B3 muafiyetini SINIRLI YİNELEMELİ teşhisle önerir.
 * Core minimal olduğundan çok-öğretmenli vakada tekil aday doğrulanamaz;
 * döngü: kümeyi hipotetik uygula -> çözülmüyorsa yeniden teşhis et ->
 * core'un yeni gösterdiği B3 öğretmenlerini ekle (tavan MAKS_EK_DENEME_MUAFIYET).
 */
async function muafiyetOnerisiUret(
  okul: Okul,
  b3Ogretmenler: string[],
): Promise<{ oneri: string | null; deneme: number }> {
  const muafiyetKumesi = new Set<string>();
  let kalan = b3Ogretmenler
    .filter((o) => !okul.kural_ayarlari.b3_muaf_ogretmenler.has(o))
    .sort();
  let deneme = 0;
  while (kalan.length > 0 && deneme < MAKS_EK_DENEME_MUAFIYET) {
    for (const ad of kalan) muafiyetKumesi.add(ad);
    const adayOkul = structuredClone(okul);
    for (const ad of muafiyetKumesi) adayOkul.kural_ayarlari.b3_muaf_ogretmenler.add(ad);
    deneme += 1;
    const durum = await hizliModdaCozulebilirMi(adayOkul);
    if (durum === "cozuluyor") {
      return {
        oneri:
          muafiyetMetni(okul, [...muafiyetKumesi].sort()) +
          " (denendi: program kurulabiliyor).",
        deneme,
      };
    }
    if (durum === "belirsiz") {
      // Süre yetmedi: okul UNSAT olmayabilir; UNSAT varsayan yeniden-teşhis
      // adımı burada anlamsızdır, dürüstçe durulur.
      return { oneri: null, deneme };
    }
    // Kanıtlı UNSAT: hipotetik okulu yeniden teşhis et.
    const { cekirdek } = await tanilamaModundaCoz(adayOkul);
    kalan = [...new Set(
      cekirdek
        .filter((va) => va.tur === "B3")
        .map((va) => va.ogretmenAdi!)
        .filter(
          (o) =>
            !muafiyetKumesi.has(o) && !okul.kural_ayarlari.b3_muaf_ogretmenler.has(o),
        ),
    )].sort();
  }
  return { oneri: null, deneme };
}

/**
 * Basamak sırasıyla (desen -> yük devri -> sabitleme -> kişisel tercih ->
 * kural muafiyeti -> idari) aday üretir, her adayı hipotetik olarak HIZLI
 * modda çözer. Rapora yalnız çözüm açan adaylar girer ("denendi" etiketi).
 */
export async function dogrulanmisOnerilerUret(
  okul: Okul,
  cekirdek: VarsayimAnahtari[],
): Promise<{ onaylanmis: string[]; denemeSayisi: number }> {
  const b3Ogretmenler = [...new Set(
    cekirdek.filter((va) => va.tur === "B3").map((va) => va.ogretmenAdi!),
  )].sort();
  const b6Ogretmenler = [...new Set(
    cekirdek.filter((va) => va.tur === "B6").map((va) => va.ogretmenAdi!),
  )].sort();
  const b4Atamalar = [...new Set(
    cekirdek.filter((va) => va.tur === "B4").map((va) => va.atamaIndex!),
  )].sort((a, b) => a - b);
  const kapanisGruplari = cekirdek
    .filter((va) => va.tur === "KAPANIS")
    .map((va) => [va.ogretmenAdi!, va.neden!] as const);

  const coreOgretmenler = new Set([...b3Ogretmenler, ...b6Ogretmenler]);
  const coreAtamaIndeksleri = new Set(b4Atamalar);
  okul.ders_atamalari.forEach((atama, aIdx) => {
    if (atama.ogretmenler.some((o) => coreOgretmenler.has(o))) {
      coreAtamaIndeksleri.add(aIdx);
    }
  });
  const coreAtamaSirali = [...coreAtamaIndeksleri].sort((a, b) => a - b);

  const basamakAdayListeleri = [
    desenAdaylari(okul, coreAtamaSirali),
    yukDevriAdaylari(okul, coreAtamaSirali),
    sabitlemeAdaylari(okul, coreAtamaSirali),
    kisiselTercihAdaylari(okul, kapanisGruplari),
  ];

  const onaylanmis: string[] = [];
  let denemeSayisi = 0;

  for (const adaylar of basamakAdayListeleri) {
    if (denemeSayisi >= MAKS_TOPLAM_DENEME) break;
    for (const aday of adaylar) {
      if (denemeSayisi >= MAKS_TOPLAM_DENEME) break;
      denemeSayisi += 1;
      if ((await hizliModdaCozulebilirMi(aday.okul)) === "cozuluyor") {
        onaylanmis.push(`${aday.aciklama} (denendi: program kurulabiliyor).`);
      }
    }
  }

  // Basamak 5 -- kural muafiyeti: kendi ek bütçesiyle, sınırlı yinelemeli
  // teşhisle koşar (ana bütçe basamak 1-4'te tükenmiş olsa bile).
  const { oneri: muafiyetOnerisi, deneme: muafiyetDenemesi } =
    await muafiyetOnerisiUret(okul, b3Ogretmenler);
  denemeSayisi += muafiyetDenemesi;
  if (muafiyetOnerisi !== null) onaylanmis.push(muafiyetOnerisi);

  let enAzKotuYol: string | null = null;
  if (onaylanmis.length === 0) {
    for (const aday of idariAdaylari(okul, kapanisGruplari).slice(0, MAKS_EK_DENEME_IDARI)) {
      denemeSayisi += 1;
      if ((await hizliModdaCozulebilirMi(aday.okul)) === "cozuluyor") {
        onaylanmis.push(`${aday.aciklama} (denendi: program kurulabiliyor).`);
      } else if (enAzKotuYol === null) {
        enAzKotuYol = aday.aciklama;
      }
    }

    if (onaylanmis.length === 0 && enAzKotuYol !== null) {
      onaylanmis.push(
        "Üretilen hiçbir aday tek başına çözüm açmadı. En az kötü yol: " +
          enAzKotuYol +
          " (bu tek başına yeterli olmayabilir, başka değişikliklerle " +
          "birlikte denenmesi gerekebilir).",
      );
    }
  }

  return { onaylanmis, denemeSayisi };
}

/**
 * Hızlı modda UNSAT çıkan bir okul için tanılama modunda yeniden kurar,
 * çözer ve numaralı Türkçe eylem raporu üretir (tanilama.py tanila ikizi).
 */
export async function tanila(okul: Okul): Promise<string> {
  const { cekirdek } = await tanilamaModundaCoz(okul);

  if (cekirdek.length === 0) {
    return (
      "Tanılama modu çözümsüzlüğü doğrulayamadı; bu beklenmedik bir " +
      "durumdur, lütfen veriyi ve modeli kontrol edin."
    );
  }

  const cumleler = cekirdekCumleleri(okul, cekirdek);
  const { onaylanmis } = await dogrulanmisOnerilerUret(okul, cekirdek);
  const nedenOnerilmiyor = nedenOnerilmiyorBolumu(cekirdek);

  const satirlar = ["Bu program şu anki verilerle kurulamıyor. Nedenleri:"];
  cumleler.forEach((cumle, i) => satirlar.push(`  ${i + 1}. ${cumle}`));

  satirlar.push("\nÖnerilen çözüm adımları (yalnız denenip çözüm açtığı doğrulananlar):");
  if (onaylanmis.length > 0) {
    onaylanmis.forEach((oneri, i) => satirlar.push(`  ${i + 1}. ${oneri}`));
  } else {
    satirlar.push("  Üretilen hiçbir aday çözüm açmadı.");
  }

  if (nedenOnerilmiyor.length > 0) {
    satirlar.push("\nNeden bazı seçenekler önerilmiyor:");
    for (const satir of nedenOnerilmiyor) satirlar.push(`  - ${satir}`);
  }

  satirlar.push(
    "\nNot: bu liste sorunu açıklamaya yeterlidir; ancak tek mümkün açıklama " +
      "olmayabilir -- başka bir kısıt kombinasyonu da aynı sonuca yol açıyor olabilir.",
  );

  const teknik = teknikReferans(okul, cekirdek);
  if (teknik) satirlar.push(`\n${teknik}`);

  return satirlar.join("\n");
}
