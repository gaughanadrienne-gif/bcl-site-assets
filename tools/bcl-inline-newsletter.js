/* Owner-authorized inline placements, 2026-10-07. Reuses existing BCL MailerLite form. */
(function () {
  'use strict';
  var page = location.pathname.replace(/\/$/, '') || '/';
  var key = {'/':'home', '/jobs':'jobs', '/residents':'residents'}[page];
  if (!key) return;
  var id = 'bcl-inline-newsletter-' + key;
  function mount() {
    if (document.getElementById(id)) return true;
    var anchor = document.querySelector(key === 'home' ? '#bcl-home-explore' : key === 'jobs' ? '.bcl-return-filters[href="#bcl-jobs"]' : '#bcl-residents .page-close');
    if (!anchor || !anchor.parentNode) return false;
    var section = document.createElement('section');
    section.id = id;
    section.className = 'bcl bcl-inline-newsletter';
    section.setAttribute('aria-labelledby', id + '-title');
    section.innerHTML = '<div class="bcl-wrap"><div><h2 id="' + id + '-title">The Friday roundup</h2><p>Get the Friday roundup: weekend events, mountain status, and one Boulder Creek business spotlight each week.</p></div>' +
      '<div id="mlb2-bcl-inline-' + key + '" class="ml-subscribe-form bcl-inline-letter">' +
      '<form class="ml-block-form bcl-letter-form" action="https://assets.mailerlite.com/jsonp/2514969/forms/193202991568783062/subscribe" data-code="" method="post" target="_blank">' +
      '<div class="ml-field-email ml-validate-required ml-validate-email"><label class="bcl-inline-label" for="' + id + '-email">Email address</label><input id="' + id + '-email" type="email" name="fields[email]" placeholder="Email address" autocomplete="email" required aria-required="true"></div>' +
      '<input type="hidden" name="ml-submit" value="1"><input type="hidden" name="anticsrf" value="true">' +
      '<button type="submit" class="primary">Sign up</button><button disabled style="display:none" type="button" class="loading">Loading...</button>' +
      '<div class="ml-server-error d-none" role="alert"></div></form>' +
      '<div class="ml-block-success bcl-inline-success" style="display:none" role="status" aria-live="polite">Thanks. You\'re on the list.</div></div></div>';
    if (!document.getElementById('bcl-inline-newsletter-css-v1')) {
      var style = document.createElement('style');
      style.id = 'bcl-inline-newsletter-css-v1';
      style.textContent = '.bcl-inline-newsletter{background:#f5f1e7;border:1px solid #e3ddcf;border-radius:8px;color:#1c2a26;margin:32px 0;padding:32px 0;box-shadow:none}.bcl-inline-newsletter>.bcl-wrap{display:grid;grid-template-columns:1fr 1fr;gap:24px 40px;align-items:center}.bcl-inline-newsletter h2{font-size:clamp(1.5rem,2.6vw,2rem);line-height:1.1;margin:0 0 10px}.bcl-inline-newsletter p{font-size:1rem;line-height:1.6;margin:0}.bcl-inline-newsletter .bcl-letter-form{flex-wrap:wrap;margin:0;max-width:none}.bcl-inline-newsletter .ml-field-email{flex:1 1 180px;min-width:0}.bcl-inline-newsletter input[type=email]{box-sizing:border-box;width:100%;border-radius:4px}.bcl-inline-newsletter button.primary{background:#b04a2c!important;border-color:#b04a2c!important;color:#fff!important;min-height:48px;border-radius:0}.bcl-inline-label{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}.bcl-inline-newsletter .ml-server-error{flex-basis:100%;color:#9d3022}.bcl-inline-newsletter .d-none{display:none}.bcl-inline-success{padding:14px 16px;background:#fffdf8;border:1px solid #e3ddcf;border-radius:8px}@media(max-width:800px){.bcl-inline-newsletter>.bcl-wrap{grid-template-columns:1fr}}@media(max-width:480px){.bcl-inline-newsletter .ml-field-email{flex-basis:auto;width:100%}.bcl-inline-newsletter .bcl-letter-form{flex-direction:column}}';
      document.head.appendChild(style);
    }
    anchor.parentNode.insertBefore(section, anchor.nextSibling);
    return true;
  }
  function start() {
    if (mount()) return;
    var observer = new MutationObserver(function () { if (mount()) observer.disconnect(); });
    observer.observe(document.body, {childList:true, subtree:true});
    setTimeout(function () { observer.disconnect(); }, 15000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
