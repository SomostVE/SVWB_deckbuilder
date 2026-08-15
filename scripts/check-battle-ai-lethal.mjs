import assert from "node:assert/strict";
import { simulateBattle } from "../js/battle-engine.js";

const attacker = {
  id: 99400001,
  name: "QA Lethal Attacker",
  class: "Neutral",
  type: "Follower",
  cost: 2,
  attack: 10,
  defense: 6,
  keywords: [], traits: [], relatedCards: [], text: ""
};
const distraction = {
  id: 99400002,
  name: "QA Distraction",
  class: "Neutral",
  type: "Follower",
  cost: 1,
  attack: 0,
  defense: 20,
  keywords: [], traits: [], relatedCards: [], text: ""
};
const cardMap = new Map([[attacker.id, attacker], [distraction.id, distraction]]);

let qualifying = 0;
let converted = 0;
for (let seedIndex = 0; seedIndex < 60; seedIndex += 1) {
  const result = simulateBattle({
    playerDeck: [[attacker.id, 40]],
    opponentDeck: [[distraction.id, 40]],
    cardMap,
    playerStrategy: { style: "midrange", mulliganMaxCost: 3, faceBias: .2, tradeBias: .8 },
    opponentStrategy: { style: "control", mulliganMaxCost: 3, faceBias: .1, tradeBias: .9 },
    seed: `qa-collective-lethal:${seedIndex}`,
    playerSide: "first",
    recordFrames: true
  });

  for (let frameIndex = 1; frameIndex < result.frames.length; frameIndex += 1) {
    const frame = result.frames[frameIndex];
    if (frame.active !== 0 || frame.phase !== "attack") continue;
    const before = result.frames[frameIndex - 1];
    if (before.active !== 0) continue;
    const enemy = before.players?.[1];
    const player = before.players?.[0];
    if (!enemy || !player || enemy.board.some(unit => unit.keywords?.includes("Ward")) || enemy.board.length === 0) continue;
    const available = player.board.filter(unit => unit.type === "Follower" && unit.canAttackLeader && unit.attacksMade < unit.maxAttacks);
    const faceDamage = available.reduce((sum, unit) => sum + Math.max(0, Number(unit.attack) || 0) * Math.max(0, (Number(unit.maxAttacks) || 1) - (Number(unit.attacksMade) || 0)), 0);
    if (faceDamage < enemy.hp || available.length < 2) continue;

    qualifying += 1;
    const personalTurn = player.personalTurn;
    const later = result.frames.slice(frameIndex).find(item => item.active !== 0 || item.players?.[0]?.personalTurn !== personalTurn || item.players?.[1]?.hp <= 0);
    if (later?.players?.[1]?.hp <= 0) converted += 1;
    break;
  }
}

assert.ok(qualifying >= 10, `Expected at least 10 collective-lethal states, got ${qualifying}`);
assert.equal(converted, qualifying,
  `AI must convert collective board lethal instead of trading into non-Ward distractions (${converted}/${qualifying})`);
console.log(`Battle AI lethal: converted ${converted}/${qualifying} collective board lethals · OK`);
