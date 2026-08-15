import * as v3 from "./battle-engine-v3.js";

export * from "./battle-engine-v3.js";

export const BATTLE_RULES_VERSION = 4;

const ENTRY_HOOK = "[[battle-entry-hook]]";
const GAP_HOOK = "[[battle-rule-gap-hook]]";
const FULL_OVERRIDES = new Map([
  ["wilbert, desolate paladin", "Persistent Ward-entry Crest is modeled"],
  ["grimnir, heavenly gale", "Persistent Crest turn-end trigger is modeled"]
]);

export function simulateBattle(options) {
  const originalMap = options.cardMap;
  const simulationMap = prepareSimulationCardMap(originalMap);
  const result = v3.simulateBattle({ ...options, cardMap: simulationMap });
  const coverage = [
    analyzeDeckCoverage(options.playerDeck, originalMap),
    analyzeDeckCoverage(options.opponentDeck, originalMap)
  ];
  result.coverage = coverage;
  if (result.summary) {
    result.summary.experimental = coverage.some(item => item.unsupported || item.partial);
  }
  return result;
}

export function analyzeDeckCoverage(deck, cardMap) {
  prepareOriginalCardMap(cardMap);
  let total = 0;
  let full = 0;
  let partial = 0;
  let unsupported = 0;
  const partialCards = [];
  const unsupportedCards = [];
  const mechanics = new Map();

  for (const [id, qty] of normalizeDeck(deck)) {
    const card = cardMap.get(Number(id));
    const count = Number(qty) || 0;
    total += count;
    const support = analyzeCardSupport(card);
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
    modeledPercent: total ? Math.round((full + partial * .72) / total * 100) : 0,
    partialCards: unique(partialCards).slice(0, 18),
    unsupportedCards: unique(unsupportedCards).slice(0, 18),
    mechanics: [...mechanics]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14)
      .map(([name, count]) => ({ name, count }))
  };
}

export function analyzeCardSupport(card) {
  const base = v3.analyzeCardSupport(card);
  if (!card || base.level !== "partial") return base;
  const override = FULL_OVERRIDES.get(normalize(card.name));
  if (!override) return base;
  return { ...base, level: "full", reason: `Battle Sim v4: ${override}` };
}

export const inspectEffectiveCost = v3.inspectEffectiveCost;

function prepareSimulationCardMap(cardMap) {
  const prepared = new Map();
  prepareOriginalCardMap(cardMap);
  for (const [id, card] of cardMap.entries()) {
    if (!card) continue;
    const support = analyzeCardSupport(card);
    const hooks = [];
    if (card.type === "Follower") hooks.push(ENTRY_HOOK);
    if (support.level !== "full") hooks.push(GAP_HOOK);
    prepared.set(Number(id), {
      ...card,
      keywords: [...(card.keywords ?? [])],
      traits: [...(card.traits ?? [])],
      relatedCards: [...(card.relatedCards ?? [])],
      text: injectHooks(card.text, hooks)
    });
  }
  return prepared;
}

function injectHooks(textValue, hooks) {
  if (!hooks.length) return String(textValue ?? "");
  const text = String(textValue ?? "");
  const hookText = hooks.join(" ");
  if (/\bFanfare\s*:/i.test(text)) {
    return text.replace(/\bFanfare\s*:/i, match => `${match} ${hookText} `);
  }
  return `${hookText}${text ? ` ${text}` : ""}`.trim();
}

function prepareOriginalCardMap(cardMap) {
  if (!(cardMap instanceof Map)) return;
  for (const card of cardMap.values()) {
    if (!card || Array.isArray(card.__relatedNames)) continue;
    card.__relatedNames = (card.relatedCards ?? [])
      .map(id => cardMap.get(Number(id))?.name)
      .filter(Boolean);
  }
}

function normalizeDeck(deck) {
  if (deck instanceof Map) return [...deck.entries()].map(([id, qty]) => [Number(id), Number(qty)]);
  if (!Array.isArray(deck)) return [];
  return deck
    .map(entry => Array.isArray(entry)
      ? [Number(entry[0]), Number(entry[1])]
      : [Number(entry.cardId ?? entry.id), Number(entry.qty ?? entry.quantity ?? 1)])
    .filter(([id, qty]) => Number.isFinite(id) && qty > 0);
}

function normalize(value) {
  return String(value ?? "").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values.map(String).filter(Boolean))];
}
