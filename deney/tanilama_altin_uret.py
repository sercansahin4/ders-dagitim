"""Tanılama altın çıktılarını üretir (Karar 22: Python referans).

Yalnız DETERMİNİSTİK parçalar altına bağlanır: iyelik eki, gün listesi
metni ve sabit (elle kurulmuş) çekirdeklerin cümle çevirileri. Çözücüye
bağlı davranışlar (unsat core içeriği, öneri doğrulama) altın DEĞİLDİR;
onlar iki tarafta aynalanmış davranış testleriyle korunur
(test_tanilama.py <-> web/test/tanilama.test.ts) çünkü core minimaldir
ama tekil değildir -- bayt düzeyinde sabitlemek yalancı kırmızı üretir.

Çalıştırma (deney/ içinden): python3 tanilama_altin_uret.py
Çıktı: veri/altin/tanilama_beklenen.json (elle düzenlemek yasaktır).
"""

from __future__ import annotations

import json
from pathlib import Path

from kisitlar import VarsayimAnahtari
from model import KapanisNedeni
from tanilama import (
    _gunleri_metne_cevir,
    _iyelik_eki,
    _muafiyet_metni,
    _neden_onerilmiyor_bolumu,
    _teknik_referans,
    cekirdek_cumleleri,
)
from test_tanilama import _deniz_okulu

IYELIK_ADLARI = [
    "Aylin Kaptan",
    "Uydurma Deniz",
    "Mehmet Oğuz",
    "Nur Gül",
    "Şükrü Öz",
    "Ali",
    "Ayşe Arı",
    "Gökçe Sönmez",
    "O06",
    "Ümmü Sıdıka",
]

GUN_LISTELERI = [[1], [1, 2], [1, 3, 5], [2, 4], [5, 4, 3], []]


def _va(tur, **kw):
    """Altın üretimi için literal'siz (None) varsayım anahtarı kurar (cümle çevirisi literal'i hiç kullanmaz)."""
    return VarsayimAnahtari(tur=tur, literal=None, **kw)


def cekirdek_senaryolari(okul):
    """Elle kurulmuş, deterministik çekirdek senaryolarını (ad -> varsayım listesi) döndürür."""
    return {
        "b3_ve_dis_okul": [
            _va("B3", ogretmen_adi="Uydurma Deniz"),
            _va("KAPANIS", ogretmen_adi="Uydurma Deniz", neden=KapanisNedeni.DIS_OKUL),
        ],
        "b4_tek_atama": [_va("B4", atama_index=0)],
        "b6_kapanissiz": [_va("B6", ogretmen_adi="Uydurma Rehber")],
        "kapanis_tek_basina": [
            _va("KAPANIS", ogretmen_adi="Uydurma Deniz", neden=KapanisNedeni.DIS_OKUL),
        ],
    }


if __name__ == "__main__":
    okul = _deniz_okulu()
    senaryolar = cekirdek_senaryolari(okul)

    beklenen = {
        "iyelik": {ad: _iyelik_eki(ad) for ad in IYELIK_ADLARI},
        "gun_listeleri": {
            json.dumps(gunler): _gunleri_metne_cevir(gunler) for gunler in GUN_LISTELERI
        },
        "cekirdekler": {
            ad: {
                "cumleler": cekirdek_cumleleri(okul, cekirdek),
                "teknik_referans": _teknik_referans(okul, cekirdek),
                "neden_onerilmiyor": _neden_onerilmiyor_bolumu(cekirdek),
            }
            for ad, cekirdek in senaryolar.items()
        },
        "muafiyet_metinleri": {
            "tekil": _muafiyet_metni(okul, ["Uydurma Deniz"]),
            "coklu": _muafiyet_metni(okul, ["Uydurma Deniz", "Uydurma Rehber"]),
        },
    }

    hedef = Path(__file__).parent / "veri" / "altin" / "tanilama_beklenen.json"
    hedef.write_text(
        json.dumps(beklenen, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Yazıldı: {hedef} ({len(beklenen['iyelik'])} iyelik, "
          f"{len(beklenen['cekirdekler'])} çekirdek senaryosu)")
