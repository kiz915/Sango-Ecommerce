(function () {
  'use strict';

  var apiBase = (window.SANGO_API_BASE || '/api').replace(/\/+$/, '');
  var history = [];
  var isSending = false;
  var suggestionsLoaded = false;

  function el(id) { return document.getElementById(id); }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatReplyHtml(text) {
    var safe = escapeHtml(text);
    // Bold **text**
    safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-[#1B4332]">$1</strong>');
    // Internal storefront links (strip trailing sentence punctuation and normalize /collections/<cat>/)
    safe = safe.replace(/(\/(?:products|product|product-live|track|checkout|collections|wishlist|contact|cart)\/[^\s<)]*)([.,!?;:]*)/g,
      function (_, rawPath, punct) {
        var cleanPath = rawPath.replace(/[.,!?;:]+$/, '');
        var trailing = rawPath.slice(cleanPath.length) + (punct || '');
        if (/^\/collections\/[^/?#]+$/i.test(cleanPath)) {
          cleanPath = cleanPath.toLowerCase() + '/';
        } else if (/^\/collections\/[^/?#]+\/$/i.test(cleanPath)) {
          cleanPath = cleanPath.toLowerCase();
        }
        return '<a href="' + cleanPath + '" class="underline font-medium text-[#1B4332] hover:text-emerald-700">' + cleanPath + '</a>' + trailing;
      });
    safe = safe.replace(/\n/g, '<br>');
    return safe;
  }

  function getAuthHeaders() {
    var headers = { 'Content-Type': 'application/json' };
    try {
      var token = window.SangoAuth && window.SangoAuth.getToken ? window.SangoAuth.getToken() : null;
      if (token) headers['Authorization'] = 'Bearer ' + token;
    } catch (_) {}
    return headers;
  }

  function appendMessage(role, content) {
    var box = el('sango-chat-messages');
    if (!box) return;

    var wrapper = document.createElement('div');
    wrapper.className = role === 'user' ? 'flex justify-end' : 'flex justify-start';

    var bubble = document.createElement('div');
    if (role === 'user') {
      bubble.className = 'max-w-[85%] rounded-2xl rounded-br-sm px-3.5 py-2.5 bg-[#1B4332] text-white shadow-sm';
      bubble.textContent = content;
    } else {
      bubble.className = 'max-w-[88%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 bg-white text-gray-800 border border-[#1B4332]/10 shadow-sm';
      bubble.innerHTML = formatReplyHtml(content);
    }

    wrapper.appendChild(bubble);
    box.appendChild(wrapper);
    box.scrollTop = box.scrollHeight;
  }

  function showTyping() {
    var box = el('sango-chat-messages');
    if (!box || el('sango-chat-typing')) return;
    var row = document.createElement('div');
    row.id = 'sango-chat-typing';
    row.className = 'flex justify-start';
    row.innerHTML = '<div class="rounded-2xl rounded-bl-sm px-3.5 py-2.5 bg-white border border-[#1B4332]/10 text-gray-500 text-xs flex items-center gap-1.5 shadow-sm">' +
      '<span class="w-1.5 h-1.5 rounded-full bg-[#1B4332]/60 animate-bounce"></span>' +
      '<span class="w-1.5 h-1.5 rounded-full bg-[#1B4332]/60 animate-bounce" style="animation-delay:0.15s"></span>' +
      '<span class="w-1.5 h-1.5 rounded-full bg-[#1B4332]/60 animate-bounce" style="animation-delay:0.3s"></span>' +
      '</div>';
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
  }

  function hideTyping() {
    var t = el('sango-chat-typing');
    if (t) t.remove();
  }

  function renderSuggestions(items) {
    var container = el('sango-chat-suggestions');
    if (!container) return;
    container.innerHTML = '';
    if (!Array.isArray(items) || !items.length) return;

    items.slice(0, 3).forEach(function (text) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'text-[11px] px-2.5 py-1 rounded-full border border-[#1B4332]/20 bg-white text-[#1B4332] hover:bg-[#1B4332] hover:text-white transition-colors cursor-pointer text-left';
      btn.textContent = text;
      btn.addEventListener('click', function () {
        sendMessage(text);
      });
      container.appendChild(btn);
    });
  }

  function loadDynamicSuggestions() {
    fetch(apiBase + '/chat/suggestions', { headers: getAuthHeaders() })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && Array.isArray(data.suggestions)) {
          suggestionsLoaded = true;
          renderSuggestions(data.suggestions);
        }
      })
      .catch(function () {});
  }

  function ensureGreeting() {
    var box = el('sango-chat-messages');
    if (!box || box.children.length > 0) return;
    appendMessage('assistant', 'Hello! I\'m Flora, your Sango Fiora assistant. Ask me about our plants, live prices, promo codes, delivery, or your orders.');
  }

  function sendMessage(rawText) {
    var text = String(rawText || '').trim();
    if (!text || isSending) return;

    var input = el('sango-chat-input');
    var sendBtn = el('sango-chat-send');
    if (input) input.value = '';

    isSending = true;
    if (sendBtn) sendBtn.disabled = true;

    appendMessage('user', text);
    showTyping();

    fetch(apiBase + '/chat', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        message: text,
        history: history.slice(-6)
      })
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Chat request failed (' + res.status + ')');
        return res.json();
      })
      .then(function (data) {
        hideTyping();
        var reply = (data && data.reply) ? data.reply : 'Sorry, I could not process that right now. Please try again.';
        appendMessage('assistant', reply);
        history.push({ role: 'user', content: text });
        history.push({ role: 'assistant', content: reply });
        if (data && Array.isArray(data.suggestions)) {
          renderSuggestions(data.suggestions);
        }
      })
      .catch(function () {
        hideTyping();
        appendMessage('assistant', 'I\'m having trouble reaching the server right now. Please browse /products/ or check /track/ for orders.');
      })
      .finally(function () {
        isSending = false;
        if (sendBtn) sendBtn.disabled = false;
        if (input) input.focus();
      });
  }

  function resetChat() {
    history = [];
    var box = el('sango-chat-messages');
    if (box) box.innerHTML = '';
    ensureGreeting();
    loadDynamicSuggestions();
  }

  function openPanel() {
    var panel = el('sango-chat-panel');
    if (!panel) return;
    panel.classList.remove('hidden');
    ensureGreeting();
    if (!suggestionsLoaded) loadDynamicSuggestions();
    var input = el('sango-chat-input');
    if (input) setTimeout(function () { input.focus(); }, 60);
  }

  function closePanel() {
    var panel = el('sango-chat-panel');
    if (panel) panel.classList.add('hidden');
  }

  document.addEventListener('DOMContentLoaded', function () {
    var toggle = el('sango-chat-toggle');
    var closeBtn = el('sango-chat-close');
    var resetBtn = el('sango-chat-reset');
    var form = el('sango-chat-form');
    var input = el('sango-chat-input');

    if (toggle) {
      toggle.addEventListener('click', function () {
        var panel = el('sango-chat-panel');
        if (panel && panel.classList.contains('hidden')) openPanel();
        else closePanel();
      });
    }
    if (closeBtn) closeBtn.addEventListener('click', closePanel);
    if (resetBtn) resetBtn.addEventListener('click', resetChat);
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (input) sendMessage(input.value);
      });
    }

    if (window.AppEvent) {
      window.AppEvent.on('auth:changed', function () {
        suggestionsLoaded = false;
        resetChat();
      });
    }

    // Hide floating chatbot button while Cart Drawer is open so it never overlaps checkout CTA
    var cartDrawer = el('cart-drawer');
    var chatRoot = el('sango-chatbot-root');
    if (cartDrawer && chatRoot && window.MutationObserver) {
      var syncDrawerOverlap = function () {
        var isDrawerOpen = !cartDrawer.classList.contains('translate-x-full');
        chatRoot.classList.toggle('hidden', isDrawerOpen);
      };
      syncDrawerOverlap();
      new MutationObserver(syncDrawerOverlap).observe(cartDrawer, { attributes: true, attributeFilter: ['class'] });
    }
  });
})();
