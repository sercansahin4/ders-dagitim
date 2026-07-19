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
import ornekOkulMetni from "../../deney/veri/ornek_okul.json?raw";
import { okulYukleMetinden } from "./model.js";
import { kademeliCoz } from "./coz.js";
import { cezalariHesapla, karneMetni } from "./karne.js";

/** Worker'dan ana iş parçacığına giden mesaj (düz veri). */
export interface CozumMesaji {
  tip: "sonuc";
  durumUst: string;
  durumAlt: string | null;
  kilitDegeri: number | null;
  gecis2Kullanildi: boolean;
  sureSn: number;
  karne: string | null;
}

export interface HataMesaji {
  tip: "hata";
  mesaj: string;
}

self.onmessage = async () => {
  try {
    const okul = okulYukleMetinden(ornekOkulMetni);
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
    };
    self.postMessage(mesaj);
  } catch (hata) {
    const mesaj: HataMesaji = { tip: "hata", mesaj: String(hata) };
    self.postMessage(mesaj);
  }
};
