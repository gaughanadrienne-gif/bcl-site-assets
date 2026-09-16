/* Preserve the listing reference in the native Squarespace form. Never submits. */
(function () {
  'use strict';
  function correctionReference(search) {
    var params = new URLSearchParams(search || '');
    if (params.get('topic') !== 'correction') return '';
    return String(params.get('reference') || '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, 1500);
  }
  function start() {
    if (!/^\/contact\/?$/.test(location.pathname)) return;
    var params = new URLSearchParams(location.search);
    if (params.get('topic') !== 'correction') return;
    var ref = correctionReference(location.search), selected = false, done = false;
    function apply() {
      if (done) return;
      var form = document.querySelector('.sqs-block-form form');
      if (!form) return;
      var topic = Array.from(form.querySelectorAll('select')).find(function (s) {
        return Array.from(s.options).some(function (o) { return o.textContent.trim() === 'Report a correction'; });
      });
      if (!topic) return;
      if (!selected) {
        // Do not replace a choice already made by the reader or restored by the browser.
        if (topic.value && topic.selectedIndex > 0) { done = true; return; }
        var option = Array.from(topic.options).find(function (o) { return o.textContent.trim() === 'Report a correction'; });
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(topic, option.value);
        selected = true;
        topic.dispatchEvent(new Event('change', { bubbles: true }));
      }
      var details = Array.from(form.querySelectorAll('textarea')).find(function (field) {
        var label = field.id && Array.from(form.querySelectorAll('label')).find(function (l) { return l.htmlFor === field.id; });
        return label && /Correction details/i.test(label.textContent);
      });
      if (!details) return;
      if (!details.value && ref) {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(details, 'Listing or page: ' + ref + '\n\nCorrection: ');
        details.dispatchEvent(new Event('input', { bubbles: true }));
        details.dispatchEvent(new Event('change', { bubbles: true }));
      }
      done = true;
      observer.disconnect();
    }
    var observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    apply();
    setTimeout(function () { observer.disconnect(); }, 15000);
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { correctionReference: correctionReference };
})();
