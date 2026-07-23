/**
 * Kanıt ekranı (Karar 24 — Adım 3): JSON dosyası yükle → veri özeti +
 * A-katmanı kontrolü → worker'da çözüm. Görsel tasarım hâlâ BİLİNÇLİ
 * olarak asgari; amaç motorun kullanıcı verisiyle tarayıcıda uçtan uca
 * çalıştığını kanıtlamak. Örnek okul aynı kanaldan "hazır yüklenmiş
 * dosya" gibi akar — iki yol arasında davranış farkı yoktur.
 *
 * A-katmanı hatası varsa Çöz düğmesi kilitlenir: Python akışıyla aynı
 * davranış (tutarsız veri çözücüye gönderilmez, önce veri düzeltilir).
 * Çözüm sırasında akan saniye sayacı, çözücünün ana iş parçacığını
 * dondurmadığının (worker'ın gerçekten çalıştığının) görsel kanıtıdır.
 */
import { useEffect, useRef, useState } from "react";
import ornekOkulMetni from "../../deney/veri/ornek_okul.json?raw";
import type { CozIstegi, CozumMesaji, HataMesaji } from "./cozucu.worker.js";
import { aKatmaniDogrulama, okulYukleMetinden } from "./model.js";
import type { Okul, Yerlesim } from "./model.js";
import { CizelgeTablosu } from "./CizelgeTablosu.js";

type WorkerMesaji = CozumMesaji | HataMesaji;

interface Cizelge {
  okul: Okul;
  yerlesim: Yerlesim;
}

/** Yüklenmiş ve ayrıştırılmış okul verisi + kaynağının adı. */
interface YuklenmisVeri {
  kaynakAd: string;
  okulMetni: string;
  okul: Okul;
  aKatmaniHatalari: string[];
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
  const [veri, setVeri] = useState<YuklenmisVeri | null>(null);
  const [yuklemeHatasi, setYuklemeHatasi] = useState<string | null>(null);
  const [calisiyor, setCalisiyor] = useState(false);
  const [gecenSn, setGecenSn] = useState(0);
  const [cikti, setCikti] = useState<string | null>(null);
  const [cizelge, setCizelge] = useState<Cizelge | null>(null);
  const baslangicRef = useRef(0);

  useEffect(() => {
    if (!calisiyor) return;
    const sayac = setInterval(() => {
      setGecenSn((performance.now() - baslangicRef.current) / 1000);
    }, 100);
    return () => clearInterval(sayac);
  }, [calisiyor]);

  /** Metni ayrıştırır, A-katmanını koşar, sonucu ekran durumuna yazar. */
  function veriYukle(kaynakAd: string, okulMetni: string) {
    setCikti(null);
    setCizelge(null);
    try {
      const okul = okulYukleMetinden(okulMetni);
      setVeri({
        kaynakAd,
        okulMetni,
        okul,
        aKatmaniHatalari: aKatmaniDogrulama(okul),
      });
      setYuklemeHatasi(null);
    } catch (hata) {
      setVeri(null);
      setYuklemeHatasi(
        `${kaynakAd} okunamadı: ${String(hata)}\n` +
          `Dosyanın bu araçtan (veya deney/ üreticilerinden) çıkmış bir ` +
          `okul JSON'u olduğundan emin olun.`,
      );
    }
  }

  function dosyaSecildi(olay: React.ChangeEvent<HTMLInputElement>) {
    const dosya = olay.target.files?.[0];
    if (dosya === undefined) return;
    void dosya.text().then((metin) => veriYukle(dosya.name, metin));
    // Aynı dosya yeniden seçilebilsin diye girdi sıfırlanır.
    olay.target.value = "";
  }

  function baslat() {
    if (veri === null) return;
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
      // Öncelik sırası: çözüm varsa karne; çözümsüzlük kanıtlıysa
      // tanılama raporu ("çözüm yok" yerine neden + eyleme dönük öneri).
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
    const istek: CozIstegi = { tip: "coz", okulMetni: veri.okulMetni };
    worker.postMessage(istek);
  }

  const cozulebilir =
    veri !== null && veri.aKatmaniHatalari.length === 0 && !calisiyor;

  return (
    <main>
      <h1>ders-dagitim — kanıt ekranı</h1>

      <p>
        <label>
          Okul JSON dosyası yükle:{" "}
          <input type="file" accept=".json,application/json" onChange={dosyaSecildi} />
        </label>{" "}
        <button
          onClick={() => veriYukle("örnek okul", ornekOkulMetni)}
          disabled={calisiyor}
        >
          Örnek okulu kullan
        </button>
      </p>

      {yuklemeHatasi !== null && <pre>{yuklemeHatasi}</pre>}

      {veri !== null && (
        <section>
          <p>
            <strong>{veri.kaynakAd}</strong> yüklendi: {veriOzeti(veri.okul)}
          </p>
          {veri.aKatmaniHatalari.length > 0 && (
            <div>
              <p>
                Veri tutarlılık kontrolü (A-katmanı) {veri.aKatmaniHatalari.length}{" "}
                sorun buldu; çözüme geçmeden önce veriyi düzeltin:
              </p>
              <pre>{veri.aKatmaniHatalari.join("\n")}</pre>
            </div>
          )}
          <button onClick={baslat} disabled={!cozulebilir}>
            Çöz
          </button>
        </section>
      )}

      {calisiyor && (
        <p>
          Çözülüyor… {gecenSn.toFixed(1)} sn — sayaç akıyorsa arayüz donmuyor
          demektir.
        </p>
      )}
      {cizelge !== null && (
        <CizelgeTablosu okul={cizelge.okul} yerlesim={cizelge.yerlesim} />
      )}
      {cikti !== null && <pre>{cikti}</pre>}
    </main>
  );
}
