import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { analyzeCardSupport, analyzeDeckCoverage, simulateBattle } from "../js/battle-engine.js";
import { applyEntryCrestEffects, applyBuffedFollowerEffects, executeGenericEffects } from "../js/battle-rules.js";

const cards = JSON.parse(await fs.readFile(new URL("../data/official/cards.json", import.meta.url), "utf8"));
const references = JSON.parse(await fs.readFile(new URL("../data/custom/reference-decks.json", import.meta.url), "utf8")).decks ?? [];
const cardMap = new Map(cards.map(card => [Number(card.id), card]));
for (const card of cards) {
  card.__relatedCardObjects = (card.relatedCards ?? []).map(id => cardMap.get(Number(id))).filter(Boolean);
  card.__relatedNames = card.__relatedCardObjects.map(item => item.name);
}

function byName(name) {
  const card = cards.find(item => item.name === name);
  assert.ok(card, `Missing card: ${name}`);
  return card;
}

function deckList(reference) {
  return reference.cards.map(entry => [Number(entry.cardId), Number(entry.qty ?? 1)]);
}

const expectedFullCards = [
  "Aryll, Moonstruck Vampire",
  "Fiole, Devilish Matriarch",
  "Adahime, Anathema of Death",
  "Ruflet, Primeval Fairy",
  "Tia, Eternal Crystalian",
  "Krulle, Heir to Unkilling",
  "Bayle, Luxglaive Warrior",
  "Luminous Lancetrooper",
  "Yidmetra, Eld Sword",
  "Gildaria, Anathema of Attunement",
  "Mars, Conflagrant Commander",
  "Zooey, Ally of the World",
  "Galleon, Earth Personified",
  "Sofina, Inspiring Strength",
  "Aether, Empyrean Guardian",
  "Edeth, Voice of Heaven"
];

for (const name of expectedFullCards) {
  assert.equal(analyzeCardSupport(byName(name)).level, "full", `${name} must be fully modeled`);
}

assert.equal(references.length, 7, "The 7 reference decks must be present");
for (const reference of references) {
  const coverage = analyzeDeckCoverage(deckList(reference), cardMap);
  assert.equal(coverage.unsupported, 0, `${reference.name}: unsupported must be 0`);
  assert.equal(coverage.partial, 0, `${reference.name}: partial must be 0`);
  assert.equal(coverage.modeledPercent, 100, `${reference.name}: coverage must be 100%`);

  const result = simulateBattle({
    playerDeck: deckList(reference),
    opponentDeck: deckList(reference),
    cardMap,
    playerStrategy: reference.strategy ?? {},
    opponentStrategy: reference.strategy ?? {},
    seed: `coverage-100:${reference.id}`,
    playerSide: "first",
    recordFrames: false
  });
  assert.ok(result.summary.rounds > 0, `${reference.name}: simulation must run`);
  assert.equal(result.summary.experimental, false, `${reference.name}: fully modeled mirror must not be experimental`);
  assert.deepEqual(result.summary.stats.unsupportedEffects, [0, 0], `${reference.name}: mirror must expose zero rule gaps`);
  console.log(`${reference.name}: 100% · 0 rule gaps`);
}

function unit(card, { name = card.name, attack = Number(card.attack) || 1, defense = Number(card.defense) || 1, keywords = card.keywords ?? [] } = {}) {
  return {
    uid: `${name}-${Math.random()}`,
    name,
    card,
    type: "Follower",
    attack,
    defense,
    maxDefense: defense,
    keywords: [...keywords],
    evolved: false,
    superEvolved: false,
    attacked: false,
    canAttackLeader: false,
    canAttackFollower: false
  };
}

function stats() {
  return {
    damageDealt: [0, 0], healing: [0, 0], cardsGenerated: [0, 0], cardsBurned: [0, 0],
    unsupportedEffects: [0, 0], draws: [0, 0], evolutions: [0, 0], superEvolutions: [0, 0],
    followersLost: [0, 0], lastWordsTriggered: [0, 0], strikeTriggered: [0, 0]
  };
}

function baseContext(card, sourceUnit = null) {
  const player = { hp: 20, maxHp: 20, pp: 10, maxPp: 10, sep: 2, faith: 0, faithEnhanceBuffs: 0, personalTurn: 7, goingFirst: true, isActive: true, board: sourceUnit ? [sourceUnit] : [], hand: [], deck: [], cemetery: [], crests: [] };
  const opponent = { hp: 20, maxHp: 20, board: [], hand: [], cemetery: [], crests: [], isActive: false };
  const s = stats();
  return {
    card, sourceUnit, player, opponent, playerIndex: 0, enemyIndex: 1, stats: s, rng: () => 0,
    chooseEnemyFollower: board => board.find(item => item.type === "Follower") ?? null,
    chooseAlliedFollower: board => board.find(item => item.type === "Follower") ?? null,
    buffUnit(target, attack, defense) { target.attack += attack; target.defense += defense; target.maxDefense += defense; },
    buffHand(target, attack, defense) { target.attackBonus = (target.attackBonus ?? 0) + attack; target.defenseBonus = (target.defenseBonus ?? 0) + defense; },
    addToHand(owner, generated, amount) { for (let i = 0; i < amount; i += 1) owner.hand.push({ uid: `${generated.name}-${i}`, card: generated }); return amount; },
    summon(owner, generated, amount) { for (let i = 0; i < amount; i += 1) owner.board.push(unit(generated)); return amount; },
    cleanup(owner) { owner.board = owner.board.filter(item => item.type !== "Follower" || item.defense > 0); return []; },
    banish(owner, target) { owner.board = owner.board.filter(item => item !== target); return true; },
    returnToHand(owner, target) { owner.board = owner.board.filter(item => item !== target); return true; }
  };
}

// Current deck: Bat reactive rules.
{
  const aryll = byName("Aryll, Moonstruck Vampire");
  const bat = byName("Bat");
  const source = unit(aryll);
  const entered = unit(bat);
  const ctx = baseContext(aryll, source);
  ctx.player.board.push(entered);
  const actions = applyEntryCrestEffects(ctx, entered);
  assert.ok(entered.keywords.includes("Storm"), "Aryll must give Storm to entering Bats");
  assert.equal(ctx.player.hp, 19, "Aryll must deal 1 damage to its leader for a Bat entry");
  assert.ok(actions.some(action => action.includes("Aryll")));
}
{
  const fiole = byName("Fiole, Devilish Matriarch");
  const bat = byName("Bat");
  const source = unit(fiole);
  const entered = unit(bat);
  const ctx = baseContext(fiole, source);
  ctx.player.board.push(entered);
  applyEntryCrestEffects(ctx, entered);
  assert.ok(entered.keywords.includes("Rush"), "Fiole must give Rush to entering Bats");
}

// Forest: once-per-turn buff reactions.
{
  const ruflet = byName("Ruflet, Primeval Fairy");
  const source = unit(ruflet);
  const ctx = baseContext(ruflet, source);
  const before = { attack: source.attack, defense: source.defense };
  source.attack += 1;
  const first = applyBuffedFollowerEffects(ctx, source, before);
  const boardAfterFirst = ctx.player.board.length;
  source.defense += 1;
  applyBuffedFollowerEffects(ctx, source, { attack: source.attack, defense: source.defense - 1 });
  assert.ok(first.some(action => action.includes("Ruflet")), "Ruflet must react to a field buff");
  assert.equal(ctx.player.board.length, boardAfterFirst, "Ruflet may only trigger once on each own turn");
}
{
  const tia = byName("Tia, Eternal Crystalian");
  const source = unit(tia);
  const ctx = baseContext(tia, source);
  source.attack += 1;
  applyBuffedFollowerEffects(ctx, source, { attack: source.attack - 1, defense: source.defense });
  assert.ok(ctx.player.hand.some(item => item.card.name === "Eve, Blade of Crystalia"), "Tia must add Eve after being buffed");
}

// Ward: exact card-specific clauses can be consumed without unresolved text.
{
  const galleon = byName("Galleon, Earth Personified");
  const source = unit(galleon);
  const allyCard = { name: "Ward Ally", type: "Follower", text: "Ward", keywords: ["Ward"], attack: 2, defense: 2 };
  const ally = unit(allyCard);
  const ctx = baseContext(galleon, source);
  ctx.player.board.push(ally);
  ctx.isSuperEvolutionUnlocked = () => true;
  ctx.evolveRandomUnitByAbility = predicate => {
    const target = ctx.player.board.find(item => item !== source && !item.evolved && predicate(item));
    if (target) { target.evolved = true; target.attack += 2; target.defense += 2; target.maxDefense += 2; }
    return target ?? null;
  };
  let result = executeGenericEffects("Can't attack followers or leaders.", ctx);
  assert.equal(result.unresolved, false);
  assert.equal(source.canAttackLeader, false);
  assert.equal(source.canAttackFollower, false);
  result = executeGenericEffects("if you've unlocked super-evolution, evolve a random unevolved allied follower on the field that didn't attack this turn.", ctx);
  assert.equal(result.unresolved, false);
  assert.equal(ally.evolved, true, "Galleon must evolve an eligible ally at turn end");
}
{
  const aether = byName("Aether, Empyrean Guardian");
  const source = unit(aether);
  const ctx = baseContext(aether, source);
  const lowCards = [
    { name: "Low A", type: "Follower", class: "Havencraft", cost: 1, attack: 1, defense: 1, keywords: [], text: "" },
    { name: "Low B", type: "Follower", class: "Havencraft", cost: 2, attack: 2, defense: 2, keywords: [], text: "" },
    { name: "Low C", type: "Follower", class: "Havencraft", cost: 3, attack: 3, defense: 3, keywords: [], text: "" }
  ];
  ctx.player.deck = lowCards.map((card, index) => ({ uid: `d-${index}`, card }));
  ctx.summonFromDeckDifferentNames = (limit, predicate) => {
    const selected = ctx.player.deck.filter(item => predicate(item.card)).slice(0, limit);
    for (const item of selected) ctx.player.board.push(unit(item.card));
    return selected.map(item => ctx.player.board.at(-1));
  };
  const result = executeGenericEffects("Summon 3 random differently named followers that cost 3 or less from your deck.", ctx);
  assert.equal(result.unresolved, false);
}
{
  const edeth = byName("Edeth, Voice of Heaven");
  const source = unit(edeth);
  const ctx = baseContext(edeth, source);
  ctx.summonWithoutLastWords = card => {
    const copy = unit(card);
    copy.overrideText = "Ward Aura";
    ctx.player.board.push(copy);
    return copy;
  };
  const result = executeGenericEffects("Summon an Edeth, Voice of Heaven and remove Last Words from it.", ctx);
  assert.equal(result.unresolved, false);
  assert.ok(ctx.player.board.some(item => item !== source && item.name === edeth.name && !/last words/i.test(item.overrideText ?? "")), "Edeth must resummon without Last Words");
}

console.log("Battle Sim 100% coverage regression: OK");
