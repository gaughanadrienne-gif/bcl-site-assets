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
      ".bcl-controls input,.bcl-controls select{font-family:Inter,Arial,sans-serif;font-size:.95rem;padding:10px 14px;border:1px solid #cfc9b8;border-radius:8px;background:#fffdf8 !important;color:#1c2a26 !important;}",
      ".bcl-controls input{flex:1 1 220px;}",
      ".bcl-controls select{flex:0 1 auto;max-width:100%;}",
      ".bcl-count{font-family:'IBM Plex Mono',monospace;font-size:.72rem;letter-spacing:.08em;color:#67716b !important;margin:0 0 14px;}",
      ".bcl-card{background:#fffdf8 !important;border:1px solid #e3ddcf;border-radius:10px;padding:16px 18px;margin:0 0 12px;}",
      ".bcl-card .bcl-name{font-weight:600;font-size:1.05rem;color:#173f36 !important;}",
      ".bcl-card .bcl-sub{font-family:'IBM Plex Mono',monospace;font-size:.68rem;letter-spacing:.08em;color:#2f6754 !important;text-transform:uppercase;margin:2px 0 8px;}",
      ".bcl-card p{margin:0 0 8px;font-size:.92rem;color:#1c2a26 !important;}",
      ".bcl-meta{font-size:.85rem;color:#67716b !important;margin:2px 0;}",
      ".bcl-card a{color:#2e6b46 !important;text-decoration:underline;}",
      ".bcl-verified{font-family:'IBM Plex Mono',monospace;font-size:.66rem;letter-spacing:.06em;color:#67716b !important;margin-top:10px;}",
      ".bcl-note{background:#dde2d8;border-radius:8px;padding:12px 16px;font-size:.85rem;color:#1c2a26 !important;margin:18px 0 0;}",
      ".bcl-unavailable{background:#f5f1e7 !important;border:1px dashed #cfc9b8;border-radius:10px;padding:18px;font-size:.92rem;color:#67716b !important;}",
      ".bcl-alert{background:#8f4f45 !important;color:#fffdf8 !important;border-radius:10px;padding:14px 18px;margin:0 0 14px;}",
      ".bcl-alert a{color:#fffdf8 !important;font-weight:600;}",
      ".bcl-status-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;}",
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
    var h = '<div class="bcl-card">';
    h += '<div class="bcl-name">' + esc(l.name) + "</div>";
    h += '<div class="bcl-sub">' + esc(l.category) + (l.subcategory ? " · " + esc(l.subcategory) : "") + "</div>";
    if (l.description) h += "<p>" + esc(l.description) + "</p>";
    if (l.address) h += '<div class="bcl-meta">' + esc(l.address) + ", " + esc(l.locality || "Boulder Creek") + "</div>";
    if (l.phone) h += '<div class="bcl-meta"><a href="tel:' + esc(String(l.phone).replace(/[^0-9+]/g, "")) + '">' + esc(l.phone) + "</a></div>";
    if (l.website) h += '<div class="bcl-meta"><a href="' + esc(l.website) + '" target="_blank" rel="noopener">Visit website</a></div>';
    if (l.hours_text) h += '<div class="bcl-meta">Hours: ' + esc(l.hours_text) + " (confirm with the business)</div>";
    if (l.service_area && !l.address) h += '<div class="bcl-meta">Serves: ' + esc(l.service_area) + "</div>";
    if (l.verified_at) h += '<div class="bcl-verified">VERIFIED ' + esc(l.verified_at) + "</div>";
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
        '<select aria-label="Filter by category"><option value="">All categories</option>' +
        cats.map(function (c) { return "<option>" + esc(c) + "</option>"; }).join("") +
        "</select></div>" +
        '<div class="bcl-count"></div><div class="bcl-list"></div>' +
        '<div class="bcl-note">Every listing is verified by a person before it appears here. Inclusion is not endorsement. ' +
        'Spot something wrong or missing? <a href="/submit">Send an update</a>.</div>';

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
        list.innerHTML = rows.length
          ? rows.map(listingCard).join("")
          : '<div class="bcl-unavailable">No listings match that search. A missing business isn’t a judgment, it may just not be verified yet. <a href="/submit">Suggest it</a>.</div>';
      }
      input.addEventListener("input", render);
      select.addEventListener("change", render);
      render();
    }).catch(function () {
      unavailable(root, "The " + label + " list", 'You can still <a href="/submit">send an update</a>.');
    });
  }

  /* ---------- events ---------- */

  function initEvents(root) {
    root.innerHTML = '<div class="bcl-count">Loading events…</div>';
    fetchJSON(REPO + "/data/events.json").then(function (data) {
      var now = new Date();
      now.setHours(0, 0, 0, 0);
      var rows = (data.events || []).filter(function (e) {
        var d = new Date(e.end || e.start);
        return !isNaN(d) && d >= now;
      }).sort(function (a, b) { return new Date(a.start) - new Date(b.start); });

      if (!rows.length) {
        root.innerHTML =
          '<div class="bcl-unavailable">No verified upcoming events right now. Events appear here only after a person confirms the details with the organizer. ' +
          'Know of one? <a href="/submit">Tell us</a>.</div>';
        return;
      }
      root.innerHTML = '<div class="bcl-count">' + rows.length + " UPCOMING · UPDATED " + esc(data.updated || "") + '</div><div class="bcl-list"></div>' +
        '<div class="bcl-note">Details change. Confirm with the organizer before you go. <a href="/submit">Send a correction</a>.</div>';
      root.querySelector(".bcl-list").innerHTML = rows.map(function (e) {
        var h = '<div class="bcl-card">';
        h += '<div class="bcl-name">' + esc(e.title) + "</div>";
        h += '<div class="bcl-sub">' + esc(e.category || "Community") + "</div>";
        h += '<div class="bcl-meta">' + esc(e.start) + (e.end ? " to " + esc(e.end) : "") + (e.location ? " · " + esc(e.location) : "") + "</div>";
        if (e.description) h += "<p>" + esc(e.description) + "</p>";
        if (e.url) h += '<div class="bcl-meta"><a href="' + esc(e.url) + '" target="_blank" rel="noopener">Event details</a></div>';
        return h + "</div>";
      }).join("");
    }).catch(function () {
      unavailable(root, "The events calendar", "");
    });
  }

  /* ---------- mountain status ---------- */

  function officialLinks() {
    return '<h3>Official sources</h3><ul class="bcl-links">' +
      '<li><a href="https://www.weather.gov/mtr/" target="_blank" rel="noopener">National Weather Service, Bay Area</a> for forecasts and warnings</li>' +
      '<li><a href="https://www.cruzaware.org/" target="_blank" rel="noopener">CruzAware</a> for county emergency alerts</li>' +
      '<li><a href="https://quickmap.dot.ca.gov/" target="_blank" rel="noopener">Caltrans QuickMap</a> for Highway 9 and state routes</li>' +
      '<li><a href="https://sccroadclosure.org/" target="_blank" rel="noopener">Santa Cruz County road closures</a> for county roads</li>' +
      '<li><a href="https://pgealerts.alerts.pge.com/outage-tools/outage-map/" target="_blank" rel="noopener">PG&amp;E outage map</a> for power</li>' +
      '<li><a href="https://fire.airnow.gov/" target="_blank" rel="noopener">AirNow Fire and Smoke Map</a> for air quality</li>' +
      '<li><a href="https://www.fire.ca.gov/incidents" target="_blank" rel="noopener">CAL FIRE incidents</a> for wildfire</li>' +
      "</ul>";
  }

  function initStatus(root) {
    root.innerHTML =
      '<div class="bcl-alert">If this is an emergency, call 911. This page links to official sources; it never replaces them.</div>' +
      '<div class="bcl-nws"><div class="bcl-count">Checking National Weather Service…</div></div>' +
      officialLinks();

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
