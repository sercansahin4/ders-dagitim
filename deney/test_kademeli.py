"""kademeli_coz iki geçişli akışının ve C-katmanı mutabakatının testleri.

Test stratejisi iki katmanlıdır:
  1. Örnek okulda uçtan uca koşu: sıfır sert ihlal + kilit korunumu +
     çözüm anı / bağımsız hesap mutabakatı.
  2. Matematiksel olarak BAĞLAYICI mikro kurgu: tek öğretmen × tek şube
     × 11 saat. B3 bir günü boşaltır; 11 saat kalan 4 güne sığarken
     günlük sınır 3'te sıfır cezalı dağılım (3+3+3+2) mümkün, sınır
     2'de en az 11 - 2×4 = 3 aşım KAÇINILMAZDIR. Böylece duyarlılık
     testi çözücünün keyfine değil güvercin yuvası ilkesine dayanır.

Çalıştırma: python -m unittest test_kademeli  (deney/ içinden)
Tüm veri uydurmadır.
"""

from __future__ import annotations

import unittest

from ortools.sat.python import cp_model

from coz import cozum_denetle, kademeli_coz
from karne import cezalari_hesapla, kural_toplamlari, mutabakat
from model import (
    Ders,
    DersAtamasi,
    DersKategorisi,
    Izgara,
    KuralAyarlari,
    Ogretmen,
    Okul,
    Sube,
    okul_yukle,
)
from pathlib import Path

ORNEK_OKUL = Path(__file__).parent / "veri" / "ornek_okul.json"


def _mikro_okul() -> Okul:
    """Tek öğretmen × tek şube × 11 saatlik bağlayıcı kurguyu kurar (docstring'deki güvercin yuvası hesabı)."""
    return Okul(
        izgara=Izgara(),
        dersler=[
            Ders("Matematik", DersKategorisi.SAYISAL),
            Ders("Fizik", DersKategorisi.SAYISAL),
            Ders("Kimya", DersKategorisi.SAYISAL),
        ],
        ogretmenler=[
            Ogretmen(ad="Uydurma Derya", verebilecegi_dersler=["Matematik", "Fizik", "Kimya"])
        ],
        subeler=[Sube(ad="9A")],
        ders_atamalari=[
            # Dikkat: B3 bir günü boşaltır, B4 her bloğu ayrı güne dağıtır;
            # bu yüzden hiçbir atamanın blok sayısı 4 uygun günü aşamaz.
            DersAtamasi("Matematik", 4, [1, 1, 1, 1], ["9A"], ["Uydurma Derya"]),
            DersAtamasi("Fizik", 4, [1, 1, 1, 1], ["9A"], ["Uydurma Derya"]),
            DersAtamasi("Kimya", 3, [1, 1, 1], ["9A"], ["Uydurma Derya"]),
        ],
        kural_ayarlari=KuralAyarlari(sure_butcesi_saniye=10.0),
    )


class MikroOkulDuyarlilikTesti(unittest.TestCase):
    """C2 sınır parametresinin gerçekten bağlayıcı olduğunu güvercin yuvası kurgusuyla doğrular."""

    def test_sinir_3_iken_c2_sifir(self):
        """11 saat 4 uygun güne 3+3+3+2 dağılabilir: C2 cezası 0 olmalı, üst katman cezası da 0."""
        okul = _mikro_okul()
        okul.kural_ayarlari.ogretmen_sube_gunluk_toplam = 3
        sonuc = kademeli_coz(okul)
        self.assertIn(sonuc.durum_ust, (cp_model.OPTIMAL, cp_model.FEASIBLE))
        self.assertEqual(sonuc.kural_cezalari["C2"], 0)
        self.assertEqual(sonuc.kilit_degeri, 0)

    def test_sinir_2_iken_c2_tam_uc(self):
        """Sınır 2'de en az 3 aşım kaçınılmaz (11 - 2×4); optimal çözüm tam 3'te kalmalı ve üst katman cezası değişmeli."""
        okul = _mikro_okul()
        okul.kural_ayarlari.ogretmen_sube_gunluk_toplam = 2
        sonuc = kademeli_coz(okul)
        self.assertIn(sonuc.durum_ust, (cp_model.OPTIMAL, cp_model.FEASIBLE))
        self.assertEqual(sonuc.kural_cezalari["C2"], 3)
        self.assertGreater(sonuc.kilit_degeri, 0)

    def test_mikro_okulda_mutabakat_ve_sert_ihlal(self):
        """Mikro kurguda da sert ihlal 0 ve çözüm anı / bağımsız hesap mutabık olmalı."""
        okul = _mikro_okul()
        sonuc = kademeli_coz(okul)
        ihlaller = [
            s for s in cozum_denetle(okul, sonuc.yerlesim) if not s.startswith("[muaf]")
        ]
        self.assertEqual(ihlaller, [])
        bagimsiz = kural_toplamlari(cezalari_hesapla(okul, sonuc.yerlesim))
        self.assertEqual(mutabakat(sonuc.kural_cezalari, bagimsiz), [])


class KapaliKuralTesti(unittest.TestCase):
    """kapali_kurallar kümesinin kurucu, karne ve mutabakat üçlüsünde tutarlı işlediğini doğrular."""

    def test_kapali_kural_terim_uretmez_ve_mutabik_kalir(self):
        """C6 ve C7 kapatılınca terim listeleri boş kalmalı; mutabakat yine tutmalı."""
        okul = _mikro_okul()
        okul.kural_ayarlari.kapali_kurallar = {"C6", "C7"}
        sonuc = kademeli_coz(okul)
        self.assertEqual(sonuc.terimler["C6"], [])
        self.assertEqual(sonuc.terimler["C7"], [])
        self.assertEqual(sonuc.kural_cezalari["C6"], 0)
        bagimsiz = kural_toplamlari(cezalari_hesapla(okul, sonuc.yerlesim))
        self.assertEqual(mutabakat(sonuc.kural_cezalari, bagimsiz), [])


class OrnekOkulKademeliTesti(unittest.TestCase):
    """Örnek okulda uçtan uca kademeli koşunun üç kabul ölçütünü birden doğrular (tek çözümle, süre için)."""

    @classmethod
    def setUpClass(cls):
        cls.okul = okul_yukle(ORNEK_OKUL)
        cls.okul.kural_ayarlari.sure_butcesi_saniye = 12.0
        cls.sonuc = kademeli_coz(cls.okul)

    def test_cozum_var_ve_sert_ihlal_sifir(self):
        """Kademeli koşu çözüm üretmeli ve bağımsız denetçi sıfır sert ihlal görmeli."""
        self.assertIsNotNone(self.sonuc.yerlesim)
        ihlaller = [
            s
            for s in cozum_denetle(self.okul, self.sonuc.yerlesim)
            if not s.startswith("[muaf]")
        ]
        self.assertEqual(ihlaller, [])

    def test_kilit_korunur(self):
        """Nihai çözümün üst katman cezası Geçiş 1'de kilitlenen değeri aşamaz (<= kilit)."""
        self.assertLessEqual(self.sonuc.ust_katman_cezasi, self.sonuc.kilit_degeri)

    def test_mutabakat(self):
        """Çözüm anı toplanan cezalar bağımsız yeniden hesapla kural bazında birebir örtüşmeli."""
        bagimsiz = kural_toplamlari(cezalari_hesapla(self.okul, self.sonuc.yerlesim))
        self.assertEqual(mutabakat(self.sonuc.kural_cezalari, bagimsiz), [])


if __name__ == "__main__":
    unittest.main()
