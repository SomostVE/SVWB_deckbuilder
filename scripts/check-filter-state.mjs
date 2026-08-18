import fs from "node:fs";
import assert from "node:assert/strict";
import { state } from "../js/state.js";
import { pruneUnavailableFilters } from "../js/filters.js";

state.cards = [
  { id: 1, class: "Dragoncraft", cost: 1, set: "Set A", type: "Follower", rarity: "Bronze", traits: ["Armed"], keywords: ["Rush"] },
  { id: 2, class: "Portalcraft", cost: 1, set: "Set A", type: "Follower", rarity: "Bronze", traits: ["Artifact"], keywords: ["Rush"] },
  { id: 3, class: "Neutral", cost: 2, set: "Set B", type: "Spell", rarity: "Silver", traits: ["Neutral Trait"], keywords: ["Draw"] }
];
state.includeNeutral = true;
state.selectedClass = "Dragoncraft";
for (const set of Object.values(state.filters)) set.clear();
state.filters.costs.add("1");
state.filters.types.add("Follower");
state.filters.sets.add("Set A");
state.filters.traits.add("Armed");
state.filters.keywords.add("Rush");

state.selectedClass = "Portalcraft";
pruneUnavailableFilters();
assert(state.filters.costs.has("1"), "Cost filter must carry across classes");
assert(state.filters.types.has("Follower"), "Valid type filter must carry across classes");
assert(state.filters.sets.has("Set A"), "Valid set filter must carry across classes");
assert(state.filters.keywords.has("Rush"), "Valid keyword filter must carry across classes");
assert(!state.filters.traits.has("Armed"), "Unavailable class-specific trait must be removed instead of becoming invisible");

state.filters.traits.add("Neutral Trait");
pruneUnavailableFilters();
assert(state.filters.traits.has("Neutral Trait"), "Neutral filters must stay valid while Neutral is included");
state.includeNeutral = false;
pruneUnavailableFilters();
assert(!state.filters.traits.has("Neutral Trait"), "Neutral-only filter must be removed when Neutral is disabled");

const qol = fs.readFileSync(new URL("../js/qol.js", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
assert(qol.includes('const FILTER_KEY = "svwb-filters";'), "Filters should use one global persisted state");
assert(!qol.includes("svwb-class-filters:"), "Per-class filter snapshots must no longer be restored");
assert(app.includes("function refreshFilterView()"), "Filter changes must have one synchronized render path");
assert(app.includes("pruneUnavailableFilters();"), "Class changes must prune invisible invalid filters");

console.log("Filter state regression: OK");
