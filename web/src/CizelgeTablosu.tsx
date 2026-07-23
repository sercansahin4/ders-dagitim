/**
 * Çizelge tablosu (Karar 27): salt-okunur, İKİ EKSENLİ.
 * Üstteki sekmeyle satırlar ya şube ya öğretmen olur; sütun = gün×dilim.
 * Aynı `yerlesim`in iki referans çerçevesi — olaylar (bloklar) değişmez,
 * yalnızca hangi satıra düştükleri değişir (bkz. cizelge.ts). Özellikler:
 *   1. Derse göre tutarlı renk (ad'dan deterministik HSL),
 *   2. Blok derslerde hücre birleştirme (colspan — blok deseni görünür),
 *   3. Hücre üzerine gelince ayrıntı (title),
 *   4. Şube ⇄ Öğretmen görünüm sekmesi.
 * Öğle arası, ilgili dilimden sonra kalın dikey çizgiyle gösterilir.
 * Tek bir varlığı seçip yazdırılabilir program çıkarmak İleride (Karar 27).
 */
import { useMemo, useState } from "react";
import type { Okul, Yerlesim } from "./model.js";
import { gunAdi } from "./coz.js";
import {
  cizelgeAnahtar,
  cizelgeSatirlariHazirla,
  type Eksen,
} from "./cizelge.js";

const kenarlik = "1px solid #999";

/** Ders adından deterministik, açık tonlu arka plan rengi. */
function dersRengi(ad: string): string {
  let h = 0;
  for (let i = 0; i < ad.length; i++) {
    h = (h * 31 + ad.charCodeAt(i)) % 360;
  }
  return `hsl(${h}, 70%, 86%)`;
}

/** Bir adın baş harfleri (hücre alt satırında yerden tasarruf için). */
function basHarfler(ad: string): string {
  return ad
    .split(" ")
    .map((p) => p.charAt(0))
    .join("");
}

const SEKMELER: { deger: Eksen; etiket: string }[] = [
  { deger: "sube", etiket: "Şube" },
  { deger: "ogretmen", etiket: "Öğretmen" },
];

export function CizelgeTablosu({
  okul,
  yerlesim,
}: {
  okul: Okul;
  yerlesim: Yerlesim;
}) {
  const [eksen, setEksen] = useState<Eksen>("sube");
  const { satirlar, baslangiclar, kapli } = useMemo(
    () => cizelgeSatirlariHazirla(okul, yerlesim, eksen),
    [okul, yerlesim, eksen],
  );
  const { gun_sayisi, dilim_sayisi, ogle_arasi_sonrasi_dilim } = okul.izgara;
  // Gün ve dilim indeksleri modelde 1-TABANLIDIR (gunAdi sözleşmesi ve
  // karne metniyle tutarlı); 0 tabanlı sayım Cuma'yı düşürür.
  const gunler = Array.from({ length: gun_sayisi }, (_, i) => i + 1);
  const dilimler = Array.from({ length: dilim_sayisi }, (_, i) => i + 1);
  const ilkSutunBasligi = eksen === "sube" ? "Şube" : "Öğretmen";

  /** Öğle arasını göstermek için: bu dilimin SAĞ kenarı kalın çizilir. */
  function sagKenar(dilim: number): string {
    return dilim === ogle_arasi_sonrasi_dilim - 1 ? "3px double #333" : kenarlik;
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", gap: 4 }}>
        {SEKMELER.map((s) => (
          <button
            key={s.deger}
            onClick={() => setEksen(s.deger)}
            aria-pressed={eksen === s.deger}
            style={{
              padding: "2px 12px",
              fontFamily: "system-ui, sans-serif",
              fontSize: 13,
              fontWeight: eksen === s.deger ? "bold" : "normal",
              background: eksen === s.deger ? "#e8e8e8" : "white",
              border: kenarlik,
              cursor: eksen === s.deger ? "default" : "pointer",
            }}
          >
            {s.etiket}
          </button>
        ))}
      </div>
      <table
        style={{
          borderCollapse: "collapse",
          fontFamily: "system-ui, sans-serif",
          fontSize: 12,
          marginTop: 6,
        }}
      >
        <thead>
          <tr>
            <th style={{ border: kenarlik, padding: "2px 6px" }} rowSpan={2}>
              {ilkSutunBasligi}
            </th>
            {gunler.map((gun) => (
              <th
                key={gun}
                colSpan={dilim_sayisi}
                style={{ border: kenarlik, padding: "2px 6px" }}
              >
                {gunAdi(gun)}
              </th>
            ))}
          </tr>
          <tr>
            {gunler.map((gun) =>
              dilimler.map((dilim) => (
                <th
                  key={`${gun}-${dilim}`}
                  style={{
                    border: kenarlik,
                    borderRight: sagKenar(dilim),
                    padding: "1px 4px",
                    fontWeight: "normal",
                    color: "#555",
                  }}
                >
                  {dilim}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {satirlar.map((varlik) => (
            <tr key={varlik}>
              <th style={{ border: kenarlik, padding: "2px 6px" }}>{varlik}</th>
              {gunler.map((gun) =>
                dilimler.map((dilim) => {
                  const k = cizelgeAnahtar(varlik, gun, dilim);
                  if (kapli.has(k)) return null;
                  const blok = baslangiclar.get(k);
                  if (blok === undefined) {
                    return (
                      <td
                        key={k}
                        style={{
                          border: kenarlik,
                          borderRight: sagKenar(dilim),
                          minWidth: 24,
                        }}
                      />
                    );
                  }
                  // Hücre alt satırı eksene göre değişir: şube görünümünde
                  // öğretmen(ler)in baş harfleri, öğretmen görünümünde
                  // şube ad(lar)ı (birleşik grupta hepsi).
                  const altSatir =
                    eksen === "sube"
                      ? blok.ogretmenler.map(basHarfler).join(", ")
                      : blok.subeler.join(", ");
                  const ayrinti =
                    `${blok.ders} — ${blok.ogretmenler.join(", ")}\n` +
                    `${gunAdi(gun)}, ${dilim}-${dilim + blok.sure - 1}. dilim ` +
                    `(${blok.sure} saat blok)\n` +
                    `Şube: ${blok.subeler.join(", ")}`;
                  return (
                    <td
                      key={k}
                      colSpan={blok.sure}
                      title={ayrinti}
                      style={{
                        border: kenarlik,
                        borderRight: sagKenar(dilim + blok.sure - 1),
                        padding: "2px 4px",
                        textAlign: "center",
                        background: dersRengi(blok.ders),
                        cursor: "default",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {blok.ders}
                      <div style={{ fontSize: 10, color: "#333" }}>{altSatir}</div>
                    </td>
                  );
                }),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
