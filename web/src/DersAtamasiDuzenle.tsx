/**
 * Ders ataması düzenleme (Karar 28, ilk artış). En riskli UX: blok deseni
 * SIRASIZ çoklu küme olarak çiplerle girilir (Kaşif'in sıralı-desen
 * dayatmasını kaldırır — sıra çözücünün kararıdır). İnce görünüm: tüm
 * değişiklik saf taslakReducer eylemleriyle.
 *
 * Çiplerin yanındaki canlı "toplam / hedef" özeti YALNIZ ipucudur; yetkili
 * hata metni A-katmanı panelindedir (kontrolBlokDeseniToplami /
 * kontrolBlokSayisiSiniri) — burada kural YENİDEN yazılmaz (Karar 22).
 */
import { useState } from "react";
import type { Okul } from "./model.js";
import type { TaslakEylem } from "./taslak.js";

const kenarlik = "1px solid #999";
const kutu = {
  fontFamily: "system-ui, sans-serif",
  fontSize: 13,
  border: kenarlik,
  padding: 10,
  marginTop: 8,
} as const;

function atamaEtiketi(
  ders: string,
  subeler: readonly string[],
  ogretmenler: readonly string[],
): string {
  return `${ders} — ${subeler.join(", ")} — ${ogretmenler.join(", ") || "(öğretmensiz)"}`;
}

export function DersAtamasiDuzenle({
  okul,
  duzenle,
}: {
  okul: Okul;
  duzenle: (eylem: TaslakEylem) => void;
}) {
  const [seciliIndex, setSeciliIndex] = useState<number>(0);
  const [yeniBlok, setYeniBlok] = useState<string>("");

  if (okul.ders_atamalari.length === 0) {
    return <div style={kutu}>
        Henüz ders ataması yok — yukarıdaki “Okul kurulumu” bölümünden ekleyin.
      </div>;
  }

  const index = seciliIndex < okul.ders_atamalari.length ? seciliIndex : 0;
  const atama = okul.ders_atamalari[index]!;
  const toplam = atama.blok_deseni.reduce((t, b) => t + b, 0);
  const uyumlu = toplam === atama.haftalik_saat;

  function blokEkle() {
    const b = Number(yeniBlok.trim());
    if (!Number.isInteger(b) || b < 1) return;
    duzenle({ tip: "atamaBlokEkle", atamaIndex: index, blok: b });
    setYeniBlok("");
  }

  return (
    <div style={kutu}>
      <strong>Ders ataması düzenle</strong>
      <div style={{ marginTop: 6 }}>
        <label>
          Atama:{" "}
          <select value={index} onChange={(e) => setSeciliIndex(Number(e.target.value))}>
            {okul.ders_atamalari.map((a, i) => (
              <option key={i} value={i}>
                {atamaEtiketi(a.ders, a.subeler, a.ogretmenler)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ marginTop: 8 }}>
        <div>Bu atamaya giren öğretmen(ler):</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
          {okul.ogretmenler.length === 0 && (
            <span style={{ color: "#777" }}>— önce öğretmen ekleyin —</span>
          )}
          {okul.ogretmenler.map((o) => (
            <label key={o.ad}>
              <input
                type="checkbox"
                checked={atama.ogretmenler.includes(o.ad)}
                onChange={(e) =>
                  duzenle({
                    tip: "atamaOgretmenler",
                    atamaIndex: index,
                    ogretmenler: e.target.checked
                      ? [...atama.ogretmenler, o.ad]
                      : atama.ogretmenler.filter((x) => x !== o.ad),
                  })
                }
              />{" "}
              {o.ad}
              {!o.verebilecegi_dersler.includes(atama.ders) && (
                <span style={{ color: "#a60" }} title="Bu öğretmenin branş listesinde bu ders yok; A-katmanı bunu bildirir.">
                  {" "}⚠
                </span>
              )}
            </label>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <button onClick={() => duzenle({ tip: "atamaSil", atamaIndex: index })}>
          Bu atamayı sil
        </button>
      </div>

      <div style={{ marginTop: 8 }}>
        <label>
          Haftalık saat:{" "}
          <input
            type="number"
            min={0}
            value={atama.haftalik_saat}
            onChange={(e) =>
              duzenle({ tip: "atamaSaat", atamaIndex: index, saat: Number(e.target.value) })
            }
            size={4}
            style={{ width: 56 }}
          />
        </label>
      </div>

      <div style={{ marginTop: 8 }}>
        <div>Blok deseni (sırasız):</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
          {atama.blok_deseni.length === 0 && <span style={{ color: "#777" }}>— boş —</span>}
          {atama.blok_deseni.map((b, i) => (
            <span
              key={i}
              style={{
                border: kenarlik,
                borderRadius: 10,
                padding: "1px 8px",
                background: "#eef",
                display: "inline-flex",
                gap: 4,
                alignItems: "center",
              }}
            >
              {b}
              <button
                onClick={() => duzenle({ tip: "atamaBlokSil", atamaIndex: index, blokIndex: i })}
                title="bloğu kaldır"
                style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0 }}
              >
                ×
              </button>
            </span>
          ))}
          <input
            type="number"
            min={1}
            value={yeniBlok}
            onChange={(e) => setYeniBlok(e.target.value)}
            placeholder="blok"
            style={{ width: 56 }}
          />
          <button onClick={blokEkle}>Blok ekle</button>
        </div>
        <div style={{ marginTop: 4, color: uyumlu ? "#070" : "#a00" }}>
          Toplam {toplam} / hedef {atama.haftalik_saat}
          {uyumlu ? " ✓" : " — eşit değil (A-katmanı bunu bildirir)"}
        </div>
      </div>
    </div>
  );
}
