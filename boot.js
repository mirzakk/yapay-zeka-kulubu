/* YZK boot — service worker kaydı + eski önbellek temizliği
 *
 * Ayrı dosya olmasının nedeni: eski bir service worker bu yolu önbellekten
 * servis edemez (dosya adı yeni) → temizlik kodu her zaman ağdan gelir.
 *
 * Sürüm, sw.js içindeki `yzk-vNN-` sabitinden okunur; iki dosya asla ayrışmaz.
 */
(function () {
  "use strict";
  var RELOAD_KEY = "yzk-boot-reloaded";

  function once() {
    try {
      if (sessionStorage.getItem(RELOAD_KEY)) return false;
      sessionStorage.setItem(RELOAD_KEY, "1");
      return true;
    } catch (e) { return false; }
  }

  function boot(prefix) {
    var wipe = caches.keys().then(function (keys) {
      var stale = keys.filter(function (k) { return k.indexOf(prefix) !== 0; });
      if (!stale.length) return false;
      return Promise.all(stale.map(function (k) { return caches.delete(k); }))
        .then(function () { return true; });
    }).catch(function () { return false; });

    var nuke = ("serviceWorker" in navigator)
      ? navigator.serviceWorker.getRegistrations().then(function (rs) {
          var stale = rs.filter(function (r) {
            return r.active && r.active.scriptURL.indexOf(prefix) === -1;
          });
          if (!stale.length) return false;
          return Promise.all(stale.map(function (r) { return r.unregister(); }))
            .then(function () { return true; });
        }).catch(function () { return false; })
      : Promise.resolve(false);

    Promise.all([wipe, nuke]).then(function (res) {
      if ((res[0] || res[1]) && once()) { location.reload(); return; }
      if (!("serviceWorker" in navigator)) return;
      navigator.serviceWorker
        .register(new URL("./sw.js?v=" + prefix, document.baseURI), { scope: "./" })
        .then(function (reg) {
          if (reg.waiting) { reg.waiting.postMessage({ type: "skip" }); if (once()) location.reload(); }
        })
        .catch(function () {});
    });
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (once()) location.reload();
    });
  }

  fetch(new URL("./sw.js", document.baseURI), { cache: "no-store" })
    .then(function (r) { return r.text(); })
    .then(function (t) {
      var m = t.match(/yzk-v\d+-/);
      boot(m ? m[0] : "yzk-v");
    })
    .catch(function () { boot("yzk-v"); });
})();
