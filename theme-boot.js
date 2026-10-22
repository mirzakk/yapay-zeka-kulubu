/* Tema: ilk boyamadan önce uygula (FOUC yok) — harici dosya, CSP uyumlu */
(function () {
  try {
    var t = localStorage.getItem('yzk-theme');
    if (t !== 'light' && t !== 'dark') {
      t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
