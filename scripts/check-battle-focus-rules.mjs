import assert from "node:assert/strict";
import { executeGenericEffects } from "../js/battle-rules.js";

function makeStats() {
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
    sep: 0,
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

function makeContext(player, opponent, stats) {
  return {
    player,
    opponent,
    playerIndex: 0,
    enemyIndex: 1,
    stats,
    rng: () => 0,
    addToHand(owner, card, amount) {
      let count = 0;
      for (let index = 0; index < amount && owner.hand.length < 9; index += 1) {
        owner.hand.push({ uid: `${owner.name}-${owner.nextSerial++}`, card, attackBonus: 0, defenseBonus: 0 });
        count += 1;
      }
      return count;
    },
    buffHand(item, attack, defense) {
      item.attackBonus = (Number(item.attackBonus) || 0) + attack;
      item.defenseBonus = (Number(item.defenseBonus) || 0) + defense;
    },
    buffUnit(unit, attack, defense) {
      unit.attack += attack;
      unit.defense += defense;
      unit.maxDefense += defense;
    },
    chooseEnemyFollower(board) {
      return board.find(unit => unit.type === "Follower" && !unit.aura) ?? null;
    },
    chooseAlliedFollower(board, excluded) {
      return board.find(unit => unit.type === "Follower" && unit !== excluded) ?? excluded ?? null;
    },
    chooseHandFollower() { return null; },
    relatedCards(card) { return card.__relatedCardObjects ?? []; },
    summon() { return 0; },
    cleanup(owner) {
      const before = owner.board.length;
      owner.board = owner.board.filter(unit => !(unit.type === "Amulet" && Number.isFinite(unit.countdown) && unit.countdown <= 0));
      return before === owner.board.length ? [] : ["countdown amulet destroyed"];
    },
    banish(owner, unit) {
      const before = owner.board.length;
      owner.board = owner.board.filter(candidate => candidate !== unit);
      return owner.board.length < before;
    },
    returnToHand() { return true; },
    draw() { return 0; }
  };
}

const puppet = { id: 90071110, name: "Puppet", type: "Follower", attack: 1, defense: 1, traits: ["Puppetry"], keywords: ["Rush"] };
const ancient = { id: 90071120, name: "Ancient Artifact", type: "Follower", attack: 3, defense: 1, traits: ["Artifact"], keywords: ["Rush"] };

{
  const player = makePlayer();
  const opponent = { name: "Opponent", board: [], hand: [] };
  const stats = makeStats();
  const context = makeContext(player, opponent, stats);
  const card = { name: "Lovestruck Puppeteer", __relatedCardObjects: [puppet] };
  const result = executeGenericEffects("Replicate the effects of this card's Fanfare ability.", { ...context, card });
  assert.deepEqual(player.hand.map(item => item.card.name), ["Puppet"], "Lovestruck Puppeteer must repeat its Fanfare on evolve");
  assert.equal(stats.cardsGenerated[0], 1, "Replicated Lovestruck Fanfare must count the generated Puppet");
  assert.equal(result.unresolved, false, "Lovestruck replicated Fanfare must resolve fully");
}

{
  const player = makePlayer();
  const opponent = { name: "Opponent", board: [], hand: [] };
  const stats = makeStats();
  const context = makeContext(player, opponent, stats);
  const card = { name: "Cool Courier", __relatedCardObjects: [ancient] };
  executeGenericEffects("Replicate the effects of this card's Fanfare ability.", { ...context, card });
  assert.deepEqual(player.hand.map(item => item.card.name), ["Ancient Artifact"], "Cool Courier must repeat its Fanfare on evolve");
  assert.equal(stats.cardsGenerated[0], 1, "Replicated Cool Courier Fanfare must count the generated Artifact");
}

{
  const player = makePlayer();
  const opponent = { name: "Opponent", board: [], hand: [] };
  const stats = makeStats();
  const context = makeContext(player, opponent, stats);
  const card = { name: "Puppet Cat", __relatedCardObjects: [puppet] };
  const clause = "If there's a super-evolved allied follower on the field, add a Puppet to your hand and give it +3/+0.";

  let result = executeGenericEffects(clause, { ...context, card });
  assert.equal(player.hand.length, 0, "Puppet Cat must not generate a Puppet when its condition is false");
  assert.equal(result.unresolved, false, "A false Puppet Cat condition is a resolved no-op, not a rule gap");

  player.board.push({ uid: "super", name: "Super Ally", type: "Follower", superEvolved: true, attack: 3, defense: 3, maxDefense: 3, keywords: [] });
  result = executeGenericEffects(clause, { ...context, card });
  assert.equal(player.hand.length, 1, "Puppet Cat must generate a Puppet when a super-evolved ally exists");
  assert.equal(player.hand[0].card.name, "Puppet");
  assert.equal(player.hand[0].attackBonus, 3, "Puppet Cat must give +3/+0 to the generated Puppet, not to Puppet Cat");
  assert.equal(result.unresolved, false);
}

{
  const player = makePlayer();
  const amulet = { uid: "amulet", name: "Enemy Amulet", type: "Amulet", aura: false, countdown: 2, keywords: [] };
  const follower = { uid: "follower", name: "Small Enemy", type: "Follower", aura: false, attack: 1, defense: 1, maxDefense: 1, keywords: [] };
  const opponent = { name: "Opponent", board: [follower, amulet], hand: [] };
  const stats = makeStats();
  const context = makeContext(player, opponent, stats);
  const card = { name: "Odin, Twilit Fate" };
  executeGenericEffects("Select an enemy card on the field and banish it.", { ...context, card });
  assert.deepEqual(opponent.board.map(unit => unit.name), ["Small Enemy"], "Odin must be able to banish an enemy amulet, not only followers");
}

{
  const player = makePlayer();
  const sanctuary = { uid: "sanctuary", name: "Serene Sanctuary", type: "Amulet", countdown: 1, keywords: [] };
  player.board = [sanctuary];
  const opponent = { name: "Opponent", board: [], hand: [] };
  const stats = makeStats();
  const context = makeContext(player, opponent, stats);
  const card = { name: "Serene Sanctuary" };
  const result = executeGenericEffects("Advance this amulet's count by 1.", { ...context, card, sourceUnit: sanctuary });
  assert.equal(sanctuary.countdown, 0, "Serene Sanctuary Engage must advance Countdown by one");
  assert.equal(player.board.length, 0, "Serene Sanctuary must leave the field immediately when Engage reaches Countdown 0");
  assert.ok(result.actions.includes("Serene Sanctuary: advance countdown by 1"));
}

{
  const player = makePlayer();
  const jeanne = { uid: "jeanne", name: "Jeanne, Saintly Knight", type: "Follower", attack: 5, defense: 5, maxDefense: 5, keywords: ["Ward"] };
  const ally = { uid: "ally", name: "Ally", type: "Follower", attack: 2, defense: 3, maxDefense: 3, keywords: [] };
  player.board = [jeanne, ally];
  const opponent = { name: "Opponent", board: [], hand: [] };
  const stats = makeStats();
  const context = makeContext(player, opponent, stats);
  const card = { name: "Jeanne, Saintly Knight" };
  executeGenericEffects("Give all other allied followers on the field +2/+4.", { ...context, card, sourceUnit: jeanne });
  assert.deepEqual([jeanne.attack, jeanne.defense], [5, 5], "Jeanne must not buff herself");
  assert.deepEqual([ally.attack, ally.defense, ally.maxDefense], [4, 7, 7], "Jeanne must give every other allied follower +2/+4");
}

{
  const player = makePlayer();
  const opponent = { name: "Opponent", board: [], hand: [] };
  const stats = makeStats();
  const context = makeContext(player, opponent, stats);
  const card = { name: "Olivia, Proud Dark Angel" };
  executeGenericEffects("Recover 2 super-evolution points.", { ...context, card });
  assert.equal(player.sep, 2, "Olivia must recover 2 SEP");
  executeGenericEffects("Recover 2 super-evolution points.", { ...context, card });
  assert.equal(player.sep, 2, "Olivia SEP recovery must respect the 2-point cap");
}

console.log("Battle Sim focus rule regressions: OK");
