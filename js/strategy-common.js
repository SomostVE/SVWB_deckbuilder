import { getMainDeckMap } from "./tools-common.js";

export function getPairConnection(a, b) {
  if (!a || !b || Number(a.id) === Number(b.id)) return { score: 0, reasons: [] };
  let score = 0;
  const reasons = [];

  const aToB = (a.relations ?? []).filter(relation => Number(relation.id) === Number(b.id));
  const bToA = (b.relations ?? []).filter(relation => Number(relation.id) === Number(a.id));
  const generation = [...aToB, ...bToA].some(relation => relation.type === "Generates")
    || (a.generatedBy ?? []).includes(Number(b.id))
    || (b.generatedBy ?? []).includes(Number(a.id));
  const direct = aToB.length || bToA.length;

  if (generation) {
    score += 8;
    reasons.push("generated-card link");
  } else if (direct) {
    score += 5;
    reasons.push("official relation");
  }

  const packagesA = new Set((a.packages ?? []).map(String));
  const sharedPackages = (b.packages ?? []).filter(value => packagesA.has(String(value)));
  if (sharedPackages.length) {
    score += 6;
    reasons.push("same package");
  }

  const traitsA = new Set((a.traits ?? []).filter(value => value && value !== "-"));
  const sharedTraits = (b.traits ?? []).filter(value => traitsA.has(value) && value !== "-");
  if (sharedTraits.length) {
    score += Math.min(6, sharedTraits.length * 3);
    reasons.push(`trait: ${sharedTraits.slice(0, 2).join(", ")}`);
  }

  const rolesA = new Set(a.roles ?? []);
  const sharedRoles = (b.roles ?? []).filter(value => rolesA.has(value));
  if (sharedRoles.length) {
    score += Math.min(4, sharedRoles.length * 1.5);
    reasons.push(`role: ${sharedRoles.slice(0, 2).join(", ")}`);
  }

  const keywordsA = new Set(a.keywords ?? []);
  const sharedKeywords = (b.keywords ?? []).filter(value => keywordsA.has(value));
  if (sharedKeywords.length) {
    score += Math.min(2, sharedKeywords.length);
    reasons.push(`keyword: ${sharedKeywords.slice(0, 2).join(", ")}`);
  }

  return { score, reasons };
}

export function getCardSynergy(card, deck, cardMap) {
  const main = deck instanceof Map ? getMainDeckMap(deck) : new Map(deck ?? []);
  const peers = [];
  for (const [id] of main) {
    const other = cardMap.get(Number(id));
    if (!other || Number(other.id) === Number(card.id)) continue;
    const connection = getPairConnection(card, other);
    if (connection.score > 0) peers.push({ card: other, ...connection });
  }

  peers.sort((a, b) => b.score - a.score || a.card.name.localeCompare(b.card.name));
  const best = peers[0]?.score ?? 0;
  const total = peers.slice(0, 4).reduce((sum, item) => sum + item.score, 0);
  const level = best >= 8 || total >= 15
    ? "Strong"
    : best >= 4 || total >= 7
      ? "Medium"
      : "Weak";

  return { level, best, total, peers };
}

export function buildEngineIndex(state) {
  const pool = state.cards.filter(card =>
    card.deckSelectable &&
    (card.class === state.selectedClass || (state.includeNeutral && card.class === "Neutral"))
  );
  const result = [];

  const byTrait = new Map();
  for (const card of pool) {
    for (const trait of card.traits ?? []) {
      if (!trait || trait === "-") continue;
      if (!byTrait.has(trait)) byTrait.set(trait, []);
      byTrait.get(trait).push(card);
    }
  }
  for (const [name, cards] of byTrait) {
    if (cards.length >= 2) result.push({ kind: "archetype", name, cards: uniqueCards(cards), generated: [] });
  }

  const tokenSignatures = new Map();
  for (const token of state.cards.filter(card => !card.deckSelectable)) {
    const parents = pool.filter(card =>
      (card.relations ?? []).some(relation => Number(relation.id) === Number(token.id)) ||
      (token.generatedBy ?? []).includes(Number(card.id))
    );
    if (parents.length < 2) continue;
    const sig = signature(parents);
    const existing = tokenSignatures.get(sig);
    if (existing) {
      existing.generated.push(token);
      continue;
    }
    const item = { kind: "detected", name: `${token.name} engine`, cards: uniqueCards(parents), generated: [token] };
    tokenSignatures.set(sig, item);
    result.push(item);
  }

  for (const item of tokenSignatures.values()) {
    if (item.generated.length > 1) {
      const names = item.generated.map(card => card.name);
      item.name = names.length === 2
        ? `${names[0]} / ${names[1]} engine`
        : `${names[0]} +${names.length - 1} generated engine`;
    }
  }

  const poolIds = new Set(pool.map(card => Number(card.id)));
  const adjacency = new Map(pool.map(card => [Number(card.id), new Set()]));
  for (const card of pool) {
    for (const relation of card.relations ?? []) {
      const targetId = Number(relation.id);
      if (!poolIds.has(targetId)) continue;
      adjacency.get(Number(card.id))?.add(targetId);
      adjacency.get(targetId)?.add(Number(card.id));
    }
  }

  const knownSignatures = new Set(result.map(item => signature(item.cards)));
  const visited = new Set();
  for (const card of pool) {
    const start = Number(card.id);
    if (visited.has(start)) continue;
    const ids = [];
    const stack = [start];
    visited.add(start);
    while (stack.length) {
      const id = stack.pop();
      ids.push(id);
      for (const next of adjacency.get(id) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        stack.push(next);
      }
    }
    if (ids.length < 2 || ids.length > 12) continue;
    const cards = ids.map(id => state.cardMap.get(id)).filter(Boolean);
    const sig = signature(cards);
    if (knownSignatures.has(sig)) continue;
    const commonTrait = findCommonTrait(cards);
    if (commonTrait && byTrait.get(commonTrait)?.length >= 2) continue;
    knownSignatures.add(sig);
    result.push({
      kind: "detected",
      name: commonTrait ? `${commonTrait} linked package` : `${sortCards(cards)[0].name} linked package`,
      cards: uniqueCards(cards),
      generated: []
    });
  }

  for (const packageDef of state.packages ?? []) {
    const entries = normalizePackageCards(packageDef.cards)
      .map(entry => ({ ...entry, card: state.cardMap.get(entry.id) }))
      .filter(entry => entry.card)
      .filter(entry => entry.card.class === state.selectedClass || (state.includeNeutral && entry.card.class === "Neutral"));
    if (!entries.length) continue;
    result.push({
      kind: "curated",
      name: packageDef.name ?? packageDef.id ?? "Package",
      cards: uniqueCards(entries.map(entry => entry.card)),
      entries,
      generated: []
    });
  }

  return [...new Map(result.map(item => [item.name, item])).values()];
}

export function getEngineOverlaps(engines, minimumShared = 2) {
  const overlaps = [];
  for (let i = 0; i < engines.length; i++) {
    const left = engines[i];
    const leftIds = new Set(left.cards.map(card => Number(card.id)));
    for (let j = i + 1; j < engines.length; j++) {
      const right = engines[j];
      const shared = right.cards.filter(card => leftIds.has(Number(card.id)));
      if (shared.length < minimumShared) continue;
      const smaller = Math.max(1, Math.min(left.cards.length, right.cards.length));
      overlaps.push({ left, right, shared, ratio: shared.length / smaller });
    }
  }
  return overlaps.sort((a, b) =>
    b.shared.length - a.shared.length ||
    b.ratio - a.ratio ||
    a.left.name.localeCompare(b.left.name)
  );
}

export function getNewSetImpact(state, engines = buildEngineIndex(state)) {
  const newCards = state.cards.filter(card =>
    card.newlyAdded &&
    card.deckSelectable &&
    (card.class === state.selectedClass || (state.includeNeutral && card.class === "Neutral"))
  );
  const engineCardIds = new Set(engines.flatMap(engine => engine.cards.map(card => Number(card.id))));
  const related = newCards.filter(card => engineCardIds.has(Number(card.id)));
  const bySet = new Map();
  for (const card of newCards) {
    if (!bySet.has(card.set)) bySet.set(card.set, []);
    bySet.get(card.set).push(card);
  }
  return { newCards, related, bySet };
}

export function getComboStages(source, state) {
  if (!source) return { creates: [], uses: [], payoffs: [], related: [] };
  const creates = uniqueCards((source.relations ?? [])
    .filter(relation => relation.type === "Generates")
    .map(relation => state.cardMap.get(Number(relation.id)))
    .filter(Boolean));

  const createdIds = new Set(creates.map(card => Number(card.id)));
  const uses = uniqueCards(state.cards.filter(card =>
    card.deckSelectable && Number(card.id) !== Number(source.id) &&
    (createdIds.size
      ? (card.relations ?? []).some(relation => createdIds.has(Number(relation.id)))
      : (card.relations ?? []).some(relation => Number(relation.id) === Number(source.id)))
  ));

  const payoffPool = uses.length ? uses : state.cards.filter(card => card.deckSelectable);
  const sourceTraitSet = new Set((source.traits ?? []).filter(value => value && value !== "-"));
  const payoffs = uniqueCards(payoffPool.filter(card =>
    (card.roles ?? []).includes("Finisher") ||
    ((card.roles ?? []).includes("Combo Piece") && (card.traits ?? []).some(trait => sourceTraitSet.has(trait)))
  ));

  const seen = new Set([Number(source.id), ...creates.map(card => Number(card.id)), ...uses.map(card => Number(card.id)), ...payoffs.map(card => Number(card.id))]);
  const related = uniqueCards((source.relations ?? [])
    .map(relation => state.cardMap.get(Number(relation.id)))
    .filter(Boolean)
    .filter(card => !seen.has(Number(card.id))));

  return {
    creates: sortCards(creates),
    uses: sortCards(uses),
    payoffs: sortCards(payoffs),
    related: sortCards(related)
  };
}

export function normalizePackageCards(cards) {
  return (cards ?? []).map(entry => typeof entry === "number" || typeof entry === "string"
    ? { id: Number(entry), count: 1 }
    : { id: Number(entry.id), count: Number(entry.count ?? entry.quantity ?? 1) }
  ).filter(entry => Number.isFinite(entry.id));
}

export function sortCards(cards) {
  return [...cards].sort((a, b) => Number(a.cost) - Number(b.cost) || a.name.localeCompare(b.name));
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function escapeAttr(value) {
  return escapeHtml(value);
}

function signature(cards) {
  return cards.map(card => Number(card.id)).sort((a, b) => a - b).join(",");
}

function findCommonTrait(cards) {
  if (!cards.length) return null;
  const first = (cards[0].traits ?? []).filter(value => value && value !== "-");
  return first.find(trait => cards.every(card => (card.traits ?? []).includes(trait))) ?? null;
}

function uniqueCards(cards) {
  return [...new Map(cards.map(card => [Number(card.id), card])).values()];
}
