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

  // Dynamic server-backed coupon cache (populated solely by Supabase / Spring Boot validation — never hardcoded)
  var dynamicCouponCache = {};
  var revalidatingCouponKey = null;

  function validateCouponWithServer(code, subtotal) {
    if (window.SangoAPI && window.SangoAPI.validateCoupon) {
      return window.SangoAPI.validateCoupon(code, subtotal);
    }
    return fetch('/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code, subtotal: Math.round(subtotal || 0) })
    }).then(function (res) { return res.json(); });
  }

  function readCartData() {
    try {
      var d = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (d && d.version === STORAGE_VERSION) {
        return {
          version: STORAGE_VERSION,
          ownerId: d.ownerId || null,
          items: Array.isArray(d.items) ? d.items : [],
          coupon: d.coupon || null,
          couponMeta: d.couponMeta || null
        };
      }
      return migrateCart(d);
    } catch (e) {
      return { version: STORAGE_VERSION, ownerId: null, items: [], coupon: null, couponMeta: null };
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
      ownerId: (oldData && oldData.ownerId) || null,
      items: items || [],
      coupon: (oldData && oldData.coupon) || null,
      couponMeta: (oldData && oldData.couponMeta) || null
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated)); } catch (e) {}
    return migrated;
  }

  var syncTimeout = null;

  function mergeCartItems(localItems, remoteItems) {
    localItems = Array.isArray(localItems) ? localItems : [];
    remoteItems = Array.isArray(remoteItems) ? remoteItems : [];

    if (!localItems.length) return remoteItems.slice();
    if (!remoteItems.length) return localItems.slice();

    var itemMap = new Map();
    localItems.forEach(function (item) {
      if (item && item.slug) {
        itemMap.set(item.slug, Object.assign({}, item));
      }
    });

    remoteItems.forEach(function (rItem) {
      if (!rItem || !rItem.slug) return;
      if (itemMap.has(rItem.slug)) {
        var existing = itemMap.get(rItem.slug);
        var stockLimit = parseInt(existing.stock || rItem.stock || 20, 10);
        existing.qty = Math.min(stockLimit, (existing.qty || 1) + (rItem.qty || 1));
      } else {
        itemMap.set(rItem.slug, Object.assign({}, rItem));
      }
    });

    return Array.from(itemMap.values());
  }

  function writeCartData(data, skipRemoteSync) {
    var user = window.SangoAuth && window.SangoAuth.getUser ? window.SangoAuth.getUser() : null;
    data.version = STORAGE_VERSION;
    data.ownerId = user ? user.id : null;
    if (!data.items || data.items.length === 0) {
      data.coupon = null;
      data.couponMeta = null;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (window.AppEvent) window.AppEvent.emit('cart:updated', data);

    if (skipRemoteSync) return;

    // Sync user's private cart to PostgreSQL / Spring Boot backend and Supabase user_carts table
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
            coupon_code: data.coupon || null,
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
            subtotal: subtotal,
            couponCode: data.coupon || ''
          }).catch(function (err) {
            console.error('[Cart] Backend cart sync error:', err);
          });
        }
      }, 350);
    }
  }

  function revalidateAppliedCoupon(force) {
    var data = readCartData();
    if (!data.coupon) return;
    if (!data.items || data.items.length === 0) {
      data.coupon = null;
      data.couponMeta = null;
      writeCartData(data);
      return;
    }
    var subtotal = data.items.reduce(function (n, i) { return n + (i.qty * i.price); }, 0);
    var user = window.SangoAuth && window.SangoAuth.getUser ? window.SangoAuth.getUser() : null;
    var key = (user ? user.id : 'anon') + '|' + data.coupon + '|' + subtotal;
    if (!force && revalidatingCouponKey === key) return;
    revalidatingCouponKey = key;

    validateCouponWithServer(data.coupon, subtotal).then(function (res) {
      var latest = readCartData();
      if (!latest.coupon || latest.coupon.toUpperCase() !== data.coupon.toUpperCase()) return;

      if (res && (res.valid || res.discountPercent)) {
        var canonCode = (res.code || latest.coupon).toUpperCase();
        var meta = {
          code: canonCode,
          percent: Number(res.percent || res.discountPercent || 0),
          label: res.label || (Number(res.percent || res.discountPercent || 0) + '% Discount'),
          minSubtotal: Number(res.minSubtotal || 0)
        };
        dynamicCouponCache[canonCode] = meta;
        var changed = latest.coupon !== canonCode || !latest.couponMeta || latest.couponMeta.percent !== meta.percent;
        latest.coupon = canonCode;
        latest.couponMeta = meta;
        if (changed) writeCartData(latest, true);
      } else {
        // Invalid/expired/non-existent coupon (e.g. stale RONALDO) — automatically purge everywhere
        latest.coupon = null;
        latest.couponMeta = null;
        writeCartData(latest);
      }
    }).catch(function (err) {
      console.warn('[Cart] Coupon revalidation skipped:', err);
    });
  }

  // Handle Auth Changes — Strictly Isolate Per-Account Cart/Coupon, Merge Guest Items Cleanly
  if (window.AppEvent) {
    window.AppEvent.on('auth:changed', function (authData) {
      if (!authData || !authData.user) {
        // User signed out: reset local cart/coupon cleanly without deleting remote user_carts in database
        try {
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem('sango_cart_v2');
          localStorage.removeItem('sango-cart');
          localStorage.removeItem('sango_cart');
        } catch (e) {}
        writeCartData({ version: STORAGE_VERSION, ownerId: null, items: [], coupon: null, couponMeta: null }, true);
        renderDrawer();
        return;
      }
      if (authData.user) {
        // Strict Cross-Account Guard: if localStorage belonged to another authenticated account, wipe before anything else!
        var preRead = readCartData();
        if (preRead.ownerId && preRead.ownerId !== authData.user.id) {
          preRead = { version: STORAGE_VERSION, ownerId: authData.user.id, items: [], coupon: null, couponMeta: null };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(preRead));
        }

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

        var applyRemoteCart = function (remoteItems, remoteCoupon) {
          var current = readCartData();
          if (current.ownerId && current.ownerId !== authData.user.id) {
            current = { version: STORAGE_VERSION, ownerId: authData.user.id, items: [], coupon: null, couponMeta: null };
          }
          var localItems = current.items || [];
          var hasRemoteItems = Array.isArray(remoteItems) && remoteItems.length > 0;
          var cleanRemoteCoupon = (remoteCoupon && String(remoteCoupon).trim()) ? String(remoteCoupon).trim().toUpperCase() : null;

          if (!hasRemoteItems) {
            if (localItems.length > 0) {
              // Push pure guest/same-user cart items to remote, preserve coupon only if valid
              writeCartData(current);
              revalidateAppliedCoupon(true);
            } else if (current.coupon || cleanRemoteCoupon) {
              // Empty cart must never keep stale coupons
              writeCartData({ version: STORAGE_VERSION, ownerId: authData.user.id, items: [], coupon: null, couponMeta: null });
            } else {
              // Claim ownership cleanly without stale data
              writeCartData({ version: STORAGE_VERSION, ownerId: authData.user.id, items: [], coupon: null, couponMeta: null }, true);
            }
            return;
          }

          var mergedItems = mergeCartItems(localItems, remoteItems);
          // Account coupon takes priority over guest coupon; never inherit another account's coupon
          var canUseLocalCoupon = !current.ownerId || current.ownerId === authData.user.id;
          var mergedCoupon = cleanRemoteCoupon || (canUseLocalCoupon ? current.coupon : null) || null;
          var mergedMeta = (mergedCoupon && current.couponMeta && current.couponMeta.code === mergedCoupon) ? current.couponMeta : null;

          var mergedCart = {
            version: STORAGE_VERSION,
            ownerId: authData.user.id,
            items: mergedItems,
            coupon: mergedCoupon,
            couponMeta: mergedMeta
          };

          writeCartData(mergedCart);
          renderDrawer();
          revalidateAppliedCoupon(true);

          if (window.showToast) {
            if (localItems.length > 0) {
              window.showToast('Merged your cart with your saved botanical items!');
            } else {
              window.showToast('Restored your saved botanical cart!');
            }
          }
        };

        // Try Supabase user_carts first
        var isUuid = authData.user.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authData.user.id);

        if (window.SangoSupabase && isUuid) {
          window.SangoSupabase.from('user_carts').select('*').eq('user_id', authData.user.id).maybeSingle().then(function (res) {
            if (res.data && res.data.items && res.data.items.length > 0) {
              applyRemoteCart(res.data.items, res.data.coupon_code);
            } else {
              checkBackendFallback();
            }
          }).catch(function (err) {
            console.warn('[Cart] Supabase user_carts query notice:', err);
            checkBackendFallback();
          });
        } else {
          checkBackendFallback();
        }

        function checkBackendFallback() {
          if (authData.user.email && window.SangoAPI && window.SangoAPI.getSyncedCart) {
            window.SangoAPI.getSyncedCart(authData.user.email)
              .then(function (data) {
                if (data && data.itemsJson) {
                  try {
                    var restoredItems = JSON.parse(data.itemsJson);
                    if (Array.isArray(restoredItems) && restoredItems.length > 0) {
                      applyRemoteCart(restoredItems, data.couponCode);
                    } else {
                      applyRemoteCart([], null);
                    }
                  } catch (e) {
                    console.error('[Cart] Synced cart JSON parse error:', e);
                  }
                } else {
                  applyRemoteCart([], null);
                }
              }).catch(function (err) {
                console.error('[Cart] Backend cart fetch error:', err);
              });
          }
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

      var couponCode = (items.length > 0 && data.coupon) ? data.coupon : null;
      var rule = null;
      if (couponCode) {
        if (data.couponMeta && data.couponMeta.code === couponCode) {
          rule = data.couponMeta;
        } else if (dynamicCouponCache[couponCode]) {
          rule = dynamicCouponCache[couponCode];
        } else {
          // Dynamically validate unknown restored coupon asynchronously instead of trusting unverified codes
          setTimeout(function () { revalidateAppliedCoupon(false); }, 0);
        }
      }

      var couponDiscount = 0;
      if (couponCode && rule) {
        if (!rule.minSubtotal || subtotal >= rule.minSubtotal) {
          couponDiscount = Math.round(subtotal * (rule.percent / 100));
        }
      }

      var delivery = (subtotal >= FREE_SHIP_ABOVE || items.length === 0) ? 0 : DELIVERY_FEE;
      var taxableSubtotal = Math.max(0, subtotal - couponDiscount);
      var gstAmount = window.DiscountEngine ? window.DiscountEngine.calculateGst(taxableSubtotal) : Math.round(taxableSubtotal * 0.18);
      var netTotal = taxableSubtotal + delivery;

      return {
        count: count,
        subtotal: subtotal,
        mrpTotal: mrpTotal,
        mrpSavings: mrpSavings,
        volumeDiscountPercent: 0,
        volumeDiscount: 0,
        volumeLabel: '',
        couponCode: (couponCode && rule) ? couponCode : null,
        couponDiscount: couponDiscount,
        couponLabel: (couponCode && rule) ? (rule.label || '') : '',
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
      if (data.coupon && data.items.length > 0) revalidateAppliedCoupon(true);
    },

    applyCoupon: function (code, callback) {
      var c = (code || '').trim().toUpperCase();
      if (!c) {
        var data = readCartData();
        data.coupon = null;
        data.couponMeta = null;
        writeCartData(data);
        var resObj = { success: true, message: 'Coupon removed' };
        if (callback) callback(resObj);
        return resObj;
      }

      var totals = this.getTotals();
      if (!totals.count || totals.subtotal <= 0) {
        var emptyRes = { success: false, message: 'Add items to your cart before applying a promo code.' };
        if (callback) callback(emptyRes);
        return emptyRes;
      }

      // Always validate dynamically with Supabase / Spring Boot server (never hardcoded fallback)
      validateCouponWithServer(c, totals.subtotal).then(function (res) {
        if (res && (res.valid || res.discountPercent)) {
          var canonCode = (res.code || c).toUpperCase();
          var meta = {
            code: canonCode,
            percent: Number(res.percent || res.discountPercent || 0),
            label: res.label || (Number(res.percent || res.discountPercent || 0) + '% Discount'),
            minSubtotal: Number(res.minSubtotal || 0)
          };
          dynamicCouponCache[canonCode] = meta;
          var d = readCartData();
          d.coupon = canonCode;
          d.couponMeta = meta;
          writeCartData(d);
          var msg = res.message || ('Coupon "' + canonCode + '" applied!');
          if (callback) callback({ success: true, message: msg, discountAmount: res.discountAmount });
        } else {
          var d2 = readCartData();
          if (d2.coupon === c) {
            d2.coupon = null;
            d2.couponMeta = null;
            writeCartData(d2);
          }
          var errMsg = (res && res.message) || 'Invalid or expired coupon code';
          if (callback) callback({ success: false, message: errMsg });
        }
      }).catch(function (err) {
        console.error('[Cart] Coupon validation error:', err);
        if (callback) callback({ success: false, message: (err && err.message) || 'Could not verify coupon code with server. Please try again.' });
      });

      return { success: true, message: 'Validating coupon with botanical server...' };
    },

    removeCoupon: function (callback) {
      return this.applyCoupon('', callback);
    },

    clearCart: function () {
      writeCartData({ version: STORAGE_VERSION, items: [], coupon: null, couponMeta: null });
      var user = window.SangoAuth && window.SangoAuth.getUser ? window.SangoAuth.getUser() : null;
      if (user && user.email && window.SangoAPI && window.SangoAPI.deleteSyncedCart) {
        window.SangoAPI.deleteSyncedCart(user.email).catch(function (err) {
          console.error('[Cart] Clear synced cart notice:', err);
        });
      }
    },

    resetLocalCart: function () {
      writeCartData({ version: STORAGE_VERSION, ownerId: null, items: [], coupon: null, couponMeta: null }, true);
      renderDrawer();
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

      // Cleanly hide all discount and savings elements when cart is empty
      var emptySavingsTier = document.getElementById('drawer-savings-tier') || document.getElementById('drawer-volume-tier');
      if (emptySavingsTier) {
        emptySavingsTier.classList.add('hidden');
        emptySavingsTier.classList.remove('flex');
      }
      var emptySavingsRow = document.getElementById('drawer-savings-row') || document.getElementById('drawer-volume-row');
      if (emptySavingsRow) {
        emptySavingsRow.classList.add('hidden');
        emptySavingsRow.classList.remove('flex');
      }
      var emptyCouponRow = document.getElementById('drawer-coupon-row');
      if (emptyCouponRow) {
        emptyCouponRow.classList.add('hidden');
        emptyCouponRow.classList.remove('flex');
      }
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
    // Dynamic MRP Savings (replaces artificial bulk volume tiers)
    var savingsTier = document.getElementById('drawer-savings-tier') || document.getElementById('drawer-volume-tier');
    var savingsText = document.getElementById('drawer-savings-text') || document.getElementById('drawer-volume-text');
    var savingsBannerAmt = document.getElementById('drawer-savings-amount-banner');
    var savingsTag = document.getElementById('drawer-savings-tag') || document.getElementById('drawer-volume-tag');
    var savingsRow = document.getElementById('drawer-savings-row') || document.getElementById('drawer-volume-row');
    var savingsDiscountEl = document.getElementById('drawer-savings-discount') || document.getElementById('drawer-volume-discount');
    var couponRow = document.getElementById('drawer-coupon-row');
    var couponDiscountEl = document.getElementById('drawer-coupon-discount');

    if (savingsTier && savingsText) {
      if (totals.count === 0 || totals.mrpSavings <= 0) {
        savingsTier.classList.add('hidden');
        savingsTier.classList.remove('flex');
      } else {
        savingsTier.classList.remove('hidden');
        savingsTier.classList.add('flex');
        if (savingsBannerAmt) {
          savingsBannerAmt.textContent = formatCurrency(totals.mrpSavings);
        } else {
          savingsText.innerHTML = '<span class="material-symbols-outlined ico text-emerald-700" aria-hidden="true">savings</span> You are saving <strong>' + formatCurrency(totals.mrpSavings) + '</strong> on this order!';
        }
        if (savingsTag) {
          savingsTag.classList.remove('hidden');
          var pct = totals.mrpTotal > 0 ? Math.round((totals.mrpSavings / totals.mrpTotal) * 100) : 0;
          savingsTag.textContent = pct > 0 ? (pct + '% Off MRP') : 'Savings';
        }
      }
    }

    if (savingsRow && savingsDiscountEl) {
      if (totals.mrpSavings > 0) {
        savingsRow.classList.remove('hidden');
        savingsRow.classList.add('flex');
        savingsDiscountEl.textContent = '-' + formatCurrency(totals.mrpSavings);
        var labelEl = document.getElementById('drawer-savings-label') || document.getElementById('drawer-volume-label');
        if (labelEl) labelEl.textContent = 'Total Savings (MRP)';
      } else {
        savingsRow.classList.add('hidden');
        savingsRow.classList.remove('flex');
      }
    }

    if (couponRow && couponDiscountEl) {
      var couponLabelEl = document.getElementById('drawer-coupon-label');
      if (totals.couponCode && totals.couponDiscount > 0) {
        couponRow.classList.remove('hidden');
        couponRow.classList.add('flex');
        if (couponLabelEl) couponLabelEl.textContent = 'Coupon (' + totals.couponCode + ')';
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

      // Require authenticated member for direct Buy Now checkout as well
      var isAuthedBuy = window.SangoAuth && window.SangoAuth.isLoggedIn && window.SangoAuth.isLoggedIn();
      if (!isAuthedBuy) {
        window._pendingCartAction = {
          action: 'buy-now',
          item: buyData,
          qty: buyQty
        };
        if (window.openAuthModal) {
          window.openAuthModal('signin', 'Please sign in to your Sango Fiora account to buy and check out.');
        } else {
          window.location.href = '/login/?redirect=' + encodeURIComponent(window.location.pathname);
        }
        return;
      }

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
    var remCoupon = e.target.closest('[data-remove-coupon]');
    if (remCoupon) {
      e.preventDefault();
      window.CartEngine.removeCoupon(function (res) {
        if (window.showToast && res && res.message) window.showToast(res.message);
      });
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
