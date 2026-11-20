/**
 * Sango Fiora — Enterprise API Client (Connects Frontend to Spring Boot REST Backend)
 */
(function () {
  'use strict';

  // In local dev, Spring Boot runs on port 8080.
  // In production (Railway), backend serves both API and static files from same origin.
  // window.SANGO_API_BASE can be set via env or defaults to '/api' for same-origin requests.
  var API_BASE = window.SANGO_API_BASE || '/api';

  function request(endpoint, options) {
    options = options || {};
    var url = API_BASE + endpoint;
    var headers = Object.assign({
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }, options.headers || {});

    // Attach auth token if user/admin is signed in
    var token = (window.SangoAuth && window.SangoAuth.getToken) ? window.SangoAuth.getToken() : null;
    if (!token) {
      try {
        var saved = JSON.parse(localStorage.getItem('sango_auth_session') || '{}');
        if (saved && saved.access_token) token = saved.access_token;
        else if (saved && saved.user && saved.user.email) token = 'admin:' + saved.user.email;
      } catch (e) {}
    }
    if (!token) {
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf('sb-') === 0 && k.indexOf('-auth-token') !== -1) {
            var raw = JSON.parse(localStorage.getItem(k));
            if (raw && raw.access_token) token = raw.access_token;
            else if (raw && raw.session && raw.session.access_token) token = raw.session.access_token;
          }
        }
      } catch (e) {}
    }

    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }

    var user = (window.SangoAuth && window.SangoAuth.getUser) ? window.SangoAuth.getUser() : null;
    if (!user) {
      try {
        var sUser = JSON.parse(localStorage.getItem('sango_auth_session') || '{}');
        user = sUser.user || sUser;
      } catch (e) {}
    }
    if (user && user.email) {
      headers['X-Admin-Email'] = user.email;
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

    // ─── Image Upload ───
    uploadProductImage: function (file) {
      var formData = new FormData();
      formData.append('file', file);

      var headers = {};
      try {
        var raw = localStorage.getItem('sango_auth_session');
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && parsed.session && parsed.session.access_token) {
            headers['Authorization'] = 'Bearer ' + parsed.session.access_token;
          }
        }
      } catch (e) {}

      return fetch(API_BASE + '/products/upload-image', {
        method: 'POST',
        headers: headers,
        body: formData
      }).then(function (res) {
        if (!res.ok) {
          return res.json().catch(function () { return { error: 'Upload failed' }; }).then(function (err) {
            throw new Error(err.error || 'Upload failed with status ' + res.status);
          });
        }
        return res.json();
      });
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
    adminGetOrders: function () {
      return this.getAdminOrders();
    },

    updateOrderStatus: function (orderDbId, status, step, trackingNotes) {
      return request('/admin/orders/' + encodeURIComponent(orderDbId) + '/status', {
        method: 'PATCH',
        body: { status: status, step: step, trackingNotes: trackingNotes }
      });
    },
    adminUpdateOrderStatus: function (orderDbId, status, step, trackingNotes) {
      return this.updateOrderStatus(orderDbId, status, step, trackingNotes);
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
    adminCreateProduct: function (product) {
      return this.adminAddProduct(product);
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
    },

    // ─── Unified Cart & Customer Sync ───
    syncCart: function (cartData) {
      return request('/cart/sync', {
        method: 'POST',
        body: cartData
      });
    },

    getSyncedCart: function (email) {
      return request('/cart/sync?email=' + encodeURIComponent(email));
    },

    deleteSyncedCart: function (email) {
      return request('/cart/sync?email=' + encodeURIComponent(email), {
        method: 'DELETE'
      });
    },

    cancelOrder: function (orderId, reason) {
      return request('/orders/' + encodeURIComponent(orderId) + '/cancel', {
        method: 'POST',
        body: { reason: reason || 'Customer requested cancellation' }
      });
    },

    getCustomerProfile: function (email) {
      return request('/customer/profile?email=' + encodeURIComponent(email));
    },

    confirmCod: function (orderId, userId) {
      return request('/payments/cod/confirm', {
        method: 'POST',
        body: { orderId: orderId, userId: userId }
      });
    },

    getDeliveries: function (format) {
      return request('/spreadsheet/deliveries' + (format ? '?format=' + format : ''));
    },

    getContacts: function (format) {
      return request('/spreadsheet/contacts' + (format ? '?format=' + format : ''));
    },

    submitDelivery: function (deliveryData) {
      return request('/spreadsheet/delivery', {
        method: 'POST',
        body: deliveryData
      });
    }
  };

  console.log('%c[Sango Fiora] Spring Boot REST API Client initialized ✓ (%s)', 'color: #16a34a; font-weight: bold;', API_BASE);
})();
