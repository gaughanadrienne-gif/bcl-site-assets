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
