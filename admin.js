/* YZK Admin Panel — Client-Side Logic
 * Password: yzk2026
 * SHA-256 hash computed at runtime via crypto.subtle
 * All data stored in IndexedDB (yzk-admin-db)
 * Applications read from localStorage['yzk-applications']
 */

(function () {
  'use strict';

  const PASS_HASH_KEY = 'yzk-admin-hash';
  const SESSION_KEY   = 'yzk-admin-session';
  const DB_NAME       = 'yzk-admin-db';
  const DB_VERSION    = 1;
  const STORES        = ['projects', 'news', 'members'];

  // ── Utility ──────────────────────────────────────────────
  async function sha256(str) {
    const data = new TextEncoder().encode(str);
    const buf  = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

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

  function closeModal(id) {
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

  // ── Applications (localStorage) ──────────────────────────
  function getApplications() {
    try {
      return JSON.parse(localStorage.getItem('yzk-applications') || '[]');
    } catch { return []; }
  }

  function saveApplications(apps) {
    localStorage.setItem('yzk-applications', JSON.stringify(apps));
  }

  // ── Section Switching ─────────────────────────────────────
  let currentSection = 'dashboard';

  function switchSection(name) {
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
    const apps = getApplications();

    setText('statProjects', projects.length);
    setText('statNews', news.length);
    setText('statMembers', members.length);
    setText('statApps', apps.length);
    updateBadges(projects.length, news.length, members.length, apps.length);

    const tbody = $('#dashAppsTable');
    if (tbody) {
      if (apps.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--dim);padding:28px;">Henüz başvuru yok.</td></tr>';
      } else {
        tbody.innerHTML = apps.slice(-5).reverse().map(a => `
          <tr>
            <td>${esc(a.name || '—')}</td>
            <td style="color:var(--muted);font-size:12px;">${esc(a.email || '—')}</td>
            <td style="color:var(--muted);font-size:12px;">${esc(a.department || '—')}</td>
            <td><span class="badge badge-active">${esc(a.application_type === 'audit' ? 'Denetim' : a.application_type === 'board' ? 'Yönetim' : 'Üyelik')}</span></td>
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
            <button class="btn sm" onclick="editProject(${p.id})">Düzenle</button>
            <button class="btn sm danger" onclick="deleteProject(${p.id})">Sil</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  window.editProject = function(id) {
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
        <td>${n.url ? `<a href="${esc(n.url)}" target="_blank" rel="noopener" style="font:600 11px var(--mono);">↗ Kaynak</a>` : '—'}</td>
        <td>
          <div class="table-actions">
            <button class="btn sm" onclick="editNews(${n.id})">Düzenle</button>
            <button class="btn sm danger" onclick="deleteNews(${n.id})">Sil</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  window.editNews = function(id) {
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
            <button class="btn sm" onclick="editMember(${m.id})">Düzenle</button>
            <button class="btn sm danger" onclick="deleteMember(${m.id})">Sil</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  window.editMember = function(id) {
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
    const all   = getApplications();
    const tbody = $('#appsTable');
    if (!tbody) return;

    // counters
    const today = new Date().toDateString();
    const setB = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setB('appStatTotal',   all.length);
    setB('appStatBoard',   all.filter(a => a.application_type === 'board').length);
    setB('appStatAudit',   all.filter(a => a.application_type === 'audit').length);
    setB('appStatPending', all.filter(a => (a.status || 'pending') === 'pending').length);
    setB('appStatToday',   all.filter(a => a.submittedAt && new Date(a.submittedAt).toDateString() === today).length);

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
      tbody.innerHTML = `<tr><td colspan="7"><div class="admin-empty"><div class="admin-empty-icon">📋</div><p>${all.length === 0 ? 'Henüz başvuru alınmadı.' : 'Bu filtreyle eşleşen başvuru yok.'}</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = apps.map(a => {
      const idx = all.indexOf(a);
      const t   = a.application_type === 'board' ? 'Yönetim' : a.application_type === 'audit' ? 'Denetim' : 'Üyelik';
      const dt  = a.submittedAt ? new Date(a.submittedAt).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
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
            <button class="btn sm" onclick="viewApp(${idx})">Detay</button>
            <button class="btn sm" style="color:var(--lime);border-color:rgba(201,224,92,0.3);" onclick="approveApp(${idx})">✓</button>
            <button class="btn sm danger" onclick="rejectApp(${idx})">✕</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  // ── Detail modal ─────────────────────────────────────────
  let currentAppIdx = -1;
  window.viewApp = function (i) {
    const apps = getApplications();
    const a = apps[i];
    if (!a) return;
    currentAppIdx = i;
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
  $('#appDetailApprove')?.addEventListener('click', () => { if (currentAppIdx >= 0) { approveApp(currentAppIdx); closeModal('appDetailModal'); } });
  $('#appDetailReject')?.addEventListener('click',  () => { if (currentAppIdx >= 0) { rejectApp(currentAppIdx);  closeModal('appDetailModal'); } });

  window.approveApp = function (i) {
    const apps = getApplications();
    if (apps[i]) { apps[i].status = 'approved'; saveApplications(apps); renderApplications(); renderDashboard(); showToast('Başvuru onaylandı.', 'success'); }
  };
  window.rejectApp = function (i) {
    const apps = getApplications();
    if (apps[i]) { apps[i].status = 'rejected'; saveApplications(apps); renderApplications(); renderDashboard(); showToast('Başvuru reddedildi.', 'error'); }
  };

  // ── CSV export ───────────────────────────────────────────
  $('#exportCsvBtn')?.addEventListener('click', () => {
    const apps = getApplications();
    if (!apps.length) { showToast('Dışa aktarılacak başvuru yok.', 'error'); return; }
    const cols = ['id','submittedAt','application_type','status','name','tc','birthdate','student_no','email','phone','department','university','motivation','note'];
    const head = ['Kayıt No','Tarih','Tür','Durum','Ad Soyad','T.C. Kimlik','Doğum Tarihi','Öğrenci No','E-posta','Telefon','Bölüm/Sınıf','Üniversite','Motivasyon','Ek Not'];
    const esc_ = v => `"${String(v == null ? '' : v).replace(/"/g,'""')}"`;
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

  // Logout
  $('#logoutBtn')?.addEventListener('click', () => {
    sessionStorage.removeItem(SESSION_KEY);
    location.reload();
  });

  // Sidebar toggle (mobile)
  $('#sidebarToggle')?.addEventListener('click', () => {
    $('#adminSidebar').classList.toggle('open');
  });

  // Clock
  function updateClock() {
    const el = $('#adminClock');
    if (el) el.textContent = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }
  updateClock();
  setInterval(updateClock, 30000);

  // ── Login Flow ────────────────────────────────────────────
  // ── Login with brute-force throttle ──────────────────────
  const LOCK_KEY   = 'yzk-admin-lock';
  const MAX_TRIES  = 5;
  const LOCK_MS    = 5 * 60 * 1000;

  function getLock() {
    try { return JSON.parse(localStorage.getItem(LOCK_KEY) || '{"n":0,"until":0}'); }
    catch { return { n: 0, until: 0 }; }
  }
  function setLock(v) { try { localStorage.setItem(LOCK_KEY, JSON.stringify(v)); } catch {} }

  async function attemptLogin(pass) {
    const lock = getLock();
    if (lock.until && Date.now() < lock.until) return { ok: false, locked: true, mins: Math.ceil((lock.until - Date.now()) / 60000) };

    const stored = localStorage.getItem(PASS_HASH_KEY);
    const inputHash = await sha256(pass);
    const expected = stored || await sha256('yzk2026');

    if (inputHash !== expected) {
      const n = (lock.n || 0) + 1;
      if (n >= MAX_TRIES) {
        setLock({ n: 0, until: Date.now() + LOCK_MS });
        return { ok: false, locked: true, mins: Math.ceil(LOCK_MS / 60000) };
      }
      setLock({ n, until: 0 });
      return { ok: false, remaining: MAX_TRIES - n };
    }

    if (!stored) localStorage.setItem(PASS_HASH_KEY, expected);
    setLock({ n: 0, until: 0 });
    return { ok: true };
  }

  async function init() {
    // Check existing session
    const session = sessionStorage.getItem(SESSION_KEY);
    if (session === 'authenticated') {
      await startPanel();
      return;
    }

    // Show login
    $('#loginScreen').style.display = 'flex';
    $('#adminPanel').hidden = true;

    $('#loginForm').addEventListener('submit', async e => {
      e.preventDefault();
      const pass = $('#adminPass').value;
      const res  = await attemptLogin(pass);
      if (res.ok) {
        sessionStorage.setItem(SESSION_KEY, 'authenticated');
        await startPanel();
      } else {
        const errEl = $('#loginError');
        if (errEl) {
          errEl.textContent = res.locked
            ? `Çok fazla hatalı deneme. ${res.mins} dakika sonra tekrar deneyin.`
            : `Parola hatalı. Kalan hak: ${res.remaining}`;
        }
        if (errEl) errEl.style.display = 'block';
        $('#adminPass').value = '';
        $('#adminPass').focus();
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

    // Start dashboard
    await switchSection('dashboard');
  }

  // Boot
  document.addEventListener('DOMContentLoaded', init);
})();
