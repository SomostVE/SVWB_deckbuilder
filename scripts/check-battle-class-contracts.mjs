import fs from "node:fs";
import assert from "node:assert/strict";
import {
  CLASS_MECHANIC_OWNERS,
  auditExclusiveMechanicCards,
  resolveDeckClass
} from "../js/battle-class-mechanics.js";

const cards = JSON.parse(fs.readFileSync("data/official/cards.json", "utf8"));
const cardMap = new Map(cards.map(card => [Number(card.id), card]));
const { violations, inventory } = auditExclusiveMechanicCards(cards);

assert.deepEqual(
  violations.map(row => `${row.mechanic}: ${row.actualClass} ${row.cardName} (${row.cardId})`),
  [],
  "Exclusive class mechanics leaked into another class in the official snapshot"
);

for (const [mechanic, owner] of Object.entries(CLASS_MECHANIC_OWNERS)) {
  const rows = inventory.get(mechanic) ?? [];
  assert.ok(rows.length > 0, `${owner} mechanic ${mechanic} must have at least one current card in the snapshot`);
  assert.ok(rows.every(card => card.class === owner), `${mechanic} must remain exclusive to ${owner}`);
}

const sampleByClass = new Map();
for (const card of cards) {
  if (!card.token && card.rotation && card.class !== "Neutral" && !sampleByClass.has(card.class)) sampleByClass.set(card.class, card);
}
const neutral = cards.find(card => !card.token && card.class === "Neutral");
assert.ok(neutral, "Need one Neutral card for deck-class contract QA");

for (const [className, card] of sampleByClass) {
  const legal = [[Number(card.id), 3], [Number(neutral.id), 3]];
  assert.equal(resolveDeckClass(legal, cardMap, className), className, `${className} + Neutral must be legal`);
}

const classSamples = [...sampleByClass.values()];
assert.ok(classSamples.length >= 2, "Need at least two classes for mixed-deck QA");
assert.throws(
  () => resolveDeckClass([[Number(classSamples[0].id), 1], [Number(classSamples[1].id), 1]], cardMap),
  /Illegal mixed-class deck/,
  "Mixed-class decks must be rejected at the Battle Sim boundary"
);

const inventoryText = [...inventory.entries()]
  .map(([mechanic, rows]) => `${mechanic}=${rows.length}`)
  .join(" · ");
console.log(`Battle Sim exclusive class contracts: OK · ${inventoryText}`);
