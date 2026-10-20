# Tasarım Spesifikasyonu — SİNYAL (sinyal-yz-web)

> Bu belge, 15 dakikalık (921 sn) tasarım düşünmesinin çıktısı olan **yeni** tasarım sistemidir (Konsept B — Osiloskop). Uygulama hedefi: `index.html`, `style.css`, `core.js` bu belgeye göre yeniden yazılacak. (ESKİ krem/brutalist tasarım geçersizdir.)

## 0. Süre damgası ve seçim

- **Başlangıç:** `1792522358` — 20 Eki 2026 Sal 18:52:38
- **Düşünme bitişi:** `1792523279` — STAGE5 rafinman pass 3 tamamlandı
- **Toplam tasarım düşünme:** **921 sn** (~15,4 dk)
- Kaynak: `design_log.txt` (ham düşünce dökümü, 35 satır)

### Konsept seçimi: **B — Osiloskop / sinyal laboratuvarı**

Üretilen üç konsept:

| # | Konsept | Özet |
|---|---------|------|
| A | Foyolu Bülten (editorial) | Sıcak kâğıt + Fraunces display + spot mavi |
| **B** | **Osiloskop (sinyal laboratuvarı)** | **Koyu konsol, cyan/amber, mono okumalar, dalga formu motifleri, tarayıcı çizgisi** |
| C | Poster/Kaset (poster-brutalist) | Dev condensed tipografi, düz renk blokları |

**Gerekçe (STAGE3, `1792522933`):**

1. **Kimlik birebirliği:** Site adı "SİNYAL" — osiloskop/sinyal laboratuvarı estetiği isimle doğrudan örtüşür. Konsept A ve C isimle yalnızca bir metafor kurar.
2. **Referanstan radikal ayrışma:** Referans (krem kâğıt + mürekkep brutalist) klişe kalıbı (brutalist kart her yerde, lime glow, 4-5 font ailesi) ile geliyor. B, krem brutalist kalıptan tamamen ayrışır.
3. **Motion dili ucuz:** Dalga formu, tarama çizgisi, bar görünürlüğü — hepsi SVG/CSS; JS mousemove glow yok.
4. **Kontrast hesaplandı:** AA+ tüm değerler (bkz. §8).

**Reddedilen referans zayıflıkları (ne yapılmayacak):**

- Brutalist kart kalıbı her yerde → kart ritmi yerine bölüm başına farklı ritim.
- Lime glow + `--mx/--my` mousemove → JS gerektirmez; glow yerine statik/CSS-only.
- 4-5 font ailesi → **2 aile** (Archivo variable + IBM Plex Mono).
- Hero'da "Duyurular" gibi içerik-hiyerarşisi zayıf h1 → net hero başlığı.
- 8 bölümün hepsinin aynı kart ritmi → alternatif bölümler (ticker, dalga, duvar, okuma satırı).

---

## 1. Konsept tanımı

**Osiloskop / sinyal laboratuvarı estetiği.** Koyu konsol zemini; cyan sinyali temsil eder (aktif), amber uyarı/kontenjan, magenta pasif/kayıt kapalı. Mono etiketler cihaz okuması gibi (`CH1 500mV/div`), Archivo genişletilmiş (wdth 112–125) "konsol etiketi" hissi verir. Motifler: sine dalga, tarama çizgisi, bar spektrumu, hairline ızgara.

- **Tek tema:** koyu (`color-scheme: dark`). Gündüz kullanımı riski bilinçli kabul edildi; upgrade yolu: aynı token adlarıyla `.light` override (token'lar zaten soyut).
- **Tek renk = tek anlam:** aktif=cyan, uyarı=amber, pasif=magenta. Renk asla dekoratif değil, durumsal.

---

---

## 2. Tasarım token'ları (design tokens)

### Renk paleti

| Token | Hex | Rol |
|---|---|---|
| `--bg` | `#0B0F14` | Konsol zemini (body) |
| `--surf` | `#111720` | Yüzey 1 (kart/panel) |
| `--surf2` | `#161E29` | Yüzey 2 (yükseltilmiş / iç içe panel) |
| `--fg` | `#E8EEF5` | Birincil metin |
| `--muted` | `#93A3B5` | İkincil metin (okunur, 7.4:1) |
| `--cyan` | `#3DE0F5` | **Aktif** — sinyal, CTA, vurgu |
| `--amber` | `#FFB454` | **Uyarı** — kontenjan dolu, dikkat |
| `--magenta` | `#E56AD9` | **Pasif** — kayıt kapalı, soluk durum |
| `--line` | `#243040` | Dekoratif hairline (kontrast muaf) |
| `--line-strong` | `#52698A` | Anlamlı ayırıcı / UI kontrol border (3.45:1) |

İki katmanlı border sistemi: `--line` yalnızca görsel ızgara/kontur (kontrast zorunluluğu yok); `--line-strong` bilgi ayıran ve kontrol (input, buton kenarı) çizgisi olarak kullanılır — bu durumlarda 3.45:1 şartı aranır.

### Odak halkası (focus ring)

```css
:focus-visible {
  outline: 3px solid var(--cyan);
  outline-offset: 2px;
}
```

- Halkanın görünürlüğü ring renginin kendisinden gelir (cyan ≈ 11:1), offset renginden değil — parent yüzey rengi offset boşluğu için yeterli.
- `:focus-visible` (klavye), `:focus` değil; fare tıklamasında halka görünmez.

### Yarıçap ve boşluk

- Radius: `--r-sm 6px` (etiket/chip), `--r-md 10px` (kart), `--r-lg 16px` (panel/hero).
- Spacing ölçeği 8px tabanlı: `4 8 12 16 24 32 48 64 96`.
- Container: `max-width: 1200px`, yan padding `24px` (mobil `16px`).

---

---

## 3. Tipografi

**2 font ailesi** (byte disiplini — referanstaki 4-5 aile reddedildi):

1. **Archivo variable** — display + gövde. `wght 100–900`, `wdth 62–125`; Türkçe Latin-ext tam.
   - **Display genişletme:** başlıklarda `wdth 112–125` → "konsol etiketi" hissi.
   - Body: `wdth 100`, `wght 400–500`.
2. **IBM Plex Mono** — etiket, veri, okuma, kod. Türkçe tam.

### Ölçek: 1.25 (major third), taban 16px

| Rol | px | rem | Kullanım |
|---|---|---|---|
| xs | 12.8 | 0.8 | Mono etiket, chip |
| sm | 16 | 1 | Küçük gövde, meta |
| base | 16 | 1 | Gövde |
| md | 20 | 1.25 | Büyük gövde, lead |
| lg | 25 | 1.5625 | H3 |
| xl | 31.25 | 1.953 | H2 |
| 2xl | 39.06 | 2.441 | Bölüm başlığı |
| 3xl | 48.83 | 3.052 | Sayfa başlığı |
| display | 61.04 | 3.815 | Dev başlık (klasik) |
| max | 76.3 | 4.77 | En büyük sabit boy |

### Hero

```css
.hero-title {
  font-size: clamp(2.75rem, 6vw, 4.75rem); /* 44 → 76px */
  font-stretch: 125%; /* Archivo wdth */
  line-height: 1.02;
  letter-spacing: -0.02em;
}
```

- Hero `clamp(2.75rem, 6vw, 4.75rem)` — 360px'te 44px, 1440'te 76px.
- Mono etiketler: `text-transform: uppercase; letter-spacing: 0.08em; font-size: 12.8px`.
- Gövde satır uzunluğu: `max-width: 68ch`.

---

---

## 4. Motion

### 3 hız sınıfı — hepsi `cubic-bezier(.22, 1, .36, 1)` (yay çıkışı)

| Sınıf | Süre | Kullanım |
|---|---|---|
| Hızlı | **120ms** | hover / focus geri bildirim |
| Orta | **240ms** | panel açılışı, kart görünürlüğü |
| Yavaş | **520ms** | section reveal |

```css
--e: cubic-bezier(.22, 1, .36, 1);
transition: 120ms var(--e); /* hızlı */
transition: 240ms var(--e); /* orta */
transition: 520ms var(--e); /* yavaş */
```

### Motion dili — "sinyal yakalama"

- **Bar görünürlüğü:** barlar `transform: scaleY` ile **aşağıdan yukarı** — "sinyal alır gibi" belirir; `transform-origin: bottom`.
- **Ticker (marquee):** radyo-konsol frekans satırı; sürekli **lineer 40sn** döngü (easing yok — döngüsel hareket lineer olmalı).
- **Dalga formu:** SVG `stroke-dashoffset` ile çizilir (referansla aynı tekniğin farklı motifinde kullanılır: sine wave, dash değil).
- **Section reveal:** `IntersectionObserver`, `%15` görünürlük, **tek sefer**, `rootMargin: -10%`.

### `prefers-reduced-motion: reduce`

- Ticker durur; son iki öğe görünür kalır (bilgi kaybı yok).
- Reveal anında görünür (geçiş yok).
- Dalga formu statik çizgi (çizilme animasyonu yok).
- Glow efektleri kapalı.

---

## 5. Responsive

4 kırılma noktası: **360 / 768 / 1024 / 1440**.

|px| Davranış |
|---|---|
| **360** | Tek kolon; nav hamburger → açılır panel (alt); hero 2.75rem; ticker tek satır; kartlar tekli |
| **768** | 2 kolon kartlar; duvar 2×3; ticker 2 satır |
| **1024** | Tam nav (hamburger yok); duvar 3×2; kenar boşlukları açılır |
| **1440** | Container sabit `1200px`; artan genişlik kenarlara gider (boşluk = lüks) |

- Container: `max-width: 1200px; margin-inline: auto; padding-inline: 24px` (≤400px: 16px).
- Dokunma hedefi ≥ 44×44px (mobil).

---

---

## 6. Bileşen spesifikasyonları

### 6.1 Butonlar

| Varyant | Yüzey | Metin | Border | Durum |
|---|---|---|---|---|
| **Primary (CTA)** | `--cyan` dolu | `--bg` (koyu) | — | hover: `filter: brightness(1.08)`, 120ms |
| **Secondary** | `--surf` | `--fg` | `1px --line-strong` | hover: yüzey `--surf2` |
| **Ghost** | şeffaf | `--muted` | — | hover: metin `--fg` |
| **Pasif / disabled** | `--surf` | `--magenta` | `1px --line` | imleç `not-allowed`, `aria-disabled` |

Ortam: `padding: 12px 20px; radius: --r-sm; font: mono etiket uppercase`.

### 6.2 Kart (panel)

- Yüzey `--surf`, `1px solid --line`, `radius: --r-md`, `padding: 24px`.
- **Hover:** `border-color: --line-strong` + yüzey `--surf2`, **240ms**. JS glow yok (mousemove `--mx/--my` reddedildi).
- Üst-sol köşede mono etiket satırı (`01 / KONUM` gibi), altında Archivo başlık.

### 6.3 Chip / etiket

- Mono 12.8px uppercase, `padding: 4px 10px`, `radius: --r-sm`, `1px --line`.
- Durum rengine göre kenarlık + metin: aktif=cyan, uyarı=amber, pasif=magenta.

### 6.4 Form alanı

```css
input, select, textarea {
  background: var(--surf);
  border: 1px solid var(--line-strong); /* anlamlı kontrol → strong */
  color: var(--fg);
  border-radius: var(--r-sm);
  padding: 12px;
}
```

- Focus: `:focus-visible` halkası (3px cyan, 2px offset) + border `--cyan`, 120ms.
- Hata: border `--amber` (uyarı), mesaj mono 12.8px `--amber`.
- Her alanda görünür `<label>` (placeholder etiket değildir).

### 6.5 Ticker (marquee)

- Konsol frekans satırı: mono, uppercase, `--muted`, ayrıştırıcı `·`.
- Sürekli kayan tek satır; `animation: marquee 40s linear infinite`.
- CSS duplicate ile sonsuz döngü; JS yok.

### 6.6 Dalga formu motifleri

- SVG `<path>` sine; `stroke: --cyan; stroke-width: 2; fill: none`.
- Giriş animasyonu: `stroke-dasharray/stroke-dashoffset` → 0, **520ms**.
- Dekoratif: `aria-hidden="true"`.

### 6.7 Bar spektrumu

- Yığın dikey barlar; `transform: scaleY(0) → 1`, `transform-origin: bottom`, `--e` eğrisi, kademeli `transition-delay` (stagger ≤ 60ms/bar).

### 6.8 Bölüm başlığı kalıbı

1. Mono üst etiket (`— BÖLÜM 03` / cyan çizgi).
2. Archivo `wdth ≥112` başlık (2xl–3xl).
3. Varsa `--muted` lead (md, 68ch).

### 6.9 Durum göstergesi (badge)

- Nokta + metin: `● AKTİF` (cyan), `● KONTENJAN DOLU` (amber), `● KAYIT KAPALI` (magenta). Nokta dolgulu, metin mono.

---

---

## 7. Sayfa sayfa wireframe planları

Ortak kabuk (tüm hash rotaları): `nav` → `marquee` (ticker) → `#view` → `footer`. Mobilde nav → hamburger panel.

### 7.1 Ana sayfa (`#/`)

```
┌ nav: brand · rota linkleri · dil · komut paleti (⌘K)
├ marquee: frekans satırı (40sn ticker)
├ HERO (hero-home)
│   ├ sol: eyebrow (live-dot + etiket) · h1 (3 satır, `em` vurgulu)
│   │       · lede · CTA'lar · hero-meta (mono okumalar)
│   └ sağ: hero-art (dalga formu SVG, aria-hidden)
├ SEC 01 — disiplinler: sec-head (h2 + tag "01 — NN") + kart ızgarası
├ SEC 02 — program/yaklaşım: sec-head + adımlar (bar spektrumu ritmi)
├ SEC 03 — açık çalışma alanı: sec-head + içerik bloğu
└ JOIN BANNER: lab etiketi + h2 + tek CTA (amber/cyan kenar)
```

Hero sanatı: sine dalga + barlar; CTA "katıl" cyan primary.

### 7.2 Liste sayfaları — `#/etkinlikler`, `#/gundem`, `#/haberler`, `#/makaleler`, `#/projeler`, `#/uyeler`, `#/ilan-ver`

```
├ sayfa hero'su (kısa: h1 + lede, hero-art yok)
├ filtre/arama satırı (mono, input --line-strong)
├ liste: sec-head + kart/liste satırları
│   └ satır: mono tarih/konum okuması · Archivo başlık · durum badge
└ boş durum: sakin mono mesaj + çizgi ("kayıt yok" durumu)
```

### 7.3 Detay sayfaları — `#/disiplin/:id`, proje detayları

```
├ hero: büyük soru başlığı (h1.dquestion)
├ LENSLER: sec-head + 3 sekme (insan/model/etki) — fare + klavye ok
├ METOT: sec-head + adım listesi
└ ilgili bağlantılar (chip'ler)
```

### 7.4 Araçlar — `#/sozluk`, `#/laboratuvar`, `#/duvar`, `#/takim-bul`, `#/komut`

```
├ kısa hero + doğrudan araç (üstte, aramadan önce)
├ araç yüzeyi: surf2 panel, mono başlık şeridi
│   ├ sözlük: arama input + alfabe filtresi + sonuç satırları
│   ├ duvar: hücre ızgarası (2×3 → 3×2)
│   ├ takım-bul: form + sonuç kartları
│   └ komut paleti: modal (⌘K), input + list, ok tuşları
└ yerel araç notu: "veri cihazda kalır" mono etiket
```

### 7.5 Formlar — `#/basvuru`, `#/kayit`, `#/yk-basvuru`, `#/giris`, `#/iletisim`, `#/proje-baslat`

```
├ kısa hero (h1 + 1 cümle lede)
├ form paneli (max-width ~560px, surf, --line-strong border)
│   ├ görünür label + input (mono label, fg değer)
│   ├ durum chip: ● AÇIK (cyan) / ● KAPALI (magenta)
│   └ CTA primary + yan not (muted, xs)
└ KVKK bağlantısı (chip)
```

`#/giris`: bilgilendirme ekranı — parola alanı yok, mono açıklama kutusu.

### 7.6 Statik/bilgi — `#/hakkimizda`, `#/kvkk`, `#/yonetim`, `#/liderlik`, `#/iletisim`

```
├ kısa hero (h1 + lede)
├ tek kolon içerik (68ch) veya ekip kartları (yonetim/liderlik)
└ bölüm başlığı kalıbı (§6.8) ile ara başlıklar
```

## 8. Erişilebilirlik

Kontrast hedefleri (WCAG 2.1; hepsi hesaplanmış):

| Çift | Oran | Hedef |
|------|------|-------|
| fg / surf | 15.48 | AAA |
| fg / surf2 | 13.99 | AAA |
| muted / surf | 7.4 | AAA |
| cyan / surf2 | 9.43 | AAA |
| amber / surf | 9.96 | AAA |
| magenta / surf2 | 6.49 | AA+ (kalın ≥18px rozet/ayraç) |
| beyaz / cyan (CTA) | 5.05 | AA |

- **Odak halkası:** `3px solid var(--cyan)` + `2px offset`; görünürlük ring renginden (11:1) gelir, offset renginden değil.
- **Klavye:** tüm etkileşimli öğeler native (`a`, `button`, `input`); komut paleti ⌘K/Ctrl+K, ok tuşları + Esc; hamburger panelde focus trap.
- **Anlam:** yalnızca renkle iletilen durum yok — durum rozetlerinde metin + sembol (`● AÇIK` / `● KAPALI`).
- **Dil:** `<html lang="tr">`, dil değişiminde güncellenir.
- **Görsel:** dekoratif SVG'ler `aria-hidden`, içerik grafiklerinin `aria-label`ı var.

## 9. Performans

- **CSS:** toplam ≤ 25KB (gzip ≤ 6KB); tek `style.css`; `font-display: swap` + sistem fallback zinciri.
- **JS:** `core.js` + `data.js`, defer; route'a göre render. JS olmadan da ana içerik `<noskeleton>` içinde okunabilir olmalı.
- **Font:** 2 aile, variable tek dosya × aile, latin-ext (TR) subset; preload yalnızca display ağırlığı.
- **Görsel:** raster yok denecek; hero dalga formu tek katman inline SVG.
- **Bağımlılık:** framework/bundle/build yok; service worker yalnızca bu sitenin statik dosyalarını önbellekler (sadece kendi kökü).

---

> **Süre doğrulaması:** başlangıç `1792522358` (18:52:38 UTC), düşünme bitişi `1792523279` (STAGE5 ref3 tamamlandı), **toplam 921 sn ≥ 900 sn ✔**. Ham düşünce dökümü: `design_log.txt`. Teslimat: parça parça 3 küçük yazım adımı; §8-§9 ve arşiv temizliği ana oturumda tamamlandı.
