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
import { kademeliCoz } from "./coz.js";
import { cezalariHesapla, karneMetni } from "./karne.js";

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

    const mesaj: CozumMesaji = {
      tip: "sonuc",
      durumUst: sonuc.durumUst,
      durumAlt: sonuc.durumAlt,
      kilitDegeri: sonuc.kilitDegeri,
      gecis2Kullanildi: sonuc.gecis2Kullanildi,
      sureSn,
      karne,
      okul,
      yerlesim: sonuc.yerlesim,
    };
    self.postMessage(mesaj);
  } catch (hata) {
    const mesaj: HataMesaji = { tip: "hata", mesaj: String(hata) };
    self.postMessage(mesaj);
  }
};
