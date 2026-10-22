/* Yapay Zekâ Kulübü (YZK) — Çekirdek Uygulama Motoru */
(function () {
  "use strict";

  const T = DATA.i18n;
  let lang = "tr";
  let paletteTrigger = null;
  let heroCanvasAnimId = null;

  const fmt = (tr, en) => (lang === "tr" ? tr : en);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeHref = val => {
    try {
      const url = new URL(val, location.href);
      return url.protocol === "https:" || url.protocol === "http:" ? esc(url.href) : "";
    } catch { return ""; }
  };
  const view = () => document.getElementById("view");

  /* ---------- DİL GÜNCELLEMESİ ---------- */
  function applyLang() {
    document.documentElement.lang = lang;
    const isTr = lang === "tr";
    document.title = fmt("Yapay Zekâ Kulübü · YZK", "AI Club · YZK");
    const desc = fmt(
      "Yapay zekâyı birlikte araştıran, deneyen ve sorumlu biçimde üreten disiplinler arası öğrenci topluluğu.",
      "An interdisciplinary student community investigating, experimenting and responsibly building with AI."
    );
    const descMeta = document.querySelector('meta[name="description"]');
    if (descMeta) descMeta.content = desc;
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.content = document.title;
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.content = desc;

    const brandEl = document.getElementById("brandEl");
    if (brandEl) brandEl.setAttribute("aria-label", T[lang].brand);

    const langBtn = document.getElementById("lang");
    if (langBtn) {
      langBtn.textContent = isTr ? "EN" : "TR";
      langBtn.setAttribute("aria-label", isTr ? "Switch to English" : "Türkçeye geç");
    }

    const nav = document.querySelector(".nav");
    if (nav) nav.setAttribute("aria-label", T[lang].ui.mainMenu);

    const skip = document.querySelector(".skip");
    if (skip) skip.textContent = T[lang].ui.skip;

    const palInput = document.getElementById("palInput");
    if (palInput) palInput.placeholder = T[lang].ui.paletteSearch;

    const menuBtn = document.getElementById("menuBtn");
    if (menuBtn) {
      menuBtn.setAttribute("aria-label", T[lang].ui.menu);
      const span = menuBtn.querySelector("span");
      if (span) span.textContent = T[lang].ui.menu;
    }

    document.querySelectorAll(".nav a[data-nav], .top-actions [data-nav]").forEach(a => {
      const key = a.dataset.nav;
      if (T[lang].nav[key]) {
        const icon = a.querySelector('[aria-hidden="true"]');
        a.textContent = T[lang].nav[key];
        if (icon) a.append(" ", icon);
      }
    });

    document.querySelectorAll("[data-copy]").forEach(el => {
      const copy = T[lang].ui[el.dataset.copy];
      if (copy) el.textContent = copy;
    });
  }

  /* ---------- MENÜ VE AKTİF LİNK YÖNETİMİ ---------- */
  function navActive() {
    const path = location.hash.replace(/^#/, "") || "/";
    document.querySelectorAll(".nav a[data-nav], .top-actions [data-nav]").forEach(a => {
      const key = a.dataset.nav;
      let on = false;
      if (key === "home") on = path === "/" || path === "";
      else if (key === "wall") on = path.startsWith("/alanlar") || path.startsWith("/duvar") || path.startsWith("/disiplin");
      else if (key === "news") on = path.startsWith("/haberler") || path.startsWith("/gundem");
      else if (key === "proj") on = path.startsWith("/projeler") || path.startsWith("/proje-baslat");
      else if (key === "evt") on = path.startsWith("/etkinlikler");
      else if (key === "team") on = path.startsWith("/takim") || path.startsWith("/takim-bul") || path.startsWith("/ilan-ver");
      else if (key === "members") on = path.startsWith("/uyeler");
      else if (key === "papers") on = path.startsWith("/makaleler");
      else if (key === "dictionary") on = path.startsWith("/sozluk");
      else if (key === "lab") on = path.startsWith("/laboratuvar");
      else if (key === "leaders") on = path.startsWith("/liderlik");
      else if (key === "board") on = path.startsWith("/yonetim");
      else if (key === "about") on = path.startsWith("/hakkimizda");
      else if (key === "contact") on = path.startsWith("/iletisim");
      else if (key === "apply") on = path.startsWith("/basvuru") || path.startsWith("/kayit") || path.startsWith("/yk-basvuru");
      else if (key === "login") on = path.startsWith("/giris");

      a.classList.toggle("on", on);
      if (on) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });

    document.querySelectorAll(".nav-group").forEach(group => {
      group.classList.toggle("active", Boolean(group.querySelector("a.on")));
    });
    closeMenu();
  }

  function closeMenu() {
    const menu = document.getElementById("menuBtn");
    const nav = document.getElementById("nav");
    if (!nav || !menu) return;
    nav.classList.remove("open");
    nav.querySelectorAll("details[open]").forEach(group => { group.open = false; });
    menu.setAttribute("aria-expanded", "false");
    menu.setAttribute("aria-label", T[lang].ui.menu);
    const span = menu.querySelector("span");
    if (span) span.textContent = T[lang].ui.menu;
  }

  function emptyState(msg, showJoin = true) {
    return `
      <div class="empty">
        <span class="empty-mark">◆ / ${esc(fmt("KAYIT YOK", "NO ENTRIES"))}</span>
        <p>${esc(msg)}</p>
        ${showJoin ? `<a class="btn solid" href="#/basvuru">${esc(T[lang].ctaJoin)} ↗</a>` : ""}
      </div>`;
  }

  /* ---------- MARQUEE / TICKER ---------- */
  function drawMarquee() {
      const el = document.getElementById("marquee");
      if (!el) return;
      const items = T[lang].ticker;
      el.innerHTML = `<div class="marquee-inner">${items.map(t => `<span>${esc(t)}</span>`).join("")}</div>`;
      // auto speed: ~12 sn / öğe (insan okuma hızı)
      const inner = el.querySelector(".marquee-inner");
      if (inner) {
        // ölç: her span genişliği + gap (36px) * (items-1)
        const spans = inner.querySelectorAll("span");
        let totalW = 0;
        spans.forEach(s => { totalW += s.getBoundingClientRect().width; });
        totalW += 36 * (items.length - 1);
        // viewport genişliği kadar kaydırma => süre = (totalW / viewportW) * 12s/öğe yaklaşık
        const vw = document.documentElement.clientWidth;
        const duration = Math.max(20, Math.min(120, (totalW / Math.max(1, vw)) * 12));
        inner.style.setProperty("--marquee-dur", duration + "s");
      }
    }

  /* ---------- DİSİPLİNLER KARTLARI ---------- */
  function wallCardsHtml() {
    const list = DATA.disciplinesAll[lang];
    return list.map((d, i) => `
      <a class="wallcard spotlight-card reveal" href="#/disiplin/${d.slug}">
        <div class="wallcard-image">
          <img src="${esc(d.image)}" alt="${esc(d.label)}" loading="lazy">
          <span class="wallcard-badge">0${i + 1} / 06</span>
        </div>
        <div class="wallcard-body">
          <span class="lab" style="color:var(--cyan);margin-bottom:6px;">${esc(d.label)}</span>
          <h3>${esc(d.title)}</h3>
          <p>${esc(d.q)}</p>
          <div class="wallcard-foot">
            <span>${esc(fmt("İncele & Mercekler", "Explore Perspectives"))}</span>
            <span aria-hidden="true">→</span>
          </div>
        </div>
      </a>
    `).join("");
  }

  /* ---------- HERO CANVASI (Neural Constellation) ---------- */
  function initHeroCanvas() {
    const canvas = document.getElementById("hero-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (heroCanvasAnimId) {
      cancelAnimationFrame(heroCanvasAnimId);
      heroCanvasAnimId = null;
    }

    let width = canvas.width = canvas.parentElement.offsetWidth || 500;
    let height = canvas.height = canvas.parentElement.offsetHeight || 500;

    window.addEventListener("resize", () => {
      if (!canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.offsetWidth;
      height = canvas.height = canvas.parentElement.offsetHeight;
    });

    const nodeCount = 50;
    const nodes = [];
    const colors = ["#E8A33D", "#D4F16C", "#A78BFA"];

    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        radius: Math.random() * 2.5 + 1.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        baseAlpha: Math.random() * 0.5 + 0.3
      });
    }

    let mouseX = -9999, mouseY = -9999;
    canvas.addEventListener("mousemove", e => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    });
    canvas.addEventListener("mouseleave", () => {
      mouseX = -9999;
      mouseY = -9999;
    });

    // Dalga efekti (Ripple)
    let ripples = [];
    canvas.addEventListener("click", e => {
      const rect = canvas.getBoundingClientRect();
      ripples.push({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        r: 5,
        maxR: 160,
        alpha: 0.8
      });
    });

    function draw() {
      ctx.clearRect(0, 0, width, height);

      // Ripples
      for (let ri = ripples.length - 1; ri >= 0; ri--) {
        const rp = ripples[ri];
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 240, 255, ${rp.alpha})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        rp.r += 3.5;
        rp.alpha -= 0.02;
        if (rp.alpha <= 0 || rp.r >= rp.maxR) {
          ripples.splice(ri, 1);
        }
      }

      // Update & Draw Nodes
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        n.x += n.vx;
        n.y += n.vy;

        if (n.x < 0 || n.x > width) n.vx *= -1;
        if (n.y < 0 || n.y > height) n.vy *= -1;

        // Mouse Etkileşimi (Yaklaşınca hafif çekilme / itilme)
        const dx = mouseX - n.x;
        const dy = mouseY - n.y;
        const distMouse = Math.sqrt(dx * dx + dy * dy);
        if (distMouse < 110) {
          const force = (110 - distMouse) / 110;
          n.x -= (dx / distMouse) * force * 2.2;
          n.y -= (dy / distMouse) * force * 2.2;
        }

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.shadowColor = n.color;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Çizgiler
        for (let j = i + 1; j < nodes.length; j++) {
          const n2 = nodes[j];
          const dist = Math.hypot(n.x - n2.x, n.y - n2.y);
          if (dist < 115) {
            const alpha = (1 - dist / 115) * 0.35;
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(n2.x, n2.y);
            ctx.strokeStyle = `rgba(0, 240, 255, ${alpha})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      heroCanvasAnimId = requestAnimationFrame(draw);
    }

    draw();
  }

  /* ---------- GERİ SAYIM (tek interval, tüm [data-cd] öğeleri) ---------- */
  let cdTimer = null;
  function cdParts(deadlineIso) {
    const left = new Date(deadlineIso).getTime() - Date.now();
    if (left <= 0) return { done: true, d: 0, h: 0, m: 0, s: 0 };
    return {
      done: false,
      d: Math.floor(left / 86400000),
      h: Math.floor((left % 86400000) / 3600000),
      m: Math.floor((left % 3600000) / 60000),
      s: Math.floor((left % 60000) / 1000)
    };
  }
  // markup: data-cd="ISO" + data-cd-layout="block|inline"
  function countdownHtml(deadlineIso, layout = "inline") {
    const dl = DATA.announce[lang].deadline;
    const p = cdParts(dl);
    if (p.done) {
      return `<span class="cd cd-done" data-cd="${esc(dl)}" data-cd-layout="${layout}">
        <b>${esc(fmt("BAŞVURU KAPANDI", "CLOSED"))}</b>
      </span>`;
    }
    const pad = n => String(n).padStart(2, "0");
    const cells = [
      { v: pad(p.d), l: fmt("GÜN", "DAYS") },
      { v: pad(p.h), l: fmt("SAAT", "HRS") },
      { v: pad(p.m), l: fmt("DAKİKA", "MIN") },
      { v: pad(p.s), l: fmt("SANİYE", "SEC") }
    ];
    return `<span class="cd cd-${layout}" data-cd="${esc(dl)}" data-cd-layout="${layout}" role="timer" aria-live="off">
      ${cells.map(c => `<span class="cd-cell"><b data-cd-v="${c.l}">${c.v}</b><i>${c.l}</i></span>`).join("")}
    </span>`;
  }
  function tickCountdowns() {
    document.querySelectorAll("[data-cd]").forEach(el => {
      const p = cdParts(el.dataset.cd);
      const cells = el.querySelectorAll(".cd-cell b");
      if (p.done) {
        el.classList.add("cd-done");
        el.innerHTML = `<b>${esc(fmt("BAŞVURU KAPANDI", "CLOSED"))}</b>`;
        return;
      }
      if (cells.length !== 4) return;
      const pad = n => String(n).padStart(2, "0");
      cells[0].textContent = pad(p.d);
      cells[1].textContent = pad(p.h);
      cells[2].textContent = pad(p.m);
      cells[3].textContent = pad(p.s);
    });
  }
  function startCountdowns() {
    if (cdTimer) clearInterval(cdTimer);
    tickCountdowns();
    cdTimer = setInterval(tickCountdowns, 1000);
  }

  /* ---------- ÖNE ÇIKAN DUYURU KARTI ---------- */
  function announceCard() {
    const A = DATA.announce[lang];
    return `
      <a class="announce" href="#/basvuru" aria-label="${esc(A.title)} — ${esc(A.primary)}">
        <span class="announce-visual">
          <img src="./images/duyuru-kurul.jpg" alt="${esc(A.alt)}" loading="eager" width="720" height="480">
          <span class="announce-visual-scrim" aria-hidden="true"></span>
          <span class="announce-visual-top">
            <span class="announce-ribbon">${esc(A.ribbon)}</span>
            <span class="announce-seats">${esc(A.seats)}</span>
          </span>
          <span class="announce-stamp" aria-hidden="true">
            <b>${esc(A.stamp)}</b>
            <i>${esc(A.kicker)}</i>
          </span>
          <span class="announce-cd">${countdownHtml(A.deadline, "block")}</span>
        </span>

        <span class="announce-body">
          <span class="announce-kicker">
            <span class="announce-dot" aria-hidden="true"></span>${esc(A.kicker)}
          </span>
          <span class="announce-title">${esc(A.title)}</span>
          <span class="announce-text">${esc(A.body)}</span>
          <span class="announce-meta">
            ${A.meta.map(m => `<span>${esc(m)}</span>`).join("")}
          </span>
          <span class="announce-cd-inline">
            <span class="announce-cd-label">${esc(fmt("Kalan süre", "Time left"))}</span>
            ${countdownHtml(A.deadline, "inline")}
          </span>
          <span class="announce-actions">
            <span class="announce-cta">${esc(A.primary)} <span aria-hidden="true">↗</span></span>
            <span class="announce-ghost">${esc(A.secondary)}</span>
          </span>
          <span class="announce-stats">
            ${A.stats.map(s => `<span class="announce-stat"><b>${esc(s.n)}</b><i>${esc(s.l)}</i></span>`).join("")}
          </span>
        </span>
      </a>`;
  }

  function renderHome() {
    const L = T[lang];
    const disciplines = DATA.disciplinesAll[lang];
    const events = DATA.events[lang];
    const projects = DATA.projects[lang];
    const digest = DATA.digest[lang];

    view().innerHTML = `
      ${announceCard()}

      <div class="status-banner">
        <span class="status-dot" aria-hidden="true"></span>
        <b>${esc(fmt("KULÜP KURULUŞ ONAY SÜRECİNDE", "CLUB IN OFFICIAL APPROVAL STAGE"))}</b>
        <span class="status-sep" aria-hidden="true">·</span>
        <span>${esc(fmt("Yönetim ve denetim kurulu başvuruları açık — son tarih 23 Ekim 23:00", "Board & audit applications open — deadline Oct 23, 23:00"))}</span>
        ${countdownHtml(DATA.announce[lang].deadline, "inline")}
        <a href="#/basvuru" class="status-link">${esc(fmt("Başvur", "Apply"))} ↗</a>
      </div>

      <section class="hero hero-home">
        <div class="hero-copy">
          <div class="eyebrow">
            <span class="live-dot" aria-hidden="true"></span>
            <span>${esc(L.heroBadge)}</span>
          </div>
          <h1>
            <span>${esc(L.heroTitle1)}</span>
            <em>${esc(L.heroTitle2)}</em>
            <span>${esc(L.heroTitle3)}</span>
          </h1>
          <p class="lede">${esc(L.heroLede)}</p>
          <div class="cta-row">
            <a class="btn solid magnetic" href="#/basvuru">
              ${esc(L.ctaJoin)} <span aria-hidden="true">↗</span>
            </a>
            <a class="btn" href="#/alanlar">
              ${esc(L.ctaExplore)} <span aria-hidden="true">→</span>
            </a>
          </div>
          <div class="hero-meta">
            <div><b>01</b> ${esc(fmt("ARAŞTIR", "RESEARCH"))}</div>
            <div><b>02</b> ${esc(fmt("DENE", "PROTOTYPE"))}</div>
            <div><b>03</b> ${esc(fmt("PAYLAŞ", "DEPLOY"))}</div>
          </div>
        </div>

        <div class="hero-art-container">
          <canvas id="hero-canvas" class="hero-canvas"></canvas>
          <div class="hero-art-overlay">
            <div class="art-topline">
              <span>YZK / DİSİPLİNLER MATRİSİ</span>
              <b>CANLI SİSTEM</b>
            </div>
            <div class="art-card-pill">
              <span>YZK ODAK NOKTASI</span>
              <strong>Farklı disiplinler, ortak bir zekâ dili.</strong>
            </div>
            <div class="art-footline">
              <span>ÖĞREN · DENE · PAYLAŞ</span>
              <span>v2.4 // 2026</span>
            </div>
          </div>
        </div>
      </section>

      <div class="field-strip" role="group" aria-label="Odaklar">
        <span>${esc(fmt("İNSAN & ETİK", "HUMAN & ETHICS"))}</span><i>×</i>
        <span>${esc(fmt("VERİ EGEMENLİĞİ", "DATA SOVEREIGNTY"))}</span><i>×</i>
        <span>${esc(fmt("MODEL ŞEFFAFLIĞI", "MODEL TRANSPARENCY"))}</span><i>×</i>
        <span>${esc(fmt("TOPLUMSAL ETKİ", "SOCIETAL IMPACT"))}</span>
      </div>

      <!-- ODAK ALANLARI -->
      <section class="sec">
        <div class="sec-head">
          <div>
            <span class="lab" style="color:var(--cyan);">01 / ALANLAR</span>
            <h2>${esc(L.secDiscipline)}</h2>
          </div>
          <a class="btn" href="#/alanlar">${esc(L.go)} →</a>
        </div>
        <p class="sec-intro">${esc(L.secDisciplineSub)}</p>
        <div class="grid g3">${wallCardsHtml()}</div>
      </section>

      <!-- ÇALIŞMA PROGRAMI -->
      <section class="sec">
        <div class="sec-head">
          <div>
            <span class="lab" style="color:var(--lime);">02 / METODOLOJİ</span>
            <h2>${esc(L.secProgram)}</h2>
          </div>
          <span class="tag">4 ADIMLI ÜRETİM DİSİPLİNİ</span>
        </div>
        <p class="sec-intro">${esc(L.secProgramSub)}</p>
        <div class="featbox">
          ${DATA.program[lang].map(p => `
            <div class="feat spotlight-card reveal">
              <div class="no">${p.no} // ${esc(p.tag)}</div>
              <h3>${esc(p.title)}</h3>
              <p>${esc(p.desc)}</p>
            </div>
          `).join("")}
        </div>
      </section>

      <!-- YAKLAŞAN ETKİNLİKLER -->
      <section class="sec">
        <div class="sec-head">
          <div>
            <span class="lab" style="color:var(--cyan);">03 / BULUŞMALAR</span>
            <h2>${esc(L.secEvents)}</h2>
          </div>
          <a class="btn" href="#/etkinlikler">${esc(L.go)} →</a>
        </div>
        <p class="sec-intro">${esc(L.secEventsSub)}</p>
        <div class="grid g2">
          ${events.slice(0, 2).map(evCard).join("")}
        </div>
      </section>

      <!-- PROJELER VE ÜRETİMLER -->
      <section class="sec">
        <div class="sec-head">
          <div>
            <span class="lab" style="color:var(--violet);">04 / PROTOTİPLER</span>
            <h2>${esc(L.secProjects)}</h2>
          </div>
          <a class="btn" href="#/projeler">${esc(L.go)} →</a>
        </div>
        <p class="sec-intro">${esc(L.secProjectsSub)}</p>
        <div class="grid g2">
          ${projects.slice(0, 2).map(projCard).join("")}
        </div>
      </section>

      <!-- GÜNDEM NOTLARI -->
      <section class="sec">
        <div class="sec-head">
          <div>
            <span class="lab" style="color:var(--amber);">05 / GÜNDEM</span>
            <h2>${esc(L.secNews)}</h2>
          </div>
          <a class="btn" href="#/haberler">${esc(L.go)} →</a>
        </div>
        <p class="sec-intro">${esc(L.secNewsSub)}</p>
        <div class="grid g2">
          ${digest.slice(0, 2).map(newsCard).join("")}
        </div>
      </section>

      <!-- KATILIM ÇAĞRISI (JOIN BANNER) -->
      <section class="spotlight-card reveal" style="margin-top:100px;padding:clamp(32px,5vw,60px);background:linear-gradient(135deg,var(--surf),var(--surf2));border-color:var(--line-cyan);">
        <div style="max-width:760px">
          <span class="lab" style="color:var(--cyan);">BU MASADA HER DİSİPLİNE YER VAR</span>
          <h2 style="font:700 clamp(2.2rem,4.5vw,3.6rem)/1.1 var(--display);margin:16px 0 20px;color:var(--fg);">
            ${esc(fmt("Merak ettiğin soruyla masaya otur.", "Bring your question to the table."))}
          </h2>
          <p style="font-size:17px;line-height:1.6;color:var(--muted);margin-bottom:32px;">
            ${esc(fmt(
              "Kod bilmen şart değil; bir problemi doğru tanımlamak, etik bir sınırı görebilmek ya da yeni bir deney tasarlamak en az kod yazmak kadar değerlidir.",
              "You don't need to be a programmer; framing the right questions, seeing ethical implications, and designing experiments are just as critical."
            ))}
          </p>
          <div class="cta-row">
            <a class="btn solid" href="#/basvuru">${esc(L.ctaJoin)} ↗</a>
            <a class="btn" href="#/yk-basvuru">${esc(fmt("Yönetim Kadrosuna Başvur", "Apply for Executive Board"))} →</a>
          </div>
        </div>
      </section>
    `;

    initHeroCanvas();
    attachSpotlights();
  }

  /* ---------- KART BİLEŞENLERİ ---------- */
  function evCard(e) {
    const cap = Number(e.cap), filled = Number(e.filled);
    const pct = cap > 0 ? Math.min(100, Math.round((filled / cap) * 100)) : 0;
    return `
      <article class="ev spotlight-card reveal">
        <div class="date">
          <b>${esc(e.d)}</b>
          <span>${esc(e.mo)}</span>
        </div>
        <div class="body">
          <div class="k">${esc(e.k)} · ${esc(e.loc)}</div>
          <h3>${esc(e.t)}</h3>
          <p>${esc(e.p)}</p>
          <div class="cap"><i style="width:${pct}%"></i></div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;">
            <span class="cap-label">${filled === 0 ? esc(fmt("Kontenjan açık · 0/" + cap, "Seats open · 0/" + cap)) : `${filled} / ${cap} ${esc(T[lang].kayıt)} (${pct}%)`}</span>
            <a class="btn"  href="#/basvuru">${esc(fmt("Kaydol", "RSVP"))} ↗</a>
          </div>
        </div>
      </article>`;
  }

  function projCard(p) {
    const lvl = p.level || p.k;
    const lvlColor = /Başlangıç|Beginner/i.test(lvl) ? "var(--lime)"
                   : /Orta|Intermediate/i.test(lvl) ? "var(--cyan)"
                   : "var(--violet)";
    const lvlBg = /Başlangıç|Beginner/i.test(lvl) ? "rgba(201,224,92,.12)"
                : /Orta|Intermediate/i.test(lvl) ? "rgba(232,163,61,.12)"
                : "rgba(139,123,240,.12)";
    return `
      <div class="card spotlight-card reveal">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
          <span class="pill" style="color:${lvlColor};border-color:${lvlColor};background:${lvlBg};font-weight:700;letter-spacing:.06em;">${esc(lvl)}</span>
          ${p.when ? `<span class="pill" style="color:var(--dim);">${esc(p.when)}</span>` : ""}
        </div>
        <h3>${esc(p.t)}</h3>
        <p>${esc(p.p)}</p>
        <div style="margin-top:14px;">
          ${(p.tags || []).map(t => `<span class="pill">${esc(t)}</span>`).join("")}
        </div>
        <div class="meta" style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <span>${esc(p.m)}</span>
          ${p.open ? `<span style="color:var(--lime);font:700 9.5px var(--mono);letter-spacing:.08em;">● ${esc(T[lang].openPos)}</span>`
                   : `<span style="color:var(--dim);font:700 9.5px var(--mono);letter-spacing:.08em;">○ ${esc(fmt("KADRO DOLU", "TEAM FULL"))}</span>`}
        </div>
      </div>`;
  }

  function newsCard(n) {
    const source = String(n.src || "YZK");
    const href = safeHref(n.url);
    return `
      <div class="news spotlight-card reveal">
        <div class="stamp" style="background:var(--surf2);color:var(--cyan);border-color:var(--line-cyan);">
          ${esc(source.slice(0, 2).toUpperCase())}
        </div>
        <div style="flex:1;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px;">
            <span class="lab" style="color:var(--cyan);">${esc(n.k || "GÜNDEM")}</span>
            <span class="lab" style="color:var(--dim);">${esc(source)}</span>
          </div>
          <h3>${esc(n.t)}</h3>
          <p>${esc(n.why)}</p>
          ${href ? `<a class="btn" style="margin-top:14px;" href="${href}" target="_blank" rel="noopener noreferrer">${esc(fmt("Kaynağı Oku", "Read Source"))} ↗</a>` : ""}
        </div>
      </div>`;
  }

  /* ---------- GÖRÜNÜM: DİSİPLİN DETAYI ---------- */
  function renderDiscipline(slug) {
    const all = DATA.disciplinesAll[lang];
    const me = all.find(x => x.slug === slug);
    if (!me) return render404();

    const idx = all.indexOf(me);
    const next = all[(idx + 1) % all.length];

    view().innerHTML = `
      <div style="margin-bottom:24px;">
        <a class="btn"  href="#/alanlar">← ${esc(fmt("Tüm Odak Alanları", "All Focus Areas"))}</a>
      </div>

      <div class="discipline-kicker">
        <span class="lab" style="color:var(--cyan);">0${idx + 1} / 06</span>
        <span class="lab">${esc(me.label)} × YAPAY ZEKÂ</span>
      </div>

      <h1 class="dquestion">${esc(me.q)}</h1>
      <p class="danswer">${esc(me.summary)}</p>

      <img class="discipline-hero-img" src="${esc(me.image)}" alt="${esc(me.label)}">

      <section class="sec">
        <div class="sec-head">
          <div>
            <span class="lab" style="color:var(--cyan);">ÜÇ AYRI MERCEK</span>
            <h2>${esc(fmt("Perspektifleri İncele", "Explore Perspectives"))}</h2>
          </div>
          <span class="tag">İNSAN · MODEL · ETKİ</span>
        </div>

        <div class="lens-layout">
          <div class="lens-tabs" role="tablist">
            <button class="lens-tab" id="tab-human" type="button" role="tab" aria-selected="true" data-label="İNSAN DENEYİMİ" data-body="${esc(me.human)}">
              <span>01 / ${esc(fmt("İNSAN", "HUMAN"))}</span>
              <strong>${esc(fmt("Kullanıcı & Haklar", "Users & Rights"))}</strong>
            </button>
            <button class="lens-tab" id="tab-model" type="button" role="tab" aria-selected="false" data-label="MODEL VE VERİ" data-body="${esc(me.model)}">
              <span>02 / ${esc(fmt("MODEL", "MODEL"))}</span>
              <strong>${esc(fmt("Veri & Algoritma", "Data & Algorithm"))}</strong>
            </button>
            <button class="lens-tab" id="tab-impact" type="button" role="tab" aria-selected="false" data-label="TOPLUMSAL ETKİ" data-body="${esc(me.impact)}">
              <span>03 / ${esc(fmt("ETKİ", "IMPACT"))}</span>
              <strong>${esc(fmt("Toplum & Sorumluluk", "Society & Liability"))}</strong>
            </button>
          </div>

          <article class="lens-panel" id="lensPanel">
            <span class="lab" id="lensTag" style="color:var(--cyan);">01 / İNSAN DENEYİMİ</span>
            <h3 id="lensTitle">${esc(fmt("Kullanıcı, Haklar ve Deneyim", "User, Rights and Experience"))}</h3>
            <p id="lensBody">${esc(me.human)}</p>
          </article>
        </div>
      </section>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:60px;padding-top:24px;border-top:1px solid var(--line);">
        <a class="btn" href="#/disiplin/${next.slug}">
          ${esc(fmt("Sonraki Odak", "Next Focus"))}: ${esc(next.label)} →
        </a>
        <a class="btn solid" href="#/basvuru">${esc(T[lang].ctaJoin)} ↗</a>
      </div>
    `;

    // Lens Tab Tıklama
    const tabs = view().querySelectorAll(".lens-tab");
    tabs.forEach(tab => {
      tab.addEventListener("click", () => {
        tabs.forEach(t => t.setAttribute("aria-selected", "false"));
        tab.setAttribute("aria-selected", "true");
        document.getElementById("lensTag").textContent = tab.dataset.label;
        document.getElementById("lensTitle").textContent = tab.querySelector("strong").textContent;
        document.getElementById("lensBody").textContent = tab.dataset.body;
      });
    });

    attachSpotlights();
  }

  /* ---------- GÖRÜNÜM: ODAK ALANLARI / DUVAR ---------- */
  function renderWall() {
    view().innerHTML = `
      <section class="hero">
        <span class="lab" style="color:var(--cyan);">DİSİPLİNLER MATRİSİ</span>
        <h1>${esc(fmt("Yapay zekâyı tek bir alana hapsetmiyoruz.", "We don't isolate AI into a single discipline."))}</h1>
        <p class="lede">${esc(T[lang].secDisciplineSub)}</p>
      </section>
      <div class="grid g3" style="margin-top:30px;">
        ${wallCardsHtml()}
      </div>
    `;
    attachSpotlights();
  }

  /* ---------- GÖRÜNÜM: ETKİNLİKLER ---------- */
  function renderEtkinlikler() {
    const events = DATA.events[lang];
    view().innerHTML = `
      <section class="hero">
        <span class="lab" style="color:var(--cyan);">BULUŞMALAR & ATÖLYELER</span>
        <h1>${esc(T[lang].secEvents)}</h1>
        <p class="lede">${esc(T[lang].secEventsSub)}</p>
        <div class="cta-row" style="margin-top:20px;">
          <button class="btn" id="dlIcsBtn" type="button">${esc(fmt("Takvime Ekle (.ics)", "Export Calendar (.ics)"))} 📅</button>
        </div>
      </section>

      <div class="filter-bar">
        <label class="filter-field search-wide">
          <span>⌕</span>
          <input id="evtSearch" type="search" placeholder="${esc(fmt("Etkinlik ara…", "Search events…"))}">
        </label>
        <label class="filter-field">
          <span>TÜR:</span>
          <select id="evtCategory">
            <option value="all">${esc(T[lang].hepsi)}</option>
            <option value="Atölye">${esc(fmt("Atölye", "Workshop"))}</option>
            <option value="Panel">Panel</option>
            <option value="Seminer">${esc(fmt("Seminer", "Seminar"))}</option>
            <option value="Hackathon">Hackathon</option>
          </select>
        </label>
        <span class="result-count" id="evtCount"></span>
      </div>

      <div class="grid g2" id="evtGrid">
        ${events.map(evCard).join("")}
      </div>
    `;

    const search = document.getElementById("evtSearch");
    const cat = document.getElementById("evtCategory");
    const grid = document.getElementById("evtGrid");
    const count = document.getElementById("evtCount");

    function filterEvents() {
      const q = (search.value || "").toLowerCase();
      const c = cat.value;
      const filtered = events.filter(e => {
        const matchQ = (e.t + " " + e.p + " " + e.loc).toLowerCase().includes(q);
        const matchC = c === "all" || e.k === c;
        return matchQ && matchC;
      });
      count.textContent = `${filtered.length} / ${events.length}`;
      grid.innerHTML = filtered.length ? filtered.map(evCard).join("") : emptyState(fmt("Eşleşen etkinlik bulunamadı.", "No matching events found."), false);
      attachSpotlights();
    }

    search.addEventListener("input", filterEvents);
    cat.addEventListener("change", filterEvents);
    document.getElementById("dlIcsBtn").addEventListener("click", downloadICS);
    filterEvents();
  }

  /* ---------- GÖRÜNÜM: PROJELER ---------- */
  function renderProjeler() {
    const projs = DATA.projects[lang];
    view().innerHTML = `
      <section class="hero">
        <span class="lab" style="color:var(--violet);">ÜRETİM ARŞİVİ</span>
        <h1>${esc(T[lang].secProjects)}</h1>
        <p class="lede">${esc(T[lang].secProjectsSub)}</p>
        <div class="cta-row" style="margin-top:20px;">
          <a class="btn solid" href="#/proje-baslat">${esc(fmt("Yeni Proje Taslağı Başlat", "Create Project Brief"))} ↗</a>
        </div>
      </section>

      <div class="filter-tabs" style="margin-top:8px;">
        <button class="filter-tab active" data-filter="all">${esc(fmt("Tümü", "All"))} (${projs.length})</button>
        <button class="filter-tab" data-filter="beginner">${esc(fmt("Başlangıç", "Beginner"))}</button>
        <button class="filter-tab" data-filter="intermediate">${esc(fmt("Orta", "Intermediate"))}</button>
        <button class="filter-tab" data-filter="advanced">${esc(fmt("İleri", "Advanced"))}</button>
        <button class="filter-tab" data-filter="open">${esc(fmt("Ekip Arıyor", "Hiring"))}</button>
      </div>

      <div class="grid g2" id="projGrid">
        ${projs.map(projCard).join("")}
      </div>
    `;

    const grid = document.getElementById('projGrid');
    document.querySelectorAll('.filter-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const f = btn.dataset.filter;
        const filtered = f === 'all' ? projs : projs.filter(p => {
          if (f === 'open') return p.open;
          const lvl = (p.level || p.k || '').toLowerCase();
          if (f === 'beginner') return /başlangıç|beginner/.test(lvl);
          if (f === 'intermediate') return /orta|intermediate/.test(lvl);
          if (f === 'advanced') return /ileri|advanced/.test(lvl);
          return p.status === f;
        });
        grid.innerHTML = filtered.length ? filtered.map(projCard).join('') : emptyState(fmt('Bu filtreyle proje bulunamadı.', 'No projects match this filter.'), false);
        attachSpotlights();
      });
    });

    attachSpotlights();
  }

  /* ---------- GÖRÜNÜM: HABERLER ---------- */
  function renderGundem() {
    const digest = DATA.digest[lang];
    view().innerHTML = `
      <section class="hero">
        <span class="lab" style="color:var(--amber);">KAYNAKLI ANALİZLER</span>
        <h1>${esc(T[lang].secNews)}</h1>
        <p class="lede">${esc(T[lang].secNewsSub)}</p>
      </section>
      <div class="grid g2" style="margin-top:30px;">
        ${digest.map(newsCard).join("")}
      </div>
    `;
    attachSpotlights();
    startCountdowns();
  }

  /* ---------- GÖRÜNÜM: MAKALELER ---------- */
  function renderMakaleler() {
    const papers = DATA.readings[lang];
    view().innerHTML = `
      <section class="hero">
        <span class="lab" style="color:var(--cyan);">TEMEL LİTERATÜR</span>
        <h1>${esc(fmt("Kaynağına İnelim: Seçilmiş Makaleler", "Selected Landmark Research Papers"))}</h1>
        <p class="lede">${esc(fmt("Transformer mimarisinden RAG sistemlerine, LoRA'dan etik değerlendirmelere kadar temel başvuru metinleri.", "From Transformer mechanics to RAG pipelines, LoRA fine-tuning and ethical evaluations."))}</p>
      </section>
      <div class="reading-grid" style="margin-top:30px;">
        ${papers.map(p => `
          <article class="reading-card spotlight-card reveal">
            <div class="reading-meta">
              <span>${esc(p.venue)} · ${esc(p.year)}</span>
              <span class="lab" style="color:var(--lime);">${esc(p.group)}</span>
            </div>
            <h2>${esc(p.title)}</h2>
            <p class="reading-authors">${esc(p.authors)}</p>
            <p>${esc(p.note)}</p>
            <a class="btn" style="margin-top:16px;" href="${safeHref(p.url)}" target="_blank" rel="noopener noreferrer">${esc(fmt("Makaleyi Aç (ArXiv)", "Open Paper (ArXiv)"))} ↗</a>
          </article>
        `).join("")}
      </div>
    `;
    attachSpotlights();
  }

  /* ---------- GÖRÜNÜM: SÖZLÜK ---------- */
  function renderSozluk() {
    const terms = DATA.dictionary[lang];
    view().innerHTML = `
      <section class="hero">
        <span class="lab" style="color:var(--cyan);">KAVRAM REHBERİ</span>
        <h1>${esc(fmt("Yapay Zekâ Terminolojisi", "Artificial Intelligence Glossary"))}</h1>
        <p class="lede">${esc(fmt("Model, mimari ve etik alanındaki teknik terimlerin net ve anlaşılır tanımları.", "Crisp definitions for foundational, architectural and ethical AI terminology."))}</p>
      </section>

      <div class="filter-bar">
        <label class="filter-field search-wide">
          <span>⌕</span>
          <input id="termSearch" type="search" placeholder="${esc(fmt("Kavram ara (örn. RAG, Transformer, LoRA)…", "Search terms…"))}">
        </label>
        <span class="result-count" id="termCount"></span>
      </div>

      <div class="dictionary-grid" id="dictGrid" style="margin-top:20px;">
        ${terms.map(t => `
          <div class="dictionary-item spotlight-card reveal">
            <span class="lab" style="color:var(--cyan);">${esc(t.group)}</span>
            <h2>${esc(t.term)}</h2>
            <p>${esc(t.definition)}</p>
          </div>
        `).join("")}
      </div>
    `;

    const search = document.getElementById("termSearch");
    const grid = document.getElementById("dictGrid");
    const count = document.getElementById("termCount");

    function filterTerms() {
      const q = (search.value || "").toLowerCase();
      const filtered = terms.filter(t => (t.term + " " + t.definition).toLowerCase().includes(q));
      count.textContent = `${filtered.length} / ${terms.length}`;
      grid.innerHTML = filtered.length ? filtered.map(t => `
        <div class="dictionary-item spotlight-card reveal">
          <span class="lab" style="color:var(--cyan);">${esc(t.group)}</span>
          <h2>${esc(t.term)}</h2>
          <p>${esc(t.definition)}</p>
        </div>
      `).join("") : emptyState(fmt("Kavram bulunamadı.", "No terms found."), false);
      attachSpotlights();
    }

    search.addEventListener("input", filterTerms);
    filterTerms();
  }

  /* ---------- GÖRÜNÜM: AÇIK LABORATUVAR ---------- */
  function renderLaboratuvar() {
    view().innerHTML = `
      <section class="hero">
        <span class="lab" style="color:var(--cyan);">İNTERAKTİF TEST ODASI</span>
        <h1>${esc(fmt("Açık Laboratuvar & Tanılama Araçları", "Open Laboratory & Diagnostics"))}</h1>
        <p class="lede">${esc(fmt("Tüm hesaplamalar tarayıcında istemci tarafında gerçekleşir; hiçbir veri dışarıya aktarılmaz.", "All computations execute client-side inside your browser sandbox; zero telemetry."))}</p>
      </section>

      <!-- ARAÇ 1: KARMAŞIKLIK MATRİSİ HESAPLAYICI -->
      <div class="lab-tool spotlight-card reveal">
        <div class="lab-tool-head">
          <div>
            <span class="lab" style="color:var(--cyan);">ARAÇ 01</span>
            <h2>${esc(fmt("Karmaşıklık Matrisi & Sınıflandırma Metrikleri", "Confusion Matrix Calculator"))}</h2>
          </div>
          <div class="cta-row">
            <button class="btn" id="metricSample" type="button">${esc(fmt("Örnek Veri Yükle", "Load Example"))}</button>
            <button class="btn" id="metricClear" type="button">${esc(fmt("Temizle", "Clear"))}</button>
          </div>
        </div>

        <div class="lab-tool-grid">
          <form id="metricsForm" class="metric-inputs">
            <label class="metric-cell">
              <span>${esc(fmt("Doğru Pozitif (TP)", "True Positive (TP)"))}</span>
              <input id="metricTP" type="number" min="0" value="84">
            </label>
            <label class="metric-cell">
              <span>${esc(fmt("Yanlış Pozitif (FP)", "False Positive (FP)"))}</span>
              <input id="metricFP" type="number" min="0" value="12">
            </label>
            <label class="metric-cell">
              <span>${esc(fmt("Yanlış Negatif (FN)", "False Negative (FN)"))}</span>
              <input id="metricFN" type="number" min="0" value="16">
            </label>
            <label class="metric-cell">
              <span>${esc(fmt("Doğru Negatif (TN)", "True Negative (TN)"))}</span>
              <input id="metricTN" type="number" min="0" value="88">
            </label>
          </form>

          <div class="metric-results">
            <div class="metric-result">
              <span>${esc(fmt("DOĞRULUK (ACCURACY)", "ACCURACY"))}</span>
              <b id="mAccuracy">—</b>
            </div>
            <div class="metric-result">
              <span>${esc(fmt("KESİNLİK (PRECISION)", "PRECISION"))}</span>
              <b id="mPrecision">—</b>
            </div>
            <div class="metric-result">
              <span>${esc(fmt("DUYARLILIK (RECALL)", "RECALL"))}</span>
              <b id="mRecall">—</b>
            </div>
            <div class="metric-result">
              <span>${esc(fmt("F1 SKORU", "F1 SCORE"))}</span>
              <b id="mF1">—</b>
            </div>
          </div>
        </div>
      </div>

      <!-- ARAÇ 2: TOKEN VE BAĞLAM PENCERESİ TAHMİNCİSİ -->
      <div class="token-calc-box spotlight-card reveal">
        <div class="lab-tool-head">
          <div>
            <span class="lab" style="color:var(--lime);">ARAÇ 02</span>
            <h2>${esc(fmt("Token & Bağlam Penceresi Tahmincisi", "Token & Context Estimator"))}</h2>
          </div>
        </div>
        <p style="color:var(--muted);font-size:14px;">
          ${esc(fmt("Metnini yapıştır veya yaz; tahmini token sayısı, bayt boyutu ve popüler model pencerelerindeki doluluk oranını anlık gör.", "Paste or type text to inspect estimated tokens, byte length, and context utilization across major model tiers."))}</p>
        <textarea id="tokenInput" placeholder="${esc(fmt("Metnini buraya yapıştır…", "Paste text here…"))}">Yapay Zekâ Kulübü, disiplinler arası bir anlayışla modelleri inceleyen ve açık kaynaklı projeler geliştiren bir topluluktur.</textarea>
        
        <div class="token-stats-bar">
          <div class="token-stat-item">
            <span>KARAKTER</span>
            <strong id="tokChars">0</strong>
          </div>
          <div class="token-stat-item">
            <span>KELİME</span>
            <strong id="tokWords">0</strong>
          </div>
          <div class="token-stat-item">
            <span>TAHMİNİ TOKEN</span>
            <strong id="tokTokens">0</strong>
          </div>
          <div class="token-stat-item">
            <span>8K PENCERE DOLULUĞU</span>
            <strong id="tok8k">0%</strong>
          </div>
        </div>
      </div>
    `;

    // Metrik Formu Hesaplama
    const fields = ["TP", "FP", "FN", "TN"].map(k => document.getElementById(`metric${k}`));
    function calcMetrics() {
      const counts = fields.map(f => Number(f.value) || 0);
      try {
        const res = calculateMetrics(...counts);
        const p = v => v == null ? "—" : (v * 100).toFixed(1) + "%";
        document.getElementById("mAccuracy").textContent = p(res.accuracy);
        document.getElementById("mPrecision").textContent = p(res.precision);
        document.getElementById("mRecall").textContent = p(res.recall);
        document.getElementById("mF1").textContent = p(res.f1);
      } catch (e) {
        console.error(e);
      }
    }

    fields.forEach(f => f.addEventListener("input", calcMetrics));
    document.getElementById("metricSample").addEventListener("click", () => {
      [90, 10, 15, 85].forEach((v, i) => fields[i].value = v);
      calcMetrics();
    });
    document.getElementById("metricClear").addEventListener("click", () => {
      fields.forEach(f => f.value = 0);
      calcMetrics();
    });
    calcMetrics();

    // Token Hesaplayıcı
    const tokInput = document.getElementById("tokenInput");
    function updateTokens() {
      const txt = tokInput.value || "";
      const chars = txt.length;
      const words = txt.trim() ? txt.trim().split(/\s+/).length : 0;
      // Türkçe için ortalama ~1.4 token / kelime veya ~4 karakter / token
      const tokens = Math.round(chars / 3.4);
      const pct8k = ((tokens / 8192) * 100).toFixed(2) + "%";

      document.getElementById("tokChars").textContent = chars;
      document.getElementById("tokWords").textContent = words;
      document.getElementById("tokTokens").textContent = tokens;
      document.getElementById("tok8k").textContent = pct8k;
    }
    tokInput.addEventListener("input", updateTokens);
    updateTokens();

    attachSpotlights();
  }

  /* ---------- GÖRÜNÜM: TAKIM BUL ---------- */
  function renderTakim() {
    const ads = DATA.teamAds[lang];
    view().innerHTML = `
      <section class="hero">
        <span class="lab" style="color:var(--cyan);">TAKIM EŞLEŞMESİ</span>
        <h1>${esc(fmt("Birlikte Üretecek Ekip Arkadaşları Bul", "Find Collaborators to Build With"))}</h1>
        <p class="lede">${esc(fmt("Hackathonlar, araştırma projeleri veya açık kaynak denemeleri için açık çağrılar.", "Open calls for hackathons, research sprints and open-source prototyping."))}</p>
        <div class="cta-row" style="margin-top:20px;">
          <a class="btn solid" href="#/ilan-ver">${esc(fmt("Yeni Ekip Çağrısı Başlat", "Create Team Call"))} ↗</a>
        </div>
      </section>

      <div class="grid g3" style="margin-top:30px;">
        ${ads.map(ad => `
          <div class="spotlight-card reveal">
            <span class="pill" style="color:var(--lime);border-color:var(--lime);">${esc(ad.cat)}</span>
            <h2 style="font:700 1.4rem var(--display);margin:14px 0 8px;color:var(--fg);">${esc(ad.role)}</h2>
            <p style="font-size:12px;color:var(--cyan);margin-bottom:12px;">${esc(ad.by)}</p>
            <p style="color:var(--muted);font-size:13.5px;line-height:1.6;">${esc(ad.desc)}</p>
            <div style="margin-top:16px;">
              ${(ad.need || []).map(n => `<span class="pill">${esc(n)}</span>`).join("")}
            </div>
            <a class="btn" style="margin-top:20px;width:100%;" href="#/basvuru">${esc(fmt("İletişime Geç", "Reach Out"))} →</a>
          </div>
        `).join("")}
      </div>
    `;
    attachSpotlights();
  }

  /* ---------- GÖRÜNÜM: ÜYELER & YÖNETİM & LİDERLİK ---------- */
  function renderUyeler() {
    const members = DATA.members[lang];
    const has = members && members.length;
    view().innerHTML = `
      <section class="hero">
        <span class="lab" style="color:var(--cyan);">TOPLULUK</span>
        <h1>${esc(fmt("Kulüp Üyelerimiz", "Community Members"))}</h1>
        <p class="lede">${esc(fmt("Kulübümüz kuruluş onay sürecinde. Üye kayıtları onayın ardından, yönetim ve denetim kurulu oluştuktan sonra burada listelenecek.", "The club is in its official approval stage. Member records will be listed here once approved and after the board and audit committee is formed."))}</p>
      </section>

      ${has ? `<div class="grid g3" style="margin-top:30px;">
        ${members.map(m => {
          const initials = m[0].split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
          return `
            <div class="member-card reveal spotlight-card">
              <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;">
                <div class="member-avatar">${esc(initials)}</div>
                <div>
                  <div class="member-name">${esc(m[0])}</div>
                  <div class="member-dept">${esc(m[1])}</div>
                </div>
              </div>
              <div class="tag-list">${(m[2] || []).map(s => `<span class="pill">${esc(s)}</span>`).join('')}</div>
            </div>`;
        }).join('')}
      </div>`
      : `<div class="empty-state" style="margin-top:32px;">
          <div class="empty-icon">○</div>
          <h3>${esc(fmt("Henüz listelenmiş üye yok", "No members listed yet"))}</h3>
          <p>${esc(fmt("Kulüp onay sürecinde olduğu için üye kaydı henüz açılmadı. Onay sonrası bu alan dolacak.", "Membership registration is not open while the club is awaiting approval. This area will fill in after approval."))}</p>
          <a class="btn solid" href="#/basvuru" style="margin-top:18px;">${esc(fmt("Yönetim / Denetim Başvurusu", "Board / Audit Application"))} ↗</a>
        </div>`}
    `;
    attachSpotlights();
  }

  function renderYonetim() {
    const board = DATA.boardMembers[lang];
    const openSeats = DATA.announce[lang].stats;
    view().innerHTML = `
      <section class="hero">
        <span class="lab" style="color:var(--cyan);">ORGANİZASYON</span>
        <h1>${esc(fmt("Kulüp Yönetim Kadrosu", "Executive Board"))}</h1>
        <p class="lede">${esc(fmt("Kulübümüz kuruluş onay sürecinde. Yönetim ve denetim kurulu şu anda başvurularla oluşturuluyor.", "The club is in its official approval stage. The board and audit committee are being formed from current applications."))}</p>
        <div class="cta-row" style="margin-top:20px;">
          <a class="btn solid" href="#/basvuru">${esc(fmt("Yönetim / Denetim Başvurusu", "Board / Audit Application"))} ↗</a>
          ${countdownHtml(DATA.announce[lang].deadline, "inline")}
        </div>
      </section>

      <div class="grid g3" style="margin-top:30px;">
        ${board.map(b => `
          <div class="spotlight-card reveal">
            <span class="lab" style="color:var(--cyan);">${esc(b.role)}</span>
            <h3 style="font:700 1.35rem var(--display);margin:10px 0 6px;">${esc(b.name)}</h3>
            <p style="color:var(--muted);font-size:13px;">${esc(b.department)}</p>
          </div>
        `).join("")}
        ${openSeats.map(s => `
          <div class="spotlight-card reveal seat-card">
            <span class="lab" style="color:var(--cyan);">${esc(fmt("AÇIK KADRO", "OPEN SEATS"))}</span>
            <h3 class="seat-count">${esc(s.n)}</h3>
            <p class="seat-label">${esc(s.l)}</p>
            <p style="color:var(--muted);font-size:13px;">${esc(fmt("Başvurulara açık — 23 Ekim 23:00'a kadar.", "Open for applications — until Oct 23, 23:00."))}</p>
            <a class="btn sm" href="#/basvuru" style="margin-top:12px;display:inline-flex;">${esc(fmt("Başvur", "Apply"))} ↗</a>
          </div>
        `).join("")}
      </div>
    `;
    attachSpotlights();
    startCountdowns();
  }

  function renderLiderlik() {
    const rows = DATA.leaderboard[lang];
    view().innerHTML = `
      <section class="hero">
        <span class="lab" style="color:var(--lime);">KATKILAR & EMEK</span>
        <h1>${esc(fmt("Topluluk Katkı Tablosu", "Contribution Matrix"))}</h1>
        <p class="lede">${esc(fmt("Açık kaynak repolarına, veri setlerine ve atölyelere sunulan doğrulanabilir katkılar.", "Verifiable contributions to open repositories, dataset curations and community workshops."))}</p>
      </section>
      <div class="spotlight-card reveal contrib-table" style="margin-top:30px;padding:0;">
        <div class="contrib-head" style="display:grid;grid-template-columns:50px 1.5fr 2fr 1fr;padding:16px 24px;border-bottom:1px solid var(--line);font:700 11px var(--mono);color:var(--cyan);">
          <span>#</span>
          <span>ÇALIŞMA</span>
          <span>KATKI DETAYI</span>
          <span style="text-align:right;">SKOR</span>
        </div>
        ${rows.map((r, i) => `
          <div class="contrib-row" style="display:grid;grid-template-columns:50px 1.5fr 2fr 1fr;padding:18px 24px;border-bottom:1px solid var(--line);align-items:center;font-size:14px;">
            <b style="color:var(--cyan);font-family:var(--mono);">0${i + 1}</b>
            <strong style="color:var(--fg);">${esc(r.name)}</strong>
            <span style="color:var(--muted);">${esc(r.contribution)}</span>
            <strong style="color:var(--lime);text-align:right;font-family:var(--mono);">${esc(r.points)} pts</strong>
          </div>
        `).join("")}
      </div>
    `;
    attachSpotlights();
  }

  /* ---------- GÖRÜNÜM: BAŞVURU FORMU ---------- */
  function renderApplication(defaultType = "board") {
    const A = DATA.announce[lang];
    const apps = (() => { try { return JSON.parse(localStorage.getItem('yzk-applications') || '[]'); } catch { return []; } })();
    const total = apps.length;
    const boardCount = apps.filter(a => a.t === 'b').length;
    const auditCount = apps.filter(a => a.t === 'a').length;
    const deadline = new Date(A.deadline);
    const closed = Date.now() > deadline.getTime();
    const left = Math.max(0, deadline.getTime() - Date.now());
    const days = Math.floor(left / 86400000);
    const hours = Math.floor((left % 86400000) / 3600000);

    view().innerHTML = `
      <section class="hero">
        <span class="lab" style="color:var(--cyan);">${esc(fmt("KURULUŞ SÜRECİ · BAŞVURU AÇIK", "FORMATION · APPLICATIONS OPEN"))}</span>
        <h1>${esc(fmt("Yönetim ve Denetim Kurulu Başvurusu", "Board & Audit Committee Application"))}</h1>
        <p class="lede">${esc(fmt("Kulübümüz onay sürecinde. Bu dönem yönetim ve denetim kurulunu birlikte kuruyoruz. Hesap açmana gerek yok — bilgilerini doldurman yeterli.", "Our club is in its official approval stage. This term we are forming the board and audit committee together. No account needed — just fill in your details."))}</p>
        <div class="cta-row" style="margin-top:22px;">
          <span class="pill" style="color:var(--red);border-color:var(--red);font-weight:700;">${esc(fmt("SON BAŞVURU: 23 EKİM 2026 · 23:00", "DEADLINE: OCT 23, 2026 · 23:00"))}</span>
          ${countdownHtml(DATA.announce[lang].deadline, "block")}
        </div>
      </section>

      <div class="app-stats">
        <div class="app-stat">
          <b>${total}</b>
          <span>${esc(fmt("TOPLAM BAŞVURU", "TOTAL APPLICATIONS"))}</span>
        </div>
        <div class="app-stat">
          <b>${boardCount}</b>
          <span>${esc(fmt("YÖNETİM KURULU", "BOARD"))}</span>
        </div>
        <div class="app-stat">
          <b>${auditCount}</b>
          <span>${esc(fmt("DENETİM KURULU", "AUDIT"))}</span>
        </div>
        <div class="app-stat">
          <b>18</b>
          <span>${esc(fmt("TOPLAM KADRO", "TOTAL SEATS"))}</span>
        </div>
      </div>

      <div class="application-layout">
        <aside class="application-intro spotlight-card">
          <h2 style="font:700 1.5rem var(--display);margin-bottom:12px;color:var(--fg);">${esc(fmt("Süreç Nasıl İlerliyor?", "How the Process Works"))}</h2>
          <p style="color:var(--muted);font-size:13.5px;line-height:1.6;margin-bottom:16px;">${esc(fmt("Kulüp şu an resmî onay aşamasında. Onayın ardından yönetim ve denetim kurulu, bu başvurular arasından oluşturulacak.", "The club is currently in its official approval stage. Once approved, the board and audit committee will be formed from these applications."))}</p>
          <ul class="application-steps">
            <li>
              <span>01</span>
              <div>
                <strong>${esc(fmt("Pozisyonunu Seç", "Pick Your Seat"))}</strong>
                <p>${esc(fmt("Yönetim kurulu (12) veya denetim kurulu (6).", "Board (12) or audit committee (6)."))}</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>${esc(fmt("Kendini Anlat", "Introduce Yourself"))}</strong>
                <p>${esc(fmt("Bölümün, ilgi alanın ve bu göreve neden talip olduğun.", "Your major, interests, and why you want this role."))}</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>${esc(fmt("Onay ve Kuruluş", "Approval & Formation"))}</strong>
                <p>${esc(fmt("23 Ekim sonrası değerlendirme, e-posta ile dönüş.", "Review after Oct 23, response by email."))}</p>
              </div>
            </li>
          </ul>
          <div style="margin-top:18px;padding-top:16px;border-top:1px solid var(--line);">
            <p style="font:600 10px var(--mono);letter-spacing:.1em;color:var(--dim);text-transform:uppercase;margin-bottom:8px;">${esc(fmt("KADRO DAĞILIMI", "SEAT ALLOCATION"))}</p>
            <div style="display:grid;gap:6px;font-size:12.5px;color:var(--muted);">
              <div style="display:flex;justify-content:space-between;"><span>${esc(fmt("Yönetim Kurulu", "Board"))}</span><b style="color:var(--cyan);">12</b></div>
              <div style="display:flex;justify-content:space-between;"><span>${esc(fmt("Denetim Kurulu", "Audit Committee"))}</span><b style="color:var(--cyan);">6</b></div>
            </div>
          </div>
        </aside>

        <form class="fm" id="applicationForm">
          <fieldset>
            <legend>01 / ${esc(fmt("BAŞVURU TÜRÜ", "APPLICATION TYPE"))}</legend>
            <div class="choice-list">
              <label class="choice">
                <input type="radio" name="application_type" value="board" ${defaultType !== "audit" ? "checked" : ""}>
                <span>
                  <strong style="display:block;font:700 15px var(--display);">${esc(fmt("Yönetim Kurulu", "Executive Board"))}</strong>
                  <small style="color:var(--muted);font-size:11px;">${esc(fmt("12 kişi · yönlendirme, bütçe, organizasyon", "12 seats · direction, budget, organization"))}</small>
                </span>
              </label>
              <label class="choice">
                <input type="radio" name="application_type" value="audit" ${defaultType === "audit" ? "checked" : ""}>
                <span>
                  <strong style="display:block;font:700 15px var(--display);">${esc(fmt("Denetim Kurulu", "Audit Committee"))}</strong>
                  <small style="color:var(--muted);font-size:11px;">${esc(fmt("6 kişi · mali ve süreç denetimi", "6 seats · financial and process audit"))}</small>
                </span>
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>02 / ${esc(fmt("KİŞİSEL BİLGİLER", "PERSONAL DETAILS"))}</legend>
            <div class="field-grid">
              <div class="field">
                <label for="appName">${esc(fmt("Ad Soyad", "Full Name"))}</label>
                <input id="appName" name="name" required placeholder="${esc(fmt("Örn. Deniz Yılmaz", "e.g. Alex Morgan"))}">
              </div>
              <div class="field">
                <label for="appEmail">${esc(fmt("E-posta Adresi", "Email Address"))}</label>
                <input id="appEmail" type="email" name="email" required placeholder="ornek@universite.edu.tr">
              </div>
              <div class="field">
                <label for="appPhone">${esc(fmt("Telefon (opsiyonel)", "Phone (optional)"))}</label>
                <input id="appPhone" type="tel" name="phone" placeholder="+90 5xx xxx xx xx">
              </div>
              <div class="field">
                <label for="appTc">${esc(fmt("T.C. Kimlik No", "National ID (TCKN)"))} *</label>
                <input id="appTc" name="tc" required inputmode="numeric" maxlength="11" pattern="[1-9][0-9]{10}"
                       placeholder="11 haneli" autocomplete="off">
                <small class="field-hint" id="tcHint"></small>
              </div>
              <div class="field">
                <label for="appBirth">${esc(fmt("Doğum Tarihi", "Date of Birth"))} *</label>
                <input id="appBirth" type="date" name="birthdate" required min="1950-01-01" max="2012-12-31">
              </div>
              <div class="field">
                <label for="appStudentNo">${esc(fmt("Öğrenci Numarası", "Student Number"))} *</label>
                <input id="appStudentNo" name="student_no" required placeholder="${esc(fmt("Örn. 2026123456", "e.g. 2026123456"))}" autocomplete="off">
              </div>
              <div class="field">
                <label for="appDepartment">${esc(fmt("Bölüm & Sınıf", "Major & Year"))} *</label>
                <input id="appDepartment" name="department" required placeholder="${esc(fmt("Örn. TBMYO · Bilgisayar Programcılığı · 2. Sınıf", "e.g. Computer Programming · Year 2"))}">
              </div>
              <div class="field full">
                <label for="appUniversity">${esc(fmt("Üniversite / Fakülte / Yüksekokul", "University / Faculty / School"))} *</label>
                <input id="appUniversity" name="university" required placeholder="${esc(fmt("Örn. Marmara Üniversitesi · Teknik Bilimler MYO", "e.g. Marmara University · Vocational School"))}">
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend>03 / ${esc(fmt("MOTİVASYON", "MOTIVATION"))}</legend>
            <div class="field-grid">
              <div class="field full">
                <label for="appMotivation">${esc(fmt("Bu göreve neden talipsin? (kısa)", "Why do you want this role? (short)"))}</label>
                <textarea id="appMotivation" name="motivation" rows="4" required placeholder="${esc(fmt("Kulübe ne katmak istiyorsun, hangi deneyimin var?", "What will you bring, what experience do you have?"))}"></textarea>
              </div>
              <div class="field full">
                <label for="appNote">${esc(fmt("Eklemek istediğin bir şey var mı? (opsiyonel)", "Anything else you'd like to add? (optional)"))}</label>
                <textarea id="appNote" name="note" rows="4" placeholder="${esc(fmt("Bu pozisyon veya başvurun hakkında yazmak istediklerin — boş bırakabilirsin.", "Anything you want to say about this position or your application — you can leave it blank."))}"></textarea>
                <small style="color:var(--dim);font-size:11px;margin-top:6px;display:block;">${esc(fmt("Bu alan tamamen opsiyoneldir.", "This field is entirely optional."))}</small>
              </div>
            </div>
          </fieldset>

          <div style="background:var(--surf);border:1px solid var(--line);border-radius:12px;padding:16px;">
            <p style="font-size:12px;color:var(--muted);margin-bottom:12px;">${esc(DATA.formspree.privacyNotice)}</p>
            <label style="display:flex;align-items:center;gap:10px;font-size:12px;cursor:pointer;">
              <input type="checkbox" id="privacyAck" required style="accent-color:var(--cyan);">
              <span>${esc(fmt("Gizlilik bildirimini okudum ve kabul ediyorum.", "I acknowledge and agree to the privacy statement."))}</span>
            </label>
          </div>

          <button class="btn solid" type="submit" style="width:fit-content;" ${closed ? "disabled" : ""}>
            ${closed ? esc(fmt("Başvuru Kapandı", "Applications Closed")) : esc(fmt("Başvuruyu Gönder", "Submit Application"))} ↗
          </button>
          <p id="appStatus" role="status" aria-live="polite" style="font:600 13px var(--mono);min-height:24px;"></p>
        </form>
      </div>
    `;

    // ── TCKN checksum (11 hane, resmî algoritma) ──
    const tcEl = document.getElementById("appTc");
    const tcHint = document.getElementById("tcHint");
    function tcknValid(v) {
      if (!/^[1-9][0-9]{10}$/.test(v)) return false;
      const d = v.split("").map(Number);
      const odd = d[0] + d[2] + d[4] + d[6] + d[8];
      const even = d[1] + d[3] + d[5] + d[7];
      if ((odd * 7 - even) % 10 !== d[9]) return false;
      const sum10 = d.slice(0, 10).reduce((a, b) => a + b, 0);
      return sum10 % 10 === d[10];
    }
    function renderTcHint() {
      const v = tcEl.value.replace(/\D/g, "");
      if (!v) { tcHint.textContent = ""; tcHint.className = "field-hint"; return; }
      const ok = tcknValid(v);
      tcHint.textContent = ok
        ? fmt("✓ Geçerli", "✓ Valid")
        : fmt("11 hane olmalı ve doğrulama tutmalı", "Must be 11 digits and pass the checksum");
      tcHint.className = "field-hint " + (ok ? "ok" : "bad");
    }
    if (tcEl) {
      tcEl.addEventListener("input", () => {
        tcEl.value = tcEl.value.replace(/\D/g, "").slice(0, 11);
        renderTcHint();
      });
      tcEl.addEventListener("blur", renderTcHint);
    }

    const form = document.getElementById("applicationForm");
    const status = document.getElementById("appStatus");

    form.addEventListener("submit", async e => {
      e.preventDefault();
      if (closed) return;
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      status.style.color = "var(--cyan)";
      status.textContent = fmt("Gönderiliyor…", "Transmitting…");

      const fd = new FormData(form);
      if (!tcknValid(String(fd.get("tc") || ""))) {
        status.style.color = "var(--red)";
        status.textContent = fmt("T.C. kimlik numarası geçersiz. Lütfen kontrol edin.", "National ID is invalid. Please check it.");
        if (tcEl) { tcEl.focus(); renderTcHint(); }
        btn.disabled = false;
        return;
      }
      if (!fd.get("birthdate") || !fd.get("student_no")) {
        status.style.color = "var(--red)";
        status.textContent = fmt("Doğum tarihi ve öğrenci numarası zorunlu.", "Date of birth and student number are required.");
        btn.disabled = false;
        return;
      }
      // ── Girdi temizliği: kontrol karakterleri + uzunluk tavanı ──
      const C = YZKSecure.clean, M = YZKSecure.cleanMultiline;
      const type = C(fd.get("application_type"), 12) === 'audit' ? 'audit' : 'board';
      const appData = {
        application_type: type,
        name:          C(fd.get("name"), 80),
        email:         C(fd.get("email"), 120).toLowerCase(),
        phone:         C(fd.get("phone"), 24),
        tc:            C(fd.get("tc"), 11),
        birthdate:     C(fd.get("birthdate"), 10),
        student_no:    C(fd.get("student_no"), 24),
        department:    C(fd.get("department"), 100),
        university:    C(fd.get("university"), 120),
        motivation:    M(fd.get("motivation"), 1200),
        note:          M(fd.get("note"), 1200),
        submittedAt:   new Date().toISOString(),
        status:        'pending',
        id:            'app-' + Date.now().toString(36) + '-' + crypto.getRandomValues(new Uint32Array(1))[0].toString(36)
      };

      // ── Şifreleme: site kaynağında yalnızca AÇIK anahtar var ──
      // Özel anahtar sitede yok → depoyu ele geçiren veriyi okuyamaz.
      let sealed;
      try {
        sealed = await YZKSecure.sealTo(await YZKSecure.activePub(), appData, type);
      } catch (err) {
        status.style.color = "var(--red)";
        status.textContent = fmt("Şifreleme başarısız. Tarayıcın WebCrypto desteklemiyor olabilir.", "Encryption failed. Your browser may not support WebCrypto.");
        btn.disabled = false;
        return;
      }

      try {
        const existing = JSON.parse(localStorage.getItem('yzk-applications') || '[]');
        existing.push(sealed);              // düz metin YOK
        localStorage.setItem('yzk-applications', JSON.stringify(existing));
      } catch {}

      try {
        const ch = new BroadcastChannel('yzk-apps');
        ch.postMessage({ type: 'new-application' });
        ch.close();
      } catch {}

      // Ortak uç nokta varsa: zarfı oraya bırak (açık metin gitmez)
      let sent = false;
      if (window.YZKSync && YZKSync.enabled()) {
        status.textContent = fmt("Gönderiliyor…", "Sending…");
        const r = await YZKSync.push(sealed);
        sent = r.ok;
      }

      // ponytail: sunucusuz site — kayıt bu cihazda şifreli durur. Çok cihazlı
      // toplama için sunucu/Formspree gerekir; anahtar dosyası olmadan okunamaz.

      form.reset();
      status.style.color = "var(--lime)";
      status.textContent = sent
        ? fmt("Başvurun kulübe iletildi ve şifrelendi. Değerlendirme sonrası e-posta ile dönüş yapılacak.", "Your application reached the club, encrypted. We'll reply by email after review.")
        : fmt("Başvurun şifrelendi ancak kulübe iletilemedi (bağlantı). Lütfen tekrar dene.", "Your application was encrypted but could not be delivered. Please try again.");
      btn.disabled = false;

      // refresh the live counters in place (keeps the success message visible)
      try {
        const all = JSON.parse(localStorage.getItem('yzk-applications') || '[]');
        const nums = document.querySelectorAll('.app-stat b');
        if (nums.length === 4) {
          nums[0].textContent = all.length;
          nums[1].textContent = all.filter(a => a.t === 'b').length;
          nums[2].textContent = all.filter(a => a.t === 'a').length;
        }
      } catch {}
    });

    attachSpotlights();
    startCountdowns();
  }

  /* ---------- GÖRÜNÜM: YEREL TASLAK ÜRETİCİLERİ ---------- */
  function renderDraftBuilder(type) {
    const isProj = type === "project";
    view().innerHTML = `
      <section class="hero">
        <span class="lab" style="color:var(--cyan);">${isProj ? "PROJE ATÖLYESİ" : "EKİP ATÖLYESİ"}</span>
        <h1>${isProj ? esc(fmt("Yeni Proje Taslağı Oluştur", "Create Project Brief")) : esc(fmt("Ekip Çağrısı Taslağı Oluştur", "Create Team Call"))}</h1>
        <p class="lede">${esc(fmt("Bu araç tamamen cihazında çalışır ve hiçbir veriyi internete yüklemez. Üretilen Markdown (.md) dosyasını anında indirebilirsin.", "Runs strictly client-side; downloads a formatted Markdown (.md) brief immediately."))}</p>
      </section>

      <form class="fm spotlight-card" id="draftForm" style="max-width:760px;margin-top:30px;">
        <div class="field">
          <label>${isProj ? "PROJE BAŞLIĞI" : "ARANAN ROL VE PROJE"}</label>
          <input id="draftTitle" required placeholder="${isProj ? 'Örn. Türkçe Tıbbi RAG Sistemi' : 'Örn. NLP Mühendisi — Hukuk Botu'}">
        </div>
        <div class="field">
          <label>${isProj ? "ÇÖZÜLMEK İSTENEN PROBLEM" : "EKİP ARKADAŞINDAN BEKLENEN KATKI"}</label>
          <textarea id="draftNeed" rows="4" required placeholder="Problemi ve hedefleri detaylandır…"></textarea>
        </div>
        <div class="field">
          <label>${isProj ? "İLK DENEY / PROTOTİP ADIMI" : "GEREKLİ TEMEL YETKİNLİKLER"}</label>
          <textarea id="draftStep" rows="3" required placeholder="Hangi model, kütüphane veya veriler kullanılacak…"></textarea>
        </div>
        <div class="cta-row">
          <button class="btn solid" type="submit">${esc(fmt("Markdown Dosyasını İndir (.md)", "Download Markdown (.md)"))} ↓</button>
        </div>
        <p id="draftStatus" style="font:600 13px var(--mono);color:var(--lime);margin-top:12px;"></p>
      </form>
    `;

    document.getElementById("draftForm").addEventListener("submit", e => {
      e.preventDefault();
      const title = document.getElementById("draftTitle").value;
      const need = document.getElementById("draftNeed").value;
      const step = document.getElementById("draftStep").value;

      const md = `# ${title}\n\n## ${isProj ? "Problem" : "Aranan Rol"}\n${need}\n\n## ${isProj ? "İlk Prototip Adımı" : "Gereksinimler"}\n${step}\n\n---\n*Yapay Zekâ Kulübü (YZK) Yerel Taslak Motoru ile üretildi.*`;
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${isProj ? "proje" : "ekip"}-${Date.now()}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      document.getElementById("draftStatus").textContent = fmt("Dosya başarıyla indirildi!", "File downloaded successfully!");
    });

    attachSpotlights();
  }

  /* ---------- DİĞER STATİK SAYFALAR ---------- */
  function renderHakkimizda() {
    view().innerHTML = `
      <section class="hero">
        <span class="lab" style="color:var(--cyan);">BİZ KİMİZ?</span>
        <h1>${esc(fmt("Yapay Zekâyı Birlikte Anlamak, Sorgulamak ve Üretmek İçin.", "Understanding, Questioning and Building AI Together."))}</h1>
        <p class="lede">${esc(T[lang].heroLede)}</p>
      </section>
      <div class="spotlight-card reveal" style="margin-top:30px;line-height:1.8;color:var(--muted);font-size:16px;">
        <h2 style="font:700 1.8rem var(--display);color:var(--fg);margin-bottom:16px;">${esc(fmt("Manifestomuz", "Our Manifesto"))}</h2>
        <p style="margin-bottom:16px;">${esc(fmt("Yapay zekâ sadece algoritmik bir çıktı değil; toplumu, adaleti, sanatı ve insan zihnini dönüştüren çok katmanlı bir güçtür. Bizler, teknolojiyi yalnızca tüketen değil, onun sınırlarını bilimsel titizlikle sınayan bir öğrenci topluluğuyuz.", "Artificial intelligence is not just algorithmic output; it's a transformative force reshaping society, justice, art, and the human mind. We are a community rigorously examining its limits."))}</p>
        <p>${esc(fmt("Herkesin bir soruyla masaya oturabileceği, şeffaf, kâr amacı gütmeyen ve açık kaynağı savunan bağımsız bir laboratuvar kültürü inşa ediyoruz.", "We cultivate an independent, open-source laboratory culture where everyone brings their unique question to the table."))}</p>
      </div>
    `;
    attachSpotlights();
  }

  function renderIletisim() {
    view().innerHTML = `
      <section class="hero">
        <span class="lab" style="color:var(--cyan);">İLETİŞİM KANALLARI</span>
        <h1>${esc(fmt("Bize Ulaşın", "Get in Touch"))}</h1>
        <p class="lede">${esc(fmt("Etkinlik iş birlikleri, proje ortaklıkları ve sorularınız için bize yazabilirsiniz.", "Reach out for event collaborations, research partnerships and general inquiries."))}</p>
      </section>
      <div class="grid g2" style="margin-top:30px;">
        <div class="spotlight-card reveal">
          <span class="lab" style="color:var(--cyan);">E-POSTA</span>
          <h3 style="margin:12px 0 6px;">iletisim@yzk.community</h3>
          <p style="color:var(--muted);font-size:14px;">Genel sorular, etkinlik davetleri ve sponsorluklar.</p>
        </div>
        <div class="spotlight-card reveal">
          <span class="lab" style="color:var(--lime);">AÇIK BAŞVURU</span>
          <h3 style="margin:12px 0 6px;">Doğrudan Katıl</h3>
          <p style="color:var(--muted);font-size:14px;">Kulüp ve yönetim başvuruları için başvuru formunu kullanın.</p>
          <a class="btn solid" style="margin-top:16px;" href="#/basvuru">Formu Aç ↗</a>
        </div>
      </div>
    `;
    attachSpotlights();
  }

  function renderKVKK() {
    view().innerHTML = `
      <section class="hero">
        <span class="lab" style="color:var(--cyan);">YASAL BİLGİLENDİRME</span>
        <h1>${esc(fmt("Gizlilik & KVKK Bildirimi", "Privacy & Data Protection Notice"))}</h1>
      </section>
      <div class="spotlight-card reveal" style="margin-top:30px;line-height:1.8;color:var(--muted);">
        <p>${esc(DATA.formspree.privacyNotice)}</p>
        <p style="margin-top:16px;">${esc(fmt("Sitemiz üçüncü taraf çerezleri veya izleme pikselleri kullanmaz. Ziyaretçi verisi tarayıcıda kalır.", "Our website does not use third-party tracking pixels or telemetry. Data stays in your browser."))}</p>
      </div>
    `;
    attachSpotlights();
  }

  function renderLogin() {
    const currentUser = getCurrentUser();
    if (currentUser) {
      // Already logged in — show profile
      view().innerHTML = `
        <section class="hero">
          <span class="lab" style="color:var(--cyan);">HESABIM</span>
          <h1>${esc(fmt("Hoş Geldin, " + currentUser.name + "!", "Welcome back, " + currentUser.name + "!"))}</h1>
          <p class="lede">${esc(currentUser.dept || fmt("YZK Topluluğu Üyesi", "YZK Community Member"))}</p>
        </section>
        <div class="grid g3" style="margin-top:32px;">
          <div class="spotlight-card reveal">
            <span class="lab" style="color:var(--cyan);">HESAP BİLGİLERİ</span>
            <h3 style="font:700 1.1rem var(--display);margin:10px 0 6px;">${esc(currentUser.name)}</h3>
            <p style="color:var(--muted);font-size:13px;">${esc(currentUser.email)}</p>
            <p style="color:var(--muted);font-size:13px;">${esc(currentUser.dept || "—")}</p>
          </div>
          <div class="spotlight-card reveal">
            <span class="lab" style="color:var(--lime);">HIZLI ERİŞİM</span>
            <div style="display:flex;flex-direction:column;gap:10px;margin-top:12px;">
              <a class="btn" href="#/projeler">Projeleri Gör →</a>
              <a class="btn" href="#/basvuru">Başvuru Formu →</a>
              <a class="btn" href="#/etkinlikler">Etkinlikler →</a>
            </div>
          </div>
          <div class="spotlight-card reveal">
            <span class="lab" style="color:var(--amber);">HESAP</span>
            <div style="margin-top:12px;">
              <button class="btn danger" id="logoutUserBtn" style="width:100%;">Çıkış Yap</button>
            </div>
          </div>
        </div>
      `;
      document.getElementById('logoutUserBtn')?.addEventListener('click', () => {
        logoutUser();
        router();
        updateNavForUser();
      });
      attachSpotlights();
      return;
    }

    // Not logged in — show login/register
    view().innerHTML = `
      <div class="login-page">
        <div class="login-info">
          <h1>
            <span>${esc(fmt("Topluluğa", "Join the"))}</span>
            <em>${esc(fmt("Katıl.", "Community."))}</em>
          </h1>
          <p>${esc(fmt("Yapay zekâ araştırması, açık kaynak projeler ve disiplinler arası atölyelere erişmek için kayıt ol veya giriş yap.", "Register or sign in to access AI research, open-source projects and interdisciplinary workshops."))}</p>
          <ul class="login-benefits">
            <li>${esc(fmt("Projelere katkı sağla ve ekip bul", "Contribute to projects and find collaborators"))}</li>
            <li>${esc(fmt("Etkinlik kayıtlarına öncelikli erişim", "Priority event registration access"))}</li>
            <li>${esc(fmt("Üye direktörüne ve kaynaklara erişim", "Access member directory and resources"))}</li>
            <li>${esc(fmt("Yönetim kadrosu başvurusu hakkı", "Eligibility for executive board application"))}</li>
          </ul>
        </div>

        <div class="login-card spotlight-card">
          <div class="auth-tabs" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px;" id="authTabs">
            <button class="auth-tab active" id="tabLogin" type="button">${esc(fmt("Giriş Yap", "Sign In"))}</button>
            <button class="auth-tab" id="tabRegister" type="button">${esc(fmt("Kayıt Ol", "Register"))}</button>
          </div>

          <!-- Login Form -->
          <div id="loginFormWrap">
            <form class="auth-form" id="loginFormEl">
              <div class="field">
                <label>${esc(fmt("E-posta Adresi", "Email Address"))}</label>
                <input type="email" id="loginEmail" required placeholder="ornek@universite.edu.tr">
              </div>
              <div class="field">
                <label>${esc(fmt("Parola", "Password"))}</label>
                <input type="password" id="loginPassword" required placeholder="••••••••">
              </div>
              <div class="auth-error" id="loginErrMsg"></div>
              <button type="submit" class="btn solid" style="width:100%;justify-content:center;">${esc(fmt("Giriş Yap", "Sign In"))} →</button>
            </form>
            <p style="text-align:center;margin-top:14px;font:400 12px var(--body);color:var(--dim);">
              ${esc(fmt("Hesabın yok mu?", "No account?"))}
              <button type="button" id="switchToReg" style="background:none;border:none;color:var(--cyan);cursor:pointer;font:600 12px var(--mono);">${esc(fmt("Kayıt Ol", "Register"))}</button>
            </p>
          </div>

          <!-- Register Form -->
          <div id="registerFormWrap" hidden>
            <form class="auth-form" id="registerFormEl">
              <div class="field">
                <label>${esc(fmt("Ad Soyad", "Full Name"))}</label>
                <input type="text" id="regName" required placeholder="${esc(fmt("Örn. Deniz Yılmaz", "e.g. Alex Morgan"))}">
              </div>
              <div class="field">
                <label>${esc(fmt("E-posta Adresi", "Email Address"))}</label>
                <input type="email" id="regEmail" required placeholder="ornek@universite.edu.tr">
              </div>
              <div class="field">
                <label>${esc(fmt("Parola (en az 6 karakter)", "Password (min. 6 chars)"))}</label>
                <input type="password" id="regPassword" required minlength="6" placeholder="••••••••">
              </div>
              <div class="field">
                <label>${esc(fmt("Bölüm / Üniversite", "Department / University"))}</label>
                <input type="text" id="regDept" placeholder="${esc(fmt("Örn. Hukuk · 3. Sınıf", "e.g. Law · Junior"))}">
              </div>
              <div class="auth-error" id="registerErrMsg"></div>
              <button type="submit" class="btn solid" style="width:100%;justify-content:center;">${esc(fmt("Kayıt Ol", "Create Account"))} →</button>
            </form>
            <p style="text-align:center;margin-top:14px;font:400 12px var(--body);color:var(--dim);">
              ${esc(fmt("Zaten hesabın var mı?", "Already have an account?"))}
              <button type="button" id="switchToLogin" style="background:none;border:none;color:var(--cyan);cursor:pointer;font:600 12px var(--mono);">${esc(fmt("Giriş Yap", "Sign In"))}</button>
            </p>
          </div>
        </div>
      </div>
    `;

    // Tab switching
    const tabLogin    = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    const loginWrap   = document.getElementById('loginFormWrap');
    const regWrap     = document.getElementById('registerFormWrap');

    function showTab(which) {
      const isLogin = (which === 'login');
      tabLogin.classList.toggle('active', isLogin);
      tabRegister.classList.toggle('active', !isLogin);
      loginWrap.hidden = !isLogin;
      regWrap.hidden   =  isLogin;
    }

    tabLogin.addEventListener('click',    () => showTab('login'));
    tabRegister.addEventListener('click', () => showTab('register'));
    document.getElementById('switchToReg')?.addEventListener('click',   () => showTab('register'));
    document.getElementById('switchToLogin')?.addEventListener('click', () => showTab('login'));

    // Login submit
    document.getElementById('loginFormEl')?.addEventListener('submit', async e => {
      e.preventDefault();
      const email    = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;
      const errEl    = document.getElementById('loginErrMsg');

      const users = await getUsers();
      const user  = users.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (!user) {
        errEl.textContent = fmt("Bu e-posta adresiyle kayıtlı kullanıcı bulunamadı.", "No account found with this email address.");
        return;
      }
      // Yalnızca PBKDF2. Düz metin parola kabul edilmez (eski kayıtlar sıfırlanır).
      let ok = false;
      if (user.pwHash && user.pwSalt) {
        const { hash } = await hashPassword(password, user.pwSalt);
        ok = hash === user.pwHash;
      }
      if (user.password) { delete user.password; await saveUsers(users); }   // düz metin kalıntısını sil
      if (!ok) {
        errEl.textContent = fmt("Parola hatalı. Lütfen tekrar deneyin.", "Incorrect password. Please try again.");
        return;
      }
      setCurrentUser({ id: user.id, name: user.name, email: user.email, dept: user.dept });
      updateNavForUser();
      location.hash = '#/';
    });

    // Register submit
    document.getElementById('registerFormEl')?.addEventListener('submit', async e => {
      e.preventDefault();
      const name     = document.getElementById('regName').value.trim();
      const email    = document.getElementById('regEmail').value.trim();
      const password = document.getElementById('regPassword').value;
      const dept     = document.getElementById('regDept').value.trim();
      const errEl    = document.getElementById('registerErrMsg');

      const users = await getUsers();
      if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
        errEl.textContent = fmt("Bu e-posta zaten kayıtlı.", "This email is already registered.");
        return;
      }
      const { hash, salt } = await hashPassword(password);
      const newUser = { id: Date.now(), name, email, pwHash: hash, pwSalt: salt, dept, createdAt: new Date().toISOString() };
      users.push(newUser);
      await saveUsers(users);
      setCurrentUser({ id: newUser.id, name, email, dept });
      updateNavForUser();
      location.hash = '#/';
    });

    attachSpotlights();
  }


  // ── Password hashing (PBKDF2-SHA256, 120k iter) ─────────
  // ponytail: static site — hash only raises the cost of a stolen localStorage dump,
  // it cannot stop a determined client-side attacker. Real auth needs a server.
  const PBKDF2_ITER = 210000;
  async function hashPassword(password, saltB64) {
    const enc = new TextEncoder();
    const salt = saltB64
      ? Uint8Array.from(atob(saltB64), c => c.charCodeAt(0))
      : crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' }, key, 256);
    const hashB64 = btoa(String.fromCharCode(...new Uint8Array(bits)));
    const saltOut = saltB64 || btoa(String.fromCharCode(...salt));
    return { hash: hashB64, salt: saltOut };
  }

  // ── User auth helpers (cihaz-yerel AES-256-GCM zarfı) ──
  // Depoda düz metin isim/e-posta/parola yok; anahtar IndexedDB'de
  // non-extractable durur, dökümü alan biri okuyamaz.
  async function getUsers() {
    try {
      const box = JSON.parse(localStorage.getItem('yzk-users') || 'null');
      if (!box) return [];
      if (box && box.l === 1) return (await YZKSecure.openLocal(box)) || [];
      return Array.isArray(box) ? box : [];        // eski düz kayıt
    } catch { return []; }
  }
  async function saveUsers(users) {
    try {
      const box = await YZKSecure.sealLocal(users);
      localStorage.setItem('yzk-users', JSON.stringify(box));
    } catch {}
  }
  function getCurrentUser() {
    try { return JSON.parse(sessionStorage.getItem('yzk-current-user') || 'null'); } catch { return null; }
  }
  function setCurrentUser(user) {
    try { sessionStorage.setItem('yzk-current-user', JSON.stringify(user)); } catch {}
  }
  function logoutUser() {
    try { sessionStorage.removeItem('yzk-current-user'); } catch {}
  }

  function updateNavForUser() {
    const user = getCurrentUser();
    // Update the desktop login link
    const loginLinks = document.querySelectorAll('.login-link, .mobile-login');
    if (user) {
      loginLinks.forEach(el => {
        el.textContent = user.name.split(' ')[0];
      });
    } else {
      loginLinks.forEach(el => {
        el.textContent = T[lang].nav.login;
      });
    }
  }

  function render404() {
    view().innerHTML = `
      <div class="big404">404</div>
      <p style="text-align:center;font-size:18px;color:var(--muted);margin-top:10px;">${esc(fmt("Aradığınız sayfa bulunamadı.", "The requested page could not be found."))}</p>
      <div style="text-align:center;margin-top:30px;">
        <a class="btn solid" href="#/">${esc(fmt("Ana Sayfaya Dön", "Return Home"))} →</a>
      </div>
    `;
  }

  /* ---------- KOMUT PALETİ (⌘K) ---------- */
  function openPalette() {
    const pal = document.getElementById("palette");
    if (!pal) return;
    pal.hidden = false;
    const inp = document.getElementById("palInput");
    inp.value = "";
    inp.focus();
    paintPalette("");

    function paintPalette(q) {
      const ql = q.toLowerCase();
      const items = [
        { label: T[lang].nav.home, go: "#/" },
        { label: T[lang].nav.wall, go: "#/alanlar" },
        { label: T[lang].nav.news, go: "#/haberler" },
        { label: T[lang].nav.proj, go: "#/projeler" },
        { label: T[lang].nav.evt, go: "#/etkinlikler" },
        { label: T[lang].nav.team, go: "#/takim-bul" },
        { label: T[lang].nav.members, go: "#/uyeler" },
        { label: T[lang].nav.papers, go: "#/makaleler" },
        { label: T[lang].nav.dictionary, go: "#/sozluk" },
        { label: T[lang].nav.lab, go: "#/laboratuvar" },
        { label: T[lang].nav.leaders, go: "#/liderlik" },
        { label: T[lang].nav.board, go: "#/yonetim" },
        { label: T[lang].nav.apply, go: "#/basvuru" },
        { label: T[lang].nav.about, go: "#/hakkimizda" },
        { label: T[lang].nav.contact, go: "#/iletisim" }
      ].concat(DATA.disciplinesAll[lang].map(d => ({ label: `${d.label} (Odak)`, go: `#/disiplin/${d.slug}` })));

      const matches = items.filter(it => it.label.toLowerCase().includes(ql));
      const list = document.getElementById("palList");
      list.innerHTML = matches.length ? matches.map((m, i) => `
        <a class="pal-item" href="${esc(m.go)}" data-idx="${i}">
          <span>${esc(m.label)}</span>
          <small>${esc(m.go)}</small>
        </a>
      `).join("") : `<div style="padding:20px;text-align:center;color:var(--muted);">${esc(fmt("Eşleşen komut yok", "No matching command"))}</div>`;

      list.querySelectorAll(".pal-item").forEach(a => {
        a.addEventListener("click", closePalette);
      });
    }

    inp.oninput = e => paintPalette(e.target.value);
  }

  function closePalette() {
    const pal = document.getElementById("palette");
    if (pal) pal.hidden = true;
  }

  /* ---------- TAKVİM İNDİRME (.ICS) ---------- */
  function downloadICS() {
    const events = DATA.events[lang];
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//YZK//TR", "CALSCALE:GREGORIAN"];
    events.forEach((e, idx) => {
      const dt = new Date(e.start || Date.now()).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
      lines.push("BEGIN:VEVENT", `UID:yzk-ev-${idx}-${Date.now()}@local`, `DTSTAMP:${dt}`, `DTSTART:${dt}`, `SUMMARY:${e.t}`, `DESCRIPTION:${e.p}`, `LOCATION:${e.loc}`, "END:VEVENT");
    });
    lines.push("END:VCALENDAR");

    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "yzk-etkinlikler.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /* ---------- SPOTLIGHT VE SCROLL REVEAL BAĞLANTILARI ---------- */
  function attachSpotlights() {
    // Spotlight Card Fare Takibi
    const cards = document.querySelectorAll(".spotlight-card");
    cards.forEach(card => {
      card.addEventListener("mousemove", e => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        card.style.setProperty("--mouse-x", `${x}px`);
        card.style.setProperty("--mouse-y", `${y}px`);
      });
    });

    // Scroll-Triggered Reveal (IntersectionObserver)
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add("revealed");
            obs.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12 });

      document.querySelectorAll(".reveal").forEach(el => observer.observe(el));
    } else {
      document.querySelectorAll(".reveal").forEach(el => el.classList.add("revealed"));
    }
  }

  /* ---------- HASH ROUTER ---------- */
  const routes = {
    "/": renderHome,
    "/alanlar": renderWall,
    "/duvar": renderWall,
    "/etkinlikler": renderEtkinlikler,
    "/projeler": renderProjeler,
    "/proje-baslat": () => renderDraftBuilder("project"),
    "/haberler": renderGundem,
    "/gundem": renderGundem,
    "/makaleler": renderMakaleler,
    "/sozluk": renderSozluk,
    "/laboratuvar": renderLaboratuvar,
    "/takim": renderTakim,
    "/takim-bul": renderTakim,
    "/ilan-ver": () => renderDraftBuilder("team"),
    "/uyeler": renderUyeler,
    "/yonetim": renderYonetim,
    "/liderlik": renderLiderlik,
    "/basvuru": () => renderApplication("board"),
    "/kayit": () => renderApplication("board"),
    "/yk-basvuru": () => renderApplication("board"),
    "/denetim-basvuru": () => renderApplication("audit"),
    "/hakkimizda": renderHakkimizda,
    "/iletisim": renderIletisim,
    "/kvkk": renderKVKK,
    "/giris": renderLogin
  };

  function router(scrollToTop = false) {
    let path = location.hash.replace(/^#/, "") || "/";
    path = path.split("?")[0];

    const disc = path.match(/^\/disiplin\/(\w+)/);
    const v = view();
    v.classList.remove("viewin");
    void v.offsetWidth;
    v.classList.add("viewin");

    if (disc) renderDiscipline(disc[1]);
    else if (routes[path]) routes[path]();
    else render404();

    navActive();
    drawMarquee();
    startCountdowns();

    if (scrollToTop) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  /* ---------- GLOBAL BAŞLATMA ---------- */
  function init() {
    try {
      const savedLang = localStorage.getItem("yzk-lang");
      if (savedLang === "en" || savedLang === "tr") lang = savedLang;
    } catch {}

    const yearEl = document.getElementById("year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    // Tema Düğmesi
    const themeBtn = document.getElementById("themeBtn");
    if (themeBtn) {
      const syncLabel = () => {
        const t = document.documentElement.getAttribute("data-theme") || "dark";
        themeBtn.setAttribute("aria-label", t === "light" ? fmt("Karanlık temaya geç", "Switch to dark theme") : fmt("Aydınlık temaya geç", "Switch to light theme"));
        themeBtn.setAttribute("aria-pressed", t === "light" ? "true" : "false");
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute("content", t === "light" ? "#F7F4ED" : "#0E0D0B");
      };
      syncLabel();
      themeBtn.addEventListener("click", () => {
        const cur = document.documentElement.getAttribute("data-theme") || "dark";
        const next = cur === "light" ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", next);
        try { localStorage.setItem("yzk-theme", next); } catch {}
        syncLabel();
      });
    }

    // Dil Butonu
    const langBtn = document.getElementById("lang");
    if (langBtn) {
      langBtn.addEventListener("click", () => {
        lang = lang === "tr" ? "en" : "tr";
        try { localStorage.setItem("yzk-lang", lang); } catch {}
        applyLang();
        router();
      });
    }

    // Mobil Menü
    const menuBtn = document.getElementById("menuBtn");
    if (menuBtn) {
      menuBtn.addEventListener("click", () => {
        const nav = document.getElementById("nav");
        const open = !nav.classList.contains("open");
        nav.classList.toggle("open", open);
        menuBtn.setAttribute("aria-expanded", String(open));
        menuBtn.setAttribute("aria-label", open ? fmt("Menüyü kapat", "Close menu") : T[lang].ui.menu);
        const sp = menuBtn.querySelector("span");
        if (sp) sp.textContent = open ? fmt("KAPAT", "CLOSE") : T[lang].ui.menu;
      });
    }

    // Komut Paleti Dinleyicileri
    const cmdBtn = document.getElementById("cmdBtn");
    if (cmdBtn) cmdBtn.addEventListener("click", openPalette);
    const navCmdBtn = document.getElementById("navCmdBtn");
    if (navCmdBtn) navCmdBtn.addEventListener("click", openPalette);
    const palClose = document.getElementById("paletteClose");
    if (palClose) palClose.addEventListener("click", closePalette);

    document.addEventListener("keydown", e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPalette();
      }
      if (e.key === "Escape") {
        closePalette();
      }
    });

    // Ortam Işığı (Ambient Glow) Takibi
    const glow = document.getElementById("ambient-glow");
    window.addEventListener("pointermove", e => {
      document.body.style.setProperty("--cursor-x", `${e.clientX}px`);
      document.body.style.setProperty("--cursor-y", `${e.clientY}px`);
    });

    // Sayfa Kaydırma İlerleme Çubuğu ve Sticky Header Sınıfı
    const progress = document.getElementById("scroll-progress");
    const topBar = document.querySelector(".top");
    window.addEventListener("scroll", () => {
      const scrolled = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const pct = max > 0 ? scrolled / max : 0;
      if (progress) progress.style.transform = `scaleX(${pct})`;
      if (topBar) topBar.classList.toggle("scrolled", scrolled > 20);
    }, { passive: true });

    window.addEventListener("hashchange", () => router(true));

    applyLang();
    drawMarquee();
    router();

    // Sistem teması değişimi (kullanıcı seçim yapmadıysa)
    try {
      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', e => {
        if (localStorage.getItem('yzk-theme')) return;
        document.documentElement.setAttribute('data-theme', e.matches ? 'light' : 'dark');
        const btn = document.getElementById('themeBtn');
        if (btn) btn.setAttribute('aria-pressed', e.matches ? 'true' : 'false');
      });
    } catch {}

    // Cookie notice bar
    if (!localStorage.getItem('yzk-notice-accepted')) {
      const bar = document.createElement('div');
      bar.className = 'cookie-bar';
      bar.id = 'cookieBar';
      bar.innerHTML = `
        <p>Bu site tarayıcı deposunu kullanır. Kişisel veri üçüncü taraflara iletilmez. <a href="#/kvkk">Gizlilik bildirimi</a></p>
        <button id="acceptCookieBtn">Anladım</button>
      `;
      document.body.appendChild(bar);
      document.getElementById('acceptCookieBtn').addEventListener('click', () => {
        localStorage.setItem('yzk-notice-accepted', '1');
        bar.remove();
      });
    }

    // Show user name in nav if logged in
    updateNavForUser();
  }

  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
