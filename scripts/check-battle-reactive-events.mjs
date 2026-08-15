import assert from "node:assert/strict";
import {
  applyEntryCrestEffects,
  applyFollowerDestroyedEffects,
  applySpellPlayedEffects,
  executeGenericEffects,
  getTriggeredText
} from "../js/battle-rules.js";

const stats = {
  healing: [0, 0],
  cardsGenerated: [0, 0],
  unsupportedEffects: [0, 0],
  draws: [0, 0],
  cardsBurned: [0, 0],
  superEvolutions: [0, 0]
};
const opponent = { name: "Opponent", hp: 20, maxHp: 20, board: [], hand: [], nextSerial: 0 };
const player = {
  name: "You",
  hp: 18,
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
  buffHand(instance, attack, defense) {
    instance.attackBonus = (Number(instance.attackBonus) || 0) + attack;
    instance.defenseBonus = (Number(instance.defenseBonus) || 0) + defense;
  },
  chooseEnemyFollower(board) {
    return board.find(unit => unit.type === "Follower" && !unit.aura) ?? null;
  },
  banish(owner, unit) {
    owner.board = owner.board.filter(candidate => candidate !== unit);
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

const vanillaFollower = { type: "Follower", text: "Ward." };
assert.equal(getTriggeredText(vanillaFollower, "lastWords"), "", "Destroyed followers without Last Words must not synthesize a Last Words event");
const lastWordsFollower = { type: "Follower", text: "Last Words: Draw a card." };
assert.equal(getTriggeredText(lastWordsFollower, "lastWords"), "Draw a card.", "Last Words text must be returned without a duplicate destroyed-event hook");
const endTurnFollower = { type: "Follower", text: "At the end of your turn: Draw a card." };
assert.equal(getTriggeredText(endTurnFollower, "turnEnd"), "Draw a card.", "Turn-end text must not inject a duplicate Crest event");

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

const expensiveFollower = { uid: "discard", card: { id: 201, name: "Discard Me", type: "Follower", cost: 7 } };
const cheapFollower = { uid: "keep", card: { id: 202, name: "Keep Me", type: "Follower", cost: 1 } };
const searchedSpell = { uid: "spell", card: { id: 203, name: "Search Spell", type: "Spell", cost: 2 } };
player.hand = [cheapFollower, expensiveFollower];
player.deck = [searchedSpell];
player.cemetery = [];
const imariSearchContext = { ...context, card: { name: "Imari, Dewdrop" }, sourceUnit: imari };
executeGenericEffects("Select a card in your hand and discard it. Draw a spell.", imariSearchContext);
assert.equal(player.cemetery[0]?.card.name, "Discard Me", "Imari must discard a selected card without generating a Shadow");
assert.ok(player.hand.some(instance => instance.card.name === "Search Spell"), "Imari must draw a spell from the deck");
assert.equal(stats.draws[0], 1, "Imari spell search must count as a draw");

const oneCostA = { uid: "one-a", card: { id: 204, name: "One A", type: "Spell", cost: 1 } };
const oneCostACopy = { uid: "one-a2", card: { id: 204, name: "One A", type: "Spell", cost: 1 } };
const oneCostB = { uid: "one-b", card: { id: 205, name: "One B", type: "Spell", cost: 1 } };
player.deck = [oneCostA, oneCostACopy, oneCostB];
player.hand = [];
executeGenericEffects("Draw 2 differently named 1-cost spells.", imariSearchContext);
assert.deepEqual(player.hand.map(instance => instance.card.name).sort(), ["One A", "One B"], "Imari Super-Evolve must draw two differently named 1-cost spells");

const vira = {
  uid: "vira",
  name: "Vira, Luminous Primal Knight",
  type: "Follower",
  card: { name: "Vira, Luminous Primal Knight" },
  attack: 6,
  defense: 8,
  maxDefense: 8,
  keywords: ["Ward"],
  evolved: false,
  superEvolved: false,
  canAttackFollower: false
};
const enemyA = { uid: "enemy-a", name: "Enemy A", type: "Follower", attack: 3, defense: 3, keywords: [] };
const enemyB = { uid: "enemy-b", name: "Enemy B", type: "Follower", attack: 4, defense: 4, keywords: [] };
opponent.board = [enemyA, enemyB];
const viraContext = { ...context, card: vira.card, sourceUnit: vira };
executeGenericEffects("Select 2 enemy followers on the field and banish them.", viraContext);
assert.equal(opponent.board.length, 0, "Vira Fanfare must banish two enemy followers when two targets exist");

player.personalTurn = 12;
player.evolutionsThisMatch = 3;
const viraSuper = executeGenericEffects("[[battle-super-skybound-self:15]]", viraContext);
assert.equal(vira.superEvolved, true, "Vira Super Skybound Art must super-evolve herself without spending SEP");
assert.deepEqual([vira.attack, vira.defense], [9, 11], "Ability-driven Super-Evolution grants +3/+3");
assert.ok(viraSuper.actions.some(action => /super-evolve Vira/.test(action)), "Vira Super Skybound Art should be visible in resolved actions");

console.log("Battle Sim reactive-event regressions: OK");
