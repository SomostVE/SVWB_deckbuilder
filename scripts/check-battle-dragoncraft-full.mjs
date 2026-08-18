import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { analyzeCardSupport, inspectDragoncraftFullRules } from "../js/battle-engine-v5.js";

const cards = JSON.parse(await fs.readFile(new URL("../data/official/cards.json", import.meta.url), "utf8"));
const map = new Map(cards.map(card => [Number(card.id), card]));
for (const card of cards) {
  card.__relatedCardObjects = (card.relatedCards ?? []).map(id => map.get(Number(id))).filter(Boolean);
  card.__relatedNames = card.__relatedCardObjects.map(item => item.name);
}

const dragon = cards.filter(card => String(card.class ?? "").toLowerCase() === "dragoncraft");
const notFull = dragon.map(card => ({ card, support: analyzeCardSupport(card) })).filter(row => row.support.level !== "full");
assert.equal(notFull.length, 0, `Dragoncraft must be fully modeled: ${notFull.map(row => `${row.card.name}=${row.support.level}`).join(", ")}`);

const qa = inspectDragoncraftFullRules({ cards });

assert.equal(qa.devoteeDraws, 2, "Devotee of Disdain must draw after every surviving own-turn damage event");
assert.deepEqual(qa.jellyfish, { rush: true, bane: true }, "Jellyfish Dancer must gain Rush and Bane when a Marine enters");
assert.equal(qa.mariCostDuring, 0, "Mari must cost 0 after a base-3 allied follower Super-Evolves");
assert.equal(qa.mariCostAfter, 2, "Mari's zero-cost change must expire at end of turn");
assert.deepEqual(qa.mariBuff, [1, 1], "Mari must give a random Super-Evolved allied follower +1/+1 at end of turn");
assert.deepEqual(qa.spiritBuff, [1, 1], "Spirit of Wadatsumi Crest must give entering Marine followers +1/+1");
assert.deepEqual(qa.crescentResult, { countdown: 4, buff: [1, 1] }, "Crescent Tube Ride Crest must be Countdown 4 and buff a random allied follower at end of turn");
assert.equal(qa.megWardAfterBase2, true, "Meg must gain Ward when a base-2 allied follower enters");
assert.equal(qa.megIgnoresChangedCost, true, "Meg must use base cost, not changed current cost");
assert.equal(qa.oceanRiderWard, true, "Ocean Rider must give entering Marine followers Ward");
assert.deepEqual(qa.yubeResult, { attackGain: 2, generated: 1 }, "Yube Crest must buff each Marine attack but generate only one Megalorca per turn");

assert.equal(qa.dracheResult.stats.length, 3, "Drache regression must cover three entries");
assert.equal(qa.dracheResult.stats[1].attack - qa.dracheResult.stats[0].attack, 1, "Second Drache must gain +1 attack from one prior entry");
assert.equal(qa.dracheResult.stats[1].defense - qa.dracheResult.stats[0].defense, 1, "Second Drache must gain +1 defense from one prior entry");
assert.equal(qa.dracheResult.stats[0].evolved, false, "First Drache must not auto-evolve");
assert.equal(qa.dracheResult.stats[1].evolved, false, "Second Drache must not auto-evolve at X=1");
assert.equal(qa.dracheResult.stats[2].evolved, true, "Third Drache must auto-evolve at X=2");
assert.equal(qa.dracheResult.generatedCost, 2, "Expired Drache Crest must generate a cost-2 Drache");
assert.equal(qa.dracheResult.generatedBaseCost, 4, "Generated Drache must retain base cost 4 for base-cost conditions");

assert.equal(qa.shredderHeal, 2, "Stormy Shamisen Shredder must heal 2 when a Marine enters");
assert.equal(qa.burniteBoardDamage, 4, "Burnite Flame Fanfare must use the discarded card's cost for board damage");
assert.equal(qa.burniteZeroHealDamage, 1, "Burnite Flame Crest must trigger even when a heal restores 0");
assert.equal(qa.burniteOncePerTurn, 1, "Burnite Flame Crest must not damage the leader twice from healing in the same turn");
assert.equal(qa.burniteStartDamage, 1, "Burnite Flame Crest must deal 1 damage at turn start");
assert.deepEqual(qa.azurifrit, { leaderDamage: 3, ownDefense: 3, enemyDefense: 4 }, "Azurifrit must resolve three separate 2-damage sweeps and trigger on every surviving self-damage event");
assert.deepEqual(qa.elderResult, { initialCountdown: 2, afterDelay: 4, endSummons: 1 }, "Dragon's Vale Elder Crest must be Countdown 2, summon at end of turn and be delayable by 2");
assert.equal(qa.wiseCost, 4, "Wise Guardian Dragon must reduce its cost by 3 for each allied Super-Evolution");

console.log(`Dragoncraft class pass: ${dragon.length}/${dragon.length} Full · 14/14 special-rule cards behavior-locked`);
