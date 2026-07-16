/* Boulder Creek Local — embedded tools (GitHub + jsDelivr, no app server).
 * Renders into whichever of these divs exists on the page:
 *   #bcl-directory  #bcl-food  #bcl-events  #bcl-status
 * Data: /data/*.json in this repo, served via jsDelivr.
 * Trust rules: missing data is "unavailable", never an inferred all-clear.
 * Emergencies always route to 911 and official agencies.
 */
(function () {
  "use strict";

  var REPO = "https://cdn.jsdelivr.net/gh/gaughanadrienne-gif/bcl-site-assets@main";
  var NWS_POINT = { lat: 37.1261, lon: -122.1222 }; // downtown Boulder Creek

  /* ---------- shared ---------- */

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function injectCSS() {
    if (document.getElementById("bcl-tools-css")) return;
    var css = [
      ".bcl-tool{font-family:Inter,Arial,sans-serif;color:#1c2a26 !important;line-height:1.5;max-width:960px;margin:0 auto;}",
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
      ".bcl-alert a{color:#fffdf8 !important;font-weight:600;}",
      ".bcl-status-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;}",
      ".bcl-event-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:12px;}",
      ".bcl-event-card{background:#fffdf8 !important;border:1px solid #e3ddcf;padding:14px 15px;display:flex;flex-direction:column;gap:5px;}",
      ".bcl-event-date{font-family:'IBM Plex Mono',monospace;font-size:.68rem;letter-spacing:.1em;color:#d56e47 !important;text-transform:uppercase;}",
      ".bcl-event-title{font-weight:600;color:#173f36 !important;font-size:.96rem;line-height:1.3;}",
      ".bcl-event-meta{font-size:.8rem;color:#67716b !important;line-height:1.4;}",
      ".bcl-event-cat{font-family:'IBM Plex Mono',monospace;font-size:.62rem;letter-spacing:.08em;color:#2f6754 !important;text-transform:uppercase;margin-top:auto;padding-top:6px;}",
      ".bcl-event-card a{color:#2e6b46 !important;font-size:.82rem;}",
      ".bcl-cat-head{display:flex;align-items:center;gap:10px;margin:28px 0 12px;}",
      ".bcl-cat-head:before{content:'';display:block;width:9px;height:16px;background:#d56e47;flex:0 0 auto;}",
      ".bcl-cat-head h3{margin:0 !important;font-size:1.3rem !important;}",
      ".bcl-cat-head span{font-family:'IBM Plex Mono',monospace;font-size:.68rem;letter-spacing:.08em;color:#67716b !important;}",
      ".bcl-dir-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;}",
      ".bcl-dir-card{background:#fffdf8 !important;border:1px solid #e3ddcf;padding:13px 14px;display:flex;flex-direction:column;gap:4px;}",
      ".bcl-dir-name{font-weight:600;color:#173f36 !important;font-size:.94rem;line-height:1.3;}",
      ".bcl-dir-sub{font-family:'IBM Plex Mono',monospace;font-size:.6rem;letter-spacing:.08em;color:#2f6754 !important;text-transform:uppercase;}",
      ".bcl-dir-desc{font-size:.8rem;color:#1c2a26 !important;line-height:1.4;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}",
      ".bcl-dir-meta{font-size:.78rem;color:#67716b !important;line-height:1.35;}",
      ".bcl-dir-links{font-size:.8rem;margin-top:2px;}",
      ".bcl-dir-links a{color:#2e6b46 !important;text-decoration:underline;}",
      ".bcl-dir-verified{font-family:'IBM Plex Mono',monospace;font-size:.58rem;letter-spacing:.06em;color:#67716b !important;margin-top:auto;padding-top:6px;}",
      ".bcl-links li{margin:6px 0;font-size:.92rem;}",
      ".bcl-links a{color:#2e6b46 !important;}",
      "@media (max-width:640px){.bcl-controls{flex-direction:column;}}"
    ].join("");
    var el = document.createElement("style");
    el.id = "bcl-tools-css";
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
    h += '<div class="bcl-dir-name">' + esc(l.name) + "</div>";
    if (l.subcategory) h += '<div class="bcl-dir-sub">' + esc(l.subcategory) + "</div>";
    if (l.description) h += '<div class="bcl-dir-desc">' + esc(l.description) + "</div>";
    if (l.address) h += '<div class="bcl-dir-meta">' + esc(l.address) + "</div>";
    else if (l.service_area) h += '<div class="bcl-dir-meta">Serves: ' + esc(l.service_area) + "</div>";
    if (l.hours_text) h += '<div class="bcl-dir-meta">' + esc(String(l.hours_text).replace(/\s*\(?confirm with the business\)?\.?/gi, "")) + "</div>";
    var links = [];
    if (l.phone) links.push('<a href="tel:' + esc(String(l.phone).replace(/[^0-9+]/g, "")) + '">' + esc(l.phone) + "</a>");
    if (l.website) links.push('<a href="' + esc(l.website) + '" target="_blank" rel="noopener">Website</a>');
    if (links.length) h += '<div class="bcl-dir-links">' + links.join(" · ") + "</div>";
    return h + "</div>";
  }

  function initListings(root, dataFile, label) {
    root.innerHTML = '<div class="bcl-count">Loading ' + esc(label) + "…</div>";
    fetchJSON(REPO + "/data/" + dataFile).then(function (data) {
      var all = data.listings || [];
      var cats = [];
      all.forEach(function (l) { if (cats.indexOf(l.category) < 0) cats.push(l.category); });
      cats.sort();

      root.innerHTML =
        '<div class="bcl-controls">' +
        '<input type="search" placeholder="Search by name or service" aria-label="Search listings">' +
        '<select aria-label="Jump to category"><option value="">All categories</option>' +
        cats.map(function (c) { return "<option>" + esc(c) + "</option>"; }).join("") +
        "</select></div>" +
        '<div class="bcl-count"></div><div class="bcl-list"></div>' +
        '<div class="bcl-note">Something wrong or missing? <a href="/submit">Send an update</a>.</div>';

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
          list.innerHTML = '<div class="bcl-unavailable">No listings match that search. A missing business isn’t a judgment, it may just not be verified yet. <a href="/submit">Suggest it</a>.</div>';
          return;
        }
        // group by category, headings + card grids
        var byCat = {};
        rows.forEach(function (l) { (byCat[l.category] = byCat[l.category] || []).push(l); });
        list.innerHTML = Object.keys(byCat).sort().map(function (c) {
          return '<div class="bcl-cat-head"><h3>' + esc(c) + "</h3><span>" + byCat[c].length + "</span></div>" +
            '<div class="bcl-dir-grid">' + byCat[c].map(listingCard).join("") + "</div>";
        }).join("");
      }
      input.addEventListener("input", render);
      select.addEventListener("change", render);
      render();
    }).catch(function () {
      unavailable(root, "The " + label + " list", 'You can still <a href="/submit">send an update</a>.');
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
          'Know of one? <a href="/submit">Tell us</a>.</div>';
        return;
      }

      var cats = [];
      all.forEach(function (e) { var c = e.category || "Community"; if (cats.indexOf(c) < 0) cats.push(c); });
      cats.sort();

      root.innerHTML =
        '<div class="bcl-controls">' +
        '<input type="search" placeholder="Search events" aria-label="Search events">' +
        '<select class="bcl-ev-cat" aria-label="Filter by type"><option value="">All types</option>' +
        cats.map(function (c) { return "<option>" + esc(c) + "</option>"; }).join("") + "</select>" +
        '<select class="bcl-ev-sort" aria-label="Sort events"><option value="date">Soonest first</option><option value="name">Name A to Z</option><option value="type">By type</option></select>' +
        "</div>" +
        '<div class="bcl-count"></div><div class="bcl-event-grid"></div>' +
        '<div class="bcl-note">Details change. Confirm with the organizer before you go. <a href="/submit">Send a correction or add an event</a>.</div>';

      var input = root.querySelector("input");
      var catSel = root.querySelector(".bcl-ev-cat");
      var sortSel = root.querySelector(".bcl-ev-sort");
      var count = root.querySelector(".bcl-count");
      var grid = root.querySelector(".bcl-event-grid");

      function render() {
        var q = (input.value || "").toLowerCase();
        var cat = catSel.value;
        var rows = all.filter(function (e) {
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
        grid.innerHTML = rows.length ? rows.map(function (e) {
          var h = '<div class="bcl-event-card">';
          h += '<div class="bcl-event-date">' + evDateChip(e.start) + "</div>";
          h += '<div class="bcl-event-title">' + esc(e.title) + "</div>";
          if (e.location) h += '<div class="bcl-event-meta">' + esc(e.location) + "</div>";
          if (e.url) h += '<a href="' + esc(e.url) + '" target="_blank" rel="noopener">Details</a>';
          h += '<div class="bcl-event-cat">' + esc(e.category || "Community") + "</div>";
          return h + "</div>";
        }).join("") : '<div class="bcl-unavailable">No events match. Try clearing the search or type filter.</div>';
      }
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

  function officialLinks() {
    return '<h3>Official sources</h3><ul class="bcl-links">' +
      '<li><a href="https://www.weather.gov/mtr/" target="_blank" rel="noopener">National Weather Service, Bay Area</a> for forecasts and warnings</li>' +
      '<li><a href="https://www.cruzaware.org/" target="_blank" rel="noopener">CruzAware</a> for county emergency alerts</li>' +
      '<li><a href="https://quickmap.dot.ca.gov/" target="_blank" rel="noopener">Caltrans QuickMap</a> for Highway 9 and state routes</li>' +
      '<li><a href="https://experience.arcgis.com/experience/09f637a4d84946edbb5aab283766c9de/" target="_blank" rel="noopener">Santa Cruz County Road Closure Dashboard</a> for county roads</li>' +
      '<li><a href="https://pgealerts.alerts.pge.com/outage-tools/outage-map/" target="_blank" rel="noopener">PG&amp;E outage map</a> for power</li>' +
      '<li><a href="https://fire.airnow.gov/" target="_blank" rel="noopener">AirNow Fire and Smoke Map</a> for air quality</li>' +
      '<li><a href="https://www.fire.ca.gov/incidents" target="_blank" rel="noopener">CAL FIRE incidents</a> for wildfire</li>' +
      "</ul>";
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
          '<div class="bcl-sub">US AQI ' + Math.round(c.us_aqi) + (c.pm2_5 != null ? " · PM2.5 " + Math.round(c.pm2_5) + " µg/m³" : "") + "</div>" +
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
        var rows = (d.data || []).map(function (r) { return r.lcs; }).filter(function (l) {
          var b = (l.location || {}).begin || {};
          var c = l.closure || {};
          var active = c.code1097 && String(c.code1097).trim() !== "" && (!c.code1098 || String(c.code1098).trim() === "");
          return active && b.beginCounty === "Santa Cruz" && ROUTES[b.beginRoute];
        }).slice(0, 6);
        var h = "";
        if (rows.length) {
          h = '<div class="bcl-name">Caltrans closures on state highways: ' + rows.length + "</div>";
          rows.forEach(function (l) {
            var b = l.location.begin, c = l.closure;
            h += '<div class="bcl-meta">' + esc(b.beginRoute) + " near " + esc(b.beginNearbyPlace || b.beginLocationName || "?") + ": " +
              esc((c.typeOfClosure || "closure").toLowerCase()) + (c.estimatedDelay && c.estimatedDelay !== "None" ? ", est. delay " + esc(c.estimatedDelay) : "") + "</div>";
          });
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
      '<div class="bcl-name">Power: check PG&amp;E for your address</div>' +
      '<p>PG&amp;E doesn\'t offer a public feed this page can safely embed, so check the <a href="https://pgealerts.alerts.pge.com/outage-tools/outage-map/" target="_blank" rel="noopener">live outage map</a> for 95006, and sign up for <a href="https://www.pge.com/en/outages-and-safety/outage-preparedness-and-support/outage-alerts.html" target="_blank" rel="noopener">address-based outage alerts</a>. Downed line: call 911, then PG&amp;E at 1-800-743-5000.</p></div>' +
      '<div class="bcl-card">' +
      '<div class="bcl-name">Fire and medical calls: PulsePoint</div>' +
      '<p>Active and recent Boulder Creek FPD calls are on the <a href="https://web.pulsepoint.org/?agencies=44020" target="_blank" rel="noopener">live PulsePoint feed</a> with the units responding. Wildfire: <a href="https://www.watchduty.org/" target="_blank" rel="noopener">Watch Duty</a> and <a href="https://www.fire.ca.gov/incidents" target="_blank" rel="noopener">CAL FIRE incidents</a>.</p></div>';
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
      sirensLinks() +
      officialLinks();

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

  /* ---------- boot ---------- */

  function boot() {
    injectCSS();
    var d = document.getElementById("bcl-directory");
    if (d) initListings(d, "directory.json", "directory");
    var f = document.getElementById("bcl-food");
    if (f) initListings(f, "food.json", "food and drink");
    var e = document.getElementById("bcl-events");
    if (e) initEvents(e);
    var s = document.getElementById("bcl-status");
    if (s) initStatus(s);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
