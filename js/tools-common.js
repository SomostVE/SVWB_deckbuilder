export const VIAL_COSTS = Object.freeze({ Bronze: 50, Silver: 90, Gold: 750, Legendary: 3500 });

export function getMainDeckMap(deck, limit = 40) {
  const main = new Map();
  let remaining = limit;
  for (const [idValue, qtyValue] of deck.entries()) {
    if (remaining <= 0) break;
    const id = Number(idValue);
    const qty = Math.max(0, Number(qtyValue) || 0);
    const used = Math.min(qty, remaining);
    if (used > 0) main.set(id, used);
    remaining -= used;
  }
  return main;
}

export function getCraftCost(card) {
  if (!card || card.set === "Basic" || Number(card.setId) === 10000 || !card.deckSelectable) return 0;
  return VIAL_COSTS[card.rarity] ?? 0;
}

export function calculateDeckCrafting(deck, owned, cardMap) {
  const main = deck instanceof Map ? getMainDeckMap(deck) : new Map(deck ?? []);
  const missing = [];
  let totalVials = 0;
  let missingVials = 0;
  let requiredCopies = 0;
  let ownedCopiesUsed = 0;

  for (const [id, qty] of main) {
    const card = cardMap.get(Number(id));
    if (!card) continue;
    const required = Number(qty) || 0;
    const unit = getCraftCost(card);
    const have = unit === 0 ? required : Math.max(0, Number(owned.get(card.id)) || 0);
    const used = Math.min(required, have);
    const need = Math.max(0, required - used);
    requiredCopies += required;
    ownedCopiesUsed += used;
    totalVials += required * unit;
    missingVials += need * unit;
    if (need > 0) missing.push({ card, required, owned: used, missing: need, vialCost: need * unit });
  }

  missing.sort((a, b) => b.vialCost - a.vialCost || a.card.cost - b.card.cost || a.card.name.localeCompare(b.card.name));
  return { totalVials, missingVials, requiredCopies, ownedCopiesUsed, missingCopies: requiredCopies - ownedCopiesUsed, missing };
}

export function calculateAdvancedStats(deck, cardMap) {
  const main = deck instanceof Map ? getMainDeckMap(deck) : new Map(deck ?? []);
  const stats = {
    size: 0,
    playableT1: 0,
    playableT2: 0,
    playableT3: 0,
    draw: 0,
    removal: 0,
    heal: 0,
    ward: 0,
    finishers: 0,
    ramp: 0,
    boardClear: 0,
    earlyGame: 0,
    generate: 0,
    rush: 0,
    storm: 0
  };

  for (const [id, qtyValue] of main) {
    const card = cardMap.get(Number(id));
    const qty = Number(qtyValue) || 0;
    if (!card || qty <= 0) continue;
    stats.size += qty;
    const cost = Number(card.cost) || 0;
    if (cost <= 1) stats.playableT1 += qty;
    if (cost <= 2) stats.playableT2 += qty;
    if (cost <= 3) stats.playableT3 += qty;

    const roles = new Set(card.roles ?? []);
    const keywords = new Set(card.keywords ?? []);
    if (roles.has("Draw")) stats.draw += qty;
    if (roles.has("Removal")) stats.removal += qty;
    if (roles.has("Heal")) stats.heal += qty;
    if (roles.has("Finisher")) stats.finishers += qty;
    if (roles.has("Ramp")) stats.ramp += qty;
    if (roles.has("Board Clear")) stats.boardClear += qty;
    if (roles.has("Early Game")) stats.earlyGame += qty;
    if (roles.has("Generate")) stats.generate += qty;
    if (keywords.has("Ward")) stats.ward += qty;
    if (keywords.has("Rush")) stats.rush += qty;
    if (keywords.has("Storm")) stats.storm += qty;
  }

  return stats;
}

export function checkLegality({ deck, cardMap, selectedClass, format = "Rotation" }) {
  const errors = [];
  const warnings = [];
  const main = deck instanceof Map ? getMainDeckMap(deck) : new Map(deck ?? []);
  let size = 0;

  for (const [id, qtyValue] of main) {
    const card = cardMap.get(Number(id));
    const qty = Number(qtyValue) || 0;
    size += qty;
    if (!card) {
      errors.push(`Unknown card ID ${id}.`);
      continue;
    }
    if (!card.deckSelectable) errors.push(`${card.name} is a generated/token card.`);
    if (qty > Number(card.maxCopies ?? 3)) errors.push(`${card.name}: ${qty} copies exceeds the card limit.`);
    if (card.class !== "Neutral" && card.class !== selectedClass) errors.push(`${card.name} belongs to ${card.class}, not ${selectedClass}.`);
    if (format === "Rotation" && !(card.rotation || card.set === "Basic" || Number(card.setId) === 10000)) {
      errors.push(`${card.name} is not Rotation-legal.`);
    }
  }

  if (size !== 40) errors.push(`Main deck has ${size}/40 cards.`);
  if (format === "Unlimited") warnings.push("Unlimited ban/restriction data is not part of the imported CardList dataset; card-pool checks are therefore incomplete.");
  return { legal: errors.length === 0, errors, warnings, size };
}

export function probabilityAtLeastOne({ deckSize = 40, copies = 3, draws = 3 }) {
  const N = Math.max(0, Math.floor(deckSize));
  const K = Math.max(0, Math.min(N, Math.floor(copies)));
  const n = Math.max(0, Math.min(N, Math.floor(draws)));
  if (K === 0 || n === 0) return 0;
  if (N - K < n) return 1;
  return 1 - combination(N - K, n) / combination(N, n);
}

export function probabilityAtLeastOneAfterMulligan({ deckSize = 40, copies = 3, startingHand = 3, redraws = 3, extraDraws = 0 }) {
  const N = Math.max(1, Math.floor(deckSize));
  const K = Math.max(0, Math.min(N, Math.floor(copies)));
  const hand = Math.max(0, Math.min(N, Math.floor(startingHand)));
  const r = Math.max(0, Math.min(hand, Math.floor(redraws)));
  const extra = Math.max(0, Math.floor(extraDraws));
  if (K === 0) return 0;

  // Approximation suitable for planning: treat the redraw + later draws as fresh samples
  // from the deck after a miss in the original hand. It intentionally avoids assuming
  // undocumented client-specific mulligan ordering details.
  const missInitial = 1 - probabilityAtLeastOne({ deckSize: N, copies: K, draws: hand });
  const remainingN = Math.max(1, N - hand);
  const secondDraws = Math.min(remainingN, r + extra);
  const hitLater = probabilityAtLeastOne({ deckSize: remainingN, copies: K, draws: secondDraws });
  return 1 - missInitial * (1 - hitLater);
}

export function replacementScore(source, candidate) {
  if (!source || !candidate || source.id === candidate.id || !candidate.deckSelectable) return -Infinity;
  let score = 0;
  const sourceRoles = new Set(source.roles ?? []);
  const sourceKeywords = new Set(source.keywords ?? []);
  const sourceTraits = new Set((source.traits ?? []).filter(Boolean));
  for (const value of candidate.roles ?? []) if (sourceRoles.has(value)) score += 12;
  for (const value of candidate.keywords ?? []) if (sourceKeywords.has(value)) score += 7;
  for (const value of candidate.traits ?? []) if (sourceTraits.has(value)) score += 5;
  if (candidate.type === source.type) score += 4;
  score += Math.max(0, 4 - Math.abs(Number(candidate.cost) - Number(source.cost)));
  return score;
}

export function bestReplacements(source, cards, selectedClass, options = {}) {
  const owned = options.owned ?? null;
  const ownedOnly = Boolean(options.ownedOnly);
  return cards
    .filter(card => card.id !== source.id && card.deckSelectable)
    .filter(card => card.class === selectedClass || card.class === "Neutral")
    .filter(card => !ownedOnly || Number(owned?.get(card.id) ?? 0) > 0)
    .map(card => ({ card, score: replacementScore(source, card) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.card.cost - b.card.cost || a.card.name.localeCompare(b.card.name))
    .slice(0, options.limit ?? 8);
}

function combination(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= k; i++) result = result * (n - k + i) / i;
  return result;
}
