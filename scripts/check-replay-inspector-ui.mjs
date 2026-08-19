import fs from "node:fs";
import assert from "node:assert/strict";

const read = path => fs.readFileSync(path, "utf8");
const version = JSON.parse(read("version.json")).version;
const inspector = read("js/battle-replay-inspector.js");
const inspectorCss = read("css/battle-replay-inspector.css");
const readabilityCss = read("css/readability-fixes.css");
const battleHtml = read("battle.html");
const collectionHtml = read("collection.html");
const toolNav = read("js/tool-page-nav.js");
const toolsMobile = read("css/tools-mobile.css");
const mobileUi = read("js/mobile-ui.js");
const mobileMenuCss = read("css/mobile-menu.css");
const mobileNavCss = read("css/mobile-nav.css");
const collectionUi = read("js/collection-ui.js");
const decisionSummary = read("js/battle-decision-summary.js");

assert.equal(version, "01.04.001", "Desktop navigation fix must use version 01.04.001");

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
assert.match(mobileMenuCss, /\.mobile-drawer-head,\s*\.mobile-primary-nav\s*\{\s*display:\s*none;/, "Mobile drawer navigation must stay hidden on desktop");
assert.match(mobileNavCss, /repeat\(5, minmax\(0, 1fr\)\)/, "Main mobile bottom navigation must support five destinations");

assert.match(readabilityCss, /\.collection-body \.collection-tabs[\s\S]*position:\s*static/, "Collection tabs must not float over cards on mobile");
assert.match(readabilityCss, /\.battle-body \.battle-action[\s\S]*font-size:\s*\.95rem/, "Battle action text must be enlarged");
assert.match(readabilityCss, /\.battle-body \.battle-inspector-primary[\s\S]*font-size:\s*\.92rem/, "Replay Inspector primary text must be enlarged");
assert.ok(battleHtml.includes("readability-fixes.css?v="), "Battle Sim must load the readability stylesheet");
assert.ok(collectionHtml.includes("readability-fixes.css?v="), "Collection must load the mobile tab fix");

console.log("Replay Inspector + mobile navigation + readability regression: OK");
