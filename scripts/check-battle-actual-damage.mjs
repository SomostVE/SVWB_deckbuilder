import assert from "node:assert/strict";
import { simulateBattle } from "../js/battle-engine.js";

const drainer = {
  id: 99200001,
  name: "QA Drainer",
  class: "Neutral",
  type: "Follower",
  cost: 1,
  attack: 5,
  defense: 5,
  keywords: ["Rush", "Drain", "Bane"],
  traits: [], relatedCards: [], text: "Rush Drain Bane"
};
const barrierRaider = {
  id: 99200002,
  name: "QA Barrier Raider",
  class: "Neutral",
  type: "Follower",
  cost: 1,
  attack: 1,
  defense: 3,
  keywords: ["Storm", "Ward", "Barrier"],
  traits: [], relatedCards: [], text: "Storm Ward Barrier"
};

const combatMap = new Map([[drainer.id, drainer], [barrierRaider.id, barrierRaider]]);
const combat = simulateBattle({
  playerDeck: [[drainer.id, 40]],
  opponentDeck: [[barrierRaider.id, 40]],
  cardMap: combatMap,
  playerStrategy: { style: "midrange", mulliganMaxCost: 3, faceBias: 0, tradeBias: 1 },
  opponentStrategy: { style: "aggro", mulliganMaxCost: 3, faceBias: 1, tradeBias: 0 },
  seed: "qa-bane-drain-barrier",
  playerSide: "second",
  recordFrames: true
});

const barrierFight = combat.frames.find(frame => frame.phase === "attack" && /QA Drainer attacks QA Barrier Raider/.test(frame.action));
assert.ok(barrierFight, "Expected QA Drainer to attack the Ward follower");
assert.equal(barrierFight.players[0].hp, 19, "Drain must heal 0 when Barrier prevents all outgoing damage");
assert.ok(!barrierFight.players[1].board.some(unit => unit.name === "QA Barrier Raider"), "Bane must destroy the follower even when Barrier reduces combat damage to 0");
assert.doesNotMatch(barrierFight.action, /Drain heals [1-9]/, "Replay must not report Drain healing through Barrier");

const zooey = {
  id: 99200003,
  name: "Zooey, Ally of the World",
  class: "Dragoncraft",
  type: "Follower",
  cost: 1,
  attack: 0,
  defense: 5,
  keywords: [], traits: [], relatedCards: [],
  text: "Fanfare: Set your leader's max defense to 1. Give your leader \"Can't take more than 0 damage at a time\" until the end of your opponent's turn."
};
const storm = {
  id: 99200004,
  name: "QA Storm Attacker",
  class: "Neutral",
  type: "Follower",
  cost: 1,
  attack: 5,
  defense: 1,
  keywords: ["Storm"], traits: [], relatedCards: [], text: "Storm"
};
const shieldMap = new Map([[zooey.id, zooey], [storm.id, storm]]);
const shield = simulateBattle({
  playerDeck: [[zooey.id, 40]],
  opponentDeck: [[storm.id, 40]],
  cardMap: shieldMap,
  playerStrategy: { style: "control", mulliganMaxCost: 3, faceBias: 0, tradeBias: 1 },
  opponentStrategy: { style: "aggro", mulliganMaxCost: 3, faceBias: 1, tradeBias: 0 },
  seed: "qa-leader-damage-cap",
  playerSide: "first",
  recordFrames: true
});
const blockedLeaderAttack = shield.frames.find(frame => frame.phase === "attack" && /QA Storm Attacker attacks You's leader/.test(frame.action));
assert.ok(blockedLeaderAttack, "Expected Storm attacker to attack the protected leader");
assert.equal(blockedLeaderAttack.players[0].hp, 1, "Zooey leader protection must prevent combat damage");
assert.match(blockedLeaderAttack.action, /for 0\./, "Replay/stat accounting must report actual leader damage after the cap");

console.log("Battle actual damage: Barrier blocks damage/Drain while Bane still destroys · leader cap reports actual damage · OK");
