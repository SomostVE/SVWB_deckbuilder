import assert from "node:assert/strict";
import { applyEntryCrestEffects, executeGenericEffects } from "../js/battle-rules.js";

function stats() {
  return {
    unsupportedEffects: [0, 0],
    cardsGenerated: [0, 0],
    healing: [0, 0],
    draws: [0, 0],
    cardsBurned: [0, 0],
    superEvolutions: [0, 0]
  };
}

function makePlayer() {
  return {
    name: "You",
    hp: 20,
    maxHp: 20,
    board: [],
    hand: [],
    deck: [],
    cemetery: [],
    crests: [],
    nextSerial: 0,
    personalTurn: 1,
    evolutionsThisMatch: 0
  };
}

function artifactUnit(name) {
  return {
    uid: name,
    name,
    type: "Follower",
    card: { name, type: "Follower", traits: ["Artifact"] },
    attack: 1,
    defense: 1,
    maxDefense: 1,
    keywords: []
  };
}

function baseContext(player, opponent, battleStats) {
  return {
    player,
    opponent,
    playerIndex: 0,
    enemyIndex: 1,
    stats: battleStats,
    rng: () => 0,
    buffUnit(unit, attack, defense) {
      unit.attack += attack;
      unit.defense += defense;
      unit.maxDefense += defense;
    },
    buffHand() {},
    chooseEnemyFollower(board) {
      return board.find(unit => unit.type === "Follower") ?? null;
    },
    chooseAlliedFollower(board, excluded) {
      return board.find(unit => unit.type === "Follower" && unit !== excluded) ?? excluded ?? null;
    },
    chooseHandFollower() { return null; },
    relatedCards(card) { return card.__relatedCardObjects ?? []; },
    summon() { return 0; },
    addToHand(owner, card, amount) {
      let count = 0;
      for (let index = 0; index < amount && owner.hand.length < 9; index += 1) {
        owner.hand.push({ uid: `${owner.name}-${owner.nextSerial++}`, card });
        count += 1;
      }
      return count;
    },
    cleanup(owner) {
      owner.board = owner.board.filter(unit => unit.type !== "Follower" || unit.defense > 0);
      return [];
    },
    banish(owner, unit) {
      owner.board = owner.board.filter(candidate => candidate !== unit);
      return true;
    },
    returnToHand() { return true; },
    draw() { return 0; }
  };
}

const analyzing = { id: 90071130, name: "Analyzing Artifact", type: "Follower", traits: ["Artifact"], cost: 1 };
const ancient = { id: 90071120, name: "Ancient Artifact", type: "Follower", traits: ["Artifact"], cost: 1 };
const freerunning = {
  id: 10771310,
  name: "Freerunning",
  type: "Spell",
  cost: 1,
  __relatedCardObjects: [analyzing, ancient]
};
const scarlet = {
  id: 10774110,
  name: "Scarlet, Anathema of Dislocation",
  type: "Follower",
  traits: ["Anathema"],
  keywords: ["Storm", "Ward"]
};

const player = makePlayer();
const opponent = { name: "Opponent", hp: 20, maxHp: 20, board: [], hand: [], nextSerial: 0 };
const battleStats = stats();
const context = baseContext(player, opponent, battleStats);
const scarletInstance = { uid: "scarlet-instance", card: scarlet, x: 0 };
player.deck = [scarletInstance];

const artifactA = artifactUnit("Analyzing Artifact");
const artifactB = artifactUnit("Ancient Artifact");
const artifactC = artifactUnit("Mystic Artifact");
player.board = [artifactA, artifactB, artifactC];

applyEntryCrestEffects(context, artifactA);
applyEntryCrestEffects(context, artifactB);
assert.deepEqual(player.artifactFollowerNamesEntered, ["analyzing artifact", "ancient artifact"], "Artifact history must track unique names");
assert.equal(scarletInstance.x, 2, "Scarlet X must follow the number of differently named Artifact followers that entered");

let result = executeGenericEffects("Add an Analyzing Artifact to your hand.", { ...context, card: freerunning });
assert.deepEqual(player.hand.map(item => item.card.name), ["Analyzing Artifact"], "Freerunning below 3 unique Artifact entries must activate only the selected mode");
assert.equal(result.unresolved, false, "Selected Freerunning mode below threshold is fully resolved");

player.hand = [];
battleStats.cardsGenerated[0] = 0;
applyEntryCrestEffects(context, artifactC);
assert.equal(player.artifactFollowerNamesEntered.length, 3, "Third differently named Artifact must unlock Freerunning's combined mode");
assert.equal(scarletInstance.x, 3, "Scarlet runtime instance must receive the unlocked Artifact-entry count before it is played");

result = executeGenericEffects("Add an Analyzing Artifact to your hand.", { ...context, card: freerunning });
assert.deepEqual(player.hand.map(item => item.card.name).sort(), ["Analyzing Artifact", "Ancient Artifact"], "Freerunning at 3 unique Artifact entries must activate both modes");
assert.equal(battleStats.cardsGenerated[0], 2, "Both Freerunning-generated Artifacts must count as generated cards");
assert.equal(result.unresolved, false, "Freerunning threshold effect must resolve without a rule gap");

result = executeGenericEffects(
  "X is the number of differently named allied Artifact followers that have entered the field this match.",
  { ...context, card: scarlet }
);
assert.equal(result.unresolved, false, "Scarlet's explanatory X clause must not remain unresolved after v5 consumes its X-damage clause");
assert.ok(result.actions.includes("Scarlet: X=3"), "Scarlet should expose the resolved Artifact-history X value in its action log");

console.log("Battle Sim Artifact history regressions: OK");
