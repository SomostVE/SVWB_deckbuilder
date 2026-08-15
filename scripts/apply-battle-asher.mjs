import fs from "node:fs/promises";

const rulesUrl = new URL("../js/battle-rules.js", import.meta.url);
const engineUrl = new URL("../js/battle-engine-v4.js", import.meta.url);

let rules = await fs.readFile(rulesUrl, "utf8");
let engine = await fs.readFile(engineUrl, "utf8");

const triggerMarker = "// [[battle-natural-evolve-trigger-v5]]";
if (!rules.includes(triggerMarker)) {
  const oldFunction = `export function getTriggeredText(card, event, mode = null) {\n  // Lifecycle events are emitted centrally by the battle engine. Injecting\n  // destruction/turn-end hooks here made those events run once per unit text\n  // and then again through the engine's explicit event dispatch.\n  return core.getTriggeredText(card, event, mode);\n}`;
  if (!rules.includes(oldFunction)) throw new Error("getTriggeredText wrapper anchor not found");
  const replacement = `export function getTriggeredText(card, event, mode = null) {\n  // Lifecycle events are emitted centrally by the battle engine. Injecting\n  // destruction/turn-end hooks here made those events run once per unit text\n  // and then again through the engine's explicit event dispatch.\n  const base = core.getTriggeredText(card, event, mode);\n  if (base) return base;\n  ${triggerMarker}\n  if (event === "evolve") {\n    const text = String(card?.text ?? "").toLowerCase().replace(/[’‘]/g, "'").replace(/\\s+/g, " ").trim();\n    const reactive = text.match(/when this follower evolves,\\s*([^.]*(?:\\.|$))/i);\n    if (reactive) return reactive[1].trim();\n  }\n  return "";\n}`;
  rules = rules.replace(oldFunction, replacement);
}

const asherMarker = "// [[battle-asher-v5]]";
if (!rules.includes(asherMarker)) {
  const anchor = "  // [[battle-ability-evolve-v5]]";
  if (!rules.includes(anchor)) throw new Error("Asher insertion anchor not found");
  const block = `  ${asherMarker}\n  if (cardName === "asher & lydia, paths beyond") {\n    const enemyWard = /select an enemy follower on the field and give it Ward\\.?/i;\n    if (enemyWard.test(text)) {\n      const target = context.chooseEnemyFollower?.(context.opponent.board) ?? null;\n      if (target && giveUnitKeyword(target, "Ward")) actions.push(\`Asher & Lydia: give Ward to ${'${target.name}'}\`);\n      text = text.replace(enemyWard, " ");\n      applied = true;\n    }\n\n    const enhanceSelf = /evolve this follower and give it Storm\\.?/i;\n    if (enhanceSelf.test(text)) {\n      if (context.sourceUnit) {\n        context.evolveUnitByAbility?.(context.sourceUnit);\n        giveUnitKeyword(context.sourceUnit, "Storm");\n        actions.push("Asher & Lydia: evolve and gain Storm");\n      }\n      text = text.replace(enhanceSelf, " ");\n      applied = true;\n    }\n\n    const destroyWards = /destroy 2 random enemy followers with Ward\\.?/i;\n    if (destroyWards.test(text)) {\n      const candidates = context.opponent.board.filter(unit => unit.type === "Follower" && hasKeyword(unit, "Ward"));\n      const destroyed = [];\n      for (let index = 0; index < 2 && candidates.length; index += 1) {\n        const roll = Math.max(0, Math.min(candidates.length - 1, Math.floor((context.rng?.() ?? 0) * candidates.length)));\n        const [target] = candidates.splice(roll, 1);\n        target.defense = 0;\n        destroyed.push(target.name);\n      }\n      if (destroyed.length) context.cleanup?.(context.opponent, context.enemyIndex);\n      if (destroyed.length) actions.push(\`Asher & Lydia: destroy ${'${destroyed.join(" + ")}'}\`);\n      text = text.replace(destroyWards, " ");\n      applied = true;\n    }\n  }\n\n`;
  rules = rules.replace(anchor, `${block}${anchor}`);
}

engine = engine.replace(/^\s*\["asher & lydia, paths beyond",\s*"[^"]+"\],?\r?\n/mi, "");

await fs.writeFile(rulesUrl, rules);
await fs.writeFile(engineUrl, engine);
console.log("Asher & Lydia rules materialized.");
