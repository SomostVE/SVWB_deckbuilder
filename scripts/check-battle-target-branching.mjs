import assert from "node:assert/strict";
import { inspectAiPlayChoice, inspectRandomEnemyTargets } from "../js/battle-engine-v5.js";

const spell = (name, text, cost = 4) => ({
  id: 980000 + name.length,
  name,
  class: "Neutral",
  type: "Spell",
  cost,
  attack: 0,
  defense: 0,
  text,
  keywords: [],
  traits: [],
  relatedCards: []
});

const damage = inspectAiPlayChoice({
  hand: [spell("Precise Four", "Deal 4 damage to an enemy follower.")],
  pp: 4,
  maxPp: 4,
  strategy: { style: "control" },
  opponentBoard: [
    { uid: "huge", name: "Huge Body", attack: 10, defense: 10 },
    { uid: "kill", name: "Dangerous Four", attack: 8, defense: 4 }
  ]
});
assert.equal(damage.decision, "play");
assert.equal(damage.targetName, "Dangerous Four", "Damage branching should value removing a killable threat over scratching a larger body");
assert.equal(damage.targetKind, "damage");

const destroy = inspectAiPlayChoice({
  hand: [spell("Clean Destroy", "Destroy an enemy follower.")],
  pp: 4,
  maxPp: 4,
  strategy: { style: "control" },
  opponentBoard: [
    { uid: "small", name: "Small Body", attack: 2, defense: 2 },
    { uid: "threat", name: "Priority Threat", attack: 7, defense: 7, keywords: ["Ward"] }
  ]
});
assert.equal(destroy.targetName, "Priority Threat", "Destroy should branch over legal targets and choose the largest threat");

const banish = inspectAiPlayChoice({
  hand: [spell("Clean Banish", "Banish an enemy follower.")],
  pp: 4,
  maxPp: 4,
  strategy: { style: "control" },
  opponentBoard: [
    { uid: "plain", name: "Plain Threat", attack: 5, defense: 5 },
    { uid: "lw", name: "Last Words Threat", attack: 4, defense: 5, text: "Last Words: Draw 2 cards." }
  ]
});
assert.equal(banish.targetName, "Last Words Threat", "Banish should gain extra value against Last Words targets");

const protectedTarget = inspectAiPlayChoice({
  hand: [spell("Legal Target Only", "Destroy an enemy follower.")],
  pp: 4,
  maxPp: 4,
  strategy: { style: "control" },
  opponentBoard: [
    { uid: "aura", name: "Aura Threat", attack: 20, defense: 20, keywords: ["Aura"] },
    { uid: "ambush", name: "Ambush Threat", attack: 15, defense: 15, keywords: ["Ambush"] },
    { uid: "legal", name: "Legal Target", attack: 1, defense: 1 }
  ]
});
assert.equal(protectedTarget.targetName, "Legal Target", "Aura and Ambush followers must not enter targeted-effect branches");

const selectedGrammar = inspectAiPlayChoice({
  hand: [spell("Selected Four", "Select an enemy follower on the field and deal it 4 damage.")],
  pp: 4,
  maxPp: 4,
  strategy: { style: "control" },
  opponentBoard: [
    { uid: "big", name: "Unkillable", attack: 8, defense: 9 },
    { uid: "four", name: "Selected Kill", attack: 6, defense: 4 }
  ]
});
assert.equal(selectedGrammar.targetName, "Selected Kill", "Select...and deal it grammar should also branch by target");

const randomTargets = inspectRandomEnemyTargets(
  [
    { name: "Random A", attack: 1, defense: 1 },
    { name: "Random B", attack: 20, defense: 20 }
  ],
  Array.from({ length: 24 }, (_, index) => `random-target-${index}`)
);
assert.ok(new Set(randomTargets).size > 1, "Random follower targeting must use RNG rather than deterministic threat sorting");

console.log("Battle Sim target branching regression: OK");
