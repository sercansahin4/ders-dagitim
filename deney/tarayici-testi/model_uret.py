"""Tarayıcı testinin çözeceği modelleri üretir (bu klasöre .pb olarak yazar).

İki model: 43 şubelik sentetik fizibilite (performans sorusu) ve
çözümsüz mikro model tanılama modunda (assumptions/unsat core sorusu).
Gerçek veri KULLANILMAZ; .pb dosyaları depoya girmez (.gitignore).

Çalıştırma (bu klasörün içinden): python3 model_uret.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sentetik_uret import sentetik_okul_uret  # noqa: E402
from kisitlar import kur_temel_degiskenler, sert_kurallari_uygula  # noqa: E402
from test_tanilama import _deniz_okulu  # noqa: E402

buraya = Path(__file__).resolve().parent

okul = sentetik_okul_uret(43, hedef_yuk=19)
km = kur_temel_degiskenler(okul)
sert_kurallari_uygula(km)
km.model.ExportToFile(str(buraya / "s43_fizibilite.pb"))

km2 = kur_temel_degiskenler(_deniz_okulu(), tanilama_modu=True)
sert_kurallari_uygula(km2)
km2.model.ExportToFile(str(buraya / "deniz_tanilama.pb"))

print("Üretildi: s43_fizibilite.pb, deniz_tanilama.pb")
