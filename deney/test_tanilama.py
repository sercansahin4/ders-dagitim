"""Kural-muafiyeti aday sınıfının (Karar 15) testleri -- "Deniz vakası".

Senaryo (Karar 15 gerekçesindeki mutasyon testinin kalıcı hali):
pazartesi-perşembe dış okulda olan bir öğretmen için B3 tanım gereği
sağlanamaz -- bu okulda tek ders bile alsa cuma dolar; cuma boş kalsa
bu okulda hiç dersi olamaz. Karar 15 öncesi hiyerarşi bu vakada
"hiçbir aday çözüm açmadı" ile kapanıyordu (dürüst ama eyleme dönük
değil). Beklenen yeni davranış: tanılama, B3'ün o öğretmene özel
kapatılmasını DOĞRULANMIŞ aday olarak önerir.

Çalıştırma: python -m unittest test_tanilama  (deney/ içinden)
Tüm veri uydurmadır.
"""

from __future__ import annotations

import unittest

from ortools.sat.python import cp_model

from coz import coz
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
from tanilama import tanila, tanilama_modunda_coz

TUM_DILIMLER = list(range(1, 9))


def _deniz_okulu() -> Okul:
    """Pazartesi-perşembe dış okullu 'Uydurma Deniz' + rehber öğretmenli tek şubelik uydurma okulu kurar."""
    return Okul(
        izgara=Izgara(),
        dersler=[
            Ders("Matematik", DersKategorisi.SAYISAL),
            Ders("Rehberlik", DersKategorisi.REHBERLIK_DIGER),
        ],
        ogretmenler=[
            Ogretmen(
                ad="Uydurma Deniz",
                verebilecegi_dersler=["Matematik"],
                kapanislar=[
                    Kapanis(gun=g, dilimler=TUM_DILIMLER, neden=KapanisNedeni.DIS_OKUL)
                    for g in (1, 2, 3, 4)
                ],
            ),
            Ogretmen(ad="Uydurma Rehber", verebilecegi_dersler=["Rehberlik"]),
        ],
        subeler=[Sube(ad="9A", sinif_rehber_ogretmeni="Uydurma Rehber")],
        ders_atamalari=[
            DersAtamasi("Matematik", 2, [2], ["9A"], ["Uydurma Deniz"]),
            DersAtamasi("Rehberlik", 1, [1], ["9A"], ["Uydurma Rehber"]),
        ],
        kural_ayarlari=KuralAyarlari(),
    )


class DenizVakasiTesti(unittest.TestCase):
    """B3'ün yapısal imkânsızlığında muafiyet önerisinin üretildiğini ve doğrulandığını sınar."""

    def test_vaka_gercekten_cozumsuz(self):
        """Ön koşul: muafiyetsiz okul hızlı modda INFEASIBLE olmalı (aksi halde test anlamsız)."""
        _cozucu, _km, yerlesim, durum = coz(_deniz_okulu())
        self.assertIsNone(yerlesim)
        self.assertEqual(durum, cp_model.INFEASIBLE)

    def test_core_b3_iceriyor(self):
        """Unsat core, Deniz'in B3 varsayımını içermeli (öneri motorunun tetiği)."""
        _cozucu, _model, cekirdek = tanilama_modunda_coz(_deniz_okulu())
        b3_ogretmenler = {va.ogretmen_adi for va in cekirdek if va.tur == "B3"}
        self.assertIn("Uydurma Deniz", b3_ogretmenler)

    def test_muafiyet_onerisi_dogrulanmis_olarak_raporda(self):
        """Rapor, B3 muafiyetini 'denendi: program kurulabiliyor' etiketiyle önermeli; Karar 17 tonunda gerekçe içermeli."""
        rapor = tanila(_deniz_okulu())
        self.assertIn("boş gün garantisi kuralını", rapor)
        self.assertIn("bu öğretmene özel kapatmayı", rapor)
        self.assertIn("denendi: program kurulabiliyor", rapor)
        self.assertIn("bilinen bir durumdur", rapor)
        self.assertNotIn("Üretilen hiçbir aday çözüm açmadı", rapor)

    def test_muafiyetli_okul_gercekten_cozuluyor(self):
        """Önerinin vaadi bağımsız doğrulanır: muafiyet elle uygulanınca okul çözülmeli."""
        okul = _deniz_okulu()
        okul.kural_ayarlari.b3_muaf_ogretmenler = {"Uydurma Deniz"}
        _cozucu, _km, yerlesim, durum = coz(okul)
        self.assertIsNotNone(yerlesim)
        self.assertIn(durum, (cp_model.OPTIMAL, cp_model.FEASIBLE))

    def test_zaten_muaf_ogretmene_oneri_uretilmez(self):
        """Muafiyeti zaten açık öğretmen için mükerrer muafiyet adayı üretilmemeli."""
        from tanilama import _kural_muafiyeti_adaylari

        okul = _deniz_okulu()
        okul.kural_ayarlari.b3_muaf_ogretmenler = {"Uydurma Deniz"}
        self.assertEqual(_kural_muafiyeti_adaylari(okul, ["Uydurma Deniz"]), [])


if __name__ == "__main__":
    unittest.main()
