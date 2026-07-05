"""Ders dağıtım probleminin veri modeli varlıklarını tanımlar.

Şube, öğretmen, ders, mekan, blok ve bunlar arasındaki ilişkiler gibi
alan kavramlarını temsil eden veri yapılarının tanımlandığı modül.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Optional


class KapanisNedeni(Enum):
    """Bir müsaitlik kapanışının nedenini sınıflandırır (tanılamada dokunulmazlık ayrımını besler)."""

    DIS_OKUL = "dis_okul"
    BOS_GUN = "bos_gun"
    IDARI = "idari"
    KISISEL_TERCIH = "kisisel_tercih"


class DersKategorisi(Enum):
    """Bir dersin kategori-ardışıklığı cezasında ve dilim cezası vektörlerinde kullanılan sınıfını tutar."""

    SAYISAL = "sayisal"
    SOZEL = "sozel"
    DIL = "dil"
    SANAT_SPOR = "sanat_spor"
    REHBERLIK_DIGER = "rehberlik_diger"


@dataclass
class Izgara:
    """Okulun gün×dilim çerçevesini ve öğle arasının bloklarla ilişkisini tanımlar."""

    gun_sayisi: int = 5
    dilim_sayisi: int = 8
    ogle_arasi_sonrasi_dilim: int = 5
    ogle_arasi_bloklari_boler: bool = False


@dataclass
class Ders:
    """Bir dersin adını ve kategori-ardışıklığı hesaplarında kullanılan kategorisini tutar."""

    ad: str
    kategori: DersKategorisi


@dataclass
class Kapanis:
    """Bir öğretmenin belirli gün ve dilimlerdeki, nedeni etiketli müsaitlik kapanışını tutar."""

    gun: int
    dilimler: list[int]
    neden: KapanisNedeni


@dataclass
class Ogretmen:
    """Bir öğretmenin verebileceği dersleri, boş gün tercihini ve kapanışlarını tutar."""

    ad: str
    verebilecegi_dersler: list[str] = field(default_factory=list)
    bos_gun_tercihi: Optional[int] = None
    kapanislar: list[Kapanis] = field(default_factory=list)


@dataclass
class Sube:
    """Bir şubenin adını ve sınıf rehber öğretmenini tutar."""

    ad: str
    sinif_rehber_ogretmeni: Optional[str] = None


@dataclass
class DersAtamasi:
    """Bir dersin hangi şube(ler)e, hangi öğretmen(ler)le, hangi blok deseninde okutulacağını tutar."""

    ders: str
    haftalik_saat: int
    blok_deseni: list[int]
    subeler: list[str]
    ogretmenler: list[str]
    sabit_dilimler: Optional[list[list[int]]] = None
    birlestirilebilir: bool = False


@dataclass
class KuralAyarlari:
    """Yumuşak kısıt eşiklerini ve pencere/ceza parametrelerini tutar (Karar 12 dahil)."""

    ogretmen_sube_gunluk_toplam: int = 3
    ardisiklik_siniri: int = 2
    pencere_sert_esigi: int = 4
    pencereyi_bolmeyen_nedenler: set[KapanisNedeni] = field(default_factory=set)
    sayisal_dilim_cezasi: list[int] = field(
        default_factory=lambda: [0, 0, 0, 0, 1, 2, 3, 4]
    )
    sanat_spor_dilim_cezasi: list[int] = field(
        default_factory=lambda: [4, 3, 2, 1, 0, 0, 0, 0]
    )


@dataclass
class YerlesimGirdisi:
    """Çözücünün ürettiği yerleşimde tek bir bloğun gün, başlangıç dilimi ve süresini tutar."""

    ders_atamasi_index: int
    gun: int
    baslangic_dilim: int
    sure: int


@dataclass
class Yerlesim:
    """Çözücü çıktısını -- tüm ders atamalarının yerleştirildiği gün/dilimleri -- tutar."""

    girdiler: list[YerlesimGirdisi] = field(default_factory=list)


@dataclass
class Okul:
    """Bir okulun tüm veri modelini -- ızgara, ders, öğretmen, şube, atama ve kural ayarlarını -- bir arada tutar."""

    izgara: Izgara
    dersler: list[Ders]
    ogretmenler: list[Ogretmen]
    subeler: list[Sube]
    ders_atamalari: list[DersAtamasi]
    kural_ayarlari: KuralAyarlari


# --- JSON çevrimi ---------------------------------------------------------
# Her varlık için ayrı to_dict/from_dict: dataclasses.asdict Enum ve set'i
# JSON'a yazılabilir hale getirmediğinden elle çevrim yapılır.


def _izgara_to_dict(izgara: Izgara) -> dict:
    """Bir Izgara nesnesini JSON'a yazılabilir sözlüğe çevirir."""
    return {
        "gun_sayisi": izgara.gun_sayisi,
        "dilim_sayisi": izgara.dilim_sayisi,
        "ogle_arasi_sonrasi_dilim": izgara.ogle_arasi_sonrasi_dilim,
        "ogle_arasi_bloklari_boler": izgara.ogle_arasi_bloklari_boler,
    }


def _izgara_from_dict(veri: dict) -> Izgara:
    """JSON sözlüğünden bir Izgara nesnesi kurar."""
    return Izgara(
        gun_sayisi=veri.get("gun_sayisi", 5),
        dilim_sayisi=veri.get("dilim_sayisi", 8),
        ogle_arasi_sonrasi_dilim=veri.get("ogle_arasi_sonrasi_dilim", 5),
        ogle_arasi_bloklari_boler=veri.get("ogle_arasi_bloklari_boler", False),
    )


def _ders_to_dict(ders: Ders) -> dict:
    """Bir Ders nesnesini JSON'a yazılabilir sözlüğe çevirir."""
    return {"ad": ders.ad, "kategori": ders.kategori.name}


def _ders_from_dict(veri: dict) -> Ders:
    """JSON sözlüğünden bir Ders nesnesi kurar."""
    return Ders(ad=veri["ad"], kategori=DersKategorisi[veri["kategori"]])


def _kapanis_to_dict(kapanis: Kapanis) -> dict:
    """Bir Kapanis nesnesini JSON'a yazılabilir sözlüğe çevirir."""
    return {
        "gun": kapanis.gun,
        "dilimler": list(kapanis.dilimler),
        "neden": kapanis.neden.name,
    }


def _kapanis_from_dict(veri: dict) -> Kapanis:
    """JSON sözlüğünden bir Kapanis nesnesi kurar."""
    return Kapanis(
        gun=veri["gun"],
        dilimler=list(veri["dilimler"]),
        neden=KapanisNedeni[veri["neden"]],
    )


def _ogretmen_to_dict(ogretmen: Ogretmen) -> dict:
    """Bir Ogretmen nesnesini JSON'a yazılabilir sözlüğe çevirir."""
    return {
        "ad": ogretmen.ad,
        "verebilecegi_dersler": list(ogretmen.verebilecegi_dersler),
        "bos_gun_tercihi": ogretmen.bos_gun_tercihi,
        "kapanislar": [_kapanis_to_dict(k) for k in ogretmen.kapanislar],
    }


def _ogretmen_from_dict(veri: dict) -> Ogretmen:
    """JSON sözlüğünden bir Ogretmen nesnesi kurar."""
    return Ogretmen(
        ad=veri["ad"],
        verebilecegi_dersler=list(veri.get("verebilecegi_dersler", [])),
        bos_gun_tercihi=veri.get("bos_gun_tercihi"),
        kapanislar=[_kapanis_from_dict(k) for k in veri.get("kapanislar", [])],
    )


def _sube_to_dict(sube: Sube) -> dict:
    """Bir Sube nesnesini JSON'a yazılabilir sözlüğe çevirir."""
    return {"ad": sube.ad, "sinif_rehber_ogretmeni": sube.sinif_rehber_ogretmeni}


def _sube_from_dict(veri: dict) -> Sube:
    """JSON sözlüğünden bir Sube nesnesi kurar."""
    return Sube(ad=veri["ad"], sinif_rehber_ogretmeni=veri.get("sinif_rehber_ogretmeni"))


def _ders_atamasi_to_dict(atama: DersAtamasi) -> dict:
    """Bir DersAtamasi nesnesini JSON'a yazılabilir sözlüğe çevirir."""
    return {
        "ders": atama.ders,
        "haftalik_saat": atama.haftalik_saat,
        "blok_deseni": list(atama.blok_deseni),
        "subeler": list(atama.subeler),
        "ogretmenler": list(atama.ogretmenler),
        "sabit_dilimler": atama.sabit_dilimler,
        "birlestirilebilir": atama.birlestirilebilir,
    }


def _ders_atamasi_from_dict(veri: dict) -> DersAtamasi:
    """JSON sözlüğünden bir DersAtamasi nesnesi kurar."""
    return DersAtamasi(
        ders=veri["ders"],
        haftalik_saat=veri["haftalik_saat"],
        blok_deseni=list(veri["blok_deseni"]),
        subeler=list(veri["subeler"]),
        ogretmenler=list(veri["ogretmenler"]),
        sabit_dilimler=veri.get("sabit_dilimler"),
        birlestirilebilir=veri.get("birlestirilebilir", False),
    )


def _kural_ayarlari_to_dict(kural: KuralAyarlari) -> dict:
    """Bir KuralAyarlari nesnesini JSON'a yazılabilir sözlüğe çevirir."""
    return {
        "ogretmen_sube_gunluk_toplam": kural.ogretmen_sube_gunluk_toplam,
        "ardisiklik_siniri": kural.ardisiklik_siniri,
        "pencere_sert_esigi": kural.pencere_sert_esigi,
        "pencereyi_bolmeyen_nedenler": sorted(
            neden.name for neden in kural.pencereyi_bolmeyen_nedenler
        ),
        "sayisal_dilim_cezasi": list(kural.sayisal_dilim_cezasi),
        "sanat_spor_dilim_cezasi": list(kural.sanat_spor_dilim_cezasi),
    }


def _kural_ayarlari_from_dict(veri: dict) -> KuralAyarlari:
    """JSON sözlüğünden bir KuralAyarlari nesnesi kurar (eksik alanlar varsayılanı korur)."""
    varsayilan = KuralAyarlari()
    return KuralAyarlari(
        ogretmen_sube_gunluk_toplam=veri.get(
            "ogretmen_sube_gunluk_toplam", varsayilan.ogretmen_sube_gunluk_toplam
        ),
        ardisiklik_siniri=veri.get("ardisiklik_siniri", varsayilan.ardisiklik_siniri),
        pencere_sert_esigi=veri.get("pencere_sert_esigi", varsayilan.pencere_sert_esigi),
        pencereyi_bolmeyen_nedenler={
            KapanisNedeni[ad] for ad in veri.get("pencereyi_bolmeyen_nedenler", [])
        },
        sayisal_dilim_cezasi=list(
            veri.get("sayisal_dilim_cezasi", varsayilan.sayisal_dilim_cezasi)
        ),
        sanat_spor_dilim_cezasi=list(
            veri.get("sanat_spor_dilim_cezasi", varsayilan.sanat_spor_dilim_cezasi)
        ),
    )


def okul_to_dict(okul: Okul) -> dict:
    """Bir Okul nesnesini JSON'a yazılabilir sözlüğe çevirir."""
    return {
        "izgara": _izgara_to_dict(okul.izgara),
        "dersler": [_ders_to_dict(d) for d in okul.dersler],
        "ogretmenler": [_ogretmen_to_dict(o) for o in okul.ogretmenler],
        "subeler": [_sube_to_dict(s) for s in okul.subeler],
        "ders_atamalari": [_ders_atamasi_to_dict(a) for a in okul.ders_atamalari],
        "kural_ayarlari": _kural_ayarlari_to_dict(okul.kural_ayarlari),
    }


def okul_from_dict(veri: dict) -> Okul:
    """JSON sözlüğünden bir Okul nesnesi kurar."""
    return Okul(
        izgara=_izgara_from_dict(veri.get("izgara", {})),
        dersler=[_ders_from_dict(d) for d in veri.get("dersler", [])],
        ogretmenler=[_ogretmen_from_dict(o) for o in veri.get("ogretmenler", [])],
        subeler=[_sube_from_dict(s) for s in veri.get("subeler", [])],
        ders_atamalari=[
            _ders_atamasi_from_dict(a) for a in veri.get("ders_atamalari", [])
        ],
        kural_ayarlari=_kural_ayarlari_from_dict(veri.get("kural_ayarlari", {})),
    )


def _yerlesim_girdisi_from_dict(veri: dict) -> YerlesimGirdisi:
    """JSON sözlüğünden bir YerlesimGirdisi nesnesi kurar."""
    return YerlesimGirdisi(
        ders_atamasi_index=veri["ders_atamasi_index"],
        gun=veri["gun"],
        baslangic_dilim=veri["baslangic_dilim"],
        sure=veri["sure"],
    )


def yerlesim_from_dict(veri: dict) -> Yerlesim:
    """JSON sözlüğünden bir Yerlesim nesnesi kurar."""
    return Yerlesim(
        girdiler=[_yerlesim_girdisi_from_dict(g) for g in veri.get("girdiler", [])]
    )


def yerlesim_yukle(yol: Path | str) -> Yerlesim:
    """Diskteki bir JSON dosyasından Yerlesim nesnesini yükler.

    Girdilerdeki ders_atamasi_index alanları, yerleşimin üretildiği Okul
    dosyasındaki ders_atamalari listesinin sırasına bağlıdır; iki dosya
    birlikte taşınmalıdır.
    """
    with open(yol, "r", encoding="utf-8") as dosya:
        return yerlesim_from_dict(json.load(dosya))


def okul_yukle(yol: Path | str) -> Okul:
    """Diskteki bir JSON dosyasından Okul nesnesini yükler."""
    with open(yol, "r", encoding="utf-8") as dosya:
        return okul_from_dict(json.load(dosya))


def okul_kaydet(okul: Okul, yol: Path | str) -> None:
    """Bir Okul nesnesini okunaklı (girintili, Türkçe karakterli) JSON olarak diske yazar."""
    with open(yol, "w", encoding="utf-8") as dosya:
        json.dump(okul_to_dict(okul), dosya, ensure_ascii=False, indent=2)
        dosya.write("\n")


# --- A-katmanı doğrulama (kisit-envanteri.md §4-A) ------------------------
# Her fonksiyon tek bir tutarlılık kuralını kontrol eder ve ihlalde
# eyleme dönük Türkçe mesajlar döndürür; ihlal yoksa boş liste döner.
# CP-SAT'a hiç gitmezler (tanilama.py §4'teki "en ucuz teşhis" katmanı).


def kontrol_sube_toplam_hds(okul: Okul) -> list[str]:
    """Her şubenin haftalık ders saati toplamının ızgara kapasitesini (gün×dilim) aşmadığını doğrular."""
    toplam_dilim = okul.izgara.gun_sayisi * okul.izgara.dilim_sayisi
    hatalar = []
    for sube in okul.subeler:
        toplam_hds = sum(
            a.haftalik_saat for a in okul.ders_atamalari if sube.ad in a.subeler
        )
        if toplam_hds > toplam_dilim:
            hatalar.append(
                f"{sube.ad} şubesinin haftalık ders saati toplamı ({toplam_hds}) "
                f"ızgaranın taşıyabileceği {toplam_dilim} dilimi aşıyor: bu şubeye "
                f"atanan derslerden birinin saatini azaltın veya başka şubeye taşıyın."
            )
    return hatalar


def kontrol_atama_ogretmen_atanmis(okul: Okul) -> list[str]:
    """Her ders atamasının en az bir öğretmene sahip olduğunu doğrular."""
    hatalar = []
    for atama in okul.ders_atamalari:
        if not atama.ogretmenler:
            hatalar.append(
                f"{atama.ders} dersi ({', '.join(atama.subeler)} şube(ler)i) için "
                f"hiç öğretmen atanmamış: bu ders atamasına bir öğretmen ekleyin."
            )
    return hatalar


def kontrol_brans_ders_uyumu(okul: Okul) -> list[str]:
    """Her ders atamasındaki öğretmenlerin o dersi verebilecek branşta olduğunu doğrular."""
    ogretmen_sozlugu = {o.ad: o for o in okul.ogretmenler}
    hatalar = []
    for atama in okul.ders_atamalari:
        for ogretmen_adi in atama.ogretmenler:
            ogretmen = ogretmen_sozlugu.get(ogretmen_adi)
            if ogretmen is None:
                hatalar.append(
                    f"{atama.ders} dersine atanan '{ogretmen_adi}' adlı öğretmen "
                    f"öğretmen listesinde bulunamadı: adı düzeltin veya öğretmeni ekleyin."
                )
            elif atama.ders not in ogretmen.verebilecegi_dersler:
                hatalar.append(
                    f"{ogretmen.ad}, {atama.ders} dersini verebileceği dersler "
                    f"listesinde görünmüyor: ya bu dersi öğretmenin "
                    f"verebilecegi_dersler listesine ekleyin ya da atamayı branşı "
                    f"uygun bir öğretmene verin."
                )
    return hatalar


def kontrol_blok_deseni_toplami(okul: Okul) -> list[str]:
    """Her ders atamasının blok deseni toplamının haftalık ders saatine eşit olduğunu doğrular."""
    hatalar = []
    for atama in okul.ders_atamalari:
        toplam = sum(atama.blok_deseni)
        if toplam != atama.haftalik_saat:
            hatalar.append(
                f"{atama.ders} dersinin blok deseni toplamı ({toplam}) haftalık "
                f"ders saatiyle ({atama.haftalik_saat}) eşleşmiyor: blok_deseni "
                f"listesini haftalik_saat toplamına eşitleyin."
            )
    return hatalar


def kontrol_blok_sayisi_siniri(okul: Okul) -> list[str]:
    """Her ders atamasının blok sayısının haftalık gün sayısını aşmadığını doğrular (her blok ayrı güne düşer)."""
    hatalar = []
    for atama in okul.ders_atamalari:
        if len(atama.blok_deseni) > okul.izgara.gun_sayisi:
            hatalar.append(
                f"{atama.ders} dersinin {len(atama.blok_deseni)} bloğu var ama "
                f"haftada yalnız {okul.izgara.gun_sayisi} gün mevcut (her blok "
                f"ayrı güne düşer): blok sayısını azaltın veya blokları birleştirin."
            )
    return hatalar


def _bos_gun_icin_rezerve_edilecek_acik_dilim(okul: Okul, ogretmen: Ogretmen) -> int:
    """dışOkul kapanışı olmayan günler arasından açık dilimi en az olan günün açık dilim sayısını döndürür.

    B3 "uygun günlerden herhangi biri boş olsun" dediğinden fizibilite
    kontrolü en ucuz boş günü varsaymalı: garanti edilen boş gün,
    kapanışı EN ÇOK (açık dilimi en az) olan uygun güne "biner". O günün
    zaten kapalı dilimleri (varsa) toplam kapanış sayısına bir kez dahil
    edildiğinden, burada yalnızca AÇIK (henüz kapanışsız) dilimler ek
    olarak rezerve edilir -- aksi halde aynı kapanış iki kez düşülür
    (Görev A.2 hatası).
    """
    gun_basi_kapanis: dict[int, int] = {}
    dis_okul_gunleri: set[int] = set()
    for kapanis in ogretmen.kapanislar:
        gun_basi_kapanis[kapanis.gun] = gun_basi_kapanis.get(kapanis.gun, 0) + len(
            kapanis.dilimler
        )
        if kapanis.neden == KapanisNedeni.DIS_OKUL:
            dis_okul_gunleri.add(kapanis.gun)

    uygun_gunler = [
        g for g in range(1, okul.izgara.gun_sayisi + 1) if g not in dis_okul_gunleri
    ]
    if not uygun_gunler:
        # Her gün dışOkul kapanışlı: garanti edilebilecek bir boş gün yok.
        # Bu öğretmen için B3 yapısal olarak karşılanamaz; en kötü durumu
        # varsayıp tam bir günü rezerve ederek kapasiteyi düşük tahmin ederiz.
        return okul.izgara.dilim_sayisi

    en_cok_kapanisli_gunun_kapanisi = max(
        gun_basi_kapanis.get(g, 0) for g in uygun_gunler
    )
    return okul.izgara.dilim_sayisi - en_cok_kapanisli_gunun_kapanisi


def _ogretmen_kapasitesi(okul: Okul, ogretmen: Ogretmen) -> int:
    """Bir öğretmenin toplam dilim sayısından kapanışları ve garanti edilecek boş günün açık dilimlerini düşerek atanabilir kapasitesini hesaplar."""
    toplam_dilim = okul.izgara.gun_sayisi * okul.izgara.dilim_sayisi
    kapanis_dilim_sayisi = sum(len(k.dilimler) for k in ogretmen.kapanislar)
    rezerve = _bos_gun_icin_rezerve_edilecek_acik_dilim(okul, ogretmen)
    return toplam_dilim - kapanis_dilim_sayisi - rezerve


def kontrol_ogretmen_kapasitesi(okul: Okul) -> list[str]:
    """Her öğretmenin müsait kapasitesinin kendisine atanmış toplam ders yüküne yettiğini doğrular (B3 boş gün rezervi dahil)."""
    hatalar = []
    for ogretmen in okul.ogretmenler:
        yuk = sum(
            a.haftalik_saat for a in okul.ders_atamalari if ogretmen.ad in a.ogretmenler
        )
        kapasite = _ogretmen_kapasitesi(okul, ogretmen)
        if kapasite < yuk:
            hatalar.append(
                f"{ogretmen.ad}: atanmış yük ({yuk} saat) müsait kapasiteyi "
                f"({kapasite} dilim, kapanışlar ve garanti boş gün düşülmüş) "
                f"aşıyor: yükünü azaltın, kapanışlarından birini kaldırın veya "
                f"bir dersini başka öğretmenle paylaştırın."
            )
    return hatalar


def kontrol_ders_icin_yeterli_ogretmen_kapasitesi(okul: Okul) -> list[str]:
    """Her ders için, o dersi verebilecek öğretmenlerin toplam kapasitesinin toplam talebi karşıladığını doğrular."""
    hatalar = []
    for ders in okul.dersler:
        talep = sum(a.haftalik_saat for a in okul.ders_atamalari if a.ders == ders.ad)
        if talep == 0:
            continue
        yetkin_ogretmenler = [
            o for o in okul.ogretmenler if ders.ad in o.verebilecegi_dersler
        ]
        if not yetkin_ogretmenler:
            hatalar.append(
                f"{ders.ad} dersini verebilecek hiç öğretmen yok ama toplam "
                f"{talep} saat talep var: en az bir öğretmenin "
                f"verebilecegi_dersler listesine {ders.ad}'i ekleyin."
            )
            continue
        toplam_kapasite = sum(_ogretmen_kapasitesi(okul, o) for o in yetkin_ogretmenler)
        if toplam_kapasite < talep:
            hatalar.append(
                f"{ders.ad} dersini verebilecek öğretmenlerin toplam kapasitesi "
                f"({toplam_kapasite} dilim) toplam talebi ({talep} saat) "
                f"karşılamıyor: bu branştan başka öğretmen ekleyin veya "
                f"mevcut öğretmenlerin kapanışlarını azaltın."
            )
    return hatalar


def kontrol_sinif_rehber_ogretmeni(okul: Okul) -> list[str]:
    """Her şubenin sınıf rehber öğretmeninin tanımlı olduğunu ve rehberlik dersine atandığını doğrular (B5)."""
    ogretmen_sozlugu = {o.ad: o for o in okul.ogretmenler}
    ders_sozlugu = {d.ad: d for d in okul.dersler}
    hatalar = []
    for sube in okul.subeler:
        if not sube.sinif_rehber_ogretmeni:
            hatalar.append(
                f"{sube.ad} şubesinin sınıf rehber öğretmeni tanımlı değil: "
                f"Sube.sinif_rehber_ogretmeni alanını doldurun."
            )
            continue
        if sube.sinif_rehber_ogretmeni not in ogretmen_sozlugu:
            hatalar.append(
                f"{sube.ad} şubesinin sınıf rehber öğretmeni olarak gösterilen "
                f"'{sube.sinif_rehber_ogretmeni}' öğretmen listesinde yok: adı "
                f"düzeltin veya öğretmeni ekleyin."
            )
            continue
        rehberlik_atamalari = [
            a
            for a in okul.ders_atamalari
            if sube.ad in a.subeler
            and ders_sozlugu.get(a.ders)
            and ders_sozlugu[a.ders].kategori == DersKategorisi.REHBERLIK_DIGER
        ]
        if not rehberlik_atamalari:
            hatalar.append(
                f"{sube.ad} şubesi için rehberlik kategorisinde (REHBERLIK_DIGER) "
                f"bir ders ataması bulunamadı: bu şubeye rehberlik dersi ekleyin."
            )
        elif not any(
            sube.sinif_rehber_ogretmeni in a.ogretmenler for a in rehberlik_atamalari
        ):
            hatalar.append(
                f"{sube.ad} şubesinin rehberlik dersine sınıf rehber öğretmeni "
                f"'{sube.sinif_rehber_ogretmeni}' değil başka bir öğretmen "
                f"girmiş: B5 kuralı gereği rehberlik dersine sınıf rehber "
                f"öğretmeni girmelidir."
            )
    return hatalar


def a_katmani_dogrulama(okul: Okul) -> list[str]:
    """Kısıt envanteri §4-A'daki tüm tutarlılık kurallarını çalıştırıp nedenli hata mesajlarını toplar."""
    kontroller = [
        kontrol_sube_toplam_hds,
        kontrol_atama_ogretmen_atanmis,
        kontrol_brans_ders_uyumu,
        kontrol_blok_deseni_toplami,
        kontrol_blok_sayisi_siniri,
        kontrol_ogretmen_kapasitesi,
        kontrol_ders_icin_yeterli_ogretmen_kapasitesi,
        kontrol_sinif_rehber_ogretmeni,
    ]
    hatalar: list[str] = []
    for kontrol in kontroller:
        hatalar.extend(kontrol(okul))
    return hatalar


if __name__ == "__main__":
    ornek_yolu = Path(__file__).parent / "veri" / "ornek_okul.json"

    okul = okul_yukle(ornek_yolu)
    print(
        f"'{ornek_yolu.name}' yüklendi: {len(okul.subeler)} şube, "
        f"{len(okul.ogretmenler)} öğretmen, {len(okul.ders_atamalari)} ders ataması.\n"
    )

    hatalar = a_katmani_dogrulama(okul)
    if hatalar:
        print(f"A-katmanı doğrulama: {len(hatalar)} sorun bulundu:")
        for hata in hatalar:
            print(f"  - {hata}")
    else:
        print("A-katmanı doğrulama: sorun bulunamadı.")

    print("\n--- Kasıtlı bozuk kopya: bir öğretmen silindi ---")
    bozuk_okul = okul_yukle(ornek_yolu)
    silinen = bozuk_okul.ogretmenler.pop(0)
    print(f"Silinen öğretmen: {silinen.ad}\n")

    bozuk_hatalar = a_katmani_dogrulama(bozuk_okul)
    print(f"A-katmanı doğrulama: {len(bozuk_hatalar)} sorun bulundu:")
    for hata in bozuk_hatalar:
        print(f"  - {hata}")
