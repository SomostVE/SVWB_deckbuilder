import assert from "node:assert/strict";
import { simulateBattle } from "../js/battle-engine.js";

const striker = {
  id: 99000001,
  name: "QA Striker",
  class: "Neutral",
  type: "Follower",
  cost: 1,
  attack: 1,
  defense: 1,
  evolvedAttack: 3,
  evolvedDefense: 3,
  keywords: [],
  traits: [],
  relatedCards: [],
  text: "Strike: Destroy an enemy follower."
};

const wall = {
  id: 99000002,
  name: "QA Wall",
  class: "Neutral",
  type: "Follower",
  cost: 1,
  attack: 10,
  defense: 10,
  evolvedAttack: 12,
  evolvedDefense: 12,
  keywords: ["Ward"],
  traits: [],
  relatedCards: [],
  text: "Ward"
};

const cardMap = new Map([[striker.id, striker], [wall.id, wall]]);
const deck = (id) => [[id, 40]];

const result = simulateBattle({
  playerDeck: deck(striker.id),
  opponentDeck: deck(wall.id),
  cardMap,
  playerStrategy: { style: "midrange", mulliganMaxCost: 3, faceBias: 0, tradeBias: 1 },
  opponentStrategy: { style: "midrange", mulliganMaxCost: 3, faceBias: 0, tradeBias: 1 },
  seed: "qa-strike-before-damage",
  playerSide: "first",
  recordFrames: true
});

const strikeFrame = result.frames.find(frame => frame.phase === "attack" && /QA Striker attacks QA Wall/.test(frame.action));
assert.ok(strikeFrame, "Expected QA Striker to attack QA Wall");
assert.match(strikeFrame.action, /Strike/i, "Strike ability should resolve during the attack");
assert.equal(strikeFrame.players[1].board.some(unit => unit.name === "QA Wall"), false, "Strike should destroy the attacked Wall before combat damage");
assert.equal(strikeFrame.players[0].board.some(unit => unit.name === "QA Striker"), true, "Attacker must survive because the target was destroyed before combat damage");

console.log("Battle Sim combat ordering: Strike resolves before combat damage · OK");
