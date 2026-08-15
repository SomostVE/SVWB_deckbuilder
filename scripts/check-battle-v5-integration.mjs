import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { BATTLE_RULES_VERSION, analyzeCardSupport, analyzeDeckCoverage, simulateBattle } from "../js/battle-engine.js";

const cards = JSON.parse(await fs.readFile(new URL("../data/official/cards.json", import.meta.url), "utf8"));
const references = JSON.parse(await fs.readFile(new URL("../data/custom/reference-decks.json", import.meta.url), "utf8")).decks ?? [];
const cardMap = new Map(cards.map(card => [Number(card.id), card]));

assert.equal(BATTLE_RULES_VERSION, 5, "Battle Sim v5 must be active");

function byName(name) {
  const deck = references.find(reference => reference.name === name);
  assert.ok(deck, `Missing reference deck: ${name}`);
  return deck;
}

function deckList(reference) {
  return reference.cards.map(card => [Number(card.cardId), Number(card.qty ?? 1)]);
}

const expectedPartials = new Map([
  ["Ward Havencraft", [
    "Galleon, Earth Personified",
    "Sofina, Inspiring Strength",
    "Aether, Empyrean Guardian",
    "Edeth, Voice of Heaven"
  ]],
  ["Puppetry Portalcraft", [
    "Eudie, Your Dependable Mentor",
    "Asher & Lydia, Paths Beyond"
  ]]
]);

for (const name of ["Ward Havencraft", "Puppetry Portalcraft"]) {
  const reference = byName(name);
  const deck = deckList(reference);
  const coverage = analyzeDeckCoverage(deck, cardMap);
  assert.equal(coverage.unsupported, 0, `${name}: unsupported copies must be zero`);
  assert.deepEqual(coverage.partialCards, expectedPartials.get(name), `${name}: partial list must reflect only the remaining known unmodeled clauses`);
  assert.ok(coverage.partial > 0 && coverage.modeledPercent < 100, `${name}: honest coverage must remain below 100% until the remaining clauses are implemented`);

  const result = simulateBattle({
    playerDeck: deck,
    opponentDeck: deck,
    cardMap,
    playerStrategy: reference.strategy ?? {},
    opponentStrategy: reference.strategy ?? {},
    seed: `v5-integration:${name}`,
    playerSide: "first",
    recordFrames: false
  });
  assert.ok(result.summary.rounds > 0, `${name}: simulation must complete turns`);
  assert.equal(result.summary.experimental, true, `${name}: known partial rules must keep the simulation marked experimental`);
  console.log(`${name}: ${coverage.modeledPercent}% modeled · partial: ${coverage.partialCards.join(", ")} · ${result.summary.rounds} rounds`);
}

const fullyModeledFocusCards = [
  "Analyzing Artifact",
  "Freerunning",
  "Scarlet, Anathema of Dislocation",
  "Serene Sanctuary",
  "Jeanne, Saintly Knight",
  "Olivia, Proud Dark Angel",
  "Puppet Cat",
  "Lovestruck Puppeteer",
  "Cool Courier",
  "Odin, Twilit Fate"
];

for (const name of fullyModeledFocusCards) {
  const card = cards.find(item => item.name === name);
  assert.ok(card, `${name} must exist in the official card database`);
  assert.equal(analyzeCardSupport(card).level, "full", `${name} is explicitly modeled and must not emit a rule gap`);
}

const dragon = byName("Ramp Dragoncraft");
const dragonCoverage = analyzeDeckCoverage(deckList(dragon), cardMap);
assert.equal(dragonCoverage.unsupported, 0, "Ramp Dragoncraft must have no unsupported copies");
assert.deepEqual(dragonCoverage.partialCards, ["Zooey, Ally of the World"], "Only Zooey should remain partial in Ramp Dragoncraft after v5");

console.log(`Ramp Dragoncraft: ${dragonCoverage.modeledPercent}% modeled · remaining partial: ${dragonCoverage.partialCards.join(", ")}`);
console.log("Battle Sim v5 integration: OK");
