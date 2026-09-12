/* Boulder Creek Local: public community-report discovery. No private data or cookies. */
(() => {
  'use strict';
  if (window.bclCommunityReportsLoaded) return;
  window.bclCommunityReportsLoaded = true;
  const origin = 'https://reports.bouldercreeklocal.com';
  const base = origin + '/community-reports';
  const style = document.createElement('style');
  style.textContent = `
    .bcl-reports{background:#f5f1e7;color:#1c2a26;font-family:Inter,Arial,sans-serif;padding:clamp(28px,5vw,64px) 0;border-block:1px solid #173f3626}
    .bcl-reports .bcl-reports-wrap{max-width:1200px;margin:auto;padding:0 24px}
    .bcl-reports h2{color:#173f36;font-size:clamp(30px,4vw,44px);margin:0 0 12px}
    .bcl-reports p{max-width:65ch;margin:0 0 18px;line-height:1.6}
    .bcl-reports-actions{display:flex;gap:12px 24px;flex-wrap:wrap;align-items:center;margin-top:24px}
    .bcl-reports-actions a{min-height:44px;display:inline-flex;align-items:center;padding-block:10px;box-sizing:border-box}
    .bcl-reports a{color:#173f36;text-underline-offset:4px}
    .bcl-reports a:focus-visible{outline:3px solid #b04a2c;outline-offset:5px}
    .bcl-reports .bcl-reports-primary{display:inline-block;background:#173f36;color:#fffdf8;padding:12px 20px;text-decoration:none}
    .bcl-reports-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}
    .bcl-reports-card{display:block;background:#fffdf8;text-decoration:none;overflow:hidden;border-bottom:2px solid #173f36}
    .bcl-reports-card img{display:block;width:100%;height:220px;object-fit:contain;background:#e9e5da}
    .bcl-reports-card div{padding:20px}
    .bcl-reports-card h3{font-size:24px;margin:0 0 8px;color:#173f36}
    .bcl-reports-card p{font-size:15px;margin:4px 0}
    .bcl-reports-card:hover h3{text-decoration:underline}
    .bcl-reports-status{font-size:16px}
    @media(max-width:700px){.bcl-reports-grid{grid-template-columns:1fr}.bcl-reports-card img{height:240px}}
  `;
  document.head.append(style);
  const link = (label, href, className) => {
    const a = document.createElement('a'); a.textContent = label; a.href = href;
    if (className) a.className = className;
    return a;
  };
  const safeUrl = (value, prefix) => {
    try { const u = new URL(value); return u.origin === origin && u.pathname.startsWith(prefix) && !u.hash && !u.search ? u.href : null; }
    catch { return null; }
  };
  function section(home) {
    const el = document.createElement('section');
    el.className = 'bcl-reports'; el.id = home ? 'bcl-missing-pets' : 'bcl-resident-reports';
    el.setAttribute('aria-labelledby', el.id + '-title');
    const wrap = document.createElement('div'); wrap.className = 'bcl-reports-wrap';
    const h = document.createElement('h2'); h.id = el.id + '-title';
    h.textContent = home ? 'Missing pets in Boulder Creek' : 'Lost something? Found something?';
    const p = document.createElement('p');
    p.textContent = home ? 'Help a neighbor bring their pet home. Browse recent missing-pet reports or post your own.' : 'Report a missing pet, a misdelivered package, or a lost or found item in Boulder Creek. Replies reach the person who posted without displaying their email address.';
    wrap.append(h, p);
    const content = document.createElement('div'); content.className = 'bcl-reports-content';
    if (home) { content.textContent = 'Loading recent reports…'; wrap.append(content); }
    const actions = document.createElement('div'); actions.className = 'bcl-reports-actions';
    actions.append(link(home ? 'View all pet reports' : 'Browse lost & found', home ? base + '/pets' : base, 'bcl-reports-primary'), link('Post a report', base + '/new'));
    if (home) actions.append(link('Packages & other lost items', base));
    wrap.append(actions); el.append(wrap);
    return { el, content };
  }
  function init() {
    const footer = document.querySelector('.bcl-footer-links');
    if (footer && !footer.querySelector('[data-bcl-reports-link]')) {
      const a = link('Lost & Found', base); a.dataset.bclReportsLink = 'true'; footer.append(a);
    }
    const residents = document.querySelector('#bcl-residents');
    if (residents && !document.getElementById('bcl-resident-reports')) {
      const hero = residents.querySelector('.residents-hero, .bcl-hero');
      if (hero) hero.after(section(false).el);
    }
    const home = document.querySelector('#bcl-home');
    if (!home || document.getElementById('bcl-missing-pets')) return;
    const hero = home.querySelector('.bcl-hero'); if (!hero) return;
    const {el, content} = section(true); hero.after(el);
    let pending = false;
    let current = [];
    const message = text => { const p = document.createElement('p'); p.className = 'bcl-reports-status'; p.textContent = text; content.replaceChildren(p); };
    const render = () => {
      const reports = current.filter(r => Date.parse(r.expires_at) > Date.now()).slice(0,3);
      if (!reports.length) { message('No active missing-pet reports are posted here right now. You can still browse found pets or post a report.'); return; }
      const grid = document.createElement('div'); grid.className = 'bcl-reports-grid';
      reports.forEach(r => {
        const url = safeUrl(r.report_url, '/community-reports/pets/'); if (!url) return;
        const card = link('', url, 'bcl-reports-card');
        const photo = Array.isArray(r.images) && r.images.find(i => safeUrl(i.url, '/community-reports/'));
        if (photo) { const img = document.createElement('img'); img.src = photo.url; img.alt = photo.alt_text || ''; img.loading = 'lazy'; card.append(img); }
        const body = document.createElement('div'); const title = document.createElement('h3'); title.textContent = r.title;
        const area = document.createElement('p'); area.textContent = r.general_location;
        const date = document.createElement('p'); const timestamp = Date.parse(r.event_datetime);
        date.textContent = Number.isFinite(timestamp) ? 'Last seen ' + new Intl.DateTimeFormat('en-US', {month:'short',day:'numeric',timeZone:'America/Los_Angeles'}).format(timestamp) : 'View report for details';
        body.append(title, area, date); card.append(body); grid.append(card);
      });
      if (grid.children.length) content.replaceChildren(grid); else message('Recent reports could not be displayed. Open all pet reports for the latest information.');
    };
    async function refresh() {
      if (pending || !el.isConnected) return; pending = true;
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(base + '/api/homepage-pets', {credentials:'omit',cache:'no-store',signal:controller.signal});
        if (!response.ok) throw new Error('Unavailable');
        const data = await response.json(); const age = Date.now() - Date.parse(data.generated_at);
        if (!Array.isArray(data.reports) || !Number.isFinite(age) || age > 300000 || age < -60000) throw new Error('Stale');
        current = data.reports.filter(r => r.category === 'pets' && r.report_type === 'missing' && r.status === 'active'); render();
      } catch { current = []; message('Recent reports are temporarily unavailable here. Open all pet reports to check the latest information.'); }
      finally { clearTimeout(timeout); pending = false; }
    }
    refresh();
    setInterval(() => { if (!document.hidden) refresh(); }, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { if(current.length) render(); refresh(); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  document.addEventListener('mercury:load', init);
})();
