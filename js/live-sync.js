/**
 * Sango Fiora — Live catalog sync
 * Keeps every product card and product page in step with the Supabase `products` table:
 *  - products deleted/hidden in Admin disappear from the storefront
 *  - products added in Admin appear in the catalogue / their collection
 *  - price, stock and sold-out changes are applied in place
 * Static HTML stays as an instant first paint and SEO fallback; the database is the source of truth.
 */
(function () {
  'use strict';

  var started = false;
  var timer = null;

  function esc(s) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(s == null ? '' : String(s)));
    return d.innerHTML.replace(/"/g, '&quot;');
  }

  function isSold(p) { return !!p.isSoldOut || (p.stock != null && p.stock <= 0); }
  function slugOf(card) {
    var b = card.querySelector('[data-add-to-cart],[data-wishlist-btn]');
    return b ? b.dataset.slug : null;
  }

  var BTN_ADD = 'bg-amber-gold hover:bg-amber-400 text-deep-forest text-xs font-bold px-3.5 py-1.5 rounded-full transition-colors shrink-0 shadow-sm';
  var BTN_SOLD = 'bg-gray-200 text-gray-400 cursor-not-allowed text-xs font-bold px-3.5 py-1.5 rounded-full shrink-0 shadow-sm';

  function productHref(p, staticHref) { return staticHref || ('/product/?slug=' + encodeURIComponent(p.slug)); }

  function buildCard(p) {
    var sold = isSold(p);
    var el = document.createElement('article');
    el.className = 'product-card group bg-white rounded-2xl overflow-hidden border border-outline-variant/30 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col relative';
    el.dataset.category = p.category; el.dataset.price = p.price; el.dataset.rating = p.rating;
    el.dataset.discount = p.discount || 0; el.dataset.name = p.name;
    var href = productHref(p);
    var attrs = 'data-slug="' + esc(p.slug) + '" data-name="' + esc(p.name) + '" data-variant="' + esc(p.variant) + '" data-category="' + esc(p.category) +
      '" data-size="' + esc(p.size) + '" data-price="' + p.price + '" data-mrp="' + p.mrp + '" data-image="' + esc(p.image) + '" data-stock="' + p.stock + '"';
    el.innerHTML =
      '<a href="' + href + '" class="relative block aspect-square overflow-hidden bg-surface-container">' +
        '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy" decoding="async" width="300" height="300" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">' +
        (sold ? '<span class="sold-out-badge absolute top-3 left-3 bg-red-600 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full shadow-sm z-10">SOLD OUT</span>'
              : (p.discount ? '<span class="discount-badge absolute top-3 left-3 bg-red-600 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full shadow-sm">SAVE ' + p.discount + '%</span>' : '')) +
      '</a>' +
      '<button type="button" aria-label="Add to wishlist" data-wishlist-btn ' + attrs.replace(/data-variant="[^"]*" /, '') + ' class="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 backdrop-blur border border-outline-variant/30 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors shadow-sm z-10"><span class="material-symbols-outlined text-sm">favorite</span></button>' +
      '<div class="p-4 flex flex-col flex-1">' +
        '<p class="text-[11px] font-semibold text-deep-forest/80 uppercase tracking-wider mb-1">' + esc(p.category) + ' · ' + esc(p.size) + '</p>' +
        '<a href="' + href + '" class="font-headline-sm font-bold text-gray-900 leading-snug hover:text-deep-forest transition-colors text-sm line-clamp-1">' + esc(p.name) + '</a>' +
        '<div class="flex items-center gap-1.5 mt-1.5"><span class="text-[10px] font-semibold tracking-wider text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60 uppercase">Handcrafted</span></div>' +
        '<div class="mt-auto pt-3 flex items-end justify-between gap-2">' +
          '<div><span class="live-price text-base font-bold text-deep-forest">₹' + p.price + '</span>' + (p.mrp > p.price ? '<span class="live-mrp ml-1 text-xs text-gray-400 line-through">₹' + p.mrp + '</span>' : '') + '</div>' +
          '<button type="button" ' + (sold ? 'disabled' : 'data-add-to-cart') + ' ' + attrs + ' aria-label="Add ' + esc(p.name) + ' to cart" class="' + (sold ? BTN_SOLD : BTN_ADD) + '">' + (sold ? 'Sold Out' : 'Add +') + '</button>' +
        '</div>' +
      '</div>';
    return el;
  }

  function patchCard(card, p) {
    var sold = isSold(p);
    card.dataset.price = p.price; card.dataset.discount = p.discount || 0; card.dataset.name = p.name;
    card.dataset.rating = p.rating; card.dataset.category = p.category;

    // price & mrp
    var priceEl = card.querySelector('.text-base.font-bold.text-deep-forest');
    if (priceEl) {
      priceEl.textContent = '₹' + p.price;
      var mrpEl = card.querySelector('.line-through');
      if (p.mrp > p.price) {
        if (!mrpEl) { mrpEl = document.createElement('span'); mrpEl.className = 'ml-1 text-xs text-gray-400 line-through'; priceEl.parentNode.appendChild(mrpEl); }
        mrpEl.textContent = '₹' + p.mrp;
      } else if (mrpEl) { mrpEl.remove(); }
    }

    // buttons keep fresh data for cart
    card.querySelectorAll('[data-add-to-cart],[data-wishlist-btn]').forEach(function (b) {
      b.dataset.price = p.price; b.dataset.mrp = p.mrp; b.dataset.stock = p.stock; b.dataset.name = p.name; b.dataset.image = p.image;
    });

    // badges
    var imgLink = card.querySelector('a');
    var soldBadge = card.querySelector('.sold-out-badge');
    var discBadge = Array.prototype.find.call(card.querySelectorAll('a span'), function (s) { return /^SAVE/.test(s.textContent); });
    if (sold) {
      if (discBadge) discBadge.remove();
      if (!soldBadge && imgLink) {
        var b = document.createElement('span');
        b.className = 'sold-out-badge absolute top-3 left-3 bg-red-600 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full shadow-sm z-10';
        b.textContent = 'SOLD OUT'; imgLink.appendChild(b);
      }
    } else {
      if (soldBadge) soldBadge.remove();
      if (p.discount && imgLink) {
        if (!discBadge) {
          discBadge = document.createElement('span');
          discBadge.className = 'absolute top-3 left-3 bg-red-600 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full shadow-sm';
          imgLink.appendChild(discBadge);
        }
        discBadge.textContent = 'SAVE ' + p.discount + '%';
      } else if (discBadge) { discBadge.remove(); }
    }

    // add-to-cart button state
    var btn = card.querySelector('button[data-slug]:not([data-wishlist-btn])');
    if (btn) {
      if (sold) { btn.removeAttribute('data-add-to-cart'); btn.disabled = true; btn.textContent = 'Sold Out'; btn.className = BTN_SOLD; }
      else { btn.setAttribute('data-add-to-cart', ''); btn.disabled = false; btn.textContent = 'Add +'; btn.className = BTN_ADD; }
    }

    // low-stock pill
    var pill = Array.prototype.find.call(card.querySelectorAll('div'), function (d) { return /left in stock/.test(d.textContent) && d.children.length <= 2 && d.className.indexOf('amber') !== -1; });
    if (pill && p.stock > 4) pill.remove();
    else if (pill) pill.lastChild.textContent = 'Only ' + p.stock + ' left in stock — order soon!';
  }

  function reconcileCards(map) {
    document.querySelectorAll('.product-card').forEach(function (card) {
      var slug = slugOf(card);
      if (!slug) return;
      var p = map[slug];
      if (!p || p.isActive === false) { card.remove(); return; }
      patchCard(card, p);
    });
  }

  function addNewProducts(products, map) {
    var grids = [];
    var all = document.getElementById('all-products-grid');
    if (all) grids.push({ el: all, category: null });
    var col = document.getElementById('collection-grid');
    if (col) grids.push({ el: col, category: col.dataset.category || null });

    grids.forEach(function (g) {
      var present = {};
      Array.prototype.forEach.call(g.el.children, function (c) { var s = slugOf(c); if (s) present[s] = true; });
      var frag = document.createDocumentFragment();
      products.forEach(function (p) {
        if (present[p.slug] || p.isActive === false) return;
        if (g.category && p.category !== g.category) return;
        frag.appendChild(buildCard(p));
      });
      if (frag.childNodes.length) g.el.appendChild(frag);
    });
  }

  function updateCollectionCounts(products) {
    var counts = {};
    products.forEach(function (p) { counts[p.category] = (counts[p.category] || 0) + 1; });
    document.querySelectorAll('[data-collection-count]').forEach(function (el) {
      var c = el.dataset.collectionCount;
      if (counts[c] != null) el.textContent = counts[c];
    });
  }

  // ── Product detail page (static /products/<slug>/) ──
  function patchDetailPage(map, loaded) {
    var qty = document.getElementById('pdp-qty');
    if (!qty) return;
    var anyBtn = document.querySelector('[data-add-to-cart][data-slug], [data-buy-now][data-slug]');
    if (!anyBtn) return;
    var slug = anyBtn.dataset.slug;
    var p = map[slug];
    var btns = document.querySelectorAll('[data-add-to-cart][data-slug], [data-buy-now][data-slug]');
    var banner = document.getElementById('live-product-banner');

    function setBanner(html, tone) {
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'live-product-banner';
        var host = document.getElementById('pdp-price') ? document.getElementById('pdp-price').closest('.border-y') : null;
        if (host && host.parentNode) host.parentNode.insertBefore(banner, host); else document.body.insertBefore(banner, document.body.firstChild);
      }
      banner.className = 'rounded-2xl px-4 py-3 text-sm font-semibold border ' + (tone === 'bad' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-900 border-amber-200');
      banner.innerHTML = html;
    }
    function disable(label) {
      btns.forEach(function (b) {
        b.disabled = true; b.removeAttribute('data-add-to-cart'); b.removeAttribute('data-buy-now');
        b.classList.add('opacity-60', 'cursor-not-allowed'); b.textContent = label;
      });
    }

    if (!p || p.isActive === false) {
      if (!loaded) return;
      setBanner('This product is no longer available. <a class="underline" href="/products/">Browse the full collection</a>', 'bad');
      disable('Unavailable');
      return;
    }
    var priceEl = document.getElementById('pdp-price');
    if (priceEl) {
      priceEl.textContent = '₹' + p.price;
      var wrap = priceEl.parentNode;
      Array.prototype.slice.call(wrap.querySelectorAll('.line-through, .bg-red-50')).forEach(function (n) { n.remove(); });
      if (p.mrp > p.price) {
        var m = document.createElement('span'); m.className = 'text-lg text-gray-400 line-through'; m.textContent = '₹' + p.mrp; wrap.appendChild(m);
        var s = document.createElement('span'); s.className = 'bg-red-50 text-red-600 border border-red-200 text-xs font-bold px-2.5 py-1 rounded-lg'; s.textContent = 'Save ₹' + (p.mrp - p.price); wrap.appendChild(s);
      }
    }
    btns.forEach(function (b) { b.dataset.price = p.price; b.dataset.mrp = p.mrp; b.dataset.stock = p.stock; });
    qty.dataset.maxStock = Math.max(1, p.stock); qty.max = Math.max(1, p.stock);
    if (parseInt(qty.value, 10) > p.stock && p.stock > 0) qty.value = p.stock;
    if (isSold(p)) { setBanner('This item is currently sold out.', 'warn'); disable('Sold Out'); }
    else if (banner) { banner.remove(); banner = null; }
  }

  var firstLoad = true;
  function refresh() {
    if (!window.SangoAPI || !window.SangoSupabase) return;
    window.SangoAPI.getProducts({ force: true }).then(function (products) {
      if (!Array.isArray(products)) return;
      var map = {};
      products.forEach(function (p) { map[p.slug] = p; });
      // Never wipe the page because of an empty / failed response
      var trusted = products.length > 0;
      if (trusted) {
        reconcileCards(map);
        addNewProducts(products, map);
        updateCollectionCounts(products);
        patchDetailPage(map, true);
      }
      document.dispatchEvent(new CustomEvent('sango:catalog-updated', { detail: { products: products } }));
      firstLoad = false;
    }).catch(function (e) { console.warn('[Sango] Live catalog sync skipped:', e && e.message); });
  }

  function schedule() { clearTimeout(timer); timer = setTimeout(refresh, 250); }

  function start() {
    if (started) return;
    if (!window.SangoSupabase || !window.SangoAPI) { return setTimeout(start, 150); }
    started = true;
    refresh();
    window.SangoAPI.onProductsChange(schedule);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) schedule(); });
  }

  document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 50); });
})();
