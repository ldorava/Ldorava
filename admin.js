const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => Number(n || 0).toLocaleString('en-US');
const enc = s => btoa(unescape(encodeURIComponent(s)));
const dec = b => decodeURIComponent(escape(atob(b.replace(/\n/g, ''))));
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

let cfg = {};
try { cfg = JSON.parse(localStorage.getItem('gh_cfg') || '{}'); } catch (e) {}
let D = { settings: { name: 'المتجر', currency: '', whatsapp: '' }, categories: [], products: [] };
let sha = null, dirty = false, tab = 'products', filterCat = 'all';
const previews = {}; // مسار الصورة -> رابط معاينة محلي لحين نشر الموقع

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

async function saveData() {
  const btn = $('#save'); btn.disabled = true; btn.textContent = 'جاري الحفظ...';
  try {
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
  const h = location.hostname;
  if (h.endsWith('.github.io')) {
    cfg.owner = cfg.owner || h.split('.')[0];
    const seg = location.pathname.split('/')[1];
    cfg.repo = cfg.repo || (seg && !seg.includes('.') ? seg : h);
  }
  cfg.branch = cfg.branch || 'main';
}
function fillLogin() { $('#lo').value = cfg.owner || ''; $('#lr').value = cfg.repo || ''; $('#lb').value = cfg.branch || 'main'; $('#lt').value = cfg.token || ''; }

async function connect() {
  cfg = { owner: $('#lo').value.trim(), repo: $('#lr').value.trim(), branch: $('#lb').value.trim() || 'main', token: $('#lt').value.trim() };
  if (!cfg.owner || !cfg.repo || !cfg.token) { toast('أكملي كل الحقول'); return; }
  const b = $('#connect'); b.disabled = true; b.textContent = 'جاري الاتصال...';
  try {
    await loadData();
    try { localStorage.setItem('gh_cfg', JSON.stringify(cfg)); } catch (e) {}
    $('#login').style.display = 'none'; $('#app').style.display = 'block'; $('#logout').style.display = '';
    render();
  } catch (e) {
    toast(e.status === 401 ? 'المفتاح غير صحيح أو منتهي' : e.status === 404 ? 'المستودع أو الفرع غير موجود، أو المفتاح لا يملك صلاحية عليه' : 'خطأ: ' + e.message);
  } finally { b.disabled = false; b.textContent = 'دخول'; }
}
$('#connect').onclick = connect;
$('#logout').onclick = () => {
  if (dirty && !confirm('توجد تغييرات غير محفوظة. تسجيل الخروج؟')) return;
  try { localStorage.removeItem('gh_cfg'); } catch (e) {}
  location.reload();
};

/* ---------- views ---------- */
$('#tabs').querySelectorAll('button').forEach(b => b.onclick = () => { tab = b.dataset.t; render(); });

function render() {
  $('#tabs').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
  ({ products: viewProducts, categories: viewCategories, settings: viewSettings })[tab]();
}

const hasVar = p => Array.isArray(p.variants) && p.variants.length > 0;
const priceText = p => hasVar(p)
  ? `${p.variants.length} أنواع · من ${fmt(Math.min(...p.variants.map(v => +v.price || 0)))}`
  : fmt(p.price);

function viewProducts() {
  const list = D.products.filter(p => filterCat === 'all' || p.category === filterCat);
  $('#view').innerHTML = `<div class="panel">
    <div class="row" style="justify-content:space-between;margin-bottom:8px">
      <h2 style="margin:0">المنتجات (${list.length})</h2>
      <button class="btn" id="addP">+ منتج جديد</button>
    </div>
    <select id="fcat"><option value="all">كل الأقسام</option>${D.categories.map(c =>
      `<option value="${esc(c.id)}" ${c.id === filterCat ? 'selected' : ''}>${esc(c.icon || '')} ${esc(c.name)}</option>`).join('')}</select>
    <div class="list" style="margin-top:8px">${list.length ? list.map(p => {
      const c = D.categories.find(x => x.id === p.category);
      const th = p.image ? `<img src="${esc(previews[p.image] || p.image)}" alt="">` : (c?.icon || '🛍️');
      return `<div class="it"><div class="th">${th}</div>
        <div class="n">${esc(p.name)}<small>${esc(c?.name || 'بدون قسم')} · ${priceText(p)} ${esc(D.settings.currency || '')}</small></div>
        <button class="btn sec sm" data-e="${esc(p.id)}">تعديل</button>
        <button class="btn danger sm" data-d="${esc(p.id)}">حذف</button></div>`;
    }).join('') : '<div class="empty">لا توجد منتجات</div>'}</div></div>`;
  $('#fcat').onchange = e => { filterCat = e.target.value; viewProducts(); };
  $('#addP').onclick = () => editProduct(null);
  $('#view').querySelectorAll('[data-e]').forEach(b => b.onclick = () => editProduct(b.dataset.e));
  $('#view').querySelectorAll('[data-d]').forEach(b => b.onclick = () => {
    const p = D.products.find(x => x.id === b.dataset.d);
    if (!confirm(`حذف "${p.name}"؟`)) return;
    D.products = D.products.filter(x => x.id !== p.id); setDirty(true); viewProducts();
  });
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
    ? { id: uid('p'), name: '', category: D.categories[0].id, description: '', image: '', price: 0, variants: [] }
    : JSON.parse(JSON.stringify(D.products.find(x => x.id === id)));
  p.variants = p.variants || [];

  const sync = () => {
    if (!$('#fn')) return;
    p.name = $('#fn').value; p.category = $('#fc').value; p.description = $('#fd').value; p.price = +$('#fp').value || 0;
    $('#md').querySelectorAll('[data-vn]').forEach(i => p.variants[+i.dataset.vn].name = i.value);
    $('#md').querySelectorAll('[data-vp]').forEach(i => p.variants[+i.dataset.vp].price = +i.value || 0);
    $('#md').querySelectorAll('[data-vs]').forEach(i => p.variants[+i.dataset.vs].inStock = i.checked);
  };

  const draw = () => {
    const th = p.image ? `<img src="${esc(previews[p.image] || p.image)}" alt="">` : '🛍️';
    $('#md').innerHTML = `<button class="x" id="mx">×</button>
      <h2 style="margin-top:0;color:var(--pink)">${isNew ? 'منتج جديد' : 'تعديل المنتج'}</h2>
      <label>اسم المنتج</label><input type="text" id="fn" value="${esc(p.name)}" placeholder="مثال: شامبو">
      <label>القسم</label><select id="fc">${D.categories.map(c =>
        `<option value="${esc(c.id)}" ${c.id === p.category ? 'selected' : ''}>${esc(c.icon || '')} ${esc(c.name)}</option>`).join('')}</select>
      <label>الوصف</label><textarea id="fd">${esc(p.description)}</textarea>
      <label>الصورة</label>
      <div class="row"><div class="list"><div class="it" style="border:0;padding:0"><div class="th" style="width:64px;height:64px">${th}</div></div></div>
        <input type="file" id="ff" accept="image/*" style="flex:1;min-width:150px">
        ${p.image ? '<button class="btn danger sm" id="fr">إزالة</button>' : ''}</div>
      <label>السعر (يُستخدم إذا لم تكن هناك أنواع)</label><input type="number" id="fp" min="0" value="${p.price || 0}">
      <label>الأنواع (اختياري — مثل: شامبو للشعر الدهني / الجاف / ضد القشرة، لكل نوع سعره)</label>
      <div id="vs">${p.variants.map((v, i) => `<div class="vrow">
        <input type="text" data-vn="${i}" value="${esc(v.name)}" placeholder="اسم النوع">
        <input type="number" data-vp="${i}" min="0" value="${v.price || 0}" placeholder="السعر">
        <label style="margin:0;white-space:nowrap"><input type="checkbox" data-vs="${i}" ${v.inStock !== false ? 'checked' : ''}> متوفر</label>
        <button class="btn danger sm" data-vd="${i}">×</button></div>`).join('')}</div>
      <button class="btn sec sm" id="va">+ إضافة نوع</button>
      <div class="row" style="margin-top:18px"><button class="btn" id="fs">موافق</button><button class="btn sec" id="fcn">إلغاء</button></div>`;

    $('#mx').onclick = $('#fcn').onclick = closeModal;
    $('#va').onclick = () => { sync(); p.variants.push({ name: '', price: p.price || 0, inStock: true }); draw(); };
    $('#md').querySelectorAll('[data-vd]').forEach(b => b.onclick = () => { sync(); p.variants.splice(+b.dataset.vd, 1); draw(); });
    if ($('#fr')) $('#fr').onclick = () => { sync(); p.image = ''; draw(); };
    $('#ff').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      sync(); toast('جاري رفع الصورة...');
      try { p.image = await uploadImage(f); toast('تم رفع الصورة ✓'); }
      catch (err) { toast('فشل رفع الصورة: ' + err.message); }
      draw();
    };
    $('#fs').onclick = () => {
      sync();
      p.name = p.name.trim();
      if (!p.name) { toast('اكتبي اسم المنتج'); return; }
      p.variants = p.variants.filter(v => v.name.trim()).map(v => ({ name: v.name.trim(), price: +v.price || 0, inStock: v.inStock !== false }));
      const names = p.variants.map(v => v.name);
      if (new Set(names).size !== names.length) { toast('أسماء الأنواع يجب ألا تتكرر'); return; }
      if (p.variants.length) p.price = 0;
      const i = D.products.findIndex(x => x.id === p.id);
      i >= 0 ? D.products[i] = p : D.products.push(p);
      setDirty(true); closeModal(); render();
    };
  };
  draw(); $('#ov').classList.add('show');
}

/* ---------- start ---------- */
guess(); fillLogin();
if (cfg.token && cfg.owner && cfg.repo) connect();
