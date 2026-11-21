/**
 * Sango Fiora — Advanced Cart Engine & Dynamic Coupon Engine
 */
(function () {
  'use strict';

  // XSS protection: escape user-facing strings before inserting into innerHTML
  function escapeHTML(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str == null ? '' : String(str)));
    return div.innerHTML;
  }

  var STORAGE_KEY = 'sango-cart-v3';
  var STORAGE_VERSION = 3;
  var FREE_SHIP_ABOVE = 999;
  var DELIVERY_FEE = 99;

  // Hardcoded coupons (fallback when Supabase not configured)
  var VALID_COUPONS = {
    'WELCOME10': { percent: 10, label: '10% New Member Discount' },
    'PLANTLOVE15': { percent: 15, label: '15% Plant Lover Discount' },
    'BULK20': { percent: 20, label: '20% Bulk Order Discount', minSubtotal: 5000 },
    'SANGO10': { percent: 10, label: '10% Welcome Discount' }
  };

  // Load coupons from Supabase if available (overrides hardcoded)
  function loadCouponsFromSupabase() {
    if (!window.SangoSupabase) return;
    window.SangoSupabase.from('coupons').select('*').eq('is_active', true).then(function (res) {
      if (res.data && res.data.length > 0) {
        VALID_COUPONS = {};
        res.data.forEach(function (c) {
          VALID_COUPONS[c.code] = {
            percent: c.percent,
            label: c.label,
            minSubtotal: c.min_subtotal || 0
          };
        });
        console.log('[Sango] Coupons loaded from Supabase', Object.keys(VALID_COUPONS).length);
      }
    });
  }
  // Load on page ready (after Supabase client is initialized)
  setTimeout(loadCouponsFromSupabase, 500);

  function readCartData() {
    try {
      var d = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (d && d.version === STORAGE_VERSION) return d;
      return migrateCart(d);
    } catch (e) {
      return { version: STORAGE_VERSION, items: [], coupon: null };
    }
  }

  function migrateCart(oldData) {
    var items = [];
    if (oldData && Array.isArray(oldData.items)) items = oldData.items;
    else if (Array.isArray(oldData)) items = oldData;
    else {
      try {
        var prev = JSON.parse(localStorage.getItem('sango-cart') || localStorage.getItem('sango_cart'));
        if (Array.isArray(prev)) items = prev;
        else if (prev && prev.items) items = prev.items;
      } catch (err) {}
    }
    var migrated = {
      version: STORAGE_VERSION,
      items: items || [],
      coupon: (oldData && oldData.coupon) || null
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated)); } catch (e) {}
    return migrated;
  }

  var syncTimeout = null;
  function writeCartData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (window.AppEvent) window.AppEvent.emit('cart:updated', data);

    // Sync user's private cart to PostgreSQL / Spring Boot backend and Supabase user_carts table
    var user = window.SangoAuth && window.SangoAuth.getUser ? window.SangoAuth.getUser() : null;
    if (user) {
      clearTimeout(syncTimeout);
      syncTimeout = setTimeout(function () {
        var items = data.items || [];
        var totalCount = items.reduce(function (sum, it) { return sum + it.qty; }, 0);
        var subtotal = items.reduce(function (sum, it) { return sum + (it.qty * it.price); }, 0);

        // Supabase sync (validate UUID before query to prevent Postgres syntax error)
        var isUuid = user.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id);
        if (window.SangoSupabase && isUuid) {
          window.SangoSupabase.from('user_carts').upsert({
            user_id: user.id,
            items: items,
            coupon_code: data.coupon,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' }).then(function (res) {
            if (res.error) console.warn('[Sango] Supabase cart sync notice:', res.error.message);
          });
        }

        // Spring Boot backend sync
        if (user.email && window.SangoAPI && window.SangoAPI.syncCart) {
          window.SangoAPI.syncCart({
            email: user.email,
            itemsJson: JSON.stringify(items),
            itemCount: totalCount,
            subtotal: subtotal
          }).catch(function (err) {
            console.error('[Cart] Backend cart sync error:', err);
          });
        }
      }, 350);
    }
  }

  // Handle Auth Changes — Load User's Synced Cart on Sign-In, Clear on Sign-Out
  if (window.AppEvent) {
    window.AppEvent.on('auth:changed', function (authData) {
      if (authData.user) {
        // Execute pending cart action that required sign-in
        if (window._pendingCartAction) {
          var pending = window._pendingCartAction;
          window._pendingCartAction = null;
          if (pending.action === 'add') {
            window.CartEngine.addToCart(pending.item, pending.qty);
          } else if (pending.action === 'buy-now') {
            window.CartEngine.addToCart(pending.item, pending.qty);
            window.location.href = '/checkout/';
          }
        }

        // Try Supabase user_carts first
        var isUuid = authData.user.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authData.user.id);
        if (window.SangoSupabase && isUuid) {
          window.SangoSupabase.from('user_carts').select('*').eq('user_id', authData.user.id).single().then(function (res) {
            if (res.data && res.data.items && res.data.items.length > 0) {
              var current = readCartData();
              if (!current.items || current.items.length === 0) {
                current.items = res.data.items;
                if (res.data.coupon_code) current.coupon = res.data.coupon_code;
                writeCartData(current);
                if (window.showToast) window.showToast('Restored your saved botanical cart!');
              }
            }
          }).catch(function (err) {
            console.error('[Cart] Supabase user_carts error:', err);
          });
        }

        // Also check Spring Boot backend
        if (authData.user.email && window.SangoAPI && window.SangoAPI.getSyncedCart) {
          window.SangoAPI.getSyncedCart(authData.user.email)
            .then(function (data) {
              if (data && data.itemsJson) {
                try {
                  var restoredItems = JSON.parse(data.itemsJson);
                  var current = readCartData();
                  if ((!current.items || current.items.length === 0) && restoredItems.length > 0) {
                    current.items = restoredItems;
                    writeCartData(current);
                    if (window.showToast) window.showToast('Restored your saved botanical cart!');
                  }
                } catch (e) {
                  console.error('[Cart] Synced cart JSON parse error:', e);
                }
              }
            }).catch(function (err) {
              console.error('[Cart] Backend cart fetch error:', err);
            });
        }
      }
    });
  }

  function formatCurrency(n) {
    return '₹' + Number(n || 0).toLocaleString('en-IN');
  }

  window.CartEngine = {
    getItems: function () { return readCartData().items; },
    getCoupon: function () { return readCartData().coupon; },

    getTotals: function () {
      var data = readCartData();
      var items = data.items;
      var subtotal = items.reduce(function (n, i) { return n + (i.qty * i.price); }, 0);
      var mrpTotal = items.reduce(function (n, i) { return n + (i.qty * (i.mrp || i.price)); }, 0);
      var mrpSavings = Math.max(0, mrpTotal - subtotal);
      var count = items.reduce(function (n, i) { return n + i.qty; }, 0);

      // Multi-Item Volume Tier Discount (B2B / Bulk Gifting) via DiscountEngine
      var discountInfo = window.DiscountEngine ? window.DiscountEngine.calculateVolumeDiscount(count, subtotal) : { percent: 0, amount: 0, label: '' };
      var volumeDiscountPercent = discountInfo.percent;
      var volumeDiscount = discountInfo.amount;
      var volumeLabel = discountInfo.label;

      var couponDiscount = 0;
      if (data.coupon && VALID_COUPONS[data.coupon]) {
        var rule = VALID_COUPONS[data.coupon];
        if (!rule.minSubtotal || subtotal >= rule.minSubtotal) {
          couponDiscount = Math.round(subtotal * (rule.percent / 100));
        }
      }

      var delivery = (subtotal >= FREE_SHIP_ABOVE || items.length === 0) ? 0 : DELIVERY_FEE;
      var taxableSubtotal = Math.max(0, subtotal - couponDiscount - volumeDiscount);
      var gstAmount = window.DiscountEngine ? window.DiscountEngine.calculateGst(taxableSubtotal) : Math.round(taxableSubtotal * 0.18);
      var netTotal = taxableSubtotal + delivery;

      return {
        count: count,
        subtotal: subtotal,
        mrpTotal: mrpTotal,
        mrpSavings: mrpSavings,
        volumeDiscountPercent: volumeDiscountPercent,
        volumeDiscount: volumeDiscount,
        volumeLabel: volumeLabel,
        couponCode: data.coupon,
        couponDiscount: couponDiscount,
        couponLabel: data.coupon && VALID_COUPONS[data.coupon] ? VALID_COUPONS[data.coupon].label : '',
        deliveryFee: delivery,
        gstAmount: gstAmount,
        netTotal: netTotal
      };
    },

    addToCart: function (item, qty) {
      var data = readCartData();
      var items = data.items;
      var q = Math.max(1, parseInt(qty || 1, 10));
      var stockLimit = parseInt(item.stock || 15, 10);
      var found = items.find(function (i) { return i.slug === item.slug; });

      if (found) {
        if (stockLimit && (found.qty + q) > stockLimit) {
          var allowed = Math.max(0, stockLimit - found.qty);
          if (allowed <= 0) {
            if (window.showToast) window.showToast('Only ' + stockLimit + ' left in database stock — reached limit.');
            openDrawer();
            return;
          }
          found.qty = stockLimit;
          if (window.showToast) window.showToast('Stock limit: Added ' + allowed + ' (maximum stock is ' + stockLimit + ').');
        } else {
          found.qty += q;
          if (window.showToast) window.showToast(item.name + ' added to cart');
        }
      } else {
        if (stockLimit && q > stockLimit) {
          q = stockLimit;
          if (window.showToast) window.showToast('Only ' + stockLimit + ' in stock. Quantity adjusted to ' + stockLimit + '.');
        } else {
          if (window.showToast) window.showToast(item.name + ' added to cart');
        }
        items.push({
          slug: item.slug,
          name: item.name,
          variant: item.variant || '',
          category: item.category || '',
          size: item.size || '',
          price: parseInt(item.price, 10),
          mrp: parseInt(item.mrp || item.price, 10),
          image: item.image,
          stock: stockLimit,
          qty: q
        });
      }
      writeCartData(data);
      openDrawer();
    },

    setQty: function (slug, qty) {
      var data = readCartData();
      var q = parseInt(qty, 10);
      if (q <= 0) {
        data.items = data.items.filter(function (i) { return i.slug !== slug; });
      } else {
        var it = data.items.find(function (i) { return i.slug === slug; });
        if (it) {
          var stockLimit = parseInt(it.stock || 15, 10);
          if (stockLimit && q > stockLimit) {
            it.qty = stockLimit;
            if (window.showToast) window.showToast('Only ' + stockLimit + ' left in database stock.');
          } else {
            it.qty = q;
          }
        }
      }
      writeCartData(data);
    },

    applyCoupon: function (code, callback) {
      var c = (code || '').trim().toUpperCase();
      if (!c) {
        var data = readCartData();
        data.coupon = null;
        writeCartData(data);
        var resObj = { success: true, message: 'Coupon removed' };
        if (callback) callback(resObj);
        return resObj;
      }

      var totals = this.getTotals();
      var user = window.SangoAuth && window.SangoAuth.getUser ? window.SangoAuth.getUser() : null;
      var userEmail = user ? (user.email || '') : '';

      // Validate against Spring Boot backend with First-Time Buyer check via SangoAPI
      var validateCall = (window.SangoAPI && window.SangoAPI.validateCoupon)
        ? window.SangoAPI.validateCoupon(c, totals.subtotal)
        : fetch('/api/coupons/validate?code=' + encodeURIComponent(c)).then(function (res) { return res.json(); });

      validateCall.then(function (res) {
        if (res && (res.valid || res.discountPercent)) {
          VALID_COUPONS[c] = { percent: res.percent || res.discountPercent, label: res.label || 'Discount', minSubtotal: 0 };
          var d = readCartData();
          d.coupon = c;
          writeCartData(d);
          var msg = res.message || ('Coupon "' + c + '" applied successfully!');
          if (callback) callback({ success: true, message: msg, discountAmount: res.discountAmount });
        } else {
          var d2 = readCartData();
          if (d2.coupon === c) {
            d2.coupon = null;
            writeCartData(d2);
          }
          var errMsg = (res && res.message) || 'Invalid coupon code';
          if (callback) callback({ success: false, message: errMsg });
        }
      }).catch(function (err) {
        console.error('[Cart] Coupon validation error:', err);
        if (VALID_COUPONS[c]) {
          var d = readCartData();
          d.coupon = c;
          writeCartData(d);
          if (callback) callback({ success: true, message: 'Coupon applied!' });
        } else {
          if (callback) callback({ success: false, message: 'Invalid coupon code.' });
        }
      });

      return { success: true, message: 'Validating coupon with botanical server...' };
    },

    clearCart: function () {
      writeCartData({ items: [], coupon: null });
      var user = window.SangoAuth && window.SangoAuth.getUser ? window.SangoAuth.getUser() : null;
      if (user && user.email && window.SangoAPI && window.SangoAPI.deleteSyncedCart) {
        window.SangoAPI.deleteSyncedCart(user.email).catch(function (err) {
          console.error('[Cart] Clear synced cart notice:', err);
        });
      }
    }
  };

  // ---------- Slide-Over Drawer UI ----------
  function openDrawer() {
    var drawer = document.getElementById('cart-drawer');
    var overlay = document.getElementById('cart-drawer-overlay');
    if (!drawer || !overlay) return;
    renderDrawer();
    drawer.classList.remove('translate-x-full');
    overlay.classList.remove('hidden');
    requestAnimationFrame(function () { overlay.classList.remove('opacity-0'); });
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    var drawer = document.getElementById('cart-drawer');
    var overlay = document.getElementById('cart-drawer-overlay');
    if (!drawer || !overlay) return;
    drawer.classList.add('translate-x-full');
    overlay.classList.add('opacity-0');
    setTimeout(function () { overlay.classList.add('hidden'); }, 300);
    document.body.style.overflow = '';
  }

  function renderDrawer() {
    var items = window.CartEngine.getItems();
    var totals = window.CartEngine.getTotals();

    var wrap = document.getElementById('drawer-items');
    var countEl = document.getElementById('drawer-count');
    var subEl = document.getElementById('drawer-subtotal');
    var delEl = document.getElementById('drawer-delivery');
    var totEl = document.getElementById('drawer-total');
    var badgeEl = document.getElementById('cart-badge');

    if (countEl) countEl.textContent = totals.count;
    if (badgeEl) {
      badgeEl.textContent = totals.count;
      badgeEl.classList.toggle('hidden', totals.count === 0);
      badgeEl.classList.toggle('flex', totals.count > 0);
    }

    // Dynamic Free Shipping Progress Calculation
    var shipText = document.getElementById('drawer-shipping-text');
    var shipPct = document.getElementById('drawer-shipping-pct');
    var shipFill = document.getElementById('drawer-shipping-fill');
    if (shipText && shipFill) {
      if (totals.subtotal >= FREE_SHIP_ABOVE) {
        shipText.textContent = 'You unlocked FREE Delivery across India!';
        if (shipPct) shipPct.textContent = '100%';
        shipFill.style.width = '100%';
        shipFill.className = 'bg-emerald-600 h-full transition-all duration-500 rounded-full';
      } else {
        var needed = FREE_SHIP_ABOVE - totals.subtotal;
        var pct = Math.min(100, Math.round((totals.subtotal / FREE_SHIP_ABOVE) * 100));
        shipText.textContent = 'Add ' + formatCurrency(needed) + ' more for FREE Delivery';
        if (shipPct) shipPct.textContent = pct + '%';
        shipFill.style.width = pct + '%';
        shipFill.className = 'bg-[#1B4332] h-full transition-all duration-500 rounded-full';
      }
    }

    if (!wrap) return;

    if (!items.length) {
      wrap.innerHTML =
        '<div class="text-center py-16">' +
        '<div class="text-6xl mb-4"><span class="material-symbols-outlined ico" aria-hidden="true">potted_plant</span></div>' +
        '<p class="font-bold text-gray-900 text-lg mb-1">Your cart is empty</p>' +
        '<p class="text-xs text-gray-400 mb-6">Add some handcrafted artificial plants to get started!</p>' +
        '<a href="/products/" class="inline-block bg-amber-500 text-plant-dark px-6 py-2.5 rounded-full font-bold text-xs">Browse Artificial Plants</a></div>';
      if (subEl) subEl.textContent = formatCurrency(0);
      if (totEl) totEl.textContent = formatCurrency(0);
      if (delEl) delEl.textContent = '—';
      return;
    }

    wrap.innerHTML = items.map(function (i) {
      var safeName = escapeHTML(i.name);
      var safeSlug = escapeHTML(i.slug);
      var safeImage = escapeHTML(i.image);
      var safeSize = escapeHTML(i.size);
      return '<div class="flex gap-3 items-center py-3 border-b border-gray-100 last:border-0" data-slug="' + safeSlug + '">' +
        '<img src="' + safeImage + '" alt="" loading="lazy" class="w-14 h-14 rounded-xl object-cover bg-green-50 shrink-0">' +
        '<div class="flex-1 min-w-0">' +
        '<p class="font-bold text-xs text-gray-900 truncate">' + safeName + '</p>' +
        (i.size ? '<p class="text-[11px] text-gray-400">' + safeSize + ' · Pot Included</p>' : '') +
        '<p class="text-xs font-bold text-plant-main">' + formatCurrency(i.price) + '</p></div>' +
        '<div class="flex items-center gap-1 shrink-0">' +
        '<button type="button" data-dec="' + safeSlug + '" class="w-7 h-7 rounded-lg border border-gray-200 hover:bg-green-50 font-bold text-xs">−</button>' +
        '<span class="w-6 text-center text-xs font-bold">' + i.qty + '</span>' +
        '<button type="button" data-inc="' + safeSlug + '" class="w-7 h-7 rounded-lg border border-gray-200 hover:bg-green-50 font-bold text-xs">+</button>' +
        '<button type="button" data-remove="' + safeSlug + '" class="ml-1 text-gray-300 hover:text-red-500 text-base font-bold">&times;</button>' +
        '</div></div>';
    }).join('');

    if (subEl) subEl.textContent = formatCurrency(totals.subtotal);
    if (delEl) delEl.textContent = totals.deliveryFee === 0 ? 'FREE' : formatCurrency(totals.deliveryFee);
    if (totEl) totEl.textContent = formatCurrency(totals.netTotal);

    // Multi-Item Volume Tier Discount & Coupon rendering
    var volTier = document.getElementById('drawer-volume-tier');
    var volText = document.getElementById('drawer-volume-text');
    var volTag = document.getElementById('drawer-volume-tag');
    var volRow = document.getElementById('drawer-volume-row');
    var volDiscountEl = document.getElementById('drawer-volume-discount');
    var couponRow = document.getElementById('drawer-coupon-row');
    var couponDiscountEl = document.getElementById('drawer-coupon-discount');

    if (volTier && volText) {
      if (totals.count === 0) {
        volTier.classList.add('hidden');
      } else if (totals.count < 3) {
        volTier.classList.remove('hidden');
        var need = 3 - totals.count;
        volText.textContent = 'Add ' + need + ' more plant' + (need > 1 ? 's' : '') + ' for 5% Bulk Volume Discount!';
        if (volTag) volTag.classList.add('hidden');
      } else if (totals.count < 5) {
        volTier.classList.remove('hidden');
        var need5 = 5 - totals.count;
        volText.textContent = '5% Bulk Discount Active! Add ' + need5 + ' more for 10% discount!';
        if (volTag) {
          volTag.classList.remove('hidden');
          volTag.textContent = '5% Active';
        }
      } else {
        volTier.classList.remove('hidden');
        volText.textContent = '10% B2B / Bulk Styling Discount Applied!';
        if (volTag) {
          volTag.classList.remove('hidden');
          volTag.textContent = '10% Active';
        }
      }
    }

    if (volRow && volDiscountEl) {
      if (totals.volumeDiscount > 0) {
        volRow.classList.remove('hidden');
        volRow.classList.add('flex');
        volDiscountEl.textContent = '-' + formatCurrency(totals.volumeDiscount);
      } else {
        volRow.classList.add('hidden');
        volRow.classList.remove('flex');
      }
    }

    if (couponRow && couponDiscountEl) {
      if (totals.couponDiscount > 0) {
        couponRow.classList.remove('hidden');
        couponRow.classList.add('flex');
        couponDiscountEl.textContent = '-' + formatCurrency(totals.couponDiscount);
      } else {
        couponRow.classList.add('hidden');
        couponRow.classList.remove('flex');
      }
    }
  }

  // Delegated UI Handlers
  document.addEventListener('click', function (e) {
    // Add to cart buttons
    var addBtn = e.target.closest('[data-add-to-cart]');
    if (addBtn) {
      e.preventDefault();

      var itemData = {
        slug: addBtn.dataset.slug,
        name: addBtn.dataset.name,
        variant: addBtn.dataset.variant || '',
        category: addBtn.dataset.category || '',
        size: addBtn.dataset.size || '',
        price: parseInt(addBtn.dataset.price, 10),
        mrp: parseInt(addBtn.dataset.mrp || addBtn.dataset.price, 10),
        stock: parseInt(addBtn.dataset.stock || '15', 10),
        image: addBtn.dataset.image
      };
      var itemQty = parseInt(addBtn.dataset.qty || '1', 10);

      // Security & Business Rule: Require authenticated member to add items to cart
      var isAuthed = window.SangoAuth && window.SangoAuth.isLoggedIn && window.SangoAuth.isLoggedIn();
      if (!isAuthed) {
        window._pendingCartAction = {
          action: 'add',
          item: itemData,
          qty: itemQty
        };
        if (window.openAuthModal) {
          window.openAuthModal('signin', 'Please sign in to your Sango Fiora account to add luxury botanicals to your cart.');
        } else {
          window.location.href = '/login/?redirect=' + encodeURIComponent(window.location.pathname);
        }
        return;
      }

      window.CartEngine.addToCart(itemData, itemQty);
      return;
    }

    // Direct Buy Now Button
    var buyBtn = e.target.closest('[data-buy-now]');
    if (buyBtn) {
      e.preventDefault();

      var buyData = {
        slug: buyBtn.dataset.slug,
        name: buyBtn.dataset.name,
        variant: buyBtn.dataset.variant || '',
        category: buyBtn.dataset.category || '',
        size: buyBtn.dataset.size || '',
        price: parseInt(buyBtn.dataset.price, 10),
        mrp: parseInt(buyBtn.dataset.mrp || buyBtn.dataset.price, 10),
        stock: parseInt(buyBtn.dataset.stock || '15', 10),
        image: buyBtn.dataset.image
      };
      var buyQty = parseInt(buyBtn.dataset.qty || '1', 10);

      // Add directly to cart and immediately proceed to checkout
      window.CartEngine.addToCart(buyData, buyQty);
      window.location.href = '/checkout/';
      return;
    }

    // Quantity Inc / Dec / Remove
    var inc = e.target.closest('[data-inc]');
    if (inc) {
      var it1 = window.CartEngine.getItems().find(function (i) { return i.slug === inc.dataset.inc; });
      if (it1) {
        var stockMax = parseInt(it1.stock || 15, 10);
        if (stockMax && it1.qty >= stockMax) {
          if (window.showToast) window.showToast('Only ' + stockMax + ' left in stock — reached limit.');
          return;
        }
        window.CartEngine.setQty(inc.dataset.inc, it1.qty + 1);
      }
      return;
    }
    var dec = e.target.closest('[data-dec]');
    if (dec) {
      var it2 = window.CartEngine.getItems().find(function (i) { return i.slug === dec.dataset.dec; });
      if (it2) window.CartEngine.setQty(dec.dataset.dec, it2.qty - 1);
      return;
    }
    var rem = e.target.closest('[data-remove]');
    if (rem) {
      window.CartEngine.setQty(rem.dataset.remove, 0);
      if (window.showToast) window.showToast('Item removed from cart');
      return;
    }

    // Drawer Toggles
    if (e.target.closest('#cart-open-btn')) { openDrawer(); return; }
    if (e.target.closest('#cart-close-btn') || e.target.id === 'cart-drawer-overlay') { closeDrawer(); return; }
    
    if (e.target.closest('#drawer-checkout-btn')) {
      closeDrawer();
      var isAuthed = window.SangoAuth && window.SangoAuth.isLoggedIn && window.SangoAuth.isLoggedIn();
      if (!isAuthed) {
        if (window.openAuthModal) {
          window.openAuthModal('signin', 'Please sign in to your Sango Fiora account to checkout.');
        } else {
          location.href = '/login/?redirect=/checkout/';
        }
        return;
      }
      location.href = '/checkout/';
      return;
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    renderDrawer();
    if (window.AppEvent) window.AppEvent.on('cart:updated', renderDrawer);
  });

})();
