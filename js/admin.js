/**
 * Sango Fiora — Admin console (talks directly to Supabase; every write is enforced by RLS + is_admin()).
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var API = function () { return window.SangoAPI; };
  var inr = function (n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); };
  function esc(s) { var d = document.createElement('div'); d.appendChild(document.createTextNode(s == null ? '' : String(s))); return d.innerHTML.replace(/"/g, '&quot;'); }
  function dt(s) { return s ? new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''; }

  function toast(msg, isErr) {
    var el = document.createElement('div'); el.className = 't' + (isErr ? ' err' : ''); el.textContent = msg;
    $('toast').appendChild(el); setTimeout(function () { el.remove(); }, isErr ? 5000 : 2800);
  }
  function openM(id) { $(id).classList.remove('hidden'); }
  function closeM(id) { $(id).classList.add('hidden'); }
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-close]')) { var m = e.target.closest('.overlay'); if (m) m.classList.add('hidden'); }
    else if (e.target.classList && e.target.classList.contains('overlay')) e.target.classList.add('hidden');
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') document.querySelectorAll('.overlay').forEach(function (o) { o.classList.add('hidden'); }); });

  var state = { products: [], orders: [], coupons: [], enquiries: [], editing: null, order: null, loaded: {} };
  var TABS = {
    dash: ['Dashboard', 'Store overview'], products: ['Products', 'Changes go live on the store instantly'],
    orders: ['Orders', 'Track, update and fulfil customer orders'], coupons: ['Coupons', 'Discount codes customers can apply'], enquiries: ['Enquiries', 'Messages from the contact form']
  };

  // ─────────── Auth gate ───────────
  function gate(msg, showSignout) {
    $('app').classList.add('hidden'); $('gate').classList.remove('hidden');
    if (msg) $('gate-msg').textContent = msg;
    $('gate-out').classList.toggle('hidden', !showSignout);
    var act = $('gate-actions');
    if (act) act.classList.toggle('hidden', !!showSignout);
  }
  function enter(user) {
    $('gate').classList.add('hidden'); $('app').classList.remove('hidden');
    $('who').textContent = user.email;
    if (!state.started) { state.started = true; boot(); }
  }
  function checkAuth() {
    var A = window.SangoAuth;
    if (!A) return;
    var user = A.getUser();
    if (!user) return gate('Sign in with your authorized administrator Google account to access Admin Studio.', false);
    if (!A.isAdmin()) return gate((user.email || 'This account') + ' does not have administrator access. Please sign in with an authorized admin account.', true);
    enter(user);
  }
  function waitForAuth() {
    if (!window.SangoSupabase || !window.SangoAuth) return setTimeout(waitForAuth, 80);
    window.AppEvent.on('auth:changed', checkAuth);
    window.SangoAuth.init().then(checkAuth);
  }

  var googleGateBtn = $('gate-google-btn');
  if (googleGateBtn) {
    googleGateBtn.addEventListener('click', function () {
      var A = window.SangoAuth;
      if (!A || !A.signInWithGoogle) return toast('Authentication is still loading. Please wait a moment.', true);
      googleGateBtn.disabled = true;
      var lbl = $('gate-google-label');
      var original = lbl ? lbl.textContent : 'Sign in with Google';
      if (lbl) lbl.textContent = 'Connecting to Google…';
      A.signInWithGoogle({ redirectTo: location.origin + '/admin/' }).catch(function (err) {
        toast(err.message || 'Google sign-in could not be started', true);
        googleGateBtn.disabled = false;
        if (lbl) lbl.textContent = original;
      });
    });
  }

  $('gate-out').addEventListener('click', function () { window.SangoAuth.signOut().then(checkAuth); });
  $('signout').addEventListener('click', function () { window.SangoAuth.signOut().then(checkAuth); });

  // ─────────── Navigation ───────────
  function go(tab) {
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('on', t.id === 'tab-' + tab); });
    document.querySelectorAll('.nav-btn[data-tab]').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === tab); });
    $('title').textContent = TABS[tab][0]; $('subtitle').textContent = TABS[tab][1];
    var act = $('top-actions'); act.innerHTML = '';
    if (tab === 'products') act.innerHTML = '<button class="btn pri" id="btn-add"><span class="ms">add</span>Add product</button>';
    if (tab === 'coupons') act.innerHTML = '<button class="btn pri" id="btn-add-c"><span class="ms">add</span>New coupon</button>';
    if (tab === 'dash' || tab === 'orders') act.innerHTML = '<button class="btn" id="btn-refresh"><span class="ms">refresh</span>Refresh</button>';
    $('side').classList.remove('open');
    if (tab === 'enquiries' && !state.loaded.enq) loadEnquiries();
  }
  document.addEventListener('click', function (e) {
    var n = e.target.closest('[data-tab]'); if (n) go(n.dataset.tab);
    var g = e.target.closest('[data-go]'); if (g) go(g.dataset.go);
    if (e.target.closest('#btn-add')) openProduct(null);
    if (e.target.closest('#btn-add-c')) { $('f-coupon').reset(); $('cf-err').classList.add('hidden'); openM('m-coupon'); }
    if (e.target.closest('#btn-refresh')) refreshAll();
  });
  $('menu').addEventListener('click', function () { $('side').classList.toggle('open'); });

  function refreshAll() { return Promise.all([loadProducts(), loadOrders(), loadCoupons(), loadStats()]); }
  function boot() {
    refreshAll().then(function () { toast('Admin ready'); });
    // live: new orders and product changes from anywhere appear without a refresh
    window.SangoSupabase.channel('admin-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, function () { loadOrders(); loadStats(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, function () { loadProducts(); loadStats(); })
      .subscribe();
  }

  // ─────────── Dashboard ───────────
  function loadStats() {
    return API().getAdminStats().then(function (s) {
      var cards = [
        ['Revenue', inr(s.revenue), 'payments'], ['Orders', s.totalOrders, 'receipt_long'], ['New orders', s.pendingOrders, 'notifications'],
        ['Live products', s.totalProducts, 'inventory_2'], ['Low stock', s.lowStock, 'warning'], ['Sold out', s.soldOut, 'production_quantity_limits'], ['Enquiries', s.enquiries, 'mail']
      ];
      $('stats').innerHTML = cards.map(function (c) { return '<div class="card stat"><div class="k"><span class="ms">' + c[2] + '</span>' + c[0] + '</div><div class="v">' + c[1] + '</div></div>'; }).join('');
      var nb = $('nav-orders'); nb.textContent = s.pendingOrders; nb.classList.toggle('hidden', !s.pendingOrders);
    }).catch(function (e) { toast(e.message, true); });
  }

  function payPill(o) {
    var s = o.paymentStatus || '';
    var cls = s === 'Paid' ? 'ok' : (/Failed|Cancel/.test(s) ? 'bad' : (/Refund/.test(s) ? 'warn' : 'mute'));
    return '<span class="pill ' + cls + '">' + esc(s || '—') + '</span>';
  }
  function statusPill(o) {
    var cls = o.status === 'Delivered' ? 'ok' : (o.status === 'Cancelled' ? 'bad' : (o.status === 'Order Placed' ? 'warn' : 'mute'));
    return '<span class="pill ' + cls + '">' + esc(o.status) + '</span>';
  }

  // ─────────── Products ───────────
  function loadProducts() {
    API().invalidateProducts();
    return API().getProducts({ force: true }).then(function (list) { state.products = list; renderProducts(); }).catch(function (e) { toast(e.message, true); });
  }
  function renderProducts() {
    var q = $('p-search').value.trim().toLowerCase(), cat = $('p-cat').value, st = $('p-status').value;
    var rows = state.products.filter(function (p) {
      if (q && (p.name + ' ' + p.variant + ' ' + p.slug).toLowerCase().indexOf(q) === -1) return false;
      if (cat !== 'all' && p.category !== cat) return false;
      if (st === 'active') return p.isActive && !p.isSoldOut;
      if (st === 'soldout') return p.isSoldOut;
      if (st === 'low') return p.stock > 0 && p.stock <= 4;
      if (st === 'hidden') return !p.isActive;
      return true;
    });
    $('p-body').innerHTML = rows.length ? rows.map(function (p) {
      var status = !p.isActive ? '<span class="pill mute">Hidden</span>' : (p.isSoldOut ? '<span class="pill bad">Sold out</span>' : (p.stock <= 4 ? '<span class="pill warn">Low stock</span>' : '<span class="pill ok">Live</span>'));
      return '<tr><td><div style="display:flex;gap:12px;align-items:center"><img class="thumb" src="' + esc(p.image) + '" alt="" loading="lazy"><div><div class="pname">' + esc(p.name) + (p.variant ? ' · ' + esc(p.variant) : '') + '</div><div class="muted">' + esc(p.size) + ' · ' + esc(p.slug) + '</div></div></div></td>' +
        '<td>' + esc(p.category) + '</td><td><b>' + inr(p.price) + '</b>' + (p.mrp > p.price ? '<div class="muted"><s>' + inr(p.mrp) + '</s></div>' : '') + '</td>' +
        '<td>' + p.stock + '</td><td>' + status + '</td>' +
        '<td><div class="actions"><button class="icon-btn" title="' + (p.isActive ? 'Hide from store' : 'Show on store') + '" data-vis="' + p.id + '"><span class="ms">' + (p.isActive ? 'visibility' : 'visibility_off') + '</span></button>' +
        '<button class="icon-btn" title="Edit" data-edit="' + p.id + '"><span class="ms">edit</span></button>' +
        '<button class="icon-btn dng" title="Delete" data-del="' + p.id + '"><span class="ms">delete</span></button></div></td></tr>';
    }).join('') : '<tr><td colspan="6" class="empty">No products match your filters.</td></tr>';
  }
  ['p-search', 'p-cat', 'p-status'].forEach(function (id) { $(id).addEventListener('input', renderProducts); });

  function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
  function openProduct(p) {
    state.editing = p; $('f-product').reset(); $('pf-err').classList.add('hidden');
    $('mp-title').textContent = p ? 'Edit product' : 'Add product';
    $('pf-slug').dataset.touched = p ? '1' : '';
    if (p) {
      $('pf-name').value = p.name; $('pf-variant').value = p.variant; $('pf-cat').value = p.category; $('pf-size').value = p.size; $('pf-slug').value = p.slug;
      $('pf-price').value = p.price; $('pf-mrp').value = p.mrp; $('pf-stock').value = p.stock; $('pf-desc').value = p.description;
      $('pf-active').checked = p.isActive; $('pf-sold').checked = p.isSoldOut; $('pf-image').value = p.image;
    } else { $('pf-image').value = ''; }
    showPreview($('pf-image').value); openM('m-product');
  }
  function showPreview(url) {
    var img = $('pf-preview'); img.classList.toggle('hidden', !url); $('pf-ph').classList.toggle('hidden', !!url);
    if (url) img.src = url; $('pf-drop-t').textContent = url ? 'Change photo' : 'Upload a photo';
  }
  $('pf-name').addEventListener('input', function () { if (!$('pf-slug').dataset.touched) $('pf-slug').value = slugify($('pf-name').value + ' ' + $('pf-variant').value + ' ' + $('pf-size').value); });
  $('pf-variant').addEventListener('input', function () { if (!$('pf-slug').dataset.touched) $('pf-slug').value = slugify($('pf-name').value + ' ' + $('pf-variant').value + ' ' + $('pf-size').value); });
  $('pf-size').addEventListener('input', function () { if (!$('pf-slug').dataset.touched) $('pf-slug').value = slugify($('pf-name').value + ' ' + $('pf-variant').value + ' ' + $('pf-size').value); });
  $('pf-slug').addEventListener('input', function () { $('pf-slug').dataset.touched = '1'; });
  $('pf-image').addEventListener('input', function () { showPreview($('pf-image').value.trim()); });
  $('drop').addEventListener('click', function () { $('pf-file').click(); });
  $('pf-file').addEventListener('change', function () {
    var f = this.files[0]; if (!f) return;
    $('pf-drop-t').textContent = 'Uploading…';
    API().uploadProductImage(f).then(function (r) { $('pf-image').value = r.url; showPreview(r.url); toast('Photo uploaded'); })
      .catch(function (e) { showPreview($('pf-image').value); toast(e.message, true); });
  });

  $('f-product').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('pf-save'); btn.disabled = true; btn.textContent = 'Saving…';
    var data = {
      name: $('pf-name').value, variant: $('pf-variant').value, category: $('pf-cat').value, size: $('pf-size').value, slug: $('pf-slug').value,
      price: $('pf-price').value, mrp: $('pf-mrp').value, stock: $('pf-stock').value, description: $('pf-desc').value,
      image: $('pf-image').value.trim(), isActive: $('pf-active').checked, isSoldOut: $('pf-sold').checked
    };
    var call;
    try { call = state.editing ? API().adminUpdateProduct(state.editing.id, data) : API().adminAddProduct(data); }
    catch (err) { call = Promise.reject(err); }
    call.then(function () { closeM('m-product'); toast(state.editing ? 'Product updated, live on store' : 'Product added, live on store'); return loadProducts().then(loadStats); })
      .catch(function (err) {
        var m = err.message || 'Could not save';
        if (/duplicate key|products_slug_key/.test(m)) m = 'That URL slug is already used by another product.';
        $('pf-err').textContent = m; $('pf-err').classList.remove('hidden');
      }).then(function () { btn.disabled = false; btn.textContent = 'Save product'; });
  });

  $('p-body').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var id = b.dataset.edit || b.dataset.del || b.dataset.vis;
    var p = state.products.filter(function (x) { return x.id === id; })[0]; if (!p) return;
    if (b.dataset.edit) return openProduct(p);
    if (b.dataset.vis) {
      return window.SangoSupabase.from('products').update({ is_active: !p.isActive }).eq('id', id).select('id').then(function (r) {
        if (r.error || !r.data.length) return toast(r.error ? r.error.message : 'Not permitted', true);
        toast(p.isActive ? 'Hidden from store' : 'Now visible on store'); loadProducts(); loadStats();
      });
    }
    if (b.dataset.del) {
      if (!confirm('Delete "' + p.name + '" permanently?\n\nIt will be removed from the store immediately. Past orders keep their record.')) return;
      API().adminDeleteProduct(id).then(function () { toast('Product deleted from store'); loadProducts(); loadStats(); }).catch(function (err) { toast(err.message, true); });
    }
  });

  // ─────────── Orders ───────────
  function loadOrders() {
    return API().getAdminOrders().then(function (list) { state.orders = list; renderOrders(); renderRecent(); }).catch(function (e) { toast(e.message, true); });
  }
  function renderRecent() {
    $('recent').innerHTML = state.orders.slice(0, 6).map(function (o) {
      return '<tr><td class="mono"><b>' + esc(o.orderId) + '</b><div class="muted">' + dt(o.createdAt) + '</div></td><td>' + esc(o.customerName) + '</td><td><b>' + inr(o.netTotal) + '</b></td><td>' + payPill(o) + '</td><td>' + statusPill(o) + '</td></tr>';
    }).join('') || '<tr><td colspan="5" class="empty">No orders yet.</td></tr>';
  }
  function renderOrders() {
    var q = $('o-search').value.trim().toLowerCase(), st = $('o-status').value;
    var rows = state.orders.filter(function (o) {
      if (st !== 'all' && o.status !== st) return false;
      return !q || (o.orderId + ' ' + o.customerName + ' ' + o.customerPhone).toLowerCase().indexOf(q) !== -1;
    });
    $('o-body').innerHTML = rows.length ? rows.map(function (o) {
      return '<tr><td class="mono"><b>' + esc(o.orderId) + '</b><div class="muted">' + dt(o.createdAt) + '</div></td>' +
        '<td>' + esc(o.customerName) + '<div class="muted">' + esc(o.customerPhone) + ' · ' + esc(o.city || '') + '</div></td>' +
        '<td>' + o.items.length + '</td><td><b>' + inr(o.netTotal) + '</b><div class="muted">' + esc(o.paymentMethod) + '</div></td><td>' + payPill(o) + '</td><td>' + statusPill(o) + '</td>' +
        '<td class="right"><button class="btn sm" data-order="' + o.id + '">Manage</button></td></tr>';
    }).join('') : '<tr><td colspan="7" class="empty">No orders found.</td></tr>';
  }
  ['o-search', 'o-status'].forEach(function (id) { $(id).addEventListener('input', renderOrders); });

  var STEPS = [['Order Placed', 1], ['Quality Inspection', 2], ['Packed', 3], ['Out for Delivery', 4], ['Delivered', 5]];
  $('o-body').addEventListener('click', function (e) {
    var b = e.target.closest('[data-order]'); if (!b) return;
    var o = state.orders.filter(function (x) { return x.id === b.dataset.order; })[0]; if (!o) return;
    state.order = o; $('mo-title').textContent = 'Order ' + o.orderId;
    $('mo-body').innerHTML =
      '<div class="grid2" style="margin-bottom:16px"><div><div class="muted">Customer</div><b>' + esc(o.customerName) + '</b><div>' + esc(o.customerPhone) + '</div><div class="muted">' + esc(o.customerEmail || '') + '</div></div>' +
      '<div><div class="muted">Deliver to</div><div>' + esc(o.shippingAddress) + (o.landmark ? ', ' + esc(o.landmark) : '') + '<br>' + esc([o.city, o.state, o.pincode].filter(Boolean).join(', ')) + '</div></div></div>' +
      '<div class="card" style="margin-bottom:16px">' + o.items.map(function (i) { return '<div style="display:flex;gap:12px;align-items:center;padding:10px 14px;border-bottom:1px solid #EEF0EC"><img class="thumb" src="' + esc(i.productImage) + '" alt=""><div style="flex:1"><b>' + esc(i.productName) + '</b><div class="muted">' + esc(i.size) + ' · Qty ' + i.qty + '</div></div><b>' + inr(i.price * i.qty) + '</b></div>'; }).join('') +
      '<div style="padding:12px 14px;display:flex;justify-content:space-between"><span class="muted">' + esc(o.paymentMethod) + ' · ' + esc(o.paymentStatus) + (o.txnId ? ' · ' + esc(o.txnId) : '') + '</span><b>Total ' + inr(o.netTotal) + '</b></div></div>' +
      '<div class="grid2"><div class="col"><label class="f" for="mo-status">Status</label><select id="mo-status">' + STEPS.map(function (s) { return '<option value="' + s[0] + '"' + (o.status === s[0] ? ' selected' : '') + '>' + s[1] + ' — ' + s[0] + '</option>'; }).join('') + '</select></div>' +
      '<div class="col"><label class="f" for="mo-notes">Note for customer</label><input id="mo-notes" value="' + esc(o.trackingNotes || '') + '" placeholder="e.g. Courier: Delhivery #123"></div></div>';
    $('mo-save').disabled = o.status === 'Cancelled'; $('mo-cancel').classList.toggle('hidden', o.status === 'Cancelled' || o.status === 'Delivered');
    openM('m-order');
  });
  $('mo-save').addEventListener('click', function () {
    var o = state.order, sel = $('mo-status').value, step = STEPS.filter(function (s) { return s[0] === sel; })[0][1];
    API().updateOrderStatus(o.id, sel, step, $('mo-notes').value.trim()).then(function () { closeM('m-order'); toast('Order updated'); loadOrders(); loadStats(); }).catch(function (e) { toast(e.message, true); });
  });
  $('mo-cancel').addEventListener('click', function () {
    if (!confirm('Cancel this order and return the items to stock?' + (state.order.paymentStatus === 'Paid' ? '\n\nIt is already paid: issue the refund from the Razorpay dashboard.' : ''))) return;
    API().cancelOrder(state.order.orderId, 'Cancelled by store').then(function () { closeM('m-order'); toast('Order cancelled, stock restored'); loadOrders(); loadProducts(); loadStats(); }).catch(function (e) { toast(e.message, true); });
  });
  $('mo-delete').addEventListener('click', function () {
    if (!confirm('Permanently delete this order record? This cannot be undone.')) return;
    API().adminDeleteOrder(state.order.id).then(function () { closeM('m-order'); toast('Order deleted'); loadOrders(); loadStats(); }).catch(function (e) { toast(e.message, true); });
  });

  // ─────────── Coupons ───────────
  function loadCoupons() {
    return Promise.resolve(window.SangoSupabase.from('coupons').select('*').order('created_at', { ascending: false })).then(function (r) { state.coupons = r.data || []; renderCoupons(); });
  }
  function renderCoupons() {
    $('c-body').innerHTML = state.coupons.length ? state.coupons.map(function (c) {
      return '<tr><td class="mono"><b>' + esc(c.code) + '</b><div class="muted">' + esc(c.label) + '</div></td><td>' + c.percent + '%</td><td>' + (c.min_subtotal ? inr(c.min_subtotal) : '—') + '</td>' +
        '<td>' + c.times_used + (c.usage_limit ? ' / ' + c.usage_limit : '') + '</td><td><span class="pill ' + (c.is_active ? 'ok' : 'mute') + '">' + (c.is_active ? 'Active' : 'Paused') + '</span></td>' +
        '<td><div class="actions"><button class="btn sm" data-ctoggle="' + c.id + '">' + (c.is_active ? 'Pause' : 'Activate') + '</button><button class="icon-btn dng" data-cdel="' + c.id + '" title="Delete"><span class="ms">delete</span></button></div></td></tr>';
    }).join('') : '<tr><td colspan="6" class="empty">No coupons yet.</td></tr>';
  }
  $('c-body').addEventListener('click', function (e) {
    var t = e.target.closest('[data-ctoggle]'), d = e.target.closest('[data-cdel]');
    var sb = window.SangoSupabase;
    if (t) { var c = state.coupons.filter(function (x) { return x.id === t.dataset.ctoggle; })[0]; sb.from('coupons').update({ is_active: !c.is_active }).eq('id', c.id).then(function (r) { if (r.error) toast(r.error.message, true); loadCoupons(); }); }
    if (d && confirm('Delete this coupon?')) sb.from('coupons').delete().eq('id', d.dataset.cdel).then(function (r) { if (r.error) toast(r.error.message, true); loadCoupons(); });
  });
  $('f-coupon').addEventListener('submit', function (e) {
    e.preventDefault();
    var row = { code: $('cf-code').value.trim().toUpperCase(), label: $('cf-label').value.trim(), percent: parseInt($('cf-pct').value, 10), min_subtotal: parseInt($('cf-min').value, 10) || 0, usage_limit: parseInt($('cf-limit').value, 10) || null, is_active: true };
    if (!row.code || !row.label || !(row.percent > 0 && row.percent <= 100)) { $('cf-err').textContent = 'Enter a code, a label and a discount between 1 and 100.'; return $('cf-err').classList.remove('hidden'); }
    window.SangoSupabase.from('coupons').insert(row).then(function (r) {
      if (r.error) { $('cf-err').textContent = /duplicate/.test(r.error.message) ? 'That code already exists.' : r.error.message; return $('cf-err').classList.remove('hidden'); }
      closeM('m-coupon'); toast('Coupon created'); loadCoupons();
    });
  });

  // ─────────── Enquiries ───────────
  function loadEnquiries() {
    API().getAdminEnquiries().then(function (rows) {
      state.loaded.enq = true;
      $('e-body').innerHTML = rows.length ? rows.map(function (r) {
        return '<tr><td class="muted" style="white-space:nowrap">' + dt(r.created_at) + '</td><td><b>' + esc(r.name) + '</b><div class="muted">' + esc(r.email || '') + ' ' + esc(r.phone || '') + '</div></td><td style="max-width:520px">' + (r.subject ? '<b>' + esc(r.subject) + '</b><br>' : '') + esc(r.message) + '</td></tr>';
      }).join('') : '<tr><td colspan="3" class="empty">No enquiries yet.</td></tr>';
    }).catch(function (e) { toast(e.message, true); });
  }

  document.addEventListener('DOMContentLoaded', waitForAuth);
})();
