/* Güvenlik çekirdeği kontrolü — çerçevesiz, tek dosya.
 * Çalıştır:  node test/security.check.js
 * Kırılırsa kaçış/temizlik/şifreleme bozulmuş demektir.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { webcrypto } = require("crypto");

// secure.js tarayıcı API'leri bekler: window + crypto + btoa/atob + indexedDB (tembel)
const sandbox = {
  window: {},
  crypto: webcrypto,
  location: { href: "https://ornek.test/" },
  btoa: (s) => Buffer.from(s, "binary").toString("base64"),
  atob: (s) => Buffer.from(s, "base64").toString("binary"),
  TextEncoder, TextDecoder, URL, console
};
sandbox.self = sandbox.window;
vm.createContext(sandbox);
const src = fs.readFileSync(path.join(__dirname, "..", "secure.js"), "utf8");
vm.runInContext(src, sandbox);
const S = sandbox.window.YZKSecure;

let pass = 0;
function check(name, fn) {
  try { fn(); pass++; console.log("  ✓ " + name); }
  catch (e) { console.log("  ✗ " + name + " → " + e.message); process.exitCode = 1; }
}

console.log("YZKSecure kontrolü");

check("clean: kontrol karakterlerini siler", () => {
  assert.strictEqual(S.clean("a\u0000b\u0007c\u001fd"), "a b c d");
});

check("clean: uzunluğu tavanlar", () => {
  assert.strictEqual(S.clean("x".repeat(500), 80).length, 80);
});

check("clean: null/undefined → boş", () => {
  assert.strictEqual(S.clean(null), "");
  assert.strictEqual(S.clean(undefined), "");
});

check("cleanMultiline: satır sonlarını korur, kontrol karakterini siler", () => {
  const out = S.cleanMultiline("satır1\r\nsatır2\u0001");
  assert.strictEqual(out, "satır1\nsatır2");
});

check("safeHref: javascript: engellenir", () => {
  assert.strictEqual(S.safeHref("javascript:alert(1)"), "");
  assert.strictEqual(S.safeHref("JaVaScRiPt:alert(1)"), "");
});

check("safeHref: data: ve vbscript: engellenir", () => {
  assert.strictEqual(S.safeHref("data:text/html,<script>1</script>"), "");
  assert.strictEqual(S.safeHref("vbscript:msgbox"), "");
});

check("safeHref: https kabul, kaçışlanır", () => {
  const out = S.safeHref("https://ornek.com/a?b=1&c=2");
  assert.ok(out.startsWith("https://ornek.com/a"));
  assert.ok(!out.includes("&c=2"), "& kaçışlanmalı");
  assert.ok(out.includes("&amp;c=2"));
});

check("safeHref: boş/tanımsız → boş", () => {
  assert.strictEqual(S.safeHref(""), "");
  assert.strictEqual(S.safeHref(null), "");
});

check("isBox: zarf biçimini tanır, düz metni reddeder", () => {
  assert.strictEqual(S.isBox({ v: 1, iv: "a", ck: "b", ct: "c" }), true);
  assert.strictEqual(S.isBox({ name: "Ali" }), false);
  assert.strictEqual(S.isBox([{ v: 1, iv: "a", ck: "b", ct: "c" }]), false);
  assert.strictEqual(S.isBox(null), false);
});

(async () => {
  console.log("Şifreleme");

  const plain = { name: "Ali Veli", tc: "10000000146", note: "<script>x</script>" };
  const sealed = await S.seal(plain, "board");

  check("seal: zarf alanları", () => {
    assert.deepStrictEqual(Object.keys(sealed).sort(), ["ck", "ct", "iv", "t", "v"]);
    assert.strictEqual(sealed.v, 1);
    assert.strictEqual(sealed.t, "b");
  });

  check("seal: düz metin sızmıyor", () => {
    const blob = JSON.stringify(sealed);
    assert.ok(!blob.includes("Ali Veli"));
    assert.ok(!blob.includes("10000000146"));
    assert.ok(!blob.includes("<script>"));
  });

  check("seal: her çağrıda farklı şifreli metin (taze IV/anahtar)", async () => {
    // aynı girdi → farklı ct
    const a = await S.seal(plain, "board");
    const b = await S.seal(plain, "board");
    assert.notStrictEqual(a.ct, b.ct);
    assert.notStrictEqual(a.iv, b.iv);
  });

  check("seal: tür kodu doğru", async () => {
    assert.strictEqual((await S.seal({}, "audit")).t, "a");
    assert.strictEqual((await S.seal({}, "member")).t, "m");
  });

  console.log("\n" + pass + " kontrol geçti" + (process.exitCode ? " — HATA VAR" : " — tamamı yeşil"));
})();
