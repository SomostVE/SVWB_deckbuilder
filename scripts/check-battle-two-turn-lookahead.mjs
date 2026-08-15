import assert from "node:assert/strict";
import { inspectTurnPlan, inspectTwoTurnPlan } from "../js/battle-engine-v5.js";

let nextId = 960000;
const follower = (name, cost, attack, defense, text = "", keywords = []) => ({
  id: nextId++, name, class: "Neutral", type: "Follower", cost, attack, defense,
  text, keywords, traits: [], relatedCards: []
});

const greedy = follower("Greedy Body", 2, 10, 10);
const defensiveWard = follower("Future Ward", 2, 1, 8, "Ward", ["Ward"]);
const enemyStorm = follower("Hidden Storm", 1, 8, 1, "Storm", ["Storm"]);
const inert = follower("Hidden Inert", 10, 1, 1);
const ownFiller = follower("Own Future Draw", 10, 1, 1);

const common = {
  hand: [greedy, defensiveWard],
  deck: [ownFiller],
  pp: 2,
  maxPp: 2,
  hp: 8,
  personalTurn: 4,
  goingFirst: true,
  goingSecond: false,
  strategy: { style: "midrange" },
  opponentStrategy: { style: "aggro" },
  opponentPersonalTurn: 0,
  opponentMaxPp: 0,
  opponentHp: 20,
  opponentBoard: [],
  opponentHand: [enemyStorm],
  opponentDeck: [inert],
  depth: 3,
  beamWidth: 3
};

const immediate = inspectTurnPlan(common);
assert.equal(immediate.futureEvaluated, false);
assert.equal(immediate.sequence[0]?.kind, "play");
assert.equal(immediate.sequence[0]?.card, "Greedy Body", "Without an opponent-response ply, the larger immediate body should win the static evaluation");

const directStorm = inspectTurnPlan({
  hand: [enemyStorm, inert], pp: 1, maxPp: 1, hp: 20, opponentHp: 8,
  personalTurn: 1, strategy: { style: "aggro" },
  board: [], opponentBoard: [{ name: "Greedy Body", attack: 10, defense: 10 }],
  depth: 2, beamWidth: 2
});
assert.ok(directStorm.sequence.some(step => step.kind === "attack" && step.target === "leader"), "Opponent-response planner should recognize Storm lethal");

const directStormIntoWard = inspectTurnPlan({
  hand: [enemyStorm, inert], pp: 1, maxPp: 1, hp: 20, opponentHp: 8,
  personalTurn: 1, strategy: { style: "aggro" },
  board: [], opponentBoard: [{ card: defensiveWard, name: defensiveWard.name, attack: 1, defense: 8, keywords: ["Ward"] }],
  depth: 2, beamWidth: 2
});
assert.ok(directStormIntoWard.sequence.some(step => step.kind === "attack" && step.target === "Future Ward"), "Opponent-response planner should respect Ward before leader attacks");
assert.ok(!directStormIntoWard.sequence.some(step => step.kind === "attack" && step.target === "leader"), "Ward must prevent the sampled Storm lethal");

const future = inspectTwoTurnPlan(common);
assert.equal(future.futureEvaluated, true, "Forced QA mode should evaluate the opponent response and our following turn");
assert.equal(future.sequence[0]?.kind, "play");
assert.equal(future.sequence[0]?.card, "Future Ward", "Two-turn look-ahead should accept the weaker immediate play when it prevents next-turn lethal");
assert.ok(Number.isFinite(future.futureScore));
assert.ok(future.futureSamples >= 1);

// Hidden-information invariant: only opponent hand count + remaining unknown
// cards are visible to future search. Swapping the simulator's physical hand/deck
// assignment must not change the decision or valuation.
const swappedHidden = inspectTwoTurnPlan({
  ...common,
  opponentHand: [inert],
  opponentDeck: [enemyStorm]
});
assert.deepEqual(
  swappedHidden.sequence.map(({ kind, card, target }) => ({ kind, card, target })),
  future.sequence.map(({ kind, card, target }) => ({ kind, card, target })),
  "Two-turn planner must not leak the simulator's actual opponent-hand assignment"
);
assert.equal(swappedHidden.futureScore, future.futureScore, "Same public information set should produce the same future valuation");

const safe = inspectTwoTurnPlan({ ...common, hp: 20 });
assert.equal(safe.futureEvaluated, true);
assert.equal(safe.sequence[0]?.card, "Greedy Body", "Look-ahead should not over-defend when the future line is survivable");

console.log("Battle Sim two-turn look-ahead regression: OK");
