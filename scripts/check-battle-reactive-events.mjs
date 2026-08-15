import assert from "node:assert/strict";
import {
  applyEntryCrestEffects,
  applyFollowerDestroyedEffects,
  applySpellPlayedEffects
} from "../js/battle-rules.js";

const stats = { healing: [0, 0], cardsGenerated: [0, 0], unsupportedEffects: [0, 0] };
const opponent = { name: "Opponent", hp: 20, maxHp: 20, board: [], nextSerial: 0 };
const player = { name: "You", hp: 18, maxHp: 20, board: [], crests: [], nextSerial: 0 };
const context = {
  player,
  opponent,
  playerIndex: 0,
  enemyIndex: 1,
  stats,
  buffUnit(unit, attack, defense) {
    unit.attack += attack;
    unit.defense += defense;
    unit.maxDefense += defense;
  },
  cleanup() {},
  summon(owner, card, amount) {
    let count = 0;
    for (let index = 0; index < amount && owner.board.length < 5; index += 1) {
      owner.board.push({
        uid: `${owner.name}-${owner.nextSerial++}`,
        name: card.name,
        type: "Follower",
        card,
        attack: card.attack,
        defense: card.defense,
        maxDefense: card.defense,
        keywords: [...(card.keywords ?? [])]
      });
      count += 1;
    }
    return count;
  }
};

player.crests = [{ name: "Wilbert, Desolate Paladin" }];
const holyKnight = {
  uid: "knight",
  name: "Knight of the Holy Order",
  type: "Follower",
  card: { traits: [] },
  attack: 2,
  defense: 2,
  maxDefense: 2,
  keywords: ["Ward"]
};
player.board = [holyKnight];
const knightActions = applyEntryCrestEffects(context, holyKnight);
assert.deepEqual([holyKnight.attack, holyKnight.defense], [3, 4], "Wilbert Crest must buff the entering Ward follower");
assert.equal(player.hp, 19, "Knight of the Holy Order must heal the leader when it receives a field stat buff");
assert.ok(knightActions.some(action => action.includes("Knight of the Holy Order")), "Knight heal should be visible in resolved actions");

player.crests = [];
const sarissa = {
  uid: "sarissa",
  name: "Sarissa, Luxspear Al-mi'raj",
  type: "Follower",
  card: { traits: [] },
  attack: 2,
  defense: 2,
  maxDefense: 2,
  keywords: []
};
const destroyedWard = {
  uid: "ward",
  name: "Holy Cavalier",
  type: "Follower",
  card: { traits: [] },
  attack: 1,
  defense: 0,
  maxDefense: 2,
  keywords: ["Ward"]
};
player.board = [sarissa, destroyedWard];
applyFollowerDestroyedEffects(context, destroyedWard);
assert.deepEqual([sarissa.attack, sarissa.defense], [3, 3], "Sarissa must gain +1/+1 when an allied Ward follower is destroyed");

const orchis = { uid: "orchis", name: "Orchis, Newfound Heart", type: "Follower", card: { traits: [] }, keywords: [] };
const zwei = { uid: "zwei", name: "Zwei, Symphonic Heart", type: "Follower", card: { traits: [] }, keywords: [] };
const puppet = {
  uid: "puppet",
  name: "Enhanced Puppet",
  type: "Follower",
  card: { traits: ["Puppetry"] },
  attack: 3,
  defense: 3,
  maxDefense: 3,
  keywords: ["Rush"],
  canAttackFollower: true,
  canAttackLeader: false
};
player.board = [orchis, zwei, puppet];
applyEntryCrestEffects(context, puppet);
assert.ok(puppet.keywords.includes("Storm"), "Orchis must give entering Puppetry followers Storm");
assert.ok(puppet.keywords.includes("Bane"), "Orchis must give entering Puppetry followers Bane");
assert.ok(puppet.keywords.includes("Ward"), "Zwei must give entering Puppetry followers Ward");

const broadcaster = { uid: "broadcaster", name: "Brazen Broadcaster", type: "Follower", card: { traits: [] }, keywords: [] };
const artifact = {
  uid: "artifact",
  name: "Analyzing Artifact",
  type: "Follower",
  card: { traits: ["Artifact"] },
  attack: 1,
  defense: 1,
  maxDefense: 1,
  keywords: []
};
player.board = [broadcaster, artifact];
applyEntryCrestEffects(context, artifact);
assert.ok(artifact.keywords.includes("Rush"), "Brazen Broadcaster must give entering Artifact followers Rush");

const buddies = { id: 99, name: "Imari's Little Buddies", type: "Follower", attack: 3, defense: 3, keywords: ["Rush"], traits: [] };
const imari = {
  uid: "imari",
  name: "Imari, Dewdrop",
  type: "Follower",
  evolved: true,
  card: { __relatedCardObjects: [buddies] },
  keywords: []
};
player.board = [imari];
applySpellPlayedEffects(context);
assert.equal(player.board.filter(unit => unit.name === "Imari's Little Buddies").length, 1, "Evolved Imari must summon Little Buddies after a spell is played");
assert.equal(stats.cardsGenerated[0], 1, "Imari-generated token must count as generated");

console.log("Battle Sim reactive-event regressions: OK");
