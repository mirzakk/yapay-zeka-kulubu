/* YZK — başvuru senkronu (isteğe bağlı, iki sağlayıcı)
 *
 * NEDEN GEREKLİ: statik sitede başvuru, başvuranın KENDİ tarayıcısına yazılır.
 * Kulübün cihazındaki panel başka tarayıcının deposunu göremez. Bu yüzden
 * başvuruların panele düşmesi için tek bir ortak uç nokta şart.
 *
 * GÜVENLİK: sunucuya YALNIZCA zarf gider ({v,t,iv,ck,ct}). Açık metin
 * (ad, TC, e-posta, not) hiçbir zaman yüklenmez. Veritabanı herkese açık
 * okunabilir olsa bile kayıtları yalnızca kulübün özel anahtarı çözer.
 *
 * KURULUM: provider + ilgili kimlik bilgilerini doldur (sync-kurulum.md).
 *   provider: "supabase" → url + key
 *   provider: "firebase" → projectId + apiKey (Firestore)
 *   provider: "rtdb"     → url (Realtime Database)
 * Boşsa senkron kapalıdır; site eskisi gibi çalışır (şifreli dosya indirme).
 */
(function (global) {
  "use strict";

  var CFG = {
    provider: "rtdb",                   // "rtdb" | "supabase" | "firebase"
    supabase: { url: "", key: "", table: "applications" },
    firebase: { projectId: "", apiKey: "", collection: "applications" },
    rtdb: {
      url: "https://yapay-zeka-klubu-default-rtdb.europe-west1.firebasedatabase.app",
      path: "applications"
    }
  };

  // Test/geliştirme için tarayıcıdan geçici override
  try {
    var g = function (k) { return localStorage.getItem("yzk-sync-" + k); };
    if (g("provider")) CFG.provider = g("provider");
    if (g("url")) CFG.supabase.url = g("url");
    if (g("key")) CFG.supabase.key = g("key");
    if (g("pid")) CFG.firebase.projectId = g("pid");
    if (g("apikey")) CFG.firebase.apiKey = g("apikey");
    if (g("rtdb")) CFG.rtdb.url = g("rtdb");
  } catch (e) {}

  function enabled() {
    if (CFG.provider === "supabase") {
      return /^https?:\/\//.test(CFG.supabase.url) && CFG.supabase.key.length > 20;
    }
    if (CFG.provider === "firebase") {
      return CFG.firebase.projectId.length > 2 && CFG.firebase.apiKey.length > 20;
    }
    if (CFG.provider === "rtdb") {
      return /^https?:\/\//.test(CFG.rtdb.url);
    }
    return false;
  }

  /* ---------- Supabase (PostgREST) ---------- */
  function sbUrl() {
    return CFG.supabase.url.replace(/\/+$/, "") + "/rest/v1/" + CFG.supabase.table;
  }
  function sbHeaders() {
    return {
      "apikey": CFG.supabase.key,
      "Authorization": "Bearer " + CFG.supabase.key,
      "Content-Type": "application/json"
    };
  }

  /* ---------- Firebase Realtime Database (REST) ---------- */
  function rtdbUrl() {
    return CFG.rtdb.url.replace(/\/+$/, "") + "/" + CFG.rtdb.path + ".json";
  }

  /* ---------- Firebase (Firestore REST) ---------- */
  function fbUrl() {
    var base = "https://firestore.googleapis.com/v1/projects/" +
      encodeURIComponent(CFG.firebase.projectId) +
      "/databases/(default)/documents/" + CFG.firebase.collection;
    return base + "?key=" + encodeURIComponent(CFG.firebase.apiKey);
  }
  function fbDoc(box) {
    return {
      fields: {
        v: { integerValue: String(box.v) },
        t: { stringValue: String(box.t || "m") },
        iv: { stringValue: box.iv },
        ck: { stringValue: box.ck },
        ct: { stringValue: box.ct }
      }
    };
  }
  function fbFlat(doc) {
    var f = (doc && doc.fields) || {};
    var val = function (x) {
      if (!x) return "";
      return x.stringValue != null ? x.stringValue
           : x.integerValue != null ? Number(x.integerValue)
           : x.timestampValue != null ? x.timestampValue : "";
    };
    return { v: Number(val(f.v)) || 1, t: val(f.t) || "m", iv: val(f.iv), ck: val(f.ck), ct: val(f.ct) };
  }

  /* İçerik adresi: ct'nin SHA-256'sı → aynı zarf iki kez yazılamaz */
  async function boxKey(ct) {
    var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ct));
    return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  /* Zarfı gönder — yalnızca şifreli alanlar */
  async function push(box) {
    if (!enabled()) return { ok: false, reason: "off" };
    if (CFG.provider !== "rtdb") return { ok: false, reason: "provider" };
    try {
      var key = await boxKey(box.ct);
      var url = appsUrl().replace(/\.json$/, "/" + key + ".json");
      var res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ v: box.v, t: box.t, iv: box.iv, ck: box.ck, ct: box.ct, at: Date.now() })
      });
      // 401/403: kural "!data.exists()" → kayıt zaten var (idempotent)
      if (res.ok) return { ok: true };
      if (res.status === 401 || res.status === 403) return { ok: true, duplicate: true };
      return { ok: false, reason: "http " + res.status };
    } catch (e) {
      return { ok: false, reason: "network" };
    }
  }

  /* Zarfları çek (en çok 300) */
  async function pull(limit) {
    if (!enabled()) return { ok: false, reason: "off", rows: [] };
    var n = limit || 300;
    try {
      if (CFG.provider === "supabase") {
        var q = "?select=v,t,iv,ck,ct&order=created_at.desc&limit=" + n;
        var r1 = await fetch(sbUrl() + q, { headers: sbHeaders() });
        if (!r1.ok) return { ok: false, reason: "http " + r1.status, rows: [] };
        var rows1 = await r1.json();
        return { ok: true, rows: Array.isArray(rows1) ? rows1 : [] };
      }
      if (CFG.provider === "rtdb") {
        var r3 = await fetch(rtdbUrl());
        if (!r3.ok) return { ok: false, reason: "http " + r3.status, rows: [] };
        var obj = await r3.json();
        if (!obj || typeof obj !== "object") return { ok: true, rows: [] };
        var vals = Object.keys(obj).map(function (k) { return obj[k]; });
        return { ok: true, rows: vals.filter(function (x) { return x && typeof x === "object"; }) };
      }
      var r2 = await fetch(fbUrl() + "&pageSize=" + n);
      if (!r2.ok) return { ok: false, reason: "http " + r2.status, rows: [] };
      var body = await r2.json();
      var docs = (body && body.documents) || [];
      return { ok: true, rows: docs.map(fbFlat) };
    } catch (e) {
      return { ok: false, reason: "network", rows: [] };
    }
  }

  /* ── Yayın (pub) + kasa (vault) ───────────────────────────────────────
     Kurallar /config düğümünü ilk yazımdan sonra kilitliyorsa, kayıtlar
     /applications altına {k:"pub"} / {k:"vault"} olarak yazılır (aynı yol,
     aynı izin). Okurken en son kayıt geçerlidir. */
  function appsUrl() {
    return CFG.rtdb.url.replace(/\/+$/, "") + "/applications.json";
  }

  async function configGet() {
    if (CFG.provider !== "rtdb") return null;
    var cfg = {};
    // 1) /config (varsa)
    try {
      var r = await fetch(CFG.rtdb.url.replace(/\/+$/, "") + "/config.json", { cache: "no-store" });
      if (r.ok) {
        var v = await r.json();
        if (v && typeof v === "object") {
          if (v.pub) cfg.pub = v.pub;
          if (v.vault) cfg.vault = v.vault;
        }
      }
    } catch (e) {}
    // 2) /applications içindeki yayın kayıtları (en son kazanır)
    try {
      var r2 = await fetch(appsUrl(), { cache: "no-store" });
      if (r2.ok) {
        var obj = await r2.json();
        if (obj && typeof obj === "object") {
          Object.keys(obj).forEach(function (k) {
            var it = obj[k];
            if (!it || typeof it.d !== "string") return;
            try {
              var parsed = JSON.parse(it.d);
              if (it.k === "pub" && typeof parsed === "string") cfg.pub = parsed;
              if (it.k === "vault" && parsed && parsed.wrapped) cfg.vault = parsed;
            } catch (e2) {}
          });
        }
      }
    } catch (e3) {}
    return (cfg.pub || cfg.vault) ? cfg : null;
  }

  /* Kısmi yayın: önce /config PATCH, olmazsa /applications'a kayıt olarak */
  async function configPatch(obj) {
    if (CFG.provider !== "rtdb") return { ok: false, reason: "provider" };
    var out = { ok: false, reason: "" };
    try {
      var r = await fetch(CFG.rtdb.url.replace(/\/+$/, "") + "/config.json", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj)
      });
      if (r.ok) return { ok: true, where: "config" };
      out.reason = "http " + r.status;
    } catch (e) { out.reason = "network"; }

    // yedek: her alan ayrı kayıt
    var wrote = 0, keys = Object.keys(obj).filter(function (k) { return k === "pub" || k === "vault"; });
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      try {
        var r2 = await fetch(appsUrl(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ v: 0, k: key, d: JSON.stringify(obj[key]), at: Date.now() })
        });
        if (r2.ok) wrote++;
      } catch (e2) {}
    }
    if (wrote === keys.length) return { ok: true, where: "applications" };
    return { ok: false, reason: out.reason || "write" };
  }

  /* ── Kasa (özel anahtar, yönetici parolasıyla sarılı) ────────────────
     RTDB: /config/vault.json — herkese açık okunabilir, parolasız açılamaz. */
  function vaultUrl() {
    if (CFG.provider !== "rtdb") return "";
    return CFG.rtdb.url.replace(/\/+$/, "") + "/config/vault.json";
  }

  async function vaultGet() {
    var cfg = await configGet();
    return (cfg && cfg.vault) ? cfg.vault : null;
  }

  async function vaultPut(vault) {
    return configPatch({ vault: vault });
  }

  /* Karar (onay/red) bir OLAY olarak yazılır: {k:"status", ref, s, at}
     Mevcut kayıt değiştirilmez → silme/güncelleme izni gerekmez, denetim izi kalır. */
  async function setStatus(ref, status) {
    if (!enabled() || CFG.provider !== "rtdb") return { ok: false, reason: "off" };
    if (!ref) return { ok: false, reason: "ref" };
    try {
      var r = await fetch(appsUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ k: "status", ref: ref, s: status, at: Date.now() })
      });
      return { ok: r.ok, reason: r.ok ? "" : "http " + r.status };
    } catch (e) { return { ok: false, reason: "network" }; }
  }

  /* Sunucudan gelen kararlar: { "<başvuru id>": {s, at} } */
  function statuses() {
    try { return JSON.parse(localStorage.getItem("yzk-status") || "{}") || {}; } catch (e) { return {}; }
  }

  /* Sunucu tek doğru kaynaktır:
     - sunucuda olan kayıtlar aynen alınır
     - yerelde olup sunucuda olmayan kayıt SİLİNİR (bayat kopya)
     - istisna: gönderilememiş (local:1) kuyruk korunur, sonra tekrar denenir */
  async function merge() {
    var p = await pull();
    if (!p.ok) return p;

    var local = [];
    try { local = JSON.parse(localStorage.getItem("yzk-applications") || "[]"); } catch (e) {}
    local = (Array.isArray(local) ? local : []).filter(function (b) { return b && b.v === 1 && b.ct && b.ck && b.iv; });

    var remote = {}, rows = p.rows || [], status = {};
    rows.forEach(function (r) {
      if (!r) return;
      if (r.k === "status") {                       // karar olayı: ref = başvuru id'si
        var cur = status[r.ref];
        if (!cur || (r.at || 0) >= (cur.at || 0)) status[r.ref] = { s: r.s, at: r.at || 0 };
        return;
      }
      if (r.k === "vault" || r.k === "pub" || r.v === 0) return;
      if (!r.ct || !r.ck || !r.iv) return;
      remote[r.ct] = { v: 1, t: r.t || "m", iv: r.iv, ck: r.ck, ct: r.ct };
    });
    localStorage.setItem("yzk-status", JSON.stringify(status));

    var keep = [], pruned = 0;
    local.forEach(function (b) {
      if (remote[b.ct]) { keep.push(remote[b.ct]); delete remote[b.ct]; return; }  // sunucu kopyası
      if (b.local) { keep.push(b); return; }               // çevrimdışı kuyruk
      pruned++;                                            // bayat yerel kopya
    });
    Object.keys(remote).forEach(function (k) { keep.push(remote[k]); });

    localStorage.setItem("yzk-applications", JSON.stringify(keep));
    return { ok: true, added: Object.keys(remote).length, total: keep.length, pruned: pruned };
  }

  /* Gönderilememiş zarfları tekrar dene (açılışta bir kez) */
  async function flushQueue() {
    if (!enabled()) return 0;
    var local = [];
    try { local = JSON.parse(localStorage.getItem("yzk-applications") || "[]"); } catch (e) { return 0; }
    if (!Array.isArray(local)) return 0;
    var sent = 0;
    for (var i = 0; i < local.length; i++) {
      var b = local[i];
      if (!b || !b.local || !b.ct) continue;
      var r = await push(b);
      if (r.ok) { delete b.local; sent++; }
    }
    if (sent) localStorage.setItem("yzk-applications", JSON.stringify(local));
    return sent;
  }

  global.YZKSync = { enabled: enabled, push: push, pull: pull, merge: merge, setStatus: setStatus, statuses: statuses, flushQueue: flushQueue, appsUrl: appsUrl, vaultGet: vaultGet, vaultPut: vaultPut, configGet: configGet, configPatch: configPatch, config: CFG };
})(window);
