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
            <td><span class="badge badge-pending">${esc(a.application_type || 'membership')}</span></td>
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
  function renderApplications() {
    const apps  = getApplications();
    const tbody = $('#appsTable');
    if (!tbody) return;
    if (apps.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="admin-empty"><div class="admin-empty-icon">📋</div><p>Henüz başvuru alınmadı.</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = apps.map((a, i) => `
      <tr>
        <td>${esc(a.name || '—')}</td>
        <td style="color:var(--muted);font-size:12px;">${esc(a.email || '—')}</td>
        <td style="color:var(--muted);font-size:12px;">${esc((a.department || '—').substring(0,40))}</td>
        <td><span class="badge badge-pending">${esc(a.application_type === 'board' ? 'Yönetim' : 'Üyelik')}</span></td>
        <td style="color:var(--muted);font-size:12px;">${esc((a.motivation || '—').substring(0,60))}${(a.motivation||'').length>60?'…':''}</td>
        <td><span class="badge ${statusBadgeClass(a.status || 'pending')}">${esc(appStatusLabel(a.status || 'pending'))}</span></td>
        <td>
          <div class="table-actions">
            <button class="btn sm" style="color:var(--lime);border-color:rgba(163,230,53,0.3);" onclick="approveApp(${i})">Onayla</button>
            <button class="btn sm danger" onclick="rejectApp(${i})">Reddet</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  window.approveApp = function(i) {
    const apps = getApplications();
    if (apps[i]) { apps[i].status = 'approved'; saveApplications(apps); renderApplications(); showToast('Başvuru onaylandı.', 'success'); }
  };
  window.rejectApp = function(i) {
    const apps = getApplications();
    if (apps[i]) { apps[i].status = 'rejected'; saveApplications(apps); renderApplications(); showToast('Başvuru reddedildi.', 'error'); }
  };

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
  async function attemptLogin(pass) {
    // On first login with correct pass, compute and store hash
    const stored = localStorage.getItem(PASS_HASH_KEY);
    const inputHash = await sha256(pass);

    if (!stored) {
      // First ever login — accept 'yzk2026' and store its hash
      const correctHash = await sha256('yzk2026');
      if (inputHash !== correctHash) return false;
      localStorage.setItem(PASS_HASH_KEY, correctHash);
      return true;
    }
    return inputHash === stored;
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
      const ok   = await attemptLogin(pass);
      if (ok) {
        sessionStorage.setItem(SESSION_KEY, 'authenticated');
        await startPanel();
      } else {
        const errEl = $('#loginError');
        if (errEl) errEl.style.display = 'block';
        $('#adminPass').value = '';
        $('#adminPass').focus();
      }
    });
  }

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
    setupSearch('searchApps', getApplications, items => {
      const apps = getApplications();
      const q = ($('#searchApps')?.value || '').toLowerCase();
      const filtered = q ? apps.filter(a => JSON.stringify(a).toLowerCase().includes(q)) : apps;
      // re-render with filtered (reusing renderApplications is simpler)
      renderApplications();
    });

    // Start dashboard
    await switchSection('dashboard');
  }

  // Boot
  document.addEventListener('DOMContentLoaded', init);
})();
