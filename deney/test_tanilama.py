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
        self.assertIn("Boş gün garantisi kuralını", rapor)
        self.assertIn("Uydurma Deniz öğretmeni için", rapor)
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
        """Muafiyeti zaten açık öğretmen yinelemeli döngüde aday sayılmamalı (mükerrer öneri yok, sıfır deneme)."""
        from tanilama import _muafiyet_onerisi_uret

        okul = _deniz_okulu()
        okul.kural_ayarlari.b3_muaf_ogretmenler = {"Uydurma Deniz"}
        oneri, deneme = _muafiyet_onerisi_uret(okul, ["Uydurma Deniz"])
        self.assertIsNone(oneri)
        self.assertEqual(deneme, 0)


def _cift_deniz_okulu() -> Okul:
    """İKİ öğretmenin de B3'ünün yapısal olarak imkânsız olduğu kurgu (gerçek okul vakasının uydurma ikizi: Karar 17'deki iki öğretmen).

    Tekil muafiyet yetmez (diğerinin B3'ü hâlâ imkânsız); çözümsüzlük
    ancak ikisi birlikte muaf tutulunca kalkar -- birleşik adayın testi.
    """
    dis_okul = [
        Kapanis(gun=g, dilimler=TUM_DILIMLER, neden=KapanisNedeni.DIS_OKUL)
        for g in (1, 2, 3, 4)
    ]
    return Okul(
        izgara=Izgara(),
        dersler=[
            Ders("Matematik", DersKategorisi.SAYISAL),
            Ders("Fizik", DersKategorisi.SAYISAL),
            Ders("Rehberlik", DersKategorisi.REHBERLIK_DIGER),
        ],
        ogretmenler=[
            Ogretmen(
                ad="Uydurma Deniz",
                verebilecegi_dersler=["Matematik"],
                kapanislar=list(dis_okul),
            ),
            Ogretmen(
                ad="Uydurma Derin",
                verebilecegi_dersler=["Fizik"],
                kapanislar=list(dis_okul),
            ),
            Ogretmen(ad="Uydurma Rehber", verebilecegi_dersler=["Rehberlik"]),
        ],
        subeler=[Sube(ad="9A", sinif_rehber_ogretmeni="Uydurma Rehber")],
        ders_atamalari=[
            DersAtamasi("Matematik", 2, [2], ["9A"], ["Uydurma Deniz"]),
            DersAtamasi("Fizik", 2, [2], ["9A"], ["Uydurma Derin"]),
            DersAtamasi("Rehberlik", 1, [1], ["9A"], ["Uydurma Rehber"]),
        ],
        kural_ayarlari=KuralAyarlari(),
    )


class BirlesikMuafiyetTesti(unittest.TestCase):
    """İki öğretmenli yapısal B3 vakasında birleşik muafiyet adayının davranışını sınar."""

    def test_tekil_muafiyet_yetmiyor(self):
        """Ön koşul: tek öğretmenin muafiyeti çözüm açmamalı (diğerinin B3'ü hâlâ imkânsız)."""
        okul = _cift_deniz_okulu()
        okul.kural_ayarlari.b3_muaf_ogretmenler = {"Uydurma Deniz"}
        _c, _k, yerlesim, durum = coz(okul)
        self.assertIsNone(yerlesim)
        self.assertEqual(durum, cp_model.INFEASIBLE)

    def test_rapor_birlesik_muafiyeti_dogrulanmis_oneriyor(self):
        """Rapor, İKİ öğretmenin birlikte muaf tutulmasını doğrulanmış aday olarak içermeli.

        Kritik ayrıntı: unsat core minimal olduğundan başlangıçta yalnız
        BİR öğretmeni gösterir; ikincisi ancak yinelemeli teşhisle
        (hipotetik muafiyet -> yeniden teşhis) bulunur (Karar 21).
        """
        rapor = tanila(_cift_deniz_okulu())
        self.assertIn("birlikte kapatmayı", rapor)
        self.assertIn("Uydurma Deniz", rapor)
        self.assertIn("Uydurma Derin", rapor)
        self.assertIn("denendi: program kurulabiliyor", rapor)
        self.assertNotIn("Üretilen hiçbir aday çözüm açmadı", rapor)


if __name__ == "__main__":
    unittest.main()
