/* ========================================================================
   BOULDER CREEK LOCAL, FOOD FALLBACK
   Generated 2026-09-25 | 26 records | 14,290 characters

   THIS IS A CONSOLE SCRIPT, NOT THE HTML. It is meant to look like code.
   It finds ONLY the <div id="bcl-food"> block inside the page code block
   and replaces that, leaving everything else exactly as it is.

   Do NOT paste the .html file into the block instead. That file is only
   the fragment, and it would wipe the rest of the block.

   STEPS
     1. Pages > the food page.
     2. SINGLE-click the code block, then click the pencil to open it.
        (Double-clicking has wedged this editor before.)
     3. Open the browser console and paste this whole file.
     4. Read the green console line, then CLICK SAVE YOURSELF.
        The script never saves for you.

   If it says "Already up to date", the page is current: do NOT save.
   ======================================================================== */

/* BCL static listing fallback: food
   Open the page's custom-HTML code block in the editor FIRST
   (Pages > the page > single-click the code block > pencil icon),
   then paste this whole file into the console. It edits the open
   editor; you still have to click SAVE yourself. */
(function () {
  /* Find the CodeMirror 6 EditorView WITHOUT relying on `.cmView`,
     which this Squarespace build does not expose (observed 2026-07-27:
     .cm-content and .cm-editor both present, .cmView undefined). We
     scan DOM nodes for any property holding an object that quacks like
     an EditorView, then fall back to walking the React fiber. Reading
     the doc via textContent is NOT an option - CM6 virtualises the
     viewport, so only rendered lines exist in the DOM. */
  function isView(v) {
    return v && v.state && v.state.doc && typeof v.dispatch === 'function' && typeof v.state.doc.toString === 'function';
  }
  function scan(node) {
    if (!node) return null;
    var names;
    try { names = Object.getOwnPropertyNames(node); } catch (e) { return null; }
    for (var i = 0; i < names.length; i++) {
      var v;
      try { v = node[names[i]]; } catch (e) { continue; }
      if (isView(v)) return v;
      if (v && isView(v.view)) return v.view;
    }
    return null;
  }
  function viaFiber(node) {
    for (var k in node) {
      if (k.indexOf('__reactFiber') !== 0 && k.indexOf('__reactInternal') !== 0) continue;
      var f = node[k], hops = 0;
      while (f && hops++ < 40) {
        var bag = [f.stateNode, f.memoizedState, f.memoizedProps];
        for (var b = 0; b < bag.length; b++) {
          var o = bag[b];
          if (isView(o)) return o;
          if (o && isView(o.view)) return o.view;
          if (o && o.current && isView(o.current)) return o.current;
        }
        f = f.return;
      }
    }
    return null;
  }
  var content = document.querySelector('.cm-content');
  var editor = document.querySelector('.cm-editor');
  if (!content && !editor) throw new Error('ABORT: no CodeMirror editor on this page - open the code block first');
  var view = null, how = '';
  var tries = [
    ['cmView', function () { return content && content.cmView && content.cmView.view; }],
    ['scan(.cm-content)', function () { return scan(content); }],
    ['scan(.cm-editor)', function () { return scan(editor); }],
    ['scan(parent)', function () { return scan(editor && editor.parentNode); }],
    ['fiber(.cm-editor)', function () { return viaFiber(editor || content); }]
  ];
  for (var t = 0; t < tries.length && !view; t++) {
    var got = null;
    try { got = tries[t][1](); } catch (e) {}
    if (isView(got)) { view = got; how = tries[t][0]; }
  }
  if (!view) throw new Error('ABORT: found the editor element but could not reach its EditorView. Send Claude this: cm-content=' + !!content + ' cm-editor=' + !!editor);
  console.log('EditorView found via: ' + how);
  var src = view.state.doc.toString();
  var FRAG = "<div id=\"bcl-food\"><!--BCL_SR_START-->\n<div class=\"bcl-sr-fallback\">\n<p>26 verified listings, last updated 2026-09-25. This list is the full record set; the search and category filters above load with the page.</p>\n<h3>Bakery &amp; Sweets in Boulder Creek and the San Lorenzo Valley</h3>\n<ul>\n<li><strong><a href=\"https://www.butterlatethannever.com/\" rel=\"nofollow noopener\">Butter Late Than Never Baking Co.</a></strong> <em>Cottage bakery, online orders only</em> Licensed Boulder Creek cottage bakery selling small-batch baked goods through its online shop. No storefront.<br><span class=\"bcl-sr-meta\">Boulder Creek \u00b7 <a href=\"tel:5103905548\">(510) 390-5548</a> \u00b7 Service area: Local delivery and California distribution \u00b7 Verified 2026-09-25</span></li>\n<li><strong><a href=\"https://www.facebook.com/Dessertfirstbskery/\" rel=\"nofollow noopener\">Dessert First Bakery</a></strong> <em>Custom cakes, by order (no storefront)</em> Custom wedding and celebration cakes and desserts made with all-natural ingredients, no preservatives or additives. No public storefront: it shares a kitchen with Jenna Sue&#x27;s Cafe, where some of its baked goods are sold, and custom work is ordered directly through the bakery.<br><span class=\"bcl-sr-meta\">Boulder Creek \u00b7 Service area: Boulder Creek and the San Lorenzo Valley \u00b7 Verified 2026-09-25</span></li>\n<li><strong><a href=\"https://www.instagram.com/doughandahlias/\" rel=\"nofollow noopener\">Dough and Dahlias</a></strong> <em>Sourdough and flower farm stand</em> Home-based Ben Lomond cottage operation offering homemade sourdough breads and baked goods for local pickup, along with cut-flower bouquets grown in the owner&#x27;s garden.<br><span class=\"bcl-sr-meta\">Ben Lomond \u00b7 Service area: Ben Lomond and the San Lorenzo Valley, local pickup \u00b7 Verified 2026-09-25</span></li>\n<li><strong><a href=\"https://www.wildstonebakery.com/\" rel=\"nofollow noopener\">Wildstone Bakery</a></strong> <em>Sourdough bakery, farmers markets only</em> Boulder Creek bakery producing naturally fermented breads, bagels, pastries, and seasonal tarts for regional farmers markets.<br><span class=\"bcl-sr-meta\">Boulder Creek \u00b7 <a href=\"tel:8312520706\">(831) 252-0706</a> \u00b7 Downtown Santa Cruz Farmers Market Wednesdays 12:30-5:00 p.m.; the Ben Lomond Village Market season ends with the Saturday, October 3, 2026 market, 10:00 a.m.-2:00 p.m. \u00b7 Service area: Boulder Creek base; Santa Cruz and Ben Lomond farmers markets \u00b7 Verified 2026-09-25</span></li>\n</ul>\n<h3>Bar &amp; Nightlife in Boulder Creek and the San Lorenzo Valley</h3>\n<ul>\n<li><strong><a href=\"https://www.bigbasinvineyards.com/visit-2/\" rel=\"nofollow noopener\">Big Basin Vineyards Estate Vineyard &amp; Tasting Room</a></strong> <em>Winery and tasting room</em> Estate winery offering weekend wine tastings at its Boulder Creek vineyard.<br><span class=\"bcl-sr-meta\">830 Memory Lane, Boulder Creek \u00b7 Saturday-Sunday 12:00-5:00 p.m. \u00b7 Verified 2026-09-25</span></li>\n<li><strong><a href=\"https://feltonmusichall.com/\" rel=\"nofollow noopener\">Felton Music Hall</a></strong> <em>Live music venue and bar</em> Live-music venue in the Santa Cruz Mountains presenting local and touring acts across genres, with craft food and cocktails served in-house from a full bar.<br><span class=\"bcl-sr-meta\">6275 Highway 9, Felton \u00b7 <a href=\"tel:8317047113\">831-704-7113</a> \u00b7 Verified 2026-07-17</span></li>\n<li><strong><a href=\"https://www.henflingsslv.com/\" rel=\"nofollow noopener\">Henflings Tavern</a></strong> <em>Tavern and live-music venue</em> Longtime Santa Cruz Mountains tavern in downtown Ben Lomond, operating since 1946, with live music every weekend, a recurring Sunday Pro Jam, a full bar, food menu, and covered patio.<br><span class=\"bcl-sr-meta\">9450 Highway 9, Ben Lomond \u00b7 <a href=\"tel:8312893019\">831-289-3019</a> \u00b7 Daily 12pm-1:30am \u00b7 Verified 2026-09-25</span></li>\n<li><strong><a href=\"http://www.drinkatjoes.com/\" rel=\"nofollow noopener\">Joe&#x27;s Bar</a></strong> <em>Bar and live-music venue</em> Downtown bar and live-music venue with bands most Wednesday, Friday, and Saturday nights, karaoke on Tuesdays, and a pool tournament on Thursdays. This is a 21 and over venue.<br><span class=\"bcl-sr-meta\">13118 Highway 9, Boulder Creek \u00b7 <a href=\"tel:8313389417\">(831) 338-9417</a> \u00b7 Daily 10:00 a.m.-2:00 a.m. \u00b7 Verified 2026-09-25 \u00b7 <a href=\"/around-town/joes-bar-boulder-creek\">Read our write-up</a></span></li>\n<li><strong><a href=\"https://www.theriverrunbrookdale.com/\" rel=\"nofollow noopener\">The River Run at Brookdale Lodge</a></strong> <em>Cocktail lounge and live-music venue</em> Cocktail lounge and live-music venue at the Historic Brookdale Lodge, with weekend bands, DJ nights, sports on the big screens, and a summer beer garden concert series. Food comes from the Brookdale Diner on the same property.<br><span class=\"bcl-sr-meta\">11570 Highway 9, Brookdale \u00b7 <a href=\"tel:8316096010\">(831) 609-6010</a> \u00b7 Monday 5:00-10:00 p.m.; Tuesday-Thursday 2:00-11:00 p.m.; Friday-Saturday 2:00 p.m.-1:00 a.m.; Sunday 11:00 a.m.-10:00 p.m. \u00b7 Verified 2026-09-25</span></li>\n</ul>\n<h3>Cafe &amp; Coffee in Boulder Creek and the San Lorenzo Valley</h3>\n<ul>\n<li><strong><a href=\"https://jennasues.wordpress.com/\" rel=\"nofollow noopener\">Jenna Sue&#x27;s Cafe</a></strong> <em>Coffee shop and breakfast cafe</em> A Boulder Creek coffee shop and cafe serving espresso drinks, breakfast, sandwiches, and house-baked goods.<br><span class=\"bcl-sr-meta\">13090 Highway 9, Boulder Creek, CA 95006 \u00b7 <a href=\"tel:8313387008\">(831) 338-7008</a> \u00b7 Monday to Friday 6:00 AM to 2:30 PM, Saturday and Sunday 7:00 AM to 2:30 PM \u00b7 Verified 2026-09-25 \u00b7 <a href=\"/around-town/jenna-sues-cafe-boulder-creek\">Read our write-up</a></span></li>\n<li><strong><a href=\"https://www.facebook.com/BC.TreehouseCafe/\" rel=\"nofollow noopener\">The Tree House Cafe</a></strong> <em>Coffee shop and espresso bar</em> A cafe and espresso bar at the edge of Boulder Creek with giant redwoods growing through the interior.<br><span class=\"bcl-sr-meta\">13266 CA-9, Boulder Creek, CA 95006 \u00b7 <a href=\"tel:8316108912\">(831) 610-8912</a> \u00b7 Verified 2026-09-04 \u00b7 <a href=\"/around-town/tree-house-cafe-boulder-creek\">Read our write-up</a></span></li>\n</ul>\n<h3>Grocery &amp; Market in Boulder Creek and the San Lorenzo Valley</h3>\n<ul>\n<li><strong><a href=\"https://www.facebook.com/profile.php?id=61578081962868\" rel=\"nofollow noopener\">Doughlicious Farmstand</a></strong> <em>Farm stand</em> Home-based honor-system farm stand selling sourdough bread, baked goods and fresh eggs, open the second and fourth Saturday of each month. Address withheld because it operates from a home; open days are posted on its Facebook page.<br><span class=\"bcl-sr-meta\">Boulder Creek \u00b7 Second and fourth Saturday of each month; check its Facebook page for the next open day. \u00b7 Verified 2026-09-25</span></li>\n<li><strong><a href=\"https://www.johnniesmarket.com/\" rel=\"nofollow noopener\">Johnnie&#x27;s Super Market &amp; Liquor</a></strong> <em>Full-service grocery and liquor market</em> Independent grocery with produce, meat, seafood, bakery, cheese, beer, wine, and spirits, plus a deli counter making fresh sandwiches daily.<br><span class=\"bcl-sr-meta\">13225 Highway 9, Boulder Creek \u00b7 <a href=\"tel:8313386464\">(831) 338-6464</a> \u00b7 Daily 8:00 a.m.-9:00 p.m. \u00b7 Verified 2026-09-04</span></li>\n<li><strong><a href=\"https://wildrootsmarket.com/\" rel=\"nofollow noopener\">Wild Roots Market - Boulder Creek</a></strong> <em>Natural grocery and deli</em> Locally owned grocery with produce, meat, seafood, deli, bakery, and prepared foods.<br><span class=\"bcl-sr-meta\">13159 Central Avenue, Boulder Creek \u00b7 <a href=\"tel:8313387211\">(831) 338-7211</a> \u00b7 Daily 9:00 a.m.-9:00 p.m. \u00b7 Verified 2026-09-25</span></li>\n</ul>\n<h3>Restaurant in Boulder Creek and the San Lorenzo Valley</h3>\n<ul>\n<li><strong>Bella&#x27;s Cafe</strong> <em>Sit-down breakfast and lunch diner</em> A locally owned sit-down breakfast and lunch spot in downtown Boulder Creek, a diner rather than a coffee bar.<br><span class=\"bcl-sr-meta\">13132 Central Ave, Boulder Creek, CA 95006 \u00b7 <a href=\"tel:8312175070\">(831) 217-5070</a> \u00b7 Monday closed; Tuesday-Sunday 8:00 a.m.-2:00 p.m. \u00b7 Verified 2026-08-06 \u00b7 <a href=\"/around-town/bellas-cafe-boulder-creek\">Read our write-up</a></span></li>\n<li><strong><a href=\"https://www.brookdalediner.net/\" rel=\"nofollow noopener\">Brookdale Diner</a></strong> <em>American diner</em> 1950s-style American diner at the Historic Brookdale Lodge serving all-day breakfast, burgers, hand-spun milkshakes, fried chicken, flatbread pizza, steaks, and salads.<br><span class=\"bcl-sr-meta\">11570 Highway 9, Brookdale \u00b7 <a href=\"tel:8316096126\">(831) 609-6126</a> \u00b7 Monday-Tuesday 2:00-10:00 p.m.; Wednesday-Sunday 7:00 a.m.-10:00 p.m. \u00b7 Verified 2026-09-25</span></li>\n<li><strong><a href=\"https://www.facebook.com/p/Corazon-De-Leon-Mexican-Restaurant-61587780960114/\" rel=\"nofollow noopener\">Corazon de Leon Mexican Restaurant</a></strong> <em>Mexican restaurant</em> Ben Lomond Mexican restaurant serving Leon-style dishes from Guanajuato, opened in 2026 by longtime Boulder Creek food-truck owner Marco Rocha in the former Casa Nostra space.<br><span class=\"bcl-sr-meta\">9217 Highway 9, Ben Lomond \u00b7 <a href=\"tel:8312893014\">831-289-3014</a> \u00b7 Tuesday-Sunday 11:00 a.m.-9:00 p.m.; Monday closed. \u00b7 Verified 2026-09-25</span></li>\n<li><strong><a href=\"https://elreyleonca.com/\" rel=\"nofollow noopener\">El Rey Leon</a></strong> <em>Mexican food truck with outdoor seating</em> Mexican food truck at its downtown spot on set days each week, with outdoor seating and counter service. Pickup only, no delivery (confirmed by the owner 2026-08-28).<br><span class=\"bcl-sr-meta\">12890 Central Avenue, Boulder Creek \u00b7 <a href=\"tel:8312827792\">(831) 282-7792</a> \u00b7 Monday-Saturday 11:00 a.m.-3:00 p.m. and 4:00-7:00 p.m.; Sunday closed. \u00b7 Verified 2026-08-28 \u00b7 <a href=\"/around-town/el-rey-leon-boulder-creek\">Read our write-up</a></span></li>\n<li><strong><a href=\"https://www.redpearlonline.com/\" rel=\"nofollow noopener\">Red Pearl Chinese Cuisine</a></strong> <em>Chinese restaurant</em> Chinese restaurant preparing dine-in and takeout meals in downtown Boulder Creek.<br><span class=\"bcl-sr-meta\">13151 Highway 9, Boulder Creek \u00b7 <a href=\"tel:8313389800\">(831) 338-9800</a> \u00b7 Wednesday-Sunday 11:00 a.m.-9:00 p.m.; Monday-Tuesday closed. \u00b7 Verified 2026-09-25</span></li>\n<li><strong>Round Table Pizza</strong> <em>Pizza restaurant</em> Round Table Pizza franchise in the former Boulder Creek Pizza and Pub building, open since September 21, 2026. Pizzas, wings, salads, sandwiches, and desserts, with the same menu as the Felton store.<br><span class=\"bcl-sr-meta\">13200 Central Avenue, Boulder Creek \u00b7 <a href=\"tel:8313382141\">831-338-2141</a> \u00b7 Monday-Thursday 10:30am-9:45pm; Friday-Saturday 10:30am-10:15pm; Sunday 10:30am-9:45pm \u00b7 Verified 2026-09-21 \u00b7 <a href=\"/around-town/pizza-in-boulder-creek\">Read our write-up</a></span></li>\n<li><strong><a href=\"https://www.scopazzisbc.com/\" rel=\"nofollow noopener\">Scopazzi&#x27;s Restaurant &amp; Lounge</a></strong> <em>Italian restaurant and lounge</em> Historic Italian restaurant with a lounge, brunch, takeout, and private-event rooms.<br><span class=\"bcl-sr-meta\">13300 Big Basin Way, Boulder Creek \u00b7 <a href=\"tel:8313384444\">(831) 338-4444</a> \u00b7 Breakfast Wednesday-Sunday 10:30 a.m.-2:00 p.m.; lunch Wednesday-Saturday 11:30 a.m.-3:00 p.m.; dinner Wednesday-Sunday 4:00 p.m.-closing; Monday-Tuesday closed. \u00b7 Verified 2026-09-25 \u00b7 <a href=\"/around-town/scopazzis-boulder-creek\">Read our write-up</a></span></li>\n<li><strong><a href=\"https://edosushibc.com/\" rel=\"nofollow noopener\">Tae&#x27;s Edo Sushi Bar</a></strong> <em>Japanese and sushi restaurant</em> Japanese restaurant serving sushi and other Japanese dishes for dinner and limited lunch service.<br><span class=\"bcl-sr-meta\">13271 Highway 9, Boulder Creek \u00b7 <a href=\"tel:8313382099\">(831) 338-2099</a> \u00b7 Tuesday-Thursday and Sunday 4:00-8:00 p.m.; Friday-Saturday 12:00-3:00 p.m. and 4:00-8:00 p.m.; Monday closed. \u00b7 Verified 2026-09-25 \u00b7 <a href=\"/around-town/taes-edo-sushi-boulder-creek\">Read our write-up</a></span></li>\n<li><strong>Taqueria Los Gallos</strong> <em>Sit-down taqueria</em> A sit-down taqueria in downtown Boulder Creek serving tacos, burritos, and other Mexican dishes.<br><span class=\"bcl-sr-meta\">13070 Central Ave, Boulder Creek, CA 95006 \u00b7 <a href=\"tel:8312175000\">(831) 217-5000</a> \u00b7 Monday-Friday 8:30 a.m.-8:45 p.m.; Saturday-Sunday 8:30 a.m.-7:45 p.m. \u00b7 Verified 2026-08-06 \u00b7 <a href=\"/around-town/taqueria-los-gallos-boulder-creek\">Read our write-up</a></span></li>\n</ul>\n<h3>Specialty Food in Boulder Creek and the San Lorenzo Valley</h3>\n<ul>\n<li><strong><a href=\"https://www.creativeheartkitchen.com/\" rel=\"nofollow noopener\">Creative Heart Kitchen</a></strong> <em>Prepared meals and meal prep</em> Prepared meals and meal-prep service with focaccia, soups, salads, sides, and entrees available by the pint and quart.<br><span class=\"bcl-sr-meta\">San Lorenzo Valley \u00b7 Weekly menu for Sunday afternoon pickup in Boulder Creek, Brookdale or Ben Lomond; order by the prior Wednesday at 9:00 p.m. ($30 minimum). \u00b7 Service area: San Lorenzo Valley and Santa Cruz County \u00b7 Verified 2026-09-25</span></li>\n<li><strong>Redwood Keg Liquor &amp; Deli</strong> <em>Bottle shop and deli counter</em> A Boulder Creek liquor store with a deli counter. Call to confirm current food offerings and days.<br><span class=\"bcl-sr-meta\">12980 Highway 9, Boulder Creek, CA 95006 \u00b7 <a href=\"tel:8313382727\">(831) 338-2727</a> \u00b7 Verified 2026-07-16</span></li>\n<li><strong><a href=\"https://riverdogsofbc.com/\" rel=\"nofollow noopener\">River Dogs of Boulder Creek</a></strong> <em>Outdoor hot dog stand</em> Outdoor food stand serving hot dogs and sausages, including vegetarian options, with occasional live music.<br><span class=\"bcl-sr-meta\">123 Forest Street, Boulder Creek \u00b7 <a href=\"tel:8314007025\">(831) 400-7025</a> \u00b7 Tuesday-Sunday 11:30 a.m.-about 5:00 p.m.; posted winter hours close at 3:00 p.m. Tuesday-Thursday; closed Mondays, in bad weather and for special events. \u00b7 Verified 2026-09-25 \u00b7 <a href=\"/around-town/river-dogs-boulder-creek\">Read our write-up</a></span></li>\n</ul>\n</div><!--BCL_SR_END--></div>";
  var empty = /<div\s+id=["']bcl-food["']\s*>\s*<\/div>/;
  var filled = /<div\s+id=["']bcl-food["']\s*><!--BCL_SR_START-->[\s\S]*?<!--BCL_SR_END--><\/div>/;
  var re = filled.test(src) ? filled : empty;
  if (!re.test(src)) throw new Error('ABORT: mount bcl-food not found in this code block');
  var out = src.replace(re, function () { return FRAG; });
  if (out === src) {
    console.log('%cAlready up to date - this page already has the current food fallback. Nothing to do, do NOT save.', 'color:#2a7d55;font-weight:bold');
    return;
  }
  view.dispatch({changes: {from: 0, to: view.state.doc.length, insert: out}});
  console.log('%cfood fallback inserted: ' + FRAG.length + ' chars. Source ' + src.length + ' -> ' + out.length + '. NOW CLICK SAVE.', 'color:#2a7d55;font-weight:bold');
})();
