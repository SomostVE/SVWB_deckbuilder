import assert from "node:assert/strict";
import { inspectTurnPlan } from "../js/battle-engine-v5.js";

let nextId = 987000;
const follower = (name, cost, attack, defense, text = "", keywords = []) => ({
  id: nextId++, name, class: "Neutral", type: "Follower", cost, attack, defense,
  text, keywords, traits: [], relatedCards: []
});

const tests = [];
function gate(name, run, expect) {
  tests.push({ name, run, expect });
}

const superRemoval = follower("Stage7 Super Removal", 2, 1, 1, "Super-Evolve: Destroy an enemy follower.");

gate("prefer normal Evo when it solves the same routine trade", () => inspectTurnPlan({
  hand: [], pp: 0, maxPp: 6, personalTurn: 6,
  goingFirst: false, goingSecond: true, ep: 1, sep: 1, hp: 20, opponentHp: 20,
  strategy: { style: "midrange" },
  board: [{ name: "Stage7 Efficient Trader", attack: 3, defense: 3, canAttackLeader: true, canAttackFollower: true }],
  opponentBoard: [{ name: "Stage7 Routine Ward", attack: 2, defense: 5, keywords: ["Ward"] }]
}), plan => {
  const normal = plan.sequence.findIndex(step => step.kind === "evolve" && step.card === "Stage7 Efficient Trader");
  const superEvo = plan.sequence.findIndex(step => step.kind === "super-evolve" && step.card === "Stage7 Efficient Trader");
  return normal >= 0 && superEvo < 0;
});

gate("spend Super Evo when the extra attack creates lethal", () => inspectTurnPlan({
  hand: [], pp: 0, maxPp: 6, personalTurn: 6,
  goingFirst: false, goingSecond: true, ep: 1, sep: 1, hp: 20, opponentHp: 7,
  strategy: { style: "midrange" }, opponentBoard: [],
  board: [{ name: "Stage7 Lethal Finisher", attack: 4, defense: 4, canAttackLeader: true, canAttackFollower: true }]
}), plan => {
  const superEvo = plan.sequence.findIndex(step => step.kind === "super-evolve" && step.card === "Stage7 Lethal Finisher");
  const attack = plan.sequence.findIndex(step => step.kind === "attack" && step.card === "Stage7 Lethal Finisher" && step.target === "leader");
  return superEvo >= 0 && attack > superEvo;
});

gate("hold the last Super Evo on an empty board without a payoff", () => inspectTurnPlan({
  hand: [], pp: 0, maxPp: 6, personalTurn: 6,
  goingFirst: false, goingSecond: true, ep: 0, sep: 1, hp: 20, opponentHp: 20,
  strategy: { style: "control" }, opponentBoard: [],
  board: [{ name: "Stage7 Idle Body", attack: 4, defense: 4, summonedThisTurn: true, canAttackLeader: false, canAttackFollower: false }]
}), plan => !plan.sequence.some(step => step.kind === "super-evolve"));

gate("use Super Evo for a high-value unique effect", () => inspectTurnPlan({
  hand: [], pp: 0, maxPp: 6, personalTurn: 6,
  goingFirst: false, goingSecond: true, ep: 1, sep: 1, hp: 12, opponentHp: 20,
  strategy: { style: "control" },
  board: [{ card: superRemoval, name: superRemoval.name, attack: 1, defense: 1, canAttackLeader: true, canAttackFollower: true }],
  opponentBoard: [{ name: "Stage7 Major Threat", attack: 8, defense: 8 }]
}), plan => plan.sequence.some(step => step.kind === "super-evolve" && step.card === superRemoval.name));

gate("use normal Evo defensively instead of hoarding at lethal risk", () => inspectTurnPlan({
  hand: [], pp: 0, maxPp: 5, personalTurn: 5,
  goingFirst: true, goingSecond: false, ep: 1, sep: 0, hp: 5, opponentHp: 20,
  strategy: { style: "control" },
  board: [{ name: "Stage7 Defender", attack: 3, defense: 3, canAttackLeader: true, canAttackFollower: true }],
  opponentBoard: [{ name: "Stage7 Incoming Threat", attack: 5, defense: 5 }]
}), plan => {
  const evolve = plan.sequence.findIndex(step => step.kind === "evolve" && step.card === "Stage7 Defender");
  const trade = plan.sequence.findIndex(step => step.kind === "attack" && step.card === "Stage7 Defender" && step.target === "Stage7 Incoming Threat");
  return evolve >= 0 && trade > evolve;
});

let failed = 0;
for (const test of tests) {
  const plan = test.run();
  let ok = false;
  try {
    ok = Boolean(test.expect(plan));
    assert.equal(ok, true);
  } catch {
    failed += 1;
    console.error(`FAIL: ${test.name}`);
    console.error(JSON.stringify(plan?.sequence ?? [], null, 2));
    continue;
  }
  console.log(`PASS: ${test.name}`);
}

if (failed) {
  console.error(`Battle AI Stage 7 evolution gates: ${tests.length - failed}/${tests.length} passed.`);
  process.exit(1);
}
console.log(`Battle AI Stage 7 evolution gates: ${tests.length}/${tests.length} passed.`);
