import assert from "node:assert/strict";
import { inspectAiPlayChoice } from "../js/battle-engine-v5.js";

const card = (overrides = {}) => ({
  id: 990000 + Math.floor(Math.random() * 1000),
  name: "Test Card",
  class: "Neutral",
  type: "Spell",
  cost: 5,
  attack: 0,
  defense: 0,
  text: "",
  keywords: [],
  traits: [],
  relatedCards: [],
  ...overrides
});

const heal = card({ name: "Late Heal", cost: 5, text: "Restore 3 defense to your leader." });
const safeHeal = inspectAiPlayChoice({
  hand: [heal], pp: 5, maxPp: 5, hp: 20, maxHp: 20,
  strategy: { style: "control" }, opponentBoard: []
});
assert.equal(safeHeal.decision, "pass", "AI should hold a dead heal while safe");

const emergencyHeal = inspectAiPlayChoice({
  hand: [heal], pp: 5, maxPp: 5, hp: 2, maxHp: 20,
  strategy: { style: "control" },
  opponentBoard: [{ name: "Threat", attack: 3, defense: 3, keywords: [] }]
});
assert.equal(emergencyHeal.decision, "play", "AI should spend a mediocre heal to survive visible lethal");

const enhanceFollower = card({
  name: "Wait for Enhance",
  type: "Follower",
  cost: 3,
  attack: 3,
  defense: 3,
  text: "Enhance (4): Give this follower +2/+2."
});
const waitEnhance = inspectAiPlayChoice({
  hand: [enhanceFollower], pp: 3, maxPp: 3, hp: 20,
  strategy: { style: "midrange" }, opponentBoard: []
});
assert.equal(waitEnhance.decision, "pass", "AI should wait one safe turn for a reachable Enhance breakpoint");

const emergencyWard = card({
  name: "Emergency Ward",
  type: "Follower",
  cost: 3,
  attack: 1,
  defense: 4,
  text: "Ward",
  keywords: ["Ward"]
});
const wardChoice = inspectAiPlayChoice({
  hand: [emergencyWard], pp: 3, maxPp: 3, hp: 4,
  strategy: { style: "control" },
  opponentBoard: [{ name: "Large Threat", attack: 5, defense: 5, keywords: [] }]
});
assert.equal(wardChoice.decision, "play", "AI should deploy Ward when it changes next-turn survival");
assert.ok(wardChoice.projectedIncomingDamage >= 4, "QA hook should expose visible incoming pressure");

console.log("Battle Sim tactical look-ahead regression: OK");
