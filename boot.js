/* YZK boot — service worker kaydı + eski önbellek temizliği
 *
 * Neden ayrı dosya: eski bir service worker "/" veya "/sw-reg.js" yolunu
 * önbellekten servis edebiliyor. Yeni dosya adı, eski önbellekte bulunmadığı
 * için HER ZAMAN ağdan gelir → temizlik kodu kesin çalışır.
 */
(function () {
  "use strict";
  var V = "v26";
  var RELOADED = "yzk-boot-reloaded";

  function wipe() {
    return caches.keys().then(function (keys) {
      var stale = keys.filter(function (k) { return k.indexOf("yzk-" + V + "-") !== 0; });
      if (!stale.length) return false;
      return Promise.all(stale.map(function (k) { return caches.delete(k); })).then(function () { return true; });
    }).catch(function () { return false; });
  }

  function nukeRegistrations() {
    if (!("serviceWorker" in navigator)) return Promise.resolve(false);
    return navigator.serviceWorker.getRegistrations().then(function (rs) {
      var stale = rs.filter(function (r) {
        return r.active && r.active.scriptURL.indexOf("v=" + V) === -1;
      });
      if (!stale.length) return false;
      return Promise.all(stale.map(function (r) { return r.unregister(); })).then(function () { return true; });
    }).catch(function () { return false; });
  }

  function once() {
    try {
      if (sessionStorage.getItem(RELOADED)) return false;
      sessionStorage.setItem(RELOADED, "1");
      return true;
    } catch (e) { return false; }
  }

  Promise.all([wipe(), nukeRegistrations()]).then(function (res) {
    var changed = res[0] || res[1];
    if (changed && once()) { location.reload(); return; }
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(new URL("./sw.js?v=" + V, document.baseURI), { scope: "./" })
      .then(function (reg) {
        if (reg.waiting && once()) { reg.waiting.postMessage({ type: "skip" }); location.reload(); }
      })
      .catch(function () {});
  });

  // Yeni SW devralınca bir kez tazele (eski HTML ekranda kalmasın)
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (once()) location.reload();
    });
  }
})();
