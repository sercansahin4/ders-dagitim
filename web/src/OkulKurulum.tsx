/**
 * Okul kurulumu (ikinci artış): şube / ders / öğretmen ve ders ataması
 * EKLEME, ızgara ayarı, bir şubenin ders tablosunu başka şubeye kopyalama.
 *
 * Karar 28'in çizgisi korunur: bu bileşen ince görünüm katmanıdır, tüm
 * durum değişikliği saf taslakReducer eylemleriyle olur (taslak.ts) ve
 * burada YENİ DOĞRULAMA KURALI yazılmaz — yetkili hata metni A-katmanı
 * ("kalan işler") panelindedir.
 *
 * Kopyalamanın anlamı (11 Eyl tasarım kararı): okul iki ayrı iş yapar —
 * ders TABLOSU (hangi ders kaç saat) MEB çizelgesinden gelir, ders
 * DAĞITIMI (kim giriyor) okulun kararıdır. Kopya tabloyu taşır, dağıtımı
 * taşımaz: öğretmen alanları boş gelir.
 */
import { useState } from "react";
import { DERS_KATEGORILERI } from "./model.js";
import type { DersKategorisi, Okul } from "./model.js";
import {
  dersSilinebilir,
  subeDersTablosuKopyala,
  subeSilinebilir,
  type TaslakEylem,
} from "./taslak.js";

const kenarlik = "1px solid #999";
const kutu = {
  fontFamily: "system-ui, sans-serif",
  fontSize: 13,
  border: kenarlik,
  padding: 10,
  marginTop: 8,
} as const;
const satir = { marginTop: 8, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" } as const;

const KATEGORI_ETIKET: Record<DersKategorisi, string> = {
  SAYISAL: "Sayısal",
  SOZEL: "Sözel",
  DIL: "Dil",
  SANAT_SPOR: "Sanat/Spor",
  REHBERLIK_DIGER: "Rehberlik/Diğer",
};

/** "2,2,1" → [2,2,1]; geçersiz parça yok sayılır. */
function blokAyristir(metin: string): number[] {
  return metin
    .split(",")
    .map((p) => Number(p.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}

export function OkulKurulum({
  okul,
  duzenle,
}: {
  okul: Okul;
  duzenle: (eylem: TaslakEylem) => void;
}) {
  const [yeniSube, setYeniSube] = useState("");
  const [yeniDers, setYeniDers] = useState("");
  const [yeniDersKategori, setYeniDersKategori] = useState<DersKategorisi>("SAYISAL");
  const [yeniOgretmen, setYeniOgretmen] = useState("");
  const [atamaDers, setAtamaDers] = useState("");
  const [atamaSube, setAtamaSube] = useState("");
  const [atamaSaat, setAtamaSaat] = useState("2");
  const [atamaBlok, setAtamaBlok] = useState("2");
  const [kaynakSube, setKaynakSube] = useState("");
  const [hedefSube, setHedefSube] = useState("");
  const [mesaj, setMesaj] = useState<string | null>(null);

  const subeAdlari = okul.subeler.map((s) => s.ad);
  const dersAdlari = okul.dersler.map((d) => d.ad);

  // Seçimler denetimli; boş durumda listenin ilkine düşerler. Bu türetme
  // EKRANDA GÖRÜNEN ile İŞLEME GİDEN değerin ayrışmasını önler (aksi hâlde
  // select ilk seçeneği gösterirken eylem başka şubeye gidebilirdi).
  const secKaynak = kaynakSube !== "" && subeAdlari.includes(kaynakSube)
    ? kaynakSube
    : (subeAdlari[0] ?? "");
  const secHedef = hedefSube !== "" && subeAdlari.includes(hedefSube)
    ? hedefSube
    : (subeAdlari.find((s) => s !== secKaynak) ?? "");
  const secAtamaDers = atamaDers !== "" && dersAdlari.includes(atamaDers)
    ? atamaDers
    : (dersAdlari[0] ?? "");
  const secAtamaSube = atamaSube !== "" && subeAdlari.includes(atamaSube)
    ? atamaSube
    : (subeAdlari[0] ?? "");

  function subeSil(ad: string) {
    const karar = subeSilinebilir(okul, ad);
    if (!karar.silinebilir) {
      setMesaj(karar.neden);
      return;
    }
    setMesaj(null);
    duzenle({ tip: "subeSil", ad });
  }

  function dersSil(ad: string) {
    const karar = dersSilinebilir(okul, ad);
    if (!karar.silinebilir) {
      setMesaj(karar.neden);
      return;
    }
    setMesaj(null);
    duzenle({ tip: "dersSil", ad });
  }

  function atamaEkle() {
    const ders = secAtamaDers;
    const sube = secAtamaSube;
    if (ders === "" || sube === "") return;
    const saat = Number(atamaSaat);
    if (!Number.isInteger(saat) || saat < 0) return;
    setMesaj(null);
    duzenle({
      tip: "atamaEkle",
      atama: {
        ders,
        haftalik_saat: saat,
        blok_deseni: blokAyristir(atamaBlok),
        subeler: [sube],
        ogretmenler: [],
        sabit_dilimler: null,
        birlestirilebilir: false,
      },
    });
  }

  function kopyala() {
    const kaynak = secKaynak;
    const hedef = secHedef;
    if (kaynak === "" || hedef === "") return;
    if (kaynak === hedef) {
      setMesaj("Kaynak ve hedef aynı şube; kopyalanacak bir şey yok.");
      return;
    }
    // Saf fonksiyon önce özet için çağrılır (ucuz), sonra aynı işlem
    // reducer üzerinden uygulanır — tüm değişiklikler tek kapıdan geçsin.
    const o = subeDersTablosuKopyala(okul, kaynak, hedef);
    duzenle({ tip: "subeDersTablosuKopyala", kaynak, hedef });
    const parcalar = [`${o.kopyalandi} ders kopyalandı`];
    if (o.atlandiVar > 0) parcalar.push(`${o.atlandiVar} tanesi hedefte zaten vardı`);
    if (o.atlandiCokSubeli > 0)
      parcalar.push(`${o.atlandiCokSubeli} birleşik (çok şubeli) atama atlandı`);
    setMesaj(
      `${kaynak} → ${hedef}: ${parcalar.join(", ")}. ` +
        `Öğretmenler bilerek boş bırakıldı; ders dağıtımını şimdi yapın.`,
    );
  }

  return (
    <div style={kutu}>
      <strong>Okul kurulumu</strong>

      {/* --- Izgara --- */}
      <div style={satir}>
        <span>Izgara:</span>
        <label>
          gün{" "}
          <input
            type="number"
            min={1}
            max={7}
            value={okul.izgara.gun_sayisi}
            onChange={(e) =>
              duzenle({
                tip: "izgaraAyarla",
                izgara: { ...okul.izgara, gun_sayisi: Number(e.target.value) },
              })
            }
            style={{ width: 56 }}
          />
        </label>
        <label>
          dilim{" "}
          <input
            type="number"
            min={1}
            max={16}
            value={okul.izgara.dilim_sayisi}
            onChange={(e) =>
              duzenle({
                tip: "izgaraAyarla",
                izgara: { ...okul.izgara, dilim_sayisi: Number(e.target.value) },
              })
            }
            style={{ width: 56 }}
          />
        </label>
        <label title="Öğle arası bu dilimden SONRA başlar.">
          öğle arası sonrası dilim{" "}
          <input
            type="number"
            min={1}
            value={okul.izgara.ogle_arasi_sonrasi_dilim}
            onChange={(e) =>
              duzenle({
                tip: "izgaraAyarla",
                izgara: {
                  ...okul.izgara,
                  ogle_arasi_sonrasi_dilim: Number(e.target.value),
                },
              })
            }
            style={{ width: 56 }}
          />
        </label>
      </div>

      {/* --- Şubeler --- */}
      <div style={satir}>
        <span>Şubeler ({okul.subeler.length}):</span>
        {okul.subeler.map((s) => (
          <span key={s.ad} style={{ border: kenarlik, borderRadius: 10, padding: "1px 8px" }}>
            {s.ad}
            <button
              onClick={() => subeSil(s.ad)}
              title="şubeyi sil"
              style={{ border: "none", background: "transparent", cursor: "pointer" }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={yeniSube}
          onChange={(e) => setYeniSube(e.target.value)}
          placeholder="9-A"
          size={8}
        />
        <button
          onClick={() => {
            duzenle({ tip: "subeEkle", ad: yeniSube });
            setYeniSube("");
          }}
        >
          Şube ekle
        </button>
      </div>

      {/* --- Sınıf rehber öğretmeni --- */}
      {okul.subeler.length > 0 && okul.ogretmenler.length > 0 && (
        <div style={satir}>
          <span>Sınıf rehber öğretmeni:</span>
          {okul.subeler.map((s) => (
            <label key={s.ad}>
              {s.ad}{" "}
              <select
                value={s.sinif_rehber_ogretmeni ?? ""}
                onChange={(e) =>
                  duzenle({
                    tip: "subeRehberOgretmeni",
                    sube: s.ad,
                    ogretmen: e.target.value === "" ? null : e.target.value,
                  })
                }
              >
                <option value="">(yok)</option>
                {okul.ogretmenler.map((o) => (
                  <option key={o.ad} value={o.ad}>
                    {o.ad}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}

      {/* --- Dersler --- */}
      <div style={satir}>
        <span>Dersler ({okul.dersler.length}):</span>
        {okul.dersler.map((d) => (
          <span key={d.ad} style={{ border: kenarlik, borderRadius: 10, padding: "1px 8px" }}>
            {d.ad}
            <select
              value={d.kategori}
              onChange={(e) =>
                duzenle({
                  tip: "dersKategori",
                  ad: d.ad,
                  kategori: e.target.value as DersKategorisi,
                })
              }
              style={{ marginLeft: 4 }}
            >
              {DERS_KATEGORILERI.map((k) => (
                <option key={k} value={k}>
                  {KATEGORI_ETIKET[k]}
                </option>
              ))}
            </select>
            <button
              onClick={() => dersSil(d.ad)}
              title="dersi sil"
              style={{ border: "none", background: "transparent", cursor: "pointer" }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div style={satir}>
        <input
          value={yeniDers}
          onChange={(e) => setYeniDers(e.target.value)}
          placeholder="Matematik"
          size={16}
        />
        <select
          value={yeniDersKategori}
          onChange={(e) => setYeniDersKategori(e.target.value as DersKategorisi)}
        >
          {DERS_KATEGORILERI.map((k) => (
            <option key={k} value={k}>
              {KATEGORI_ETIKET[k]}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            duzenle({ tip: "dersEkle", ad: yeniDers, kategori: yeniDersKategori });
            setYeniDers("");
          }}
        >
          Ders ekle
        </button>
      </div>

      {/* --- Öğretmen ekle --- */}
      <div style={satir}>
        <span>Öğretmenler ({okul.ogretmenler.length}):</span>
        <input
          value={yeniOgretmen}
          onChange={(e) => setYeniOgretmen(e.target.value)}
          placeholder="Ad Soyad"
          size={16}
        />
        <button
          onClick={() => {
            duzenle({ tip: "ogretmenEkle", ad: yeniOgretmen });
            setYeniOgretmen("");
          }}
        >
          Öğretmen ekle
        </button>
        <span style={{ color: "#777" }}>
          (branş ve kapanışlar aşağıdaki öğretmen panelinde)
        </span>
      </div>

      {/* --- Ders ataması ekle --- */}
      {okul.dersler.length > 0 && okul.subeler.length > 0 && (
        <div style={satir}>
          <span>Ders ataması ekle:</span>
          <select value={secAtamaDers} onChange={(e) => setAtamaDers(e.target.value)}>
            {dersAdlari.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select value={secAtamaSube} onChange={(e) => setAtamaSube(e.target.value)}>
            {subeAdlari.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <label>
            saat{" "}
            <input
              type="number"
              min={0}
              value={atamaSaat}
              onChange={(e) => setAtamaSaat(e.target.value)}
              style={{ width: 56 }}
            />
          </label>
          <label title="Sırasız çoklu küme: 2,2,1 → iki 2'lik ve bir 1'lik blok. Sırayı çözücü seçer.">
            blok deseni{" "}
            <input
              value={atamaBlok}
              onChange={(e) => setAtamaBlok(e.target.value)}
              placeholder="2,2,1"
              size={8}
            />
          </label>
          <button onClick={atamaEkle}>Atama ekle</button>
        </div>
      )}

      {/* --- Kopyalama --- */}
      {okul.subeler.length > 1 && (
        <div style={satir}>
          <span>Ders tablosunu kopyala:</span>
          <select value={secKaynak} onChange={(e) => setKaynakSube(e.target.value)}>
            {subeAdlari.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <span>→</span>
          <select value={secHedef} onChange={(e) => setHedefSube(e.target.value)}>
            {subeAdlari.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button onClick={kopyala}>Kopyala</button>
        </div>
      )}

      {mesaj !== null && (
        <div style={{ marginTop: 6, color: "#a00" }}>{mesaj}</div>
      )}
    </div>
  );
}
