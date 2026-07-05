"""model.py A-katmanı kapasite hesabının birim testleri.

Regresyon arka planı: _bos_gun_icin_rezerve_edilecek_acik_dilim bir
süre docstring'inin tersini yapıyordu -- dışOkul-dışı günler arasından
EN AZ kapanışlı günü (min) seçip en pahalı boş günü rezerve ediyordu.
Bu bugu görünmez kılan veri boşluğu, dışOkul-dışı günlerinde kapanışı
olan öğretmen profilinin hiç test edilmemesiydi (sentetik/örnek
verideki tüm kapanışlar ya dışOkul günündeydi ya hiç yoktu; min == max
olduğundan iki formül ayırt edilemiyordu). Buradaki iki profil o
boşluğu kapatır. Tüm veri uydurmadır.

Çalıştırma: python -m unittest test_model  (deney/ içinden)
"""

from __future__ import annotations

import unittest

from model import (
    Izgara,
    Kapanis,
    KapanisNedeni,
    KuralAyarlari,
    Ogretmen,
    Okul,
    _bos_gun_icin_rezerve_edilecek_acik_dilim,
    _kural_ayarlari_from_dict,
    _kural_ayarlari_to_dict,
    _ogretmen_kapasitesi,
)


def _bos_okul(ogretmenler: list[Ogretmen]) -> Okul:
    """Yalnız kapasite hesabının gerektirdiği alanlarla uydurma bir Okul kurar (5 gün × 8 dilim)."""
    return Okul(
        izgara=Izgara(),
        dersler=[],
        ogretmenler=ogretmenler,
        subeler=[],
        ders_atamalari=[],
        kural_ayarlari=KuralAyarlari(),
    )


TUM_DILIMLER = list(range(1, 9))


class BosGunRezerviTesti(unittest.TestCase):
    """B3 boş gün rezervinin 'en ucuz uygun gün' üzerinden hesaplandığını doğrular."""

    def test_tamamen_kapali_iki_gun_rezerv_sifir(self):
        """(a) kişiselTercih ile TAMAMEN kapalı 2 günü olan öğretmen.

        Boş gün garantisi zaten tamamen kapalı bir güne binebilir; ek
        rezerv 0 olmalı. Eski (min'li) formül tamamen açık bir günü
        seçip 8 dilim rezerve ediyor ve kapasiteyi 24 yerine 16
        hesaplayarak yanlış pozitif kapasite hatası veriyordu.
        """
        ogretmen = Ogretmen(
            ad="Uydurma Ayşe",
            kapanislar=[
                Kapanis(gun=1, dilimler=TUM_DILIMLER, neden=KapanisNedeni.KISISEL_TERCIH),
                Kapanis(gun=2, dilimler=TUM_DILIMLER, neden=KapanisNedeni.KISISEL_TERCIH),
            ],
        )
        okul = _bos_okul([ogretmen])
        self.assertEqual(_bos_gun_icin_rezerve_edilecek_acik_dilim(okul, ogretmen), 0)
        # 40 toplam - 16 kapanış - 0 rezerv = 24 atanabilir dilim.
        self.assertEqual(_ogretmen_kapasitesi(okul, ogretmen), 24)

    def test_kismen_kapali_gun_rezerv_acik_dilim_kadar(self):
        """(b) KISMEN kapalı (5 dilim) günü olan öğretmen.

        En çok kapanışlı uygun gün 5 dilim kapalı; boş gün o güne biner
        ve yalnız kalan 3 açık dilim ek rezerve edilir.
        """
        ogretmen = Ogretmen(
            ad="Uydurma Burak",
            kapanislar=[
                Kapanis(gun=3, dilimler=[1, 2, 3, 4, 5], neden=KapanisNedeni.KISISEL_TERCIH),
            ],
        )
        okul = _bos_okul([ogretmen])
        self.assertEqual(_bos_gun_icin_rezerve_edilecek_acik_dilim(okul, ogretmen), 3)
        # 40 toplam - 5 kapanış - 3 rezerv = 32 atanabilir dilim.
        self.assertEqual(_ogretmen_kapasitesi(okul, ogretmen), 32)


class B3MuafiyetiTesti(unittest.TestCase):
    """Karar 17: b3_muaf_ogretmenler kümesinin kapasite hesabına ve JSON çevrimine etkisini doğrular."""

    def test_muaf_ogretmende_bos_gun_rezervi_dusulmez(self):
        """Muaf öğretmende rezerv 0: kapasite yalnız kapanışlarla azalır.

        3 günü dışOkul ile tamamen kapalı profil: normalde kalan 2 açık
        günden biri (8 dilim) rezerve edilir; muafiyetle edilmez.
        """
        ogretmen = Ogretmen(
            ad="Uydurma Cemil",
            kapanislar=[
                Kapanis(gun=g, dilimler=TUM_DILIMLER, neden=KapanisNedeni.DIS_OKUL)
                for g in (3, 4, 5)
            ],
        )
        okul = _bos_okul([ogretmen])
        # Muafiyet yokken: 40 - 24 kapanış - 8 rezerv = 8.
        self.assertEqual(_ogretmen_kapasitesi(okul, ogretmen), 8)
        # Muafiyetle: 40 - 24 kapanış - 0 rezerv = 16.
        okul.kural_ayarlari.b3_muaf_ogretmenler = {"Uydurma Cemil"}
        self.assertEqual(_ogretmen_kapasitesi(okul, ogretmen), 16)

    def test_json_cevrimi_gidis_donus(self):
        """b3_muaf_ogretmenler alanı to_dict/from_dict çevriminde korunur; eksik alan boş küme verir."""
        kural = KuralAyarlari(b3_muaf_ogretmenler={"Uydurma Ayşe", "Uydurma Burak"})
        sozluk = _kural_ayarlari_to_dict(kural)
        self.assertEqual(
            sozluk["b3_muaf_ogretmenler"], ["Uydurma Ayşe", "Uydurma Burak"]
        )
        geri = _kural_ayarlari_from_dict(sozluk)
        self.assertEqual(geri.b3_muaf_ogretmenler, {"Uydurma Ayşe", "Uydurma Burak"})
        # Eski JSON'larda alan yok: varsayılan boş küme.
        self.assertEqual(_kural_ayarlari_from_dict({}).b3_muaf_ogretmenler, set())


if __name__ == "__main__":
    unittest.main()
