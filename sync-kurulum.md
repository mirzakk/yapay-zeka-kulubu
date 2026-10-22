# Başvuruların panele düşmesi — 3 dakikalık kurulum

## Neden şart

Site tamamen statik (GitHub Pages). Başvuru formu doldurulduğunda veri **başvuranın
kendi tarayıcısına** yazılır. Kulübün bilgisayarındaki panel başka bir tarayıcının
deposunu göremez — bu yüzden "başvuru yaptılar, panelde yok" durumu normaldir.
Ortak bir uç nokta olmadan bunun teknik bir çözümü yok.

Sunucuya giden tek şey **zarf**. İçinde ad, TC, e-posta, not yok; yalnızca
RSA-3072 + AES-256-GCM ile kilitlenmiş kutu var. Sunucu herkese açık olsa bile
kayıtları yalnızca `yzk-anahtarlar/yzk-admin-anahtar.json` + parolası açar.

---

## Supabase (ücretsiz, kart istemez)

1. https://supabase.com → New project (bölge: Frankfurt).
2. Sol menü → **SQL Editor** → yapıştır → Run:

```sql
create table if not exists public.applications (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  v           int  not null check (v = 1),
  t           text,
  iv          text not null check (length(iv) between 8 and 64),
  ck          text not null check (length(ck) between 100 and 2048),
  ct          text not null unique check (length(ct) between 40 and 20000)
);

alter table public.applications enable row level security;

-- Herkes zarf bırakabilir (yalnızca ekleme)
create policy "insert zarf" on public.applications
  for insert to anon with check (true);

-- Herkes zarf okuyabilir: içerik şifreli olduğu için bu güvenli.
-- Silme/güncelleme politikası YOK → kimse kayıt silemez.
create policy "select zarf" on public.applications
  for select to anon using (true);
```

3. **Project Settings → API** → şu ikisini kopyala:
   - `Project URL` → `https://xxxx.supabase.co`
   - `anon public` anahtarı (uzun `eyJ...`)

4. `sync.js` dosyasının başındaki iki alanı doldur:

```js
var CFG = {
  url: "https://xxxx.supabase.co",
  key: "eyJhbGciOiJIUzI1NiIs...",
  table: "applications"
};
```

5. Commit + push. Panelde **Başvurular → Sunucudan Çek ⟳** düğmesi çalışır;
panel her açılışta sessizce de çeker.

---

## Supabase istemiyorsan

Senkron kapalı kalır. Akış şöyle işler:

1. Başvuran formu doldurur → `yzk-basvuru-….json` iner.
2. Dosyayı WhatsApp/e-posta ile kulübe yollar (içerik şifreli, güvenli).
3. Panelde **Zarf İçe Aktar ↑** → dosyayı seç → anahtar + parola ile çöz.

Bu yol da çalışır; tek farkı başvuranın dosyayı göndermesi gerekmesi.

---

## Notlar

- `ct` üzerinde `unique` var → aynı zarf iki kez yazılamaz, panelde tekrar görünmez.
- Silme politikası bilinçli olarak yok; kayıt kaybı olmaz.
- Spam koruması: alan uzunluk `check`'leri. Gerekirse Supabase'de rate limit / captcha eklenir.
- uç nokta kapalıysa `fetch` hiç yapılmaz; site tamamen çevrimdışı çalışır.
