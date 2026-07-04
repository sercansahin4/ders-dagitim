# Adlandırma Sözleşmesi

Dayanak: Karar 7 (kararlar.md). Bu belge kod içi adlandırmanın
üç kuralını tanımlar.

## Kural 1 — Sözcük seçimi

Kavram alan sözlüğünde varsa veya kullanıcı arayüzünde görünecekse
Türkçe; genel yazılım kavramıysa İngilizce. Karışık ad meşrudur:
`karniyarik_cezasi_ekle(model, ...)`.

Gri durumlar için katman kuralı: alan modeli ve kısıt katmanı Türkçe
ağırlıklı; CP-SAT'ı saran adaptör katmanı İngilizce ağırlıklı
kalabilir. Bu ayrım, kodun hangi bölümünün "bizim alanımız", hangi
bölümünün "kütüphane dünyası" olduğunu görsel olarak da işaretler.

## Kural 2 — ASCII katlama

Türkçe karakterler tanımlayıcılarda ASCII'ye katlanır:
ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u. (`öğretmen` → `ogretmen`)
Kod ASCII'dir; dokümantasyon, yorum satırları ve kullanıcıya görünen
her metin tam Türkçe'dir.

## Kural 3 — Biçim, ekosistem standardını izler

Sözcükler Türkçe, casing dilin kendisinindir.

- Python (PEP 8): sınıf `DersAtamasi`, alan/fonksiyon `blok_deseni`,
  modül `ders_atamasi.py`
- TypeScript (Aşama 3'te): `blokDeseni` — sözcük değişmez, biçim
  değişir.

## Çekirdek sözlük (v0 veri modeli)

| Kavram | Python adı |
|---|---|
| Izgara | `Izgara` |
| Ders | `Ders` (alan: `kategori`) |
| Öğretmen | `Ogretmen` (alan: `bos_gun_tercihi`) |
| Kapanış | `Kapanis` (alan: `neden`) |
| Şube | `Sube` (alan: `sinif_rehber_ogretmeni`) |
| Ders ataması | `DersAtamasi` (alanlar: `haftalik_saat`, `blok_deseni`, `sabit_dilimler`, `subeler`, `ogretmenler`) |
| Yerleşim (çıktı) | `Yerlesim` |
| Kural ayarları | `KuralAyarlari` |
| Karnıyarık/pencere | `karniyarik` / `pencere` |

Kapanış nedeni enum: `DIS_OKUL | BOS_GUN | IDARI | KISISEL_TERCIH`

Ders kategorisi enum: `SAYISAL | SOZEL | DIL | SANAT_SPOR | REHBERLIK_DIGER`
