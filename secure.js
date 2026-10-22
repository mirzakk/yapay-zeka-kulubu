/* YZK — Zarflı şifreleme (hibrit RSA-OAEP-3072 + AES-256-GCM)
 *
 * Amaç: GitHub Pages gibi sunucusuz bir ortamda başvuru verisi tarayıcı
 * deposunda düz metin durmasın. Site kaynağında YALNIZCA açık anahtar var;
 * şifre çözme özel anahtarı sitede hiçbir yerde bulunmaz.
 *
 * Kayıt biçimi: { v:1, t:"b"|"a", iv, ck, ct }
 *   t  : başvuru türü (yalnızca bu kadarı açık — sayaç için)
 *   ck : AES anahtarının RSA-OAEP ile sarılmış hâli
 *   ct : AES-GCM şifreli gövde
 */
(function (global) {
  'use strict';

  var PUB = 'MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEArRVuFS7auoQm69wCVokiC7fJPgFRjYxX2sZFHo93sUZFt6YyTFO+pjVNZ2PrfvzF+pGpjA+S+Ln7gVbSQg8eGb/kGOXZeiqOdDH7lQIrHCxHp6TS3dgCXsRjf6vF8YH43eAPRPJNx4omxUOHpBDs5xifyjpjOs2lG0Yg/aK9EoCDdRDAMhWrb37rUq2Uu/vApEkWY1fQrS0QAEqfUh0ZoJTe8ZtJ37G56sH/3v2U/NsFR6CjzmbpWazvQyfZXDVnlk8rOZJDmIhCAS3fsEQJr+gmsh7WS26wu19YZyZRIVb9v3IL6n5wbnXc1BkBrM7iVaXYGvlWyuZ4AtBEWArhWElUSU0fWzfYzyE4GKclUbN5Knl0/GoE1l2NcHvaaOZAfobfG69i8dTl6/tRVRtjL8Y2xT2sVq2VxVxY8GWPgTNWPpXcEAL12BXi4GYScr1HezIky2iI+2Z02ZAvLZacLktQRa+piwkH17o8QLjlfRFENfYPLpplZYzWhJtuxIa9AgMBAAE=';

  var b64 = {
    enc: function (buf) {
      var b = new Uint8Array(buf), s = '', i;
      for (i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
      return btoa(s);
    },
    dec: function (str) {
      return Uint8Array.from(atob(str), function (c) { return c.charCodeAt(0); });
    }
  };

  var pubP = null;
  function pub() {
    if (!pubP) {
      pubP = crypto.subtle.importKey(
        'spki', b64.dec(PUB),
        { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']
      );
    }
    return pubP;
  }

  /* Verilen açık anahtarla (b64 SPKI) şifrele — kasa kurulumundan sonra kullanılır */
  async function sealTo(pubB64, obj, type) {
    var key = await crypto.subtle.importKey(
      "spki", b64.dec(pubB64), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]
    );
    var aes = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
    var raw = await crypto.subtle.exportKey("raw", aes);
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, aes, new TextEncoder().encode(JSON.stringify(obj)));
    var ck = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, raw);
    return {
      v: 1,
      t: type === "audit" ? "a" : type === "board" ? "b" : "m",
      iv: b64.enc(iv), ck: b64.enc(ck), ct: b64.enc(ct)
    };
  }

  /* Aktif açık anahtar: sunucudaki /config.pub → yoksa gömülü anahtar */
  var _pubCache;
  async function activePub() {
    if (_pubCache) return _pubCache;
    try {
      var cached = localStorage.getItem("yzk-pub");
      if (cached && cached.length > 100) { _pubCache = cached; return cached; }
    } catch (e) {}
    try {
      var cfg = window.YZKSync && YZKSync.configGet ? await YZKSync.configGet() : null;
      if (cfg && cfg.pub && cfg.pub.length > 100) {
        _pubCache = cfg.pub;
        try { localStorage.setItem("yzk-pub", cfg.pub); } catch (e2) {}
        return cfg.pub;
      }
    } catch (e3) {}
    _pubCache = PUB;
    return PUB;
  }

  /* Açık anahtar → kimse okuyamaz. Her çağrıda taze AES anahtarı. */
  async function seal(obj, type) {
    var key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
    var raw = await crypto.subtle.exportKey('raw', key);
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var body = new TextEncoder().encode(JSON.stringify(obj));
    var ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, body);
    var ck = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, await pub(), raw);
    return {
      v: 1,
      t: type === 'audit' ? 'a' : type === 'board' ? 'b' : 'm',
      iv: b64.enc(iv),
      ck: b64.enc(ck),
      ct: b64.enc(ct)
    };
  }

  async function open(privKey, sealed) {
    if (!sealed || sealed.v !== 1) throw new Error('biçim');
    var raw = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privKey, b64.dec(sealed.ck));
    var key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
    var pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64.dec(sealed.iv) }, key, b64.dec(sealed.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  }

  /* Anahtar dosyası: { v, kdf:{salt,iter}, iv, wrapped } — özel anahtar
     PBKDF2(pass)+AES-GCM ile sarılı. Dosya çalınsa da parola olmadan açılmaz. */
  async function unwrapKeyFile(fileObj, password) {
    var f = typeof fileObj === 'string' ? JSON.parse(fileObj) : fileObj;
    if (!f || f.v !== 1 || !f.kdf || !f.iv || !f.wrapped) throw new Error('anahtar dosyası geçersiz');
    var base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    var kek = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64.dec(f.kdf.salt), iterations: f.kdf.iter, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
    );
    var pkcs8 = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64.dec(f.iv) }, kek, b64.dec(f.wrapped));
    return crypto.subtle.importKey('pkcs8', pkcs8, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
  }

  /* Girdi temizliği: kontrol karakterleri + uzunluk tavanı */
  function clean(v, max) {
    return String(v == null ? '' : v)
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max || 200);
  }
  function cleanMultiline(v, max) {
    return String(v == null ? '' : v)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/\r\n?/g, '\n')
      .trim()
      .slice(0, max || 1200);
  }

  /* Zarf mı? Depoda düz metin kayıt varsa (#eski sürüm) yok sayılır. */
  function isBox(o) {
    return !!o && o.v === 1 && typeof o.ct === 'string' && typeof o.ck === 'string' && typeof o.iv === 'string';
  }

  /* Sadece http/https — javascript:/data:/vbscript: XSS'ini keser */
  function safeHref(v) {
    if (!v) return '';
    try {
      var u = new URL(String(v), location.href);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
      return String(u.href).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    } catch (e) { return ''; }
  }

  /* ── Kasa (vault): özel anahtar, yönetici parolasıyla sarılı ──────────
     Sunucuda yalnızca sarılı hâli durur; parola hiçbir yerde saklanmaz.
     Doğru parola = AES-GCM auth etiketi geçer. Yanlış parola = çözüm hatası. */
  const KDF_ITER = 600000;

  /* Anahtar dosyasını çöz, ham pkcs8 döndür (yeniden sarmak için) */
  async function unwrapKeyFileRaw(fileObj, password) {
    var f = typeof fileObj === "string" ? JSON.parse(fileObj) : fileObj;
    if (!f || f.v !== 1 || !f.kdf || !f.iv || !f.wrapped) throw new Error("anahtar dosyası geçersiz");
    var base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
    var kek = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: b64.dec(f.kdf.salt), iterations: f.kdf.iter, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
    );
    return crypto.subtle.decrypt({ name: "AES-GCM", iv: b64.dec(f.iv) }, kek, b64.dec(f.wrapped));
  }

  /* pkcs8 + parola → sunucuda saklanabilir kasa nesnesi */
  async function makeVault(pkcs8, password) {
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
    var kek = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: salt, iterations: KDF_ITER, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]
    );
    var wrapped = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, kek, pkcs8);
    return { v: 1, kdf: { salt: b64.enc(salt), iter: KDF_ITER }, iv: b64.enc(iv), wrapped: b64.enc(wrapped), at: Date.now() };
  }

  /* kasa + parola → RSA özel anahtarı (yanlış parolada fırlatır) */
  async function openVault(vault, password) {
    var pkcs8 = await unwrapKeyFileRaw(vault, password);
    return crypto.subtle.importKey("pkcs8", pkcs8, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]);
  }

  /* ── Cihaz-yerel depo zarfı: anahtar IndexedDB'de, extractable:false ──
     Dökümü alan (profil klasörü, yedek, disk imajı) veriyi okuyamaz. */
  var _localKey = null;
  function localKey() {
    if (_localKey) return _localKey;
    _localKey = (async function () {
      var db = await new Promise(function (res, rej) {
        var r = indexedDB.open('yzk-secure', 1);
        r.onupgradeneeded = function () {
          var d = r.result;
          if (!d.objectStoreNames.contains('keys')) d.createObjectStore('keys');
        };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      });
      var get = function (mode) {
        return new Promise(function (res, rej) {
          var q = db.transaction('keys', mode).objectStore('keys').get('local');
          q.onsuccess = function () { res(q.result); };
          q.onerror = function () { rej(q.error); };
        });
      };
      var put = function (k) {
        return new Promise(function (res, rej) {
          var q = db.transaction('keys', 'readwrite').objectStore('keys').put(k, 'local');
          q.onsuccess = function () { res(); };
          q.onerror = function () { rej(q.error); };
        });
      };
      var cur = await get('readonly');
      if (cur && cur.type === 'secret') return cur;
      var k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      await put(k);
      return k;
    })();
    return _localKey;
  }

  async function sealLocal(obj) {
    var k = await localKey();
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, new TextEncoder().encode(JSON.stringify(obj)));
    return { v: 1, l: 1, iv: b64.enc(iv), ct: b64.enc(ct) };
  }

  async function openLocal(box) {
    if (!box || box.v !== 1 || box.l !== 1) return null;
    try {
      var k = await localKey();
      var pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64.dec(box.iv) }, k, b64.dec(box.ct));
      return JSON.parse(new TextDecoder().decode(pt));
    } catch (e) { return null; }
  }

  /* ── Cihaz anahtarı: bir kez çözülen özel anahtar IDB'de tutulur ──
     extractable:false → ham bayt dışarı çıkamaz; aynı tarayıcıda tekrar
     şifre sormadan panel açılır. "Çıkış" bu kaydı siler. */
  async function saveDeviceKey(key) {
    var db = await new Promise(function (res, rej) {
      var r = indexedDB.open("yzk-secure", 1);
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains("keys")) d.createObjectStore("keys");
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    await new Promise(function (res, rej) {
      var q = db.transaction("keys", "readwrite").objectStore("keys").put(key, "private");
      q.onsuccess = function () { res(); };
      q.onerror = function () { rej(q.error); };
    });
  }

  async function loadDeviceKey() {
    try {
      var db = await new Promise(function (res, rej) {
        var r = indexedDB.open("yzk-secure", 1);
        r.onupgradeneeded = function () {
          var d = r.result;
          if (!d.objectStoreNames.contains("keys")) d.createObjectStore("keys");
        };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      });
      var k = await new Promise(function (res, rej) {
        var q = db.transaction("keys", "readonly").objectStore("keys").get("private");
        q.onsuccess = function () { res(q.result); };
        q.onerror = function () { rej(q.error); };
      });
      return (k && k.type === "private") ? k : null;
    } catch (e) { return null; }
  }

  async function clearDeviceKey() {
    try {
      var db = await new Promise(function (res, rej) {
        var r = indexedDB.open("yzk-secure", 1);
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      });
      await new Promise(function (res) {
        var q = db.transaction("keys", "readwrite").objectStore("keys").delete("private");
        q.onsuccess = function () { res(); };
        q.onerror = function () { res(); };
      });
      _pubCache = undefined;
      try { localStorage.removeItem("yzk-pub"); } catch (e) {}
    } catch (e) {}
  }

  /* Yeni anahtar çifti: pub (b64 SPKI) + pkcs8 (kasaya sarılacak) + kullanılabilir anahtar */
  async function generateKeypair() {
    var pair = await crypto.subtle.generateKey(
      { name: "RSA-OAEP", modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true, ["encrypt", "decrypt"]
    );
    var pub = await crypto.subtle.exportKey("spki", pair.publicKey);
    var pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
    var usable = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]);
    return { pubB64: b64.enc(pub), pkcs8: pkcs8, key: usable };
  }

  global.YZKSecure = {
    seal: seal, open: open, unwrapKeyFile: unwrapKeyFile,
    sealLocal: sealLocal, openLocal: openLocal,
    unwrapKeyFileRaw: unwrapKeyFileRaw, makeVault: makeVault, openVault: openVault,
    sealTo: sealTo, activePub: activePub, generateKeypair: generateKeypair,
    saveDeviceKey: saveDeviceKey, loadDeviceKey: loadDeviceKey, clearDeviceKey: clearDeviceKey,
    clean: clean, cleanMultiline: cleanMultiline,
    isBox: isBox, safeHref: safeHref,
    b64: b64, PUBLIC_KEY: PUB
  };
})(window);
