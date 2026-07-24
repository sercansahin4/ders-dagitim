/**
 * Taslağın cihaz-yerel kalıcılığı — IndexedDB (Karar 28). Veri-yerel tezi
 * (Karar 2/20, KVKK): taslak cihazdan ÇIKMAZ; IndexedDB tarayıcıda kalır.
 * Amaç refresh'te iş kaybını önlemek — "kurulumsuz tarayıcı" tezini güçlendirir.
 *
 * Not: IndexedDB structured clone Set'i doğrudan saklar; bu yüzden Okul
 * NESNESİ (kural_ayarlari'ndaki Set'ler dahil) serileştirilmeden yazılır.
 * Serileştirme (Set→sıralı liste) yalnız worker'a gönderirken ve JSON dışa
 * aktarırken gerekir (serialize.okulKaydetMetne) — kalıcılıkta gerekmez.
 *
 * DİKKAT: Bu dosya tarayıcıda (IndexedDB) uçtan uca DOĞRULANMADI; saf mantık
 * gibi düğüm testinden geçemez. Claude Code, elle tarayıcı senaryosunda
 * (kaydet → refresh → geri yükle) doğrulamalı.
 */
import type { Okul } from "./model.js";

const VERITABANI = "ders-dagitim";
const DEPO = "taslak";
const ANAHTAR = "aktif";

function veritabaniniAc(): Promise<IDBDatabase> {
  return new Promise((coz, reddet) => {
    const istek = indexedDB.open(VERITABANI, 1);
    istek.onupgradeneeded = () => {
      const db = istek.result;
      if (!db.objectStoreNames.contains(DEPO)) db.createObjectStore(DEPO);
    };
    istek.onsuccess = () => coz(istek.result);
    istek.onerror = () => reddet(istek.error);
  });
}

/** Aktif taslağı cihaza yazar (Okul nesnesi doğrudan; Set'ler korunur). */
export async function taslakKaydet(okul: Okul): Promise<void> {
  const db = await veritabaniniAc();
  await new Promise<void>((coz, reddet) => {
    const islem = db.transaction(DEPO, "readwrite");
    islem.objectStore(DEPO).put(okul, ANAHTAR);
    islem.oncomplete = () => coz();
    islem.onerror = () => reddet(islem.error);
  });
  db.close();
}

/** Kayıtlı taslağı döndürür; yoksa null. */
export async function taslakYukle(): Promise<Okul | null> {
  const db = await veritabaniniAc();
  const sonuc = await new Promise<Okul | null>((coz, reddet) => {
    const istek = db.transaction(DEPO, "readonly").objectStore(DEPO).get(ANAHTAR);
    istek.onsuccess = () => coz((istek.result as Okul | undefined) ?? null);
    istek.onerror = () => reddet(istek.error);
  });
  db.close();
  return sonuc;
}

/** Kayıtlı taslağı siler (kullanıcı "yeni okul" derse). */
export async function taslakSil(): Promise<void> {
  const db = await veritabaniniAc();
  await new Promise<void>((coz, reddet) => {
    const islem = db.transaction(DEPO, "readwrite");
    islem.objectStore(DEPO).delete(ANAHTAR);
    islem.oncomplete = () => coz();
    islem.onerror = () => reddet(islem.error);
  });
  db.close();
}
