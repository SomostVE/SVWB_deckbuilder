import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync("collection.html", "utf8");
const css = fs.readFileSync("css/collection-layout.css", "utf8");
const ui = fs.readFileSync("js/collection-ui.js", "utf8");
const page = fs.readFileSync("js/collection-page.js", "utf8");
const { version } = JSON.parse(fs.readFileSync("version.json", "utf8"));

for (const id of ["collection-tab-cards", "collection-tab-sets", "collection-tab-planner", "collection-cards", "collection-status-filter", "collection-missing-tools", "collection-missing-summary", "collection-missing-group"]) {
  assert.ok(html.includes(`id=\"${id}\"`), `Collection page should keep #${id}`);
}
assert.ok(html.includes("collection-layout.css?v="), "Collection sidebar layout stylesheet should remain cache-versioned");
assert.ok(html.includes("collection-ui.js?v="), "Collection UI patch module should remain cache-versioned");
assert.ok(css.includes("grid-template-areas"), "Desktop collection should use side navigation layout");
assert.ok(css.includes("104px"), "Desktop card art should be materially larger than the legacy thumbnail");
assert.ok(css.includes("collection-card-preview"), "Collection card preview styles should exist");
assert.ok(ui.includes("resetCollectionScroll"), "Tab switching should normalize scroll position");
assert.ok(ui.includes("showModal"), "Card artwork should support enlarged preview");
assert.ok(page.includes("Missing copies") && page.includes("Vials needed"), "Missing view should expose collection deficit totals");
assert.ok(page.includes("missingGroupLabel"), "Missing view should support grouping");
assert.ok(page.includes('setCardStatus("missing")'), "Set completion should open directly on missing cards");

console.log(`Collection UI structure regression: OK (${version})`);
