/**
 * Genel çizelge tablosu (Adım 2 başlangıç): salt-okunur.
 * Satır = şube, sütun = gün×dilim. Üç özellik (onaylı kapsam):
 *   1. Derse göre tutarlı renk (ad'dan deterministik HSL),
 *   2. Blok derslerde hücre birleştirme (colspan — blok deseni görünür),
 *   3. Hücre üzerine gelince ayrıntı (title).
 * Filtre/sekme, öğretmen görünümü ve karne-tablo bağlantısı Adım 2.5+.
 * Öğle arası, ilgili dilimden sonra kalın dikey çizgiyle gösterilir.
 */
import { useMemo } from "react";
import type { Okul, Yerlesim } from "./model.js";
import { gunAdi } from "./coz.js";

interface HucreBlogu {
  ders: string;
  ogretmenler: string[];
  subeler: string[];
  sure: number;
}

interface HazirTablo {
  /** "sube|gun|dilim" -> blok başlangıcı */
  baslangiclar: Map<string, HucreBlogu>;
  /** blok devamı olduğu için çizilmeyecek hücreler */
  kapli: Set<string>;
}

function anahtar(sube: string, gun: number, dilim: number): string {
  return `${sube}|${gun}|${dilim}`;
}

/** Ders adından deterministik, açık tonlu arka plan rengi. */
function dersRengi(ad: string): string {
  let h = 0;
  for (let i = 0; i < ad.length; i++) {
    h = (h * 31 + ad.charCodeAt(i)) % 360;
  }
  return `hsl(${h}, 70%, 86%)`;
}

function hazirla(okul: Okul, yerlesim: Yerlesim): HazirTablo {
  const baslangiclar = new Map<string, HucreBlogu>();
  const kapli = new Set<string>();
  for (const g of yerlesim.girdiler) {
    const atama = okul.ders_atamalari[g.ders_atamasi_index];
    if (atama === undefined) continue;
    for (const sube of atama.subeler) {
      baslangiclar.set(anahtar(sube, g.gun, g.baslangic_dilim), {
        ders: atama.ders,
        ogretmenler: atama.ogretmenler,
        subeler: atama.subeler,
        sure: g.sure,
      });
      for (let d = 1; d < g.sure; d++) {
        kapli.add(anahtar(sube, g.gun, g.baslangic_dilim + d));
      }
    }
  }
  return { baslangiclar, kapli };
}

const kenarlik = "1px solid #999";

export function CizelgeTablosu({
  okul,
  yerlesim,
}: {
  okul: Okul;
  yerlesim: Yerlesim;
}) {
  const { baslangiclar, kapli } = useMemo(
    () => hazirla(okul, yerlesim),
    [okul, yerlesim],
  );
  const { gun_sayisi, dilim_sayisi, ogle_arasi_sonrasi_dilim } = okul.izgara;
  // Gün ve dilim indeksleri modelde 1-TABANLIDIR (gunAdi sözleşmesi ve
  // karne metniyle tutarlı); 0 tabanlı sayım Cuma'yı düşürür.
  const gunler = Array.from({ length: gun_sayisi }, (_, i) => i + 1);
  const dilimler = Array.from({ length: dilim_sayisi }, (_, i) => i + 1);

  /** Öğle arasını göstermek için: bu dilimin SAĞ kenarı kalın çizilir. */
  function sagKenar(dilim: number): string {
    return dilim === ogle_arasi_sonrasi_dilim - 1 ? "3px double #333" : kenarlik;
  }

  return (
    <table
      style={{
        borderCollapse: "collapse",
        fontFamily: "system-ui, sans-serif",
        fontSize: 12,
        marginTop: 12,
      }}
    >
      <thead>
        <tr>
          <th style={{ border: kenarlik, padding: "2px 6px" }} rowSpan={2}>
            Şube
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
        {okul.subeler.map((sube) => (
          <tr key={sube.ad}>
            <th style={{ border: kenarlik, padding: "2px 6px" }}>{sube.ad}</th>
            {gunler.map((gun) =>
              dilimler.map((dilim) => {
                const k = anahtar(sube.ad, gun, dilim);
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
                const birlesik =
                  blok.subeler.length > 1
                    ? ` — birleşik grup: ${blok.subeler.join(", ")}`
                    : "";
                const ayrinti =
                  `${blok.ders} — ${blok.ogretmenler.join(", ")}\n` +
                  `${gunAdi(gun)}, ${dilim}-${dilim + blok.sure - 1}. dilim ` +
                  `(${blok.sure} saat blok)${birlesik}`;
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
                    <div style={{ fontSize: 10, color: "#333" }}>
                      {blok.ogretmenler
                        .map((ad) =>
                          ad
                            .split(" ")
                            .map((p) => p.charAt(0))
                            .join(""),
                        )
                        .join(", ")}
                    </div>
                  </td>
                );
              }),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
