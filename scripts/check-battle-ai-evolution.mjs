import assert from "node:assert/strict";
import { simulateBattle } from "../js/battle-engine.js";

const bigVanilla = {
  id: 99300001,
  name: "QA Big Vanilla",
  class: "Neutral",
  type: "Follower",
  cost: 1,
  attack: 6,
  defense: 6,
  keywords: [], traits: [], relatedCards: [], text: ""
};

const sweeper = {
  id: 99300002,
  name: "QA Evolution Sweeper",
  class: "Neutral",
  type: "Follower",
  cost: 1,
  attack: 1,
  defense: 1,
  keywords: [], traits: [], relatedCards: [],
  text: "Evolve: Deal 3 damage to all enemy followers."
};

const wall = {
  id: 99300003,
  name: "QA Ward Wall",
  class: "Neutral",
  type: "Follower",
  cost: 1,
  attack: 0,
  defense: 4,
  keywords: ["Ward"], traits: [], relatedCards: [], text: "Ward"
};

const cardMap = new Map([[bigVanilla.id, bigVanilla], [sweeper.id, sweeper], [wall.id, wall]]);
const playerDeck = [[bigVanilla.id, 20], [sweeper.id, 20]];
const opponentDeck = [[wall.id, 40]];

let qualifying = 0;
let choseSweeper = 0;
for (let index = 0; index < 80; index += 1) {
  const result = simulateBattle({
    playerDeck,
    opponentDeck,
    cardMap,
    playerStrategy: { style: "midrange", mulliganMaxCost: 2, faceBias: .2, tradeBias: .9 },
    opponentStrategy: { style: "ward-control", mulliganMaxCost: 2, faceBias: .2, tradeBias: .9 },
    seed: `qa-effect-aware-evolution:${index}`,
    playerSide: "second",
    recordFrames: true
  });

  const evolveIndex = result.frames.findIndex(frame => frame.active === 0 && frame.phase === "evolve");
  if (evolveIndex <= 0) continue;
  const before = result.frames[evolveIndex - 1];
  const evolve = result.frames[evolveIndex];
  const names = new Set(before.players?.[0]?.board?.map(unit => unit.name) ?? []);
  const enemyFollowers = (before.players?.[1]?.board ?? []).filter(unit => unit.type === "Follower").length;
  if (!names.has(bigVanilla.name) || !names.has(sweeper.name) || enemyFollowers < 2) continue;

  qualifying += 1;
  if (evolve.action.includes(sweeper.name)) choseSweeper += 1;
}

assert.ok(qualifying >= 5, `Expected at least 5 qualifying evolution states, got ${qualifying}`);
assert.equal(choseSweeper, qualifying,
  `When several enemy followers are present, the AI must evolve the small board-sweeper instead of the larger vanilla body (${choseSweeper}/${qualifying})`);

console.log(`Battle AI evolution: chose effect-aware sweeper ${choseSweeper}/${qualifying} qualifying states · OK`);
