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
  ["Ward Havencraft", []],
  ["Puppetry Portalcraft", []],
  ["Ramp Dragoncraft", []]
]);

for (const name of expectedPartials.keys()) {
  const reference = byName(name);
  const deck = deckList(reference);
  const coverage = analyzeDeckCoverage(deck, cardMap);
  assert.equal(coverage.unsupported, 0, `${name}: unsupported copies must be zero`);
  assert.deepEqual(coverage.partialCards, [], `${name}: partial card list must be empty`);
  assert.equal(coverage.partial, 0, `${name}: fully modeled deck must have zero partial copies`);
  assert.equal(coverage.modeledPercent, 100, `${name}: fully modeled deck must report 100% coverage`);

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
  assert.equal(result.summary.experimental, false, `${name}: fully modeled simulation must not be experimental`);
  assert.deepEqual(result.summary.stats.unsupportedEffects, [0, 0], `${name}: fully modeled mirror must expose zero rule gaps`);
  console.log(`${name}: 100% modeled · no partial cards · ${result.summary.rounds} rounds`);
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
  "Eudie, Your Dependable Mentor",
  "Asher & Lydia, Paths Beyond",
  "Odin, Twilit Fate",
  "Galleon, Earth Personified",
  "Sofina, Inspiring Strength",
  "Aether, Empyrean Guardian",
  "Edeth, Voice of Heaven",
  "Zooey, Ally of the World"
];

for (const name of fullyModeledFocusCards) {
  const card = cards.find(item => item.name === name);
  assert.ok(card, `${name} must exist in the official card database`);
  assert.equal(analyzeCardSupport(card).level, "full", `${name} is explicitly modeled and must not emit a rule gap`);
}

console.log("Battle Sim v5 integration: OK");
