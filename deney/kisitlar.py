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

from model import DersAtamasi, KapanisNedeni, Ogretmen, Okul


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
    """Cevrim-tablosu §1 B3: dışOkul kapanışı olmayan günler üzerinden her öğretmene en az bir tam boş gün garanti eder (öğretmen başına bir varsayım anahtarı, tanılama modunda)."""
    for ogretmen in km.okul.ogretmenler:
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
                km.basla[(a_idx, b_idx, gg, s)]
                for (a_idx2, b_idx, gg, s) in km.basla
                if a_idx2 == a_idx and gg == g
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
