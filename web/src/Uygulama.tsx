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
import {
  aKatmaniDogrulama,
  okulKaydetMetne,
  okulYukleMetinden,
  varsayilanIzgara,
} from "./model.js";
import { kalanIsler } from "./kalanIsler.js";
import type { Okul, Yerlesim } from "./model.js";
import { bosOkul, sonucBayatMi, taslakReducer, type TaslakEylem } from "./taslak.js";
import { taslakKaydet, taslakYukle } from "./taslakDepo.js";
import { CizelgeTablosu } from "./CizelgeTablosu.js";
import { OgretmenDuzenle } from "./OgretmenDuzenle.js";
import { DersAtamasiDuzenle } from "./DersAtamasiDuzenle.js";
import { OkulKurulum } from "./OkulKurulum.js";

type WorkerMesaji = CozumMesaji | HataMesaji;

interface Cizelge {
  okul: Okul;
  yerlesim: Yerlesim;
  /** Karar 29: fizibilite geri düşüşünden geldi — sert kurallara uyar, iyileştirilmemiştir. */
  ham: boolean;
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
  // Sonucu üreten taslağın REFERANSI: veri sonradan değiştiyse sonuç
  // bayattır (silinmez, işaretlenir). Worker'ın döndürdüğü m.okul metinden
  // yeniden kurulduğu için referans kıyasına uygun değildir; bu yüzden
  // çözüm anındaki taslak ayrıca tutulur.
  const [cozulenTaslak, setCozulenTaslak] = useState<Okul | null>(null);
  // Yeni okul kayıtlı taslağın üstüne yazar; onay satır içinde sorulur
  // (tarayıcı modal'ı bilinçli kullanılmıyor: engelleyici ve test edilemez).
  const [yeniOkulOnayi, setYeniOkulOnayi] = useState(false);
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
  const kalan = useMemo(() => (taslak === null ? null : kalanIsler(taslak)), [taslak]);

  /** Metni ayrıştırır, taslağı kurar; hata varsa gösterir. */
  function veriYukle(ad: string, okulMetni: string) {
    setCikti(null);
    setCizelge(null);
    setCozulenTaslak(null);
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

  /** Sıfırdan boş okul: sonuçlar temizlenir, taslak baştan kurulur. */
  function yeniOkulBaslat() {
    setCikti(null);
    setCizelge(null);
    setCozulenTaslak(null);
    setYuklemeHatasi(null);
    setKaynakAd("yeni okul");
    setTaslak((t) =>
      taslakReducer(t ?? bosOkul(), { tip: "yeniOkul", izgara: varsayilanIzgara() }),
    );
    setYeniOkulOnayi(false);
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
    setCozulenTaslak(taslak);
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
      // Karar 29: UNKNOWN'da süre raporu, INFEASIBLE'da tanılama, başarıda
      // karne. Üçü de yoksa kullanıcı ham durum kodundan başka bir şey
      // görmemeli — bu sıralama "her hâlde Türkçe bir şey söyle" kuralıdır.
      const ek = m.sureRaporu ?? m.karne ?? m.tanilamaRaporu;
      setCikti(ek === null ? durum : `${ek}\n\n---\n${durum}`);
      if (m.yerlesim !== null) {
        setCizelge({ okul: m.okul, yerlesim: m.yerlesim, ham: m.fizibiliteGeriDusus });
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
  const sonucBayat = sonucBayatMi(cozulenTaslak, taslak);

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
        </button>{" "}
        {!yeniOkulOnayi && (
          <button onClick={() => setYeniOkulOnayi(true)} disabled={calisiyor}>
            Yeni okul oluştur
          </button>
        )}
        {yeniOkulOnayi && (
          <span>
            Bu, cihazda kayıtlı taslağın üstüne yazar. Saklamak istiyorsan önce
            “JSON dışa aktar” de.{" "}
            <button onClick={yeniOkulBaslat}>Evet, boş okul kur</button>{" "}
            <button onClick={() => setYeniOkulOnayi(false)}>Vazgeç</button>
          </span>
        )}
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
          {kalan !== null && (kalan.eksik.length > 0 || kalan.celiskili.length > 0) && (
            <div>
              {kalan.eksik.length > 0 && (
                <div>
                  <p>
                    <strong>Kalan işler</strong> ({kalan.eksik.length}) — henüz
                    girilmemiş:
                  </p>
                  <pre>{kalan.eksik.join("\n")}</pre>
                </div>
              )}
              {kalan.celiskili.length > 0 && (
                <div>
                  <p>
                    <strong>Düzeltilmesi gerekenler</strong> ({kalan.celiskili.length})
                    — girilen veriler birbiriyle tutmuyor:
                  </p>
                  <pre>{kalan.celiskili.join("\n")}</pre>
                </div>
              )}
              {kalan.kapiSorunSayisi > 0 && (
                <p style={{ color: "#777" }}>
                  “Çöz”, A-katmanı {kalan.kapiSorunSayisi} sorunu giderilene kadar
                  kilitli kalır.
                </p>
              )}
            </div>
          )}
          <p>
            <button onClick={baslat} disabled={!cozulebilir}>
              Çöz
            </button>{" "}
            <button onClick={taslakDisaAktar}>JSON dışa aktar</button>{" "}
            <label title="Çözücüye tanınan toplam arama süresi. Büyük veya sıkışık okullarda artırın.">
              Süre bütçesi:{" "}
              <input
                type="number"
                min={1}
                step={10}
                value={taslak.kural_ayarlari.sure_butcesi_saniye}
                onChange={(e) =>
                  duzenle({ tip: "sureButcesi", saniye: Number(e.target.value) })
                }
                disabled={calisiyor}
                style={{ width: 72 }}
              />{" "}
              sn
            </label>
          </p>

          <OkulKurulum okul={taslak} duzenle={duzenle} />
          <OgretmenDuzenle okul={taslak} duzenle={duzenle} />
          <DersAtamasiDuzenle okul={taslak} duzenle={duzenle} />
        </section>
      )}

      {calisiyor && (
        <p>
          Çözülüyor… {gecenSn.toFixed(1)} sn — sayaç akıyorsa arayüz donmuyor demektir.
        </p>
      )}
      {sonucBayat && (cizelge !== null || cikti !== null) && (
        <p>
          <strong>Dikkat:</strong> Aşağıdaki sonuç, veri değiştirilmeden önce
          alındı — artık güncel değil. Karşılaştırabilesin diye ekranda
          bırakıldı; yeni veriye göre sonucu görmek için tekrar çözün.
        </p>
      )}
      {cizelge !== null && cizelge.ham && (
        <p>
          <strong>Not:</strong> Bu çizelge kural ihlali içermiyor ama
          iyileştirilmedi — süre bütçesi yetmediği için tercih ve denge
          kuralları (boş gün, günlük yük, bekleme saati) hesaba katılmadan
          bulundu. Süre bütçesini artırıp tekrar çözmek daha iyisini verebilir.
        </p>
      )}
      {cizelge !== null && <CizelgeTablosu okul={cizelge.okul} yerlesim={cizelge.yerlesim} />}
      {cikti !== null && <pre>{cikti}</pre>}
    </main>
  );
}
