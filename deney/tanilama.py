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
"""

from __future__ import annotations

from ortools.sat.python import cp_model

from kisitlar import VarsayimAnahtari, kur_temel_degiskenler, sert_kurallari_uygula
from model import KapanisNedeni, Okul

_GUN_ADLARI_KUCUK = ["pazartesi", "salı", "çarşamba", "perşembe", "cuma"]

_NEDEN_ADLARI = {
    KapanisNedeni.DIS_OKUL: "dışOkul",
    KapanisNedeni.BOS_GUN: "boşGün",
    KapanisNedeni.IDARI: "idari",
    KapanisNedeni.KISISEL_TERCIH: "kişiselTercih",
}


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


def _b3_cumlesi(okul: Okul, ogretmen_adi: str, kapanis_nedenleri: list[KapanisNedeni]) -> str:
    """B3 (boş gün garantisi) varsayımını, varsa eşlik eden kapanış nedenleriyle birlikte Türkçe cümleye çevirir."""
    if not kapanis_nedenleri:
        return (
            f"{_iyelik_eki(ogretmen_adi)} haftada en az bir tam boş günü garanti "
            f"edilemiyor (B3): mevcut ders yüküyle hiçbir gün tamamen boşaltılamıyor."
        )
    parcalar = [
        f"{_gunleri_metne_cevir(_kapanis_gunlerini_bul(okul, ogretmen_adi, neden))} "
        f"{_NEDEN_ADLARI[neden]} kapanışları"
        for neden in kapanis_nedenleri
    ]
    return (
        f"{_iyelik_eki(ogretmen_adi)} boş gün garantisi (B3), "
        + " ve ".join(parcalar)
        + " ile birlikte sağlanamıyor."
    )


def _b6_cumlesi(okul: Okul, ogretmen_adi: str, kapanis_nedenleri: list[KapanisNedeni]) -> str:
    """B6 (4 saatten uzun bekleme yasağı) varsayımını, varsa eşlik eden kapanış nedenleriyle birlikte Türkçe cümleye çevirir."""
    if not kapanis_nedenleri:
        return (
            f"{ogretmen_adi} için bir günde 4 saatten uzun boş bekleme oluşmaması "
            f"kuralı (B6) sağlanamıyor: mevcut ders dağılımıyla bazı günlerde art "
            f"arda çok uzun boşluk çıkıyor."
        )
    parcalar = [
        f"{_gunleri_metne_cevir(_kapanis_gunlerini_bul(okul, ogretmen_adi, neden))} "
        f"{_NEDEN_ADLARI[neden]} kapanışları"
        for neden in kapanis_nedenleri
    ]
    return (
        f"{ogretmen_adi} için uzun bekleme yasağı (B6), "
        + " ve ".join(parcalar)
        + " ile birlikte sağlanamıyor."
    )


def _b4_cumlesi(okul: Okul, atama_index: int) -> str:
    """B4 (her blok ayrı güne) varsayımını Türkçe cümleye çevirir."""
    atama = okul.ders_atamalari[atama_index]
    return (
        f"{atama.ders} dersinin ({', '.join(atama.subeler)}) {len(atama.blok_deseni)} "
        f"bloğu ayrı günlere dağıtılamıyor (B4): bu dersi verecek öğretmen için "
        f"yeterli sayıda uygun gün kalmıyor."
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
            f"{_iyelik_eki(ogretmen_adi)} {gunler} günlerindeki {_NEDEN_ADLARI[neden]} "
            f"kapanışları, bu programı imkânsız kılan nedenlerden biri."
        )

    return cumleler


def gevsetme_onerileri(okul: Okul, cekirdek: list[VarsayimAnahtari]) -> list[str]:
    """Kisit-envanteri.md §5 hiyerarşisine göre gevşetme önerilerini sıralar: (1) desen, (2) tercih/sabitleme, (3) en son ve uyarılı müsaitlik."""
    b3_ogretmenler = sorted({va.ogretmen_adi for va in cekirdek if va.tur == "B3"})
    b6_ogretmenler = sorted({va.ogretmen_adi for va in cekirdek if va.tur == "B6"})
    b4_atamalar = sorted({va.atama_index for va in cekirdek if va.tur == "B4"})
    kapanis_gruplari = [(va.ogretmen_adi, va.neden) for va in cekirdek if va.tur == "KAPANIS"]

    oneriler: list[str] = []

    # 1. Desen değişikliği -- en ucuz, ilk denenecek seçenek.
    for a_idx in b4_atamalar:
        atama = okul.ders_atamalari[a_idx]
        oneriler.append(
            f"{atama.ders} dersinin ({', '.join(atama.subeler)}) blok sayısını "
            f"azaltmayı düşünün (şu an: {atama.blok_deseni}) -- her blok ayrı bir "
            f"gün istediğinden, blok sayısı azalırsa ihtiyaç duyulan gün sayısı da azalır."
        )

    # 2. Tercih / sabitleme gevşetmeleri.
    for ogretmen_adi in sorted(set(b3_ogretmenler) | set(b6_ogretmenler)):
        oneriler.append(
            f"{ogretmen_adi} için boş gün tercihinden bu hafta ödün vermeyi ya da "
            f"varsa sabitlenmiş bir dersini gevşetmeyi değerlendirin."
        )

    # 3. En son ve uyarılı müsaitlik.
    for ogretmen_adi, neden in kapanis_gruplari:
        gunler = _gunleri_metne_cevir(_kapanis_gunlerini_bul(okul, ogretmen_adi, neden))
        if neden == KapanisNedeni.DIS_OKUL:
            oneriler.append(
                f"{_iyelik_eki(ogretmen_adi)} {gunler} günlerindeki dışOkul kapanışı "
                f"GEVŞETME ÖNERİSİ OLARAK SUNULMAZ (başka bir okula karşı taahhüt) "
                f"-- bu kapanışı değiştirmeyi düşünmeyin."
            )
        else:
            oneriler.append(
                f"Son çare olarak, {_iyelik_eki(ogretmen_adi)} {gunler} günlerindeki "
                f"{_NEDEN_ADLARI[neden]} kapanışını gözden geçirmeyi değerlendirin. "
                f"Uyarı: müsaitlik değişikliği başka okulların programını da "
                f"etkileyebilir (çok-okul zinciri) -- önce yukarıdaki seçenekleri deneyin."
            )

    return oneriler


def tanila(okul: Okul) -> str:
    """Hızlı modda UNSAT çıkan bir okul için tanılama modunda yeniden kurar, çözer ve numaralı Türkçe eylem raporu üretir."""
    cozucu, _model, cekirdek = tanilama_modunda_coz(okul)

    if not cekirdek:
        return (
            "Tanılama modu çözümsüzlüğü doğrulayamadı; bu beklenmedik bir "
            "durumdur, lütfen veriyi ve modeli kontrol edin."
        )

    cumleler = cekirdek_cumleleri(okul, cekirdek)
    oneriler = gevsetme_onerileri(okul, cekirdek)

    satirlar = ["Bu program şu anki verilerle kurulamıyor. Nedenleri:"]
    for i, cumle in enumerate(cumleler, start=1):
        satirlar.append(f"  {i}. {cumle}")

    satirlar.append("\nÖnerilen çözüm adımları (önce yukarıdakiler denenmeli):")
    for i, oneri in enumerate(oneriler, start=1):
        satirlar.append(f"  {i}. {oneri}")

    satirlar.append(
        "\nNot: bu liste sorunu açıklamaya yeterlidir; ancak tek mümkün açıklama "
        "olmayabilir -- başka bir kısıt kombinasyonu da aynı sonuca yol açıyor olabilir."
    )
    return "\n".join(satirlar)
