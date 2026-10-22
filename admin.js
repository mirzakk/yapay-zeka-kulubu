/* YZK Yönetim Paneli — istemci mantığı
 *
 * GÜVENLİK MODELİ (dürüst özet):
 *  - Bu kapı bir HIZ KESİCİDİR, gerçek kimlik doğrulama değildir: kaynak kodu
 *    okuyan biri paneli açabilir. Sunucusuz sitede bunun ötesi yok.
 *  - Gerçek sınır ŞİFRELEMEDİR: başvurular RSA-3072 + AES-256-GCM ile zarflı,
 *    özel anahtar sitede YOK. Panel sahibi dahil kimse anahtar dosyası +
 *    parolası olmadan kayıtları okuyamaz.
 *  - İçerik (proje/haber/üye) IndexedDB'de, başvurular localStorage'da zarflı.
 */

(function () {
  'use strict';

  const PASS_HASH_KEY = 'yzk-admin-hash';
  const DB_NAME       = 'yzk-admin-db';
  const DB_VERSION    = 1;
  const STORES        = ['projects', 'news', 'members'];

  // ── Utility ──────────────────────────────────────────────

  function $ (sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function showToast(msg, type = 'success') {
    const old = $('#adminToast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.id = 'adminToast';
    t.className = `admin-toast ${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  const MODALS = ['appDetailModal', 'projectModal', 'newsModal', 'memberModal'];
  function closeModal(id) {
    if (!MODALS.includes(id)) return;
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  }
  window.closeModal = closeModal; // expose for inline onclick

  // ── IndexedDB ────────────────────────────────────────────
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        STORES.forEach(name => {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
          }
        });
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
  }

  function dbGetAll(db, store) {
    return new Promise((res, rej) => {
      const tx  = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => res(req.result);
      req.onerror   = e => rej(e.target.error);
    });
  }

  function dbAdd(db, store, obj) {
    return new Promise((res, rej) => {
      const tx  = db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).add(obj);
      req.onsuccess = () => res(req.result);
      req.onerror   = e => rej(e.target.error);
    });
  }

  function dbPut(db, store, obj) {
    return new Promise((res, rej) => {
      const tx  = db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).put(obj);
      req.onsuccess = () => res(req.result);
      req.onerror   = e => rej(e.target.error);
    });
  }

  function dbDelete(db, store, id) {
    return new Promise((res, rej) => {
      const tx  = db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).delete(id);
      req.onsuccess = () => res();
      req.onerror   = e => rej(e.target.error);
    });
  }

  function dbCount(db, store) {
    return new Promise((res, rej) => {
      const tx  = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).count();
      req.onsuccess = () => res(req.result);
      req.onerror   = e => rej(e.target.error);
    });
  }

  // ── Seed Data (first run only) ───────────────────────────
  async function seedIfEmpty(db) {
    const projectCount = await dbCount(db, 'projects');
    if (projectCount === 0 && window.DATA?.projects?.tr) {
      for (const p of DATA.projects.tr) {
        await dbAdd(db, 'projects', {
          title:  p.t,
          desc:   p.p,
          cat:    p.k,
          team:   p.m,
          status: p.status || 'active',
          tags:   (p.tags || []).join(', ')
        });
      }
    }

    const newsCount = await dbCount(db, 'news');
    if (newsCount === 0 && window.DATA?.digest?.tr) {
      for (const n of DATA.digest.tr) {
        await dbAdd(db, 'news', {
          title:  n.t,
          why:    n.why,
          cat:    n.k,
          src:    n.src,
          url:    n.url || ''
        });
      }
    }

    const memberCount = await dbCount(db, 'members');
    if (memberCount === 0 && window.DATA?.members?.tr) {
      for (const m of DATA.members.tr) {
        await dbAdd(db, 'members', {
          name:   m[0],
          dept:   m[1],
          skills: (m[2] || []).join(', ')
        });
      }
    }
  }

  // ── Applications: zarf (şifreli) kayıtlar ────────────────
  // Depoda YALNIZCA {v,t,iv,ck,ct} zarfları durur. Açık hâli yalnızca
  // bellekte, anahtar dosyası + parola girildikten sonra oluşur.
  let plainApps = null;          // çözülmüş kayıtlar (bellek)
  let appKey = null;             // RSA özel anahtarı (bellek)

  function rawApps() {
    try {
      const arr = JSON.parse(localStorage.getItem('yzk-applications') || '[]');
      return Array.isArray(arr) ? arr.filter(YZKSecure.isBox) : [];
    } catch { return []; }
  }

  function getApplications() { return plainApps || []; }
  function isUnlocked() { return !!appKey; }

  function lockApplications() { appKey = null; plainApps = null; }

  /* Elde anahtar varken tüm zarfları yeniden çöz (yeni içe aktarma sonrası) */
  let failedCount = 0;

  async function decryptAll() {
    if (!appKey) return 0;
    const out = [];
    failedCount = 0;
    for (const b of rawApps()) {
      try {
        const a = await YZKSecure.open(appKey, b);
        a._key = b._key || '';
        if (b.status) { a.status = b.status; a.decidedAt = b.decidedAt || null; }
        out.push(a);
      } catch { failedCount++; }
    }
    plainApps = out;
    return out.length;
  }

  const typeLabel = a => a.application_type === 'audit' ? 'Denetim'
                     : a.application_type === 'board' ? 'Yönetim'
                     : a.application_type === 'member' ? 'Üyelik' : '—';

  /* Değişikliği yeniden şifrele (onay/red) */
  async function persistApplications(list) {
    if (!appKey) throw new Error('kilit kapalı');
    const boxes = [];
    for (const a of list) {
      const type = a.application_type === 'audit' ? 'audit' : a.application_type === 'board' ? 'board' : 'member';
      boxes.push(await YZKSecure.seal(a, type));
    }
    localStorage.setItem('yzk-applications', JSON.stringify(boxes));
    plainApps = list;
  }

  // ── Section Switching ─────────────────────────────────────
  let currentSection = 'dashboard';

  const SECTIONS = ['dashboard', 'projects', 'news', 'members', 'applications'];

  function switchSection(name) {
    // Beyaz liste: data-arg üzerinden gelen değer CSS seçicisine girmesin
    if (!SECTIONS.includes(name)) return;
    currentSection = name;
    $$('.admin-nav-item').forEach(btn => btn.classList.remove('active'));
    const btn = $(`.admin-nav-item[data-section="${name}"]`);
    if (btn) btn.classList.add('active');

    $$('.admin-section').forEach(s => s.classList.remove('active'));
    const sec = $(`#sec-${name}`);
    if (sec) sec.classList.add('active');

    const titles = {
      dashboard: 'Dashboard',
      projects:  'Projeler',
      news:      'Haberler',
      members:   'Üyeler',
      applications: 'Başvurular'
    };
    const titleEl = $('#topbarTitle');
    if (titleEl) titleEl.textContent = titles[name] || name;

    renderSection(name);
  }
  window.switchSection = switchSection;

  // ── Render Sections ──────────────────────────────────────
  let DB = null;

  async function renderSection(name) {
    if (!DB) return;
    switch (name) {
      case 'dashboard':    await renderDashboard(); break;
      case 'projects':     await renderProjects(); break;
      case 'news':         await renderNews(); break;
      case 'members':      await renderMembers(); break;
      case 'applications': renderApplications(); break;
    }
  }

  // Dashboard
  async function renderDashboard() {
    const [projects, news, members] = await Promise.all([
      dbGetAll(DB, 'projects'),
      dbGetAll(DB, 'news'),
      dbGetAll(DB, 'members')
    ]);
    const sealed = rawApps();
    const apps = getApplications();

    setText('statProjects', projects.length);
    setText('statNews', news.length);
    setText('statMembers', members.length);
    setText('statApps', sealed.length);
    updateBadges(projects.length, news.length, members.length, sealed.length);

    const tbody = $('#dashAppsTable');
    if (tbody) {
      if (sealed.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--dim);padding:28px;">Henüz başvuru yok.</td></tr>';
      } else if (!isUnlocked()) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--dim);padding:28px;">🔒 ${sealed.length} şifreli başvuru — Başvurular sekmesinden parolayla aç.</td></tr>`;
      } else if (apps.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--dim);padding:28px;">${sealed.length} kayıt bu anahtarla açılamıyor (eski anahtarla şifrelenmiş).</td></tr>`;
      } else {
        tbody.innerHTML = apps.slice(-5).reverse().map(a => `
          <tr>
            <td>${esc(a.name || '—')}</td>
            <td style="color:var(--muted);font-size:12px;">${esc(a.email || '—')}</td>
            <td style="color:var(--muted);font-size:12px;">${esc(a.department || '—')}</td>
            <td><span class="badge badge-active">${esc(typeLabel(a))}</span></td>
            <td><span class="badge ${statusBadgeClass(a.status || 'pending')}">${esc(appStatusLabel(a.status || 'pending'))}</span></td>
          </tr>
        `).join('');
      }
    }
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function updateBadges(p, n, m, a) {
    setText('badgeProjects', p);
    setText('badgeNews', n);
    setText('badgeMembers', m);
    setText('badgeApps', a);
  }

  // Projects
  let allProjects = [];
  async function renderProjects() {
    allProjects = await dbGetAll(DB, 'projects');
    renderProjectsTable(allProjects);
  }

  function renderProjectsTable(items) {
    const tbody = $('#projectsTable');
    if (!tbody) return;
    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="admin-empty"><div class="admin-empty-icon">🚀</div><p>Henüz proje yok. Yeni bir proje ekleyin.</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = items.map(p => `
      <tr>
        <td>${esc(p.title)}</td>
        <td style="color:var(--muted);font-size:12px;">${esc(p.cat || '—')}</td>
        <td><span class="badge ${statusBadgeClass(p.status)}">${esc(statusLabel(p.status))}</span></td>
        <td style="color:var(--muted);font-size:12px;">${esc(p.team || '—')}</td>
        <td style="font-size:11px;color:var(--dim);">${esc((p.tags || '').substring(0,40))}${p.tags && p.tags.length > 40 ? '…' : ''}</td>
        <td>
          <div class="table-actions">
            <button class="btn sm" data-act="editProject" data-arg="${p.id}">Düzenle</button>
            <button class="btn sm danger" data-act="deleteProject" data-arg="${p.id}">Sil</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function editProject(id) {
    const p = allProjects.find(x => x.id === id);
    if (!p) return;
    $('#projectModalTitle').textContent = 'Projeyi Düzenle';
    $('#pId').value    = p.id;
    $('#pTitle').value = p.title || '';
    $('#pDesc').value  = p.desc  || '';
    $('#pCat').value   = p.cat   || '';
    $('#pStatus').value = p.status || 'active';
    $('#pTeam').value  = p.team  || '';
    $('#pTags').value  = p.tags  || '';
    $('#projectModal').hidden = false;
  };

  window.deleteProject = async function(id) {
    if (!confirm('Bu projeyi silmek istediğinizden emin misiniz?')) return;
    await dbDelete(DB, 'projects', id);
    showToast('Proje silindi.');
    await renderProjects();
    updateDashboardStats();
  };

  // News
  let allNews = [];
  async function renderNews() {
    allNews = await dbGetAll(DB, 'news');
    renderNewsTable(allNews);
  }

  function renderNewsTable(items) {
    const tbody = $('#newsTable');
    if (!tbody) return;
    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="admin-empty"><div class="admin-empty-icon">📰</div><p>Henüz haber yok. Yeni bir haber ekleyin.</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = items.map(n => `
      <tr>
        <td>${esc(n.title)}</td>
        <td style="font-size:12px;"><span class="badge badge-active">${esc(n.cat || '—')}</span></td>
        <td style="color:var(--muted);font-size:12px;">${esc(n.src || '—')}</td>
        <td style="color:var(--muted);font-size:12px;">${esc((n.why || '').substring(0,60))}${(n.why||'').length > 60 ? '…' : ''}</td>
        <td>${n.url ? `<a href="${YZKSecure.safeHref(n.url)}" target="_blank" rel="noopener" style="font:600 11px var(--mono);">↗ Kaynak</a>` : '—'}</td>
        <td>
          <div class="table-actions">
            <button class="btn sm" data-act="editNews" data-arg="${n.id}">Düzenle</button>
            <button class="btn sm danger" data-act="deleteNews" data-arg="${n.id}">Sil</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function editNews(id) {
    const n = allNews.find(x => x.id === id);
    if (!n) return;
    $('#newsModalTitle').textContent = 'Haberi Düzenle';
    $('#nId').value    = n.id;
    $('#nTitle').value = n.title || '';
    $('#nWhy').value   = n.why   || '';
    $('#nCat').value   = n.cat   || '';
    $('#nSrc').value   = n.src   || '';
    $('#nUrl').value   = n.url   || '';
    $('#newsModal').hidden = false;
  };

  window.deleteNews = async function(id) {
    if (!confirm('Bu haberi silmek istediğinizden emin misiniz?')) return;
    await dbDelete(DB, 'news', id);
    showToast('Haber silindi.');
    await renderNews();
    updateDashboardStats();
  };

  // Members
  let allMembers = [];
  async function renderMembers() {
    allMembers = await dbGetAll(DB, 'members');
    renderMembersTable(allMembers);
  }

  function renderMembersTable(items) {
    const tbody = $('#membersTable');
    if (!tbody) return;
    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4"><div class="admin-empty"><div class="admin-empty-icon">👥</div><p>Henüz üye yok.</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = items.map(m => `
      <tr>
        <td>${esc(m.name)}</td>
        <td style="color:var(--muted);font-size:12px;">${esc(m.dept || '—')}</td>
        <td style="color:var(--muted);font-size:12px;">${esc((m.skills || '').substring(0,50))}</td>
        <td>
          <div class="table-actions">
            <button class="btn sm" data-act="editMember" data-arg="${m.id}">Düzenle</button>
            <button class="btn sm danger" data-act="deleteMember" data-arg="${m.id}">Sil</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function editMember(id) {
    const m = allMembers.find(x => x.id === id);
    if (!m) return;
    $('#memberModalTitle').textContent = 'Üyeyi Düzenle';
    $('#mId').value     = m.id;
    $('#mName').value   = m.name   || '';
    $('#mDept').value   = m.dept   || '';
    $('#mSkills').value = m.skills || '';
    $('#memberModal').hidden = false;
  };

  window.deleteMember = async function(id) {
    if (!confirm('Bu üyeyi silmek istediğinizden emin misiniz?')) return;
    await dbDelete(DB, 'members', id);
    showToast('Üye silindi.');
    await renderMembers();
    updateDashboardStats();
  };

  // Applications
  let appsFilter = 'all';
  let appsQuery = '';

  function renderApplications() {
    const tbody = $('#appsTable');
    if (!tbody) return;

    const sealedCount = rawApps().length;
    const all = getApplications();
    const unlocked = isUnlocked();

    // Sayaçlar: kilit kapalıyken yalnızca zarfın açık alanından (t) sayılır
    const setB = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const today = new Date().toDateString();
    const rawList = unlocked && all.length ? all : rawApps();
    const typeOf = x => unlocked ? x.application_type : (x.t === 'b' ? 'board' : x.t === 'a' ? 'audit' : 'member');

    setB('appStatTotal', sealedCount);
    setB('appStatBoard', rawList.filter(x => typeOf(x) === 'board').length);
    setB('appStatAudit', rawList.filter(x => typeOf(x) === 'audit').length);
    setB('appStatPending', unlocked ? all.filter(x => (x.status || 'pending') === 'pending').length : '—');
    setB('appStatToday', unlocked ? all.filter(x => x.submittedAt && new Date(x.submittedAt).toDateString() === today).length : '—');

    if (unlocked && failedCount > 0) {
      const bar = $('#unlockMsg');
      if (bar) { bar.style.color = 'var(--amber)'; bar.textContent = failedCount + ' kayıt bu anahtarla açılamıyor (farklı anahtarla şifrelenmiş).'; }
    }

    refreshLockUI();

    if (!unlocked) {
      const syncOn = !!(window.YZKSync && YZKSync.enabled());
      tbody.innerHTML = `<tr><td colspan="7"><div class="admin-empty">
        <div class="admin-empty-icon">🔒</div>
        <p><b>${sealedCount}</b> şifreli başvuru var.</p>
        <p style="font-size:12px;margin-top:6px;">Yukarıdan yönetici parolanı gir; kayıtlar bu cihazda çözülür, hiçbir yere gönderilmez.</p>
        <p style="font-size:12px;margin-top:8px;color:${syncOn ? 'var(--lime)' : 'var(--amber)'};">
          ${syncOn
            ? 'Ortak uç nokta açık: diğer cihazlardan gelen başvurular için “Sunucudan Çek”.'
            : 'UYARI: senkron kapalı. Başka telefonlardan yapılan başvurular bu cihaza kendiliğinden gelmez — “Zarf İçe Aktar” ile gelen dosyaları ekle ya da sync.js ayarını yap.'}
        </p>
      </div></td></tr>`;
      return;
    }

    let apps = all;

    // filter
    if (appsFilter === 'board')       apps = apps.filter(a => a.application_type === 'board');
    else if (appsFilter === 'audit')  apps = apps.filter(a => a.application_type === 'audit');
    else if (appsFilter !== 'all')    apps = apps.filter(a => (a.status || 'pending') === appsFilter);

    // search
    if (appsQuery) {
      const q = appsQuery.toLowerCase();
      apps = apps.filter(a => [a.name, a.email, a.tc, a.student_no, a.department, a.university, a.motivation, a.note]
        .some(v => String(v || '').toLowerCase().includes(q)));
    }

    if (apps.length === 0) {
      const emptyMsg = all.length === 0
        ? (sealedCount > 0
            ? `${sealedCount} kayıt bu anahtarla açılamıyor (eski anahtarla şifrelenmiş).`
            : 'Henüz başvuru alınmadı.')
        : 'Bu filtreyle eşleşen başvuru yok.';
      tbody.innerHTML = `<tr><td colspan="7"><div class="admin-empty"><div class="admin-empty-icon">📋</div><p>${esc(emptyMsg)}</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = apps.map(a => {
      const t   = typeLabel(a);
      const dt  = a.submittedAt ? new Date(a.submittedAt).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
      const id  = esc(a.id);
      return `
      <tr>
        <td><b style="color:var(--fg);">${esc(a.name || '—')}</b>${a.phone ? `<div style="color:var(--dim);font-size:11px;">${esc(a.phone)}</div>` : ''}</td>
        <td style="color:var(--muted);font-size:12px;">${esc(a.email || '—')}</td>
        <td><span class="badge ${a.application_type === 'audit' ? 'badge-open' : 'badge-active'}">${esc(t)}</span></td>
        <td style="color:var(--muted);font-size:12px;">${esc((a.department || '—').substring(0,32))}</td>
        <td style="color:var(--dim);font-size:11px;white-space:nowrap;">${esc(dt)}</td>
        <td><span class="badge ${statusBadgeClass(a.status || 'pending')}">${esc(appStatusLabel(a.status || 'pending'))}</span></td>
        <td>
          <div class="table-actions">
            <button class="btn sm" data-act="viewApp" data-arg="${id}">Detay</button>
            <button class="btn sm" style="color:var(--lime);border-color:rgba(201,224,92,0.3);" data-act="approveApp" data-arg="${id}">✓</button>
            <button class="btn sm danger" data-act="rejectApp" data-arg="${id}">✕</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  // ── Detail modal ─────────────────────────────────────────
  let currentAppId = null;
  function viewApp(id) {
    const apps = getApplications();
    const a = apps.find(x => x.id === id);
    if (!a) return;
    currentAppId = id;
    const pos = a.application_type === 'board' ? 'Yönetim Kurulu' : a.application_type === 'audit' ? 'Denetim Kurulu' : 'Üyelik';
    const row = (label, val, mono) => val
      ? `<div class="app-detail-row"><span>${esc(label)}</span><div${mono ? ' style="font-family:var(--mono);font-size:12px;"' : ''}>${esc(val)}</div></div>`
      : '';
    $('#appDetailTitle').textContent = 'Başvuru · ' + (a.name || '—');
    $('#appDetailBody').innerHTML = `
      ${row('POZİSYON', pos)}
      ${row('DURUM', appStatusLabel(a.status || 'pending'))}
      ${row('TARİH', a.submittedAt ? new Date(a.submittedAt).toLocaleString('tr-TR') : '—')}
      ${row('T.C. KİMLİK NO', a.tc, true)}
      ${row('DOĞUM TARİHİ', a.birthdate)}
      ${row('ÖĞRENCİ NO', a.student_no, true)}
      ${row('E-POSTA', a.email)}
      ${row('TELEFON', a.phone)}
      ${row('BÖLÜM / SINIF', a.department)}
      ${row('ÜNİVERSİTE', a.university)}
      <div class="app-detail-row"><span>MOTİVASYON</span><div style="white-space:pre-wrap;line-height:1.6;">${esc(a.motivation || '—')}</div></div>
      ${a.note ? `<div class="app-detail-row"><span>EK NOT</span><div style="white-space:pre-wrap;line-height:1.6;">${esc(a.note)}</div></div>` : ''}
      ${row('KAYIT NO', a.id, true)}
    `;
    $('#appDetailModal').hidden = false;
  };
  $('#appDetailApprove')?.addEventListener('click', () => { if (currentAppId) { approveApp(currentAppId); closeModal('appDetailModal'); } });
  $('#appDetailReject')?.addEventListener('click',  () => { if (currentAppId) { rejectApp(currentAppId);  closeModal('appDetailModal'); } });

  async function approveApp(id) { await setAppStatus(id, 'approved', 'Başvuru onaylandı.', 'success'); }
  async function rejectApp(id)  { await setAppStatus(id, 'rejected', 'Başvuru reddedildi.', 'error'); }

  async function setAppStatus(id, status, msg, kind) {
    if (!isUnlocked()) { showToast('Önce yönetici parolası ile kilidi aç.', 'error'); return; }
    const apps = getApplications();
    const a = apps.find(x => x.id === id || x._key === id);
    if (!a) return;

    // 1) Sunucuya karar olayı yaz (paylaşılan, kalıcı)
    let synced = false;
    if (a._key && window.YZKSync && YZKSync.setStatus) {
      const r = await YZKSync.setStatus(a._key, status);
      synced = r.ok;
      if (!r.ok) { showToast('Sunucuya yazılamadı (' + r.reason + '). Karar yalnızca bu cihazda.', 'error'); }
    }

    // 2) Yerel görünümü güncelle
    a.status = status;
    a.decidedAt = Date.now();
    const boxes = rawApps();
    const b = boxes.find(x => x.ct && a.ct === x.ct) || boxes.find(x => x._key && x._key === a._key);
    if (b) { b.status = status; b.decidedAt = a.decidedAt; localStorage.setItem('yzk-applications', JSON.stringify(boxes)); }

    renderApplications(); renderDashboard();
    if (synced) showToast(msg, kind);
  }

  // ── CSV export ───────────────────────────────────────────
  $('#exportCsvBtn')?.addEventListener('click', () => {
    if (!isUnlocked()) { showToast('Önce yönetici parolası ile kilidi aç.', 'error'); return; }
    const apps = getApplications();
    if (!apps.length) { showToast('Dışa aktarılacak başvuru yok.', 'error'); return; }
    const cols = ['id','submittedAt','application_type','status','name','tc','birthdate','student_no','email','phone','department','university','motivation','note'];
    const head = ['Kayıt No','Tarih','Tür','Durum','Ad Soyad','T.C. Kimlik','Doğum Tarihi','Öğrenci No','E-posta','Telefon','Bölüm/Sınıf','Üniversite','Motivasyon','Ek Not'];
    const esc_ = v => { const s = String(v == null ? '' : v); const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s; return `"${safe.replace(/"/g,'""')}"`; };
    const rows = [head.map(esc_).join(',')].concat(
      apps.map(a => cols.map(c => esc_(c === 'application_type'
        ? (a[c]==='board'?'Yönetim':a[c]==='audit'?'Denetim':'Üyelik')
        : c === 'status' ? appStatusLabel(a[c]||'pending')
        : a[c])).join(','))
    );
    const blob = new Blob(['\ufeff' + rows.join('\r\n')], { type:'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'yzk-basvurular-' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.appendChild(link); link.click(); link.remove();
    URL.revokeObjectURL(url);
    showToast(apps.length + ' başvuru CSV olarak indirildi.', 'success');
  });

  // ── Ortak uç nokta (varsa) ────────────────────────────────
  async function pullFromServer(silent) {
    if (!window.YZKSync || !YZKSync.enabled()) {
      if (!silent) showToast('Senkron kapalı.', 'error');
      return 0;
    }
    try { await YZKSync.flushQueue(); } catch {}
    const res = await YZKSync.merge();
    if (!res.ok) { if (!silent) showToast('Sunucuya ulaşılamadı: ' + res.reason, 'error'); return 0; }
    if (isUnlocked()) await decryptAll();
    renderApplications(); renderDashboard();
    if (!silent) {
      const bits = [];
      if (res.added) bits.push(res.added + ' yeni');
      if (res.pruned) bits.push(res.pruned + ' bayat kayıt temizlendi');
      showToast(bits.length ? bits.join(', ') + '.' : 'Güncel: ' + res.total + ' başvuru.', 'success');
    }
    return res.added;
  }
  $('#pullBtn')?.addEventListener('click', () => pullFromServer(false));

  // ── Ortak uç nokta (varsa) ────────────────────────────────
  async function pullFromServer(silent) {
    if (!window.YZKSync || !YZKSync.enabled()) {
      if (!silent) showToast('Senkron kapalı: sync.js içine url + key gir.', 'error');
      return 0;
    }
    const res = await YZKSync.merge();
    if (!res.ok) { if (!silent) showToast('Sunucuya ulaşılamadı: ' + res.reason, 'error'); return 0; }
    if (res.added) {
      if (isUnlocked()) await decryptAll();
      renderApplications(); renderDashboard();
      if (!silent) showToast(res.added + ' yeni başvuru alındı.', 'success');
    } else if (!silent) {
      showToast('Yeni başvuru yok (toplam ' + res.total + ').', 'success');
    }
    return res.added;
  }
  $('#pullBtn')?.addEventListener('click', () => pullFromServer(false));

  // ── Zarf içe aktarma (şifreli başvuru dosyaları) ─────────

  $('#importFiles')?.addEventListener('change', async e => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const boxes = rawApps();
    const seen = new Set(boxes.map(b => b.ct));
    let added = 0, skipped = 0;
    for (const f of files) {
      try {
        const obj = JSON.parse(await f.text());
        const one = Array.isArray(obj) ? obj : [obj];
        for (const b of one) {
          if (!YZKSecure.isBox(b)) { skipped++; continue; }
          if (seen.has(b.ct)) { skipped++; continue; }
          seen.add(b.ct); boxes.push(b); added++;
        }
      } catch { skipped++; }
    }
    localStorage.setItem('yzk-applications', JSON.stringify(boxes));
    e.target.value = '';
    showToast(added + ' zarf eklendi' + (skipped ? ', ' + skipped + ' atlandı' : '') + '.', added ? 'success' : 'error');
    if (isUnlocked()) { await decryptAll(); }
    renderApplications();
    renderDashboard();
  });

  // ── Şifreli yedek indir (zarflar; anahtarsız açılamaz) ────
  $('#backupBtn')?.addEventListener('click', async () => {
    const boxes = rawApps();
    if (!boxes.length) { showToast('Yedeklenecek kayıt yok.', 'error'); return; }
    const payload = { kind: 'yzk-applications-backup', v: 1, at: new Date().toISOString(), boxes: boxes };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'yzk-yedek-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    showToast(boxes.length + ' zarf yedeklendi (şifreli).', 'success');
  });

  // ── Filters & search wiring ──────────────────────────────
  $$('.apps-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.apps-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      appsFilter = btn.dataset.appfilter;
      renderApplications();
    });
  });
  $('#searchApps')?.addEventListener('input', e => {
    appsQuery = e.target.value;
    renderApplications();
  });

  // Live updates from the public site (BroadcastChannel)
  try {
    const ch = new BroadcastChannel('yzk-apps');
    ch.onmessage = ev => {
      if (ev.data && ev.data.type === 'new-application') {
        renderApplications();
        renderDashboard();
        showToast('Yeni başvuru geldi: ' + (ev.data.app.name || ''), 'success');
      }
    };
  } catch {}

  // Status helpers
  function statusLabel(s) {
    return { open: 'Ekip Arıyor', active: 'Aktif', completed: 'Tamamlandı' }[s] || s || '—';
  }
  function statusBadgeClass(s) {
    return { open: 'badge-open', active: 'badge-active', completed: 'badge-completed', approved: 'badge-approved', rejected: 'badge-rejected', pending: 'badge-pending' }[s] || 'badge-pending';
  }
  function appStatusLabel(s) {
    return { pending: 'Bekliyor', approved: 'Onaylandı', rejected: 'Reddedildi' }[s] || s;
  }

  async function updateDashboardStats() {
    const [projects, news, members] = await Promise.all([
      dbGetAll(DB, 'projects'), dbGetAll(DB, 'news'), dbGetAll(DB, 'members')
    ]);
    const apps = getApplications();
    setText('statProjects', projects.length);
    setText('statNews', news.length);
    setText('statMembers', members.length);
    setText('statApps', apps.length);
    updateBadges(projects.length, news.length, members.length, apps.length);
  }

  // ── Search Filters ───────────────────────────────────────
  function setupSearch(inputId, allGetter, renderer) {
    const el = document.getElementById(inputId);
    if (!el) return;
    el.addEventListener('input', () => {
      const q = el.value.toLowerCase();
      renderer(allGetter().filter(item =>
        Object.values(item).some(v => String(v).toLowerCase().includes(q))
      ));
    });
  }

  // ── Modal Form Handlers ──────────────────────────────────
  $('#projectForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const id = $('#pId').value;
    const obj = {
      title:  $('#pTitle').value.trim(),
      desc:   $('#pDesc').value.trim(),
      cat:    $('#pCat').value.trim(),
      status: $('#pStatus').value,
      team:   $('#pTeam').value.trim(),
      tags:   $('#pTags').value.trim()
    };
    if (id) {
      obj.id = Number(id);
      await dbPut(DB, 'projects', obj);
      showToast('Proje güncellendi.');
    } else {
      await dbAdd(DB, 'projects', obj);
      showToast('Yeni proje eklendi.');
    }
    closeModal('projectModal');
    $('#projectForm').reset();
    await renderProjects();
    await updateDashboardStats();
  });

  $('#newsForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const id = $('#nId').value;
    const obj = {
      title: $('#nTitle').value.trim(),
      why:   $('#nWhy').value.trim(),
      cat:   $('#nCat').value.trim(),
      src:   $('#nSrc').value.trim(),
      url:   $('#nUrl').value.trim()
    };
    if (id) {
      obj.id = Number(id);
      await dbPut(DB, 'news', obj);
      showToast('Haber güncellendi.');
    } else {
      await dbAdd(DB, 'news', obj);
      showToast('Yeni haber eklendi.');
    }
    closeModal('newsModal');
    $('#newsForm').reset();
    await renderNews();
    await updateDashboardStats();
  });

  $('#memberForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const id = $('#mId').value;
    const obj = {
      name:   $('#mName').value.trim(),
      dept:   $('#mDept').value.trim(),
      skills: $('#mSkills').value.trim()
    };
    if (id) {
      obj.id = Number(id);
      await dbPut(DB, 'members', obj);
      showToast('Üye güncellendi.');
    } else {
      await dbAdd(DB, 'members', obj);
      showToast('Yeni üye eklendi.');
    }
    closeModal('memberModal');
    $('#memberForm').reset();
    await renderMembers();
    await updateDashboardStats();
  });

  // Add buttons
  $('#addProjectBtn')?.addEventListener('click', () => {
    $('#projectModalTitle').textContent = 'Yeni Proje Ekle';
    $('#projectForm').reset();
    $('#pId').value = '';
    $('#projectModal').hidden = false;
  });

  $('#addNewsBtn')?.addEventListener('click', () => {
    $('#newsModalTitle').textContent = 'Yeni Haber Ekle';
    $('#newsForm').reset();
    $('#nId').value = '';
    $('#newsModal').hidden = false;
  });

  $('#addMemberBtn')?.addEventListener('click', () => {
    $('#memberModalTitle').textContent = 'Yeni Üye Ekle';
    $('#memberForm').reset();
    $('#mId').value = '';
    $('#memberModal').hidden = false;
  });

  // Close modals on overlay click
  $$('.admin-modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.hidden = true;
    });
  });

  // Close modals on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      $$('.admin-modal-overlay').forEach(o => { o.hidden = true; });
    }
  });

  // Nav item click
  $$('.admin-nav-item[data-section]').forEach(btn => {
    btn.addEventListener('click', () => switchSection(btn.dataset.section));
  });

  /* Tek delege dinleyici — tüm data-act düğmeleri. Inline onclick yok (CSP). */
  const ACTIONS = { editProject, deleteProject, editNews, deleteNews, editMember, deleteMember, viewApp, approveApp, rejectApp, switchSection, closeModal };
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = ACTIONS[el.dataset.act];
    if (typeof fn !== 'function') return;
    e.preventDefault();
    const raw = el.dataset.arg;
    const arg = raw != null && raw !== '' && /^\d+$/.test(raw) ? Number(raw) : raw;
    fn(arg);
  });

  // Logout
  $('#logoutBtn')?.addEventListener('click', async () => {
    await YZKSecure.clearDeviceKey();
    appKey = null; plainApps = null;
    location.reload();
  });

  // Sidebar toggle (mobile)
  $('#sidebarToggle')?.addEventListener('click', () => {
    $('#adminSidebar').classList.toggle('open');
  });

  // ── Başvuru şifresi: cihaz anahtarı varsa hiç sorulmaz ──
  let cfgCache;   // /config (pub + vault)

  async function getConfig(force) {
    if (cfgCache && !force) return cfgCache;
    cfgCache = (window.YZKSync && YZKSync.configGet) ? await YZKSync.configGet() : null;
    return cfgCache;
  }

  function lockMsg(t, color) {
    const m = $('#unlockMsg');
    if (!m) return;
    m.style.color = color || 'var(--dim)';
    m.textContent = t || '';
  }

  /* Sadece kasa var + cihaz anahtarı yoksa görünür (nadir: yeni cihaz) */
  async function refreshLockUI() {
    const bar = $('#appsLockBar');
    if (!bar) return;
    bar.hidden = isUnlocked();
  }

  /* Parola → kasayı aç → cihaz anahtarı olarak sakla */
  async function unlockWithPassword(pass) {
    const cfg = await getConfig(true);
    const vault = cfg && cfg.vault;
    if (!vault) return { ok: false, noVault: true };
    try {
      const key = await YZKSecure.openVault(vault, pass);
      await YZKSecure.saveDeviceKey(key);
      appKey = key;
      const n = await decryptAll();
      return { ok: true, count: n };
    } catch (e) {
      appKey = null; plainApps = null;
      return { ok: false };
    }
  }

  $('#unlockForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const pass = $('#keyPass').value;
    if (!pass) return;
    lockMsg('Çözülüyor…');
    const r = await unlockWithPassword(pass);
    if (r.ok) {
      $('#keyPass').value = '';
      lockMsg(r.count + ' başvuru çözüldü.', 'var(--lime)');
      refreshLockUI(); renderApplications(); renderDashboard();
    } else {
      lockMsg('Parola yanlış.', 'var(--red)');
    }
  });

  // Clock
  function updateClock() {
    const el = $('#adminClock');
    if (el) el.textContent = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }
  updateClock();
  setInterval(updateClock, 30000);

  // ── Giriş akışı ───────────────────────────────────────────
  // 1) Bu cihazda anahtar varsa → panel doğrudan açılır (şifre sorulmaz)
  // 2) Sunucuda kasa varsa → bir kez parola (sonra cihaza kaydedilir)
  // 3) Kasa yoksa → ilk kurulum (parola belirle, anahtar çifti üretilir)
  const MAX_TRIES = 5;
  const LOCK_KEY = 'yzk-admin-lock';
  const LOCK_MS = 5 * 60 * 1000;

  function getLock() {
    try { return JSON.parse(localStorage.getItem(LOCK_KEY) || '{"n":0,"until":0}'); }
    catch { return { n: 0, until: 0 }; }
  }
  function setLock(v) { try { localStorage.setItem(LOCK_KEY, JSON.stringify(v)); } catch {} }

  async function init() {
    // 1) cihaz anahtarı
    const dev = await YZKSecure.loadDeviceKey();
    if (dev) {
      appKey = dev;
      await startPanel();
      return;
    }

    $('#loginScreen').style.display = 'flex';
    $('#adminPanel').hidden = true;

    // 2) kasa var mı?
    const cfg = await getConfig(true);
    if (cfg && cfg.vault) {
      $('#loginHint').textContent = 'Yönetici parolası';
      $('#adminPass').setAttribute('placeholder', 'Parola');
    } else {
      showSetup();
    }

    $('#loginForm').addEventListener('submit', async e => {
      e.preventDefault();
      const pass = $('#adminPass').value;
      const errEl = $('#loginError');
      const fail = (txt) => {
        if (errEl) { errEl.textContent = txt; errEl.style.display = 'block'; }
        $('#adminPass').value = '';
        $('#adminPass').focus();
      };

      const lock = getLock();
      if (lock.until && Date.now() < lock.until) {
        fail(`Çok fazla hatalı deneme. ${Math.ceil((lock.until - Date.now()) / 60000)} dakika sonra tekrar deneyin.`);
        return;
      }

      const r = await unlockWithPassword(pass);
      if (r.ok) {
        setLock({ n: 0, until: 0 });
        await startPanel();
        return;
      }
      if (r.noVault) { showSetup(); return; }
      const n = (lock.n || 0) + 1;
      if (n >= MAX_TRIES) {
        setLock({ n: 0, until: Date.now() + LOCK_MS });
        fail(`Çok fazla hatalı deneme. ${Math.ceil(LOCK_MS / 60000)} dakika sonra tekrar deneyin.`);
        return;
      }
      setLock({ n, until: 0 });
      fail(`Parola hatalı. Kalan hak: ${MAX_TRIES - n}`);
    });
  }

  /* İlk kurulum: parola → yeni anahtar çifti → kasa sunucuya.
     Anahtar dosyası YOK; her şey tarayıcıda üretilir. */
  function showSetup() {
    if ($('#setupBox')) return;
    const card = $('.admin-login-card');
    if (!card) return;
    $('#loginForm').hidden = true;
    const box = document.createElement('form');
    box.id = 'setupBox';
    box.innerHTML = `
      <p style="font:600 11px var(--mono);letter-spacing:.12em;color:var(--cyan);margin-bottom:10px;">İLK KURULUM · TEK SEFER</p>
      <p style="font-size:13px;color:var(--muted);line-height:1.6;margin-bottom:16px;">
        Bir yönetici parolası belirle. Şifreleme anahtarı bu parolayla sarılıp sunucuda
        saklanacak; parolanın kendisi hiçbir yere yazılmaz. Sonraki girişlerde bu cihazda
        parola sorulmaz, başka cihazda bir kez sorulur.
      </p>
      <div class="admin-field">
        <label for="newPass">YÖNETİCİ PAROLASI</label>
        <input type="password" id="newPass" minlength="12" required autocomplete="new-password" placeholder="en az 12 karakter">
      </div>
      <div class="admin-field">
        <label for="newPass2">PAROLA (TEKRAR)</label>
        <input type="password" id="newPass2" minlength="12" required autocomplete="new-password">
      </div>
      <div class="login-error" id="setupErr"></div>
      <button type="submit" class="btn primary" style="width:100%;justify-content:center;">Kurulumu Tamamla →</button>
      <p style="font-size:11px;color:var(--dim);margin-top:12px;line-height:1.5;">
        Bu parolayı kaybetme: başvuruları çözen tek anahtar onunla sarılı.
      </p>
    `;
    card.appendChild(box);
    box.addEventListener('submit', async e => {
      e.preventDefault();
      const p1 = $('#newPass').value, p2 = $('#newPass2').value, err = $('#setupErr');
      const bad = (t) => { err.textContent = t; err.style.display = 'block'; };
      if (p1.length < 12) return bad('Parola en az 12 karakter olmalı.');
      if (p1 !== p2) return bad('Parolalar eşleşmiyor.');
      err.style.display = 'none';
      const btn = box.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Anahtar üretiliyor…';
      try {
        const kp = await YZKSecure.generateKeypair();
        const vault = await YZKSecure.makeVault(kp.pkcs8, p1);
        const put = await YZKSync.configPatch({ pub: kp.pubB64, vault: vault });
        if (!put.ok) {
          btn.disabled = false; btn.textContent = 'Kurulumu Tamamla →';
          return bad('Sunucuya yazılamadı (' + put.reason + '). Firebase → Rules: .write izni gerekli.');
        }
        await YZKSecure.saveDeviceKey(kp.key);
        appKey = kp.key;
        cfgCache = { pub: kp.pubB64, vault: vault };
        box.remove();
        $('#loginForm').hidden = false;
        await startPanel();
      } catch (ex) {
        btn.disabled = false; btn.textContent = 'Kurulumu Tamamla →';
        bad('Kurulum başarısız: ' + (ex.message || 'bilinmeyen hata'));
      }
    });
  }

  // ── Theme toggle ─────────────────────────────────────────
  function syncThemeBtn() {
    const btn = $('#themeBtn');
    if (!btn) return;
    const t = document.documentElement.getAttribute('data-theme') || 'dark';
    btn.setAttribute('aria-label', t === 'light' ? 'Karanlık temaya geç' : 'Aydınlık temaya geç');
    btn.setAttribute('aria-pressed', t === 'light' ? 'true' : 'false');
  }
  ['#themeBtn', '#themeBtnLogin'].forEach(sel => {
    $(sel)?.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = cur === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('yzk-theme', next); } catch {}
      syncThemeBtn();
    });
  });
  syncThemeBtn();

  async function startPanel() {
    $('#loginScreen').style.display = 'none';
    $('#adminPanel').hidden = false;

    // Show sidebar toggle on mobile
    if (window.innerWidth <= 768) {
      const t = $('#sidebarToggle');
      if (t) t.style.display = 'inline-flex';
    }

    // Open DB and seed
    DB = await openDB();
    await seedIfEmpty(DB);

    // Setup search filters
    setupSearch('searchProjects', () => allProjects, renderProjectsTable);
    setupSearch('searchNews',     () => allNews,     renderNewsTable);
    setupSearch('searchMembers',  () => allMembers,  renderMembersTable);

    // Cihaz anahtarı hazırsa mevcut zarfları hemen çöz (şifre sormadan)
    if (appKey) { try { await decryptAll(); } catch {} }

    // Açılışta ortak uç noktadan zarfları çek (varsa, sessiz)
    try { await pullFromServer(true); } catch {}

    // Start dashboard
    await switchSection('dashboard');
  }

  // Boot
  document.addEventListener('DOMContentLoaded', init);
})();
