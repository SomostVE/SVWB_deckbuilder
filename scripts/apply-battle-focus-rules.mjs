import fs from "node:fs/promises";

const rulesUrl = new URL("../js/battle-rules.js", import.meta.url);
const engineUrl = new URL("../js/battle-engine-v4.js", import.meta.url);
const engineV5Url = new URL("../js/battle-engine-v5.js", import.meta.url);

let rules = await fs.readFile(rulesUrl, "utf8");
let engine = await fs.readFile(engineUrl, "utf8");
let engineV5 = await fs.readFile(engineV5Url, "utf8");

const marker = "// [[battle-focus-rules-v5]]";
if (!rules.includes(marker)) throw new Error("Existing focus rule block is missing");

const eudieMarker = "// [[battle-ability-evolve-v5]]";
if (!rules.includes(eudieMarker)) {
  const anchor = '  if (cardName === "freerunning" && artifactEntryCount(context.player) >= 3) {';
  if (!rules.includes(anchor)) throw new Error("Eudie insertion anchor not found");
  const block = `  ${eudieMarker}\n  if (cardName === "eudie, your dependable mentor") {\n    const evolveOther = /select another unevolved allied follower on the field and evolve it\\.?/i;\n    if (evolveOther.test(text)) {\n      const target = context.player.board\n        .filter(unit => unit.type === "Follower" && unit !== context.sourceUnit && !unit.evolved && !unit.superEvolved)\n        .sort((a, b) => fieldValue(b) - fieldValue(a))[0] ?? null;\n      if (target && typeof context.evolveUnitByAbility === "function" && context.evolveUnitByAbility(target)) {\n        actions.push(\`Eudie: evolve ${'${target.name}'}\`);\n      }\n      text = text.replace(evolveOther, " ");\n      applied = true;\n    }\n  }\n\n`;
  rules = rules.replace(anchor, `${block}${anchor}`);
}

const contextAnchor = '    chooseHandFollower: hand => hand.filter(item => item.card.type === "Follower").sort((a,b)=>(Number(b.card.cost)||0)-(Number(a.card.cost)||0))[0] ?? null,\n';
const contextMarker = "// [[battle-ability-evolve-context-v5]]";
if (!engineV5.includes(contextMarker)) {
  if (!engineV5.includes(contextAnchor)) throw new Error("effectContext evolve anchor not found");
  const addition = `${contextAnchor}    ${contextMarker}\n    evolveUnitByAbility: unit => {\n      const sideActions = [];\n      const evolved = evolveUnitByAbility(ctx, unit, sideActions);\n      if (sideActions.length) ctx.__sideActions?.push?.(...sideActions);\n      return evolved;\n    },\n`;
  engineV5 = engineV5.replace(contextAnchor, addition);
}

const helperAnchor = "function superEvolveUnitByAbility(ctx, unit, actions) {";
const helperMarker = "// [[battle-ability-evolve-helper-v5]]";
if (!engineV5.includes(helperMarker)) {
  if (!engineV5.includes(helperAnchor)) throw new Error("Ability evolve helper anchor not found");
  const helper = `${helperMarker}\nfunction evolveUnitByAbility(ctx, unit, actions) {\n  if (!unit || unit.type !== "Follower" || unit.evolved || unit.superEvolved) return false;\n  unit.attack += 2;\n  unit.defense += 2;\n  unit.maxDefense += 2;\n  unit.canAttackFollower = true;\n  unit.evolved = true;\n  ctx.player.evolutionsThisMatch += 1;\n  ctx.stats.evolutions[ctx.playerIndex] += 1;\n  actions.push(\`evolve ${'${unit.name}'} by ability\`);\n  const evolveText = getUnitTriggeredText(unit, "evolve");\n  if (evolveText) actions.push(...resolveText(evolveText, { ...ctx, card: unit.card, sourceUnit: unit }).actions);\n  actions.push(...cleanup(ctx.opponent, ctx.player, ctx.enemyIndex, ctx.playerIndex, ctx.stats, ctx.rng, ctx.cardMap));\n  return true;\n}\n\n`;
  engineV5 = engineV5.replace(helperAnchor, `${helper}${helperAnchor}`);
}

const partialLine = /^\s*\["eudie, your dependable mentor",\s*"[^"]+"\],?\r?\n/mi;
engine = engine.replace(partialLine, "");

await fs.writeFile(rulesUrl, rules);
await fs.writeFile(engineUrl, engine);
await fs.writeFile(engineV5Url, engineV5);
console.log("Ability-driven evolution materialized.");
