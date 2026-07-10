"""Sentetik büyük okul veri üreteci.

Gerçek okul verisi kullanmadan, çözücüyü ÖLÇEK açısından sınamak için
(mimari kararı #2'nin deney girdisi) parametrik sentetik Anadolu lisesi
üretir. Tamamen uydurmadır; hiçbir gerçek kişi/okul verisi içermez ve
içeremez (Karar 11).

Bilinçli sadelik: gerçek okulun başat riski müsaitlik DARLIĞIDIR ama bu
deneyin sorusu darlık değil PERFORMANS. Bu yüzden kapanışlar kasıtlı
gevşek tutulur (yalnız tam-gün dışOkul; kısmi kapanış yok) -- üretilen
okul çözülebilir olmalı ki süre ölçümü anlamlı olsun. Darlık senaryosu
gerçek okulda zaten doğrulandı (tanılama koşuları).

Determinizm: aynı (sube_sayisi, seed) çifti her zaman aynı okulu üretir.

Çalıştırma: python sentetik_uret.py 43 --seed 42 --kaydet /tmp/s43.json
"""

from __future__ import annotations

import random

from model import (
    Ders,
    DersAtamasi,
    DersKategorisi,
    Izgara,
    Kapanis,
    KapanisNedeni,
    KuralAyarlari,
    Ogretmen,
    Okul,
    Sube,
)

# Şube başına haftalık ders tablosu: (ders, saat, blok deseni, kategori, branş).
# Toplam 38 saat (40 dilimlik ızgarada 2 dilim boş kalır: çözüm uzayı
# tamamen kilitlenmesin diye bilinçli pay).
DERS_TABLOSU = [
    ("Matematik", 6, [2, 2, 2], DersKategorisi.SAYISAL, "Matematik"),
    ("Turk Dili ve Edebiyati", 5, [2, 2, 1], DersKategorisi.SOZEL, "Edebiyat"),
    ("Ingilizce", 4, [2, 2], DersKategorisi.DIL, "Ingilizce"),
    ("Fizik", 2, [2], DersKategorisi.SAYISAL, "Fizik"),
    ("Kimya", 2, [2], DersKategorisi.SAYISAL, "Kimya"),
    ("Biyoloji", 2, [2], DersKategorisi.SAYISAL, "Biyoloji"),
    ("Tarih", 2, [2], DersKategorisi.SOZEL, "Tarih"),
    ("Cografya", 2, [2], DersKategorisi.SOZEL, "Cografya"),
    ("Din Kulturu", 2, [2], DersKategorisi.SOZEL, "Din"),
    ("Felsefe", 2, [2], DersKategorisi.SOZEL, "Felsefe"),
    ("Almanca", 2, [2], DersKategorisi.DIL, "Almanca"),
    ("Beden Egitimi", 2, [2], DersKategorisi.SANAT_SPOR, "Beden"),
    ("Muzik", 1, [1], DersKategorisi.SANAT_SPOR, "Muzik"),
    ("Gorsel Sanatlar", 1, [1], DersKategorisi.SANAT_SPOR, "Gorsel"),
    ("Secmeli Matematik", 2, [2], DersKategorisi.SAYISAL, "Matematik"),
    ("Rehberlik", 1, [1], DersKategorisi.REHBERLIK_DIGER, None),
]


def _sube_adlari(sube_sayisi: int) -> list[str]:
    """9A, 9B, ... 12X biçiminde, sınıflara dengeli dağıtılmış şube adları üretir."""
    adlar = []
    for i in range(sube_sayisi):
        sinif = 9 + (i % 4)
        harf = chr(ord("A") + (i // 4))
        adlar.append(f"{sinif}{harf}")
    return sorted(adlar)


def sentetik_okul_uret(
    sube_sayisi: int,
    seed: int = 42,
    dis_okul_orani: float = 0.25,
    hedef_yuk: int = 22,
) -> Okul:
    """Parametrik sentetik okul kurar: branş bazlı öğretmen havuzu, kapasiteye saygılı yük dağıtımı, tam-gün dışOkul kapanışları, boş gün tercihleri.

    Kapasite güvencesi: kapanışsız öğretmende atanabilir kapasite
    40 - 8 (B3 rezervi) = 32; tek tam-gün dışOkul kapanışlı öğretmende
    40 - 8 - 8 = 24. Yük tavanı bu değerlerin altında tutulur ki üretilen
    okul A-katmanından her zaman geçsin.
    """
    rnd = random.Random(seed)
    izgara = Izgara()
    subeler = [Sube(ad=ad) for ad in _sube_adlari(sube_sayisi)]

    dersler = [
        Ders(ad=ad, kategori=kategori) for (ad, _s, _b, kategori, _br) in DERS_TABLOSU
    ]

    # Branş başına toplam talep -> öğretmen sayısı (yük tavanına göre).
    brans_talebi: dict[str, int] = {}
    for (_ad, saat, _b, _k, brans) in DERS_TABLOSU:
        if brans is None:
            continue  # Rehberlik: sınıf rehber öğretmenine gider (B5).
        brans_talebi[brans] = brans_talebi.get(brans, 0) + saat * sube_sayisi

    ogretmenler: list[Ogretmen] = []
    brans_ogretmenleri: dict[str, list[Ogretmen]] = {}
    sayac = 0
    for brans, talep in sorted(brans_talebi.items()):
        kisi = max(1, -(-talep // hedef_yuk))  # tavana yuvarlanmış bölme
        grup = []
        for _ in range(kisi):
            sayac += 1
            ogretmen = Ogretmen(
                ad=f"S{sayac:03d}",
                verebilecegi_dersler=[
                    ad for (ad, _s, _b, _k, br) in DERS_TABLOSU if br == brans
                ],
            )
            # Tam-gün dışOkul kapanışı (oran kadar öğretmende, 1 gün).
            if rnd.random() < dis_okul_orani:
                gun = rnd.randint(1, izgara.gun_sayisi)
                ogretmen.kapanislar.append(
                    Kapanis(
                        gun=gun,
                        dilimler=list(range(1, izgara.dilim_sayisi + 1)),
                        neden=KapanisNedeni.DIS_OKUL,
                    )
                )
            if rnd.random() < 0.6:
                acik_gunler = [
                    g
                    for g in range(1, izgara.gun_sayisi + 1)
                    if g not in {k.gun for k in ogretmen.kapanislar}
                ]
                ogretmen.bos_gun_tercihi = rnd.choice(acik_gunler)
            grup.append(ogretmen)
            ogretmenler.append(ogretmen)
        brans_ogretmenleri[brans] = grup

    def kapasite(o: Ogretmen) -> int:
        kapanis = sum(len(k.dilimler) for k in o.kapanislar)
        return izgara.gun_sayisi * izgara.dilim_sayisi - kapanis - izgara.dilim_sayisi

    # Ders atamaları: her şube × ders; branşın en az yüklü ve kapasitesi
    # yeten öğretmenine verilir (deterministik: ad sırası eşitlik bozar).
    yuk: dict[str, int] = {o.ad: 0 for o in ogretmenler}
    atamalar: list[DersAtamasi] = []
    for sube in subeler:
        for (ad, saat, blok, _k, brans) in DERS_TABLOSU:
            if brans is None:
                continue
            adaylar = sorted(
                brans_ogretmenleri[brans], key=lambda o: (yuk[o.ad], o.ad)
            )
            secilen = next(
                (o for o in adaylar if yuk[o.ad] + saat <= kapasite(o)), None
            )
            if secilen is None:
                # Kapasite tavanına takıldı: branşa yeni öğretmen aç
                # (üretilen okul HER ZAMAN A-katmanından geçmeli).
                sayac_yeni = len(ogretmenler) + 1
                secilen = Ogretmen(
                    ad=f"S{sayac_yeni:03d}",
                    verebilecegi_dersler=list(
                        brans_ogretmenleri[brans][0].verebilecegi_dersler
                    ),
                )
                brans_ogretmenleri[brans].append(secilen)
                ogretmenler.append(secilen)
                yuk[secilen.ad] = 0
            yuk[secilen.ad] += saat
            atamalar.append(
                DersAtamasi(
                    ders=ad,
                    haftalik_saat=saat,
                    blok_deseni=list(blok),
                    subeler=[sube.ad],
                    ogretmenler=[secilen.ad],
                )
            )

    # Rehberlik: şubede en çok saat taşıyan öğretmen sınıf rehber öğretmeni
    # olur (B5); kapasitesi 1 saati kaldırmalı, yoksa sıradaki alınır.
    for sube in subeler:
        sube_ogretmen_saati: dict[str, int] = {}
        for a in atamalar:
            if a.subeler == [sube.ad]:
                sube_ogretmen_saati[a.ogretmenler[0]] = (
                    sube_ogretmen_saati.get(a.ogretmenler[0], 0) + a.haftalik_saat
                )
        rehber_adaylari = sorted(
            sube_ogretmen_saati, key=lambda ad: (-sube_ogretmen_saati[ad], ad)
        )
        ogretmen_sozlugu = {o.ad: o for o in ogretmenler}
        rehber = next(
            ad
            for ad in rehber_adaylari
            if yuk[ad] + 1 <= kapasite(ogretmen_sozlugu[ad])
        )
        yuk[rehber] += 1
        sube.sinif_rehber_ogretmeni = rehber
        if "Rehberlik" not in ogretmen_sozlugu[rehber].verebilecegi_dersler:
            ogretmen_sozlugu[rehber].verebilecegi_dersler.append("Rehberlik")
        atamalar.append(
            DersAtamasi(
                ders="Rehberlik",
                haftalik_saat=1,
                blok_deseni=[1],
                subeler=[sube.ad],
                ogretmenler=[rehber],
            )
        )

    return Okul(
        izgara=izgara,
        dersler=dersler,
        ogretmenler=ogretmenler,
        subeler=subeler,
        ders_atamalari=atamalar,
        kural_ayarlari=KuralAyarlari(),
    )


if __name__ == "__main__":
    import argparse

    from model import a_katmani_dogrulama, okul_kaydet

    parser = argparse.ArgumentParser(description="Sentetik okul üretir.")
    parser.add_argument("sube_sayisi", type=int)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--kaydet", help="Üretilen okulu bu JSON yoluna yaz.")
    args = parser.parse_args()

    okul = sentetik_okul_uret(args.sube_sayisi, seed=args.seed)
    toplam_saat = sum(a.haftalik_saat for a in okul.ders_atamalari)
    print(
        f"Üretildi: {len(okul.subeler)} şube, {len(okul.ogretmenler)} öğretmen, "
        f"{len(okul.ders_atamalari)} atama, {toplam_saat} saat."
    )
    hatalar = a_katmani_dogrulama(okul)
    print(f"A-katmanı: {len(hatalar)} sorun.")
    for h in hatalar[:10]:
        print(" -", h)
    if args.kaydet:
        okul_kaydet(okul, args.kaydet)
        print(f"Kaydedildi: {args.kaydet}")
