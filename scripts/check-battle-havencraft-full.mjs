import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { analyzeCardSupport, inspectHavencraftFullRules } from "../js/battle-engine-v5.js";

const cards = JSON.parse(await fs.readFile(new URL("../data/official/cards.json", import.meta.url), "utf8"));
const cardMap = new Map(cards.map(card => [Number(card.id), card]));
for (const card of cards) {
  card.__relatedCardObjects = (card.relatedCards ?? []).map(id => cardMap.get(Number(id))).filter(Boolean);
  card.__relatedNames = card.__relatedCardObjects.map(item => item.name);
}

const haven = cards.filter(card => String(card.class ?? "").toLowerCase() === "havencraft");
const gaps = haven.map(card => ({ card, support: analyzeCardSupport(card) })).filter(row => row.support.level !== "full");
assert.equal(gaps.length, 0, `Havencraft must be fully modeled: ${gaps.map(row => `${row.card.name}=${row.support.level}`).join(", ")}`);

const qa = inspectHavencraftFullRules({ cards });
assert.deepEqual(qa.drawTriggers, { bouquetRush: true, mouseDamage: 1 }, "Bouquet and Shrinemouse must react to each own-turn draw");
assert.deepEqual(qa.engageTriggers, { heal: 1, mainyu: 1, drain: true, skyCost: 3 }, "Tikoh/Mainyu/Troue/Skyfaring must react to an amulet Engage");
assert.deepEqual(qa.devotee, { attack: 2, ward: true }, "Devotee Crest must give a random ally -2/-0 and Ward after a no-attack turn");
assert.deepEqual(qa.torrent, { enemy: 0, delay: 1 }, "Torrent of Despair must banish a random enemy follower and delay all finite Crests by 1");
assert.deepEqual(qa.templeResult, { gone: true, hp: 12, barrier: 1 }, "Temple Engage must use Crest count and its Last Words must heal + give leader Barrier");
assert.deepEqual(qa.shining, { totalDamage: 4, heal: 4 }, "Shining Disenchantment Last Words must split 4 damage among all enemies and heal 4");
assert.deepEqual(qa.skyEngage, { destroyed: true, evolved: true }, "Skyfaring Vessel Engage must destroy itself and evolve an unevolved allied follower");
assert.equal(qa.marwynnDamage, 2, "Marwynn Crest must deal X split damage where X is current Crest count after a no-attack turn");
assert.equal(qa.benisonHp, 10, "Maddening Benison Crest Last Words must deal 10 damage to its leader");
assert.equal(qa.congregantDraw, "Defense Four", "Congregant Crest must draw a follower with exactly 4 defense");
assert.equal(qa.saintFox, 1, "Saint of Rehabilitation must summon a Fox of Purity when leader defense is restored");
assert.deepEqual(qa.zoeCrest, { summoned: true, evolved: true }, "Zoe Countdown 1 Crest must resummon and evolve Zoe");
assert.deepEqual(qa.himekaCrest, { locked: true, marked: true }, "Himeka Crest must lock and mark eligible enemy followers");
assert.equal(qa.himekaAttack, 4, "Himeka Super-Evolve must set all enemy follower attack to 4");
assert.equal(qa.vicheCost, 3, "Viche must permanently reduce its cost by 3 per allied Super-Evolution");
assert.equal(qa.kukishiro.allied + qa.kukishiro.enemy, 2, "Kukishiro Crest must trigger once for each 1-6 cost card drawn");
assert.equal(qa.kukishiro.allied, 1, "Kukishiro odd-cost draw must summon an allied token");
assert.equal(qa.kukishiro.enemy, 1, "Kukishiro even-cost draw must summon an enemy token");
assert.deepEqual(qa.lyanthoth, { faithAfterDestroy: 1, faithAfterPay: 0, depths: true }, "Lyanthoth Faith must grow on allied amulet destruction and pay 10 for Depths");

console.log(`Havencraft class pass: ${haven.length}/${haven.length} Full · 19/19 former class gaps behavior-locked`);
