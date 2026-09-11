/**
 * A-katmanı çıktısının "kalan işler" biçiminde sunumu (11 Eyl 2026 kararı).
 *
 * Sorun: boş bir okulda tek kırmızı liste onlarca satırla açılıyor ve ekran
 * "bozuk" gibi okunuyor. Oysa maddelerin çoğu hata değil, HENÜZ YAPILMAMIŞ
 * iştir. Bu modül aynı çıktıyı iki başlığa ayırır.
 *
 * Karar 22 disiplini — burada YENİ KURAL YOKTUR:
 *  - model.ts sekiz kontrolü tek tek dışa açıyor; bu modül onları ayrı ayrı
 *    çağırıp gruplandırmaktan başka bir şey yapmaz. Mesaj metinleri model.ts'in
 *    ürettiği metinlerdir; burada yeniden yazılmaz.
 *  - `aKatmaniDogrulama`'nın imzası ve çıktı SIRASI değişmez (Python ikizi
 *    korunur, altın testler etkilenmez).
 *  - ÇÖZ KAPISI bu modüle BAĞLI DEĞİLDİR. Kapı eskisi gibi
 *    `aKatmaniDogrulama(okul).length === 0` şartına bakar; buradaki
 *    "başlangıç adımları" yalnız yol gösterir, hiçbir şeyi engellemez.
 *
 * Sınıflandırma neden kontrol fonksiyonu düzeyinde: mesaj metnine bakarak
 * ayırmak kırılgan olurdu. `kontrolSinifRehberOgretmeni` tek başına hem
 * "tanımlı değil" (eksik) hem "başka öğretmen girmiş" (çelişki) üretiyor;
 * onu ikiye bölmek model.ts'te mesaj SIRASINI değiştirirdi (şube başına
 * dallanıyor), bu yüzden bölünmedi ve tamamı ÇELİŞKİLİ sayıldı.
 */
import {
  aKatmaniDogrulama,
  kontrolAtamaOgretmenAtanmis,
  kontrolBlokDeseniToplami,
  kontrolBlokSayisiSiniri,
  kontrolBransDersUyumu,
  kontrolDersIcinYeterliOgretmenKapasitesi,
  kontrolOgretmenKapasitesi,
  kontrolSinifRehberOgretmeni,
  kontrolSubeToplamHds,
} from "./model.js";
import type { Okul } from "./model.js";

export interface KalanIslerRaporu {
  /** Henüz girilmemiş olanlar — yapılacaklar listesi. */
  eksik: string[];
  /** Girilmiş ama birbiriyle tutmayanlar — düzeltilmesi gerekenler. */
  celiskili: string[];
  /** Çöz kapısının baktığı sayı (aKatmaniDogrulama toplamı). */
  kapiSorunSayisi: number;
}

/**
 * Boş okulda yol gösteren adımlar. KURAL DEĞİLDİR: A-katmanının bildirdiği
 * hiçbir şeyi tekrarlamaz ve Çöz kapısını etkilemez; yalnız "şimdi ne
 * yapmalıyım" sorusunu yanıtlar.
 */
export function baslangicAdimlari(okul: Okul): string[] {
  const adimlar: string[] = [];
  if (okul.subeler.length === 0) {
    adimlar.push("Henüz şube eklenmedi: okulun şubelerini ekleyin (ör. 9-A).");
  }
  if (okul.dersler.length === 0) {
    adimlar.push("Henüz ders eklenmedi: ders listesini ve kategorilerini girin.");
  }
  if (okul.ogretmenler.length === 0) {
    adimlar.push("Henüz öğretmen eklenmedi: öğretmenleri ve branşlarını girin.");
  }
  if (
    okul.ders_atamalari.length === 0 &&
    okul.subeler.length > 0 &&
    okul.dersler.length > 0
  ) {
    adimlar.push(
      "Hiç ders ataması yok: bir şubenin ders tablosunu girin, sonra diğer " +
        "şubelere kopyalayın.",
    );
  }
  return adimlar;
}

/** A-katmanı çıktısını eksik/çelişkili olarak ikiye ayırır. */
export function kalanIsler(okul: Okul): KalanIslerRaporu {
  const eksik = [...baslangicAdimlari(okul), ...kontrolAtamaOgretmenAtanmis(okul)];
  const celiskili = [
    ...kontrolSubeToplamHds(okul),
    ...kontrolBransDersUyumu(okul),
    ...kontrolBlokDeseniToplami(okul),
    ...kontrolBlokSayisiSiniri(okul),
    ...kontrolOgretmenKapasitesi(okul),
    ...kontrolDersIcinYeterliOgretmenKapasitesi(okul),
    ...kontrolSinifRehberOgretmeni(okul),
  ];
  return { eksik, celiskili, kapiSorunSayisi: aKatmaniDogrulama(okul).length };
}
