# ders-dagitim

Türkiye'deki devlet okulları için gönüllü, kâr amacı gütmeyen, açık
kaynak ders dağıtım (timetabling) aracı.

**Tez:** Sorun algoritma değil, dil ve kavram bariyeridir. Bu araç
Türk okul yöneticisinin kavramlarıyla (şube, ders yükü, blok,
karnıyarık) baştan Türkçe kurulur; çözüm bulamadığında nedenini
eyleme dönük Türkçe cümlelerle açıklar. Veri cihazdan çıkmaz.

**Durum:** Geliştirmenin ileri aşaması, plan önünde — çekirdek
tamamlandı. Mimari kesinleşti (veri-yerel, tarayıcı-içi wasm; Karar 20).
Python çekirdeği (deney/) ve TypeScript çevirisi (web/) TAMAMLANDI: veri
modeli, kısıtlar, kademeli çözücü, tanılama, karne ve bağımsız denetçi;
eşdeğerlik altın/ayna testleriyle sabitli (Karar 22-23). Kanıt ekranı
CANLIDA ve uçtan uca çalışıyor: tarayıcıda JSON yükleme → veri özeti →
A-katmanı kapısı → çözüm → karne + iki eksenli (şube/öğretmen) çizelge;
çözümsüzlükte "çözüm yok" yerine eyleme dönük Türkçe tanılama
(Karar 24-27). Yüklenen okul tarayıcıda DÜZENLENEBİLİR (öğretmen, ders
ataması, süre bütçesi) ve tekrar çözülür; taslak cihazda saklanır
(Karar 28). Çözücü süreye sığmazsa da Türkçe konuşur: sert kurallara
uyan ham bir çizelge arar ve ne yapılacağını söyler (Karar 29).
Artık SIFIRDAN okul kurulabiliyor: ızgara, şube, ders, öğretmen ve ders atamaları ekranda girilir; bir şubenin ders tablosu başka şubeye kopyalanır (öğretmenler bilerek boş kalır — ders dağıtımı ayrı adımdır) ve A-katmanı "kalan işler" diliyle neyin eksik, neyin çelişkili olduğunu söyler (Karar 31). Henüz kullanıcıya hazır, cilalı sürüm yok (MVP sürüyor).

**Canlı demo (kanıt ekranı):** https://ders-dagitim.sercansahin4.workers.dev

**Belgeler:** docs/ altında emsal analizi, kısıt envanteri,
adlandırma sözleşmesi, gerçek okul koşu bulguları ve karar kaydı.

**Lisans:** GPL-3.0
