# Tarayıcı wasm thread testi

Amaç: Karar 20'nin açık şartını (a) kendi bilgisayarında, gerçek
tarayıcıda kapatmak — CP-SAT wasm çözücüsü tarayıcıda iş parçacıklarını
kullanabiliyor mu ve 43 şubelik sentetik okulu kaç saniyede çözüyor?

Arka plan: docs/wasm-duman-testi.md. Node ölçümünde çözücü tek iş
parçacığında kaldı; tarayıcı, COOP/COEP başlıklı sayfalarda
SharedArrayBuffer ile çok iş parçacığına izin verir — bu test onu ölçer.

## Ön koşullar (bir kez)

1. **Node.js** (npm dahil): kurulu değilse https://nodejs.org — LTS sürüm.
   Kontrol: Terminal'de `node --version`.
2. Bu klasörde paket kurulumu (~330 MB, birkaç dakika):

   ```
   cd deney/tarayici-testi
   npm install
   ```

3. Test modellerini üret (depodaki Python ortamıyla):

   ```
   python3 model_uret.py
   ```

## Testi çalıştırma

```
python3 sunucu.py
```

Tarayıcıda http://localhost:8437 aç. Sayfanın üstündeki tanılama
kutusunda **crossOriginIsolated: true** görmelisin (false ise sonuçlar
anlamsız — sayfayı mutlaka sunucu.py üzerinden aç, dosyadan değil).

Üç düğmeyi sırayla çalıştır:

1. **Assumptions testi** — saniyeler içinde INFEASIBLE + unsat core
   boyutu vermeli (Node'da doğrulandı; tarayıcıda teyit).
2. **43 şube — tek işçi** — referans çizgisi (Node: 35+ sn'de çözümsüz).
3. **43 şube — çok işçi** — asıl soru. Native çok işçili referans:
   ~9 sn. Tarayıcı bunun 2-5 katına kadar kalırsa tarayıcı-yerel plan
   büyük okullar için de onaylanır; tek işçi davranışından farksızsa
   B planı (karma yapı) büyük okullar için devreye girer.

Kayıt kutusundaki çıktının tamamını kopyalayıp Claude'a yapıştır.

## Notlar

- `.pb` model dosyaları ve `node_modules` depoya girmez (.gitignore).
- Sayfa hiçbir veriyi hiçbir yere göndermez; her şey yereldir.
- Bu sayfa gerçek tarayıcıda henüz koşulmadı (sandbox'ta tarayıcı yok);
  ilk koşuda bir hata çıkarsa kayıt kutusundaki mesajla birlikte bildir.
