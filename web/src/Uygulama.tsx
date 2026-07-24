/**
 * Kanıt + veri girişi ekranı. Adım 3 (Karar 24): JSON yükle → veri özeti +
 * A-katmanı → worker'da çözüm. Karar 28 ilk artışı: yüklenen okul artık
 * DÜZENLENEBİLİR bir taslaktır; öğretmen/ders ataması düzenlenir, A-katmanı
 * CANLI koşar (tek doğrulama kaynağı — model.ts), "Çöz" düzenlenmiş taslağı
 * çözer (okulKaydetMetne → worker), sonuç JSON olarak dışa aktarılabilir ve
 * taslak IndexedDB'de tutulur (cihaz-yerel; refresh'te iş kaybını önler).
 *
 * A-katmanı hatası varsa Çöz kilitlenir: tutarsız veri çözücüye gönderilmez.
 * Çözüm sırasında akan saniye sayacı worker'ın ana iş parçacığını dondurmadığının
 * görsel kanıtıdır. Görsel tasarım bilinçli asgari (kanıt-ekranı çizgisi).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import ornekOkulMetni from "../../deney/veri/ornek_okul.json?raw";
import type { CozIstegi, CozumMesaji, HataMesaji } from "./cozucu.worker.js";
import { aKatmaniDogrulama, okulKaydetMetne, okulYukleMetinden } from "./model.js";
import type { Okul, Yerlesim } from "./model.js";
import { taslakReducer, type TaslakEylem } from "./taslak.js";
import { taslakKaydet, taslakYukle } from "./taslakDepo.js";
import { CizelgeTablosu } from "./CizelgeTablosu.js";
import { OgretmenDuzenle } from "./OgretmenDuzenle.js";
import { DersAtamasiDuzenle } from "./DersAtamasiDuzenle.js";

type WorkerMesaji = CozumMesaji | HataMesaji;

interface Cizelge {
  okul: Okul;
  yerlesim: Yerlesim;
}

/** Okul verisinin sayısal özeti (yanlış dosyayı çözmeden önce yakalamak için). */
function veriOzeti(okul: Okul): string {
  const toplamSaat = okul.ders_atamalari.reduce(
    (toplam, atama) => toplam + atama.haftalik_saat,
    0,
  );
  return (
    `${okul.subeler.length} şube, ${okul.ogretmenler.length} öğretmen, ` +
    `${okul.dersler.length} ders, ${okul.ders_atamalari.length} ders ataması ` +
    `(${toplamSaat} saat/hafta)`
  );
}

export function Uygulama() {
  const [kaynakAd, setKaynakAd] = useState<string | null>(null);
  const [taslak, setTaslak] = useState<Okul | null>(null);
  const [kayitliTaslak, setKayitliTaslak] = useState<Okul | null>(null);
  const [yuklemeHatasi, setYuklemeHatasi] = useState<string | null>(null);
  const [calisiyor, setCalisiyor] = useState(false);
  const [gecenSn, setGecenSn] = useState(0);
  const [cikti, setCikti] = useState<string | null>(null);
  const [cizelge, setCizelge] = useState<Cizelge | null>(null);
  const baslangicRef = useRef(0);

  // Açılışta cihazda kayıtlı taslak varsa geri yükleme için hazır tut.
  useEffect(() => {
    void taslakYukle().then((k) => setKayitliTaslak(k));
  }, []);

  // Süre sayacı (worker koşarken).
  useEffect(() => {
    if (!calisiyor) return;
    const sayac = setInterval(() => {
      setGecenSn((performance.now() - baslangicRef.current) / 1000);
    }, 100);
    return () => clearInterval(sayac);
  }, [calisiyor]);

  // Taslak değiştikçe cihaza otomatik kaydet (debounce; veri-yerel, KVKK).
  useEffect(() => {
    if (taslak === null) return;
    const t = setTimeout(() => void taslakKaydet(taslak), 500);
    return () => clearTimeout(t);
  }, [taslak]);

  const aKatmaniHatalari = useMemo(
    () => (taslak === null ? [] : aKatmaniDogrulama(taslak)),
    [taslak],
  );

  /** Metni ayrıştırır, taslağı kurar; hata varsa gösterir. */
  function veriYukle(ad: string, okulMetni: string) {
    setCikti(null);
    setCizelge(null);
    try {
      const okul = okulYukleMetinden(okulMetni);
      setKaynakAd(ad);
      setTaslak(okul);
      setYuklemeHatasi(null);
    } catch (hata) {
      setKaynakAd(null);
      setTaslak(null);
      setYuklemeHatasi(
        `${ad} okunamadı: ${String(hata)}\n` +
          `Dosyanın bu araçtan (veya deney/ üreticilerinden) çıkmış bir ` +
          `okul JSON'u olduğundan emin olun.`,
      );
    }
  }

  function dosyaSecildi(olay: React.ChangeEvent<HTMLInputElement>) {
    const dosya = olay.target.files?.[0];
    if (dosya === undefined) return;
    void dosya.text().then((metin) => veriYukle(dosya.name, metin));
    olay.target.value = "";
  }

  /** Bir düzenleme eylemini saf reducer'la taslağa uygular. */
  function duzenle(eylem: TaslakEylem) {
    setTaslak((t) => (t === null ? t : taslakReducer(t, eylem)));
  }

  function taslakDisaAktar() {
    if (taslak === null) return;
    const blob = new Blob([okulKaydetMetne(taslak)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const bag = document.createElement("a");
    bag.href = url;
    bag.download = "okul.json";
    bag.click();
    URL.revokeObjectURL(url);
  }

  function baslat() {
    if (taslak === null) return;
    setCalisiyor(true);
    setCikti(null);
    setCizelge(null);
    baslangicRef.current = performance.now();
    setGecenSn(0);

    const worker = new Worker(new URL("./cozucu.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (olay: MessageEvent<WorkerMesaji>) => {
      const m = olay.data;
      setCalisiyor(false);
      worker.terminate();
      if (m.tip === "hata") {
        setCikti(`HATA: ${m.mesaj}`);
        return;
      }
      const durum =
        `Çözücü durumu: ${m.durumUst}` +
        (m.durumAlt !== null ? ` / Geçiş 2: ${m.durumAlt}` : "") +
        (m.kilitDegeri !== null ? `\nKilit değeri: ${m.kilitDegeri}` : "") +
        `\nÇözüm süresi: ${m.sureSn.toFixed(1)} sn (worker içi ölçüm)`;
      const ek = m.karne ?? m.tanilamaRaporu;
      setCikti(ek === null ? durum : `${durum}\n\n${ek}`);
      if (m.yerlesim !== null) {
        setCizelge({ okul: m.okul, yerlesim: m.yerlesim });
      }
    };
    worker.onerror = (olay) => {
      setCalisiyor(false);
      worker.terminate();
      setCikti(`Worker hatası: ${olay.message}`);
    };
    // Düzenlenmiş taslak worker'a metin olarak gider (iki taraf da aynı
    // yükleyiciden geçsin — tek doğruluk kaynağı, cozucu.worker sözleşmesi).
    const istek: CozIstegi = { tip: "coz", okulMetni: okulKaydetMetne(taslak) };
    worker.postMessage(istek);
  }

  const cozulebilir = taslak !== null && aKatmaniHatalari.length === 0 && !calisiyor;

  return (
    <main>
      <h1>ders-dagitim — kanıt ekranı</h1>

      <p>
        <label>
          Okul JSON dosyası yükle:{" "}
          <input type="file" accept=".json,application/json" onChange={dosyaSecildi} />
        </label>{" "}
        <button onClick={() => veriYukle("örnek okul", ornekOkulMetni)} disabled={calisiyor}>
          Örnek okulu kullan
        </button>
      </p>

      {kayitliTaslak !== null && taslak === null && (
        <p>
          Cihazda kayıtlı bir taslak var ({veriOzeti(kayitliTaslak)}).{" "}
          <button
            onClick={() => {
              setKaynakAd("kaydedilen taslak");
              setTaslak(kayitliTaslak);
              setYuklemeHatasi(null);
            }}
          >
            Kaldığın taslağı geri yükle
          </button>
        </p>
      )}

      {yuklemeHatasi !== null && <pre>{yuklemeHatasi}</pre>}

      {taslak !== null && (
        <section>
          <p>
            <strong>{kaynakAd}</strong> yüklendi: {veriOzeti(taslak)}
          </p>
          {aKatmaniHatalari.length > 0 && (
            <div>
              <p>
                Veri tutarlılık kontrolü (A-katmanı) {aKatmaniHatalari.length} sorun
                buldu; çözüme geçmeden önce veriyi düzeltin:
              </p>
              <pre>{aKatmaniHatalari.join("\n")}</pre>
            </div>
          )}
          <button onClick={baslat} disabled={!cozulebilir}>
            Çöz
          </button>{" "}
          <button onClick={taslakDisaAktar}>JSON dışa aktar</button>

          <OgretmenDuzenle okul={taslak} duzenle={duzenle} />
          <DersAtamasiDuzenle okul={taslak} duzenle={duzenle} />
        </section>
      )}

      {calisiyor && (
        <p>
          Çözülüyor… {gecenSn.toFixed(1)} sn — sayaç akıyorsa arayüz donmuyor demektir.
        </p>
      )}
      {cizelge !== null && <CizelgeTablosu okul={cizelge.okul} yerlesim={cizelge.yerlesim} />}
      {cikti !== null && <pre>{cikti}</pre>}
    </main>
  );
}
