/* YZK service worker — v26
 *
 * KURAL: gezinme (navigation) HER ZAMAN ağdan gelir; önbellek yalnızca
 * çevrimdışı yedek. Eski HTML bir daha "yapışıp" kalmaz.
 */
const SCOPE = new URL(self.registration.scope);
const BASE = SCOPE.href;
const SCOPE_NAME = SCOPE.pathname.replace(/^\/|\/$/g, "").replace(/[^a-z0-9-]/gi, "-") || "root";
const CACHE = `yzk-v32-${SCOPE_NAME}`;

const ASSETS = [
  "index.html",
  "style.css",
  "core.js",
  "data.js",
  "metrics.js",
  "manifest.webmanifest",
  "secure.js",
  "sync.js",
  "theme-boot.js",
  "boot.js",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
  "404.html",
  "admin.html",
  "admin.js",
  "admin.css",
  "images/disiplin-egitim.webp",
  "images/disiplin-ekonomi.webp",
  "images/disiplin-hukuk.webp",
  "images/disiplin-muhendislik.webp",
  "images/disiplin-tasarim.webp",
  "images/disiplin-tip.webp"
].map(p => new URL(p, BASE).href);

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(ASSETS.map(u => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    // Bizim olmayan HER onbellegi sil — eski site surumleri dahil
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
    // Acik sekmeleri bir kez tazele ki eski HTML ekranda kalmasin
    const cs = await self.clients.matchAll({ type: "window" });
    for (const c of cs) { try { c.navigate(c.url); } catch (err) {} }
  })());
});

self.addEventListener("message", e => {
  if (e.data && e.data.type === "skip") self.skipWaiting();
});

self.addEventListener("fetch", e => {
  const req = e.request;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (req.method !== "GET" || url.origin !== SCOPE.origin || !req.url.startsWith(BASE)) return;

  // 1) Gezinme: ag once, 5 sn icinde gelmezse onbellek
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const fresh = await Promise.race([
          fetch(req, { cache: "no-store" }),
          new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 5000))
        ]);
        if (fresh && fresh.ok) {
          const c = await caches.open(CACHE);
          c.put(new URL("index.html", BASE).href, fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch (err) {
        const c = await caches.open(CACHE);
        return (await c.match(new URL("index.html", BASE).href)) || Response.error();
      }
    })());
    return;
  }

  // 2) Varliklar: onbellek once, arka planda tazele
  const key = url.href.split("?")[0];
  if (!ASSETS.includes(key)) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(key);
    const net = fetch(req).then(r => { if (r.ok) c.put(key, r.clone()).catch(() => {}); return r; }).catch(() => null);
    return hit || (await net) || Response.error();
  })());
});
