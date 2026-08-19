import fs from "node:fs";
import assert from "node:assert/strict";

const read = path => fs.readFileSync(path, "utf8");
const version = JSON.parse(read("version.json")).version;
const inspector = read("js/battle-replay-inspector.js");
const inspectorCss = read("css/battle-replay-inspector.css");
const readabilityCss = read("css/readability-fixes.css");
const battleHtml = read("battle.html");
const battleJs = read("js/battle.js");
const collectionHtml = read("collection.html");
const toolNav = read("js/tool-page-nav.js");
const toolsMobile = read("css/tools-mobile.css");
const mobileUi = read("js/mobile-ui.js");
const mobileMenuCss = read("css/mobile-menu.css");
const mobileNavCss = read("css/mobile-nav.css");
const collectionUi = read("js/collection-ui.js");
const decisionSummary = read("js/battle-decision-summary.js");
const versionGuard = read("js/version-guard.js");

assert.equal(version, "01.04.003", "Class mechanic boundary fix must use version 01.04.003");

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
assert.match(decisionSummary, /battle-replay-inspector\.js\?v=01\.04\.003/, "Battle Sim must load the current Replay Inspector build");

assert.match(mobileUi, /mobile-primary-nav/, "Main mobile drawer must expose primary page navigation");
assert.match(mobileUi, /href=\"\.\/collection\.html\"/, "Main mobile UI must link directly to Collection");
assert.match(mobileUi, /href=\"\.\/battle\.html\"/, "Main mobile UI must link directly to Battle Sim");
assert.match(mobileUi, /mobile-brand\">Beyond Decks</, "Mobile header must use the Beyond Decks name");
assert.doesNotMatch(mobileUi, /Deci Builder/, "Legacy Deci Builder branding must not remain in the mobile header");
assert.match(versionGuard, /replaceAll\("Deci Builder", "Beyond Decks"\)/, "Page titles must normalize legacy Deci Builder titles to Beyond Decks");
assert.match(versionGuard, /\[Beyond Decks\] Version/, "Version logging must use the Beyond Decks name");
assert.match(mobileMenuCss, /\.mobile-drawer-head,\s*\.mobile-primary-nav\s*\{\s*display:\s*none;/, "Mobile drawer navigation must stay hidden on desktop");
assert.match(mobileNavCss, /repeat\(5, minmax\(0, 1fr\)\)/, "Main mobile bottom navigation must support five destinations");

assert.match(readabilityCss, /\.collection-body \.collection-tabs[\s\S]*position:\s*static/, "Collection tabs must not float over cards on mobile");
assert.match(readabilityCss, /\.battle-body \.battle-action[\s\S]*font-size:\s*\.95rem/, "Battle action text must be enlarged");
assert.match(readabilityCss, /\.battle-body \.battle-inspector-primary[\s\S]*font-size:\s*\.92rem/, "Replay Inspector primary text must be enlarged");
assert.ok(battleHtml.includes("readability-fixes.css?v="), "Battle Sim must load the readability stylesheet");
assert.ok(collectionHtml.includes("readability-fixes.css?v="), "Collection must load the mobile tab fix");
assert.match(battleHtml, /Battle Sim · Beyond Decks/, "Battle Sim browser title must use Beyond Decks");
for (const module of ["version-guard", "battle", "battle-decision-summary", "battle-benchmark-fast"]) {
  assert.ok(battleHtml.includes(`./js/${module}.js?v=${version}`), `Battle Sim must load ${module}.js with the current app version`);
}

assert.match(battleJs, /<span>Evo \$\{player\.ep\}<\/span>/, "Battle board must display Evo instead of EP");
assert.match(battleJs, /<span>Super Evo \$\{player\.sep\}<\/span>/, "Battle board must display Super Evo instead of SEP");
assert.match(inspector, /\["Evo", side\.ep\]/, "Replay Inspector state must display Evo");
assert.match(inspector, /\["Super Evo", side\.sep\]/, "Replay Inspector state must display Super Evo");
assert.match(inspector, /\(\?:Evo\|EP\)/, "Replay Inspector must accept legacy EP snapshots while reading Evo");
assert.match(inspector, /\(\?:Super Evo\|SEP\)/, "Replay Inspector must accept legacy SEP snapshots while reading Super Evo");

console.log("Replay Inspector + navigation + readability + branding + Evo labels regression: OK");
