/* Boulder Creek Local — embedded tools (GitHub + jsDelivr, no app server).
 * Renders into whichever of these divs exists on the page:
 *   #bcl-directory  #bcl-food  #bcl-events  #bcl-status  #bcl-rain
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
    ["Health & Personal", ["Health & Wellness", "Sports & Fitness", "Beauty", "Pets & Animals", "Florists"]],
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

  /* ---------- directory: where a listing is, and who it serves ----------
     Two different facts that were previously both invisible. The reader had to
     infer location from the address line and the section it sat in, which does
     not survive a search that flattens the tiers.

     The badge carries LOCATION only, because it is the fact we have for every
     one of the 318 listings. Service area is free text with 103 distinct values
     and 65 blanks, so it cannot carry a badge; it gets its own line when it
     says Boulder Creek and the business is somewhere else. */
  var SLV_LOCALITIES = ["Brookdale", "Ben Lomond", "Lompico", "Zayante", "Felton", "San Lorenzo Valley"];

  function servesBoulderCreek(l) {
    return !!(l && /boulder creek/i.test(l.service_area || ""));
  }
  /* True only when the fact is not already obvious from the badge. */
  function showsServesBoulderCreek(l) {
    return !!(l && l.locality !== "Boulder Creek" && servesBoulderCreek(l));
  }
  function listingBadge(l) {
    if (!l) return "";
    var loc = l.locality || "";
    if (loc === "Boulder Creek") {
      /* Owner policy: these trades work from home and publish no address, so
         say they are based here rather than implying a storefront to visit. */
      return l.no_storefront ? "Boulder Creek based, mobile" : "In Boulder Creek";
    }
    if (SLV_LOCALITIES.indexOf(loc) >= 0) return "In the San Lorenzo Valley";
    if (loc === "Scotts Valley") return "In Scotts Valley";
    /* Essential and civic services are useful regardless of distance, and the
       category list that already encodes that is CAP_EXEMPT. Badging a county
       crisis line "Outside the valley" would be true and useless. */
    if (CAP_EXEMPT.indexOf(l.category) >= 0) return "Countywide service";
    /* The ridge wineries carry a Los Gatos mailing address but are local. */
    if (isLocal(l)) return "In the Santa Cruz Mountains";
    return "Outside the valley";
  }
  function badgeIsBoulderCreek(l) {
    return l && l.locality === "Boulder Creek";
  }
  /* A maps link, only where there is a real published address. Every
     no_storefront listing carries address null and no coordinates, so this
     cannot leak a home address; keep the address check rather than trusting
     the flag alone. */
  function directionsUrl(l) {
    if (!l || l.no_storefront || !l.address) return "";
    var dest = l.address + (l.locality ? ", " + l.locality : "") + ", CA";
    return "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(dest);
  }

  /* ---------- shared ---------- */

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var CSS_ID = "bcl-tools-css-v7";
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
      /* The unavailable state's escape links carry brand link colour like every
         other tool link. Without this they fell through to the browser default. */
      ".bcl-unavailable a{color:#2e6b46 !important;text-decoration:underline;}",
      ".bcl-alert{background:#8f4f45 !important;color:#fffdf8 !important;padding:14px 18px;margin:0 0 14px;}",
      ".bcl-promo-band{width:100vw;margin:0 calc(50% - 50vw);background:linear-gradient(160deg,#1C4266 0%,#14304C 70%);border-top:1px solid #0d2438;border-bottom:1px solid #0d2438;}",
      /* box-sizing is REQUIRED here: this page has no global border-box reset
         (exactly one such rule in the served CSS), so width:100% plus 14px of
         horizontal padding overflowed the viewport and put a horizontal
         scrollbar on EVERY page, not just the tool pages. */
      ".bcl-ticker{display:block;width:100%;box-sizing:border-box;background:#14304C;color:#FCF8EF !important;font-family:'Oswald','IBM Plex Mono',sans-serif;font-size:.78rem;font-weight:600;letter-spacing:.16em;text-transform:uppercase;text-align:center;padding:9px 14px;text-decoration:none !important;border-bottom:2px solid #C3281C;}",
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
      ".bcl-search-btn{background:none;border:0;padding:6px;margin-left:10px;cursor:pointer;color:#173f36;display:inline-flex;align-items:center;align-self:center;}",
      ".bcl-search-btn svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;}",
      ".bcl-search-btn:hover{color:#d56e47;}",
      ".bcl-search-btn--fixed{position:fixed;bottom:22px;right:22px;z-index:9998;background:#173f36;color:#fffdf8;border:0;border-radius:999px;height:52px;padding:0 20px 0 17px;gap:9px;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,.22);font-family:'IBM Plex Mono',monospace;font-size:.72rem;letter-spacing:.09em;text-transform:uppercase;}",
      ".bcl-search-btn--fixed:hover{background:#d56e47;color:#fffdf8;}",
      ".bcl-search-btn--fixed svg{width:19px;height:19px;}",
      "@media (max-width:600px){.bcl-search-btn--fixed{bottom:16px;right:16px;height:48px;width:48px;padding:0;}.bcl-search-btn--fixed .bcl-search-btn-label{display:none;}}",
      ".bcl-search-overlay{position:fixed;inset:0;z-index:99999;background:rgba(13,44,38,.55);display:flex;justify-content:center;align-items:flex-start;padding:8vh 16px 16px;}",
      ".bcl-search-panel{background:#fffdf8 !important;border:1px solid #e3ddcf;width:100%;max-width:640px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 18px 50px rgba(0,0,0,.28);}",
      ".bcl-search-bar{display:flex;gap:8px;padding:12px;border-bottom:1px solid #e3ddcf;}",
      ".bcl-search-input{flex:1;font-size:1rem;padding:10px 12px;border:1px solid #e3ddcf;background:#fff !important;color:#1c2a26 !important;}",
      ".bcl-search-close{background:none;border:1px solid #e3ddcf;padding:0 12px;cursor:pointer;color:#67716b !important;font-size:.8rem;}",
      ".bcl-search-results{overflow-y:auto;padding:6px 0 10px;}",
      ".bcl-search-group{font-family:'IBM Plex Mono',monospace;font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;color:#67716b !important;margin:12px 14px 4px !important;}",
      ".bcl-search-hit{display:block;padding:8px 14px;text-decoration:none !important;border-left:3px solid transparent;}",
      ".bcl-search-hit strong{display:block;color:#173f36 !important;font-size:.95rem;font-weight:600;}",
      ".bcl-search-hit span{display:block;color:#67716b !important;font-size:.8rem;line-height:1.35;margin-top:2px;}",
      ".bcl-search-hit:hover,.bcl-search-hit.is-active{background:#f5f1e7 !important;border-left-color:#d56e47;}",
      ".bcl-search-hint{padding:18px 14px;color:#67716b !important;font-size:.88rem;}",
      ".bcl-search-hint a{color:#2e6b46 !important;text-decoration:underline;}",
      "@media (max-width:600px){.bcl-search-overlay{padding:0;}.bcl-search-panel{max-width:none;max-height:100vh;height:100vh;}}",
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
      ".bcl-dir-badge{display:inline-block;font-family:'IBM Plex Mono',monospace;font-size:.58rem;letter-spacing:.06em;text-transform:uppercase;border:1px solid #cfd8d0;border-radius:999px;padding:2px 8px;margin-top:4px;color:#3d5a4b !important;white-space:nowrap;}",
      ".bcl-dir-badge.is-bc{border-color:#2e6b46;color:#2e6b46 !important;background:#eef4ef;}",
      ".bcl-dir-serves{font-size:.78rem;color:#3d5a4b !important;line-height:1.35;}",
      ".bcl-dir-licence{font-family:'IBM Plex Mono',monospace;font-size:.62rem;letter-spacing:.02em;line-height:1.4;color:#67716b !important;padding-top:4px;}",
      ".bcl-dir-verified{font-family:'IBM Plex Mono',monospace;font-size:.58rem;letter-spacing:.06em;color:#67716b !important;margin-top:auto;padding-top:6px;}",
      ".bcl-dir-flag{font-family:'IBM Plex Mono',monospace;font-size:.58rem;letter-spacing:.06em;color:#8a8578 !important;padding-top:4px;}",
      ".bcl-filter-note,.bcl-open-note{font-size:.8rem;color:#67716b !important;margin:0 0 14px;max-width:70ch;line-height:1.45;}",
      ".bcl-filter-note:empty,.bcl-open-note:empty{margin:0;}",
      ".bcl-daterange{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0 0 14px;font-size:.82rem;color:#67716b !important;}",
      ".bcl-daterange label{display:flex;align-items:center;gap:6px;}",
      ".bcl-daterange input{font-family:Inter,Arial,sans-serif;font-size:.85rem;padding:7px 10px;border:1px solid #cfc9b8;background:#fffdf8 !important;color:#1c2a26 !important;}",
      ".bcl-daterange button{font-family:'IBM Plex Mono',monospace;font-size:.66rem;letter-spacing:.08em;text-transform:uppercase;padding:7px 12px;border:1px solid #cfc9b8;background:#fffdf8 !important;color:#67716b !important;cursor:pointer;}",
      ".bcl-daterange button:hover{border-color:#173f36;color:#173f36 !important;}",
      ".bcl-ics{font-family:'IBM Plex Mono',monospace;font-size:.62rem;letter-spacing:.08em;text-transform:uppercase;padding:6px 10px;border:1px solid #cfc9b8;background:#fffdf8 !important;color:#2e6b46 !important;cursor:pointer;align-self:flex-start;}",
      ".bcl-ics:hover{border-color:#2e6b46;}",
      ".bcl-river-rows{display:flex;flex-wrap:wrap;gap:6px 20px;margin:6px 0;}",
      ".bcl-river-rows div b{display:block;font-family:'IBM Plex Mono',monospace;font-size:.62rem;letter-spacing:.09em;text-transform:uppercase;color:#67716b !important;font-weight:500;}",
      ".bcl-river-rows div span{font-size:1.15rem;color:#173f36 !important;}",
      ".bcl-river-cats{font-size:.8rem;color:#67716b !important;line-height:1.5;margin:6px 0 0;}",
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
      /* Homepage rainfall card. Deliberately a LINK, so the whole band is one
         target, and deliberately number-first: "44.97 in" is the reason to
         click, where a tile reading "Rain" is not. */
      /* box-sizing is MANDATORY, same trap as .bcl-ticker: this site has no
         global border-box reset, so a width:auto block plus 44px of padding and
         5px of border lands OUTSIDE the parent content box. Harmless at desktop
         where .bcl-wrap has padding to spare, but on a ~380px phone it totals
         ~386px and puts a horizontal scrollbar on the homepage. */
      ".bcl-raincard{box-sizing:border-box;display:flex;align-items:baseline;flex-wrap:wrap;gap:6px 26px;background:#fffdf8;border:1px solid #e3ddcf;border-left:4px solid #2a7d55;padding:18px 22px;text-decoration:none !important;color:inherit !important;}",
      ".bcl-raincard:hover{background:#fbf8ef;}",
      ".bcl-raincard-lab{font-family:'IBM Plex Mono',monospace;font-size:.62rem;letter-spacing:.09em;text-transform:uppercase;color:#67716b !important;flex:0 0 100%;}",
      ".bcl-raincard-val{font-size:1.7rem;line-height:1.1;color:#173f36 !important;font-variant-numeric:tabular-nums;}",
      ".bcl-raincard-note{font-size:.86rem;color:#67716b !important;line-height:1.4;flex:1 1 240px;}",
      ".bcl-raincard-go{font-size:.85rem;font-weight:600;color:#2e6b46 !important;white-space:nowrap;}",
      "@media (max-width:600px){.bcl-raincard-go{flex:0 0 100%;}}",
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
      ".bcl-alerts{background:#f5f1e7 !important;border:1px solid #e3ddcf;border-top:3px solid #bc5937;padding:16px 18px;margin:0 0 18px;}",
      ".bcl-alerts h3{font-family:'IBM Plex Mono',monospace;font-size:.72rem !important;letter-spacing:.08em;text-transform:uppercase;color:#173f36 !important;margin:0 0 6px !important;}",
      ".bcl-alerts p{margin:0 0 12px;font-size:.9rem;color:#1c2a26 !important;}",
      ".bcl-alerts form{display:flex;flex-wrap:wrap;gap:8px;margin:0;}",
      ".bcl-alerts input[type=email]{flex:1 1 240px;min-width:0;font-family:Inter,Arial,sans-serif;font-size:.95rem;padding:10px 14px;border:1px solid #cfc9b8;border-radius:0;background:#fffdf8 !important;color:#1c2a26 !important;}",
      ".bcl-alerts button{flex:0 0 auto;font-family:'IBM Plex Mono',monospace;font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;padding:10px 20px;border:1px solid #bc5937;border-radius:0;background:#bc5937 !important;color:#fffdf8 !important;cursor:pointer;}",
      ".bcl-alerts button:hover{background:#a84c30 !important;border-color:#a84c30;}",
      ".bcl-alerts button[disabled]{opacity:.6;cursor:default;}",
      ".bcl-alerts-msg{margin:10px 0 0;font-size:.88rem;color:#1c2a26 !important;}",
      ".bcl-alerts-msg.bcl-bad{color:#8f3a2b !important;}",
      "@media (max-width:640px){.bcl-alerts form{flex-direction:column;}.bcl-alerts input[type=email],.bcl-alerts button{flex:0 0 auto;width:100%;}}",
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
      ".bcl-draft-state{max-width:760px;margin:18px auto 42px;background:#f5f1e7;border:1px solid #e3ddcf;padding:18px 20px;font-family:Inter,Arial,sans-serif;color:#4f5e57;}",
      /* #bcl-rain carries .bcl-full so it breaks out of the Fluid Engine grid,
         same as every other tool page. On /directory that is right: a card grid
         fills the band. /rain is a READING page, and its own prose already caps
         at 80ch in three places below, so the breakout left body text running
         the full window while both charts stayed 860px and looked stranded.
         Re-impose the site content measure on the tool only. The id beats
         .bcl-full{margin-left:0;width:100%} on specificity, no !important
         needed. Values mirror .bcl-wrap in the header injection. */
      "#bcl-rain{max-width:1180px;margin-left:auto;margin-right:auto;padding-left:clamp(22px,5vw,64px);padding-right:clamp(22px,5vw,64px);box-sizing:border-box;}",
      ".bcl-rain-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:16px 0 0;}",
      ".bcl-rain-tile{background:#fffdf8 !important;border:1px solid #e3ddcf;padding:14px 16px;display:flex;flex-direction:column;gap:3px;}",
      ".bcl-rain-tile-label{font-family:'IBM Plex Mono',monospace;font-size:.62rem;letter-spacing:.09em;text-transform:uppercase;color:#67716b !important;}",
      ".bcl-rain-tile-value{font-size:1.6rem;line-height:1.1;color:#173f36 !important;font-variant-numeric:tabular-nums;}",
      ".bcl-rain-tile-note{font-size:.78rem;color:#67716b !important;line-height:1.35;}",
      ".bcl-rain-gap{max-width:80ch;}",
      ".bcl-rain-src{font-size:.82rem;color:#67716b !important;max-width:80ch;margin:6px 0 0;line-height:1.5;}",
      ".bcl-rain-src a{color:#2e6b46 !important;}",
      ".bcl-rain-chart{margin:6px 0 4px;overflow-x:auto;}",
      /* Below about 760px the chart would shrink its axis text to 7px, so it
         scrolls inside its own container instead. The page body never scrolls
         sideways; only the chart does. */
      ".bcl-rain-chart svg{min-width:720px;}",
      ".bcl-rain-key{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:.8rem;color:#1c2a26 !important;margin:0 0 6px;}",
      ".bcl-rain-key span{display:inline-flex;align-items:center;gap:7px;}",
      ".bcl-rain-key i{display:inline-block;width:18px;height:12px;flex:0 0 18px;}",
      ".bcl-rain-sw-line{height:0 !important;border-top:2px solid #2a7d55;}",
      ".bcl-rain-sw-med{height:0 !important;border-top:1px solid #67716b;}",
      ".bcl-rain-sw-b50{background:#d9d4c2;}",
      ".bcl-rain-sw-b90{background:#eae6d8;}",
      ".bcl-rain-controls{display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px 16px;margin:14px 0 10px;}",
      ".bcl-rain-field{display:flex;flex-direction:column;gap:5px;flex:0 1 auto;order:1;}",
      ".bcl-rain-field label{font-family:'IBM Plex Mono',monospace;font-size:.62rem;letter-spacing:.09em;text-transform:uppercase;color:#67716b !important;}",
      ".bcl-rain-field select{font-family:Inter,Arial,sans-serif;font-size:.95rem;padding:9px 12px;border:1px solid #cfc9b8;background:#fffdf8 !important;color:#1c2a26 !important;max-width:100%;}",
      ".bcl-rain-msg{flex:0 0 100%;order:9;margin:0;font-size:.88rem;color:#1c2a26 !important;line-height:1.5;max-width:80ch;}",
      ".bcl-rain-msg:empty{display:none;}",
      ".bcl-rain-two{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin:12px 0 0;}",
      ".bcl-rain-table{border-collapse:collapse;width:100%;font-size:.86rem;margin:8px 0 0;}",
      ".bcl-rain-table caption{text-align:left;font-size:.8rem;color:#67716b !important;padding:0 0 6px;line-height:1.45;}",
      ".bcl-rain-table th,.bcl-rain-table td{border:1px solid #e3ddcf;padding:6px 10px;text-align:left;color:#1c2a26 !important;font-variant-numeric:tabular-nums;}",
      ".bcl-rain-table thead th{font-family:'IBM Plex Mono',monospace;font-size:.62rem;letter-spacing:.08em;text-transform:uppercase;color:#67716b !important;font-weight:500;}",
      ".bcl-rain-table tbody th{font-weight:600;}",
      ".bcl-rain-flag{font-family:'IBM Plex Mono',monospace;font-size:.58rem;letter-spacing:.06em;text-transform:uppercase;color:#8f4f45 !important;display:block;font-weight:500;}",
      ".bcl-rain-details{margin:8px 0 0;}",
      ".bcl-rain-details summary{font-family:'IBM Plex Mono',monospace;font-size:.66rem;letter-spacing:.08em;text-transform:uppercase;color:#2e6b46 !important;cursor:pointer;}",
      ".bcl-rain-details[open] summary{margin-bottom:6px;}",
      "@media (max-width:600px){.bcl-rain-field,.bcl-rain-field select{flex:1 1 100%;width:100%;}}"
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

  /* ---------- dates shared by every tool ---------- */

  var MON_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  /* Local calendar day as YYYY-MM-DD. ISO day keys compare correctly as
     strings, which is what the range filters rely on. */
  function todayKey(now) {
    var t = now || new Date();
    return t.getFullYear() + "-" + pad2(t.getMonth() + 1) + "-" + pad2(t.getDate());
  }

  function dayKeyToUTC(key) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(key == null ? "" : key));
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
  }

  /* Whole days from dateKey to todayKey. Negative means the date is ahead of
     today, which happens when a source posts with a future date. */
  function dayAge(dateKey, today) {
    var a = dayKeyToUTC(dateKey), b = dayKeyToUTC(today || todayKey());
    if (a == null || b == null) return null;
    return Math.round((b - a) / 86400000);
  }

  /* Month-year granularity: a listing verified on the 15th is not more
     trustworthy on the 16th, and a day-precise stamp implies it is. */
  function monthYear(dateKey) {
    var m = /^(\d{4})-(\d{2})/.exec(String(dateKey == null ? "" : dateKey));
    if (!m) return "";
    var mo = +m[2];
    if (mo < 1 || mo > 12) return "";
    return MON_SHORT[mo - 1] + " " + m[1];
  }

  /* A count line used to read "UPDATED " with nothing after it whenever a feed
     shipped without a stamp, and would happily print a stamp from months ago.
     Both are worse than saying nothing, so an unparseable or stale date prints
     no claim at all rather than a claim the reader has to discount. */
  var STAMP_MAX_AGE_DAYS = 45;
  function updatedSuffix(stamp, today) {
    var age = dayAge(stamp, today);
    if (age == null || age > STAMP_MAX_AGE_DAYS) return "";
    return " · UPDATED " + stamp;
  }

  /* ---------- listings (directory + food) ---------- */

  /* Opening-hours parsing, deliberately strict.
     hours_text is written for people, so plenty of it is honest but not
     machine-readable: "by appointment", "See school calendar", "Winter:
     Tuesday-Thursday ...". The parser accepts only the shapes it can be sure
     of and returns null for everything else. null never removes a listing from
     the results; it only means we cannot say whether the door is open, and the
     card says so. Hiding a business that is in fact open is a worse failure
     than showing one that is closed. */

  var DAY_INDEX = {
    sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2,
    wednesday: 3, wed: 3, weds: 3, thursday: 4, thu: 4, thur: 4, thurs: 4,
    friday: 5, fri: 5, saturday: 6, sat: 6
  };
  /* Words that make an hours line conditional. Any of them and we do not
     pretend to know the schedule, even if the rest of the line parses. */
  var HOURS_QUALIFIERS = /\b(appointment|varies|vary|seasonal|weather|call|see|sunset|dusk|dawn|approximate|approximately|typically|usually|generally|depending|holiday|holidays|winter|summer|spring|autumn|check)\b/;

  function normalizeHoursText(text) {
    return String(text == null ? "" : text)
      .toLowerCase()
      .replace(/[–—]/g, "-")
      .replace(/a\.m\./g, "am")
      .replace(/p\.m\./g, "pm")
      .replace(/\bnoon\b/g, "12pm")
      .replace(/\bmidnight\b/g, "12am")
      .replace(/\s+to\s+/g, "-")
      .replace(/\s*-\s*/g, "-")
      .replace(/\s+/g, " ")
      .replace(/(\d)\s+(am|pm)/g, "$1$2")
      .trim()
      .replace(/\.$/, "");
  }

  function parseClock(token, fallbackMeridiem) {
    var m = /^(\d{1,2})(?::(\d{2}))?(am|pm)?$/.exec(token);
    if (!m) return null;
    var h = +m[1], mi = m[2] ? +m[2] : 0;
    var mer = m[3] || fallbackMeridiem;
    if (mi > 59) return null;
    if (mer) {
      if (h < 1 || h > 12) return null;
      if (mer === "am") h = h === 12 ? 0 : h;
      else h = h === 12 ? 12 : h + 12;
    } else if (h > 23) return null;
    return { min: h * 60 + mi, hadMeridiem: !!m[3] };
  }

  /* "4:00-7:00 pm" only marks the end, so an unmarked start borrows the end's
     meridiem and flips when that ordering is impossible ("8-5pm" is 8am-5pm). */
  function parseTimeRange(text) {
    var parts = text.split("-");
    if (parts.length !== 2) return null;
    var endMer = (/(am|pm)$/.exec(parts[1]) || [])[1] || null;
    var end = parseClock(parts[1], null);
    var start = parseClock(parts[0], endMer);
    if (!start || !end) return null;
    if (!start.hadMeridiem && endMer && start.min >= end.min) {
      start.min = (start.min + 720) % 1440;
    }
    var e = end.min;
    if (e <= start.min) e += 1440;          /* closes after midnight */
    return { s: start.min, e: e };
  }

  function parseDayList(text) {
    var out = [];
    var chunks = text.split(/,| and /);
    for (var i = 0; i < chunks.length; i++) {
      var chunk = chunks[i].trim();
      if (!chunk) continue;
      if (chunk === "daily" || chunk === "every day" || chunk === "everyday") {
        return [0, 1, 2, 3, 4, 5, 6];
      }
      var range = chunk.split("-");
      if (range.length === 2) {
        var a = DAY_INDEX[range[0].trim()], b = DAY_INDEX[range[1].trim()];
        if (a == null || b == null) return null;
        for (var d = a; ; d = (d + 1) % 7) {
          out.push(d);
          if (d === b) break;
        }
        continue;
      }
      var one = DAY_INDEX[chunk];
      if (one == null) return null;
      out.push(one);
    }
    return out.length ? out : null;
  }

  function parseHours(text) {
    var norm = normalizeHoursText(text);
    if (!norm) return null;
    if (/^[a-z ]*24\s*\/\s*7(\s*\/\s*365)?[a-z ]*$/.test(norm)) return { always: true, intervals: [] };
    if (HOURS_QUALIFIERS.test(norm)) return null;

    var segments = norm.split(";");
    var intervals = [];
    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i].trim();
      if (!seg) continue;
      var split = /^(.+?) (closed|\d.*)$/.exec(seg);
      if (!split) return null;
      var days = parseDayList(split[1].trim());
      if (!days) return null;
      if (split[2] === "closed") continue;          /* stated closures add nothing */
      var ranges = split[2].split(" and ");
      for (var r = 0; r < ranges.length; r++) {
        var span = parseTimeRange(ranges[r].trim());
        if (!span) return null;
        for (var d = 0; d < days.length; d++) {
          intervals.push({ d: days[d], s: span.s, e: span.e });
        }
      }
    }
    return intervals.length ? { always: false, intervals: intervals } : null;
  }

  function isOpenAt(parsed, when) {
    if (!parsed) return false;
    if (parsed.always) return true;
    var now = when || new Date();
    var day = now.getDay();
    var minutes = now.getHours() * 60 + now.getMinutes();
    for (var i = 0; i < parsed.intervals.length; i++) {
      var iv = parsed.intervals[i];
      if (iv.d === day && minutes >= iv.s && minutes < iv.e) return true;
      /* an interval that runs past midnight still covers the early hours of
         the following day */
      if (iv.e > 1440 && iv.d === (day + 6) % 7 && minutes + 1440 < iv.e) return true;
    }
    return false;
  }

  /* "open", "closed", or "unknown". Only "closed" may be filtered out. */
  function listingOpenState(listing, when) {
    var parsed = parseHours(listing && listing.hours_text);
    if (!parsed) return "unknown";
    return isOpenAt(parsed, when) ? "open" : "closed";
  }

  function listingCard(l, opts) {
    var h = '<div class="bcl-dir-card">';
    var tile = l.tile
      ? '<img class="bcl-dir-tile" src="' + REPO + "/brand/listings/" + esc(l.tile) + '" alt="" loading="lazy">'
      : '<div class="bcl-dir-mono" aria-hidden="true">' + esc((l.name || "?").charAt(0)) + "</div>";
    h += '<div class="bcl-dir-head">' + tile + '<div><div class="bcl-dir-name">' + esc(l.name) + "</div>";
    if (l.subcategory) h += '<div class="bcl-dir-sub">' + esc(l.subcategory) + "</div>";
    var badge = listingBadge(l);
    if (badge) {
      h += '<div class="bcl-dir-badge' + (badgeIsBoulderCreek(l) ? " is-bc" : "") + '">' + esc(badge) + "</div>";
    }
    h += "</div></div>";
    if (l.description) h += '<div class="bcl-dir-desc">' + esc(l.description) + "</div>";
    if (l.address) h += '<div class="bcl-dir-meta">' + esc(l.address) + "</div>";
    else if (l.service_area) h += '<div class="bcl-dir-meta">Serves: ' + esc(l.service_area) + "</div>";
    /* Owner policy: these trades work out of their homes. We never publish a
       home address, so say why the address is missing instead of leaving a gap. */
    if (l.no_storefront) h += '<div class="bcl-dir-meta">Service based, no public storefront. Contact them directly.</div>';
    /* The badge says where they are; this says they will come to you. */
    if (showsServesBoulderCreek(l)) h += '<div class="bcl-dir-serves">Serves Boulder Creek</div>';
    if (l.hours_text) h += '<div class="bcl-dir-meta">' + esc(String(l.hours_text).replace(/\s*\(?confirm with the business\)?\.?/gi, "")) + "</div>";
    var links = [];
    if (l.phone) links.push('<a href="tel:' + esc(String(l.phone).replace(/[^0-9+]/g, "")) + '">' + esc(l.phone) + "</a>");
    var dir = directionsUrl(l);
    if (dir) links.push('<a href="' + esc(dir) + '" target="_blank" rel="noopener">Directions</a>');
    if (l.website) links.push('<a href="' + esc(l.website) + '" target="_blank" rel="noopener">Website</a>');
    if (links.length) h += '<div class="bcl-dir-links">' + links.join(" · ") + "</div>";
    /* Collected on 51 listings and checked weekly against CSLB, but never
       shown until now. It is the strongest trust signal the directory holds. */
    if (l.license) h += '<div class="bcl-dir-licence">' + esc(l.license) + "</div>";
    /* Only worth flagging while the reader is filtering by open hours: it
       explains why a listing survived a filter it could not be tested against. */
    if (opts && opts.openNow && listingOpenState(l, opts.now) === "unknown") {
      h += '<div class="bcl-dir-flag">Hours not auto-checked</div>';
    }
    var verified = monthYear(l.verified_at);
    if (verified) h += '<div class="bcl-dir-verified">Last verified ' + esc(verified) + "</div>";
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
      function cards(rows) {
        return rows.map(function (l) { return listingCard(l, opts); }).join("");
      }
      out += '<div class="bcl-cat-head"><h3>' + esc(c) + "</h3><span>" + shown + "</span></div>";
      if (a.local.length) {
        out += '<div class="bcl-dir-grid">' + cards(a.local) + "</div>";
      }
      if (a.nearby.length) {
        if (a.local.length) out += '<div class="bcl-tier-divider">Also serving the area</div>';
        out += '<div class="bcl-dir-grid">' + cards(a.nearby) + "</div>";
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
        '<label class="bcl-checklabel"><input type="checkbox" class="bcl-open-now"> Open now</label>' +
        '<label class="bcl-checklabel"><input type="checkbox" class="bcl-bc-only"> In Boulder Creek</label>' +
        "</div>" +
        '<div class="bcl-count"></div><div class="bcl-list"></div>' +
        '<div class="bcl-note">Something wrong or missing? <a href="/contact">Send an update</a>.</div>';

      var input = root.querySelector("input");
      var select = root.querySelector("select");
      var openBox = root.querySelector(".bcl-open-now");
      var bcBox = root.querySelector(".bcl-bc-only");
      var count = root.querySelector(".bcl-count");
      var list = root.querySelector(".bcl-list");
      /* A search-overlay hit links to /directory?q=Name, so honour it. */
      try {
        var pre = new URLSearchParams(location.search).get("q");
        if (pre) input.value = pre;
      } catch (e) { /* older browser: just show the full list */ }

      function render() {
        var q = (input.value || "").toLowerCase();
        var cat = select.value;
        var openNow = !!openBox.checked;
        var bcOnly = !!bcBox.checked;
        var now = new Date();
        var rows = all.filter(function (l) {
          if (cat && l.category !== cat) return false;
          /* Same predicate the badge uses, so the filter can never disagree
             with what the card says. Physically here, not "serves here". */
          if (bcOnly && !badgeIsBoulderCreek(l)) return false;
          /* "unknown" survives on purpose: an unparseable hours line is not
             evidence that the place is shut. */
          if (openNow && listingOpenState(l, now) === "closed") return false;
          if (!q) return true;
          return (l.name + " " + (l.subcategory || "") + " " + (l.description || "")).toLowerCase().indexOf(q) >= 0;
        });
        count.textContent = rows.length + " OF " + all.length + " LISTINGS" + updatedSuffix(data.updated);
        if (!rows.length) {
          list.innerHTML = '<div class="bcl-unavailable">No listings match that search. A missing business isn’t a judgment, it may just not be verified yet. <a href="/contact">Suggest it</a>.</div>';
          return;
        }
        // Cap the nearby tier only when browsing (no active search), so a search never hides matches.
        list.innerHTML = buildDirectoryHTML(rows, { cap: q ? 0 : 6, openNow: openNow, now: now });
        if (openNow) {
          note.textContent = "Open now uses each listing's posted hours. Listings whose hours cannot be read as set times stay in the results and are marked, because unreadable hours are not the same as closed.";
        } else {
          note.textContent = "";
        }
      }
      var note = document.createElement("div");
      note.className = "bcl-count bcl-open-note";
      count.parentNode.insertBefore(note, count.nextSibling);
      input.addEventListener("input", render);
      select.addEventListener("change", render);
      openBox.addEventListener("change", render);
      bcBox.addEventListener("change", render);
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

  /* Pay bands compare an hourly equivalent, because the feed mixes hourly,
     monthly, and annual rates in one list. Full-time conversions only: 2,080
     hours a year, 173.33 a month. Anything posted by the day, or with no
     period at all, has no honest hourly equivalent, so it sits outside the
     bands rather than being guessed into one. The bottom of a posted range is
     used, so a band means "starts at or above this rate", and the control says
     so on the page. */
  var HOURS_PER_PERIOD = { hour: 1, hourly: 1, month: 173.33, monthly: 173.33, year: 2080, annual: 2080, yearly: 2080 };
  var PAY_BANDS = [20, 25, 30];

  function jobHourlyEquivalent(job) {
    if (!job || !job.salary_disclosed) return null;
    var per = HOURS_PER_PERIOD[String(job.salary_period || "").toLowerCase()];
    if (!per) return null;
    var floor = job.salary_min != null ? job.salary_min : job.salary_max;
    floor = Number(floor);
    if (!isFinite(floor) || floor <= 0) return null;
    return floor / per;
  }

  /* posted_at is the employer's own date and is missing from some sources, so
     the fallback to our first_seen_at is stated in the control's label instead
     of being hidden inside it. */
  function jobDateKey(job) {
    return (job && (job.posted_at || job.first_seen_at)) || "";
  }

  function jobPostedWithin(job, days, today) {
    var age = dayAge(jobDateKey(job), today);
    return age != null && age < days;
  }

  function jobEmployers(rows) {
    var seen = {}, out = [];
    (rows || []).forEach(function (j) {
      var name = j && j.employer_name;
      if (name && !seen[name]) { seen[name] = 1; out.push(name); }
    });
    return out.sort(function (a, b) { return String(a).localeCompare(String(b)); });
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
      if (opts.employer && j.employer_name !== opts.employer) return false;
      if (opts.payListedOnly && !j.salary_disclosed) return false;
      if (opts.minHourly) {
        var hourly = jobHourlyEquivalent(j);
        if (hourly == null || hourly < opts.minHourly) return false;
      }
      if (opts.postedWithinDays && !jobPostedWithin(j, opts.postedWithinDays, opts.today)) return false;
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

  /* ---------- job alerts signup (MailerLite embedded form 194352772136568142
     -> group "BCL Job Alerts" 194345872038823754, double opt-in ON).

     The footer newsletter band hands its markup to MailerLite's universal.js
     and gets MailerLite's own box back. That is fine in a footer and wrong on
     a tool page, where the box has to read in the site's voice and sit inside
     the jobs layout. So this posts to the same endpoint universal.js posts to
     and keeps the markup ours.

     The endpoint was exercised for real on 2026-07-29: it answers
     {"success":true} and sends `access-control-allow-origin: *`, so the reply
     is readable and the box can tell the reader the truth instead of assuming
     a no-cors post landed. Double opt-in means a successful post is a
     confirmation email, not a subscription, and the success copy says so.
     signup_source is a real custom field on the account and was confirmed to
     stick on the test subscriber. */
  var JOB_ALERTS = {
    account: "2514969",
    form: "194352772136568142",
    group: "194345872038823754",
    source: "jobs-board"
  };

  function jobAlertsEndpoint() {
    return "https://assets.mailerlite.com/jsonp/" + JOB_ALERTS.account +
      "/forms/" + JOB_ALERTS.form + "/subscribe";
  }

  /* Deliberately loose. The only job here is to catch an obvious typo before
     spending a request; MailerLite is the authority on what an address is. */
  function looksLikeEmail(value) {
    var s = String(value == null ? "" : value).trim();
    if (!s || /\s/.test(s)) return false;
    return /^[^@]+@[^@.]+(\.[^@.]+)+$/.test(s);
  }

  function jobAlertsBody(email) {
    return "fields%5Bemail%5D=" + encodeURIComponent(String(email == null ? "" : email).trim()) +
      "&fields%5Bsignup_source%5D=" + encodeURIComponent(JOB_ALERTS.source) +
      "&ml-submit=1&anticsrf=true";
  }

  var JOB_ALERTS_MESSAGES = {
    invalid: { text: "That does not look like an email address.", bad: true },
    sending: { text: "Sending your address.", bad: false },
    ok: { text: "Almost there. Check your email for a confirmation link; the alerts start once you click it.", bad: false },
    fail: { text: "That did not go through. Try again in a moment, or email hello@bouldercreeklocal.com and we will add you by hand.", bad: true }
  };

  function jobAlertsMessage(state) {
    return JOB_ALERTS_MESSAGES[state] || { text: "", bad: false };
  }

  function jobAlertsHTML() {
    return '<div class="bcl-alerts">' +
      "<h3>Job alerts</h3>" +
      "<p>New valley jobs in your inbox on Mondays. No noise, unsubscribe anytime.</p>" +
      '<form novalidate>' +
      '<label class="bcl-sr-only" for="bcl-alerts-email">Email address</label>' +
      '<input id="bcl-alerts-email" type="email" name="email" autocomplete="email" placeholder="you@example.com">' +
      "<button type=\"submit\">Sign up</button>" +
      "</form>" +
      '<p class="bcl-alerts-msg" role="status" aria-live="polite"></p>' +
      "</div>";
  }

  function initJobAlerts(box) {
    var form = box.querySelector("form");
    var input = box.querySelector("input[type=email]");
    var button = box.querySelector("button");
    var msg = box.querySelector(".bcl-alerts-msg");
    if (!form || !input || !button || !msg) return;

    function say(state) {
      var m = jobAlertsMessage(state);
      msg.textContent = m.text;
      msg.className = "bcl-alerts-msg" + (m.bad ? " bcl-bad" : "");
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = input.value;
      if (!looksLikeEmail(email)) { say("invalid"); input.focus(); return; }
      button.disabled = true;
      say("sending");
      var done = function (state) {
        button.disabled = false;
        say(state);
        if (state === "ok") { form.style.display = "none"; }
      };
      if (typeof fetch !== "function") { done("fail"); return; }
      fetch(jobAlertsEndpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: jobAlertsBody(email)
      }).then(function (res) {
        if (!res.ok) throw new Error("http " + res.status);
        return res.json().catch(function () { return { success: true }; });
      }).then(function (data) {
        done(data && data.success === false ? "fail" : "ok");
      }).catch(function () { done("fail"); });
    });
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
        '<select class="bcl-job-employer" aria-label="Filter by employer"><option value="">All employers</option></select>' +
        '<select class="bcl-job-pay" aria-label="Minimum pay"><option value="0">Any pay</option>' +
        PAY_BANDS.map(function (b) { return '<option value="' + b + '">$' + b + "+ per hour equivalent</option>"; }).join("") +
        "</select>" +
        '<label class="bcl-checklabel bcl-ext-wrap"><input type="checkbox" class="bcl-ext"> Include extended commute</label>' +
        '<label class="bcl-checklabel"><input type="checkbox" class="bcl-pay-listed"> Pay listed</label>' +
        '<label class="bcl-checklabel"><input type="checkbox" class="bcl-fresh"> Posted this week</label>' +
        "</div>" +
        '<div class="bcl-count"></div><div class="bcl-filter-note"></div>' +
        jobAlertsHTML() +
        '<div class="bcl-list"></div>' +
        '<div class="bcl-note">Boulder Creek Local is not the employer and does not process applications. Verify details and apply directly with the employer. ' +
        'Something wrong or missing? <a href="/contact">Send an update</a>.</div>';

      var input = root.querySelector("input");
      var select = root.querySelector("select");
      var employerSel = root.querySelector(".bcl-job-employer");
      var paySel = root.querySelector(".bcl-job-pay");
      var payListedBox = root.querySelector(".bcl-pay-listed");
      var freshBox = root.querySelector(".bcl-fresh");
      var extBox = root.querySelector(".bcl-ext");
      var extWrap = root.querySelector(".bcl-ext-wrap");
      var count = root.querySelector(".bcl-count");
      var note = root.querySelector(".bcl-filter-note");
      var list = root.querySelector(".bcl-list");
      var tabBtns = [].slice.call(root.querySelectorAll(".bcl-tab"));
      var tab = "local";

      /* The employer list is built from whatever is on the board today, and
         rebuilt per tab so it never offers an employer with nothing to show.
         A selection that survives the tab change is kept. */
      function syncEmployers() {
        var scope = filterJobs(all, { tab: tab, includeExtended: true });
        var names = jobEmployers(scope);
        var keep = employerSel.value;
        employerSel.innerHTML = '<option value="">All employers</option>' +
          names.map(function (n) { return '<option value="' + esc(n) + '">' + esc(n) + "</option>"; }).join("");
        employerSel.value = names.indexOf(keep) >= 0 ? keep : "";
      }

      function render() {
        extWrap.style.display = tab === "local" ? "" : "none";
        var minHourly = parseFloat(paySel.value) || 0;
        var rows = filterJobs(all, {
          tab: tab,
          q: input.value || "",
          category: select.value,
          employer: employerSel.value,
          minHourly: minHourly,
          payListedOnly: !!payListedBox.checked,
          postedWithinDays: freshBox.checked ? 7 : 0,
          includeExtended: !!extBox.checked
        });
        count.textContent = rows.length + " OF " + all.filter(function (j) { return jobTab(j) === tab; }).length + " " + tab.toUpperCase() + " JOBS" + updatedSuffix(data.updated);
        var notes = [];
        if (minHourly) {
          notes.push("Pay bands use an hourly equivalent from the bottom of each posted range: annual divided by 2,080 hours, monthly by 173.33. Jobs with no posted pay, or pay posted by the day, are not in these bands.");
        }
        if (freshBox.checked) {
          notes.push("Posted this week uses the employer's posting date where there is one, and the date we first saw the listing where there is not.");
        }
        note.textContent = notes.join(" ");
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
          syncEmployers();
          render();
        });
      });
      input.addEventListener("input", render);
      select.addEventListener("change", render);
      employerSel.addEventListener("change", render);
      paySel.addEventListener("change", render);
      payListedBox.addEventListener("change", render);
      freshBox.addEventListener("change", render);
      extBox.addEventListener("change", render);
      var alertsBox = root.querySelector(".bcl-alerts");
      if (alertsBox) initJobAlerts(alertsBox);
      syncEmployers();
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
        count.textContent = rows.length + " OF " + all.length + " SAN LORENZO VALLEY RENTALS" + updatedSuffix(data.updated);
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

  /* A run of dates that has already opened. Museum exhibits are the usual case:
     they qualify as upcoming because they have not closed, but showing them by
     their START date puts a months-old date at the top of the calendar and
     reads as a stale feed. Anything already open is labelled by when it CLOSES
     and grouped under "Happening now" instead. */
  function evIsOngoing(e, todayOpt) {
    if (!e || !e.end) return false;
    var s = evParts(e.start), n = evParts(e.end);
    if (!s || !n) return false;
    var today = todayOpt ? new Date(todayOpt.getTime()) : new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(s.y, s.mo - 1, s.d) < today &&
           new Date(n.y, n.mo - 1, n.d, 23, 59) >= today;
  }

  function evThroughChip(s) {
    var p = evParts(s);
    if (!p) return esc(s);
    var mons = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    return "THROUGH " + mons[p.mo - 1] + " " + p.d;
  }

  /* ---------- one event, as a calendar file ----------
     Ported from the Ambitious Harvest garden-events embed (the data-ics button
     plus a VCALENDAR built in the browser and handed over as a Blob, so no
     server is involved). Two deliberate changes for this feed: BCL events are
     either a bare "YYYY-MM-DD" or a local "YYYY-MM-DDTHH:MM", so all-day
     events are written as DTSTART;VALUE=DATE and timed ones as floating local
     times. Running these through toISOString the way the garden embed does
     would drag a date-only event back into the previous day for anyone reading
     it west of UTC, which is everyone here. */

  function icsEscape(v) {
    return String(v == null ? "" : v)
      .replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n")
      .replace(/,/g, "\\,").replace(/;/g, "\\;");
  }

  function icsStamp(now) {
    var d = now || new Date();
    return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) + "T" +
      pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + pad2(d.getUTCSeconds()) + "Z";
  }

  function icsDate(parts, addDay) {
    var d = new Date(parts.y, parts.mo - 1, parts.d + (addDay ? 1 : 0));
    return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
  }

  function icsDateTime(parts) {
    return icsDate(parts, false) + "T" + pad2(parts.h) + pad2(parts.mi || 0) + "00";
  }

  function icsUID(e) {
    return String(e.start || "").replace(/[^0-9T]/g, "") + "-" +
      String(e.title || "event").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") +
      "@bouldercreeklocal.com";
  }

  function icsFileName(e) {
    var slug = String(e.title || "event").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return (slug || "event") + ".ics";
  }

  function icsForEvent(e, now) {
    var start = evParts(e.start);
    if (!start) return "";
    var end = evParts(e.end) || null;
    var lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0",
      "PRODID:-//Boulder Creek Local//Events//EN", "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      "UID:" + icsUID(e),
      "DTSTAMP:" + icsStamp(now)
    ];
    if (start.h == null) {
      /* All-day: DTEND is exclusive in iCalendar, so a one-day event ends on
         the following morning and a run of days ends the day after the last. */
      lines.push("DTSTART;VALUE=DATE:" + icsDate(start, false));
      lines.push("DTEND;VALUE=DATE:" + icsDate(end && end.h == null ? end : start, true));
    } else {
      lines.push("DTSTART:" + icsDateTime(start));
      lines.push("DTEND:" + icsDateTime(end && end.h != null ? end : start));
    }
    lines.push("SUMMARY:" + icsEscape(e.title));
    if (e.location) lines.push("LOCATION:" + icsEscape(e.location));
    var description = [e.description, e.notice].filter(Boolean).join(" ");
    /* Times change and this file cannot update itself, so the description
       carries the organizer link rather than implying the details are fixed. */
    if (description) lines.push("DESCRIPTION:" + icsEscape(description + (e.url ? " Confirm with the organizer: " + e.url : "")));
    else if (e.url) lines.push("DESCRIPTION:" + icsEscape("Confirm with the organizer: " + e.url));
    if (e.url) lines.push("URL:" + icsEscape(e.url));
    lines.push("END:VEVENT", "END:VCALENDAR");
    return lines.join("\r\n") + "\r\n";
  }

  function downloadIcs(e) {
    var body = icsForEvent(e);
    if (!body) return;
    var blob = new Blob([body], { type: "text/calendar;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = icsFileName(e);
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  /* Range chips and the two date boxes share one predicate so the count line,
     the chips, and the custom range can never disagree. */
  /* An event occupies a RANGE of days, not one day. A museum exhibit that opened
     in July and closes in December is on today, so "Today" and "This weekend"
     have to ask whether the event's span OVERLAPS the window, not whether its
     start day happens to fall inside it. Testing the start alone hid every
     open exhibit behind those chips. Single-day events are the same test with
     an end equal to the start, so nothing else changes. */
  function eventInRange(e, opts) {
    opts = opts || {};
    var range = opts.range || "all";
    var p = evParts(e && e.start);
    if (!p) return range === "all";
    var q = evParts((e && e.end) || (e && e.start)) || p;
    var day = new Date(p.y, p.mo - 1, p.d).getTime();
    var dayEnd = new Date(q.y, q.mo - 1, q.d).getTime();
    if (dayEnd < day) dayEnd = day;   // a malformed end must never shrink the span
    var today = opts.today ? new Date(opts.today.getTime()) : new Date();
    today.setHours(0, 0, 0, 0);
    function overlaps(lo, hi) { return dayEnd >= lo && day <= hi; }
    if (range === "custom") {
      var from = dayKeyToUTC(opts.from), to = dayKeyToUTC(opts.to);
      var key = Date.UTC(p.y, p.mo - 1, p.d);
      var keyEnd = Date.UTC(q.y, q.mo - 1, q.d);
      if (keyEnd < key) keyEnd = key;
      if (from != null && keyEnd < from) return false;
      if (to != null && key > to) return false;
      return true;
    }
    if (range === "all") return true;
    if (range === "today") return overlaps(today.getTime(), today.getTime());
    if (range === "7" || range === "30") {
      var span = new Date(today);
      span.setDate(today.getDate() + parseInt(range, 10));
      return overlaps(today.getTime(), span.getTime());
    }
    if (range === "weekend") {
      /* the coming (or current) Friday through Sunday, never earlier than today */
      var dow = today.getDay();
      var fri = new Date(today);
      if (dow === 6) fri.setDate(today.getDate() - 1);
      else if (dow === 0) fri.setDate(today.getDate() - 2);
      else fri.setDate(today.getDate() + (5 - dow));
      var sun = new Date(fri);
      sun.setDate(fri.getDate() + 2);
      var lo = Math.max(fri.getTime(), today.getTime());
      return overlaps(lo, sun.getTime());
    }
    return true;
  }

  function eventCard(e) {
    var h = '<div class="bcl-event-card">';
    h += '<div class="bcl-event-date">' +
         (evIsOngoing(e) ? evThroughChip(e.end) : evDateChip(e.start)) + "</div>";
    h += '<div class="bcl-event-title">' + esc(e.title) + "</div>";
    if (e.location) h += '<div class="bcl-event-meta">' + esc(e.location) + "</div>";
    /* Event cards deliberately don't render descriptions, so anything a reader must
       know BEFORE turning up (age limits, ticket-only) goes here or it is invisible. */
    if (e.notice) h += '<div class="bcl-event-notice">' + esc(e.notice) + "</div>";
    if (e.url) h += '<a href="' + esc(e.url) + '" target="_blank" rel="noopener">Details</a>';
    if (e.id) h += '<button type="button" class="bcl-ics" data-ics="' + esc(e.id) + '">Add to calendar</button>';
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

    /* A block here used to demote listing-card h1s, selecting "h1.entry-title".
       Removed 2026-08-02: the cards ship "h1.blog-title", so the selector matched
       nothing on /around-town (verified on the live page: 0 entry-title, 21
       blog-title). It was not merely dead but armed - had it ever matched, it
       replaced each card's visible title with a HIDDEN slug, blanking the
       listing. Do not "fix" it by repointing it at .blog-title for that reason.
       The underlying issue (21 h1s in the SERVED html, which is what crawlers
       read whether or not any script runs) is a template-level problem and is
       still open; client-side demotion would not have solved it anyway. */

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
    var today = todayKey();

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
      pick: function (rows) { return nextEvents(rows, today, 3); },
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
    ["bcl-home-board", "bcl-home-recent", "bcl-home-rain"].forEach(function (id) {
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
    if (lastBoardSec) initHomeRainCard(lastBoardSec);
  }

  /* Homepage rainfall card (owner, 2026-07-31). The decision behind it: tools get
     surfaced CONTEXTUALLY, never by widening a 10-item nav, so /rain reaches the
     homepage as a live NUMBER rather than a menu entry. The number is the draw.

     🚨 It renders NOTHING unless the feed parses into a usable season summary.
     That is the house emergency-content guardrail applied to a record page: a 200
     with an unexpected shape must not become a confident figure on the homepage.
     Rain is history rather than a warning, but a wrong total is still wrong, and
     an absent card costs a reader nothing. */
  function initHomeRainCard(afterSec) {
    if (!afterSec || !afterSec.parentNode) return;
    if (document.getElementById("bcl-home-rain")) return;

    fetchJSON(REPO + "/data/" + RAIN.file).then(function (payload) {
      var s = rainSeasonSummary(payload);
      // Both numbers must be real; the percentage is the comparison that gives
      // the total meaning, so half a card is not worth shipping.
      if (!s || s.toDate == null || s.pctOfNormal == null) return;
      if (document.getElementById("bcl-home-rain")) return;

      var note = rainRankText(s.drier, s.years);
      var sec = document.createElement("section");
      sec.id = "bcl-home-rain";
      sec.className = "bcl-section";
      sec.innerHTML = '<div class="bcl-wrap"><a class="bcl-raincard" href="/rain">' +
        '<span class="bcl-raincard-lab">Rainfall, water year ' + esc(String(s.wy || "")) + '</span>' +
        '<span class="bcl-raincard-val">' + esc(rainInches(s.toDate) + (s.floor ? " or more" : "")) + '</span>' +
        /* "of typical" carries no "by this date" because rainRankText already
           ends with it, and the two together read as a stutter. */
        /* "of the long-record median", never "of typical": the percentage flips
           meaning with the baseline (this year is 106% of the 1940-2023 median
           but only ~97% of the 1991-2020 normal), so the baseline has to be on
           the card or the headline claim is unfalsifiable. */
        '<span class="bcl-raincard-note">' + esc(s.pctOfNormal + "% of the long-record median") +
        (note ? esc(", " + note) : esc(" by this date")) + '.</span>' +
        '<span class="bcl-raincard-go">See the rain tracker &rarr;</span>' +
        "</a></div>";
      afterSec.parentNode.insertBefore(sec, afterSec.nextSibling);
    }).catch(function () { /* no card, by design */ });
  }

  /* Footer link to /rain (owner, 2026-07-31). This does a DIFFERENT job from the
     23 contextual article links: those buy crawl and topical relevance, this is
     the only route a RETURNING reader has in November without using search.

     Injected here rather than pasted into the footer Code Injection on purpose.
     That panel cannot be read back, cannot be driven by script, and has caused
     permanent loss, so a JS release (push + purge) is the safe carrier. Google
     renders JS, and discovery is already covered by the in-body article links. */
  function initFooterToolLinks() {
    var nav = document.querySelector("nav.bcl-footer-links:not(.bcl-footer-social)");
    if (!nav) return;
    if (nav.querySelector('a[href="/rain"]')) return;
    var a = document.createElement("a");
    a.href = "/rain";
    a.textContent = "Rain";
    // Sit with the other tools rather than after Terms & Privacy.
    var rentals = nav.querySelector('a[href="/rentals"]');
    if (rentals) nav.insertBefore(a, rentals.nextSibling);
    else nav.appendChild(a);
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
      /* Stable handle for the calendar button: the feed has no ids, and a
         position in the rendered list changes every time a filter does. */
      all.forEach(function (e, i) { if (!e.id) e.id = "bclev" + i; });

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
        '<div class="bcl-range"><button data-r="all" class="bcl-on">All upcoming</button><button data-r="today">Today</button>' +
        '<button data-r="weekend">This weekend</button><button data-r="7">Next 7 days</button><button data-r="30">Next 30 days</button></div>' +
        '<div class="bcl-daterange"><label>From <input type="date" class="bcl-ev-from" aria-label="Events from date"></label>' +
        '<label>To <input type="date" class="bcl-ev-to" aria-label="Events to date"></label>' +
        '<button type="button" class="bcl-ev-clear">Clear dates</button></div>' +
        '<div class="bcl-controls">' +
        '<input type="search" class="bcl-ev-q" placeholder="Search events" aria-label="Search events">' +
        '<select class="bcl-ev-cat" aria-label="Filter by type"><option value="">All types</option>' +
        cats.map(function (c) { return "<option>" + esc(c) + "</option>"; }).join("") + "</select>" +
        '<select class="bcl-ev-sort" aria-label="Sort events"><option value="date">Soonest first</option><option value="name">Name A to Z</option><option value="type">By type</option></select>' +
        "</div>" +
        '<div class="bcl-count"></div><div class="bcl-event-grid"></div>' +
        '<div class="bcl-note">Details change. Confirm with the organizer before you go. <a href="/contact">Send a correction or add an event</a>.</div>';

      var input = root.querySelector(".bcl-ev-q");
      var catSel = root.querySelector(".bcl-ev-cat");
      var sortSel = root.querySelector(".bcl-ev-sort");
      var fromInput = root.querySelector(".bcl-ev-from");
      var toInput = root.querySelector(".bcl-ev-to");
      var clearBtn = root.querySelector(".bcl-ev-clear");
      var count = root.querySelector(".bcl-count");
      var grid = root.querySelector(".bcl-event-grid");
      var range = "all";
      var rangeBtns = [].slice.call(root.querySelectorAll(".bcl-range button"));

      /* Typing a date is an explicit request, so it takes over from the chips
         and the chips clear themselves rather than silently fighting it. */
      function activeRange() {
        return (fromInput.value || toInput.value) ? "custom" : range;
      }

      function render() {
        var q = (input.value || "").toLowerCase();
        var cat = catSel.value;
        var mode2 = activeRange();
        rangeBtns.forEach(function (b) {
          b.className = (mode2 !== "custom" && b.getAttribute("data-r") === range) ? "bcl-on" : "";
        });
        var rows = all.filter(function (e) {
          if (!eventInRange(e, { range: mode2, from: fromInput.value, to: toInput.value })) return false;
          if (cat && (e.category || "Community") !== cat) return false;
          if (!q) return true;
          return (e.title + " " + (e.location || "") + " " + (e.description || "")).toLowerCase().indexOf(q) >= 0;
        });
        var mode = sortSel.value;
        rows.sort(function (a, b) {
          if (mode === "name") return a.title.localeCompare(b.title) || String(a.start).localeCompare(String(b.start));
          if (mode === "type") return (a.category || "").localeCompare(b.category || "") || String(a.start).localeCompare(String(b.start));
          /* Already-open runs go first as ONE block. Their start dates are in the
             past so they sort first anyway, but the month grouping below emits a
             fresh heading every time the key changes, so a stray ongoing event in
             the middle would print "Happening now" twice. */
          var ao = evIsOngoing(a), bo = evIsOngoing(b);
          if (ao !== bo) return ao ? -1 : 1;
          if (ao && bo) return String(a.end).localeCompare(String(b.end));
          return String(a.start).localeCompare(String(b.start));
        });
        count.textContent = rows.length + " OF " + all.length + " UPCOMING" + updatedSuffix(data.updated);
        var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        function monthKey(e) {
          if (evIsOngoing(e)) return "Happening now";
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
          fromInput.value = "";
          toInput.value = "";
          render();
        });
      });
      clearBtn.addEventListener("click", function () {
        fromInput.value = "";
        toInput.value = "";
        render();
      });
      /* One delegated handler: the grid is rebuilt on every keystroke, so
         per-button listeners would be re-bound constantly and leak. */
      root.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest && ev.target.closest("[data-ics]");
        if (!btn) return;
        var id = btn.getAttribute("data-ics");
        for (var i = 0; i < all.length; i++) {
          if (all[i].id === id) { downloadIcs(all[i]); return; }
        }
      });
      input.addEventListener("input", render);
      catSel.addEventListener("change", render);
      sortSel.addEventListener("change", render);
      fromInput.addEventListener("change", render);
      toInput.addEventListener("change", render);
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

  /* ---------- San Lorenzo River gauge ----------
     USGS 11160500, SAN LORENZO R A BIG TREES CA, is the nearest real-time
     gauge upstream of Santa Cruz and downstream of Boulder Creek (Felton, at
     Henry Cowell). Verified 2026-07-29 against the USGS instantaneous-values
     API: it currently reports both gage height (00065) and discharge (00060),
     and both services send Access-Control-Allow-Origin, so the page fetches
     them directly like the air and roads cards.

     The card publishes numbers and nothing else. It does not say whether the
     river is high, safe, or normal, and it never converts a reading into a
     condition. The NWS flood categories come from the National Water
     Prediction Service record for forecast point BTEC1, which carries USGS id
     11160500, so they are quoted with attribution rather than invented; if
     that call fails the thresholds are simply absent. A failed reading is
     stated as unavailable, which is not an all-clear. */

  var RIVER = {
    site: "11160500",
    name: "San Lorenzo River at Big Trees",
    place: "Felton, upstream gauge for the valley",
    usgs: "https://waterdata.usgs.gov/monitoring-location/USGS-11160500/",
    lid: "BTEC1",
    nws: "https://water.noaa.gov/gauges/BTEC1"
  };
  var RIVER_CATEGORY_ORDER = ["action", "minor", "moderate", "major"];
  var RIVER_CATEGORY_LABELS = { action: "Action", minor: "Minor flood", moderate: "Moderate flood", major: "Major flood" };

  function riverReading(json) {
    var series = ((json || {}).value || {}).timeSeries || [];
    var out = { stage: null, flow: null, at: "", provisional: false };
    series.forEach(function (s) {
      var code = (((s.variable || {}).variableCode || [])[0] || {}).value;
      var v = (((s.values || [])[0] || {}).value || [])[0];
      if (!v || v.value == null) return;
      var n = parseFloat(v.value);
      if (!isFinite(n) || n <= -999998) return;
      if (code === "00065") out.stage = n;
      else if (code === "00060") out.flow = n;
      else return;
      if (v.dateTime) out.at = v.dateTime;
      if ((v.qualifiers || []).indexOf("P") >= 0) out.provisional = true;
    });
    return (out.stage == null && out.flow == null) ? null : out;
  }

  function riverFloodCategories(json) {
    var cats = (((json || {}).flood || {}).categories) || {};
    return RIVER_CATEGORY_ORDER.filter(function (k) {
      return cats[k] && typeof cats[k].stage === "number";
    }).map(function (k) {
      return { key: k, label: RIVER_CATEGORY_LABELS[k] || k, stage: cats[k].stage };
    });
  }

  function riverTimeText(iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? "" : d.toLocaleString();
  }

  function riverCardHTML(reading, cats) {
    var h = '<div class="bcl-name">' + esc(RIVER.name) + "</div>" +
      '<div class="bcl-sub">' + esc(RIVER.place) + "</div>" +
      '<div class="bcl-river-rows">';
    if (reading.stage != null) h += "<div><b>Gage height</b><span>" + reading.stage.toFixed(2) + " ft</span></div>";
    if (reading.flow != null) h += "<div><b>Streamflow</b><span>" + Math.round(reading.flow) + " cfs</span></div>";
    h += "</div>";
    var when = riverTimeText(reading.at);
    h += '<div class="bcl-meta">USGS gauge ' + esc(RIVER.site) + (when ? ", reading taken " + esc(when) : "") +
      (reading.provisional ? ". Provisional data, subject to revision." : "") + "</div>";
    if (cats && cats.length) {
      h += '<p class="bcl-river-cats">National Weather Service stages for this gauge: ' +
        cats.map(function (c) { return esc(c.label) + " " + c.stage + " ft"; }).join(", ") +
        '. Those thresholds are published by the <a href="' + RIVER.nws + '" target="_blank" rel="noopener">NWS river forecast page</a>, which is where flooding is called, not here.</p>';
    }
    h += '<p><a href="' + RIVER.usgs + '" target="_blank" rel="noopener">USGS gauge page</a> · ' +
      '<a href="' + RIVER.nws + '" target="_blank" rel="noopener">NWS river forecast</a></p>';
    return h;
  }

  function fillRiver(el) {
    if (!el) return;
    var iv = "https://waterservices.usgs.gov/nwis/iv/?format=json&sites=" + RIVER.site + "&parameterCd=00060,00065";
    Promise.all([
      fetchJSON(iv),
      /* thresholds are a bonus, never a blocker */
      fetchJSON("https://api.water.noaa.gov/nwps/v1/gauges/" + RIVER.lid).catch(function () { return null; })
    ]).then(function (res) {
      var reading = riverReading(res[0]);
      if (!reading) throw new Error("no reading");
      el.innerHTML = riverCardHTML(reading, riverFloodCategories(res[1]));
    }).catch(function () {
      el.innerHTML = '<div class="bcl-name">River gauge: unavailable</div>' +
        "<p>The San Lorenzo River reading didn't load. That means there is no reading here, not that the river is low. " +
        'Check the <a href="' + RIVER.usgs + '" target="_blank" rel="noopener">USGS gauge page</a> and the ' +
        '<a href="' + RIVER.nws + '" target="_blank" rel="noopener">NWS river forecast</a>.</p>';
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
      '<div class="bcl-card bcl-river"><div class="bcl-count">Checking the river gauge…</div></div>' +
      rightNowStatic() +
      "</div>" +
      '<div class="bcl-count" style="margin-top:10px;">LIVE ITEMS RETRIEVED WHEN YOU LOADED THIS PAGE · ' + esc(new Date().toLocaleString()) + "</div>" +
      '<div class="bcl-nws" style="margin-top:18px;"><div class="bcl-count">Checking National Weather Service…</div></div>' +
      sirensLinks();

    fillAQI(root.querySelector(".bcl-aqi"));
    fillCaltrans(root.querySelector(".bcl-roads"));
    fillRiver(root.querySelector(".bcl-river"));

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

  /* ---------- SLV rain and water year tracker ----------
     History layer for Mountain Status, never a replacement for it. Mountain
     Status answers "what is happening right now"; this answers "how does this
     season compare with the eighty-seven years on record". The two are linked
     both ways and neither speaks for the other.

     Data: data/rain.json, rebuilt by rain/refresh_rain.py from NOAA ACIS,
     station USC00040673 (Ben Lomond No. 4, 435 ft, daily since 1937). The
     method matches the rainfall article exactly, and the refresh refuses to
     write a payload whose water-year totals disagree with an independent
     monthly aggregation, so the tool and the article cannot drift apart.

     Freshness rules, the Mountain Status standard applied to a record rather
     than to live conditions:
       * every number wears the date it was read and the age of that reading;
       * a gap in the record is stated as a gap, with the dates, and season
         totals that contain one are called a floor rather than a total;
       * a station that has stopped reporting is reported as behind, never as
         a dry spell, and the reader is sent to the live sources;
       * a failed fetch says the record is unavailable, which is not an
         all-clear about rain, drought, or anything else.

     Colour: one validated hue #2a7d55 on surface #fffdf8 (all six dataviz
     checks pass). The historical band and median are deliberately neutral
     gray, not a second hue, because this is an emphasis chart: the current
     season is the series, history is context. Two steps of the brand green
     fail the normal-vision separation floor, so emphasis is carried by direct
     labels. See agent-memory/bcl-chart-palette.md. */

  var RAIN = {
    file: "rain.json",
    article: "/around-town/twenty-years-of-rain-san-lorenzo-valley",
    status: "/mountain-status",
    nws: "https://www.weather.gov/mtr/",
    acis: "https://www.rcc-acis.org/",
    hue: "#2a7d55",
    surface: "#fffdf8",
    grid: "#e6e1d4",
    ink: "#1c2a26",
    muted: "#67716b",
    band90: "#eae6d8",
    band50: "#d9d4c2",
    stale_days: 4
  };

  /* The canonical 365-day water year, October through September, built from the
     month lengths so it cannot drift from the Python side. February 29 shares
     February 28's slot: its rain still lands in every later cumulative total. */
  var RAIN_MONTHS = [[10, 31], [11, 30], [12, 31], [1, 31], [2, 28], [3, 31],
                     [4, 30], [5, 31], [6, 30], [7, 31], [8, 31], [9, 30]];
  var RAIN_WY_DAYS = 365;

  function rainMonthStarts() {
    var out = [], i = 1;
    RAIN_MONTHS.forEach(function (m) {
      out.push({ month: m[0], start: i, end: i + m[1] - 1, label: MON_SHORT[m[0] - 1] });
      i += m[1];
    });
    return out;
  }

  function rainWaterYear(dayKey) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dayKey || ""));
    if (!m) return null;
    return +m[2] >= 10 ? +m[1] + 1 : +m[1];
  }

  function rainWaterYearDay(dayKey) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dayKey || ""));
    if (!m) return null;
    var month = +m[2], day = Math.min(+m[3], month === 2 ? 28 : 31);
    var starts = rainMonthStarts(), i;
    for (i = 0; i < starts.length; i++) {
      if (starts[i].month === month) return starts[i].start + day - 1;
    }
    return null;
  }

  /* Today in Pacific time, computed for the date in question. Never a fixed
     UTC offset: America/Los_Angeles is -7 in summer and -8 from the first
     Sunday in November, and a constant silently shifts every date across that
     boundary. If the browser cannot resolve the zone we return null and the
     page omits the age lines rather than printing a guess. */
  function rainPacificDay(now) {
    var t = now || new Date();
    try {
      var parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit"
      }).formatToParts(t);
      var got = {};
      parts.forEach(function (p) { got[p.type] = p.value; });
      if (!got.year || !got.month || !got.day) return null;
      return got.year + "-" + got.month + "-" + got.day;
    } catch (e) {
      return null;
    }
  }

  function rainInches(n) {
    return (n == null || isNaN(n)) ? "" : Number(n).toFixed(2) + " in";
  }

  function rainLongDate(dayKey) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dayKey || ""));
    if (!m) return "";
    return MON_SHORT[+m[2] - 1] + " " + +m[3] + ", " + m[1];
  }

  function rainAgeWords(days) {
    if (days == null) return "";
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    return days + " days ago";
  }

  /* What the reader is told about how current the record is. Two separate
     clocks, because they fail separately: the station can stop reporting while
     the file rebuilds fine, and the file can go stale while the station reports. */
  function rainFreshness(payload, today) {
    var current = (payload || {}).current || {};
    var obsAge = current.through ? dayAge(current.through, today) : null;
    var fileAge = payload && payload.updated ? dayAge(payload.updated, today) : null;
    return {
      through: current.through || "",
      observationAge: obsAge,
      fileAge: fileAge,
      behind: obsAge != null && obsAge > RAIN.stale_days,
      knownToday: !!today
    };
  }

  function rainFreshnessHTML(payload, today) {
    var f = rainFreshness(payload, today);
    var station = (payload || {}).station || {};
    var h = '<div class="bcl-count">';
    if (f.through) {
      h += "LAST READING AT THE GAUGE " + esc(rainLongDate(f.through).toUpperCase());
      if (f.knownToday && f.observationAge != null) {
        h += " · " + esc(rainAgeWords(f.observationAge).toUpperCase());
      }
    } else {
      h += "NO READING DATE IN THIS FILE";
    }
    if (payload && payload.updated) {
      h += " · RECORD REBUILT " + esc(rainLongDate(payload.updated).toUpperCase());
    }
    h += "</div>";
    if (f.behind || !f.through) {
      h += '<div class="bcl-note"><strong>The gauge record is behind.</strong> ' +
        "Ben Lomond No. 4 is a once-a-day cooperative gauge and its readings reach NOAA on a delay, " +
        "so rain that fell in the last few days may not be counted here yet. A season total that has " +
        "stopped moving means the record has stopped arriving, not that it has stopped raining. " +
        'For what is falling now, use the <a href="' + RAIN.nws + '" target="_blank" rel="noopener">National Weather Service</a> ' +
        'and <a href="' + RAIN.status + '">Mountain Status</a>.</div>';
    } else if (station.name) {
      h += '<p class="bcl-rain-src">Source: NOAA cooperative gauge ' + esc(station.name) +
        " (" + esc(station.id || "") + "), " + esc(station.elevation_ft || "") +
        ' ft, daily rainfall since ' + esc(station.record_starts || "") +
        ', read through the <a href="' + RAIN.acis + '" target="_blank" rel="noopener">NOAA Regional Climate Centers ACIS service</a>. ' +
        'This is history, not a forecast: for current conditions see <a href="' + RAIN.status + '">Mountain Status</a>.</p>';
    }
    return h;
  }

  /* The gap sentence. It says how many readings are missing, when they fell,
     and what that does to the season total, because "7 missing days" means
     something very different in January than in July. */
  function rainGapNote(current) {
    var gaps = (current || {}).gaps || [];
    var n = (current || {}).missing_days || 0;
    if (!n) {
      return "Every day of this water year has a reading, so the season total is a complete total.";
    }
    var wet = (current || {}).wet_season_gaps || 0;
    var s = n === 1 ? "One day" : n + " days";
    var note = s + " of this water year " + (n === 1 ? "has" : "have") +
      " no reading at the gauge, so the season total is a floor rather than a full total: " +
      "the true figure is at least that much.";
    if (wet === 0) {
      note += " All of the gaps fall outside the wet half of the year, October through March, " +
        "which is when nearly all of the valley's rain arrives, so the undercount is small.";
    } else {
      note += " " + (wet === 1 ? "One gap falls" : wet + " of the gaps fall") +
        " inside the wet season, October through March, when a single missed day can cost inches.";
    }
    if (gaps.length && gaps.length <= 14) {
      note += " Missing: " + gaps.map(rainLongDate).join(", ") + ".";
    }
    if ((current || {}).accumulated_days) {
      note += " " + current.accumulated_days +
        " reading" + (current.accumulated_days === 1 ? "" : "s") +
        " arrived as a multi-day accumulated total, which keeps the season sum right while leaving those individual days unknown.";
    }
    return note;
  }

  /* Season to date against the same date in the reportable years. Deliberately
     phrased as a count of years, not a percentile: "wetter than 36 of 67 years
     by this date" is checkable, and it does not imply a smoothness the record
     does not have. */
  function rainSeasonSummary(payload) {
    var current = (payload || {}).current || {};
    var record = (payload || {}).record || {};
    var normal = current.normal_to_date;
    var pct = (normal != null && normal > 0 && current.to_date != null)
      ? Math.round((current.to_date / normal) * 100) : null;
    return {
      wy: current.wy,
      toDate: current.to_date,
      normal: normal,
      pctOfNormal: pct,
      drier: current.drier_years_to_date,
      years: current.years_compared,
      through: current.through,
      median: record.median,
      floor: !!current.missing_days
    };
  }

  function rainRankText(drier, years) {
    if (drier == null || !years) return "";
    if (drier === 0) return "the driest start to a year in the record";
    if (drier === years) return "the wettest start to a year in the record";
    return "wetter than " + drier + " of " + years + " years by this date";
  }

  /* Why the median and the mean disagree, in one sentence, counted from the
     record rather than written down. A hardcoded "a fifth of years" was wrong
     on the first draft (it is nearer a third), which is the argument for
     deriving it: prose about data goes stale, a count cannot. Returns "" if the
     shape is not there, so the tile degrades to the plain median. */
  function rainSkewNote(payload) {
    var rec = (payload || {}).record || {};
    var totals = (payload || {}).totals || {};
    if (rec.mean == null) return "";
    var vals = Object.keys(totals).map(function (k) { return totals[k]; })
      .filter(function (v) { return typeof v === "number"; });
    if (!vals.length) return "The average is " + rainInches(rec.mean) + ".";
    var big = vals.filter(function (v) { return v > 60; }).length;
    if (!big) return "The average is " + rainInches(rec.mean) + ".";
    return "The average is " + rainInches(rec.mean) + ", pulled up by the wettest years: " +
      big + " of " + vals.length + " topped 60 inches.";
  }

  function rainStatsHTML(payload) {
    var s = rainSeasonSummary(payload);
    var tiles = [];
    tiles.push(["Season to date, water year " + (s.wy || ""),
                s.floor ? rainInches(s.toDate) + " or more" : rainInches(s.toDate),
                s.through ? "through " + rainLongDate(s.through) : ""]);
    /* 🚨 These say MEDIAN, not "typical", and the last one prints the mean beside
       it (owner, 2026-07-31). She challenged "typical full water year 42.69 in"
       as impossible and was right to: the figure is arithmetically correct, but
       this record is strongly right-skewed, so the mean is 49.09 and the
       1991-2020 normal is 46.62. Calling the lowest defensible number "typical"
       reads as an error to anyone who remembers a figure near 50. Name the
       statistic and show the spread instead of picking one and hiding it. */
    tiles.push(["Median by this date", rainInches(s.normal),
                "median of " + (s.years || 0) + " reportable years"]);
    tiles.push(["Against that median",
                s.pctOfNormal != null ? s.pctOfNormal + "%" : "not available",
                rainRankText(s.drier, s.years)]);
    tiles.push(["Median full water year", rainInches(s.median),
                "median, October to September. " + rainSkewNote(payload)]);
    return '<div class="bcl-rain-tiles">' + tiles.map(function (t) {
      return '<div class="bcl-rain-tile"><span class="bcl-rain-tile-label">' + esc(t[0]) +
        '</span><span class="bcl-rain-tile-value">' + esc(t[1]) +
        '</span><span class="bcl-rain-tile-note">' + esc(t[2]) + "</span></div>";
    }).join("") + "</div>";
  }

  /* ---------- chart A: this season against the record ----------
     Emphasis form. One series in the accent hue (this water year), history as
     neutral washes behind it. Month-wide hit rectangles carry <title> text so
     the chart has native tooltips without any hover JS, and the month table
     below it carries every number for anyone the tooltips do not reach. */

  function rainNiceMax(v) {
    var step = v > 60 ? 20 : 10;
    return Math.max(step, Math.ceil((v * 1.04) / step) * step);
  }

  function rainSeasonChart(payload) {
    var band = (payload || {}).band || {};
    var current = (payload || {}).current || {};
    var series = current.cumulative || [];
    var p10 = band.p10 || [], p50 = band.p50 || [], p90 = band.p90 || [];
    var p25 = band.p25 || [], p75 = band.p75 || [];
    if (p50.length !== RAIN_WY_DAYS) return "";

    var W = 860, H = 350, L = 46, R = 18, T = 26, B = 44;
    var PW = W - L - R, PH = H - T - B;
    var ymax = rainNiceMax(Math.max(p90[p90.length - 1] || 0,
                                    series.length ? series[series.length - 1] : 0));
    function X(i) { return L + (i - 1) * PW / (RAIN_WY_DAYS - 1); }
    function Y(v) { return T + PH - (Math.max(0, v) / ymax) * PH; }

    function areaPath(hi, lo) {
      var d = [], i;
      for (i = 0; i < RAIN_WY_DAYS; i++) d.push((i ? "L" : "M") + X(i + 1).toFixed(1) + "," + Y(hi[i]).toFixed(1));
      for (i = RAIN_WY_DAYS - 1; i >= 0; i--) d.push("L" + X(i + 1).toFixed(1) + "," + Y(lo[i]).toFixed(1));
      return d.join(" ") + " Z";
    }
    function linePath(values) {
      var d = [], i;
      for (i = 0; i < values.length; i++) d.push((i ? "L" : "M") + X(i + 1).toFixed(1) + "," + Y(values[i]).toFixed(1));
      return d.join(" ");
    }

    var p = [];
    p.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" width="100%" role="img" ' +
      'aria-label="' + esc("Water year " + (current.wy || "") + " rainfall so far at the Ben Lomond No. 4 gauge, " +
        rainInches(current.to_date) + " through " + rainLongDate(current.through) +
        ", drawn against the range of the " + ((payload.record || {}).reportable_years || 0) +
        " reportable years on record. The median total by this date is " + rainInches(current.normal_to_date) + ".") + '" ' +
      'style="max-width:' + W + 'px;height:auto;display:block;margin:0 auto;font-family:inherit">');
    p.push("<desc>" + esc("Season-to-date rainfall accumulates from October 1. The two gray bands are the middle " +
      "80 percent and the middle half of the reportable years on record; the thin gray line is the median. " +
      "The dotted vertical line marks the last reading at the gauge: this year's line stops there and nothing " +
      "beyond it is a projection. Years missing more than five days of record are left out of the comparison " +
      "rather than estimated.") + "</desc>");
    p.push('<rect width="' + W + '" height="' + H + '" fill="' + RAIN.surface + '"/>');

    var step = ymax > 60 ? 20 : 10, v;
    for (v = 0; v <= ymax; v += step) {
      p.push('<line x1="' + L + '" y1="' + Y(v).toFixed(1) + '" x2="' + (L + PW) + '" y2="' + Y(v).toFixed(1) +
        '" stroke="' + RAIN.grid + '" stroke-width="1"/>');
      p.push('<text x="' + (L - 8) + '" y="' + (Y(v) + 3.5).toFixed(1) + '" text-anchor="end" font-size="11" fill="' +
        RAIN.muted + '" style="font-variant-numeric:tabular-nums">' + v + "</text>");
    }
    p.push('<text x="' + (L - 8) + '" y="' + (T - 10) + '" text-anchor="end" font-size="11" fill="' + RAIN.muted + '">inches</text>');

    if (p10.length === RAIN_WY_DAYS && p90.length === RAIN_WY_DAYS) {
      p.push('<path d="' + areaPath(p90, p10) + '" fill="' + RAIN.band90 + '"/>');
    }
    if (p25.length === RAIN_WY_DAYS && p75.length === RAIN_WY_DAYS) {
      p.push('<path d="' + areaPath(p75, p25) + '" fill="' + RAIN.band50 + '"/>');
    }
    p.push('<path d="' + linePath(p50) + '" fill="none" stroke="' + RAIN.muted + '" stroke-width="1"/>');

    if (series.length > 1) {
      p.push('<path d="' + linePath(series) + '" fill="none" stroke="' + RAIN.hue +
        '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>');
      var lastI = series.length, lastV = series[series.length - 1];
      /* A hairline drops from the last reading to the axis. Without it the
         median line carrying on past the end dot can read as a forecast of
         where this year is heading, which this page must never imply. */
      p.push('<line x1="' + X(lastI).toFixed(1) + '" y1="' + Y(lastV).toFixed(1) + '" x2="' + X(lastI).toFixed(1) +
        '" y2="' + Y(0).toFixed(1) + '" stroke="' + RAIN.muted + '" stroke-width="1" stroke-dasharray="2 3" opacity="0.7"/>');
      p.push('<circle cx="' + X(lastI).toFixed(1) + '" cy="' + Y(lastV).toFixed(1) + '" r="4.5" fill="' + RAIN.hue +
        '" stroke="' + RAIN.surface + '" stroke-width="2"/>');
      /* The one direct label: the number the whole chart exists to show.
         It flips to the left of the dot once the season runs past the middle,
         so it can never be clipped by the right edge. */
      var lx = X(lastI), anchor = "start", dx = 9;
      if (lx > L + PW * 0.6) { anchor = "end"; dx = -9; }
      p.push('<text x="' + (lx + dx).toFixed(1) + '" y="' + (Y(lastV) - 8).toFixed(1) + '" text-anchor="' + anchor +
        '" font-size="11.5" fill="' + RAIN.ink + '" stroke="' + RAIN.surface + '" stroke-width="3.5" paint-order="stroke" ' +
        'style="font-variant-numeric:tabular-nums">' + esc(Number(lastV).toFixed(2)) + " in</text>");
      p.push('<text x="' + (lx + dx).toFixed(1) + '" y="' + (Y(lastV) - 21).toFixed(1) + '" text-anchor="' + anchor +
        '" font-size="10" fill="' + RAIN.muted + '" stroke="' + RAIN.surface + '" stroke-width="3" paint-order="stroke">WY' +
        esc(current.wy || "") + "</text>");
    }

    p.push('<line x1="' + L + '" y1="' + Y(0).toFixed(1) + '" x2="' + (L + PW) + '" y2="' + Y(0).toFixed(1) +
      '" stroke="' + RAIN.grid + '" stroke-width="1"/>');
    rainMonthStarts().forEach(function (m) {
      p.push('<text x="' + X(m.start + (m.end - m.start) / 2).toFixed(1) + '" y="' + (T + PH + 16) +
        '" text-anchor="middle" font-size="10.5" fill="' + RAIN.muted + '">' + esc(m.label) + "</text>");
      /* Invisible month-wide hit target so the chart has real tooltips with no
         hover script. Native <title> works for mouse users and is exposed to
         assistive tech; the month table below carries the same numbers. */
      var seasonEnd = Math.min(m.end, series.length);
      var tip = m.label + ": season total " +
        (seasonEnd >= m.start && series.length >= m.start ? rainInches(series[seasonEnd - 1]) : "no reading yet") +
        ", median " + rainInches(p50[m.end - 1]) + " by the end of the month";
      p.push('<rect x="' + X(m.start).toFixed(1) + '" y="' + T + '" width="' + (X(m.end) - X(m.start) || 1).toFixed(1) +
        '" height="' + PH + '" fill="transparent"><title>' + esc(tip) + "</title></rect>");
    });
    p.push('<text x="' + L + '" y="' + (H - 8) + '" font-size="10.5" fill="' + RAIN.muted + '">' +
      esc("Water year runs October 1 to September 30. Bands and median from the " +
        ((payload.record || {}).reportable_years || 0) + " water years complete enough to report. " +
        "This year's line stops at the last reading, marked by the dotted line.") + "</text>");
    p.push("</svg>");
    return p.join("");
  }

  function rainSeasonLegendHTML(payload) {
    var years = ((payload || {}).record || {}).reportable_years || 0;
    return '<div class="bcl-rain-key">' +
      '<span><i class="bcl-rain-sw-line"></i>This water year</span>' +
      '<span><i class="bcl-rain-sw-b50"></i>Middle half of the ' + years + ' years on record</span>' +
      '<span><i class="bcl-rain-sw-b90"></i>Middle 80 percent</span>' +
      '<span><i class="bcl-rain-sw-med"></i>Median year</span>' +
      "</div>";
  }

  /* The table view. Every chart in this tool has one, so nothing is available
     only by hovering. */
  function rainMonthTable(payload) {
    var band = (payload || {}).band || {};
    var current = (payload || {}).current || {};
    var series = current.cumulative || [];
    var p50 = band.p50 || [];
    if (p50.length !== RAIN_WY_DAYS) return "";
    var rows = rainMonthStarts().map(function (m) {
      var haveStart = series.length >= m.start;
      var end = Math.min(m.end, series.length);
      var before = m.start > 1 ? (series.length >= m.start - 1 ? series[m.start - 2] : null) : 0;
      var monthTotal = (haveStart && before != null) ? Math.round((series[end - 1] - before) * 100) / 100 : null;
      return "<tr><th scope=\"row\">" + esc(m.label) + "</th><td>" +
        (monthTotal == null ? "no reading yet" : esc(rainInches(monthTotal))) + "</td><td>" +
        (haveStart ? esc(rainInches(series[end - 1])) : "no reading yet") + "</td><td>" +
        esc(rainInches(p50[m.end - 1])) + "</td></tr>";
    }).join("");
    return '<details class="bcl-rain-details"><summary>Month by month, as a table</summary>' +
      '<table class="bcl-rain-table"><caption>Water year ' + esc(current.wy || "") +
      ' at the Ben Lomond No. 4 gauge, against the median of the reportable years.</caption><thead><tr>' +
      "<th scope=\"col\">Month</th><th scope=\"col\">Rain that month</th>" +
      "<th scope=\"col\">Season total by month end</th><th scope=\"col\">Typical season total by month end</th>" +
      "</tr></thead><tbody>" + rows + "</tbody></table></details>";
  }

  /* ---------- chart B: every reportable water year ----------
     Same geometry the rainfall article already proved: one hue for every
     column, median and mean as labelled hairlines, and selective direct
     labels rather than a second colour. A selected year is marked with an ink
     tick and its own label, never by recolouring the column, because two
     steps of this green fail the dataviz separation floor. */

  function rainTotalsChart(payload, scope, selectedWy) {
    var totals = (payload || {}).totals || {};
    var record = (payload || {}).record || {};
    var years = Object.keys(totals).map(Number).sort(function (a, b) { return a - b; });
    if (!years.length) return "";
    if (scope === "recent") years = years.slice(-20);
    var y0 = years[0], y1 = years[years.length - 1];
    var span = y1 - y0 + 1;

    /* The right margin is wide on purpose: the median and mean labels live
       OUTSIDE the plot. The article's first chart anchored them in the longest
       stretch of missing years and they still landed on the 1944 to 1949
       columns, because the widest gap in this record is only three years wide.
       Outside the plot they cannot collide with a column at all. */
    var W = 860, H = 360, L = 46, R = 80, T = 40, B = 62;
    var PW = W - L - R, PH = H - T - B;
    var ymax = rainNiceMax(Math.max.apply(null, years.map(function (y) { return totals[y]; })));
    var bandW = PW / span;
    var bw = Math.min(24, Math.max(4, bandW - 2));
    var rad = Math.min(4, bw / 2);
    function X(year) { return L + (year - y0) * PW / span; }
    function Y(v) { return T + PH - (Math.max(0, v) / ymax) * PH; }

    var p = [];
    p.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" width="100%" role="img" ' +
      'aria-label="' + esc("Column chart of water-year rainfall totals at the Ben Lomond No. 4 gauge, " + y0 +
        " to " + y1 + ". The median is " + record.median + " inches and the mean is " + record.mean + " inches.") + '" ' +
      'style="max-width:' + W + 'px;height:auto;display:block;margin:0 auto;font-family:inherit">');
    p.push("<desc>" + esc("One column per water year, October to September. Years missing more than five days of " +
      "record are left out rather than estimated, which is why some years have no column.") + "</desc>");
    p.push('<rect width="' + W + '" height="' + H + '" fill="' + RAIN.surface + '"/>');

    var step = ymax > 60 ? 20 : 10, v;
    for (v = 0; v <= ymax; v += step) {
      p.push('<line x1="' + L + '" y1="' + Y(v).toFixed(1) + '" x2="' + (L + PW) + '" y2="' + Y(v).toFixed(1) +
        '" stroke="' + RAIN.grid + '" stroke-width="1"/>');
      p.push('<text x="' + (L - 8) + '" y="' + (Y(v) + 3.5).toFixed(1) + '" text-anchor="end" font-size="11" fill="' +
        RAIN.muted + '" style="font-variant-numeric:tabular-nums">' + v + "</text>");
    }
    p.push('<text x="' + (L - 8) + '" y="' + (T - 14) + '" text-anchor="end" font-size="11" fill="' + RAIN.muted + '">inches</text>');

    years.forEach(function (year) {
      var val = totals[year];
      var x = X(year) + (bandW - bw) / 2, yy = Y(val), h = (T + PH) - yy, r = Math.min(rad, h);
      p.push('<path d="M' + x.toFixed(2) + "," + (T + PH).toFixed(1) + " L" + x.toFixed(2) + "," + (yy + r).toFixed(2) +
        " Q" + x.toFixed(2) + "," + yy.toFixed(2) + " " + (x + r).toFixed(2) + "," + yy.toFixed(2) +
        " L" + (x + bw - r).toFixed(2) + "," + yy.toFixed(2) +
        " Q" + (x + bw).toFixed(2) + "," + yy.toFixed(2) + " " + (x + bw).toFixed(2) + "," + (yy + r).toFixed(2) +
        " L" + (x + bw).toFixed(2) + "," + (T + PH).toFixed(1) + ' Z" fill="' + RAIN.hue + '"><title>' +
        esc("Water year " + year + ": " + Number(val).toFixed(2) + " inches") + "</title></path>");
    });

    var yr;
    [[record.median, "median " + record.median], [record.mean, "mean " + record.mean]].forEach(function (ref) {
      if (ref[0] == null) return;
      p.push('<line x1="' + L + '" y1="' + Y(ref[0]).toFixed(1) + '" x2="' + (L + PW) + '" y2="' + Y(ref[0]).toFixed(1) +
        '" stroke="' + RAIN.ink + '" stroke-width="1" opacity="0.55"/>');
      p.push('<text x="' + (L + PW + 6) + '" y="' + (Y(ref[0]) + 3.5).toFixed(1) + '" font-size="10.5" fill="' +
        RAIN.ink + '" opacity="0.85">' + esc(ref[1]) + "</text>");
    });

    /* Selective direct labels: the extremes in view, plus whichever year the
       reader has looked up. Tall bars label above the cap; short bars label on
       their own row below the axis with a leader line, so no neighbouring
       column can crop them. */
    var marked = {};
    var ordered = years.slice().sort(function (a, b) { return totals[b] - totals[a]; });
    ordered.slice(0, 3).forEach(function (y) { marked[y] = 1; });
    ordered.slice(-2).forEach(function (y) { marked[y] = 1; });
    if (selectedWy && totals[selectedWy] != null) marked[selectedWy] = 1;
    Object.keys(marked).map(Number).forEach(function (year) {
      var val = totals[year];
      /* Centred text is clamped inside the plot so the first and last columns'
         labels cannot run off the edge. Measured, not hoped for. */
      var x = Math.min(Math.max(X(year) + bandW / 2, L + 20), L + PW - 20);
      var lab = Number(val).toFixed(2).replace(/0$/, "");
      if (Y(val) > T + PH * 0.5) {
        p.push('<line x1="' + x.toFixed(1) + '" y1="' + (T + PH + 2) + '" x2="' + x.toFixed(1) + '" y2="' + (T + PH + 26) +
          '" stroke="' + RAIN.muted + '" stroke-width="1" opacity="0.5"/>');
        p.push('<text x="' + x.toFixed(1) + '" y="' + (T + PH + 37) + '" text-anchor="middle" font-size="10.5" fill="' +
          RAIN.ink + '" stroke="' + RAIN.surface + '" stroke-width="3" paint-order="stroke" ' +
          'style="font-variant-numeric:tabular-nums">' + year + ": " + esc(lab) + "</text>");
      } else {
        p.push('<text x="' + x.toFixed(1) + '" y="' + (Y(val) - 8).toFixed(1) + '" text-anchor="middle" font-size="10.5" fill="' +
          RAIN.ink + '" stroke="' + RAIN.surface + '" stroke-width="3" paint-order="stroke" ' +
          'style="font-variant-numeric:tabular-nums">' + esc(lab) + "</text>");
        p.push('<text x="' + x.toFixed(1) + '" y="' + (Y(val) - 19).toFixed(1) + '" text-anchor="middle" font-size="10" fill="' +
          RAIN.muted + '" stroke="' + RAIN.surface + '" stroke-width="3" paint-order="stroke">' + year + "</text>");
      }
    });

    p.push('<line x1="' + L + '" y1="' + (T + PH) + '" x2="' + (L + PW) + '" y2="' + (T + PH) + '" stroke="' + RAIN.grid + '" stroke-width="1"/>');
    var tick = span > 40 ? 10 : (span > 12 ? 5 : 2);
    for (yr = Math.ceil(y0 / tick) * tick; yr <= y1; yr += tick) {
      p.push('<text x="' + (X(yr) + bandW / 2).toFixed(1) + '" y="' + (T + PH + 15) + '" text-anchor="middle" font-size="11" fill="' +
        RAIN.muted + '" style="font-variant-numeric:tabular-nums">' + yr + "</text>");
    }
    p.push('<text x="' + L + '" y="' + (H - 8) + '" font-size="10.5" fill="' + RAIN.muted + '">' +
      esc("Water years at the Ben Lomond No. 4 gauge. Years missing more than five days of record are omitted.") + "</text>");
    p.push("</svg>");
    return p.join("");
  }

  /* ---------- lookups ---------- */

  function rainYearLookup(payload, wy) {
    var totals = (payload || {}).totals || {};
    var record = (payload || {}).record || {};
    wy = +wy;
    if (!wy) return null;
    var excluded = ((payload || {}).excluded || []).filter(function (r) { return r.wy === wy; })[0];
    if (totals[wy] == null) {
      if (!excluded) return { wy: wy, known: false };
      return {
        wy: wy, known: true, reportable: false, inches: excluded.inches,
        missing: excluded.missing, partial: !!excluded.partial
      };
    }
    var ranked = Object.keys(totals).map(Number).sort(function (a, b) { return totals[b] - totals[a]; });
    var rank = ranked.indexOf(wy) + 1;
    var inches = totals[wy];
    return {
      wy: wy, known: true, reportable: true, inches: inches, rank: rank, of: ranked.length,
      driestRank: ranked.length - rank + 1,
      pctOfMedian: record.median ? Math.round((inches / record.median) * 100) : null
    };
  }

  function rainOrdinal(n) {
    if (n == null) return "";
    var mod100 = n % 100, mod10 = n % 10;
    if (mod100 >= 11 && mod100 <= 13) return n + "th";
    if (mod10 === 1) return n + "st";
    if (mod10 === 2) return n + "nd";
    if (mod10 === 3) return n + "rd";
    return n + "th";
  }

  function rainLookupMessage(look) {
    if (!look) return "";
    if (!look.known) {
      return "Water year " + look.wy + " is not in this record.";
    }
    if (!look.reportable) {
      var why = look.partial
        ? "that water year is not finished yet"
        : look.missing + " days have no reading, more than the five this record allows";
      return "Water year " + look.wy + " is not reportable: " + why + ". " +
        "The days that were recorded add up to " + rainInches(look.inches) +
        ", which is a floor, not a total. It is left out of the averages and the chart rather than estimated.";
    }
    var side = look.rank <= look.of / 2
      ? rainOrdinal(look.rank) + " wettest"
      : rainOrdinal(look.driestRank) + " driest";
    return "Water year " + look.wy + ": " + rainInches(look.inches) + ", " + side +
      " of the " + look.of + " reportable years" +
      (look.pctOfMedian != null ? ", " + look.pctOfMedian + " percent of the median year" : "") + ".";
  }

  function rainExtremesHTML(payload) {
    function table(rows, heading) {
      if (!rows || !rows.length) return "";
      return "<table class=\"bcl-rain-table\"><caption>" + esc(heading) + "</caption><thead><tr>" +
        "<th scope=\"col\">Rank</th><th scope=\"col\">Water year</th><th scope=\"col\">Inches</th></tr></thead><tbody>" +
        rows.map(function (r) {
          return "<tr><th scope=\"row\">" + esc(rainOrdinal(r.rank)) + "</th><td>" + esc(r.wy) +
            "</td><td>" + esc(Number(r.inches).toFixed(2)) + "</td></tr>";
        }).join("") + "</tbody></table>";
    }
    return '<div class="bcl-rain-two">' +
      table((payload || {}).wettest, "Wettest water years on record") +
      table((payload || {}).driest, "Driest water years on record") +
      "</div>";
  }

  function rainStormsHTML(payload) {
    var current = (payload || {}).current || {};
    var rows = current.storms || [];
    if (!rows.length) {
      return "<p>No storm in water year " + esc(current.wy || "") + " has yet totalled half an inch at this gauge" +
        (current.missing_days ? ", among the days that were recorded" : "") +
        ". Storm totals appear here as the season's rain arrives.</p>";
    }
    return '<table class="bcl-rain-table"><caption>' +
      esc("Storms of half an inch or more, water year " + (current.wy || "") +
        ". A storm here is a run of consecutive days with measurable rain at this one gauge.") +
      "</caption><thead><tr><th scope=\"col\">Dates</th><th scope=\"col\">Days</th>" +
      "<th scope=\"col\">Total</th><th scope=\"col\">Wettest day</th></tr></thead><tbody>" +
      rows.map(function (s) {
        var when = s.start === s.end ? rainLongDate(s.start)
          : rainLongDate(s.start) + " to " + rainLongDate(s.end);
        return "<tr><th scope=\"row\">" + esc(when) + (s.incomplete
          ? ' <span class="bcl-rain-flag">gap alongside, total incomplete</span>' : "") +
          "</th><td>" + esc(s.days) + "</td><td>" + esc(Number(s.inches).toFixed(2)) +
          "</td><td>" + esc(Number(s.wettest_day).toFixed(2)) + "</td></tr>";
      }).join("") + "</tbody></table>";
  }

  /* The controls row. Every child is either a label-plus-control pair or a
     full-width sibling with an explicit order, never a message tucked inside a
     control group: a flex row with align-items:flex-end would otherwise leave
     the two selects sitting at different heights the moment the aria-live
     region fills. Tested filled, not just empty. */
  function rainControlsHTML(payload, message) {
    var totals = (payload || {}).totals || {};
    var excluded = ((payload || {}).excluded || []);
    var options = Object.keys(totals).map(Number).sort(function (a, b) { return b - a; })
      .map(function (wy) { return '<option value="' + wy + '">' + wy + "</option>"; });
    var gappy = excluded.map(function (r) { return r.wy; }).sort(function (a, b) { return b - a; })
      .map(function (wy) { return '<option value="' + wy + '">' + wy + " (not reportable)</option>"; });
    return '<div class="bcl-rain-controls">' +
      '<div class="bcl-rain-field"><label for="bcl-rain-year">Look up a water year</label>' +
      '<select id="bcl-rain-year"><option value="">Choose a year</option>' +
      options.join("") + gappy.join("") + "</select></div>" +
      '<div class="bcl-rain-field"><label for="bcl-rain-scope">Show</label>' +
      '<select id="bcl-rain-scope"><option value="all">Every reportable year</option>' +
      '<option value="recent">The last twenty reportable years</option></select></div>' +
      '<p class="bcl-rain-msg" id="bcl-rain-msg" role="status" aria-live="polite">' +
      esc(message || "") + "</p></div>";
  }

  function rainMethodHTML(payload) {
    var record = (payload || {}).record || {};
    var excluded = (payload || {}).excluded || [];
    var named = excluded.filter(function (r) { return !r.partial; })
      .map(function (r) { return r.wy; });
    return "<h3>How this is measured, and where it is silent</h3>" +
      "<p>Rain here is counted by <strong>water year</strong>, October 1 through September 30, named for the " +
      "calendar year it ends in. A water year holds exactly one winter, which is how storms actually arrive. " +
      "Splitting rainfall by calendar year cuts every wet season in half.</p>" +
      "<p>Of the " + esc((record.last_water_year || 0) - (record.first_water_year || 0) + 1) +
      " water years this gauge has recorded, <strong>" + esc(record.reportable_years || 0) +
      "</strong> are complete enough to report, meaning five or fewer days with no reading. " +
      "Those " + esc(record.reportable_years || 0) + " years, " + esc(record.first_reportable || "") +
      " through " + esc(record.last_reportable || "") + ", are the only ones behind the averages, the " +
      "percentile bands and the rankings on this page. The rest are named and left out rather than patched: " +
      esc(named.slice(0, 30).join(", ")) + ". Estimating a missing storm would make the chart look " +
      "complete and the numbers wrong.</p>" +
      "<p>The median water year here is <strong>" + esc(rainInches(record.median)) +
      "</strong> and the average is <strong>" + esc(rainInches(record.mean)) +
      "</strong>. The gap between them is the point: a handful of enormous years pull the average above the " +
      "year you are actually likely to get, so the median is the better number for sizing a culvert or a tank. " +
      (record.wettest_day ? "The wettest single day in the whole record is " +
        esc(rainLongDate(record.wettest_day.date)) + ", at " + esc(rainInches(record.wettest_day.inches)) + ". " : "") +
      "</p>" +
      "<p>One gauge is not a valley. Ben Lomond No. 4 sits at 435 feet, about five miles down-canyon from " +
      "downtown Boulder Creek, and rainfall at your own place will differ with elevation, canyon and aspect. " +
      "It is used here because it is the only nearby gauge with a record long enough to say what normal means. " +
      'The <a href="' + RAIN.article + '">full write-up of this record</a> covers how closely Boulder Creek ' +
      "tracks it.</p>";
  }

  function initRain(root) {
    root.innerHTML = '<div class="bcl-count">Loading the rainfall record…</div>';
    fetchJSON(REPO + "/data/" + RAIN.file).then(function (payload) {
      if (!payload || !payload.current || !payload.band || !payload.totals) {
        throw new Error("unexpected shape");
      }
      var today = rainPacificDay();
      var scope = "all", selected = null;

      root.innerHTML =
        rainFreshnessHTML(payload, today) +
        rainStatsHTML(payload) +
        '<div class="bcl-note bcl-rain-gap">' + esc(rainGapNote(payload.current)) + "</div>" +
        "<h3>This water year against the record</h3>" +
        '<div class="bcl-rain-chart" id="bcl-rain-season"></div>' +
        rainSeasonLegendHTML(payload) +
        rainMonthTable(payload) +
        "<h3>Every water year on record</h3>" +
        rainControlsHTML(payload, "") +
        '<div class="bcl-rain-chart" id="bcl-rain-totals"></div>' +
        rainExtremesHTML(payload) +
        "<h3>Storms this water year</h3>" +
        '<div id="bcl-rain-storms">' + rainStormsHTML(payload) + "</div>" +
        rainMethodHTML(payload) +
        '<div class="bcl-note">This page is a record, not a warning. For road conditions, air quality, the ' +
        'river gauge and official alerts, use <a href="' + RAIN.status + '">Mountain Status</a>. In an ' +
        "emergency, call 911.</div>";

      root.querySelector("#bcl-rain-season").innerHTML = rainSeasonChart(payload);

      var totalsEl = root.querySelector("#bcl-rain-totals");
      var msgEl = root.querySelector("#bcl-rain-msg");
      var yearEl = root.querySelector("#bcl-rain-year");
      var scopeEl = root.querySelector("#bcl-rain-scope");

      function draw() {
        totalsEl.innerHTML = rainTotalsChart(payload, scope, selected);
      }
      draw();

      yearEl.addEventListener("change", function () {
        selected = yearEl.value ? +yearEl.value : null;
        msgEl.textContent = selected ? rainLookupMessage(rainYearLookup(payload, selected)) : "";
        draw();
      });
      scopeEl.addEventListener("change", function () {
        scope = scopeEl.value === "recent" ? "recent" : "all";
        draw();
      });
    }).catch(function () {
      unavailable(root, "The rainfall record",
        'That is not a statement about rain, drought, or how wet this season has been. ' +
        'For current conditions use <a href="' + RAIN.status + '">Mountain Status</a> and the ' +
        '<a href="' + RAIN.nws + '" target="_blank" rel="noopener">National Weather Service</a>.');
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

  /* ---------- site search -------------------------------------------------
     One overlay searching everything: articles, businesses, food, events,
     jobs, rentals. The index is a purpose-built file (data/search-index.json,
     ~196KB, 723 records) fetched LAZILY on first open, so no page pays for it
     unless the reader actually searches. articles.json itself is ~1.4MB and
     would be absurd to load for this.

     The trigger is injected into the existing nav by JS, so shipping this
     needs no Code Injection edit - only the usual SHA repin. */

  var SEARCH_TYPES = {
    page: "Pages",
    business: "Businesses",
    food: "Food & Drink",
    article: "Around Town",
    event: "Events",
    job: "Jobs",
    rental: "Rentals"
  };
  /* Order results by what a resident most often wants, not alphabetically. */
  var SEARCH_ORDER = ["page", "business", "food", "article", "event", "job", "rental"];

  function searchTerms(q) {
    return String(q || "").toLowerCase().split(/[^a-z0-9']+/).filter(function (t) {
      return t.length > 1;
    });
  }

  /* Score one record. Word-boundary and prefix hits beat mid-word ones, and a
     name hit beats a body hit, so "plumb" ranks a plumber above an article
     that mentions plumbing once. Returns 0 when any term is missing, making
     multi-word queries AND rather than OR. */
  function scoreRecord(rec, terms) {
    if (!terms.length) return 0;
    var name = (rec.n || "").toLowerCase();
    var snip = (rec.s || "").toLowerCase();
    var keys = (rec.k || "").toLowerCase();
    var total = 0;
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i], s = 0;
      if (name === t) s = 120;
      else if (name.indexOf(t) === 0) s = 90;
      else if (new RegExp("\\b" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(name)) s = 70;
      else if (name.indexOf(t) >= 0) s = 40;
      if (!s && keys.indexOf(t) >= 0) s = 25;
      if (!s && snip.indexOf(t) >= 0) s = 12;
      if (!s) return 0;
      total += s;
    }
    return total;
  }

  function searchRecords(records, q, limit) {
    var terms = searchTerms(q);
    if (!terms.length) return [];
    var hits = [];
    for (var i = 0; i < records.length; i++) {
      var sc = scoreRecord(records[i], terms);
      if (sc > 0) hits.push({ rec: records[i], score: sc, i: i });
    }
    hits.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.i - b.i;                      /* stable: index order breaks ties */
    });
    return hits.slice(0, limit || 40);
  }

  function groupHits(hits) {
    var by = {};
    hits.forEach(function (h) { (by[h.rec.t] = by[h.rec.t] || []).push(h.rec); });
    return SEARCH_ORDER.filter(function (t) { return by[t] && by[t].length; })
      .map(function (t) { return { type: t, label: SEARCH_TYPES[t] || t, items: by[t] }; });
  }

  function initSiteSearch() {
    if (document.getElementById("bcl-search-btn")) return;
    /* A comma selector returns the first match in DOCUMENT ORDER, not the
       first selector that matches - so ".header-actions, .header-nav, header"
       returned <header> itself and the button was appended as its last child,
       outside the visible nav row. Ask for each candidate separately, in
       priority order, and only accept one that is actually rendered. */
    /* DELIBERATE FLOATING BUTTON, not a header mount.
       Two attempts to thread this into Squarespace's header both failed, for
       two different reasons, and the second one is why this approach is now
       the right one rather than a retreat:
         1. ".header-actions, .header-nav, header" resolved to <header> itself,
            because a comma selector matches in DOCUMENT ORDER. Button landed
            at x0 y1064.
         2. This theme renders TWO header instances (in-flow plus a sticky
            clone). ".header-nav-list" matched the in-flow one, so the button
            sat at y=-3682 while the visible nav reported y=0.
       A fixed-position control owns its own placement, cannot be orphaned by a
       sticky clone, needs no knowledge of Squarespace internals, and behaves
       identically on mobile. Bottom-right keeps it clear of the announcement
       bar and the sticky header. */
    var host = document.body;

    var btn = document.createElement("button");
    btn.id = "bcl-search-btn";
    btn.className = "bcl-search-btn";
    btn.type = "button";
    btn.setAttribute("aria-label", "Search Boulder Creek Local");
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<circle cx="11" cy="11" r="7"></circle><line x1="16.5" y1="16.5" x2="21" y2="21"></line></svg>' +
      '<span class="bcl-search-btn-label">Search</span>';
    btn.classList.add("bcl-search-btn--fixed");
    host.appendChild(btn);

    var overlay = null, records = null, loading = false, active = -1, rows = [];

    function close() {
      if (!overlay) return;
      overlay.remove();
      overlay = null;
      active = -1;
      document.removeEventListener("keydown", onKey, true);
      btn.focus();
    }

    function go() {
      if (active >= 0 && rows[active]) { window.location.href = rows[active].href; return true; }
      return false;
    }

    function onKey(e) {
      if (!overlay) return;
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!rows.length) return;
        e.preventDefault();
        active += (e.key === "ArrowDown" ? 1 : -1);
        if (active < 0) active = rows.length - 1;
        if (active >= rows.length) active = 0;
        rows.forEach(function (r, i) {
          r.classList.toggle("is-active", i === active);
          if (i === active && r.scrollIntoView) r.scrollIntoView({ block: "nearest" });
        });
        return;
      }
      if (e.key === "Enter" && go()) e.preventDefault();
    }

    function render(list, q) {
      var out = overlay.querySelector(".bcl-search-results");
      rows = []; active = -1;
      if (!q) { out.innerHTML = '<p class="bcl-search-hint">Search businesses, articles, events, jobs and rentals.</p>'; return; }
      if (!list.length) {
        out.innerHTML = '<p class="bcl-search-hint">Nothing matched "' + esc(q) +
          '". Try a shorter word, or <a href="/contact">tell us what is missing</a>.</p>';
        return;
      }
      var html = "";
      groupHits(list).forEach(function (g) {
        html += '<p class="bcl-search-group">' + esc(g.label) + "</p>";
        g.items.forEach(function (r) {
          html += '<a class="bcl-search-hit" href="' + esc(r.u) + '"><strong>' + esc(r.n) + "</strong>" +
            (r.s ? "<span>" + esc(r.s) + "</span>" : "") + "</a>";
        });
      });
      out.innerHTML = html;
      rows = [].slice.call(out.querySelectorAll(".bcl-search-hit"));
    }

    function open() {
      if (overlay) return;
      overlay = document.createElement("div");
      overlay.className = "bcl-search-overlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", "Search Boulder Creek Local");
      overlay.innerHTML =
        '<div class="bcl-search-panel">' +
        '<div class="bcl-search-bar">' +
        '<input type="search" class="bcl-search-input" placeholder="Search Boulder Creek Local" ' +
        'aria-label="Search Boulder Creek Local" autocomplete="off">' +
        '<button type="button" class="bcl-search-close" aria-label="Close search">Close</button>' +
        "</div>" +
        '<div class="bcl-search-results" aria-live="polite"></div>' +
        "</div>";
      document.body.appendChild(overlay);
      document.addEventListener("keydown", onKey, true);

      var input = overlay.querySelector(".bcl-search-input");
      overlay.querySelector(".bcl-search-close").addEventListener("click", close);
      overlay.addEventListener("mousedown", function (e) { if (e.target === overlay) close(); });
      input.focus();
      render([], "");

      function run() {
        var q = input.value.trim();
        if (!records) {
          overlay.querySelector(".bcl-search-results").innerHTML =
            '<p class="bcl-search-hint">Loading the index...</p>';
          return;
        }
        render(searchRecords(records, q, 40), q);
      }
      input.addEventListener("input", run);

      if (!records && !loading) {
        loading = true;
        fetchJSON(REPO + "/data/search-index.json").then(function (d) {
          records = (d && d.records) || [];
          loading = false;
          run();
        }).catch(function () {
          loading = false;
          overlay && (overlay.querySelector(".bcl-search-results").innerHTML =
            '<p class="bcl-search-hint">Search is unavailable right now. ' +
            'The <a href="/directory">directory</a> and <a href="/around-town">archive</a> still work.</p>');
        });
      }
    }

    btn.addEventListener("click", open);
    /* "/" opens search from anywhere, unless the reader is typing in a field. */
    document.addEventListener("keydown", function (e) {
      if (e.key !== "/" || overlay) return;
      var el = document.activeElement, tag = el && el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el && el.isContentEditable)) return;
      e.preventDefault();
      open();
    });
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
    initSiteSearch();
    initPromoTicker();
    initFooterToolLinks();
    if (document.getElementById("bcl-home")) initHome();
    var t = document.getElementById("bcl-today");
    if (t) initToday(t);
    var j = document.getElementById("bcl-jobs");
    if (j) initJobs(j);
    var rn = document.getElementById("bcl-rentals");
    if (rn) initRentals(rn);
    var rain = document.getElementById("bcl-rain");
    if (rain) initRain(rain);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { monthYear: monthYear, updatedSuffix: updatedSuffix, todayKey: todayKey, dayAge: dayAge, parseHours: parseHours, isOpenAt: isOpenAt, listingOpenState: listingOpenState, listingCard: listingCard, jobHourlyEquivalent: jobHourlyEquivalent, jobDateKey: jobDateKey, jobPostedWithin: jobPostedWithin, jobEmployers: jobEmployers, PAY_BANDS: PAY_BANDS, icsForEvent: icsForEvent, icsFileName: icsFileName, eventInRange: eventInRange, eventCard: eventCard, evIsOngoing: evIsOngoing, evThroughChip: evThroughChip, riverReading: riverReading, riverFloodCategories: riverFloodCategories, riverCardHTML: riverCardHTML, RIVER: RIVER, RAIN: RAIN, RAIN_WY_DAYS: RAIN_WY_DAYS, rainMonthStarts: rainMonthStarts, rainWaterYear: rainWaterYear, rainWaterYearDay: rainWaterYearDay, rainPacificDay: rainPacificDay, rainFreshness: rainFreshness, rainFreshnessHTML: rainFreshnessHTML, rainGapNote: rainGapNote, rainSeasonSummary: rainSeasonSummary, rainRankText: rainRankText, rainSkewNote: rainSkewNote, rainStatsHTML: rainStatsHTML, rainNiceMax: rainNiceMax, rainSeasonChart: rainSeasonChart, rainSeasonLegendHTML: rainSeasonLegendHTML, rainMonthTable: rainMonthTable, rainTotalsChart: rainTotalsChart, rainYearLookup: rainYearLookup, rainOrdinal: rainOrdinal, rainLookupMessage: rainLookupMessage, rainExtremesHTML: rainExtremesHTML, rainStormsHTML: rainStormsHTML, rainControlsHTML: rainControlsHTML, rainMethodHTML: rainMethodHTML, rainLongDate: rainLongDate, rainAgeWords: rainAgeWords, rainInches: rainInches, isLocal: isLocal, localityRank: localityRank, arrangeListings: arrangeListings, listingBadge: listingBadge, badgeIsBoulderCreek: badgeIsBoulderCreek, servesBoulderCreek: servesBoulderCreek, showsServesBoulderCreek: showsServesBoulderCreek, directionsUrl: directionsUrl, SLV_LOCALITIES: SLV_LOCALITIES, orderedCategoryNames: orderedCategoryNames, groupLabelOf: groupLabelOf, buildDirectoryHTML: buildDirectoryHTML, buildCategoryOptions: buildCategoryOptions, CAP_EXEMPT: CAP_EXEMPT, jobTab: jobTab, filterJobs: filterJobs, JOB_ALERTS: JOB_ALERTS, jobAlertsEndpoint: jobAlertsEndpoint, looksLikeEmail: looksLikeEmail, jobAlertsBody: jobAlertsBody, jobAlertsMessage: jobAlertsMessage, jobAlertsHTML: jobAlertsHTML, jobSalaryText: jobSalaryText, jobCard: jobCard, filterRentals: filterRentals, rentalCard: rentalCard, articleSlugFromPath: articleSlugFromPath, pageHeadingForPath: pageHeadingForPath, nextEvents: nextEvents, homeJobs: homeJobs, homeRentals: homeRentals, homeEventRow: homeEventRow, homeJobRow: homeJobRow, homeRentalRow: homeRentalRow, pickRelatedArticles: pickRelatedArticles, articleCardHTML: articleCardHTML, searchTerms: searchTerms, scoreRecord: scoreRecord, searchRecords: searchRecords, groupHits: groupHits, SEARCH_ORDER: SEARCH_ORDER };
  }
})();
