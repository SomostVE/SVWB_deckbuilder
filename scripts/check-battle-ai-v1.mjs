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
const cardMap = new Map([[oneDrop.id, oneDrop], [twoDrop.id, twoDrop]]);
const mixedDeck = [[oneDrop.id, 20], [twoDrop.id, 20]];

let usedOnFirstTurn = 0;
let eligibleSamples = 0;
for (let index = 0; index < 40; index += 1) {
  const result = simulateBattle({
    playerDeck: mixedDeck,
    opponentDeck: mixedDeck,
    cardMap,
    playerStrategy: { style: "aggro", mulliganMaxCost: 2, faceBias: .9, tradeBias: .2 },
    opponentStrategy: { style: "aggro", mulliganMaxCost: 2, faceBias: .9, tradeBias: .2 },
    seed: `qa-ai-extra-pp:${index}`,
    playerSide: "second",
    recordFrames: true
  });

  const start = result.frames.find(frame => frame.active === 0 && frame.players?.[0]?.personalTurn === 1 && frame.phase === "draw");
  if (!start) continue;
  const costs = start.players[0].hand.map(card => Number(card.cost));
  if (!costs.includes(1) || !costs.includes(2)) continue;
  eligibleSamples += 1;

  const firstTurnFrames = result.frames.filter(frame => frame.active === 0 && frame.players?.[0]?.personalTurn === 1);
  if (firstTurnFrames.some(frame => Number(frame.players?.[0]?.bonusPpUses ?? 0) >= 1)) usedOnFirstTurn += 1;
}

assert.ok(eligibleSamples >= 20, `Expected enough mixed opening hands, got ${eligibleSamples}`);
assert.ok(usedOnFirstTurn / eligibleSamples >= .75,
  `AI should use Extra PP to upgrade a playable 1-drop into a stronger 2-drop; used ${usedOnFirstTurn}/${eligibleSamples}`);

const oneDropOnly = [[oneDrop.id, 40]];
const noUpgrade = simulateBattle({
  playerDeck: oneDropOnly,
  opponentDeck: oneDropOnly,
  cardMap,
  playerStrategy: { style: "aggro", mulliganMaxCost: 2, faceBias: .9, tradeBias: .2 },
  opponentStrategy: { style: "aggro", mulliganMaxCost: 2, faceBias: .9, tradeBias: .2 },
  seed: "qa-ai-no-extra-pp-waste",
  playerSide: "second",
  recordFrames: true
});
const firstTurnEnd = [...noUpgrade.frames].reverse().find(frame => frame.active === 0 && frame.players?.[0]?.personalTurn === 1);
assert.equal(Number(firstTurnEnd?.players?.[0]?.bonusPpUses ?? 0), 0,
  "AI should not consume Extra PP on turn 1 when +1 PP unlocks no better action or extra spend");

console.log(`Battle AI v1 Extra PP: ${usedOnFirstTurn}/${eligibleSamples} eligible upgraded openings · no-waste case OK`);
