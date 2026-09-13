/* Progressive enhancement for the public Around Town archive only.
   Native articles, category links and pagination remain the no-JS fallback. */
(function () {
  'use strict';
  var BATCH = 8;
  var CATEGORIES = ['Local News', 'Community Life', 'Business Spotlights', 'Food', 'Local Guides', 'Mountain Living', 'Town & History'];
  function escapeHTML(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; });
  }
  function plain(s) { return String(s || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); }
  function archivePath(path) { return /^\/around-town\/?$/.test(path) || /^\/around-town\/category\/[^/]+\/?$/.test(path); }
  function categoryURL(category) { return category ? '/around-town/category/' + encodeURIComponent(category).replace(/%20/g, '+') : '/around-town'; }
  function publicItem(item, now) {
    return item && /^\/around-town\/[^/?#]+$/.test(item.fullUrl || '') && item.title &&
      Number(item.publishOn) > 0 && Number(item.publishOn) <= now &&
      (item.workflowState == null || item.workflowState === 1);
  }
  function matching(items, query, category) {
    var terms = plain(query).toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter(function (item) {
      if (category && (item.categories || []).indexOf(category) < 0) return false;
      var hay = plain(item.title + ' ' + (item.excerpt || '') + ' ' + (item.categories || []).join(' ')).toLowerCase();
      return terms.every(function (term) { return hay.indexOf(term) >= 0; });
    });
  }
  /* Resolve only this public collection. Never follow arbitrary feed URLs. */
  function nextURL(data) {
    var p = data && data.pagination;
    if (!p || !p.nextPage) return '';
    if (!/^\d+$/.test(String(p.nextPageOffset || ''))) throw new Error('Invalid archive pagination');
    return '/around-town?format=json&offset=' + encodeURIComponent(p.nextPageOffset);
  }
  async function loadArchive(fetcher) {
    var url = '/around-town?format=json', seenPages = {}, seenItems = {}, items = [], page = 0;
    while (url) {
      if (seenPages[url] || ++page > 100) throw new Error('Archive pagination did not finish');
      seenPages[url] = true;
      var response = await fetcher(url, {credentials:'omit'});
      if (!response.ok) throw new Error('Archive request failed');
      var data = await response.json();
      if (!Array.isArray(data.items)) throw new Error('Archive items unavailable');
      data.items.forEach(function (item) {
        if (!publicItem(item, Date.now()) || seenItems[item.fullUrl]) return;
        seenItems[item.fullUrl] = true;
        items.push(item);
      });
      url = nextURL(data);
    }
    return items.sort(function (a,b) { return b.publishOn - a.publishOn; });
  }
  function card(item) {
    var href = escapeHTML(item.fullUrl);
    var image = /^https:\/\/images\.squarespace-cdn\.com\//.test(item.assetUrl || '') ?
      '<img src="' + escapeHTML(item.assetUrl) + '?format=750w" alt="" width="1200" height="630" loading="lazy">' : '';
    return '<article class="bcl-archive-card"><a href="' + href + '">' + image + '<h2>' + escapeHTML(item.title) + '</h2></a>' +
      '<p>' + escapeHTML(plain(item.excerpt)) + '</p></article>';
  }
  function init() {
    if (!archivePath(location.pathname) || document.getElementById('bcl-archive-controls')) return;
    var grid = document.querySelector('.blog-masonry-wrapper');
    if (!grid) return;
    if (!grid.id) grid.id = 'bcl-archive-native-grid';
    var cards = [].slice.call(grid.children).filter(function (el) { return el.tagName === 'ARTICLE'; });
    if (!cards.length) return;
    var activeCategory = '';
    if (location.pathname.indexOf('/category/') >= 0) {
      try { activeCategory = decodeURIComponent(location.pathname.split('/category/')[1].replace(/\/$/, '').replace(/\+/g, ' ')); } catch (_) {}
    }
    var css = document.createElement('style');
    css.textContent = '.bcl-archive-enhanced .blog-masonry-wrapper{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:32px 28px;height:auto!important}.bcl-archive-enhanced .blog-masonry-wrapper>article{position:static!important;transform:none!important;width:auto!important;min-width:0}.bcl-archive-enhanced .blog-masonry-wrapper .image-wrapper{height:auto!important;aspect-ratio:1200/630}.bcl-archive-enhanced .blog-masonry-wrapper img{height:100%!important}.bcl-archive-enhanced [hidden]{display:none!important}#bcl-archive-controls{font-family:Inter,Arial,sans-serif;margin:0 0 24px;color:#1c2a26}.bcl-archive-fields{display:flex;gap:12px;align-items:end;flex-wrap:wrap}.bcl-archive-fields label{display:flex;flex-direction:column;gap:6px;flex:1 1 220px;font-size:.9rem}.bcl-archive-fields input,.bcl-archive-fields select{box-sizing:border-box;width:100%;min-width:0;min-height:44px;border:1px solid #cfc9b8;border-radius:4px;background:#fffdf8;color:#1c2a26;padding:10px 12px;font:inherit}.bcl-archive-button{min-height:44px;border:1px solid #173f36;border-radius:0;background:#173f36;color:#fffdf8;padding:10px 18px;font:600 .9rem Inter,Arial,sans-serif;cursor:pointer}.bcl-archive-button:hover{background:#0d2c26}.bcl-archive-button:focus-visible,.bcl-archive-fields :focus-visible{outline:2px solid #173f36;outline-offset:3px}.bcl-archive-status{font-size:.9rem;margin:12px 0 0}.bcl-archive-more{margin:24px 0}.bcl-archive-results{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:32px 28px}.bcl-archive-card{min-width:0}.bcl-archive-card img{width:100%;height:auto;aspect-ratio:1200/630;object-fit:cover;border-radius:8px}.bcl-archive-card h2{font-family:"Cormorant Garamond",Georgia,serif;font-size:1.8rem;line-height:1.15;margin:16px 0 12px;color:#173f36}.bcl-archive-card a{color:#173f36}.bcl-archive-card p{font:1rem/1.6 Inter,Arial,sans-serif;color:#1c2a26}.bcl-archive-enhanced .bcl-catnav{max-height:none}@media(max-width:640px){.bcl-archive-enhanced .bcl-catnav{display:none!important}.bcl-archive-enhanced .blog-masonry-wrapper,.bcl-archive-results{grid-template-columns:minmax(0,1fr)}.bcl-archive-fields{align-items:stretch}.bcl-archive-fields label{flex-basis:100%}}';
    var controls = document.createElement('section');
    controls.id = 'bcl-archive-controls';
    controls.setAttribute('aria-label', 'Find an Around Town story');
    controls.innerHTML = '<form class="bcl-archive-fields"><label>Search published stories<input type="search" placeholder="Try a place, person or topic" aria-describedby="bcl-archive-status"></label>' +
      '<label>Category<select><option value="">All stories</option>' + CATEGORIES.map(function(c) { return '<option>' + escapeHTML(c) + '</option>'; }).join('') + '</select></label>' +
      '<button class="bcl-archive-button" type="submit">Search</button><button class="bcl-archive-button" type="button" data-clear>Reset</button></form>' +
      '<p class="bcl-archive-status" id="bcl-archive-status" role="status" aria-live="polite" aria-atomic="true"></p>';
    var results = document.createElement('div');
    results.className = 'bcl-archive-results'; results.id = 'bcl-archive-results'; results.hidden = true;
    var more = document.createElement('div'); more.className = 'bcl-archive-more';
    more.innerHTML = '<button type="button" class="bcl-archive-button">Load more stories</button>';
    grid.parentNode.insertBefore(controls, grid); grid.parentNode.insertBefore(results, grid);
    grid.parentNode.insertBefore(more, grid.nextSibling); document.head.appendChild(css);
    grid.parentNode.classList.add('bcl-archive-enhanced');
    var input = controls.querySelector('input'), select = controls.querySelector('select'), status = controls.querySelector('[role="status"]'), moreBtn = more.querySelector('button');
    if (activeCategory && CATEGORIES.indexOf(activeCategory) < 0) {
      var option = document.createElement('option'); option.value = activeCategory; option.textContent = activeCategory; select.appendChild(option);
    }
    select.value = activeCategory;
    var limit = BATCH, archive = null, loading = null, searching = false, generation = 0;
    function browse() {
      searching = false; results.hidden = true; grid.hidden = false;
      cards.forEach(function(el,i) { el.hidden = i >= limit; });
      status.textContent = 'Showing ' + Math.min(limit,cards.length) + ' of ' + cards.length + ' stories on this page. Search looks through published titles, summaries and categories.';
      more.hidden = limit >= cards.length;
      moreBtn.textContent = 'Load ' + Math.min(BATCH, cards.length - limit) + ' more stories';
      moreBtn.setAttribute('aria-controls', grid.id || 'BlogMasonryContainer');
    }
    function renderResults() {
      var matches = matching(archive, input.value, select.value);
      grid.hidden = true; results.hidden = false;
      results.innerHTML = matches.slice(0,limit).map(card).join('');
      status.textContent = matches.length ? 'Showing ' + Math.min(limit,matches.length) + ' of ' + matches.length + ' matching stories across ' + archive.length + ' published stories.' : 'No stories match. Try another word, choose All stories, or reset to browse.';
      more.hidden = limit >= matches.length;
      moreBtn.textContent = 'Load ' + Math.min(BATCH,matches.length-limit) + ' more stories';
      moreBtn.setAttribute('aria-controls', results.id);
    }
    function search() {
      var ticket = ++generation; searching = true; limit = BATCH;
      status.textContent = 'Loading the published archive. The current page remains available below.';
      more.hidden = true;
      if (!loading) loading = archive ? Promise.resolve(archive) : loadArchive(function(url, options) { return window.fetch(new URL(url, location.origin).href, options); });
      loading.then(function(items) { archive = items; if (ticket === generation && searching) renderResults(); }).catch(function() {
        loading = null;
        if (ticket !== generation) return;
        browse();
        status.textContent = 'Archive search is unavailable. Browse the stories and Older Posts links below, or press Search to try again.';
      });
    }
    controls.querySelector('form').addEventListener('submit', function(e) { e.preventDefault(); search(); });
    select.addEventListener('change', function() {
      if (input.value.trim() || searching) search();
      else location.href = categoryURL(select.value);
    });
    controls.querySelector('[data-clear]').addEventListener('click', function() {
      ++generation; input.value = ''; select.value = activeCategory; limit = BATCH; browse(); input.focus();
    });
    moreBtn.addEventListener('click', function() {
      var before = limit;
      limit += BATCH;
      if (searching && archive) renderResults(); else browse();
      var next = searching ? results.children[before] : cards[before];
      var target = next && next.querySelector('a');
      if (target) target.focus();
      else if (more.hidden) { status.tabIndex = -1; status.focus(); }
    });
    browse();
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {archivePath:archivePath, categoryURL:categoryURL, matching:matching, nextURL:nextURL, loadArchive:loadArchive, publicItem:publicItem, card:card, init:init};
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  }
})();
