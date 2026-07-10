#!/bin/bash
# Tarayıcı wasm thread testini tek komutla hazırlar ve başlatır (macOS).
# Kullanım:  cd deney/tarayici-testi && bash calistir.sh
set -e
cd "$(dirname "$0")"

echo "== 1/4 Node kontrolü =="
if ! command -v node >/dev/null 2>&1; then
  echo "HATA: Node.js kurulu değil. https://nodejs.org adresinden LTS sürümü kur,"
  echo "sonra bu betiği yeniden çalıştır."
  exit 1
fi
echo "Node $(node --version) bulundu."

echo "== 2/4 Paket kurulumu (ilk seferde ~330 MB, birkaç dakika) =="
if [ ! -d node_modules/or-tools-wasm ]; then
  npm install
else
  echo "or-tools-wasm zaten kurulu, atlandı."
fi

echo "== 3/4 Test modelleri =="
if [ ! -f s43_fizibilite.pb ]; then
  python3 model_uret.py
else
  echo "Modeller zaten üretilmiş, atlandı."
fi

echo "== 4/4 Sunucu başlıyor =="
echo "Tarayıcı otomatik açılacak. Testler bitince bu pencerede Ctrl+C ile durdur."
( sleep 2 && open "http://localhost:8437" ) &
python3 sunucu.py
