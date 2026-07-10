"""Unsat core'un Türkçe eylem cümlesine çevrimi.

Çözücünün bulamadığı bir çözüm için ürettiği unsat core çıktısının,
okul yöneticisinin ne yapması gerektiğini anlatan eyleme dönük
Türkçe cümlelere dönüştürüldüğü modül.

Akış (cevrim-tablosu.md §4, kararlar.md Karar 13): coz.py'deki HIZLI
mod çözümü INFEASIBLE dönerse, model TANILAMA modunda (kapanışlar
varsayım anahtarlı kısıt olarak) yeniden kurulur ve yeniden çözülür;
CP-SAT'ın sufficient_assumptions_for_infeasibility listesi buradaki
şablonlarla Türkçe rapora çevrilir. Hedef okuyucu: teknik geçmişi
olmayan bir okul müdür yardımcısı -- "unsat core" gibi jargon rapor
metninde hiç geçmez.

Gevşetme önerisi motoru (kararlar.md Karar 14, kisit-envanteri.md §5):
öneriler unsat core'un GİRDİLERİNDEN değil, core'da adı geçen
öğretmen/derslerin BAĞLAMINDAN üretilir; her aday okulun hipotetik bir
kopyasına uygulanıp HIZLI modda yeniden çözülür -- rapora yalnız
çözüm açan adaylar girer.
"""

from __future__ import annotations

import time
from copy import deepcopy
from dataclasses import dataclass

from ortools.sat.python import cp_model

from kisitlar import VarsayimAnahtari, b2_kapanislar, kur_temel_degiskenler, sert_kurallari_uygula
from model import DersKategorisi, KapanisNedeni, Okul, _ogretmen_kapasitesi, a_katmani_dogrulama

_GUN_ADLARI_KUCUK = ["pazartesi", "salı", "çarşamba", "perşembe", "cuma"]

# Görev C.2: enum adları ("dışOkul", "kişiselTercih"...) kullanıcı
# metnine hiç sızmaz; bunlar yerine okunaklı Türkçe karşılıkları kullanılır.
_NEDEN_KULLANICI_METNI = {
    KapanisNedeni.DIS_OKUL: "dış okul görevi (başka okuldaki dersleri)",
    KapanisNedeni.BOS_GUN: "planlı boş gün düzenlemesi",
    KapanisNedeni.IDARI: "idari görev",
    KapanisNedeni.KISISEL_TERCIH: "kişisel tercih günü/saatleri",
}

# Bir atama başına en fazla kaç aday üretilsin -- tüm basamakların
# 12'lik toplam denemeye sığabilmesi için (Görev B). Atama başına
# sınırlamak (tüm listeyi sonda kesmek yerine) core bağlamındaki HER
# atamanın en az bir şansı olmasını garanti eder -- aksi halde context
# içindeki ilk atama tüm bütçeyi tüketip diğerleri hiç denenmeyebilir.
_MAKS_ADAY_ATAMA_BASINA_DESEN = 2
_MAKS_ADAY_ATAMA_BASINA_YUK_DEVRI = 2
_MAKS_TOPLAM_DENEME = 12
_MAKS_EK_DENEME_IDARI = 3


_KALIN_DUZ = set("aı")
_INCE_DUZ = set("ei")
_KALIN_YUVARLAK = set("ou")
_INCE_YUVARLAK = set("öü")
_UNLULER = _KALIN_DUZ | _INCE_DUZ | _KALIN_YUVARLAK | _INCE_YUVARLAK


def _iyelik_eki(ad: str) -> str:
    """Bir özel adı, Türkçe ünlü uyumuna uygun iyelik ekiyle birleştirir (örn. 'Aylin Kaptan' -> \"Aylin Kaptan'ın\").

    Şablon cümlelerde sabit bir "'nin" eki her adla doğru kaynaşmaz
    (ör. "Kaptan'nin" hatalıdır, doğrusu "Kaptan'ın"); bu yüzden son
    kelimenin son ünlüsüne bakılarak doğru ek hesaplanır.
    """
    son_kelime = ad.split()[-1] if ad.split() else ad
    son_unlu = next((h for h in reversed(son_kelime.lower()) if h in _UNLULER), None)

    if son_unlu in _KALIN_DUZ:
        ek = "ın"
    elif son_unlu in _KALIN_YUVARLAK:
        ek = "un"
    elif son_unlu in _INCE_YUVARLAK:
        ek = "ün"
    else:
        ek = "in"

    if son_kelime[-1].lower() in _UNLULER:
        return f"{ad}'n{ek}"
    return f"{ad}'{ek}"


def _gun_adi_kucuk(gun: int) -> str:
    """Gün indeksini (1-5) küçük harfli Türkçe gün adına çevirir (cümle içi kullanım için)."""
    return _GUN_ADLARI_KUCUK[gun - 1] if 1 <= gun <= len(_GUN_ADLARI_KUCUK) else f"{gun}. gün"


def _gunleri_metne_cevir(gunler: list[int]) -> str:
    """Gün indekslerini 've' bağlacıyla birleşik okunaklı bir Türkçe listeye çevirir."""
    adlar = [_gun_adi_kucuk(g) for g in sorted(set(gunler))]
    if not adlar:
        return ""
    if len(adlar) == 1:
        return adlar[0]
    return ", ".join(adlar[:-1]) + " ve " + adlar[-1]


def _kapanis_gunlerini_bul(okul: Okul, ogretmen_adi: str, neden: KapanisNedeni) -> list[int]:
    """Bir öğretmenin belirli nedenli kapanışlarının düştüğü günleri (tekrarsız) döndürür."""
    ogretmen = next(o for o in okul.ogretmenler if o.ad == ogretmen_adi)
    return sorted({k.gun for k in ogretmen.kapanislar if k.neden == neden})


def tanilama_modunda_coz(
    okul: Okul,
) -> tuple[cp_model.CpSolver, cp_model.CpModel, list[VarsayimAnahtari]]:
    """Modeli TANILAMA modunda kurar, çözer ve (varsa) çözümsüzlüğe yeten varsayım anahtarlarını döndürür."""
    km = kur_temel_degiskenler(okul, tanilama_modu=True)
    sert_kurallari_uygula(km)

    cozucu = cp_model.CpSolver()
    cozucu.parameters.max_time_in_seconds = 60
    durum = cozucu.Solve(km.model)

    if durum != cp_model.INFEASIBLE:
        return cozucu, km.model, []

    index_to_varsayim = {va.literal.Index(): va for va in km.varsayimlar}
    cekirdek_index = cozucu.SufficientAssumptionsForInfeasibility()
    cekirdek = [index_to_varsayim[i] for i in cekirdek_index if i in index_to_varsayim]
    return cozucu, km.model, cekirdek


# --- Ana teşhis cümleleri (kural kodları burada geçmez; bkz. _teknik_referans) --


def _b4_uygun_gunler(okul: Okul, atama_index: int) -> list[int]:
    """Bir atamanın en uzun bloğu için, mevcut kapanışlara göre en az bir geçerli başlangıcı olan günleri döndürür."""
    atama = okul.ders_atamalari[atama_index]
    en_uzun = max(atama.blok_deseni)
    gunler = list(range(1, okul.izgara.gun_sayisi + 1))
    dilimler = list(range(1, okul.izgara.dilim_sayisi + 1))
    gecerli = b2_kapanislar(
        okul, atama, en_uzun, gunler, dilimler, kapanislari_budama_olarak_uygula=True
    )
    return sorted({g for (g, _s) in gecerli})


def _b3_cumlesi(okul: Okul, ogretmen_adi: str, kapanis_nedenleri: list[KapanisNedeni]) -> str:
    """B3 (boş gün garantisi) varsayımını, varsa eşlik eden kapanış nedenleriyle birlikte Türkçe cümleye çevirir."""
    if not kapanis_nedenleri:
        return (
            f"{_iyelik_eki(ogretmen_adi)} haftada en az bir tam boş günü garanti "
            f"edilemiyor: mevcut ders yüküyle hiçbir gün tamamen boşaltılamıyor."
        )
    parcalar = [
        f"{_gunleri_metne_cevir(_kapanis_gunlerini_bul(okul, ogretmen_adi, neden))} "
        f"günlerindeki {_NEDEN_KULLANICI_METNI[neden]}"
        for neden in kapanis_nedenleri
    ]
    return (
        f"{_iyelik_eki(ogretmen_adi)} boş gün garantisi, "
        + " ve ".join(parcalar)
        + " ile birlikte sağlanamıyor."
    )


def _b6_cumlesi(okul: Okul, ogretmen_adi: str, kapanis_nedenleri: list[KapanisNedeni]) -> str:
    """B6 (4 saatten uzun bekleme yasağı) varsayımını, varsa eşlik eden kapanış nedenleriyle birlikte Türkçe cümleye çevirir."""
    if not kapanis_nedenleri:
        return (
            f"{ogretmen_adi} için bir günde 4 saatten uzun boş bekleme oluşmaması "
            f"kuralı sağlanamıyor: mevcut ders dağılımıyla bazı günlerde art arda "
            f"çok uzun boşluk çıkıyor."
        )
    parcalar = [
        f"{_gunleri_metne_cevir(_kapanis_gunlerini_bul(okul, ogretmen_adi, neden))} "
        f"günlerindeki {_NEDEN_KULLANICI_METNI[neden]}"
        for neden in kapanis_nedenleri
    ]
    return (
        f"{ogretmen_adi} için uzun bekleme yasağı, "
        + " ve ".join(parcalar)
        + " ile birlikte sağlanamıyor."
    )


def _b4_cumlesi(okul: Okul, atama_index: int) -> str:
    """B4 (her blok ayrı güne) varsayımını, somut gün sayılarıyla Türkçe cümleye çevirir."""
    atama = okul.ders_atamalari[atama_index]
    gerekli = len(atama.blok_deseni)
    uygun_gunler = _b4_uygun_gunler(okul, atama_index)
    if uygun_gunler:
        gun_ekI = f" ({_gunleri_metne_cevir(uygun_gunler)})"
    else:
        gun_ekI = ""
    return (
        f"{atama.ders} dersinin ({', '.join(atama.subeler)}) bloklarının her biri "
        f"ayrı bir güne düşmeli: {gerekli} ayrı gün gerekiyor; yalnız "
        f"{len(uygun_gunler)} uygun gün var{gun_ekI}."
    )


def cekirdek_cumleleri(okul: Okul, cekirdek: list[VarsayimAnahtari]) -> list[str]:
    """Çözümsüzlüğe yeten varsayım anahtarları kümesini, her biri bir neden cümlesi olacak şekilde Türkçeye çevirir."""
    b3_ogretmenler = sorted({va.ogretmen_adi for va in cekirdek if va.tur == "B3"})
    b6_ogretmenler = sorted({va.ogretmen_adi for va in cekirdek if va.tur == "B6"})
    b4_atamalar = sorted({va.atama_index for va in cekirdek if va.tur == "B4"})
    kapanis_gruplari = [(va.ogretmen_adi, va.neden) for va in cekirdek if va.tur == "KAPANIS"]

    kullanilanlar: set[tuple[str, KapanisNedeni]] = set()
    cumleler: list[str] = []

    for ogretmen_adi in b3_ogretmenler:
        eslesenler = [n for (o, n) in kapanis_gruplari if o == ogretmen_adi]
        cumleler.append(_b3_cumlesi(okul, ogretmen_adi, eslesenler))
        kullanilanlar.update((ogretmen_adi, n) for n in eslesenler)

    for ogretmen_adi in b6_ogretmenler:
        eslesenler = [
            n
            for (o, n) in kapanis_gruplari
            if o == ogretmen_adi and (o, n) not in kullanilanlar
        ]
        cumleler.append(_b6_cumlesi(okul, ogretmen_adi, eslesenler))
        kullanilanlar.update((ogretmen_adi, n) for n in eslesenler)

    for a_idx in b4_atamalar:
        cumleler.append(_b4_cumlesi(okul, a_idx))

    for (ogretmen_adi, neden) in kapanis_gruplari:
        if (ogretmen_adi, neden) in kullanilanlar:
            continue
        gunler = _gunleri_metne_cevir(_kapanis_gunlerini_bul(okul, ogretmen_adi, neden))
        cumleler.append(
            f"{_iyelik_eki(ogretmen_adi)} {gunler} günlerindeki "
            f"{_NEDEN_KULLANICI_METNI[neden]}, bu programı imkânsız kılan "
            f"nedenlerden biri."
        )

    return cumleler


def _teknik_referans(okul: Okul, cekirdek: list[VarsayimAnahtari]) -> str:
    """Görev C.1: kural kodlarını (B3/B4/B6) ana cümlelerden çıkarıp tek bir referans satırında toplar."""
    parcalar = []
    for va in cekirdek:
        if va.tur == "B3":
            parcalar.append(f"B3 ({va.ogretmen_adi})")
        elif va.tur == "B6":
            parcalar.append(f"B6 ({va.ogretmen_adi})")
        elif va.tur == "B4":
            atama = okul.ders_atamalari[va.atama_index]
            parcalar.append(f"B4 ({atama.ders}, {', '.join(atama.subeler)})")
    return "Teknik referans: " + "; ".join(parcalar) if parcalar else ""


def _neden_onerilmiyor_bolumu(cekirdek: list[VarsayimAnahtari]) -> list[str]:
    """dışOkul ve boşGün nedenli kapanışların hiç önerilmeme gerekçesini açıklar."""
    kapanis_gruplari = sorted(
        {(va.ogretmen_adi, va.neden) for va in cekirdek if va.tur == "KAPANIS"}
    )
    satirlar: list[str] = []
    for ogretmen_adi, neden in kapanis_gruplari:
        if neden == KapanisNedeni.DIS_OKUL:
            satirlar.append(
                f"{ogretmen_adi} öğretmeninin dış okul görevi hiç öneri listesine "
                f"alınmadı: bu, başka bir okula karşı verilmiş bir taahhüttür."
            )
        elif neden == KapanisNedeni.BOS_GUN:
            satirlar.append(
                f"{ogretmen_adi} öğretmeninin planlı boş günü hiç öneri listesine "
                f"alınmadı: bu günün korunması zaten amaçlanan sonuçtur."
            )
    return satirlar


# --- Gevşetme önerisi motoru (Karar 14): bağlam-tabanlı aday üretimi + doğrulama ---


@dataclass
class OneriAdayi:
    """Bir gevşetme önerisi adayını -- açıklaması ve hipotetik olarak değiştirilmiş okul kopyasıyla -- tutar."""

    basamak: int
    aciklama: str
    okul: Okul


def _desen_adaylari(okul: Okul, atama_indeksleri: list[int]) -> list[OneriAdayi]:
    """Basamak 1: core bağlamındaki atamalar için blok birleştirme ve bölme adayları üretir (örn. {2}->{1,1}).

    Atama başına en fazla _MAKS_ADAY_ATAMA_BASINA_DESEN aday üretilir
    (tüm listeyi sonda kesmek yerine): aksi halde context'teki ilk
    atama tüm bütçeyi tüketip diğer atamalar hiç denenmeden kalabilir.
    """
    adaylar: list[OneriAdayi] = []
    for a_idx in atama_indeksleri:
        atama = okul.ders_atamalari[a_idx]
        desen = atama.blok_deseni
        uretilenler: set[tuple[int, ...]] = {tuple(sorted(desen, reverse=True))}
        bu_atamanin_adaylari: list[OneriAdayi] = []

        # Birleştirme: iki bloğu tek bloğa indirger (blok sayısı azalır,
        # bir gün ihtiyacı düşer -- B4/B3 baskısını doğrudan azaltır).
        for i in range(len(desen)):
            for j in range(i + 1, len(desen)):
                if len(bu_atamanin_adaylari) >= _MAKS_ADAY_ATAMA_BASINA_DESEN:
                    break
                yeni_desen = [v for k, v in enumerate(desen) if k not in (i, j)]
                yeni_desen.append(desen[i] + desen[j])
                anahtar = tuple(sorted(yeni_desen, reverse=True))
                if anahtar in uretilenler:
                    continue
                uretilenler.add(anahtar)
                yeni_okul = deepcopy(okul)
                yeni_okul.ders_atamalari[a_idx].blok_deseni = sorted(
                    yeni_desen, reverse=True
                )
                bu_atamanin_adaylari.append(
                    OneriAdayi(
                        basamak=1,
                        aciklama=(
                            f"{atama.ders} dersinin ({', '.join(atama.subeler)}) blok "
                            f"desenini {desen} yerine {sorted(yeni_desen, reverse=True)} "
                            f"yapmayı (iki bloğu birleştirmeyi) deneyin"
                        ),
                        okul=yeni_okul,
                    )
                )

        # Bölme: bir bloğu ikiye ayırır (örn. {2}->{1,1}); parçalar daha
        # az kısıtlı (fragmanlı) günlere de sığabilir.
        for i, uzunluk in enumerate(desen):
            if len(bu_atamanin_adaylari) >= _MAKS_ADAY_ATAMA_BASINA_DESEN:
                break
            if uzunluk < 2:
                continue
            buyuk = uzunluk - uzunluk // 2
            kucuk = uzunluk // 2
            yeni_desen = [v for k, v in enumerate(desen) if k != i] + [buyuk, kucuk]
            anahtar = tuple(sorted(yeni_desen, reverse=True))
            if anahtar in uretilenler:
                continue
            uretilenler.add(anahtar)
            yeni_okul = deepcopy(okul)
            yeni_okul.ders_atamalari[a_idx].blok_deseni = sorted(yeni_desen, reverse=True)
            bu_atamanin_adaylari.append(
                OneriAdayi(
                    basamak=1,
                    aciklama=(
                        f"{atama.ders} dersinin ({', '.join(atama.subeler)}) blok "
                        f"desenini {desen} yerine {sorted(yeni_desen, reverse=True)} "
                        f"yapmayı (bir bloğu bölmeyi) deneyin"
                    ),
                    okul=yeni_okul,
                )
            )

        adaylar.extend(bu_atamanin_adaylari)

    return adaylar


def _ogretmen_serbest_kapasite(okul: Okul, ogretmen_adi: str) -> int:
    """Bir öğretmenin mevcut atanmış yükü düşüldükten sonra kalan serbest kapasitesini hesaplar."""
    ogretmen = next(o for o in okul.ogretmenler if o.ad == ogretmen_adi)
    toplam_kapasite = _ogretmen_kapasitesi(okul, ogretmen)
    yuk = sum(a.haftalik_saat for a in okul.ders_atamalari if ogretmen_adi in a.ogretmenler)
    return toplam_kapasite - yuk


def _ders_kategorisi(okul: Okul, ders_adi: str) -> DersKategorisi | None:
    """Bir ders adının kategorisini bulur (Rehberlik'i yük devrinden hariç tutmak için kullanılır)."""
    ders = next((d for d in okul.dersler if d.ad == ders_adi), None)
    return ders.kategori if ders else None


def _yuk_devri_adaylari(okul: Okul, atama_indeksleri: list[int]) -> list[OneriAdayi]:
    """Basamak 2: core bağlamındaki atamalar için branşı uygun VE kapasitesi yeten alternatif öğretmen adayları üretir.

    Rehberlik dersleri hariç tutulur: B5 kuralı gereği rehberlik dersine
    yalnızca o şubenin sınıf rehber öğretmeni girebilir -- bu, CP-SAT'a
    hiç gitmeyen bir A-katmanı kuralıdır, dolayısıyla "branşı uygun
    öğretmen" arayan bu genel devir mantığı rehberlik için yanıltıcı
    olur (verebilecegi_dersler listesinde birden fazla öğretmen görünse
    bile, her biri yalnızca KENDİ şubesinin rehberliğini verebilir).

    Not (v0 basitleştirmesi): bu deneyde her atamanın tek öğretmeni var;
    aday, atamanın öğretmen listesini yeni öğretmenle DEĞİŞTİRİR (ekleme
    değil). Çok-öğretmenli atamalar (birlestirilebilir) gelecekte bu
    varsayımı gözden geçirmeli.
    """
    adaylar: list[OneriAdayi] = []
    for a_idx in atama_indeksleri:
        atama = okul.ders_atamalari[a_idx]
        if _ders_kategorisi(okul, atama.ders) == DersKategorisi.REHBERLIK_DIGER:
            continue
        bu_atamanin_adaylari: list[OneriAdayi] = []
        for ogretmen in okul.ogretmenler:
            if len(bu_atamanin_adaylari) >= _MAKS_ADAY_ATAMA_BASINA_YUK_DEVRI:
                break
            if ogretmen.ad in atama.ogretmenler:
                continue
            if atama.ders not in ogretmen.verebilecegi_dersler:
                continue
            if _ogretmen_serbest_kapasite(okul, ogretmen.ad) < atama.haftalik_saat:
                continue
            yeni_okul = deepcopy(okul)
            yeni_okul.ders_atamalari[a_idx].ogretmenler = [ogretmen.ad]
            eski_ogretmen = atama.ogretmenler[0] if atama.ogretmenler else "(atanmamış)"
            bu_atamanin_adaylari.append(
                OneriAdayi(
                    basamak=2,
                    aciklama=(
                        f"{atama.ders} dersini ({', '.join(atama.subeler)}) "
                        f"{eski_ogretmen} yerine {ogretmen.ad} öğretmenine "
                        f"devretmeyi deneyin"
                    ),
                    okul=yeni_okul,
                )
            )
        adaylar.extend(bu_atamanin_adaylari)
    return adaylar


def _sabitleme_adaylari(okul: Okul, atama_indeksleri: list[int]) -> list[OneriAdayi]:
    """Basamak 3: YALNIZ veride gerçekten bir sabitleme (sabit_dilimler) varsa gevşetme adayı üretir.

    Boş gün TERCİHİ (bos_gun_tercihi) burada gevşetme adayı OLARAK
    ÜRETİLMEZ: B3 sert bir garantidir (herhangi bir boş gün yeter),
    C1 ise yumuşak bir tercihtir (hangi günün tercih edildiği). Tercihi
    gevşetmek B3'ün çözümsüzlüğüne çare olmaz -- bu bir kategori
    hatasıdır (bkz. Karar 14).
    """
    adaylar: list[OneriAdayi] = []
    for a_idx in atama_indeksleri:
        atama = okul.ders_atamalari[a_idx]
        if not atama.sabit_dilimler:
            continue
        yeni_okul = deepcopy(okul)
        yeni_okul.ders_atamalari[a_idx].sabit_dilimler = None
        adaylar.append(
            OneriAdayi(
                basamak=3,
                aciklama=(
                    f"{atama.ders} dersindeki ({', '.join(atama.subeler)}) sabitlenmiş "
                    f"saat(ler)i gevşetmeyi deneyin"
                ),
                okul=yeni_okul,
            )
        )
    return adaylar


def _kisisel_tercih_adaylari(
    okul: Okul, kapanis_gruplari: list[tuple[str, KapanisNedeni]]
) -> list[OneriAdayi]:
    """Basamak 4: kişisel tercih nedenli kapanışları gevşetme adayları üretir (son çare, çok-okul uyarısı yalnız uygunsa)."""
    adaylar: list[OneriAdayi] = []
    for ogretmen_adi, neden in kapanis_gruplari:
        if neden != KapanisNedeni.KISISEL_TERCIH:
            continue
        yeni_okul = deepcopy(okul)
        yeni_ogretmen = next(o for o in yeni_okul.ogretmenler if o.ad == ogretmen_adi)
        gunler = sorted(
            {k.gun for k in yeni_ogretmen.kapanislar if k.neden == KapanisNedeni.KISISEL_TERCIH}
        )
        cok_okullu = any(k.neden == KapanisNedeni.DIS_OKUL for k in yeni_ogretmen.kapanislar)
        yeni_ogretmen.kapanislar = [
            k for k in yeni_ogretmen.kapanislar if k.neden != KapanisNedeni.KISISEL_TERCIH
        ]

        aciklama = (
            f"{ogretmen_adi} öğretmeninin {_gunleri_metne_cevir(gunler)} günlerindeki "
            f"kişisel tercih günü/saatlerini gözden geçirmeyi deneyin"
        )
        if cok_okullu:
            aciklama += (
                " (uyarı: bu öğretmen başka bir okulda da ders veriyor, müsaitlik "
                "değişikliği o okulun programını da etkileyebilir -- çok-okul zinciri)"
            )
        adaylar.append(OneriAdayi(basamak=4, aciklama=aciklama, okul=yeni_okul))
    return adaylar


def _kural_muafiyeti_adaylari(okul: Okul, b3_ogretmenler: list[str]) -> list[OneriAdayi]:
    """Basamak 5 (Karar 15): B3 core'unda görünen öğretmen için boş gün garantisinin O ÖĞRETMENE ÖZEL kapatılması adayını üretir.

    Kural parametreleri de meşru gevşetme adaylarıdır (Karar 15
    gerekçesi): dış okul yükü boş günü yapısal olarak imkânsız kılan
    öğretmende hiçbir veri değişikliği (desen, yük devri, kapanış)
    çözüm açamaz -- tek dürüst öneri kuralın o öğetmen için, kayıt
    altına alınarak kapatılmasıdır. Uyarı tonu Karar 17 saha bulgusuna
    göre yazılmıştır: bu, istisnai bir anomali değil, çok-okullu ağır
    yük profilinde bilinen bir durumdur. Aday, diğer tüm adaylar gibi
    yeniden-çöz doğrulamasından geçer; muafiyet A-katmanı kapasite
    hesabına da işlediğinden (Karar 17) doğrulama tutarlıdır.
    """
    adaylar: list[OneriAdayi] = []
    for ogretmen_adi in b3_ogretmenler:
        if ogretmen_adi in okul.kural_ayarlari.b3_muaf_ogretmenler:
            continue
        ogretmen = next(o for o in okul.ogretmenler if o.ad == ogretmen_adi)
        dis_okul_gunleri = sorted(
            {k.gun for k in ogretmen.kapanislar if k.neden == KapanisNedeni.DIS_OKUL}
        )
        yeni_okul = deepcopy(okul)
        yeni_okul.kural_ayarlari.b3_muaf_ogretmenler = set(
            yeni_okul.kural_ayarlari.b3_muaf_ogretmenler
        ) | {ogretmen_adi}

        if dis_okul_gunleri:
            gerekce = (
                f"{_gunleri_metne_cevir(dis_okul_gunleri)} günleri dış okul "
                f"görevinde olduğundan bu okulda tam boş gün bırakmak yapısal "
                f"olarak mümkün görünmüyor; bu, çok okullu ağır yük profilinde "
                f"bilinen bir durumdur"
            )
        else:
            gerekce = (
                "mevcut ders yükü dağılımıyla hiçbir gün tamamen "
                "boşaltılamıyor"
            )
        adaylar.append(
            OneriAdayi(
                basamak=5,
                aciklama=(
                    f"{ogretmen_adi} öğretmeni için boş gün garantisi kuralını "
                    f"bu öğretmene özel kapatmayı değerlendirin: {gerekce} "
                    f"(kural ayarlarına kayıt düşülerek uygulanır, diğer "
                    f"öğretmenlerin garantisi etkilenmez)"
                ),
                okul=yeni_okul,
            )
        )
    return adaylar


def _idari_adaylari(
    okul: Okul, kapanis_gruplari: list[tuple[str, KapanisNedeni]]
) -> list[OneriAdayi]:
    """Basamak 5: idari nedenli kapanışları gevşetme adayları üretir; yalnız 1-4 hiç doğrulanmış aday üretmediyse denenir."""
    adaylar: list[OneriAdayi] = []
    for ogretmen_adi, neden in kapanis_gruplari:
        if neden != KapanisNedeni.IDARI:
            continue
        yeni_okul = deepcopy(okul)
        yeni_ogretmen = next(o for o in yeni_okul.ogretmenler if o.ad == ogretmen_adi)
        gunler = sorted(
            {k.gun for k in yeni_ogretmen.kapanislar if k.neden == KapanisNedeni.IDARI}
        )
        yeni_ogretmen.kapanislar = [
            k for k in yeni_ogretmen.kapanislar if k.neden != KapanisNedeni.IDARI
        ]
        adaylar.append(
            OneriAdayi(
                basamak=5,
                aciklama=(
                    f"{ogretmen_adi} öğretmeninin {_gunleri_metne_cevir(gunler)} "
                    f"günlerindeki idari görevini azaltmayı ya da başka güne almayı "
                    f"deneyin (okul yönetiminin zorunlu kararı -- ancak başka yol "
                    f"görünmediği için öneriliyor)"
                ),
                okul=yeni_okul,
            )
        )
    return adaylar


def _hizli_modda_cozulebilir_mi(okul: Okul) -> bool:
    """Bir okulun hipotetik durumunun HIZLI modda çözülüp çözülemediğini denetler (doğrulama döngüsünün çekirdeği).

    Hem A-katmanı (veri tutarlılığı: örn. B5 rehberlik ataması) hem de
    CP-SAT sert kuralları kontrol edilir -- A-katmanı CP-SAT'a hiç
    gitmediğinden, yalnız çözücüyü çalıştırmak B5 gibi bir ihlali
    kaçırabilir ve bir adayı yanlışlıkla "çözülüyor" sayabilir.
    """
    if a_katmani_dogrulama(okul):
        return False
    try:
        km = kur_temel_degiskenler(okul, tanilama_modu=False)
    except ValueError:
        return False
    sert_kurallari_uygula(km)
    cozucu = cp_model.CpSolver()
    cozucu.parameters.max_time_in_seconds = 10
    durum = cozucu.Solve(km.model)
    return durum in (cp_model.OPTIMAL, cp_model.FEASIBLE)


def dogrulanmis_oneriler_uret(
    okul: Okul, cekirdek: list[VarsayimAnahtari]
) -> tuple[list[str], int, float]:
    """Basamak sırasıyla (desen -> yük devri -> sabitleme -> kişisel tercih -> kural muafiyeti -> idari) aday üretir, her adayı hipotetik olarak HIZLI modda çözer.

    Rapora yalnız çözüm açan adaylar girer ("denendi" etiketiyle).
    Dönüş: (onaylanmış öneri cümleleri, toplam deneme sayısı, geçen süre saniye).
    """
    baslangic = time.perf_counter()

    b3_ogretmenler = sorted({va.ogretmen_adi for va in cekirdek if va.tur == "B3"})
    b6_ogretmenler = sorted({va.ogretmen_adi for va in cekirdek if va.tur == "B6"})
    b4_atamalar = sorted({va.atama_index for va in cekirdek if va.tur == "B4"})
    kapanis_gruplari = [(va.ogretmen_adi, va.neden) for va in cekirdek if va.tur == "KAPANIS"]

    core_ogretmenler = set(b3_ogretmenler) | set(b6_ogretmenler)
    core_atama_indeksleri = set(b4_atamalar)
    for a_idx, atama in enumerate(okul.ders_atamalari):
        if core_ogretmenler & set(atama.ogretmenler):
            core_atama_indeksleri.add(a_idx)
    core_atama_indeksleri_sirali = sorted(core_atama_indeksleri)

    basamak_aday_listeleri = [
        _desen_adaylari(okul, core_atama_indeksleri_sirali),
        _yuk_devri_adaylari(okul, core_atama_indeksleri_sirali),
        _sabitleme_adaylari(okul, core_atama_indeksleri_sirali),
        _kisisel_tercih_adaylari(okul, kapanis_gruplari),
        _kural_muafiyeti_adaylari(okul, b3_ogretmenler),
    ]

    onaylanmis: list[str] = []
    deneme_sayisi = 0

    for adaylar in basamak_aday_listeleri:
        if deneme_sayisi >= _MAKS_TOPLAM_DENEME:
            break
        for aday in adaylar:
            if deneme_sayisi >= _MAKS_TOPLAM_DENEME:
                break
            deneme_sayisi += 1
            if _hizli_modda_cozulebilir_mi(aday.okul):
                onaylanmis.append(f"{aday.aciklama} (denendi: program kurulabiliyor).")

    en_az_kotu_yol: str | None = None
    if not onaylanmis:
        idari_adaylari = _idari_adaylari(okul, kapanis_gruplari)
        for aday in idari_adaylari[:_MAKS_EK_DENEME_IDARI]:
            deneme_sayisi += 1
            if _hizli_modda_cozulebilir_mi(aday.okul):
                onaylanmis.append(f"{aday.aciklama} (denendi: program kurulabiliyor).")
            elif en_az_kotu_yol is None:
                en_az_kotu_yol = aday.aciklama

        if not onaylanmis and en_az_kotu_yol is not None:
            onaylanmis.append(
                "Üretilen hiçbir aday tek başına çözüm açmadı. En az kötü yol: "
                + en_az_kotu_yol
                + " (bu tek başına yeterli olmayabilir, başka değişikliklerle "
                "birlikte denenmesi gerekebilir)."
            )

    sure = time.perf_counter() - baslangic
    return onaylanmis, deneme_sayisi, sure


def tanila(okul: Okul) -> str:
    """Hızlı modda UNSAT çıkan bir okul için tanılama modunda yeniden kurar, çözer ve numaralı Türkçe eylem raporu üretir."""
    cozucu, _model, cekirdek = tanilama_modunda_coz(okul)

    if not cekirdek:
        return (
            "Tanılama modu çözümsüzlüğü doğrulayamadı; bu beklenmedik bir "
            "durumdur, lütfen veriyi ve modeli kontrol edin."
        )

    cumleler = cekirdek_cumleleri(okul, cekirdek)
    onaylanmis_oneriler, _deneme_sayisi, _sure = dogrulanmis_oneriler_uret(okul, cekirdek)
    neden_onerilmiyor = _neden_onerilmiyor_bolumu(cekirdek)

    satirlar = ["Bu program şu anki verilerle kurulamıyor. Nedenleri:"]
    for i, cumle in enumerate(cumleler, start=1):
        satirlar.append(f"  {i}. {cumle}")

    satirlar.append("\nÖnerilen çözüm adımları (yalnız denenip çözüm açtığı doğrulananlar):")
    if onaylanmis_oneriler:
        for i, oneri in enumerate(onaylanmis_oneriler, start=1):
            satirlar.append(f"  {i}. {oneri}")
    else:
        satirlar.append("  Üretilen hiçbir aday çözüm açmadı.")

    if neden_onerilmiyor:
        satirlar.append("\nNeden bazı seçenekler önerilmiyor:")
        for satir in neden_onerilmiyor:
            satirlar.append(f"  - {satir}")

    satirlar.append(
        "\nNot: bu liste sorunu açıklamaya yeterlidir; ancak tek mümkün açıklama "
        "olmayabilir -- başka bir kısıt kombinasyonu da aynı sonuca yol açıyor olabilir."
    )

    teknik = _teknik_referans(okul, cekirdek)
    if teknik:
        satirlar.append(f"\n{teknik}")

    return "\n".join(satirlar)
