/* YZK — başvuru senkronu (isteğe bağlı, tek uç nokta)
 *
 * NEDEN GEREKLİ: statik sitede başvuru, başvuranın KENDİ tarayıcısına yazılır.
 * Kulübün cihazındaki panel başka tarayıcının deposunu göremez. Bu yüzden
 * başvuruların panele düşmesi için tek bir ortak uç nokta şart.
 *
 * GÜVENLİK: sunucuya YALNIZCA zarf gider ({v,t,iv,ck,ct}). Açık metin
 * (ad, TC, e-posta, not) hiçbir zaman yüklenmez. Sunucu açık olsa bile
 * kayıtları yalnızca kulübün özel anahtarı çözebilir.
 *
 * KURULUM: aşağıdaki iki alanı doldur (sync-kurulum.md, ~3 dakika).
 *   url : https://<proje>.supabase.co
 *   key : anon public key
 * Boş bırakılırsa senkron kapalıdır; site eskisi gibi çalışır (dosya indirme).
 */
(function (global) {
  "use strict";

  var CFG = {
    url: "",   // ör. "https://abcdxyz.supabase.co"
    key: "",   // ör. "eyJhbGciOiJIUzI1NiIs..."
    table: "applications"
  };

  // Test/geliştirme için tarayıcıdan geçici override
  try {
    var u = localStorage.getItem("yzk-sync-url");
    var k = localStorage.getItem("yzk-sync-key");
    if (u) CFG.url = u;
    if (k) CFG.key = k;
  } catch (e) {}

  function enabled() {
    return /^https?:\/\//.test(CFG.url) && CFG.key.length > 20;
  }

  function endpoint() {
    return CFG.url.replace(/\/+$/, "") + "/rest/v1/" + CFG.table;
  }

  function headers(extra) {
    var h = {
      "apikey": CFG.key,
      "Authorization": "Bearer " + CFG.key,
      "Content-Type": "application/json"
    };
    for (var k in extra || {}) h[k] = extra[k];
    return h;
  }

  /* Zarfı gönder. Yalnızca şifreli alanlar. */
  async function push(box) {
    if (!enabled()) return { ok: false, reason: "off" };
    var row = { v: box.v, t: box.t, iv: box.iv, ck: box.ck, ct: box.ct };
    try {
      var res = await fetch(endpoint(), {
        method: "POST",
        headers: headers({ "Prefer": "return=minimal,resolution=ignore-duplicates" }),
        body: JSON.stringify(row)
      });
      if (res.status === 409) return { ok: true, duplicate: true };
      if (!res.ok) return { ok: false, reason: "http " + res.status };
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: "network" };
    }
  }

  /* Zarfları çek (son 500). Sunucu yalnızca şifreli metin döndürür. */
  async function pull(limit) {
    if (!enabled()) return { ok: false, reason: "off", rows: [] };
    var q = "?select=v,t,iv,ck,ct&order=created_at.desc&limit=" + (limit || 500);
    try {
      var res = await fetch(endpoint() + q, { headers: headers() });
      if (!res.ok) return { ok: false, reason: "http " + res.status, rows: [] };
      var rows = await res.json();
      return { ok: true, rows: Array.isArray(rows) ? rows : [] };
    } catch (e) {
      return { ok: false, reason: "network", rows: [] };
    }
  }

  /* Zarfları yerel depoyla birleştir (ct ile tekilleştir) */
  async function merge() {
    var p = await pull();
    if (!p.ok) return p;
    var local = [];
    try { local = JSON.parse(localStorage.getItem("yzk-applications") || "[]"); } catch (e) {}
    local = local.filter(function (b) { return b && b.v === 1 && b.ct; });
    var seen = {};
    local.forEach(function (b) { seen[b.ct] = 1; });
    var added = 0;
    p.rows.forEach(function (r) {
      if (!r || !r.ct || seen[r.ct]) return;
      seen[r.ct] = 1;
      local.push({ v: 1, t: r.t || "m", iv: r.iv, ck: r.ck, ct: r.ct });
      added++;
    });
    if (added) localStorage.setItem("yzk-applications", JSON.stringify(local));
    return { ok: true, added: added, total: local.length };
  }

  global.YZKSync = { enabled: enabled, push: push, pull: pull, merge: merge, config: CFG };
})(window);
