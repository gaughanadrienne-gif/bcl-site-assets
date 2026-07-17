const fs = require("fs");
const path = require("path");
const DIR = path.join(__dirname, "../../data/directory.json");
const FOOD = path.join(__dirname, "../../data/food.json");

// Verified 2026-07-17 by fetching each winery's OWN website (not search snippets).
// Los Gatos / Santa Cruz border wineries that belong to this mountain community carry
// local:true so the isLocal helper sorts them into the local tier without editing bcl-tools.js.
// By-appointment / no-public-tasting-room wineries carry no_storefront:true and OMIT address + lat/lon
// so no residential address is ever published.
const VINEYARDS = [
 {
  name: "Big Basin Vineyards",
  subcategory: "Winery and tasting room",
  description: "Estate winery in the Santa Cruz Mountains near Boulder Creek, with a public tasting room in downtown Santa Cruz and estate visits by reservation.",
  address: "525 Pacific Avenue",
  locality: "Santa Cruz",
  local: true,
  phone: "(831) 515-7278",
  website: "https://www.bigbasinvineyards.com/",
  verified_at: "2026-07-17"
 },
 {
  name: "David Bruce Winery",
  subcategory: "Winery and tasting room",
  description: "Longtime Santa Cruz Mountains winery with a Los Gatos tasting room, known for Pinot Noir and Chardonnay.",
  address: "21439 Bear Creek Road",
  locality: "Los Gatos",
  phone: "(408) 399-5807",
  website: "https://www.davidbrucewinery.com/",
  hours_text: "Thursday-Sunday 11:00 a.m.-4:00 p.m.; reservations recommended",
  local: true,
  verified_at: "2026-07-17"
 },
 {
  name: "Byington Vineyard & Winery",
  subcategory: "Winery and tasting room",
  description: "Santa Cruz Mountains estate winery and event venue on Bear Creek Road near Los Gatos.",
  address: "21850 Bear Creek Road",
  locality: "Los Gatos",
  phone: "(408) 354-1111",
  website: "https://byington.com/",
  hours_text: null,
  local: true,
  verified_at: "2026-07-17"
 },
 {
  name: "Burrell School Vineyards & Winery",
  subcategory: "Winery and tasting room",
  description: "Santa Cruz Mountains estate winery with a tasting room on Summit Road, open Friday through Sunday.",
  address: "24060 Summit Road",
  locality: "Los Gatos",
  phone: "(408) 353-6290",
  website: "https://burrellschool.com/",
  hours_text: "Friday-Sunday 1:00-6:00 p.m.",
  local: true,
  verified_at: "2026-07-17"
 },
 {
  name: "Loma Prieta Winery",
  subcategory: "Winery and tasting room",
  description: "Boutique Santa Cruz Mountains winery at 2,600 feet on Loma Prieta Way, known as the largest producer of Pinotage in North America, open to the public on weekends.",
  address: null,
  locality: "Los Gatos",
  phone: null,
  website: "https://lomaprietawinery.com/",
  hours_text: "Open weekends 12:00-5:00 p.m.",
  local: true,
  verified_at: "2026-07-17"
 },
 {
  name: "Lago Lomita Vineyards",
  subcategory: "Winery and event venue, tasting by appointment",
  description: "Santa Cruz Mountains vineyard, event venue, and bed and breakfast overlooking Monterey Bay, with wine tasting available by appointment.",
  address: "25200 Loma Prieta Avenue",
  locality: "Los Gatos",
  phone: "(408) 802-8752",
  website: "https://www.lagolomita.com/",
  hours_text: "Tasting by appointment; call to schedule",
  local: true,
  verified_at: "2026-07-17"
 },
 {
  name: "Muccigrosso Vineyards",
  subcategory: "Winery, no public tasting room",
  description: "Family-run limited-production winery in the Santa Cruz Mountains making Pinot Noir, Zinfandel, and Chardonnay.",
  no_storefront: true,
  address: null,
  locality: "Los Gatos",
  phone: null,
  website: "https://www.muccigrosso.com/",
  hours_text: null,
  local: true,
  verified_at: "2026-07-17"
 },
 {
  name: "Muns Vineyard",
  subcategory: "Winery, by appointment",
  description: "Owner-operated vineyard at 2,600 feet in the Santa Cruz Mountains offering outdoor tastings by reservation on scheduled dates.",
  no_storefront: true,
  address: null,
  locality: "Los Gatos",
  phone: "(408) 234-2079",
  website: "https://www.munsvineyard.com/",
  hours_text: "Tastings by reservation on scheduled dates only",
  local: true,
  verified_at: "2026-07-17"
 },
 {
  name: "Griffin Hill Vineyards",
  subcategory: "Winery, by appointment",
  description: "Small-production estate winery on the Skyline ridge of the Santa Cruz Mountains above Los Gatos.",
  no_storefront: true,
  address: null,
  locality: "Los Gatos",
  phone: "(650) 799-3327",
  website: "https://www.griffinhillvineyards.com/",
  hours_text: null,
  local: true,
  verified_at: "2026-07-17"
 }
];

const db = JSON.parse(fs.readFileSync(DIR, "utf8"));
// 1) Move Hallcrest into the new category.
db.listings.forEach((l) => { if (l.name === "Hallcrest Vineyards") l.category = "Vineyards & Wine Tasting"; });
// 2) Move Creative Heart Kitchen to the food page, then drop it from the directory.
const chk = db.listings.find((l) => l.name === "Creative Heart Kitchen");
if (chk) {
  const food = JSON.parse(fs.readFileSync(FOOD, "utf8"));
  food.listings.push({ name: chk.name, category: "Specialty Food", subcategory: "Prepared meals and meal prep", description: chk.description, address: chk.address, locality: chk.locality, phone: chk.phone, website: chk.website, hours_text: chk.hours_text, service_area: chk.service_area, verified_at: chk.verified_at, no_storefront: chk.no_storefront });
  food.count = food.listings.length;
  fs.writeFileSync(FOOD, JSON.stringify(food, null, 1) + "\n");
  db.listings = db.listings.filter((l) => l.name !== "Creative Heart Kitchen");
}
// 3) Add verified vineyards (skip any already present by name).
const have = new Set(db.listings.map((l) => l.name));
VINEYARDS.forEach((v) => { if (!have.has(v.name)) db.listings.push(Object.assign({ category: "Vineyards & Wine Tasting" }, v)); });
fs.writeFileSync(DIR, JSON.stringify(db, null, 1) + "\n");
console.log("Vineyards now:", db.listings.filter((l) => l.category === "Vineyards & Wine Tasting").length, "| Food & Drink:", db.listings.filter((l) => l.category === "Food & Drink").length);
