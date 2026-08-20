import assert from "node:assert/strict";
import { inspectTurnPlan, inspectTwoTurnPlan } from "../js/battle-engine-v5.js";

let nextId = 981000;
const follower = (name, cost, attack, defense, text = "", keywords = []) => ({
  id: nextId++, name, class: "Neutral", type: "Follower", cost, attack, defense,
  text, keywords, traits: [], relatedCards: []
});
const spell = (name, cost, text) => ({
  id: nextId++, name, class: "Neutral", type: "Spell", cost, attack: 0, defense: 0,
  text, keywords: [], traits: [], relatedCards: []
});

function compactSequence(plan) {
  return (plan?.sequence ?? []).map(step => {
    const card = step.card ? ` ${step.card}` : "";
    const target = step.target ? ` -> ${step.target}` : "";
    return `${step.kind}${card}${target}`;
  }).join(" | ") || "(empty)";
}

const cases = [];
function audit(name, category, run, expect) {
  cases.push({ name, category, run, expect });
}

const destroy = spell("Audit Destroy", 2, "Destroy an enemy follower.");
const deadHeal = spell("Audit Heal", 5, "Restore 3 defense to your leader.");
const bigWard = follower("Audit Big Ward", 3, 6, 6, "Ward", ["Ward"]);
const ppEvolver = follower("Audit PP Evolver", 2, 1, 3, "Evolve: Recover 1 play point.");
const ppPayoff = follower("Audit PP Payoff", 3, 8, 8, "Ward", ["Ward"]);
const greedy = follower("Audit Greedy Body", 2, 10, 10);
const futureWard = follower("Audit Future Ward", 2, 1, 8, "Ward", ["Ward"]);
const enemyStorm = follower("Audit Hidden Storm", 1, 8, 1, "Storm", ["Storm"]);
const inert = follower("Audit Hidden Inert", 10, 1, 1);
const ownFutureDraw = follower("Audit Own Future Draw", 10, 1, 1);
const curveTwo = follower("Audit Curve Two", 2, 2, 2);
const curveThree = follower("Audit Curve Three", 3, 3, 3);
const vanillaEvo = follower("Audit Vanilla Evolver", 1, 6, 6);
const sweepEvo = follower("Audit Sweep Evolver", 1, 1, 1, "Evolve: Deal 3 damage to all enemy followers.");

audit("Take direct lethal instead of trading", "lethal", () => inspectTurnPlan({
  hand: [], pp: 0, maxPp: 5, personalTurn: 5, opponentHp: 5,
  strategy: { style: "midrange" },
  board: [{ name: "Audit Finisher", attack: 5, defense: 5, canAttackLeader: true, canAttackFollower: true }],
  opponentBoard: [{ name: "Audit Distraction", attack: 8, defense: 8 }]
}), plan => plan.sequence.some(step => step.kind === "attack" && step.target === "leader"));

audit("Remove Ward before lethal attack", "lethal", () => inspectTurnPlan({
  hand: [destroy], pp: 2, maxPp: 5, personalTurn: 5, opponentHp: 5,
  strategy: { style: "midrange" },
  board: [{ name: "Audit Finisher", attack: 5, defense: 5, canAttackLeader: true, canAttackFollower: true }],
  opponentBoard: [{ name: "Audit Enemy Ward", attack: 1, defense: 5, keywords: ["Ward"] }]
}), plan => {
  const removal = plan.sequence.findIndex(step => step.kind === "play" && step.card === destroy.name && step.target === "Audit Enemy Ward");
  const attack = plan.sequence.findIndex(step => step.kind === "attack" && step.target === "leader");
  return removal >= 0 && attack > removal;
});

audit("Use Bane body before committing large attacker", "combat", () => inspectTurnPlan({
  hand: [], pp: 0, maxPp: 5, personalTurn: 5, opponentHp: 12,
  strategy: { style: "midrange" },
  board: [
    { name: "Audit Small Bane", attack: 1, defense: 1, keywords: ["Bane"], canAttackLeader: true, canAttackFollower: true },
    { name: "Audit Large Attacker", attack: 6, defense: 6, canAttackLeader: true, canAttackFollower: true }
  ],
  opponentBoard: [{ name: "Audit Large Ward", attack: 6, defense: 9, keywords: ["Ward"] }]
}), plan => {
  const bane = plan.sequence.findIndex(step => step.kind === "attack" && step.card === "Audit Small Bane" && step.target === "Audit Large Ward");
  const large = plan.sequence.findIndex(step => step.kind === "attack" && step.card === "Audit Large Attacker");
  return bane >= 0 && (large < 0 || large > bane);
});

audit("Hold dead healing at full defense", "resources", () => inspectTurnPlan({
  hand: [deadHeal], pp: 5, maxPp: 5, hp: 20, personalTurn: 5,
  strategy: { style: "control" }, opponentBoard: []
}), plan => plan.sequence[0]?.kind === "end");

audit("Use healing when materially damaged", "resources", () => inspectTurnPlan({
  hand: [deadHeal], pp: 5, maxPp: 5, hp: 8, personalTurn: 5,
  strategy: { style: "control" },
  opponentBoard: [{ name: "Audit Threat", attack: 5, defense: 5 }]
}), plan => plan.sequence.some(step => step.kind === "play" && step.card === deadHeal.name));

audit("Spend a clean 5 PP curve as 2 + 3", "resources", () => inspectTurnPlan({
  hand: [curveTwo, curveThree], pp: 5, maxPp: 5, personalTurn: 5,
  strategy: { style: "midrange" }, opponentBoard: []
}), plan => {
  const played = new Set(plan.sequence.filter(step => step.kind === "play").map(step => step.card));
  return played.has(curveTwo.name) && played.has(curveThree.name);
});

audit("Destroy the highest immediate threat", "targeting", () => inspectTurnPlan({
  hand: [destroy], pp: 2, maxPp: 5, hp: 10, personalTurn: 5,
  strategy: { style: "control" },
  opponentBoard: [
    { name: "Audit Small Threat", attack: 1, defense: 1 },
    { name: "Audit Major Threat", attack: 8, defense: 8 }
  ]
}), plan => plan.sequence.some(step => step.kind === "play" && step.card === destroy.name && step.target === "Audit Major Threat"));

audit("Evolve before play when evolution recovers required PP", "evolution", () => inspectTurnPlan({
  hand: [ppPayoff], pp: 2, maxPp: 4, personalTurn: 4,
  goingFirst: false, goingSecond: true, ep: 2, sep: 2,
  strategy: { style: "midrange" },
  board: [{ card: ppEvolver, name: ppEvolver.name, attack: 1, defense: 3, canAttackLeader: true, canAttackFollower: true }]
}), plan => plan.sequence[0]?.kind === "evolve" && plan.sequence.some(step => step.kind === "play" && step.card === ppPayoff.name));

audit("Prefer effect-aware evolution over raw stats", "evolution", () => inspectTurnPlan({
  hand: [], pp: 0, maxPp: 5, personalTurn: 5, ep: 2, sep: 0,
  strategy: { style: "midrange" },
  board: [
    { card: vanillaEvo, name: vanillaEvo.name, attack: 6, defense: 6, canAttackLeader: true, canAttackFollower: true },
    { card: sweepEvo, name: sweepEvo.name, attack: 1, defense: 1, canAttackLeader: true, canAttackFollower: true }
  ],
  opponentBoard: [
    { name: "Audit Enemy A", attack: 3, defense: 3 },
    { name: "Audit Enemy B", attack: 3, defense: 3 }
  ]
}), plan => plan.sequence.some(step => step.kind === "evolve" && step.card === sweepEvo.name));

audit("Use Super Evo when +3 attack creates lethal", "evolution", () => inspectTurnPlan({
  hand: [], pp: 0, maxPp: 6, personalTurn: 6,
  goingFirst: false, goingSecond: true, ep: 0, sep: 1, opponentHp: 7,
  strategy: { style: "midrange" },
  board: [{ name: "Audit Super Finisher", attack: 4, defense: 4, canAttackLeader: true, canAttackFollower: true }]
}), plan => {
  const superIndex = plan.sequence.findIndex(step => step.kind === "super-evolve" && step.card === "Audit Super Finisher");
  const attackIndex = plan.sequence.findIndex(step => step.kind === "attack" && step.card === "Audit Super Finisher" && step.target === "leader");
  return superIndex >= 0 && attackIndex > superIndex;
});

audit("Open a board slot before deploying a stronger follower", "sequencing", () => inspectTurnPlan({
  hand: [bigWard], pp: 3, maxPp: 3, personalTurn: 5,
  strategy: { style: "midrange" },
  board: [
    { name: "Audit Sacrifice", attack: 1, defense: 1, canAttackLeader: false, canAttackFollower: true },
    ...Array.from({ length: 4 }, (_, index) => ({
      name: `Audit Locked ${index + 1}`, attack: 0, defense: 2,
      text: "Can't attack followers or leaders.", permanentAttackLock: true
    }))
  ],
  opponentBoard: [{ name: "Audit Wall", attack: 5, defense: 10 }]
}), plan => {
  const attack = plan.sequence.findIndex(step => step.kind === "attack" && step.card === "Audit Sacrifice");
  const play = plan.sequence.findIndex(step => step.kind === "play" && step.card === bigWard.name);
  return attack >= 0 && play > attack;
});

audit("Defend against sampled next-turn lethal", "lookahead", () => inspectTwoTurnPlan({
  hand: [greedy, futureWard], deck: [ownFutureDraw], pp: 2, maxPp: 2, hp: 8,
  personalTurn: 4, goingFirst: true,
  strategy: { style: "midrange" }, opponentStrategy: { style: "aggro" },
  opponentPersonalTurn: 0, opponentMaxPp: 0, opponentHp: 20,
  opponentBoard: [], opponentHand: [enemyStorm], opponentDeck: [inert],
  depth: 3, beamWidth: 3
}), plan => plan.futureEvaluated === true && plan.sequence[0]?.kind === "play" && plan.sequence[0]?.card === futureWard.name);

audit("Avoid over-defending when future line is survivable", "lookahead", () => inspectTwoTurnPlan({
  hand: [greedy, futureWard], deck: [ownFutureDraw], pp: 2, maxPp: 2, hp: 20,
  personalTurn: 4, goingFirst: true,
  strategy: { style: "midrange" }, opponentStrategy: { style: "aggro" },
  opponentPersonalTurn: 0, opponentMaxPp: 0, opponentHp: 20,
  opponentBoard: [], opponentHand: [enemyStorm], opponentDeck: [inert],
  depth: 3, beamWidth: 3
}), plan => plan.futureEvaluated === true && plan.sequence[0]?.kind === "play" && plan.sequence[0]?.card === greedy.name);

assert.ok(cases.length >= 12, "Behavior audit must keep broad deterministic coverage");

const results = [];
for (const item of cases) {
  try {
    const plan = item.run();
    const passed = Boolean(item.expect(plan));
    results.push({ ...item, passed, plan });
  } catch (error) {
    results.push({ ...item, passed: false, error });
  }
}

console.log("\nBattle AI behavior baseline — 01.05.003");
console.log("========================================");
for (const result of results) {
  const status = result.passed ? "PASS" : "GAP ";
  const detail = result.error ? `ERROR: ${result.error.message}` : compactSequence(result.plan);
  console.log(`[${status}] ${result.category.padEnd(10)} ${result.name}`);
  console.log(`       ${detail}`);
}

const passed = results.filter(result => result.passed).length;
const gaps = results.length - passed;
const categories = [...new Set(results.map(result => result.category))];
console.log("----------------------------------------");
console.log(`Baseline: ${passed}/${results.length} ideal behaviors observed · ${gaps} gap(s) · ${categories.length} categories`);
if (gaps) {
  console.log("Diagnostic gaps are intentionally non-blocking in stage 1; each confirmed gap becomes a regression gate when fixed in later stages.");
}
