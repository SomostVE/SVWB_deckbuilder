import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { analyzeCardSupport, inspectPortalcraftFullRules } from "../js/battle-engine-v5.js";

const cards = JSON.parse(await fs.readFile(new URL("../data/official/cards.json", import.meta.url), "utf8"));
const cardMap = new Map(cards.map(card => [Number(card.id), card]));
for (const card of cards) {
  card.__relatedCardObjects = (card.relatedCards ?? []).map(id => cardMap.get(Number(id))).filter(Boolean);
  card.__relatedNames = card.__relatedCardObjects.map(item => item.name);
}

const portal = cards.filter(card => String(card.class ?? "").toLowerCase() === "portalcraft");
const gaps = portal.map(card => ({ card, support: analyzeCardSupport(card) })).filter(entry => entry.support.level !== "full");
assert.equal(gaps.length, 0, `Portalcraft still has non-Full cards: ${gaps.map(entry => `${entry.card.name} (${entry.support.level})`).join(", ")}`);

const result = inspectPortalcraftFullRules({ cards });
assert.deepEqual(result.eudieResult, { countdown: 3, drawn: 1, healed: 1 }, "Eudie Crest must draw at <=5 cards and heal at >=6 cards");
assert.deepEqual(result.medicalResult, { firstBane: true, secondSameTurnBane: false }, "Medical-Grade Assassin must trigger only once on each own turn");
assert.deepEqual(result.slausResult, { ownModes: 3, banished: true, opponentCountdown: 3 }, "Slaus must exhaust three unique own start modes, grant the opponent Crest, and banish itself when evolved");
assert.deepEqual(result.slausCrestResult, { modes: 3, expired: true }, "Slaus opponent Crest must resolve all three unique start modes over Countdown 3");
assert.deepEqual(result.axeResult, { afterOne: 2, afterTwo: 1, restored: 3 }, "Unfeeling Eld Axe must stack temporary base-5 entry reductions and restore at turn end");
assert.equal(result.barkeepHeal, 1, "Brusque Barkeep must heal 1 on Artifact entry");
assert.deepEqual(result.myuuResult, { enemyDefense: 7, storm: true }, "Myuu must deal 3 on Artifact entry and gain Storm at 3 unique Artifact entries");
assert.equal(result.artisanDefense, 7, "Flowering Artisan must deal 3 to all enemy followers when a spell is played");
assert.deepEqual(result.camiscillaResult, { autoEvolve: true, leaderDamage: 2 }, "Camiscilla must evolve entering base-5+ allies and count base-5+ followers for Super-Evolve damage");

console.log(`Portalcraft class pass: ${portal.length}/${portal.length} Full · 8/8 special-rule cards behavior-locked`);
