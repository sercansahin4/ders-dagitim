"""A-katmanı altın çıktı üreticisi (Karar 22 — çift gerçekleme bekçisi).

Python gerçeklemesi referanstır: bu betik, sabit fixture okulları
üzerinde a_katmani_dogrulama çıktısını (nedenli Türkçe hata
mesajlarının TAM listesi, sıra dahil) veri/altin/a_katmani_beklenen.json
dosyasına yazar. TypeScript çevirisi (web/) aynı girdi dosyalarından
aynı mesajları bire bir üretmek zorundadır; tek karakterlik sapma bile
iki gerçeklemenin ayrıştığının kanıtı sayılır.

Mesaj metni eşitliği bilinçli olarak katı seçildi: kapasite ve rezerv
gibi sayısal hesaplar mesajın içinde geçtiğinden, metin eşitliği hem
hesap mantığını hem kullanıcıya dönük Türkçe ifadeyi aynı anda doğrular.

Fixture kaynakları üç sınıftır:
1. Depodaki hazır okullar: ornek_okul.json + mutasyonlar/ (A'dan temiz
   geçmeleri beklenir; "hata yok" da altın bir sonuçtur).
2. Bu betiğin ürettiği bozuk kopyalar (veri/altin/girdiler/): her biri
   §4-A kontrollerinden en az birini kasıtlı tetikler. Kopyalar depoya
   GİRER; TS tarafı aynı dosyaları okur, yeniden üretmez.
3. Sentetik okul (6 şube, seed 42): sentetik_uret determinizminin ve
   temiz-geçiş yolunun ikinci tanığı.

Çalıştırma: python3 altin_uret.py   (deney/ içinden; deterministiktir)
"""

from __future__ import annotations

import json
from pathlib import Path

from model import a_katmani_dogrulama, okul_from_dict, okul_to_dict, okul_yukle
from sentetik_uret import sentetik_okul_uret

DENEY = Path(__file__).parent
GIRDI_DIZINI = DENEY / "veri" / "altin" / "girdiler"
BEKLENEN_YOLU = DENEY / "veri" / "altin" / "a_katmani_beklenen.json"


def _kopya(veri: dict) -> dict:
    """Fixture üretiminde yan etkiyi önlemek için derin kopya döndürür."""
    return json.loads(json.dumps(veri))


def _bozuk_kopyalar(ornek: dict) -> dict[str, dict]:
    """Örnek okuldan, her A-kontrolünü kasıtlı tetikleyen bozuk kopyalar türetir.

    Anahtar: dosya adı gövdesi. Mutasyonlar cerrahi değildir; bir bozulma
    birden çok kontrolü tetikleyebilir — altın dosya tam çıktıyı saklar.
    """
    kopyalar: dict[str, dict] = {}

    # A1: şube haftalık toplamı ızgara kapasitesini (5×8=40) aşar.
    k = _kopya(ornek)
    k["ders_atamalari"][0]["haftalik_saat"] = 44
    k["ders_atamalari"][0]["blok_deseni"] = [8, 8, 8, 8, 12]
    kopyalar["a1_sube_hds_asimi"] = k

    # A2: ilk atamanın öğretmeni silinir.
    k = _kopya(ornek)
    k["ders_atamalari"][0]["ogretmenler"] = []
    kopyalar["a2_ogretmensiz_atama"] = k

    # A3a: atamada öğretmen listesinde olmayan bir ad geçer.
    k = _kopya(ornek)
    k["ders_atamalari"][0]["ogretmenler"] = ["Olmayan Öğretmen"]
    kopyalar["a3_bilinmeyen_ogretmen"] = k

    # A3b: dersi branşında olmayan gerçek bir öğretmen atanır
    # (ilk atamanın dersini veremeyen ilk öğretmen seçilir; veri
    # sırası sabit olduğundan seçim deterministiktir).
    k = _kopya(ornek)
    ders = k["ders_atamalari"][0]["ders"]
    uygunsuz = next(
        o["ad"]
        for o in k["ogretmenler"]
        if ders not in o["verebilecegi_dersler"]
    )
    k["ders_atamalari"][0]["ogretmenler"] = [uygunsuz]
    kopyalar["a3_brans_uyumsuzlugu"] = k

    # A4: blok deseni toplamı haftalık saatten sapar.
    k = _kopya(ornek)
    k["ders_atamalari"][0]["blok_deseni"][0] += 1
    kopyalar["a4_blok_toplami_bozuk"] = k

    # A5: blok sayısı gün sayısını aşar (toplam tutarlı bırakılır).
    k = _kopya(ornek)
    k["ders_atamalari"][0]["haftalik_saat"] = 6
    k["ders_atamalari"][0]["blok_deseni"] = [1, 1, 1, 1, 1, 1]
    kopyalar["a5_blok_sayisi_fazla"] = k

    # A6: ilk öğretmen silinir — kapasite, branş ve rehberlik
    # kontrolleri zincirleme tetiklenir (model.py __main__ senaryosu).
    k = _kopya(ornek)
    del k["ogretmenler"][0]
    kopyalar["a6_ogretmen_silindi"] = k

    # A7: ilk şubenin sınıf rehber öğretmeni tanımsız bırakılır.
    k = _kopya(ornek)
    k["subeler"][0]["sinif_rehber_ogretmeni"] = None
    kopyalar["a7_rehber_tanimsiz"] = k

    # A8: ilk şubenin rehberi öğretmen listesinde olmayan bir addır.
    k = _kopya(ornek)
    k["subeler"][0]["sinif_rehber_ogretmeni"] = "Olmayan Öğretmen"
    kopyalar["a8_rehber_bilinmiyor"] = k

    return kopyalar


def uret() -> dict[str, list[str]]:
    """Tüm fixture'ları hazırlar, altın çıktıyı üretip diske yazar ve döndürür."""
    GIRDI_DIZINI.mkdir(parents=True, exist_ok=True)

    # Sınıf 1: depodaki hazır okullar (deney/ köküne göre yol).
    hazir_yollar = ["veri/ornek_okul.json"] + sorted(
        str(p.relative_to(DENEY)) for p in (DENEY / "veri" / "mutasyonlar").glob("*.json")
    )

    # Sınıf 2: bozuk kopyalar — üret ve depoya yaz.
    ornek = json.loads((DENEY / "veri" / "ornek_okul.json").read_text(encoding="utf-8"))
    for ad, veri in _bozuk_kopyalar(ornek).items():
        yol = GIRDI_DIZINI / f"{ad}.json"
        yol.write_text(
            json.dumps(veri, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

    # Sınıf 3: sentetik okul (6 şube, seed 42).
    sentetik = sentetik_okul_uret(6, seed=42)
    (GIRDI_DIZINI / "sentetik_s6.json").write_text(
        json.dumps(okul_to_dict(sentetik), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    tum_yollar = hazir_yollar + sorted(
        str(p.relative_to(DENEY)) for p in GIRDI_DIZINI.glob("*.json")
    )

    beklenen: dict[str, list[str]] = {}
    for yol in tum_yollar:
        okul = okul_yukle(DENEY / yol)
        beklenen[yol] = a_katmani_dogrulama(okul)

    BEKLENEN_YOLU.write_text(
        json.dumps(beklenen, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return beklenen


if __name__ == "__main__":
    beklenen = uret()
    toplam_hata = sum(len(h) for h in beklenen.values())
    print(f"{len(beklenen)} fixture işlendi, toplam {toplam_hata} beklenen mesaj.")
    for yol, hatalar in beklenen.items():
        print(f"  {yol}: {len(hatalar)}")
