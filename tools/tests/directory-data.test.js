const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const data = require(path.join(__dirname, "../../data/directory.json")).listings;
const count = (c) => data.filter((x) => x.category === c).length;

test("Events & Celebrations is fully split", () => {
  assert.equal(count("Events & Celebrations"), 0);
  assert.equal(count("Event Venues"), 12);
  assert.equal(count("Catering & Bar"), 10);
  assert.equal(count("Cakes & Desserts"), 7);
  assert.equal(count("Wedding Services"), 21);
  assert.equal(count("Party Rentals & Decor"), 10);
  assert.equal(count("Kids Parties"), 16);
});

test("Home & Property Services is fully split", () => {
  assert.equal(count("Home & Property Services"), 0);
  assert.equal(count("General Contractors & Construction"), 24);
  assert.equal(count("Plumbing & HVAC"), 9);
  assert.equal(count("Electrical & Solar"), 8);
  assert.equal(count("Landscaping & Gardening"), 8);
  assert.equal(count("Tree Care & Defensible Space"), 4);
  assert.equal(count("Excavation, Grading & Paving"), 5);
  assert.equal(count("Handyman & Property Maintenance"), 4);
  assert.equal(count("House Cleaning"), 6);
  assert.equal(count("Well & Pump / Water"), 2);
  assert.equal(count("Home Services & Repair"), 13);
});
