/**
 * Sango Fiora — Multi-Step Interactive Checkout Engine & Invoice Generator
 */
(function () {
  'use strict';

  // XSS protection: escape user-facing strings before inserting into innerHTML
  function escapeHTML(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str == null ? '' : String(str)));
    return div.innerHTML;
  }

  var ORDERS_KEY = 'sango-orders-v1';

  function readOrders() {
    try { return JSON.parse(localStorage.getItem(ORDERS_KEY)) || []; }
    catch (e) { return []; }
  }

  function writeOrders(orders) {
    localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
    if (window.AppEvent) window.AppEvent.emit('orders:updated', orders);
  }

  function generateOrderId() {
    var rand = Math.floor(100000 + Math.random() * 900000);
    return 'SANGO-' + rand;
  }

  function formatCurrency(n) {
    return '₹' + Number(n || 0).toLocaleString('en-IN');
  }

  window.CheckoutEngine = {
    getOrders: readOrders,

    /**
     * Places the order through the database (place_order RPC). Prices, stock, coupon, delivery and GST are all
     * computed server-side from the live catalogue, so the browser can never set its own total.
     * Online orders stay "Pending" until the payment is verified on the payment page.
     */
    createOrderAsync: function (customerData, paymentData) {
      var items = window.CartEngine ? window.CartEngine.getItems() : [];
      var totals = window.CartEngine ? window.CartEngine.getTotals() : {};

      if (!items || !items.length) {
        return Promise.reject(new Error('Your cart is empty. Please add plants before checking out.'));
      }
      if (!customerData || !customerData.name || !customerData.address) {
        return Promise.reject(new Error('Please complete your delivery address details.'));
      }
      if (!window.SangoAuth || !window.SangoAuth.isLoggedIn()) {
        if (window.openAuthModal) window.openAuthModal('signin', 'Sign in to place your order and track it later.');
        return Promise.reject(new Error('Please sign in to place your order.'));
      }

      var method = (paymentData && paymentData.method === 'COD') ? 'COD' : 'ONLINE';
      return window.SangoAPI.createOrder({
        customerName: customerData.name,
        customerPhone: customerData.phone,
        customerEmail: customerData.email || (window.SangoAuth.getUser() || {}).email || '',
        shippingAddress: customerData.address,
        landmark: customerData.landmark || '',
        pincode: customerData.pincode,
        city: customerData.city,
        state: customerData.state,
        gstin: customerData.gstin || '',
        paymentMethod: method,
        couponCode: totals.couponCode || null,
        items: items.map(function (it) { return { productSlug: it.slug, qty: it.qty }; })
      }).then(function (res) {
        var now = new Date(res.createdAt || Date.now());
        var order = {
          orderId: res.orderId,
          createdAt: now.toISOString(),
          dateString: now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
          estDeliveryDate: new Date(now.getTime() + 4 * 864e5).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
          status: res.status || 'Order Placed',
          statusStep: 1,
          items: JSON.parse(JSON.stringify(items)),
          customer: {
            name: customerData.name, phone: customerData.phone, email: customerData.email,
            address: customerData.address, landmark: customerData.landmark || '',
            pincode: customerData.pincode, city: customerData.city, state: customerData.state, gstin: customerData.gstin || ''
          },
          payment: { method: method, status: method === 'COD' ? 'Pending (COD)' : 'Pending' },
          netTotal: res.netTotal,
          totals: {
            subtotal: res.subtotal, couponCode: res.couponCode, couponDiscount: res.couponDiscount,
            volumeDiscount: res.volumeDiscount, deliveryFee: res.deliveryFee, gstAmount: res.gstAmount, netTotal: res.netTotal
          }
        };
        // COD is complete at this point. Online orders keep the cart until the payment is verified.
        if (method === 'COD' && window.CartEngine) window.CartEngine.clearCart();
        if (window.AppEvent) window.AppEvent.emit('order:created', order);
        return order;
      });
    },

    createOrder: function (customerData, paymentData) {
      return this.createOrderAsync(customerData, paymentData);
    }
  };

  // Shared Pincode Lookup delegated cleanly to PincodeLookup (no duplicate hardcoded table)
  // Checkout UI Controller
  document.addEventListener('DOMContentLoaded', function () {
    var step1 = document.getElementById('checkout-step-1');
    var step2 = document.getElementById('checkout-step-2');
    var step3 = document.getElementById('checkout-step-3');
    var step4 = document.getElementById('checkout-step-4');

    if (!step1) return; // Not on cart/checkout page

    var currentStep = 1;

    // Check URL parameters for direct step launch
    var params = new URLSearchParams(location.search);
    if (params.get('step') === 'shipping' && window.CartEngine && window.CartEngine.getItems().length > 0) {
      goToStep(2);
    } else {
      renderCheckoutView();
    }

    function goToStep(s) {
      currentStep = s;
      [step1, step2, step3, step4].forEach(function (el, idx) {
        if (!el) return;
        if (idx + 1 === currentStep) el.classList.remove('hidden');
        else el.classList.add('hidden');
      });

      // Update Step Indicators
      document.querySelectorAll('.checkout-progress-step').forEach(function (indicator, idx) {
        var stepNum = idx + 1;
        indicator.classList.toggle('bg-amber-500', stepNum === currentStep);
        indicator.classList.toggle('text-plant-dark', stepNum === currentStep);
        indicator.classList.toggle('font-bold', stepNum === currentStep);
        indicator.classList.toggle('bg-green-700', stepNum < currentStep);
        indicator.classList.toggle('text-white', stepNum <= currentStep);
        indicator.classList.toggle('bg-gray-200', stepNum > currentStep);
        indicator.classList.toggle('text-gray-500', stepNum > currentStep);
      });

      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function renderCheckoutView() {
      var items = window.CartEngine.getItems();
      var totals = window.CartEngine.getTotals();

      var list = document.getElementById('checkout-items-list');
      var emptyBox = document.getElementById('checkout-empty-state');
      var wrap = document.getElementById('checkout-active-wrapper');

      if (!items.length && currentStep !== 4) {
        if (emptyBox) emptyBox.classList.remove('hidden');
        if (wrap) wrap.classList.add('hidden');
        return;
      }

      if (emptyBox) emptyBox.classList.add('hidden');
      if (wrap) wrap.classList.remove('hidden');

      // Render Line Items for Step 1
      if (list) {
        list.innerHTML = items.map(function (i) {
          var safeName = escapeHTML(i.name);
          var safeSlug = escapeHTML(i.slug);
          var safeImage = escapeHTML(i.image);
          var safeSize = escapeHTML(i.size);
          return '<div class="flex flex-col sm:flex-row sm:items-center gap-4 py-4 border-b border-gray-100 last:border-0">' +
            '<img src="' + safeImage + '" alt="" class="w-16 h-16 rounded-2xl object-cover bg-green-50 shrink-0">' +
            '<div class="flex-1 min-w-0"><p class="font-bold text-gray-900 text-sm">' + safeName + '</p>' +
            '<p class="text-xs text-gray-400">' + (safeSize || 'Pot Included') + '</p>' +
            '<p class="text-xs font-bold text-plant-main mt-0.5">' + formatCurrency(i.price) + ' each</p></div>' +
            '<div class="flex items-center gap-2">' +
            '<button type="button" data-dec="' + safeSlug + '" class="w-8 h-8 rounded-xl border border-gray-200 hover:bg-green-50 font-bold text-sm">−</button>' +
            '<span class="w-8 text-center font-bold text-sm">' + i.qty + '</span>' +
            '<button type="button" data-inc="' + safeSlug + '" class="w-8 h-8 rounded-xl border border-gray-200 hover:bg-green-50 font-bold text-sm">+</button>' +
            '</div>' +
            '<p class="font-bold text-base text-gray-900 w-24 text-right">' + formatCurrency(i.price * i.qty) + '</p>' +
            '<button type="button" data-remove="' + safeSlug + '" class="text-gray-300 hover:text-red-500 font-bold text-xl leading-none">&times;</button>' +
            '</div>';
        }).join('');
      }

      // Update Summary Sidebar Boxes
      document.querySelectorAll('[data-summary-subtotal]').forEach(function (el) { el.textContent = formatCurrency(totals.subtotal); });
      var cartSavingsRow = document.getElementById('cart-savings-row');
      if (cartSavingsRow) {
        cartSavingsRow.classList.toggle('hidden', !totals.mrpSavings || totals.mrpSavings <= 0);
        cartSavingsRow.classList.toggle('flex', totals.mrpSavings > 0);
      }
      document.querySelectorAll('[data-summary-mrp-savings]').forEach(function (el) {
        el.textContent = totals.mrpSavings > 0 ? '-' + formatCurrency(totals.mrpSavings) : '';
      });
      document.querySelectorAll('[data-summary-discount]').forEach(function (el) {
        el.textContent = totals.couponDiscount > 0 ? '-' + formatCurrency(totals.couponDiscount) : formatCurrency(0);
      });
      document.querySelectorAll('[data-summary-delivery]').forEach(function (el) {
        el.textContent = totals.deliveryFee === 0 ? 'FREE' : formatCurrency(totals.deliveryFee);
      });
      document.querySelectorAll('[data-summary-total]').forEach(function (el) { el.textContent = formatCurrency(totals.netTotal); });

      var couponMsg = document.getElementById('checkout-coupon-msg');
      var couponRow = document.getElementById('cart-applied-coupon-row');
      var couponCodeText = document.getElementById('cart-applied-coupon-code');

      if (couponRow && couponCodeText) {
        if (totals.couponCode) {
          couponRow.classList.remove('hidden');
          couponRow.classList.add('flex');
          couponCodeText.textContent = totals.couponCode + (totals.couponLabel ? ' (' + totals.couponLabel + ')' : '');
        } else {
          couponRow.classList.add('hidden');
          couponRow.classList.remove('flex');
        }
      }

      if (couponMsg) {
        if (totals.couponCode) {
          couponMsg.textContent = '';
        } else if (/applied|verifying/i.test(couponMsg.textContent)) {
          couponMsg.textContent = '';
        }
      }
    }

    // Smart Pincode Lookup Engine via PincodeLookup
    function lookupPincode(pin) {
      if (window.PincodeLookup && window.PincodeLookup.lookupPincode) {
        return window.PincodeLookup.lookupPincode(pin);
      }
      return null;
    }

    // Pincode Lookup Handler
    var pincodeInput = document.getElementById('ship-pincode');
    var cityInput = document.getElementById('ship-city');
    var stateInput = document.getElementById('ship-state');
    if (pincodeInput) {
      pincodeInput.addEventListener('input', function () {
        var pin = pincodeInput.value.trim();
        var match = lookupPincode(pin);
        if (match) {
          if (cityInput) cityInput.value = match.city;
          if (stateInput) stateInput.value = match.state;
        }
      });
    }

    // Coupon Apply Button
    var applyCouponBtn = document.getElementById('btn-apply-coupon');
    var couponInput = document.getElementById('checkout-coupon-input');
    if (applyCouponBtn && couponInput) {
      applyCouponBtn.addEventListener('click', function () {
        var code = couponInput.value.trim();
        if (!code) return;
        applyCouponBtn.disabled = true;
        var res = window.CartEngine.applyCoupon(code, function (cbRes) {
          applyCouponBtn.disabled = false;
          if (cbRes.success && couponInput) couponInput.value = '';
          var cMsg = document.getElementById('checkout-coupon-msg');
          if (cMsg) {
            cMsg.textContent = cbRes.success ? '' : cbRes.message;
            cMsg.className = cbRes.success ? 'text-xs text-green-600 font-bold mt-1' : 'text-xs text-red-600 font-bold mt-1';
          }
          if (window.showToast) window.showToast(cbRes.message);
          renderCheckoutView();
        });
        if (window.showToast && res && res.message) window.showToast(res.message);
        renderCheckoutView();
      });
    }

    // Coupon Remove Button
    var removeCouponBtn = document.getElementById('btn-remove-coupon');
    if (removeCouponBtn) {
      removeCouponBtn.addEventListener('click', function () {
        if (window.CartEngine && window.CartEngine.removeCoupon) {
          window.CartEngine.removeCoupon(function (res) {
            if (window.showToast) window.showToast(res.message);
            if (couponInput) couponInput.value = '';
            renderCheckoutView();
          });
        }
      });
    }

    // Step Nav Buttons
    var toStep2 = document.getElementById('btn-to-step-2');
    if (toStep2) {
      toStep2.addEventListener('click', function () {
        var isAuthed = window.SangoAuth && window.SangoAuth.isLoggedIn && window.SangoAuth.isLoggedIn();
        if (!isAuthed) {
          if (window.openAuthModal) {
            window.openAuthModal('signin', 'Please sign in to proceed to shipping and checkout.');
          } else {
            location.href = '/login/?redirect=/cart/';
          }
          if (window.showToast) window.showToast('Please sign in to proceed with checkout.');
          return;
        }
        goToStep(2);
      });
    }

    var backToStep1 = document.getElementById('btn-back-to-1');
    if (backToStep1) backToStep1.addEventListener('click', function () { goToStep(1); });

    var shippingForm = document.getElementById('shipping-address-form');
    var customerData = {};

    if (shippingForm) {
      shippingForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!shippingForm.checkValidity()) {
          shippingForm.reportValidity();
          return;
        }
        var formData = new FormData(shippingForm);
        customerData = {
          name: formData.get('name'),
          phone: formData.get('phone'),
          email: formData.get('email'),
          address: formData.get('address'),
          landmark: formData.get('landmark'),
          pincode: formData.get('pincode'),
          city: formData.get('city') || 'City',
          state: formData.get('state') || 'State',
          gstin: formData.get('gstin')
        };
        goToStep(3);
      });
    }

    // 1-Click Checkout: Auto-fill returning customer profile (STRICTLY SCOPED TO CURRENT USER)
    function autoFillCustomerProfile() {
      var user = window.SangoAuth && window.SangoAuth.getUser ? window.SangoAuth.getUser() : null;
      var banner = document.getElementById('one-click-profile-banner');

      var nameInput = shippingForm ? shippingForm.querySelector('input[name="name"]') : null;
      var phoneInput = shippingForm ? shippingForm.querySelector('input[name="phone"]') : null;
      var emailInput = shippingForm ? shippingForm.querySelector('input[name="email"]') : null;
      var addrInput = shippingForm ? shippingForm.querySelector('textarea[name="address"]') : null;
      var pinInput = shippingForm ? shippingForm.querySelector('input[name="pincode"]') : null;
      var cityInput = shippingForm ? shippingForm.querySelector('input[name="city"]') : null;
      var stateInput = shippingForm ? shippingForm.querySelector('input[name="state"]') : null;
      var lmkInput = shippingForm ? shippingForm.querySelector('input[name="landmark"]') : null;

      if (!user || !user.email) {
        if (banner) banner.classList.add('hidden');
        if (emailInput) { emailInput.value = ''; emailInput.readOnly = false; }
        if (nameInput) nameInput.value = '';
        if (phoneInput) phoneInput.value = '';
        if (addrInput) addrInput.value = '';
        if (pinInput) pinInput.value = '';
        if (cityInput) cityInput.value = '';
        if (stateInput) stateInput.value = '';
        if (lmkInput) lmkInput.value = '';
        return;
      }

      if (emailInput) {
        emailInput.value = user.email;
        emailInput.readOnly = true;
      }

      var profileCall = (window.SangoAPI && window.SangoAPI.getCustomerProfile)
        ? window.SangoAPI.getCustomerProfile(user.email)
        : Promise.resolve(null);

      profileCall
        .then(function (data) {
          if (data && data.shippingAddress && (!data.email || data.email.toLowerCase() === user.email.toLowerCase())) {
            if (banner) banner.classList.remove('hidden');

            if (nameInput && data.fullName) nameInput.value = data.fullName;
            if (phoneInput && data.phone) phoneInput.value = data.phone;
            if (addrInput && data.shippingAddress) addrInput.value = data.shippingAddress;
            if (pinInput && data.pincode) pinInput.value = data.pincode;
            if (cityInput && data.city) cityInput.value = data.city;
            if (stateInput && data.state) stateInput.value = data.state;
            if (lmkInput && data.landmark) lmkInput.value = data.landmark;
          } else {
            // No prior address on record for this specific account: clean form
            if (banner) banner.classList.add('hidden');
            if (nameInput) nameInput.value = '';
            if (phoneInput) phoneInput.value = '';
            if (addrInput) addrInput.value = '';
            if (pinInput) pinInput.value = '';
            if (cityInput) cityInput.value = '';
            if (stateInput) stateInput.value = '';
            if (lmkInput) lmkInput.value = '';
          }
        }).catch(function () {
          if (banner) banner.classList.add('hidden');
        });
    }

    autoFillCustomerProfile();
    if (window.AppEvent) {
      window.AppEvent.on('auth:changed', autoFillCustomerProfile);
    }

    var backToStep2 = document.getElementById('btn-back-to-2');
    if (backToStep2) backToStep2.addEventListener('click', function () { goToStep(2); });
    var backToStep2b = document.getElementById('btn-back-to-2-b');
    if (backToStep2b) backToStep2b.addEventListener('click', function () { goToStep(2); });

    // Payment Selection & Final Order Submission (Async Database Integration)
    var placeOrderBtn = document.getElementById('btn-place-order');
    if (placeOrderBtn) {
      placeOrderBtn.addEventListener('click', function () {
        var cartItems = window.CartEngine ? window.CartEngine.getItems() : [];
        if (!cartItems.length) {
          if (window.showToast) window.showToast('Your cart is empty. Add plants before checking out.');
          goToStep(1);
          return;
        }

        // Validate customer shipping details
        if (!customerData || !customerData.name || !customerData.address) {
          if (shippingForm && shippingForm.checkValidity()) {
            var fd = new FormData(shippingForm);
            customerData = {
              name: fd.get('name'),
              phone: fd.get('phone'),
              email: fd.get('email'),
              address: fd.get('address'),
              landmark: fd.get('landmark'),
              pincode: fd.get('pincode'),
              city: fd.get('city') || 'City',
              state: fd.get('state') || 'State',
              gstin: fd.get('gstin')
            };
          } else {
            if (window.showToast) window.showToast('Please complete your shipping address in Step 2.');
            goToStep(2);
            return;
          }
        }

        var selectedMethod = document.querySelector('input[name="payment_method"]:checked');
        var method = selectedMethod ? selectedMethod.value : 'COD';

        // Set Loading state on button
        placeOrderBtn.disabled = true;
        var originalBtnHTML = placeOrderBtn.innerHTML;
        placeOrderBtn.innerHTML = '<span class="inline-block animate-spin mr-2"><span class="material-symbols-outlined ico" aria-hidden="true">eco</span></span> Securing Order & Processing Payment...';

        window.CheckoutEngine.createOrderAsync(customerData, { method: method })
          .then(function (confirmedOrder) {
            if (method !== 'COD') {
              // Online Gateway (UPI, Card, NetBanking): Redirect to dedicated 256-bit payment portal
              window.location.href = '/payment/?orderId=' + encodeURIComponent(confirmedOrder.orderId);
            } else {
              goToStep(4);
              renderOrderReceipt(confirmedOrder);
              if (window.showToast) window.showToast('Order #' + confirmedOrder.orderId + ' confirmed successfully!');
            }
          })
          .catch(function (err) {
            placeOrderBtn.disabled = false;
            placeOrderBtn.innerHTML = originalBtnHTML;
            if (window.showToast) window.showToast(err.message || 'Error creating order. Please retry.');
          });
      });
    }

    function renderOrderReceipt(order) {
      var receiptBox = document.getElementById('order-receipt-content');
      if (!receiptBox) return;

      var safeCustName = escapeHTML(order.customer.name);
      var safeAddress = escapeHTML(order.customer.address);
      var safeLandmark = escapeHTML(order.customer.landmark);
      var safeCity = escapeHTML(order.customer.city);
      var safeState = escapeHTML(order.customer.state);
      var safePincode = escapeHTML(order.customer.pincode);
      var safePhone = escapeHTML(order.customer.phone);

      receiptBox.innerHTML =
        '<div class="text-center pb-6 border-b border-gray-100">' +
        '<div class="w-16 h-16 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-3xl mx-auto mb-3"><span class="material-symbols-outlined ico" aria-hidden="true">check</span></div>' +
        '<span class="text-xs font-bold uppercase tracking-widest text-plant-main">Order Successfully Confirmed</span>' +
        '<h2 class="font-display text-3xl font-bold text-gray-900 mt-1">Thank You, ' + safeCustName + '!</h2>' +
        '<p class="text-sm text-gray-500 mt-1">Order Reference: <strong class="text-gray-900 font-mono">' + escapeHTML(order.orderId) + '</strong></p>' +
        '<p class="text-xs text-amber-600 bg-amber-50 rounded-lg py-1.5 px-4 inline-block font-bold mt-2">Estimated Delivery: ' + escapeHTML(order.estDeliveryDate) + '</p>' +
        '</div>' +

        '<div class="py-6 border-b border-gray-100 grid sm:grid-cols-2 gap-4 text-xs">' +
        '<div><p class="text-gray-400 font-bold uppercase tracking-wider mb-1">Shipping To</p>' +
        '<p class="font-bold text-gray-900">' + safeCustName + '</p>' +
        '<p class="text-gray-600">' + safeAddress + (safeLandmark ? ', ' + safeLandmark : '') + '</p>' +
        '<p class="text-gray-600">' + safeCity + ', ' + safeState + ' - ' + safePincode + '</p>' +
        '<p class="text-gray-600">Phone: ' + safePhone + '</p></div>' +

        '<div><p class="text-gray-400 font-bold uppercase tracking-wider mb-1">Payment Method</p>' +
        '<p class="font-bold text-gray-900">' + escapeHTML(order.payment.method) + ' (' + escapeHTML(order.payment.status) + ')</p>' +
        '<p class="text-gray-500">Transaction Ref: ' + escapeHTML(order.payment.txnId) + '</p>' +
        '<p class="text-gray-500">Order Date: ' + escapeHTML(order.dateString) + '</p></div>' +
        '</div>' +

        '<div class="py-6 border-b border-gray-100 space-y-3">' +
        '<p class="text-xs font-bold text-gray-900 uppercase tracking-wider">Itemized Summary</p>' +
        order.items.map(function (i) {
          return '<div class="flex items-center justify-between text-xs py-1">' +
            '<span class="text-gray-800 font-medium">' + escapeHTML(i.name) + ' × ' + i.qty + '</span>' +
            '<span class="font-bold text-gray-900">' + formatCurrency(i.price * i.qty) + '</span></div>';
        }).join('') +
        '</div>' +

        '<div class="pt-4 space-y-1.5 text-xs text-right">' +
        '<div class="flex justify-between text-gray-500"><span>Subtotal:</span><span>' + formatCurrency(order.totals.subtotal) + '</span></div>' +
        (order.totals.couponDiscount ? '<div class="flex justify-between text-green-600"><span>Discount (' + order.totals.couponCode + '):</span><span>-' + formatCurrency(order.totals.couponDiscount) + '</span></div>' : '') +
        '<div class="flex justify-between text-gray-500"><span>Delivery Fee:</span><span>' + (order.totals.deliveryFee === 0 ? 'FREE' : formatCurrency(order.totals.deliveryFee)) + '</span></div>' +
        '<div class="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-100"><span>Total Paid:</span><span class="text-plant-main">' + formatCurrency(order.totals.netTotal) + '</span></div>' +
        '</div>' +
        '<div class="mt-6 pt-4 border-t border-gray-100 flex flex-wrap gap-3 justify-center">' +
        '<a href="/order-success/?orderId=' + encodeURIComponent(order.orderId) + '" class="px-6 py-2.5 rounded-full bg-amber-gold hover:bg-amber-400 text-deep-forest font-bold text-xs shadow-md transition-all">View Printable Invoice &amp; Live Tracking →</a>' +
        '</div>';
    }

    if (window.AppEvent) {
      window.AppEvent.on('cart:updated', renderCheckoutView);
      window.AppEvent.on('auth:changed', function () {
        if (couponInput) couponInput.value = '';
        var cMsg = document.getElementById('checkout-coupon-msg');
        if (cMsg) cMsg.textContent = '';
        renderCheckoutView();
      });
    }
  });

})();
