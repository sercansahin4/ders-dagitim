/**
 * Kalite karnesi — deney/karne.py çevirisi: ceza kaynak dökümü, bağımsız
 * yeniden hesap ve mutabakat.
 *
 * Python gerçeklemesi referanstır (Karar 22); bu modül SAF hesaptır
 * (Okul + Yerlesim -> metin/sayı) ve altın testlerle BAYT-BAYT sabittir
 * (veri/altin/karne_beklenen.json; üretici: karne_altin_uret.py).
 *
 * İki ayrı ceza ölçümü vardır ve ayrım kasıtlıdır: (1) çözüm anı toplama
 * (coz.kademeliCoz, etiketli değişkenlerden) ve (2) buradaki bağımsız
 * yeniden hesap. İkisi kural bazında birebir tutmak ZORUNDADIR
 * (mutabakat); tutmazsa koşu geçersizdir.
 *
 * Dikkat: doluluk sözlüklerinde aynı (gün, dilim) anahtarına birden çok
 * girdi yazılırsa SON GİRDİ kazanır — Python dict davranışının ikizi
 * (Map de ekleme sırasını korur). Çakışmalı yerleşimlerde karne bu
 * yüzden deterministiktir; çakışmanın kendisini denetçi raporlar.
 */

import type { KapanisNedeni, Okul, Yerlesim } from "./model.js";
import { DERS_KATEGORILERI } from "./model.js";
import type { DersKategorisi } from "./model.js";
import { anahtar2 } from "./kisitlar.js";

export const C_KURAL_SIRASI = ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"];

export const KURAL_BASLIKLARI: Record<string, string> = {
  C1: "Boş gün tercihi karşılanmayan öğretmenler",
  C2: "Öğretmen×şube günlük toplam sınırı aşımı",
  C3: "3 saatlik pencereler",
  C4: "Tek saatlik günler",
  C5: "Öğretmen×şube ardışıklık sınırı aşımı",
  C6: "Pencere dilimleri (1-2 saatlik bekleme)",
  C7: "Aynı kategoriden farklı dersler ardışık",
  C8: "Dilim tercihi ihlali (sayısal sabaha / sanat-spor sona)",
};

/** Bağımsız yeniden hesapta tek bir ceza kaynağı (kural + bağlam + miktar). */
export interface KarneSatiri {
  kural: string;
  ceza: number;
  aciklama: string;
  ogretmen?: string;
  sube?: string;
  gun?: number;
}

const GUN_ADLARI = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma"];

function gunAdi(gun: number): string {
  return gun >= 1 && gun <= GUN_ADLARI.length ? GUN_ADLARI[gun - 1]! : `Gün ${gun}`;
}

/** Python tuple sıralamasının ikizi: kod noktası karşılaştırması (localeCompare DEĞİL). */
function kodNoktasiKiyas(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

type Doluluk = Map<string, number>; // anahtar2(gun, dilim) -> ders_atamasi_index

/** Öğretmen adından (gün|dilim) -> atama indeksi doluluk görünümü. */
function ogretmenDoluluk(okul: Okul, yerlesim: Yerlesim): Map<string, Doluluk> {
  const doluluk = new Map<string, Doluluk>(okul.ogretmenler.map((o) => [o.ad, new Map()]));
  for (const girdi of yerlesim.girdiler) {
    const atama = okul.ders_atamalari[girdi.ders_atamasi_index]!;
    for (let s = girdi.baslangic_dilim; s < girdi.baslangic_dilim + girdi.sure; s++) {
      for (const ogretmenAd of atama.ogretmenler) {
        doluluk.get(ogretmenAd)!.set(anahtar2(girdi.gun, s), girdi.ders_atamasi_index);
      }
    }
  }
  return doluluk;
}

/** Şube adından (gün|dilim) -> atama indeksi doluluk görünümü. */
function subeDoluluk(okul: Okul, yerlesim: Yerlesim): Map<string, Doluluk> {
  const doluluk = new Map<string, Doluluk>(okul.subeler.map((s) => [s.ad, new Map()]));
  for (const girdi of yerlesim.girdiler) {
    const atama = okul.ders_atamalari[girdi.ders_atamasi_index]!;
    for (let s = girdi.baslangic_dilim; s < girdi.baslangic_dilim + girdi.sure; s++) {
      for (const subeAd of atama.subeler) {
        doluluk.get(subeAd)!.set(anahtar2(girdi.gun, s), girdi.ders_atamasi_index);
      }
    }
  }
  return doluluk;
}

/** Bir öğretmenin pencere dilimlerini kisitlar'daki segment tanımıyla birebir hesaplar. */
function pencereDilimleri(okul: Okul, ogretmenAd: string, doluluk: Doluluk): Set<string> {
  const ogretmen = okul.ogretmenler.find((o) => o.ad === ogretmenAd)!;
  const kapanislar = new Map<string, KapanisNedeni>();
  for (const k of ogretmen.kapanislar) {
    for (const d of k.dilimler) kapanislar.set(anahtar2(k.gun, d), k.neden);
  }
  const bolmeyenler = okul.kural_ayarlari.pencereyi_bolmeyen_nedenler;
  const pencereler = new Set<string>();
  for (let g = 1; g <= okul.izgara.gun_sayisi; g++) {
    let segment: number[] = [];
    const segmentler: number[][] = [];
    for (let s = 1; s <= okul.izgara.dilim_sayisi; s++) {
      const neden = kapanislar.get(anahtar2(g, s));
      if (neden !== undefined && !bolmeyenler.has(neden)) {
        segmentler.push(segment);
        segment = [];
      } else {
        segment.push(s);
      }
    }
    segmentler.push(segment);
    for (const seg of segmentler) {
      const dersli = seg.filter((s) => doluluk.has(anahtar2(g, s)));
      if (dersli.length < 2) continue;
      const enKucuk = Math.min(...dersli);
      const enBuyuk = Math.max(...dersli);
      for (let s = enKucuk + 1; s < enBuyuk; s++) {
        if (!doluluk.has(anahtar2(g, s))) pencereler.add(anahtar2(g, s));
      }
    }
  }
  return pencereler;
}

/** (öğretmen, şube) çiftlerinden C2/C5 sayımına giren (rehberlik-dışı) atama indeksleri. */
function c2c5SayilirAtamalar(okul: Okul): Map<string, number[]> {
  const kategori = new Map(okul.dersler.map((d) => [d.ad, d.kategori]));
  const ciftler = new Map<string, number[]>();
  okul.ders_atamalari.forEach((atama, aIdx) => {
    if (kategori.get(atama.ders) === "REHBERLIK_DIGER") return;
    for (const ogretmenAd of atama.ogretmenler) {
      for (const subeAd of atama.subeler) {
        const anahtar = `${ogretmenAd}|${subeAd}`;
        if (!ciftler.has(anahtar)) ciftler.set(anahtar, []);
        ciftler.get(anahtar)!.push(aIdx);
      }
    }
  });
  return ciftler;
}

/** Python sorted(ciftler.items()) ikizi: (öğretmen, şube) çift anahtarına göre kod noktası sırası. */
function sireliCiftler(
  ciftler: Map<string, number[]>,
): Array<[string, string, number[]]> {
  return [...ciftler.entries()]
    .map(([anahtar, indeksler]): [string, string, number[]] => {
      const [ogretmen, sube] = anahtar.split("|") as [string, string];
      return [ogretmen, sube, indeksler];
    })
    .sort((a, b) => kodNoktasiKiyas(a[0], b[0]) || kodNoktasiKiyas(a[1], b[1]));
}

/** C1-C8 cezalarını yalnız Okul + Yerlesim üzerinden yeniden hesaplar (karne.py cezalari_hesapla ikizi). */
export function cezalariHesapla(okul: Okul, yerlesim: Yerlesim): Map<string, KarneSatiri[]> {
  const ogretmenDolulugu = ogretmenDoluluk(okul, yerlesim);
  const subeDolulugu = subeDoluluk(okul, yerlesim);
  const pencereler = new Map(
    [...ogretmenDolulugu.entries()].map(([ad, doluluk]) => [
      ad,
      pencereDilimleri(okul, ad, doluluk),
    ]),
  );
  const ciftler = c2c5SayilirAtamalar(okul);
  const kategori = new Map(okul.dersler.map((d) => [d.ad, d.kategori]));
  const dokum = new Map<string, KarneSatiri[]>(C_KURAL_SIRASI.map((k) => [k, []]));

  const girdiKapsamlari = yerlesim.girdiler.map((g) => ({
    aIdx: g.ders_atamasi_index,
    gun: g.gun,
    b1: g.baslangic_dilim,
    b2: g.baslangic_dilim + g.sure - 1,
  }));

  const tekBlokKapsiyor = (
    atamaIndeksleri: number[],
    g: number,
    s1: number,
    s2: number,
  ): boolean =>
    girdiKapsamlari.some(
      (k) => atamaIndeksleri.includes(k.aIdx) && k.gun === g && k.b1 <= s1 && k.b2 >= s2,
    );

  // C1 -- boş gün tercihi.
  for (const ogretmen of okul.ogretmenler) {
    const g = ogretmen.bos_gun_tercihi;
    if (g === null || g === undefined || g < 1 || g > okul.izgara.gun_sayisi) continue;
    const calisiyor = [...ogretmenDolulugu.get(ogretmen.ad)!.keys()].some(
      (anahtar) => Number(anahtar.split("|")[0]) === g,
    );
    if (calisiyor) {
      dokum.get("C1")!.push({
        kural: "C1",
        ceza: 1,
        aciklama: `${ogretmen.ad}: tercih ettiği boş gün (${gunAdi(g)}) ders içeriyor.`,
        ogretmen: ogretmen.ad,
        gun: g,
      });
    }
  }

  // C2 -- öğretmen×şube günlük toplam sınırı.
  const sinir = okul.kural_ayarlari.ogretmen_sube_gunluk_toplam;
  for (const [ogretmenAd, subeAd, atamaIndeksleri] of sireliCiftler(ciftler)) {
    for (let g = 1; g <= okul.izgara.gun_sayisi; g++) {
      let toplam = 0;
      for (const [anahtar, aIdx] of ogretmenDolulugu.get(ogretmenAd)!) {
        if (Number(anahtar.split("|")[0]) === g && atamaIndeksleri.includes(aIdx)) {
          toplam += 1;
        }
      }
      if (toplam > sinir) {
        dokum.get("C2")!.push({
          kural: "C2",
          ceza: toplam - sinir,
          aciklama:
            `${ogretmenAd} -> ${subeAd}: ${gunAdi(g)} günü ${toplam} saat ` +
            `(sınır ${sinir}).`,
          ogretmen: ogretmenAd,
          sube: subeAd,
          gun: g,
        });
      }
    }
  }

  // C3 -- 3 ardışık pencere dilimi (kayan konum başına 1).
  for (const ogretmen of okul.ogretmenler) {
    const pset = pencereler.get(ogretmen.ad)!;
    for (let g = 1; g <= okul.izgara.gun_sayisi; g++) {
      for (let s = 1; s <= okul.izgara.dilim_sayisi; s++) {
        if (s + 2 > okul.izgara.dilim_sayisi) break;
        if ([s, s + 1, s + 2].every((s2) => pset.has(anahtar2(g, s2)))) {
          dokum.get("C3")!.push({
            kural: "C3",
            ceza: 1,
            aciklama:
              `${ogretmen.ad}: ${gunAdi(g)} ${s}-${s + 2}. dilimler ` +
              `3 saatlik pencere.`,
            ogretmen: ogretmen.ad,
            gun: g,
          });
        }
      }
    }
  }

  // C4 -- tek saatlik günler.
  for (const ogretmen of okul.ogretmenler) {
    for (let g = 1; g <= okul.izgara.gun_sayisi; g++) {
      let saat = 0;
      for (const anahtar of ogretmenDolulugu.get(ogretmen.ad)!.keys()) {
        if (Number(anahtar.split("|")[0]) === g) saat += 1;
      }
      if (saat === 1) {
        dokum.get("C4")!.push({
          kural: "C4",
          ceza: 1,
          aciklama: `${ogretmen.ad}: ${gunAdi(g)} günü yalnız 1 saat ders.`,
          ogretmen: ogretmen.ad,
          gun: g,
        });
      }
    }
  }

  // C5 -- öğretmen×şube ardışıklık sınırı (kayan konum başına 1, tek blok muaf).
  const pencereBoyu = okul.kural_ayarlari.ardisiklik_siniri + 1;
  for (const [ogretmenAd, subeAd, atamaIndeksleri] of sireliCiftler(ciftler)) {
    const haftalik = atamaIndeksleri.reduce(
      (t, i) => t + okul.ders_atamalari[i]!.haftalik_saat,
      0,
    );
    if (haftalik < pencereBoyu) continue;
    const doluluk = ogretmenDolulugu.get(ogretmenAd)!;
    for (let g = 1; g <= okul.izgara.gun_sayisi; g++) {
      for (let s = 1; s <= okul.izgara.dilim_sayisi; s++) {
        if (s + pencereBoyu - 1 > okul.izgara.dilim_sayisi) break;
        let hepsiDolu = true;
        for (let s2 = s; s2 < s + pencereBoyu; s2++) {
          const aIdx = doluluk.get(anahtar2(g, s2));
          if (aIdx === undefined || !atamaIndeksleri.includes(aIdx)) {
            hepsiDolu = false;
            break;
          }
        }
        if (hepsiDolu && !tekBlokKapsiyor(atamaIndeksleri, g, s, s + pencereBoyu - 1)) {
          dokum.get("C5")!.push({
            kural: "C5",
            ceza: 1,
            aciklama:
              `${ogretmenAd} -> ${subeAd}: ${gunAdi(g)} ` +
              `${s}-${s + pencereBoyu - 1}. dilimler blok-aşan ` +
              `${pencereBoyu} saatlik zincir.`,
            ogretmen: ogretmenAd,
            sube: subeAd,
            gun: g,
          });
        }
      }
    }
  }

  // C6 -- pencere dilimi başına 1 (Python sorted((g,s)) sırası: sayısal).
  for (const ogretmen of okul.ogretmenler) {
    const siralilar = [...pencereler.get(ogretmen.ad)!]
      .map((anahtar) => anahtar.split("|").map(Number) as [number, number])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const [g, s] of siralilar) {
      dokum.get("C6")!.push({
        kural: "C6",
        ceza: 1,
        aciklama: `${ogretmen.ad}: ${gunAdi(g)} ${s}. dilim pencere.`,
        ogretmen: ogretmen.ad,
        gun: g,
      });
    }
  }

  // C7 -- aynı kategoriden farklı dersler ardışık (DIL muaf, tek blok muaf).
  for (const sube of okul.subeler) {
    const doluluk = subeDolulugu.get(sube.ad)!;
    for (const kat of DERS_KATEGORILERI as readonly DersKategorisi[]) {
      if (kat === "DIL") continue;
      const ilgili: number[] = [];
      okul.ders_atamalari.forEach((atama, aIdx) => {
        if (atama.subeler.includes(sube.ad) && kategori.get(atama.ders) === kat) {
          ilgili.push(aIdx);
        }
      });
      const farkliDersler = new Set(ilgili.map((i) => okul.ders_atamalari[i]!.ders));
      if (farkliDersler.size < 2) continue;
      for (let g = 1; g <= okul.izgara.gun_sayisi; g++) {
        for (let s = 1; s <= okul.izgara.dilim_sayisi; s++) {
          if (s + 1 > okul.izgara.dilim_sayisi) break;
          const a1 = doluluk.get(anahtar2(g, s));
          const a2 = doluluk.get(anahtar2(g, s + 1));
          if (
            a1 !== undefined &&
            ilgili.includes(a1) &&
            a2 !== undefined &&
            ilgili.includes(a2) &&
            !tekBlokKapsiyor(ilgili, g, s, s + 1)
          ) {
            const d1 = okul.ders_atamalari[a1]!.ders;
            const d2 = okul.ders_atamalari[a2]!.ders;
            dokum.get("C7")!.push({
              kural: "C7",
              ceza: 1,
              aciklama:
                `${sube.ad}: ${gunAdi(g)} ${s}-${s + 1}. dilimlerde ` +
                `aynı kategoriden (${kat}) ardışık dersler: ` +
                `${d1} + ${d2}.`,
              sube: sube.ad,
              gun: g,
            });
          }
        }
      }
    }
  }

  // C8 -- dilim tercihi vektörleri.
  const vektorler = new Map<DersKategorisi, number[]>([
    ["SAYISAL", okul.kural_ayarlari.sayisal_dilim_cezasi],
    ["SANAT_SPOR", okul.kural_ayarlari.sanat_spor_dilim_cezasi],
  ]);
  for (const girdi of yerlesim.girdiler) {
    const atama = okul.ders_atamalari[girdi.ders_atamasi_index]!;
    const kat = kategori.get(atama.ders);
    const vektor = kat !== undefined ? vektorler.get(kat) : undefined;
    if (vektor === undefined) continue;
    for (let s = girdi.baslangic_dilim; s < girdi.baslangic_dilim + girdi.sure; s++) {
      const katsayi = s - 1 < vektor.length ? vektor[s - 1]! : 0;
      if (katsayi > 0) {
        dokum.get("C8")!.push({
          kural: "C8",
          ceza: katsayi,
          aciklama:
            `${atama.ders} (${atama.subeler.join(", ")}): ` +
            `${gunAdi(girdi.gun)} ${s}. dilim (ceza ${katsayi}).`,
          ...(atama.ogretmenler[0] !== undefined
            ? { ogretmen: atama.ogretmenler[0] }
            : {}),
          sube: atama.subeler.join(","),
          gun: girdi.gun,
        });
      }
    }
  }

  // Kapalı kurallar: kisitlar.yumusakKurallariKur ile ayna.
  for (const kural of okul.kural_ayarlari.kapali_kurallar) {
    if (dokum.has(kural)) dokum.set(kural, []);
  }
  return dokum;
}

/** Karne dökümünü kural başına toplam cezaya indirger. */
export function kuralToplamlari(dokum: Map<string, KarneSatiri[]>): Map<string, number> {
  return new Map(
    [...dokum.entries()].map(([kural, satirlar]) => [
      kural,
      satirlar.reduce((t, s) => t + s.ceza, 0),
    ]),
  );
}

/** Çözüm anı cezalarla bağımsız hesabı kural bazında karşılaştırır (boş liste = mutabık). */
export function mutabakat(
  cozucuToplamlari: Map<string, number>,
  bagimsizToplamlari: Map<string, number>,
): string[] {
  const uyusmazliklar: string[] = [];
  for (const kural of C_KURAL_SIRASI) {
    const cozucu = cozucuToplamlari.get(kural) ?? 0;
    const bagimsiz = bagimsizToplamlari.get(kural) ?? 0;
    if (cozucu !== bagimsiz) {
      uyusmazliklar.push(
        `${kural}: çözücü değişkenlerinden okunan ceza (${cozucu}) bağımsız ` +
          `yeniden hesapla (${bagimsiz}) uyuşmuyor -- kisitlar çevirisi ile ` +
          `karne ikizi ayrışmış, koşu geçersiz sayılmalı.`,
      );
    }
  }
  return uyusmazliklar;
}

/** Ceza kaynak dökümünü kural × kaynak kırılımıyla okunur Türkçe karneye çevirir. */
export function karneMetni(
  okul: Okul,
  dokum: Map<string, KarneSatiri[]>,
  ustKatmanCezasi: number | null = null,
  altKatmanCezasi: number | null = null,
): string {
  const satirlar = ["=== Kalite karnesi: ceza kaynak dökümü ==="];
  if (ustKatmanCezasi !== null) {
    satirlar.push(
      `Üst katman ağırlıklı ceza: ${ustKatmanCezasi} | ` +
        `alt katman ağırlıklı ceza: ${altKatmanCezasi}`,
    );
  }
  const toplamlar = kuralToplamlari(dokum);
  for (const kural of C_KURAL_SIRASI) {
    const baslik = KURAL_BASLIKLARI[kural] ?? kural;
    if (okul.kural_ayarlari.kapali_kurallar.has(kural)) {
      satirlar.push(`\n${kural} -- ${baslik}: KAPALI (kural_ayarlari.kapali_kurallar)`);
      continue;
    }
    const toplam = toplamlar.get(kural) ?? 0;
    satirlar.push(`\n${kural} -- ${baslik}: toplam ${toplam}`);
    if (toplam === 0) {
      satirlar.push("  İhlal yok.");
      continue;
    }
    for (const satir of dokum.get(kural)!) {
      satirlar.push(`  - ${satir.aciklama}`);
    }
  }
  return satirlar.join("\n");
}
