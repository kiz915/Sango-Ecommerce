/**
 * Sango Fiora — Centralized Discount Calculation Engine
 * Single source of truth for volume discounts, GST, and pricing logic
 */
(function () {
  'use strict';

  // Configuration constants
  var CONFIG = {
    FREE_SHIPPING_THRESHOLD: 999,
    STANDARD_DELIVERY_FEE: 99,
    GST_RATE: 0.18,
    VOLUME_TIERS: [
      { minQty: 5, percent: 10, label: '10% Bulk Styling Discount (5+ items)' },
      { minQty: 3, percent: 5, label: '5% Volume Tier Discount (3+ items)' }
    ]
  };

  function calculateVolumeDiscount(itemCount, subtotal) {
    for (var i = 0; i < CONFIG.VOLUME_TIERS.length; i++) {
      var tier = CONFIG.VOLUME_TIERS[i];
      if (itemCount >= tier.minQty) {
        var amount = Math.round(subtotal * tier.percent / 100);
        return {
          percent: tier.percent,
          amount: amount,
          label: tier.label
        };
      }
    }
    return { percent: 0, amount: 0, label: '' };
  }

  function calculateGst(netTotal) {
    // GST is 18% included in the price (reverse calculation)
    return Math.round((netTotal * CONFIG.GST_RATE) / (1 + CONFIG.GST_RATE));
  }

  function calculateDeliveryFee(subtotal) {
    return subtotal >= CONFIG.FREE_SHIPPING_THRESHOLD ? 0 : CONFIG.STANDARD_DELIVERY_FEE;
  }

  function calculateTotals(items, couponDiscount) {
    couponDiscount = couponDiscount || 0;

    var subtotal = items.reduce(function (sum, item) {
      return sum + (item.price * item.qty);
    }, 0);

    var mrpTotal = items.reduce(function (sum, item) {
      return sum + ((item.mrp || item.price) * item.qty);
    }, 0);

    var itemCount = items.reduce(function (sum, item) {
      return sum + item.qty;
    }, 0);

    var volumeDiscount = calculateVolumeDiscount(itemCount, subtotal);
    var deliveryFee = calculateDeliveryFee(subtotal);

    var taxableSubtotal = Math.max(0, subtotal - couponDiscount - volumeDiscount.amount);
    var netTotal = taxableSubtotal + deliveryFee;
    var gstAmount = calculateGst(netTotal);

    return {
      subtotal: subtotal,
      mrpTotal: mrpTotal,
      mrpSavings: Math.max(0, mrpTotal - subtotal),
      itemCount: itemCount,
      volumeDiscount: volumeDiscount,
      couponDiscount: couponDiscount,
      deliveryFee: deliveryFee,
      gstAmount: gstAmount,
      netTotal: netTotal
    };
  }

  function getFreeShippingProgress(subtotal) {
    if (subtotal >= CONFIG.FREE_SHIPPING_THRESHOLD) {
      return { needed: 0, percentage: 100, message: 'You unlocked FREE Delivery across India!' };
    }
    var needed = CONFIG.FREE_SHIPPING_THRESHOLD - subtotal;
    var percentage = Math.min(100, Math.round((subtotal / CONFIG.FREE_SHIPPING_THRESHOLD) * 100));
    return {
      needed: needed,
      percentage: percentage,
      message: 'Add ₹' + needed.toLocaleString('en-IN') + ' more for FREE Delivery'
    };
  }

  function formatCurrency(n) {
    return '₹' + Number(n || 0).toLocaleString('en-IN');
  }

  window.DiscountEngine = {
    CONFIG: CONFIG,
    calculateVolumeDiscount: calculateVolumeDiscount,
    calculateGst: calculateGst,
    calculateDeliveryFee: calculateDeliveryFee,
    calculateTotals: calculateTotals,
    getFreeShippingProgress: getFreeShippingProgress,
    formatCurrency: formatCurrency
  };
})();