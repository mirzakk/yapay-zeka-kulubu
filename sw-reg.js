/* Service worker kaydı — harici dosya, CSP uyumlu */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register(new URL("./sw.js", document.baseURI)).catch(function () {});
}
