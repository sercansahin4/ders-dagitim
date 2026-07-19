/**
 * Kanıt ekranı (Karar 24 — Adım 1): tek buton, worker'da çözüm, ham
 * metin çıktı. Görsel tasarım BİLİNÇLİ olarak yok; amaç motorun
 * tarayıcıda uçtan uca çalıştığını kanıtlamak. Çözüm sırasında akan
 * saniye sayacı, çözücünün ana iş parçacığını dondurmadığının
 * (worker'ın gerçekten çalıştığının) görsel kanıtıdır.
 */
import { useEffect, useRef, useState } from "react";
import type { CozumMesaji, HataMesaji } from "./cozucu.worker.js";
import type { Okul, Yerlesim } from "./model.js";
import { CizelgeTablosu } from "./CizelgeTablosu.js";

type WorkerMesaji = CozumMesaji | HataMesaji;

interface Cizelge {
  okul: Okul;
  yerlesim: Yerlesim;
}

export function Uygulama() {
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

  function baslat() {
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
      setCikti(m.karne === null ? durum : `${durum}\n\n${m.karne}`);
      if (m.yerlesim !== null) {
        setCizelge({ okul: m.okul, yerlesim: m.yerlesim });
      }
    };
    worker.onerror = (olay) => {
      setCalisiyor(false);
      worker.terminate();
      setCikti(`Worker hatası: ${olay.message}`);
    };
    worker.postMessage({ tip: "coz" });
  }

  return (
    <main>
      <h1>ders-dagitim — kanıt ekranı</h1>
      <button onClick={baslat} disabled={calisiyor}>
        Örnek okulu çöz
      </button>
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
