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
    const rows = (D.products || []).map((p, idx) => {
      const vCount = Array.isArray(p.variants) ? p.variants.length : 0;
      const vBadge = vCount > 0 ? ` · <strong>${vCount} أنواع</strong>` : '';
      return `
      <div class="panel" style="margin-bottom:10px">
        <div class="row" style="justify-content:space-between">
          <div>
            <strong>${esc(p.name || 'منتج بدون اسم')}</strong>
            <div class="muted" style="font-size:13px">السعر: ${esc(p.price ?? 0)} ${esc(D.settings?.currency || '')} · المخزون: ${p.stock ?? 'غير محدد'}${vBadge}</div>
          </div>
          <div class="row">
            <button class="btn sec sm" data-edit-p="${idx}" type="button">تعديل</button>
            <button class="btn danger sm" data-del-p="${idx}" type="button">حذف</button>
          </div>
        </div>
      </div>
    `;
    }).join('');

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
    const srcProd = isNew ? {} : (D.products[idx] || {});

    const p = {
      ...srcProd,
      id: srcProd.id || uid(),
      name: srcProd.name || '',
      category: srcProd.category || D.categories[0]?.id || '',
      price: srcProd.price ?? 0,
      discount: srcProd.discount ?? 0,
      stock: srcProd.stock ?? null,
      inStock: srcProd.inStock !== false,
      image: srcProd.image || '',
      description: srcProd.description || '',
      specs: srcProd.specs || '',
      usage: srcProd.usage || '',
      variants: Array.isArray(srcProd.variants)
        ? srcProd.variants.map(v => ({
            id: v.id || uid(),
            name: v.name || '',
            price: v.price ?? srcProd.price ?? 0,
            discount: v.discount ?? '',
            stock: v.stock ?? '',
            inStock: v.inStock !== false,
            image: v.image || '',
            description: v.description || '',
            specs: v.specs || '',
            usage: v.usage || ''
          }))
        : []
    };

    function renderVariantRowsHtml() {
      if (!p.variants.length) {
        return `<div class="muted" style="font-size:13px;padding:8px 0">لا توجد أنواع مضافة لهذا المنتج حالياً. اضغط «+ إضافة نوع» لإضافة درجات أو أحجام أو نكهات.</div>`;
      }
      return p.variants.map((v, vIdx) => `
        <div class="panel" data-v-card="${vIdx}" style="margin-top:10px;padding:12px;background:#fdf8fb;border:1px solid #f5d0fe;border-radius:12px">
          <div class="row" style="justify-content:space-between;margin-bottom:8px">
            <strong style="color:var(--pink);font-size:13.5px">نوع #${vIdx + 1}: ${esc(v.name || 'بدون اسم')}</strong>
            <div class="row">
              <label style="display:inline-flex;align-items:center;gap:4px;margin:0;font-size:12.5px;font-weight:600;cursor:pointer">
                <input type="checkbox" data-v-avail="${vIdx}" ${v.inStock !== false ? 'checked' : ''} style="width:auto">
                متوفر
              </label>
              <button class="btn danger sm" type="button" data-v-del="${vIdx}">حذف النوع</button>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div>
              <label style="font-size:12px">اسم النوع (مثل: 01 وردي، 500 مل)</label>
              <input type="text" data-v-name="${vIdx}" value="${esc(v.name)}" placeholder="اسم النوع">
            </div>
            <div>
              <label style="font-size:12px">سعر النوع</label>
              <input type="number" data-v-price="${vIdx}" value="${esc(v.price ?? 0)}">
            </div>
            <div>
              <label style="font-size:12px">خصم النوع % (اختياري)</label>
              <input type="number" data-v-disc="${vIdx}" value="${esc(v.discount ?? '')}" placeholder="مثال: 15">
            </div>
            <div>
              <label style="font-size:12px">كمية النوع (فارغ = غير محدود)</label>
              <input type="number" data-v-stock="${vIdx}" value="${esc(v.stock ?? '')}" placeholder="مثال: 10">
            </div>
          </div>

          <div style="margin-top:8px">
            <label style="font-size:12px">رابط أو مسار صورة النوع (اختياري)</label>
            <input type="text" data-v-img="${vIdx}" value="${esc(v.image || '')}" placeholder="اتركه فارغاً لاستخدام صورة المنتج">
          </div>
        </div>
      `).join('');
    }

    function syncDraftFromDom() {
      p.name = ($('#epName')?.value ?? p.name);
      p.category = ($('#epCat')?.value ?? p.category);
      p.price = Number($('#epPrice')?.value ?? p.price) || 0;
      p.discount = Math.max(0, Math.min(99, Number($('#epDisc')?.value ?? p.discount) || 0));
      const stRaw = ($('#epStock')?.value ?? '').trim();
      p.stock = stRaw === '' ? null : Math.max(0, parseInt(stRaw, 10) || 0);
      p.inStock = Boolean($('#epInStock')?.checked);
      p.image = ($('#epImg')?.value ?? p.image);
      p.description = ($('#epDesc')?.value ?? p.description);

      p.variants.forEach((v, vIdx) => {
        const nameEl = md.querySelector(`[data-v-name="${vIdx}"]`);
        const priceEl = md.querySelector(`[data-v-price="${vIdx}"]`);
        const discEl = md.querySelector(`[data-v-disc="${vIdx}"]`);
        const stockEl = md.querySelector(`[data-v-stock="${vIdx}"]`);
        const imgEl = md.querySelector(`[data-v-img="${vIdx}"]`);
        const availEl = md.querySelector(`[data-v-avail="${vIdx}"]`);

        if (nameEl) v.name = nameEl.value;
        if (priceEl) v.price = Number(priceEl.value) || 0;
        if (discEl) {
          const dVal = discEl.value.trim();
          v.discount = dVal === '' ? '' : Math.max(0, Math.min(99, Number(dVal) || 0));
        }
        if (stockEl) {
          const sVal = stockEl.value.trim();
          v.stock = sVal === '' ? '' : Math.max(0, parseInt(sVal, 10) || 0);
        }
        if (imgEl) v.image = imgEl.value;
        if (availEl) v.inStock = Boolean(availEl.checked);
      });
    }

    function bindVariantEvents() {
      $('#addVarBtn')?.addEventListener('click', () => {
        syncDraftFromDom();
        p.variants.push({
          id: uid(),
          name: '',
          price: p.price || 0,
          discount: '',
          stock: '',
          inStock: true,
          image: '',
          description: '',
          specs: '',
          usage: ''
        });
        refreshVariantsArea();
      });

      md.querySelectorAll('[data-v-del]').forEach(btn => {
        btn.onclick = () => {
          syncDraftFromDom();
          const vIdx = +btn.dataset.vDel;
          p.variants.splice(vIdx, 1);
          refreshVariantsArea();
        };
      });
    }

    function refreshVariantsArea() {
      const container = $('#variantsListContainer');
      if (!container) return;
      container.innerHTML = renderVariantRowsHtml();
      bindVariantEvents();
    }

    md.innerHTML = `
      <h3 style="margin-top:0">${isNew ? 'إضافة منتج' : 'تعديل منتج'}</h3>
      <label>اسم المنتج</label><input type="text" id="epName" value="${esc(p.name)}">
      <label>القسم</label>
      <select id="epCat">
        <option value="">-- بدون قسم --</option>
        ${(D.categories || []).map(c => `<option value="${esc(c.id)}" ${c.id === p.category ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>
      <label>السعر الأساسي</label><input type="number" id="epPrice" value="${esc(p.price ?? 0)}">
      <label>نسبة الخصم %</label><input type="number" id="epDisc" value="${esc(p.discount ?? 0)}">
      <label>الكمية المتوفرة (اتركه فارغاً لغير محدود)</label><input type="number" id="epStock" value="${p.stock ?? ''}">
      <label style="display:inline-flex;align-items:center;gap:6px;margin-top:8px;cursor:pointer">
        <input type="checkbox" id="epInStock" ${p.inStock !== false ? 'checked' : ''} style="width:auto">
        المنتج متوفر للبيع
      </label>
      <label>رابط أو مسار الصورة الرئيسية</label><input type="text" id="epImg" value="${esc(p.image || '')}">
      <label>الوصف</label><textarea id="epDesc">${esc(p.description || '')}</textarea>

      <div style="margin-top:16px;padding-top:12px;border-top:1px solid #e5e7eb">
        <div class="row" style="justify-content:space-between;align-items:center">
          <strong>أنواع المنتج (Variants)</strong>
          <button class="btn sec sm" type="button" id="addVarBtn">+ إضافة نوع</button>
        </div>
        <div id="variantsListContainer">${renderVariantRowsHtml()}</div>
      </div>

      <div class="row" style="margin-top:16px;justify-content:flex-end">
        <button class="btn sec sm" id="epCancel" type="button">إلغاء</button>
        <button class="btn sm" id="epOk" type="button">تأكيد</button>
      </div>
    `;

    ov.classList.add('show');
    bindVariantEvents();

    $('#epCancel').onclick = () => ov.classList.remove('show');
    ov.onclick = e => { if (e.target === ov) ov.classList.remove('show'); };

    $('#epOk').onclick = () => {
      syncDraftFromDom();
      const name = (p.name || '').trim();
      if (!name) { alert('اكتب اسم المنتج'); return; }

      const cleanVariants = (p.variants || [])
        .map(v => ({
          ...v,
          id: v.id || uid(),
          name: String(v.name || '').trim(),
          price: Number(v.price) || 0,
          discount: v.discount === '' ? undefined : Math.max(0, Math.min(99, Number(v.discount) || 0)),
          stock: v.stock === '' ? undefined : Math.max(0, parseInt(v.stock, 10) || 0),
          inStock: v.inStock !== false,
          image: String(v.image || '').trim()
        }))
        .filter(v => v.name.length > 0);

      const updated = {
        ...p,
        name,
        category: String(p.category || '').trim(),
        price: Number(p.price) || 0,
        discount: Math.max(0, Math.min(99, Number(p.discount) || 0)),
        stock: p.stock === null || p.stock === '' ? null : Math.max(0, parseInt(p.stock, 10) || 0),
        inStock: p.inStock !== false,
        image: String(p.image || '').trim(),
        description: String(p.description || '').trim(),
        variants: cleanVariants
      };

      if (updated.variants.length === 0) {
        delete updated.variants;
      }

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
