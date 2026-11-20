/**
 * Sango Fiora — Enterprise API Client (Connects Frontend to Spring Boot REST Backend)
 */
(function () {
  'use strict';

  // In local dev, Spring Boot runs on port 8080.
  // In production, fallback to relative /api handled by server.js or backend proxy
  var API_BASE = window.SANGO_API_BASE || (
    typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://localhost:8080/api'
      : '/api'
  );

  function request(endpoint, options) {
    options = options || {};
    var url = API_BASE + endpoint;
    var headers = Object.assign({
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }, options.headers || {});

    // Attach Supabase auth token if user is signed in
    if (window.SangoAuth && window.SangoAuth.getUser()) {
      var session = window.SangoSupabase && window.SangoSupabase.auth ? window.SangoSupabase.auth.session : null;
      if (session && session.access_token) {
        headers['Authorization'] = 'Bearer ' + session.access_token;
      }
    }

    var config = {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined
    };

    return fetch(url, config).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () {
          return { error: 'HTTP error ' + res.status };
        }).then(function (err) {
          throw new Error(err.error || err.message || ('Request failed with status ' + res.status));
        });
      }
      if (res.status === 204) return null; // No Content
      return res.json();
    });
  }

  window.SangoAPI = {
    getBaseUrl: function () {
      return API_BASE;
    },
    setBaseUrl: function (url) {
      API_BASE = url;
    },

    // ─── Health ───
    checkHealth: function () {
      return request('/health');
    },

    // ─── Products & Catalog ───
    getProducts: function (params) {
      params = params || {};
      var qs = [];
      if (params.category && params.category !== 'all') {
        qs.push('category=' + encodeURIComponent(params.category));
      }
      if (params.search) {
        qs.push('search=' + encodeURIComponent(params.search));
      }
      var query = qs.length ? '?' + qs.join('&') : '';
      return request('/products' + query);
    },

    getProductBySlug: function (slug) {
      return request('/products/' + encodeURIComponent(slug));
    },

    getCategories: function () {
      return request('/products/categories');
    },

    // ─── Coupons (Server-Side Validation) ───
    validateCoupon: function (code, subtotal) {
      return request('/coupons/validate', {
        method: 'POST',
        body: { code: code, subtotal: subtotal }
      });
    },

    // ─── Cart (Server-Side Price & Stock Verification) ───
    validateCart: function (items, couponCode) {
      return request('/cart/validate', {
        method: 'POST',
        body: { items: items, couponCode: couponCode }
      });
    },

    // ─── Contact Enquiries ───
    submitContact: function (contactData) {
      return request('/contact', {
        method: 'POST',
        body: contactData
      });
    },
    getAdminEnquiries: function () {
      return request('/admin/enquiries');
    },

    // ─── Orders ───
    createOrder: function (orderData) {
      return request('/orders', {
        method: 'POST',
        body: orderData
      });
    },

    getOrderById: function (orderId) {
      return request('/orders/' + encodeURIComponent(orderId));
    },
    getOrder: function (orderId) {
      return this.getOrderById(orderId);
    },

    getUserOrders: function (userId) {
      return request('/orders/user/' + encodeURIComponent(userId));
    },

    // ─── Payments & Cryptographic Gateway ───
    createStripeIntent: function (stripeData) {
      return request('/payments/stripe/create-intent', {
        method: 'POST',
        body: stripeData
      });
    },

    confirmStripePayment: function (confirmData) {
      return request('/payments/stripe/confirm', {
        method: 'POST',
        body: confirmData
      });
    },

    createPaymentIntent: function (intentData) {
      return request('/payments/intent', {
        method: 'POST',
        body: intentData
      });
    },

    verifyPayment: function (verifyData) {
      return request('/payments/verify', {
        method: 'POST',
        body: verifyData
      });
    },

    failPayment: function (failData) {
      return request('/payments/fail', {
        method: 'POST',
        body: failData
      });
    },

    getPaymentStatus: function (paymentId) {
      return request('/payments/' + encodeURIComponent(paymentId));
    },

    getPaymentsForOrder: function (orderId) {
      return request('/payments/order/' + encodeURIComponent(orderId));
    },

    // ─── Admin Operations ───
    getAdminOrders: function () {
      return request('/admin/orders');
    },

    updateOrderStatus: function (orderDbId, status, step, trackingNotes) {
      return request('/admin/orders/' + encodeURIComponent(orderDbId) + '/status', {
        method: 'PATCH',
        body: { status: status, step: step, trackingNotes: trackingNotes }
      });
    },

    getAdminStats: function () {
      return request('/admin/stats');
    },

    adminAddProduct: function (product) {
      return request('/admin/products', {
        method: 'POST',
        body: product
      });
    },

    adminUpdateProduct: function (id, product) {
      return request('/admin/products/' + encodeURIComponent(id), {
        method: 'PUT',
        body: product
      });
    },

    adminDeleteProduct: function (id) {
      return request('/admin/products/' + encodeURIComponent(id), {
        method: 'DELETE'
      });
    },

    adminToggleSoldOut: function (id) {
      return request('/admin/products/' + encodeURIComponent(id) + '/toggle-sold-out', {
        method: 'PATCH'
      });
    }
  };

  console.log('%c[Sango Fiora] Spring Boot REST API Client initialized ✓ (%s)', 'color: #16a34a; font-weight: bold;', API_BASE);
})();
