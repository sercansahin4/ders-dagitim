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


if __name__ == "__main__":
    unittest.main()
