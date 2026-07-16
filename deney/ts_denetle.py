"""TS çözümlerinin çözücüden bağımsız Python denetimi (Karar 23 köprüsü).

`npm test` (web/) çözüm üreten her altın fixture için TS çözümünü
veri/altin/ts_cozumler/<ad>.json dosyasına yazar. Bu betik o dosyaları
okur ve HİÇBİR CP-SAT nesnesine dokunmadan, yalnız Okul + Yerlesim
üzerinden denetler:

  1. Sert kurallar: coz.cozum_denetle (çakışma, B2/B3/B4, HDS toplamı).
  2. Karne mutabakatı: TS'in çözüm anında topladığı kural cezaları,
     karne.cezalari_hesapla'nın bağımsız yeniden hesabıyla kural bazında
     birebir tutmalı (kisitlar.ts çevirisi ile karne.py ikizinin
     ayrışmadığının kanıtı).
  3. Kilit koruması: nihai çözümün üst katman ağırlıklı cezası Geçiş 1
     kilidini aşamaz.

Amaç değeri eşitliği bu betiğin işi DEĞİLDİR — o, web/test/
cozucu-altin.test.ts altın testlerinde yapılır. İkisi birlikte tam
doğrulama akışını oluşturur (web/README.md).

Çalıştırma: python3 ts_denetle.py   (deney/ içinden; npm test sonrası)
Çıkış kodu: 0 = tüm dosyalar mutabık, 1 = en az bir ihlal/uyuşmazlık.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from coz import cozum_denetle
from karne import cezalari_hesapla, kural_toplamlari, mutabakat
from model import Yerlesim, YerlesimGirdisi, okul_yukle

DENEY = Path(__file__).parent
TS_COZUM_DIZINI = DENEY / "veri" / "altin" / "ts_cozumler"


def dosya_denetle(yol: Path) -> list[str]:
    """Tek bir TS çözüm dosyasını denetler; sorun listesi döndürür (boş = mutabık)."""
    veri = json.loads(yol.read_text(encoding="utf-8"))
    okul = okul_yukle(DENEY / veri["girdi"])
    yerlesim = Yerlesim(
        girdiler=[
            YerlesimGirdisi(
                ders_atamasi_index=g["ders_atamasi_index"],
                gun=g["gun"],
                baslangic_dilim=g["baslangic_dilim"],
                sure=g["sure"],
            )
            for g in veri["yerlesim"]["girdiler"]
        ]
    )

    sorunlar: list[str] = []

    # 1. Sert kurallar ("[muaf]" önekli satırlar bilgi notudur, ihlal değil).
    for satir in cozum_denetle(okul, yerlesim):
        if not satir.startswith("[muaf]"):
            sorunlar.append(f"sert kural: {satir}")

    # 2. Karne mutabakatı: TS çözüm-anı cezaları <-> bağımsız yeniden hesap.
    dokum = cezalari_hesapla(okul, yerlesim)
    ts_cezalar = {k: int(c) for k, c in veri["kural_cezalari"].items()}
    for uyusmazlik in mutabakat(ts_cezalar, kural_toplamlari(dokum)):
        sorunlar.append(f"mutabakat: {uyusmazlik}")

    # 3. Kilit koruması.
    ust = veri.get("ust_katman_cezasi")
    kilit = veri.get("kilit_degeri")
    if ust is not None and kilit is not None and ust > kilit:
        sorunlar.append(
            f"KİLİT İHLALİ: nihai çözümün üst katman cezası ({ust}) "
            f"Geçiş 1 kilidini ({kilit}) aşıyor."
        )

    return sorunlar


def main() -> int:
    dosyalar = sorted(TS_COZUM_DIZINI.glob("*.json"))
    if not dosyalar:
        print(
            f"TS çözüm dosyası bulunamadı ({TS_COZUM_DIZINI}).\n"
            f"Önce web/ içinde `npm test` çalıştırın (köprü dosyalarını o üretir)."
        )
        return 1

    toplam_sorun = 0
    for yol in dosyalar:
        sorunlar = dosya_denetle(yol)
        if sorunlar:
            toplam_sorun += len(sorunlar)
            print(f"{yol.name}: {len(sorunlar)} sorun")
            for sorun in sorunlar:
                print(f"  - {sorun}")
        else:
            print(f"{yol.name}: mutabık")

    if toplam_sorun:
        print(
            f"\nKOŞU GEÇERSİZ: {toplam_sorun} sorun -- TS çevirisi ile Python "
            f"referansı ayrışmış olabilir; giderilmeden sonuç kullanılamaz."
        )
        return 1
    print(f"\n{len(dosyalar)} TS çözümü Python denetçisinden geçti.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
