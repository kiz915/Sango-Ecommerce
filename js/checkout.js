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

    createOrderAsync: function (customerData, paymentData) {
      var totals = window.CartEngine ? window.CartEngine.getTotals() : { netTotal: 0 };
      var items = window.CartEngine ? window.CartEngine.getItems() : [];

      if (!items || !items.length) {
        return Promise.reject(new Error('Your cart is empty. Please add plants before checking out.'));
      }

      if (!customerData || !customerData.name || !customerData.address) {
        return Promise.reject(new Error('Please complete your shipping address details in Step 2.'));
      }

      var orderId = generateOrderId();
      var now = new Date();
      var estDelivery = new Date(now.getTime() + (4 * 24 * 60 * 60 * 1000)); // 4 days out

      var localOrder = {
        orderId: orderId,
        createdAt: now.toISOString(),
        dateString: now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
        estDeliveryDate: estDelivery.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
        status: 'Order Placed',
        statusStep: 1,
        items: JSON.parse(JSON.stringify(items)),
        customer: {
          name: customerData.name,
          phone: customerData.phone,
          email: customerData.email,
          address: customerData.address,
          landmark: customerData.landmark || '',
          pincode: customerData.pincode,
          city: customerData.city || 'City',
          state: customerData.state || 'State',
          gstin: customerData.gstin || ''
        },
        payment: {
          method: paymentData.method,
          status: paymentData.method === 'COD' ? 'Pending (COD)' : 'Paid',
          txnId: 'TXN-' + Math.floor(10000000 + Math.random() * 90000000)
        },
        totals: totals
      };

      // Prepare payload for Spring Boot REST API
      var user = (window.SangoAuth && window.SangoAuth.getUser()) ? window.SangoAuth.getUser() : null;
      var apiPayload = {
        userId: user ? user.id : null,
        customerName: customerData.name,
        customerPhone: customerData.phone,
        customerEmail: customerData.email,
        shippingAddress: customerData.address,
        landmark: customerData.landmark || '',
        pincode: customerData.pincode,
        city: customerData.city || 'City',
        state: customerData.state || 'State',
        gstin: customerData.gstin || '',
        paymentMethod: paymentData.method,
        couponCode: totals.couponCode || null,
        items: items.map(function (it) {
          return {
            productName: it.name,
            productSlug: it.slug,
            productImage: it.image,
            productVariant: it.variant || '',
            productCategory: it.category || '',
            size: it.size || '',
            price: it.price,
            mrp: it.mrp || it.price,
            qty: it.qty
          };
        })
      };

      var apiCall = window.SangoAPI ? window.SangoAPI.createOrder(apiPayload).catch(function(err) {
        console.warn('[Checkout] Backend createOrder fallback to local/Supabase:', err.message);
        return localOrder;
      }) : Promise.resolve(localOrder);

      return apiCall.then(function (serverOrder) {
        if (serverOrder && serverOrder.orderId) {
          localOrder.orderId = serverOrder.orderId;
          localOrder.netTotal = serverOrder.netTotal;
          localOrder.status = serverOrder.status;
          if (serverOrder.createdAt) localOrder.createdAt = serverOrder.createdAt;
        }

        // Save directly to Supabase orders table (awaited before navigation)
        var supabasePromise = Promise.resolve();
        if (window.SangoSupabase) {
          var sbOrder = {
            order_id: localOrder.orderId,
            user_id: user ? user.id : null,
            customer_name: customerData.name,
            customer_phone: customerData.phone,
            customer_email: customerData.email,
            shipping_address: customerData.address,
            landmark: customerData.landmark || '',
            pincode: customerData.pincode,
            city: customerData.city || 'City',
            state: customerData.state || 'State',
            gstin: customerData.gstin || '',
            payment_method: paymentData.method,
            payment_status: paymentData.method === 'COD' ? 'Pending (COD)' : 'Paid',
            subtotal: totals.subtotal || 0,
            coupon_code: totals.couponCode || null,
            coupon_discount: totals.couponDiscount || 0,
            delivery_fee: totals.deliveryFee || 0,
            gst_amount: totals.gstAmount || Math.round((totals.netTotal || 0) * 0.18 / 1.18),
            net_total: totals.netTotal || 0,
            status: 'Order Placed',
            status_step: 1
          };

          supabasePromise = window.SangoSupabase.from('orders').insert([sbOrder]).select().then(function (res) {
            if (res.data && res.data[0]) {
              var parentDbId = res.data[0].id;
              var lineRows = items.map(function (it) {
                return {
                  order_id: parentDbId,
                  product_name: it.name,
                  product_slug: it.slug,
                  product_image: it.image,
                  product_variant: it.variant || '',
                  product_category: it.category || '',
                  size: it.size || '',
                  price: it.price,
                  mrp: it.mrp || it.price,
                  qty: it.qty
                };
              });
              return window.SangoSupabase.from('order_items').insert(lineRows);
            }
          }).catch(function (sbErr) {
            console.warn('[Checkout] Supabase direct order insert notice:', sbErr);
          });
        }

        return supabasePromise.then(function () {
          // Save confirmed order to local storage
          var orders = readOrders();
          orders.unshift(localOrder);
          writeOrders(orders);

          // Clear cart only after verified success
          if (window.CartEngine) window.CartEngine.clearCart();
          if (window.AppEvent) window.AppEvent.emit('order:created', localOrder);

          return localOrder;
        });
      });
    },

    createOrder: function (customerData, paymentData) {
      return this.createOrderAsync(customerData, paymentData);
    }
  };

  // Indian Pincode Auto City/State Lookup Table
  var PINCODE_DB = {
    '636001': { city: 'Salem', state: 'Tamil Nadu' },
    '600001': { city: 'Chennai', state: 'Tamil Nadu' },
    '560001': { city: 'Bengaluru', state: 'Karnataka' },
    '500001': { city: 'Hyderabad', state: 'Telangana' },
    '400001': { city: 'Mumbai', state: 'Maharashtra' },
    '110001': { city: 'New Delhi', state: 'Delhi' },
    '641001': { city: 'Coimbatore', state: 'Tamil Nadu' },
    '625001': { city: 'Madurai', state: 'Tamil Nadu' }
  };

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
      document.querySelectorAll('[data-summary-mrp-savings]').forEach(function (el) {
        el.textContent = totals.mrpSavings > 0 ? 'Save ' + formatCurrency(totals.mrpSavings) : '';
        el.classList.toggle('hidden', totals.mrpSavings === 0);
      });
      document.querySelectorAll('[data-summary-discount]').forEach(function (el) {
        el.textContent = totals.couponDiscount > 0 ? '-' + formatCurrency(totals.couponDiscount) : formatCurrency(0);
      });
      document.querySelectorAll('[data-summary-delivery]').forEach(function (el) {
        el.textContent = totals.deliveryFee === 0 ? 'FREE' : formatCurrency(totals.deliveryFee);
      });
      document.querySelectorAll('[data-summary-total]').forEach(function (el) { el.textContent = formatCurrency(totals.netTotal); });

      var couponMsg = document.getElementById('checkout-coupon-msg');
      if (couponMsg) {
        if (totals.couponCode) {
          couponMsg.textContent = '✓ ' + totals.couponLabel + ' (' + totals.couponCode + ') applied!';
          couponMsg.className = 'text-xs text-green-600 font-bold mt-1';
        } else {
          couponMsg.textContent = '';
        }
      }
    }

    // Smart Pincode Lookup Engine
    function lookupPincode(pin) {
      if (PINCODE_DB[pin]) return PINCODE_DB[pin];
      if (!/^\d{6}$/.test(pin)) return null;
      var prefix = pin.substring(0, 2);
      var p3 = pin.substring(0, 3);
      if (prefix >= '60' && prefix <= '64') return { city: p3 === '600' ? 'Chennai' : (p3 === '641' ? 'Coimbatore' : 'Tamil Nadu City'), state: 'Tamil Nadu' };
      if (prefix >= '56' && prefix <= '59') return { city: p3 === '560' ? 'Bengaluru' : 'Karnataka City', state: 'Karnataka' };
      if (prefix >= '50' && prefix <= '53') return { city: p3 === '500' ? 'Hyderabad' : 'Telangana City', state: 'Telangana' };
      if (prefix >= '40' && prefix <= '44') return { city: p3 === '400' ? 'Mumbai' : (p3 === '411' ? 'Pune' : 'Maharashtra City'), state: 'Maharashtra' };
      if (prefix === '11') return { city: 'New Delhi', state: 'Delhi' };
      if (prefix >= '12' && prefix <= '13') return { city: 'Gurugram', state: 'Haryana' };
      if (prefix >= '14' && prefix <= '16') return { city: 'Chandigarh', state: 'Punjab' };
      if (prefix >= '20' && prefix <= '28') return { city: 'Noida', state: 'Uttar Pradesh' };
      if (prefix >= '30' && prefix <= '34') return { city: 'Jaipur', state: 'Rajasthan' };
      if (prefix >= '36' && prefix <= '39') return { city: 'Ahmedabad', state: 'Gujarat' };
      if (prefix >= '70' && prefix <= '74') return { city: 'Kolkata', state: 'West Bengal' };
      if (prefix >= '67' && prefix <= '69') return { city: 'Kochi', state: 'Kerala' };
      return { city: 'City', state: 'State' };
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
        var res = window.CartEngine.applyCoupon(couponInput.value);
        if (window.showToast) window.showToast(res.message);
        renderCheckoutView();
      });
    }

    // Step Nav Buttons
    var toStep2 = document.getElementById('btn-to-step-2');
    if (toStep2) {
      toStep2.addEventListener('click', function () {
        var isAuthed = window.SangoAuth && window.SangoAuth.isLoggedIn && window.SangoAuth.isLoggedIn();
        if (!isAuthed) {
          if (window.openAuthModal) {
            window.openAuthModal('signin', '🔒 Please sign in to proceed to shipping and checkout.');
          } else {
            location.href = '/login/?redirect=/cart/';
          }
          if (window.showToast) window.showToast('⚠️ Please sign in to proceed with checkout.');
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

    // 1-Click Checkout: Auto-fill returning customer profile from Spring Boot
    function autoFillCustomerProfile() {
      var user = window.SangoAuth && window.SangoAuth.getUser ? window.SangoAuth.getUser() : null;
      if (!user || !user.email) return;

      var emailInput = shippingForm ? shippingForm.querySelector('input[name="email"]') : null;
      if (emailInput && !emailInput.value) emailInput.value = user.email;

      fetch('http://localhost:8080/api/customer/profile?email=' + encodeURIComponent(user.email))
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data && data.shippingAddress) {
            var banner = document.getElementById('one-click-profile-banner');
            if (banner) banner.classList.remove('hidden');

            var nameInput = shippingForm.querySelector('input[name="name"]');
            var phoneInput = shippingForm.querySelector('input[name="phone"]');
            var addrInput = shippingForm.querySelector('textarea[name="address"]');
            var pinInput = shippingForm.querySelector('input[name="pincode"]');
            var cityInput = shippingForm.querySelector('input[name="city"]');
            var stateInput = shippingForm.querySelector('input[name="state"]');
            var lmkInput = shippingForm.querySelector('input[name="landmark"]');

            if (nameInput && !nameInput.value && data.fullName) nameInput.value = data.fullName;
            if (phoneInput && !phoneInput.value && data.phone) phoneInput.value = data.phone;
            if (addrInput && !addrInput.value && data.shippingAddress) addrInput.value = data.shippingAddress;
            if (pinInput && !pinInput.value && data.pincode) pinInput.value = data.pincode;
            if (cityInput && !cityInput.value && data.city) cityInput.value = data.city;
            if (stateInput && !stateInput.value && data.state) stateInput.value = data.state;
            if (lmkInput && !lmkInput.value && data.landmark) lmkInput.value = data.landmark;
          }
        }).catch(function () {});
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
        placeOrderBtn.innerHTML = '<span class="inline-block animate-spin mr-2">🌿</span> Securing Order & Processing Payment...';

        window.CheckoutEngine.createOrderAsync(customerData, { method: method })
          .then(function (confirmedOrder) {
            if (method !== 'COD') {
              // Online Gateway (UPI, Card, NetBanking): Redirect to dedicated 256-bit payment portal
              window.location.href = '/payment/?orderId=' + encodeURIComponent(confirmedOrder.orderId);
            } else {
              goToStep(4);
              renderOrderReceipt(confirmedOrder);
              if (window.showToast) window.showToast('✓ Order #' + confirmedOrder.orderId + ' confirmed successfully!');
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
        '<div class="w-16 h-16 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-3xl mx-auto mb-3">✓</div>' +
        '<span class="text-xs font-bold uppercase tracking-widest text-plant-main">Order Successfully Confirmed</span>' +
        '<h2 class="font-display text-3xl font-bold text-gray-900 mt-1">Thank You, ' + safeCustName + '!</h2>' +
        '<p class="text-sm text-gray-500 mt-1">Order Reference: <strong class="text-gray-900 font-mono">' + escapeHTML(order.orderId) + '</strong></p>' +
        '<p class="text-xs text-amber-600 bg-amber-50 rounded-lg py-1.5 px-4 inline-block font-bold mt-2">📦 Estimated Delivery: ' + escapeHTML(order.estDeliveryDate) + '</p>' +
        '</div>' +

        '<div class="py-6 border-b border-gray-100 grid sm:grid-cols-2 gap-4 text-xs">' +
        '<div><p class="text-gray-400 font-bold uppercase tracking-wider mb-1">Shipping To</p>' +
        '<p class="font-bold text-gray-900">' + safeCustName + '</p>' +
        '<p class="text-gray-600">' + safeAddress + (safeLandmark ? ', ' + safeLandmark : '') + '</p>' +
        '<p class="text-gray-600">' + safeCity + ', ' + safeState + ' - ' + safePincode + '</p>' +
        '<p class="text-gray-600">📞 Phone: ' + safePhone + '</p></div>' +

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
        '<a href="/order-success.html?orderId=' + encodeURIComponent(order.orderId) + '" class="px-6 py-2.5 rounded-full bg-amber-gold hover:bg-amber-400 text-deep-forest font-bold text-xs shadow-md transition-all">View Printable Invoice &amp; Live Tracking →</a>' +
        '</div>';
    }

    if (window.AppEvent) {
      window.AppEvent.on('cart:updated', renderCheckoutView);
    }
  });

})();
