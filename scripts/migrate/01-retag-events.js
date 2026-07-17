const fs = require("fs");
const path = require("path");
const FILE = path.join(__dirname, "../../data/directory.json");
const MAP = {
  "Wedding and retreat venue": "Event Venues",
  "Community hall rental": "Event Venues",
  "Wedding and event venue": "Event Venues",
  "Hotel wedding venue": "Event Venues",
  "Catering and day-of coordination": "Catering & Bar",
  "Event catering (cafe in Capitola)": "Catering & Bar",
  "Mobile bar and tap service": "Catering & Bar",
  "Wedding and event catering": "Catering & Bar",
  "Barbecue catering": "Catering & Bar",
  "Wedding cakes and bakery": "Cakes & Desserts",
  "Wedding cakes": "Cakes & Desserts",
  "Day-of wedding coordination and paper florals": "Wedding Services",
  "Wedding officiant": "Wedding Services",
  "Wedding DJ": "Wedding Services",
  "Wedding DJ and MC": "Wedding Services",
  "Wedding DJ and entertainment": "Wedding Services",
  "DJ and MC services": "Wedding Services",
  "Wedding hair and makeup": "Wedding Services",
  "Wedding makeup": "Wedding Services",
  "Wedding hair": "Wedding Services",
  "Mobile spa and wedding beauty": "Wedding Services",
  "Wedding planner": "Wedding Services",
  "Event rentals": "Party Rentals & Decor",
  "Event and tent rentals": "Party Rentals & Decor",
  "Bounce house and party rentals": "Party Rentals & Decor",
  "Bounce house rentals": "Party Rentals & Decor",
  "Bounce houses and balloon decor": "Party Rentals & Decor",
  "Balloon decor and party rentals": "Party Rentals & Decor",
  "Balloon styling and party decor": "Party Rentals & Decor",
  "Indoor kids play lounge and party venue": "Kids Parties",
  "Kids party venue (gymnastics)": "Kids Parties",
  "Kids party venue (pizza making)": "Kids Parties",
  "Kids party venue (roller skating)": "Kids Parties",
  "Kids party venue (bowling, arcade, laser tag)": "Kids Parties",
  "Kids party entertainment (characters, magic, animals)": "Kids Parties",
  "Kids party entertainment (characters, face paint, balloons)": "Kids Parties",
  "Kids party entertainment (characters, magic, puppets)": "Kids Parties",
  "Kids party magician": "Kids Parties",
  "Face painting and henna": "Kids Parties",
  "Face painting": "Kids Parties",
  "Henna and body art": "Kids Parties",
  "Face painting and glitter tattoos": "Kids Parties",
  "Kids music parties": "Kids Parties",
};
const db = JSON.parse(fs.readFileSync(FILE, "utf8"));
const unmapped = [];
let changed = 0;
db.listings.forEach((l) => {
  if (l.category !== "Events & Celebrations") return;
  const to = MAP[l.subcategory];
  if (!to) { unmapped.push(l.subcategory); return; }
  l.category = to;
  changed++;
});
if (unmapped.length) { console.error("UNMAPPED subcategories:", [...new Set(unmapped)]); process.exit(1); }
fs.writeFileSync(FILE, JSON.stringify(db, null, 1) + "\n");
console.log("Re-tagged", changed, "Events records");
