const SUPPORTED_KEYWORDS = new Set(["Ward", "Rush", "Storm", "Bane", "Drain"]);
const WORD_NUMBERS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };
const MAX_ROUNDS = 20;

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

  const stats = {
    damageDealt: [0, 0],
    cardsPlayed: [0, 0],
    attacks: [0, 0],
    draws: [0, 0],
    unsupportedEffects: [0, 0],
    evolutions: [0, 0],
    superEvolutions: [0, 0]
  };
  const frames = [];

  drawCards(players[0], 4, stats, 0);
  drawCards(players[1], 4, stats, 1);
  snapshot(frames, players, { round: 0, active: first, phase: "opening", action: "Both players draw 4 cards." }, stats);

  performMulligan(players[0], rng, stats, 0, frames, players, first);
  performMulligan(players[1], rng, stats, 1, frames, players, first);

  let winner = null;
  let lastRound = 0;

  outer:
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    lastRound = round;
    for (const active of [first, second]) {
      const enemy = active === 0 ? 1 : 0;
      const player = players[active];
      const opponent = players[enemy];

      player.personalTurn += 1;
      player.maxPp = Math.min(10, player.maxPp + 1);
      player.pp = player.maxPp;
      for (const unit of player.board) {
        if (unit.type !== "Follower") continue;
        unit.summonedThisTurn = false;
        unit.canAttackLeader = true;
        unit.canAttackFollower = true;
        unit.attacked = false;
      }

      snapshot(frames, players, {
        round,
        active,
        phase: "turn-start",
        action: `${player.name} starts turn ${player.personalTurn} with ${player.pp}/${player.maxPp} PP.`
      }, stats);

      drawCards(player, 1, stats, active);
      snapshot(frames, players, {
        round,
        active,
        phase: "draw",
        action: `${player.name} draws a card.`
      }, stats);

      maybeUseBonusPp(player, opponent, cardMap, active, frames, players, round, stats);

      let safety = 0;
      while (safety++ < 12) {
        const playable = player.hand.filter(instance => canPlay(instance.card, player));
        if (!playable.length) break;

        const chosen = choosePlayable(playable, player, opponent);
        if (!chosen) break;
        playCard(chosen, player, opponent, active, enemy, stats, rng);

        snapshot(frames, players, {
          round,
          active,
          phase: "play",
          action: `${player.name} plays ${chosen.card.name} (${chosen.card.cost} PP).`
        }, stats);

        if (opponent.hp <= 0) {
          winner = active;
          break outer;
        }
      }

      maybeEvolve(player, opponent, active, enemy, stats, frames, players, round, false);
      maybeEvolve(player, opponent, active, enemy, stats, frames, players, round, true);

      performAttacks(player, opponent, active, enemy, stats, frames, players, round, rng);
      if (opponent.hp <= 0) {
        winner = active;
        break outer;
      }

      snapshot(frames, players, {
        round,
        active,
        phase: "turn-end",
        action: `${player.name} ends turn ${player.personalTurn}.`
      }, stats);
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
      experimental: true
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

  for (const [id, qty] of rows) {
    const card = cardMap.get(Number(id));
    const count = Number(qty) || 0;
    total += count;
    const support = card ? analyzeCardSupport(card) : { level: "unsupported", reason: "Card not found in database" };
    if (support.level === "full") full += count;
    else if (support.level === "partial") {
      partial += count;
      if (card) partialCards.push(card.name);
    } else {
      unsupported += count;
      unsupportedCards.push(card?.name ?? `Card ${id}`);
    }
  }

  return {
    total,
    full,
    partial,
    unsupported,
    modeledPercent: total ? Math.round((full + partial * .5) / total * 100) : 0,
    partialCards: [...new Set(partialCards)].slice(0, 12),
    unsupportedCards: [...new Set(unsupportedCards)].slice(0, 12)
  };
}

export function analyzeCardSupport(card) {
  if (!card) return { level: "unsupported", reason: "Missing card" };
  const text = normalizeText(card.text);
  const keywords = new Set(card.keywords ?? []);
  const unsupportedKeyword = [...keywords].some(keyword => !SUPPORTED_KEYWORDS.has(keyword));
  const simpleEffect = hasSimpleEffect(text);
  const complex = /spellboost|earth rite|necromancy|reanimate|departed|engage|countdown|crest|faith|combo|super-evol|evolve:|last words|enhance|accelerate|transmute|fuse|puppet|artifact|whenever|at the end of|at the start of|select a mode|choose|if you have|if there (?:is|are)|for each|times? this match|cards? played this turn/i.test(text);

  if (card.type === "Follower" && !text && !unsupportedKeyword) return { level: "full", reason: "Base follower combat" };
  if (card.type === "Follower" && !complex && !unsupportedKeyword && (!text || simpleEffect || [...keywords].length)) {
    return { level: simpleEffect || text ? "partial" : "full", reason: "Basic stats/keywords and simple effects" };
  }
  if ((card.type === "Spell" || card.type === "Amulet") && simpleEffect && !complex && !unsupportedKeyword) {
    return { level: "partial", reason: "Simple text effect only" };
  }
  return { level: "unsupported", reason: "Card requires mechanics not modeled yet" };
}

function makePlayer(name, deck, strategy, cardMap, rng) {
  const library = [];
  let serial = 0;
  for (const [id, qty] of normalizeDeck(deck)) {
    const card = cardMap.get(Number(id));
    if (!card) continue;
    for (let i = 0; i < qty; i += 1) library.push({ uid: `${name}-${serial++}`, card });
  }

  shuffle(library, rng);
  return {
    name,
    strategy: normalizeStrategy(strategy),
    hp: 20,
    maxHp: 20,
    maxPp: 0,
    pp: 0,
    ep: 2,
    sep: 2,
    bonusPpAvailable: false,
    goingFirst: false,
    goingSecond: false,
    personalTurn: 0,
    deck: library,
    hand: [],
    board: [],
    cemetery: []
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
  if (strategy.style === "ramp" && hasRole(card, "Ramp")) return false;
  if (strategy.style === "spell-combo" && (card.type === "Spell" || hasRole(card, "Draw"))) return Number(card.cost) > 4;
  if (strategy.style === "ward-control" && hasKeyword(card, "Ward") && Number(card.cost) <= 4) return false;
  return Number(card.cost) > strategy.mulliganMaxCost;
}

function drawCards(player, amount, stats, playerIndex) {
  for (let i = 0; i < amount; i += 1) {
    const drawn = player.deck.shift();
    if (!drawn) continue;
    stats.draws[playerIndex] += 1;
    if (player.hand.length >= 9) player.cemetery.push(drawn);
    else player.hand.push(drawn);
  }
}

function maybeUseBonusPp(player, opponent, cardMap, active, frames, players, round, stats) {
  if (!player.bonusPpAvailable) return;
  const currentlyPlayable = player.hand.some(instance => canPlay(instance.card, player));
  const withBonus = player.hand.filter(instance => Number(instance.card.cost) <= player.pp + 1 && canFit(instance.card, player));
  if (currentlyPlayable || !withBonus.length) return;

  player.pp += 1;
  player.bonusPpAvailable = false;
  snapshot(frames, players, {
    round,
    active,
    phase: "bonus-pp",
    action: `${player.name} uses the second-player bonus PP.`
  }, stats);
}

function canPlay(card, player) {
  return Number(card.cost) <= player.pp && canFit(card, player);
}

function canFit(card, player) {
  if (card.type === "Spell") return true;
  return player.board.length < 5;
}

function choosePlayable(playable, player, opponent) {
  return playable
    .map(instance => ({ instance, score: scoreCard(instance.card, player, opponent) }))
    .sort((a, b) => b.score - a.score || Number(b.instance.card.cost) - Number(a.instance.card.cost))[0]?.instance ?? null;
}

function scoreCard(card, player, opponent) {
  const cost = Number(card.cost) || 0;
  let score = cost * 2.2 - Math.max(0, player.pp - cost) * .22;
  const style = player.strategy.style;
  const text = normalizeText(card.text);

  if (card.type === "Follower") score += 2;
  if (hasRole(card, "Draw")) score += player.hand.length <= 5 ? 4 : 1;
  if (hasRole(card, "Removal")) score += opponent.board.length ? 5 : -2;
  if (hasRole(card, "Finisher")) score += opponent.hp <= 12 ? 6 : 1;
  if (hasKeyword(card, "Storm")) score += style === "aggro" ? 8 : 4;
  if (hasKeyword(card, "Ward")) score += style === "ward-control" ? 8 : 2;
  if (hasRole(card, "Heal")) score += player.hp <= 14 ? 7 : 0;
  if (hasRole(card, "Ramp") || /maximum play points|empty play point/.test(text)) score += style === "ramp" && player.maxPp < 7 ? 12 : 1;
  if (style === "spell-combo" && card.type === "Spell") score += 6;
  if (style === "puppetry-tempo" && hasRole(card, "Generate")) score += 6;
  if (style === "buff-tempo" && /give .*?\+\d+\/\+\d+|gain \+\d+\/\+\d+/.test(text)) score += 7;
  if (style === "aggro" && cost <= 3) score += 3;

  const support = analyzeCardSupport(card);
  if (support.level === "unsupported") score -= 3;
  return score;
}

function playCard(instance, player, opponent, playerIndex, enemyIndex, stats, rng) {
  player.hand = player.hand.filter(item => item.uid !== instance.uid);
  player.pp -= Number(instance.card.cost) || 0;
  stats.cardsPlayed[playerIndex] += 1;

  const card = instance.card;
  if (card.type === "Follower") {
    player.board.push({
      uid: instance.uid,
      cardId: Number(card.id),
      name: card.name,
      image: card.image,
      type: card.type,
      attack: Number(card.attack) || 0,
      defense: Number(card.defense) || 0,
      maxDefense: Number(card.defense) || 0,
      keywords: [...(card.keywords ?? [])],
      summonedThisTurn: true,
      canAttackLeader: hasKeyword(card, "Storm"),
      canAttackFollower: hasKeyword(card, "Storm") || hasKeyword(card, "Rush"),
      attacked: false,
      evolved: false,
      superEvolved: false
    });
  } else if (card.type === "Amulet") {
    player.board.push({
      uid: instance.uid,
      cardId: Number(card.id),
      name: card.name,
      image: card.image,
      type: card.type,
      attack: 0,
      defense: 0,
      maxDefense: 0,
      keywords: [...(card.keywords ?? [])],
      summonedThisTurn: true,
      canAttackLeader: false,
      canAttackFollower: false,
      attacked: true
    });
  }

  const applied = applySimpleEffects(card, player, opponent, playerIndex, enemyIndex, stats, rng);
  const support = analyzeCardSupport(card);
  if (support.level === "unsupported" || (support.level === "partial" && !applied && normalizeText(card.text))) {
    stats.unsupportedEffects[playerIndex] += 1;
  }

  if (card.type === "Spell") player.cemetery.push(instance);
}

function applySimpleEffects(card, player, opponent, playerIndex, enemyIndex, stats) {
  const text = normalizeText(card.text);
  if (!text) return false;
  let applied = false;

  for (const match of text.matchAll(/\bdraw (a|an|one|two|three|four|five|\d+) cards?\b/g)) {
    const amount = wordNumber(match[1]);
    if (amount > 0) {
      drawCards(player, amount, stats, playerIndex);
      applied = true;
    }
  }

  for (const match of text.matchAll(/\brestore (a|an|one|two|three|four|five|\d+) defense to your leader\b/g)) {
    const amount = wordNumber(match[1]);
    if (amount > 0) {
      player.hp = Math.min(player.maxHp, player.hp + amount);
      applied = true;
    }
  }

  for (const match of text.matchAll(/\bdeal (a|an|one|two|three|four|five|\d+) damage to the enemy leader\b/g)) {
    const amount = wordNumber(match[1]);
    if (amount > 0) {
      opponent.hp -= amount;
      stats.damageDealt[playerIndex] += amount;
      applied = true;
    }
  }

  for (const match of text.matchAll(/\bdeal (a|an|one|two|three|four|five|\d+) damage to (?:an|a|the) enemy follower\b/g)) {
    const amount = wordNumber(match[1]);
    const target = chooseRemovalTarget(opponent.board);
    if (amount > 0 && target) {
      target.defense -= amount;
      cleanupDead(opponent);
      applied = true;
    }
  }

  if (/increase your maximum play points by 1|gain an empty play point orb/.test(text)) {
    player.maxPp = Math.min(10, player.maxPp + 1);
    applied = true;
  }

  return applied;
}

function maybeEvolve(player, opponent, playerIndex, enemyIndex, stats, frames, players, round, superMode) {
  const firstThreshold = superMode ? 7 : 5;
  const secondThreshold = superMode ? 6 : 4;
  const threshold = player.goingFirst ? firstThreshold : secondThreshold;
  const pointsKey = superMode ? "sep" : "ep";
  if (player.personalTurn < threshold || player[pointsKey] <= 0) return;
  if (!opponent.board.some(unit => unit.type === "Follower")) return;

  const candidates = player.board.filter(unit => unit.type === "Follower" && !unit.attacked && !unit.evolved && !unit.superEvolved);
  if (!candidates.length) return;

  candidates.sort((a, b) => (b.attack + b.defense) - (a.attack + a.defense));
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

  snapshot(frames, players, {
    round,
    active: playerIndex,
    phase: superMode ? "super-evolve" : "evolve",
    action: `${player.name} ${superMode ? "super-evolves" : "evolves"} ${unit.name}.`
  }, stats);
}

function performAttacks(player, opponent, playerIndex, enemyIndex, stats, frames, players, round, rng) {
  const attackers = player.board.filter(unit => unit.type === "Follower" && !unit.attacked);
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
    } else if (mayAttackLeader && (enemyFollowers.length === 0 || player.strategy.faceBias >= .6 || rng() < player.strategy.faceBias)) {
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

    if (targetLeader) {
      const damage = Math.max(0, attacker.attack);
      opponent.hp -= damage;
      stats.damageDealt[playerIndex] += damage;
      if (hasUnitKeyword(attacker, "Drain")) player.hp = Math.min(player.maxHp, player.hp + damage);

      snapshot(frames, players, {
        round,
        active: playerIndex,
        phase: "attack",
        action: `${attacker.name} attacks ${opponent.name}'s leader for ${damage}.`
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
      if (hasUnitKeyword(attacker, "Drain")) player.hp = Math.min(player.maxHp, player.hp + outgoing);

      const destroyedBySuper = attacker.superEvolved && target.defense <= 0;
      cleanupDead(opponent);
      cleanupDead(player);
      if (destroyedBySuper) {
        opponent.hp -= 1;
        stats.damageDealt[playerIndex] += 1;
      }

      snapshot(frames, players, {
        round,
        active: playerIndex,
        phase: "attack",
        action: `${attacker.name} attacks ${targetName}${destroyedBySuper ? " · Super-Evolution deals 1 leader damage" : ""}.`
      }, stats);
      if (opponent.hp <= 0) return;
    }
  }
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

function cleanupDead(player) {
  const dead = player.board.filter(unit => unit.type === "Follower" && unit.defense <= 0);
  if (dead.length) {
    player.cemetery.push(...dead.map(unit => ({ uid: unit.uid, card: { id: unit.cardId, name: unit.name } })));
    player.board = player.board.filter(unit => unit.type !== "Follower" || unit.defense > 0);
  }
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
      bonusPpAvailable: player.bonusPpAvailable,
      personalTurn: player.personalTurn,
      deckCount: player.deck.length,
      cemeteryCount: player.cemetery.length,
      hand: player.hand.map(instance => cardView(instance.card)),
      board: player.board.map(unit => ({ ...unit, keywords: [...(unit.keywords ?? [])] }))
    })),
    stats: {
      damageDealt: [...stats.damageDealt],
      cardsPlayed: [...stats.cardsPlayed],
      attacks: [...stats.attacks],
      draws: [...stats.draws],
      unsupportedEffects: [...stats.unsupportedEffects],
      evolutions: [...stats.evolutions],
      superEvolutions: [...stats.superEvolutions]
    }
  });
}

function cardView(card) {
  return {
    id: Number(card.id),
    name: card.name,
    image: card.image,
    type: card.type,
    cost: Number(card.cost) || 0,
    attack: Number(card.attack) || 0,
    defense: Number(card.defense) || 0,
    keywords: [...(card.keywords ?? [])]
  };
}

function hasSimpleEffect(text) {
  return /\bdraw (?:a|an|one|two|three|four|five|\d+) cards?\b|\brestore (?:a|an|one|two|three|four|five|\d+) defense to your leader\b|\bdeal (?:a|an|one|two|three|four|five|\d+) damage to (?:the enemy leader|(?:an|a|the) enemy follower)\b|increase your maximum play points by 1|gain an empty play point orb/.test(text);
}

function hasRole(card, role) { return (card.roles ?? []).includes(role); }
function hasKeyword(card, keyword) { return (card.keywords ?? []).includes(keyword); }
function hasUnitKeyword(unit, keyword) { return (unit.keywords ?? []).includes(keyword); }
function normalizeText(value) { return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim(); }

function wordNumber(value) {
  const normalized = String(value ?? "").toLowerCase();
  if (/^\d+$/.test(normalized)) return Number(normalized);
  return WORD_NUMBERS[normalized] ?? 0;
}

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

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
