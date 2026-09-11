/**
 * Okul taslağının saf (React'sız) durum mantığı — veri girişi ekranının
 * çekirdeği (Karar 28, ilk artış: "yüklenmiş okulu düzenle → tekrar çöz").
 *
 * cizelge.ts deseni izlenir: mantık React'tan bağımsız olduğu için render
 * çalıştırmadan doğrudan vitest'lenir; React katmanı (DersAtamasiDuzenle,
 * OgretmenDuzenle) yalnız bu fonksiyonları çağıran ince bir görünümdür.
 *
 * İki disiplin notu:
 *  1) Karar 22 — bu modül YENİ doğrulama kuralı EKLEMEZ. Tutarlılık
 *     denetimi model.ts'teki aKatmaniDogrulama'nın işidir; buradaki tek
 *     "kural" referans bütünlüğüdür (aşağıda).
 *  2) Referans bütünlüğü — veri modeli v0'da (Karar 16) varlıklar birbirine
 *     ADA göre bağlıdır: bir öğretmenin adı ogretmenler[], ders_atamalari
 *     .ogretmenler[], subeler.sinif_rehber_ogretmeni ve kural_ayarlari
 *     .b3_muaf_ogretmenler olmak üzere DÖRT yerde geçer. Adı elle bir yerde
 *     değiştirmek diğer üçünü sessizce kırar; bu yüzden yeniden adlandırma
 *     ve silme burada tek elden, dört referansı birlikte görerek yapılır.
 *
 * Tüm güncellemeler DEĞİŞMEZDİR (immutable): girdi Okul'a dokunulmaz, yeni
 * bir Okul döner. Gerekçe: React yeniden-render kararını referans eşitliğiyle
 * verir; yerinde mutasyon ekranı sessizce güncellenmemiş bırakır.
 */
import { varsayilanIzgara, varsayilanKuralAyarlari } from "./model.js";
import type {
  Ders,
  DersAtamasi,
  DersKategorisi,
  Izgara,
  Kapanis,
  Ogretmen,
  Okul,
  Sube,
} from "./model.js";

/** Taslağa uygulanabilecek düzenleme eylemleri (ilk artış kapsamı). */
export type TaslakEylem =
  | { tip: "ogretmenBosGun"; ogretmen: string; bosGun: number | null }
  | { tip: "kapanisEkle"; ogretmen: string; kapanis: Kapanis }
  | { tip: "kapanisSil"; ogretmen: string; kapanisIndex: number }
  | { tip: "atamaSaat"; atamaIndex: number; saat: number }
  | { tip: "atamaBlokEkle"; atamaIndex: number; blok: number }
  | { tip: "atamaBlokSil"; atamaIndex: number; blokIndex: number }
  | { tip: "ogretmenYenidenAdlandir"; eski: string; yeni: string }
  | { tip: "ogretmenSil"; ogretmen: string }
  | { tip: "sureButcesi"; saniye: number }
  // --- İkinci artış: sıfırdan okul kurma ---
  | { tip: "yeniOkul"; izgara: Izgara }
  | { tip: "izgaraAyarla"; izgara: Izgara }
  | { tip: "subeEkle"; ad: string }
  | { tip: "subeSil"; ad: string }
  | { tip: "subeYenidenAdlandir"; eski: string; yeni: string }
  | { tip: "subeRehberOgretmeni"; sube: string; ogretmen: string | null }
  | { tip: "dersEkle"; ad: string; kategori: DersKategorisi }
  | { tip: "dersSil"; ad: string }
  | { tip: "dersYenidenAdlandir"; eski: string; yeni: string }
  | { tip: "dersKategori"; ad: string; kategori: DersKategorisi }
  | { tip: "ogretmenEkle"; ad: string }
  | { tip: "ogretmenBrans"; ogretmen: string; dersler: string[] }
  | { tip: "ogretmenB3Muafiyeti"; ogretmen: string; muaf: boolean }
  | { tip: "atamaEkle"; atama: DersAtamasi }
  | { tip: "atamaSil"; atamaIndex: number }
  | { tip: "atamaOgretmenler"; atamaIndex: number; ogretmenler: string[] }
  | { tip: "subeDersTablosuKopyala"; kaynak: string; hedef: string };

/** Bir isim listesinde eski adı (varsa) yenisiyle değiştirir. */
function adDegistir(adlar: readonly string[], eski: string, yeni: string): string[] {
  return adlar.map((a) => (a === eski ? yeni : a));
}

/** Adı eşleşen tek öğretmeni saf biçimde dönüştürür, diğerlerine dokunmaz. */
function ogretmeniGuncelle(
  okul: Okul,
  ad: string,
  donustur: (o: Ogretmen) => Ogretmen,
): Okul {
  return {
    ...okul,
    ogretmenler: okul.ogretmenler.map((o) => (o.ad === ad ? donustur(o) : o)),
  };
}

/** Index'i eşleşen tek ders atamasını saf biçimde dönüştürür. */
function atamayiGuncelle(
  okul: Okul,
  atamaIndex: number,
  donustur: (a: DersAtamasi) => DersAtamasi,
): Okul {
  return {
    ...okul,
    ders_atamalari: okul.ders_atamalari.map((a, i) =>
      i === atamaIndex ? donustur(a) : a,
    ),
  };
}

/**
 * Bir öğretmenin adını TÜM referanslarıyla birlikte değiştirir: öğretmen
 * kaydı, ders_atamalari.ogretmenler, subeler.sinif_rehber_ogretmeni ve
 * kural_ayarlari.b3_muaf_ogretmenler. (Referans bütünlüğü — modül başlığı.)
 */
export function ogretmenYenidenAdlandir(okul: Okul, eski: string, yeni: string): Okul {
  return {
    ...okul,
    ogretmenler: okul.ogretmenler.map((o) =>
      o.ad === eski ? { ...o, ad: yeni } : o,
    ),
    ders_atamalari: okul.ders_atamalari.map((a) => ({
      ...a,
      ogretmenler: adDegistir(a.ogretmenler, eski, yeni),
    })),
    subeler: okul.subeler.map((s) =>
      s.sinif_rehber_ogretmeni === eski ? { ...s, sinif_rehber_ogretmeni: yeni } : s,
    ),
    kural_ayarlari: {
      ...okul.kural_ayarlari,
      b3_muaf_ogretmenler: new Set(
        [...okul.kural_ayarlari.b3_muaf_ogretmenler].map((a) =>
          a === eski ? yeni : a,
        ),
      ),
    },
  };
}

/** Bir öğretmenin geçtiği ders atamalarını (ders adlarıyla) döndürür. */
export function ogretmenKullanimlari(okul: Okul, ad: string): string[] {
  return okul.ders_atamalari
    .filter((a) => a.ogretmenler.includes(ad))
    .map((a) => a.ders);
}

/**
 * Bir öğretmenin güvenle silinip silinemeyeceğine karar verir; silinemiyorsa
 * nedenini eyleme dönük Türkçe cümleyle döndürür (ürünün açıklanabilirlik
 * tezinin giriş anına taşınması). Silme onayı UI'nındır; burada yalnız KARAR.
 */
export function ogretmenSilinebilir(
  okul: Okul,
  ad: string,
): { silinebilir: boolean; neden: string | null } {
  const kullanim = ogretmenKullanimlari(okul, ad);
  if (kullanim.length > 0) {
    return {
      silinebilir: false,
      neden:
        `${ad} şu ders atamalarında kullanılıyor: ${kullanim.join(", ")}. ` +
        `Önce bu atamalardan çıkarın veya yerine başka öğretmen atayın, sonra silin.`,
    };
  }
  const rehberSubeler = okul.subeler
    .filter((s) => s.sinif_rehber_ogretmeni === ad)
    .map((s) => s.ad);
  if (rehberSubeler.length > 0) {
    return {
      silinebilir: false,
      neden:
        `${ad}, şu şube(ler)in sınıf rehber öğretmeni: ${rehberSubeler.join(", ")}. ` +
        `Önce yerine başka rehber öğretmen atayın, sonra silin.`,
    };
  }
  return { silinebilir: true, neden: null };
}

// --- İkinci artış: sıfırdan okul kurma (şube / ders / öğretmen / atama) ---
//
// Referans bütünlüğü yüzeyi (modül başlığındaki DÖRT yere ek olarak):
//   şube adı İKİ yerde : subeler[].ad, ders_atamalari[].subeler[]
//   ders adı  ÜÇ yerde : dersler[].ad, ders_atamalari[].ders,
//                        ogretmenler[].verebilecegi_dersler[]
// Üçüncüsü kolayca gözden kaçar: branş listesi ders ADINA bağlıdır ve
// A-katmanının branş uyumu kontrolü ona bakar. Adı bir yerde değiştirip
// orayı unutmak, öğretmeni sessizce "bu dersi veremez" hâline getirir.

/** Hiç veri içermeyen, varsayılan ayarlı boş okul (yeni okul başlangıcı). */
export function bosOkul(izgara: Izgara = varsayilanIzgara()): Okul {
  return {
    izgara,
    dersler: [],
    ogretmenler: [],
    subeler: [],
    ders_atamalari: [],
    kural_ayarlari: varsayilanKuralAyarlari(),
  };
}

/** Bir şubenin geçtiği ders atamalarının ders adları. */
export function subeKullanimlari(okul: Okul, ad: string): string[] {
  return okul.ders_atamalari
    .filter((a) => a.subeler.includes(ad))
    .map((a) => a.ders);
}

/** Bir dersin geçtiği ders atamalarının şube adları (çok şubeliler düzleştirilir). */
export function dersKullanimlari(okul: Okul, ad: string): string[] {
  return okul.ders_atamalari
    .filter((a) => a.ders === ad)
    .flatMap((a) => a.subeler);
}

/** Şube güvenle silinebilir mi; silinemiyorsa eyleme dönük Türkçe neden. */
export function subeSilinebilir(
  okul: Okul,
  ad: string,
): { silinebilir: boolean; neden: string | null } {
  const dersler = [...new Set(subeKullanimlari(okul, ad))];
  if (dersler.length > 0) {
    return {
      silinebilir: false,
      neden:
        `${ad} şubesi şu derslerin atamasında kullanılıyor: ${dersler.join(", ")}. ` +
        `Önce bu atamaları silin veya başka şubeye taşıyın, sonra şubeyi silin.`,
    };
  }
  return { silinebilir: true, neden: null };
}

/** Ders güvenle silinebilir mi; silinemiyorsa eyleme dönük Türkçe neden. */
export function dersSilinebilir(
  okul: Okul,
  ad: string,
): { silinebilir: boolean; neden: string | null } {
  const subeler = [...new Set(dersKullanimlari(okul, ad))];
  if (subeler.length > 0) {
    return {
      silinebilir: false,
      neden:
        `${ad} dersi şu şubelere atanmış: ${subeler.join(", ")}. ` +
        `Önce bu atamaları silin, sonra dersi silin.`,
    };
  }
  const verenler = okul.ogretmenler
    .filter((o) => o.verebilecegi_dersler.includes(ad))
    .map((o) => o.ad);
  if (verenler.length > 0) {
    return {
      silinebilir: false,
      neden:
        `${ad} dersi şu öğretmenlerin branş listesinde: ${verenler.join(", ")}. ` +
        `Önce onların branşından çıkarın, sonra dersi silin.`,
    };
  }
  return { silinebilir: true, neden: null };
}

/** Şube adını İKİ referansıyla birlikte değiştirir. */
export function subeYenidenAdlandir(okul: Okul, eski: string, yeni: string): Okul {
  return {
    ...okul,
    subeler: okul.subeler.map((s) => (s.ad === eski ? { ...s, ad: yeni } : s)),
    ders_atamalari: okul.ders_atamalari.map((a) => ({
      ...a,
      subeler: adDegistir(a.subeler, eski, yeni),
    })),
  };
}

/** Ders adını ÜÇ referansıyla birlikte değiştirir (branş listesi dahil). */
export function dersYenidenAdlandir(okul: Okul, eski: string, yeni: string): Okul {
  return {
    ...okul,
    dersler: okul.dersler.map((d) => (d.ad === eski ? { ...d, ad: yeni } : d)),
    ders_atamalari: okul.ders_atamalari.map((a) =>
      a.ders === eski ? { ...a, ders: yeni } : a,
    ),
    ogretmenler: okul.ogretmenler.map((o) => ({
      ...o,
      verebilecegi_dersler: adDegistir(o.verebilecegi_dersler, eski, yeni),
    })),
  };
}

/**
 * Izgara küçültülürse aralık dışında kalacak kayıtları sayar. Reducer bunları
 * TEMİZLEMEZ (sessiz veri kaybı olurdu); UI bu sayıyı gösterip onay ister.
 */
export function izgaraDisiKalanlar(
  okul: Okul,
  izgara: Izgara,
): { kapanis: number; sabitDilim: number } {
  let kapanis = 0;
  for (const o of okul.ogretmenler) {
    for (const k of o.kapanislar) {
      if (k.gun > izgara.gun_sayisi || k.dilimler.some((d) => d > izgara.dilim_sayisi)) {
        kapanis += 1;
      }
    }
  }
  let sabitDilim = 0;
  for (const a of okul.ders_atamalari) {
    for (const yer of a.sabit_dilimler ?? []) {
      // sabit_dilimler girdileri [gun, dilim] çiftidir; tsconfig strict
      // indeks erişimini undefined sayıyor, aralık dışı sayımı bozmayan
      // güvenli varsayılanla okunur.
      const gun = yer[0] ?? 1;
      const dilim = yer[1] ?? 1;
      if (gun > izgara.gun_sayisi || dilim > izgara.dilim_sayisi) sabitDilim += 1;
    }
  }
  return { kapanis, sabitDilim };
}

/**
 * Kaynak şubenin ders tablosunu hedef şubeye çoğaltır.
 *
 * Tasarım kararı (11 Eyl 2026): ders tablosu ile ders dağıtımı okulun iki
 * AYRI işidir — tablo MEB çizelgesinden gelir, dağıtım okulun kararıdır.
 * Bu yüzden kopyada `ogretmenler` BOŞ bırakılır; A-katmanı "öğretmen
 * atanmamış" diyecek ve bu, kalan işler listesinde EKSİK olarak görünecektir.
 *
 * Seviye şablonu yerine şubeden şubeye kopyalama seçildi: veri modeli v0'da
 * (Karar 16) "seviye" alanı yok; eklemek dondurulmuş modeli açardı.
 *
 * Atlananlar: hedefte aynı ders zaten varsa üzerine YAZILMAZ; çok şubeli
 * (birleşik) atamalar kopyalanmaz — birleşik ders arayüzü bu artışın dışında.
 */
export function subeDersTablosuKopyala(
  okul: Okul,
  kaynak: string,
  hedef: string,
): { okul: Okul; kopyalandi: number; atlandiVar: number; atlandiCokSubeli: number } {
  if (kaynak === hedef || !okul.subeler.some((s) => s.ad === hedef)) {
    return { okul, kopyalandi: 0, atlandiVar: 0, atlandiCokSubeli: 0 };
  }
  const hedeftekiDersler = new Set(
    okul.ders_atamalari.filter((a) => a.subeler.includes(hedef)).map((a) => a.ders),
  );
  const yeniler: DersAtamasi[] = [];
  let atlandiVar = 0;
  let atlandiCokSubeli = 0;
  for (const a of okul.ders_atamalari) {
    if (!a.subeler.includes(kaynak)) continue;
    if (a.subeler.length > 1) {
      atlandiCokSubeli += 1;
      continue;
    }
    if (hedeftekiDersler.has(a.ders)) {
      atlandiVar += 1;
      continue;
    }
    yeniler.push({
      ders: a.ders,
      haftalik_saat: a.haftalik_saat,
      blok_deseni: [...a.blok_deseni],
      subeler: [hedef],
      ogretmenler: [],
      sabit_dilimler: null,
      birlestirilebilir: a.birlestirilebilir,
    });
  }
  return {
    okul:
      yeniler.length === 0
        ? okul
        : { ...okul, ders_atamalari: [...okul.ders_atamalari, ...yeniler] },
    kopyalandi: yeniler.length,
    atlandiVar,
    atlandiCokSubeli,
  };
}

/**
 * Ekrandaki sonucun, onu üreten veriden sonra taslağın değişip
 * değişmediğini söyler (Kusur 1, 11 Eyl 2026 kabul testi).
 *
 * Neden referans karşılaştırması yeterli: taslakReducer DEĞİŞMEZDİR —
 * her gerçek düzenleme yeni bir Okul nesnesi döndürür, reddedilen bir
 * düzenleme (ör. korumalı silme) ise aynı nesneyi döndürür. Böylece
 * "veri değişti mi" sorusu derin karşılaştırma olmadan, yanlış pozitif
 * üretmeden yanıtlanır.
 *
 * Sonuç SİLİNMEZ, yalnız bayat işaretlenir: kullanıcının elindeki tek
 * kıyas malzemesi odur (bkz. docs/gercek-okul-bulgulari.md, Kusur 1).
 */
export function sonucBayatMi(
  cozulenTaslak: Okul | null,
  taslak: Okul | null,
): boolean {
  if (cozulenTaslak === null || taslak === null) return false;
  return cozulenTaslak !== taslak;
}

/** Taslak üzerinde tek bir düzenleme eylemini uygular (değişmez). */
export function taslakReducer(okul: Okul, eylem: TaslakEylem): Okul {
  switch (eylem.tip) {
    case "ogretmenBosGun":
      return ogretmeniGuncelle(okul, eylem.ogretmen, (o) => ({
        ...o,
        bos_gun_tercihi: eylem.bosGun,
      }));
    case "kapanisEkle":
      return ogretmeniGuncelle(okul, eylem.ogretmen, (o) => ({
        ...o,
        kapanislar: [...o.kapanislar, eylem.kapanis],
      }));
    case "kapanisSil":
      return ogretmeniGuncelle(okul, eylem.ogretmen, (o) => ({
        ...o,
        kapanislar: o.kapanislar.filter((_, i) => i !== eylem.kapanisIndex),
      }));
    case "atamaSaat":
      return atamayiGuncelle(okul, eylem.atamaIndex, (a) => ({
        ...a,
        haftalik_saat: eylem.saat,
      }));
    case "atamaBlokEkle":
      return atamayiGuncelle(okul, eylem.atamaIndex, (a) => ({
        ...a,
        blok_deseni: [...a.blok_deseni, eylem.blok],
      }));
    case "atamaBlokSil":
      return atamayiGuncelle(okul, eylem.atamaIndex, (a) => ({
        ...a,
        blok_deseni: a.blok_deseni.filter((_, i) => i !== eylem.blokIndex),
      }));
    case "ogretmenYenidenAdlandir":
      return ogretmenYenidenAdlandir(okul, eylem.eski, eylem.yeni);
    case "ogretmenSil":
      // Savunmacı: UI silmeden önce ogretmenSilinebilir'i sorup nedeni
      // gösterse de, güvenli olmayan silme burada da reddedilir (değişmez
      // döner) — referans bütünlüğü invaryantı UI hatasına dayanıklı kalsın.
      if (!ogretmenSilinebilir(okul, eylem.ogretmen).silinebilir) return okul;
      return {
        ...okul,
        ogretmenler: okul.ogretmenler.filter((o) => o.ad !== eylem.ogretmen),
      };
    case "sureButcesi":
      // Karar 29: süre bütçesi artık kullanıcının elinde. Çözücüye 0 ya da
      // negatif bütçe göndermek anlamsız olduğundan taban 1 sn'dir; üst sınır
      // KONULMAZ (büyük okulda 300+ sn meşru bir tercihtir, bkz.
      // docs/gercek-okul-bulgulari.md).
      return {
        ...okul,
        kural_ayarlari: {
          ...okul.kural_ayarlari,
          sure_butcesi_saniye: Math.max(1, eylem.saniye),
        },
      };

    // --- İkinci artış ---
    // Ad çakışmalarında ve güvenli olmayan silmelerde DEĞİŞMEZ döndürülür;
    // UI nedeni Türkçe gösterir. Invaryant UI hatasına dayanıklı kalsın.
    case "yeniOkul":
      return bosOkul(eylem.izgara);
    case "izgaraAyarla":
      return { ...okul, izgara: eylem.izgara };
    case "subeEkle": {
      const ad = eylem.ad.trim();
      if (ad === "" || okul.subeler.some((s) => s.ad === ad)) return okul;
      const sube: Sube = { ad, sinif_rehber_ogretmeni: null };
      return { ...okul, subeler: [...okul.subeler, sube] };
    }
    case "subeSil":
      if (!subeSilinebilir(okul, eylem.ad).silinebilir) return okul;
      return { ...okul, subeler: okul.subeler.filter((s) => s.ad !== eylem.ad) };
    case "subeYenidenAdlandir": {
      const yeni = eylem.yeni.trim();
      if (yeni === "" || okul.subeler.some((s) => s.ad === yeni)) return okul;
      return subeYenidenAdlandir(okul, eylem.eski, yeni);
    }
    case "subeRehberOgretmeni":
      return {
        ...okul,
        subeler: okul.subeler.map((s) =>
          s.ad === eylem.sube ? { ...s, sinif_rehber_ogretmeni: eylem.ogretmen } : s,
        ),
      };
    case "dersEkle": {
      const ad = eylem.ad.trim();
      if (ad === "" || okul.dersler.some((d) => d.ad === ad)) return okul;
      const ders: Ders = { ad, kategori: eylem.kategori };
      return { ...okul, dersler: [...okul.dersler, ders] };
    }
    case "dersSil":
      if (!dersSilinebilir(okul, eylem.ad).silinebilir) return okul;
      return { ...okul, dersler: okul.dersler.filter((d) => d.ad !== eylem.ad) };
    case "dersYenidenAdlandir": {
      const yeni = eylem.yeni.trim();
      if (yeni === "" || okul.dersler.some((d) => d.ad === yeni)) return okul;
      return dersYenidenAdlandir(okul, eylem.eski, yeni);
    }
    case "dersKategori":
      return {
        ...okul,
        dersler: okul.dersler.map((d) =>
          d.ad === eylem.ad ? { ...d, kategori: eylem.kategori } : d,
        ),
      };
    case "ogretmenEkle": {
      const ad = eylem.ad.trim();
      if (ad === "" || okul.ogretmenler.some((o) => o.ad === ad)) return okul;
      const ogretmen: Ogretmen = {
        ad,
        verebilecegi_dersler: [],
        bos_gun_tercihi: null,
        kapanislar: [],
      };
      return { ...okul, ogretmenler: [...okul.ogretmenler, ogretmen] };
    }
    case "ogretmenBrans":
      return ogretmeniGuncelle(okul, eylem.ogretmen, (o) => ({
        ...o,
        verebilecegi_dersler: [...eylem.dersler],
      }));
    case "ogretmenB3Muafiyeti": {
      const kume = new Set(okul.kural_ayarlari.b3_muaf_ogretmenler);
      if (eylem.muaf) kume.add(eylem.ogretmen);
      else kume.delete(eylem.ogretmen);
      return {
        ...okul,
        kural_ayarlari: { ...okul.kural_ayarlari, b3_muaf_ogretmenler: kume },
      };
    }
    case "atamaEkle":
      return { ...okul, ders_atamalari: [...okul.ders_atamalari, eylem.atama] };
    case "atamaOgretmenler":
      // Ders DAĞITIMI adımı: tabloya kimin gireceği burada belirlenir.
      // Branş uyumunu A-katmanı denetler (kontrolBransDersUyumu); burada
      // kural tekrarlanmaz (Karar 22).
      return atamayiGuncelle(okul, eylem.atamaIndex, (a) => ({
        ...a,
        ogretmenler: [...eylem.ogretmenler],
      }));
    case "atamaSil":
      return {
        ...okul,
        ders_atamalari: okul.ders_atamalari.filter((_, i) => i !== eylem.atamaIndex),
      };
    case "subeDersTablosuKopyala":
      // Sayaçlar UI'da gösterilecekse subeDersTablosuKopyala doğrudan
      // çağrılır (saf ve ucuz); reducer yalnız okul'u alır.
      return subeDersTablosuKopyala(okul, eylem.kaynak, eylem.hedef).okul;
  }
}
