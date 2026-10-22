const SCOPE = new URL(self.registration.scope);
const BASE = SCOPE.href;
const SCOPE_NAME = SCOPE.pathname.replace(/^\/|\/$/g, "").replace(/[^a-z0-9-]/gi, "-") || "root";
const CACHE = `yzk-v25-${SCOPE_NAME}`;
const OLD_CACHES = new RegExp(`^(?:yzk-v(?:[1-9]|1[0-9]|2[0-4])|sinyal-v[12])-${SCOPE_NAME}$`, "i");

const ASSETS = [
  "index.html",
  "style.css",
  "core.js",
  "data.js",
  "metrics.js",
  "manifest.webmanifest",
  "secure.js",
  "theme-boot.js",
  "sw-reg.js",
  "icon.svg",
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
].map(path => new URL(path, BASE).href);

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => OLD_CACHES.test(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const request = e.request;
  if (request.method !== "GET" || new URL(request.url).origin !== new URL(BASE).origin || !request.url.startsWith(BASE)) return;
  const url = new URL(request.url);
  const isAsset = ASSETS.includes(url.href.split("?")[0]);
  if (request.mode !== "navigate" && !isAsset) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (isAsset && response.ok) await cache.put(url.href, response.clone());
      return response;
    } catch {
      if (request.mode === "navigate") return (await cache.match(new URL("index.html", BASE).href)) || Response.error();
      return Response.error();
    }
  })());
});
