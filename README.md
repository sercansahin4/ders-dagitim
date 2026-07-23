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
(Karar 24-27). Henüz kullanıcıya hazır, cilalı sürüm yok (MVP sürüyor).

**Canlı demo (kanıt ekranı):** https://ders-dagitim.sercansahin4.workers.dev

**Belgeler:** docs/ altında emsal analizi, kısıt envanteri,
adlandırma sözleşmesi ve karar kaydı.

**Lisans:** GPL-3.0
