/**
 * Sango Fiora — Data & API layer
 * Single source of truth: Supabase (Postgres + RLS + Edge Functions).
 * Keeps the same public interface (window.SangoAPI) that the storefront and admin already use,
 * so every page reads and writes the same live database.
 */
(function () {
  'use strict';

  var CACHE_TTL = 15000;
  var cache = { products: null, at: 0, inflight: null };

  function sb() {
    if (!window.SangoSupabase) throw new Error('Store connection is not ready. Please refresh the page.');
    return window.SangoSupabase;
  }

  function fail(error, fallback) {
    var msg = (error && (error.message || error.error_description)) || fallback || 'Something went wrong';
    throw new Error(msg);
  }

  function unwrap(res, fallback) {
    if (res && res.error) fail(res.error, fallback);
    return res ? res.data : null;
  }

  // ─── Mappers ───
  function mapProduct(r) {
    if (!r) return null;
    var soldOut = !!r.is_sold_out || (r.stock != null && r.stock <= 0);
    return {
      id: r.id, slug: r.slug, name: r.name, variant: r.variant || '', category: r.category, size: r.size,
      potIncluded: r.pot_included !== false, price: r.price, mrp: r.mrp,
      discount: r.discount != null ? r.discount : (r.mrp > r.price ? Math.round((1 - r.price / r.mrp) * 100) : 0),
      rating: r.rating != null ? Number(r.rating) : 4.5, reviews: r.reviews || 0, image: r.image,
      description: r.description || '', stock: r.stock != null ? r.stock : 0,
      isActive: r.is_active !== false, isSoldOut: soldOut,
      is_active: r.is_active !== false, is_sold_out: soldOut, created_at: r.created_at
    };
  }

  function productToRow(p) {
    var price = Math.round(Number(p.price));
    var mrp = Math.round(Number(p.mrp != null && p.mrp !== '' ? p.mrp : p.price));
    if (!p.name || !String(p.name).trim()) throw new Error('Product name is required');
    if (!(price >= 0)) throw new Error('Enter a valid selling price');
    if (mrp < price) throw new Error('MRP cannot be lower than the selling price');
    var stock = Math.max(0, parseInt(p.stock, 10) || 0);
    var slug = (p.slug || '').toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!slug) throw new Error('Product slug is required');
    if (!p.image) throw new Error('Please add a product image');
    return {
      slug: slug, name: String(p.name).trim(), variant: (p.variant || '').trim(), category: p.category,
      size: (p.size || '').trim(), pot_included: p.potIncluded !== false,
      price: price, mrp: mrp, discount: mrp > price ? Math.round((1 - price / mrp) * 100) : 0,
      image: p.image, description: (p.description || '').trim(), stock: stock,
      is_active: p.isActive !== false && p.is_active !== false,
      is_sold_out: stock === 0 ? true : !!(p.isSoldOut || p.is_sold_out)
    };
  }

  function mapOrder(o) {
    if (!o) return null;
    var items = (o.order_items || []).map(function (i) {
      return {
        id: i.id, productId: i.product_id, productName: i.product_name, productSlug: i.product_slug,
        productImage: i.product_image, productVariant: i.product_variant, productCategory: i.product_category,
        size: i.size, qty: i.qty, quantity: i.qty, price: i.price, mrp: i.mrp,
        name: i.product_name, image: i.product_image, slug: i.product_slug
      };
    });
    var out = {
      id: o.id, orderId: o.order_id, userId: o.user_id, status: o.status, statusStep: o.status_step || 1,
      trackingNotes: o.tracking_notes, estDeliveryDate: o.est_delivery_date, createdAt: o.created_at,
      paymentMethod: o.payment_method, paymentStatus: o.payment_status, txnId: o.txn_id,
      customerName: o.customer_name, customerPhone: o.customer_phone, customerEmail: o.customer_email,
      shippingAddress: o.shipping_address, landmark: o.landmark, pincode: o.pincode, city: o.city, state: o.state, gstin: o.gstin,
      subtotal: o.subtotal, mrpTotal: o.mrp_total, couponCode: o.coupon_code, couponDiscount: o.coupon_discount,
      volumeDiscount: o.volume_discount || 0, deliveryFee: o.delivery_fee, gstAmount: o.gst_amount, netTotal: o.net_total,
      customer: { name: o.customer_name, phone: o.customer_phone, email: o.customer_email, address: o.shipping_address,
        landmark: o.landmark, pincode: o.pincode, city: o.city, state: o.state },
      items: items
    };
    Object.keys(o).forEach(function (k) { if (!(k in out)) out[k] = o[k]; });
    return out;
  }

  // ─── Edge function helper (payments) ───
  function callPayments(body) {
    return sb().functions.invoke('payments', { body: body }).then(function (res) {
      if (res.error) {
        var ctx = res.error.context;
        if (ctx && typeof ctx.json === 'function') {
          return ctx.json().then(function (j) { var e = new Error(j.error || 'Payment service error'); e.code = j.code; throw e; },
            function () { throw new Error('Payment service is unavailable. Please try again.'); });
        }
        throw new Error('Payment service is unavailable. Please try again.');
      }
      if (res.data && res.data.error) { var er = new Error(res.data.error); er.code = res.data.code; throw er; }
      return res.data;
    });
  }

  // ─── Catalog (cached, de-duplicated) ───
  function fetchProducts(force) {
    var now = Date.now();
    if (!force && cache.products && now - cache.at < CACHE_TTL) return Promise.resolve(cache.products);
    if (!force && cache.inflight) return cache.inflight;
    cache.inflight = Promise.resolve(sb().from('products').select('*').order('created_at', { ascending: true }).order('name', { ascending: true }))
      .then(function (res) {
        var rows = unwrap(res, 'Could not load products') || [];
        cache.products = rows.map(mapProduct);
        cache.at = Date.now();
        cache.inflight = null;
        return cache.products;
      }, function (e) { cache.inflight = null; throw e; });
    return cache.inflight;
  }

  var productChannel = null;
  var productListeners = [];

  window.SangoAPI = {
    getBaseUrl: function () { return 'supabase'; },
    setBaseUrl: function () {},
    checkHealth: function () { return Promise.resolve(sb().from('products').select('id', { count: 'exact', head: true })).then(function (r) { return { status: r.error ? 'down' : 'up' }; }); },

    // ─── Products ───
    getProducts: function (params) {
      params = params || {};
      return fetchProducts(params.force).then(function (list) {
        var out = list.slice();
        if (params.category && params.category !== 'all') out = out.filter(function (p) { return p.category === params.category; });
        if (params.search) { var q = params.search.toLowerCase(); out = out.filter(function (p) { return (p.name + ' ' + p.category + ' ' + p.variant).toLowerCase().indexOf(q) !== -1; }); }
        return out;
      });
    },
    getProductBySlug: function (slug) {
      return Promise.resolve(sb().from('products').select('*').eq('slug', slug).maybeSingle()).then(function (res) { return mapProduct(unwrap(res)); });
    },
    getCategories: function () { return fetchProducts().then(function (l) { return l.map(function (p) { return p.category; }).filter(function (c, i, a) { return a.indexOf(c) === i; }); }); },
    invalidateProducts: function () { cache.at = 0; cache.products = null; },

    /** Subscribe to live product changes (insert / update / delete). Returns an unsubscribe function. */
    onProductsChange: function (cb) {
      productListeners.push(cb);
      if (!productChannel && window.SangoSupabase) {
        productChannel = window.SangoSupabase.channel('products-live')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, function (payload) {
            cache.at = 0;
            productListeners.slice().forEach(function (fn) { try { fn(payload); } catch (e) {} });
          }).subscribe();
      }
      return function () { productListeners = productListeners.filter(function (f) { return f !== cb; }); };
    },

    // ─── Admin: products ───
    adminAddProduct: function (p) {
      return Promise.resolve(sb().from('products').insert(productToRow(p)).select().single()).then(function (r) { cache.at = 0; return mapProduct(unwrap(r, 'Could not add product')); });
    },
    adminUpdateProduct: function (id, p) {
      var row = productToRow(p);
      return Promise.resolve(sb().from('products').update(row).eq('id', id).select().single()).then(function (r) { cache.at = 0; return mapProduct(unwrap(r, 'Could not update product')); });
    },
    adminDeleteProduct: function (id) {
      return Promise.resolve(sb().from('products').delete().eq('id', id).select('id')).then(function (r) {
        var rows = unwrap(r, 'Could not delete product');
        if (!rows || !rows.length) throw new Error('Delete was blocked. Make sure you are signed in as an administrator.');
        cache.at = 0; return null;
      });
    },
    adminToggleSoldOut: function (id, nextValue) {
      return Promise.resolve(sb().from('products').update({ is_sold_out: !!nextValue }).eq('id', id).select().single()).then(function (r) { cache.at = 0; return mapProduct(unwrap(r)); });
    },
    uploadProductImage: function (file) {
      if (!file) return Promise.reject(new Error('No file selected'));
      if (file.size > 5 * 1024 * 1024) return Promise.reject(new Error('Image must be smaller than 5 MB'));
      var ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      var path = 'products/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
      return Promise.resolve(sb().storage.from('product-images').upload(path, file, { cacheControl: '31536000', contentType: file.type })).then(function (res) {
        if (res.error) fail(res.error, 'Image upload failed');
        return { url: sb().storage.from('product-images').getPublicUrl(path).data.publicUrl, path: path };
      });
    },

    // ─── Coupons ───
    validateCoupon: function (code, subtotal) {
      return Promise.resolve(sb().rpc('validate_coupon', { p_code: code, p_subtotal: Math.round(subtotal || 0) })).then(function (r) {
        var d = unwrap(r, 'Could not validate coupon') || {};
        d.discountPercent = d.valid ? d.percent : undefined;
        d.discountAmount = d.discount;
        return d;
      });
    },
    validateCart: function () { return Promise.resolve({ valid: true }); },

    // ─── Orders ───
    createOrder: function (o) {
      var payload = {
        customerName: o.customerName, customerPhone: o.customerPhone, customerEmail: o.customerEmail,
        shippingAddress: o.shippingAddress, landmark: o.landmark, pincode: o.pincode, city: o.city, state: o.state, gstin: o.gstin,
        paymentMethod: (o.paymentMethod || 'COD').toUpperCase() === 'COD' ? 'COD' : 'ONLINE',
        couponCode: o.couponCode,
        items: (o.items || []).map(function (i) { return { productSlug: i.productSlug, qty: i.qty }; })
      };
      return Promise.resolve(sb().rpc('place_order', { p: payload })).then(function (r) { cache.at = 0; return unwrap(r, 'Could not place your order'); });
    },
    getOrderById: function (orderId, phone) {
      return Promise.resolve(sb().rpc('get_order_public', { p_order_id: orderId, p_phone: phone || null })).then(function (r) {
        var d = unwrap(r, 'Could not load order');
        if (!d) throw new Error('Order not found');
        return mapOrder(d);
      });
    },
    getOrder: function (orderId) { return this.getOrderById(orderId); },
    getUserOrders: function () {
      return Promise.resolve(sb().from('orders').select('*, order_items(*)').order('created_at', { ascending: false })).then(function (r) { return (unwrap(r) || []).map(mapOrder); });
    },
    cancelOrder: function (orderId, reason) {
      return Promise.resolve(sb().rpc('cancel_order', { p_order_id: orderId, p_reason: reason || null })).then(function (r) { cache.at = 0; return unwrap(r, 'Could not cancel order'); });
    },
    getCustomerProfile: function () {
      return Promise.resolve(sb().from('orders').select('*').order('created_at', { ascending: false }).limit(1)).then(function (r) {
        var o = (unwrap(r) || [])[0];
        if (!o) return null;
        return { fullName: o.customer_name, phone: o.customer_phone, shippingAddress: o.shipping_address, landmark: o.landmark, pincode: o.pincode, city: o.city, state: o.state };
      });
    },

    // ─── Payments (Razorpay via Supabase Edge Function) ───
    getPaymentConfig: function () { return callPayments({ action: 'config' }); },
    createPaymentIntent: function (d) { return callPayments({ action: 'create', orderId: d.orderId }); },
    verifyPayment: function (d) { return callPayments({ action: 'verify', orderId: d.orderId, razorpay_order_id: d.razorpay_order_id, razorpay_payment_id: d.razorpay_payment_id, razorpay_signature: d.razorpay_signature }); },
    failPayment: function (d) { return callPayments({ action: 'fail', orderId: d.orderId, reason: d.reason }); },
    confirmCod: function (orderId) { return this.getOrderById(orderId).then(function (o) { return { paymentId: 'COD-' + o.orderId, orderId: o.orderId }; }); },

    // ─── Cart sync (handled directly against user_carts by cart.js) ───
    syncCart: function () { return Promise.resolve(null); },
    getSyncedCart: function () { return Promise.resolve(null); },
    deleteSyncedCart: function () { return Promise.resolve(null); },

    // ─── Contact enquiries ───
    submitContact: function (d) {
      var message = (d.message || '').toString();
      if (d.productInterest) message = '[' + d.productInterest + '] ' + message;
      return Promise.resolve(sb().from('enquiries').insert({
        name: (d.name || d.fullName || '').toString().slice(0, 120), email: (d.email || '').toString().slice(0, 200),
        phone: (d.phone || '').toString().slice(0, 30), subject: (d.subject || '').toString().slice(0, 200), message: message.slice(0, 4000)
      })).then(function (r) { unwrap(r, 'Could not send your message'); return { success: true }; });
    },

    // ─── Admin: orders, stats, enquiries ───
    getAdminOrders: function () {
      return Promise.resolve(sb().from('orders').select('*, order_items(*)').order('created_at', { ascending: false })).then(function (r) { return (unwrap(r, 'Could not load orders') || []).map(mapOrder); });
    },
    updateOrderStatus: function (id, status, step, notes) {
      var patch = { status: status, status_step: step, tracking_notes: notes || null };
      if (step === 5) patch.payment_status = 'Paid'; // delivered COD orders are settled
      return Promise.resolve(sb().from('orders').update(patch).eq('id', id).select().single()).then(function (r) { return mapOrder(unwrap(r, 'Could not update order')); });
    },
    adminDeleteOrder: function (id) {
      return Promise.resolve(sb().from('orders').delete().eq('id', id).select('id')).then(function (r) {
        var rows = unwrap(r, 'Could not delete order');
        if (!rows || !rows.length) throw new Error('Delete was blocked. Make sure you are signed in as an administrator.');
        return null;
      });
    },
    getAdminStats: function () { return Promise.resolve(sb().rpc('admin_stats')).then(function (r) { return unwrap(r, 'Could not load stats'); }); },
    getAdminEnquiries: function () {
      return Promise.resolve(sb().from('enquiries').select('*').order('created_at', { ascending: false }).limit(200)).then(function (r) { return unwrap(r) || []; });
    }
  };
  window.SangoAPI.adminCreateProduct = window.SangoAPI.adminAddProduct;
  window.SangoAPI.adminGetOrders = window.SangoAPI.getAdminOrders;
  window.SangoAPI.adminUpdateOrderStatus = window.SangoAPI.updateOrderStatus;
})();
