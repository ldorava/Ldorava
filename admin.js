(() => {
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => Number(n || 0).toLocaleString('en-US');
const enc = s => btoa(unescape(encodeURIComponent(s)));
const dec = b => decodeURIComponent(escape(atob(b.replace(/\n/g, ''))));
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

const clampDisc = d => Math.max(0, Math.min(99, Number(d) || 0));
const discPrice = (price, disc) => {
  const base = Number(price) || 0;
  const pct = clampDisc(disc);
  return pct > 0 ? Math.round(base * (1 - pct / 100)) : base;
};
const parseStock = val => {
  if (val === '' || val === null || val === undefined) return null;
  const trimmed = String(val).trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
};

let cfg = {};
try { cfg = JSON.parse(localStorage.getItem('gh_cfg') || '{}'); } catch (e) {}
let D = { settings: { name: 'المتجر', currency: '', whatsapp: '' }, categories: [], products: [] };
let sha = null, dirty = false, tab = 'products', filterCat = 'all', filterStock = 'all', searchQuery = '', sortMode = 'manual';
const previews = {};

function toast(m) {
  const t = $('#toast'); t.textContent = m; t.style.display = 'block';
  clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = 'none', 4000);
}
function setDirty(v) { dirty = v; $('#savebar').style.display = v ? 'flex' : 'none'; }
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- GitHub API ---------- */
async function api(path, opts = {}) {
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}` +
    (opts.method ? '' : `?ref=${encodeURIComponent(cfg.branch)}&t=${Date.now()}`);
  const r = await fetch(url, {
    ...opts,
    headers: { Authorization: 'Bearer ' + cfg.token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    const e = new Error(j.message || ('HTTP ' + r.status)); e.status = r.status; throw e;
  }
  return r.json();
}

async function loadData() {
  try {
    const f = await api('data/store.json');
    sha = f.sha;
    D = JSON.parse(dec(f.content));
  } catch (e) {
    if (e.status === 404) { sha = null; } else throw e;
  }
  D.settings = D.settings || {}; D.categories = D.categories || []; D.products = D.products || [];
}

function normalizeProductsStockBeforeSave() {
  D.products = (D.products || []).map(prod => {
    const vars = Array.isArray(prod.variants) ? prod.variants.map(vr => {
      const vStock = parseStock(vr.stock);
      return {
        ...vr,
        stock: vStock,
        inStock: vStock !== null ? vStock > 0 : (vr.inStock !== false)
      };
    }) : [];

    if (vars.length > 0) {
      return {
        ...prod,
        price: 0,
        variants: vars,
        inStock: vars.some(vr => vr.stock !== null ? vr.stock > 0 : vr.inStock !== false)
      };
    }

    const pStock = parseStock(prod.stock);
    return {
      ...prod,
      stock: pStock,
      variants: [],
      inStock: pStock !== null ? pStock > 0 : (prod.inStock !== false)
    };
  });
}

async function saveData() {
  const btn = $('#save'); btn.disabled = true; btn.textContent = 'جاري الحفظ...';
  try {
    normalizeProductsStockBeforeSave();
    const body = { message: 'تحديث المتجر من لوحة الإدارة', content: enc(JSON.stringify(D, null, 2)), branch: cfg.branch };
    if (sha) body.sha = sha;
    const res = await api('data/store.json', { method: 'PUT', body: JSON.stringify(body) });
    sha = res.content.sha;
    setDirty(false);
    toast('تم الحفظ ✓ — تظهر التغييرات في المتجر خلال دقيقة تقريباً');
  } catch (e) {
    if (e.status === 409 || e.status === 422) toast('تعارض: تم تعديل الملف من مكان آخر. أعيدي تحميل الصفحة ثم كرري التعديل.');
    else toast('فشل الحفظ: ' + e.message);
  } finally { btn.disabled = false; btn.textContent = 'حفظ ونشر'; }
}
$('#save').onclick = saveData;

function exportBackup() {
  try {
    const blob = new Blob([JSON.stringify(D, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `store-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('تم تحميل النسخة الاحتياطية ✓');
  } catch (e) {
    toast('تعذر إنشاء النسخة الاحتياطية');
  }
}

async function uploadImage(file) {
  const img = await createImageBitmap(file);
  const s = Math.min(1, 900 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/jpeg', 0.82);
  const path = 'images/' + Date.now() + '.jpg';
  await api(path, { method: 'PUT', body: JSON.stringify({ message: 'رفع صورة منتج', content: url.split(',')[1], branch: cfg.branch }) });
  previews[path] = url;
  return path;
}

/* ---------- login ---------- */
function guess() {
  let saved = {};
  try {
    saved = {
      ...JSON.parse(localStorage.getItem('last_gh_cfg') || '{}'),
      ...JSON.parse(localStorage.getItem('gh_cfg') || '{}')
    };
  } catch (e) {}

  const h = location.hostname;
  if (h.endsWith('.github.io')) {
    cfg.owner = cfg.owner || h.split('.')[0];
    const seg = location.pathname.split('/').filter(Boolean)[0];
    cfg.repo = cfg.repo || (seg && !seg.includes('.') ? seg : h);
  }

  cfg.owner = cfg.owner || saved.owner || '';
  cfg.repo = cfg.repo || saved.repo || '';
  cfg.branch = cfg.branch || saved.branch || 'main';
  cfg.token = cfg.token || saved.token || '';
}

function fillLogin() {
  $('#lo').value = cfg.owner || '';
  $('#lr').value = cfg.repo || '';
  $('#lb').value = cfg.branch || 'main';
  $('#lt').value = cfg.token || '';
}

async function connect() {
  cfg = {
    owner: $('#lo').value.trim(),
    repo: $('#lr').value.trim(),
    branch: $('#lb').value.trim() || 'main',
    token: $('#lt').value.trim()
  };
  if (!cfg.owner || !cfg.repo || !cfg.token) { toast('أكملي كل الحقول'); return; }
  const b = $('#connect'); b.disabled = true; b.textContent = 'جاري الاتصال...';
  try {
    await loadData();
    try {
      localStorage.setItem('gh_cfg', JSON.stringify(cfg));
      localStorage.setItem('last_gh_cfg', JSON.stringify({ owner: cfg.owner, repo: cfg.repo, branch: cfg.branch }));
    } catch (e) {}
    $('#login').style.display = 'none'; $('#app').style.display = 'block'; $('#logout').style.display = '';
    render();
  } catch (e) {
    toast(e.status === 401 ? 'المفتاح غير صحيح أو منتهي' : e.status === 404 ? 'المستودع أو الفرع غير موجود، أو المفتاح لا يملك صلاحية عليه' : 'خطأ: ' + e.message);
  } finally { b.disabled = false; b.textContent = 'دخول'; }
}
$('#connect').onclick = connect;
$('#logout').onclick = () => {
  if (dirty && !confirm('توجد تغييرات غير محفوظة. تسجيل الخروج؟')) return;
  try {
    localStorage.setItem('last_gh_cfg', JSON.stringify({ owner: cfg.owner, repo: cfg.repo, branch: cfg.branch }));
    localStorage.removeItem('gh_cfg');
  } catch (e) {}
  location.reload();
};

/* ---------- views ---------- */
$('#tabs').querySelectorAll('button').forEach(b => b.onclick = () => { tab = b.dataset.t; render(); });

function render() {
  $('#tabs').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
  ({ products: viewProducts, categories: viewCategories, settings: viewSettings })[tab]();
}

const hasVar = p => Array.isArray(p.variants) && p.variants.length > 0;
const effectiveVarDisc = (p, v) => clampDisc(v.discount || p.discount || 0);
const isVarAvail = v => {
  const st = parseStock(v.stock);
  if (st !== null) return st > 0;
  return v.inStock !== false;
};
const isProdAvail = p => {
  if (hasVar(p)) return p.variants.some(isVarAvail);
  const st = parseStock(p.stock);
  if (st !== null) return st > 0;
  return p.inStock !== false;
};

const isProdLowStock = p => {
  if (!isProdAvail(p)) return false;
  if (hasVar(p)) {
    return p.variants.some(v => {
      const st = parseStock(v.stock);
      return isVarAvail(v) && st !== null && st > 0 && st <= 3;
    });
  }
  const st = parseStock(p.stock);
  return st !== null && st > 0 && st <= 3;
};

const stockBadge = p => {
  if (!isProdAvail(p)) return ' · <span style="color:#c92a2a;font-weight:700">غير متوفر</span>';
  if (hasVar(p)) {
    const tracked = p.variants.filter(v => parseStock(v.stock) !== null);
    if (tracked.length) {
      const sum = tracked.reduce((a, v) => a + (parseStock(v.stock) || 0), 0);
      const lowNote = isProdLowStock(p) ? ' <span style="color:#b45309;font-weight:700">(منخفض)</span>' : '';
      return ` · المتبقي: ${sum}${lowNote}`;
    }
    return '';
  }
  const st = parseStock(p.stock);
  if (st !== null) {
    const lowNote = isProdLowStock(p) ? ' <span style="color:#b45309;font-weight:700">(منخفض)</span>' : '';
    return ` · الكمية: ${st}${lowNote}`;
  }
  return '';
};

const minFinalPrice = p => {
  if (hasVar(p)) {
    const prices = p.variants.map(v => discPrice(v.price, effectiveVarDisc(p, v)));
    return prices.length ? Math.min(...prices) : 0;
  }
  return discPrice(p.price, clampDisc(p.discount || 0));
};

const totalStockValue = p => {
  if (hasVar(p)) {
    return p.variants.reduce((acc, v) => {
      const st = parseStock(v.stock);
      return acc + (st !== null ? st : 999999);
    }, 0);
  }
  const st = parseStock(p.stock);
  return st !== null ? st : 999999;
};

const priceText = p => {
  const cur = D.settings.currency || '';
  if (hasVar(p)) {
    const finals = p.variants.map(v => discPrice(v.price, effectiveVarDisc(p, v)));
    const anyDisc = p.variants.some(v => effectiveVarDisc(p, v) > 0);
    return `${p.variants.length} أنواع · من ${fmt(Math.min(...finals))} ${cur}${anyDisc ? ' (خصم)' : ''}${stockBadge(p)}`;
  }
  const d = clampDisc(p.discount || 0);
  if (d > 0) {
    return `${fmt(discPrice(p.price, d))} ${cur} (خصم ${d}%)${stockBadge(p)}`;
  }
  return `${fmt(p.price)} ${cur}${stockBadge(p)}`;
};

function matchesSearch(p, q) {
  const clean = (q || '').trim().toLowerCase();
  if (!clean) return true;
  const catName = D.categories.find(x => x.id === p.category)?.name || '';
  const varNames = hasVar(p) ? p.variants.map(v => v.name || '').join(' ') : '';
  const hay = `${p.name || ''} ${catName} ${varNames}`.toLowerCase();
  return hay.includes(clean);
}

function viewProducts(focusSearch = false) {
  const canReorder = sortMode === 'manual' && filterCat === 'all' && filterStock === 'all' && !searchQuery.trim();

  let list = D.products.filter(p => {
    const catOk = filterCat === 'all' || p.category === filterCat;
    if (!catOk) return false;
    if (filterStock === 'out') return !isProdAvail(p);
    if (filterStock === 'low') return isProdLowStock(p);
    if (!matchesSearch(p, searchQuery)) return false;
    return true;
  });

  if (sortMode === 'price_asc') {
    list = [...list].sort((a, b) => minFinalPrice(a) - minFinalPrice(b));
  } else if (sortMode === 'price_desc') {
    list = [...list].sort((a, b) => minFinalPrice(b) - minFinalPrice(a));
  } else if (sortMode === 'stock_asc') {
    list = [...list].sort((a, b) => totalStockValue(a) - totalStockValue(b));
  } else if (sortMode === 'newest') {
    list = [...list].reverse();
  }

  $('#view').innerHTML = `<div class="panel">
    <div class="row" style="justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px">
      <h2 style="margin:0">المنتجات (${list.length})</h2>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button type="button" class="btn sec sm" id="mergeBtn" style="background:#eef6ff;color:#1d4ed8;border:1px solid #bfdbfe">⇄ دمج منتجات</button>
        <button type="button" class="btn sec sm" id="backupBtn">نسخة احتياطية JSON</button>
        <button class="btn" id="addP">+ منتج جديد</button>
      </div>
    </div>

    <div class="row" style="gap:8px;margin-bottom:8px;align-items:center">
      <input type="search" id="fsearch" value="${esc(searchQuery)}" placeholder="🔍 ابحثي عن منتج أو نوع أو قسم..." style="flex:1;min-width:180px">
      ${searchQuery ? `<button type="button" class="btn sec sm" id="clearSearchBtn" title="مسح البحث">× مسح</button>` : ''}
    </div>

    <div class="row" style="gap:8px;flex-wrap:wrap">
      <select id="fcat" style="flex:1;min-width:140px"><option value="all">كل الأقسام</option>${D.categories.map(c =>
        `<option value="${esc(c.id)}" ${c.id === filterCat ? 'selected' : ''}>${esc(c.icon || '')} ${esc(c.name)}</option>`).join('')}</select>
      <select id="fstock" style="flex:1;min-width:140px">
        <option value="all" ${filterStock === 'all' ? 'selected' : ''}>كل حالات المخزون</option>
        <option value="low" ${filterStock === 'low' ? 'selected' : ''}>منخفضة الكمية (3 أو أقل)</option>
        <option value="out" ${filterStock === 'out' ? 'selected' : ''}>غير متوفرة</option>
      </select>
      <select id="fsort" style="flex:1;min-width:150px">
        <option value="manual" ${sortMode === 'manual' ? 'selected' : ''}>الترتيب: يدوي (ترتيب المتجر)</option>
        <option value="price_asc" ${sortMode === 'price_asc' ? 'selected' : ''}>السعر: من الأقل للأعلى</option>
        <option value="price_desc" ${sortMode === 'price_desc' ? 'selected' : ''}>السعر: من الأعلى للأقل</option>
        <option value="stock_asc" ${sortMode === 'stock_asc' ? 'selected' : ''}>الكمية: الأقل أولاً</option>
        <option value="newest" ${sortMode === 'newest' ? 'selected' : ''}>الأحدث أولاً</option>
      </select>
    </div>

    ${!canReorder ? `<div style="margin-top:8px;font-size:12px;color:#666">💡 لنقل المنتجات يدوياً (↑ / ↓ / للأعلى): اختاري «الترتيب: يدوي» وامسحي البحث والفلترة.</div>` : ''}

    <div class="list" style="margin-top:8px">${list.length ? list.map(p => {
      const realIdx = D.products.findIndex(x => x.id === p.id);
      const c = D.categories.find(x => x.id === p.category);
      const varImg = hasVar(p) ? p.variants.find(v => v.image)?.image : '';
      const imgSrc = p.image || varImg || '';
      const th = imgSrc ? `<img src="${esc(previews[imgSrc] || imgSrc)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block">` : (c?.icon || '🛍️');

      const moveControls = canReorder ? `
        <button type="button" class="btn sec sm" data-top="${esc(p.id)}" ${realIdx <= 0 ? 'disabled' : ''} title="نقل إلى أعلى القائمة">⏫</button>
        <button type="button" class="btn sec sm" data-up="${esc(p.id)}" ${realIdx <= 0 ? 'disabled' : ''} title="تحريك للأعلى">↑</button>
        <button type="button" class="btn sec sm" data-dn="${esc(p.id)}" ${realIdx >= D.products.length - 1 ? 'disabled' : ''} title="تحريك للأسفل">↓</button>
      ` : '';

      return `<div class="it"><div class="th" style="overflow:hidden">${th}</div>
        <div class="n">${esc(p.name)}<small>${esc(c?.name || 'بدون قسم')} · ${priceText(p)}</small></div>
        ${moveControls}
        <button class="btn sec sm" data-e="${esc(p.id)}">تعديل</button>
        <button class="btn danger sm" data-d="${esc(p.id)}">حذف</button></div>`;
    }).join('') : '<div class="empty">لا توجد منتجات مطابقة</div>'}</div></div>`;

  const searchInp = $('#fsearch');
  searchInp.oninput = e => {
    const pos = e.target.selectionStart;
    searchQuery = e.target.value;
    viewProducts(true);
    const nextInp = $('#fsearch');
    if (nextInp) {
      nextInp.focus();
      if (typeof pos === 'number') nextInp.setSelectionRange(pos, pos);
    }
  };
  if (focusSearch && searchInp) searchInp.focus();

  $('#clearSearchBtn')?.addEventListener('click', () => {
    searchQuery = '';
    viewProducts(true);
  });

  $('#fcat').onchange = e => { filterCat = e.target.value; viewProducts(); };
  $('#fstock').onchange = e => { filterStock = e.target.value; viewProducts(); };
  $('#fsort').onchange = e => { sortMode = e.target.value; viewProducts(); };
  $('#mergeBtn').onclick = openMergeProductsModal;
  $('#backupBtn').onclick = exportBackup;
  $('#addP').onclick = () => editProduct(null);

  $('#view').querySelectorAll('[data-top]').forEach(b => b.onclick = () => {
    const idx = D.products.findIndex(x => x.id === b.dataset.top);
    if (idx > 0) {
      const [item] = D.products.splice(idx, 1);
      D.products.unshift(item);
      setDirty(true);
      viewProducts();
    }
  });

  $('#view').querySelectorAll('[data-up]').forEach(b => b.onclick = () => {
    const idx = D.products.findIndex(x => x.id === b.dataset.up);
    if (idx > 0) {
      [D.products[idx - 1], D.products[idx]] = [D.products[idx], D.products[idx - 1]];
      setDirty(true);
      viewProducts();
    }
  });

  $('#view').querySelectorAll('[data-dn]').forEach(b => b.onclick = () => {
    const idx = D.products.findIndex(x => x.id === b.dataset.dn);
    if (idx >= 0 && idx < D.products.length - 1) {
      [D.products[idx + 1], D.products[idx]] = [D.products[idx], D.products[idx + 1]];
      setDirty(true);
      viewProducts();
    }
  });

  $('#view').querySelectorAll('[data-e]').forEach(b => b.onclick = () => editProduct(b.dataset.e));
  $('#view').querySelectorAll('[data-d]').forEach(b => b.onclick = () => {
    const p = D.products.find(x => x.id === b.dataset.d);
    if (!confirm(`حذف "${p.name}"؟`)) return;
    D.products = D.products.filter(x => x.id !== p.id); setDirty(true); viewProducts();
  });
}

/* ---------- merge products into one with variants ---------- */
function openMergeProductsModal() {
  if (D.products.length < 2) {
    toast('تحتاجين لمنتجين على الأقل للدمج');
    return;
  }
  const md = $('#md');
  md.style.maxWidth = '720px';
  md.style.width = '95vw';
  md.style.maxHeight = '90vh';
  md.style.padding = '22px';
  md.style.overflowY = 'auto';

  let mCat = filterCat !== 'all' ? filterCat : 'all';
  const selectedIds = new Set();

  const drawMerge = () => {
    const visibleProds = D.products.filter(p => mCat === 'all' || p.category === mCat);
    const firstSel = D.products.find(p => selectedIds.has(p.id));
    const defaultCat = firstSel ? firstSel.category : (D.categories[0]?.id || '');

    md.innerHTML = `<button class="x" id="mmx">×</button>
      <h2 style="margin-top:0;color:var(--pink);font-size:1.35rem">دمج منتجات في منتج واحد (بأنواع)</h2>
      <p style="margin:0 0 12px;font-size:13.5px;color:#555;line-height:1.6">
        حددي المنتجات التي تريدين جمعها كأنواع تحت منتج واحد (مثلاً: درجات حمرة أو أحجام عطر مختلفة). سيتم نقل أسعارها وكمياتها وصورها ومواصفاتها تلقائياً.
      </p>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:12px">
        <div>
          <label for="mName" style="font-size:13.5px">اسم المنتج المجمّع الجديد</label>
          <input type="text" id="mName" placeholder="مثال: أحمر شفاه ليدورا" style="width:100%;box-sizing:border-box;padding:10px;font-size:14.5px">
        </div>
        <div>
          <label for="mTargetCat" style="font-size:13.5px">قسم المنتج المجمّع</label>
          <select id="mTargetCat" style="width:100%;box-sizing:border-box;padding:10px;font-size:14.5px">${D.categories.map(c =>
            `<option value="${esc(c.id)}" ${c.id === defaultCat ? 'selected' : ''}>${esc(c.icon || '')} ${esc(c.name)}</option>`).join('')}</select>
        </div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px">
        <span style="font-size:13.5px;font-weight:700">اختاري المنتجات (${selectedIds.size} محدد):</span>
        <select id="mFilterCat" style="padding:6px 10px;font-size:13px">
          <option value="all">تصفية: كل الأقسام</option>
          ${D.categories.map(c => `<option value="${esc(c.id)}" ${c.id === mCat ? 'selected' : ''}>${esc(c.icon || '')} ${esc(c.name)}</option>`).join('')}
        </select>
      </div>

      <div style="border:1px solid rgba(0,0,0,.12);border-radius:12px;max-height:320px;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:6px;background:#fafafa">
        ${visibleProds.map(p => {
          const checked = selectedIds.has(p.id);
          const c = D.categories.find(x => x.id === p.category);
          const imgSrc = p.image || (hasVar(p) ? p.variants.find(v => v.image)?.image : '') || '';
          return `<label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;background:${checked ? '#fff0f5' : '#fff'};border:1px solid ${checked ? 'var(--pink)' : 'rgba(0,0,0,.08)'};cursor:pointer;margin:0">
            <input type="checkbox" data-mpid="${esc(p.id)}" ${checked ? 'checked' : ''}>
            ${imgSrc
              ? `<img src="${esc(previews[imgSrc] || imgSrc)}" alt="" style="width:36px;height:36px;border-radius:8px;object-fit:cover;flex-shrink:0">`
              : `<span style="width:36px;height:36px;border-radius:8px;background:#f3e8ee;display:flex;align-items:center;justify-content:center;flex-shrink:0">${esc(c?.icon || '🛍️')}</span>`}
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:14px">${esc(p.name)}</div>
              <div style="font-size:12px;color:#666">${esc(c?.name || '')} · ${priceText(p)}</div>
            </div>
          </label>`;
        }).join('')}
      </div>

      <div class="row" style="margin-top:16px">
        <button type="button" class="btn" id="mDoMerge" style="padding:10px 22px;font-size:14.5px">دمج المحدد (${selectedIds.size})</button>
        <button type="button" class="btn sec" id="mCancel" style="padding:10px 18px;font-size:14.5px">إلغاء</button>
      </div>`;

    md.querySelector('#mmx').onclick = md.querySelector('#mCancel').onclick = closeModal;
    md.querySelector('#mFilterCat').onchange = e => {
      const keepName = md.querySelector('#mName').value;
      mCat = e.target.value;
      drawMerge();
      md.querySelector('#mName').value = keepName;
    };
    md.querySelectorAll('[data-mpid]').forEach(chk => {
      chk.onchange = () => {
        const keepName = md.querySelector('#mName').value;
        const keepTargetCat = md.querySelector('#mTargetCat').value;
        if (chk.checked) selectedIds.add(chk.dataset.mpid);
        else selectedIds.delete(chk.dataset.mpid);
        drawMerge();
        md.querySelector('#mName').value = keepName;
        md.querySelector('#mTargetCat').value = keepTargetCat;
      };
    });

    md.querySelector('#mDoMerge').onclick = () => {
      if (selectedIds.size < 2) {
        toast('اختاري منتجين على الأقل للدمج');
        return;
      }
      const chosen = D.products.filter(p => selectedIds.has(p.id));
      const baseName = (md.querySelector('#mName').value || '').trim() || chosen[0].name;
      const targetCat = md.querySelector('#mTargetCat').value || chosen[0].category;

      const mergedVariants = [];
      const usedNames = new Set();
      const pushUniqueVariant = vObj => {
        let vName = (vObj.name || 'نوع').trim();
        let counter = 2;
        while (usedNames.has(vName)) {
          vName = `${vObj.name.trim()} (${counter++})`;
        }
        usedNames.add(vName);
        mergedVariants.push({ ...vObj, name: vName });
      };

      chosen.forEach(item => {
        if (hasVar(item)) {
          item.variants.forEach(v => {
            const st = parseStock(v.stock);
            pushUniqueVariant({
              name: v.name || item.name,
              price: +v.price || 0,
              discount: clampDisc(v.discount || item.discount || 0),
              stock: st,
              description: (v.description || '').trim() || (item.description || '').trim(),
              specs: (v.specs || '').trim() || (item.specs || '').trim(),
              usage: (v.usage || '').trim() || (item.usage || '').trim(),
              inStock: st !== null ? st > 0 : (v.inStock !== false),
              image: v.image || item.image || ''
            });
          });
        } else {
          const st = parseStock(item.stock);
          let cleanVarName = item.name.trim();
          if (cleanVarName.startsWith(baseName + ' - ')) {
            cleanVarName = cleanVarName.slice((baseName + ' - ').length).trim() || cleanVarName;
          }
          pushUniqueVariant({
            name: cleanVarName,
            price: +item.price || 0,
            discount: clampDisc(item.discount || 0),
            stock: st,
            description: (item.description || '').trim(),
            specs: (item.specs || '').trim(),
            usage: (item.usage || '').trim(),
            inStock: st !== null ? st > 0 : (item.inStock !== false),
            image: item.image || ''
          });
        }
      });

      const firstImg = chosen.find(x => x.image)?.image || mergedVariants.find(v => v.image)?.image || '';
      const mergedProduct = {
        id: uid('p'),
        name: baseName,
        category: targetCat,
        description: chosen[0].description || '',
        specs: chosen[0].specs || '',
        usage: chosen[0].usage || '',
        image: firstImg,
        price: 0,
        discount: 0,
        stock: null,
        inStock: mergedVariants.some(v => isVarAvail(v)),
        variants: mergedVariants
      };

      const firstIdx = D.products.findIndex(p => selectedIds.has(p.id));
      D.products = D.products.filter(p => !selectedIds.has(p.id));
      D.products.splice(Math.max(0, firstIdx), 0, mergedProduct);

      setDirty(true);
      closeModal();
      render();
      toast(`تم دمج ${chosen.length} منتجات في "${baseName}" ✓ — اضغطي "حفظ ونشر"`);
    };
  };

  drawMerge();
  $('#ov').classList.add('show');
}

function viewCategories() {
  $('#view').innerHTML = `<div class="panel"><h2>الأقسام (قائمة المتجر)</h2>
    <div class="list">${D.categories.length ? D.categories.map((c, i) => {
      const n = D.products.filter(p => p.category === c.id).length;
      return `<div class="it"><div class="th">${esc(c.icon || '📁')}</div>
        <div class="n">${esc(c.name)}<small>${n} منتج</small></div>
        <button class="btn sec sm" data-u="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="btn sec sm" data-w="${i}" ${i === D.categories.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="btn sec sm" data-r="${i}">تعديل</button>
        <button class="btn danger sm" data-x="${i}">حذف</button></div>`;
    }).join('') : '<div class="empty">لا توجد أقسام</div>'}</div>
    <div class="row" style="margin-top:14px">
      <input type="text" id="cn" placeholder="اسم القسم الجديد" style="flex:2;min-width:140px">
      <input type="text" id="ci" placeholder="أيقونة 🧴" style="flex:1;min-width:70px" maxlength="4">
      <button class="btn" id="addC">إضافة</button>
    </div></div>`;
  $('#addC').onclick = () => {
    const name = $('#cn').value.trim(); if (!name) { toast('اكتبي اسم القسم'); return; }
    D.categories.push({ id: uid('c'), name, icon: $('#ci').value.trim() });
    setDirty(true); viewCategories();
  };
  const v = $('#view');
  v.querySelectorAll('[data-u]').forEach(b => b.onclick = () => { const i = +b.dataset.u; [D.categories[i - 1], D.categories[i]] = [D.categories[i], D.categories[i - 1]]; setDirty(true); viewCategories(); });
  v.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { const i = +b.dataset.w; [D.categories[i + 1], D.categories[i]] = [D.categories[i], D.categories[i + 1]]; setDirty(true); viewCategories(); });
  v.querySelectorAll('[data-r]').forEach(b => b.onclick = () => {
    const c = D.categories[+b.dataset.r];
    const name = prompt('اسم القسم:', c.name); if (name === null) return;
    const icon = prompt('الأيقونة (إيموجي):', c.icon || ''); if (icon === null) return;
    if (name.trim()) c.name = name.trim(); c.icon = icon.trim(); setDirty(true); viewCategories();
  });
  v.querySelectorAll('[data-x]').forEach(b => b.onclick = () => {
    const c = D.categories[+b.dataset.x];
    if (D.products.some(p => p.category === c.id)) { toast('انقلي منتجات هذا القسم أو احذفيها أولاً'); return; }
    if (!confirm(`حذف قسم "${c.name}"؟`)) return;
    D.categories.splice(+b.dataset.x, 1); setDirty(true); viewCategories();
  });
}

function viewSettings() {
  const s = D.settings;
  $('#view').innerHTML = `<div class="panel"><h2>إعدادات المتجر</h2>
    <label>اسم المتجر</label><input type="text" id="sn" value="${esc(s.name)}">
    <label>العملة (تظهر بجانب السعر)</label><input type="text" id="sc" value="${esc(s.currency)}">
    <label>رقم واتساب لاستقبال الطلبات (بصيغة دولية بدون +، مثال: 9647701234567)</label><input type="text" id="sw" value="${esc(s.whatsapp)}">
    <div class="row" style="margin-top:14px"><button class="btn" id="ss">تطبيق</button></div></div>`;
  $('#ss').onclick = () => {
    D.settings = { name: $('#sn').value.trim() || 'المتجر', currency: $('#sc').value.trim(), whatsapp: $('#sw').value.trim() };
    setDirty(true); toast('تم التطبيق — اضغطي "حفظ ونشر" لنشره');
  };
}

/* ---------- product editor ---------- */
function closeModal() { $('#ov').classList.remove('show'); }
$('#ov').onclick = e => { if (e.target.id === 'ov') closeModal(); };

function editProduct(id) {
  if (!D.categories.length) { toast('أضيفي قسماً أولاً من تبويب الأقسام'); return; }
  const isNew = !id;
  const p = isNew
    ? { id: uid('p'), name: '', category: D.categories[0].id, description: '', specs: '', usage: '', image: '', price: 0, discount: 0, stock: null, inStock: true, variants: [] }
    : JSON.parse(JSON.stringify(D.products.find(x => x.id === id)));
  p.specs = p.specs || '';
  p.usage = p.usage || '';
  p.discount = clampDisc(p.discount || 0);
  p.stock = parseStock(p.stock);
  p.inStock = p.stock !== null ? p.stock > 0 : (p.inStock !== false);
  p.variants = (p.variants || []).map(v => {
    const st = parseStock(v.stock);
    return {
      ...v,
      image: v.image || '',
      description: v.description || '',
      specs: v.specs || '',
      usage: v.usage || '',
      discount: clampDisc(v.discount || 0),
      stock: st,
      inStock: st !== null ? st > 0 : (v.inStock !== false)
    };
  });

  const md = $('#md');
  md.style.maxWidth = '960px';
  md.style.width = '96vw';
  md.style.maxHeight = '92vh';
  md.style.padding = '0';
  md.style.overflow = 'hidden';
  md.style.display = 'flex';
  md.style.flexDirection = 'column';
  md.style.position = 'relative';

  const getMainStockEl = () => md.querySelector('#fstock');
  const getMainInStockEl = () => md.querySelector('#finstock');

  const sync = () => {
    const nameEl = md.querySelector('#fn');
    if (!nameEl) return;
    p.name = nameEl.value;
    p.category = md.querySelector('#fc').value;
    p.description = md.querySelector('#fd').value;
    p.specs = md.querySelector('#fsp').value;
    p.usage = md.querySelector('#fus').value;
    if (md.querySelector('#fimg')) p.image = md.querySelector('#fimg').value.trim();
    if (md.querySelector('#fp')) p.price = +md.querySelector('#fp').value || 0;
    if (md.querySelector('#fdisc')) p.discount = clampDisc(md.querySelector('#fdisc').value || 0);

    const stEl = getMainStockEl();
    const inEl = getMainInStockEl();
    if (stEl) {
      p.stock = parseStock(stEl.value);
      if (p.stock !== null) {
        p.inStock = p.stock > 0;
      } else if (inEl) {
        p.inStock = inEl.checked;
      }
    }

    md.querySelectorAll('[data-vn]').forEach(i => { if (p.variants[+i.dataset.vn]) p.variants[+i.dataset.vn].name = i.value; });
    md.querySelectorAll('[data-vp]').forEach(i => { if (p.variants[+i.dataset.vp]) p.variants[+i.dataset.vp].price = +i.value || 0; });
    md.querySelectorAll('[data-vd]').forEach(i => { if (p.variants[+i.dataset.vd]) p.variants[+i.dataset.vd].discount = clampDisc(i.value || 0); });
    md.querySelectorAll('[data-vimg]').forEach(i => { if (p.variants[+i.dataset.vimg]) p.variants[+i.dataset.vimg].image = i.value.trim(); });
    md.querySelectorAll('[data-vst]').forEach(i => {
      const v = p.variants[+i.dataset.vst];
      if (v) {
        const st = parseStock(i.value);
        v.stock = st;
        v.inStock = st !== null ? st > 0 : true;
      }
    });
    md.querySelectorAll('[data-vdsc]').forEach(i => { if (p.variants[+i.dataset.vdsc]) p.variants[+i.dataset.vdsc].description = i.value; });
    md.querySelectorAll('[data-vsp]').forEach(i => { if (p.variants[+i.dataset.vsp]) p.variants[+i.dataset.vsp].specs = i.value; });
    md.querySelectorAll('[data-vus]').forEach(i => { if (p.variants[+i.dataset.vus]) p.variants[+i.dataset.vus].usage = i.value; });
    md.querySelectorAll('[data-vs]').forEach(i => {
      const v = p.variants[+i.dataset.vs];
      if (v && v.stock === null) {
        v.inStock = i.checked;
      }
    });
  };

  const buildStandaloneFromVariant = (v, idx = 0, includeBaseName = false) => {
    const st = parseStock(v.stock);
    const baseTitle = (p.name || '').trim();
    const varTitle = (v.name || '').trim() || `منتج ${idx + 1}`;
    const finalName = (includeBaseName && baseTitle && !varTitle.includes(baseTitle))
      ? `${baseTitle} - ${varTitle}`
      : varTitle;
    return {
      id: uid('p' + idx),
      name: finalName,
      category: p.category,
      description: (v.description || '').trim() || (p.description || '').trim(),
      specs: (v.specs || '').trim() || (p.specs || '').trim(),
      usage: (v.usage || '').trim() || (p.usage || '').trim(),
      image: v.image || p.image || '',
      price: +v.price || 0,
      discount: clampDisc(v.discount || p.discount || 0),
      stock: st,
      inStock: st !== null ? st > 0 : (v.inStock !== false),
      variants: []
    };
  };

  const splitSingleVariant = idx => {
    sync();
    const v = p.variants[idx];
    if (!v) return;
    const varTitle = (v.name || '').trim();
    if (!varTitle) { toast('اكتبي اسم النوع أولاً قبل فصله'); return; }
    const includeBase = confirm(
      `فصل النوع "${varTitle}" إلى منتج مستقل؟\n\n` +
      `• موافق = يصبح اسمه: "${(p.name || '').trim()} - ${varTitle}"\n` +
      `• إلغاء = يصبح اسمه: "${varTitle}" فقط`
    );
    const standalone = buildStandaloneFromVariant(v, idx, includeBase);
    p.variants.splice(idx, 1);

    if (p.variants.length > 0) {
      p.price = 0;
      p.inStock = p.variants.some(item => isVarAvail(item));
    }

    const savedParent = JSON.parse(JSON.stringify(p));
    const parentIdx = D.products.findIndex(x => x.id === savedParent.id);
    if (parentIdx >= 0) {
      D.products[parentIdx] = savedParent;
      D.products.splice(parentIdx + 1, 0, standalone);
    } else {
      D.products.push(savedParent, standalone);
    }

    setDirty(true);
    draw();
    toast(`تم فصل "${standalone.name}" كمنتج مستقل ✓`);
  };

  const splitVariantsToProducts = () => {
    sync();
    const validVars = p.variants.filter(v => (v.name || '').trim());
    if (!validVars.length) { toast('لا توجد أنواع صالحة للفصل'); return; }
    const includeBaseName = confirm(
      `سيتم تحويل (${validVars.length}) أنواع إلى منتجات مستقلة منفصلة.\n\n` +
      `هل تريدين دمج اسم المنتج الأساسي "${p.name.trim()}" مع اسم كل نوع؟\n` +
      `• موافق = الاسم يصبح: (اسم المنتج - اسم النوع)\n` +
      `• إلغاء = استخدام اسم النوع فقط كاسم للمنتج المستقل`
    );

    const newProducts = validVars.map((v, idx) => buildStandaloneFromVariant(v, idx, includeBaseName));

    const existingIdx = D.products.findIndex(x => x.id === p.id);
    if (existingIdx >= 0) {
      D.products.splice(existingIdx, 1, ...newProducts);
    } else {
      D.products.push(...newProducts);
    }

    setDirty(true);
    closeModal();
    render();
    toast(`تم فصل ${newProducts.length} منتجات مستقلة ✓ — اضغطي "حفظ ونشر"`);
  };

  const thumbBox = (src, fallback, size = 56) => {
    const resolved = src ? (previews[src] || src) : '';
    return resolved
      ? `<div style="width:${size}px;height:${size}px;border-radius:10px;overflow:hidden;flex-shrink:0;border:1px solid rgba(0,0,0,.1);background:#fff;display:flex;align-items:center;justify-content:center">
           <img src="${esc(resolved)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block">
         </div>`
      : `<div style="width:${size}px;height:${size}px;border-radius:10px;flex-shrink:0;border:1px dashed rgba(0,0,0,.2);background:#fdf2f8;display:flex;align-items:center;justify-content:center;font-size:20px">${esc(fallback || '🖼️')}</div>`;
  };

  const draw = () => {
    const hasVariants = p.variants.length > 0;
    const catIcon = D.categories.find(c => c.id === p.category)?.icon || '🛍️';
    const prevScroll = md.querySelector('#epBody')?.scrollTop || 0;

    md.innerHTML = `
      <div style="position:relative;padding:18px 22px 12px;border-bottom:1px solid #f3d1e4;background:#fff;flex-shrink:0">
        <button class="x" id="emx">×</button>
        <h2 style="margin:0;color:var(--pink);font-size:1.35rem">${isNew ? 'إضافة منتج جديد' : 'تعديل المنتج'}</h2>
      </div>

      <div id="epBody" style="flex:1;overflow-y:auto;padding:18px 22px">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
          <div>
            <label for="fn">اسم المنتج</label>
            <input type="text" id="fn" value="${esc(p.name)}" placeholder="اسم المنتج" style="width:100%;box-sizing:border-box">
          </div>
          <div>
            <label for="fc">القسم</label>
            <select id="fc" style="width:100%;box-sizing:border-box">${D.categories.map(c =>
              `<option value="${esc(c.id)}" ${c.id === p.category ? 'selected' : ''}>${esc(c.icon || '')} ${esc(c.name)}</option>`).join('')}</select>
          </div>
        </div>

        <div style="margin-top:12px;padding:12px;border-radius:12px;background:#fff8fb;border:1px solid #f5d0fe">
          <label style="margin-top:0">صورة المنتج الرئيسية</label>
          <div class="row" style="gap:10px;align-items:center;flex-wrap:wrap">
            ${thumbBox(p.image, catIcon, 64)}
            <div style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:6px">
              <div class="row" style="gap:8px;flex-wrap:wrap">
                <input type="file" id="fimgFile" accept="image/*" style="display:none">
                <button type="button" class="btn sec sm" id="fimgPick">📁 رفع صورة من الجهاز</button>
                ${p.image ? `<button type="button" class="btn danger sm" id="fimgClear">إزالة الصورة</button>` : ''}
              </div>
              <input type="text" id="fimg" value="${esc(p.image)}" placeholder="images/... أو رابط صورة مباشر" style="width:100%;box-sizing:border-box">
            </div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-top:12px;opacity:${hasVariants ? '0.6' : '1'}">
          <div>
            <label for="fp">السعر الأساسي ${hasVariants ? '(يُحسب من الأنواع)' : ''}</label>
            <input type="number" id="fp" value="${esc(p.price)}" ${hasVariants ? 'disabled' : ''} style="width:100%;box-sizing:border-box">
          </div>
          <div>
            <label for="fdisc">نسبة الخصم %</label>
            <input type="number" id="fdisc" min="0" max="99" value="${esc(p.discount)}" style="width:100%;box-sizing:border-box">
          </div>
          <div>
            <label for="fstock">الكمية (فارغ = غير محدود)</label>
            <input type="number" id="fstock" min="0" value="${p.stock ?? ''}" ${hasVariants ? 'disabled' : ''} placeholder="غير محدود" style="width:100%;box-sizing:border-box">
          </div>
        </div>

        ${!hasVariants ? `<label style="display:inline-flex;align-items:center;gap:8px;margin-top:10px;cursor:pointer">
          <input type="checkbox" id="finstock" ${p.inStock ? 'checked' : ''} ${p.stock !== null ? 'disabled' : ''}>
          متوفر للبيع ${p.stock !== null ? '(يُحدد تلقائياً من الكمية)' : ''}
        </label>` : ''}

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin-top:12px">
          <div>
            <label for="fd">الوصف</label>
            <textarea id="fd" rows="3" style="width:100%;box-sizing:border-box">${esc(p.description)}</textarea>
          </div>
          <div>
            <label for="fsp">المواصفات</label>
            <textarea id="fsp" rows="3" style="width:100%;box-sizing:border-box">${esc(p.specs)}</textarea>
          </div>
          <div>
            <label for="fus">طريقة الاستخدام</label>
            <textarea id="fus" rows="3" style="width:100%;box-sizing:border-box">${esc(p.usage)}</textarea>
          </div>
        </div>

        <div style="margin-top:18px;padding-top:14px;border-top:2px solid #fce7f3">
          <div class="row" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px">
            <div>
              <strong style="font-size:1.05rem;color:var(--pink)">أنواع المنتج (${p.variants.length})</strong>
              <div style="font-size:12.5px;color:#666">أضيفي درجات الألوان أو الأحجام أو الأنواع المختلفة مع صورة وسعر وكمية لكل نوع</div>
            </div>
            <div class="row" style="gap:8px;flex-wrap:wrap">
              ${p.variants.length > 0 ? `<button type="button" class="btn sec sm" id="splitAllBtn" style="background:#eef6ff;color:#1d4ed8;border:1px solid #bfdbfe">↗ فصل الكل لمنتجات مستقلة</button>` : ''}
              <button type="button" class="btn sm" id="addVarBtn">+ إضافة نوع جديد</button>
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:12px">
            ${p.variants.length ? p.variants.map((v, i) => `
              <div style="border:1px solid #f3d1e4;background:#fffafd;border-radius:14px;padding:12px">
                <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:6px">
                  <strong style="color:var(--pink);font-size:14px">النوع #${i + 1}${v.name ? ': ' + esc(v.name) : ''}</strong>
                  <div class="row" style="gap:6px">
                    <button type="button" class="btn sec sm" data-vsplit="${i}" title="تحويل هذا النوع إلى منتج مستقل">↗ فصل كمنتج</button>
                    <button type="button" class="btn danger sm" data-vdel="${i}">حذف</button>
                  </div>
                </div>

                <div class="row" style="gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
                  ${thumbBox(v.image || p.image, '🎨', 56)}
                  <div style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:6px">
                    <div class="row" style="gap:6px;flex-wrap:wrap">
                      <input type="file" accept="image/*" data-vfile="${i}" style="display:none">
                      <button type="button" class="btn sec sm" data-vpick="${i}">📁 رفع صورة النوع</button>
                      ${v.image ? `<button type="button" class="btn danger sm" data-vclearimg="${i}">إزالة الصورة</button>` : ''}
                    </div>
                    <input type="text" data-vimg="${i}" value="${esc(v.image || '')}" placeholder="صورة النوع (اتركيه فارغاً لاستخدام الصورة الرئيسية)" style="width:100%;box-sizing:border-box;font-size:13px">
                  </div>
                </div>

                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px">
                  <div>
                    <label style="font-size:12px">اسم النوع *</label>
                    <input type="text" data-vn="${i}" value="${esc(v.name)}" placeholder="مثال: 01 وردي / 500 مل" style="width:100%;box-sizing:border-box">
                  </div>
                  <div>
                    <label style="font-size:12px">سعر النوع *</label>
                    <input type="number" data-vp="${i}" value="${esc(v.price)}" style="width:100%;box-sizing:border-box">
                  </div>
                  <div>
                    <label style="font-size:12px">خصم النوع %</label>
                    <input type="number" data-vd="${i}" min="0" max="99" value="${esc(v.discount || 0)}" style="width:100%;box-sizing:border-box">
                  </div>
                  <div>
                    <label style="font-size:12px">الكمية (فارغ = مفتوح)</label>
                    <input type="number" data-vst="${i}" min="0" value="${v.stock ?? ''}" placeholder="غير محدود" style="width:100%;box-sizing:border-box">
                  </div>
                </div>

                <label style="display:inline-flex;align-items:center;gap:6px;margin-top:8px;font-size:13px;cursor:pointer">
                  <input type="checkbox" data-vs="${i}" ${v.inStock !== false ? 'checked' : ''} ${v.stock !== null ? 'disabled' : ''}>
                  متوفر للبيع ${v.stock !== null ? '(حسب الكمية)' : ''}
                </label>

                <details style="margin-top:8px">
                  <summary style="cursor:pointer;font-size:12.5px;color:#666;font-weight:600">تفاصيل إضافية خاصة بهذا النوع (اختياري)</summary>
                  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;margin-top:8px">
                    <div>
                      <label style="font-size:12px">وصف النوع</label>
                      <textarea data-vdsc="${i}" rows="2" style="width:100%;box-sizing:border-box">${esc(v.description || '')}</textarea>
                    </div>
                    <div>
                      <label style="font-size:12px">مواصفات النوع</label>
                      <textarea data-vsp="${i}" rows="2" style="width:100%;box-sizing:border-box">${esc(v.specs || '')}</textarea>
                    </div>
                    <div>
                      <label style="font-size:12px">طريقة استخدام النوع</label>
                      <textarea data-vus="${i}" rows="2" style="width:100%;box-sizing:border-box">${esc(v.usage || '')}</textarea>
                    </div>
                  </div>
                </details>
              </div>
            `).join('') : '<div class="empty" style="padding:14px">لا توجد أنواع مضافة — المنتج يُباع كقطعة واحدة بالسعر الأساسي أعلاه</div>'}
          </div>
        </div>
      </div>

      <div id="epFooter" style="position:sticky;bottom:0;z-index:5;padding:12px 22px;border-top:1px solid #f3d1e4;background:#fff;display:flex;justify-content:flex-end;gap:10px;flex-shrink:0">
        <button type="button" class="btn sec" id="ecancel">إلغاء</button>
        <button type="button" class="btn" id="esave">تأكيد</button>
      </div>
    `;

    const bodyEl = md.querySelector('#epBody');
    if (bodyEl && prevScroll > 0) bodyEl.scrollTop = prevScroll;

    md.querySelector('#emx').onclick = md.querySelector('#ecancel').onclick = closeModal;

    md.querySelector('#fimgPick').onclick = () => md.querySelector('#fimgFile').click();
    md.querySelector('#fimgFile').onchange = async e => {
      const file = e.target.files?.[0];
      if (!file) return;
      sync();
      const btn = md.querySelector('#fimgPick');
      btn.disabled = true; btn.textContent = 'جاري الرفع...';
      try {
        p.image = await uploadImage(file);
        toast('تم رفع صورة المنتج ✓');
        draw();
      } catch (err) {
        toast('فشل رفع الصورة: ' + err.message);
      } finally {
        btn.disabled = false; btn.textContent = '📁 رفع صورة من الجهاز';
      }
    };
    md.querySelector('#fimgClear')?.addEventListener('click', () => {
      sync();
      p.image = '';
      draw();
    });
    md.querySelector('#fimg').onchange = () => { sync(); draw(); };

    const stMain = getMainStockEl();
    if (stMain) {
      stMain.oninput = () => {
        const val = parseStock(stMain.value);
        const chk = getMainInStockEl();
        if (chk) {
          chk.disabled = val !== null;
          if (val !== null) chk.checked = val > 0;
        }
      };
    }

    md.querySelector('#addVarBtn').onclick = () => {
      sync();
      p.variants.push({
        name: '',
        price: p.price || 0,
        discount: p.discount || 0,
        stock: null,
        inStock: true,
        image: '',
        description: '',
        specs: '',
        usage: ''
      });
      draw();
    };

    md.querySelector('#splitAllBtn')?.addEventListener('click', splitVariantsToProducts);

    md.querySelectorAll('[data-vdel]').forEach(b => b.onclick = () => {
      sync();
      p.variants.splice(+b.dataset.vdel, 1);
      draw();
    });

    md.querySelectorAll('[data-vsplit]').forEach(b => b.onclick = () => splitSingleVariant(+b.dataset.vsplit));

    md.querySelectorAll('[data-vpick]').forEach(b => b.onclick = () => {
      md.querySelector(`[data-vfile="${b.dataset.vpick}"]`)?.click();
    });

    md.querySelectorAll('[data-vfile]').forEach(inp => inp.onchange = async e => {
      const file = e.target.files?.[0];
      if (!file) return;
      const idx = +inp.dataset.vfile;
      sync();
      const btn = md.querySelector(`[data-vpick="${idx}"]`);
      if (btn) { btn.disabled = true; btn.textContent = 'جاري الرفع...'; }
      try {
        p.variants[idx].image = await uploadImage(file);
        toast('تم رفع صورة النوع ✓');
        draw();
      } catch (err) {
        toast('فشل رفع الصورة: ' + err.message);
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = '📁 رفع صورة النوع'; }
      }
    });

    md.querySelectorAll('[data-vclearimg]').forEach(b => b.onclick = () => {
      sync();
      p.variants[+b.dataset.vclearimg].image = '';
      draw();
    });

    md.querySelectorAll('[data-vimg]').forEach(inp => inp.onchange = () => { sync(); draw(); });

    md.querySelectorAll('[data-vst]').forEach(inp => inp.oninput = () => {
      const idx = +inp.dataset.vst;
      const val = parseStock(inp.value);
      const chk = md.querySelector(`[data-vs="${idx}"]`);
      if (chk) {
        chk.disabled = val !== null;
        if (val !== null) chk.checked = val > 0;
      }
    });
})();
    md.querySelector('#esave').onclick = () => {
      sync();
      if (!p.name.trim()) { toast('اكتبي اسم المنتج'); return; }
      p.name = p.name.trim();
      p.variants = p.variants
        .map(v => {
          const st = parseStock(v.stock);
          return {
            ...v,
            name: (v.name || '').trim(),
            price: +v.price || 0,
            discount: clampDisc(v.discount || 0),
            stock: st,
            inStock: st !== null ? st > 0 : (v.inStock !== false),
            image: (v.image || '').trim(),
            description: (v.description || '').trim(),
            specs: (v.specs || '').trim(),
            usage: (v.usage || '').trim()
          };
        })
        .filter(v => v.name);

      if (p.variants.length > 0) {
        p.price = 0;
        p.stock = null;
        p.inStock = p.variants.some(v => isVarAvail(v));
      } else {
        p.stock = parseStock(p.stock);
        p.inStock = p.stock !== null ? p.stock > 0 : (p.inStock !== false);
      }

      if (isNew) D.products.unshift(p);
      else {
        const i = D.products.findIndex(x => x.id === p.id);
        if (i >= 0) D.products[i] = p;
      }
      setDirty(true);
      closeModal();
      render();
      toast('تم التحديث ✓ — اضغطي "حفظ ونشر"');
    };
  };

  draw();
  $('#ov').classList.add('show');
}

/* ---------- init ---------- */
guess();
fillLogin();
if (cfg.owner && cfg.repo && cfg.token) {
  connect();
}
