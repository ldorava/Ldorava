const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => Number(n || 0).toLocaleString('en-US');

let D = { settings: {}, categories: [], products: [] };
let cart = [];
try { cart = JSON.parse(localStorage.getItem('cart') || '[]'); } catch (e) {}
let cat = 'all', q = '';
let modalHistoryPushed = false;
let cartHistoryPushed = false;

const hasVariants = p => Array.isArray(p.variants) && p.variants.length > 0;
const minPrice = p => hasVariants(p) ? Math.min(...p.variants.map(v => +v.price || 0)) : (+p.price || 0);
const catOf = p => D.categories.find(c => c.id === p.category);

const thumb = (p, v = null, fit = 'cover') => {
  const src = v?.image || p.image || '';
  if (src) return `<img src="${esc(src)}" alt="${esc(v?.name ? `${p.name} - ${v.name}` : p.name)}" loading="lazy" style="width:100%;height:100%;object-fit:${fit};display:block">`;
  return catOf(p)?.icon || '🛍️';
};

const cardThumb = p => {
  if (hasVariants(p)) {
    const firstAvailable = p.variants.find(v => v.inStock !== false && v.image) || p.variants.find(v => v.image) || p.variants[0];
    return thumb(p, firstAvailable, 'cover');
  }
  return thumb(p, null, 'cover');
};

function pushOverlayState(kind) {
  try {
    history.pushState({ overlay: kind, _ts: Date.now() }, '');
    if (kind === 'product') modalHistoryPushed = true;
    if (kind === 'cart') cartHistoryPushed = true;
  } catch (e) {}
}

function hideProductOverlay(fromPopstate = false) {
  const wasOpen = $('#pov').classList.contains('show');
  $('#pov').classList.remove('show');
  if (!fromPopstate && wasOpen && modalHistoryPushed) {
    modalHistoryPushed = false;
    try { history.back(); } catch (e) {}
  } else {
    modalHistoryPushed = false;
  }
}

window.addEventListener('popstate', () => {
  if ($('#pov').classList.contains('show')) {
    modalHistoryPushed = false;
    hideProductOverlay(true);
    return;
  }
  if ($('#drawer').classList.contains('show')) {
    cartHistoryPushed = false;
    closeCart(true);
  }
});

async function init() {
  try { D = await (await fetch('data/store.json?' + Date.now())).json(); } catch (e) { console.error(e); }
  const name = D.settings.name || 'المتجر';
  $('#shopName').textContent = name;
  document.title = name;
  $('#yr').textContent = new Date().getFullYear();
  renderNav(); renderGrid(); renderCart();
}

function renderNav() {
  const items = [{ id: 'all', name: 'الكل' }, ...D.categories];
  $('#nav').innerHTML = items.map(c =>
    `<button data-c="${esc(c.id)}" class="${c.id === cat ? 'on' : ''}">${esc(c.icon || '')} ${esc(c.name)}</button>`).join('');
  $('#nav').querySelectorAll('button').forEach(b => b.onclick = () => { cat = b.dataset.c; renderNav(); renderGrid(); });
}

function renderGrid() {
  const list = D.products.filter(p =>
    (cat === 'all' || p.category === cat) &&
    (!q || (p.name + ' ' + (p.description || '') + ' ' + (p.specs || '') + ' ' + (p.usage || '') + ' ' + (p.variants || []).map(v => `${v.description || ''} ${v.specs || ''} ${v.usage || ''}`).join(' ')).toLowerCase().includes(q.toLowerCase())));
  $('#grid').innerHTML = list.length ? list.map(p => `
    <div class="card" data-id="${esc(p.id)}">
      <div class="img">${cardThumb(p)}</div>
      <div class="b">
        <h3>${esc(p.name)}</h3>
        <div class="pr">${hasVariants(p) && p.variants.length > 1 ? 'من ' : ''}${fmt(minPrice(p))} ${esc(D.settings.currency || '')}</div>
        ${hasVariants(p) ? `<div class="tag">${p.variants.length} أنواع</div>` : ''}
      </div>
    </div>`).join('') : '<div class="empty" style="grid-column:1/-1">لا توجد منتجات</div>';
  $('#grid').querySelectorAll('.card').forEach(c => c.onclick = () => openProduct(c.dataset.id));
}

$('#search').oninput = e => { q = e.target.value.trim(); renderGrid(); };

function openConsultWhatsApp(p, activeVariant) {
  const num = (D.settings.whatsapp || '').replace(/\D/g, '');
  if (!num) { alert('لم يتم ضبط رقم واتساب في لوحة الإدارة'); return; }
  const variantLine = activeVariant ? `\nالنوع: ${activeVariant.name}` : '';
  const msg = `مرحباً، أود الحصول على استشارة مجانية بخصوص المنتج:\nالمنتج: ${p.name}${variantLine}`;
  window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank');
}

function openProduct(id) {
  const p = D.products.find(x => x.id === id); if (!p) return;
  let sel = hasVariants(p) ? p.variants.findIndex(v => v.inStock !== false) : -1;
  let qty = 1;

  const draw = () => {
    const activeVariant = hasVariants(p) && sel >= 0 ? p.variants[sel] : null;
    const price = activeVariant ? (activeVariant.price || 0) : p.price;
    const descText = (activeVariant?.description || '').trim() || (p.description || '').trim();
    const specsText = (activeVariant?.specs || '').trim() || (p.specs || '').trim();
    const usageText = (activeVariant?.usage || '').trim() || (p.usage || '').trim();

    const variantImgHtml = activeVariant?.image
      ? `<div class="v-preview" style="margin:10px 0;padding:8px;border:1px solid rgba(0,0,0,.08);border-radius:12px;background:#fff;display:flex;align-items:center;gap:10px">
           <img src="${esc(activeVariant.image)}" alt="${esc(activeVariant.name)}" style="width:68px;height:68px;object-fit:contain;border-radius:10px;flex-shrink:0;background:#fafafa">
           <div style="font-size:13px;line-height:1.5">
             <div style="font-weight:700">${esc(activeVariant.name)}</div>
             <div style="color:var(--muted)">صورة النوع المختار</div>
           </div>
         </div>`
      : '';

    const descHtml = descText
      ? `<div class="p-desc" style="margin:10px 0;padding:10px 12px;border-radius:10px;background:rgba(0,0,0,.03);line-height:1.65;white-space:pre-line">${esc(descText)}</div>`
      : '';

    const bottomInfoHtml = (specsText || usageText)
      ? `<div class="p-bottom-details" style="margin-top:16px;display:flex;flex-direction:column;gap:10px">
           ${specsText ? `<div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(0,0,0,.09);background:#fafafa;line-height:1.7;white-space:pre-line">
             <div style="font-weight:700;margin-bottom:4px;color:var(--pink)">المواصفات${activeVariant ? ` (${esc(activeVariant.name)})` : ''}</div>
             <div>${esc(specsText)}</div>
           </div>` : ''}
           ${usageText ? `<div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(0,0,0,.09);background:#fafafa;line-height:1.7;white-space:pre-line">
             <div style="font-weight:700;margin-bottom:4px;color:var(--pink)">طريقة الاستعمال${activeVariant ? ` (${esc(activeVariant.name)})` : ''}</div>
             <div>${esc(usageText)}</div>
           </div>` : ''}
         </div>`
      : '';

    $('#pmodal').innerHTML = `
      <button class="x" id="px">×</button>
      <div class="pimg" style="width:100%;height:340px;max-height:52vh;display:flex;align-items:center;justify-content:center;background:#fff;border-radius:14px;overflow:hidden;padding:8px;box-sizing:border-box">${thumb(p, activeVariant, 'contain')}</div>
      <h2 style="margin:10px 0 0">${esc(p.name)}</h2>
      <div class="tag" style="color:var(--muted)">${esc(catOf(p)?.name || '')}</div>
      ${descHtml}
      ${variantImgHtml}
      ${hasVariants(p) ? `<div><b>اختاري النوع:</b></div><div class="chips">${p.variants.map((v, i) => `
        <span class="chip ${i === sel ? 'on' : ''} ${v.inStock === false ? 'off' : ''}" data-i="${i}">
          ${v.image ? `<img src="${esc(v.image)}" alt="${esc(v.name)}" style="width:20px;height:20px;object-fit:cover;border-radius:4px;vertical-align:middle;margin-left:4px">` : ''}
          ${esc(v.name)}
        </span>`).join('')}</div>` : ''}
      <div class="row" style="justify-content:space-between">
        <div style="font-size:1.3rem;color:var(--pink);font-weight:700">${fmt(price)} ${esc(D.settings.currency || '')}</div>
        <div class="qty"><button id="qm">−</button><span>${qty}</span><button id="qp">+</button></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
        <button class="btn" id="add" style="width:100%" ${sel < 0 && hasVariants(p) ? 'disabled' : ''}>أضيفي إلى السلة</button>
        <button type="button" class="btn sec" id="consult" style="width:100%;background:#e8f8ee;color:#157347;border:1px solid #b7e4c7">💬 استشارة مجانية عبر واتساب</button>
      </div>
      ${bottomInfoHtml}`;

    $('#px').onclick = () => hideProductOverlay(false);
    $('#pmodal').querySelectorAll('.chip').forEach(c => c.onclick = () => {
      const i = +c.dataset.i;
      if (p.variants[i].inStock === false) return;
      sel = i;
      draw();
    });
    $('#qm').onclick = () => { qty = Math.max(1, qty - 1); draw(); };
    $('#qp').onclick = () => { qty++; draw(); };
    $('#consult').onclick = () => openConsultWhatsApp(p, activeVariant);
    $('#add').onclick = () => {
      const v = activeVariant ? activeVariant.name : '';
      const ex = cart.find(c => c.pid === p.id && c.v === v);
      ex ? ex.q += qty : cart.push({ pid: p.id, v, q: qty });
      saveCart();
      hideProductOverlay(false);
      openCart();
    };
  };

  draw();
  const wasOpen = $('#pov').classList.contains('show');
  $('#pov').classList.add('show');
  if (!wasOpen) pushOverlayState('product');
}
$('#pov').onclick = e => { if (e.target.id === 'pov') hideProductOverlay(false); };

function saveCart() { try { localStorage.setItem('cart', JSON.stringify(cart)); } catch (e) {} renderCart(); }

function resolve(c) {
  const p = D.products.find(x => x.id === c.pid);
  if (!p) return null;
  let price = p.price;
  let variant = null;
  if (hasVariants(p)) {
    variant = p.variants.find(x => x.name === c.v);
    if (!variant) return null;
    price = variant.price;
  }
  return { p, variant, price: +price || 0 };
}

function renderCart() {
  cart = cart.filter(resolve);
  $('#cartCount').textContent = cart.reduce((s, c) => s + c.q, 0);
  if (!cart.length) { $('#cartBody').innerHTML = '<div class="empty">السلة فارغة</div>'; $('#cartFoot').innerHTML = ''; return; }
  let total = 0;
  $('#cartBody').innerHTML = cart.map((c, i) => {
    const r = resolve(c);
    total += r.price * c.q;
    const itemImgSrc = r.variant?.image || r.p.image || '';
    const imgHtml = itemImgSrc
      ? `<img src="${esc(itemImgSrc)}" alt="${esc(r.p.name)}" style="width:44px;height:44px;object-fit:cover;border-radius:8px;flex-shrink:0">`
      : '';
    return `<div class="ci" style="display:flex;align-items:center;gap:10px">
      ${imgHtml}
      <div class="t" style="flex:1">${esc(r.p.name)}<small>${esc(c.v)}${c.v ? ' · ' : ''}${fmt(r.price)}</small></div>
      <div class="qty"><button data-m="${i}">−</button><span>${c.q}</span><button data-p="${i}">+</button></div>
    </div>`;
  }).join('');
  $('#cartBody').querySelectorAll('[data-m]').forEach(b => b.onclick = () => { const c = cart[+b.dataset.m]; c.q--; if (c.q < 1) cart.splice(+b.dataset.m, 1); saveCart(); });
  $('#cartBody').querySelectorAll('[data-p]').forEach(b => b.onclick = () => { cart[+b.dataset.p].q++; saveCart(); });
  $('#cartFoot').innerHTML = `<div class="row" style="justify-content:space-between;margin-bottom:10px"><b>الإجمالي</b><b>${fmt(total)} ${esc(D.settings.currency || '')}</b></div>
    <button class="btn" id="order" style="width:100%">إرسال الطلب عبر واتساب</button>`;
  $('#order').onclick = () => {
    const lines = cart.map(c => { const r = resolve(c); return `• ${r.p.name}${c.v ? ' (' + c.v + ')' : ''} × ${c.q} = ${fmt(r.price * c.q)}`; });
    const msg = `طلب جديد:\n${lines.join('\n')}\nالإجمالي: ${fmt(total)} ${D.settings.currency || ''}`;
    const num = (D.settings.whatsapp || '').replace(/\D/g, '');
    if (!num) { alert('لم يتم ضبط رقم واتساب في لوحة الإدارة'); return; }
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank');
  };
}

function openCart() {
  const wasOpen = $('#drawer').classList.contains('show');
  $('#drawer').classList.add('show');
  $('#cov').classList.add('show');
  if (!wasOpen) pushOverlayState('cart');
}
function closeCart(fromPopstate = false) {
  const wasOpen = $('#drawer').classList.contains('show');
  $('#drawer').classList.remove('show');
  $('#cov').classList.remove('show');
  if (!fromPopstate && wasOpen && cartHistoryPushed) {
    cartHistoryPushed = false;
    try { history.back(); } catch (e) {}
  } else {
    cartHistoryPushed = false;
  }
}
$('#cartBtn').onclick = openCart;
$('#closeCart').onclick = () => closeCart(false);
$('#cov').onclick = () => closeCart(false);

init();
