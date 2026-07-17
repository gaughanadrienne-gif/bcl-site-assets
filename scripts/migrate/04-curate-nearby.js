const fs = require("fs");
const path = require("path");
const logic = require("../../tools/bcl-tools.js");
const DIR = path.join(__dirname, "../../data/directory.json");
const ARCHIVE = "C:/Users/Adrie/OneDrive/Businesses/Boulder Creek Local/Website/Data/archive-directory-nonlocal.json";
const KEEP = 6;
const db = JSON.parse(fs.readFileSync(DIR, "utf8"));
const byCat = {};
db.listings.forEach((l) => { (byCat[l.category] = byCat[l.category] || []).push(l); });
const removed = [];
Object.keys(byCat).forEach((c) => {
  if (logic.CAP_EXEMPT.indexOf(c) >= 0) return; // essential/civic categories are never archived
  const nearby = byCat[c].filter((l) => !logic.isLocal(l))
    .sort((a, b) => logic.localityRank(a) - logic.localityRank(b) || String(a.name).localeCompare(String(b.name)));
  nearby.slice(KEEP).forEach((l) => removed.push(l));
});
const removedSet = new Set(removed);
db.listings = db.listings.filter((l) => !removedSet.has(l));
fs.writeFileSync(DIR, JSON.stringify(db, null, 1) + "\n");
let archive = { note: "Non-local directory records trimmed from the public file to keep the local-first browse tight; kept for reference. Essential/civic categories are exempt and never archived.", listings: [] };
if (fs.existsSync(ARCHIVE)) archive = JSON.parse(fs.readFileSync(ARCHIVE, "utf8"));
archive.listings = archive.listings.concat(removed);
fs.writeFileSync(ARCHIVE, JSON.stringify(archive, null, 1) + "\n");
console.log("Archived", removed.length, "non-local records; exempt categories untouched");
