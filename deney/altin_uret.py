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
import time
from pathlib import Path

from model import a_katmani_dogrulama, okul_from_dict, okul_to_dict, okul_yukle
from sentetik_uret import sentetik_okul_uret

from ortools.sat.python import cp_model

from coz import kademeli_coz

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


# --- Çözücü altınları (Karar 23: kural-altkümeli fixture yaklaşımı) --------
#
# Neden altküme: baskınlık ağırlıkları (1 -> ~10^10) CP-SAT'ın alt sınır
# kanıtını pratikte imkânsızlaştırır; Geçiş 2 tam kural kümesinde bütçe
# sonunda FEASIBLE döner ve FEASIBLE'ın amaç değeri makineye/süreye
# bağlıdır -- altın olamaz. Altın eşitlik yalnız OPTIMAL'de tanımlıdır.
# Bu yüzden:
#   - Her C kuralı için, YALNIZ o kural açık (ağırlık=1) bir fixture:
#     Geçiş 1 + Geçiş 2 saniyeler içinde OPTIMAL kanıtlanır; sabit_dilimler
#     (B8) pinleri cezayı yapısal olarak zorlar ki altın değer 0 olmasın.
#   - ust_karma_pin: C1+C2+C3 birlikte -- baskınlık ağırlığı hesabının
#     kendisi altın eşitliğe girer.
#   - tam_kurallar: tüm kurallar açık; yalnız Geçiş 1 (OPTIMAL kanıtlanıyor)
#     altındır, Geçiş 2 karşılaştırılmaz (yalniz_gecis1). TS tarafı tam
#     kademeli koşar; Geçiş 2 çözümü amaçla değil karne köprüsüyle denetlenir.
#   - sabit_cakisma_unsat: INFEASIBLE durum eşlemesinin tanığı.
#
# Pinli fixture'larda bütçe verinin parçasıdır (küçük tutulur); OPTIMAL
# bütçe içinde kanıtlanamazsa üretici yüksek sesle durur -- sessizce
# FEASIBLE altın yazmak yasaktır.

COZUCU_GIRDI_DIZINI = DENEY / "veri" / "altin" / "cozucu_girdiler"
COZUCU_BEKLENEN_YOLU = DENEY / "veri" / "altin" / "cozucu_beklenen.json"

TUM_C_KURALLARI = ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"]

DURUM_ADLARI = {
    cp_model.OPTIMAL: "OPTIMAL",
    cp_model.FEASIBLE: "FEASIBLE",
    cp_model.INFEASIBLE: "INFEASIBLE",
    cp_model.UNKNOWN: "UNKNOWN",
    cp_model.MODEL_INVALID: "MODEL_INVALID",
}


def _cozucu_fixture(
    ornek: dict,
    acik_kurallar: list[str],
    pinler: list[tuple[int, list[list[int]]]],
    butce: float = 20.0,
    oran: float = 0.5,
) -> dict:
    """Örnek okuldan, verilen kurallar açık ve verilen atamalar pinli bir çözücü fixture'ı türetir."""
    k = _kopya(ornek)
    for a_idx, sabitler in pinler:
        k["ders_atamalari"][a_idx]["sabit_dilimler"] = sabitler
    ayarlar = k.setdefault("kural_ayarlari", {})
    ayarlar["kapali_kurallar"] = sorted(set(TUM_C_KURALLARI) - set(acik_kurallar))
    ayarlar["sure_butcesi_saniye"] = butce
    ayarlar["ust_katman_sure_orani"] = oran
    return k


def _cozucu_fixturelar(ornek: dict) -> dict[str, dict]:
    """Çözücü altın fixture'larını kurar (anahtar: dosya adı gövdesi).

    Pin gerekçeleri (atama indeksleri ornek_okul.json sırasıyla):
      c1: Aylin'in tercihi (Cuma) Rehberlik piniyle işgal edilir -> C1 >= 1.
      c2: Burak'ın Fizik+Kimya'sı (9-A) aynı güne pinlenir (4 saat > 3) -> C2 >= 1.
      c3/c6: Gökhan'ın iki İngilizce bloğu 1-2 ve 6-7'ye pinlenir; kalan
        blokları B4 gereği aynı güne giremez, 3-4-5 pencere kalır
        -> C3 >= 1 / C6 >= 3 yapısal.
      c4: İlker'in tek saatlik Almanca bloğu ayrı bir güne pinlenir; başka
        dersi olmadığından o gün 1 saatte kalır -> C4 >= 1.
      c5: Emre'nin Tarih+Coğrafya'sı (9-A) 1-2 ve 3-4'e pinlenir -> blok-aşan
        3'lük zincir iki kayan konumda -> C5 >= 2.
      c7: tek şubeli sayısal mini okulda Fizik ve Biyoloji 1-2 ve 3-4'e
        pinlenir -> 2-3 sınırında farklı-ders ardışıklığı -> C7 >= 1.
      c8: Matematik bloğu 7-8'e pinlenir -> dilim cezası 3+4=7 yapısal.
    """
    f: dict[str, dict] = {}
    # Aylin'in tek bloklu Rehberlik'i (atama 12) pinlenir; Matematik [2,2]
    # kullanılamaz çünkü simetri kırma (blok0 günü <= blok1 günü) blok 0'ın
    # son güne pinlenmesini B4 ile çelişkiye sokar (tanılama motoru buldu).
    f["c1_tercih_pin"] = _cozucu_fixture(ornek, ["C1"], [(12, [[5, 1]])])
    f["c2_gunluk_pin"] = _cozucu_fixture(ornek, ["C2"], [(1, [[1, 1]]), (2, [[1, 3]])])
    f["c3_pencere_pin"] = _cozucu_fixture(ornek, ["C3"], [(8, [[1, 1]]), (21, [[1, 6]])])
    f["c4_tek_saat_pin"] = _cozucu_fixture(ornek, ["C4"], [(34, [[1, 1], [3, 1]])])
    f["c5_zincir_pin"] = _cozucu_fixture(ornek, ["C5"], [(5, [[1, 1]]), (6, [[1, 3]])])
    f["c6_pencere_pin"] = _cozucu_fixture(ornek, ["C6"], [(8, [[1, 1]]), (21, [[1, 6]])])
    # C7 tam okulda OPTIMAL kanıtı ~32 sn sürüyor (wasm'da katlanır);
    # fixture tek şube + yalnız sayısal derslere indirgenir (0,1 sn).
    mini = _kopya(ornek)
    mini["subeler"] = [s for s in mini["subeler"] if s["ad"] == "9-A"]
    sayisal_tut = {"Matematik", "Fizik", "Kimya", "Biyoloji", "Rehberlik"}
    mini["ders_atamalari"] = [
        a for a in mini["ders_atamalari"]
        if a["subeler"] == ["9-A"] and a["ders"] in sayisal_tut
    ]
    f["c7_kategori_pin"] = _cozucu_fixture(mini, ["C7"], [(1, [[1, 1]]), (3, [[1, 3]])])
    f["c8_dilim_pin"] = _cozucu_fixture(ornek, ["C8"], [(0, [[1, 7]])])
    f["ust_karma_pin"] = _cozucu_fixture(
        ornek,
        ["C1", "C2", "C3"],
        [(1, [[1, 1]]), (2, [[1, 3]]), (8, [[2, 1]]), (21, [[2, 6]])],
    )
    f["tam_kurallar"] = _cozucu_fixture(ornek, TUM_C_KURALLARI, [], butce=15.0, oran=0.6)
    f["sabit_cakisma_unsat"] = _cozucu_fixture(
        ornek, TUM_C_KURALLARI, [(1, [[1, 1]]), (2, [[1, 1]])], butce=15.0, oran=0.6
    )
    return f


def cozucu_uret() -> dict[str, dict]:
    """Çözücü fixture'larını diske yazar, Python referansıyla çözer ve altın değerleri döndürür."""
    COZUCU_GIRDI_DIZINI.mkdir(parents=True, exist_ok=True)
    ornek = json.loads((DENEY / "veri" / "ornek_okul.json").read_text(encoding="utf-8"))

    beklenen: dict[str, dict] = {}
    for ad, veri in _cozucu_fixturelar(ornek).items():
        yol = COZUCU_GIRDI_DIZINI / f"{ad}.json"
        yol.write_text(
            json.dumps(veri, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        okul = okul_yukle(yol)
        a_hatalari = a_katmani_dogrulama(okul)
        if a_hatalari:
            raise AssertionError(f"{ad}: çözücü fixture'ı A-katmanından temiz geçmeli: {a_hatalari}")

        gecis2_altin = ad not in ("tam_kurallar", "sabit_cakisma_unsat")
        baslangic = time.monotonic()
        sonuc = kademeli_coz(okul, yalniz_gecis1=not gecis2_altin)
        sure = time.monotonic() - baslangic

        kayit: dict = {
            "girdi": f"veri/altin/cozucu_girdiler/{ad}.json",
            "acik_kurallar": sorted(
                set(TUM_C_KURALLARI) - set(veri["kural_ayarlari"]["kapali_kurallar"])
            ),
            "durum_ust": DURUM_ADLARI[sonuc.durum_ust],
            "durum_alt": None,
            "kilit_degeri": None,
            "alt_katman_cezasi": None,
            "gecis2_altin_mi": gecis2_altin,
        }
        print(f"  [üretim] {ad}: {sure:.1f} sn", flush=True)

        if ad == "sabit_cakisma_unsat":
            if kayit["durum_ust"] != "INFEASIBLE":
                raise AssertionError(f"{ad}: INFEASIBLE bekleniyordu, {kayit['durum_ust']} geldi.")
        else:
            if kayit["durum_ust"] != "OPTIMAL":
                raise AssertionError(
                    f"{ad}: Geçiş 1 bütçe içinde OPTIMAL kanıtlanamadı ({kayit['durum_ust']}) -- "
                    f"fixture altın olamaz; pinleri/bütçeyi düzelt."
                )
            kayit["kilit_degeri"] = sonuc.kilit_degeri
            if gecis2_altin:
                if sonuc.durum_alt != cp_model.OPTIMAL:
                    raise AssertionError(
                        f"{ad}: Geçiş 2 bütçe içinde OPTIMAL kanıtlanamadı "
                        f"({DURUM_ADLARI.get(sonuc.durum_alt, sonuc.durum_alt)}) -- fixture altın olamaz."
                    )
                kayit["durum_alt"] = "OPTIMAL"
                kayit["alt_katman_cezasi"] = sonuc.alt_katman_cezasi

        beklenen[ad] = kayit

    COZUCU_BEKLENEN_YOLU.write_text(
        json.dumps(beklenen, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return beklenen


if __name__ == "__main__":
    beklenen = uret()
    toplam_hata = sum(len(h) for h in beklenen.values())
    print(f"A-katmanı: {len(beklenen)} fixture, toplam {toplam_hata} beklenen mesaj.")
    for yol, hatalar in beklenen.items():
        print(f"  {yol}: {len(hatalar)}")

    cozucu_beklenen = cozucu_uret()
    print(f"\nÇözücü: {len(cozucu_beklenen)} fixture.")
    for ad, kayit in cozucu_beklenen.items():
        print(
            f"  {ad}: ust={kayit['durum_ust']} kilit={kayit['kilit_degeri']} "
            f"alt={kayit['alt_katman_cezasi']}"
        )
