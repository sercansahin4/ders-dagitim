/**
 * Çözücü "bilmiyorum" dediğinde ne söyleyeceğimizin saf mantığı (Karar 29).
 *
 * Neden ayrı dosya: cizelge.ts / taslak.ts deseni — React'sız ve çözücüsüz
 * olduğu için doğrudan vitest'lenir. Ayrıca tanilama.ts'e KONULMAZ: orası
 * Python ikizidir (Karar 22) ve UNKNOWN akışı Python'da yoktur; burası
 * yalnız ÜRÜN katmanının dilidir.
 *
 * Bağlam (docs/gercek-okul-bulgulari.md): kademeli çözümün Geçiş 1'i, süre
 * bütçesi yetmediğinde UNKNOWN döner. UNKNOWN "çözüm yok" DEĞİLDİR — çözücü
 * kararsız kalmıştır. Ürünün tezi gereği bu durumda da eyleme dönük Türkçe
 * bir şey söylenmek zorundadır; "Çözücü durumu: UNKNOWN" bir cevap değildir.
 *
 * YENİ KURAL YOKTUR: buradaki doluluk hesabı model.ts'teki mevcut
 * ogretmenKapasitesi'ni okur, kendi eşiğini koymaz. Çıktısı bir tanı değil,
 * bir SIRALAMADIR ("en sıkışık öğretmenler şunlar") — kullanıcıya nereye
 * bakacağını gösterir, ne yapacağını dayatmaz.
 */
import { ogretmenKapasitesi } from "./model.js";
import type { Okul } from "./model.js";

/** Bir öğretmenin yükü ve kapasitesi; oran = yük / kapasite. */
export interface OgretmenDoluluk {
  ad: string;
  yuk: number;
  kapasite: number;
  /** Kapasite 0 ise 1 kabul edilir (sıfıra bölme yerine "tamamen dolu"). */
  oran: number;
}

/**
 * Öğretmenleri doluluk oranına göre azalan sırada döndürür.
 *
 * Doluluk = atanmış haftalık yük / atanabilir kapasite. Kapasite,
 * model.ts'teki ogretmenKapasitesi'dir: toplam dilim - kapanışlar -
 * (B3 muaf değilse) garanti boş gün için rezerv. %100 doluluk, o
 * öğretmenin haftasında HİÇ boşluk kalmadığı anlamına gelir; çözücünün
 * o öğretmen için tam bir yerleştirme bulması gerekir.
 */
export function ogretmenDoluluklari(okul: Okul): OgretmenDoluluk[] {
  const doluluklar = okul.ogretmenler.map((o) => {
    let yuk = 0;
    for (const a of okul.ders_atamalari) {
      if (a.ogretmenler.includes(o.ad)) yuk += a.haftalik_saat;
    }
    const kapasite = ogretmenKapasitesi(okul, o);
    return { ad: o.ad, yuk, kapasite, oran: kapasite <= 0 ? 1 : yuk / kapasite };
  });
  // Eşitlikte ada göre: rapor koşudan koşuya aynı sırayı versin (determinizm).
  return doluluklar.sort((a, b) => b.oran - a.oran || a.ad.localeCompare(b.ad, "tr"));
}

/** "O06: 16 / 16 dilim (%100)" biçiminde tek satır. */
function dolulukSatiri(d: OgretmenDoluluk): string {
  const yuzde = Math.round(d.oran * 100);
  const not = yuzde >= 100 ? " — hiç boşluk yok" : "";
  return `  ${d.ad}: ${d.yuk} / ${d.kapasite} dilim (%${yuzde})${not}`;
}

/** En sıkışık `kac` öğretmeni listeler; yalnız %80'in üstündekiler gösterilir. */
export function enDoluOgretmenlerMetni(okul: Okul, kac = 3): string {
  const sicak = ogretmenDoluluklari(okul)
    .filter((d) => d.oran >= 0.8)
    .slice(0, kac);
  if (sicak.length === 0) return "";
  return (
    `\nHaftası en sıkışık öğretmenler (yük / kapasite):\n` +
    sicak.map(dolulukSatiri).join("\n") +
    `\n`
  );
}

/**
 * Geçiş 1 UNKNOWN döndüğünde kullanıcıya gösterilecek metin.
 *
 * İki hâl ayrılır, çünkü kullanıcının yapacağı iş farklıdır:
 *  - fizibiliteBulundu=true : kurallara uyan bir çizelge VAR, sadece
 *    iyileştirilmedi. Kullanıcı isterse onu kullanır, isterse süreyi artırır.
 *  - fizibiliteBulundu=false: çözücü hiçbir şey bulamadı. Bu hâlâ "çözüm yok"
 *    DEĞİLDİR; ya süre yetersiz ya program çok sıkışıktır. İkisi de eyleme
 *    dönük olarak söylenir.
 */
export function sureYetmediMesaji(
  okul: Okul,
  fizibiliteBulundu: boolean,
  butceSaniye: number,
): string {
  const butce = `${Math.round(butceSaniye)} sn`;
  if (fizibiliteBulundu) {
    return (
      `ÇİZELGE BULUNDU — ama en iyisi olduğu iddia EDİLEMEZ.\n\n` +
      `Aşağıdaki çizelge bütün sert kuralları sağlıyor: çakışma yok, ` +
      `kapanışlara uyuluyor, bloklar bölünmüyor. Ancak süre bütçesi ` +
      `(${butce}) öğretmen tercihlerini ve pedagojik dengeleri ` +
      `(boş gün, günlük yük, bekleme saatleri) iyileştirmeye yetmedi; ` +
      `karne bu yüzden üretilmedi.\n\n` +
      `Ne yapabilirsiniz: Süre bütçesini artırıp tekrar çözün. ` +
      `Bu çizelgeyi şimdilik kullanabilirsiniz, kural ihlali içermiyor.\n` +
      enDoluOgretmenlerMetni(okul)
    );
  }
  return (
    `ÇÖZÜCÜ SÜRE BÜTÇESİNE (${butce}) SIĞMADI.\n\n` +
    `Bu "çözüm yok" demek DEĞİLDİR — çözücü kararsız kaldı: ne bir çizelge ` +
    `bulabildi ne de çizelge olmadığını kanıtlayabildi. İki olasılık var: ` +
    `süre yetersiz, ya da program çok sıkışık.\n\n` +
    `Sırasıyla deneyin:\n` +
    `  1. Süre bütçesini artırın (şu an ${butce}; 180-300 sn deneyin). ` +
    `Bu okulun büyüklüğünde bu normaldir.\n` +
    `  2. Sıkışıklığı azaltın: en dolu öğretmenin bir kapanışını kaldırın ` +
    `veya yükünün bir bölümünü başka öğretmene aktarın.\n` +
    enDoluOgretmenlerMetni(okul)
  );
}
