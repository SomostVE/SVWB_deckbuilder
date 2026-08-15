import * as v3 from "./battle-engine-v3.js";

export * from "./battle-engine-v3.js";

export const BATTLE_RULES_VERSION = 4;

const ENTRY_HOOK = "[[battle-entry-hook]]";
const GAP_HOOK = "[[battle-rule-gap-hook]]";
const SPELL_HOOK = "[[battle-spell-play-hook]]";
const FULL_OVERRIDES = new Map([
  ["wilbert, desolate paladin", "Persistent Ward-entry Crest is modeled"],
  ["grimnir, heavenly gale", "Persistent Crest turn-end trigger is modeled"],
  ["sincerity of the dewdrop", "Field transform into Imari's Little Buddies is modeled"],
  ["sarissa, luxspear al-mi'raj", "Ward-destruction trigger and Evolve Barrier are modeled"],
  ["knight of the holy order", "On-field stat-buff healing trigger is modeled"],
  ["brazen broadcaster", "Artifact entry Rush, Fanfare and Enhance summons are modeled"],
  ["zwei, symphonic heart", "Puppetry entry Ward, Fanfare and Evolve summons are modeled"],
  ["orchis, newfound heart", "Puppetry entry Storm/Bane, Fanfare and Super-Evolve summons are modeled"],
  ["imari, dewdrop", "Discard/search, spell-play summon and Super-Evolve spell search are modeled"],
  ["analyzing artifact", "Self-entry draw trigger is modeled"]
]);

const HANDLED_REACTIVE_CLAUSES = [
  /Whenever an allied Puppetry follower enters the field, give it Storm and Bane\.?/gi,
  /Whenever an allied Puppetry follower enters the field, give it Ward\.?/gi,
  /Whenever an allied Artifact follower enters the field, give it Rush\.?/gi,
  /Whenever you play a spell, if this follower is evolved, summon an Imari's Little Buddies\.?/gi,
  /Whenever an allied follower with Ward is destroyed, give this follower \+1\/\+1\.?/gi,
  /Whenever this follower is given \+ attack or defense on the field, restore 1 defense to your leader\.?/gi
];

export function simulateBattle(options) {
  const originalMap = options.cardMap;
  const simulationMap = prepareSimulationCardMap(originalMap);
  const result = v3.simulateBattle({ ...options, cardMap: simulationMap });
  const coverage = [
    analyzeDeckCoverage(options.playerDeck, originalMap),
    analyzeDeckCoverage(options.opponentDeck, originalMap)
  ];
  result.coverage = coverage;
  if (result.summary) result.summary.experimental = coverage.some(item => item.unsupported || item.partial);
  return result;
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
    partialCards: unique(partialCards).slice(0, 18),
    unsupportedCards: unique(unsupportedCards).slice(0, 18),
    mechanics: [...mechanics].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([name, count]) => ({ name, count }))
  };
}

export function analyzeCardSupport(card) {
  const base = v3.analyzeCardSupport(card);
  if (!card || base.level !== "partial") return base;
  const override = FULL_OVERRIDES.get(normalize(card.name));
  return override ? { ...base, level: "full", reason: `Battle Sim v4: ${override}` } : base;
}

export const inspectEffectiveCost = v3.inspectEffectiveCost;

function prepareSimulationCardMap(cardMap) {
  const prepared = new Map();
  prepareOriginalCardMap(cardMap);
  for (const [id, card] of cardMap.entries()) {
    if (!card) continue;
    const support = analyzeCardSupport(card);
    let text = sanitizeHandledReactiveText(card.text);
    text = adaptMixedSkyboundText(card, text);
    text = expandEnhanceWithBaseFanfare(text);
    const hooks = [];
    if (card.type === "Follower") hooks.push(ENTRY_HOOK);
    if (support.level !== "full") hooks.push(GAP_HOOK);
    text = injectHooks(text, hooks);
    text = injectSpellHooks(text, card);
    prepared.set(Number(id), {
      ...card,
      keywords: [...(card.keywords ?? [])],
      traits: [...(card.traits ?? [])],
      relatedCards: [...(card.relatedCards ?? [])],
      text
    });
  }
  for (const card of prepared.values()) {
    card.__relatedCardObjects = (card.relatedCards ?? []).map(id => prepared.get(Number(id))).filter(Boolean);
  }
  return prepared;
}

function sanitizeHandledReactiveText(textValue) {
  let text = String(textValue ?? "");
  for (const pattern of HANDLED_REACTIVE_CLAUSES) text = text.replace(pattern, " ");
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function adaptMixedSkyboundText(card, textValue) {
  let text = String(textValue ?? "");
  const name = normalize(card?.name);
  if (name === "vira, luminous primal knight") {
    text = text.replace(/Super Skybound Art\s*[-–—:]\s*Super-evolve this follower\.?/i, "[[battle-super-skybound-self:15]]");
  }
  if (name === "lu woh, light personified") {
    text = text.replace(/Skybound Art\s*[-–—:]\s*Gain Crest\s*:\s*Lu Woh, Light Personified\.?/i, "[[battle-skybound-crest:10:Lu Woh, Light Personified]]");
  }
  return text;
}

function expandEnhanceWithBaseFanfare(textValue) {
  const text = String(textValue ?? "");
  const fanfare = text.match(/\bFanfare\s*:\s*([\s\S]*?)(?=\b(?:Enhance\s*\(?\s*\d+\s*\)?|Accelerate\s*\(?\s*\d+\s*\)?|Last Words|Strike|Clash|Evolve|Super-Evolve|Engage|On Spellboost|At the start of your turn|At the end of your turn)\s*:|$)/i)?.[1]?.trim();
  if (!fanfare || !/\bEnhance\s*\(?\s*\d+\s*\)?\s*:/i.test(text)) return text;
  return text.replace(/\bEnhance\s*\(?\s*(\d+)\s*\)?\s*:/gi, match => `${match} ${fanfare} `);
}

function injectHooks(textValue, hooks) {
  if (!hooks.length) return String(textValue ?? "");
  const text = String(textValue ?? "");
  const hookText = hooks.join(" ");
  if (/\bFanfare\s*:/i.test(text)) return text.replace(/\bFanfare\s*:/i, match => `${match} ${hookText} `);
  return `${hookText}${text ? ` ${text}` : ""}`.trim();
}

function injectSpellHooks(textValue, card) {
  let text = String(textValue ?? "");
  if (card.type === "Spell") {
    text = `${SPELL_HOOK} ${text}`.trim();
    text = text.replace(/\bEnhance\s*\(?\s*\d+\s*\)?\s*:/gi, match => `${match} ${SPELL_HOOK} `);
  }
  if (/\bAccelerate\s*\(?\s*\d+\s*\)?\s*:/i.test(text)) {
    text = text.replace(/\bAccelerate\s*\(?\s*\d+\s*\)?\s*:/gi, match => `${match} ${SPELL_HOOK} `);
  }
  return text;
}

function prepareOriginalCardMap(cardMap) {
  if (!(cardMap instanceof Map)) return;
  for (const card of cardMap.values()) {
    if (!card || Array.isArray(card.__relatedNames)) continue;
    card.__relatedNames = (card.relatedCards ?? []).map(id => cardMap.get(Number(id))?.name).filter(Boolean);
  }
}

function normalizeDeck(deck) {
  if (deck instanceof Map) return [...deck.entries()].map(([id, qty]) => [Number(id), Number(qty)]);
  if (!Array.isArray(deck)) return [];
  return deck.map(entry => Array.isArray(entry)
    ? [Number(entry[0]), Number(entry[1])]
    : [Number(entry.cardId ?? entry.id), Number(entry.qty ?? entry.quantity ?? 1)])
    .filter(([id, qty]) => Number.isFinite(id) && qty > 0);
}

function normalize(value) { return String(value ?? "").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim(); }
function unique(values) { return [...new Set(values.map(String).filter(Boolean))]; }
