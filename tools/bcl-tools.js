/* Boulder Creek Local — embedded tools (GitHub + jsDelivr, no app server).
 * Renders into whichever of these divs exists on the page:
 *   #bcl-directory  #bcl-food  #bcl-events  #bcl-status
 * Data: /data/*.json in this repo, served via jsDelivr.
 * Trust rules: missing data is "unavailable", never an inferred all-clear.
 * Emergencies always route to 911 and official agencies.
 */
(function () {
  "use strict";

  var REPO = (typeof window !== "undefined" && window.BCL_REPO) || "https://cdn.jsdelivr.net/gh/gaughanadrienne-gif/bcl-site-assets@main";
  var NWS_POINT = { lat: 37.1261, lon: -122.1222 }; // downtown Boulder Creek

  var LOCAL_ALLOWLIST = ["Boulder Creek", "Brookdale", "Ben Lomond", "Lompico", "Zayante", "San Lorenzo Valley", "Felton", "Scotts Valley"];
  // Businesses that are local despite an out-of-valley (usually Los Gatos) mailing address.
  // Exact display names; reconciled against verified winery names in Task 7.
  var LOCAL_EXCEPTIONS = ["David Bruce Winery", "Byington Vineyard & Winery", "Loma Prieta Winery", "Muns Vineyard", "Burrell School Vineyards & Winery", "Lago Lomita Vineyards"];
  // Localities ordered closest -> farthest for within/between-tier sorting.
  var LOCALITY_ORDER = ["Boulder Creek", "Brookdale", "Ben Lomond", "Lompico", "Zayante", "San Lorenzo Valley", "Felton", "Scotts Valley", "Los Gatos", "Saratoga", "Santa Cruz", "Soquel", "Capitola", "Aptos", "Corralitos", "Campbell", "San Jose", "Watsonville"];

  function isLocal(l) {
    if (l && l.local === true) return true;
    if (l && LOCAL_EXCEPTIONS.indexOf(l.name) >= 0) return true;
    return !!(l && LOCAL_ALLOWLIST.indexOf(l.locality) >= 0);
  }
  function localityRank(l) {
    var i = l ? LOCALITY_ORDER.indexOf(l.locality) : -1;
    return i < 0 ? Infinity : i;
  }
  function byRankThenName(a, b) {
    var ra = localityRank(a), rb = localityRank(b);
    if (ra !== rb) return ra - rb;
    return String(a.name || "").localeCompare(String(b.name || ""));
  }
  function arrangeListings(rows, cap) {
    var local = rows.filter(isLocal).sort(byRankThenName);
    var nearby = rows.filter(function (l) { return !isLocal(l); }).sort(byRankThenName);
    if (cap && cap > 0) nearby = nearby.slice(0, cap);
    return { local: local, nearby: nearby };
  }

  /* Resident-first ordering (owner, 2026-07-22): everyday needs lead
     (home trades, health, salons, shops, money); search-once categories
     (weddings, celebrations) close the page. */
  var CAT_GROUPS = [
    ["Home & Property", ["General Contractors & Construction", "Plumbing & HVAC", "Electrical & Solar", "Landscaping & Gardening", "Tree Care & Defensible Space", "Excavation, Grading & Paving", "Handyman & Property Maintenance", "House Cleaning", "Well & Pump / Water", "Home Services & Repair"]],
    ["Health & Personal", ["Health & Wellness", "Personal Services", "Pets & Animals", "Florists"]],
    ["Shops & Essentials", ["Shopping", "Errands & Essentials", "Automotive", "Transportation", "Utilities & Essential Services"]],
    ["Money & Property", ["Money & Professional Services", "Real Estate"]],
    ["Family & Learning", ["Education & Childcare"]],
    ["Community & Civic", ["Community & Nonprofit", "Government & Public Services", "Emergency & Public Safety", "Parks & Recreation", "Arts & Culture"]],
    ["Food & Drink", ["Vineyards & Wine Tasting"]],
    ["Stay", ["Lodging"]],
    ["Weddings & Celebrations", ["Event Venues", "Catering & Bar", "Cakes & Desserts", "Wedding Services", "Party Rentals & Decor", "Kids Parties"]]
  ];
  var CAT_ORDER = [];
  var GROUP_OF = {};
  CAT_GROUPS.forEach(function (g) {
    g[1].forEach(function (c) { CAT_ORDER.push(c); GROUP_OF[c] = g[0]; });
  });
  // Categories whose nearby (non-local) listings have inherent value regardless
  // of distance - essential/civic/safety services (e.g. county 9-1-1, alerts,
  // hotlines). Never capped in display and never archived by curation.
  var CAP_EXEMPT = ["Emergency & Public Safety", "Health & Wellness", "Government & Public Services", "Utilities & Essential Services", "Community & Nonprofit", "Transportation"];
  function orderedCategoryNames(present) {
    var known = CAT_ORDER.filter(function (c) { return present.indexOf(c) >= 0; });
    var unknown = present.filter(function (c) { return CAT_ORDER.indexOf(c) < 0; }).sort();
    return known.concat(unknown);
  }
  function groupLabelOf(cat) { return GROUP_OF[cat] || null; }

  /* ---------- shared ---------- */

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var CSS_ID = "bcl-tools-css-v6";
  /* The header-injection CSS breaks BCL code blocks out of Squarespace's
     Fluid Engine grid with :has(.bcl-full) rules. Browsers without :has()
     (Firefox ESR 115 and older, Safari < 15.4, Chrome < 105) drop those
     rules entirely, collapsing every tool page into a ~200px column.
     Reproduce: strip :has() rules in devtools; a museum visitor hit this
     on 2026-07-22. Fallback: tag the same ancestors with a real class and
     inject equivalent class-keyed rules. */
  function legacyFullWidthFallback() {
    var supportsHas = false;
    try {
      supportsHas = !!(window.CSS && CSS.supports && CSS.supports("selector(:has(*))"));
    } catch (e) { supportsHas = false; }
    if (supportsHas) return;
    if (document.getElementById("bcl-hasfull-fallback")) return;
    var fulls = document.querySelectorAll(".bcl-full");
    if (!fulls.length) return;
    for (var i = 0; i < fulls.length; i++) {
      var node = fulls[i].parentNode;
      while (node && node.nodeType === 1 && node !== document.body) {
        var cl = node.classList;
        if (cl && (cl.contains("page-section") || cl.contains("fluid-engine") || cl.contains("fe-block") || cl.contains("sqs-block-code") || cl.contains("sqs-block") || node.tagName === "SECTION")) {
          cl.add("bcl-hasfull");
        }
        node = node.parentNode;
      }
    }
    var css = [
      ".page-section.bcl-hasfull .content-wrapper, section.bcl-hasfull .content-wrapper { max-width: none !important; padding: 0 !important; }",
      ".page-section.bcl-hasfull { min-height: 0 !important; }",
      ".fluid-engine.bcl-hasfull { grid-template-columns: 1fr !important; grid-template-rows: auto !important; }",
      ".fe-block.bcl-hasfull { grid-area: auto !important; grid-column: 1 / -1 !important; position: static !important; transform: none !important; width: 100% !important; }",
      ".sqs-block-code.bcl-hasfull, .sqs-block-code.bcl-hasfull .sqs-block-content { padding: 0 !important; width: 100% !important; }",
      ".sqs-block.bcl-hasfull { padding: 0 !important; }"
    ].join("\n");
    var st = document.createElement("style");
    st.id = "bcl-hasfull-fallback";
    st.appendChild(document.createTextNode(css));
    document.head.appendChild(st);
  }

  function injectCSS() {
    if (document.getElementById(CSS_ID)) return;
    /* An older cached copy of this script may have injected its stylesheet
       already; stale CSS with new markup renders unstyled. Replace it. */
    [].slice.call(document.querySelectorAll("style[id^='bcl-tools-css']")).forEach(function (n) { n.remove(); });
    var css = [
      ".bcl-tool{font-family:Inter,Arial,sans-serif;color:#1c2a26 !important;line-height:1.5;margin:0 auto;}",
      ".bcl-tool *{box-sizing:border-box;}",
      ".bcl-tool h3{font-family:'Cormorant Garamond',Georgia,serif;color:#173f36 !important;font-size:1.5rem;margin:1.6em 0 .5em;}",
      ".bcl-controls{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 18px;}",
      ".bcl-controls input,.bcl-controls select{font-family:Inter,Arial,sans-serif;font-size:.95rem;padding:10px 14px;border:1px solid #cfc9b8;background:#fffdf8 !important;color:#1c2a26 !important;}",
      ".bcl-controls input{flex:1 1 220px;}",
      ".bcl-controls select{flex:0 1 auto;max-width:100%;}",
      ".bcl-count{font-family:'IBM Plex Mono',monospace;font-size:.72rem;letter-spacing:.08em;color:#67716b !important;margin:0 0 14px;}",
      ".bcl-card{background:#fffdf8 !important;border:1px solid #e3ddcf;padding:16px 18px;margin:0 0 12px;}",
      ".bcl-card .bcl-name{font-weight:600;font-size:1.05rem;color:#173f36 !important;}",
      ".bcl-card .bcl-sub{font-family:'IBM Plex Mono',monospace;font-size:.68rem;letter-spacing:.08em;color:#2f6754 !important;text-transform:uppercase;margin:2px 0 8px;}",
      ".bcl-card p{margin:0 0 8px;font-size:.92rem;color:#1c2a26 !important;}",
      ".bcl-meta{font-size:.85rem;color:#67716b !important;margin:2px 0;}",
      ".bcl-card a{color:#2e6b46 !important;text-decoration:underline;}",
      ".bcl-verified{font-family:'IBM Plex Mono',monospace;font-size:.66rem;letter-spacing:.06em;color:#67716b !important;margin-top:10px;}",
      ".bcl-note{background:#dde2d8;padding:12px 16px;font-size:.85rem;color:#1c2a26 !important;margin:18px 0 0;}",
      ".bcl-unavailable{background:#f5f1e7 !important;border:1px dashed #cfc9b8;padding:18px;font-size:.92rem;color:#67716b !important;}",
      ".bcl-alert{background:#8f4f45 !important;color:#fffdf8 !important;padding:14px 18px;margin:0 0 14px;}",
      ".bcl-promo-band{width:100vw;margin:0 calc(50% - 50vw);background:linear-gradient(160deg,#1C4266 0%,#14304C 70%);border-top:1px solid #0d2438;border-bottom:1px solid #0d2438;}",
      ".bcl-ticker{display:block;width:100%;background:#14304C;color:#FCF8EF !important;font-family:'Oswald','IBM Plex Mono',sans-serif;font-size:.78rem;font-weight:600;letter-spacing:.16em;text-transform:uppercase;text-align:center;padding:9px 14px;text-decoration:none !important;border-bottom:2px solid #C3281C;}",
      ".bcl-ticker b{color:#E8A33D !important;}",
      ".bcl-ticker u{text-underline-offset:3px;}",
      ".bcl-ticker:hover{background:#1C4266;}",
      ".bcl-promo-inner{display:flex;align-items:center;gap:20px;flex-wrap:wrap;max-width:1180px;margin:0 auto;padding:20px 28px;}",
      ".bcl-promo-badge{width:56px;height:auto;flex:0 0 auto;}",
      ".bcl-promo-text{display:flex;flex-direction:column;gap:2px;flex:1 1 260px;min-width:220px;}",
      ".bcl-promo-kicker{font-family:'Oswald','IBM Plex Mono',sans-serif;font-size:.62rem;font-weight:600;letter-spacing:.22em;color:#FCF8EF !important;text-transform:uppercase;opacity:.85;}",
      ".bcl-promo-title{font-family:'Oswald',Impact,sans-serif;font-size:1.45rem;font-weight:700;letter-spacing:.02em;color:#fff !important;text-transform:uppercase;line-height:1.1;}",
      ".bcl-promo-when{font-family:'Oswald','IBM Plex Mono',sans-serif;font-size:.8rem;font-weight:500;letter-spacing:.12em;color:#FCF8EF !important;text-transform:uppercase;}",
      ".bcl-promo-when b{color:#E8A33D !important;font-weight:600;}",
      ".bcl-promo-actions{display:flex;align-items:center;gap:14px;flex:0 0 auto;}",
      ".bcl-promo-btn{display:inline-block;background:#C3281C !important;color:#fff !important;font-family:'Oswald',sans-serif;font-weight:700;font-size:.85rem;letter-spacing:.18em;text-transform:uppercase;padding:10px 22px;text-decoration:none !important;box-shadow:0 3px 0 #8f1d14;}",
      ".bcl-promo-btn:hover{background:#a52015 !important;}",
      ".bcl-promo-more{font-family:'Oswald','IBM Plex Mono',sans-serif;font-size:.72rem;font-weight:600;letter-spacing:.14em;color:#FCF8EF !important;text-transform:uppercase;text-decoration:underline;}",
      ".bcl-alert a{color:#fffdf8 !important;font-weight:600;}",
      ".bcl-actionrow{font-size:.9rem;margin:6px 0;padding-left:16px;position:relative;}",
      ".bcl-actionrow:before{content:'';position:absolute;left:0;top:.45em;width:7px;height:11px;background:#d56e47;}",
      ".bcl-actionrow a{color:#2e6b46 !important;font-weight:600;}",
      ".bcl-status-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;}",
      ".bcl-event-flow .bcl-event-grid{margin:0 0 6px;}",
      ".bcl-event-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:12px;}",
      ".bcl-event-card{background:#fffdf8 !important;border:1px solid #e3ddcf;padding:14px 15px;display:flex;flex-direction:column;gap:5px;}",
      ".bcl-event-date{font-family:'IBM Plex Mono',monospace;font-size:.68rem;letter-spacing:.1em;color:#d56e47 !important;text-transform:uppercase;}",
      ".bcl-event-title{font-weight:600;color:#173f36 !important;font-size:.96rem;line-height:1.3;}",
      ".bcl-event-meta{font-size:.8rem;color:#67716b !important;line-height:1.4;}",
      ".bcl-event-cat{font-family:'IBM Plex Mono',monospace;font-size:.62rem;letter-spacing:.08em;color:#2f6754 !important;text-transform:uppercase;margin-top:auto;padding-top:6px;}",
      ".bcl-event-notice{font-family:'IBM Plex Mono',monospace;font-size:.62rem;letter-spacing:.08em;color:#8f4f45 !important;text-transform:uppercase;font-weight:700;}",
      ".bcl-event-card a{color:#2e6b46 !important;font-size:.82rem;}",
      ".bcl-cat-head{display:flex;align-items:center;gap:10px;margin:28px 0 12px;}",
      ".bcl-cat-head:before{content:'';display:block;width:9px;height:16px;background:#d56e47;flex:0 0 auto;}",
      ".bcl-cat-head h3{margin:0 !important;font-size:1.3rem !important;}",
      ".bcl-cat-head span{font-family:'IBM Plex Mono',monospace;font-size:.68rem;letter-spacing:.08em;color:#67716b !important;}",
      ".bcl-dir-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;}",
      ".bcl-dir-card{background:#fffdf8 !important;border:1px solid #e3ddcf;padding:13px 14px;display:flex;flex-direction:column;gap:4px;}",
      ".bcl-dir-head{display:flex;align-items:center;gap:10px;}",
      ".bcl-dir-tile{width:42px;height:42px;flex:0 0 42px;border:1px solid #e3ddcf;object-fit:cover;display:block;}",
      ".bcl-dir-mono{width:42px;height:42px;flex:0 0 42px;border:1px solid #e3ddcf;background:#f5f1e7;color:#173f36;display:flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',Georgia,serif;font-size:1.25rem;font-weight:600;}",
      ".bcl-dir-name{font-weight:600;color:#173f36 !important;font-size:.94rem;line-height:1.3;}",
      ".bcl-dir-sub{font-family:'IBM Plex Mono',monospace;font-size:.6rem;letter-spacing:.08em;color:#2f6754 !important;text-transform:uppercase;}",
      ".bcl-dir-desc{font-size:.8rem;color:#1c2a26 !important;line-height:1.4;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}",
      ".bcl-dir-meta{font-size:.78rem;color:#67716b !important;line-height:1.35;}",
      ".bcl-dir-links{font-size:.8rem;margin-top:2px;}",
      ".bcl-dir-links a{color:#2e6b46 !important;text-decoration:underline;}",
      ".bcl-dir-verified{font-family:'IBM Plex Mono',monospace;font-size:.58rem;letter-spacing:.06em;color:#67716b !important;margin-top:auto;padding-top:6px;}",
      ".bcl-links li{margin:6px 0;font-size:.92rem;}",
      ".bcl-links a{color:#2e6b46 !important;}",
      ".bcl-group-head{font-family:'IBM Plex Mono',monospace;font-size:.7rem;letter-spacing:.14em;text-transform:uppercase;color:#8f4f45 !important;border-bottom:1px solid #e3ddcf;padding:0 0 6px;margin:34px 0 4px;}",
      ".bcl-tier-divider{font-family:'IBM Plex Mono',monospace;font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:#67716b !important;margin:14px 0 10px;}",
      ".bcl-range{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px;}",
      ".bcl-range button{font-family:'IBM Plex Mono',monospace;font-size:.68rem;letter-spacing:.08em;padding:8px 14px;border:1px solid #173f36;background:#fffdf8 !important;color:#173f36 !important;cursor:pointer;text-transform:uppercase;}",
      ".bcl-range button.bcl-on{background:#173f36 !important;color:#f5f1e7 !important;}",
      /* Forest-green card: the homepage's one dark block, so the live conditions
         read first. Every child colour is re-stated for the dark ground. */
      ".bcl-today{background:#173f36 !important;color:#f5f1e7 !important;border:1px solid #0d2c26;border-radius:16px;overflow:hidden;padding:26px 28px;font-family:Inter,Arial,sans-serif;box-shadow:0 14px 34px rgba(13,44,38,.16);}",
      ".bcl-today-head{display:flex;align-items:center;gap:10px;margin:0 0 12px;}",
      ".bcl-today-head:before{content:'';display:block;width:9px;height:16px;background:#d56e47;flex:0 0 auto;}",
      ".bcl-today-head h2{font-family:'Cormorant Garamond',Georgia,serif;color:#fffdf8 !important;font-size:1.7rem;margin:0 !important;line-height:1;}",
      ".bcl-today-head span{font-family:'IBM Plex Mono',monospace;font-size:.68rem;letter-spacing:.12em;color:#9fb8a9 !important;margin-left:auto;text-transform:uppercase;}",
      ".bcl-today-row{display:flex;flex-wrap:wrap;gap:8px 22px;font-size:.9rem;color:#f5f1e7 !important;margin:0 0 4px;}",
      ".bcl-today-row b{color:#a8bd7f !important;font-family:'IBM Plex Mono',monospace;font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;display:block;margin-bottom:2px;font-weight:500;}",
      ".bcl-today-ev{margin:10px 0 0;padding-top:10px;border-top:1px solid rgba(245,241,231,.2);}",
      ".bcl-today-ev div{font-size:.9rem;margin:3px 0;color:#f5f1e7 !important;}",
      ".bcl-today-ev span{font-family:'IBM Plex Mono',monospace;font-size:.7rem;color:#f0a883 !important;margin-right:8px;}",
      ".bcl-today a{color:#f0a883 !important;text-decoration:underline;}",
      ".bcl-today-links{margin-top:12px;font-size:.82rem;}",
      "@media (max-width:640px){.bcl-controls{flex-direction:column;}.bcl-controls input,.bcl-controls select{flex:0 0 auto;width:100%;}.bcl-today-head span{margin-left:0;}}",
      /* Homepage: Latest from Around Town + consolidated Explore grid */
      ".bcl-sec-viewall{color:#d56e47 !important;font-weight:600;font-size:.92rem;text-decoration:none !important;white-space:nowrap;}",
      ".bcl-recent{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;}",
      ".bcl-recent-card{display:flex;flex-direction:column;background:#fffdf8 !important;border:1px solid #e3ddcf;border-radius:14px;overflow:hidden;text-decoration:none !important;transition:transform .15s,box-shadow .15s;}",
      ".bcl-recent-card:hover{transform:translateY(-3px);box-shadow:0 12px 30px rgba(23,63,54,.12);}",
      ".bcl-recent-img{aspect-ratio:1200/630;background:#a8bd7f;overflow:hidden;}",
      ".bcl-recent-img img{width:100%;height:100%;object-fit:cover;display:block;}",
      ".bcl-recent-body{padding:15px 18px 18px;}",
      ".bcl-recent-cat{font-family:'IBM Plex Mono',monospace;font-size:.62rem;letter-spacing:.12em;text-transform:uppercase;color:#d56e47 !important;}",
      ".bcl-recent-sum{color:#33413b !important;font-size:.92rem;line-height:1.45;margin:7px 0 10px !important;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}",
      ".bcl-recent-date{font-family:'IBM Plex Mono',monospace;font-size:.66rem;letter-spacing:.06em;color:#67716b !important;}",
      ".bcl-explore{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;}",
      ".bcl-tile{display:flex;align-items:flex-start;gap:14px;background:#fffdf8 !important;border:1px solid #e3ddcf;border-radius:12px;padding:18px;text-decoration:none !important;transition:border-color .15s,transform .15s;}",
      ".bcl-tile:hover{border-color:#d56e47;transform:translateY(-2px);}",
      ".bcl-tile-ico{flex:0 0 auto;width:40px;height:40px;border-radius:10px;background:rgba(213,110,71,.1);color:#d56e47;display:flex;align-items:center;justify-content:center;}",
      ".bcl-tile-ico svg{width:22px;height:22px;}",
      ".bcl-tile-txt h3{font-family:'Cormorant Garamond',Georgia,serif;color:#0d2c26 !important;font-size:1.2rem;margin:0 0 3px !important;}",
      ".bcl-tile-txt p{margin:0 !important;font-size:.82rem;color:#67716b !important;line-height:1.4;}",
      /* Homepage local board: one section, three columns (events, jobs, rentals).
         The column is the card; rows inside are hairline-separated so three
         categories cost about the height one strip used to. */
      ".bcl-board{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;}",
      ".bcl-board-col{display:flex;flex-direction:column;background:rgba(23,63,54,.055) !important;border:1px solid rgba(23,63,54,.16);border-radius:14px;padding:4px 20px 6px;}",
      ".bcl-board-head{display:flex;align-items:baseline;gap:10px;padding:16px 0 10px;border-bottom:2px solid #173f36;}",
      ".bcl-board-head h3{font-family:'Cormorant Garamond',Georgia,serif;color:#173f36 !important;font-size:1.25rem;margin:0 !important;line-height:1;}",
      ".bcl-board-head a{font-family:'IBM Plex Mono',monospace;font-size:.6rem;letter-spacing:.08em;text-transform:uppercase;color:#d56e47 !important;text-decoration:none !important;margin-left:auto;white-space:nowrap;}",
      ".bcl-board-head a:hover{text-decoration:underline !important;}",
      ".bcl-bi{display:block;padding:13px 0;border-bottom:1px solid rgba(23,63,54,.13);text-decoration:none !important;transition:padding-left .15s;}",
      ".bcl-board-list .bcl-bi:last-child{border-bottom:0;}",
      ".bcl-bi:hover{padding-left:5px;}",
      ".bcl-bi-kick{display:block;font-family:'IBM Plex Mono',monospace;font-size:.6rem;letter-spacing:.1em;text-transform:uppercase;color:#d56e47 !important;margin-bottom:3px;}",
      ".bcl-bi-title{display:block;font-weight:600;color:#173f36 !important;font-size:.95rem;line-height:1.3;}",
      ".bcl-bi-meta{display:block;font-size:.8rem;color:#67716b !important;line-height:1.4;margin-top:2px;}",
      ".bcl-board .bcl-unavailable,.bcl-board .bcl-count{margin:14px 0;font-size:.85rem;}",
      ".bcl-today-alerts{margin:0 0 12px;}",
      /* On the green card a solid brick block fights the ground, so the alert
         inverts to cream and carries its urgency in a brick edge and headword. */
      ".bcl-today-alerts .bcl-alert{background:#f5f1e7 !important;color:#1c2a26 !important;border:1px solid #e3ddcf;border-left:4px solid #8f4f45;border-radius:10px;margin:0 0 8px;padding:12px 16px;font-size:.9rem;}",
      ".bcl-today-alerts .bcl-alert strong{color:#8f4f45 !important;}",
      ".bcl-today-alerts .bcl-alert a{color:#2e6b46 !important;font-weight:600;text-decoration:underline;}",
      ".bcl-today-noalert{font-family:'IBM Plex Mono',monospace;font-size:.64rem;letter-spacing:.08em;text-transform:uppercase;color:#9fb8a9 !important;}",
      /* Article pages: "Keep reading" cards under the body */
      ".bcl-related{max-width:900px;margin:0 auto;padding:34px 20px 48px;border-top:1px solid #e3ddcf;}",
      ".bcl-related h2{font-family:'Cormorant Garamond',Georgia,serif;color:#173f36 !important;font-size:1.6rem;margin:0 0 14px !important;line-height:1.1;}",
      ".bcl-related-kicker{font-family:'IBM Plex Mono',monospace;font-size:.64rem;letter-spacing:.12em;text-transform:uppercase;color:#d56e47 !important;margin:0 0 4px !important;}",
      "@media (max-width:960px){.bcl-board{grid-template-columns:1fr;}}",
      "@media (max-width:820px){.bcl-recent,.bcl-explore{grid-template-columns:1fr;}}",
      /* Residents page: compact jump-nav */
      ".bcl-jumpnav-sec{background:#fffdf8;padding:16px 0;border-bottom:1px solid #ece6d8;}",
      ".bcl-jumpnav{display:flex;flex-wrap:wrap;gap:8px;}",
      ".bcl-jumpnav a{font-family:'IBM Plex Mono',monospace;font-size:.66rem;letter-spacing:.06em;text-transform:uppercase;color:#173f36 !important;border:1px solid #d9d3c4;border-radius:999px;padding:7px 14px;text-decoration:none !important;transition:border-color .15s,color .15s;}",
      ".bcl-jumpnav a:hover{border-color:#d56e47;color:#d56e47 !important;}",
      ".bcl-tabs{display:flex;gap:8px;margin:0 0 14px;}",
      ".bcl-tab{font-family:'IBM Plex Mono',monospace;font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;padding:9px 16px;border:1px solid #173f36;background:#fffdf8 !important;color:#173f36 !important;cursor:pointer;}",
      ".bcl-tab.bcl-on{background:#173f36 !important;color:#f5f1e7 !important;}",
      ".bcl-checklabel{display:flex;align-items:center;gap:6px;font-size:.85rem;color:#1c2a26 !important;flex:0 0 auto;}",
      ".bcl-badge{display:inline-block;font-family:'IBM Plex Mono',monospace;font-size:.66rem;letter-spacing:.06em;background:#dde2d8;color:#173f36 !important;padding:2px 7px;}",
      ".bcl-job-card,.bcl-rental-card{background:#fffdf8 !important;border:1px solid #e3ddcf;padding:16px 18px;margin:0 0 12px;}",
      ".bcl-job-card .bcl-actionrow a,.bcl-rental-card .bcl-actionrow a{color:#d56e47 !important;}",
      ".bcl-sr-only{position:absolute !important;width:1px !important;height:1px !important;padding:0 !important;margin:-1px !important;overflow:hidden !important;clip:rect(0,0,0,0) !important;white-space:nowrap !important;border:0 !important;}",
      ".bcl-article-body{max-width:760px;margin:0 auto;padding:0 0 42px;font-family:Inter,Arial,sans-serif;color:#1c2a26;line-height:1.72;font-size:1rem;}",
      ".bcl-article-body h2,.bcl-article-body h3{font-family:'Cormorant Garamond',Georgia,serif;color:#173f36;line-height:1.15;}",
      ".bcl-article-body h2{font-size:clamp(1.8rem,4vw,2.35rem);margin:1.8em 0 .55em;}",
      ".bcl-article-body h3{font-size:1.45rem;margin:1.5em 0 .45em;}",
      ".bcl-article-body p,.bcl-article-body li{font-size:1rem;}",
      ".bcl-article-body a{color:#2e6b46;text-decoration:underline;text-underline-offset:2px;}",
      ".bcl-article-body blockquote{border-left:3px solid #d56e47;margin:1.5em 0;padding:.2em 0 .2em 1.25em;color:#4f5e57;}",
      ".bcl-article-body table{border-collapse:collapse;display:block;max-width:100%;overflow-x:auto;margin:1.5em 0;}",
      ".bcl-article-body th,.bcl-article-body td{border:1px solid #e3ddcf;padding:9px 12px;text-align:left;}",
      ".bcl-article-reviewed{font-family:'IBM Plex Mono',monospace;font-size:.7rem !important;letter-spacing:.06em;text-transform:uppercase;color:#67716b;border-top:1px solid #e3ddcf;padding-top:14px;margin-top:36px;}",
      ".bcl-draft-state{max-width:760px;margin:18px auto 42px;background:#f5f1e7;border:1px solid #e3ddcf;padding:18px 20px;font-family:Inter,Arial,sans-serif;color:#4f5e57;}"
    ].join("");
    var el = document.createElement("style");
    el.id = CSS_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  function unavailable(root, what, extraHTML) {
    root.innerHTML =
      '<div class="bcl-unavailable">' + esc(what) +
      " isn't loading right now. That means the data is unavailable, not that everything is fine. " +
      (extraHTML || "") + "</div>";
  }

  function fetchJSON(url) {
    return fetch(url, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  /* ---------- listings (directory + food) ---------- */

  function listingCard(l) {
    var h = '<div class="bcl-dir-card">';
    var tile = l.tile
      ? '<img class="bcl-dir-tile" src="' + REPO + "/brand/listings/" + esc(l.tile) + '" alt="" loading="lazy">'
      : '<div class="bcl-dir-mono" aria-hidden="true">' + esc((l.name || "?").charAt(0)) + "</div>";
    h += '<div class="bcl-dir-head">' + tile + '<div><div class="bcl-dir-name">' + esc(l.name) + "</div>";
    if (l.subcategory) h += '<div class="bcl-dir-sub">' + esc(l.subcategory) + "</div>";
    h += "</div></div>";
    if (l.description) h += '<div class="bcl-dir-desc">' + esc(l.description) + "</div>";
    if (l.address) h += '<div class="bcl-dir-meta">' + esc(l.address) + "</div>";
    else if (l.service_area) h += '<div class="bcl-dir-meta">Serves: ' + esc(l.service_area) + "</div>";
    /* Owner policy: these trades work out of their homes. We never publish a
       home address, so say why the address is missing instead of leaving a gap. */
    if (l.no_storefront) h += '<div class="bcl-dir-meta">Service based, no public storefront. Contact them directly.</div>';
    if (l.hours_text) h += '<div class="bcl-dir-meta">' + esc(String(l.hours_text).replace(/\s*\(?confirm with the business\)?\.?/gi, "")) + "</div>";
    var links = [];
    if (l.phone) links.push('<a href="tel:' + esc(String(l.phone).replace(/[^0-9+]/g, "")) + '">' + esc(l.phone) + "</a>");
    if (l.website) links.push('<a href="' + esc(l.website) + '" target="_blank" rel="noopener">Website</a>');
    if (links.length) h += '<div class="bcl-dir-links">' + links.join(" · ") + "</div>";
    return h + "</div>";
  }

  function buildDirectoryHTML(rows, opts) {
    opts = opts || {};
    var byCat = {};
    rows.forEach(function (l) { (byCat[l.category] = byCat[l.category] || []).push(l); });
    var cats = orderedCategoryNames(Object.keys(byCat));
    var lastGroup = null, out = "";
    cats.forEach(function (c) {
      var g = groupLabelOf(c);
      if (g && g !== lastGroup) { out += '<div class="bcl-group-head">' + esc(g) + "</div>"; lastGroup = g; }
      // Display cap must stay in sync with the Task 8 curation cap (KEEP=6 in 04-curate-nearby.js).
      var catCap = CAP_EXEMPT.indexOf(c) >= 0 ? 0 : (opts.cap || 0);
      var a = arrangeListings(byCat[c], catCap);
      var shown = a.local.length + a.nearby.length;
      out += '<div class="bcl-cat-head"><h3>' + esc(c) + "</h3><span>" + shown + "</span></div>";
      if (a.local.length) {
        out += '<div class="bcl-dir-grid">' + a.local.map(listingCard).join("") + "</div>";
      }
      if (a.nearby.length) {
        if (a.local.length) out += '<div class="bcl-tier-divider">Also serving the area</div>';
        out += '<div class="bcl-dir-grid">' + a.nearby.map(listingCard).join("") + "</div>";
      }
    });
    return out;
  }
  /* The dropdown is a flat jump-to list, so it reads best alphabetically
     (owner, 2026-07-23). The on-page sections keep the resident-first
     grouped order via orderedCategoryNames in buildDirectoryHTML. */
  function buildCategoryOptions(present) {
    return present.slice().sort(function (a, b) { return String(a).localeCompare(String(b)); })
      .map(function (c) { return "<option>" + esc(c) + "</option>"; }).join("");
  }

  function initListings(root, dataFile, label) {
    root.innerHTML = '<div class="bcl-count">Loading ' + esc(label) + "…</div>";
    fetchJSON(REPO + "/data/" + dataFile).then(function (data) {
      var all = data.listings || [];
      var cats = [];
      all.forEach(function (l) { if (cats.indexOf(l.category) < 0) cats.push(l.category); });

      root.innerHTML =
        '<div class="bcl-controls">' +
        '<input type="search" placeholder="Search by name or service" aria-label="Search listings">' +
        '<select aria-label="Jump to category"><option value="">All categories</option>' +
        buildCategoryOptions(cats) +
        "</select>" +
        "</div>" +
        '<div class="bcl-count"></div><div class="bcl-list"></div>' +
        '<div class="bcl-note">Something wrong or missing? <a href="/contact">Send an update</a>.</div>';

      var input = root.querySelector("input");
      var select = root.querySelector("select");
      var count = root.querySelector(".bcl-count");
      var list = root.querySelector(".bcl-list");

      function render() {
        var q = (input.value || "").toLowerCase();
        var cat = select.value;
        var rows = all.filter(function (l) {
          if (cat && l.category !== cat) return false;
          if (!q) return true;
          return (l.name + " " + (l.subcategory || "") + " " + (l.description || "")).toLowerCase().indexOf(q) >= 0;
        });
        count.textContent = rows.length + " OF " + all.length + " LISTINGS · UPDATED " + (data.updated || "");
        if (!rows.length) {
          list.innerHTML = '<div class="bcl-unavailable">No listings match that search. A missing business isn’t a judgment, it may just not be verified yet. <a href="/contact">Suggest it</a>.</div>';
          return;
        }
        // Cap the nearby tier only when browsing (no active search), so a search never hides matches.
        list.innerHTML = buildDirectoryHTML(rows, { cap: q ? 0 : 6 });
      }
      input.addEventListener("input", render);
      select.addEventListener("change", render);
      render();
    }).catch(function () {
      unavailable(root, "The " + label + " list", 'You can still <a href="/contact">send an update</a>.');
    });
  }

  /* ---------- jobs ---------- */

  function jobTab(job) {
    return job && job.geography_tier === "remote" ? "remote" : "local";
  }

  function jobSalaryText(job) {
    return job.salary_disclosed ? job.salary_text : "Pay not listed";
  }

  function jobSortKey(job) {
    return {
      verified: job.verification_status === "verified" ? 0 : 1,
      posted: job.posted_at || "",
      title: String(job.title || "")
    };
  }

  function jobCompare(a, b) {
    var ka = jobSortKey(a), kb = jobSortKey(b);
    if (ka.verified !== kb.verified) return ka.verified - kb.verified;
    /* newest posted_at first; empty dates sort last regardless of direction */
    var ap = ka.posted, bp = kb.posted;
    if (!ap && bp) return 1;
    if (ap && !bp) return -1;
    if (ap !== bp) return ap > bp ? -1 : 1;
    return ka.title.localeCompare(kb.title);
  }

  function filterJobs(rows, opts) {
    opts = opts || {};
    var tab = opts.tab || "local";
    var q = (opts.q || "").toLowerCase();
    var rows2 = rows.filter(function (j) {
      if (jobTab(j) !== tab) return false;
      if (tab === "local" && j.geography_tier === "extended" && !opts.includeExtended) return false;
      if (opts.category && j.category !== opts.category) return false;
      if (q) {
        var hay = ((j.title || "") + " " + (j.employer_name || "") + " " + (j.city || "")).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    return rows2.sort(jobCompare);
  }

  function jobCard(job) {
    var h = '<div class="bcl-job-card">';
    h += '<div class="bcl-name"><a href="' + esc(job.canonical_url) + '" target="_blank" rel="noopener">' + esc(job.title) + "</a></div>";
    var tier = job.geography_tier === "remote" ? "Remote" : (job.geography_tier === "extended" ? "Extended commute" : "Local");
    h += '<div class="bcl-sub">' + esc(job.employer_name) + (job.city ? " · " + esc(job.city) : "") + " · " + esc(tier) + "</div>";
    if (job.commute_minutes && job.geography_tier !== "remote") h += '<div class="bcl-meta">Commute: ~' + esc(String(job.commute_minutes)) + " min</div>";
    if (job.employment_type) h += '<div class="bcl-meta">' + esc(job.employment_type) + "</div>";
    h += '<div class="bcl-meta">' + esc(jobSalaryText(job)) + "</div>";
    if (job.posted_at) h += '<div class="bcl-meta">Posted ' + esc(job.posted_at) + "</div>";
    else if (job.first_seen_at) h += '<div class="bcl-meta">First seen ' + esc(job.first_seen_at) + "</div>";
    h += '<div class="bcl-verified">SOURCE: ' + esc(job.source || "") + " · VERIFIED " + esc(job.last_verified_at || "") + "</div>";
    h += '<div class="bcl-actionrow"><a href="' + esc(job.canonical_url) + '" target="_blank" rel="noopener">Apply at source</a></div>';
    h += '<div class="bcl-actionrow"><a href="/contact">Report a problem with this listing</a></div>';
    return h + "</div>";
  }

  function initJobs(root) {
    root.innerHTML = '<div class="bcl-count">Loading jobs…</div>';
    fetchJSON(REPO + "/data/jobs.json").then(function (data) {
      var all = data.jobs || [];
      var cats = [];
      all.forEach(function (j) { if (j.category && cats.indexOf(j.category) < 0) cats.push(j.category); });
      cats.sort();

      root.innerHTML =
        '<div class="bcl-tabs"><button class="bcl-tab bcl-on" data-tab="local">Local</button><button class="bcl-tab" data-tab="remote">Remote</button></div>' +
        '<div class="bcl-controls">' +
        '<input type="search" placeholder="Search by title, employer, or city" aria-label="Search jobs">' +
        '<select aria-label="Filter by category"><option value="">All categories</option>' +
        cats.map(function (c) { return "<option>" + esc(c) + "</option>"; }).join("") +
        "</select>" +
        '<label class="bcl-checklabel bcl-ext-wrap"><input type="checkbox" class="bcl-ext"> Include extended commute</label>' +
        "</div>" +
        '<div class="bcl-count"></div><div class="bcl-list"></div>' +
        '<div class="bcl-note">Boulder Creek Local is not the employer and does not process applications. Verify details and apply directly with the employer. ' +
        'Something wrong or missing? <a href="/contact">Send an update</a>.</div>';

      var input = root.querySelector("input");
      var select = root.querySelector("select");
      var extBox = root.querySelector(".bcl-ext");
      var extWrap = root.querySelector(".bcl-ext-wrap");
      var count = root.querySelector(".bcl-count");
      var list = root.querySelector(".bcl-list");
      var tabBtns = [].slice.call(root.querySelectorAll(".bcl-tab"));
      var tab = "local";

      function render() {
        extWrap.style.display = tab === "local" ? "" : "none";
        var rows = filterJobs(all, {
          tab: tab,
          q: input.value || "",
          category: select.value,
          includeExtended: !!extBox.checked
        });
        count.textContent = rows.length + " OF " + all.filter(function (j) { return jobTab(j) === tab; }).length + " " + tab.toUpperCase() + " JOBS · UPDATED " + (data.updated || "");
        if (!rows.length) {
          list.innerHTML = '<div class="bcl-unavailable">No jobs match right now. <a href="/contact">Suggest one</a>.</div>';
          return;
        }
        list.innerHTML = rows.map(jobCard).join("");
      }
      tabBtns.forEach(function (btn) {
        btn.addEventListener("click", function () {
          tab = btn.getAttribute("data-tab");
          tabBtns.forEach(function (b) { b.className = "bcl-tab" + (b === btn ? " bcl-on" : ""); });
          render();
        });
      });
      input.addEventListener("input", render);
      select.addEventListener("change", render);
      extBox.addEventListener("change", render);
      render();
    }).catch(function () {
      unavailable(root, "The jobs board", 'You can still <a href="/contact">send an update</a>.');
    });
  }

  /* ---------- rentals ---------- */

  function rentalCompare(a, b) {
    var av = a.verification_status === "verified" ? 0 : 1;
    var bv = b.verification_status === "verified" ? 0 : 1;
    if (av !== bv) return av - bv;
    var af = a.first_seen_at || "", bf = b.first_seen_at || "";
    if (af !== bf) return af > bf ? -1 : 1;
    var ar = a.monthly_rent == null ? Infinity : a.monthly_rent;
    var br = b.monthly_rent == null ? Infinity : b.monthly_rent;
    return ar - br;
  }

  function filterRentals(rows, opts) {
    opts = opts || {};
    var q = (opts.q || "").toLowerCase();
    var town = opts.town || "";
    var rows2 = rows.filter(function (r) {
      if (opts.minBeds && !(r.bedrooms >= opts.minBeds)) return false;
      if (opts.verifiedOnly && r.verification_status !== "verified") return false;
      if (town && town !== "all" && r.locality !== town) return false;
      if (q) {
        var hay = ((r.headline || "") + " " + (r.city || "") + " " + (r.property_type || "")).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    return rows2.sort(rentalCompare);
  }

  function rentalMoneyText(n) {
    var s = String(Math.round(n));
    return "$" + s.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "/mo";
  }

  function rentalCard(rental) {
    var h = '<div class="bcl-rental-card">';
    h += '<div class="bcl-name">' + esc(rental.headline) + "</div>";
    h += '<div class="bcl-sub"><span class="bcl-badge">' + esc(rental.locality || rental.postal_code || "") + "</span> · " + esc(rental.city || "") + "</div>";
    h += '<div class="bcl-meta">' + (rental.monthly_rent ? esc(rentalMoneyText(rental.monthly_rent)) : "Contact for rent") + "</div>";
    var beds = rental.bedrooms != null ? rental.bedrooms + " bd" : "";
    var baths = rental.bathrooms != null ? rental.bathrooms + " ba" : "";
    if (beds || baths) h += '<div class="bcl-meta">' + esc([beds, baths].filter(Boolean).join(" · ")) + "</div>";
    if (rental.property_type) h += '<div class="bcl-meta">' + esc(rental.property_type) + "</div>";
    if (rental.available_date) h += '<div class="bcl-meta">Available: ' + esc(rental.available_date) + "</div>";
    if (rental.furnished) h += '<div class="bcl-meta">Furnished</div>';
    h += '<div class="bcl-verified">SOURCE: ' + esc(rental.property_manager || rental.source || "") + " · VERIFIED " + esc(rental.last_verified_at || "") + "</div>";
    h += '<div class="bcl-actionrow"><a href="' + esc(rental.canonical_url) + '" target="_blank" rel="noopener">View original listing</a></div>';
    h += '<div class="bcl-actionrow"><a href="/contact">Report a problem with this listing</a></div>';
    return h + "</div>";
  }

  function initRentals(root) {
    root.innerHTML = '<div class="bcl-count">Loading rentals…</div>';
    fetchJSON(REPO + "/data/rentals.json").then(function (data) {
      var all = data.rentals || [];

      root.innerHTML =
        '<div class="bcl-controls">' +
        '<input type="search" placeholder="Search by address, city, or property type" aria-label="Search rentals">' +
        '<select aria-label="Minimum bedrooms"><option value="0">Any beds</option><option value="1">1+ bd</option><option value="2">2+ bd</option><option value="3">3+ bd</option></select>' +
        '<select aria-label="Town" class="bcl-town-select"><option value="all">All towns</option><option value="Boulder Creek">Boulder Creek</option>' +
        '<option value="Ben Lomond">Ben Lomond</option><option value="Felton">Felton</option><option value="Brookdale">Brookdale</option></select>' +
        '<label class="bcl-checklabel"><input type="checkbox" class="bcl-verified-only" checked> Verified only</label>' +
        "</div>" +
        '<div class="bcl-count"></div><div class="bcl-list"></div>' +
        '<div class="bcl-note">Boulder Creek Local is not the landlord or property manager and does not handle applications, deposits, or keys. ' +
        'Never wire money or pay a deposit before viewing a property in person and verifying the lister. Report suspicious listings. ' +
        'This site does not discriminate and does not knowingly list rentals that violate fair housing law in the San Lorenzo Valley ' +
        '(Boulder Creek, Ben Lomond, Felton, Brookdale). ' +
        '<a href="/contact">Send an update</a>.</div>' +
        '<div class="bcl-actionrow">Looking further? See more valley rentals on ' +
        '<a href="https://www.zillow.com/boulder-creek-ca/rentals/" target="_blank" rel="noopener">Zillow</a>.</div>';

      var input = root.querySelector("input");
      var bedsSel = root.querySelector("select");
      var townSel = root.querySelector(".bcl-town-select");
      var verifiedBox = root.querySelector(".bcl-verified-only");
      var count = root.querySelector(".bcl-count");
      var list = root.querySelector(".bcl-list");

      function render() {
        var rows = filterRentals(all, {
          q: input.value || "",
          minBeds: parseInt(bedsSel.value, 10) || 0,
          verifiedOnly: !!verifiedBox.checked,
          town: townSel.value || "all"
        });
        count.textContent = rows.length + " OF " + all.length + " SAN LORENZO VALLEY RENTALS · UPDATED " + (data.updated || "");
        if (!rows.length) {
          list.innerHTML = '<div class="bcl-unavailable">No verified San Lorenzo Valley rentals are listed right now. <a href="/contact">Suggest one</a>.</div>';
          return;
        }
        list.innerHTML = rows.map(rentalCard).join("");
      }
      input.addEventListener("input", render);
      bedsSel.addEventListener("change", render);
      townSel.addEventListener("change", render);
      verifiedBox.addEventListener("change", render);
      render();
    }).catch(function () {
      unavailable(root, "The rentals board", 'You can still <a href="/contact">send an update</a>.');
    });
  }

  /* ---------- events ---------- */

  function evParts(s) {
    // parse "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM" as LOCAL date parts (avoid UTC off-by-one)
    var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
    if (!m) return null;
    return { y: +m[1], mo: +m[2], d: +m[3], h: m[4] != null ? +m[4] : null, mi: m[5] != null ? +m[5] : null };
  }

  function evDateChip(s) {
    var p = evParts(s);
    if (!p) return esc(s);
    var dt = new Date(p.y, p.mo - 1, p.d);
    var days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    var mons = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    var out = days[dt.getDay()] + " " + mons[p.mo - 1] + " " + p.d;
    if (p.h != null) {
      var h12 = p.h % 12 === 0 ? 12 : p.h % 12;
      out += " · " + h12 + (p.mi ? ":" + (p.mi < 10 ? "0" : "") + p.mi : "") + (p.h < 12 ? " AM" : " PM");
    }
    return out;
  }

  function eventCard(e) {
    var h = '<div class="bcl-event-card">';
    h += '<div class="bcl-event-date">' + evDateChip(e.start) + "</div>";
    h += '<div class="bcl-event-title">' + esc(e.title) + "</div>";
    if (e.location) h += '<div class="bcl-event-meta">' + esc(e.location) + "</div>";
    /* Event cards deliberately don't render descriptions, so anything a reader must
       know BEFORE turning up (age limits, ticket-only) goes here or it is invisible. */
    if (e.notice) h += '<div class="bcl-event-notice">' + esc(e.notice) + "</div>";
    if (e.url) h += '<a href="' + esc(e.url) + '" target="_blank" rel="noopener">Details</a>';
    h += '<div class="bcl-event-cat">' + esc(e.category || "Community") + "</div>";
    return h + "</div>";
  }

  /* ---------- article header: inject the featured card at the top of a post
     (only when the asset filename matches the post slug, same rule as AH) ---------- */

  function initArticleHeader() {
    if (!/^\/around-town\/[^\/]+\/?$/.test(location.pathname)) return;
    if (document.getElementById("bcl-article-header")) return;
    var slug = location.pathname.replace(/\/$/, "").split("/").pop();
    var og = document.querySelector('meta[property="og:image"]');
    if (!og) return;
    var url = og.getAttribute("content") || "";
    var file = url.split("?")[0].split("/").pop();
    if (file !== slug + ".jpg" && file !== slug + ".png") return;
    var target = document.querySelector(".blog-item-content");
    if (!target) return;
    var img = document.createElement("img");
    img.id = "bcl-article-header";
    img.src = url;
    // Title card: the headline is baked into the image, so give the header image
    // the article title as alt text (screen readers can't read text inside an image).
    var ogt = document.querySelector('meta[property="og:title"]');
    var title = (ogt ? ogt.getAttribute("content") : "") || document.title || "";
    title = title.replace(/\s*[|–—-]\s*Boulder Creek Local\s*$/i, "").replace(/\s*\(Copy\)\s*$/i, "").trim();
    img.alt = title || "Boulder Creek Local";
    img.style.cssText = "display:block;width:100%;height:auto;margin:0 auto 30px;border:1px solid #e3ddcf;max-width:860px;";
    target.insertBefore(img, target.firstChild);
  }

  function articleSlugFromPath(pathname) {
    var match = String(pathname || "").match(/^\/around-town\/([^\/]+)\/?$/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function articleTitleFromMetadata() {
    var ogt = document.querySelector('meta[property="og:title"]');
    var title = (ogt ? ogt.getAttribute("content") : "") || document.title || "";
    return title.replace(/\s*[|–—-]\s*Boulder Creek Local\s*$/i, "").replace(/\s*\(Copy\)\s*$/i, "").trim();
  }

  function upsertRobots(content) {
    var meta = document.querySelector('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "robots");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", content);
  }

  function ensureHiddenHeading(title) {
    if (!title) return null;
    var heading = document.querySelector("main h1, h1.entry-title");
    if (!heading) {
      heading = document.createElement("h1");
      var main = document.querySelector("main") || document.body;
      main.insertBefore(heading, main.firstChild);
    }
    if (!heading.textContent.trim()) heading.textContent = title;
    heading.classList.add("bcl-sr-only");
    return heading;
  }

  function hasNativeArticleBody(target) {
    var clone = target.cloneNode(true);
    var injected = clone.querySelector("#bcl-article-header, #bcl-article-body, .bcl-draft-state");
    while (injected) {
      injected.parentNode.removeChild(injected);
      injected = clone.querySelector("#bcl-article-header, #bcl-article-body, .bcl-draft-state");
    }
    return clone.textContent.replace(/\s+/g, " ").trim().length > 120;
  }

  function initArticleContent() {
    var slug = articleSlugFromPath(location.pathname);
    if (!slug) return;
    var target = document.querySelector(".blog-item-content");
    if (!target) return;
    var nativeBody = hasNativeArticleBody(target);

    fetchJSON(REPO + "/data/articles.json").then(function (data) {
      var record = (data.articles || {})[slug];
      if (record) {
        ensureHiddenHeading(record.title || articleTitleFromMetadata());
        var hero = document.getElementById("bcl-article-header");
        if (hero) {
          hero.alt = "";
          hero.setAttribute("aria-hidden", "true");
        }
        /* The reviewed date is owned by articles.json, so the stamp has to appear
           whether the body is injected here or served natively by Squarespace.
           Articles migrated into the post body skip the injection path below and
           would otherwise silently lose it. */
        function appendReviewed(parent) {
          if (!record.reviewedAt) return;
          if (document.querySelector(".bcl-article-reviewed")) return;
          var reviewed = document.createElement("p");
          reviewed.className = "bcl-article-reviewed";
          reviewed.textContent = "Information checked " + record.reviewedAt;
          parent.appendChild(reviewed);
        }

        if (nativeBody || document.getElementById("bcl-article-body")) {
          appendReviewed(document.getElementById("bcl-article-body") || target);
          return;
        }
        var body = document.createElement("div");
        body.id = "bcl-article-body";
        body.className = "bcl-article-body";
        body.innerHTML = record.html || "";
        appendReviewed(body);
        target.appendChild(body);
        return;
      }

      if ((data.withheldSlugs || []).indexOf(slug) >= 0) {
        upsertRobots("noindex, nofollow");
        ensureHiddenHeading(articleTitleFromMetadata());
        if (!nativeBody && !target.querySelector(".bcl-draft-state")) {
          var note = document.createElement("p");
          note.className = "bcl-draft-state";
          note.innerHTML = 'This guide is not published yet. <a href="/around-town">Browse published Around Town stories</a>.';
          target.appendChild(note);
        }
      }
    }).catch(function () {
      /* Leave native Squarespace content untouched when the feed is unavailable. */
    });
  }

  function pageHeadingForPath(pathname) {
    var path = String(pathname || "").replace(/\/$/, "");
    if (path === "/contact") return "Contact and submit";
    if (path === "/jobs") return "Jobs in the San Lorenzo Valley";
    if (path === "/rentals") return "Rentals in the San Lorenzo Valley";
    if (path === "/around-town") return "Around Town";
    var category = path.match(/^\/around-town\/category\/(.+)$/);
    if (category) return decodeURIComponent(category[1].replace(/\+/g, " ")) + " articles";
    return "";
  }

  function repairPageHeadings() {
    var path = location.pathname.replace(/\/$/, "");
    if (path === "/file-uploads") upsertRobots("noindex, nofollow");

    if (path === "/around-town" || /^\/around-town\/category\//.test(path)) {
      [].slice.call(document.querySelectorAll("h1.entry-title")).forEach(function (heading) {
        var link = heading.closest("article") && heading.closest("article").querySelector('a[href*="/around-town/"]');
        var slug = link ? articleSlugFromPath(new URL(link.href, location.href).pathname) : "";
        var replacement = document.createElement("h2");
        replacement.className = (heading.className || "") + " bcl-sr-only";
        replacement.textContent = slug ? prettifySlug(slug) : "Article";
        heading.parentNode.replaceChild(replacement, heading);
      });
    }

    var title = pageHeadingForPath(path);
    if (title && ![].slice.call(document.querySelectorAll("h1")).some(function (h) { return h.textContent.trim(); })) {
      ensureHiddenHeading(title);
    }
  }

  function repairKnownLinks() {
    [].slice.call(document.querySelectorAll('a[href="https://www.bcrpd.org/kids-classes"]')).forEach(function (link) {
      link.href = "https://www.bcrpd.org/kids-classes";
    });
  }
  /* The widget pages (Food, Directory, Events, Submit) shipped with build
     scaffolding that reads oddly for visitors: placeholder "... slot" labels,
     redundant intro boxes wrapping each tool, a "Before you go" aside, and
     generic blurb-card sections ("Planned categories" / Breakfast-Lunch-
     Dinner) sitting AFTER the live listings. Strip them at runtime so each
     page is just the tool plus genuinely useful context. Idempotent, so a
     clean re-paste of the fixed source simply no-ops. */
  function repairEmbedScaffolding() {
    // Site-wide: remove placeholder "... slot" labels (e.g. "Submission form
    // slot"). Unusual enough that only build scaffolding matches.
    [].slice.call(document.querySelectorAll(".bcl-label")).forEach(function (lbl) {
      if (/\bslot\b/i.test(lbl.textContent || "")) lbl.remove();
    });
    // Widget finders: drop the redundant intro box (tool head + any
    // heading/paragraph siblings that precede the mount).
    ["bcl-food", "bcl-directory", "bcl-events"].forEach(function (id) {
      var mount = document.getElementById(id);
      if (!mount) return;
      var tool = mount.closest(".bcl-tool");
      if (!tool) return;
      var head = tool.querySelector(".bcl-tool-head");
      if (head) head.remove();
      [].slice.call(mount.parentNode.children).forEach(function (n) {
        if (n !== mount) n.remove();
      });
    });
    // /food only: drop the "Before you go" hero aside.
    var foodPage = document.getElementById("bcl-page-food");
    if (foodPage) {
      [].slice.call(foodPage.querySelectorAll(".bcl-hero .bcl-card, .bcl-hero aside")).forEach(function (n) { n.remove(); });
    }
    // Generic blurb-card sections after a widget add nothing actionable.
    // Remove the card grid + its dev-language head; keep any cross-link note
    // (drop the whole section only if nothing useful remains).
    var page = document.getElementById("bcl-page-food") || document.getElementById("bcl-page-directory") || document.getElementById("bcl-page-events");
    if (page) {
      [].slice.call(page.querySelectorAll(".bcl-section.bcl-cream")).forEach(function (sec) {
        var grid = sec.querySelector(".bcl-grid-3, .bcl-grid");
        if (!grid || sec.querySelectorAll("article.bcl-card").length < 2) return;
        grid.remove();
        var head = sec.querySelector(".bcl-section-head");
        if (head) head.remove();
        if (!sec.querySelector(".bcl-note")) sec.remove();
      });
    }
  }
  /* Mountain Status shipped with the same "we are not an emergency service"
     caveat in three places. This is a blog/directory, not an alert service,
     so trim it to one calm 911 pointer (owner request) while still routing
     emergencies to 911 and the official sources. Position/regex based so it
     works regardless of the exact live copy and no-ops on a clean re-paste. */
  function repairStatusPage() {
    var page = document.getElementById("bcl-mountain-status");
    if (!page) return;
    var heroNote = page.querySelector(".bcl-hero .bcl-note");
    if (heroNote) heroNote.innerHTML = "For emergencies, call 911. For official alerts and closures, use the sources below.";
    // Drop the trailing "does not report whether ... safe" defensive clause.
    [].slice.call(page.querySelectorAll(".bcl-note")).forEach(function (n) {
      n.innerHTML = n.innerHTML.replace(/\s*This page points to official sources;\s*it does not report whether any road, area, or condition is safe\.?/i, "");
    });
  }

  /* Residents page: drop the hero verification box + the redundant "Essential
     links" summary grid (its agencies reappear in detail below), soften the
     Emergency-readiness defensive line, and add a compact jump-nav so the long
     page is scannable. Owner request. */
  var RES_JUMP_LABELS = {
    "new resident quick start": "Quick start",
    "trash, recycling, and green waste": "Trash & recycling",
    "water and power": "Water & power",
    "emergency readiness": "Emergency",
    "roads": "Roads",
    "schools and families": "Schools",
    "permits and building": "Permits",
    "internet and cell": "Internet & cell",
    "everyday places": "Everyday places"
  };
  function repairResidentsPage() {
    var page = document.getElementById("bcl-residents");
    if (!page) return;
    // 1. Remove the hero verification box.
    var heroNote = page.querySelector(".bcl-hero .bcl-note");
    if (heroNote) heroNote.remove();
    // 2. Remove the redundant "Essential links" summary grid; 3. soften the
    //    Emergency-readiness intro line.
    [].slice.call(page.querySelectorAll("section.bcl-section")).forEach(function (s) {
      var k = s.querySelector(".bcl-kicker");
      var key = k ? k.textContent.trim().toLowerCase() : "";
      if (key === "essential links") { s.remove(); return; }
      if (key === "emergency readiness") {
        // The kicker is itself a <p>, so target the intro paragraph that is a
        // DIRECT child of the section head (not the kicker inside the inner div).
        var p = s.querySelector(".bcl-section-head > p");
        if (p) p.textContent = "Set these official programs up before you need them.";
      }
    });
    // 4. Build the jump-nav from the remaining content sections.
    var links = [];
    [].slice.call(page.querySelectorAll("section.bcl-section")).forEach(function (s) {
      var k = s.querySelector(".bcl-kicker");
      var label = k && RES_JUMP_LABELS[k.textContent.trim().toLowerCase()];
      if (!label) return;
      var id = "res-" + k.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      s.id = id;
      s.style.scrollMarginTop = "80px";
      links.push('<a href="#' + id + '">' + esc(label) + "</a>");
    });
    if (links.length) {
      var hero = page.querySelector(".bcl-hero");
      if (hero) {
        var nav = document.createElement("div");
        nav.className = "bcl-jumpnav-sec";
        nav.innerHTML = '<div class="bcl-wrap"><nav class="bcl-jumpnav" aria-label="On this page">' + links.join("") + "</nav></div>";
        hero.parentNode.insertBefore(nav, hero.nextSibling);
      }
    }
  }

  /* ---------- homepage refresh ---------- */

  var EXPLORE_TILES = [
    ["mountain", "Mountain Status", "Weather, roads, smoke, and outages, with official sources.", "/mountain-status"],
    ["calendar", "Events", "Community gatherings, music, markets, and workshops.", "/events"],
    ["pin", "Directory", "Local services, shops, organizations, and contacts.", "/directory"],
    ["fork", "Food & Drink", "Restaurants, coffee, markets, and places to gather.", "/food"],
    ["house", "Resident Resources", "Utilities, preparedness, schools, and mountain life.", "/residents"],
    ["map", "Visit", "Plan a respectful visit to town and the redwoods.", "/visit"]
  ];
  var EXPLORE_ICONS = {
    mountain: '<path d="M3 20l6-11 4 6 2-3 6 8z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/>',
    pin: '<path d="M12 21s7-6.3 7-11a7 7 0 10-14 0c0 4.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.4"/>',
    fork: '<path d="M7 3v8a2 2 0 004 0V3M9 11v10M17 3c-1.5 0-2.5 2-2.5 5s1 4 2.5 4 2.5-1 2.5-4-1-5-2.5-5zM17 16v5"/>',
    house: '<path d="M4 11l8-7 8 7M6 10v10h12V10"/>',
    map: '<path d="M9 4L4 6v14l5-2 6 2 5-2V4l-5 2-6-2zM9 4v14M15 6v14"/>'
  };
  function exploreIcon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + EXPLORE_ICONS[name] + "</svg>";
  }

  /* Pull published Around Town posts (title, watercolor header, date) straight
     from the live blog collection so the homepage and article pages stay
     current on their own. Same-origin JSON, so no CORS and no data upkeep. */

  var CARD_MONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function blogItemsFrom(data) {
    return (data.items || []).filter(function (it) { return it && it.assetUrl && it.urlId; });
  }

  /* Squarespace pages the blog JSON, so walk it with the publishOn cursor until
     the collection runs out or the page budget does. */
  function fetchBlogItems(maxPages) {
    var out = [];
    function step(offset, page) {
      var url = "/around-town?format=json" + (offset ? "&offset=" + offset : "");
      return fetch(url, { credentials: "same-origin" })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var items = blogItemsFrom(data);
          out = out.concat(items);
          var last = (data.items || [])[(data.items || []).length - 1];
          var more = data.pagination && data.pagination.nextPage;
          if (page + 1 >= maxPages || !more || !last || !last.publishOn) return out;
          return step(last.publishOn, page + 1);
        });
    }
    return step(0, 0);
  }

  function articleCardHTML(it) {
    var title = (it.seoData && it.seoData.seoTitle) || it.title || prettifySlug(it.urlId);
    var cat = (it.categories && it.categories[0]) || "Around Town";
    // The watercolor card already carries the title, so show a one-line
    // summary here instead of repeating it (title moves to the img alt).
    var summary = (it.seoData && it.seoData.seoDescription) || String(it.excerpt || "").replace(/<[^>]*>/g, "").trim();
    var d = new Date(it.publishOn || 0);
    var date = CARD_MONS[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
    var url = it.fullUrl || ("/around-town/" + it.urlId);
    var img = it.assetUrl + (it.assetUrl.indexOf("?") < 0 ? "?format=750w" : "");
    return '<a class="bcl-recent-card" href="' + esc(url) + '">' +
      '<div class="bcl-recent-img"><img src="' + esc(img) + '" alt="' + esc(title) + '" loading="lazy"></div>' +
      '<div class="bcl-recent-body">' +
      '<span class="bcl-recent-cat">' + esc(cat) + "</span>" +
      '<p class="bcl-recent-sum">' + esc(summary) + "</p>" +
      '<span class="bcl-recent-date">' + esc(date) + " &middot; Around Town</span>" +
      "</div></a>";
  }

  function initRecentArticles(root) {
    if (!root) return;
    fetchBlogItems(1)
      .then(function (items) {
        var newest = items
          .sort(function (a, b) { return (b.publishOn || 0) - (a.publishOn || 0); })
          .slice(0, 3);
        if (!newest.length) throw new Error("no items");
        root.innerHTML = newest.map(articleCardHTML).join("");
      })
      .catch(function () {
        // If the feed is unavailable, drop the whole section rather than show an empty block.
        var sec = root.closest(".bcl-section");
        if (sec) sec.remove();
      });
  }

  /* ---------- related articles (bottom of an Around Town post) ---------- */

  /* Rank by how many categories/tags a post shares with the one being read, then
     by recency. Returns [] when there is nothing else published to point at. */
  function pickRelatedArticles(items, currentSlug, n) {
    var rows = (items || []).filter(function (it) { return it && it.urlId && it.assetUrl; });
    var current = null;
    rows.forEach(function (it) { if (it.urlId === currentSlug) current = it; });
    var mine = ((current && current.categories) || []).concat((current && current.tags) || []);
    function shared(it) {
      var theirs = (it.categories || []).concat(it.tags || []);
      var hits = 0;
      for (var i = 0; i < theirs.length; i++) if (mine.indexOf(theirs[i]) > -1) hits++;
      return hits;
    }
    return rows
      .filter(function (it) { return it.urlId !== currentSlug; })
      .sort(function (a, b) {
        var d = shared(b) - shared(a);
        if (d) return d;
        return (b.publishOn || 0) - (a.publishOn || 0);
      })
      .slice(0, n);
  }

  function initRelatedArticles() {
    var slug = articleSlugFromPath(location.pathname);
    if (!slug) return;
    if (document.getElementById("bcl-related")) return;
    var target = document.querySelector(".blog-item-content");
    if (!target) return;

    fetchBlogItems(5).then(function (items) {
      var picks = pickRelatedArticles(items, slug, 3);
      if (!picks.length) return;
      var sec = document.createElement("section");
      sec.id = "bcl-related";
      sec.className = "bcl-related";
      sec.setAttribute("aria-label", "More Around Town stories");
      sec.innerHTML = '<p class="bcl-related-kicker">Keep reading</p><h2>More from Around Town</h2>' +
        '<div class="bcl-recent">' + picks.map(articleCardHTML).join("") + "</div>";
      var host = target.parentNode || target;
      if (host === target) target.appendChild(sec);
      else host.insertBefore(sec, target.nextSibling);
    }).catch(function () {
      /* No feed, no recommendations. Leave the post as it is. */
    });
  }

  /* ---------- homepage live board: next events, newest jobs, current rentals ---------- */

  function boardColumnHTML(heading, href, linkLabel, slotId) {
    return '<div class="bcl-board-col"><div class="bcl-board-head"><h3>' + esc(heading) +
      '</h3><a href="' + esc(href) + '">' + esc(linkLabel) + ' &rarr;</a></div>' +
      '<div id="' + esc(slotId) + '" class="bcl-board-list"></div></div>';
  }

  function boardRow(href, external, kick, title, meta) {
    return '<a class="bcl-bi" href="' + esc(href) + '"' + (external ? ' target="_blank" rel="noopener"' : "") + ">" +
      '<span class="bcl-bi-kick">' + esc(kick) + "</span>" +
      '<span class="bcl-bi-title">' + esc(title) + "</span>" +
      (meta ? '<span class="bcl-bi-meta">' + esc(meta) + "</span>" : "") + "</a>";
  }

  /* ISO date strings compare correctly as strings, so "still upcoming" is a
     plain >= against today's key. Multi-day events stay listed until they end. */
  function nextEvents(rows, todayKey, n) {
    return (rows || [])
      .filter(function (e) { return e && String(e.end || e.start || "").slice(0, 10) >= todayKey; })
      .sort(function (a, b) { return String(a.start).localeCompare(String(b.start)); })
      .slice(0, n);
  }

  /* Local jobs first; only widen to the extended commute if the valley is quiet. */
  function homeJobs(rows, n) {
    var local = filterJobs(rows, { tab: "local" });
    if (local.length >= n) return local.slice(0, n);
    return filterJobs(rows, { tab: "local", includeExtended: true }).slice(0, n);
  }

  /* Verified rentals first; fall back to the full list rather than showing nothing. */
  function homeRentals(rows, n) {
    var verified = filterRentals(rows, { verifiedOnly: true });
    if (verified.length >= n) return verified.slice(0, n);
    return filterRentals(rows, {}).slice(0, n);
  }

  function homeEventRow(e) {
    var where = e.location ? String(e.location).split(",")[0] : "";
    var meta = [where, e.category].filter(Boolean).join(" · ");
    return boardRow(e.url || "/events", !!e.url, evDateChip(e.start), e.title || "", meta);
  }

  function homeJobRow(job) {
    var meta = [job.city, job.employment_type, jobSalaryText(job)].filter(Boolean).join(" · ");
    return boardRow(job.canonical_url, true, job.employer_name || "", job.title || "", meta);
  }

  function homeRentalRow(rental) {
    var beds = rental.bedrooms != null ? rental.bedrooms + " bd" : "";
    var baths = rental.bathrooms != null ? rental.bathrooms + " ba" : "";
    var meta = [
      rental.monthly_rent ? rentalMoneyText(rental.monthly_rent) : "Contact for rent",
      beds, baths
    ].filter(Boolean).join(" · ");
    return boardRow(rental.canonical_url, true, rental.locality || rental.city || "", rental.headline || "", meta);
  }

  /* Shared loader for the three data-backed homepage strips. An empty feed states
     that plainly and a broken feed says it is unavailable; neither is an all-clear. */
  function fillHomeSlot(slotId, file, opts) {
    var slot = document.getElementById(slotId);
    if (!slot) return;
    slot.innerHTML = '<div class="bcl-count">' + esc(opts.loading) + "</div>";
    fetchJSON(REPO + "/data/" + file).then(function (data) {
      var rows = opts.pick(data[opts.key] || []);
      if (!rows.length) {
        slot.innerHTML = '<div class="bcl-unavailable">' + opts.empty + "</div>";
        return;
      }
      slot.innerHTML = rows.map(opts.card).join("");
    }).catch(function () {
      slot.innerHTML = '<div class="bcl-unavailable">' + esc(opts.label) +
        " isn't loading right now. That means the data is unavailable, not that there is nothing to show. " +
        '<a href="' + esc(opts.href) + '">Open the full ' + esc(opts.what) + "</a>.</div>";
    });
  }

  function initHomeBoard(home, after) {
    var todayKey = (function () {
      var t = new Date();
      var mo = t.getMonth() + 1, d = t.getDate();
      return t.getFullYear() + "-" + (mo < 10 ? "0" : "") + mo + "-" + (d < 10 ? "0" : "") + d;
    })();

    var sec = document.createElement("section");
    sec.id = "bcl-home-board";
    sec.className = "bcl-section";
    sec.innerHTML = '<div class="bcl-wrap">' +
      '<div class="bcl-section-head"><div><p class="bcl-kicker">What changed since yesterday</p>' +
      "<h2>The local board</h2></div>" +
      '<p class="bcl-dim">Events, work, and places to live in the San Lorenzo Valley, refreshed daily with the source on every listing.</p></div>' +
      '<div class="bcl-board">' +
      boardColumnHTML("Happening next", "/events", "All events", "bcl-home-events") +
      boardColumnHTML("Recently added jobs", "/jobs", "All jobs", "bcl-home-jobs") +
      boardColumnHTML("Current rentals", "/rentals", "All rentals", "bcl-home-rentals") +
      "</div></div>";
    if (after && after.parentNode) after.parentNode.insertBefore(sec, after.nextSibling);
    else home.appendChild(sec);

    /* BCFD Summer BBQ & Dance promo band: flush against the top edge of this
       white section (owner, 2026-07-22). Self-expires after Aug 22, 2026. */
    if (Date.now() < Date.parse("2026-08-23T07:00:00Z") && !document.getElementById("bcl-promo-bbq") && sec.parentNode) {
      var promo = document.createElement("div");
      promo.id = "bcl-promo-bbq";
      promo.className = "bcl-promo-band";
      promo.innerHTML =
        '<div class="bcl-promo-inner">' +
        '<img class="bcl-promo-badge" src="' + REPO + '/promo/bcfd-badge.png" alt="">' +
        '<div class="bcl-promo-text">' +
        '<span class="bcl-promo-kicker">Boulder Creek Fire Department presents</span>' +
        '<span class="bcl-promo-title">Summer BBQ Dinner &amp; Dance</span>' +
        '<span class="bcl-promo-when">Saturday, <b>August 22</b> &middot; 5:30 to 11 p.m. &middot; $30 &middot; kids under 5 free</span>' +
        "</div>" +
        '<span class="bcl-promo-actions">' +
        '<a class="bcl-promo-btn" href="https://events.com/r/en_us/tickets/bcfd-summer-bbq-and-dance-boulder-creek-august-1064895" target="_blank" rel="noopener">Get Tickets</a>' +
        '<a class="bcl-promo-more" href="/around-town/bcvfd-summer-bbq-dance">Details</a>' +
        "</span></div>";
      sec.parentNode.insertBefore(promo, sec);
      loadPromoFont();
    }

    fillHomeSlot("bcl-home-events", "events.json", {
      key: "events", loading: "Loading events…", label: "The events calendar", href: "/events", what: "calendar",
      pick: function (rows) { return nextEvents(rows, todayKey, 3); },
      card: homeEventRow,
      empty: 'No verified upcoming events right now. Events appear here only after a person confirms the details with the organizer. <a href="/contact">Tell us about one</a>.'
    });
    fillHomeSlot("bcl-home-jobs", "jobs.json", {
      key: "jobs", loading: "Loading jobs…", label: "The jobs board", href: "/jobs", what: "jobs board",
      pick: function (rows) { return homeJobs(rows, 3); },
      card: homeJobRow,
      empty: 'No local job postings right now. <a href="/jobs">See remote and extended-commute roles</a>.'
    });
    fillHomeSlot("bcl-home-rentals", "rentals.json", {
      key: "rentals", loading: "Loading rentals…", label: "The rentals board", href: "/rentals", what: "rentals board",
      pick: function (rows) { return homeRentals(rows, 3); },
      card: homeRentalRow,
      empty: 'No San Lorenzo Valley rentals are listed right now. <a href="/contact">Suggest one</a>.'
    });

    return sec;
  }

  /* Homepage: add a visual "Latest from Around Town" strip, and fold the two
     redundant link-grid sections (plus the quick-links bar) into one Explore
     section. Runtime transform so the page code block stays untouched. */
  function initHome() {
    var home = document.getElementById("bcl-home");
    if (!home) return;
    /* The board and Around Town strips are appended, so a second run (a cached
       copy of this script, or a console-injected preview) would stack a duplicate
       of each. Clear our own prior work first. Explore is exempt: it replaces the
       static section it is built from, so it can never double. */
    ["bcl-home-board", "bcl-home-recent"].forEach(function (id) {
      var prior = document.getElementById(id);
      if (prior) prior.remove();
    });
    var sections = [].slice.call(home.querySelectorAll("section.bcl-section"));
    var usefulSec = sections.filter(function (s) {
      var k = s.querySelector(".bcl-kicker");
      return k && /useful today/i.test(k.textContent || "");
    })[0];
    var creamGrid = sections.filter(function (s) {
      return s.classList.contains("bcl-cream") && s.querySelector('a[href="/food"]') && s.querySelector('a[href="/visit"]');
    })[0];

    // The quick-links bar duplicates the Explore destinations; drop it.
    var strip = home.querySelector(".bcl-strip");
    if (strip) strip.remove();

    // Build the consolidated Explore section.
    var tiles = EXPLORE_TILES.map(function (t) {
      return '<a class="bcl-tile" href="' + t[3] + '">' +
        '<span class="bcl-tile-ico">' + exploreIcon(t[0]) + "</span>" +
        '<span class="bcl-tile-txt"><h3>' + esc(t[1]) + "</h3><p>" + esc(t[2]) + "</p></span></a>";
    }).join("");
    var exploreInner = '<div class="bcl-wrap"><div class="bcl-section-head"><div><p class="bcl-kicker">Everything in one place</p><h2>Explore Boulder Creek</h2></div><p class="bcl-dim">Local information without the scavenger hunt, with sources shown.</p></div><div class="bcl-explore">' + tiles + "</div></div>";

    var anchor = usefulSec || creamGrid;
    if (anchor) {
      var explore = document.createElement("section");
      explore.id = "bcl-home-explore";
      // Plain band: the live board above it already alternates into cream.
      explore.className = "bcl-section";
      explore.innerHTML = exploreInner;
      anchor.parentNode.replaceChild(explore, anchor);
    }
    if (creamGrid && creamGrid !== anchor) creamGrid.remove();

    /* Live board under the Today widget: events, jobs, rentals, then the latest
       Around Town posts. The homepage leads with what changed since yesterday. */
    var today = document.getElementById("bcl-today");
    var todaySec = today && today.closest("section");
    var lastBoardSec = todaySec ? initHomeBoard(home, todaySec) : null;

    var recent = document.createElement("section");
    recent.id = "bcl-home-recent";
    recent.className = "bcl-section bcl-cream";
    recent.innerHTML = '<div class="bcl-wrap"><div class="bcl-section-head"><div><p class="bcl-kicker">Fresh from the site</p><h2>Latest from Around Town</h2></div><a class="bcl-sec-viewall" href="/around-town">All articles &rarr;</a></div><div id="bcl-recent" class="bcl-recent"></div></div>';
    if (lastBoardSec && lastBoardSec.parentNode) {
      lastBoardSec.parentNode.insertBefore(recent, lastBoardSec.nextSibling);
    } else if (anchor && explore) {
      explore.parentNode.insertBefore(recent, explore);
    } else {
      home.appendChild(recent);
    }
    initRecentArticles(document.getElementById("bcl-recent"));
  }
  function initEvents(root) {
    root.innerHTML = '<div class="bcl-count">Loading events…</div>';
    fetchJSON(REPO + "/data/events.json").then(function (data) {
      var now = new Date();
      now.setHours(0, 0, 0, 0);
      var all = (data.events || []).filter(function (e) {
        var p = evParts(e.end || e.start);
        return p && new Date(p.y, p.mo - 1, p.d, 23, 59) >= now;
      });

      if (!all.length) {
        root.innerHTML =
          '<div class="bcl-unavailable">No verified upcoming events right now. Events appear here only after a person confirms the details with the organizer. ' +
          'Know of one? <a href="/contact">Tell us</a>.</div>';
        return;
      }

      var cats = [];
      all.forEach(function (e) { var c = e.category || "Community"; if (cats.indexOf(c) < 0) cats.push(c); });
      cats.sort();

      root.innerHTML =
        '<div class="bcl-range"><button data-r="all" class="bcl-on">All upcoming</button><button data-r="today">Today</button><button data-r="weekend">This weekend</button></div>' +
        '<div class="bcl-controls">' +
        '<input type="search" placeholder="Search events" aria-label="Search events">' +
        '<select class="bcl-ev-cat" aria-label="Filter by type"><option value="">All types</option>' +
        cats.map(function (c) { return "<option>" + esc(c) + "</option>"; }).join("") + "</select>" +
        '<select class="bcl-ev-sort" aria-label="Sort events"><option value="date">Soonest first</option><option value="name">Name A to Z</option><option value="type">By type</option></select>' +
        "</div>" +
        '<div class="bcl-count"></div><div class="bcl-event-grid"></div>' +
        '<div class="bcl-note">Details change. Confirm with the organizer before you go. <a href="/contact">Send a correction or add an event</a>.</div>';

      var input = root.querySelector("input");
      var catSel = root.querySelector(".bcl-ev-cat");
      var sortSel = root.querySelector(".bcl-ev-sort");
      var count = root.querySelector(".bcl-count");
      var grid = root.querySelector(".bcl-event-grid");
      var range = "all";
      var rangeBtns = [].slice.call(root.querySelectorAll(".bcl-range button"));

      function inRange(e) {
        if (range === "all") return true;
        var p = evParts(e.start);
        if (!p) return false;
        var d = new Date(p.y, p.mo - 1, p.d).getTime();
        var today = new Date(); today.setHours(0, 0, 0, 0);
        if (range === "today") return d === today.getTime();
        // weekend: upcoming (or current) Friday through Sunday, never before today
        var dow = today.getDay();
        var fri = new Date(today);
        if (dow === 6) fri.setDate(today.getDate() - 1);
        else if (dow === 0) fri.setDate(today.getDate() - 2);
        else fri.setDate(today.getDate() + (5 - dow));
        var sun = new Date(fri); sun.setDate(fri.getDate() + 2);
        var lo = Math.max(fri.getTime(), today.getTime());
        return d >= lo && d <= sun.getTime();
      }

      function render() {
        var q = (input.value || "").toLowerCase();
        var cat = catSel.value;
        var rows = all.filter(function (e) {
          if (!inRange(e)) return false;
          if (cat && (e.category || "Community") !== cat) return false;
          if (!q) return true;
          return (e.title + " " + (e.location || "") + " " + (e.description || "")).toLowerCase().indexOf(q) >= 0;
        });
        var mode = sortSel.value;
        rows.sort(function (a, b) {
          if (mode === "name") return a.title.localeCompare(b.title) || String(a.start).localeCompare(String(b.start));
          if (mode === "type") return (a.category || "").localeCompare(b.category || "") || String(a.start).localeCompare(String(b.start));
          return String(a.start).localeCompare(String(b.start));
        });
        count.textContent = rows.length + " OF " + all.length + " UPCOMING · UPDATED " + (data.updated || "");
        var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        function monthKey(e) {
          var p = evParts(e.start);
          return p ? MONTHS[p.mo - 1] + " " + p.y : "Undated";
        }
        if (mode === "date" && rows.length) {
          var html = "", lastKey = null;
          rows.forEach(function (e) {
            var k = monthKey(e);
            if (k !== lastKey) {
              if (lastKey !== null) html += "</div>";
              html += '<div class="bcl-cat-head"><h3>' + esc(k) + "</h3></div>" + '<div class="bcl-event-grid">';
              lastKey = k;
            }
            html += eventCard(e);
          });
          html += "</div>";
          grid.innerHTML = html;
          grid.className = "bcl-event-flow";
          return;
        }
        grid.className = "bcl-event-grid";
        grid.innerHTML = rows.length ? rows.map(eventCard).join("") : '<div class="bcl-unavailable">No events match. Try clearing the search or type filter.</div>';
      }
      rangeBtns.forEach(function (btn) {
        btn.addEventListener("click", function () {
          range = btn.getAttribute("data-r");
          rangeBtns.forEach(function (b) { b.className = b === btn ? "bcl-on" : ""; });
          render();
        });
      });
      input.addEventListener("input", render);
      catSel.addEventListener("change", render);
      sortSel.addEventListener("change", render);
      render();
    }).catch(function () {
      unavailable(root, "The events calendar", "");
    });
  }

  /* ---------- mountain status ---------- */

  function sirensLinks() {
    return '<h3>What was that siren?</h3>' +
      '<p style="font-size:.92rem;color:#1c2a26 !important;">These are the same official screens dispatchers feed. They tell you what the responders were sent to; they never replace official instructions.</p>' +
      '<ul class="bcl-links">' +
      '<li><a href="https://web.pulsepoint.org/?agencies=44020" target="_blank" rel="noopener">PulsePoint: Boulder Creek FPD live calls</a>: active and recent fire and medical calls with the units responding. Same feed on your phone via the <a href="https://www.pulsepoint.org/download" target="_blank" rel="noopener">PulsePoint Respond app</a> (follow Boulder Creek FPD).</li>' +
      '<li><a href="https://www.watchduty.org/" target="_blank" rel="noopener">Watch Duty</a>: nonprofit wildfire map with human-verified updates for Santa Cruz County.</li>' +
      '<li><a href="https://cad.chp.ca.gov/" target="_blank" rel="noopener">CHP live dispatch log</a>: pick the Monterey Communications Center for Highway 9 and 236 incidents.</li>' +
      '<li><a href="https://www2.santacruzcountyca.gov/SHF/CristaPublic/" target="_blank" rel="noopener">Sheriff calls-for-service lookup</a>: past calls by address (not live; some incident types excluded).</li>' +
      "</ul>" +
      '<p style="font-size:.85rem;color:#67716b !important;">Law enforcement calls generally are not shown live anywhere public. An empty feed means "not shown," not "nothing happening." For evacuation decisions, rely on <a href="https://www.cruzaware.org/" target="_blank" rel="noopener" style="color:#2e6b46 !important;">CruzAware</a> and official orders.</p>';
  }

  function aqiCategory(v) {
    if (v == null || isNaN(v)) return null;
    if (v <= 50) return "Good";
    if (v <= 100) return "Moderate";
    if (v <= 150) return "Unhealthy for sensitive groups";
    if (v <= 200) return "Unhealthy";
    if (v <= 300) return "Very unhealthy";
    return "Hazardous";
  }

  function fillAQI(el) {
    fetchJSON("https://air-quality-api.open-meteo.com/v1/air-quality?latitude=" + NWS_POINT.lat + "&longitude=" + NWS_POINT.lon + "&current=us_aqi,pm2_5&timezone=America%2FLos_Angeles")
      .then(function (d) {
        var c = d.current || {};
        var cat = aqiCategory(c.us_aqi);
        if (cat === null) throw new Error("no aqi");
        el.innerHTML =
          '<div class="bcl-name">Air quality: ' + esc(cat) + "</div>" +
          '<div class="bcl-sub">US AQI ' + Math.round(c.us_aqi) + (c.pm2_5 != null ? " · PM2.5 " + Math.round(c.pm2_5) + ' <span style="text-transform:none">µg/m³</span>' : "") + "</div>" +
          '<p>Modeled estimate for Boulder Creek from <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a>. During smoke events, confirm with the <a href="https://fire.airnow.gov/" target="_blank" rel="noopener">AirNow Fire and Smoke Map</a>, which uses ground monitors.</p>';
      })
      .catch(function () {
        el.innerHTML = '<div class="bcl-name">Air quality: unavailable</div><p>The estimate didn\'t load; that is not an all-clear. Check the <a href="https://fire.airnow.gov/" target="_blank" rel="noopener">AirNow Fire and Smoke Map</a>.</p>';
      });
  }

  function fillCaltrans(el) {
    var ROUTES = { "SR-9": 1, "SR-236": 1, "SR-35": 1, "SR-17": 1, "SR-1": 1 };
    fetchJSON("https://cwwp2.dot.ca.gov/data/d5/lcs/lcsStatusD05.json")
      .then(function (d) {
        /* Only "no rows in a feed we actually parsed" may render an all-clear.
           Any other shape has to fall through to the unavailable message. */
        if (!d || !Array.isArray(d.data)) throw new Error("unexpected feed shape");
        var rows = d.data.map(function (r) { return r.lcs; }).filter(function (l) {
          if (!l) return false;
          var b = (l.location || {}).begin || {};
          var c = l.closure || {};
          /* code1097/code1098 are objects, not strings. 1097 = closure in effect,
             1098 = closure finished, so active means 1097 set and 1098 not yet. */
          var active = (c.code1097 || {}).isCode1097 === "true" && (c.code1098 || {}).isCode1098 !== "true";
          return active && b.beginCounty === "Santa Cruz" && ROUTES[b.beginRoute];
        });
        var total = rows.length;
        rows = rows.slice(0, 6);
        var h = "";
        if (total) {
          h = '<div class="bcl-name">Caltrans closures on state highways: ' + total + "</div>";
          rows.forEach(function (l) {
            var b = l.location.begin, c = l.closure;
            /* estimatedDelay is bare minutes as a string; it also arrives as
               "Not Reported" or "0", neither of which is worth saying out loud. */
            var mins = parseInt(c.estimatedDelay, 10);
            var delay = mins > 0 ? ", est. delay " + mins + " min" : "";
            h += '<div class="bcl-meta">' + esc(b.beginRoute) + " near " + esc(b.beginNearbyPlace || b.beginLocationName || "?") + ": " +
              esc((c.typeOfClosure || "closure").toLowerCase()) + delay + "</div>";
          });
          if (total > rows.length) {
            h += '<div class="bcl-meta">Showing ' + rows.length + " of " + total + ". See QuickMap for the rest.</div>";
          }
        } else {
          h = '<div class="bcl-name">No active Caltrans closures reported</div><div class="bcl-meta">Highways 1, 9, 17, 35, and 236 in Santa Cruz County, per the Caltrans lane closure feed.</div>';
        }
        h += '<p>State highways only; county roads like Bear Creek and Jamison Creek are not in this feed. Check <a href="https://quickmap.dot.ca.gov/" target="_blank" rel="noopener">QuickMap</a> and the <a href="https://experience.arcgis.com/experience/09f637a4d84946edbb5aab283766c9de/" target="_blank" rel="noopener">county road dashboard</a> before you drive.</p>';
        el.innerHTML = h;
      })
      .catch(function () {
        el.innerHTML = '<div class="bcl-name">Road closures: feed unavailable</div><p>That is not an all-clear. Check <a href="https://quickmap.dot.ca.gov/" target="_blank" rel="noopener">Caltrans QuickMap</a> and the <a href="https://experience.arcgis.com/experience/09f637a4d84946edbb5aab283766c9de/" target="_blank" rel="noopener">county road dashboard</a>.</p>';
      });
  }

  function rightNowStatic() {
    return '<div class="bcl-card">' +
      '<div class="bcl-name">Power</div>' +
      '<div class="bcl-actionrow"><a href="https://pgealerts.alerts.pge.com/outage-tools/outage-map/" target="_blank" rel="noopener">See the 95006 outage map</a></div>' +
      '<div class="bcl-actionrow"><a href="https://www.pge.com/en/outages-and-safety/outage-preparedness-and-support/outage-alerts.html" target="_blank" rel="noopener">Get outage alerts for your address</a></div>' +
      '<div class="bcl-actionrow">Report an outage: <a href="tel:18007435002">1-800-743-5002</a></div>' +
      '<div class="bcl-meta">Downed line? Call 911 first, then PG&amp;E at 1-800-743-5000.</div></div>' +
      '<div class="bcl-card">' +
      '<div class="bcl-name">Sirens and smoke</div>' +
      '<div class="bcl-actionrow"><a href="https://web.pulsepoint.org/?agencies=44020" target="_blank" rel="noopener">See what the fire trucks are on: live BCFD calls</a></div>' +
      '<div class="bcl-actionrow"><a href="https://www.watchduty.org/" target="_blank" rel="noopener">Check for wildfire near you: Watch Duty</a></div>' +
      '<div class="bcl-actionrow"><a href="https://www.fire.ca.gov/incidents" target="_blank" rel="noopener">CAL FIRE incident list</a></div>' +
      '<div class="bcl-actionrow">Fire cameras near the valley: <a href="https://cameras.alertcalifornia.org/?id=Axis-Brookdale" target="_blank" rel="noopener">Brookdale</a> and <a href="https://cameras.alertcalifornia.org/?id=Axis-MtBielawski" target="_blank" rel="noopener">Mt. Bielawski</a> (ALERTCalifornia; steerable cameras for situational awareness, not an alert or all-clear)</div>' +
      '<div class="bcl-meta">Evacuation decisions come from <a href="https://www.cruzaware.org/" target="_blank" rel="noopener">CruzAware</a> and official orders only.</div></div>';
  }

  function initStatus(root) {
    root.innerHTML =
      '<div class="bcl-alert">If this is an emergency, call 911. This page links to official sources; it never replaces them.</div>' +
      '<h3>Right now</h3>' +
      '<div class="bcl-status-grid">' +
      '<div class="bcl-card bcl-aqi"><div class="bcl-count">Checking air quality…</div></div>' +
      '<div class="bcl-card bcl-roads"><div class="bcl-count">Checking Caltrans closures…</div></div>' +
      rightNowStatic() +
      "</div>" +
      '<div class="bcl-count" style="margin-top:10px;">LIVE ITEMS RETRIEVED WHEN YOU LOADED THIS PAGE · ' + esc(new Date().toLocaleString()) + "</div>" +
      '<div class="bcl-nws" style="margin-top:18px;"><div class="bcl-count">Checking National Weather Service…</div></div>' +
      sirensLinks();

    fillAQI(root.querySelector(".bcl-aqi"));
    fillCaltrans(root.querySelector(".bcl-roads"));

    var nwsRoot = root.querySelector(".bcl-nws");
    var pt = "https://api.weather.gov/points/" + NWS_POINT.lat + "," + NWS_POINT.lon;

    Promise.all([
      fetchJSON("https://api.weather.gov/alerts/active?point=" + NWS_POINT.lat + "," + NWS_POINT.lon),
      fetchJSON(pt).then(function (p) { return fetchJSON(p.properties.forecast); })
    ]).then(function (res) {
      var alerts = (res[0].features || []);
      var periods = ((res[1].properties || {}).periods || []).slice(0, 4);
      var h = "";
      if (alerts.length) {
        h += alerts.map(function (a) {
          var p = a.properties || {};
          return '<div class="bcl-alert"><strong>' + esc(p.event || "Weather alert") + "</strong>: " + esc(p.headline || "") +
            ' <a href="https://www.weather.gov/mtr/" target="_blank" rel="noopener">Details at weather.gov</a></div>';
        }).join("");
      } else {
        h += '<div class="bcl-count">NO ACTIVE NWS ALERTS FOR THIS POINT · CHECKED ' + esc(new Date().toLocaleString()) + "</div>";
      }
      if (periods.length) {
        h += "<h3>Forecast (NWS)</h3>" + periods.map(function (p) {
          return '<div class="bcl-card"><div class="bcl-name">' + esc(p.name) + "</div><p>" + esc(p.detailedForecast || p.shortForecast || "") + "</p></div>";
        }).join("");
      }
      h += '<div class="bcl-note">Source: <a href="https://www.weather.gov/mtr/" target="_blank" rel="noopener">National Weather Service</a>, retrieved when you loaded this page. If anything here looks stale, trust the official page.</div>';
      nwsRoot.innerHTML = h;
    }).catch(function () {
      unavailable(nwsRoot, "Live weather data", "Use the official sources below.");
    });
  }

  /* ---------- today module (home page) ---------- */

  function initToday(root) {
    var now = new Date();
    var days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    var mons = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    var stamp = days[now.getDay()] + " " + mons[now.getMonth()] + " " + now.getDate();
    root.innerHTML =
      '<div class="bcl-today">' +
      '<div class="bcl-today-head"><h2>Today in Boulder Creek</h2><span>' + stamp + "</span></div>" +
      '<div class="bcl-today-alerts"><div class="bcl-today-noalert">Checking National Weather Service alerts…</div></div>' +
      '<div class="bcl-today-row">' +
      '<div class="bcl-td-wx"><b>Weather</b>Checking…</div>' +
      '<div class="bcl-td-air"><b>Air</b>Checking…</div>' +
      "</div>" +
      '<div class="bcl-today-ev"><div>Checking the calendar…</div></div>' +
      '<div class="bcl-today-links"><a href="/events">Full calendar</a> &nbsp;·&nbsp; <a href="/mountain-status">Roads, power, and conditions</a></div>' +
      "</div>";

    var wx = root.querySelector(".bcl-td-wx");
    var air = root.querySelector(".bcl-td-air");
    var ev = root.querySelector(".bcl-today-ev");
    var al = root.querySelector(".bcl-today-alerts");

    /* Current conditions come from the hourly grid; the daily period supplies the
       high/low so the line reads as "right now, and where today is heading". */
    fetchJSON("https://api.weather.gov/points/" + NWS_POINT.lat + "," + NWS_POINT.lon)
      .then(function (p) {
        var props = p.properties || {};
        return Promise.all([
          fetchJSON(props.forecast),
          fetchJSON(props.forecastHourly).catch(function () { return null; })
        ]);
      })
      .then(function (res) {
        var p0 = ((res[0].properties || {}).periods || [])[0];
        var now = res[1] && ((res[1].properties || {}).periods || [])[0];
        if (!p0 && !now) throw new Error("no period");
        var lead = now
          ? esc(String(now.temperature)) + "° " + esc(now.shortForecast || "")
          : esc(p0.shortForecast || "");
        var trail = p0
          ? " · " + (p0.isDaytime ? "high" : "low") + " " + esc(String(p0.temperature)) + "°"
          : "";
        wx.innerHTML = "<b>Weather</b>" + lead + trail;
      }).catch(function () { wx.innerHTML = '<b>Weather</b><a href="https://www.weather.gov/mtr/" target="_blank" rel="noopener">weather.gov</a>'; });

    /* Active NWS alerts for the Boulder Creek point. An empty list is an explicit
       "none active as of <time>", and a failed fetch is never rendered as all-clear. */
    fetchJSON("https://api.weather.gov/alerts/active?point=" + NWS_POINT.lat + "," + NWS_POINT.lon)
      .then(function (d) {
        var feats = d.features || [];
        if (!feats.length) {
          al.innerHTML = '<div class="bcl-today-noalert">No active NWS alerts for Boulder Creek · checked ' + esc(new Date().toLocaleTimeString()) + "</div>";
          return;
        }
        al.innerHTML = feats.slice(0, 3).map(function (a) {
          var p = a.properties || {};
          return '<div class="bcl-alert"><strong>' + esc(p.event || "Weather alert") + "</strong> " + esc(p.headline || "") +
            ' <a href="https://www.weather.gov/mtr/" target="_blank" rel="noopener">Details at weather.gov</a></div>';
        }).join("");
      })
      .catch(function () {
        al.innerHTML = '<div class="bcl-today-noalert">NWS alerts are not loading. That is not an all-clear — check <a href="https://www.weather.gov/mtr/" target="_blank" rel="noopener">weather.gov</a>.</div>';
      });

    fetchJSON("https://air-quality-api.open-meteo.com/v1/air-quality?latitude=" + NWS_POINT.lat + "&longitude=" + NWS_POINT.lon + "&current=us_aqi&timezone=America%2FLos_Angeles")
      .then(function (d) {
        var v = (d.current || {}).us_aqi;
        var cat = aqiCategory(v);
        if (cat === null) throw new Error("no aqi");
        air.innerHTML = "<b>Air</b>" + esc(cat) + " (AQI " + Math.round(v) + ")";
      }).catch(function () { air.innerHTML = '<b>Air</b><a href="https://fire.airnow.gov/" target="_blank" rel="noopener">AirNow map</a>'; });

    fetchJSON(REPO + "/data/events.json").then(function (data) {
      var t = new Date(); t.setHours(0, 0, 0, 0);
      var todayKey = t.getFullYear() + "-" + (t.getMonth() < 9 ? "0" : "") + (t.getMonth() + 1) + "-" + (t.getDate() < 10 ? "0" : "") + t.getDate();
      var upcoming = (data.events || []).filter(function (e) {
        var p = evParts(e.end || e.start);
        return p && new Date(p.y, p.mo - 1, p.d, 23, 59) >= t;
      }).sort(function (a, b) { return String(a.start).localeCompare(String(b.start)); });
      var todays = upcoming.filter(function (e) { return String(e.start).slice(0, 10) === todayKey; }).slice(0, 3);
      if (todays.length) {
        ev.innerHTML = todays.map(function (e) {
          return "<div><span>" + evDateChip(e.start).replace(/^[A-Z]{3} [A-Z]{3} \d+( · )?/, "") + (evParts(e.start).h == null ? "TODAY" : "") + "</span>" + esc(e.title) + (e.location ? " · " + esc(String(e.location).split(",")[0]) : "") + "</div>";
        }).join("");
      } else if (upcoming.length) {
        var n = upcoming[0];
        ev.innerHTML = "<div><span>NEXT · " + evDateChip(n.start) + "</span>" + esc(n.title) + (n.location ? " · " + esc(String(n.location).split(",")[0]) : "") + "</div>";
      } else {
        ev.innerHTML = "<div>No verified upcoming events on the calendar.</div>";
      }
    }).catch(function () { ev.innerHTML = '<div><a href="/events">See the calendar</a></div>'; });
  }

  /* ---------- thumbnail alt text ----------
     Squarespace has no asset-level alt field, so blog-list / related-post featured
     images fall back to the filename (slug.jpg) as their alt. Since these are title
     cards (headline baked into the image) shown as image-only links, rewrite those
     filename-alts to a readable title derived from the slug. Self-maintaining. */

  function prettifySlug(slug) {
    var low = { of: 1, the: 1, and: 1, a: 1, to: 1, "in": 1, on: 1, by: 1, "for": 1, with: 1, at: 1 };
    var up = { slv: "SLV", bcvfd: "BCVFD", bcfd: "BCFD" };
    var cap = { san: "San", lorenzo: "Lorenzo" };
    return slug.split("-").map(function (w, i) {
      var lw = w.toLowerCase();
      if (up[lw]) return up[lw];
      if (cap[lw]) return cap[lw];
      if (low[lw] && i > 0) return lw;
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join(" ");
  }

  function fixThumbAlts() {
    var imgs = document.querySelectorAll("img[alt]");
    for (var k = 0; k < imgs.length; k++) {
      var im = imgs[k];
      if (im.id === "bcl-article-header") continue;
      var m = (im.getAttribute("alt") || "").match(/^([a-z0-9]+(?:-[a-z0-9]+)+)\.(jpg|jpeg|png)$/i);
      if (m && (im.src || "").indexOf("squarespace-cdn") > -1) {
        im.setAttribute("alt", prettifySlug(m[1].toLowerCase()));
      }
    }
  }

  function initThumbAlts() {
    fixThumbAlts();
    [400, 1200, 3000].forEach(function (ms) { setTimeout(fixThumbAlts, ms); });
    if (typeof MutationObserver !== "undefined") {
      var pending = false;
      new MutationObserver(function () {
        if (pending) return;
        pending = true;
        setTimeout(function () { pending = false; fixThumbAlts(); }, 300);
      }).observe(document.body, { childList: true, subtree: true });
    }
  }

  /* ---------- boot ---------- */

  function loadPromoFont() {
    if (document.getElementById("bcl-promo-font")) return;
    var fl = document.createElement("link");
    fl.id = "bcl-promo-font";
    fl.rel = "stylesheet";
    fl.href = "https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&display=swap";
    document.head.appendChild(fl);
  }

  /* Site-wide one-line ticker above the header for the BBQ (owner, 2026-07-22).
     Never on /mountain-status (no event promos above safety info), never in
     addition to itself, self-expires after Aug 22, 2026. */
  function initPromoTicker() {
    if (Date.now() >= Date.parse("2026-08-23T07:00:00Z")) return;
    if (location.pathname.indexOf("/mountain-status") === 0) return;
    if (document.getElementById("bcl-ticker-bbq")) return;
    var bar = document.createElement("a");
    bar.id = "bcl-ticker-bbq";
    bar.className = "bcl-ticker";
    bar.href = "https://events.com/r/en_us/tickets/bcfd-summer-bbq-and-dance-boulder-creek-august-1064895";
    bar.target = "_blank";
    bar.rel = "noopener";
    bar.innerHTML = 'BCFD Summer BBQ &amp; Dance &middot; Sat, <b>Aug 22</b> &middot; 5:30 to 11 p.m. &middot; <u>Get tickets</u>';
    document.body.insertBefore(bar, document.body.firstChild);
    loadPromoFont();
  }

  function boot() {
    legacyFullWidthFallback();
    injectCSS();
    repairKnownLinks();
    repairEmbedScaffolding();
    repairStatusPage();
    repairResidentsPage();
    repairPageHeadings();
    initArticleHeader();
    initArticleContent();
    initRelatedArticles();
    initThumbAlts();
    var d = document.getElementById("bcl-directory");
    if (d) initListings(d, "directory.json", "directory");
    var f = document.getElementById("bcl-food");
    if (f) initListings(f, "food.json", "food and drink");
    var e = document.getElementById("bcl-events");
    if (e) initEvents(e);
    var s = document.getElementById("bcl-status");
    if (s) initStatus(s);
    initPromoTicker();
    if (document.getElementById("bcl-home")) initHome();
    var t = document.getElementById("bcl-today");
    if (t) initToday(t);
    var j = document.getElementById("bcl-jobs");
    if (j) initJobs(j);
    var rn = document.getElementById("bcl-rentals");
    if (rn) initRentals(rn);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { isLocal: isLocal, localityRank: localityRank, arrangeListings: arrangeListings, orderedCategoryNames: orderedCategoryNames, groupLabelOf: groupLabelOf, buildDirectoryHTML: buildDirectoryHTML, buildCategoryOptions: buildCategoryOptions, CAP_EXEMPT: CAP_EXEMPT, jobTab: jobTab, filterJobs: filterJobs, jobSalaryText: jobSalaryText, jobCard: jobCard, filterRentals: filterRentals, rentalCard: rentalCard, articleSlugFromPath: articleSlugFromPath, pageHeadingForPath: pageHeadingForPath, nextEvents: nextEvents, homeJobs: homeJobs, homeRentals: homeRentals, homeEventRow: homeEventRow, homeJobRow: homeJobRow, homeRentalRow: homeRentalRow, pickRelatedArticles: pickRelatedArticles, articleCardHTML: articleCardHTML };
  }
})();
