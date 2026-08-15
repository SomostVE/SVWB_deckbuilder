import assert from "node:assert/strict";
import { executeGenericEffects } from "../js/battle-rules.js";

const source = {
  uid: "eudie",
  name: "Eudie, Your Dependable Mentor",
  type: "Follower",
  attack: 3,
  defense: 3,
  maxDefense: 3,
  evolved: false,
  superEvolved: false,
  card: { name: "Eudie, Your Dependable Mentor" }
};
const weak = {
  uid: "weak",
  name: "Weak Ally",
  type: "Follower",
  attack: 1,
  defense: 1,
  maxDefense: 1,
  evolved: false,
  superEvolved: false,
  card: { name: "Weak Ally" }
};
const strong = {
  uid: "strong",
  name: "Strong Ally",
  type: "Follower",
  attack: 4,
  defense: 4,
  maxDefense: 4,
  evolved: false,
  superEvolved: false,
  card: { name: "Strong Ally" }
};

const player = { board: [source, weak, strong], hand: [], crests: [] };
const opponent = { board: [], hand: [] };
const stats = { unsupportedEffects: [0, 0], healing: [0, 0], cardsGenerated: [0, 0], superEvolutions: [0, 0], draws: [0, 0], cardsBurned: [0, 0] };
const evolved = [];
const context = {
  card: source.card,
  sourceUnit: source,
  player,
  opponent,
  playerIndex: 0,
  enemyIndex: 1,
  stats,
  buffUnit() {},
  buffHand() {},
  evolveUnitByAbility(unit) {
    if (!unit || unit.evolved || unit.superEvolved) return false;
    unit.attack += 2;
    unit.defense += 2;
    unit.maxDefense += 2;
    unit.evolved = true;
    evolved.push(unit.name);
    return true;
  }
};

const result = executeGenericEffects(
  "Select another unevolved allied follower on the field and evolve it.",
  context
);

assert.deepEqual(evolved, ["Strong Ally"], "Eudie must evolve another unevolved ally, prioritizing the strongest legal target");
assert.equal(source.evolved, false, "Eudie must never target herself");
assert.deepEqual([strong.attack, strong.defense, strong.maxDefense], [6, 6, 6], "Ability evolution must use the normal +2/+2 evolve body change");
assert.equal(result.unresolved, false, "Eudie's evolve clause must be fully consumed");
assert.ok(result.actions.some(action => action.includes("Eudie: evolve Strong Ally")), "Ability evolution must be visible in the action log");

console.log("Battle Sim ability-driven evolution regression: OK");
