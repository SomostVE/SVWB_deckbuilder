import {
  analyzeCardSupport as analyzeRulesSupport,
  executeGenericEffects,
  getBaseCost,
  getCountdown,
  getPlayModes,
  getTriggeredText
} from "./battle-rules.js";

const MAX_ROUNDS = 20;
const MAX_ACTIONS_PER_TURN = 20;

export function simulateBattle({
  playerDeck,
  opponentDeck,
  cardMap,
  playerStrategy = {},
  opponentStrategy = {},
  seed = "deci-builder",
  playerSide = "random"
}) {
  const rng = createRng(seed);
  const side = playerSide === "first" ? 0 : playerSide === "second" ? 1 : (rng() < .5 ? 0 : 1);
  const first = side === 0 ? 0 : 1;
  const second = first === 0 ? 1 : 0;

  const players = [
    makePlayer("You", playerDeck, playerStrategy, cardMap, rng),
    makePlayer("Opponent", opponentDeck, opponentStrategy, cardMap, rng)
  ];
  players[first].goingFirst = true;
  players[second].goingSecond = true;
  players[second].bonusPpAvailable = true;

  const stats = createStats();
  const frames = [];

  drawCards(players[0], 4, stats, 0);
  drawCards(players[1], 4, stats, 1);
  snapshot(frames, players, { round: 0, active: first, phase: "opening", action: "Both players draw 4 cards." }, stats);

  performMulligan(players[0], rng, stats, 0, frames, players, first);
  performMulligan(players[1], rng, stats, 1, frames, players, first);

  let winner = null;
  let lastRound = 0;

  outer:
  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    lastRound = round;

    for (const active of [first, second]) {
      const enemy = active === 0 ? 1 : 0;
      const player = players[active];
      const opponent = players[enemy];

      player.personalTurn += 1;
      player.cardsPlayedThisTurn = 0;
      player.spellsPlayedThisTurn = 0;
      player.maxPp = Math.min(10, player.maxPp + 1);
      player.pp = player.maxPp;
      readyBoard(player);

      const startActions = processTurnStart(player, opponent, active, enemy, stats, rng, cardMap);
      snapshot(frames, players, {
        round,
        active,
        phase: "turn-start",
        action: compactAction(`${player.name} starts turn ${player.personalTurn} with ${player.pp}/${player.maxPp} PP.`, startActions)
      }, stats);

      drawCards(player, 1, stats, active);
      snapshot(frames, players, {
        round,
        active,
        phase: "draw",
        action: `${player.name} draws a card.`
      }, stats);

      maybeUseBonusPp(player, active, frames, players, round, stats);

      let safety = 0;
      while (safety++ < MAX_ACTIONS_PER_TURN) {
        const options = getPlayableOptions(player);
        if (!options.length) break;

        const chosen = choosePlayable(options, player, opponent);
        if (!chosen) break;

        const result = playCard(chosen.instance, chosen.mode, player, opponent, active, enemy, stats, rng, cardMap);
        snapshot(frames, players, {
          round,
          active,
          phase: "play",
          action: compactAction(`${player.name} plays ${chosen.instance.card.name} (${chosen.mode.cost} PP${chosen.mode.kind !== "base" ? ` · ${capitalize(chosen.mode.kind)}` : ""}).`, result.actions)
        }, stats);

        if (opponent.hp <= 0) {
          winner = active;
          break outer;
        }
      }

      const evolveActions = maybeEvolve(player, opponent, active, enemy, stats, rng, cardMap, false);
      if (evolveActions) {
        snapshot(frames, players, { round, active, phase: "evolve", action: evolveActions.action }, stats);
        if (opponent.hp <= 0) { winner = active; break outer; }
      }

      const superActions = maybeEvolve(player, opponent, active, enemy, stats, rng, cardMap, true);
      if (superActions) {
        snapshot(frames, players, { round, active, phase: "super-evolve", action: superActions.action }, stats);
        if (opponent.hp <= 0) { winner = active; break outer; }
      }

      performAttacks(player, opponent, active, enemy, stats, frames, players, round, rng, cardMap);
      if (opponent.hp <= 0) {
        winner = active;
        break outer;
      }

      const endActions = processTurnEnd(player, opponent, active, enemy, stats, rng, cardMap);
      stats.ppWasted[active] += Math.max(0, player.pp);
      snapshot(frames, players, {
        round,
        active,
        phase: "turn-end",
        action: compactAction(`${player.name} ends turn ${player.personalTurn}.`, endActions)
      }, stats);

      if (opponent.hp <= 0) {
        winner = active;
        break outer;
      }
    }
  }

  const coverage = [
    analyzeDeckCoverage(playerDeck, cardMap),
    analyzeDeckCoverage(opponentDeck, cardMap)
  ];

  return {
    frames,
    coverage,
    summary: {
      winner: winner == null ? "Draw / turn limit" : players[winner].name,
      winnerIndex: winner,
      rounds: lastRound,
      finalHp: players.map(player => player.hp),
      stats,
      experimental: coverage.some(item => item.unsupported > 0 || item.partial > 0)
    }
  };
}

export function analyzeDeckCoverage(deck, cardMap) {
  const rows = normalizeDeck(deck);
  let total = 0;
  let full = 0;
  let partial = 0;
  let unsupported = 0;
  const unsupportedCards = [];
  const partialCards = [];
  const mechanics = new Map();

  for (const [id, qty] of rows) {
    const card = cardMap.get(Number(id));
    const count = Number(qty) || 0;
    total += count;
    const support = card ? analyzeCardSupport(card) : { level: "unsupported", reason: "Card not found in database", mechanics: [] };

    if (support.level === "full") full += count;
    else if (support.level === "partial") {
      partial += count;
      if (card) partialCards.push(card.name);
    } else {
      unsupported += count;
      unsupportedCards.push(card?.name ?? `Card ${id}`);
    }

    for (const mechanic of support.mechanics ?? []) {
      mechanics.set(mechanic, (mechanics.get(mechanic) ?? 0) + count);
    }
  }

  return {
    total,
    full,
    partial,
    unsupported,
    modeledPercent: total ? Math.round((full + partial * .65) / total * 100) : 0,
    partialCards: [...new Set(partialCards)].slice(0, 16),
    unsupportedCards: [...new Set(unsupportedCards)].slice(0, 16),
    mechanics: [...mechanics.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, count]) => ({ name, count }))
  };
}

export function analyzeCardSupport(card) {
  return analyzeRulesSupport(card);
}

function createStats() {
  const pair = () => [0, 0];
  return {
    damageDealt: pair(),
    cardsPlayed: pair(),
    attacks: pair(),
    draws: pair(),
    unsupportedEffects: pair(),
    evolutions: pair(),
    superEvolutions: pair(),
    healing: pair(),
    followersLost: pair(),
    cardsGenerated: pair(),
    cardsBurned: pair(),
    ppSpent: pair(),
    ppWasted: pair(),
    spellsPlayed: pair(),
    lastWordsTriggered: pair(),
    strikeTriggered: pair()
  };
}

function makePlayer(name, deck, strategy, cardMap, rng) {
  const player = {
    name,
    strategy: normalizeStrategy(strategy),
    hp: 20,
    maxHp: 20,
    maxPp: 0,
    pp: 0,
    ep: 2,
    sep: 2,
    shadows: 0,
    bonusPpAvailable: false,
    goingFirst: false,
    goingSecond: false,
    personalTurn: 0,
    cardsPlayedThisTurn: 0,
    spellsPlayedThisTurn: 0,
    nextSerial: 0,
    deck: [],
    hand: [],
    board: [],
    cemetery: [],
    banished: []
  };

  for (const [id, qty] of normalizeDeck(deck)) {
    const card = cardMap.get(Number(id));
    if (!card) continue;
    for (let i = 0; i < qty; i += 1) player.deck.push(createInstance(player, card));
  }

  shuffle(player.deck, rng);
  return player;
}

// [[class-mechanic-boundaries-v1]]
function isSpellboostRecipient(card) {
  if (!card) return false;
  const keywords = (card.keywords ?? []).map(value => String(value).trim().toLowerCase());
  return keywords.includes("on spellboost") || /\bon spellboost\s*:/i.test(String(card.text ?? ""));
}

function createInstance(player, card) {
  return {
    uid: `${player.name}-${player.nextSerial++}`,
    card,
    spellboost: 0,
    costDelta: 0,
    attackBonus: 0,
    defenseBonus: 0
  };
}

function normalizeStrategy(strategy) {
  return {
    style: strategy?.style ?? "midrange",
    label: strategy?.label ?? "General curve play",
    mulliganMaxCost: Number(strategy?.mulliganMaxCost ?? 3),
    faceBias: clamp(Number(strategy?.faceBias ?? .5), 0, 1),
    tradeBias: clamp(Number(strategy?.tradeBias ?? .5), 0, 1),
    priorities: Array.isArray(strategy?.priorities) ? strategy.priorities.map(String) : []
  };
}

function normalizeDeck(deck) {
  if (deck instanceof Map) return [...deck.entries()].map(([id, qty]) => [Number(id), Number(qty)]);
  if (!Array.isArray(deck)) return [];
  return deck.map(entry => {
    if (Array.isArray(entry)) return [Number(entry[0]), Number(entry[1])];
    return [Number(entry.cardId ?? entry.id), Number(entry.qty ?? entry.quantity ?? 1)];
  }).filter(([id, qty]) => Number.isFinite(id) && qty > 0);
}

function performMulligan(player, rng, stats, playerIndex, frames, players) {
  const replace = player.hand.filter(instance => shouldMulligan(instance.card, player.strategy));
  if (!replace.length) return;

  const replaceIds = new Set(replace.map(instance => instance.uid));
  player.hand = player.hand.filter(instance => !replaceIds.has(instance.uid));
  const replacements = [];
  while (replacements.length < replace.length && player.deck.length) replacements.push(player.deck.shift());
  player.hand.push(...replacements);
  player.deck.push(...replace);
  shuffle(player.deck, rng);

  snapshot(frames, players, {
    round: 0,
    active: playerIndex,
    phase: "mulligan",
    action: `${player.name} redraws ${replace.length} opening card${replace.length === 1 ? "" : "s"}.`
  }, stats);
}

function shouldMulligan(card, strategy) {
  const text = normalizeText(card.text);
  if (strategy.style === "ramp" && (hasRole(card, "Ramp") || /maximum play points|empty play point/.test(text))) return false;
  if (strategy.style === "spell-combo" && (card.type === "Spell" || hasRole(card, "Draw"))) return Number(card.cost) > 4;
  if (strategy.style === "ward-control" && hasKeyword(card, "Ward") && Number(card.cost) <= 4) return false;
  if (strategy.style === "buff-tempo" && /give .*\+\d+\s*\/\s*\+\d+/.test(text) && Number(card.cost) <= 3) return false;
  if (strategy.style === "puppetry-tempo" && hasRole(card, "Generate") && Number(card.cost) <= 3) return false;
  return Number(card.cost) > strategy.mulliganMaxCost;
}

function drawCards(player, amount, stats, playerIndex) {
  let drawnCount = 0;
  for (let i = 0; i < amount; i += 1) {
    const drawn = player.deck.shift();
    if (!drawn) continue;
    stats.draws[playerIndex] += 1;
    drawnCount += 1;
    if (player.hand.length >= 9) {
      sendToCemetery(player, drawn);
      stats.cardsBurned[playerIndex] += 1;
    } else {
      player.hand.push(drawn);
    }
  }
  return drawnCount;
}

function maybeUseBonusPp(player, active, frames, players, round, stats) {
  if (!player.bonusPpAvailable) return;
  const currentlyPlayable = getPlayableOptions(player).length > 0;
  if (currentlyPlayable) return;

  player.pp += 1;
  const withBonus = getPlayableOptions(player).length > 0;
  if (!withBonus) {
    player.pp -= 1;
    return;
  }

  player.bonusPpAvailable = false;
  snapshot(frames, players, {
    round,
    active,
    phase: "bonus-pp",
    action: `${player.name} uses the second-player bonus PP.`
  }, stats);
}

function getPlayableOptions(player) {
  const options = [];
  for (const instance of player.hand) {
    for (const mode of getPlayModes(instance, player)) {
      options.push({ instance, mode });
    }
  }
  return options;
}

function choosePlayable(options, player, opponent) {
  return options
    .map(option => ({ ...option, score: scoreCard(option.instance, option.mode, player, opponent) }))
    .sort((a, b) => b.score - a.score || b.mode.cost - a.mode.cost)[0] ?? null;
}

function scoreCard(instance, mode, player, opponent) {
  const card = instance.card;
  const cost = mode.cost;
  const text = normalizeText(mode.text || card.text);
  const style = player.strategy.style;
  let score = cost * 1.9 - Math.max(0, player.pp - cost) * .18 + Number(mode.scoreBonus || 0);

  if (card.type === "Follower" && mode.kind !== "accelerate") score += 2;
  if (hasRole(card, "Draw") || /\bdraw /.test(text)) score += player.hand.length <= 5 ? 4 : 1;
  if (hasRole(card, "Removal") || /destroy .*enemy follower|damage to .*enemy follower|banish .*enemy follower/.test(text)) score += opponent.board.some(unit => unit.type === "Follower") ? 6 : -3;
  if (hasRole(card, "Finisher") || /damage to (?:the )?enemy leader/.test(text)) score += opponent.hp <= 12 ? 7 : 1;
  if (hasKeyword(card, "Storm")) score += style === "aggro" ? 9 : 4;
  if (hasKeyword(card, "Ward")) score += style === "ward-control" ? 8 : (player.hp <= 12 ? 4 : 2);
  if (hasRole(card, "Heal")) score += player.hp <= 14 ? 8 : -1;
  if (hasRole(card, "Ramp") || /maximum play points|empty play point/.test(text)) score += style === "ramp" && player.maxPp < 7 ? 13 : 1;
  if (style === "spell-combo" && (card.type === "Spell" || mode.kind === "accelerate")) score += 6 + Math.max(0, 3 - cost);
  if (style === "spell-combo" && instance.spellboost > 0) score += Math.min(5, instance.spellboost * .7);
  if (style === "puppetry-tempo" && (hasRole(card, "Generate") || /summon|to your hand/.test(text))) score += 7;
  if (style === "buff-tempo" && /(?:give|gain) .*\+\d+\s*\/\s*\+\d+/.test(text)) score += player.hand.some(item => item.card.type === "Follower") || player.board.some(unit => unit.type === "Follower") ? 8 : 1;
  if (style === "aggro") {
    if (cost <= 3) score += 3;
    if (/damage to (?:the )?enemy leader/.test(text)) score += 7;
  }
  if (style === "ward-control" && opponent.board.length >= 2 && hasRole(card, "Board Clear")) score += 10;

  const support = analyzeCardSupport(card);
  if (support.level === "unsupported") score -= 4;
  if (mode.kind === "enhance" && player.pp - cost <= 2) score += 2;
  return score;
}

function playCard(instance, mode, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap) {
  player.hand = player.hand.filter(item => item.uid !== instance.uid);
  player.pp -= mode.cost;
  player.cardsPlayedThisTurn += 1;
  stats.cardsPlayed[playerIndex] += 1;
  stats.ppSpent[playerIndex] += mode.cost;

  const card = instance.card;
  const actions = [];
  let sourceUnit = null;

  if (mode.kind !== "accelerate") {
    if (card.type === "Follower") {
      sourceUnit = makeBoardUnit(instance);
      player.board.push(sourceUnit);
    } else if (card.type === "Amulet") {
      sourceUnit = makeBoardAmulet(instance);
      player.board.push(sourceUnit);
    }
  }

  const text = mode.text || (mode.kind === "base" ? card.text : "");
  const effect = resolveCardText({
    text,
    card,
    sourceUnit,
    player,
    opponent,
    playerIndex,
    enemyIndex,
    stats,
    rng,
    cardMap
  });
  actions.push(...effect.actions);

  if (card.type === "Spell" || mode.kind === "accelerate") {
    stats.spellsPlayed[playerIndex] += 1;
    player.spellsPlayedThisTurn += 1;
    for (const handCard of player.hand) {
      if (!isSpellboostRecipient(handCard.card)) continue;
      handCard.spellboost = (Number(handCard.spellboost) || 0) + 1;
    }
    sendToCemetery(player, instance);
  }

  const cleanupActions = cleanupDead(player, opponent, playerIndex, enemyIndex, stats, rng, cardMap)
    .concat(cleanupDead(opponent, player, enemyIndex, playerIndex, stats, rng, cardMap));
  actions.push(...cleanupActions);

  return { actions };
}

function makeBoardUnit(instance) {
  const card = instance.card;
  const attack = (Number(card.attack) || 0) + (Number(instance.attackBonus) || 0);
  const defense = (Number(card.defense) || 0) + (Number(instance.defenseBonus) || 0);
  return {
    uid: instance.uid,
    cardId: Number(card.id),
    card,
    name: card.name,
    image: card.image,
    type: "Follower",
    attack,
    defense,
    maxDefense: defense,
    keywords: [...(card.keywords ?? [])],
    summonedThisTurn: true,
    canAttackLeader: hasKeyword(card, "Storm"),
    canAttackFollower: hasKeyword(card, "Storm") || hasKeyword(card, "Rush"),
    attacked: false,
    evolved: false,
    superEvolved: false
  };
}

function makeBoardAmulet(instance) {
  const card = instance.card;
  return {
    uid: instance.uid,
    cardId: Number(card.id),
    card,
    name: card.name,
    image: card.image,
    type: "Amulet",
    attack: 0,
    defense: 0,
    maxDefense: 0,
    countdown: getCountdown(card),
    keywords: [...(card.keywords ?? [])],
    summonedThisTurn: true,
    canAttackLeader: false,
    canAttackFollower: false,
    attacked: true,
    evolved: false,
    superEvolved: false
  };
}

function processTurnStart(player, opponent, playerIndex, enemyIndex, stats, rng, cardMap) {
  const actions = [];

  for (const amulet of [...player.board].filter(unit => unit.type === "Amulet" && Number.isFinite(unit.countdown))) {
    amulet.countdown -= 1;
    actions.push(`${amulet.name} countdown ${Math.max(0, amulet.countdown)}`);
    if (amulet.countdown <= 0) actions.push(...destroyBoardObject(player, opponent, amulet, playerIndex, enemyIndex, stats, rng, cardMap, true));
  }

  for (const unit of [...player.board]) {
    const text = getTriggeredText(unit.card, "turnStart");
    if (!text) continue;
    const result = resolveCardText({ text, card: unit.card, sourceUnit: unit, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap });
    actions.push(...result.actions.map(action => `${unit.name}: ${action}`));
  }

  actions.push(...cleanupDead(player, opponent, playerIndex, enemyIndex, stats, rng, cardMap));
  actions.push(...cleanupDead(opponent, player, enemyIndex, playerIndex, stats, rng, cardMap));
  return actions;
}

function processTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, cardMap) {
  const actions = [];
  for (const unit of [...player.board]) {
    const text = getTriggeredText(unit.card, "turnEnd");
    if (!text) continue;
    const result = resolveCardText({ text, card: unit.card, sourceUnit: unit, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap });
    actions.push(...result.actions.map(action => `${unit.name}: ${action}`));
  }
  actions.push(...cleanupDead(player, opponent, playerIndex, enemyIndex, stats, rng, cardMap));
  actions.push(...cleanupDead(opponent, player, enemyIndex, playerIndex, stats, rng, cardMap));
  return actions;
}

function readyBoard(player) {
  for (const unit of player.board) {
    if (unit.type !== "Follower") continue;
    unit.summonedThisTurn = false;
    unit.canAttackLeader = true;
    unit.canAttackFollower = true;
    unit.attacked = false;
  }
}

function maybeEvolve(player, opponent, playerIndex, enemyIndex, stats, rng, cardMap, superMode) {
  const firstThreshold = superMode ? 7 : 5;
  const secondThreshold = superMode ? 6 : 4;
  const threshold = player.goingFirst ? firstThreshold : secondThreshold;
  const pointsKey = superMode ? "sep" : "ep";
  if (player.personalTurn < threshold || player[pointsKey] <= 0) return null;

  const candidates = player.board.filter(unit => unit.type === "Follower" && !unit.attacked && !unit.evolved && !unit.superEvolved);
  if (!candidates.length) return null;

  const wantsEvolve = opponent.board.some(unit => unit.type === "Follower") || player.strategy.faceBias >= .72 || opponent.hp <= 10;
  if (!wantsEvolve) return null;

  candidates.sort((a, b) => evolveScore(b, opponent, player.strategy) - evolveScore(a, opponent, player.strategy));
  const unit = candidates[0];
  const bonus = superMode ? 3 : 2;
  player[pointsKey] -= 1;
  unit.attack += bonus;
  unit.defense += bonus;
  unit.maxDefense += bonus;
  unit.canAttackFollower = true;
  if (superMode) {
    unit.superEvolved = true;
    stats.superEvolutions[playerIndex] += 1;
  } else {
    unit.evolved = true;
    stats.evolutions[playerIndex] += 1;
  }

  const trigger = getTriggeredText(unit.card, superMode ? "superEvolve" : "evolve")
    || (superMode ? getTriggeredText(unit.card, "evolve") : "");
  const actions = [];
  if (trigger) {
    const effect = resolveCardText({ text: trigger, card: unit.card, sourceUnit: unit, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap });
    actions.push(...effect.actions);
  }
  actions.push(...cleanupDead(opponent, player, enemyIndex, playerIndex, stats, rng, cardMap));

  return {
    action: compactAction(`${player.name} ${superMode ? "super-evolves" : "evolves"} ${unit.name}.`, actions)
  };
}

function evolveScore(unit, opponent, strategy) {
  let score = unit.attack + unit.defense;
  if (hasUnitKeyword(unit, "Storm")) score += strategy.faceBias * 8;
  if (hasUnitKeyword(unit, "Ward")) score += (1 - strategy.faceBias) * 5;
  const target = chooseRemovalTarget(opponent.board);
  if (target && unit.attack + 2 >= target.defense) score += 4;
  return score;
}

function performAttacks(player, opponent, playerIndex, enemyIndex, stats, frames, players, round, rng, cardMap) {
  const attackers = [...player.board].filter(unit => unit.type === "Follower" && !unit.attacked);
  for (const attacker of attackers) {
    if (!player.board.includes(attacker)) continue;

    const wards = opponent.board.filter(unit => unit.type === "Follower" && hasUnitKeyword(unit, "Ward"));
    const enemyFollowers = opponent.board.filter(unit => unit.type === "Follower");
    const mayAttackFollower = attacker.canAttackFollower;
    const mayAttackLeader = attacker.canAttackLeader;

    let target = null;
    let targetLeader = false;

    if (wards.length && mayAttackFollower) {
      target = chooseTradeTarget(attacker, wards, player.strategy);
    } else if (mayAttackLeader && shouldAttackLeader(attacker, player, opponent, enemyFollowers, rng)) {
      targetLeader = true;
    } else if (mayAttackFollower && enemyFollowers.length) {
      target = chooseTradeTarget(attacker, enemyFollowers, player.strategy);
    } else if (mayAttackLeader) {
      targetLeader = true;
    } else {
      continue;
    }

    attacker.attacked = true;
    attacker.canAttackLeader = false;
    attacker.canAttackFollower = false;
    stats.attacks[playerIndex] += 1;
    const actions = [];

    if (targetLeader) {
      const damage = Math.max(0, attacker.attack);
      opponent.hp -= damage;
      stats.damageDealt[playerIndex] += damage;
      if (hasUnitKeyword(attacker, "Drain")) {
        const healed = Math.max(0, Math.min(damage, player.maxHp - player.hp));
        player.hp += healed;
        stats.healing[playerIndex] += healed;
        if (healed) actions.push(`Drain heals ${healed}`);
      }
      actions.push(...resolveStrike(attacker, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap));
      snapshot(frames, players, {
        round,
        active: playerIndex,
        phase: "attack",
        action: compactAction(`${attacker.name} attacks ${opponent.name}'s leader for ${damage}.`, actions)
      }, stats);
      if (opponent.hp <= 0) return;
      continue;
    }

    if (target) {
      const targetName = target.name;
      const outgoing = Math.max(0, attacker.attack);
      const incoming = Math.max(0, target.attack);
      target.defense -= outgoing;
      if (!attacker.superEvolved) attacker.defense -= incoming;
      if (hasUnitKeyword(attacker, "Bane") && outgoing > 0) target.defense = 0;
      if (hasUnitKeyword(target, "Bane") && incoming > 0 && !attacker.superEvolved) attacker.defense = 0;
      if (hasUnitKeyword(attacker, "Drain")) {
        const healed = Math.max(0, Math.min(outgoing, player.maxHp - player.hp));
        player.hp += healed;
        stats.healing[playerIndex] += healed;
        if (healed) actions.push(`Drain heals ${healed}`);
      }

      const destroyedBySuper = attacker.superEvolved && target.defense <= 0;
      actions.push(...cleanupDead(opponent, player, enemyIndex, playerIndex, stats, rng, cardMap));
      actions.push(...cleanupDead(player, opponent, playerIndex, enemyIndex, stats, rng, cardMap));
      if (destroyedBySuper) {
        opponent.hp -= 1;
        stats.damageDealt[playerIndex] += 1;
        actions.push("Super-Evolution deals 1 leader damage");
      }
      if (player.board.includes(attacker)) actions.push(...resolveStrike(attacker, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap));

      snapshot(frames, players, {
        round,
        active: playerIndex,
        phase: "attack",
        action: compactAction(`${attacker.name} attacks ${targetName}.`, actions)
      }, stats);
      if (opponent.hp <= 0) return;
    }
  }
}

function shouldAttackLeader(attacker, player, opponent, enemyFollowers, rng) {
  if (attacker.attack >= opponent.hp) return true;
  if (player.strategy.style === "aggro") return true;
  if (enemyFollowers.length === 0) return true;
  return player.strategy.faceBias >= .65 || rng() < player.strategy.faceBias;
}

function resolveStrike(attacker, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap) {
  const text = getTriggeredText(attacker.card, "strike");
  if (!text) return [];
  stats.strikeTriggered[playerIndex] += 1;
  const result = resolveCardText({ text, card: attacker.card, sourceUnit: attacker, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap });
  const cleanupActions = cleanupDead(opponent, player, enemyIndex, playerIndex, stats, rng, cardMap);
  return [`Strike`, ...result.actions, ...cleanupActions];
}

function resolveCardText({ text, card, sourceUnit, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap }) {
  if (!String(text ?? "").trim()) return { actions: [], applied: false };
  const support = analyzeCardSupport(card);
  const context = makeEffectContext({ card, sourceUnit, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap });
  const result = executeGenericEffects(text, context);

  if (support.level === "unsupported" || (support.level === "partial" && result.unresolved)) {
    stats.unsupportedEffects[playerIndex] += 1;
  }
  return result;
}

function makeEffectContext({ card, sourceUnit, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap }) {
  return {
    card,
    sourceUnit,
    player,
    opponent,
    playerIndex,
    enemyIndex,
    stats,
    rng,
    draw: (owner, amount, ownerIndex) => drawCards(owner, amount, stats, ownerIndex),
    chooseEnemyFollower: chooseRemovalTarget,
    chooseAlliedFollower: (board, exclude) => chooseAlliedFollower(board, exclude),
    chooseHandFollower,
    buffUnit,
    buffHand,
    relatedCards: source => getRelatedCards(source, cardMap),
    summon: (owner, targetCard, amount, ownerIndex) => summonGenerated(owner, targetCard, amount, ownerIndex),
    addToHand: (owner, targetCard, amount, ownerIndex) => addGeneratedToHand(owner, targetCard, amount, ownerIndex, stats),
    cleanup: owner => {
      if (owner === player) return cleanupDead(player, opponent, playerIndex, enemyIndex, stats, rng, cardMap);
      return cleanupDead(opponent, player, enemyIndex, playerIndex, stats, rng, cardMap);
    },
    banish: banishUnit,
    returnToHand: returnUnitToHand
  };
}

function getRelatedCards(card, cardMap) {
  const ids = new Set();
  for (const relation of card?.relations ?? []) ids.add(Number(relation.id));
  for (const id of card?.relatedCards ?? []) ids.add(Number(id));
  return [...ids].map(id => cardMap.get(id)).filter(Boolean);
}

function summonGenerated(player, card, amount) {
  let count = 0;
  for (let i = 0; i < amount && player.board.length < 5; i += 1) {
    const instance = createInstance(player, card);
    if (card.type === "Follower") player.board.push(makeBoardUnit(instance));
    else if (card.type === "Amulet") player.board.push(makeBoardAmulet(instance));
    else break;
    count += 1;
  }
  return count;
}

function addGeneratedToHand(player, card, amount, playerIndex, stats) {
  let count = 0;
  for (let i = 0; i < amount; i += 1) {
    const instance = createInstance(player, card);
    if (player.hand.length >= 9) {
      sendToCemetery(player, instance);
      stats.cardsBurned[playerIndex] += 1;
      continue;
    }
    player.hand.push(instance);
    count += 1;
  }
  return count;
}

function chooseAlliedFollower(board, exclude = null) {
  return board
    .filter(unit => unit.type === "Follower" && unit !== exclude)
    .sort((a, b) => (b.attack + b.defense) - (a.attack + a.defense))[0]
    ?? (exclude?.type === "Follower" ? exclude : null);
}

function chooseHandFollower(hand) {
  return hand
    .filter(instance => instance.card.type === "Follower")
    .sort((a, b) => (Number(b.card.cost) || 0) - (Number(a.card.cost) || 0))[0] ?? null;
}

function buffUnit(unit, attack, defense) {
  unit.attack += Number(attack) || 0;
  unit.defense += Number(defense) || 0;
  unit.maxDefense += Number(defense) || 0;
}

function buffHand(instance, attack, defense) {
  instance.attackBonus = (Number(instance.attackBonus) || 0) + (Number(attack) || 0);
  instance.defenseBonus = (Number(instance.defenseBonus) || 0) + (Number(defense) || 0);
}

function banishUnit(player, unit) {
  player.board = player.board.filter(item => item.uid !== unit.uid);
  player.banished.push({ uid: unit.uid, card: unit.card });
}

function returnUnitToHand(player, unit) {
  player.board = player.board.filter(item => item.uid !== unit.uid);
  const instance = createInstance(player, unit.card);
  if (player.hand.length >= 9) {
    sendToCemetery(player, instance);
    return false;
  }
  player.hand.push(instance);
  return true;
}

function cleanupDead(player, opponent, playerIndex, enemyIndex, stats, rng, cardMap) {
  const actions = [];
  let safety = 0;
  while (safety++ < 12) {
    const dead = player.board.filter(unit => unit.type === "Follower" && unit.defense <= 0);
    if (!dead.length) break;

    for (const unit of dead) {
      player.board = player.board.filter(item => item.uid !== unit.uid);
      sendToCemetery(player, { uid: unit.uid, card: unit.card });
      stats.followersLost[playerIndex] += 1;
      const lastWords = getTriggeredText(unit.card, "lastWords");
      if (!lastWords) continue;
      stats.lastWordsTriggered[playerIndex] += 1;
      const result = resolveCardText({ text: lastWords, card: unit.card, sourceUnit: unit, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap });
      actions.push(`${unit.name} Last Words${result.actions.length ? `: ${result.actions.join(" · ")}` : ""}`);
    }
  }
  return actions;
}

function destroyBoardObject(player, opponent, unit, playerIndex, enemyIndex, stats, rng, cardMap, triggerLastWords) {
  const actions = [];
  player.board = player.board.filter(item => item.uid !== unit.uid);
  sendToCemetery(player, { uid: unit.uid, card: unit.card });
  if (!triggerLastWords) return actions;

  const lastWords = getTriggeredText(unit.card, "lastWords");
  if (lastWords) {
    stats.lastWordsTriggered[playerIndex] += 1;
    const result = resolveCardText({ text: lastWords, card: unit.card, sourceUnit: unit, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap });
    actions.push(`${unit.name} Last Words${result.actions.length ? `: ${result.actions.join(" · ")}` : ""}`);
  }
  return actions;
}

function sendToCemetery(player, instance) {
  player.cemetery.push(instance);
  player.shadows += 1;
}

function chooseTradeTarget(attacker, targets, strategy) {
  return [...targets].sort((a, b) => {
    const aKill = attacker.attack >= a.defense ? 1 : 0;
    const bKill = attacker.attack >= b.defense ? 1 : 0;
    if (aKill !== bKill) return bKill - aKill;
    if (strategy.tradeBias >= .65) return (b.attack + b.defense) - (a.attack + a.defense);
    return a.defense - b.defense;
  })[0] ?? null;
}

function chooseRemovalTarget(board) {
  return board
    .filter(unit => unit.type === "Follower")
    .sort((a, b) => (b.attack + b.defense) - (a.attack + a.defense))[0] ?? null;
}

function snapshot(frames, players, meta, stats) {
  frames.push({
    index: frames.length,
    round: meta.round,
    active: meta.active,
    phase: meta.phase,
    action: meta.action,
    players: players.map(player => ({
      name: player.name,
      hp: player.hp,
      maxHp: player.maxHp,
      pp: player.pp,
      maxPp: player.maxPp,
      ep: player.ep,
      sep: player.sep,
      shadows: player.shadows,
      bonusPpAvailable: player.bonusPpAvailable,
      personalTurn: player.personalTurn,
      deckCount: player.deck.length,
      cemeteryCount: player.cemetery.length,
      hand: player.hand.map(instance => cardView(instance)),
      board: player.board.map(unit => unitView(unit))
    })),
    stats: cloneStats(stats)
  });
}

function cardView(instance) {
  const card = instance.card;
  return {
    id: Number(card.id),
    name: card.name,
    image: card.image,
    type: card.type,
    cost: getBaseCost(instance),
    attack: (Number(card.attack) || 0) + (Number(instance.attackBonus) || 0),
    defense: (Number(card.defense) || 0) + (Number(instance.defenseBonus) || 0),
    spellboost: isSpellboostRecipient(card) ? (Number(instance.spellboost) || 0) : 0,
    keywords: [...(card.keywords ?? [])]
  };
}

function unitView(unit) {
  const { card, ...view } = unit;
  return { ...view, keywords: [...(unit.keywords ?? [])] };
}

function cloneStats(stats) {
  return Object.fromEntries(Object.entries(stats).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]));
}

function compactAction(base, actions) {
  const details = (actions ?? []).map(String).filter(Boolean);
  return details.length ? `${base} · ${details.slice(0, 5).join(" · ")}${details.length > 5 ? " · …" : ""}` : base;
}

function hasRole(card, role) { return (card.roles ?? []).includes(role); }
function hasKeyword(card, keyword) { return (card.keywords ?? []).includes(keyword); }
function hasUnitKeyword(unit, keyword) { return (unit.keywords ?? []).includes(keyword); }
function normalizeText(value) { return String(value ?? "").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim(); }

function createRng(seedValue) {
  let seed = 2166136261;
  for (const char of String(seedValue ?? "")) {
    seed ^= char.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  seed >>>= 0;
  return () => {
    seed += 0x6D2B79F5;
    let t = seed;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function shuffle(array, rng) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function capitalize(value) {
  const text = String(value ?? "");
  return text ? text[0].toUpperCase() + text.slice(1) : "";
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
