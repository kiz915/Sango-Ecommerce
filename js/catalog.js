/**
 * Sango Plants — Catalogue Engine, Deep URL Sync & Search System
 */
(function () {
  'use strict';

  function syncUrlParams(paramsObj) {
    if (!window.history || !window.history.pushState) return;
    var url = new URL(window.location.href);
    Object.keys(paramsObj).forEach(function (key) {
      if (paramsObj[key] && paramsObj[key] !== 'all' && paramsObj[key] !== 'featured') {
        url.searchParams.set(key, paramsObj[key]);
      } else {
        url.searchParams.delete(key);
      }
    });
    window.history.replaceState({}, '', url.toString());
  }

  function readUrlParams() {
    var params = new URLSearchParams(window.location.search);
    return {
      category: params.get('category') || 'all',
      sort: params.get('sort') || 'featured',
      q: params.get('q') || ''
    };
  }

  document.addEventListener('DOMContentLoaded', function () {
    var grid = document.getElementById('all-products-grid');
    var sortSelect = document.getElementById('catalog-sort');
    var searchInput = document.getElementById('catalog-search');
    var chips = document.querySelectorAll('.catalog-chip');
    var countEl = document.getElementById('product-count');
    var noResults = document.getElementById('no-results');
    var resetBtn = document.getElementById('reset-filters');

    if (!grid) return;

    var initialParams = readUrlParams();
    var currentCategory = initialParams.category;

    if (sortSelect && initialParams.sort) sortSelect.value = initialParams.sort;
    if (searchInput && initialParams.q) searchInput.value = initialParams.q;

    var PAGE_SIZE = 16;
    var visibleLimit = PAGE_SIZE;

    var loadMoreWrap = document.getElementById('load-more-wrap');
    var loadMoreBtn = document.getElementById('load-more-btn');
    var loadMoreCount = document.getElementById('load-more-count');

    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', function () {
        visibleLimit += PAGE_SIZE;
        applyCatalogFilters(true);
      });
    }

    function updateChipStyles() {
      chips.forEach(function (c) {
        var isMatch = (c.dataset.filter.toLowerCase() === currentCategory.toLowerCase());
        if (isMatch) {
          c.className = 'catalog-chip shrink-0 px-4 py-2 rounded-full text-xs font-bold bg-amber-gold text-deep-forest transition-all shadow-sm';
        } else {
          c.className = 'catalog-chip shrink-0 px-4 py-2 rounded-full text-xs font-semibold bg-gray-100 border border-gray-200 hover:border-deep-forest text-gray-700 transition-all';
        }
      });
    }

    // Highlight initial chip matching URL
    updateChipStyles();

    function applyCatalogFilters(isLoadMore) {
      if (!isLoadMore) {
        visibleLimit = PAGE_SIZE;
      }

      var cards = Array.prototype.slice.call(grid.children);
      var query = (searchInput ? searchInput.value.trim().toLowerCase() : '');
      var sortVal = sortSelect ? sortSelect.value : 'featured';

      var totalMatching = 0;
      var shownCount = 0;

      cards.forEach(function (card) {
        var cat = card.dataset.category || '';
        var name = (card.dataset.name || '').toLowerCase();

        var matchCat = (currentCategory === 'all' || cat.toLowerCase() === currentCategory.toLowerCase());
        var matchSearch = (!query || name.indexOf(query) !== -1 || cat.toLowerCase().indexOf(query) !== -1);

        if (matchCat && matchSearch) {
          totalMatching++;
          if (shownCount < visibleLimit) {
            if (card.style.display !== '') card.style.display = '';
            card.classList.remove('hidden');
            shownCount++;
          } else {
            if (card.style.display !== 'none') card.style.display = 'none';
            card.classList.add('hidden');
          }
        } else {
          if (card.style.display !== 'none') card.style.display = 'none';
          card.classList.add('hidden');
        }
      });

      if (countEl) countEl.textContent = totalMatching;
      if (noResults) noResults.classList.toggle('hidden', totalMatching > 0);

      var remaining = totalMatching - shownCount;
      if (loadMoreWrap && loadMoreCount) {
        if (remaining > 0) {
          loadMoreCount.textContent = remaining;
          loadMoreWrap.classList.remove('hidden');
        } else {
          loadMoreWrap.classList.add('hidden');
        }
      }

      // Sort visible cards ONLY if a non-featured sort order is requested
      if (sortVal !== 'featured') {
        cards.sort(function (a, b) {
          if (sortVal === 'price-asc') return (+a.dataset.price) - (+b.dataset.price);
          if (sortVal === 'price-desc') return (+b.dataset.price) - (+a.dataset.price);
          if (sortVal === 'rating') return (+b.dataset.rating) - (+a.dataset.rating);
          if (sortVal === 'discount') return (+b.dataset.discount) - (+a.dataset.discount);
          if (sortVal === 'name') return (a.dataset.name || '').localeCompare(b.dataset.name || '');
          return 0;
        });

        // Use DocumentFragment for single-pass batch DOM update
        var fragment = document.createDocumentFragment();
        cards.forEach(function (c) { fragment.appendChild(c); });
        grid.appendChild(fragment);
      }

      syncUrlParams({
        category: currentCategory,
        sort: sortVal,
        q: query
      });
    }

    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        currentCategory = chip.dataset.filter;
        updateChipStyles();
        applyCatalogFilters();
      });
    });

    if (sortSelect) sortSelect.addEventListener('change', applyCatalogFilters);
    if (searchInput) searchInput.addEventListener('input', applyCatalogFilters);

    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        currentCategory = 'all';
        if (searchInput) searchInput.value = '';
        if (sortSelect) sortSelect.value = 'featured';
        updateChipStyles();
        applyCatalogFilters();
      });
    }

    // Live sync: js/live-sync.js reconciles cards with Supabase, then notifies us to refresh filters & counts
    document.addEventListener('sango:catalog-updated', function (e) {
      var products = (e.detail && e.detail.products) || [];
      var counts = {};
      products.forEach(function (p) { if (p.isActive !== false) counts[p.category] = (counts[p.category] || 0) + 1; });
      var active = products.filter(function (p) { return p.isActive !== false; }).length;
      chips.forEach(function (chip) {
        var filter = chip.dataset.filter;
        if (filter === 'all') chip.textContent = 'All Products (' + active + ')';
        else if (counts[filter] !== undefined) chip.textContent = filter + ' (' + counts[filter] + ')';
      });
      updateChipStyles();
      applyCatalogFilters(true);
    });

    applyCatalogFilters();
  });

})();
