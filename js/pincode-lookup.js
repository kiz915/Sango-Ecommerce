/**
 * Sango Fiora — Centralized Pincode Lookup & Autofill Engine
 */
(function () {
  'use strict';

  var PINCODE_DB = {
    '110001': { city: 'New Delhi', state: 'Delhi' },
    '400001': { city: 'Mumbai', state: 'Maharashtra' },
    '560001': { city: 'Bengaluru', state: 'Karnataka' },
    '600001': { city: 'Chennai', state: 'Tamil Nadu' },
    '700001': { city: 'Kolkata', state: 'West Bengal' },
    '500001': { city: 'Hyderabad', state: 'Telangana' },
    '380001': { city: 'Ahmedabad', state: 'Gujarat' },
    '411001': { city: 'Pune', state: 'Maharashtra' }
  };

  function lookupPincode(pin) {
    if (!pin) return null;
    pin = pin.toString().trim();
    if (PINCODE_DB[pin]) return PINCODE_DB[pin];

    // Heuristic prefix fallback for standard 6-digit Indian PIN codes
    if (/^[1-9][0-9]{5}$/.test(pin)) {
      var prefix = pin.charAt(0);
      var prefixMap = {
        '1': { city: 'Delhi / NCR', state: 'Delhi' },
        '2': { city: 'Lucknow', state: 'Uttar Pradesh' },
        '3': { city: 'Ahmedabad', state: 'Gujarat' },
        '4': { city: 'Mumbai', state: 'Maharashtra' },
        '5': { city: 'Hyderabad', state: 'Telangana' },
        '6': { city: 'Chennai', state: 'Tamil Nadu' },
        '7': { city: 'Kolkata', state: 'West Bengal' },
        '8': { city: 'Patna', state: 'Bihar' }
      };
      return prefixMap[prefix] || { city: 'Metro City', state: 'India' };
    }
    return null;
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
  }

  window.PincodeLookup = {
    lookupPincode: lookupPincode,
    autoFillCityState: autoFillCityState
  };
})();
