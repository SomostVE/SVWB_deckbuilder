import { state } from "./state.js";

export const CLASSES = [
  "Forestcraft",
  "Swordcraft",
  "Runecraft",
  "Dragoncraft",
  "Abysscraft",
  "Havencraft",
  "Portalcraft"
];

export function filteredCards() {
  const query = parseSearch(state.search);
  const discoverSource = state.discoverCardId ? state.cardMap.get(Number(state.discoverCardId)) : null;

  const cards = state.cards.filter(card => {
    const classMatch =
      card.class === state.selectedClass ||
      (state.includeNeutral && card.class === "Neutral");

    if (!classMatch) return false;
    if (!matchesFormat(card, state.format)) return false;
    if (!state.showGenerated && !card.deckSelectable) return false;

    const isExcluded = state.excluded.has(card.id) || state.globalExclusions.has(card.id);
    if (!state.showExcluded && isExcluded) return false;
    if (state.favoritesOnly && !state.favorites.has(card.id)) return false;

    if (!matchesAdvancedSearch(card, query)) return false;

    if (state.filters.costs.size && !matchesCostFilter(card.cost)) return false;
    if (state.filters.sets.size && !state.filters.sets.has(card.set)) return false;
    if (state.filters.types.size && !state.filters.types.has(card.type)) return false;
    if (state.filters.rarities.size && !state.filters.rarities.has(card.rarity)) return false;

    if (state.filters.traits.size) {
      const traits = new Set(card.traits ?? []);
      if (![...state.filters.traits].every(value => traits.has(value))) return false;
    }

    if (state.filters.keywords.size) {
      const keywords = new Set(card.keywords ?? []);
      if (![...state.filters.keywords].every(value => keywords.has(value))) return false;
    }

    if (discoverSource && card.id !== discoverSource.id && discoveryScore(discoverSource, card) <= 0) return false;

    return true;
  });

  if (discoverSource) {
    cards.sort((a, b) =>
      discoveryScore(discoverSource, b) - discoveryScore(discoverSource, a) ||
      a.cost - b.cost ||
      a.name.localeCompare(b.name)
    );
  }

  return cards;
}

export function matchesFormat(card, format = state.format) {
  if (!card) return false;
  if (format === "Rotation") return Boolean(card.rotation) || card.set === "Basic" || Number(card.setId) === 10000;
  // The official imported dataset currently has no Unlimited banned/restricted list.
  // Unlimited and Boundless therefore expose the same pool; legality reports explain this distinction.
  return true;
}

function matchesCostFilter(costValue) {
  const cost = Number(costValue) || 0;
  for (const bucket of state.filters.costs) {
    if (bucket === "10+" && cost >= 10) return true;
    if (bucket !== "10+" && cost === Number(bucket)) return true;
  }
  return false;
}

export function discoveryScore(source, candidate) {
  if (!source || !candidate || source.id === candidate.id) return source?.id === candidate?.id ? 1000 : 0;
  let score = 0;

  if ((source.relations ?? []).some(relation => Number(relation.id) === candidate.id)) score += 100;
  if ((candidate.relations ?? []).some(relation => Number(relation.id) === source.id)) score += 80;
  if ((source.generatedBy ?? []).includes(candidate.id)) score += 90;
  if ((candidate.generatedBy ?? []).includes(source.id)) score += 90;

  const sourcePackages = new Set(source.packages ?? []);
  for (const packageId of candidate.packages ?? []) if (sourcePackages.has(packageId)) score += 50;

  const sourceTraits = new Set(source.traits ?? []);
  for (const trait of candidate.traits ?? []) if (sourceTraits.has(trait) && trait !== "-") score += 20;

  const sourceKeywords = new Set(source.keywords ?? []);
  for (const keyword of candidate.keywords ?? []) if (sourceKeywords.has(keyword)) score += 5;

  const sourceRoles = new Set(source.roles ?? []);
  for (const role of candidate.roles ?? []) if (sourceRoles.has(role)) score += 3;

  return score;
}

function parseSearch(value) {
  let remaining = String(value ?? "");
  const filters = { roles: [], traits: [], keywords: [], sets: [], related: [] };
  const pattern = /\b(role|trait|keyword|set|related):(?:"([^"]+)"|'([^']+)'|([^\s]+))/gi;

  remaining = remaining.replace(pattern, (_, type, quotedDouble, quotedSingle, bare) => {
    const raw = quotedDouble ?? quotedSingle ?? bare ?? "";
    const normalized = raw.trim().toLowerCase();
    if (!normalized) return " ";

    if (type.toLowerCase() === "role") filters.roles.push(normalized);
    if (type.toLowerCase() === "trait") filters.traits.push(normalized);
    if (type.toLowerCase() === "keyword") filters.keywords.push(normalized);
    if (type.toLowerCase() === "set") filters.sets.push(normalized);
    if (type.toLowerCase() === "related") filters.related.push(normalized);
    return " ";
  });

  filters.free = remaining.trim().toLowerCase();
  return filters;
}

function matchesAdvancedSearch(card, query) {
  const roles = (card.roles ?? []).map(lower);
  const traits = (card.traits ?? []).map(lower);
  const keywords = (card.keywords ?? []).map(lower);

  if (query.roles.length && !query.roles.every(value => roles.some(role => role.includes(value)))) return false;
  if (query.traits.length && !query.traits.every(value => traits.some(trait => trait.includes(value)))) return false;
  if (query.keywords.length && !query.keywords.every(value => keywords.some(keyword => keyword.includes(value)))) return false;
  if (query.sets.length && !query.sets.every(value => lower(card.set).includes(value))) return false;

  if (query.related.length) {
    for (const wanted of query.related) {
      const target = state.cards.find(candidate => lower(candidate.name) === wanted || lower(candidate.name).includes(wanted));
      if (!target) return false;
      const linked =
        card.id === target.id ||
        (card.relations ?? []).some(relation => Number(relation.id) === target.id) ||
        (target.relations ?? []).some(relation => Number(relation.id) === card.id) ||
        (card.generatedBy ?? []).includes(target.id) ||
        (target.generatedBy ?? []).includes(card.id);
      if (!linked) return false;
    }
  }

  if (query.free) {
    const haystack = [
      card.name,
      card.text,
      card.set,
      card.class,
      card.type,
      card.rarity,
      ...(card.traits ?? []),
      ...(card.keywords ?? []),
      ...(card.roles ?? []),
      ...(card.customTags ?? [])
    ].join(" ").toLowerCase();

    if (!haystack.includes(query.free)) return false;
  }

  return true;
}

function lower(value) {
  return String(value ?? "").toLowerCase();
}
