import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { analyzeCardSupport, inspectRunecraftFullRules, inspectRunecraftExtendedRules } from "../js/battle-engine-v5.js";

const RUNECraft_SPECIAL_RULES = [
  "Bergent, Rejected Artes",
  "Bottomless Gluttony",
  "Cagliostro, Genius Alchemist",
  "Calge-Danthla, Eld Crystals",
  "Crystal Gazing",
  "Depths of the Eld Crystals",
  "Elmott, Remembrance Aflame",
  "Emperor of Elements",
  "Enraptured Student",
  "Ginger, Disastrous Word",
  "Grandeur of the Dawnblossom",
  "Heel, My Dearie",
  "Insomniac Witch",
  "Institute of Truth",
  "Juno, Visionary Alchemist",
  "Lhynkal, Wandering Fool",
  "Lilanthim, Anathema of Predation",
  "Noble Shikigami",
  "Pascale's Dance",
  "Shymm, Love Bewitched",
  "Tico, Mysterian Spellcrafter"
];

const cards = JSON.parse(await fs.readFile(new URL("../data/official/cards.json", import.meta.url), "utf8"));
const map = new Map(cards.map(card => [Number(card.id), card]));
for (const card of cards) {
  card.__relatedCardObjects = (card.relatedCards ?? []).map(id => map.get(Number(id))).filter(Boolean);
  card.__relatedNames = card.__relatedCardObjects.map(item => item.name);
}

const rune = cards.filter(card => String(card.class ?? "").toLowerCase() === "runecraft");
assert.equal(rune.length, 112, `Expected 112 Runecraft cards in the current database, got ${rune.length}`);

const supportRows = rune.map(card => ({ card, support: analyzeCardSupport(card) }));
const gaps = supportRows.filter(entry => entry.support.level !== "full");
assert.deepEqual(gaps.map(entry => `${entry.card.name}: ${entry.support.level} (${entry.support.reason})`), [], "Every Runecraft card must be fully modeled after the class pass");

// A V5 Full override is only acceptable for Runecraft when the card is explicitly
// behavior-locked below. This prevents a future override from silently turning an
// untested complex card green in the coverage report.
const v5SpecialRules = supportRows
  .filter(entry => String(entry.support.reason ?? "").startsWith("Battle Sim v5:"))
  .map(entry => entry.card.name)
  .sort((a, b) => a.localeCompare(b));
const behaviorLockedSpecialRules = [...RUNECraft_SPECIAL_RULES].sort((a, b) => a.localeCompare(b));
assert.equal(v5SpecialRules.length, 21, `Expected 21 Runecraft V5 special-rule cards, got ${v5SpecialRules.length}`);
assert.deepEqual(v5SpecialRules, behaviorLockedSpecialRules, "Every Runecraft V5 Full override must have a dedicated behavior regression in this file");

const qa = inspectRunecraftFullRules({ cards });
assert.equal(qa.lhynkalMaxDefense, 18, "Lhynkal Crest must reduce enemy max defense by 2 on a later Lhynkal entry");
assert.deepEqual(qa.earthRiteDiscounts, [-1, -1], "Bottomless Gluttony and Heel, My Dearie must each discount once per Earth Rite");
assert.equal(qa.faithAfterCrystal, 1, "Crystalspawn must increase active Faith by 1");
assert.equal(qa.calgeDiscount, -1, "Crystalspawn must reduce Calge-Danthla's hand cost by 1");
assert.equal(qa.ticoDamage, 1, "Tico Crest must deal 1 when a Mysteria spell is played");
assert.equal(qa.shymmAttackBuff, 1, "Shymm Crest must give an attacking Crystalspawn +1/+0");
assert.deepEqual(qa.instituteEngage, { costDelta: 1, attackBonus: 1, defenseBonus: 1 }, "Institute Engage must change hand follower cost and stats");
assert.deepEqual(qa.instituteReaction, { countdown: 4, hand: 1 }, "Institute must draw and advance its countdown after a changed-cost follower is played");
assert.equal(qa.depthPartition.sum, qa.depthPartition.faith, "Depths X/Y/Z must sum to the pre-summon Faith value");
assert.equal(qa.depthPartition.faith, 6, "Depths QA Faith setup changed unexpectedly");
assert.deepEqual(qa.grandeurNames, ["Odin, Twilit Fate", "Odin, Twilit Fate"], "Grandeur must transform allied followers into exact deck-follower copies");
assert.deepEqual(qa.crystalGazingResult, { drawn: 2, enemyBoard: 0 }, "Crystal Gazing Crest Last Words must draw 2 and deal 4 to enemy followers");

const extended = inspectRunecraftExtendedRules({ cards });
assert.equal(extended.elmottStartDamage, 1, "Elmott Crest must deal 1 at the start of the owner's turn");
assert.deepEqual(extended.cagliostroStart, { earthSigils: 0, ars: 1 }, "Cagliostro Crest must Earth Rite 1 and add Ars Magna");
assert.equal(extended.bergentStart, 1, "Bergent Crest must summon an Onion Patch at turn start");
assert.deepEqual(extended.pascaleEnd, { attack: 4, defense: 6, earthSigils: 0, hand: 1 }, "Pascale Crest must draw and Earth Rite 10 to double allied followers");
assert.deepEqual(extended.junoEnd, { earthSigils: 0, guardians: 1 }, "Juno Crest must Earth Rite 1 and summon Guardian Golem");
assert.deepEqual(extended.insomniacLastWords, { allied: 0, enemy: 0 }, "Insomniac Crest Last Words must deal 3 to all followers");
assert.equal(extended.enrapturedHeal, 1, "Enraptured Student must heal when Crystalspawn enters");
assert.deepEqual(extended.emperorEntry, { evolved: true, earthSigils: 0 }, "Emperor of Elements must Earth Rite 1 and evolve an entering Golem");
assert.deepEqual(extended.gingerEntry, { rush: true, spellboost: 1 }, "Ginger must give another entering follower Rush and Spellboost the hand");
assert.deepEqual(extended.nobleEntry, { attack: 4, defense: 5 }, "Noble Shikigami must gain the destroyed Shikigami base-stat totals from this turn");
assert.deepEqual(extended.lilanthimEnd, { summoned: true, evolved: true }, "Lilanthim Crest must summon and evolve Lilanthim at opponent turn end");
assert.deepEqual(extended.calgeFanfare, { count: 2, storm: 2, faith: 2 }, "Calge-Danthla must summon two Storm Crystalspawns and gain Faith for both entries");
assert.equal(extended.ticoDiscount, -1, "Tico Evolve must reduce Mysteria spell costs in hand by 1");
assert.deepEqual(extended.elmottSilence, { defense: 2, ward: false, triggeredText: "" }, "Elmott must remove follower abilities before dealing 3");
assert.equal(extended.lhynkalInjection, 10, "Lhynkal Super-Evolve must add 10 copies to the deck");

console.log(`Runecraft class pass: ${rune.length}/${rune.length} Full · ${v5SpecialRules.length}/${behaviorLockedSpecialRules.length} V5 special rules behavior-locked`);
