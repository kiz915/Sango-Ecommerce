/**
 * Sango Fiora — Pincode to City/State Lookup
 * Shared module for checkout and tracking pages
 */
(function () {
  'use strict';

  // Indian pincode prefix to city/state mapping
  var PINCODE_DB = {
    '636001': { city: 'Salem', state: 'Tamil Nadu' },
    '600001': { city: 'Chennai', state: 'Tamil Nadu' },
    '560001': { city: 'Bengaluru', state: 'Karnataka' },
    '500001': { city: 'Hyderabad', state: 'Telangana' },
    '400001': { city: 'Mumbai', state: 'Maharashtra' },
    '110001': { city: 'New Delhi', state: 'Delhi' },
    '641001': { city: 'Coimbatore', state: 'Tamil Nadu' },
    '625001': { city: 'Madurai', state: 'Tamil Nadu' },
    '682001': { city: 'Kochi', state: 'Kerala' },
    '380001': { city: 'Ahmedabad', state: 'Gujarat' },
    '700001': { city: 'Kolkata', state: 'West Bengal' },
    '411001': { city: 'Pune', state: 'Maharashtra' },
    '160001': { city: 'Chandigarh', state: 'Chandigarh' },
    '201301': { city: 'Noida', state: 'Uttar Pradesh' },
    '122001': { city: 'Gurugram', state: 'Haryana' },
    '302001': { city: 'Jaipur', state: 'Rajasthan' },
    '226001': { city: 'Lucknow', state: 'Uttar Pradesh' },
    '462001': { city: 'Bhopal', state: 'Madhya Pradesh' },
    '800001': { city: 'Patna', state: 'Bihar' },
    '751001': { city: 'Bhubaneswar', state: 'Odisha' },
    '440001': { city: 'Nagpur', state: 'Maharashtra' },
    '390001': { city: 'Vadodara', state: 'Gujarat' },
    '492001': { city: 'Raipur', state: 'Chhattisgarh' },
    '834001': { city: 'Ranchi', state: 'Jharkhand' },
    '530001': { city: 'Visakhapatnam', state: 'Andhra Pradesh' },
    '695001': { city: 'Thiruvananthapuram', state: 'Kerala' },
    '605001': { city: 'Puducherry', state: 'Puducherry' },
    '734001': { city: 'Siliguri', state: 'West Bengal' }
  };

  function lookupPincode(pin) {
    if (!pin || typeof pin !== 'string') return null;

    var cleaned = pin.trim();
    if (!/^\d{6}$/.test(cleaned)) return null;

    // Exact match first
    if (PINCODE_DB[cleaned]) return PINCODE_DB[cleaned];

    // Prefix-based fallback (first 3 digits)
    var prefix3 = cleaned.substring(0, 3);
    var prefix2 = cleaned.substring(0, 2);

    // Tamil Nadu (60-64)
    if (prefix2 >= '60' && prefix2 <= '64') {
      if (prefix3 === '600') return { city: 'Chennai', state: 'Tamil Nadu' };
      if (prefix3 === '641') return { city: 'Coimbatore', state: 'Tamil Nadu' };
      if (prefix3 === '625') return { city: 'Madurai', state: 'Tamil Nadu' };
      if (prefix3 === '636') return { city: 'Salem', state: 'Tamil Nadu' };
      return { city: 'Tamil Nadu', state: 'Tamil Nadu' };
    }

    // Karnataka (56-59)
    if (prefix2 >= '56' && prefix2 <= '59') {
      if (prefix3 === '560') return { city: 'Bengaluru', state: 'Karnataka' };
      return { city: 'Karnataka', state: 'Karnataka' };
    }

    // Telangana (50-53)
    if (prefix2 >= '50' && prefix2 <= '53') {
      if (prefix3 === '500') return { city: 'Hyderabad', state: 'Telangana' };
      return { city: 'Telangana', state: 'Telangana' };
    }

    // Maharashtra (40-44)
    if (prefix2 >= '40' && prefix2 <= '44') {
      if (prefix3 === '400') return { city: 'Mumbai', state: 'Maharashtra' };
      if (prefix3 === '411') return { city: 'Pune', state: 'Maharashtra' };
      if (prefix3 === '440') return { city: 'Nagpur', state: 'Maharashtra' };
      return { city: 'Maharashtra', state: 'Maharashtra' };
    }

    // Delhi (11)
    if (prefix2 === '11') return { city: 'New Delhi', state: 'Delhi' };

    // Haryana (12-13)
    if (prefix2 >= '12' && prefix2 <= '13') return { city: 'Gurugram', state: 'Haryana' };

    // Punjab/Chandigarh (14-16)
    if (prefix2 >= '14' && prefix2 <= '16') return { city: 'Chandigarh', state: 'Punjab' };

    // Uttar Pradesh (20-28)
    if (prefix2 >= '20' && prefix2 <= '28') return { city: 'Noida', state: 'Uttar Pradesh' };

    // Rajasthan (30-34)
    if (prefix2 >= '30' && prefix2 <= '34') return { city: 'Jaipur', state: 'Rajasthan' };

    // Gujarat (36-39)
    if (prefix2 >= '36' && prefix2 <= '39') return { city: 'Ahmedabad', state: 'Gujarat' };

    // West Bengal (70-74)
    if (prefix2 >= '70' && prefix2 <= '74') return { city: 'Kolkata', state: 'West Bengal' };

    // Kerala (67-69)
    if (prefix2 >= '67' && prefix2 <= '69') return { city: 'Kochi', state: 'Kerala' };

    // Andhra Pradesh (51-53)
    if (prefix2 >= '51' && prefix2 <= '53') return { city: 'Visakhapatnam', state: 'Andhra Pradesh' };

    // Madhya Pradesh (45-48)
    if (prefix2 >= '45' && prefix2 <= '48') return { city: 'Bhopal', state: 'Madhya Pradesh' };

    // Bihar (80-85)
    if (prefix2 >= '80' && prefix2 <= '85') return { city: 'Patna', state: 'Bihar' };

    // Odisha (75-77)
    if (prefix2 >= '75' && prefix2 <= '77') return { city: 'Bhubaneswar', state: 'Odisha' };

    // Jharkhand (81-83)
    if (prefix2 >= '81' && prefix2 <= '83') return { city: 'Ranchi', state: 'Jharkhand' };

    // Chhattisgarh (49)
    if (prefix2 === '49') return { city: 'Raipur', state: 'Chhattisgarh' };

    // Goa (40)
    if (prefix2 === '40' && prefix3 !== '400') return { city: 'Goa', state: 'Goa' };

    // Default fallback
    return { city: 'City', state: 'State' };
  }

  function autoFillCityState(pincodeInputId, cityInputId, stateInputId) {
    var pinInput = document.getElementById(pincodeInputId);
    var cityInput = document.getElementById(cityInputId);
    var stateInput = document.getElementById(stateInputId);

    if (!pinInput) return;

    pinInput.addEventListener('input', function () {
      var match = lookupPincode(pinInput.value.trim());
      if (match) {
        if (cityInput) cityInput.value = match.city;
        if (stateInput) stateInput.value = match.state;
      }
    });

    // Also trigger on blur in case user pastes
    pinInput.addEventListener('blur', function () {
      var match = lookupPincode(pinInput.value.trim());
      if (match) {
        if (cityInput && !cityInput.value) cityInput.value = match.city;
        if (stateInput && !stateInput.value) stateInput.value = match.state;
      }
    });
  }

  window.PincodeLookup = {
    lookupPincode: lookupPincode,
    autoFillCityState: autoFillCityState,
    PINCODE_DB: PINCODE_DB
  };
})();