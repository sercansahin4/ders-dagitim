"""Kalite karnesi: ceza kaynak dökümü, bağımsız yeniden hesap ve mutabakat.

İki ayrı ceza ölçümü vardır ve bu ayrım kasıtlıdır:
  1. Çözüm anı toplama (coz.kademeli_coz): cezalar, modele etiketli
     değişken olarak girmiş CezaTerimi'lerden okunur.
  2. Bağımsız yeniden hesap (bu modül): cezalar, çözücüden ve CP-SAT
     nesnelerinden tamamen bağımsız, yalnız Okul + Yerlesim üzerinden
     düz Python ile yeniden hesaplanır.
İki ölçüm kural bazında birebir tutmak ZORUNDADIR (mutabakat); tutmazsa
koşu başarısız sayılır -- çözücü kendi ödevini kendisi kontrol etmemeli
ilkesinin C-katmanına genişletilmesidir (bkz. coz.cozum_denetle).

Buradaki hesaplar kisitlar.py'deki C1-C8 çevirilerinin anlam ikizidir;
bir kuralın modellemesi değişirse buradaki ikizi de değişmelidir
(mutabakat bu eşzamanlılığı zaten zorlar).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from model import DersKategorisi, Okul, Yerlesim

C_KURAL_SIRASI = ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"]

KURAL_BASLIKLARI = {
    "C1": "Boş gün tercihi karşılanmayan öğretmenler",
    "C2": "Öğretmen×şube günlük toplam sınırı aşımı",
    "C3": "3 saatlik pencereler",
    "C4": "Tek saatlik günler",
    "C5": "Öğretmen×şube ardışıklık sınırı aşımı",
    "C6": "Pencere dilimleri (1-2 saatlik bekleme)",
    "C7": "Aynı kategoriden farklı dersler ardışık",
    "C8": "Dilim tercihi ihlali (sayısal sabaha / sanat-spor sona)",
}


@dataclass
class KarneSatiri:
    """Bağımsız yeniden hesapta tek bir ceza kaynağını (kural + bağlam + miktar) tutar."""

    kural: str
    ceza: int
    aciklama: str
    ogretmen: Optional[str] = None
    sube: Optional[str] = None
    gun: Optional[int] = None


GUN_ADLARI = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma"]


def _gun_adi(gun: int) -> str:
    """Gün indeksini (1-5) Türkçe gün adına çevirir."""
    return GUN_ADLARI[gun - 1] if 1 <= gun <= len(GUN_ADLARI) else f"Gün {gun}"


# --- Yerleşimden doluluk görünümleri ---------------------------------------


def _ogretmen_doluluk(okul: Okul, yerlesim: Yerlesim) -> dict[str, dict[tuple[int, int], int]]:
    """Öğretmen adından (gün, dilim) -> ders_atamasi_index doluluk sözlüğüne görünüm kurar."""
    doluluk: dict[str, dict[tuple[int, int], int]] = {o.ad: {} for o in okul.ogretmenler}
    for girdi in yerlesim.girdiler:
        atama = okul.ders_atamalari[girdi.ders_atamasi_index]
        for s in range(girdi.baslangic_dilim, girdi.baslangic_dilim + girdi.sure):
            for ogretmen_ad in atama.ogretmenler:
                doluluk[ogretmen_ad][(girdi.gun, s)] = girdi.ders_atamasi_index
    return doluluk


def _sube_doluluk(okul: Okul, yerlesim: Yerlesim) -> dict[str, dict[tuple[int, int], int]]:
    """Şube adından (gün, dilim) -> ders_atamasi_index doluluk sözlüğüne görünüm kurar."""
    doluluk: dict[str, dict[tuple[int, int], int]] = {s.ad: {} for s in okul.subeler}
    for girdi in yerlesim.girdiler:
        atama = okul.ders_atamalari[girdi.ders_atamasi_index]
        for s in range(girdi.baslangic_dilim, girdi.baslangic_dilim + girdi.sure):
            for sube_ad in atama.subeler:
                doluluk[sube_ad][(girdi.gun, s)] = girdi.ders_atamasi_index
    return doluluk


def _pencere_dilimleri(
    okul: Okul, ogretmen_ad: str, doluluk: dict[tuple[int, int], int]
) -> set[tuple[int, int]]:
    """Bir öğretmenin pencere (karnıyarık) dilimlerini kisitlar.py'deki segment tanımıyla birebir hesaplar.

    Pencere: kapanış-bölünmesiz bir segment içinde, dersi olmayan ama
    segmentte hem öncesinde hem sonrasında dersi olan dilim (Karar 12:
    pencereyi_bolmeyen_nedenler kümesindeki kapanışlar segmenti bölmez).
    """
    ogretmen = next(o for o in okul.ogretmenler if o.ad == ogretmen_ad)
    kapanislar = {
        (k.gun, d): k.neden for k in ogretmen.kapanislar for d in k.dilimler
    }
    bolmeyenler = okul.kural_ayarlari.pencereyi_bolmeyen_nedenler
    pencereler: set[tuple[int, int]] = set()
    for g in range(1, okul.izgara.gun_sayisi + 1):
        segment: list[int] = []
        segmentler: list[list[int]] = []
        for s in range(1, okul.izgara.dilim_sayisi + 1):
            neden = kapanislar.get((g, s))
            if neden is not None and neden not in bolmeyenler:
                segmentler.append(segment)
                segment = []
            else:
                segment.append(s)
        segmentler.append(segment)
        for seg in segmentler:
            dersli = [s for s in seg if (g, s) in doluluk]
            if len(dersli) < 2:
                continue
            for s in range(min(dersli) + 1, max(dersli)):
                if (g, s) not in doluluk:
                    pencereler.add((g, s))
    return pencereler


def _c2_c5_sayilir_atamalar(okul: Okul) -> dict[tuple[str, str], list[int]]:
    """(öğretmen, şube) çiftlerinden C2/C5 sayımına giren (rehberlik-dışı) atama indekslerine sözlük kurar (kisitlar._ogretmen_sube_atamalari ikizi)."""
    kategori = {d.ad: d.kategori for d in okul.dersler}
    ciftler: dict[tuple[str, str], list[int]] = {}
    for a_idx, atama in enumerate(okul.ders_atamalari):
        if kategori.get(atama.ders) == DersKategorisi.REHBERLIK_DIGER:
            continue
        for ogretmen_ad in atama.ogretmenler:
            for sube_ad in atama.subeler:
                ciftler.setdefault((ogretmen_ad, sube_ad), []).append(a_idx)
    return ciftler


# --- Kural bazında bağımsız yeniden hesap ----------------------------------


def cezalari_hesapla(okul: Okul, yerlesim: Yerlesim) -> dict[str, list[KarneSatiri]]:
    """C1-C8 cezalarını yalnız Okul + Yerlesim üzerinden yeniden hesaplar (kapalı kurallar boş liste döner)."""
    ogretmen_dolulugu = _ogretmen_doluluk(okul, yerlesim)
    sube_dolulugu = _sube_doluluk(okul, yerlesim)
    pencereler = {
        ad: _pencere_dilimleri(okul, ad, doluluk)
        for ad, doluluk in ogretmen_dolulugu.items()
    }
    ciftler = _c2_c5_sayilir_atamalar(okul)
    kategori = {d.ad: d.kategori for d in okul.dersler}
    gunler = range(1, okul.izgara.gun_sayisi + 1)
    dilimler = range(1, okul.izgara.dilim_sayisi + 1)
    dokum: dict[str, list[KarneSatiri]] = {k: [] for k in C_KURAL_SIRASI}

    # Yerleşim girdilerinden blok kapsama görünümü (C5/C7 blok muafiyeti).
    girdi_kapsamlari: list[tuple[int, int, int, int]] = [
        (g.ders_atamasi_index, g.gun, g.baslangic_dilim, g.baslangic_dilim + g.sure - 1)
        for g in yerlesim.girdiler
    ]

    def tek_blok_kapsiyor(atama_indeksleri: list[int], g: int, s1: int, s2: int) -> bool:
        """[s1, s2] aralığının tamamını verilen atamaların TEK bir bloğu kapsıyor mu?"""
        return any(
            a_idx in atama_indeksleri and gg == g and b1 <= s1 and b2 >= s2
            for (a_idx, gg, b1, b2) in girdi_kapsamlari
        )

    # C1 -- boş gün tercihi.
    for ogretmen in okul.ogretmenler:
        g = ogretmen.bos_gun_tercihi
        if g is None or not (1 <= g <= okul.izgara.gun_sayisi):
            continue
        calisiyor = any(gun == g for (gun, _s) in ogretmen_dolulugu[ogretmen.ad])
        if calisiyor:
            dokum["C1"].append(
                KarneSatiri(
                    "C1",
                    1,
                    f"{ogretmen.ad}: tercih ettiği boş gün ({_gun_adi(g)}) ders içeriyor.",
                    ogretmen=ogretmen.ad,
                    gun=g,
                )
            )

    # C2 -- öğretmen×şube günlük toplam sınırı.
    sinir = okul.kural_ayarlari.ogretmen_sube_gunluk_toplam
    for (ogretmen_ad, sube_ad), atama_indeksleri in sorted(ciftler.items()):
        for g in gunler:
            toplam = sum(
                1
                for (gun, s), a_idx in ogretmen_dolulugu[ogretmen_ad].items()
                if gun == g and a_idx in atama_indeksleri
            )
            if toplam > sinir:
                dokum["C2"].append(
                    KarneSatiri(
                        "C2",
                        toplam - sinir,
                        f"{ogretmen_ad} -> {sube_ad}: {_gun_adi(g)} günü {toplam} saat "
                        f"(sınır {sinir}).",
                        ogretmen=ogretmen_ad,
                        sube=sube_ad,
                        gun=g,
                    )
                )

    # C3 -- 3 ardışık pencere dilimi (kayan konum başına 1).
    for ogretmen in okul.ogretmenler:
        pset = pencereler[ogretmen.ad]
        for g in gunler:
            for s in dilimler:
                if s + 2 > okul.izgara.dilim_sayisi:
                    break
                if all((g, s2) in pset for s2 in range(s, s + 3)):
                    dokum["C3"].append(
                        KarneSatiri(
                            "C3",
                            1,
                            f"{ogretmen.ad}: {_gun_adi(g)} {s}-{s + 2}. dilimler "
                            f"3 saatlik pencere.",
                            ogretmen=ogretmen.ad,
                            gun=g,
                        )
                    )

    # C4 -- tek saatlik günler.
    for ogretmen in okul.ogretmenler:
        for g in gunler:
            saat = sum(1 for (gun, _s) in ogretmen_dolulugu[ogretmen.ad] if gun == g)
            if saat == 1:
                dokum["C4"].append(
                    KarneSatiri(
                        "C4",
                        1,
                        f"{ogretmen.ad}: {_gun_adi(g)} günü yalnız 1 saat ders.",
                        ogretmen=ogretmen.ad,
                        gun=g,
                    )
                )

    # C5 -- öğretmen×şube ardışıklık sınırı (kayan konum başına 1, tek blok muaf).
    pencere_boyu = okul.kural_ayarlari.ardisiklik_siniri + 1
    for (ogretmen_ad, sube_ad), atama_indeksleri in sorted(ciftler.items()):
        haftalik = sum(okul.ders_atamalari[i].haftalik_saat for i in atama_indeksleri)
        if haftalik < pencere_boyu:
            continue
        doluluk = ogretmen_dolulugu[ogretmen_ad]
        for g in gunler:
            for s in dilimler:
                if s + pencere_boyu - 1 > okul.izgara.dilim_sayisi:
                    break
                aralik = range(s, s + pencere_boyu)
                hepsi_dolu = all(
                    doluluk.get((g, s2)) in atama_indeksleri for s2 in aralik
                )
                if hepsi_dolu and not tek_blok_kapsiyor(
                    atama_indeksleri, g, s, s + pencere_boyu - 1
                ):
                    dokum["C5"].append(
                        KarneSatiri(
                            "C5",
                            1,
                            f"{ogretmen_ad} -> {sube_ad}: {_gun_adi(g)} "
                            f"{s}-{s + pencere_boyu - 1}. dilimler blok-aşan "
                            f"{pencere_boyu} saatlik zincir.",
                            ogretmen=ogretmen_ad,
                            sube=sube_ad,
                            gun=g,
                        )
                    )

    # C6 -- pencere dilimi başına 1.
    for ogretmen in okul.ogretmenler:
        for (g, s) in sorted(pencereler[ogretmen.ad]):
            dokum["C6"].append(
                KarneSatiri(
                    "C6",
                    1,
                    f"{ogretmen.ad}: {_gun_adi(g)} {s}. dilim pencere.",
                    ogretmen=ogretmen.ad,
                    gun=g,
                )
            )

    # C7 -- aynı kategoriden farklı dersler ardışık (DIL muaf, tek blok muaf).
    for sube in okul.subeler:
        doluluk = sube_dolulugu[sube.ad]
        for kat in DersKategorisi:
            if kat == DersKategorisi.DIL:
                continue
            ilgili = [
                a_idx
                for a_idx, atama in enumerate(okul.ders_atamalari)
                if sube.ad in atama.subeler and kategori.get(atama.ders) == kat
            ]
            farkli_dersler = {okul.ders_atamalari[i].ders for i in ilgili}
            if len(farkli_dersler) < 2:
                continue
            for g in gunler:
                for s in dilimler:
                    if s + 1 > okul.izgara.dilim_sayisi:
                        break
                    a1 = doluluk.get((g, s))
                    a2 = doluluk.get((g, s + 1))
                    if (
                        a1 in ilgili
                        and a2 in ilgili
                        and not tek_blok_kapsiyor(ilgili, g, s, s + 1)
                    ):
                        d1 = okul.ders_atamalari[a1].ders
                        d2 = okul.ders_atamalari[a2].ders
                        dokum["C7"].append(
                            KarneSatiri(
                                "C7",
                                1,
                                f"{sube.ad}: {_gun_adi(g)} {s}-{s + 1}. dilimlerde "
                                f"aynı kategoriden ({kat.name}) ardışık dersler: "
                                f"{d1} + {d2}.",
                                sube=sube.ad,
                                gun=g,
                            )
                        )

    # C8 -- dilim tercihi vektörleri.
    vektorler = {
        DersKategorisi.SAYISAL: okul.kural_ayarlari.sayisal_dilim_cezasi,
        DersKategorisi.SANAT_SPOR: okul.kural_ayarlari.sanat_spor_dilim_cezasi,
    }
    for girdi in yerlesim.girdiler:
        atama = okul.ders_atamalari[girdi.ders_atamasi_index]
        vektor = vektorler.get(kategori.get(atama.ders))
        if vektor is None:
            continue
        for s in range(girdi.baslangic_dilim, girdi.baslangic_dilim + girdi.sure):
            katsayi = vektor[s - 1] if s - 1 < len(vektor) else 0
            if katsayi > 0:
                dokum["C8"].append(
                    KarneSatiri(
                        "C8",
                        katsayi,
                        f"{atama.ders} ({', '.join(atama.subeler)}): "
                        f"{_gun_adi(girdi.gun)} {s}. dilim (ceza {katsayi}).",
                        ogretmen=atama.ogretmenler[0] if atama.ogretmenler else None,
                        sube=",".join(atama.subeler),
                        gun=girdi.gun,
                    )
                )

    # Kapalı kurallar: kisitlar.yumusak_kurallari_kur ile ayna.
    for kural in okul.kural_ayarlari.kapali_kurallar:
        if kural in dokum:
            dokum[kural] = []
    return dokum


def kural_toplamlari(dokum: dict[str, list[KarneSatiri]]) -> dict[str, int]:
    """Karne dökümünü kural başına toplam cezaya indirger."""
    return {kural: sum(satir.ceza for satir in satirlar) for kural, satirlar in dokum.items()}


def mutabakat(
    cozucu_toplamlari: dict[str, int], bagimsiz_toplamlari: dict[str, int]
) -> list[str]:
    """Çözüm anı toplanan cezalarla bağımsız yeniden hesabı kural bazında karşılaştırır; uyuşmazlıkları Türkçe raporlar (boş liste = mutabık)."""
    uyusmazliklar: list[str] = []
    for kural in C_KURAL_SIRASI:
        cozucu = cozucu_toplamlari.get(kural, 0)
        bagimsiz = bagimsiz_toplamlari.get(kural, 0)
        if cozucu != bagimsiz:
            uyusmazliklar.append(
                f"{kural}: çözücü değişkenlerinden okunan ceza ({cozucu}) bağımsız "
                f"yeniden hesapla ({bagimsiz}) uyuşmuyor -- kisitlar.py çevirisi ile "
                f"karne.py ikizi ayrışmış, koşu geçersiz sayılmalı."
            )
    return uyusmazliklar


def karne_metni(
    okul: Okul,
    dokum: dict[str, list[KarneSatiri]],
    ust_katman_cezasi: Optional[int] = None,
    alt_katman_cezasi: Optional[int] = None,
) -> str:
    """Ceza kaynak dökümünü kural × kaynak kırılımıyla okunur Türkçe karneye çevirir."""
    satirlar = ["=== Kalite karnesi: ceza kaynak dökümü ==="]
    if ust_katman_cezasi is not None:
        satirlar.append(
            f"Üst katman ağırlıklı ceza: {ust_katman_cezasi} | "
            f"alt katman ağırlıklı ceza: {alt_katman_cezasi}"
        )
    toplamlar = kural_toplamlari(dokum)
    for kural in C_KURAL_SIRASI:
        baslik = KURAL_BASLIKLARI.get(kural, kural)
        if kural in okul.kural_ayarlari.kapali_kurallar:
            satirlar.append(f"\n{kural} -- {baslik}: KAPALI (kural_ayarlari.kapali_kurallar)")
            continue
        toplam = toplamlar.get(kural, 0)
        satirlar.append(f"\n{kural} -- {baslik}: toplam {toplam}")
        if toplam == 0:
            satirlar.append("  İhlal yok.")
            continue
        for satir in dokum[kural]:
            satirlar.append(f"  - {satir.aciklama}")
    return "\n".join(satirlar)
