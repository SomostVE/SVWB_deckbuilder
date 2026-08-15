import assert from "node:assert/strict";
import { BATTLE_RULES_VERSION, inspectEffectiveCost, simulateBattle } from "../js/battle-engine.js";

assert.equal(BATTLE_RULES_VERSION, 3, "Battle Sim v3 must be active");

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

console.log("Battle Sim exact-rule regressions: OK");
