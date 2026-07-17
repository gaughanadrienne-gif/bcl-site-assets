const fs = require("fs");
const path = require("path");
const FILE = path.join(__dirname, "../../data/directory.json");
const FROM = "Home & Property Services";
const MAP = {
  "General contractor": "General Contractors & Construction",
  "General contractor and construction management": "General Contractors & Construction",
  "Concrete contractor": "General Contractors & Construction",
  "Roofing contractor": "General Contractors & Construction",
  "Cabinet maker": "General Contractors & Construction",
  "Welding": "General Contractors & Construction",
  "Painting contractor": "General Contractors & Construction",
  "Plumbing": "Plumbing & HVAC",
  "Plumbing and water heaters": "Plumbing & HVAC",
  "Heating and air conditioning (HVAC)": "Plumbing & HVAC",
  "Electrical contractor": "Electrical & Solar",
  "Electrical and low-voltage contractor": "Electrical & Solar",
  "Solar installer": "Electrical & Solar",
  "Landscaping contractor": "Landscaping & Gardening",
  "Gardening and yard maintenance": "Landscaping & Gardening",
  "Tree care": "Tree Care & Defensible Space",
  "Tree care and fire mitigation": "Tree Care & Defensible Space",
  "Tree care and defensible space": "Tree Care & Defensible Space",
  "Septic and excavation": "Excavation, Grading & Paving",
  "Excavation and grading": "Excavation, Grading & Paving",
  "Grading and excavation": "Excavation, Grading & Paving",
  "Paving and grading": "Excavation, Grading & Paving",
  "Excavation and tractor work": "Excavation, Grading & Paving",
  "Handyman and property maintenance": "Handyman & Property Maintenance",
  "House cleaning": "House Cleaning",
  "Well and pump service": "Well & Pump / Water",
  "Well drilling and pump service": "Well & Pump / Water",
  "Chimney sweep": "Home Services & Repair",
  "Firewood delivery": "Home Services & Repair",
  "Propane supplier": "Home Services & Repair",
  "Pest control": "Home Services & Repair",
  "Termite control": "Home Services & Repair",
  "Appliance repair": "Home Services & Repair",
  "Moving and storage": "Home Services & Repair",
  "Moving company": "Home Services & Repair",
  "Pool and hot tub service": "Home Services & Repair",
};
const db = JSON.parse(fs.readFileSync(FILE, "utf8"));
const unmapped = [];
let changed = 0;
db.listings.forEach((l) => {
  if (l.category !== FROM) return;
  const to = MAP[l.subcategory];
  if (!to) { unmapped.push(l.subcategory); return; }
  l.category = to;
  changed++;
});
if (unmapped.length) { console.error("UNMAPPED subcategories:", [...new Set(unmapped)]); process.exit(1); }
fs.writeFileSync(FILE, JSON.stringify(db, null, 1) + "\n");
console.log("Re-tagged", changed, "Home records");
