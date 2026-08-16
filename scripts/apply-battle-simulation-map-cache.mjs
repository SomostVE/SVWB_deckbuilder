import fs from "node:fs";

const path = "js/battle-engine-v5.js";
let source = fs.readFileSync(path, "utf8");

const cacheMarker = "const SIMULATION_CARD_MAP_CACHE = new WeakMap();";
if (!source.includes(cacheMarker)) {
  source = source.replace(
    'const GAP_HOOK = "[[battle-rule-gap-hook]]";\n',
    'const GAP_HOOK = "[[battle-rule-gap-hook]]";\nconst SIMULATION_CARD_MAP_CACHE = new WeakMap();\n'
  );
}

const before = `function prepareSimulationCardMap(cardMap) {\n  prepareOriginalCardMap(cardMap);\n  const prepared = new Map();`;
const after = `function prepareSimulationCardMap(cardMap) {\n  const cached = cardMap && typeof cardMap === "object" ? SIMULATION_CARD_MAP_CACHE.get(cardMap) : null;\n  if (cached) return cached;\n\n  prepareOriginalCardMap(cardMap);\n  const prepared = new Map();`;
if (!source.includes(after)) {
  if (!source.includes(before)) throw new Error("prepareSimulationCardMap start not found");
  source = source.replace(before, after);
}

const endBefore = `  for (const card of prepared.values()) {\n    card.__relatedCardObjects = (card.relatedCards ?? []).map(id => prepared.get(Number(id))).filter(Boolean);\n    card.__relatedNames = card.__relatedCardObjects.map(item => item.name);\n  }\n  return prepared;\n}`;
const endAfter = `  for (const card of prepared.values()) {\n    card.__relatedCardObjects = (card.relatedCards ?? []).map(id => prepared.get(Number(id))).filter(Boolean);\n    card.__relatedNames = card.__relatedCardObjects.map(item => item.name);\n  }\n  if (cardMap && typeof cardMap === "object") SIMULATION_CARD_MAP_CACHE.set(cardMap, prepared);\n  return prepared;\n}`;
if (!source.includes(endAfter)) {
  if (!source.includes(endBefore)) throw new Error("prepareSimulationCardMap end not found");
  source = source.replace(endBefore, endAfter);
}

fs.writeFileSync(path, source);
console.log("Battle Sim simulation-card map cache materialized.");
