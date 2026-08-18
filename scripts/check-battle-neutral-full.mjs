import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { analyzeCardSupport, inspectNeutralFullRules } from "../js/battle-engine-v5.js";

const cards = JSON.parse(await fs.readFile(new URL("../data/official/cards.json", import.meta.url), "utf8"));
const cardMap = new Map(cards.map(card => [Number(card.id), card]));
for (const card of cards) {
  card.__relatedCardObjects = (card.relatedCards ?? []).map(id => cardMap.get(Number(id))).filter(Boolean);
  card.__relatedNames = card.__relatedCardObjects.map(item => item.name);
}

const neutral = cards.filter(card => String(card.class ?? "").toLowerCase() === "neutral");
const gaps = neutral.map(card => ({ card, support: analyzeCardSupport(card) })).filter(row => row.support.level !== "full");
assert.equal(gaps.length, 0, `Neutral must be fully modeled: ${gaps.map(row => `${row.card.name}=${row.support.level}`).join(", ")}`);

const qa = inspectNeutralFullRules({ cards });
assert.equal(qa.worldCountdown, 4, "World of Games must advance for a same-base-cost card on the opponent field");
assert.equal(qa.encroachedCopy, "Silent Rider", "Encroached World must transform a hand card into an exact opponent-deck copy");
assert.deepEqual(qa.mjDeck, { count: 76, distinct: 76, victory: true }, "Mjerrabaine must create the exact 76-card Heirs deck plus Victory-on-exhaustion state");
assert.deepEqual(qa.mjTurnEnd, { testimony: true, hand: 7, discarded: true }, "Mjerrabaine must preserve Great Testimony, discard the rest, then draw 6");
assert.deepEqual(qa.mjVictory, { victory: true, deckOut: false }, "Mjerrabaine deck exhaustion must be a special victory, not deck-out loss");
assert.equal(qa.katalinaDamage, 3, "Katalina must never take more than 3 damage from one instance");
assert.deepEqual(qa.illStrike, { barrier: 1, locked: true, marked: true }, "Illamrita follower strike must gain Barrier and lock/mark the opposing follower");
assert.equal(qa.illBanish, 0, "Illamrita-marked follower must banish itself at the end of its controller's turn");
assert.deepEqual(qa.illCrestResult, { summoned: true, evolved: true }, "Illamrita Countdown Crest Last Words must summon and evolve Illamrita");
assert.deepEqual(qa.bahamutFollowers, { allied: 1, enemy: 0, survived: true }, "Alabaster Bahamut follower mode must banish every other follower on both fields");
assert.deepEqual(qa.bahamutAmulets, [0, 0], "Alabaster Bahamut amulet mode must banish all amulets on both fields");
assert.deepEqual(qa.bahamutCrests, [0, 0], "Alabaster Bahamut Crest mode must banish all Crests on both leaders");
assert.equal(qa.apocalypse.count, 10, "Apocalypse Deck must contain exactly 10 cards");
assert.deepEqual(qa.apocalypse.composition, {
  "Astaroth's Reckoning": 1,
  "Demon of Purgatory": 3,
  "Servant of Cocytus": 3,
  "Silent Rider": 3
}, "Apocalypse Deck composition must be exact");
assert.deepEqual(qa.astaroth, { hp: 1, maxHp: 1 }, "Astaroth's Reckoning must set max defense to 1 and clamp current defense");

console.log(`Neutral class pass: ${neutral.length}/${neutral.length} Full · 8/8 special-rule cards behavior-locked`);
