/**
 * Çizelge tablosunun saf veri türetmesi (Karar 27): bir `yerlesim`i
 * seçilen EKSENE (şube ya da öğretmen) göre satır-satır bloklara çevirir.
 *
 * Neden ayrı dosya: bileşenler ince, mantık saf ve testli tutulur
 * (model.ts / coz.ts / karne.ts deseni). Böylece React render'ını
 * çalıştırmadan blok türetmeyi doğrudan vitest ile sınayabiliriz; bu
 * dosya React'a bağımlı DEĞİLDİR.
 *
 * Değişmez gözlem (transpose'u temiz kılan): fizibıl çizelgede sert
 * kısıtlar bir varlığı (öğretmen ya da şube) aynı anda iki blokta
 * bulunmaktan men eder; bu yüzden her (varlık, gün, dilim) hücresinde
 * EN ÇOK bir blok başlar ve tek bir colspan/kaplı makinesi iki eksende
 * de çalışır.
 */
import type { DersAtamasi, Okul, Yerlesim } from "./model.js";

/** Çizelgenin hangi varlık türüne göre satırlanacağı. */
export type Eksen = "sube" | "ogretmen";

/** Bir hücrede başlayan bloğun içeriği (her iki eksenin de ihtiyacı olan alanlar). */
export interface HucreBlogu {
  ders: string;
  ogretmenler: string[];
  subeler: string[];
  sure: number;
}

/** Bir eksene göre hazırlanmış çizelge: satır sırası + blok başlangıçları + kaplı hücreler. */
export interface CizelgeVerisi {
  /** Satır olarak çizilecek varlık adları, veri sırasında. */
  satirlar: string[];
  /** "varlik|gun|dilim" -> o hücrede başlayan blok. */
  baslangiclar: Map<string, HucreBlogu>;
  /** Blok devamı olduğu için çizilmeyecek hücreler ("varlik|gun|dilim"). */
  kapli: Set<string>;
}

/** Hücre anahtarı: eksendeki varlık + 1-tabanlı gün + 1-tabanlı dilim. */
export function cizelgeAnahtar(varlik: string, gun: number, dilim: number): string {
  return `${varlik}|${gun}|${dilim}`;
}

/** Bir ders atamasının, seçilen eksende hangi satır-varlıklarına düştüğü. */
function eksenVarliklari(atama: DersAtamasi, eksen: Eksen): string[] {
  return eksen === "sube" ? atama.subeler : atama.ogretmenler;
}

/**
 * `yerlesim`i seçilen eksene göre satır bloklarına çevirir.
 *
 * Satır listesi eksenin TÜM varlıklarıdır (şubeler ya da tüm öğretmenler);
 * yalnız yerleşimi olanlar değil. Böylece hiç ders atanmamış bir öğretmen
 * (örn. idareci) boş bir haftayla görünür ve gözle yakalanabilir (Karar 27).
 *
 * Çok-öğretmenli ya da birleşik (çok-şube) bir atama, eksenindeki HER
 * varlığın satırına aynı bloğu düşürür; blok nesnesi salt-okunur
 * paylaşıldığından bu güvenlidir.
 */
export function cizelgeSatirlariHazirla(
  okul: Okul,
  yerlesim: Yerlesim,
  eksen: Eksen,
): CizelgeVerisi {
  const satirlar =
    eksen === "sube"
      ? okul.subeler.map((s) => s.ad)
      : okul.ogretmenler.map((o) => o.ad);
  const baslangiclar = new Map<string, HucreBlogu>();
  const kapli = new Set<string>();
  for (const g of yerlesim.girdiler) {
    const atama = okul.ders_atamalari[g.ders_atamasi_index];
    if (atama === undefined) continue;
    const blok: HucreBlogu = {
      ders: atama.ders,
      ogretmenler: atama.ogretmenler,
      subeler: atama.subeler,
      sure: g.sure,
    };
    for (const varlik of eksenVarliklari(atama, eksen)) {
      baslangiclar.set(cizelgeAnahtar(varlik, g.gun, g.baslangic_dilim), blok);
      for (let d = 1; d < g.sure; d++) {
        kapli.add(cizelgeAnahtar(varlik, g.gun, g.baslangic_dilim + d));
      }
    }
  }
  return { satirlar, baslangiclar, kapli };
}
