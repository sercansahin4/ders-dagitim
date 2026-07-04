"""Kısıt katalogundaki kuralların CP-SAT çevirilerini içerir.

Ders dağıtımına ilişkin sert ve yumuşak kısıtların Google OR-Tools
CP-SAT çözücüsünün anlayacağı kısıtlara çevrildiği modül.

Bu dosyanın haritası docs/cevrim-tablosu.md'dir: §0 temel karar
değişkenlerini, §1 B1-B8 sert kurallarını tanımlar; kod bu tabloyla
bire bir izlenebilir olacak şekilde yazılmıştır (her kural = bir
fonksiyon).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from ortools.sat.python import cp_model

from model import DersAtamasi, KapanisNedeni, Ogretmen, Okul


@dataclass
class KisitModeli:
    """CP-SAT modelini, okul verisini ve cevrim-tablosu §0 temel karar değişkenlerini bir arada tutar."""

    model: cp_model.CpModel
    okul: Okul
    gunler: list[int]
    dilimler: list[int]
    # basla[a_idx, b_idx, g, s] -- yalnızca geçerli konumlar için anahtar var.
    basla: dict[tuple[int, int, int, int], cp_model.IntVar] = field(default_factory=dict)
    # dolu[a_idx, g, s]
    dolu: dict[tuple[int, int, int], cp_model.IntVar] = field(default_factory=dict)
    # calisiyor[ogretmen_adi, g, s]
    calisiyor: dict[tuple[str, int, int], cp_model.IntVar] = field(default_factory=dict)
    # sube_dolu[sube_adi, g, s]
    sube_dolu: dict[tuple[str, int, int], cp_model.IntVar] = field(default_factory=dict)
    # gun_bos[ogretmen_adi, g]
    gun_bos: dict[tuple[str, int], cp_model.IntVar] = field(default_factory=dict)
    # pencere[ogretmen_adi, g, s] -- segment sınırında sabit 0 (int) olabilir.
    pencere: dict[tuple[str, int, int], object] = field(default_factory=dict)


def _kapanis_dilimleri(ogretmen: Ogretmen) -> dict[tuple[int, int], KapanisNedeni]:
    """Bir öğretmenin (gün, dilim) çiftlerinden kapanış nedenine sözlük kurar."""
    sozluk: dict[tuple[int, int], KapanisNedeni] = {}
    for kapanis in ogretmen.kapanislar:
        for dilim in kapanis.dilimler:
            sozluk[(kapanis.gun, dilim)] = kapanis.neden
    return sozluk


def b2_kapanislar(
    okul: Okul, atama: DersAtamasi, uzunluk: int, gunler: list[int], dilimler: list[int]
) -> list[tuple[int, int]]:
    """Cevrim-tablosu §1 B2: bir bloğun, atamanın hiçbir öğretmeni için kapalı dilime denk gelmeyen (gün, başlangıç) konumlarını hesaplar (arama uzayı budaması).

    Aynı adımda ızgara sınırı (blok gün sonunu taşamaz) ve öğle arası
    ayarı (Izgara.ogle_arasi_bloklari_boler=True ise blok öğle arasını
    kesemez) da uygulanır -- B2'nin "basla 0'a sabitlenir" ifadesiyle
    aynı etkiyi, değişkeni hiç yaratmayarak (daha verimli) sağlarlar.
    """
    kapanislar = [
        _kapanis_dilimleri(o) for o in okul.ogretmenler if o.ad in atama.ogretmenler
    ]
    gecerli: list[tuple[int, int]] = []
    for g in gunler:
        for s in dilimler:
            if s + uzunluk - 1 > okul.izgara.dilim_sayisi:
                continue
            if okul.izgara.ogle_arasi_bloklari_boler:
                sinir = okul.izgara.ogle_arasi_sonrasi_dilim
                if s <= sinir < s + uzunluk - 1:
                    continue
            kapsanan = range(s, s + uzunluk)
            if any((g, d) in kapanis for d in kapsanan for kapanis in kapanislar):
                continue
            gecerli.append((g, s))
    return gecerli


def b1_cakismazlik(km: KisitModeli) -> None:
    """Cevrim-tablosu §1 B1: her (öğretmen,g,s) ve (şube,g,s) için doluluğu BoolVar'a eşitleyerek çakışmazlığı kurar.

    calisiyor/sube_dolu bir BoolVar'a eşitlendiğinden (0/1 dışına
    çıkamaz), ilgili dolu toplamı zaten "en fazla 1" ile sınırlanmış
    olur -- bu eşitlik B1'in kendisidir, ayrı bir "<=1" kısıtı gerekmez.
    """
    for ogretmen in km.okul.ogretmenler:
        ilgili = [
            a_idx
            for a_idx, atama in enumerate(km.okul.ders_atamalari)
            if ogretmen.ad in atama.ogretmenler
        ]
        for g in km.gunler:
            for s in km.dilimler:
                var = km.model.NewBoolVar(f"calisiyor_{ogretmen.ad}_{g}_{s}")
                km.model.Add(var == sum(km.dolu[(a_idx, g, s)] for a_idx in ilgili))
                km.calisiyor[(ogretmen.ad, g, s)] = var

    for sube in km.okul.subeler:
        ilgili = [
            a_idx
            for a_idx, atama in enumerate(km.okul.ders_atamalari)
            if sube.ad in atama.subeler
        ]
        for g in km.gunler:
            for s in km.dilimler:
                var = km.model.NewBoolVar(f"sube_dolu_{sube.ad}_{g}_{s}")
                km.model.Add(var == sum(km.dolu[(a_idx, g, s)] for a_idx in ilgili))
                km.sube_dolu[(sube.ad, g, s)] = var


def b3_bos_gun_garantisi(km: KisitModeli) -> None:
    """Cevrim-tablosu §1 B3: dışOkul kapanışı olmayan günler üzerinden her öğretmene en az bir tam boş gün garanti eder."""
    for ogretmen in km.okul.ogretmenler:
        dis_okul_gunleri = {
            k.gun for k in ogretmen.kapanislar if k.neden == KapanisNedeni.DIS_OKUL
        }
        uygun_gunler = [g for g in km.gunler if g not in dis_okul_gunleri]
        km.model.Add(sum(km.gun_bos[(ogretmen.ad, g)] for g in uygun_gunler) >= 1)


def b4_ayri_gune_dagilim(km: KisitModeli) -> None:
    """Cevrim-tablosu §1 B4: her ders ataması için aynı güne en fazla bir blok başlayabilir (her blok ayrı bir güne düşer)."""
    for a_idx, atama in enumerate(km.okul.ders_atamalari):
        for g in km.gunler:
            anahtarlar = [
                km.basla[(a_idx, b_idx, gg, s)]
                for (a_idx2, b_idx, gg, s) in km.basla
                if a_idx2 == a_idx and gg == g
            ]
            if anahtarlar:
                km.model.Add(sum(anahtarlar) <= 1)


# B5 -- Rehberlik öğretmeni: çözücü kısıtı GEREKMEZ. Veri kurulumunda
# rehberlik dersinin ogretmenler listesi sınıf rehber öğretmenini
# içerecek şekilde girilir; tutarlılığı model.py'deki
# kontrol_sinif_rehber_ogretmeni (A-katmanı) doğrular. Buraya, tablo-kod
# eşlemesi eksiksiz görünsün diye açıklayıcı not olarak konmuştur.


def b6_pencere_ust_siniri(km: KisitModeli) -> None:
    """Cevrim-tablosu §1 B6: her öğretmen için her ardışık pencere_sert_esigi'lik dilim penceresinde en fazla (esik-1) pencere dilimine izin verir (kayan pencere)."""
    esik = km.okul.kural_ayarlari.pencere_sert_esigi
    for ogretmen in km.okul.ogretmenler:
        for g in km.gunler:
            for s in km.dilimler:
                if s + esik - 1 > km.okul.izgara.dilim_sayisi:
                    break
                pencere_toplami = sum(
                    km.pencere[(ogretmen.ad, g, s2)] for s2 in range(s, s + esik)
                )
                km.model.Add(pencere_toplami <= esik - 1)


# B7 -- Eşzamanlı ortak ders: ayrı bir kısıt GEREKMEZ. Birleştirilmiş
# (çok şubeli) bir DersAtamasi'nın tek bir dolu/basla kümesi vardır ve
# bu doluluk, atama.subeler listesindeki TÜM şubelerin sube_dolu
# toplamına aynı anda sayılır (bkz. b1_cakismazlik). Model bu eşzamanlı
# ortak dersi ekstra bir kısıt yazmadan "bedava" sağlar.


def b8_sabitleme(km: KisitModeli) -> None:
    """Cevrim-tablosu §1 B8: sabitlenen ders atamalarının basla anahtarını 1'e kilitler."""
    for a_idx, atama in enumerate(km.okul.ders_atamalari):
        if not atama.sabit_dilimler:
            continue
        for b_idx, (g, s) in enumerate(atama.sabit_dilimler):
            anahtar = (a_idx, b_idx, g, s)
            if anahtar not in km.basla:
                raise ValueError(
                    f"{atama.ders} ({', '.join(atama.subeler)}) için sabitlenen "
                    f"(gün={g}, dilim={s}) konumu bu bloğun geçerli başlangıçları "
                    f"arasında değil (kapanış, ızgara sınırı ya da öğle arası "
                    f"kuralıyla çakışıyor): sabit_dilimler değerini düzeltin."
                )
            km.model.Add(km.basla[anahtar] == 1)


def _pencere_segment_kur(km: KisitModeli, ogretmen: Ogretmen, gun: int, segment: list[int]) -> None:
    """Bir kapanış-bölünmesiz segment içindeki dilimler için pencere[ogretmen,gun,s] değişkenlerini kurar."""
    for i, s in enumerate(segment):
        calisiyor_var = km.calisiyor[(ogretmen.ad, gun, s)]
        oncesi = segment[:i]
        sonrasi = segment[i + 1 :]
        if not oncesi or not sonrasi:
            # Segmentin ilk/son dilimi: önünde ya da ardında ders olamaz,
            # tanım gereği pencere olamaz (sabit 0).
            km.pencere[(ogretmen.ad, gun, s)] = 0
            continue

        onceki_var = km.model.NewBoolVar(f"onceki_ders_{ogretmen.ad}_{gun}_{s}")
        km.model.AddMaxEquality(
            onceki_var, [km.calisiyor[(ogretmen.ad, gun, s2)] for s2 in oncesi]
        )
        sonraki_var = km.model.NewBoolVar(f"sonraki_ders_{ogretmen.ad}_{gun}_{s}")
        km.model.AddMaxEquality(
            sonraki_var, [km.calisiyor[(ogretmen.ad, gun, s2)] for s2 in sonrasi]
        )

        pencere_var = km.model.NewBoolVar(f"pencere_{ogretmen.ad}_{gun}_{s}")
        km.model.AddBoolAnd([calisiyor_var.Not(), onceki_var, sonraki_var]).OnlyEnforceIf(
            pencere_var
        )
        km.model.AddBoolOr(
            [calisiyor_var, onceki_var.Not(), sonraki_var.Not()]
        ).OnlyEnforceIf(pencere_var.Not())
        km.pencere[(ogretmen.ad, gun, s)] = pencere_var


def kur_temel_degiskenler(okul: Okul) -> KisitModeli:
    """Cevrim-tablosu §0'daki basla/dolu/calisiyor/sube_dolu/gun_bos/pencere değişkenlerini kurar ve B1'i (BoolVar tanımıyla) örtük olarak uygular."""
    model = cp_model.CpModel()
    gunler = list(range(1, okul.izgara.gun_sayisi + 1))
    dilimler = list(range(1, okul.izgara.dilim_sayisi + 1))
    km = KisitModeli(model=model, okul=okul, gunler=gunler, dilimler=dilimler)

    # basla[a,b,g,s] -- B2 uygulanmış (yalnızca geçerli konumlar) + her
    # blok tam bir kez başlar (ExactlyOne) + simetri kırma.
    for a_idx, atama in enumerate(okul.ders_atamalari):
        blok_gecerlileri: list[list[tuple[int, int]]] = []
        for b_idx, uzunluk in enumerate(atama.blok_deseni):
            gecerli = b2_kapanislar(okul, atama, uzunluk, gunler, dilimler)
            if not gecerli:
                raise ValueError(
                    f"{atama.ders} ({', '.join(atama.subeler)}): {uzunluk} saatlik "
                    f"blok için hiçbir uygun (gün, başlangıç) konumu yok -- "
                    f"öğretmen kapanışları veya ızgara sınırı tüm konumları kapatıyor."
                )
            blok_gecerlileri.append(gecerli)
            for (g, s) in gecerli:
                km.basla[(a_idx, b_idx, g, s)] = model.NewBoolVar(
                    f"basla_a{a_idx}_b{b_idx}_g{g}_s{s}"
                )
            model.AddExactlyOne(km.basla[(a_idx, b_idx, g, s)] for (g, s) in gecerli)

        # Simetri kırma: aynı uzunluktaki ardışık bloklar için gün sırası
        # artan olsun -- arama uzayı küçülür, çözüm kümesi değişmez.
        for b_idx in range(len(atama.blok_deseni) - 1):
            if atama.blok_deseni[b_idx] == atama.blok_deseni[b_idx + 1]:
                gun_b = sum(
                    g * km.basla[(a_idx, b_idx, g, s)] for (g, s) in blok_gecerlileri[b_idx]
                )
                gun_b1 = sum(
                    g * km.basla[(a_idx, b_idx + 1, g, s)]
                    for (g, s) in blok_gecerlileri[b_idx + 1]
                )
                model.Add(gun_b <= gun_b1)

    # dolu[a,g,s] -- bloğun kapladığı dilimlere basla'nın yayılımı
    # (B4 sayesinde eşitlik olarak bağlanır: aynı güne en fazla bir blok
    # başlayacağından kapsayan basla'ların toplamı zaten 0/1'dir).
    for a_idx, atama in enumerate(okul.ders_atamalari):
        for g in gunler:
            for s in dilimler:
                kapsayanlar = [
                    var
                    for (a_idx2, b_idx, gg, s0), var in km.basla.items()
                    if a_idx2 == a_idx
                    and gg == g
                    and s0 <= s <= s0 + atama.blok_deseni[b_idx] - 1
                ]
                dolu_var = model.NewBoolVar(f"dolu_a{a_idx}_g{g}_s{s}")
                if kapsayanlar:
                    model.Add(dolu_var == sum(kapsayanlar))
                else:
                    model.Add(dolu_var == 0)
                km.dolu[(a_idx, g, s)] = dolu_var

    # calisiyor[t,g,s] / sube_dolu[c,g,s] -- B1 çakışmazlığıyla birlikte.
    b1_cakismazlik(km)

    # gun_bos[t,g] -- açıksa o gün Σ calisiyor = 0. Tek yön (=>) B3 için
    # yeterli; ters yön de eklenir ki gun_bos ileride (C1) güvenle
    # "gün gerçekten boş mu" anlamında okunabilsin.
    for ogretmen in okul.ogretmenler:
        for g in gunler:
            var = model.NewBoolVar(f"gun_bos_{ogretmen.ad}_{g}")
            toplam = sum(km.calisiyor[(ogretmen.ad, g, s)] for s in dilimler)
            model.Add(toplam == 0).OnlyEnforceIf(var)
            model.Add(toplam >= 1).OnlyEnforceIf(var.Not())
            km.gun_bos[(ogretmen.ad, g)] = var

    # pencere[t,g,s] -- kapanış-bölünmesiz segmentler içinde kurulur;
    # "pencereyi bölen" kapanış (Karar 12) segmenti ikiye ayırır.
    for ogretmen in okul.ogretmenler:
        kapanislar = _kapanis_dilimleri(ogretmen)
        bolmeyen_nedenler = okul.kural_ayarlari.pencereyi_bolmeyen_nedenler
        for g in gunler:
            segment: list[int] = []
            for s in dilimler:
                neden = kapanislar.get((g, s))
                bolen = neden is not None and neden not in bolmeyen_nedenler
                if bolen:
                    _pencere_segment_kur(km, ogretmen, g, segment)
                    segment = []
                    # Bölen kapanış dilimi hiçbir segmente girmez, kendisi
                    # asla pencere sayılmaz (sabit 0) -- B6'nın kayan
                    # penceresi her dilime bakacağından anahtar eksik kalmasın.
                    km.pencere[(ogretmen.ad, g, s)] = 0
                else:
                    segment.append(s)
            _pencere_segment_kur(km, ogretmen, g, segment)

    return km


def sert_kurallari_uygula(km: KisitModeli) -> None:
    """B3, B4, B6, B8'i sırayla modele ekler (B1/B2 zaten kur_temel_degiskenler içinde uygulanmıştır; B5/B7 çözücü kısıtı gerektirmez)."""
    b3_bos_gun_garantisi(km)
    b4_ayri_gune_dagilim(km)
    b6_pencere_ust_siniri(km)
    b8_sabitleme(km)
