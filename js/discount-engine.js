/**
 * Sango Fiora — Centralized Volume Discount & GST Calculation Engine
 */
(function () {
  'use strict';

  window.DiscountEngine = {
    calculateVolumeDiscount: function (itemCount, subtotal) {
      if (itemCount >= 5) {
        return {
          percent: 10,
          amount: Math.round(subtotal * 0.10),
          label: '10% Bulk Styling Discount (5+ items)'
        };
      }
      if (itemCount >= 3) {
        return {
          percent: 5,
          amount: Math.round(subtotal * 0.05),
          label: '5% Volume Tier Discount (3+ items)'
        };
      }
      return { percent: 0, amount: 0, label: '' };
    },

    calculateGst: function (netTotal) {
      return Math.round((netTotal * 0.18) / 1.18);
    }
  };
})();
