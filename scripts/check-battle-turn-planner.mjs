import assert from "node:assert/strict";
import { inspectTurnPlan } from "../js/battle-engine-v5.js";

let nextId = 970000;
const follower = (name, cost, attack, defense, text = "", keywords = []) => ({
  id: nextId++, name, class: "Neutral", type: "Follower", cost, attack, defense,
  text, keywords, traits: [], relatedCards: []
});
const spell = (name, cost, text) => ({
  id: nextId++, name, class: "Neutral", type: "Spell", cost, attack: 0, defense: 0,
  text, keywords: [], traits: [], relatedCards: []
});

// 1) A full field should not force a bad pass: the planner can sacrifice a
// small follower first, open a slot, then deploy the much stronger follower.
const bigWard = follower("Planner Big Ward", 3, 6, 6, "Ward", ["Ward"]);
const fullBoardPlan = inspectTurnPlan({
  hand: [bigWard], pp: 3, maxPp: 3, personalTurn: 5,
  strategy: { style: "midrange" },
  board: [
    { name: "Sacrifice", attack: 1, defense: 1, canAttackLeader: false, canAttackFollower: true },
    ...Array.from({ length: 4 }, (_, index) => ({
      name: `Locked ${index + 1}`, attack: 0, defense: 2,
      text: "Can't attack followers or leaders.", permanentAttackLock: true
    }))
  ],
  opponentBoard: [{ name: "Wall", attack: 5, defense: 10 }]
});
assert.equal(fullBoardPlan.sequence[0]?.kind, "attack", "Planner should attack first when that opens the only board slot");
assert.ok(fullBoardPlan.sequence.some(step => step.kind === "play" && step.card === "Planner Big Ward"), "Planner should use the opened slot later in the same planned turn");

// 2) Evolution can be a setup action rather than a final phase. Recovering PP
// first should unlock a card that otherwise cannot be played.
const ppEvolver = follower("PP Evolver", 2, 1, 3, "Evolve: Recover 1 play point.");
const payoff = follower("PP Payoff", 3, 8, 8, "Ward", ["Ward"]);
const evolvePlan = inspectTurnPlan({
  hand: [payoff], pp: 2, maxPp: 4, personalTurn: 4,
  goingFirst: false, goingSecond: true, ep: 2, sep: 2,
  strategy: { style: "midrange" },
  board: [{ card: ppEvolver, name: ppEvolver.name, attack: 1, defense: 3, canAttackLeader: true, canAttackFollower: true }]
});
assert.equal(evolvePlan.sequence[0]?.kind, "evolve", "Planner should be able to evolve before playing cards when the evolve effect unlocks PP");
assert.ok(evolvePlan.sequence.some(step => step.kind === "play" && step.card === "PP Payoff"), "Evolution setup should unlock the follow-up play");

// 3) Remove a Ward before attacking when that produces lethal and preserves
// the attacker. Fixed play->evolve->attack ordering cannot express this as a
// general search problem; the planner should discover it from the leaf state.
const destroyWard = spell("Open The Way", 2, "Destroy an enemy follower.");
const lethalPlan = inspectTurnPlan({
  hand: [destroyWard], pp: 2, maxPp: 5, personalTurn: 5, opponentHp: 5,
  strategy: { style: "midrange" },
  board: [{ name: "Finisher", attack: 5, defense: 5, canAttackLeader: true, canAttackFollower: true }],
  opponentBoard: [{ name: "Enemy Ward", attack: 1, defense: 5, keywords: ["Ward"] }]
});
assert.equal(lethalPlan.sequence[0]?.kind, "play", "Planner should remove the Ward before committing the lethal attacker");
assert.equal(lethalPlan.sequence[0]?.target, "Enemy Ward");
assert.ok(lethalPlan.sequence.some(step => step.kind === "attack" && step.target === "leader"), "Planner should see the lethal attack after removal");

// 4) End-turn/pass is a real branch. Do not dump a dead heal merely because PP
// is available and there is nothing to survive.
const deadHeal = spell("Dead Heal", 5, "Restore 3 defense to your leader.");
const holdPlan = inspectTurnPlan({
  hand: [deadHeal], pp: 5, maxPp: 5, hp: 20, personalTurn: 5,
  strategy: { style: "control" }, opponentBoard: []
});
assert.equal(holdPlan.sequence[0]?.kind, "end", "Planner should preserve a context-only card on a safe turn");

// 5) Attack targets are branches too: a small Bane body can clear the large
// blocker so the large attacker remains available for pressure.
const banePlan = inspectTurnPlan({
  hand: [], pp: 0, maxPp: 5, personalTurn: 5, opponentHp: 12,
  strategy: { style: "midrange" },
  board: [
    { name: "Small Bane", attack: 1, defense: 1, keywords: ["Bane"], canAttackLeader: true, canAttackFollower: true },
    { name: "Large Attacker", attack: 6, defense: 6, canAttackLeader: true, canAttackFollower: true }
  ],
  opponentBoard: [{ name: "Large Ward", attack: 6, defense: 9, keywords: ["Ward"] }]
});
assert.equal(banePlan.sequence[0]?.kind, "attack");
assert.equal(banePlan.sequence[0]?.card, "Small Bane", "Planner should branch attack order and spend the Bane body into the large Ward first");
assert.equal(banePlan.sequence[0]?.target, "Large Ward");

console.log("Battle Sim full-turn planner regression: OK");
