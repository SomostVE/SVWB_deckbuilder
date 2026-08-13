export function analyzeDeck(cards, deck, cardMap) {
  const curve = Array.from({ length: 11 }, () => 0);
  const types = new Map();
  const keywords = new Map();
  const roles = new Map();
  const traits = new Map();
  const generated = new Map();
  const deckCards = [];

  let size = 0;
  let highCost = 0;

  for (const [id, qtyValue] of deck.entries()) {
    const card = cardMap.get(Number(id));
    const qty = Number(qtyValue) || 0;
    if (!card || qty <= 0) continue;

    deckCards.push({ card, qty });
    size += qty;
    const bucket = Math.min(10, Math.max(0, Number(card.cost) || 0));
    curve[bucket] += qty;
    if (Number(card.cost) >= 7) highCost += qty;

    increment(types, card.type, qty);
    for (const keyword of card.keywords ?? []) increment(keywords, keyword, qty);
    for (const role of card.roles ?? []) increment(roles, role, qty);
    for (const trait of card.traits ?? []) increment(traits, trait, qty);

    for (const relation of card.relations ?? []) {
      if (relation.type !== "Generates") continue;
      const target = cardMap.get(Number(relation.id));
      if (!target) continue;

      const item = generated.get(target.id) ?? {
        card: target,
        producers: [],
        producerCopies: 0,
        consumers: []
      };
      item.producers.push({ card, qty });
      item.producerCopies += qty;
      generated.set(target.id, item);
    }
  }

  for (const dependency of generated.values()) {
    const targetName = normalize(dependency.card.name);
    for (const { card, qty } of deckCards) {
      if (dependency.producers.some(entry => entry.card.id === card.id)) continue;
      if (mentions(normalize(card.text), targetName)) {
        dependency.consumers.push({ card, qty });
      }
    }
  }

  const warnings = buildWarnings({ size, roles, curve, highCost, types });

  return {
    size,
    curve,
    types: sortedMap(types),
    keywords: sortedMap(keywords),
    roles: sortedMap(roles),
    traits: sortedMap(traits),
    warnings,
    dependencies: [...generated.values()].sort((a, b) => b.producerCopies - a.producerCopies)
  };
}

export function compareDecks(leftVariant, rightVariant, cardMap) {
  const left = new Map((leftVariant?.deck ?? []).map(([id, qty]) => [Number(id), Number(qty)]));
  const right = new Map((rightVariant?.deck ?? []).map(([id, qty]) => [Number(id), Number(qty)]));
  const ids = new Set([...left.keys(), ...right.keys()]);
  const changes = [];

  for (const id of ids) {
    const card = cardMap.get(id);
    if (!card) continue;
    const a = left.get(id) ?? 0;
    const b = right.get(id) ?? 0;
    if (a === b) continue;
    changes.push({ card, left: a, right: b, delta: b - a });
  }

  changes.sort((a, b) => a.card.cost - b.card.cost || a.card.name.localeCompare(b.card.name));
  return changes;
}

function buildWarnings({ size, roles, curve, highCost, types }) {
  const warnings = [];
  const early = roles.get("Early Game") ?? 0;
  const draw = roles.get("Draw") ?? 0;
  const removal = roles.get("Removal") ?? 0;
  const finisher = roles.get("Finisher") ?? 0;
  const boardClear = roles.get("Board Clear") ?? 0;

  if (size < 40) warnings.push({ level: "info", text: `${40 - size} slots remaining.` });
  if (size > 0 && early < 8) warnings.push({ level: "warn", text: `Only ${early} early-game card copies detected.` });
  if (size >= 20 && draw < 4) warnings.push({ level: "warn", text: `Low draw density: ${draw} card copies tagged Draw.` });
  if (size >= 20 && removal < 4) warnings.push({ level: "warn", text: `Low removal density: ${removal} card copies tagged Removal.` });
  if (size >= 30 && finisher < 2) warnings.push({ level: "warn", text: `Few obvious finishers detected.` });
  if (highCost >= 10) warnings.push({ level: "warn", text: `${highCost} cards cost 7 or more; the curve is top-heavy.` });
  if (size >= 30 && boardClear === 0) warnings.push({ level: "info", text: `No obvious board-clear card detected.` });
  if ((types.get("Follower") ?? 0) === 0 && size > 0) warnings.push({ level: "info", text: `This deck currently contains no followers.` });

  return warnings;
}

function increment(map, key, amount) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + amount);
}

function sortedMap(map) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

function normalize(value) {
  return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function mentions(text, name) {
  if (!text || !name) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text);
}
