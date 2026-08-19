import fs from "node:fs";
import assert from "node:assert/strict";

const read = path => fs.readFileSync(path, "utf8");
const version = JSON.parse(read("version.json")).version;
const inspector = read("js/battle-replay-inspector.js");
const inspectorCss = read("css/battle-replay-inspector.css");
const toolNav = read("js/tool-page-nav.js");
const toolsMobile = read("css/tools-mobile.css");
const mobileUi = read("js/mobile-ui.js");
const mobileNavCss = read("css/mobile-nav.css");
const collectionUi = read("js/collection-ui.js");
const decisionSummary = read("js/battle-decision-summary.js");

assert.equal(version, "01.03.000", "Replay Inspector release must use version 01.03.000");

for (const tab of ["action", "changes", "decision", "state"]) {
  assert.match(inspector, new RegExp(`data-inspector-tab=\\"${tab}\\"`), `Missing Replay Inspector ${tab} tab`);
}

for (const filter of ["all", "play", "attack", "evolve", "turn", "draw"]) {
  assert.match(inspector, new RegExp(`\\[\\"${filter}\\"`), `Missing replay timeline ${filter} filter`);
}

assert.match(inspector, /captureRenderedFrame/, "Replay Inspector must capture rendered frame state");
assert.match(inspector, /renderChanges/, "Replay Inspector must compare adjacent frames");
assert.match(inspector, /Observed decision context only/, "Decision tab must remain explanatory rather than strengthening the AI");
assert.match(inspectorCss, /\.battle-inspector-state-grid/, "Replay Inspector responsive styles are missing");

for (const href of ["\.\/index\.html", "\.\/collection\.html", "\.\/battle\.html"]) {
  assert.match(toolNav, new RegExp(href), `Shared tool navigation is missing ${href}`);
}
assert.match(toolsMobile, /\.tools-mobile-nav/, "Tool-page mobile navigation styles are missing");
assert.match(collectionUi, /tool-page-nav\.js\?v=01\.03\.000/, "Collection must load shared tool navigation");
assert.match(decisionSummary, /battle-replay-inspector\.js\?v=01\.03\.000/, "Battle Sim must load Replay Inspector");

assert.match(mobileUi, /mobile-primary-nav/, "Main mobile drawer must expose primary page navigation");
assert.match(mobileUi, /href=\"\.\/collection\.html\"/, "Main mobile UI must link directly to Collection");
assert.match(mobileUi, /href=\"\.\/battle\.html\"/, "Main mobile UI must link directly to Battle Sim");
assert.match(mobileNavCss, /repeat\(5, minmax\(0, 1fr\)\)/, "Main mobile bottom navigation must support five destinations");

console.log("Replay Inspector + mobile navigation regression: OK");
