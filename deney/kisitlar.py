"""Kısıt katalogundaki kuralların CP-SAT çevirilerini içerir.

Ders dağıtımına ilişkin sert ve yumuşak kısıtların Google OR-Tools
CP-SAT çözücüsünün anlayacağı kısıtlara çevrildiği modül.

Bu dosyanın haritası docs/cevrim-tablosu.md'dir: §0 temel karar
değişkenlerini, §1 B1-B8 sert kurallarını tanımlar; kod bu tabloyla
bire bir izlenebilir olacak şekilde yazılmıştır (her kural = bir
fonksiyon).

İki modlu kurulum (cevrim-tablosu.md §4, kararlar.md Karar 13):
  - HIZLI mod (tanilama_modu=False, varsayılan): kapanışlar basit bir
    arama uzayı budamasıdır -- kapalı dilime denk gelen basla anahtarı
    hiç YARATILMAZ. En ucuz kurulum ama budanan bir değişken unsat
    core'da hiç görünemez: çözücü "bu kapanış olmasaydı olurdu" diye
    bir şey söyleyemez çünkü kapanışın izini taşıyan bir kısıt yok.
  - TANILAMA modu (tanilama_modu=True): kapanış dilimlerine denk gelen
    basla anahtarları da yaratılır; kapanışın etkisi ("bu dilimde ders
    olamaz") gerçek bir kısıt olarak yazılır ve bu kısıt bir varsayım
    (assumption) anahtarına bağlanır. Çözümsüzlükte CP-SAT hangi
    varsayımların BİRLİKTE tutulamayacağını söyleyebilir -- bu da
    hangi kapanışın (ve hangi B3/B4/B6 kuralının) sorunun parçası
    olduğunu ortaya çıkarır. Bu okulda beklenen ana çözümsüzlük
    kaynağı müsaitlik olduğundan, tanılama modunda kapanışların
    kısıt olarak var olması hayati önemde.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from ortools.sat.python import cp_model

from model import DersAtamasi, DersKategorisi, KapanisNedeni, Ogretmen, Okul


@dataclass
class VarsayimAnahtari:
    """Tanılama modunda bir sert kural grubunu temsil eden varsayım (assumption) anahtarını tutar.

    tur: "B3" | "B4" | "B6" | "KAPANIS". Diğer alanlar türe göre
    doldurulur (öğretmen kuralları için ogretmen_adi, B4 için
    atama_index, kapanış grubu için ogretmen_adi + neden).
    """

    tur: str
    literal: cp_model.IntVar
    ogretmen_adi: Optional[str] = None
    atama_index: Optional[int] = None
    neden: Optional[KapanisNedeni] = None


@dataclass
class KisitModeli:
    """CP-SAT modelini, okul verisini ve cevrim-tablosu §0 temel karar değişkenlerini bir arada tutar."""

    model: cp_model.CpModel
    okul: Okul
    gunler: list[int]
    dilimler: list[int]
    tanilama_modu: bool = False
    # basla[a_idx, b_idx, g, s] -- yalnızca geçerli konumlar için anahtar var.
    basla: dict[tuple[int, int, int, int], cp_model.IntVar] = field(default_factory=dict)
    # (a_idx, g) -> [(b_idx, s0, var)] -- basla'nın gün indeksli görünümü.
    # Gerekçe: dolu kurulumu ile C5/C7 köprü aramaları büyük okulda tüm
    # basla sözlüğünü taramamalı (43 şubede kurulum dakikalara çıkıyordu).
    basla_gun_indeksi: dict[tuple[int, int], list[tuple[int, int, cp_model.IntVar]]] = field(
        default_factory=dict
    )
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
    # Tanılama modunda oluşturulan tüm varsayım anahtarları (sırayla).
    varsayimlar: list[VarsayimAnahtari] = field(default_factory=list)


def _kapanis_dilimleri(ogretmen: Ogretmen) -> dict[tuple[int, int], KapanisNedeni]:
    """Bir öğretmenin (gün, dilim) çiftlerinden kapanış nedenine sözlük kurar."""
    sozluk: dict[tuple[int, int], KapanisNedeni] = {}
    for kapanis in ogretmen.kapanislar:
        for dilim in kapanis.dilimler:
            sozluk[(kapanis.gun, dilim)] = kapanis.neden
    return sozluk


def b2_kapanislar(
    okul: Okul,
    atama: DersAtamasi,
    uzunluk: int,
    gunler: list[int],
    dilimler: list[int],
    kapanislari_budama_olarak_uygula: bool = True,
) -> list[tuple[int, int]]:
    """Cevrim-tablosu §1 B2: bir bloğun geçerli (gün, başlangıç) konumlarını hesaplar.

    Izgara sınırı (blok gün sonunu taşamaz) ve öğle arası ayarı
    (Izgara.ogle_arasi_bloklari_boler=True ise blok öğle arasını
    kesemez) HER ZAMAN uygulanır -- bunlar gevşetilebilir varsayımlar
    değil, ızgaranın yapısıdır.

    kapanislari_budama_olarak_uygula=True (HIZLI mod, varsayılan):
    kapalı dilime denk gelen konumlar tamamen elenir (arama uzayı
    budaması, B2'nin "basla 0'a sabitlenir" ifadesiyle aynı etkiyi
    değişkeni hiç yaratmayarak sağlar).
    kapanislari_budama_olarak_uygula=False (TANILAMA modu): kapanışlar
    burada göz ardı edilir -- kapanışın etkisi, çağıran tarafından
    (kur_temel_degiskenler) ayrı bir varsayıma bağlı kısıt olarak
    eklenir; böylece kapanış unsat core'da görünebilir hale gelir.
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
            if kapanislari_budama_olarak_uygula:
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
    B1 hiçbir modda varsayıma bağlanmaz: çakışmazlık gevşetilebilir bir
    politika değil, geçerli bir programın tanımıdır.
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


def _yeni_varsayim(km: KisitModeli, isim: str, **kwargs) -> Optional[cp_model.IntVar]:
    """Tanılama modundaysa yeni bir varsayım literali yaratıp kaydeder; hızlı modda None döner."""
    if not km.tanilama_modu:
        return None
    literal = km.model.NewBoolVar(isim)
    km.model.AddAssumption(literal)
    km.varsayimlar.append(VarsayimAnahtari(literal=literal, **kwargs))
    return literal


def b3_bos_gun_garantisi(km: KisitModeli) -> None:
    """Cevrim-tablosu §1 B3: dışOkul kapanışı olmayan günler üzerinden her öğretmene en az bir tam boş gün garanti eder (öğretmen başına bir varsayım anahtarı, tanılama modunda).

    Karar 17: kural_ayarlari.b3_muaf_ogretmenler kümesindeki öğretmen
    için kısıt hiç kurulmaz (varsayım anahtarı da yaratılmaz -- muaf
    öğretmen unsat core'da B3 ile görünmemeli).
    """
    for ogretmen in km.okul.ogretmenler:
        if ogretmen.ad in km.okul.kural_ayarlari.b3_muaf_ogretmenler:
            continue
        dis_okul_gunleri = {
            k.gun for k in ogretmen.kapanislar if k.neden == KapanisNedeni.DIS_OKUL
        }
        uygun_gunler = [g for g in km.gunler if g not in dis_okul_gunleri]
        varsayim = _yeni_varsayim(
            km, f"varsayim_b3_{ogretmen.ad}", tur="B3", ogretmen_adi=ogretmen.ad
        )
        kisit = km.model.Add(sum(km.gun_bos[(ogretmen.ad, g)] for g in uygun_gunler) >= 1)
        if varsayim is not None:
            kisit.OnlyEnforceIf(varsayim)


def b4_ayri_gune_dagilim(km: KisitModeli) -> None:
    """Cevrim-tablosu §1 B4: her ders ataması için aynı güne en fazla bir blok başlayabilir (atama başına bir varsayım anahtarı, tanılama modunda)."""
    for a_idx, atama in enumerate(km.okul.ders_atamalari):
        varsayim = _yeni_varsayim(
            km, f"varsayim_b4_a{a_idx}", tur="B4", atama_index=a_idx
        )
        for g in km.gunler:
            anahtarlar = [
                var for (_b_idx, _s, var) in km.basla_gun_indeksi.get((a_idx, g), [])
            ]
            if anahtarlar:
                kisit = km.model.Add(sum(anahtarlar) <= 1)
                if varsayim is not None:
                    kisit.OnlyEnforceIf(varsayim)


# B5 -- Rehberlik öğretmeni: çözücü kısıtı GEREKMEZ. Veri kurulumunda
# rehberlik dersinin ogretmenler listesi sınıf rehber öğretmenini
# içerecek şekilde girilir; tutarlılığı model.py'deki
# kontrol_sinif_rehber_ogretmeni (A-katmanı) doğrular. Buraya, tablo-kod
# eşlemesi eksiksiz görünsün diye açıklayıcı not olarak konmuştur.


def b6_pencere_ust_siniri(km: KisitModeli) -> None:
    """Cevrim-tablosu §1 B6: her öğretmen için her ardışık pencere_sert_esigi'lik dilim penceresinde en fazla (esik-1) pencere dilimine izin verir (öğretmen başına bir varsayım anahtarı, tanılama modunda)."""
    esik = km.okul.kural_ayarlari.pencere_sert_esigi
    for ogretmen in km.okul.ogretmenler:
        varsayim = _yeni_varsayim(
            km, f"varsayim_b6_{ogretmen.ad}", tur="B6", ogretmen_adi=ogretmen.ad
        )
        for g in km.gunler:
            for s in km.dilimler:
                if s + esik - 1 > km.okul.izgara.dilim_sayisi:
                    break
                pencere_toplami = sum(
                    km.pencere[(ogretmen.ad, g, s2)] for s2 in range(s, s + esik)
                )
                kisit = km.model.Add(pencere_toplami <= esik - 1)
                if varsayim is not None:
                    kisit.OnlyEnforceIf(varsayim)


# B7 -- Eşzamanlı ortak ders: ayrı bir kısıt GEREKMEZ. Birleştirilmiş
# (çok şubeli) bir DersAtamasi'nın tek bir dolu/basla kümesi vardır ve
# bu doluluk, atama.subeler listesindeki TÜM şubelerin sube_dolu
# toplamına aynı anda sayılır (bkz. b1_cakismazlik). Model bu eşzamanlı
# ortak dersi ekstra bir kısıt yazmadan "bedava" sağlar.


def b8_sabitleme(km: KisitModeli) -> None:
    """Cevrim-tablosu §1 B8: sabitlenen ders atamalarının basla anahtarını 1'e kilitler (varsayıma bağlanmaz -- kullanıcı kararıdır, tartışmaya kapalıdır)."""
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


def _kapanis_varsayimlari_ekle(km: KisitModeli) -> None:
    """TANILAMA modunda: her (öğretmen, kapanış nedeni) grubu için bir varsayım anahtarı kurar ve 'bu dilimlerde ders olamaz' kısıtını buna bağlar.

    Taneciklik öğretmen×neden düzeyindedir (cevrim-tablosu.md §4):
    örn. bir öğretmenin TÜM dışOkul kapanışları tek bir anahtar,
    kişiselTercih kapanışları ayrı bir anahtardır -- unsat core bu
    ikisini birbirinden ayırt edebilsin diye.
    """
    for ogretmen in km.okul.ogretmenler:
        nedene_gore: dict[KapanisNedeni, list[tuple[int, int]]] = {}
        for kapanis in ogretmen.kapanislar:
            for dilim in kapanis.dilimler:
                nedene_gore.setdefault(kapanis.neden, []).append((kapanis.gun, dilim))

        for neden, gun_dilim_listesi in nedene_gore.items():
            varsayim = _yeni_varsayim(
                km,
                f"varsayim_kapanis_{ogretmen.ad}_{neden.name}",
                tur="KAPANIS",
                ogretmen_adi=ogretmen.ad,
                neden=neden,
            )
            for (g, s) in gun_dilim_listesi:
                km.model.Add(km.calisiyor[(ogretmen.ad, g, s)] == 0).OnlyEnforceIf(varsayim)


def kur_temel_degiskenler(okul: Okul, tanilama_modu: bool = False) -> KisitModeli:
    """Cevrim-tablosu §0'daki basla/dolu/calisiyor/sube_dolu/gun_bos/pencere değişkenlerini kurar ve B1'i (BoolVar tanımıyla) örtük olarak uygular.

    tanilama_modu=False (varsayılan, HIZLI): kapanışlar B2 aracılığıyla
    budanır, hiçbir varsayım anahtarı yaratılmaz.
    tanilama_modu=True: kapanışlar budanmaz; bunun yerine her öğretmen×
    neden grubu için bir varsayım anahtarına bağlı "dilim boş kalsın"
    kısıtı eklenir (bkz. _kapanis_varsayimlari_ekle).
    """
    model = cp_model.CpModel()
    gunler = list(range(1, okul.izgara.gun_sayisi + 1))
    dilimler = list(range(1, okul.izgara.dilim_sayisi + 1))
    km = KisitModeli(
        model=model, okul=okul, gunler=gunler, dilimler=dilimler, tanilama_modu=tanilama_modu
    )

    # basla[a,b,g,s] -- HIZLI modda B2 uygulanmış (yalnızca geçerli
    # konumlar); TANILAMA modunda kapanışlar hariç tutulmaz. Her iki
    # modda da: her blok tam bir kez başlar (ExactlyOne) + simetri kırma.
    for a_idx, atama in enumerate(okul.ders_atamalari):
        blok_gecerlileri: list[list[tuple[int, int]]] = []
        for b_idx, uzunluk in enumerate(atama.blok_deseni):
            gecerli = b2_kapanislar(
                okul,
                atama,
                uzunluk,
                gunler,
                dilimler,
                kapanislari_budama_olarak_uygula=not tanilama_modu,
            )
            if not gecerli:
                raise ValueError(
                    f"{atama.ders} ({', '.join(atama.subeler)}): {uzunluk} saatlik "
                    f"blok için hiçbir uygun (gün, başlangıç) konumu yok -- "
                    f"ızgara sınırı ya da öğle arası kuralı tüm konumları kapatıyor."
                )
            blok_gecerlileri.append(gecerli)
            for (g, s) in gecerli:
                var = model.NewBoolVar(f"basla_a{a_idx}_b{b_idx}_g{g}_s{s}")
                km.basla[(a_idx, b_idx, g, s)] = var
                km.basla_gun_indeksi.setdefault((a_idx, g), []).append((b_idx, s, var))
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
    # Kapsama haritası basla üzerinden TEK geçişte kurulur (gün indeksi
    # notuna bakınız: (a,g,s) başına tam tarama ölçeklenmiyordu).
    kapsayan_haritasi: dict[tuple[int, int, int], list[cp_model.IntVar]] = {}
    for (a_idx, b_idx, g, s0), var in km.basla.items():
        uzunluk = okul.ders_atamalari[a_idx].blok_deseni[b_idx]
        for s in range(s0, s0 + uzunluk):
            kapsayan_haritasi.setdefault((a_idx, g, s), []).append(var)
    for a_idx in range(len(okul.ders_atamalari)):
        for g in gunler:
            for s in dilimler:
                kapsayanlar = kapsayan_haritasi.get((a_idx, g, s))
                dolu_var = model.NewBoolVar(f"dolu_a{a_idx}_g{g}_s{s}")
                if kapsayanlar:
                    model.Add(dolu_var == sum(kapsayanlar))
                else:
                    model.Add(dolu_var == 0)
                km.dolu[(a_idx, g, s)] = dolu_var

    # calisiyor[t,g,s] / sube_dolu[c,g,s] -- B1 çakışmazlığıyla birlikte.
    b1_cakismazlik(km)

    # TANILAMA modunda: kapanışların etkisi burada, varsayım anahtarlı
    # kısıt olarak eklenir (HIZLI modda zaten B2 ile budanmıştı).
    if tanilama_modu:
        _kapanis_varsayimlari_ekle(km)

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
    # (Not: TANILAMA modunda kapanış dilimlerinde de calisiyor=0
    # varsayımla sağlandığından, segment hesaplaması her iki modda da
    # aynı veri -- ogretmen.kapanislar -- üzerinden yapılabilir.)
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


# --- C-katmanı: yumuşak kısıtlar (kisit-envanteri.md §4-C) -----------------
#
# Her kural bir fonksiyon; her fonksiyon etiketli CezaTerimi listesi
# döndürür. Amaç fonksiyonuna girmezler -- katmanlama ve ağırlıklandırma
# coz.kademeli_coz'un işidir (veri/kural/tercih ayrımı korunur).
#
# ÖNEMLİ modelleme ilkesi -- çift yönlü kanal: her ceza değişkeni
# gerçek duruma İKİ YÖNLÜ eşitlenir ("ceza=1 <=> ihlal var"), yalnız
# alt sınırla (ceza >= ...) bırakılmaz. Nedeni kademeli akış: Geçiş
# 2'de üst katman toplamı yalnız <= kilitle sınırlanır; tek yönlü
# kanallanan bir üst-katman değişkeni gevşek kalıp gerçek ihlalden
# BÜYÜK görünebilirdi. Karne bu değişkenlerden okunacağı (Karar: ceza
# toplama çözüm anında) ve bağımsız denetçi yeniden hesapla mutabakat
# arayacağı için gevşeklik koşuyu boşuna BAŞARISIZ sayardı.
#
# Rehberlik muafiyeti: REHBERLIK_DIGER kategorisindeki atamalar C2 ve
# C5 sayımlarına girmez (rehberlik dersi zorunlu yerleşimdir; sınır
# aşımı öğretmenin tasarrufu değildir).


@dataclass
class CezaTerimi:
    """Tek bir yumuşak-kısıt ceza teriminin etiketlerini ve çözücü değişkenini tutar.

    Terimin koşudaki fiili cezası = katsayi × degisken değeri;
    ust_sinir = katsayi × değişkenin üst sınırı (baskınlık ağırlığı
    hesabının girdisi). Etiket alanları karne kırılımını besler.
    """

    kural: str
    katsayi: int
    degisken: cp_model.IntVar
    ust_sinir: int
    ogretmen: Optional[str] = None
    sube: Optional[str] = None
    gun: Optional[int] = None


UST_KATMAN_SIRASI = ["C1", "C2", "C3"]
ALT_KATMAN_SIRASI = ["C4", "C5", "C6", "C7", "C8"]


def _c2_c5_muaf_atama_indeksleri(okul: Okul) -> set[int]:
    """C2/C5 sayımından muaf (REHBERLIK_DIGER kategorili) atamaların indekslerini döndürür."""
    kategori = {d.ad: d.kategori for d in okul.dersler}
    return {
        a_idx
        for a_idx, atama in enumerate(okul.ders_atamalari)
        if kategori.get(atama.ders) == DersKategorisi.REHBERLIK_DIGER
    }


def _ogretmen_sube_atamalari(okul: Okul) -> dict[tuple[str, str], list[int]]:
    """(öğretmen, şube) çiftlerinden o çifte ait C2/C5-sayılır atama indekslerine sözlük kurar."""
    muaf = _c2_c5_muaf_atama_indeksleri(okul)
    ciftler: dict[tuple[str, str], list[int]] = {}
    for a_idx, atama in enumerate(okul.ders_atamalari):
        if a_idx in muaf:
            continue
        for ogretmen_ad in atama.ogretmenler:
            for sube_ad in atama.subeler:
                ciftler.setdefault((ogretmen_ad, sube_ad), []).append(a_idx)
    return ciftler


def c1_bos_gun_tercih_gunu(km: KisitModeli) -> list[CezaTerimi]:
    """Kisit-envanteri C1: boş günü tercih ettiği güne denk gelmeyen öğretmene 1 ceza (tercihi olmayana terim kurulmaz).

    gun_bos çift yönlü kanallı olduğundan ceza = 1 - gun_bos eşitliği
    yeterlidir. B3'ten muaf öğretmenin de tercihi varsa terim kurulur:
    boş günü garanti değildir ama tercih günü denk gelirse ödüllenir.
    """
    terimler: list[CezaTerimi] = []
    for ogretmen in km.okul.ogretmenler:
        g = ogretmen.bos_gun_tercihi
        if g is None or g not in km.gunler:
            continue
        ceza = km.model.NewBoolVar(f"ceza_c1_{ogretmen.ad}")
        km.model.Add(ceza == 1 - km.gun_bos[(ogretmen.ad, g)])
        terimler.append(
            CezaTerimi("C1", 1, ceza, 1, ogretmen=ogretmen.ad, gun=g)
        )
    return terimler


def c2_gunluk_toplam_siniri(km: KisitModeli) -> list[CezaTerimi]:
    """Kisit-envanteri C2: öğretmenin aynı şubeye bir günde girdiği toplam saat sınırı; sınır üstü her saat 1 ceza.

    Ceza değişkeni max(0, günlük toplam - sınır) değerine İKİ YÖNLÜ
    eşitlenir (AddMaxEquality). Çiftin haftalık toplamı zaten sınırı
    aşamıyorsa hiç terim kurulmaz (ceza yapısal 0).
    """
    sinir = km.okul.kural_ayarlari.ogretmen_sube_gunluk_toplam
    terimler: list[CezaTerimi] = []
    for (ogretmen_ad, sube_ad), atama_indeksleri in sorted(
        _ogretmen_sube_atamalari(km.okul).items()
    ):
        haftalik = sum(
            km.okul.ders_atamalari[i].haftalik_saat for i in atama_indeksleri
        )
        gunluk_tavan = min(haftalik, km.okul.izgara.dilim_sayisi)
        if gunluk_tavan <= sinir:
            continue
        for g in km.gunler:
            toplam = sum(
                km.dolu[(i, g, s)] for i in atama_indeksleri for s in km.dilimler
            )
            fark = km.model.NewIntVar(
                -sinir, gunluk_tavan - sinir, f"c2_fark_{ogretmen_ad}_{sube_ad}_{g}"
            )
            km.model.Add(fark == toplam - sinir)
            asim = km.model.NewIntVar(
                0, gunluk_tavan - sinir, f"ceza_c2_{ogretmen_ad}_{sube_ad}_{g}"
            )
            km.model.AddMaxEquality(asim, [fark, km.model.NewConstant(0)])
            terimler.append(
                CezaTerimi(
                    "C2",
                    1,
                    asim,
                    gunluk_tavan - sinir,
                    ogretmen=ogretmen_ad,
                    sube=sube_ad,
                    gun=g,
                )
            )
    return terimler


def _pencere_kosusu_terimleri(
    km: KisitModeli, kural: str, kosu_uzunlugu: int
) -> list[CezaTerimi]:
    """Bir öğretmenin gününde kosu_uzunlugu ardışık pencere dilimi oluşan her konum için çift yönlü kanallı 1 ceza kurar (C3'ün yardımcısı)."""
    terimler: list[CezaTerimi] = []
    for ogretmen in km.okul.ogretmenler:
        for g in km.gunler:
            for s in km.dilimler:
                if s + kosu_uzunlugu - 1 > km.okul.izgara.dilim_sayisi:
                    break
                pencereler = [
                    km.pencere[(ogretmen.ad, g, s2)]
                    for s2 in range(s, s + kosu_uzunlugu)
                ]
                # Segment sınırındaki sabit 0'lar koşuyu imkânsız kılar.
                if any(isinstance(p, int) for p in pencereler):
                    continue
                kosu = km.model.NewBoolVar(f"ceza_{kural.lower()}_{ogretmen.ad}_{g}_{s}")
                km.model.AddBoolAnd(pencereler).OnlyEnforceIf(kosu)
                km.model.AddBoolOr([p.Not() for p in pencereler]).OnlyEnforceIf(
                    kosu.Not()
                )
                terimler.append(
                    CezaTerimi(kural, 1, kosu, 1, ogretmen=ogretmen.ad, gun=g)
                )
    return terimler


def c3_uc_saatlik_pencere(km: KisitModeli) -> list[CezaTerimi]:
    """Kisit-envanteri C3: 3 ardışık pencere dilimi oluşan her konuma yüksek katman cezası (≥4 zaten SERT, B6)."""
    return _pencere_kosusu_terimleri(km, "C3", 3)


def c4_tek_saatlik_gun(km: KisitModeli) -> list[CezaTerimi]:
    """Kisit-envanteri C4: öğretmenin bir günde toplam 1 saat dersi olması (1 saat için okula gelme) 1 ceza."""
    terimler: list[CezaTerimi] = []
    for ogretmen in km.okul.ogretmenler:
        for g in km.gunler:
            toplam = sum(km.calisiyor[(ogretmen.ad, g, s)] for s in km.dilimler)
            tekli = km.model.NewBoolVar(f"ceza_c4_{ogretmen.ad}_{g}")
            km.model.Add(toplam == 1).OnlyEnforceIf(tekli)
            km.model.Add(toplam != 1).OnlyEnforceIf(tekli.Not())
            terimler.append(
                CezaTerimi("C4", 1, tekli, 1, ogretmen=ogretmen.ad, gun=g)
            )
    return terimler


def c5_ardisiklik_siniri(km: KisitModeli) -> list[CezaTerimi]:
    """Kisit-envanteri C5: öğretmenin aynı şubede sınır+1 ardışık dilim doldurduğu her konuma, dilimlerin tümü TEK bloğa ait değilse 1 ceza (blok içi muaf).

    "Farklı-atama zinciri" modellemesi: pencere = ardisiklik_siniri + 1
    uzunluklu her kayan dilim aralığı için (a) aralığın tamamı bu
    öğretmen×şube çiftince dolu mu (zincir_dolu) ve (b) aralığın tamamını
    TEK bir blok başlangıcı mı kapsıyor (ayni_blok) çift yönlü kanallanır;
    ceza <=> zincir_dolu VE DEĞİL ayni_blok. B4 gereği aynı atamanın iki
    bloğu aynı güne düşemeyeceğinden tek atamalık sahte zincir oluşamaz.
    """
    sinir = km.okul.kural_ayarlari.ardisiklik_siniri
    pencere_boyu = sinir + 1
    terimler: list[CezaTerimi] = []
    for (ogretmen_ad, sube_ad), atama_indeksleri in sorted(
        _ogretmen_sube_atamalari(km.okul).items()
    ):
        haftalik = sum(
            km.okul.ders_atamalari[i].haftalik_saat for i in atama_indeksleri
        )
        if haftalik < pencere_boyu:
            continue
        for g in km.gunler:
            for s in km.dilimler:
                if s + pencere_boyu - 1 > km.okul.izgara.dilim_sayisi:
                    break
                aralik = range(s, s + pencere_boyu)
                doluluklar = [
                    km.dolu[(i, g, s2)] for i in atama_indeksleri for s2 in aralik
                ]
                zincir_dolu = km.model.NewBoolVar(
                    f"c5_zincir_{ogretmen_ad}_{sube_ad}_{g}_{s}"
                )
                km.model.Add(sum(doluluklar) == pencere_boyu).OnlyEnforceIf(zincir_dolu)
                km.model.Add(sum(doluluklar) <= pencere_boyu - 1).OnlyEnforceIf(
                    zincir_dolu.Not()
                )

                kapsayanlar = [
                    var
                    for a_idx in atama_indeksleri
                    for (b_idx, s0, var) in km.basla_gun_indeksi.get((a_idx, g), [])
                    if s0 <= s
                    and s0 + km.okul.ders_atamalari[a_idx].blok_deseni[b_idx] - 1
                    >= s + pencere_boyu - 1
                ]
                ceza = km.model.NewBoolVar(
                    f"ceza_c5_{ogretmen_ad}_{sube_ad}_{g}_{s}"
                )
                if kapsayanlar:
                    ayni_blok = km.model.NewBoolVar(
                        f"c5_ayni_blok_{ogretmen_ad}_{sube_ad}_{g}_{s}"
                    )
                    km.model.AddMaxEquality(ayni_blok, kapsayanlar)
                    km.model.AddBoolAnd([zincir_dolu, ayni_blok.Not()]).OnlyEnforceIf(
                        ceza
                    )
                    km.model.AddBoolOr([zincir_dolu.Not(), ayni_blok]).OnlyEnforceIf(
                        ceza.Not()
                    )
                else:
                    km.model.Add(ceza == zincir_dolu)
                terimler.append(
                    CezaTerimi(
                        "C5", 1, ceza, 1, ogretmen=ogretmen_ad, sube=sube_ad, gun=g
                    )
                )
    return terimler


def c6_pencere_dilim_cezasi(km: KisitModeli) -> list[CezaTerimi]:
    """Kisit-envanteri C6: her pencere dilimine hafif (birim) ceza.

    Modelleme notu: ceza pencere-başına değil DİLİM-başına verilir
    (1 saatlik pencere 1, 2 saatlik 2 birim). 3 saatlik pencerenin
    dilimleri de burada sayılır; C3 aynı pencereyi üst katmanda ayrıca
    cezalandırır -- katmanlar ayrı optimize edildiğinden bu bilinçli
    bir üst üste binmedir (uzun pencere her iki ölçekte de kötüdür).
    """
    terimler: list[CezaTerimi] = []
    for (ogretmen_ad, g, s), p in km.pencere.items():
        if isinstance(p, int):
            continue
        terimler.append(CezaTerimi("C6", 1, p, 1, ogretmen=ogretmen_ad, gun=g))
    return terimler


def c7_kategori_ardisikligi(km: KisitModeli) -> list[CezaTerimi]:
    """Kisit-envanteri C7: aynı şubede aynı kategoriden iki FARKLI ders ardışık dilimlere düşerse 1 ceza (blok içi muaf; DIL kategorisi tamamen muaf).

    Ardışık (s, s+1) çifti için: iki dilim de o kategoriden dolu mu
    (cift_dolu) ve ikisini TEK blok mu kapsıyor (kopru: aynı ders,
    tanım gereği muaf) kanallanır; ceza <=> cift_dolu VE DEĞİL kopru.
    Aynı kategoriden iki farklı atama B1 gereği aynı dilimde çakışamaz,
    dolayısıyla cift_dolu doğruysa dilimler ya tek bloğun ya iki farklı
    dersin dilimleridir. (Aynı dersin iki ayrı bloğu B4 gereği aynı güne
    düşemez; kategori değil ders kimliği üzerinden ayrım gerekmez.)
    """
    kategori = {d.ad: d.kategori for d in km.okul.dersler}
    terimler: list[CezaTerimi] = []
    for sube in km.okul.subeler:
        for kat in DersKategorisi:
            if kat == DersKategorisi.DIL:
                continue
            ilgili = [
                a_idx
                for a_idx, atama in enumerate(km.okul.ders_atamalari)
                if sube.ad in atama.subeler and kategori.get(atama.ders) == kat
            ]
            farkli_dersler = {km.okul.ders_atamalari[i].ders for i in ilgili}
            if len(farkli_dersler) < 2:
                continue  # Tek ders: ardışıklık ya blok içidir ya imkânsız (B4).
            for g in km.gunler:
                for s in km.dilimler[:-1]:
                    cift = [
                        km.dolu[(i, g, s2)] for i in ilgili for s2 in (s, s + 1)
                    ]
                    cift_dolu = km.model.NewBoolVar(
                        f"c7_cift_{sube.ad}_{kat.name}_{g}_{s}"
                    )
                    km.model.Add(sum(cift) == 2).OnlyEnforceIf(cift_dolu)
                    km.model.Add(sum(cift) <= 1).OnlyEnforceIf(cift_dolu.Not())

                    kapsayanlar = [
                        var
                        for a_idx in ilgili
                        for (b_idx, s0, var) in km.basla_gun_indeksi.get((a_idx, g), [])
                        if s0 <= s
                        and s0 + km.okul.ders_atamalari[a_idx].blok_deseni[b_idx] - 1
                        >= s + 1
                    ]
                    ceza = km.model.NewBoolVar(
                        f"ceza_c7_{sube.ad}_{kat.name}_{g}_{s}"
                    )
                    if kapsayanlar:
                        kopru = km.model.NewBoolVar(
                            f"c7_kopru_{sube.ad}_{kat.name}_{g}_{s}"
                        )
                        km.model.AddMaxEquality(kopru, kapsayanlar)
                        km.model.AddBoolAnd([cift_dolu, kopru.Not()]).OnlyEnforceIf(
                            ceza
                        )
                        km.model.AddBoolOr([cift_dolu.Not(), kopru]).OnlyEnforceIf(
                            ceza.Not()
                        )
                    else:
                        km.model.Add(ceza == cift_dolu)
                    terimler.append(
                        CezaTerimi("C7", 1, ceza, 1, sube=sube.ad, gun=g)
                    )
    return terimler


def c8_dilim_tercihleri(km: KisitModeli) -> list[CezaTerimi]:
    """Kisit-envanteri C8: sayısal dersler sabaha, sanat-spor son saatlere -- kategoriye göre dilim ceza vektörü × doluluk.

    Yeni değişken kurulmaz: dolu zaten çift yönlü kanallıdır; terim,
    katsayısı vektörden gelen mevcut dolu değişkenidir.
    """
    kategori = {d.ad: d.kategori for d in km.okul.dersler}
    vektorler = {
        DersKategorisi.SAYISAL: km.okul.kural_ayarlari.sayisal_dilim_cezasi,
        DersKategorisi.SANAT_SPOR: km.okul.kural_ayarlari.sanat_spor_dilim_cezasi,
    }
    terimler: list[CezaTerimi] = []
    for a_idx, atama in enumerate(km.okul.ders_atamalari):
        vektor = vektorler.get(kategori.get(atama.ders))
        if vektor is None:
            continue
        sube_etiketi = ",".join(atama.subeler)
        for g in km.gunler:
            for s in km.dilimler:
                katsayi = vektor[s - 1] if s - 1 < len(vektor) else 0
                if katsayi <= 0:
                    continue
                terimler.append(
                    CezaTerimi(
                        "C8",
                        katsayi,
                        km.dolu[(a_idx, g, s)],
                        katsayi,
                        ogretmen=atama.ogretmenler[0] if atama.ogretmenler else None,
                        sube=sube_etiketi,
                        gun=g,
                    )
                )
    return terimler


def yumusak_kurallari_kur(km: KisitModeli) -> dict[str, list[CezaTerimi]]:
    """C1-C8 ceza terimlerini kurup kural adına göre sözlükte toplar (amaç fonksiyonu kurmaz -- o coz.kademeli_coz'un işidir).

    KuralAyarlari.kapali_kurallar kümesindeki kurallar hiç kurulmaz:
    sözlükte boş listeyle yer alırlar (katman toplamına 0 katkı,
    baskınlık hesabında 0 tavan); denetçi mutabakatı da aynı kümeyi
    gözettiğinden kapalı kural karnede "kapalı" görünür.
    """
    kurucular = {
        "C1": c1_bos_gun_tercih_gunu,
        "C2": c2_gunluk_toplam_siniri,
        "C3": c3_uc_saatlik_pencere,
        "C4": c4_tek_saatlik_gun,
        "C5": c5_ardisiklik_siniri,
        "C6": c6_pencere_dilim_cezasi,
        "C7": c7_kategori_ardisikligi,
        "C8": c8_dilim_tercihleri,
    }
    kapali = km.okul.kural_ayarlari.kapali_kurallar
    return {
        kural: ([] if kural in kapali else kurucu(km))
        for kural, kurucu in kurucular.items()
    }


def baskinlik_agirliklari(
    oncelik_sirasi: list[str], terimler: dict[str, list[CezaTerimi]]
) -> dict[str, int]:
    """Katman içi öncelik sırası için baskınlık ağırlıklarını hesaplar.

    İlke (onaylı uygulama kararı): bir kuralın birim cezası, kendinden
    düşük öncelikli TÜM kuralların ulaşabileceği ağırlıklı toplam
    cezadan büyük olmalı -- böylece üstteki kuralın 1 birim iyileşmesi
    alttakilerin hiçbir kombinasyonuyla takas edilemez. Ağırlıklar elle
    sabitlenmez; her koşuda terimlerin üst sınırlarından hesaplanır.
    """
    agirliklar: dict[str, int] = {}
    alt_agirlikli_tavan = 0
    for kural in reversed(oncelik_sirasi):
        agirliklar[kural] = alt_agirlikli_tavan + 1
        kural_tavani = sum(t.ust_sinir for t in terimler.get(kural, []))
        alt_agirlikli_tavan += agirliklar[kural] * kural_tavani
    return agirliklar
