import assert from "node:assert/strict";
import { executeGenericEffects, getTriggeredText } from "../js/battle-rules.js";

const asherCard = {
  name: "Asher & Lydia, Paths Beyond",
  type: "Follower",
  text: "Fanfare: Select an enemy follower on the field and give it Ward. Enhance (9): Evolve this follower and give it Storm. When this follower evolves, destroy 2 random enemy followers with Ward."
};

assert.equal(
  getTriggeredText(asherCard, "evolve").toLowerCase(),
  "destroy 2 random enemy followers with ward.",
  "Natural-language 'When this follower evolves' clauses must dispatch as an Evolve event"
);

function makeUnit(name, attack, defense, keywords = []) {
  return { uid: name, name, type: "Follower", card: { name }, attack, defense, maxDefense: defense, keywords: [...keywords], evolved: false, superEvolved: false };
}

const asher = makeUnit("Asher & Lydia, Paths Beyond", 5, 5);
const targetA = makeUnit("Ward A", 3, 3);
const targetB = makeUnit("Ward B", 2, 2, ["Ward"]);
const targetC = makeUnit("Ward C", 4, 4, ["Ward"]);
const nonWard = makeUnit("No Ward", 9, 9);
const player = { board: [asher], hand: [], crests: [] };
const opponent = { board: [targetA, targetB, targetC, nonWard], hand: [] };
const stats = { unsupportedEffects: [0, 0], healing: [0, 0], cardsGenerated: [0, 0], draws: [0, 0], cardsBurned: [0, 0], superEvolutions: [0, 0] };
const context = {
  card: asherCard,
  sourceUnit: asher,
  player,
  opponent,
  playerIndex: 0,
  enemyIndex: 1,
  stats,
  rng: () => 0,
  chooseEnemyFollower(board) { return board.find(unit => unit.type === "Follower") ?? null; },
  buffUnit() {},
  buffHand() {},
  cleanup(owner) { owner.board = owner.board.filter(unit => unit.type !== "Follower" || unit.defense > 0); return []; },
  evolveUnitByAbility(unit) {
    if (!unit || unit.evolved) return false;
    unit.attack += 2;
    unit.defense += 2;
    unit.maxDefense += 2;
    unit.evolved = true;
    return true;
  }
};

let result = executeGenericEffects("Select an enemy follower on the field and give it Ward.", context);
assert.ok(targetA.keywords.includes("Ward"), "Asher Fanfare must give Ward to the selected enemy follower");
assert.equal(result.unresolved, false);

result = executeGenericEffects("Evolve this follower and give it Storm.", context);
assert.equal(asher.evolved, true, "Asher Enhance must evolve itself by ability");
assert.ok(asher.keywords.includes("Storm"), "Asher Enhance must give itself Storm");
assert.equal(result.unresolved, false);

result = executeGenericEffects("destroy 2 random enemy followers with Ward.", context);
assert.deepEqual(opponent.board.map(unit => unit.name).sort(), ["No Ward", "Ward C"].sort(), "Asher Evolve trigger must destroy exactly two enemy Ward followers");
assert.equal(result.unresolved, false);

console.log("Battle Sim Asher & Lydia regression: OK");
