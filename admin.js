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
const priceText = p => {
  const cur = D.settings.currency || '';
  if (hasVar(p)) {
    const finals = p.variants.map(v => discPrice(v.price, effectiveVarDisc(p, v)));
    const anyDisc = p.variants.some(v => effectiveVarDisc(p, v) > 0);
    return `${p.variants.length} أنواع · من ${fmt(Math.min(...finals))} ${cur}${anyDisc ? ' (خصم)' : ''}`;
  }
  const d = clampDisc(p.discount || 0);
  if (d > 0) {
    return `${fmt(discPrice(p.price, d))} ${cur} (بدلاً من ${fmt(p.price)} · خصم ${d}%)`;
  }
  return `${fmt(p.price)} ${cur}`;
};

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
      const varImg = hasVar(p) ? p.variants.find(v => v.image)?.image : '';
      const imgSrc = p.image || varImg || '';
      const th = imgSrc ? `<img src="${esc(previews[imgSrc] || imgSrc)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block">` : (c?.icon || '🛍️');
      return `<div class="it"><div class="th" style="overflow:hidden">${th}</div>
        <div class="n">${esc(p.name)}<small>${esc(c?.name || 'بدون قسم')} · ${priceText(p)}</small></div>
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
    ? { id: uid('p'), name: '', category: D.categories[0].id, description: '', specs: '', usage: '', image: '', price: 0, discount: 0, variants: [] }
    : JSON.parse(JSON.stringify(D.products.find(x => x.id === id)));
  p.specs = p.specs || '';
  p.usage = p.usage || '';
  p.discount = clampDisc(p.discount || 0);
  p.variants = (p.variants || []).map(v => ({
    ...v,
    image: v.image || '',
    description: v.description || '',
    specs: v.specs || '',
    usage: v.usage || '',
    discount: clampDisc(v.discount || 0)
  }));

  const md = $('#md');
  md.style.maxWidth = '960px';
  md.style.width = '96vw';
  md.style.maxHeight = '92vh';
  md.style.padding = '22px';
  md.style.overflowY = 'auto';

  const sync = () => {
    if (!$('#fn')) return;
    p.name = $('#fn').value;
    p.category = $('#fc').value;
    p.description = $('#fd').value;
    p.specs = $('#fsp').value;
    p.usage = $('#fus').value;
    p.price = +$('#fp').value || 0;
    p.discount = clampDisc($('#fdisc').value || 0);
    md.querySelectorAll('[data-vn]').forEach(i => { if (p.variants[+i.dataset.vn]) p.variants[+i.dataset.vn].name = i.value; });
    md.querySelectorAll('[data-vp]').forEach(i => { if (p.variants[+i.dataset.vp]) p.variants[+i.dataset.vp].price = +i.value || 0; });
    md.querySelectorAll('[data-vd]').forEach(i => { if (p.variants[+i.dataset.vd]) p.variants[+i.dataset.vd].discount = clampDisc(i.value || 0); });
    md.querySelectorAll('[data-vdsc]').forEach(i => { if (p.variants[+i.dataset.vdsc]) p.variants[+i.dataset.vdsc].description = i.value; });
    md.querySelectorAll('[data-vsp]').forEach(i => { if (p.variants[+i.dataset.vsp]) p.variants[+i.dataset.vsp].specs = i.value; });
    md.querySelectorAll('[data-vus]').forEach(i => { if (p.variants[+i.dataset.vus]) p.variants[+i.dataset.vus].usage = i.value; });
    md.querySelectorAll('[data-vs]').forEach(i => { if (p.variants[+i.dataset.vs]) p.variants[+i.dataset.vs].inStock = i.checked; });
  };

  const thumbBox = (src, fallback, size = 48) => src
    ? `<div style="width:${size}px;height:${size}px;border-radius:10px;overflow:hidden;flex-shrink:0;border:1px solid rgba(0,0,0,.08);background:#fff;display:flex;align-items:center;justify-content:center">
         <img src="${esc(src)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block">
       </div>`
    : `<div style="width:${size}px;height:${size}px;border-radius:10px;flex-shrink:0;border:1px solid rgba(0,0,0,.08);background:#f7e8ee;display:flex;align-items:center;justify-content:center;font-size:${Math.round(size * 0.45)}px">
         ${fallback}
       </div>`;

  const draw = () => {
    const mainSrc = p.image ? (previews[p.image] || p.image) : '';
    const afterProdDisc = discPrice(p.price, p.discount);
    md.innerHTML = `<button class="x" id="mx">×</button>
      <h2 style="margin-top:0;color:var(--pink);font-size:1.45rem">${isNew ? 'منتج جديد' : 'تعديل المنتج'}</h2>

      <label for="fn" style="font-size:14px">اسم المنتج</label>
      <input type="text" id="fn" value="${esc(p.name)}" placeholder="مثال: شامبو" style="font-size:15px;padding:11px 12px">

      <label for="fc" style="font-size:14px">القسم</label>
      <select id="fc" style="font-size:15px;padding:11px 12px">${D.categories.map(c =>
        `<option value="${esc(c.id)}" ${c.id === p.category ? 'selected' : ''}>${esc(c.icon || '')} ${esc(c.name)}</option>`).join('')}</select>

      <label for="fd" style="font-size:14px">وصف المنتج العام (اختياري)</label>
      <textarea id="fd" rows="3" style="width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid rgba(0,0,0,.15);font-size:14px;line-height:1.6" placeholder="وصف مختصر للمنتج...">${esc(p.description || '')}</textarea>

      <label style="font-size:14px">الصورة العامة للمنتج (اختياري)</label>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px">
        ${thumbBox(mainSrc, '🛍️', 64)}
        <input type="file" id="ff" accept="image/*" style="flex:1;min-width:180px;font-size:13px">
        ${p.image ? '<button type="button" class="btn danger sm" id="fr">إزالة</button>' : ''}
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:8px">
        <div>
          <label for="fp" style="font-size:14px">السعر (إذا لم تكن هناك أنواع)</label>
          <input type="number" id="fp" min="0" value="${p.price || 0}" style="width:100%;box-sizing:border-box;font-size:15px;padding:11px 12px">
        </div>
        <div>
          <label for="fdisc" style="font-size:14px">نسبة الخصم % (0 = بدون خصم)</label>
          <input type="number" id="fdisc" min="0" max="99" value="${clampDisc(p.discount || 0)}" style="width:100%;box-sizing:border-box;font-size:15px;padding:11px 12px">
        </div>
      </div>
      ${clampDisc(p.discount || 0) > 0 && !hasVar(p)
        ? `<div style="margin-top:6px;font-size:13px;color:#157347;font-weight:600">السعر بعد الخصم: ${fmt(afterProdDisc)} ${esc(D.settings.currency || '')}</div>`
        : ''}

      <label style="margin-top:16px;font-size:14.5px">الأنواع (لكل نوع اسم، سعر، خصم خاص اختياري، وصف، مواصفات، طريقة استعمال، وصورة)</label>
      <div id="vs" style="display:flex;flex-direction:column;gap:14px;margin-top:10px">
        ${p.variants.map((v, i) => {
          const vSrc = v.image ? (previews[v.image] || v.image) : '';
          const effD = effectiveVarDisc(p, v);
          const vFinal = discPrice(v.price, effD);
          return `<div style="border:1px solid rgba(0,0,0,.12);border-radius:14px;padding:14px;background:#fff;display:flex;flex-direction:column;gap:10px">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              ${thumbBox(vSrc, '🖼️', 48)}
              <input type="text" data-vn="${i}" value="${esc(v.name)}" placeholder="اسم النوع" style="flex:1;min-width:160px;font-size:14.5px;padding:10px 12px">
              <input type="number" data-vp="${i}" min="0" value="${v.price || 0}" placeholder="السعر" style="width:120px;font-size:14.5px;padding:10px 12px">
              <input type="number" data-vd="${i}" min="0" max="99" value="${clampDisc(v.discount || 0)}" placeholder="خصم %" title="نسبة الخصم % لهذا النوع (أو يأخذ خصم المنتج)" style="width:92px;font-size:14.5px;padding:10px 10px">
            </div>
            ${effD > 0
              ? `<div style="font-size:13px;color:#157347;font-weight:600">بعد الخصم (${effD}%): ${fmt(vFinal)} ${esc(D.settings.currency || '')}</div>`
              : ''}
            <input type="text" data-vdsc="${i}" value="${esc(v.description || '')}" placeholder="وصف مختصر لهذا النوع..." style="width:100%;box-sizing:border-box;font-size:14px;padding:10px 12px">
            <textarea data-vsp="${i}" rows="3" placeholder="المواصفات الخاصة بهذا النوع..." style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid rgba(0,0,0,.15);font-size:14px;line-height:1.6">${esc(v.specs || '')}</textarea>
            <textarea data-vus="${i}" rows="3" placeholder="طريقة الاستعمال الخاصة بهذا النوع..." style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid rgba(0,0,0,.15);font-size:14px;line-height:1.6">${esc(v.usage || '')}</textarea>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding-top:8px;border-top:1px dashed rgba(0,0,0,.08)">
              <label style="margin:0;display:inline-flex;align-items:center;gap:6px;font-size:14px;cursor:pointer">
                <input type="checkbox" data-vs="${i}" ${v.inStock !== false ? 'checked' : ''}> متوفر
              </label>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <input type="file" data-vf="${i}" accept="image/*" style="max-width:210px;font-size:12px">
                ${v.image ? `<button type="button" class="btn danger sm" data-vr="${i}">إزالة الصورة</button>` : ''}
                <button type="button" class="btn danger sm" data-vdel="${i}">×</button>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>

      <button type="button" class="btn sec" id="va" style="margin-top:12px">+ إضافة نوع</button>

      <label for="fsp" style="margin-top:18px;font-size:14px">المواصفات العامة للمنتج (تظهر في الأسفل إذا لم يحدد للنوع)</label>
      <textarea id="fsp" rows="4" style="width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid rgba(0,0,0,.15);font-size:14px;line-height:1.65" placeholder="مثال: الحجم 300 مل، مناسب للشعر العادي، خالٍ من السلفات...">${esc(p.specs || '')}</textarea>

      <label for="fus" style="margin-top:12px;font-size:14px">طريقة الاستعمال العامة للمنتج (تظهر في الأسفل إذا لم يحدد للنوع)</label>
      <textarea id="fus" rows="4" style="width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid rgba(0,0,0,.15);font-size:14px;line-height:1.65" placeholder="مثال: يُوضع على شعر مبلل ويُدلّك بلطف ثم يُشطف بالماء...">${esc(p.usage || '')}</textarea>

      <div class="row" style="margin-top:22px">
        <button type="button" class="btn" id="fs" style="padding:10px 24px;font-size:15px">موافق</button>
        <button type="button" class="btn sec" id="fcn" style="padding:10px 20px;font-size:15px">إلغاء</button>
      </div>`;

    $('#mx').onclick = $('#fcn').onclick = closeModal;
    $('#fdisc').oninput = () => { sync(); draw(); };
    md.querySelectorAll('[data-vd], [data-vp]').forEach(inp => {
      inp.oninput = () => { sync(); draw(); };
    });
    $('#va').onclick = () => { sync(); p.variants.push({ name: '', price: p.price || 0, discount: clampDisc(p.discount || 0), description: '', specs: '', usage: '', inStock: true, image: '' }); draw(); };
    md.querySelectorAll('[data-vdel]').forEach(b => b.onclick = () => { sync(); p.variants.splice(+b.dataset.vdel, 1); draw(); });
    md.querySelectorAll('[data-vr]').forEach(b => b.onclick = () => { sync(); p.variants[+b.dataset.vr].image = ''; draw(); });
    md.querySelectorAll('[data-vf]').forEach(inp => {
      inp.onchange = async e => {
        const f = e.target.files[0]; if (!f) return;
        const idx = +inp.dataset.vf;
        sync();
        toast('جاري رفع صورة النوع...');
        try {
          p.variants[idx].image = await uploadImage(f);
          toast('تم رفع صورة النوع ✓');
        } catch (err) {
          toast('فشل رفع الصورة: ' + err.message);
        }
        draw();
      };
    });
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
      p.description = (p.description || '').trim();
      p.specs = (p.specs || '').trim();
      p.usage = (p.usage || '').trim();
      p.discount = clampDisc(p.discount || 0);
      if (!p.name) { toast('اكتبي اسم المنتج'); return; }
      p.variants = p.variants
        .filter(v => v.name.trim())
        .map(v => ({
          name: v.name.trim(),
          price: +v.price || 0,
          discount: clampDisc(v.discount || 0),
          description: (v.description || '').trim(),
          specs: (v.specs || '').trim(),
          usage: (v.usage || '').trim(),
          inStock: v.inStock !== false,
          image: v.image || ''
        }));
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
