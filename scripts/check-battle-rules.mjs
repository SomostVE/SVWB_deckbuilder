import assert from "node:assert/strict";
import { BATTLE_RULES_VERSION, inspectEffectiveCost, simulateBattle } from "../js/battle-engine.js";
import { applyEntryCrestEffects, applyTurnEndCrestEffects } from "../js/battle-rules.js";

assert.equal(BATTLE_RULES_VERSION, 4, "Battle Sim v4 must be active");

const reducer = {
  id: 1,
  name: "Spellboost Cost Tester",
  class: "Runecraft",
  type: "Follower",
  cost: 10,
  attack: 1,
  defense: 1,
  traits: [],
  keywords: ["On Spellboost"],
  text: "On Spellboost: Subtract 1 from this card's cost."
};
assert.equal(inspectEffectiveCost(reducer, { spellboost: 3 }), 7, "Spellboost cost reduction must be applied exactly once");
assert.equal(inspectEffectiveCost(reducer, { spellboost: 3, costDelta: -2 }), 5, "Persistent cost changes and Spellboost must stack without double counting");

const storm = {
  id: 10,
  name: "Storm Tester",
  class: "Neutral",
  type: "Follower",
  cost: 1,
  attack: 20,
  defense: 20,
  traits: [],
  keywords: ["Storm"],
  text: "Storm"
};
const lockedWard = {
  id: 11,
  name: "Locked Ward Tester",
  class: "Neutral",
  type: "Follower",
  cost: 1,
  attack: 0,
  defense: 99,
  traits: [],
  keywords: ["Ward", "Intimidate"],
  text: "Ward\nIntimidate"
};
const wardMap = new Map([[10, storm], [11, lockedWard]]);
const wardResult = simulateBattle({
  playerDeck: [[10, 40]],
  opponentDeck: [[11, 40]],
  cardMap: wardMap,
  playerStrategy: { style: "aggro", mulliganMaxCost: 1, faceBias: 1, tradeBias: 0 },
  opponentStrategy: { style: "control", mulliganMaxCost: 1, faceBias: 0, tradeBias: 1 },
  seed: "rules-ward-lock",
  playerSide: "second"
});
assert.equal(
  wardResult.frames.some(frame => /Storm Tester attacks Opponent's leader/.test(frame.action)),
  false,
  "Ward must prevent attacks on non-Ward targets even when the Ward follower itself cannot be attacked"
);

const drawSpell = {
  id: 20,
  name: "Overflowing Draw Tester",
  class: "Runecraft",
  type: "Spell",
  cost: 0,
  attack: 0,
  defense: 0,
  traits: [],
  keywords: [],
  text: "Draw 9 cards."
};
const dummy = {
  id: 21,
  name: "Dummy",
  class: "Neutral",
  type: "Follower",
  cost: 10,
  attack: 0,
  defense: 20,
  traits: [],
  keywords: [],
  text: ""
};
const shadowMap = new Map([[20, drawSpell], [21, dummy]]);
const shadowResult = simulateBattle({
  playerDeck: [[20, 40]],
  opponentDeck: [[21, 40]],
  cardMap: shadowMap,
  playerStrategy: { style: "spell-combo", mulliganMaxCost: 10, faceBias: 0, tradeBias: 0 },
  opponentStrategy: { style: "control", mulliganMaxCost: 10, faceBias: 0, tradeBias: 1 },
  seed: "rules-shadows",
  playerSide: "first"
});
const firstSpellFrame = shadowResult.frames.find(frame => frame.active === 0 && frame.phase === "play" && /Overflowing Draw Tester/.test(frame.action));
assert.ok(firstSpellFrame, "Shadow regression test must produce a spell-play frame");
assert.ok(firstSpellFrame.stats.cardsBurned[0] > 0, "Shadow regression test must burn cards from a full hand");
assert.equal(firstSpellFrame.players[0].shadows, 1, "Playing the spell adds one Shadow; burned cards do not add Shadows");

const crestStats = {
  healing: [0, 0],
  unsupportedEffects: [0, 0]
};
const crestPlayer = {
  hp: 19,
  maxHp: 20,
  personalTurn: 7,
  crests: [{ name: "Wilbert, Desolate Paladin" }],
  board: []
};
const crestOpponent = { hp: 20, board: [] };
const crestContext = {
  player: crestPlayer,
  opponent: crestOpponent,
  playerIndex: 0,
  enemyIndex: 1,
  stats: crestStats,
  buffUnit(unit, attack, defense) {
    unit.attack += attack;
    unit.defense += defense;
    unit.maxDefense += defense;
  },
  cleanup() {}
};
const holyCavalier = {
  name: "Holy Cavalier",
  type: "Follower",
  attack: 1,
  defense: 2,
  maxDefense: 2,
  keywords: ["Ward"]
};
applyEntryCrestEffects(crestContext, holyCavalier);
assert.equal(holyCavalier.attack, 2, "Wilbert Crest gives an entering Ward follower +1 attack");
assert.equal(holyCavalier.defense, 4, "Wilbert Crest gives an entering Ward follower +2 defense");
applyEntryCrestEffects(crestContext, holyCavalier);
assert.equal(holyCavalier.attack, 2, "Entry Crest effects must only apply once to the same follower");

crestPlayer.crests = [{ name: "Grimnir, Heavenly Gale" }];
crestPlayer.board = [{ name: "Super Tester", type: "Follower", superEvolved: true, defense: 5, maxDefense: 5, keywords: [] }];
crestPlayer.personalTurn = 8;
crestOpponent.board = [{ name: "Enemy Tester", type: "Follower", defense: 4, maxDefense: 4, keywords: [] }];
applyTurnEndCrestEffects(crestContext);
assert.equal(crestOpponent.board[0].defense, 2, "Grimnir Crest deals 2 to all enemy followers when a super-evolved ally is present");

crestPlayer.crests = [{ name: "Sandalphon, Primarch Successor" }];
crestPlayer.hp = 18;
crestPlayer.board = [{ name: "Damaged Ally", type: "Follower", defense: 2, maxDefense: 4, keywords: [] }];
crestPlayer.personalTurn = 9;
applyTurnEndCrestEffects(crestContext);
assert.equal(crestPlayer.hp, 19, "Sandalphon Crest restores 1 defense to the leader");
assert.equal(crestPlayer.board[0].defense, 3, "Sandalphon Crest restores 1 defense to allied followers");
assert.equal(crestPlayer.crests[0].__countdownRemaining, 1, "Sandalphon Crest countdown decreases at turn end");
crestPlayer.personalTurn = 10;
applyTurnEndCrestEffects(crestContext);
assert.equal(crestPlayer.crests.length, 0, "Sandalphon Crest expires after Countdown 2");

const partialFollower = {
  id: 30,
  name: "Reactive Gap Tester",
  class: "Forestcraft",
  type: "Follower",
  cost: 1,
  attack: 1,
  defense: 1,
  traits: [],
  keywords: [],
  text: "Whenever an allied follower enters the field, give it +1/+1."
};
const gapMap = new Map([[30, partialFollower], [21, dummy]]);
const gapResult = simulateBattle({
  playerDeck: [[30, 40]],
  opponentDeck: [[21, 40]],
  cardMap: gapMap,
  playerStrategy: { style: "midrange", mulliganMaxCost: 1, faceBias: 0.5, tradeBias: 0.5 },
  opponentStrategy: { style: "control", mulliganMaxCost: 10, faceBias: 0, tradeBias: 1 },
  seed: "rules-gap-exposure",
  playerSide: "first",
  recordFrames: false
});
assert.ok(gapResult.summary.stats.unsupportedEffects[0] > 0, "Playing Partial cards must increment the benchmark rule-gap exposure counter");

console.log("Battle Sim exact-rule regressions: OK");
