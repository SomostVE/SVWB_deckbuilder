import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { inspectCrestLifecycleRules } from "../js/battle-engine-v5.js";

const cards = JSON.parse(await fs.readFile(new URL("../data/official/cards.json", import.meta.url), "utf8"));
const map = new Map(cards.map(card => [Number(card.id), card]));
for (const card of cards) {
  card.__relatedCardObjects = (card.relatedCards ?? []).map(id => map.get(Number(id))).filter(Boolean);
  card.__relatedNames = card.__relatedCardObjects.map(item => item.name);
}

const qa = inspectCrestLifecycleRules({ cards });

assert.equal(qa.crestCount, 59, "Beyond Codex snapshot must contain the 59 Crest-bearing cards audited for this release");
assert.deepEqual(qa.capacity.accepted.slice(0, 5), [true, true, true, true, true], "The first five distinct Crests must be accepted");
assert.equal(qa.capacity.accepted[5], false, "A sixth Crest must be rejected while five Crests are active");
assert.equal(qa.capacity.duplicateAccepted, false, "A duplicate Crest must not create a second active Crest");
assert.equal(qa.capacity.active, 5, "A player can have at most five active Crests");

function actionIndex(actions, prefix) {
  return actions.findIndex(action => String(action).startsWith(prefix));
}

const gm = qa.order.grimnirThenMarwynn;
const mg = qa.order.marwynnThenGrimnir;
assert.ok(actionIndex(gm, "Grimnir Crest:") >= 0 && actionIndex(gm, "Marwynn Crest:") >= 0, "Grimnir and Marwynn must both resolve at end of turn");
assert.ok(actionIndex(mg, "Grimnir Crest:") >= 0 && actionIndex(mg, "Marwynn Crest:") >= 0, "Grimnir and Marwynn must both resolve in the reverse acquisition fixture");
assert.ok(actionIndex(gm, "Grimnir Crest:") < actionIndex(gm, "Marwynn Crest:"), "Simultaneous Crest effects must resolve in acquisition order: Grimnir then Marwynn");
assert.ok(actionIndex(mg, "Marwynn Crest:") < actionIndex(mg, "Grimnir Crest:"), "Simultaneous Crest effects must resolve in acquisition order: Marwynn then Grimnir");

assert.deepEqual(qa.charon.boardSizes, [1, 2], "Charon Crest must Reanimate at the start of both Countdown turns, including the turn it expires");
assert.equal(qa.charon.activeAfterSecondStart, false, "Charon Crest must expire after its second start-of-turn resolution");
assert.equal(qa.charon.actions.filter(action => String(action).startsWith("Charon Crest:")).length, 2, "Charon Crest must trigger exactly twice before expiring");

console.log("Crest lifecycle pass: 59 Crest cards inventoried · 5-slot/duplicate rules locked · acquisition order locked · expiring start-turn trigger locked");
