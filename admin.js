(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const uid = () => 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

  const STORAGE_KEYS = {
    owner: 'ldorava_gh_owner',
    repo: 'ldorava_gh_repo',
    branch: 'ldorava_gh_branch',
    token: 'ldorava_gh_token'
  };

  let cfg = { owner: '', repo: '', branch: 'main', token: '' };
  let D = { settings: { name: "L'DORA Viva", currency: 'د.ع', whatsapp: '' }, categories: [], products: [] };
  let sha = '';
  let dirty = false;
  let tab = 'products';
  let initialMediaPaths = new Set();

  function toast(msg) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    t.style.display = 'block';
    clearTimeout(toast._tm);
    toast._tm = setTimeout(() => {
      t.classList.remove('show');
      t.style.display = 'none';
    }, 3000);
  }

  function setDirty(v = true) {
    dirty = v;
    const sb = $('#savebar');
    if (sb) sb.style.display = dirty ? 'flex' : 'none';
  }

  function readSavedCfg() {
    return {
      owner: localStorage.getItem(STORAGE_KEYS.owner) || localStorage.getItem('gh_owner') || 'ldorava',
      repo: localStorage.getItem(STORAGE_KEYS.repo) || localStorage.getItem('gh_repo') || 'Ldorava',
      branch: localStorage.getItem(STORAGE_KEYS.branch) || localStorage.getItem('gh_branch') || 'main',
      token: localStorage.getItem(STORAGE_KEYS.token) || localStorage.getItem('gh_token') || ''
    };
  }

  function writeSavedCfg(c) {
    try {
      localStorage.setItem(STORAGE_KEYS.owner, c.owner);
      localStorage.setItem(STORAGE_KEYS.repo, c.repo);
      localStorage.setItem(STORAGE_KEYS.branch, c.branch || 'main');
      if (c.token) localStorage.setItem(STORAGE_KEYS.token, c.token);
    } catch (_) {}
  }

  function fillLoginInputs() {
    const saved = readSavedCfg();
    const lo = $('#lo'), lr = $('#lr'), lb = $('#lb'), lt = $('#lt');
    if (lo && !lo.value.trim()) lo.value = saved.owner;
    if (lr && !lr.value.trim()) lr.value = saved.repo;
    if (lb && !lb.value.trim()) lb.value = saved.branch;
    if (lt && !lt.value.trim() && saved.token) lt.value = saved.token;
  }

  function extractRepoFilePath(url, owner, repo, branch = 'main') {
    if (!url || typeof url !== 'string') return null;
    const clean = url.trim().split('?')[0].split('#')[0];
    if (!clean || clean.startsWith('data:') || clean.startsWith('blob:')) return null;

    if (!/^https?:\/\//i.test(clean)) {
      return clean.replace(/^\.?\//, '').replace(/^\/+/, '');
    }

    try {
      const u = new URL(clean);
      const path = decodeURIComponent(u.pathname).replace(/^\/+/, '');
      if (u.hostname === 'raw.githubusercontent.com') {
        const prefix = `${owner}/${repo}/${branch}/`;
        if (path.startsWith(prefix)) return path.slice(prefix.length);
      }
      if (u.hostname.endsWith('.github.io')) {
        const repoPrefix = `${repo}/`;
        if (path.startsWith(repoPrefix)) return path.slice(repoPrefix.length);
      }
    } catch (_) {}

    return null;
  }

  function collectUsedStoreMedia(data, c) {
    const set = new Set();
    const add = v => {
      const p = extractRepoFilePath(v, c.owner, c.repo, c.branch || 'main');
      if (p && !['icon-512.png', 'favicon.ico'].includes(p)) set.add(p);
    };
    (data.products || []).forEach(prod => {
      add(prod?.image);
      if (Array.isArray(prod?.images)) prod.images.forEach(add);
      (prod?.variants || []).forEach(v => add(v?.image));
    });
    return set;
  }

  async function deleteFileIfExists(filePath, c) {
    const encoded = filePath.split('/').map(encodeURIComponent).join('/');
    const api = `https://api.github.com/repos/${c.owner}/${c.repo}/contents/${encoded}`;
    const headers = {
      'Authorization': `Bearer ${c.token}`,
      'Accept': 'application/vnd.github+json'
    };

    const r = await fetch(`${api}?ref=${encodeURIComponent(c.branch || 'main')}`, { headers });
    if (r.status === 404) return;
    if (!r.ok) return;

    const meta = await r.json();
    if (!meta?.sha) return;

    await fetch(api, {
      method: 'DELETE',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Remove unused media ${filePath}`,
        sha: meta.sha,
        branch: c.branch || 'main'
      })
    });
  }

  async function ghGetStore(c) {
    const api = `https://api.github.com/repos/${c.owner}/${c.repo}/contents/data/store.json?ref=${encodeURIComponent(c.branch || 'main')}`;
    const res = await fetch(api, {
      headers: {
        'Authorization': `Bearer ${c.token}`,
        'Accept': 'application/vnd.github+json'
      }
    });

    if (res.status === 404) {
      return {
        sha: '',
        data: { settings: { name: "L'DORA Viva", currency: 'د.ع', whatsapp: '' }, categories: [], products: [] }
      };
    }

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`فشل الاتصال بـ GitHub (${res.status}): ${txt.slice(0, 120)}`);
    }

    const fileJson = await res.json();
    const binary = atob(String(fileJson.content || '').replace(/\n/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const decoded = new TextDecoder('utf-8').decode(bytes);
    const parsed = JSON.parse(decoded);

    return {
      sha: fileJson.sha || '',
      data: {
        settings: parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : { name: "L'DORA Viva", currency: 'د.ع', whatsapp: '' },
        categories: Array.isArray(parsed.categories) ? parsed.categories : [],
        products: Array.isArray(parsed.products) ? parsed.products : []
      }
    };
  }

  async function ghSaveStore(c, data, currentSha) {
    const api = `https://api.github.com/repos/${c.owner}/${c.repo}/contents/data/store.json`;
    const jsonStr = JSON.stringify(data, null, 2);
    const base64 = btoa(unescape(encodeURIComponent(jsonStr)));

    const body = {
      message: 'Update data/store.json',
      content: base64,
      branch: c.branch || 'main'
    };
    if (currentSha) body.sha = currentSha;

    const res = await fetch(api, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${c.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github+json'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`فشل حفظ البيانات (${res.status}): ${txt.slice(0, 140)}`);
    }

    const out = await res.json();
    return out?.content?.sha || currentSha;
  }

  function showAppView() {
    if ($('#login')) $('#login').style.display = 'none';
    if ($('#app')) $('#app').style.display = 'block';
    if ($('#logout')) $('#logout').style.display = 'inline-block';
    renderView();
  }

  function showLoginView() {
    if ($('#app')) $('#app').style.display = 'none';
    if ($('#savebar')) $('#savebar').style.display = 'none';
    if ($('#logout')) $('#logout').style.display = 'none';
    if ($('#login')) $('#login').style.display = 'block';
    fillLoginInputs();
  }

  function renderProducts() {
    const view = $('#view');
    if (!view) return;
    const rows = (D.products || []).map((p, idx) => `
      <div class="panel" style="margin-bottom:10px">
        <div class="row" style="justify-content:space-between">
          <div>
            <strong>${esc(p.name || 'منتج بدون اسم')}</strong>
            <div class="muted" style="font-size:13px">السعر: ${esc(p.price ?? 0)} ${esc(D.settings?.currency || '')} · المخزون: ${p.stock ?? 'غير محدد'}</div>
          </div>
          <div class="row">
            <button class="btn sec sm" data-edit-p="${idx}" type="button">تعديل</button>
            <button class="btn danger sm" data-del-p="${idx}" type="button">حذف</button>
          </div>
        </div>
      </div>
    `).join('');

    view.innerHTML = `
      <div class="row" style="justify-content:space-between;margin-bottom:12px">
        <h3 style="margin:0">المنتجات (${(D.products || []).length})</h3>
        <button class="btn sm" id="addProdBtn" type="button">+ إضافة منتج</button>
      </div>
      ${rows || '<div class="panel"><div class="muted">لا توجد منتجات بعد</div></div>'}
    `;

    $('#addProdBtn')?.addEventListener('click', () => openProductEditor(-1));
    view.querySelectorAll('[data-edit-p]').forEach(b => {
      b.onclick = () => openProductEditor(+b.dataset.editP);
    });
    view.querySelectorAll('[data-del-p]').forEach(b => {
      b.onclick = () => {
        const i = +b.dataset.delP;
        if (!confirm('هل تريد حذف هذا المنتج؟')) return;
        D.products.splice(i, 1);
        setDirty(true);
        renderProducts();
      };
    });
  }

  function openProductEditor(idx) {
    const ov = $('#ov'), md = $('#md');
    if (!ov || !md) return;
    const isNew = idx < 0;
    const p = isNew
      ? { id: uid(), name: '', category: D.categories[0]?.id || '', price: 0, discount: 0, stock: null, image: '', description: '' }
      : { ...D.products[idx] };

    md.innerHTML = `
      <h3 style="margin-top:0">${isNew ? 'إضافة منتج' : 'تعديل منتج'}</h3>
      <label>اسم المنتج</label><input type="text" id="epName" value="${esc(p.name)}">
      <label>القسم</label>
      <select id="epCat">
        <option value="">-- بدون قسم --</option>
        ${(D.categories || []).map(c => `<option value="${esc(c.id)}" ${c.id === p.category ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>
      <label>السعر</label><input type="number" id="epPrice" value="${esc(p.price ?? 0)}">
      <label>نسبة الخصم %</label><input type="number" id="epDisc" value="${esc(p.discount ?? 0)}">
      <label>الكمية المتوفرة (اتركه فارغاً لغير محدود)</label><input type="number" id="epStock" value="${p.stock ?? ''}">
      <label>رابط أو مسار الصورة</label><input type="text" id="epImg" value="${esc(p.image || '')}">
      <label>الوصف</label><textarea id="epDesc">${esc(p.description || '')}</textarea>
      <div class="row" style="margin-top:14px;justify-content:flex-end">
        <button class="btn sec sm" id="epCancel" type="button">إلغاء</button>
        <button class="btn sm" id="epOk" type="button">تأكيد</button>
      </div>
    `;

    ov.classList.add('show');
    $('#epCancel').onclick = () => ov.classList.remove('show');
    ov.onclick = e => { if (e.target === ov) ov.classList.remove('show'); };

    $('#epOk').onclick = () => {
      const name = $('#epName').value.trim();
      if (!name) { alert('اكتب اسم المنتج'); return; }
      const stockRaw = $('#epStock').value.trim();
      const updated = {
        ...p,
        name,
        category: $('#epCat').value,
        price: Number($('#epPrice').value) || 0,
        discount: Math.max(0, Math.min(99, Number($('#epDisc').value) || 0)),
        stock: stockRaw === '' ? null : Math.max(0, parseInt(stockRaw, 10) || 0),
        image: $('#epImg').value.trim(),
        description: $('#epDesc').value.trim()
      };
      if (isNew) D.products.unshift(updated);
      else D.products[idx] = updated;
      ov.classList.remove('show');
      setDirty(true);
      renderProducts();
    };
  }

  function renderCategories() {
    const view = $('#view');
    if (!view) return;
    const list = (D.categories || []).map((c, idx) => `
      <div class="panel" style="margin-bottom:8px">
        <div class="row" style="justify-content:space-between">
          <div><strong>${esc(c.icon || '')} ${esc(c.name)}</strong></div>
          <button class="btn danger sm" data-del-c="${idx}" type="button">حذف</button>
        </div>
      </div>
    `).join('');

    view.innerHTML = `
      <div class="panel" style="margin-bottom:12px">
        <h3 style="margin-top:0">إضافة قسم</h3>
        <div class="row">
          <input type="text" id="newCatIcon" placeholder="أيقونة مثل ✨" style="max-width:110px">
          <input type="text" id="newCatName" placeholder="اسم القسم" style="flex:1">
          <button class="btn sm" id="addCatBtn" type="button">إضافة</button>
        </div>
      </div>
      ${list || '<div class="muted">لا توجد أقسام</div>'}
    `;

    $('#addCatBtn')?.addEventListener('click', () => {
      const name = $('#newCatName').value.trim();
      const icon = $('#newCatIcon').value.trim();
      if (!name) return;
      D.categories.push({ id: uid(), name, icon });
      setDirty(true);
      renderCategories();
    });

    view.querySelectorAll('[data-del-c]').forEach(b => {
      b.onclick = () => {
        D.categories.splice(+b.dataset.delC, 1);
        setDirty(true);
        renderCategories();
      };
    });
  }

  function renderSettings() {
    const view = $('#view');
    if (!view) return;
    const s = D.settings || {};
    view.innerHTML = `
      <div class="panel">
        <h3 style="margin-top:0">إعدادات المتجر</h3>
        <label>اسم المتجر</label><input type="text" id="stName" value="${esc(s.name || "L'DORA Viva")}">
        <label>العملة</label><input type="text" id="stCur" value="${esc(s.currency || 'د.ع')}">
        <label>رقم واتساب الطلبات (بالمفتاح الدولي بدون +)</label><input type="text" id="stWa" value="${esc(s.whatsapp || '')}">
        <div class="row" style="margin-top:12px">
          <button class="btn sm" id="applyStBtn" type="button">تطبيق التغييرات</button>
        </div>
      </div>
    `;

    $('#applyStBtn')?.addEventListener('click', () => {
      D.settings = {
        ...D.settings,
        name: $('#stName').value.trim() || "L'DORA Viva",
        currency: $('#stCur').value.trim() || 'د.ع',
        whatsapp: $('#stWa').value.trim()
      };
      setDirty(true);
      toast('تم تحديث إعدادات المتجر، اضغط حفظ ونشر');
    });
  }

  function renderView() {
    if (tab === 'products') renderProducts();
    else if (tab === 'categories') renderCategories();
    else renderSettings();
  }

  async function handleConnect() {
    const btn = $('#connect');
    const owner = ($('#lo')?.value || '').trim();
    const repo = ($('#lr')?.value || '').trim();
    const branch = ($('#lb')?.value || 'main').trim() || 'main';
    const token = ($('#lt')?.value || '').trim();

    if (!owner || !repo || !token) {
      toast('يرجى إدخال اسم المستخدم والمستودع و Token');
      return;
    }

    cfg = { owner, repo, branch, token };
    writeSavedCfg(cfg);

    if (btn) btn.disabled = true;
    try {
      toast('جاري الاتصال بـ GitHub...');
      const loaded = await ghGetStore(cfg);
      D = loaded.data;
      sha = loaded.sha;
      initialMediaPaths = collectUsedStoreMedia(D, cfg);
      setDirty(false);
      showAppView();
      toast('تم تسجيل الدخول بنجاح');
    } catch (err) {
      alert(err.message || 'تعذر الاتصال بـ GitHub');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function handleSave() {
    const saveBtn = $('#save');
    if (saveBtn) saveBtn.disabled = true;
    try {
      toast('جاري الحفظ والنشر...');
      sha = await ghSaveStore(cfg, D, sha);

      const currentMedia = collectUsedStoreMedia(D, cfg);
      const removed = [...initialMediaPaths].filter(p => !currentMedia.has(p));
      for (const p of removed) {
        await deleteFileIfExists(p, cfg);
      }
      initialMediaPaths = currentMedia;

      setDirty(false);
      toast(removed.length ? `تم النشر وحذف ${removed.length} صورة غير مستخدمة` : 'تم الحفظ والنشر بنجاح');
    } catch (err) {
      alert(err.message || 'حدث خطأ أثناء الحفظ');
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    fillLoginInputs();

    ['#lo', '#lr', '#lb', '#lt'].forEach(sel => {
      const el = $(sel);
      if (!el) return;
      el.addEventListener('input', () => {
        writeSavedCfg({
          owner: ($('#lo')?.value || '').trim(),
          repo: ($('#lr')?.value || '').trim(),
          branch: ($('#lb')?.value || 'main').trim() || 'main',
          token: ($('#lt')?.value || '').trim()
        });
      });
    });

    $('#connect')?.addEventListener('click', handleConnect);
    $('#save')?.addEventListener('click', handleSave);
    $('#logout')?.addEventListener('click', () => {
      try { localStorage.removeItem(STORAGE_KEYS.token); } catch (_) {}
      if ($('#lt')) $('#lt').value = '';
      cfg.token = '';
      showLoginView();
    });

    $('#tabs')?.querySelectorAll('button').forEach(b => {
      b.onclick = () => {
        tab = b.dataset.t;
        $('#tabs').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
        renderView();
      };
    });
  });
})();
