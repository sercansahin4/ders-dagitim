/**
 * Öğretmen düzenleme (Karar 28, ilk artış). İnce görünüm katmanı: tüm
 * durum değişiklikleri saf taslakReducer eylemleriyle yapılır (taslak.ts);
 * bu bileşen yalnız eylem üretir. Görsel tasarım kanıt-ekranı çizgisinde
 * bilinçli asgari (inline stil, düz kontroller).
 *
 * Silme, referans bütünlüğü kapısından geçer: ogretmenSilinebilir false
 * dönerse neden Türkçe gösterilir ve silme yapılmaz (ürün tezi giriş anında).
 */
import { useState } from "react";
import { KAPANIS_NEDENLERI } from "./model.js";
import type { KapanisNedeni, Okul } from "./model.js";
import { ogretmenSilinebilir, type TaslakEylem } from "./taslak.js";

const NEDEN_ETIKET: Record<KapanisNedeni, string> = {
  DIS_OKUL: "Dış okul",
  BOS_GUN: "Boş gün",
  IDARI: "İdari",
  KISISEL_TERCIH: "Kişisel tercih",
};

const kenarlik = "1px solid #999";
const kutu = {
  fontFamily: "system-ui, sans-serif",
  fontSize: 13,
  border: kenarlik,
  padding: 10,
  marginTop: 8,
} as const;

export function OgretmenDuzenle({
  okul,
  duzenle,
}: {
  okul: Okul;
  duzenle: (eylem: TaslakEylem) => void;
}) {
  const [seciliAdHam, setSeciliAd] = useState<string>("");
  const [yeniAd, setYeniAd] = useState<string>("");
  const [kapGun, setKapGun] = useState<number>(1);
  const [kapDilimler, setKapDilimler] = useState<string>("");
  const [kapNeden, setKapNeden] = useState<KapanisNedeni>("IDARI");
  const [silNeden, setSilNeden] = useState<string | null>(null);

  if (okul.ogretmenler.length === 0) {
    return <div style={kutu}>
        Henüz öğretmen yok — yukarıdaki “Okul kurulumu” bölümünden ekleyin.
      </div>;
  }

  // Seçili ad geçerli değilse (ilk açılış, silme, yeniden adlandırma) ilkine düş.
  const varsayilanAd = okul.ogretmenler[0]!.ad;
  const seciliAd = okul.ogretmenler.some((o) => o.ad === seciliAdHam)
    ? seciliAdHam
    : varsayilanAd;
  const secili = okul.ogretmenler.find((o) => o.ad === seciliAd)!;
  const gunler = Array.from({ length: okul.izgara.gun_sayisi }, (_, i) => i + 1);

  function bosGunDegis(deger: string) {
    duzenle({
      tip: "ogretmenBosGun",
      ogretmen: seciliAd,
      bosGun: deger === "yok" ? null : Number(deger),
    });
  }

  function kapanisEkle() {
    const dilimler = kapDilimler
      .split(",")
      .map((p) => Number(p.trim()))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= okul.izgara.dilim_sayisi);
    if (dilimler.length === 0) return;
    duzenle({
      tip: "kapanisEkle",
      ogretmen: seciliAd,
      kapanis: { gun: kapGun, dilimler, neden: kapNeden },
    });
    setKapDilimler("");
  }

  function yenidenAdlandir() {
    const ad = yeniAd.trim();
    if (ad === "" || ad === seciliAd) return;
    duzenle({ tip: "ogretmenYenidenAdlandir", eski: seciliAd, yeni: ad });
    setSeciliAd(ad);
    setYeniAd("");
  }

  function sil() {
    const karar = ogretmenSilinebilir(okul, seciliAd);
    if (!karar.silinebilir) {
      setSilNeden(karar.neden);
      return;
    }
    setSilNeden(null);
    duzenle({ tip: "ogretmenSil", ogretmen: seciliAd });
    setSeciliAd("");
  }

  return (
    <div style={kutu}>
      <strong>Öğretmen düzenle</strong>
      <div style={{ marginTop: 6 }}>
        <label>
          Öğretmen:{" "}
          <select
            value={seciliAd}
            onChange={(e) => {
              setSeciliAd(e.target.value);
              setSilNeden(null);
            }}
          >
            {okul.ogretmenler.map((o) => (
              <option key={o.ad} value={o.ad}>
                {o.ad}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ marginTop: 8 }}>
        <label>
          Boş gün tercihi:{" "}
          <select value={secili.bos_gun_tercihi ?? "yok"} onChange={(e) => bosGunDegis(e.target.value)}>
            <option value="yok">yok</option>
            {gunler.map((g) => (
              <option key={g} value={g}>
                {g}. gün
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ marginTop: 8 }}>
        <div>Kapanışlar:</div>
        {secili.kapanislar.length === 0 && (
          <div style={{ color: "#777" }}>— yok —</div>
        )}
        {secili.kapanislar.map((k, i) => (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span>
              {k.gun}. gün, dilim {k.dilimler.join(",")} — {NEDEN_ETIKET[k.neden]}
            </span>
            <button
              onClick={() => duzenle({ tip: "kapanisSil", ogretmen: seciliAd, kapanisIndex: i })}
            >
              Sil
            </button>
          </div>
        ))}
        <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span>Ekle:</span>
          <select value={kapGun} onChange={(e) => setKapGun(Number(e.target.value))}>
            {gunler.map((g) => (
              <option key={g} value={g}>
                {g}. gün
              </option>
            ))}
          </select>
          <input
            value={kapDilimler}
            onChange={(e) => setKapDilimler(e.target.value)}
            placeholder="dilimler, örn. 1,2"
            size={14}
          />
          <select value={kapNeden} onChange={(e) => setKapNeden(e.target.value as KapanisNedeni)}>
            {KAPANIS_NEDENLERI.map((n) => (
              <option key={n} value={n}>
                {NEDEN_ETIKET[n]}
              </option>
            ))}
          </select>
          <button onClick={kapanisEkle}>Kapanış ekle</button>
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <div>Verebileceği dersler (branş):</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
          {okul.dersler.length === 0 && (
            <span style={{ color: "#777" }}>— önce ders ekleyin —</span>
          )}
          {okul.dersler.map((d) => (
            <label key={d.ad}>
              <input
                type="checkbox"
                checked={secili.verebilecegi_dersler.includes(d.ad)}
                onChange={(e) =>
                  duzenle({
                    tip: "ogretmenBrans",
                    ogretmen: seciliAd,
                    dersler: e.target.checked
                      ? [...secili.verebilecegi_dersler, d.ad]
                      : secili.verebilecegi_dersler.filter((x) => x !== d.ad),
                  })
                }
              />{" "}
              {d.ad}
            </label>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <label title="Karar 17: boş gün garantisi (B3) bu öğretmen için kurulmaz. Ağır dış okul yüklü profillerde yapısal olarak gerekebilir.">
          <input
            type="checkbox"
            checked={okul.kural_ayarlari.b3_muaf_ogretmenler.has(seciliAd)}
            onChange={(e) =>
              duzenle({
                tip: "ogretmenB3Muafiyeti",
                ogretmen: seciliAd,
                muaf: e.target.checked,
              })
            }
          />{" "}
          Boş gün garantisinden muaf (B3)
        </label>
      </div>

      <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center" }}>
        <label>
          Yeniden adlandır:{" "}
          <input
            value={yeniAd}
            onChange={(e) => setYeniAd(e.target.value)}
            placeholder={seciliAd}
            size={16}
          />
        </label>
        <button onClick={yenidenAdlandir}>Uygula</button>
        <button onClick={sil} style={{ marginLeft: "auto" }}>
          Öğretmeni sil
        </button>
      </div>
      {silNeden !== null && (
        <div style={{ marginTop: 4, color: "#a00" }}>{silNeden}</div>
      )}
    </div>
  );
}
