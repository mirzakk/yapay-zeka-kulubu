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

## Firebase Realtime Database — şu an kullanılan

`sync.js` içinde `provider: "rtdb"` ve veritabanı URL'i hazır. Başvurular
doğrudan oraya düşüyor, panel açılışta çekiyor.

### Kuralları sıkılaştır (ÖNEMLİ)

Realtime Database → **Rules** → şunu yapıştır:

```json
{
  "rules": {
    "applications": {
      "$id": {
        ".read": true,
        ".write": "!data.exists()"
      }
    }
  }
}
```

Ne yapar:
- `.read: true` → panel zarfları okuyabilir. İçerik şifreli olduğu için bu güvenli.
- `.write: "!data.exists()"` → herkes **yeni** kayıt ekleyebilir, ama var olanı
  **silemez ve değiştiremez**. `write: true` bırakılırsa biri tüm başvuruları
  tek istekle silebilir (veri kaybı).

### Test

```bash
DB="https://yapay-zeka-klubu-default-rtdb.europe-west1.firebasedatabase.app"
curl -s -X POST "$DB/applications.json" -H "Content-Type: application/json" \
  -d '{"v":1,"t":"b","iv":"aaaaaaaaaaaa","ck":"'$(head -c 200 /dev/zero | tr '\0' 'x')'","ct":"'$(head -c 120 /dev/zero | tr '\0' 'y')'"}'
curl -s "$DB/applications.json"
```

### Sınırlar
- RTDB'de `unique` kısıtı yok → tekilleştirme panelde `ct` ile yapılır.
- Okuma açık olduğu için zarflar herkese görünür; **içerik çözülemez**, anahtar sitede yok.
- Spam mümkün (yeni kayıt ekleme serbest). Gerekirse kurala tarih/boyut kontrolü
  veya App Check eklenir.

---

## Firebase (Firestore) — Supabase yerine

Supabase hesabı istemiyorsan aynı işi Firebase ile yapabilirsin. Ücretsiz Spark
planı yeterli (kart istemez).

1. https://console.firebase.google.com → **Add project** → ad ver → Google Analytics'i kapat.
2. Sol menü → **Build → Firestore Database** → **Create database** → *Production mode* → bölge: `europe-west1`.
3. **Rules** sekmesine yapıştır → Publish:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /applications/{doc} {
      // Herkes zarf bırakabilir — yalnızca bu 5 alan ve boyut sınırıyla
      allow create: if request.resource.data.keys().hasOnly(['v','t','iv','ck','ct'])
                    && request.resource.data.ct is string
                    && request.resource.data.ct.size() < 20000
                    && request.resource.data.ck is string
                    && request.resource.data.ck.size() < 4096;
      // Okuma açık: içerik şifreli, anahtar sitede yok
      allow read: if true;
      // Güncelleme/silme yok → kayıt kaybı olmaz
      allow update, delete: if false;
    }
  }
}
```

4. **Project settings ⚙ → General → Your apps → Web (`</>`)** ile bir web app ekle.
   `firebaseConfig` içinden şu ikisini al: `projectId` ve `apiKey`.
5. `sync.js` başındaki bloğu doldur:

```js
var CFG = {
  provider: "firebase",
  supabase: { url: "", key: "", table: "applications" },
  firebase: {
    projectId: "yzk-xxxxx",              // ör. yzk-1a2b3
    apiKey: "AIzaSy...",                 // Web API key (gizli değildir, kısıtlanır)
    collection: "applications"
  }
};
```

6. Firebase Console → **Firestore → Rules** ile aynı kuralları doğrula; ardından
   commit + push. Panelde **Sunucudan Çek ⟳** çalışır.

### API anahtarını kısıtla (önerilir)
Google Cloud Console → APIs & Services → Credentials → ilgili API key →
**Application restrictions → HTTP referrers** → şunu ekle:
`https://mirzakk.github.io/yapay-zeka-kulubu/*`
Böylece anahtar başka sitelerde kullanılamaz.

### Farklar
| | Supabase | Firebase |
|---|---|---|
| Kurulum | SQL + 2 değer | Kural + 2 değer |
| Tekilleştirme | `ct` üzerinde `unique` (veritabanı) | panelde `ct` ile (istemci) |
| Silme koruması | RLS politikası yok | `allow delete: if false` |
| Sorgu | PostgREST | Firestore REST (sayfalama 300) |

İkisi de yalnızca zarf taşır; açık metin hiçbir koşulda yüklenmez.

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
