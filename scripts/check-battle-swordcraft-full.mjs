import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { analyzeCardSupport, inspectSwordcraftFullRules } from "../js/battle-engine-v5.js";

const cards = JSON.parse(await fs.readFile(new URL("../data/official/cards.json", import.meta.url), "utf8"));
const map = new Map(cards.map(card => [Number(card.id), card]));
for (const card of cards) {
  card.__relatedCardObjects = (card.relatedCards ?? []).map(id => map.get(Number(id))).filter(Boolean);
  card.__relatedNames = card.__relatedCardObjects.map(item => item.name);
}

const sword = cards.filter(card => String(card.class ?? "").toLowerCase() === "swordcraft");
assert.equal(sword.length, 109, `Expected 109 Swordcraft cards in the current database, got ${sword.length}`);

const gaps = sword.map(card => ({ card, support: analyzeCardSupport(card) })).filter(entry => entry.support.level !== "full");
assert.deepEqual(
  gaps.map(entry => `${entry.card.name}: ${entry.support.level} (${entry.support.reason})`),
  [],
  "Every Swordcraft card must be fully modeled after the class pass"
);

const specialNames = [
  "Luminous Commander",
  "Majestic Conquest",
  "Bombastic Bombardier",
  "Kagemitsu, Enduring Warrior",
  "Katze, Magical Thief",
  "Lyrala, Luminous Potionwright",
  "Octrice, Hollowness Manifest",
  "Ancestral Crown",
  "Luminous Magus",
  "Unkei, Goldbloom",
  "Gildaria, Anathema of Peace",
  "Amalia, Luxsteel Paladin",
  "Yurius, Levin Authority"
];
assert.equal(specialNames.length, 13, "Swordcraft special-rule lock changed unexpectedly");
for (const name of specialNames) {
  const card = sword.find(card => card.name === name);
  assert.ok(card, `Missing Swordcraft regression card: ${name}`);
  const support = analyzeCardSupport(card);
  assert.match(support.reason, /^Battle Sim v5:/, `${name} must stay explicitly locked to a V5 special-rule override`);
}

const qa = inspectSwordcraftFullRules({ cards });
assert.deepEqual(qa.commander, { buff: 1, restoredAttack: 1 }, "Luminous Commander must gain +1/+0 per Officer entry only until turn end");
assert.equal(qa.lyralaHeal, 1, "Lyrala must restore 1 defense for each allied Officer entry");
assert.equal(qa.magusWard, true, "Luminous Magus must give entering allied Officers Ward");
assert.deepEqual(qa.crownBuff, [2, 2], "Ancestral Crown must give an entering allied follower +1/+1");
assert.deepEqual(qa.amaliaEntry, { attack: 2, rush: true, ward: true }, "Amalia must give another allied follower +1/+0, Rush, and Ward");
assert.deepEqual(qa.peaceBoardDefense, [1, 1], "Gildaria, Anathema of Peace must deal 1 to all enemy followers after another allied follower enters");
assert.equal(qa.bombardierCost, 1, "Bombastic Bombardier must be set to 1 PP after an allied Super-Evolution");
assert.equal(qa.katzeDefense, 3, "Katze must trigger only once per turn when spells are played");
assert.deepEqual(qa.majesticResult, { countdown: 4, fearless: 1 }, "Majestic Conquest must summon on Enhanced play and delay its Crest by 2");
assert.equal(qa.kagemitsuSummoned, true, "Kagemitsu Crest Last Words must summon Kagemitsu");
assert.equal(qa.octriceAfterTwoLootFuse, 7, "Octrice Crest must advance once when two Loot cards are Fused in one event");
assert.equal(qa.octriceRemnant, 1, "Octrice Crest Last Words must add Remnant of Hollowness");
assert.equal(qa.unkeiGold, 1, "Unkei Crest must add Glittering Gold at end of turn");
assert.equal(qa.gildaria19Super, false, "Gildaria must not count its own entry when checking Rally 20");
assert.deepEqual(qa.gildaria20, { superEvolved: true, steelclad: 2, rush: 2 }, "Gildaria at pre-entry Rally 20 must Super-Evolve and summon two Rush Steelclad Knights");
assert.deepEqual(qa.yuriusEntry, { locked: true, enemyHp: 19, ownerHp: 11 }, "Yurius must lock an entering enemy follower, deal 1, and restore 1");
assert.equal(qa.yuriusLockedAtStart, true, "Yurius attack lock must survive readying through the opponent's turn");

console.log(`Swordcraft class pass: ${sword.length}/${sword.length} Full · 13/13 special-rule behavior locks OK`);
