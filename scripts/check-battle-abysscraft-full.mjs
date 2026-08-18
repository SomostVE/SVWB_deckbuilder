import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { analyzeCardSupport, inspectAbysscraftFullRules } from "../js/battle-engine-v5.js";

const cards = JSON.parse(await fs.readFile(new URL("../data/official/cards.json", import.meta.url), "utf8"));
const map = new Map(cards.map(card => [Number(card.id), card]));
for (const card of cards) {
  card.__relatedCardObjects = (card.relatedCards ?? []).map(id => map.get(Number(id))).filter(Boolean);
  card.__relatedNames = card.__relatedCardObjects.map(item => item.name);
}

const abyss = cards.filter(card => String(card.class ?? "").toLowerCase() === "abysscraft");
const notFull = abyss.map(card => ({ card, support: analyzeCardSupport(card) })).filter(row => row.support.level !== "full");
assert.equal(notFull.length, 0, `Abysscraft must be fully modeled: ${notFull.map(row => `${row.card.name}=${row.support.level}`).join(", ")}`);

const qa = inspectAbysscraftFullRules({ cards });

assert.deepEqual(qa.shamFaith, { afterPayment: 1, bonus: 1, selected: 2 }, "Sham-Nacha must spend 10 Faith, grant +1 Mode selection, then gain 1 Faith when Modes are selected");
assert.deepEqual(qa.shamSuperCopy, { enemyBoard: 0, handName: "Copy Target" }, "Sham-Nacha Super-Evolve must destroy the selected enemy follower and add a copy to hand");
assert.deepEqual(qa.rigorResult, { countdown: 2, hand: 4, skeletonWard: true }, "Rigor Crest must be Countdown 2, draw first, then summon a Ward Skeleton when four same-cost cards are in hand");
assert.deepEqual(qa.valiantResult, { enemyDefense: 3, hp: 11, countdown: 2 }, "Valiant Edge Crest must deal 2 to a random enemy follower and heal 1 at end of turn");
assert.deepEqual(qa.baltoResult, { self: 19, enemy: 19, countdown: 4 }, "Balto Crest must deal 1 damage to both leaders at end of turn");
assert.deepEqual(qa.vuellaBuff, [2, 2], "Vuella must give herself and another allied Super-Evolved follower +2/+0");
assert.deepEqual(qa.departedResult, { bane: true, ward: true, storm: true, rush: true, attackGain: 1, leaderDamage: 1 }, "Departed entry must dispatch Mukan, Charon, Beastmaster Bones and Macmillan reactions");
assert.deepEqual(qa.charonCrestResult, { countdown: 2, departed: true }, "Charon Crest must be Countdown 2 and Reanimate 3 at start of turn");
assert.deepEqual(qa.corruptionCrests, { own: true, enemy: true, allyDefense: 2, enemyDefense: 2 }, "Corruption must give both leaders its Crest and apply -2/-2 to all followers");
assert.equal(qa.corruptionEndDamage, 2, "Corruption Crest must deal 2 damage to its owner at end of turn");
assert.equal(qa.corruptionDestroyed, true, "Corruption Super Skybound effect must be able to destroy the owner's Crest");
assert.equal(qa.belialCountdown, 3, "Belial Super-Evolve must advance its Countdown 4 Crest by 1");
assert.equal(qa.belialDamage, 20, "Belial Crest Last Words must deal 20 damage to the enemy leader");
assert.deepEqual(qa.milteoResult, { enemyHp: 20, evolved: true, countdown: null }, "Milteo Crest must suppress played follower Fanfare and evolve the follower instead");
assert.equal(qa.lifestealerHeal, 1, "Lifestealer must heal 1 whenever a Skeleton is destroyed");

console.log(`Abysscraft class pass: ${abyss.length}/${abyss.length} Full · 13/13 special-rule cards behavior-locked`);
