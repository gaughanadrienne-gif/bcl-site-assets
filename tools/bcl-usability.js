/* Small page enhancements. Original links, content and filters remain authoritative. */
(function () {
  'use strict';
  var script = document.currentScript;
  var base = script && script.src ? new URL('../', script.src).href : '';
  function init() {
    if (document.getElementById('bcl-usability-v1')) return;
    var style = document.createElement('style');
    style.id = 'bcl-usability-v1';
    style.textContent = '#bcl-downloads .bcl-download-preview{display:block;width:100%;height:210px;object-fit:contain;background:#eee9dd;margin:0 0 20px;padding:12px;box-sizing:border-box}#bcl-downloads .bcl-download-meta{font-size:14px;color:#505d55;margin:12px 0}#bcl-give-back .bcl-batch-hidden{display:none!important}#bcl-give-back .gb-hero{padding-top:32px;padding-bottom:16px}#bcl-give-back .gb-browse{padding-top:16px}#bcl-give-back .bcl-batch-actions{display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin:24px 0}#bcl-give-back .bcl-batch-actions a{min-height:44px;display:inline-flex;align-items:center}#bcl-jobs .bcl-return-filters{display:inline-flex;align-items:center;min-height:44px;margin:16px 0;color:#2e6b46}';
    style.textContent += '.page-section:has(#bcl-give-back){padding-top:0!important;min-height:0!important}.page-section:has(#bcl-give-back) .content-wrapper{padding-top:24px!important;padding-bottom:24px!important}.fluid-engine.bcl-give-back-fluid{display:block!important}';
    style.textContent += '#bcl-downloads .bcl-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}#bcl-downloads .bcl-download-meta{display:block}@media(max-width:700px){#bcl-downloads .bcl-grid{grid-template-columns:1fr}}';
    document.head.appendChild(style);
    downloads(); giveBack(); jobs();
  }
  function downloads() {
    var root = document.getElementById('bcl-downloads');
    if (!root || !base) return;
    fetch(base + 'downloads/previews/manifest.json').then(function(r){if(!r.ok)throw Error('Preview unavailable');return r.json();}).then(function(manifest){
      root.querySelectorAll('a[href*="/downloads/"]').forEach(function(link){
        var name = decodeURIComponent(new URL(link.href).pathname.split('/').pop());
        var item = manifest[name], card = link.closest('.bcl-card');
        if (!item || !card || card.querySelector('.bcl-download-preview')) return;
        var title = card.querySelector('h3');
        var img = document.createElement('img');
        img.className = 'bcl-download-preview'; img.src = base + item.preview;
        img.alt = 'First-page preview: ' + (title ? title.textContent : name);
        img.loading = 'lazy'; img.decoding = 'async'; img.width = 386; img.height = 500;
        card.insertBefore(img, card.firstChild);
        var meta = document.createElement('span'); meta.className = 'bcl-download-meta';
        meta.textContent = 'PDF · ' + item.pages + (item.pages === 1 ? ' page' : ' pages') + ' · ' + Math.ceil(item.bytes / 1024) + ' KB';
        link.parentNode.insertBefore(meta, link);
      });
    }).catch(function(){/* Downloads remain usable without optional previews. */});
  }
  function giveBack() {
    var root = document.getElementById('bcl-give-back');
    if (!root) return;
    var grid = root.querySelector('.gb-results'), count = root.querySelector('#gb-count');
    if (!grid || !count || root.querySelector('.bcl-batch-actions')) return;
    var fluid=root.closest('.fluid-engine');
    if(fluid && fluid.querySelectorAll(':scope > .fe-block').length===1)fluid.classList.add('bcl-give-back-fluid');
    var limit = 12;
    var resetButton=root.querySelector('#gb-reset');
    if(resetButton)resetButton.textContent='Reset filters';
    var actions = document.createElement('div'); actions.className = 'bcl-batch-actions';
    var more = document.createElement('button'); more.type = 'button'; more.textContent = 'Show 12 more';
    var back = document.createElement('a'); back.href = '#gb-results-heading'; back.textContent = 'Back to filters';
    actions.append(more, back); grid.after(actions);
    count.setAttribute('role','status'); count.setAttribute('aria-live','polite');
    function apply() {
      var eligible = Array.from(grid.querySelectorAll('.gb-card')).filter(function(card){return !card.hidden;});
      grid.querySelectorAll('.gb-card').forEach(function(card){card.classList.remove('bcl-batch-hidden');});
      eligible.forEach(function(card,index){card.classList.toggle('bcl-batch-hidden',index >= limit);});
      count.textContent = Math.min(limit,eligible.length) + ' of ' + eligible.length + ' organizations';
      more.hidden = limit >= eligible.length;
      more.textContent = 'Show ' + Math.min(12, Math.max(0,eligible.length-limit)) + ' more';
    }
    function reset(){limit=12;apply();}
    more.addEventListener('click',function(){
      var before = limit; limit += 12; apply();
      var eligible = Array.from(grid.querySelectorAll('.gb-card')).filter(function(card){return !card.hidden;});
      if(eligible[before]) { var heading=eligible[before].querySelector('h3'); if(heading){heading.tabIndex=-1;heading.focus();} }
    });
    root.querySelectorAll('[data-intent],#gb-reset').forEach(function(el){el.addEventListener('click',reset);});
    root.querySelectorAll('#gb-cause,#gb-geography').forEach(function(el){el.addEventListener('change',reset);});
    function revealHash(){if(/^#gb-org-\d+$/.test(location.hash)){limit=Infinity;apply();var target=document.getElementById(location.hash.slice(1));if(target)target.scrollIntoView();}}
    window.addEventListener('hashchange',revealHash); apply(); revealHash();
  }
  function jobs() {
    var root=document.getElementById('bcl-jobs'); if(!root)return;
    root.id='bcl-jobs';
    var link=document.createElement('a');link.className='bcl-return-filters';link.href='#bcl-jobs';link.textContent='Back to job filters';
    root.after(link);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
