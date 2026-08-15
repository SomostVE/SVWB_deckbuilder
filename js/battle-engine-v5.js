import {
  executeGenericEffects,
  getCountdown,
  getTriggeredText,
  applyEntryCrestEffects,
  applyFollowerDestroyedEffects,
  applySpellPlayedEffects,
  applyBuffedFollowerEffects
} from "./battle-rules.js";
import { analyzeCardSupport as analyzeCardSupportV4 } from "./battle-engine-v4.js";

export const BATTLE_RULES_VERSION = 5;

const MAX_ROUNDS = 60;
const MAX_ACTIONS = 24;
const GAP_HOOK = "[[battle-rule-gap-hook]]";
const FULL_OVERRIDES = new Map([
  ["prostrating coward", "Crystallize, Countdown, entry healing and Last Words are modeled"],
  ["sandalphon, primarch successor", "Invoke, timed Crest and Super Skybound Art are modeled"],
  ["verdilia & castelle, sisters", "Deck summon, ability Super-Evolution and persistent attack Crest are modeled"],
  ["vira, luminous primal knight", "Damage cap, Fanfare banish and Super Skybound Art are modeled"],
  ["neptune, arbiter of tides", "Marine-entry healing Crest and Megalorca summons are modeled"],
  ["galmieux, ardor manifest", "Self-damage trigger and allied-damage Crest are modeled"],
  ["burnite, anathema of ash", "Opponent Crest start-turn and heal-reactive damage are modeled"],
  ["lu woh, light personified", "Storm-attack reduction Crest and Countdown are modeled"],
  // [[battle-coverage-100-overrides]]
  ["aryll, moonstruck vampire", "Bat-entry Storm and leader self-damage are modeled"],
  ["fiole, devilish matriarch", "Bat-entry Rush is modeled"],
  ["adahime, anathema of death", "Deck summons, Abysscraft-entry Rush and Super-Evolve board buff are modeled"],
  ["ruflet, primeval fairy", "Once-per-turn buff trigger and Last Words are modeled"],
  ["tia, eternal crystalian", "Enhance board buff and once-per-turn buff trigger are modeled"],
  ["krulle, heir to unkilling", "Defense debuff reaction and Countdown Crest are modeled"],
  ["bayle, luxglaive warrior", "Hand cost reduction on allied follower leaving the field is modeled"],
  ["luminous lancetrooper", "Officer-entry Rush is modeled"],
  ["yidmetra, eld sword", "Faith accumulation, Faith payment and persistent Enhance buff are modeled"],
  ["gildaria, anathema of attunement", "Rally evolve, entry Rush, evolve summon and Countdown Crest are modeled"],
  ["mars, conflagrant commander", "Officer-entry buffs and Super-Evolve summon are modeled"],
  ["zooey, ally of the world", "Enhance max-defense and temporary leader damage prevention are modeled"],
  ["galleon, earth personified", "Permanent attack lock and conditional end-turn evolution are modeled"],
  ["sofina, inspiring strength", "Mode evolutions and evolved end-turn board debuff are modeled"],
  ["aether, empyrean guardian", "Differently named deck summons and Super-Evolve Aura distribution are modeled"],
  ["edeth, voice of heaven", "Last Words resummon without Last Words and Super-Evolve destruction are modeled"]
]);

const HANDLED_REACTIVE_CLAUSES = [
  /Whenever an allied Puppetry follower enters the field, give it Storm and Bane\.?/gi,
  /Whenever an allied Puppetry follower enters the field, give it Ward\.?/gi,
  /Whenever an allied Artifact follower enters the field, give it Rush\.?/gi,
  /Whenever you play a spell, if this follower is evolved, summon an Imari's Little Buddies\.?/gi,
  /Whenever an allied follower with Ward is destroyed, give this follower \+1\/\+1\.?/gi,
  /Whenever this follower is given \+ attack or defense on the field, restore 1 defense to your leader\.?/gi
];

export function simulateBattle({ playerDeck, opponentDeck, cardMap, playerStrategy = {}, opponentStrategy = {}, seed = "deci-builder", playerSide = "random", recordFrames = true }) {
  const simulationMap = prepareSimulationCardMap(cardMap);
  const rng = createRng(seed);
  const side = playerSide === "first" ? 0 : playerSide === "second" ? 1 : (rng() < .5 ? 0 : 1);
  const first = side === 0 ? 0 : 1;
  const second = 1 - first;
  const players = [
    makePlayer("You", playerDeck, playerStrategy, simulationMap, rng),
    makePlayer("Opponent", opponentDeck, opponentStrategy, simulationMap, rng)
  ];
  players[first].goingFirst = true;
  players[second].goingSecond = true;
  players[second].bonusPpAvailable = true;
  const stats = createStats();
  const frames = [];

  drawCards(players[0], 4, stats, 0);
  drawCards(players[1], 4, stats, 1);
  snap(frames, players, { round: 0, active: first, phase: "opening", action: "Both players draw 4 cards." }, stats, recordFrames);
  mulligan(players[0], rng, stats, 0, frames, players, recordFrames);
  mulligan(players[1], rng, stats, 1, frames, players, recordFrames);

  let winner = null;
  let lastRound = 0;
  outer: for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    lastRound = round;
    for (const active of [first, second]) {
      const enemy = 1 - active;
      const p = players[active], o = players[enemy];
      p.isActive = true;
      o.isActive = false;
      p.personalTurn += 1;
      p.cardsPlayedThisTurn = 0;
      p.spellsPlayedThisTurn = 0;
      p.evolutionActionUsed = false;
      p.maxPp = Math.min(10, p.maxPp + 1);
      p.pp = p.maxPp;
      if (p.goingSecond && p.personalTurn === 6 && p.bonusPpUses < 2) p.bonusPpAvailable = true;
      readyBoard(p);

      const start = turnStart(p, o, active, enemy, stats, rng, simulationMap);
      snap(frames, players, { round, active, phase: "turn-start", action: compact(`${p.name} starts turn ${p.personalTurn} with ${p.pp}/${p.maxPp} PP.`, start) }, stats, recordFrames);
      if (p.hp <= 0) { winner = enemy; break outer; }
      if (o.hp <= 0) { winner = active; break outer; }

      drawCards(p, 1, stats, active);
      if (p.deckOut) {
        winner = enemy;
        snap(frames, players, { round, active, phase: "draw", action: `${p.name} cannot draw from an empty deck and loses.` }, stats, recordFrames);
        break outer;
      }
      snap(frames, players, { round, active, phase: "draw", action: `${p.name} draws a card.` }, stats, recordFrames);

      useBonusPpIfUseful(p, o);
      runTurnAi({
        player: p, opponent: o, playerIndex: active, enemyIndex: enemy,
        stats, frames, players, round, rng, map: simulationMap, record: recordFrames
      });
      if (p.hp <= 0) { winner = enemy; break outer; }
      if (o.hp <= 0) { winner = active; break outer; }

      const end = turnEnd(p, o, active, enemy, stats, rng, simulationMap);
      stats.ppWasted[active] += Math.max(0, Math.min(p.pp, p.maxPp));
      snap(frames, players, { round, active, phase: "turn-end", action: compact(`${p.name} ends turn ${p.personalTurn}.`, end) }, stats, recordFrames);
      if (p.hp <= 0) { winner = enemy; break outer; }
      if (o.hp <= 0) { winner = active; break outer; }
      p.isActive = false;
    }
  }

  const coverage = [analyzeDeckCoverage(playerDeck, cardMap), analyzeDeckCoverage(opponentDeck, cardMap)];
  return {
    frames,
    coverage,
    summary: {
      winner: winner == null ? "Draw / turn limit" : players[winner].name,
      winnerIndex: winner,
      rounds: lastRound,
      finalHp: players.map(p => p.hp),
      stats,
      experimental: coverage.some(item => item.unsupported || item.partial)
    }
  };
}

export function analyzeDeckCoverage(deck, cardMap) {
  prepareOriginalCardMap(cardMap);
  let total = 0, full = 0, partial = 0, unsupported = 0;
  const partialCards = [], unsupportedCards = [], mechanics = new Map();
  for (const [id, qty] of normalizeDeck(deck)) {
    const card = cardMap.get(Number(id));
    const count = Number(qty) || 0;
    total += count;
    const support = analyzeCardSupport(card);
    if (support.level === "full") full += count;
    else if (support.level === "partial") { partial += count; if (card) partialCards.push(card.name); }
    else { unsupported += count; unsupportedCards.push(card?.name ?? `Card ${id}`); }
    for (const mechanic of support.mechanics ?? []) mechanics.set(mechanic, (mechanics.get(mechanic) ?? 0) + count);
  }
  return {
    total, full, partial, unsupported,
    modeledPercent: total ? Math.round((full + partial * .72) / total * 100) : 0,
    partialCards: uniq(partialCards).slice(0, 18),
    unsupportedCards: uniq(unsupportedCards).slice(0, 18),
    mechanics: [...mechanics].sort((a,b)=>b[1]-a[1]).slice(0,14).map(([name,count])=>({name,count}))
  };
}

export function analyzeCardSupport(card) {
  const base = analyzeCardSupportV4(card);
  if (!card || base.level !== "partial") return base;
  const override = FULL_OVERRIDES.get(norm(card.name));
  return override ? { ...base, level: "full", reason: `Battle Sim v5: ${override}` } : base;
}

export function inspectEffectiveCost(card, { spellboost = 0, costDelta = 0 } = {}) {
  return costOf({ card, spellboost, costDelta });
}

function prepareSimulationCardMap(cardMap) {
  prepareOriginalCardMap(cardMap);
  const prepared = new Map();
  for (const [id, original] of cardMap.entries()) {
    if (!original) continue;
    const support = analyzeCardSupport(original);
    let text = sanitizeHandledReactiveText(original.text);
    text = adaptSkyboundText(original, text);
    text = expandEnhanceWithBaseFanfare(text);
    if (support.level !== "full") text = injectGapHook(text);
    prepared.set(Number(id), {
      ...original,
      keywords: [...(original.keywords ?? [])],
      traits: [...(original.traits ?? [])],
      relatedCards: [...(original.relatedCards ?? [])],
      text
    });
  }
  for (const card of prepared.values()) {
    card.__relatedCardObjects = (card.relatedCards ?? []).map(id => prepared.get(Number(id))).filter(Boolean);
    card.__relatedNames = card.__relatedCardObjects.map(item => item.name);
  }
  return prepared;
}

function prepareOriginalCardMap(cardMap) {
  if (!(cardMap instanceof Map)) return;
  for (const card of cardMap.values()) {
    if (!card || Array.isArray(card.__relatedNames)) continue;
    card.__relatedNames = (card.relatedCards ?? []).map(id => cardMap.get(Number(id))?.name).filter(Boolean);
  }
}

function sanitizeHandledReactiveText(textValue) {
  let text = String(textValue ?? "");
  for (const pattern of HANDLED_REACTIVE_CLAUSES) text = text.replace(pattern, " ");
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function adaptSkyboundText(card, textValue) {
  let text = String(textValue ?? "");
  const name = norm(card?.name);
  if (name === "vira, luminous primal knight") {
    text = text.replace(/Super Skybound Art\s*[-–—:]\s*Super-evolve this follower\.?/i, "[[battle-super-skybound-self:15]]");
  }
  if (name === "lu woh, light personified") {
    text = text.replace(/Skybound Art\s*[-–—:]\s*Gain Crest\s*:\s*Lu Woh, Light Personified\.?/i, "[[battle-skybound-crest:10:Lu Woh, Light Personified]]");
  }
  text = text.replace(/Super Skybound Art\s*[-–—]\s*/gi, "Super Skybound Art: ");
  text = text.replace(/Skybound Art\s*[-–—]\s*/gi, "Skybound Art: ");
  return text;
}

function expandEnhanceWithBaseFanfare(textValue) {
  const text = String(textValue ?? "");
  const fanfare = text.match(/\bFanfare\s*:\s*([\s\S]*?)(?=\b(?:Enhance\s*\(?\s*\d+\s*\)?|Accelerate\s*\(?\s*\d+\s*\)?|Crystallize\s*\(?\s*\d+\s*\)?|Last Words|Strike|Clash|Evolve|Super-Evolve|Engage|On Spellboost|At the start of your turn|At the end of your turn)\s*:|$)/i)?.[1]?.trim();
  if (!fanfare || !/\bEnhance\s*\(?\s*\d+\s*\)?\s*:/i.test(text)) return text;
  return text.replace(/\bEnhance\s*\(?\s*(\d+)\s*\)?\s*:/gi, match => `${match} ${fanfare} `);
}

function injectGapHook(textValue) {
  const text = String(textValue ?? "");
  if (/\bFanfare\s*:/i.test(text)) return text.replace(/\bFanfare\s*:/i, match => `${match} ${GAP_HOOK} `);
  return `${GAP_HOOK}${text ? ` ${text}` : ""}`.trim();
}

function createStats() {
  const pair = () => [0, 0];
  return {
    damageDealt: pair(), cardsPlayed: pair(), attacks: pair(), draws: pair(), unsupportedEffects: pair(),
    evolutions: pair(), superEvolutions: pair(), healing: pair(), followersLost: pair(), cardsGenerated: pair(),
    cardsBurned: pair(), ppSpent: pair(), ppWasted: pair(), spellsPlayed: pair(), lastWordsTriggered: pair(), strikeTriggered: pair()
  };
}

function makePlayer(name, deck, strategy, cardMap, rng) {
  const player = {
    name, strategy: normStrategy(strategy), hp: 20, maxHp: 20, maxPp: 0, pp: 0, ep: 2, sep: 2,
    shadows: 0, rally: 0, earthSigils: 0, faith: 0, faithActive: false, faithEnhanceBuffs: 0, crests: [], bonusPpAvailable: false, bonusPpUses: 0,
    leaderDamageCap: null, leaderDamageCapUntilOpponentTurnEnd: false,
    goingFirst: false, goingSecond: false, personalTurn: 0, cardsPlayedThisTurn: 0, spellsPlayedThisTurn: 0,
    evolutionsThisMatch: 0, evolutionActionUsed: false, nextSerial: 0, deck: [], hand: [], board: [], cemetery: [],
    banished: [], destroyedFollowers: [], deckOut: false, isActive: false
  };
  // [[battle-leader-damage-guard-install]]
  installLeaderDamageGuard(player);
  for (const [id, qty] of normalizeDeck(deck)) {
    const card = cardMap.get(Number(id));
    if (!card) continue;
    for (let index = 0; index < qty; index += 1) player.deck.push(instance(player, card));
  }
  // [[battle-faith-initialization]]
  player.faithActive = player.deck.some(item => norm(item.card?.name) === "yidmetra, eld sword");
  shuffle(player.deck, rng);
  return player;
}

// [[battle-leader-damage-guard]]
function installLeaderDamageGuard(player) {
  let value = Number(player.hp) || 0;
  Object.defineProperty(player, "hp", {
    enumerable: true,
    configurable: true,
    get() { return value; },
    set(nextValue) {
      const next = Number(nextValue);
      if (!Number.isFinite(next)) return;
      if (next < value && Number.isFinite(player.leaderDamageCap)) {
        const requestedLoss = value - next;
        value -= Math.min(requestedLoss, Math.max(0, Number(player.leaderDamageCap) || 0));
        return;
      }
      value = next;
    }
  });
}

function instance(player, card) {
  return {
    uid: `${player.name}-${player.nextSerial++}`,
    card,
    spellboost: 0,
    costDelta: 0,
    attackBonus: 0,
    defenseBonus: 0,
    skyboundEvolutions: 0,
    x: initialX(card)
  };
}

function initialX(card) {
  const match = String(card?.text ?? "").match(/X starts at\s*(-?\d+)/i);
  return match ? Number(match[1]) : 0;
}

function recordHandEvolution(player) {
  for (const item of player.hand ?? []) item.skyboundEvolutions = (Number(item.skyboundEvolutions) || 0) + 1;
}

function skyboundCountForInstance(ctx) {
  return (Number(ctx.player?.personalTurn) || 0) + (Number(ctx.instance?.skyboundEvolutions) || 0);
}

export function inspectPlayableModes(card, { pp = 0, boardSize = 0, spellboost = 0, costDelta = 0 } = {}) {
  const inst = {
    uid: "inspect-mode",
    card,
    spellboost: Number(spellboost) || 0,
    costDelta: Number(costDelta) || 0,
    attackBonus: 0,
    defenseBonus: 0,
    skyboundEvolutions: 0,
    x: initialX(card)
  };
  const player = {
    pp: Math.max(0, Number(pp) || 0),
    board: Array.from({ length: Math.max(0, Number(boardSize) || 0) }, (_, index) => ({ uid: `inspect-${index}`, type: "Follower" }))
  };
  return modes(inst, player).map(mode => ({ kind: mode.kind, cost: mode.cost, modeIndex: mode.modeIndex ?? 0 }));
}

function normalizeDeck(deck) {
  if (deck instanceof Map) return [...deck.entries()].map(([id, qty]) => [Number(id), Number(qty)]);
  if (!Array.isArray(deck)) return [];
  return deck.map(entry => Array.isArray(entry)
    ? [Number(entry[0]), Number(entry[1])]
    : [Number(entry.cardId ?? entry.id), Number(entry.qty ?? entry.quantity ?? 1)])
    .filter(([id, qty]) => Number.isFinite(id) && qty > 0);
}

function normStrategy(strategy) {
  return {
    style: strategy?.style ?? "midrange",
    label: strategy?.label ?? "Baseline",
    mulliganMaxCost: Number(strategy?.mulliganMaxCost ?? 3),
    faceBias: clamp(Number(strategy?.faceBias ?? .5), 0, 1),
    tradeBias: clamp(Number(strategy?.tradeBias ?? .5), 0, 1),
    priorities: Array.isArray(strategy?.priorities) ? strategy.priorities : []
  };
}

function mulligan(player, rng, stats, index, frames, players, record) {
  const out = player.hand.filter(item => shouldMulligan(item, player));
  if (!out.length) return;
  const ids = new Set(out.map(item => item.uid));
  player.hand = player.hand.filter(item => !ids.has(item.uid));
  const replacements = [];
  while (replacements.length < out.length && player.deck.length) replacements.push(player.deck.shift());
  player.hand.push(...replacements);
  player.deck.push(...out);
  shuffle(player.deck, rng);
  snap(frames, players, { round: 0, active: index, phase: "mulligan", action: `${player.name} redraws ${out.length} opening card${out.length === 1 ? "" : "s"}.` }, stats, record);
}

function shouldMulligan(item, player) {
  const card = item.card;
  const cost = Math.max(0, Number(card.cost) || 0);
  const text = norm(card.text);
  const style = String(player.strategy?.style ?? "midrange");
  const maxCost = Math.max(1, Number(player.strategy?.mulliganMaxCost ?? 3));

  if (style === "aggro") {
    if (cost <= 2) return false;
    if (cost >= 4) return true;
  }
  if ((style === "buff-tempo" || style === "puppetry-tempo") && cost <= 2) return false;
  if (style === "ramp" && /maximum play points/.test(text) && cost <= 4) return false;
  if (style === "spell-combo" && cost <= 3 && (card.type === "Spell" || /draw|spellboost/.test(text))) return false;
  if ((style === "ward-control" || style === "control") && cost <= 3 && (has(card, "Ward") || /draw|restore .*leader/.test(text))) return false;

  if (cost > maxCost + 1) return true;
  if (cost > maxCost && !/draw|maximum play points/.test(text)) return true;
  return false;
}

function drawCards(player, amount, stats, index) {
  let drawn = 0;
  for (let i = 0; i < amount; i += 1) {
    if (!player.deck.length) { player.deckOut = true; break; }
    const item = player.deck.shift();
    stats.draws[index] += 1;
    drawn += 1;
    if (player.hand.length >= 9) {
      toCemetery(player, item, false);
      stats.cardsBurned[index] += 1;
    } else player.hand.push(item);
  }
  return drawn;
}

// [[battle-ai-v1-extra-pp]]
// [[battle-ai-v1-1-extra-pp-profile]]
function useBonusPpIfUseful(player, opponent) {
  if (!player.bonusPpAvailable) return false;

  const current = bestImmediateTurnAction(player, opponent);
  const currentPp = player.pp;
  const currentSpend = estimateTurnSpend(player, currentPp);

  player.pp = currentPp + 1;
  const boosted = bestImmediateTurnAction(player, opponent);
  const boostedSpend = estimateTurnSpend(player, currentPp + 1);
  player.pp = currentPp;

  if (!boosted) return false;

  const style = String(player.strategy?.style ?? "midrange");
  const control = style === "ward-control" || style === "control";
  const tempo = style === "puppetry-tempo" || style === "buff-tempo";
  const aggro = style === "aggro";
  const currentScore = Number(current?.score ?? -Infinity);
  const boostedScore = Number(boosted.score ?? -Infinity);
  const improvement = boostedScore - currentScore;
  const curveUpgrade = boostedSpend > currentSpend;
  const firstChargeDeadline = player.personalTurn === 5 && player.bonusPpUses === 0;
  const laterCharge = player.personalTurn >= 6 && player.bonusPpUses >= 1;
  const enemyBoard = opponent.board.filter(unit => unit.type === "Follower");

  let threshold = 1.5;
  if (aggro) threshold = 1.0;
  else if (tempo) threshold = 1.65;
  else if (style === "spell-combo") threshold = 1.75;
  else if (style === "ramp") threshold = 1.25;
  else if (control) threshold = 3.0;

  // The second charge is strategically scarcer: tempo/control decks should not
  // fire it just because a slightly more expensive card became available.
  if (laterCharge) {
    if (tempo) threshold += 0.75;
    if (control) threshold += 1.5;
  }

  const clearUpgrade = !current || improvement >= threshold;
  const tacticalPressure = enemyBoard.length > 0 && improvement >= (control ? 2.5 : tempo ? 1.25 : 0.75);
  const lethalPressure = opponent.hp <= 8 && improvement > 0;
  const deadlineSpend = firstChargeDeadline && curveUpgrade && (!control || improvement >= -0.25);

  const shouldUse = clearUpgrade || tacticalPressure || lethalPressure || deadlineSpend;
  if (!shouldUse) return false;

  player.pp = currentPp + 1;
  player.bonusPpAvailable = false;
  player.bonusPpUses += 1;
  return true;
}

function bestImmediateTurnAction(player, opponent) {
  const play = bestPlay(player, opponent);
  const engage = bestEngage(player, opponent);
  if (!engage) return play;
  if (!play) return engage;
  return engage.score > play.score ? engage : play;
}


// [[battle-ai-v2-sequencing]]
function runTurnAi({ player, opponent, playerIndex, enemyIndex, stats, frames, players, round, rng, map, record }) {
  let safety = 0;
  let setupAttempts = 0;

  while (safety++ < MAX_ACTIONS) {
    // Never develop past a lethal already available on board.
    if (hasCollectiveBoardLethal(player, opponent)) {
      attackPhase(player, opponent, playerIndex, enemyIndex, stats, frames, players, round, rng, map, record);
      if (player.hp <= 0 || opponent.hp <= 0) return;
    }

    // High-impact evolution effects should resolve before committing the rest
    // of the turn, especially board clears, draws and summons.
    if (!player.evolutionActionUsed) {
      const earlyEvo = maybeEvolve(player, opponent, playerIndex, enemyIndex, stats, rng, map, { phase: "pre-development" });
      if (earlyEvo) {
        snap(frames, players, { round, active: playerIndex, phase: earlyEvo.super ? "super-evolve" : "evolve", action: earlyEvo.action }, stats, record);
        if (player.hp <= 0 || opponent.hp <= 0) return;
        continue;
      }
    }

    // If the field is full but a permanent card is otherwise playable, allow
    // a profitable sacrificial trade before development to open a board slot.
    if (hasBlockedBoardDevelopment(player) && setupAttempts < 2) {
      const attacksBefore = Number(stats.attacks?.[playerIndex]) || 0;
      const boardBefore = player.board.length;
      attackPhase(player, opponent, playerIndex, enemyIndex, stats, frames, players, round, rng, map, record, { setupOnly: true });
      if (player.hp <= 0 || opponent.hp <= 0) return;
      const attacked = (Number(stats.attacks?.[playerIndex]) || 0) > attacksBefore;
      if (attacked) {
        setupAttempts += 1;
        if (player.board.length < boardBefore || !hasBlockedBoardDevelopment(player)) continue;
      } else setupAttempts = 2;
    }

    const engage = bestEngage(player, opponent);
    const play = bestPlay(player, opponent);
    if (!engage && !play) break;

    if (engage && (!play || engage.score > play.score + .5)) {
      const result = resolveEngage(engage.unit, player, opponent, playerIndex, enemyIndex, stats, rng, map);
      snap(frames, players, { round, active: playerIndex, phase: "play", action: compact(`${player.name} engages ${engage.unit.name}${engage.cost ? ` (${engage.cost} PP)` : ""}.`, result.actions) }, stats, record);
    } else {
      const result = playCard(play.instance, play.mode, player, opponent, playerIndex, enemyIndex, stats, rng, map);
      snap(frames, players, { round, active: playerIndex, phase: "play", action: compact(`${player.name} plays ${play.instance.card.name} (${play.mode.cost} PP${play.mode.kind !== "base" ? ` · ${cap(play.mode.kind)}` : ""}).`, result.actions) }, stats, record);
    }
    if (player.hp <= 0 || opponent.hp <= 0) return;
  }

  const evo = maybeEvolve(player, opponent, playerIndex, enemyIndex, stats, rng, map, { phase: "post-development" });
  if (evo) snap(frames, players, { round, active: playerIndex, phase: evo.super ? "super-evolve" : "evolve", action: evo.action }, stats, record);
  if (player.hp <= 0 || opponent.hp <= 0) return;

  attackPhase(player, opponent, playerIndex, enemyIndex, stats, frames, players, round, rng, map, record);
}

function hasBlockedBoardDevelopment(player) {
  if (player.board.length < 5) return false;
  const pp = Math.max(0, Number(player.pp) || 0);
  return player.hand.some(item => {
    if (item.card.type === "Spell") return false;
    if (costOf(item) <= pp) return true;
    const text = String(item.card.text ?? "");
    return [...text.matchAll(/Enhance\s*\(?\s*(\d+)\s*\)?\s*:/gi)].some(match => Number(match[1]) <= pp);
  });
}

function estimateTurnSpend(player, budget) {
  const previousPp = player.pp;
  player.pp = Math.max(0, Number(budget) || 0);
  const options = player.hand.map(item => {
    const available = modes(item, player);
    if (!available.length) return [];
    return [...new Set(available.map(mode => Number(mode.cost) || 0))].filter(cost => cost <= player.pp);
  });
  player.pp = previousPp;

  // Small 0/1 knapsack over hand cards. This intentionally estimates PP usage,
  // not tactical value; bestImmediateTurnAction handles tactical quality.
  const reachable = new Set([0]);
  for (const costs of options) {
    const before = [...reachable];
    for (const spent of before) {
      for (const cost of costs) {
        const total = spent + cost;
        if (total <= budget) reachable.add(total);
      }
    }
  }
  return Math.max(...reachable);
}

function getModesForHand(player) {
  const out = [];
  for (const item of player.hand) for (const mode of modes(item, player)) out.push({ instance: item, mode });
  return out;
}

function modes(inst, player) {
  const card = inst.card;
  const text = String(card.text ?? "");
  const base = costOf(inst);
  const out = [];
  const canUseFieldSlot = card.type === "Spell" || player.board.length < 5;
  const enhance = [...text.matchAll(/Enhance\s*\(?\s*(\d+)\s*\)?\s*:/gi)]
    .map(match => Number(match[1]))
    .filter(cost => cost <= player.pp)
    .sort((a,b)=>b-a);
  if (enhance.length) {
    if (!canUseFieldSlot) return out;
    const cost = enhance[0];
    for (const choice of expandModes(section(text, `enhance ${cost}`))) out.push({ kind: choice.i ? "mode" : "enhance", cost, text: choice.text, modeIndex: choice.i, scoreBonus: 5, enhanced: true });
    return out;
  }

  // Accelerate and Crystallize are fallback play modes: they are available only
  // when the card itself cannot be paid at its current effective cost.
  if (base <= player.pp) {
    if (canUseFieldSlot) {
      for (const choice of expandModes(baseText(text))) out.push({ kind: choice.i ? "mode" : "base", cost: base, text: choice.text, modeIndex: choice.i, scoreBonus: 0 });
    }
    return out;
  }

  const crystallizeCosts = [...text.matchAll(/Crystallize\s*\(?\s*(\d+)\s*\)?\s*:?/gi)]
    .map(match => Number(match[1]))
    .filter(cost => cost <= player.pp);
  const accelerateCosts = [...text.matchAll(/Accelerate\s*\(?\s*(\d+)\s*\)?\s*:/gi)]
    .map(match => Number(match[1]))
    .filter(cost => cost <= player.pp);
  const highestAlternativeCost = Math.max(-1, ...crystallizeCosts, ...accelerateCosts);
  if (highestAlternativeCost < 0) return out;

  if (player.board.length < 5 && crystallizeCosts.includes(highestAlternativeCost)) {
    out.push({ kind: "crystallize", cost: highestAlternativeCost, text: crystallizeText(text, highestAlternativeCost), modeIndex: 0, scoreBonus: 5 });
  }
  if (accelerateCosts.includes(highestAlternativeCost)) {
    for (const choice of expandModes(section(text, `accelerate ${highestAlternativeCost}`))) {
      out.push({ kind: "accelerate", cost: highestAlternativeCost, text: choice.text, modeIndex: choice.i, scoreBonus: 4 });
    }
  }
  return out;
}

function costOf(inst) {
  let cost = (Number(inst.card.cost) || 0) + (Number(inst.costDelta) || 0);
  const text = norm(inst.card.text);
  const reduction = Number(text.match(/(?:on )?spellboost\s*:\s*(?:subtract|reduce)(?: the cost of this card by)?\s*(\d+)/i)?.[1] ?? 0);
  if (reduction) cost -= reduction * (Number(inst.spellboost) || 0);
  else if (/(?:on )?spellboost\s*:\s*subtract 1 from this card'?s cost/.test(text)) cost -= Number(inst.spellboost) || 0;
  return Math.max(0, cost);
}

function expandModes(text) {
  const choices = [...String(text).matchAll(/(?:^|\s)(\d+)\.\s*/g)];
  if (!/select a mode/i.test(text) || !choices.length) return [{ i: 0, text }];
  return choices.map((match, index) => ({
    i: Number(match[1]),
    text: String(text).slice(match.index + match[0].length, choices[index + 1]?.index ?? String(text).length).split(/\b(?:Evolve|Super-Evolve|Last Words|Strike|Engage)\s*:/i)[0].trim()
  }));
}

function baseText(text) {
  const fanfare = section(text, "fanfare");
  if (fanfare) return fanfare;
  const index = String(text).search(/\b(?:Last Words|Strike|Clash|Evolve|Super-Evolve|Enhance|Accelerate|Crystallize|Engage|On Spellboost|At the start of your turn|At the end of your turn)\s*\(?\s*\d*\s*\)?\s*:/i);
  return index < 0 ? String(text) : String(text).slice(0, index).trim();
}

function crystallizeText(textValue, cost) {
  const text = String(textValue ?? "");
  const regex = new RegExp(`Crystallize\\s*\\(?\\s*${cost}\\s*\\)?\\s*:`, "i");
  const match = regex.exec(text);
  if (!match) return "";
  const tail = text.slice(match.index + match[0].length);
  const next = tail.search(/\b(?:Fanfare|Evolve|Super-Evolve|Enhance\s*\(?\s*\d+\s*\)?|Accelerate\s*\(?\s*\d+\s*\)?|Engage|On Spellboost|At the start of your turn|At the end of your turn)\s*:/i);
  return (next < 0 ? tail : tail.slice(0, next)).trim();
}

function section(textValue, label) {
  const text = String(textValue);
  const target = norm(label).replace(/[()]/g, "");
  const regex = /(Last Words|On Spellboost|Super-Evolve|Evolve|Strike|Clash|Fanfare|At the start of your turn|At the end of your turn|Enhance\s*\(?\s*\d+\s*\)?|Accelerate\s*\(?\s*\d+\s*\)?|Crystallize\s*\(?\s*\d+\s*\)?|Engage\s*\(?\s*\d*\s*\)?)\s*:/gi;
  const markers = [];
  let match;
  while ((match = regex.exec(text))) markers.push({ label: norm(match[1]).replace(/[()]/g, ""), start: match.index, end: regex.lastIndex });
  const hit = markers.find(marker => marker.label === target);
  if (!hit) return "";
  const next = markers.find(marker => marker.start > hit.start);
  return text.slice(hit.end, next?.start ?? text.length).trim();
}

function bestPlay(player, opponent) {
  return getModesForHand(player).map(item => ({ ...item, score: scorePlay(item, player, opponent) })).sort((a,b)=>b.score-a.score || b.mode.cost-a.mode.cost)[0] ?? null;
}

function scorePlay(item, player, opponent) {
  const card = item.instance.card;
  const text = norm(item.mode.text || card.text);
  const cost = item.mode.cost;
  const style = String(player.strategy?.style ?? "midrange");
  const foes = opponent.board.filter(unit => unit.type === "Follower");
  const boardSlots = Math.max(0, 5 - player.board.length);
  const handAfterPlay = Math.max(0, player.hand.length - 1);
  let score = 1 + cost * 1.15 + item.mode.scoreBonus;

  if (card.type === "Follower" && !["accelerate","crystallize"].includes(item.mode.kind)) score += 2.2;
  if (item.mode.kind === "crystallize") score += player.personalTurn <= 3 ? 3 : -.5;

  if (/draw/.test(text)) {
    if (handAfterPlay >= 8) score -= 5;
    else if (handAfterPlay <= 4) score += 5;
    else score += 2;
  }

  if (/destroy|banish|damage to .*enemy follower/.test(text)) {
    score += foes.length ? 4 + Math.min(7, strongestFollowerThreat(foes) * .22) : -5;
  }
  if (/return .*enemy follower/.test(text)) score += foes.length ? 4 : -4;

  if (/enemy leader/.test(text) || has(card, "Storm")) score += opponent.hp <= 8 ? 10 : opponent.hp <= 12 ? 6 : 2;
  if (/restore .*leader/.test(text)) score += player.hp <= 8 ? 9 : player.hp <= 13 ? 5 : player.hp < player.maxHp ? 1 : -3;
  if (/maximum play points/.test(text)) score += style === "ramp" && player.maxPp < 7 ? 13 : player.maxPp < 5 ? 4 : 0;

  if (/summon/.test(text)) score += boardSlots >= 2 ? 3 : boardSlots === 1 ? .5 : -6;
  if (has(card, "Ward")) score += (style === "ward-control" || style === "control") ? (player.hp <= 10 ? 4 : 2) : .5;

  if (style === "aggro") {
    if (cost <= 3) score += 3;
    if (has(card, "Storm") || /enemy leader/.test(text)) score += 2;
  }
  if (style === "buff-tempo" && /give .*\+\d+\/\+\d+|buff/.test(text)) score += 3;
  if (style === "puppetry-tempo" && /puppet|puppetry|summon/.test(text)) score += 2.5;
  if (style === "spell-combo" && (card.type === "Spell" || item.mode.kind === "accelerate")) score += 5;
  if (/select a mode/i.test(card.text)) score += 1.5;

  score += continuationValue(item, player);
  if (cost === player.pp) score += .6;
  return score;
}

function continuationValue(item, player) {
  const remaining = Math.max(0, (Number(player.pp) || 0) - (Number(item.mode.cost) || 0));
  if (!remaining) return 0;
  const previousPp = player.pp;
  player.pp = remaining;
  let followUp = false;
  try {
    followUp = player.hand.some(other => other.uid !== item.instance.uid && modes(other, player).length > 0);
  } finally {
    player.pp = previousPp;
  }
  if (followUp) return 1.5;
  return remaining >= 2 ? -.75 : -.15;
}

function strongestFollowerThreat(foes) {
  return foes.reduce((best, unit) => Math.max(best,
    Math.max(0, Number(unit.attack) || 0) * 2.5
      + Math.max(0, Number(unit.defense) || 0)
      + (hasU(unit, "Ward") ? 2 : 0)
      + (hasU(unit, "Bane") ? 2 : 0)
  ), 0);
}

function playCard(inst, mode, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap) {
  player.hand = player.hand.filter(item => item.uid !== inst.uid);
  player.pp -= mode.cost;
  player.cardsPlayedThisTurn += 1;
  stats.cardsPlayed[playerIndex] += 1;
  stats.ppSpent[playerIndex] += mode.cost;
  const card = inst.card;
  const actions = [];
  let source = null;

  if (mode.kind === "crystallize") {
    source = boardAmulet(inst, mode.text, true);
    player.board.push(source);
  } else if (mode.kind !== "accelerate") {
    if (card.type === "Follower") {
      source = boardFollower(inst);
      player.board.push(source);
      player.rally += 1;
      actions.push(...applyEntryEvents({ player, opponent, playerIndex, enemyIndex, stats, rng, cardMap }, source));
    } else if (card.type === "Amulet") {
      source = boardAmulet(inst);
      player.board.push(source);
      if ((card.traits ?? []).includes("Earth Sigil")) player.earthSigils += 1;
    }
  }

  // [[battle-enhance-play-event]]
  if (mode.enhanced || mode.kind === "enhance") {
    actions.push(...applyEnhancedCardPlayed({ card, instance: inst, sourceUnit: source, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap }));
  }

  if (mode.kind !== "crystallize") {
    const result = resolveText(mode.text || card.text, { card, instance: inst, sourceUnit: source, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap });
    actions.push(...result.actions);
  }

  if (card.type === "Spell" || mode.kind === "accelerate") {
    stats.spellsPlayed[playerIndex] += 1;
    player.spellsPlayedThisTurn += 1;
    toCemetery(player, inst, true);
    spellboostHand(player, 1, cardMap, actions);
    const beforeHp = player.hp;
    actions.push(...applySpellPlayedEffects(effectContext({ card, instance: inst, sourceUnit: source, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap })));
    if (player.hp > beforeHp) actions.push(...afterLeaderHeal(player, player.hp - beforeHp, stats, playerIndex));
  }

  actions.push(...cleanup(player, opponent, playerIndex, enemyIndex, stats, rng, cardMap), ...cleanup(opponent, player, enemyIndex, playerIndex, stats, rng, cardMap));
  return { actions };
}

// [[battle-enhance-play-helper]]
function applyEnhancedCardPlayed(ctx) {
  const actions = [];
  const player = ctx.player;
  if (player.faithActive) {
    player.faith += 1;
    actions.push(`Faith +1 (${player.faith})`);
  }
  const stacks = Math.max(0, Number(player.faithEnhanceBuffs) || 0);
  if (!stacks) return actions;
  const context = effectContext(ctx);
  for (const unit of player.board.filter(unit => unit.type === "Follower")) {
    const before = { attack: unit.attack, defense: unit.defense };
    context.buffUnit(unit, stacks, stacks);
    actions.push(`Faith: +${stacks}/+${stacks} ${unit.name}`);
    if ((Number(unit.attack) || 0) <= before.attack && (Number(unit.defense) || 0) <= before.defense) continue;
  }
  return uniq(actions);
}

function boardFollower(inst) {
  const card = inst.card;
  const attack = (Number(card.attack) || 0) + (Number(inst.attackBonus) || 0);
  const defense = (Number(card.defense) || 0) + (Number(inst.defenseBonus) || 0);
  const keywords = [...(card.keywords ?? [])];
  const baseMaxAttacks = Number(String(card.text ?? "").match(/can attack (\d+) times per turn/i)?.[1] ?? 1);
  return {
    uid: inst.uid, cardId: Number(card.id), card, name: card.name, image: card.image, type: "Follower",
    attack, defense, maxDefense: defense, keywords,
    barrier: has(card, "Barrier") ? 1 : 0, ambush: has(card, "Ambush"), aura: has(card, "Aura"), intimidate: has(card, "Intimidate"),
    summonedThisTurn: true, canAttackLeader: has(card, "Storm"), canAttackFollower: has(card, "Storm") || has(card, "Rush"),
    attacked: false, attacksMade: 0, baseMaxAttacks, maxAttacks: baseMaxAttacks,
    evolved: false, superEvolved: false, reactedThisTurn: false, tempAttackPenalty: 0
  };
}

function boardAmulet(inst, overrideText = null, crystallized = false) {
  const card = inst.card;
  const text = overrideText ?? card.text;
  return {
    uid: inst.uid, cardId: Number(card.id), card, name: card.name, image: card.image, type: "Amulet",
    attack: 0, defense: 0, maxDefense: 0, countdown: getCountdown({ ...card, text }), keywords: [...(card.keywords ?? [])],
    engagedThisTurn: false, summonedThisTurn: true, attacked: true, evolved: false, superEvolved: false,
    overrideText: overrideText ?? null, crystallized
  };
}

function resolveText(raw, ctx) {
  let text = String(raw ?? "").trim();
  const actions = [];
  if (!text) return { actions, applied: false, unresolved: false };

  // [[battle-gildaria-rally]]
  if (norm(ctx.card?.name) === "gildaria, anathema of attunement") {
    const gated = /Rally\s*\(?\s*20\s*\)?\s*-\s*Gain Crest\s*:\s*Gildaria, Anathema of Attunement\.\s*Evolve this follower\.?/i;
    if (gated.test(text)) {
      if (ctx.player.rally >= 20) {
        if (gainCrest(ctx.player, "Gildaria, Anathema of Attunement", ctx.card)) actions.push("Gildaria Crest");
        if (ctx.sourceUnit) evolveUnitByAbility(ctx, ctx.sourceUnit, actions);
      } else actions.push(`Rally ${ctx.player.rally}/20`);
      text = text.replace(gated, " ");
    }
  }

  const necromancy = text.match(/Necromancy\s*\(?\s*(\d+)\s*\)?\s*:\s*(.*)$/i);
  if (necromancy) {
    if (ctx.player.shadows < Number(necromancy[1])) return { actions: [`Necromancy ${necromancy[1]} unavailable`], applied: false, unresolved: false };
    ctx.player.shadows -= Number(necromancy[1]);
    actions.push(`Necromancy ${necromancy[1]}`);
    text = necromancy[2];
  }
  const rally = text.match(/Rally\s*\(?\s*(\d+)\s*\)?\s*:\s*(.*)$/i);
  if (rally) {
    if (ctx.player.rally < Number(rally[1])) return { actions: [`Rally ${ctx.player.rally}/${rally[1]}`], applied: false, unresolved: false };
    actions.push(`Rally ${rally[1]}`);
    text = rally[2];
  }
  const combo = text.match(/Combo\s*\(?\s*(\d+)\s*\)?\s*:\s*(.*)$/i);
  if (combo) {
    if (ctx.player.cardsPlayedThisTurn < Number(combo[1])) return { actions: [`Combo ${ctx.player.cardsPlayedThisTurn}/${combo[1]}`], applied: false, unresolved: false };
    text = combo[2];
  }
  const superSkybound = text.match(/Super Skybound Art\s*\(?\s*(\d+)?\s*\)?\s*:\s*(.*)$/i);
  if (superSkybound) {
    const need = Number(superSkybound[1] ?? 15);
    if (skyboundCountForInstance(ctx) < need) return { actions: [], applied: false, unresolved: false };
    text = superSkybound[2];
    actions.push("Super Skybound Art");
  }
  const skybound = text.match(/Skybound Art\s*\(?\s*(\d+)?\s*\)?\s*:\s*(.*)$/i);
  if (skybound && !/Super Skybound Art/i.test(text)) {
    const need = Number(skybound[1] ?? 10);
    if (skyboundCountForInstance(ctx) < need) return { actions: [], applied: false, unresolved: false };
    text = skybound[2];
    actions.push("Skybound Art");
  }
  if (/if overflow is active/i.test(text) && ctx.player.maxPp < 7) text = text.replace(/if overflow is active[^.]*\.?/ig, "");
  else if (/if overflow is active/i.test(text)) text = text.replace(/if overflow is active[, ]*/ig, "");
  if (/Earth Rite\s*\(?\s*(\d+)?\s*\)?\s*:/i.test(text)) {
    const amount = Number(text.match(/Earth Rite\s*\(?\s*(\d+)?/i)?.[1] ?? 1);
    if (ctx.player.earthSigils < amount) return { actions: [`Earth Rite ${ctx.player.earthSigils}/${amount}`], applied: false, unresolved: false };
    ctx.player.earthSigils -= amount;
    text = text.replace(/Earth Rite\s*\(?\s*\d*\s*\)?\s*:/i, "");
    actions.push(`Earth Rite ${amount}`);
  }

  const x = ctx.instance?.x ?? 0;
  text = text.replace(/if X is at least\s*(\d+)\s*,\s*([^.]*)\.?/gi, (_, threshold, effect) => x >= Number(threshold) ? `${effect}.` : "");

  const doN = text.match(/Do this (\d+) times?\s*:\s*(?:["“](.*?)["”]|([^\n]+))/i);
  if (doN) {
    const repeated = (doN[2] ?? doN[3] ?? "").trim();
    for (let index = 0; index < Number(doN[1]); index += 1) {
      const result = resolveText(repeated, ctx);
      actions.push(...result.actions);
    }
    text = text.replace(doN[0], "");
  }

  for (const match of [...text.matchAll(/Spellboost your hand(?:\s+(\d+|one|two|three|four|five)\s+times?)?/gi)]) {
    const amount = word(match[1] ?? "one") || 1;
    spellboostHand(ctx.player, amount, ctx.cardMap, actions);
    text = text.replace(match[0], "");
    actions.push(`Spellboost ×${amount}`);
  }
  for (const match of [...text.matchAll(/Reanimate\s*\(?\s*(\d+)\s*\)?/gi)]) {
    const unit = reanimate(ctx.player, Number(match[1]), ctx.playerIndex, ctx.cardMap, ctx.rng);
    if (unit) {
      actions.push(`Reanimate ${unit.name}`);
      actions.push(...applyEntryEvents(ctx, unit));
    }
    text = text.replace(match[0], "");
  }
  if (/return your hand to (?:the )?deck/i.test(text)) {
    const count = ctx.player.hand.length;
    ctx.player.deck.push(...ctx.player.hand);
    ctx.player.hand = [];
    shuffle(ctx.player.deck, ctx.rng);
    actions.push(`return ${count} hand cards to deck`);
    text = text.replace(/return your hand to (?:the )?deck\.?/i, "");
  }
  if (/recover all (?:of )?your play points/i.test(text)) {
    ctx.player.pp = ctx.player.maxPp;
    actions.push("recover all PP");
    text = text.replace(/recover all (?:of )?your play points\.?/i, "");
  }

  const opponentCrest = text.match(/Give your opponent Crest\s*:\s*([^.;]+)/i);
  if (opponentCrest) {
    if (gainCrest(ctx.opponent, opponentCrest[1].trim(), ctx.card)) actions.push(`Opponent Crest: ${opponentCrest[1].trim()}`);
    text = text.replace(opponentCrest[0], "");
  }
  const crest = text.match(/Gain Crest\s*:\s*([^.;]+)/i);
  if (crest) {
    if (gainCrest(ctx.player, crest[1].trim(), ctx.card)) actions.push(`Crest: ${crest[1].trim()}`);
    text = text.replace(crest[0], "");
  }

  if (norm(ctx.card?.name) === "verdilia & castelle, sisters") {
    const pattern = /Summon a random follower that costs 2 or less from your deck and super-evolve it\.?/i;
    if (pattern.test(text)) {
      const eligible = ctx.player.deck.filter(item => item.card.type === "Follower" && Number(item.card.cost) <= 2);
      if (eligible.length && ctx.player.board.length < 5) {
        const chosen = eligible[Math.floor(ctx.rng() * eligible.length)];
        ctx.player.deck = ctx.player.deck.filter(item => item.uid !== chosen.uid);
        const unit = boardFollower(chosen);
        ctx.player.board.push(unit);
        ctx.player.rally += 1;
        actions.push(`summon ${unit.name}`);
        actions.push(...applyEntryEvents(ctx, unit));
        superEvolveUnitByAbility(ctx, unit, actions);
      }
      text = text.replace(pattern, "");
    }
  }

  const grant = text.match(/Give (?:this follower|it) (Ward|Rush|Storm|Bane|Drain|Barrier|Aura|Ambush|Intimidate)/i);
  if (grant && ctx.sourceUnit) {
    giveKeyword(ctx.sourceUnit, grant[1]);
    actions.push(grant[1]);
    text = text.replace(grant[0], "");
  }

  for (const match of [...text.matchAll(/deal (\d+) damage to (a random|random|an|a|the) enemy follower/gi)]) {
    const random = /random/i.test(match[2]);
    const target = chooseTarget(ctx.opponent.board, !random);
    if (target) {
      damageUnit(target, Number(match[1]), ctx.opponent, ctx.player, ctx, actions);
      actions.push(`${match[1]} to ${target.name}`);
    }
    text = text.replace(match[0], "");
  }
  for (const match of [...text.matchAll(/deal (\d+) damage to (?:all|each) enemy followers?/gi)]) {
    for (const unit of ctx.opponent.board.filter(unit => unit.type === "Follower")) damageUnit(unit, Number(match[1]), ctx.opponent, ctx.player, ctx, actions);
    actions.push(`${match[1]} to enemy board`);
    text = text.replace(match[0], "");
  }
  for (const match of [...text.matchAll(/deal (\d+) damage to a random enemy(?! follower)/gi)]) {
    const candidates = [{ leader: true }, ...ctx.opponent.board.filter(unit => unit.type === "Follower").map(unit => ({ unit }))];
    if (candidates.length) {
      const target = candidates[Math.floor(ctx.rng() * candidates.length)];
      if (target.leader) {
        const dealt = damageLeader(ctx.opponent, Number(match[1]));
        ctx.stats.damageDealt[ctx.playerIndex] += dealt;
        actions.push(`${dealt} to enemy leader`);
      } else {
        damageUnit(target.unit, Number(match[1]), ctx.opponent, ctx.player, ctx, actions);
        actions.push(`${match[1]} to ${target.unit.name}`);
      }
    }
    text = text.replace(match[0], "");
  }
  if (/destroy (?:an|a|the) enemy follower/i.test(text)) {
    const unit = chooseTarget(ctx.opponent.board, true);
    if (unit && destroyUnit(ctx.opponent, unit)) actions.push(`destroy ${unit.name}`);
    text = text.replace(/destroy (?:an|a|the) enemy follower\.?/i, "");
  }
  if (/destroy (?:a random|random) enemy follower/i.test(text)) {
    const unit = chooseTarget(ctx.opponent.board, false);
    if (unit && destroyUnit(ctx.opponent, unit)) actions.push(`destroy ${unit.name}`);
    text = text.replace(/destroy (?:a random|random) enemy follower\.?/i, "");
  }
  if (/banish (?:an|a|the) enemy follower/i.test(text)) {
    const unit = chooseTarget(ctx.opponent.board, true);
    if (unit) { banish(ctx.opponent, unit); actions.push(`banish ${unit.name}`); }
    text = text.replace(/banish (?:an|a|the) enemy follower\.?/i, "");
  }
  if (/return (?:an|a|the) enemy follower to (?:its owner'?s|their) hand/i.test(text)) {
    const unit = chooseTarget(ctx.opponent.board, true);
    if (unit) { bounce(ctx.opponent, unit); actions.push(`return ${unit.name}`); }
    text = text.replace(/return (?:an|a|the) enemy follower to (?:its owner'?s|their) hand\.?/i, "");
  }
  const xDamage = text.match(/deal X damage to (?:an|a|the) enemy follower/i);
  if (xDamage) {
    const target = chooseTarget(ctx.opponent.board, true);
    if (target) { damageUnit(target, x, ctx.opponent, ctx.player, ctx, actions); actions.push(`${x} to ${target.name}`); }
    text = text.replace(xDamage[0], "");
  }
  const xAll = text.match(/deal X damage to all enemy followers/i);
  if (xAll) {
    for (const unit of ctx.opponent.board.filter(unit => unit.type === "Follower")) damageUnit(unit, x, ctx.opponent, ctx.player, ctx, actions);
    actions.push(`${x} to enemy board`);
    text = text.replace(xAll[0], "");
  }
  const split = text.match(/deal X damage split between all enemy followers/i);
  if (split) {
    let left = x;
    const targets = [...ctx.opponent.board.filter(unit => unit.type === "Follower")];
    while (left > 0 && targets.length) {
      const unit = targets[Math.floor(ctx.rng() * targets.length)];
      damageUnit(unit, 1, ctx.opponent, ctx.player, ctx, actions);
      left -= 1;
    }
    actions.push(`${x} split damage`);
    text = text.replace(split[0], "");
  }

  ctx.__sideActions = [];
  const context = effectContext(ctx);
  const beforeHp = ctx.player.hp;
  const core = executeGenericEffects(text, context);
  actions.push(...core.actions, ...ctx.__sideActions);
  if (ctx.player.hp > beforeHp) actions.push(...afterLeaderHeal(ctx.player, ctx.player.hp - beforeHp, ctx.stats, ctx.playerIndex));
  return { applied: actions.length > 0 || core.applied, actions: uniq(actions), unresolved: core.unresolved };
}

function effectContext(ctx) {
  return {
    card: ctx.card, instance: ctx.instance, sourceUnit: ctx.sourceUnit, player: ctx.player, opponent: ctx.opponent,
    playerIndex: ctx.playerIndex, enemyIndex: ctx.enemyIndex, stats: ctx.stats, rng: ctx.rng,
    recordHandEvolution: () => recordHandEvolution(ctx.player),
    draw: (player, amount, index) => drawCards(player, amount, ctx.stats, index),
    chooseEnemyFollower: board => chooseTarget(board, true),
    chooseAlliedFollower: (board, excluded) => board.filter(unit => unit.type === "Follower" && unit !== excluded).sort((a,b)=>b.attack+b.defense-a.attack-a.defense)[0] ?? excluded,
    chooseHandFollower: hand => hand.filter(item => item.card.type === "Follower").sort((a,b)=>(Number(b.card.cost)||0)-(Number(a.card.cost)||0))[0] ?? null,
    // [[battle-coverage-100-context]]
    gainCrest: (player, name, card) => gainCrest(player, name, card),
    isSuperEvolutionUnlocked: () => ctx.player.personalTurn >= (ctx.player.goingFirst ? 7 : 6),
    evolveRandomUnitByAbility: predicate => {
      const candidates = ctx.player.board.filter(unit => unit.type === "Follower" && !unit.evolved && !unit.superEvolved && (!predicate || predicate(unit)));
      if (!candidates.length) return null;
      const unit = candidates[Math.floor(ctx.rng() * candidates.length)];
      const sideActions = [];
      evolveUnitByAbility(ctx, unit, sideActions);
      if (sideActions.length) ctx.__sideActions?.push?.(...sideActions);
      return unit;
    },
    summonFromDeckDifferentNames: (limit, predicate) => summonFromDeckDifferentNames(ctx, limit, predicate),
    summonWithoutLastWords: card => summonWithoutLastWords(ctx, card),
    setLeaderDamageCap: (player, cap) => {
      player.leaderDamageCap = Math.max(0, Number(cap) || 0);
      player.leaderDamageCapUntilOpponentTurnEnd = true;
    },
    notifyLeaveField: (player, unit) => notifyFollowerLeavesField(player, unit),
    // [[battle-ability-evolve-context-v5]]
    evolveUnitByAbility: unit => {
      const sideActions = [];
      const evolved = evolveUnitByAbility(ctx, unit, sideActions);
      if (sideActions.length) ctx.__sideActions?.push?.(...sideActions);
      return evolved;
    },
    buffUnit: (unit, attack, defense) => {
      const before = { attack: Number(unit.attack) || 0, defense: Number(unit.defense) || 0 };
      unit.attack += Number(attack) || 0;
      unit.defense += Number(defense) || 0;
      unit.maxDefense += Number(defense) || 0;
      const beforeHp = ctx.player.hp;
      const extra = applyBuffedFollowerEffects(effectContextBare(ctx), unit, before);
      if (ctx.player.hp > beforeHp) afterLeaderHeal(ctx.player, ctx.player.hp - beforeHp, ctx.stats, ctx.playerIndex);
      if (extra?.length) ctx.__sideActions?.push?.(...extra);

      // [[battle-krulle-defense-reaction]]
      if ((Number(defense) || 0) < 0 && ctx.opponent.board.includes(unit) && ctx.player.isActive) {
        const krulle = ctx.player.board.find(source => source.type === "Follower" && norm(source.name) === "krulle, heir to unkilling");
        if (krulle && krulle.__defenseReactionTurn !== ctx.player.personalTurn) {
          krulle.__defenseReactionTurn = ctx.player.personalTurn;
          const healed = healPlayer(ctx.player, 1, ctx.stats, ctx.playerIndex);
          if (healed) ctx.__sideActions?.push?.(`Krulle: restore ${healed} leader defense`, ...afterLeaderHeal(ctx.player, healed, ctx.stats, ctx.playerIndex));
        }
      }
    },
    buffHand: (item, attack, defense) => {
      item.attackBonus = (Number(item.attackBonus) || 0) + (Number(attack) || 0);
      item.defenseBonus = (Number(item.defenseBonus) || 0) + (Number(defense) || 0);
    },
    relatedCards: card => related(card, ctx.cardMap),
    summon: (player, card, amount, index) => summonWithEvents(player, card, amount, index, ctx),
    addToHand: (player, card, amount, index) => addHand(player, card, amount, index, ctx.stats),
    cleanup: player => player === ctx.player
      ? cleanup(ctx.player, ctx.opponent, ctx.playerIndex, ctx.enemyIndex, ctx.stats, ctx.rng, ctx.cardMap)
      : cleanup(ctx.opponent, ctx.player, ctx.enemyIndex, ctx.playerIndex, ctx.stats, ctx.rng, ctx.cardMap),
    banish: (player, unit) => banish(player, unit),
    returnToHand: (player, unit) => bounce(player, unit)
  };
}

function effectContextBare(ctx) {
  return {
    player: ctx.player, opponent: ctx.opponent, playerIndex: ctx.playerIndex, enemyIndex: ctx.enemyIndex, stats: ctx.stats,
    buffUnit(unit, attack, defense) { unit.attack += attack; unit.defense += defense; unit.maxDefense += defense; }
  };
}

function spellboostHand(player, amount, cardMap, actions = []) {
  for (let count = 0; count < amount; count += 1) {
    for (const inst of player.hand) {
      inst.spellboost = (Number(inst.spellboost) || 0) + 1;
      const text = section(inst.card.text, "on spellboost");
      if (!text) continue;
      const xIncrease = Number(text.match(/Increase X by\s*(\d+)/i)?.[1] ?? 0);
      if (xIncrease) inst.x = (Number(inst.x) || 0) + xIncrease;
      const stat = text.match(/give this follower\s*\+(\d+)\s*\/\s*\+(\d+)/i);
      if (stat) {
        inst.attackBonus = (Number(inst.attackBonus) || 0) + Number(stat[1]);
        inst.defenseBonus = (Number(inst.defenseBonus) || 0) + Number(stat[2]);
      }
      const threshold = Number(text.match(/if X is at least\s*(\d+)/i)?.[1] ?? Infinity);
      if (inst.x >= threshold && /transform this card into/i.test(text)) {
        const name = text.match(/transform this card into (?:an?\s+)?(.+?)(?:\.|$)/i)?.[1]?.trim();
        const target = name ? findByName(cardMap, name) : null;
        if (target) inst.card = target;
      }
    }
  }
}

function reanimate(player, cost, index, cardMap, rng) {
  const pool = player.destroyedFollowers.filter(item => (Number(item.card.cost) || 0) <= cost);
  if (!pool.length || player.board.length >= 5) return null;
  const max = Math.max(...pool.map(item => Number(item.card.cost) || 0));
  const eligible = pool.filter(item => (Number(item.card.cost) || 0) === max);
  const source = eligible[Math.floor(rng() * eligible.length)];
  const inst = instance(player, source.card);
  const unit = boardFollower(inst);
  unit.keywords = uniq([...unit.keywords, "Departed"]);
  player.board.push(unit);
  player.rally += 1;
  return unit;
}

function related(card, map) {
  const ids = new Set([...(card?.relatedCards ?? []).map(Number), ...(card?.relations ?? []).map(relation => Number(relation.id))]);
  return [...ids].map(id => map.get(id)).filter(Boolean);
}

function findByName(map, name) {
  const target = norm(name);
  return [...map.values()].find(card => norm(card.name) === target) ?? null;
}

function summonRaw(player, card, amount) {
  const out = [];
  for (let index = 0; index < amount && player.board.length < 5; index += 1) {
    const inst = instance(player, card);
    if (card.type === "Follower") {
      const unit = boardFollower(inst);
      player.board.push(unit);
      player.rally += 1;
      out.push(unit);
    } else if (card.type === "Amulet") {
      const unit = boardAmulet(inst);
      player.board.push(unit);
      out.push(unit);
    } else break;
  }
  return out;
}

function summonWithEvents(player, card, amount, index, ctx) {
  const units = summonRaw(player, card, amount);
  const local = player === ctx.player
    ? ctx
    : { ...ctx, player, opponent: ctx.player, playerIndex: ctx.enemyIndex, enemyIndex: ctx.playerIndex };
  for (const unit of units) if (unit.type === "Follower") ctx.__sideActions?.push?.(...applyEntryEvents(local, unit));
  return units.length;
}

// [[battle-deck-summon-primitives]]
function summonFromDeckDifferentNames(ctx, limit, predicate) {
  const summoned = [];
  const usedNames = new Set();
  while (summoned.length < Number(limit) && ctx.player.board.length < 5) {
    const eligible = ctx.player.deck.filter(item => {
      if (item.card.type !== "Follower") return false;
      if (usedNames.has(norm(item.card.name))) return false;
      return !predicate || predicate(item.card);
    });
    if (!eligible.length) break;
    const chosen = eligible[Math.floor(ctx.rng() * eligible.length)];
    ctx.player.deck = ctx.player.deck.filter(item => item.uid !== chosen.uid);
    usedNames.add(norm(chosen.card.name));
    const unit = boardFollower(chosen);
    ctx.player.board.push(unit);
    ctx.player.rally += 1;
    summoned.push(unit);
    ctx.__sideActions?.push?.(`summon ${unit.name} from deck`, ...applyEntryEvents(ctx, unit));
  }
  return summoned;
}

function summonWithoutLastWords(ctx, card) {
  if (!card || ctx.player.board.length >= 5) return null;
  const inst = instance(ctx.player, card);
  const unit = boardFollower(inst);
  unit.overrideText = String(card.text ?? "")
    .replace(/Last Words\s*:\s*[\s\S]*?(?=(?:Super-Evolve|Evolve|Strike|Clash|Fanfare|Enhance|Accelerate|Engage|At the start of your turn|At the end of your turn)\s*:|$)/i, " ")
    .replace(/\s+/g, " ")
    .trim();
  ctx.player.board.push(unit);
  ctx.player.rally += 1;
  ctx.__sideActions?.push?.(`summon ${unit.name} without Last Words`, ...applyEntryEvents(ctx, unit));
  return unit;
}

function addHand(player, card, amount, index, stats) {
  let count = 0;
  for (let i = 0; i < amount; i += 1) {
    const item = instance(player, card);
    if (player.hand.length >= 9) {
      toCemetery(player, item, false);
      stats.cardsBurned[index] += 1;
    } else { player.hand.push(item); count += 1; }
  }
  return count;
}

function gainCrest(player, name, card) {
  if ((player.crests ?? []).some(crest => norm(crest.name) === norm(name))) return false;
  if ((player.crests ?? []).length >= 5) return false;
  player.crests.push({
    name,
    card,
    countdown: crestCountdown(name),
    gainedTurn: Number(player.personalTurn) || 0,
    __damageTriggerTurn: -1,
    __healTriggerTurn: -1
  });
  return true;
}

function crestCountdown(name) {
  const normalized = norm(name);
  if (normalized === "sandalphon, primarch successor") return 2;
  if (normalized === "lu woh, light personified") return 2;
  if (normalized === "krulle, heir to unkilling") return 2;
  if (normalized === "gildaria, anathema of attunement") return 1;
  return null;
}

function giveKeyword(unit, keyword) {
  if (!unit.keywords.includes(keyword)) unit.keywords.push(keyword);
  if (keyword === "Barrier") unit.barrier = 1;
  if (keyword === "Aura") unit.aura = true;
  if (keyword === "Ambush") unit.ambush = true;
  if (keyword === "Intimidate") unit.intimidate = true;
  if (keyword === "Storm") { unit.canAttackLeader = true; unit.canAttackFollower = true; }
  if (keyword === "Rush") unit.canAttackFollower = true;
}

function applyEntryEvents(ctx, unit) {
  if (!unit || unit.type !== "Follower") return [];
  const actions = [];
  const beforeHp = ctx.player.hp;
  actions.push(...applyEntryCrestEffects(effectContext(ctx), unit));
  if (ctx.player.hp > beforeHp) actions.push(...afterLeaderHeal(ctx.player, ctx.player.hp - beforeHp, ctx.stats, ctx.playerIndex));

  if ((unit.card?.traits ?? []).some(trait => norm(trait) === "marine") && hasCrest(ctx.player, "Neptune, Arbiter of Tides")) {
    const healed = healPlayer(ctx.player, 1, ctx.stats, ctx.playerIndex);
    actions.push(`Neptune Crest: restore ${healed} leader defense`);
    if (healed) actions.push(...afterLeaderHeal(ctx.player, healed, ctx.stats, ctx.playerIndex));
  }

  const selfEntry = String(unit.card?.text ?? "").match(/\bwhen this (?:card|follower) enters the field,\s*([^.]*)\.?/i);
  if (selfEntry) {
    const result = resolveText(selfEntry[1], { ...ctx, card: unit.card, sourceUnit: unit });
    actions.push(...result.actions.map(action => `${unit.name}: ${action}`));
  }
  return uniq(actions);
}

function applyFollowerDamagedEvents(unit, owner, opponent, ctx, actions) {
  reactDamage(unit, owner, opponent, ctx, actions);
  if (!owner.isActive || unit.defense <= 0) return;
  const crest = (owner.crests ?? []).find(item => norm(item.name) === "galmieux, ardor manifest");
  if (!crest || crest.__damageTriggerTurn === owner.personalTurn) return;
  const token = related(crest.card, ctx.cardMap).find(card => norm(card.name) === "fangs of ardent destruction") ?? findByName(ctx.cardMap, "Fangs of Ardent Destruction");
  if (!token) return;
  crest.__damageTriggerTurn = owner.personalTurn;
  const ownerIndex = owner === ctx.player ? ctx.playerIndex : ctx.enemyIndex;
  if (addHand(owner, token, 1, ownerIndex, ctx.stats)) {
    ctx.stats.cardsGenerated[ownerIndex] += 1;
    actions.push(`Galmieux Crest: add ${token.name}`);
  }
}

function afterLeaderHeal(player, healed, stats, playerIndex) {
  if (!healed || !player.isActive) return [];
  const crest = (player.crests ?? []).find(item => norm(item.name) === "burnite, anathema of ash");
  if (!crest || crest.__healTriggerTurn === player.personalTurn) return [];
  crest.__healTriggerTurn = player.personalTurn;
  player.hp -= 1;
  return ["Burnite Crest: 1 damage to your leader after healing"];
}

function turnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const actions = [];
  for (const unit of player.board) if (unit.type === "Follower") unit.reactedThisTurn = false;

  tickCrests(player, actions);
  if (hasCrest(player, "Burnite, Anathema of Ash")) {
    player.hp -= 2;
    actions.push("Burnite Crest: 2 damage to your leader");
  }

  for (const amulet of [...player.board].filter(unit => unit.type === "Amulet" && Number.isFinite(unit.countdown))) {
    amulet.countdown -= 1;
    actions.push(`${amulet.name} countdown ${Math.max(0, amulet.countdown)}`);
    if (amulet.countdown <= 0) actions.push(...destroyObject(player, opponent, amulet, playerIndex, enemyIndex, stats, rng, map, true));
  }

  invokeCards(player, opponent, playerIndex, enemyIndex, stats, rng, map, actions);
  for (const unit of [...player.board]) {
    const text = getUnitTriggeredText(unit, "turnStart");
    if (text) {
      const result = resolveText(text, { card: unit.card, sourceUnit: unit, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map });
      actions.push(...result.actions.map(action => `${unit.name}: ${action}`));
    }
  }
  actions.push(...cleanup(player, opponent, playerIndex, enemyIndex, stats, rng, map), ...cleanup(opponent, player, enemyIndex, playerIndex, stats, rng, map));
  return actions;
}

function tickCrests(player, actions) {
  const expired = new Set();
  for (const crest of player.crests ?? []) {
    if (!Number.isFinite(crest.countdown)) continue;
    if ((Number(crest.gainedTurn) || 0) >= player.personalTurn) continue;
    crest.countdown -= 1;
    actions.push(`${crest.name} Crest countdown ${Math.max(0, crest.countdown)}`);
    if (crest.countdown <= 0) expired.add(crest);
  }
  if (expired.size) player.crests = (player.crests ?? []).filter(crest => !expired.has(crest));
}

function turnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const actions = [];
  for (const unit of [...player.board]) {
    const text = getUnitTriggeredText(unit, "turnEnd");
    if (text) {
      const result = resolveText(text, { card: unit.card, sourceUnit: unit, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map });
      actions.push(...result.actions.map(action => `${unit.name}: ${action}`));
    }
  }
  actions.push(...applyCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map));
  restoreTemporaryAttack(player);
  actions.push(...cleanup(player, opponent, playerIndex, enemyIndex, stats, rng, map), ...cleanup(opponent, player, enemyIndex, playerIndex, stats, rng, map));
  // [[battle-leader-cap-expiry]]
  if (opponent.leaderDamageCapUntilOpponentTurnEnd) {
    opponent.leaderDamageCap = null;
    opponent.leaderDamageCapUntilOpponentTurnEnd = false;
    actions.push("Leader damage prevention expired");
  }
  return actions;
}

function applyCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const actions = [];
  for (const crest of player.crests ?? []) {
    const name = norm(crest.name);
    if (name === "grimnir, heavenly gale" && player.board.some(unit => unit.type === "Follower" && unit.superEvolved)) {
      const targets = opponent.board.filter(unit => unit.type === "Follower");
      const ctx = { player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map };
      for (const target of targets) damageUnit(target, 2, opponent, player, ctx, actions);
      if (targets.length) actions.push(`Grimnir Crest: 2 damage to ${targets.length} enemy follower${targets.length === 1 ? "" : "s"}`);
    }
    if (name === "sandalphon, primarch successor") {
      const healed = healPlayer(player, 1, stats, playerIndex);
      let followerHealing = 0;
      for (const unit of player.board.filter(unit => unit.type === "Follower")) {
        const before = unit.defense;
        unit.defense = Math.min(unit.maxDefense, unit.defense + 1);
        followerHealing += Math.max(0, unit.defense - before);
      }
      actions.push(`Sandalphon Crest: restore 1 defense to all allies${healed || followerHealing ? "" : " (no damaged allies)"}`);
      if (healed) actions.push(...afterLeaderHeal(player, healed, stats, playerIndex));
    }
  }
  return actions;
}

function invokeCards(player, opponent, playerIndex, enemyIndex, stats, rng, map, actions) {
  for (const inst of [...player.deck]) {
    const text = String(inst.card.text ?? "");
    if (!/Invoke this card/i.test(text)) continue;
    const need = Number(text.match(/evolved at least\s*(\d+) times this match/i)?.[1] ?? Infinity);
    if (player.evolutionsThisMatch < need || player.board.length >= 5) continue;
    player.deck = player.deck.filter(item => item.uid !== inst.uid);
    const unit = boardFollower(inst);
    player.board.push(unit);
    player.rally += 1;
    actions.push(`Invoke ${unit.name}`);
    actions.push(...applyEntryEvents({ player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map }, unit));
    const after = text.match(/When this card is Invoked[, :]\s*([^]*?)(?:\n\n|Fanfare:|$)/i)?.[1] ?? "";
    if (after) {
      const result = resolveText(after, { card: unit.card, instance: inst, sourceUnit: unit, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map });
      actions.push(...result.actions);
    }
    if (/return this card to your hand/i.test(after)) {
      // [[battle-cleanup-leave-hook]]
      notifyFollowerLeavesField(player, unit);
      player.board = player.board.filter(item => item.uid !== unit.uid);
      if (player.hand.length < 9) player.hand.push(inst);
    }
    break;
  }
}

function readyBoard(player) {
  for (const unit of player.board) {
    if (unit.type === "Follower") {
      if (unit.tempAttackPenalty) {
        unit.attack += unit.tempAttackPenalty;
        unit.tempAttackPenalty = 0;
      }
      unit.summonedThisTurn = false;
      const permanentlyLocked = /can't attack followers or leaders/i.test(String(unit.card?.text ?? ""));
      unit.canAttackLeader = !permanentlyLocked;
      unit.canAttackFollower = !permanentlyLocked;
      unit.attacked = false;
      unit.attacksMade = 0;
      unit.maxAttacks = unit.baseMaxAttacks ?? 1;
    } else if (unit.type === "Amulet") unit.engagedThisTurn = false;
  }
}

function engageInfo(unit) {
  const match = String(unit.card.text ?? "").match(/Engage\s*\(?\s*(\d+)?\s*\)?\s*:/i);
  return match ? { cost: Number(match[1] ?? 0), text: section(unit.card.text, `engage${match[1] ? ` ${match[1]}` : ""}`) } : null;
}

function bestEngage(player, opponent) {
  return player.board.filter(unit => unit.type === "Amulet" && !unit.engagedThisTurn)
    .map(unit => ({ unit, ...engageInfo(unit) }))
    .filter(item => item.text != null && item.cost <= player.pp)
    .map(item => ({ ...item, score: scoreEngage(item, player, opponent) }))
    .sort((a,b)=>b.score-a.score)[0] ?? null;
}

function scoreEngage(item, player, opponent) {
  const text = norm(item.text);
  const foes = opponent.board.filter(unit => unit.type === "Follower");
  let score = 1.5 - item.cost * .15;
  if (/draw/.test(text)) score += player.hand.length >= 8 ? -3 : player.hand.length <= 5 ? 5 : 2;
  if (/destroy|banish|damage/.test(text)) score += foes.length ? 4 + Math.min(5, strongestFollowerThreat(foes) * .18) : -4;
  if (/restore/.test(text)) score += player.hp <= 10 ? 6 : player.hp <= 15 ? 3 : -1;
  if (/summon/.test(text)) score += player.board.length <= 3 ? 4 : player.board.length === 4 ? 1 : -5;
  return score;
}

function resolveEngage(unit, player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const info = engageInfo(unit);
  if (!info) return { actions: [] };
  player.pp -= info.cost;
  stats.ppSpent[playerIndex] += info.cost;
  unit.engagedThisTurn = true;
  return resolveText(info.text, { card: unit.card, sourceUnit: unit, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map });
}

// [[battle-ai-effect-aware-evolution-v1]]
function maybeEvolve(player, opponent, playerIndex, enemyIndex, stats, rng, map, options = {}) {
  if (player.evolutionActionUsed) return null;
  const normalTurn = player.goingFirst ? 5 : 4;
  const superTurn = player.goingFirst ? 7 : 6;
  const candidates = player.board.filter(unit => unit.type === "Follower" && !unit.evolved && !unit.superEvolved && !unit.attacked);
  if (!candidates.length) return null;

  const normalAvailable = player.personalTurn >= normalTurn && player.ep > 0;
  const superAvailable = player.personalTurn >= superTurn && player.sep > 0;
  if (!normalAvailable && !superAvailable) return null;

  const normalRanked = normalAvailable
    ? candidates.map(unit => ({ unit, score: scoreEvolutionCandidate(unit, player, opponent, false) })).sort((a, b) => b.score - a.score)
    : [];
  const superRanked = superAvailable
    ? candidates.map(unit => ({ unit, score: scoreEvolutionCandidate(unit, player, opponent, true) })).sort((a, b) => b.score - a.score)
    : [];

  const normalBest = normalRanked[0] ?? null;
  const superBest = superRanked[0] ?? null;
  const effectBest = Math.max(
    normalBest ? evolutionEffectValue(normalBest.unit, player, opponent, false) : -Infinity,
    superBest ? evolutionEffectValue(superBest.unit, player, opponent, true) : -Infinity
  );

  if (options.phase === "pre-development") {
    const style = String(player.strategy?.style ?? "midrange");
    const foeCount = opponent.board.filter(unit => unit.type === "Follower").length;
    const threshold = style === "ward-control" || style === "control" ? 5 : style === "aggro" ? 7 : 6;
    const highImpact = effectBest >= threshold;
    const urgentClear = foeCount >= 3 && effectBest >= 4;
    const crowdedSequence = player.board.length >= 4 && effectBest >= 5;
    if (!highImpact && !urgentClear && !crowdedSequence) return null;
  }

  const tacticalNeed = opponent.board.some(unit => unit.type === "Follower")
    || player.strategy.faceBias > .7
    || opponent.hp <= 10
    || effectBest >= 4;
  if (!tacticalNeed) return null;

  let choice = normalBest;
  let superMode = false;
  if (superBest) {
    if (!normalBest) {
      choice = superBest;
      superMode = true;
    } else {
      const style = String(player.strategy?.style ?? "midrange");
      const superText = getUnitTriggeredText(superBest.unit, "superEvolve");
      const superEffect = evolutionTextValue(superText, player, opponent, superBest.unit);
      let premium = 2.5;
      if (style === "aggro") premium = 1.25;
      else if (style === "puppetry-tempo" || style === "buff-tempo") premium = 2;
      else if (style === "ward-control" || style === "control") premium = 4;
      const urgent = opponent.hp <= Math.max(6, superBest.unit.attack + 3)
        || opponent.board.filter(unit => unit.type === "Follower").length >= 3;
      if (superBest.score >= normalBest.score + premium || (superEffect >= 7 && superBest.score > normalBest.score) || (urgent && superBest.score > normalBest.score + .5)) {
        choice = superBest;
        superMode = true;
      }
    }
  }
  if (!choice) return null;

  const unit = choice.unit;
  const bonus = superMode ? 3 : 2;
  player[superMode ? "sep" : "ep"] -= 1;
  player.evolutionActionUsed = true;
  unit.attack += bonus;
  unit.defense += bonus;
  unit.maxDefense += bonus;
  unit.canAttackFollower = !/can't attack followers or leaders/i.test(String(unit.card?.text ?? ""));
  if (/can't attack followers or leaders/i.test(String(unit.card?.text ?? ""))) unit.canAttackLeader = false;
  unit.evolved = true;
  unit.superEvolved = superMode;
  player.evolutionsThisMatch += 1;
  recordHandEvolution(player);
  if (superMode) stats.superEvolutions[playerIndex] += 1;
  else stats.evolutions[playerIndex] += 1;
  const actions = [];
  const evolveText = getUnitTriggeredText(unit, "evolve");
  if (evolveText) actions.push(...resolveText(evolveText, { card: unit.card, sourceUnit: unit, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map }).actions);
  if (superMode) {
    const superText = getUnitTriggeredText(unit, "superEvolve");
    if (superText) actions.push(...resolveText(superText, { card: unit.card, sourceUnit: unit, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map }).actions);
  }
  actions.push(...cleanup(opponent, player, enemyIndex, playerIndex, stats, rng, map));
  return { super: superMode, action: compact(`${player.name} ${superMode ? "super-evolves" : "evolves"} ${unit.name}.`, actions) };
}

function scoreEvolutionCandidate(unit, player, opponent, superMode) {
  const bonus = superMode ? 3 : 2;
  const foes = opponent.board.filter(item => item.type === "Follower");
  const postAttack = Math.max(0, Number(unit.attack) || 0) + bonus;
  let score = 1 + postAttack * .22 + Math.max(0, Number(unit.defense) || 0) * .06;

  const evolveText = getUnitTriggeredText(unit, "evolve");
  score += evolutionTextValue(evolveText, player, opponent, unit);
  if (superMode) {
    const superText = getUnitTriggeredText(unit, "superEvolve");
    score += evolutionTextValue(superText, player, opponent, unit);
    score += 1.25; // +1/+1 over a normal evolution and the Super-Evolve combat rider.
  }

  if (foes.length) {
    const killable = foes.some(target => !target.aura && !target.ambush && (postAttack >= target.defense || hasU(unit, "Bane")));
    score += killable ? 4 : 1;
    if (hasU(unit, "Bane")) score += 1.5;
  }

  if (hasU(unit, "Storm") && unit.canAttackLeader) {
    score += opponent.hp <= postAttack ? 12 : opponent.hp <= 10 ? 5 : 1.5;
  }
  if (/can't attack followers or leaders/i.test(String(unit.card?.text ?? ""))) score -= 3;
  if (hasU(unit, "Ward") && (player.strategy.style === "ward-control" || player.hp <= 10)) score += 1.5;
  return score;
}

function evolutionEffectValue(unit, player, opponent, superMode) {
  if (!unit) return 0;
  let value = evolutionTextValue(getUnitTriggeredText(unit, "evolve"), player, opponent, unit);
  if (superMode) value += evolutionTextValue(getUnitTriggeredText(unit, "superEvolve"), player, opponent, unit);
  return value;
}

function evolutionTextValue(textValue, player, opponent, unit) {
  const text = norm(textValue);
  if (!text) return 0;
  const foes = opponent.board.filter(item => item.type === "Follower");
  const allies = player.board.filter(item => item.type === "Follower" && item !== unit);
  let value = 0;

  if (/destroy|banish/.test(text)) value += foes.length ? 10 : -3;
  if (/return .*enemy follower/.test(text)) value += foes.length ? 7 : -2;

  const allDamage = text.match(/deal (\d+) damage to all enemy followers/);
  if (allDamage) value += foes.length ? Math.min(12, foes.length * Math.max(1, Number(allDamage[1])) * 1.35) : -2;
  const targetDamage = text.match(/deal (\d+) damage to .*enemy follower/);
  if (targetDamage && !allDamage) value += foes.length ? Math.min(8, Number(targetDamage[1]) * 1.5 + 2) : -2;

  if (/summon/.test(text)) value += player.board.length < 5 ? 6 : 0;
  if (/draw/.test(text)) value += player.hand.length <= 5 ? 5 : 2;
  if (/add .* to your hand/.test(text)) value += player.hand.length < 9 ? 3 : 0;
  if (/restore .*defense to your leader/.test(text)) value += player.hp <= 10 ? 6 : player.hp <= 15 ? 3 : .5;
  if (/give all .*allied followers|give all other allied followers/.test(text)) value += Math.min(7, allies.length * 2);
  if (/evolve another|evolve a random|super-evolve/.test(text)) value += allies.some(item => !item.evolved && !item.superEvolved) ? 6 : 1;
  if (/gain crest/.test(text)) value += 6;
  if (/barrier|aura/.test(text)) value += 2.5;
  if (/storm/.test(text)) value += opponent.hp <= 10 ? 5 : 2;
  if (/ward/.test(text)) value += player.hp <= 10 ? 3 : 1;
  return value;
}

// [[battle-ability-evolve-helper-v5]]
function evolveUnitByAbility(ctx, unit, actions) {
  if (!unit || unit.type !== "Follower" || unit.evolved || unit.superEvolved) return false;
  unit.attack += 2;
  unit.defense += 2;
  unit.maxDefense += 2;
  unit.canAttackFollower = !/can't attack followers or leaders/i.test(String(unit.card?.text ?? ""));
  if (/can't attack followers or leaders/i.test(String(unit.card?.text ?? ""))) unit.canAttackLeader = false;
  unit.evolved = true;
  ctx.player.evolutionsThisMatch += 1;
  recordHandEvolution(ctx.player);
  ctx.stats.evolutions[ctx.playerIndex] += 1;
  actions.push(`evolve ${unit.name} by ability`);
  const evolveText = getUnitTriggeredText(unit, "evolve");
  if (evolveText) actions.push(...resolveText(evolveText, { ...ctx, card: unit.card, sourceUnit: unit }).actions);
  actions.push(...cleanup(ctx.opponent, ctx.player, ctx.enemyIndex, ctx.playerIndex, ctx.stats, ctx.rng, ctx.cardMap));
  return true;
}

function superEvolveUnitByAbility(ctx, unit, actions) {
  if (unit.evolved || unit.superEvolved) return;
  unit.attack += 3;
  unit.defense += 3;
  unit.maxDefense += 3;
  unit.canAttackFollower = !/can't attack followers or leaders/i.test(String(unit.card?.text ?? ""));
  if (/can't attack followers or leaders/i.test(String(unit.card?.text ?? ""))) unit.canAttackLeader = false;
  unit.evolved = true;
  unit.superEvolved = true;
  ctx.player.evolutionsThisMatch += 1;
  recordHandEvolution(ctx.player);
  ctx.stats.superEvolutions[ctx.playerIndex] += 1;
  actions.push(`super-evolve ${unit.name}`);
  const evolveText = getUnitTriggeredText(unit, "evolve");
  if (evolveText) actions.push(...resolveText(evolveText, { ...ctx, card: unit.card, sourceUnit: unit }).actions);
  const superText = getUnitTriggeredText(unit, "superEvolve");
  if (superText) actions.push(...resolveText(superText, { ...ctx, card: unit.card, sourceUnit: unit }).actions);
}

function attackPhase(player, opponent, playerIndex, enemyIndex, stats, frames, players, round, rng, map, record, options = {}) {
  const setupOnly = Boolean(options.setupOnly);
  const attackers = setupOnly ? rankSetupAttackers(player, opponent) : [...player.board].filter(unit => unit.type === "Follower");
  for (const attacker of attackers) {
    if (setupOnly && player.board.length < 5) return;
    while (player.board.includes(attacker) && attacker.attacksMade < attacker.maxAttacks) {
      if (setupOnly && player.board.length < 5) return;
      const wards = activeWards(opponent.board);
      const attackableWards = wards.filter(unit => !unit.intimidate && !unit.ambush);
      const foes = attackable(opponent.board);
      const canFollower = attacker.canAttackFollower;
      const canLeader = attacker.canAttackLeader && !wards.length;
      let target = null, leader = false;
      if (setupOnly) {
        const candidates = wards.length ? attackableWards : foes;
        const sacrificeTargets = candidates.filter(unit => willFollowerDieInCombat(attacker, unit, player));
        if (canFollower && sacrificeTargets.length) target = tradeTarget(attacker, sacrificeTargets, player.strategy);
        else break;
      } else if (wards.length) {
        if (canFollower && attackableWards.length) target = tradeTarget(attacker, attackableWards, player.strategy);
        else break;
      } else if (canLeader && hasCollectiveBoardLethal(player, opponent)) leader = true;
      else if (canLeader && shouldFace(attacker, player, opponent, foes, rng)) leader = true;
      else if (canFollower && foes.length) target = tradeTarget(attacker, foes, player.strategy);
      else if (canLeader) leader = true;
      else break;

      const actions = [];
      if (target && attacker.superEvolved && hasCrest(player, "Verdilia & Castelle, Sisters")) {
        attacker.maxAttacks = Math.max(attacker.maxAttacks, 2);
        actions.push("Verdilia & Castelle Crest: can attack twice this turn");
      }
      if (leader && hasU(attacker, "Storm") && hasCrest(opponent, "Lu Woh, Light Personified")) {
        const reduction = Math.min(3, Math.max(0, attacker.attack));
        attacker.attack -= reduction;
        attacker.tempAttackPenalty = (Number(attacker.tempAttackPenalty) || 0) + reduction;
        actions.push(`Lu Woh Crest: ${attacker.name} -${reduction}/-0 this turn`);
      }

      attacker.attacksMade += 1;
      attacker.attacked = attacker.attacksMade >= attacker.maxAttacks;
      stats.attacks[playerIndex] += 1;
      if (attacker.ambush) {
        attacker.ambush = false;
        attacker.keywords = attacker.keywords.filter(keyword => keyword !== "Ambush");
      }

      if (leader) {
        // [[battle-strike-precombat-v5]] Attack/Strike abilities resolve before combat damage.
        actions.push(...strike(attacker, player, opponent, playerIndex, enemyIndex, stats, rng, map));
        actions.push(...cleanup(opponent, player, enemyIndex, playerIndex, stats, rng, map), ...cleanup(player, opponent, playerIndex, enemyIndex, stats, rng, map));
        if (!player.board.includes(attacker) || opponent.hp <= 0) {
          snap(frames, players, { round, active: playerIndex, phase: "attack", action: compact(`${attacker.name} attacks ${opponent.name}'s leader.`, actions) }, stats, record);
          if (opponent.hp <= 0) return;
          break;
        }
        const damage = Math.max(0, attacker.attack);
        const dealt = damageLeader(opponent, damage);
        stats.damageDealt[playerIndex] += dealt;
        if (hasU(attacker, "Drain")) {
          const healed = healPlayer(player, dealt, stats, playerIndex);
          if (healed) actions.push(`Drain heals ${healed}`);
          actions.push(...afterLeaderHeal(player, healed, stats, playerIndex));
        }
        snap(frames, players, { round, active: playerIndex, phase: "attack", action: compact(`${attacker.name} attacks ${opponent.name}'s leader for ${dealt}.`, actions) }, stats, record);
        if (opponent.hp <= 0) return;
        continue;
      }

      if (target) {
        // Attack/Strike and Clash abilities all resolve before combat damage.
        actions.push(...strike(attacker, player, opponent, playerIndex, enemyIndex, stats, rng, map));
        const clashAttacker = getUnitTriggeredText(attacker, "clash");
        const clashTarget = getUnitTriggeredText(target, "clash");
        if (clashAttacker) actions.push(...resolveText(clashAttacker, { card: attacker.card, sourceUnit: attacker, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map }).actions);
        if (clashTarget) actions.push(...resolveText(clashTarget, { card: target.card, sourceUnit: target, player: opponent, opponent: player, playerIndex: enemyIndex, enemyIndex: playerIndex, stats, rng, cardMap: map }).actions);
        actions.push(...cleanup(player, opponent, playerIndex, enemyIndex, stats, rng, map), ...cleanup(opponent, player, enemyIndex, playerIndex, stats, rng, map));
        const attackerAlive = player.board.includes(attacker);
        const targetAlive = opponent.board.includes(target);
        if (!attackerAlive || !targetAlive) {
          if (attackerAlive && attacker.superEvolved && !targetAlive && target.defense <= 0) {
            const dealt = damageLeader(opponent, 1);
            stats.damageDealt[playerIndex] += dealt;
            if (dealt) actions.push("Super-Evolution deals 1 leader damage");
          }
          snap(frames, players, { round, active: playerIndex, phase: "attack", action: compact(`${attacker.name} attacks ${target.name}.`, actions) }, stats, record);
          if (opponent.hp <= 0) return;
          if (!attackerAlive) break;
          continue;
        }

        const outgoing = Math.max(0, attacker.attack);
        const incoming = Math.max(0, target.attack);
        const dealtToTarget = damageUnit(target, outgoing, opponent, player, { player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map }, actions);
        const dealtToAttacker = damageUnit(attacker, incoming, player, opponent, { player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map }, actions);
        // Bane is a combat destruction effect, not a damage threshold. It still
        // applies when attack is 0 or combat damage is prevented.
        if (hasU(attacker, "Bane")) destroyUnit(opponent, target);
        if (hasU(target, "Bane")) destroyUnit(player, attacker);
        if (hasU(attacker, "Drain")) {
          const healed = healPlayer(player, dealtToTarget, stats, playerIndex);
          if (healed) actions.push(`Drain heals ${healed}`);
          actions.push(...afterLeaderHeal(player, healed, stats, playerIndex));
        }
        const targetDied = target.defense <= 0;
        if (attacker.superEvolved && targetDied) {
          const dealt = damageLeader(opponent, 1);
          stats.damageDealt[playerIndex] += dealt;
          if (dealt) actions.push("Super-Evolution deals 1 leader damage");
          if (opponent.hp <= 0) {
            snap(frames, players, { round, active: playerIndex, phase: "attack", action: compact(`${attacker.name} destroys ${target.name}.`, actions) }, stats, record);
            return;
          }
        }
        actions.push(...cleanup(opponent, player, enemyIndex, playerIndex, stats, rng, map), ...cleanup(player, opponent, playerIndex, enemyIndex, stats, rng, map));
        snap(frames, players, { round, active: playerIndex, phase: "attack", action: compact(`${attacker.name} attacks ${target.name}.`, actions) }, stats, record);
        if (opponent.hp <= 0) return;
        continue;
      }
      break;
    }
  }
}

function attackable(board) { return board.filter(unit => unit.type === "Follower" && !unit.intimidate && !unit.ambush); }
function activeWards(board) { return board.filter(unit => unit.type === "Follower" && hasU(unit, "Ward") && !unit.intimidate && !unit.ambush); }

function rankSetupAttackers(player, opponent) {
  const wards = activeWards(opponent.board);
  const targets = wards.length ? wards : attackable(opponent.board);
  return player.board
    .filter(unit => unit.type === "Follower" && unit.canAttackFollower && unit.attacksMade < unit.maxAttacks)
    .map(unit => ({ unit, score: setupSacrificeScore(unit, targets, player) }))
    .filter(entry => Number.isFinite(entry.score))
    .sort((a, b) => b.score - a.score)
    .map(entry => entry.unit);
}

function setupSacrificeScore(attacker, targets, player) {
  let best = -Infinity;
  const ownValue = Math.max(0, Number(attacker.attack) || 0) * 1.6 + Math.max(0, Number(attacker.defense) || 0);
  for (const target of targets) {
    if (!willFollowerDieInCombat(attacker, target, player)) continue;
    const kills = canCombatRemove(attacker, target);
    const threat = Math.max(0, Number(target.attack) || 0) * 2.5 + Math.max(0, Number(target.defense) || 0);
    best = Math.max(best, (kills ? 18 : 4) + threat - ownValue * .35);
  }
  return best;
}

function willFollowerDieInCombat(attacker, target, owner) {
  if (!attacker || !target) return false;
  if (attacker.superEvolved && owner.isActive) return false;
  if (hasU(target, "Bane")) return true;
  if ((Number(attacker.barrier) || 0) > 0) return false;
  return Math.max(0, Number(target.attack) || 0) >= Math.max(0, Number(attacker.defense) || 0);
}

// [[battle-actual-damage-v5]]
function damageLeader(player, amountValue) {
  const before = Number(player.hp) || 0;
  player.hp -= Math.max(0, Number(amountValue) || 0);
  return Math.max(0, before - (Number(player.hp) || 0));
}

function damageUnit(unit, amountValue, owner, sourceOwner, ctx, actions) {
  let amount = Math.max(0, Number(amountValue) || 0);
  const attempted = amount > 0;
  if (unit.superEvolved && owner.isActive) {
    amount = 0;
    actions.push(`${unit.name} Invincible`);
  } else if (unit.barrier > 0 && amount > 0) {
    unit.barrier -= 1;
    amount = 0;
    actions.push(`${unit.name} Barrier`);
  } else {
    const cap = Number(String(unit.card?.text ?? "").match(/can'?t take more than\s*(\d+) damage at a time/i)?.[1] ?? 0);
    if (cap > 0 && amount > cap) {
      amount = cap;
      actions.push(`${unit.name} caps damage at ${cap}`);
    }
  }
  unit.defense -= amount;
  if (attempted && amount > 0 && unit.defense > 0) applyFollowerDamagedEvents(unit, owner, sourceOwner, ctx, actions);
  return amount;
}

function reactDamage(unit, owner, opponent, ctx, actions) {
  if (unit.reactedThisTurn) return;
  const match = String(unit.card.text ?? "").match(/once on each of your turns, when this follower takes damage but isn'?t destroyed,\s*([^.]*)/i);
  if (!match || !owner.isActive) return;
  unit.reactedThisTurn = true;
  const playerIndex = owner === ctx.player ? ctx.playerIndex : ctx.enemyIndex;
  const enemyIndex = owner === ctx.player ? ctx.enemyIndex : ctx.playerIndex;
  const result = resolveText(match[1], { card: unit.card, sourceUnit: unit, player: owner, opponent, playerIndex, enemyIndex, stats: ctx.stats, rng: ctx.rng, cardMap: ctx.cardMap });
  actions.push(...result.actions);
}

function chooseTarget(board, targeted) {
  return board.filter(unit => unit.type === "Follower" && (!targeted || (!unit.aura && !unit.ambush))).sort((a,b)=>b.attack+b.defense-a.attack-a.defense)[0] ?? null;
}

function tradeTarget(attacker, targets, strategy) {
  const tradeBias = clamp(Number(strategy?.tradeBias ?? .5), 0, 1);
  const score = target => {
    const kills = hasU(attacker, "Bane") || Math.max(0, Number(attacker.attack) || 0) >= Math.max(0, Number(target.defense) || 0);
    const enemyBane = hasU(target, "Bane");
    const invincible = attacker.superEvolved;
    const survivesDamage = invincible || (Number(attacker.defense) || 0) > Math.max(0, Number(target.attack) || 0);
    const survives = invincible || (!enemyBane && survivesDamage);
    const threat = Math.max(0, Number(target.attack) || 0) * 3 + Math.max(0, Number(target.defense) || 0);
    return (kills ? 100 : 0) + (survives ? 18 : 0) + threat * (0.45 + tradeBias) + (hasU(target, "Ward") ? 3 : 0);
  };
  return [...targets].sort((a,b) => score(b) - score(a))[0] ?? null;
}

// [[battle-ai-collective-lethal-v1]]
function hasCollectiveBoardLethal(player, opponent) {
  if (activeWards(opponent.board).length) return false;
  const hasCap = opponent.leaderDamageCap != null && Number.isFinite(Number(opponent.leaderDamageCap));
  const cap = hasCap ? Math.max(0, Number(opponent.leaderDamageCap)) : null;
  if (cap === 0) return false;

  let total = 0;
  for (const unit of player.board.filter(item => item.type === "Follower")) {
    if (!unit.canAttackLeader || unit.attacksMade >= unit.maxAttacks) continue;
    let damage = Math.max(0, Number(unit.attack) || 0);
    if (hasU(unit, "Storm") && hasCrest(opponent, "Lu Woh, Light Personified")) damage = Math.max(0, damage - 3);
    if (cap != null) damage = Math.min(damage, cap);
    total += damage * Math.max(0, (Number(unit.maxAttacks) || 1) - (Number(unit.attacksMade) || 0));
    if (total >= opponent.hp) return true;
  }
  return false;
}

function shouldFace(attacker, player, opponent, foes, rng) {
  if (attacker.attack >= opponent.hp || !foes.length) return true;

  const style = String(player.strategy?.style ?? "midrange");
  const killable = foes.filter(target => canCombatRemove(attacker, target));
  const enemyAttack = foes.reduce((sum, unit) => sum + Math.max(0, Number(unit.attack) || 0), 0);
  const alliedAttack = player.board
    .filter(unit => unit.type === "Follower")
    .reduce((sum, unit) => sum + Math.max(0, Number(unit.attack) || 0), 0);
  const defensiveEmergency = killable.length > 0 && enemyAttack >= Math.max(5, player.hp - 3);
  const materiallyBehind = killable.length > 0 && enemyAttack >= alliedAttack + 4;
  const highThreat = killable.some(target => (Number(target.attack) || 0) >= 4);

  // Aggro should pressure, not blindly ignore every profitable or necessary
  // trade. The previous unconditional face rule amplified first-player snowball.
  if (style === "aggro") {
    if (defensiveEmergency) return false;
    if (materiallyBehind && opponent.hp > 8) return false;
    if (highThreat && opponent.hp > 12) return false;
    return true;
  }

  if (defensiveEmergency) return false;
  const faceBias = clamp(Number(player.strategy?.faceBias ?? .5), 0, 1);
  return faceBias >= .65 || rng() < faceBias;
}

function canCombatRemove(attacker, target) {
  if (!attacker || !target) return false;
  if (hasU(attacker, "Bane")) return true;
  return Math.max(0, Number(attacker.attack) || 0) >= Math.max(0, Number(target.defense) || 0);
}

function strike(attacker, player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const text = getUnitTriggeredText(attacker, "strike");
  if (!text) return [];
  stats.strikeTriggered[playerIndex] += 1;
  const result = resolveText(text, { card: attacker.card, sourceUnit: attacker, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map });
  return ["Strike", ...result.actions];
}

function healPlayer(player, amount, stats, index) {
  const healed = Math.max(0, Math.min(Number(amount) || 0, player.maxHp - player.hp));
  player.hp += healed;
  stats.healing[index] += healed;
  return healed;
}

// [[battle-follower-leaves-field]]
function notifyFollowerLeavesField(player, unit) {
  if (!unit || unit.type !== "Follower") return;
  for (const item of player.hand ?? []) {
    if (norm(item.card?.name) !== "bayle, luxglaive warrior") continue;
    item.costDelta = (Number(item.costDelta) || 0) - 1;
  }
}

function cleanup(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const actions = [];
  let guard = 0;
  while (guard++ < 12) {
    const dead = player.board.filter(unit => unit.type === "Follower" && unit.defense <= 0);
    if (!dead.length) break;
    for (const unit of dead) {
      player.board = player.board.filter(item => item.uid !== unit.uid);
      toCemetery(player, { uid: unit.uid, card: unit.card }, true);
      player.destroyedFollowers.push({ card: unit.card });
      stats.followersLost[playerIndex] += 1;
      actions.push(...applyFollowerDestroyedEffects(effectContextBare({ player, opponent, playerIndex, enemyIndex, stats }), unit));
      const lastWords = getUnitTriggeredText(unit, "lastWords");
      if (lastWords) {
        stats.lastWordsTriggered[playerIndex] += 1;
        const result = resolveText(lastWords, { card: unit.card, sourceUnit: unit, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map });
        actions.push(`${unit.name} Last Words${result.actions.length ? `: ${result.actions.join(" · ")}` : ""}`);
      }
    }
  }
  return actions;
}

function destroyObject(player, opponent, unit, playerIndex, enemyIndex, stats, rng, map, lastWordsEnabled) {
  // [[battle-destroy-object-leave-hook]]
  if (unit.type === "Follower") notifyFollowerLeavesField(player, unit);
  player.board = player.board.filter(item => item.uid !== unit.uid);
  toCemetery(player, { uid: unit.uid, card: unit.card }, true);
  if (unit.type === "Follower") {
    player.destroyedFollowers.push({ card: unit.card });
    stats.followersLost[playerIndex] += 1;
    applyFollowerDestroyedEffects(effectContextBare({ player, opponent, playerIndex, enemyIndex, stats }), unit);
  }
  if (!lastWordsEnabled) return [];
  const lastWords = getUnitTriggeredText(unit, "lastWords");
  if (!lastWords) return [];
  stats.lastWordsTriggered[playerIndex] += 1;
  const result = resolveText(lastWords, { card: unit.card, sourceUnit: unit, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map });
  return [`${unit.name} Last Words`, ...result.actions];
}

function getUnitTriggeredText(unit, event) {
  if (!unit?.overrideText) return getTriggeredText(unit.card, event);
  return getTriggeredText({ ...unit.card, text: unit.overrideText }, event);
}

function toCemetery(player, item, addShadow = false) { player.cemetery.push(item); if (addShadow) player.shadows += 1; }
function destroyUnit(player, unit) { if (unit.superEvolved && player.isActive) return false; unit.defense = 0; return true; }
function banish(player, unit) { if (unit.type === "Follower") notifyFollowerLeavesField(player, unit); player.board = player.board.filter(item => item.uid !== unit.uid); player.banished.push({ uid: unit.uid, card: unit.card }); return true; }
function bounce(player, unit) { if (unit.type === "Follower") notifyFollowerLeavesField(player, unit); player.board = player.board.filter(item => item.uid !== unit.uid); const item = instance(player, unit.card); if (player.hand.length >= 9) { toCemetery(player, item, false); return false; } player.hand.push(item); return true; }

function hasCrest(player, name) { const target = norm(name); return (player.crests ?? []).some(crest => norm(crest.name) === target); }
function restoreTemporaryAttack(player) { for (const unit of player.board) if (unit.tempAttackPenalty) { unit.attack += unit.tempAttackPenalty; unit.tempAttackPenalty = 0; } }

function snap(frames, players, meta, stats, record) {
  if (!record) return;
  frames.push({
    index: frames.length, round: meta.round, active: meta.active, phase: meta.phase, action: meta.action,
    players: players.map(player => ({
      name: player.name, hp: player.hp, maxHp: player.maxHp, pp: player.pp, maxPp: player.maxPp, ep: player.ep, sep: player.sep,
      shadows: player.shadows, rally: player.rally, bonusPpAvailable: player.bonusPpAvailable, bonusPpUses: player.bonusPpUses,
      personalTurn: player.personalTurn, deckCount: player.deck.length, cemeteryCount: player.cemetery.length,
      hand: player.hand.map(cardView), board: player.board.map(unitView), crests: player.crests.map(crest => Number.isFinite(crest.countdown) ? `${crest.name} (${crest.countdown})` : crest.name)
    })),
    stats: cloneStats(stats)
  });
}

function cardView(item) {
  const card = item.card;
  return { id: Number(card.id), name: card.name, image: card.image, type: card.type, cost: costOf(item), attack: (Number(card.attack)||0)+(Number(item.attackBonus)||0), defense: (Number(card.defense)||0)+(Number(item.defenseBonus)||0), spellboost: Number(item.spellboost)||0, x: Number(item.x)||0, keywords: [...(card.keywords ?? [])] };
}
function unitView(unit) { const { card, ...view } = unit; return { ...view, keywords: [...(unit.keywords ?? [])] }; }
function cloneStats(stats) { return Object.fromEntries(Object.entries(stats).map(([key,value]) => [key, Array.isArray(value) ? [...value] : value])); }
function compact(base, actions) { const details = (actions ?? []).map(String).filter(Boolean); return details.length ? `${base} · ${details.slice(0,6).join(" · ")}${details.length > 6 ? " · …" : ""}` : base; }
function has(card, keyword) { return (card.keywords ?? []).includes(keyword) || new RegExp(`\\b${keyword.replace("-","[- ]")}\\b`, "i").test(String(card.text ?? "")); }
function hasU(unit, keyword) { return (unit.keywords ?? []).includes(keyword) || (keyword === "Barrier" && unit.barrier > 0) || (keyword === "Ambush" && unit.ambush) || (keyword === "Aura" && unit.aura) || (keyword === "Intimidate" && unit.intimidate); }
function norm(value) { return String(value ?? "").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim(); }
function uniq(values) { return [...new Set(values.filter(Boolean).map(String))]; }
function cap(value) { const text = String(value ?? ""); return text ? text[0].toUpperCase() + text.slice(1) : ""; }
function word(value) { const map = { a:1, an:1, one:1, two:2, three:3, four:4, five:5 }; return /^\d+$/.test(String(value)) ? Number(value) : (map[norm(value)] ?? 0); }
function createRng(seedValue) { let seed = 2166136261; for (const ch of String(seedValue ?? "")) { seed ^= ch.charCodeAt(0); seed = Math.imul(seed, 16777619); } seed >>>= 0; return () => { seed += 0x6D2B79F5; let t = seed; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shuffle(array, rng) { for (let index = array.length - 1; index > 0; index -= 1) { const other = Math.floor(rng() * (index + 1)); [array[index], array[other]] = [array[other], array[index]]; } }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
