"""Karne + bağımsız denetçi altın çıktılarını üretir (Karar 22).

karne.cezalari_hesapla ve coz.cozum_denetle SAF fonksiyonlardır
(Okul + Yerlesim -> metin/sayı); bu yüzden bayt-bayt altına bağlanırlar.

İki fixture:
  1. elyapimi_ihlaller — ELLE kurulmuş, bilerek bozuk yerleşim: C1-C8'in
     TÜMÜ + dört sert ihlal türü (şube çakışması, B2 kapanış, B4 aynı
     gün, HDS uyuşmazlığı) + bir [muaf] notu tetiklenir. Çözücü hiç
     koşmaz -> tam deterministik. Kapsam garantisi test tarafında ayrıca
     doğrulanır (her C kuralının toplamı > 0 olmalı).
  2. ornek_okul_cozum — örnek okulun kademeli çözümünden KAYDEDİLMİŞ bir
     yerleşim (çözüm bir kez üretilir, sonra veri olarak sabittir;
     çözücü determinizmi altını etkilemez).

Çalıştırma (deney/ içinden): python3 karne_altin_uret.py
Çıktılar: veri/altin/karne_girdiler/*.json + veri/altin/karne_beklenen.json
(elle düzenlemek yasaktır).
"""

from __future__ import annotations

import json
from pathlib import Path

from coz import cozum_denetle, kademeli_coz
from karne import cezalari_hesapla, karne_metni, kural_toplamlari
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
    Yerlesim,
    YerlesimGirdisi,
    okul_to_dict,
    okul_yukle,
)

TUM_DILIMLER = list(range(1, 9))


def _elyapimi_okul() -> Okul:
    """Kapsam fixture'ının okulunu kurar (tamamen uydurma)."""
    return Okul(
        izgara=Izgara(),
        dersler=[
            Ders("Matematik", DersKategorisi.SAYISAL),
            Ders("Fizik", DersKategorisi.SAYISAL),
            Ders("Edebiyat", DersKategorisi.SOZEL),
            Ders("Beden", DersKategorisi.SANAT_SPOR),
            Ders("Rehberlik", DersKategorisi.REHBERLIK_DIGER),
        ],
        ogretmenler=[
            Ogretmen(
                ad="Uydurma Ayla",
                verebilecegi_dersler=["Matematik", "Fizik"],
                bos_gun_tercihi=1,
                kapanislar=[
                    Kapanis(gun=5, dilimler=TUM_DILIMLER, neden=KapanisNedeni.KISISEL_TERCIH)
                ],
            ),
            Ogretmen(
                ad="Uydurma Baran",
                verebilecegi_dersler=["Edebiyat", "Beden"],
                bos_gun_tercihi=5,
            ),
            Ogretmen(ad="Uydurma Rehber", verebilecegi_dersler=["Rehberlik"]),
        ],
        subeler=[
            Sube(ad="9A", sinif_rehber_ogretmeni="Uydurma Rehber"),
            Sube(ad="9B", sinif_rehber_ogretmeni="Uydurma Rehber"),
        ],
        ders_atamalari=[
            DersAtamasi("Matematik", 4, [2, 2], ["9A"], ["Uydurma Ayla"]),
            DersAtamasi("Fizik", 2, [2], ["9A"], ["Uydurma Ayla"]),
            DersAtamasi("Edebiyat", 2, [2], ["9A"], ["Uydurma Baran"]),
            DersAtamasi("Beden", 2, [2], ["9A"], ["Uydurma Baran"]),
            DersAtamasi("Rehberlik", 1, [1], ["9A"], ["Uydurma Rehber"]),
            DersAtamasi("Matematik", 3, [2, 1], ["9B"], ["Uydurma Ayla"]),
        ],
        kural_ayarlari=KuralAyarlari(b3_muaf_ogretmenler={"Uydurma Rehber"}),
    )


# Elle yerleşim — her satırın tetiklediği ihlal yorumda:
ELYAPIMI_GIRDILER = [
    (0, 1, 1, 2),  # Ayla pzt s1-2 Mat: C1 (tercih günü dolu), C2/C5 zemini
    (0, 1, 7, 2),  # a0'ın İKİNCİ bloğu da pazartesi -> B4 ihlali; s5-6 pencere -> C6
    (1, 1, 3, 2),  # Fizik s3-4: Mat'la ardışık farklı SAYISAL -> C7; C5 zinciri
    (4, 1, 4, 1),  # Rehberlik 9A pzt s4: Fizik'le ŞUBE ÇAKIŞMASI; Rehber pzt 1 saat -> C4
    #              (s3'e değil s4'e: s2-s3 Mat-Fizik ardışıklığı C7 için korunmalı)
    (2, 3, 1, 2),  # Edebiyat çarş s1-2
    (2, 4, 5, 2),  # a2'nin fazladan bloğu -> HDS uyuşmazlığı (4 != 2)
    (3, 3, 6, 2),  # Beden çarş s6-7: Baran'a s3-5 arası 3'lük pencere -> C3 + C6
    (5, 5, 1, 2),  # Ayla CUMA s1-2: kişisel tercih kapanışı ihlali (B2)
    (5, 2, 8, 1),  # Ayla salı s8 tek saat -> C4; sayısal son dilim -> C8
]


def _yerlesim(girdiler) -> Yerlesim:
    return Yerlesim(
        girdiler=[
            YerlesimGirdisi(ders_atamasi_index=a, gun=g, baslangic_dilim=s, sure=u)
            for (a, g, s, u) in girdiler
        ]
    )


def _yerlesim_to_dict(yerlesim: Yerlesim) -> dict:
    return {
        "girdiler": [
            {
                "ders_atamasi_index": g.ders_atamasi_index,
                "gun": g.gun,
                "baslangic_dilim": g.baslangic_dilim,
                "sure": g.sure,
            }
            for g in yerlesim.girdiler
        ]
    }


def _beklenen(okul: Okul, yerlesim: Yerlesim) -> dict:
    dokum = cezalari_hesapla(okul, yerlesim)
    return {
        "kural_toplamlari": kural_toplamlari(dokum),
        "satirlar": {
            kural: [s.aciklama for s in satirlar] for kural, satirlar in dokum.items()
        },
        "karne_metni": karne_metni(okul, dokum),
        "denetci": cozum_denetle(okul, yerlesim),
    }


if __name__ == "__main__":
    kok = Path(__file__).parent / "veri" / "altin"
    girdi_kok = kok / "karne_girdiler"
    girdi_kok.mkdir(parents=True, exist_ok=True)

    beklenen: dict = {}

    # 1. Elyapımı ihlaller.
    okul1 = _elyapimi_okul()
    yer1 = _yerlesim(ELYAPIMI_GIRDILER)
    (girdi_kok / "elyapimi_okul.json").write_text(
        json.dumps(okul_to_dict(okul1), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (girdi_kok / "elyapimi_yerlesim.json").write_text(
        json.dumps(_yerlesim_to_dict(yer1), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    beklenen["elyapimi_ihlaller"] = _beklenen(okul1, yer1)

    # 2. Örnek okulun çözülmüş hali (çözüm bir kez üretilir, veri olarak donar).
    okul2 = okul_yukle(Path(__file__).parent / "veri" / "ornek_okul.json")
    okul2.kural_ayarlari.sure_butcesi_saniye = 12.0
    sonuc = kademeli_coz(okul2)
    assert sonuc.yerlesim is not None, "örnek okul çözülemedi -- altın üretilemez"
    (girdi_kok / "ornek_okul_yerlesim.json").write_text(
        json.dumps(_yerlesim_to_dict(sonuc.yerlesim), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    beklenen["ornek_okul_cozum"] = _beklenen(okul2, sonuc.yerlesim)

    (kok / "karne_beklenen.json").write_text(
        json.dumps(beklenen, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    ozet = {k: v["kural_toplamlari"] for k, v in beklenen.items()}
    print("Yazıldı. Kural toplamları:", json.dumps(ozet, ensure_ascii=False))
    sifir = [
        k
        for k, v in beklenen["elyapimi_ihlaller"]["kural_toplamlari"].items()
        if v == 0
    ]
    print("elyapimi'de sıfır kalan kurallar (boş olmalı):", sifir)
    print("elyapimi denetçi satırı:", len(beklenen["elyapimi_ihlaller"]["denetci"]))
