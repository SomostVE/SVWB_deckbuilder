import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { analyzeCardSupport, inspectForestcraftFullRules } from "../js/battle-engine-v5.js";

const cards = JSON.parse(await fs.readFile(new URL("../data/official/cards.json", import.meta.url), "utf8"));
const map = new Map(cards.map(card => [Number(card.id), card]));
for (const card of cards) {
  card.__relatedCardObjects = (card.relatedCards ?? []).map(id => map.get(Number(id))).filter(Boolean);
  card.__relatedNames = card.__relatedCardObjects.map(item => item.name);
}

const forest = cards.filter(card => String(card.class ?? "").toLowerCase() === "forestcraft");
const notFull = forest.map(card => ({ card, support: analyzeCardSupport(card) })).filter(row => row.support.level !== "full");
assert.equal(notFull.length, 0, `Forestcraft must be fully modeled: ${notFull.map(row => `${row.card.name}=${row.support.level}`).join(", ")}`);

const qa = inspectForestcraftFullRules({ cards });

assert.deepEqual(qa.magnified, { gained: true, minimized: 1 }, "Magnified Malice must gain its Combo Crest and Last Words into Minimized Anxiety");
assert.deepEqual(qa.minimized, { healedHp: 11, magnified: 1 }, "Minimized Anxiety must heal, gain its Combo Crest and Last Words into Magnified Malice");
assert.deepEqual(qa.starry, { leaderDamage: 1, regenerated: 1 }, "Starry Sky Crest Last Words must damage the enemy leader and regenerate Starry Sky");
assert.deepEqual(qa.sathanid, { faith: 1, granted: 1, depths: true, evolved: true, damage: 1 }, "Sathanid/Depths must pay Faith, grant evolution damage, then evolve and rebuild Faith");
assert.equal(qa.fairyBladeAttack, 2, "*** the Fairy Blade must gain +1/+0 when a Pixie enters");
assert.equal(qa.fairyFencerCost, 1, "Fairy Fencer must cost 1 after an allied Super-Evolution");
assert.equal(qa.wildProfusionDamage, 1, "Wild Profusion must deal 1 random follower damage on Pixie entry");
assert.deepEqual(qa.thestaeFanfare, { defense: 5, combo: 2 }, "Thestae must apply -0/-X using its attack and increase Combo by 1");
assert.deepEqual(qa.thestaeCrest, { attackBonus: 1, defenseBonus: 1 }, "Thestae Crest must buff every follower in deck at Combo 3");
assert.equal(qa.titaniaStartFairy, 1, "Titania Crest must add a Fairy at turn start");
assert.equal(qa.titaniaTransform, "Fairy", "Titania Evolve must transform the selected enemy follower into a Fairy");
assert.equal(qa.battledoreLeaderDamage, 1, "Battledore Woodsmaiden must deal 1 leader damage on Pixie entry");
assert.equal(qa.battledoreEvolveSummons, 1, "Battledore Evolve must replicate its Fairy-summoning Fanfare");
assert.equal(qa.floralCost, 4, "Floral Offering must discount by 1 per allied evolution");
assert.equal(qa.mercifulHeal, 1, "Merciful Attendant must heal the leader after an allied evolution");
assert.deepEqual(qa.yuelCrest, { first: true, second: false }, "Yuel & Societte Crest must evolve only the first follower played each turn");
assert.equal(qa.ariaStorm, true, "Aria Crest must give entering Pixies Storm");
assert.equal(qa.ariaFairies, 3, "Aria Evolve must summon 3 Fairies");
assert.equal(qa.ariaFairyStorms, 3, "Aria's three evolved Fairies must receive Storm from the Crest");
assert.equal(qa.greatHartSplit, 5, "Great Hart end-turn split damage must use its current attack");
assert.equal(qa.greatHartBounty, 1, "Great Hart Crest must add Deepwood Bounty at Combo 3");
assert.deepEqual(qa.macrobear, { copies: 2, damageTaken: 3 }, "Macrobear must summon one exact copy and cap each damage instance at 3");
assert.deepEqual(qa.congregant, { count: 5, defenses: [6, 5, 4, 3, 2] }, "Congregant exact-copy entry chain must fill the board with descending defense copies");

console.log(`Forestcraft class pass: ${forest.length}/${forest.length} Full · 17/17 special-rule cards behavior-locked`);
