const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => Number(n || 0).toLocaleString('en-US');

const APP_SHARE_URL = 'https://ldorava.github.io/Ldorava/index.html';

const clampDisc = d => Math.max(0, Math.min(99, Number(d) || 0));
const discPrice = (price, disc) => {
  const base = Number(price) || 0;
  const pct = clampDisc(disc);
  return pct > 0 ? Math.round(base * (1 - pct / 100)) : base;
};

let D = { settings: {}, categories: [], products: [] };
let cart = [];
try { cart = JSON.parse(localStorage.getItem('cart') || '[]'); } catch (e) {}
let stockDeducted = {};
try { stockDeducted = JSON.parse(localStorage.getItem('stock_deducted') || '{}'); } catch (e) {}

let cat = 'all', q = '';
let modalHistoryPushed = false;
let cartHistoryPushed = false;
let shareHistoryPushed = false;

const hasVariants = p => Array.isArray(p.variants) && p.variants.length > 0;
const effectiveVarDisc = (p, v) => clampDisc(v.discount || p.discount || 0);

function getEffectiveStock(p, v = null) {
  const raw = v ? v.stock : p.stock;
  if (raw === null || raw === undefined || raw === '') return null;
  const key = v ? `${p.id}::${v.name}` : `${p.id}`;
  const used = Number(stockDeducted[key] || 0);
  return Math.max(0, Math.floor(Number(raw) || 0) - used);
}

function getCartQtyFor(pid, vName = '') {
  const item = cart.find(c => c.pid === pid && (c.v || '') === (vName || ''));
  return item ? Math.max(0, Math.floor(Number(item.q) || 0)) : 0;
}

function isVariantAvailable(p, v) {
  if (v.inStock === false) return false;
  const st = getEffectiveStock(p, v);
  return st === null || st > 0;
}

function isProductAvailable(p) {
  if (hasVariants(p)) return p.variants.some(v => isVariantAvailable(p, v));
  if (p.inStock === false) return false;
  const st = getEffectiveStock(p, null);
  return st === null || st > 0;
}

const minPrice = p => {
  if (hasVariants(p)) {
    const avail = p.variants.filter(v => isVariantAvailable(p, v));
    const pool = avail.length ? avail : p.variants;
    return Math.min(...pool.map(v => discPrice(v.price, effectiveVarDisc(p, v))));
  }
  return discPrice(p.price, p.discount || 0);
};
const hasAnyDiscount = p => {
  if (hasVariants(p)) return p.variants.some(v => effectiveVarDisc(p, v) > 0);
  return clampDisc(p.discount || 0) > 0;
};
const catOf = p => D.categories.find(c => c.id === p.category);

const thumb = (p, v = null, fit = 'cover') => {
  const src = v?.image || p.image || '';
  if (src) return `<img src="${esc(src)}" alt="${esc(v?.name ? `${p.name} - ${v.name}` : p.name)}" loading="lazy" style="width:100%;height:100%;object-fit:${fit};display:block">`;
  return catOf(p)?.icon || '🛍️';
};

const cardThumb = p => {
  if (hasVariants(p)) {
    const firstAvailable = p.variants.find(v => isVariantAvailable(p, v) && v.image) || p.variants.find(v => v.image) || p.variants[0];
    return thumb(p, firstAvailable, 'cover');
  }
  return thumb(p, null, 'cover');
};

function pushOverlayState(kind) {
  try {
    history.pushState({ overlay: kind, _ts: Date.now() }, '');
    if (kind === 'product') modalHistoryPushed = true;
    if (kind === 'cart') cartHistoryPushed = true;
    if (kind === 'share') shareHistoryPushed = true;
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

function closeShareModal(fromPopstate = false) {
  const ov = $('#shareOv');
  if (!ov) return;
  const wasOpen = ov.classList.contains('show');
  ov.classList.remove('show');
  if (!fromPopstate && wasOpen && shareHistoryPushed) {
    shareHistoryPushed = false;
    try { history.back(); } catch (e) {}
  } else {
    shareHistoryPushed = false;
  }
}

function ensureShareModal() {
  if ($('#shareOv')) return;
  const ov = document.createElement('div');
  ov.id = 'shareOv';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.48);display:none;align-items:center;justify-content:center;padding:16px;z-index:9999';
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodeURIComponent(APP_SHARE_URL)}`;
  ov.innerHTML = `
    <div id="shareBox" style="position:relative;width:100%;max-width:390px;background:#fff;border-radius:20px;padding:24px 20px;box-shadow:0 20px 50px rgba(0,0,0,.22);text-align:center;box-sizing:border-box">
      <button type="button" id="closeShare" aria-label="إغلاق" style="position:absolute;top:12px;left:12px;width:34px;height:34px;border-radius:50%;border:none;background:rgba(0,0,0,.06);font-size:20px;line-height:1;cursor:pointer">×</button>
      <h3 style="margin:0 0 6px;color:var(--pink);font-size:1.25rem">مشاركة التطبيق</h3>
      <p style="margin:0 0 14px;color:var(--muted);font-size:13.5px;line-height:1.6">امسحي الباركود بكاميرا الموبايل أو شاركي الرابط مباشرة مع من تحبين</p>
      <div style="display:inline-flex;align-items:center;justify-content:center;padding:10px;border:1px solid rgba(0,0,0,.08);border-radius:16px;background:#fafafa;margin-bottom:14px;min-height:220px;min-width:220px">
        <img src="${esc(qrSrc)}" alt="باركود L'DORA Viva" style="width:200px;height:200px;display:block;border-radius:8px">
      </div>
      <div style="background:#f8f9fa;border:1px solid rgba(0,0,0,.08);border-radius:12px;padding:9px 12px;font-size:12.5px;color:#333;word-break:break-all;margin-bottom:14px" dir="ltr">${esc(APP_SHARE_URL)}</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button type="button" class="btn" id="shareLinkBtn" style="width:100%">🔗 مشاركة الرابط</button>
        <button type="button" class="btn sec" id="copyLinkBtn" style="width:100%">📋 نسخ الرابط</button>
      </div>
      <div id="shareStatus" style="margin-top:10px;font-size:13px;color:#157347;font-weight:600;min-height:18px"></div>
    </div>`;
  document.body.appendChild(ov);

  ov.onclick = e => { if (e.target.id === 'shareOv') closeShareModal(false); };
  $('#closeShare').onclick = () => closeShareModal(false);

  $('#copyLinkBtn').onclick = async () => {
    const st = $('#shareStatus');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(APP_SHARE_URL);
      } else {
        const ta = document.createElement('textarea');
        ta.value = APP_SHARE_URL;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      st.textContent = 'تم نسخ الرابط بنجاح ✓';
    } catch (e) {
      st.textContent = 'انسخي الرابط من الصندوق بالأعلى';
    }
  };

  $('#shareLinkBtn').onclick = async () => {
    const st = $('#shareStatus');
    const shopTitle = D.settings.name || "L'DORA Viva";
    if (navigator.share) {
      try {
        await navigator.share({
          title: shopTitle,
          text: `تصفحي منتجات ${shopTitle} — وكيل شركة L'DORA`,
          url: APP_SHARE_URL
        });
        st.textContent = 'تمت المشاركة ✓';
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${shopTitle}\n${APP_SHARE_URL}`)}`, '_blank');
    st.textContent = 'تم فتح نافذة المشاركة ✓';
  };
}

function openShareModal() {
  ensureShareModal();
  const ov = $('#shareOv');
  $('#shareStatus').textContent = '';
  const wasOpen = ov.classList.contains('show');
  ov.style.display = 'flex';
  ov.classList.add('show');
  if (!wasOpen) pushOverlayState('share');
}

const origShareCloseWatcher = () => {
  const ov = $('#shareOv');
  if (ov && !ov.classList.contains('show')) ov.style.display = 'none';
};

function renderAboutSection() {
  if ($('#aboutVivaSection')) return;
  const shopName = D.settings.name || "L'DORA Viva";
  const sec = document.createElement('section');
  sec.id = 'aboutVivaSection';
  sec.style.cssText = 'max-width:1100px;margin:32px auto 16px;padding:0 14px;box-sizing:border-box';
  sec.innerHTML = `
    <div style="background:linear-gradient(135deg,#fff8fb 0%,#ffffff 100%);border:1px solid rgba(0,0,0,.08);border-radius:20px;padding:24px 20px;box-shadow:0 8px 28px rgba(0,0,0,.05)">
      <div style="display:flex;flex-direction:column;gap:12px">
        <div style="display:inline-flex;align-items:center;gap:8px;align-self:flex-start;background:rgba(214,51,108,.1);color:var(--pink);padding:5px 14px;border-radius:999px;font-size:13px;font-weight:700">
          <span>✨ من نحن</span>
        </div>
        <h2 style="margin:0;font-size:1.45rem;color:#1f2937">L'DORA Viva — وكيل شركة L'DORA</h2>
        <p style="margin:0;color:#4b5563;font-size:14.5px;line-height:1.85">
          نحن في <b>L'DORA Viva</b> وكيل معتمد لشركة <b>L'DORA</b>، نضع بين يديكِ عناية متكاملة تجمع بين الجودة العالية واللمسة العصرية لتمنحي جمالكِ إشراقة تدوم كل يوم. نحرص بعناية على اختيار منتجات أصلية وموثوقة تناسب مختلف الاحتياجات، مع تجربة تسوق سهلة وسريعة واستشارات مخصصة تساعدكِ في اختيار الأنسب لكِ بثقة وراحة بال.
        </p>
        <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-top:8px;padding-top:14px;border-top:1px dashed rgba(0,0,0,.1)">
          <div style="font-size:13px;color:var(--muted)">${esc(shopName)} · وكيل شركة L'DORA</div>
          <button type="button" class="btn" id="openShareAppBtn" style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;border-radius:12px;font-size:14px">
            <span>📲 مشاركة التطبيق</span>
          </button>
        </div>
      </div>
    </div>`;

  const footer = $('footer');
  if (footer && footer.parentNode) {
    footer.parentNode.insertBefore(sec, footer);
  } else {
    document.body.appendChild(sec);
  }

  $('#openShareAppBtn').onclick = openShareModal;
}

window.addEventListener('popstate', () => {
  if ($('#shareOv') && $('#shareOv').classList.contains('show')) {
    shareHistoryPushed = false;
    closeShareModal(true);
    origShareCloseWatcher();
    return;
  }
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

function reconcileDeductedCache() {
  let changed = false;
  for (const key of Object.keys(stockDeducted)) {
    const [pid, vname] = key.split('::');
    const p = D.products.find(x => x.id === pid);
    if (!p) { delete stockDeducted[key]; changed = true; continue; }
    const v = vname ? (p.variants || []).find(x => x.name === vname) : null;
    const raw = v ? v.stock : p.stock;
    if (raw === null || raw === undefined || Number(raw) === 0) {
      delete stockDeducted[key];
      changed = true;
    }
  }
  if (changed) {
    try { localStorage.setItem('stock_deducted', JSON.stringify(stockDeducted)); } catch (e) {}
  }
}

async function init() {
  try { D = await (await fetch('data/store.json?' + Date.now())).json(); } catch (e) { console.error(e); }
  reconcileDeductedCache();
  const name = D.settings.name || "L'DORA Viva";
  $('#shopName').textContent = name;
  document.title = name;
  $('#yr').textContent = new Date().getFullYear();
  document.querySelectorAll('a[href*="admin"], button[data-admin], #adminBtn, #adminLink').forEach(el => el.remove());
  renderNav(); renderGrid(); renderCart(); renderAboutSection();
}

function renderNav() {
  const items = [{ id: 'all', name: 'الكل' }, ...D.categories];
  $('#nav').innerHTML = items.map(c =>
    `<button data-c="${esc(c.id)}" class="${c.id === cat ? 'on' : ''}">${esc(c.icon || '')} ${esc(c.name)}</button>`).join('');
  $('#nav').querySelectorAll('button').forEach(b => b.onclick = () => { cat = b.dataset.c; renderNav(); renderGrid(); });
}

function renderGrid() {
  const cur = D.settings.currency || '';
  const list = D.products.filter(p =>
    (cat === 'all' || p.category === cat) &&
    (!q || (p.name + ' ' + (p.description || '') + ' ' + (p.specs || '') + ' ' + (p.usage || '') + ' ' + (p.variants || []).map(v => `${v.description || ''} ${v.specs || ''} ${v.usage || ''}`).join(' ')).toLowerCase().includes(q.toLowerCase())));
  $('#grid').innerHTML = list.length ? list.map(p => {
    const available = isProductAvailable(p);
    const discounted = available && hasAnyDiscount(p);
    const origMin = hasVariants(p) ? Math.min(...p.variants.map(v => +v.price || 0)) : (+p.price || 0);
    return `
    <div class="card" data-id="${esc(p.id)}" style="position:relative;${!available ? 'opacity:.78' : ''}">
      ${!available
        ? `<span style="position:absolute;top:10px;right:10px;z-index:2;background:#495057;color:#fff;font-size:12px;font-weight:700;padding:3px 10px;border-radius:999px">غير متوفر</span>`
        : (discounted ? `<span style="position:absolute;top:10px;right:10px;z-index:2;background:#dc3545;color:#fff;font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px">خصم</span>` : '')}
      <div class="img">${cardThumb(p)}</div>
      <div class="b">
        <h3>${esc(p.name)}</h3>
        <div class="pr">
          ${hasVariants(p) && p.variants.length > 1 ? 'من ' : ''}${fmt(minPrice(p))} ${esc(cur)}
          ${discounted ? `<small style="text-decoration:line-through;color:var(--muted);margin-right:6px;font-weight:400">${fmt(origMin)}</small>` : ''}
        </div>
        ${!available
          ? `<div class="tag" style="color:#c92a2a;font-weight:700">غير متوفر حالياً</div>`
          : (hasVariants(p) ? `<div class="tag">${p.variants.length} أنواع</div>` : '')}
      </div>
    </div>`;
  }).join('') : '<div class="empty" style="grid-column:1/-1">لا توجد منتجات</div>';
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
  let sel = hasVariants(p)
    ? (() => {
        const idx = p.variants.findIndex(v => isVariantAvailable(p, v));
        return idx >= 0 ? idx : 0;
      })()
    : -1;
  let qty = 1;

  const draw = () => {
    const cur = D.settings.currency || '';
    const activeVariant = hasVariants(p) && sel >= 0 ? p.variants[sel] : null;
    const itemAvailable = activeVariant ? isVariantAvailable(p, activeVariant) : isProductAvailable(p);
    const maxStock = getEffectiveStock(p, activeVariant);
    const inCartQty = getCartQtyFor(p.id, activeVariant ? activeVariant.name : '');
    const remainingToAdd = maxStock === null ? null : Math.max(0, maxStock - inCartQty);
    const canAddMore = itemAvailable && (remainingToAdd === null || remainingToAdd > 0);

    if (remainingToAdd !== null && remainingToAdd > 0 && qty > remainingToAdd) {
      qty = remainingToAdd;
    } else if (remainingToAdd === 0) {
      qty = 1;
    }

    const rawPrice = activeVariant ? (+activeVariant.price || 0) : (+p.price || 0);
    const activeDisc = activeVariant ? effectiveVarDisc(p, activeVariant) : clampDisc(p.discount || 0);
    const finalPrice = discPrice(rawPrice, activeDisc);

    const descText = (activeVariant?.description || '').trim() || (p.description || '').trim();
    const specsText = (activeVariant?.specs || '').trim() || (p.specs || '').trim();
    const usageText = (activeVariant?.usage || '').trim() || (p.usage || '').trim();

    const variantImgHtml = activeVariant?.image
      ? `<div class="v-preview" style="margin:10px 0;padding:8px;border:1px solid rgba(0,0,0,.08);border-radius:12px;background:#fff;display:flex;align-items:center;gap:10px">
           <img src="${esc(activeVariant.image)}" alt="${esc(activeVariant.name)}" style="width:68px;height:68px;object-fit:contain;border-radius:10px;flex-shrink:0;background:#fafafa">
           <div style="font-size:13px;line-height:1.5">
             <div style="font-weight:700">${esc(activeVariant.name)}</div>
             <div style="color:${itemAvailable ? 'var(--muted)' : '#c92a2a'}">${itemAvailable ? 'صورة النوع المختار' : 'غير متوفر حالياً'}</div>
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

    const priceBlockHtml = activeDisc > 0
      ? `<div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
           <span style="font-size:1.3rem;color:var(--pink);font-weight:700">${fmt(finalPrice)} ${esc(cur)}</span>
           <span style="font-size:.95rem;color:var(--muted);text-decoration:line-through">${fmt(rawPrice)} ${esc(cur)}</span>
           <span style="background:#ffe5e8;color:#c92a2a;font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px">خصم ${activeDisc}%</span>
         </div>`
      : `<div style="font-size:1.3rem;color:var(--pink);font-weight:700">${fmt(finalPrice)} ${esc(cur)}</div>`;

    let stockNoticeHtml = '';
    if (!itemAvailable) {
      stockNoticeHtml = `<div style="margin:8px 0;padding:8px 12px;border-radius:10px;background:#fff0f0;color:#c92a2a;font-weight:700;font-size:13.5px;text-align:center">غير متوفر حالياً (نفدت الكمية)</div>`;
    } else if (remainingToAdd === 0) {
      stockNoticeHtml = `<div style="margin:8px 0;padding:8px 12px;border-radius:10px;background:#fff8e6;color:#b45309;font-weight:700;font-size:13px;text-align:center">وصلتِ للحد الأقصى المتوفر في المخزن (في السلة: ${inCartQty})</div>`;
    } else if (maxStock !== null) {
      stockNoticeHtml = `<div style="margin:6px 0;font-size:12.5px;color:#b45309;font-weight:600">المتوفر بالمخزن: ${maxStock}${inCartQty > 0 ? ` (في السلة: ${inCartQty} · المتاح إضافته: ${remainingToAdd})` : ''}</div>`;
    }

    const addBtnLabel = !itemAvailable
      ? 'غير متوفر'
      : (remainingToAdd === 0 ? 'الكمية الكاملة في السلة' : 'أضيفي إلى السلة');

    $('#pmodal').innerHTML = `
      <button class="x" id="px">×</button>
      <div class="pimg" style="width:100%;height:340px;max-height:52vh;display:flex;align-items:center;justify-content:center;background:#fff;border-radius:14px;overflow:hidden;padding:8px;box-sizing:border-box">${thumb(p, activeVariant, 'contain')}</div>
      <h2 style="margin:10px 0 0">${esc(p.name)}</h2>
      <div class="tag" style="color:var(--muted)">${esc(catOf(p)?.name || '')}</div>
      ${descHtml}
      ${variantImgHtml}
      ${hasVariants(p) ? `<div><b>اختاري النوع:</b></div><div class="chips">${p.variants.map((v, i) => {
        const vAvail = isVariantAvailable(p, v);
        return `
        <span class="chip ${i === sel ? 'on' : ''} ${!vAvail ? 'off' : ''}" data-i="${i}" style="${!vAvail ? 'opacity:.55' : ''}">
          ${v.image ? `<img src="${esc(v.image)}" alt="${esc(v.name)}" style="width:20px;height:20px;object-fit:cover;border-radius:4px;vertical-align:middle;margin-left:4px">` : ''}
          ${esc(v.name)}${!vAvail ? ' (غير متوفر)' : ''}
        </span>`;
      }).join('')}</div>` : ''}
      ${stockNoticeHtml}
      <div class="row" style="justify-content:space-between">
        ${priceBlockHtml}
        <div class="qty"><button id="qm" ${!canAddMore || qty <= 1 ? 'disabled' : ''}>−</button><span>${qty}</span><button id="qp" ${!canAddMore || (remainingToAdd !== null && qty >= remainingToAdd) ? 'disabled' : ''}>+</button></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
        <button class="btn" id="add" style="width:100%" ${!canAddMore ? 'disabled' : ''}>${addBtnLabel}</button>
        <button type="button" class="btn sec" id="consult" style="width:100%;background:#e8f8ee;color:#157347;border:1px solid #b7e4c7">💬 استشارة مجانية عبر واتساب</button>
      </div>
      ${bottomInfoHtml}`;

    $('#px').onclick = () => hideProductOverlay(false);
    $('#pmodal').querySelectorAll('.chip').forEach(c => c.onclick = () => {
      const i = +c.dataset.i;
      sel = i;
      qty = 1;
      draw();
    });
    $('#qm').onclick = () => { qty = Math.max(1, qty - 1); draw(); };
    $('#qp').onclick = () => {
      if (remainingToAdd !== null && qty >= remainingToAdd) return;
      qty++;
      draw();
    };
    $('#consult').onclick = () => openConsultWhatsApp(p, activeVariant);
    $('#add').onclick = () => {
      if (!canAddMore) return;
      const v = activeVariant ? activeVariant.name : '';
      const ex = cart.find(c => c.pid === p.id && c.v === v);
      const currentInCart = ex ? ex.q : 0;
      let nextQty = currentInCart + qty;
      if (maxStock !== null && nextQty > maxStock) nextQty = maxStock;
      if (nextQty <= 0) return;
      ex ? ex.q = nextQty : cart.push({ pid: p.id, v, q: nextQty });
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
  let disc = clampDisc(p.discount || 0);
  let variant = null;
  if (hasVariants(p)) {
    variant = p.variants.find(x => x.name === c.v);
    if (!variant || !isVariantAvailable(p, variant)) return null;
    price = variant.price;
    disc = effectiveVarDisc(p, variant);
  } else if (!isProductAvailable(p)) {
    return null;
  }
  const maxStock = getEffectiveStock(p, variant);
  if (maxStock !== null && c.q > maxStock) c.q = maxStock;
  if (c.q < 1) return null;
  return { p, variant, price: discPrice(price, disc), origPrice: +price || 0, disc, maxStock };
}

function renderCart() {
  const cur = D.settings.currency || '';
  const prevLen = cart.length;
  cart = cart.filter(resolve);
  if (cart.length !== prevLen) {
    try { localStorage.setItem('cart', JSON.stringify(cart)); } catch (e) {}
  }
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
      <div class="t" style="flex:1">${esc(r.p.name)}<small>${esc(c.v)}${c.v ? ' · ' : ''}${fmt(r.price)} ${esc(cur)}${r.disc > 0 ? ` (خصم ${r.disc}%)` : ''}${r.maxStock !== null ? ` · المتوفر: ${r.maxStock}` : ''}</small></div>
      <div class="qty"><button data-m="${i}">−</button><span>${c.q}</span><button data-p="${i}" ${r.maxStock !== null && c.q >= r.maxStock ? 'disabled' : ''}>+</button></div>
    </div>`;
  }).join('');
  $('#cartBody').querySelectorAll('[data-m]').forEach(b => b.onclick = () => { const c = cart[+b.dataset.m]; c.q--; if (c.q < 1) cart.splice(+b.dataset.m, 1); saveCart(); });
  $('#cartBody').querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
    const c = cart[+b.dataset.p];
    const r = resolve(c);
    if (r && r.maxStock !== null && c.q >= r.maxStock) return;
    c.q++;
    saveCart();
  });
  $('#cartFoot').innerHTML = `<div class="row" style="justify-content:space-between;margin-bottom:10px"><b>الإجمالي</b><b>${fmt(total)} ${esc(cur)}</b></div>
    <button class="btn" id="order" style="width:100%">إرسال الطلب عبر واتساب</button>`;
  $('#order').onclick = () => {
    const num = (D.settings.whatsapp || '').replace(/\D/g, '');
    if (!num) { alert('لم يتم ضبط رقم واتساب في لوحة الإدارة'); return; }
    const lines = cart.map(c => { const r = resolve(c); return `• ${r.p.name}${c.v ? ' (' + c.v + ')' : ''} × ${c.q} = ${fmt(r.price * c.q)}`; });
    const msg = `طلب جديد:\n${lines.join('\n')}\nالإجمالي: ${fmt(total)} ${cur}`;

    cart.forEach(c => {
      const r = resolve(c);
      if (!r || r.maxStock === null) return;
      const key = r.variant ? `${r.p.id}::${r.variant.name}` : `${r.p.id}`;
      stockDeducted[key] = (Number(stockDeducted[key]) || 0) + c.q;
    });
    try { localStorage.setItem('stock_deducted', JSON.stringify(stockDeducted)); } catch (e) {}
    cart = [];
    saveCart();
    renderGrid();

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
