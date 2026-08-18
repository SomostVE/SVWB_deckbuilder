import assert from "node:assert/strict";
import { simulateBattle } from "../js/battle-engine.js";

const oneDrop = {
  id: 99100001,
  name: "QA One Drop",
  class: "Neutral",
  type: "Follower",
  cost: 1,
  attack: 1,
  defense: 1,
  keywords: [], traits: [], relatedCards: [], text: ""
};
const twoDrop = {
  id: 99100002,
  name: "QA Two Drop",
  class: "Neutral",
  type: "Follower",
  cost: 2,
  attack: 2,
  defense: 2,
  keywords: [], traits: [], relatedCards: [], text: ""
};
const nineDrop = {
  id: 99100003,
  name: "QA Nine Drop",
  class: "Neutral",
  type: "Follower",
  cost: 9,
  attack: 9,
  defense: 9,
  keywords: [], traits: [], relatedCards: [], text: ""
};
const cardMap = new Map([[oneDrop.id, oneDrop], [twoDrop.id, twoDrop], [nineDrop.id, nineDrop]]);
const mixedDeck = [[oneDrop.id, 20], [twoDrop.id, 20]];

function firstTurnBonusUses(result) {
  const frame = [...result.frames].reverse().find(frame => frame.active === 0 && frame.players?.[0]?.personalTurn === 1);
  return Number(frame?.players?.[0]?.bonusPpUses ?? 0);
}

let usedOnFirstTurn = 0;
let controlUsedOnFirstTurn = 0;
let eligibleSamples = 0;
for (let index = 0; index < 40; index += 1) {
  const common = {
    playerDeck: mixedDeck,
    opponentDeck: mixedDeck,
    cardMap,
    seed: `qa-ai-extra-pp:${index}`,
    playerSide: "second",
    recordFrames: true
  };
  const aggro = simulateBattle({
    ...common,
    playerStrategy: { style: "aggro", mulliganMaxCost: 2, faceBias: .9, tradeBias: .2 },
    opponentStrategy: { style: "aggro", mulliganMaxCost: 2, faceBias: .9, tradeBias: .2 }
  });

  const start = aggro.frames.find(frame => frame.active === 0 && frame.players?.[0]?.personalTurn === 1 && frame.phase === "draw");
  if (!start) continue;
  const costs = start.players[0].hand.map(card => Number(card.cost));
  if (!costs.includes(1) || !costs.includes(2)) continue;
  eligibleSamples += 1;
  if (firstTurnBonusUses(aggro) >= 1) usedOnFirstTurn += 1;

  const control = simulateBattle({
    ...common,
    playerStrategy: { style: "ward-control", mulliganMaxCost: 2, faceBias: .25, tradeBias: .9 },
    opponentStrategy: { style: "ward-control", mulliganMaxCost: 2, faceBias: .25, tradeBias: .9 }
  });
  if (firstTurnBonusUses(control) >= 1) controlUsedOnFirstTurn += 1;
}

assert.ok(eligibleSamples >= 20, `Expected enough mixed opening hands, got ${eligibleSamples}`);
assert.ok(usedOnFirstTurn / eligibleSamples >= .75,
  `Aggro AI should use Extra PP to upgrade a playable 1-drop into a stronger 2-drop; used ${usedOnFirstTurn}/${eligibleSamples}`);
assert.equal(controlUsedOnFirstTurn, 0,
  "Control AI should preserve Extra PP on turn 1 for a small generic curve upgrade");

// A real no-waste case: exactly one 1-drop is available and every other card
// in hand costs 9. +1 PP cannot improve the action or enable a second play.
const noUpgradeDeck = [[oneDrop.id, 10], [nineDrop.id, 30]];
let noUpgradeEligible = 0;
let noUpgradeUses = 0;
for (let index = 0; index < 80; index += 1) {
  const noUpgrade = simulateBattle({
    playerDeck: noUpgradeDeck,
    opponentDeck: noUpgradeDeck,
    cardMap,
    playerStrategy: { style: "aggro", mulliganMaxCost: 10, faceBias: .9, tradeBias: .2 },
    opponentStrategy: { style: "aggro", mulliganMaxCost: 10, faceBias: .9, tradeBias: .2 },
    seed: `qa-ai-no-extra-pp-waste:${index}`,
    playerSide: "second",
    recordFrames: true
  });
  const start = noUpgrade.frames.find(frame => frame.active === 0 && frame.players?.[0]?.personalTurn === 1 && frame.phase === "draw");
  if (!start) continue;
  const costs = start.players[0].hand.map(card => Number(card.cost));
  if (costs.filter(cost => cost === 1).length !== 1 || costs.some(cost => cost > 1 && cost <= 2)) continue;
  noUpgradeEligible += 1;
  if (firstTurnBonusUses(noUpgrade) >= 1) noUpgradeUses += 1;
}
assert.ok(noUpgradeEligible >= 10, `Expected enough explicit no-upgrade openings, got ${noUpgradeEligible}`);
assert.equal(noUpgradeUses, 0,
  `AI should not consume Extra PP when +1 PP unlocks no better action or extra spend; used ${noUpgradeUses}/${noUpgradeEligible}`);

console.log(`Battle AI v1.1 Extra PP: aggro ${usedOnFirstTurn}/${eligibleSamples} upgraded openings · control ${controlUsedOnFirstTurn}/${eligibleSamples} early uses · no-waste ${noUpgradeUses}/${noUpgradeEligible}`);