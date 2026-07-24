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
import type { DersAtamasi, Kapanis, Ogretmen, Okul } from "./model.js";

/** Taslağa uygulanabilecek düzenleme eylemleri (ilk artış kapsamı). */
export type TaslakEylem =
  | { tip: "ogretmenBosGun"; ogretmen: string; bosGun: number | null }
  | { tip: "kapanisEkle"; ogretmen: string; kapanis: Kapanis }
  | { tip: "kapanisSil"; ogretmen: string; kapanisIndex: number }
  | { tip: "atamaSaat"; atamaIndex: number; saat: number }
  | { tip: "atamaBlokEkle"; atamaIndex: number; blok: number }
  | { tip: "atamaBlokSil"; atamaIndex: number; blokIndex: number }
  | { tip: "ogretmenYenidenAdlandir"; eski: string; yeni: string }
  | { tip: "ogretmenSil"; ogretmen: string };

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
  }
}
