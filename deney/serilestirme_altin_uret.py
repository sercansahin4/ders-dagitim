"""Okul serileştirme (okul_to_dict) altın çıktısını üretir (Karar 22).

okul_to_dict SAF bir fonksiyondur (Okul -> JSON'a yazılabilir sözlük); bu
yüzden TypeScript ikizi (model.ts okulToDict) bu altına yapısal olarak
bağlanır. Girdi örnek okuldur; bir kez from_dict'ten geçirilip yeniden
serileştirilerek KANONİK biçim (alan sırası + Set'lerin sıralı listesi)
sabitlenir.

Bir test kırıldıysa iki gerçekleme ayrışmıştır: önce hangi tarafın kasıtlı
değiştiğine karar ver, iki tarafı eşitle, python3 serilestirme_altin_uret.py
ile altını yenile, birlikte commit'le. Beklenen dosyayı elle düzenlemek
yasaktır.

Çalıştırma (deney/ içinden): python3 serilestirme_altin_uret.py
Çıktı: veri/altin/okul_serilestirme_beklenen.json
"""

from __future__ import annotations

import json
from pathlib import Path

from model import okul_from_dict, okul_to_dict

KOK = Path(__file__).resolve().parent
girdi = json.loads((KOK / "veri" / "ornek_okul.json").read_text(encoding="utf-8"))
beklenen = okul_to_dict(okul_from_dict(girdi))
hedef = KOK / "veri" / "altin" / "okul_serilestirme_beklenen.json"
hedef.write_text(json.dumps(beklenen, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"yazıldı: {hedef.relative_to(KOK)}")
