import assert from "node:assert/strict";
import { BATTLE_RULES_VERSION, inspectEffectiveCost, inspectPlayableModes, simulateBattle } from "../js/battle-engine.js";

assert.equal(BATTLE_RULES_VERSION, 5, "Battle Sim v5 must be active");

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
assert.equal(inspectEffectiveCost(reducer, { spellboost: 3 }), 7, "Spellboost cost reduction must apply exactly once");
assert.equal(inspectEffectiveCost(reducer, { spellboost: 3, costDelta: -2 }), 5, "Persistent cost changes and Spellboost must stack correctly");

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
const wardResult = simulateBattle({
  playerDeck: [[10, 40]],
  opponentDeck: [[11, 40]],
  cardMap: new Map([[10, storm], [11, lockedWard]]),
  playerStrategy: { style: "aggro", mulliganMaxCost: 1, faceBias: 1, tradeBias: 0 },
  opponentStrategy: { style: "control", mulliganMaxCost: 1, faceBias: 0, tradeBias: 1 },
  seed: "rules-ward-lock",
  playerSide: "second"
});
assert.equal(
  wardResult.frames.some(frame => /Storm Tester attacks Opponent's leader/.test(frame.action)),
  true,
  "Ward must be inactive while that follower also has Intimidate"
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
const shadowResult = simulateBattle({
  playerDeck: [[20, 40]],
  opponentDeck: [[21, 40]],
  cardMap: new Map([[20, drawSpell], [21, dummy]]),
  playerStrategy: { style: "spell-combo", mulliganMaxCost: 10, faceBias: 0, tradeBias: 0 },
  opponentStrategy: { style: "control", mulliganMaxCost: 10, faceBias: 0, tradeBias: 1 },
  seed: "rules-shadows",
  playerSide: "first"
});
const firstSpellFrame = shadowResult.frames.find(frame => frame.active === 0 && frame.phase === "play" && /Overflowing Draw Tester/.test(frame.action));
assert.ok(firstSpellFrame, "Shadow regression must produce a spell-play frame");
assert.ok(firstSpellFrame.stats.cardsBurned[0] > 0, "The draw test must burn cards from a full hand");
assert.equal(firstSpellFrame.players[0].shadows, 1, "Playing a spell adds one Shadow; burned cards add none");

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
const gapResult = simulateBattle({
  playerDeck: [[30, 40]],
  opponentDeck: [[21, 40]],
  cardMap: new Map([[30, partialFollower], [21, dummy]]),
  playerStrategy: { style: "midrange", mulliganMaxCost: 1, faceBias: 0.5, tradeBias: 0.5 },
  opponentStrategy: { style: "control", mulliganMaxCost: 10, faceBias: 0, tradeBias: 1 },
  seed: "rules-gap-exposure",
  playerSide: "first",
  recordFrames: false
});
assert.ok(gapResult.summary.stats.unsupportedEffects[0] > 0, "Playing Partial cards must increment the benchmark rule-gap exposure counter");


const altModeTester = {
  id: 40,
  name: "Alternative Mode Tester",
  class: "Neutral",
  type: "Follower",
  cost: 5,
  attack: 3,
  defense: 3,
  traits: [],
  keywords: [],
  text: "Accelerate (1): Draw a card. Crystallize (2): Countdown (1) Last Words: Draw a card."
};
assert.deepEqual(inspectPlayableModes(altModeTester, { pp: 5 }), [{ kind: "base", cost: 5, modeIndex: 0 }], "Accelerate/Crystallize must be unavailable when the base card is affordable");
assert.deepEqual(inspectPlayableModes(altModeTester, { pp: 3 }), [{ kind: "crystallize", cost: 2, modeIndex: 0 }], "The highest affordable fallback play cost must be used");
assert.deepEqual(inspectPlayableModes(altModeTester, { pp: 1 }), [{ kind: "accelerate", cost: 1, modeIndex: 0 }], "Accelerate must remain available when the base card is unaffordable");
assert.deepEqual(inspectPlayableModes(altModeTester, { pp: 5, boardSize: 5 }), [], "A full field must not unlock fallback modes when the base follower is otherwise affordable");

const baneAttacker = {
  id: 50,
  name: "Zero Attack Bane Tester",
  class: "Neutral",
  type: "Follower",
  cost: 1,
  attack: 0,
  defense: 5,
  traits: [],
  keywords: ["Storm", "Bane"],
  text: "Storm Bane"
};
const baneTarget = {
  id: 51,
  name: "Bane Ward Tester",
  class: "Neutral",
  type: "Follower",
  cost: 1,
  attack: 0,
  defense: 10,
  traits: [],
  keywords: ["Ward", "Barrier"],
  text: "Ward Barrier"
};
const baneResult = simulateBattle({
  playerDeck: [[50, 40]],
  opponentDeck: [[51, 40]],
  cardMap: new Map([[50, baneAttacker], [51, baneTarget]]),
  playerStrategy: { style: "aggro", mulliganMaxCost: 1, faceBias: 1, tradeBias: 0 },
  opponentStrategy: { style: "control", mulliganMaxCost: 1, faceBias: 0, tradeBias: 1 },
  seed: "rules-bane-zero-damage",
  playerSide: "second"
});
const baneAttackFrame = baneResult.frames.find(frame => frame.active === 0 && frame.phase === "attack" && /Zero Attack Bane Tester attacks Bane Ward Tester/.test(frame.action));
assert.ok(baneAttackFrame, "Bane regression must produce combat into Ward");
assert.equal(baneAttackFrame.players[1].board.some(unit => unit.name === "Bane Ward Tester"), false, "Bane must destroy after combat even when actual combat damage is 0");

console.log("Battle Sim exact-rule regressions: OK");
