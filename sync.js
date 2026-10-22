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

  /* Zarfı gönder — yalnızca şifreli alanlar */
  async function push(box) {
    if (!enabled()) return { ok: false, reason: "off" };
    try {
      var res;
      if (CFG.provider === "supabase") {
        res = await fetch(sbUrl(), {
          method: "POST",
          headers: Object.assign({ "Prefer": "return=minimal,resolution=ignore-duplicates" }, sbHeaders()),
          body: JSON.stringify({ v: box.v, t: box.t, iv: box.iv, ck: box.ck, ct: box.ct })
        });
        if (res.status === 409) return { ok: true, duplicate: true };
      } else if (CFG.provider === "rtdb") {
        res = await fetch(rtdbUrl(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ v: box.v, t: box.t, iv: box.iv, ck: box.ck, ct: box.ct })
        });
      } else {
        res = await fetch(fbUrl(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fbDoc(box))
        });
      }
      if (!res.ok) return { ok: false, reason: "http " + res.status };
      return { ok: true };
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
        var vals = obj && typeof obj === "object" ? Object.keys(obj).map(function (k) { return obj[k]; }) : [];
        return { ok: true, rows: vals.filter(function (x) { return x && x.ct; }) };
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

  /* ── /config: açık anahtar + kasa ─────────────────────────────────────
     { pub: "<b64 SPKI>", vault: {...} } — herkese açık okunur, parolasız açılmaz. */
  function configUrl() {
    if (CFG.provider !== "rtdb") return "";
    return CFG.rtdb.url.replace(/\/+$/, "") + "/config.json";
  }

  async function configGet() {
    var u = configUrl();
    if (!u) return null;
    try {
      var r = await fetch(u, { cache: "no-store" });
      if (!r.ok) return null;
      var v = await r.json();
      return v && typeof v === "object" ? v : null;
    } catch (e) { return null; }
  }

  /* Kısmi yazma: yalnızca verilen alanlar güncellenir */
  async function configPatch(obj) {
    var u = configUrl();
    if (!u) return { ok: false, reason: "provider" };
    try {
      var r = await fetch(u, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) });
      return { ok: r.ok, reason: r.ok ? "" : "http " + r.status };
    } catch (e) { return { ok: false, reason: "network" }; }
  }

  /* ── Kasa (özel anahtar, yönetici parolasıyla sarılı) ────────────────
     RTDB: /config/vault.json — herkese açık okunabilir, parolasız açılamaz. */
  function vaultUrl() {
    if (CFG.provider !== "rtdb") return "";
    return CFG.rtdb.url.replace(/\/+$/, "") + "/config/vault.json";
  }

  async function vaultGet() {
    // 1) /config/vault.json
    var u = vaultUrl();
    if (u) {
      try {
        var r = await fetch(u, { cache: "no-store" });
        if (r.ok) {
          var v = await r.json();
          if (v && v.v === 1 && v.wrapped) return v;
        }
      } catch (e) {}
    }
    // 2) Yedek yol: /applications içinde {k:"vault"} kaydı (yalnızca applications yazılabilirse)
    try {
      var rows = await fetch(CFG.rtdb.url.replace(/\/+$/, "") + "/applications.json", { cache: "no-store" });
      if (!rows.ok) return null;
      var obj = await rows.json();
      if (!obj || typeof obj !== "object") return null;
      for (var k in obj) {
        var it = obj[k];
        if (it && it.k === "vault" && typeof it.d === "string") {
          try { var parsed = JSON.parse(it.d); if (parsed && parsed.v === 1 && parsed.wrapped) return parsed; } catch (e2) {}
        }
      }
    } catch (e3) {}
    return null;
  }

  async function vaultPut(vault, existing) {
    var u = vaultUrl();
    if (!u) return { ok: false, reason: "provider" };
    // 1) /config/vault.json
    try {
      var r = await fetch(u, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vault)
      });
      if (r.ok) return { ok: true, where: "config" };
      if (r.status !== 401 && r.status !== 403) return { ok: false, reason: "http " + r.status };
    } catch (e) {}
    // 2) Yedek: /applications içine {k:"vault"} olarak yaz (applications yazılabilirse)
    try {
      var r2 = await fetch(CFG.rtdb.url.replace(/\/+$/, "") + "/applications.json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ v: 0, k: "vault", d: JSON.stringify(vault), at: Date.now() })
      });
      if (r2.ok) return { ok: true, where: "applications" };
      return { ok: false, reason: "http " + r2.status };
    } catch (e2) { return { ok: false, reason: "network" }; }
  }

  /* Yerel depoyla birleştir (ct ile tekilleştir) */
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
      if (!r || r.k === "vault" || r.v === 0 || !r.ct || !r.ck || seen[r.ct]) return;
      seen[r.ct] = 1;
      local.push({ v: 1, t: r.t || "m", iv: r.iv, ck: r.ck, ct: r.ct });
      added++;
    });
    if (added) localStorage.setItem("yzk-applications", JSON.stringify(local));
    return { ok: true, added: added, total: local.length };
  }

  global.YZKSync = { enabled: enabled, push: push, pull: pull, merge: merge, vaultGet: vaultGet, vaultPut: vaultPut, configGet: configGet, configPatch: configPatch, config: CFG };
})(window);
