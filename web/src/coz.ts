/**
 * İki katmanlı kademeli çözüm akışı — deney/coz.py çevirisi.
 *
 * Python gerçeklemesi referanstır (Karar 22); eşdeğerlik çözücü altın
 * testleriyle (Karar 23) denetlenir: kural-altkümeli fixture'larda iki
 * geçişin OPTIMAL amaç değerleri Python'a eşit olmak zorundadır,
 * tam-kurallı fixture'da Geçiş 1 kilidi karşılaştırılır ve TS çözümü
 * Python'un bağımsız denetçisinden (karne.py, ts_denetle.py köprüsü)
 * geçer.
 *
 * Akışlar:
 *   - coz(okul): amaç fonksiyonsuz fizibilite çözümü.
 *   - kademeliCoz(okul): iki geçişli kademeli (lexicographic) çözüm
 *     (kararlar.md Karar 5). Geçiş 1 üst katman cezasını (C1-C3) en aza
 *     indirir; değer <= kısıtıyla kilitlenir; Geçiş 2 kalan serbestlikte
 *     alt katman cezasını (C4-C8) en aza indirir.
 *
 * Çözücü parametreleri (Karar 20): tarayıcı varsayılanı TEK işçidir
 * (numSearchWorkers=1) — wasm'da çok işçi tek işçiden yavaş ölçüldü ve
 * tek işçi determinizmi kendiliğinden getirir.
 *
 * Python'dan bilinçli sapmalar (davranış değil, mekanik):
 *   - solve() async'tir; coz/kademeliCoz Promise döndürür.
 *   - ClearHints çağrısı yoktur: or-tools-wasm API'sinde bulunmaz ve
 *     ipuçları zaten tek kez, Geçiş 2'den önce eklenir.
 *   - yalniz_gecis1 parametresi çevrilmedi: o, Python tarafında altın
 *     üreticinin (altin_uret.cozucu_uret) aracıdır; ürün akışında yoktur.
 */

import { CpSolver } from "or-tools-wasm/cp-sat";
import type { LinearExprLike } from "or-tools-wasm/cp-sat";
import { LinearExpr } from "or-tools-wasm/cp-sat";

import type { Okul, Yerlesim } from "./model.js";
import type { CezaTerimi, KisitModeli } from "./kisitlar.js";
import {
  ALT_KATMAN_SIRASI,
  UST_KATMAN_SIRASI,
  baskinlikAgirliklari,
  kurTemelDegiskenler,
  sertKurallariUygula,
  yumusakKurallariKur,
} from "./kisitlar.js";

export const GUN_ADLARI = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma"];

/** Gün indeksini (1-5) Türkçe gün adına çevirir. */
export function gunAdi(gun: number): string {
  return gun >= 1 && gun <= GUN_ADLARI.length ? GUN_ADLARI[gun - 1]! : `Gün ${gun}`;
}

/** Çözücü durum adı (CpSolverStatus_Name karşılığı). */
export type CozumDurumu =
  | "UNKNOWN"
  | "MODEL_INVALID"
  | "FEASIBLE"
  | "INFEASIBLE"
  | "OPTIMAL";

function durumAdi(
  cozucu: CpSolver,
  durum: Awaited<ReturnType<CpSolver["solve"]>>,
): CozumDurumu {
  return cozucu.statusName(durum) as CozumDurumu;
}

/** Çözücünün 1'e sabitlediği basla anahtarlarından Yerlesim nesnesi kurar. */
function yerlesimCikar(okul: Okul, km: KisitModeli, cozucu: CpSolver): Yerlesim {
  const yerlesim: Yerlesim = { girdiler: [] };
  for (const [anahtar, degisken] of km.basla) {
    if (cozucu.value(degisken) === 1) {
      const [aIdx, bIdx, g, s] = anahtar.split("|").map(Number) as [
        number,
        number,
        number,
        number,
      ];
      const uzunluk = okul.ders_atamalari[aIdx]!.blok_deseni[bIdx]!;
      yerlesim.girdiler.push({
        ders_atamasi_index: aIdx,
        gun: g,
        baslangic_dilim: s,
        sure: uzunluk,
      });
    }
  }
  return yerlesim;
}

/** coz() sonucu: çözücü, kısıt modeli, yerleşim (ya da null) ve durum. */
export interface FizibiliteSonucu {
  cozucu: CpSolver;
  km: KisitModeli;
  yerlesim: Yerlesim | null;
  durum: CozumDurumu;
}

/**
 * Modeli HIZLI modda kurar, sert kuralları (B1-B8) ekler ve amaç
 * fonksiyonsuz fizibilite çözümünü çalıştırır.
 *
 * Durum ayrıca döndürülür ki çağıran INFEASIBLE'ı (tanılama modunu
 * tetiklemeli) UNKNOWN/zaman aşımından (tanılama anlamsız) ayırt edebilsin.
 */
export async function coz(okul: Okul): Promise<FizibiliteSonucu> {
  const km = kurTemelDegiskenler(okul);
  sertKurallariUygula(km);

  const cozucu = new CpSolver();
  const durumHam = await cozucu.solve(km.model, {
    maxTimeInSeconds: 60,
    numSearchWorkers: 1,
  });
  const durum = durumAdi(cozucu, durumHam);

  if (durum !== "OPTIMAL" && durum !== "FEASIBLE") {
    return { cozucu, km, yerlesim: null, durum };
  }
  return { cozucu, km, yerlesim: yerlesimCikar(okul, km, cozucu), durum };
}

/**
 * İki geçişli kademeli çözümün çıktısını ve çözüm anı toplanan ceza
 * dökümünü tutar (coz.py KademeliSonuc karşılığı).
 *
 * kuralCezalari: kural başına AĞIRLIKSIZ toplam ceza (karne dili);
 * ust/altKatmanCezasi: katmanın AĞIRLIKLI amaç değeri (kilit dili).
 * gecis2Kullanildi=false ise Geçiş 2 süre bütçesinde çözüm üretemedi
 * ve tüm değerler Geçiş 1 çözümünden okundu.
 */
export interface KademeliSonuc {
  yerlesim: Yerlesim | null;
  durumUst: CozumDurumu;
  durumAlt: CozumDurumu | null;
  ustKatmanCezasi: number | null;
  altKatmanCezasi: number | null;
  kilitDegeri: number | null;
  sureUst: number;
  sureAlt: number;
  gecis2Kullanildi: boolean;
  terimler: Map<string, CezaTerimi[]>;
  agirliklar: Map<string, number>;
  kuralCezalari: Map<string, number>;
}

/** Katman sırasındaki kuralların ağırlıklı ceza ifadesini kurar. */
function katmanIfadesi(
  sira: string[],
  terimler: Map<string, CezaTerimi[]>,
  agirliklar: Map<string, number>,
): LinearExprLike {
  const degiskenler: LinearExprLike[] = [];
  const katsayilar: number[] = [];
  for (const kural of sira) {
    for (const t of terimler.get(kural) ?? []) {
      degiskenler.push(t.degisken);
      katsayilar.push(agirliklar.get(kural)! * t.katsayi);
    }
  }
  return LinearExpr.weightedSum(degiskenler, katsayilar);
}

/** Katman sırasındaki kuralların ağırlıklı cezasını nihai çözümden okur. */
function katmanCezasiOku(
  sira: string[],
  terimler: Map<string, CezaTerimi[]>,
  agirliklar: Map<string, number>,
  nihai: CpSolver,
): number {
  let toplam = 0;
  for (const kural of sira) {
    for (const t of terimler.get(kural) ?? []) {
      toplam += agirliklar.get(kural)! * t.katsayi * nihai.value(t.degisken);
    }
  }
  return toplam;
}

/**
 * Modeli HIZLI modda kurar, sert kuralları ve C1-C8 ceza terimlerini ekler,
 * iki geçişli kademeli çözümü çalıştırır.
 *
 * Onaylı uygulama kararları: katman içi öncelik baskınlık ağırlığıyla
 * (kisitlar.baskinlikAgirliklari), kilit <= kısıtıyla, süre bütçesi
 * üst/alt geçişlere kural_ayarlari.ust_katman_sure_orani ile bölünür
 * (Geçiş 1 erken biterse artan süre Geçiş 2'ye devreder), cezalar
 * çözüm anında etiketli değişkenlerden toplanır.
 */
export async function kademeliCoz(okul: Okul): Promise<KademeliSonuc> {
  const km = kurTemelDegiskenler(okul);
  sertKurallariUygula(km);
  const terimler = yumusakKurallariKur(km);

  const agirliklarUst = baskinlikAgirliklari(UST_KATMAN_SIRASI, terimler);
  const agirliklarAlt = baskinlikAgirliklari(ALT_KATMAN_SIRASI, terimler);
  const agirliklar = new Map([...agirliklarUst, ...agirliklarAlt]);

  const ustIfade = katmanIfadesi(UST_KATMAN_SIRASI, terimler, agirliklarUst);
  const altIfade = katmanIfadesi(ALT_KATMAN_SIRASI, terimler, agirliklarAlt);

  const butce = okul.kural_ayarlari.sure_butcesi_saniye;
  const oran = okul.kural_ayarlari.ust_katman_sure_orani;

  // Geçiş 1: üst katman.
  const cozucuUst = new CpSolver();
  km.model.minimize(ustIfade);
  let baslangic = performance.now();
  const durumUstHam = await cozucuUst.solve(km.model, {
    maxTimeInSeconds: butce * oran,
    numSearchWorkers: 1,
  });
  const sureUst = (performance.now() - baslangic) / 1000;
  const durumUst = durumAdi(cozucuUst, durumUstHam);

  if (durumUst !== "OPTIMAL" && durumUst !== "FEASIBLE") {
    return {
      yerlesim: null,
      durumUst,
      durumAlt: null,
      ustKatmanCezasi: null,
      altKatmanCezasi: null,
      kilitDegeri: null,
      sureUst,
      sureAlt: 0,
      gecis2Kullanildi: false,
      terimler,
      agirliklar,
      kuralCezalari: new Map(),
    };
  }

  const kilitDegeri = Math.round(cozucuUst.objectiveValue());

  // Kilit (<=) + Geçiş 1 çözümü Geçiş 2'ye başlangıç ipucu olarak verilir
  // (kilidi zaten sağlayan hazır bir çözüm: Geçiş 2 hiç değilse onunla başlar).
  km.model.add(LinearExpr.from(ustIfade).le(kilitDegeri));
  for (const degisken of km.basla.values()) {
    km.model.addHint(degisken, cozucuUst.value(degisken));
  }

  // Geçiş 2: alt katman, kalan sürenin tamamıyla (devir kuralı).
  const cozucuAlt = new CpSolver();
  km.model.minimize(altIfade);
  baslangic = performance.now();
  const durumAltHam = await cozucuAlt.solve(km.model, {
    maxTimeInSeconds: Math.max(butce - sureUst, 1.0),
    numSearchWorkers: 1,
  });
  const sureAlt = (performance.now() - baslangic) / 1000;
  const durumAlt = durumAdi(cozucuAlt, durumAltHam);

  const gecis2Kullanildi = durumAlt === "OPTIMAL" || durumAlt === "FEASIBLE";
  const nihai = gecis2Kullanildi ? cozucuAlt : cozucuUst;

  // Ceza dökümü çözüm anındaki etiketli değişkenlerden okunur. Tüm ceza
  // değişkenleri çift yönlü kanallı olduğundan (bkz. kisitlar.ts C-katmanı
  // notu) hangi geçişten okunursa okunsun fiili ihlali gösterirler.
  const kuralCezalari = new Map<string, number>();
  for (const [kural, kuralTerimleri] of terimler) {
    kuralCezalari.set(
      kural,
      kuralTerimleri.reduce(
        (toplam, t) => toplam + t.katsayi * nihai.value(t.degisken),
        0,
      ),
    );
  }
  const ustKatmanCezasi = katmanCezasiOku(
    UST_KATMAN_SIRASI,
    terimler,
    agirliklarUst,
    nihai,
  );
  const altKatmanCezasi = katmanCezasiOku(
    ALT_KATMAN_SIRASI,
    terimler,
    agirliklarAlt,
    nihai,
  );

  return {
    yerlesim: yerlesimCikar(okul, km, nihai),
    durumUst,
    durumAlt,
    ustKatmanCezasi,
    altKatmanCezasi,
    kilitDegeri,
    sureUst,
    sureAlt,
    gecis2Kullanildi,
    terimler,
    agirliklar,
    kuralCezalari,
  };
}
