"""İki katmanlı kademeli çözüm akışını yürütür.

Akışlar:
  - coz(okul): amaç fonksiyonsuz fizibilite çözümü. Tanılama bu modu
    kullanır (tanilama.py); C-katmanı buraya bilerek eklenmez.
  - kademeli_coz(okul): iki geçişli kademeli (lexicographic) çözüm
    (kararlar.md Karar 5, kisit-envanteri.md §4-C). Geçiş 1 üst katman
    cezasını (C1-C3) en aza indirir; değer <= kısıtıyla kilitlenir
    (== değil: alt katman iyileştirilirken üst katmanın tesadüfen daha
    da iyileşmesine izin verilir); Geçiş 2 kalan serbestlikte alt
    katman cezasını (C4-C8) en aza indirir. Alt katman uğruna üst
    katman yapısal olarak feda EDİLEMEZ.

Ana akış çözücüden önce A-katmanı doğrulamasından geçer (A-kapısı):
hata varsa varsayılan davranış durmak, --devam bayrağı bilinçli istisna.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from ortools.sat.python import cp_model

from kisitlar import (
    ALT_KATMAN_SIRASI,
    UST_KATMAN_SIRASI,
    CezaTerimi,
    KisitModeli,
    baskinlik_agirliklari,
    kur_temel_degiskenler,
    sert_kurallari_uygula,
    yumusak_kurallari_kur,
)
from model import (
    KapanisNedeni,
    Okul,
    Yerlesim,
    YerlesimGirdisi,
    a_katmani_dogrulama,
    okul_yukle,
)

GUN_ADLARI = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma"]


def _gun_adi(gun: int) -> str:
    """Gün indeksini (1-5) Türkçe gün adına çevirir."""
    return GUN_ADLARI[gun - 1] if 1 <= gun <= len(GUN_ADLARI) else f"Gün {gun}"


def coz(okul: Okul) -> tuple[cp_model.CpSolver, KisitModeli, Optional[Yerlesim], int]:
    """Modeli HIZLI modda kurar, sert kuralları (B1-B8) ekler ve amaç fonksiyonsuz fizibilite çözümünü çalıştırır.

    Dönüş: (çözücü, kısıt modeli, Yerlesim ya da None, çözüm durumu).
    Durum ayrıca döndürülür ki çağıran INFEASIBLE'ı (tanılama modunu
    tetiklemeli) UNKNOWN/zaman aşımından (tanılama anlamsız) ayırt edebilsin.
    """
    km = kur_temel_degiskenler(okul)
    sert_kurallari_uygula(km)

    cozucu = cp_model.CpSolver()
    cozucu.parameters.max_time_in_seconds = 60
    durum = cozucu.Solve(km.model)

    if durum not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return cozucu, km, None, durum

    return cozucu, km, _yerlesim_cikar(okul, km, cozucu), durum


def _yerlesim_cikar(okul: Okul, km: KisitModeli, cozucu: cp_model.CpSolver) -> Yerlesim:
    """Çözücünün 1'e sabitlediği basla anahtarlarından Yerlesim nesnesi kurar."""
    yerlesim = Yerlesim()
    for (a_idx, b_idx, g, s), degisken in km.basla.items():
        if cozucu.Value(degisken) == 1:
            uzunluk = okul.ders_atamalari[a_idx].blok_deseni[b_idx]
            yerlesim.girdiler.append(
                YerlesimGirdisi(
                    ders_atamasi_index=a_idx, gun=g, baslangic_dilim=s, sure=uzunluk
                )
            )
    return yerlesim


@dataclass
class KademeliSonuc:
    """İki geçişli kademeli çözümün çıktısını ve çözüm anı toplanan ceza dökümünü tutar.

    kural_cezalari: kural başına AĞIRLIKSIZ toplam ceza (karne dili);
    ust/alt_katman_cezasi: katmanın AĞIRLIKLI amaç değeri (kilit dili).
    gecis2_kullanildi=False ise Geçiş 2 süre bütçesinde çözüm üretemedi
    ve tüm değerler Geçiş 1 çözümünden okundu (kabul sınırı -- üst
    katman -- yine sağlanmıştır; yalnız alt katman iyileştirilmemiştir).
    """

    yerlesim: Optional[Yerlesim]
    durum_ust: int
    durum_alt: Optional[int] = None
    ust_katman_cezasi: Optional[int] = None
    alt_katman_cezasi: Optional[int] = None
    kilit_degeri: Optional[int] = None
    sure_ust: float = 0.0
    sure_alt: float = 0.0
    gecis2_kullanildi: bool = False
    terimler: dict[str, list[CezaTerimi]] = field(default_factory=dict)
    agirliklar: dict[str, int] = field(default_factory=dict)
    kural_cezalari: dict[str, int] = field(default_factory=dict)


def kademeli_coz(okul: Okul, yalniz_gecis1: bool = False) -> KademeliSonuc:
    """Modeli HIZLI modda kurar, sert kuralları ve C1-C8 ceza terimlerini ekler, iki geçişli kademeli çözümü çalıştırır.

    Onaylı uygulama kararları: katman içi öncelik baskınlık ağırlığıyla
    (kisitlar.baskinlik_agirliklari), kilit <= kısıtıyla, süre bütçesi
    üst/alt geçişlere kural_ayarlari.ust_katman_sure_orani ile bölünür
    (Geçiş 1 erken biterse artan süre Geçiş 2'ye devreder), cezalar
    çözüm anında etiketli değişkenlerden toplanır.

    yalniz_gecis1=True: Geçiş 2 hiç koşulmaz; sonuç Geçiş 1 çözümüdür
    (durum_alt=None, gecis2_kullanildi=False). Altın üretici bunu,
    Geçiş 2'si OPTIMAL kanıtlanamayan tam-kurallı fixture'larda yalnız
    kilit değerini (Geçiş 1 OPTIMAL amacı) sabitlemek için kullanır
    (bkz. kararlar.md Karar 23); ürün akışında kullanılmaz.
    """
    km = kur_temel_degiskenler(okul)
    sert_kurallari_uygula(km)
    terimler = yumusak_kurallari_kur(km)

    agirliklar_ust = baskinlik_agirliklari(UST_KATMAN_SIRASI, terimler)
    agirliklar_alt = baskinlik_agirliklari(ALT_KATMAN_SIRASI, terimler)
    agirliklar = {**agirliklar_ust, **agirliklar_alt}

    ust_ifade = sum(
        agirliklar_ust[kural] * t.katsayi * t.degisken
        for kural in UST_KATMAN_SIRASI
        for t in terimler[kural]
    )
    alt_ifade = sum(
        agirliklar_alt[kural] * t.katsayi * t.degisken
        for kural in ALT_KATMAN_SIRASI
        for t in terimler[kural]
    )

    butce = okul.kural_ayarlari.sure_butcesi_saniye
    oran = okul.kural_ayarlari.ust_katman_sure_orani

    # Geçiş 1: üst katman.
    cozucu_ust = cp_model.CpSolver()
    cozucu_ust.parameters.max_time_in_seconds = butce * oran
    km.model.Minimize(ust_ifade)
    baslangic = time.monotonic()
    durum_ust = cozucu_ust.Solve(km.model)
    sure_ust = time.monotonic() - baslangic

    if durum_ust not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return KademeliSonuc(yerlesim=None, durum_ust=durum_ust, sure_ust=sure_ust,
                             terimler=terimler, agirliklar=agirliklar)

    kilit_degeri = round(cozucu_ust.ObjectiveValue())

    if yalniz_gecis1:
        kural_cezalari = {
            kural: sum(t.katsayi * cozucu_ust.Value(t.degisken) for t in kural_terimleri)
            for kural, kural_terimleri in terimler.items()
        }
        return KademeliSonuc(
            yerlesim=_yerlesim_cikar(okul, km, cozucu_ust),
            durum_ust=durum_ust,
            ust_katman_cezasi=kilit_degeri,
            kilit_degeri=kilit_degeri,
            sure_ust=sure_ust,
            terimler=terimler,
            agirliklar=agirliklar,
            kural_cezalari=kural_cezalari,
        )

    # Kilit (<=) + Geçiş 1 çözümü Geçiş 2'ye başlangıç ipucu olarak verilir
    # (kilidi zaten sağlayan hazır bir çözüm: Geçiş 2 hiç değilse onunla başlar).
    km.model.Add(ust_ifade <= kilit_degeri)
    km.model.ClearHints()
    for degisken in km.basla.values():
        km.model.AddHint(degisken, cozucu_ust.Value(degisken))

    # Geçiş 2: alt katman, kalan sürenin tamamıyla (devir kuralı).
    cozucu_alt = cp_model.CpSolver()
    cozucu_alt.parameters.max_time_in_seconds = max(butce - sure_ust, 1.0)
    km.model.Minimize(alt_ifade)
    baslangic = time.monotonic()
    durum_alt = cozucu_alt.Solve(km.model)
    sure_alt = time.monotonic() - baslangic

    gecis2_kullanildi = durum_alt in (cp_model.OPTIMAL, cp_model.FEASIBLE)
    nihai = cozucu_alt if gecis2_kullanildi else cozucu_ust

    # Ceza dökümü çözüm anındaki etiketli değişkenlerden okunur. Tüm ceza
    # değişkenleri çift yönlü kanallı olduğundan (bkz. kisitlar.py C-katmanı
    # notu) hangi geçişten okunursa okunsun fiili ihlali gösterirler.
    kural_cezalari = {
        kural: sum(t.katsayi * nihai.Value(t.degisken) for t in kural_terimleri)
        for kural, kural_terimleri in terimler.items()
    }
    ust_katman_cezasi = sum(
        agirliklar_ust[k] * t.katsayi * nihai.Value(t.degisken)
        for k in UST_KATMAN_SIRASI
        for t in terimler[k]
    )
    alt_katman_cezasi = sum(
        agirliklar_alt[k] * t.katsayi * nihai.Value(t.degisken)
        for k in ALT_KATMAN_SIRASI
        for t in terimler[k]
    )

    return KademeliSonuc(
        yerlesim=_yerlesim_cikar(okul, km, nihai),
        durum_ust=durum_ust,
        durum_alt=durum_alt,
        ust_katman_cezasi=ust_katman_cezasi,
        alt_katman_cezasi=alt_katman_cezasi,
        kilit_degeri=kilit_degeri,
        sure_ust=sure_ust,
        sure_alt=sure_alt,
        gecis2_kullanildi=gecis2_kullanildi,
        terimler=terimler,
        agirliklar=agirliklar,
        kural_cezalari=kural_cezalari,
    )


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

    Dönen listede "[muaf]" önekli satırlar ihlal değil bilgi notudur:
    B3'ten muaf tutulan (Karar 17) öğretmenlerin boş gün durumunu
    raporlar; ihlal sayımı yapan çağıranlar bu öneki ayıklamalıdır.
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
    #    bir tam boş gün olmalı (B3). Muaf öğretmen (Karar 17) ihlal
    #    üretmez; durumu "[muaf]" bilgi notuyla raporlanır.
    for ogretmen in okul.ogretmenler:
        dis_okul_gunleri = {
            k.gun for k in ogretmen.kapanislar if k.neden == KapanisNedeni.DIS_OKUL
        }
        calisilan_gunler = {g for (g, _s) in ogretmen_doluluk[ogretmen.ad].keys()}
        uygun_gunler = [
            g for g in range(1, okul.izgara.gun_sayisi + 1) if g not in dis_okul_gunleri
        ]
        bos_gun_var = any(g not in calisilan_gunler for g in uygun_gunler)
        if ogretmen.ad in okul.kural_ayarlari.b3_muaf_ogretmenler:
            durum_notu = (
                "tam boş günü yine de var" if bos_gun_var else "tam boş günü yok"
            )
            sorunlar.append(
                f"[muaf] {ogretmen.ad}: B3 kontrolünden muaf "
                f"(kural_ayarlari.b3_muaf_ogretmenler); {durum_notu}, "
                f"ihlal sayılmadı."
            )
        elif not bos_gun_var:
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
    import argparse
    import sys

    parser = argparse.ArgumentParser(
        description="Okul verisini A-katmanından geçirip hızlı modda çözer."
    )
    parser.add_argument(
        "okul_dosyasi",
        nargs="?",
        default=str(Path(__file__).parent / "veri" / "ornek_okul.json"),
        help="Okul şemasında JSON dosyası (varsayılan: veri/ornek_okul.json).",
    )
    parser.add_argument(
        "--devam",
        action="store_true",
        help="A-katmanı hataları olsa da çözücüyü (ve gerekirse tanılamayı) çalıştır.",
    )
    parser.add_argument(
        "--fizibilite",
        action="store_true",
        help="C-katmanını atlayıp yalnız amaç fonksiyonsuz fizibilite çözümü koş (eski davranış).",
    )
    args = parser.parse_args()
    okul = okul_yukle(args.okul_dosyasi)

    # A-kapısı: çözücüden önce en ucuz teşhis katmanı koşar; hata varsa
    # varsayılan davranış durmaktır (çözücünün UNSAT'ı A-katmanının
    # zaten söylediğini pahalı yoldan tekrarlar). --devam bilinçli bir
    # istisnadır: A-katmanı ve unsat core aynı gerçeğin iki bağımsız
    # ölçümü; çeliştiklerinde çelişkinin kendisi teşhis değeri taşır
    # (örn. A-katmanı hata verirken çözücünün SAT bulması A-katmanı
    # formülünde fazla-kısıtlılık demektir).
    a_hatalari = a_katmani_dogrulama(okul)
    if a_hatalari:
        if args.devam:
            print("UYARI: A-katmanı hataları mevcut; --devam bayrağıyla koşuldu.\n")
        print(f"A-katmanı doğrulama: {len(a_hatalari)} sorun bulundu:")
        for hata in a_hatalari:
            print(f"  - {hata}")
        if not args.devam:
            print(
                "\nÇözücü çalıştırılmadı. Hataları giderin ya da bilinçli "
                "olarak --devam bayrağıyla yeniden çalıştırın."
            )
            sys.exit(1)
        print()

    if args.fizibilite:
        cozucu, km, yerlesim, durum = coz(okul)
        sonuc = None
    else:
        sonuc = kademeli_coz(okul)
        yerlesim = sonuc.yerlesim
        durum = sonuc.durum_ust

    if yerlesim is None and durum == cp_model.INFEASIBLE:
        from tanilama import tanila

        print(tanila(okul))
    elif yerlesim is None:
        print(
            f"Çözüm bulunamadı (durum: "
            f"{cp_model.CpSolver().StatusName(durum)})."
        )
    else:
        print(f"Çözüm bulundu: {len(yerlesim.girdiler)} blok yerleşti.")
        if sonuc is not None:
            print(
                f"Geçiş 1 (üst katman): {sonuc.sure_ust:.1f} sn, ağırlıklı ceza "
                f"{sonuc.kilit_degeri} (kilit). Geçiş 2 (alt katman): "
                f"{sonuc.sure_alt:.1f} sn, ağırlıklı ceza {sonuc.alt_katman_cezasi}."
            )
            if not sonuc.gecis2_kullanildi:
                print(
                    "UYARI: Geçiş 2 süre bütçesinde çözüm üretemedi; Geçiş 1 "
                    "çözümü kullanıldı (üst katman yine sağlandı, alt katman "
                    "iyileştirilmedi)."
                )
        print()
        print(sube_carsaf_metni(okul, yerlesim))
        print()
        print(ogretmen_program_metni(okul, yerlesim))

        print("\n=== Bağımsız denetçi raporu ===")
        sorunlar = cozum_denetle(okul, yerlesim)
        ihlaller = [s for s in sorunlar if not s.startswith("[muaf]")]
        notlar = [s for s in sorunlar if s.startswith("[muaf]")]
        for not_satiri in notlar:
            print(f"  - {not_satiri}")
        if ihlaller:
            for sorun in ihlaller:
                print(f"  - {sorun}")
        else:
            print(
                "İhlal bulunamadı: çakışma yok, muaf olmayan her öğretmende "
                "boş gün var, kapanış ihlali yok, gün/blok ve HDS toplamları "
                "tutarlı."
            )

        if sonuc is not None:
            from karne import cezalari_hesapla, karne_metni, kural_toplamlari, mutabakat

            dokum = cezalari_hesapla(okul, yerlesim)
            print()
            print(
                karne_metni(
                    okul,
                    dokum,
                    ust_katman_cezasi=sonuc.ust_katman_cezasi,
                    alt_katman_cezasi=sonuc.alt_katman_cezasi,
                )
            )

            print("\n=== C-katmanı mutabakat (çözüm anı <-> bağımsız hesap) ===")
            uyusmazliklar = mutabakat(sonuc.kural_cezalari, kural_toplamlari(dokum))
            kilit_ihlali = (
                sonuc.ust_katman_cezasi is not None
                and sonuc.kilit_degeri is not None
                and sonuc.ust_katman_cezasi > sonuc.kilit_degeri
            )
            if kilit_ihlali:
                uyusmazliklar.append(
                    f"KİLİT İHLALİ: nihai çözümün üst katman cezası "
                    f"({sonuc.ust_katman_cezasi}) Geçiş 1 kilidini "
                    f"({sonuc.kilit_degeri}) aşıyor."
                )
            if uyusmazliklar:
                for u in uyusmazliklar:
                    print(f"  - {u}")
                print("KOŞU GEÇERSİZ: yukarıdaki uyuşmazlıklar giderilmeden sonuç kullanılamaz.")
            else:
                print(
                    "Mutabık: kural bazında çözüm anı cezaları bağımsız hesapla "
                    "birebir örtüşüyor; üst katman kilidi korunmuş."
                )
