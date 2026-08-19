import fs from "node:fs";
import assert from "node:assert/strict";
import {
  CLASS_MECHANIC_OWNERS,
  auditExclusiveMechanicCards,
  canUseClassMechanic,
  resolveDeckClass
} from "../js/battle-class-mechanics.js";
import { resolveConditionalText } from "../js/battle-rules-core.js";
import { simulateBattle } from "../js/battle-engine-v5.js";

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

const runeCard = sampleByClass.get("Runecraft");
assert.ok(runeCard, "Need a Runecraft card for simulation class validation");
assert.throws(
  () => simulateBattle({
    playerDeck: [[Number(runeCard.id), 1]],
    opponentDeck: [[Number(neutral.id), 1]],
    cardMap,
    playerClass: "Havencraft",
    opponentClass: "Havencraft",
    seed: "class-contract"
  }),
  /Illegal deck for Havencraft/,
  "The runtime must reject a deck whose cards do not match its selected class"
);

for (const [mechanic, owner] of Object.entries(CLASS_MECHANIC_OWNERS)) {
  assert.equal(canUseClassMechanic({ className: owner }, mechanic), true, `${owner} must be able to use ${mechanic}`);
  const foreign = owner === "Havencraft" ? "Portalcraft" : "Havencraft";
  assert.equal(canUseClassMechanic({ className: foreign }, mechanic), false, `${foreign} must not be able to use ${mechanic}`);
}

const havenNecro = { className: "Havencraft", shadows: 10, cardsPlayedThisTurn: 10, maxPp: 10 };
const blockedNecro = resolveConditionalText("Necromancy (3): Draw a card.", { player: havenNecro, card: null });
assert.equal(blockedNecro.active, false, "Havencraft must not activate Necromancy even with enough Shadows");
assert.equal(havenNecro.shadows, 10, "Blocked Necromancy must not spend Shadows");

const abyss = { className: "Abysscraft", shadows: 10, cardsPlayedThisTurn: 0, maxPp: 10 };
const allowedNecro = resolveConditionalText("Necromancy (3): Draw a card.", { player: abyss, card: null });
assert.equal(allowedNecro.active, true, "Abysscraft must activate Necromancy");
assert.equal(abyss.shadows, 7, "Abysscraft Necromancy must spend Shadows");

const blockedCombo = resolveConditionalText("Combo (3): Draw a card.", { player: { className: "Swordcraft", cardsPlayedThisTurn: 9 }, card: null });
assert.equal(blockedCombo.active, false, "Swordcraft must not activate Forestcraft Combo");
const allowedCombo = resolveConditionalText("Combo (3): Draw a card.", { player: { className: "Forestcraft", cardsPlayedThisTurn: 3 }, card: null });
assert.equal(allowedCombo.active, true, "Forestcraft must activate Combo");

const blockedOverflow = resolveConditionalText("Overflow: Draw a card.", { player: { className: "Havencraft", maxPp: 10 }, card: null });
assert.equal(blockedOverflow.active, false, "10 PP must not grant Overflow to a non-Dragoncraft leader");
const allowedOverflow = resolveConditionalText("Overflow: Draw a card.", { player: { className: "Dragoncraft", maxPp: 7 }, card: null });
assert.equal(allowedOverflow.active, true, "Dragoncraft must activate Overflow at 7 max PP");

const inventoryText = [...inventory.entries()]
  .map(([mechanic, rows]) => `${mechanic}=${rows.length}`)
  .join(" · ");
console.log(`Battle Sim exclusive class contracts: OK · ${inventoryText} · runtime boundaries verified`);
