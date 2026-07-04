"""İki katmanlı kademeli çözüm akışını yürütür.

Modelin önce gevşetilmiş/kaba bir katmanda, ardından tam kısıt
kümesiyle ikinci katmanda kademeli olarak çözüldüğü akışın
yönetildiği modül.

v0: amaç fonksiyonu yok (yalnızca fizibilite). Katmanlama Hafta 2'nin
sonraki paketinde (C kuralları) eklenecek; bkz. docs/cevrim-tablosu.md §3.
"""

from __future__ import annotations

from pathlib import Path

from ortools.sat.python import cp_model

from kisitlar import KisitModeli, kur_temel_degiskenler, sert_kurallari_uygula
from model import KapanisNedeni, Okul, Yerlesim, YerlesimGirdisi, okul_yukle

GUN_ADLARI = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma"]


def _gun_adi(gun: int) -> str:
    """Gün indeksini (1-5) Türkçe gün adına çevirir."""
    return GUN_ADLARI[gun - 1] if 1 <= gun <= len(GUN_ADLARI) else f"Gün {gun}"


def coz(okul: Okul) -> tuple[cp_model.CpSolver, KisitModeli, Yerlesim | None]:
    """Modeli kurar, sert kuralları (B1-B8) ekler ve amaç fonksiyonsuz fizibilite çözümünü çalıştırır."""
    km = kur_temel_degiskenler(okul)
    sert_kurallari_uygula(km)

    cozucu = cp_model.CpSolver()
    cozucu.parameters.max_time_in_seconds = 60
    durum = cozucu.Solve(km.model)

    if durum not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return cozucu, km, None

    yerlesim = Yerlesim()
    for (a_idx, b_idx, g, s), degisken in km.basla.items():
        if cozucu.Value(degisken) == 1:
            uzunluk = okul.ders_atamalari[a_idx].blok_deseni[b_idx]
            yerlesim.girdiler.append(
                YerlesimGirdisi(
                    ders_atamasi_index=a_idx, gun=g, baslangic_dilim=s, sure=uzunluk
                )
            )
    return cozucu, km, yerlesim


def sube_carsaf_metni(okul: Okul, yerlesim: Yerlesim) -> str:
    """Yerleşimi şube bazlı gün×dilim çarşaf listesi olarak biçimlendirir."""
    grid: dict[str, dict[tuple[int, int], str]] = {sube.ad: {} for sube in okul.subeler}
    for girdi in yerlesim.girdiler:
        atama = okul.ders_atamalari[girdi.ders_atamasi_index]
        for s2 in range(girdi.baslangic_dilim, girdi.baslangic_dilim + girdi.sure):
            for sube_ad in atama.subeler:
                grid[sube_ad][(girdi.gun, s2)] = atama.ders

    satirlar = ["=== Şube bazlı çarşaf liste ==="]
    for sube in okul.subeler:
        satirlar.append(f"\n{sube.ad}")
        for g in range(1, okul.izgara.gun_sayisi + 1):
            gun_satiri = [_gun_adi(g).ljust(11)]
            for s in range(1, okul.izgara.dilim_sayisi + 1):
                gun_satiri.append(grid[sube.ad].get((g, s), "-").ljust(14))
            satirlar.append(" ".join(gun_satiri))
    return "\n".join(satirlar)


def ogretmen_program_metni(okul: Okul, yerlesim: Yerlesim) -> str:
    """Yerleşimi öğretmen bazlı gün×dilim programı olarak biçimlendirir."""
    grid: dict[str, dict[tuple[int, int], str]] = {o.ad: {} for o in okul.ogretmenler}
    for girdi in yerlesim.girdiler:
        atama = okul.ders_atamalari[girdi.ders_atamasi_index]
        etiket = f"{atama.ders}({','.join(atama.subeler)})"
        for s2 in range(girdi.baslangic_dilim, girdi.baslangic_dilim + girdi.sure):
            for ogretmen_ad in atama.ogretmenler:
                grid[ogretmen_ad][(girdi.gun, s2)] = etiket

    satirlar = ["=== Öğretmen bazlı program ==="]
    for ogretmen in okul.ogretmenler:
        satirlar.append(f"\n{ogretmen.ad}")
        for g in range(1, okul.izgara.gun_sayisi + 1):
            gun_satiri = [_gun_adi(g).ljust(11)]
            for s in range(1, okul.izgara.dilim_sayisi + 1):
                gun_satiri.append(grid[ogretmen.ad].get((g, s), "-").ljust(18))
            satirlar.append(" ".join(gun_satiri))
    return "\n".join(satirlar)


def cozum_denetle(okul: Okul, yerlesim: Yerlesim) -> list[str]:
    """Çözücünün ürettiği Yerleşimi, çözücüden tamamen bağımsız düz Python kurallarıyla denetler.

    Gerekçe: çözücü kendi ödevini kendisi kontrol etmemeli -- bu
    fonksiyon km/CP-SAT nesnelerine hiç dokunmaz, yalnızca Okul +
    Yerlesim'den yeniden hesaplar.
    """
    sorunlar: list[str] = []

    ogretmen_doluluk: dict[str, dict[tuple[int, int], list[str]]] = {
        o.ad: {} for o in okul.ogretmenler
    }
    sube_doluluk: dict[str, dict[tuple[int, int], list[str]]] = {
        s.ad: {} for s in okul.subeler
    }

    for girdi in yerlesim.girdiler:
        atama = okul.ders_atamalari[girdi.ders_atamasi_index]
        for s2 in range(girdi.baslangic_dilim, girdi.baslangic_dilim + girdi.sure):
            for ogretmen_ad in atama.ogretmenler:
                ogretmen_doluluk[ogretmen_ad].setdefault((girdi.gun, s2), []).append(
                    atama.ders
                )
            for sube_ad in atama.subeler:
                sube_doluluk[sube_ad].setdefault((girdi.gun, s2), []).append(atama.ders)

    # 1. Çakışma sayısı 0 olmalı (öğretmen ve şube ekseninde).
    for ogretmen_ad, doluluk in ogretmen_doluluk.items():
        for (g, s), dersler in doluluk.items():
            if len(dersler) > 1:
                sorunlar.append(
                    f"{ogretmen_ad}: {_gun_adi(g)} {s}. dilimde {len(dersler)} ders "
                    f"çakışıyor ({', '.join(dersler)})."
                )
    for sube_ad, doluluk in sube_doluluk.items():
        for (g, s), dersler in doluluk.items():
            if len(dersler) > 1:
                sorunlar.append(
                    f"{sube_ad} şubesi: {_gun_adi(g)} {s}. dilimde {len(dersler)} ders "
                    f"çakışıyor ({', '.join(dersler)})."
                )

    # 2. Her öğretmende, dışOkul kapanışı olmayan günler arasında en az
    #    bir tam boş gün olmalı (B3).
    for ogretmen in okul.ogretmenler:
        dis_okul_gunleri = {
            k.gun for k in ogretmen.kapanislar if k.neden == KapanisNedeni.DIS_OKUL
        }
        calisilan_gunler = {g for (g, _s) in ogretmen_doluluk[ogretmen.ad].keys()}
        uygun_gunler = [
            g for g in range(1, okul.izgara.gun_sayisi + 1) if g not in dis_okul_gunleri
        ]
        if not any(g not in calisilan_gunler for g in uygun_gunler):
            sorunlar.append(
                f"{ogretmen.ad}: dışOkul kapanışı olmayan hiçbir günde tam boş gün "
                f"yok (B3 ihlali)."
            )

    # 3. Kapanış ihlali: kapalı dilime ders yerleşmiş mi?
    for ogretmen in okul.ogretmenler:
        kapali = {(k.gun, d) for k in ogretmen.kapanislar for d in k.dilimler}
        for (g, s) in ogretmen_doluluk[ogretmen.ad]:
            if (g, s) in kapali:
                sorunlar.append(
                    f"{ogretmen.ad}: {_gun_adi(g)} {s}. dilim kapalıyken (kapanış) "
                    f"ders yerleşmiş (B2 ihlali)."
                )

    # 4. Her ders ataması için aynı güne en fazla bir blok düşmeli (B4).
    atama_gunleri: dict[int, list[int]] = {}
    for girdi in yerlesim.girdiler:
        atama_gunleri.setdefault(girdi.ders_atamasi_index, []).append(girdi.gun)
    for a_idx, gunler in atama_gunleri.items():
        if len(gunler) != len(set(gunler)):
            atama = okul.ders_atamalari[a_idx]
            sorunlar.append(
                f"{atama.ders} ({', '.join(atama.subeler)}): aynı güne birden "
                f"fazla blok düşmüş (B4 ihlali)."
            )

    # 5. Yerleşen dilim toplamı haftalık ders saatine eşit olmalı.
    for a_idx, atama in enumerate(okul.ders_atamalari):
        toplam_sure = sum(
            girdi.sure for girdi in yerlesim.girdiler if girdi.ders_atamasi_index == a_idx
        )
        if toplam_sure != atama.haftalik_saat:
            sorunlar.append(
                f"{atama.ders} ({', '.join(atama.subeler)}): yerleşen dilim toplamı "
                f"({toplam_sure}) haftalık saatle ({atama.haftalik_saat}) eşleşmiyor."
            )

    return sorunlar


if __name__ == "__main__":
    ornek_yolu = Path(__file__).parent / "veri" / "ornek_okul.json"
    okul = okul_yukle(ornek_yolu)

    cozucu, km, yerlesim = coz(okul)

    if yerlesim is None:
        print("Çözüm bulunamadı (fizibilite sağlanamadı).")
    else:
        print(f"Çözüm bulundu: {len(yerlesim.girdiler)} blok yerleşti.\n")
        print(sube_carsaf_metni(okul, yerlesim))
        print()
        print(ogretmen_program_metni(okul, yerlesim))

        print("\n=== Bağımsız denetçi raporu ===")
        sorunlar = cozum_denetle(okul, yerlesim)
        if sorunlar:
            for sorun in sorunlar:
                print(f"  - {sorun}")
        else:
            print(
                "Sorun bulunamadı: çakışma yok, her öğretmende boş gün var, "
                "kapanış ihlali yok, gün/blok ve HDS toplamları tutarlı."
            )
