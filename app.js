const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => Number(n || 0).toLocaleString('en-US');

const APP_SHARE_URL = 'https://ldorava.github.io/Ldorava/index.html';
const LOW_STOCK_THRESHOLD = 3;

const clampDisc = d => Math.max(0, Math.min(99, Number(d) || 0));
const discPrice = (price, disc) => {
  const base = Number(price) || 0;
  const pct = clampDisc(disc);
  return pct > 0 ? Math.round(base * (1 - pct / 100)) : base;
};

function safeJsonParse(raw, fallback) {
  try {
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch (e) {
    return fallback;
  }
}

let D = { settings: {}, categories: [], products: [] };
let cart = safeJsonParse(localStorage.getItem('cart'), []);
if (!Array.isArray(cart)) cart = [];

let stockDeducted = safeJsonParse(localStorage.getItem('stock_deducted'), {});
if (!stockDeducted || typeof stockDeducted !== 'object' || Array.isArray(stockDeducted)) stockDeducted = {};

let orderNote = '';
try { orderNote = localStorage.getItem('order_note') || ''; } catch (e) {}

let cat = 'all', q = '';
let modalHistoryPushed = false;
let cartHistoryPushed = false;
let shareHistoryPushed = false;

const hasVariants = p => Array.isArray(p?.variants) && p.variants.length > 0;
const effectiveVarDisc = (p, v) => clampDisc(v?.discount || p?.discount || 0);

function getEffectiveStock(p, v = null) {
  const raw = v ? v?.stock : p?.stock;
  if (raw === null || raw === undefined || raw === '') return null;
  const key = v ? `${p.id}::${v.name}` : `${p.id}`;
  const used = Number(stockDeducted[key] || 0);
  return Math.max(0, Math.floor(Number(raw) || 0) - used);
}

function getCartQtyFor(pid, vName = '') {
  const item = cart.find(c => String(c.pid) === String(pid) && (c.v || '') === (vName || ''));
  return item ? Math.max(0, Math.floor(Number(item.q) || 0)) : 0;
}

function isVariantAvailable(p, v) {
  if (!v || v.inStock === false) return false;
  const st = getEffectiveStock(p, v);
  return st === null || st > 0;
}

function isProductAvailable(p) {
  if (!p) return false;
  if (hasVariants(p)) return p.variants.some(v => isVariantAvailable(p, v));
  if (p.inStock === false) return false;
  const st = getEffectiveStock(p, null);
  return st === null || st > 0;
}

function getLowStockLabel(p) {
  if (!isProductAvailable(p)) return '';
  if (hasVariants(p)) {
    const lowVars = p.variants.filter(v => {
      if (!isVariantAvailable(p, v)) return false;
      const st = getEffectiveStock(p, v);
      return st !== null && st > 0 && st <= LOW_STOCK_THRESHOLD;
    });
    if (!lowVars.length) return '';
    const minRem = Math.min(...lowVars.map(v => getEffectiveStock(p, v)));
    return `باقي ${minRem} فقط`; } const st = getEffectiveStock(p, null); if (st !== null && st > 0 && st <= LOW_STOCK_THRESHOLD) return `باقي ${st} فقط`;
  return '';
}

const minPrice = p => {
  if (hasVariants(p)) {
    const avail = p.variants.filter(v => isVariantAvailable(p, v));
    const pool = avail.length ? avail : p.variants;
    return Math.min(...pool.map(v => discPrice(v.price, effectiveVarDisc(p, v))));
  }
  return discPrice(p?.price, p?.discount || 0);
};
const hasAnyDiscount = p => {
  if (hasVariants(p)) return p.variants.some(v => effectiveVarDisc(p, v) > 0);
  return clampDisc(p?.discount || 0) > 0;
};
const catOf = p => (D.categories || []).find(c => c.id === p?.category);

const thumb = (p, v = null, fit = 'cover') => {
  const src = v?.image || p?.image || '';
  if (src) return `<img src="${esc(src)}" alt="${esc(v?.name ? `${p.name} - ${v.name}` : p?.name || '')}" loading="lazy" style="width:100%;height:100%;object-fit:${fit};display:block">`; return catOf(p)?.icon \vert{}\vert{} '🛍️'; };  const cardThumb = p => { if (hasVariants(p)) { const firstAvailable = p.variants.find(v => isVariantAvailable(p, v) && v.image) \vert{}\vert{} p.variants.find(v => v.image) \vert{}\vert{} p.variants[0]; return thumb(p, firstAvailable, 'cover'); } return thumb(p, null, 'cover'); };  function pushOverlayState(kind) { try { history.pushState({ overlay: kind, _ts: Date.now() }, ''); if (kind === 'product') modalHistoryPushed = true; if (kind === 'cart') cartHistoryPushed = true; if (kind === 'share') shareHistoryPushed = true; } catch (e) {} }  function hideProductOverlay(fromPopstate = false) { const pov = $('#pov'); if (!pov) return; const wasOpen = pov.classList.contains('show'); pov.classList.remove('show'); if (!fromPopstate && wasOpen && modalHistoryPushed) { modalHistoryPushed = false; try { history.back(); } catch (e) {} } else { modalHistoryPushed = false; } }  function closeShareModal(fromPopstate = false) { const ov = $('#shareOv'); if (!ov) return; const wasOpen = ov.classList.contains('show'); ov.classList.remove('show'); ov.style.display = 'none'; if (!fromPopstate && wasOpen && shareHistoryPushed) { shareHistoryPushed = false; try { history.back(); } catch (e) {} } else { shareHistoryPushed = false; } }  function ensureShareModal() { if ($('#shareOv')) return; const ov = document.createElement('div'); ov.id = 'shareOv'; ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.48);display:none;align-items:center;justify-content:center;padding:16px;z-index:9999'; const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodeURIComponent(APP_SHARE_URL)}`;
  ov.innerHTML = `
    <div id="shareBox" style="position:relative;width:100%;max-width:390px;background:#fff;border-radius:20px;padding:24px 20px;box-shadow:0 20px 50px rgba(0,0,0,.22);text-align:center;box-sizing:border-box">
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
    const shopTitle = D.settings?.name || "L'DORA Viva";
    if (navigator.share) {
      try {
        await navigator.share({
          title: shopTitle,
          text: `تصفحي منتجات ${shopTitle} — وكيل شركة L'DORA`, url: APP_SHARE_URL }); st.textContent = 'تمت المشاركة ✓'; return; } catch (e) { if (e && e.name === 'AbortError') return; } } window.open(`https://wa.me/?text=${encodeURIComponent(`${shopTitle}\n${APP_SHARE_URL}`)}`, '_blank');
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

function ensureScrollTopBtn() {
  if ($('#goTopBtn')) return;
  const btn = document.createElement('button');
  btn.id = 'goTopBtn';
  btn.type = 'button';
  btn.title = 'العودة للأعلى';
  btn.setAttribute('aria-label', 'العودة للأعلى');
  btn.innerHTML = '↑';
  btn.style.cssText = 'position:fixed;bottom:20px;left:18px;width:42px;height:42px;border-radius:50%;border:none;background:var(--pink,#d6336c);color:#fff;font-size:19px;font-weight:700;box-shadow:0 8px 22px rgba(0,0,0,.18);cursor:pointer;display:none;align-items:center;justify-content:center;z-index:990;transition:opacity .2s';
  btn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  document.body.appendChild(btn);

  const toggleTop = () => {
    btn.style.display = window.scrollY > 360 ? 'flex' : 'none';
  };
  window.addEventListener('scroll', toggleTop, { passive: true });
  toggleTop();
}

function renderAboutSection() {
  if ($('#aboutVivaSection')) return;
  const shopName = D.settings?.name || "L'DORA Viva";
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
          نحن <b>L'DORA Viva</b> وكيل معتمد لشركة <b>L'DORA</b>، نضع بين يديكِ عناية متكاملة تجمع بين الجودة العالية واللمسة العصرية لتمنحي جمالكِ إشراقة تدوم كل يوم. نحرص بعناية على اختيار منتجات أصلية وموثوقة تناسب مختلف الاحتياجات، مع تجربة تسوق سهلة وسريعة واستشارات مخصصة تساعدكِ في اختيار الأنسب لكِ بثقة وراحة بال.
        </p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:2px">
          <span style="background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:999px;padding:4px 12px;font-size:12.5px;color:#374151">💎 منتجات أصلية من L'DORA</span>
          <span style="background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:999px;padding:4px 12px;font-size:12.5px;color:#374151">💬 استشارات مجانية</span>
          <span style="background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:999px;padding:4px 12px;font-size:12.5px;color:#374151">✨ تنوع الأنواع والدرجات</span>
        </div>
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
    return;
  }
  if ($('#pov') && $('#pov').classList.contains('show')) {
    modalHistoryPushed = false;
    hideProductOverlay(true);
    return;
  }
  if ($('#drawer') && $('#drawer').classList.contains('show')) {
    cartHistoryPushed = false;
    closeCart(true);
  }
});

function reconcileDeductedCache() {
  let changed = false;
  for (const key of Object.keys(stockDeducted)) {
    const [pid, vname] = key.split('::');
    const p = (D.products || []).find(x => String(x.id) === String(pid));
    if (!p) { delete stockDeducted[key]; changed = true; continue; }
    const v = vname ? (p.variants || []).find(x => x.name === vname) : null;
    const raw = v ? v?.stock : p?.stock;
    if (raw === null || raw === undefined || Number(raw) === 0) {
      delete stockDeducted[key];
      changed = true;
    }
  }
  if (changed) {
    try { localStorage.setItem('stock_deducted', JSON.stringify(stockDeducted)); } catch (e) {}
  }
}

function cleanFooter() {
  if ($('#yr')) $('#yr').remove();
  const footer = $('footer');
  if (!footer) return;
  const walker = document.createTreeWalker(footer, NodeFilter.SHOW_TEXT);
  const toClean = [];
  let node;
  while ((node = walker.nextNode())) {
    if (/[©—–-]/.test(node.nodeValue)) toClean.push(node);
  }
  toClean.forEach(n => {
    n.nodeValue = n.nodeValue.replace(/[©—–-]/g, '').replace(/\s{2,}/g, ' ').trim();
  });
}

async function init() {
  try {
    const res = await fetch('data/store.json?v=' + Date.now(), { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      if (json && typeof json === 'object') {
        D = {
          settings: json.settings && typeof json.settings === 'object' ? json.settings : {},
          categories: Array.isArray(json.categories) ? json.categories : [],
          products: Array.isArray(json.products) ? json.products : []
        };
      }
    }
  } catch (e) {
    console.error('Store load error:', e);
  }

  try { reconcileDeductedCache(); } catch (e) {}
  const name = D.settings?.name || "L'DORA Viva";
  if ($('#shopName')) $('#shopName').textContent = name;
  document.title = name;
  try { cleanFooter(); } catch (e) {}
  document.querySelectorAll('a[href*="admin"], button[data-admin], #adminBtn, #adminLink').forEach(el => el.remove());

  renderNav();
  renderGrid();
  renderCart();
  renderAboutSection();
  ensureScrollTopBtn();
}

function renderNav() {
  const navEl = $('#nav');
  if (!navEl) return;
  const items = [{ id: 'all', name: 'الكل' }, ...(D.categories || [])];
  navEl.innerHTML = items.map(c =>
    `<button data-c="${esc(c.id)}" class="${c.id === cat ? 'on' : ''}">${esc(c.icon || '')} ${esc(c.name)}</button>`).join(''); navEl.querySelectorAll('button').forEach(b => b.onclick = () => { cat = b.dataset.c; renderNav(); renderGrid(); }); }  function renderGrid() { const gridEl = $('#grid'); if (!gridEl) return; const cur = D.settings?.currency \vert{}\vert{} ''; const allProds = Array.isArray(D.products) ? D.products : []; const list = allProds.filter(p => (cat === 'all' \vert{}\vert{} p.category === cat) && (!q \vert{}\vert{} (p.name + ' ' + (p.description \vert{}\vert{} '') + ' ' + (p.specs \vert{}\vert{} '') + ' ' + (p.usage \vert{}\vert{} '') + ' ' + (p.variants \vert{}\vert{} []).map(v => `${v.description || ''} ${v.specs \vert{}\vert{} ''}${v.usage || ''}`).join(' ')).toLowerCase().includes(q.toLowerCase())));

  gridEl.innerHTML = list.length ? list.map(p => {
    const available = isProductAvailable(p);
    const discounted = available && hasAnyDiscount(p);
    const lowStockText = getLowStockLabel(p);
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
          ${hasVariants(p) && p.variants.length > 1 ? 'من ' : ''}${fmt(minPrice(p))} ${esc(cur)}${discounted ? `<small style="text-decoration:line-through;color:var(--muted);margin-right:6px;font-weight:400">${fmt(origMin)}</small>` : ''}
        </div>
        ${!available
          ? `<div class="tag" style="color:#c92a2a;font-weight:700">غير متوفر حالياً</div>`
          : (lowStockText
              ? `<div class="tag" style="color:#b45309;font-weight:700">🔥 ${esc(lowStockText)}</div>`
              : (hasVariants(p) ? `<div class="tag">${p.variants.length} أنواع</div>` : ''))}
      </div>
    </div>`;
  }).join('') : '<div class="empty" style="grid-column:1/-1">لا توجد منتجات</div>';

  gridEl.querySelectorAll('.card').forEach(c => c.onclick = () => openProduct(c.dataset.id));
}

if ($('#search')) {
  $('#search').oninput = e => { q = e.target.value.trim(); renderGrid(); };
}

function openConsultWhatsApp(p, activeVariant) {
  const num = (D.settings?.whatsapp || '').replace(/\D/g, '');
  if (!num) { alert('لم يتم ضبط رقم واتساب في لوحة الإدارة'); return; }
  const variantLine = activeVariant ? `\nالنوع: ${activeVariant.name}` : ''; const msg = `مرحباً، أود الحصول على استشارة مجانية بخصوص المنتج:\nالمنتج: ${p.name}${variantLine}`; window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank'); }  function shareSingleProduct(p, activeVariant, finalPrice, cur) { const vPart = activeVariant ? ` (${activeVariant.name})` : '';
  const text = `${p.name}${vPart}\nالسعر: ${fmt(finalPrice)}${cur}\n${APP_SHARE_URL}`; if (navigator.share) { navigator.share({ title: p.name, text, url: APP_SHARE_URL }).catch(() => {}); return; } window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

function openProduct(id) {
  const p = (D.products || []).find(x => String(x.id) === String(id)); if (!p) return;
  let sel = hasVariants(p)
    ? (() => {
        const idx = p.variants.findIndex(v => isVariantAvailable(p, v));
        return idx >= 0 ? idx : 0;
      })()
    : -1;
  let qty = 1;

  const draw = () => {
    const cur = D.settings?.currency || '';
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
           ${specsText ? `<div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(0,0,0,.09);background:#fafafa;line-height:1.7;white-space:pre-line"> <div style="font-weight:700;margin-bottom:4px;color:var(--pink)">المواصفات${activeVariant ? ` (${esc(activeVariant.name)})` : ''}</div>
             <div>${esc(specsText)}</div>
           </div>` : ''}
           ${usageText ? `<div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(0,0,0,.09);background:#fafafa;line-height:1.7;white-space:pre-line"> <div style="font-weight:700;margin-bottom:4px;color:var(--pink)">طريقة الاستعمال${activeVariant ? ` (${esc(activeVariant.name)})` : ''}</div>
             <div>${esc(usageText)}</div>
           </div>` : ''}
         </div>`
      : '';

    const priceBlockHtml = activeDisc > 0
      ? `<div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
           <span style="font-size:1.3rem;color:var(--pink);font-weight:700">${fmt(finalPrice)}${esc(cur)}</span>
           <span style="font-size:.95rem;color:var(--muted);text-decoration:line-through">${fmt(rawPrice)}${esc(cur)}</span>
           <span style="background:#ffe5e8;color:#c92a2a;font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px
