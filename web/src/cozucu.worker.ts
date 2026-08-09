/**
 * Çözücü Web Worker'ı (Karar 24): kademeli çözüm ana iş parçacığını
 * dondurmasın diye burada koşar. Tek işçi varsayılanı kademeliCoz'un
 * içindedir (numSearchWorkers=1, Karar 20); SharedArrayBuffer ve
 * COOP/COEP başlığı GEREKMEZ — kanıt ekranının ilk doğrulama maddesi.
 *
 * Sözleşme: KademeliSonuc çözücü değişkenleri içerdiğinden (Map +
 * wasm nesneleri) worker sınırından GEÇEMEZ; karne metni burada
 * üretilir ve ana iş parçacığına yalnız düz (structured-clone'lanabilir)
 * alanlar gönderilir.
 */
import { okulYukleMetinden } from "./model.js";
import type { Okul, Yerlesim } from "./model.js";
import { coz, kademeliCoz } from "./coz.js";
import { cezalariHesapla, karneMetni } from "./karne.js";
import { sureYetmediMesaji } from "./durumRaporu.js";
import { tanila } from "./tanilama.js";

/**
 * Ana iş parçacığından worker'a giden istek: çözülecek okulun JSON
 * metni. Okul NESNESİ yerine metin taşınır ki iki taraf da aynı
 * yükleyiciden (okulYukleMetinden) geçsin — tek doğruluk kaynağı.
 */
export interface CozIstegi {
  tip: "coz";
  okulMetni: string;
}

/**
 * Worker'dan ana iş parçacığına giden mesaj. okul ve yerlesim çizelge
 * tablosu için taşınır; ikisi de structured-clone'lanabilir (KuralAyarlari
 * içindeki Set'ler dahil — Set, structured clone kapsamındadır).
 */
export interface CozumMesaji {
  tip: "sonuc";
  durumUst: string;
  durumAlt: string | null;
  kilitDegeri: number | null;
  gecis2Kullanildi: boolean;
  sureSn: number;
  karne: string | null;
  /** Çözümsüzlükte (INFEASIBLE) tanılama modunun Türkçe eylem raporu. */
  tanilamaRaporu: string | null;
  /** UNKNOWN'da (süre yetmedi) eyleme dönük Türkçe rapor — Karar 29. */
  sureRaporu: string | null;
  /**
   * Geçiş 1 UNKNOWN dönüp fizibilite geri düşüşü çalıştıysa true. Ekrandaki
   * çizelgenin "sert kuralları sağlar ama iyileştirilmemiş" olduğunu bildirir;
   * bu hâlde karne üretilmez (ceza dökümü Geçiş 1 çözümüne aittir, yoktur).
   */
  fizibiliteGeriDusus: boolean;
  okul: Okul;
  yerlesim: Yerlesim | null;
}

export interface HataMesaji {
  tip: "hata";
  mesaj: string;
}

self.onmessage = async (olay: MessageEvent<CozIstegi>) => {
  try {
    const okul = okulYukleMetinden(olay.data.okulMetni);
    const baslangic = performance.now();
    const sonuc = await kademeliCoz(okul);
    const sureSn = (performance.now() - baslangic) / 1000;

    const karne =
      sonuc.yerlesim === null
        ? null
        : karneMetni(okul, cezalariHesapla(okul, sonuc.yerlesim));

    // Çözümsüzlük kanıtlandıysa (INFEASIBLE) tanılama modunda yeniden
    // kurulup Türkçe eylem raporu üretilir (Karar 13 akışı). UNKNOWN
    // tanılanmaz: unsat core yoktur, çünkü çözümsüzlük kanıtı yoktur.
    const tanilamaRaporu =
      sonuc.durumUst === "INFEASIBLE" ? await tanila(okul) : null;

    // --- Karar 29: UNKNOWN artık sessiz değil ------------------------------
    // Geçiş 1 süre bütçesine sığmazsa kullanıcıya "UNKNOWN" demek bir cevap
    // değildir. O hâlde ürün ikinci ve DAHA KOLAY soruyu sorar: amaç
    // fonksiyonsuz, yalnız sert kurallı bir çizelge var mı? (coz(); C1-C8
    // olmadığı için aynı bütçede çok daha ulaşılabilir.)
    //
    // Bütçe: Geçiş 2 bu hâlde zaten koşmaz, o yüzden kullanılmayan kalan
    // bütçe geri düşüşe verilir — kullanıcının beklediği TOPLAM süre
    // değişmez. Alt sınır 1 sn (kademeliCoz'un Geçiş 2 kuralıyla aynı).
    //
    // Bu akış bilinçli olarak coz.ts'te DEĞİL burada durur: coz.ts Python
    // ikizidir (Karar 22) ve bu bir ürün akışı kararıdır, çözücü davranışı
    // değil. tanila() tetiklemesi de aynı gerekçeyle burada.
    const sureYetmedi =
      sonuc.durumUst !== "OPTIMAL" &&
      sonuc.durumUst !== "FEASIBLE" &&
      sonuc.durumUst !== "INFEASIBLE";

    let yerlesim = sonuc.yerlesim;
    let sureRaporu: string | null = null;
    let fizibiliteGeriDusus = false;

    if (sureYetmedi) {
      const butce = okul.kural_ayarlari.sure_butcesi_saniye;
      const kalan = Math.max(butce - sureSn, 1.0);
      const geri = await coz(okul, kalan);
      fizibiliteGeriDusus = geri.yerlesim !== null;
      yerlesim = geri.yerlesim;
      sureRaporu = sureYetmediMesaji(okul, fizibiliteGeriDusus, butce);
    }

    const mesaj: CozumMesaji = {
      tip: "sonuc",
      durumUst: sonuc.durumUst,
      durumAlt: sonuc.durumAlt,
      kilitDegeri: sonuc.kilitDegeri,
      gecis2Kullanildi: sonuc.gecis2Kullanildi,
      sureSn: (performance.now() - baslangic) / 1000,
      karne,
      tanilamaRaporu,
      sureRaporu,
      fizibiliteGeriDusus,
      okul,
      yerlesim,
    };
    self.postMessage(mesaj);
  } catch (hata) {
    const mesaj: HataMesaji = { tip: "hata", mesaj: String(hata) };
    self.postMessage(mesaj);
  }
};
