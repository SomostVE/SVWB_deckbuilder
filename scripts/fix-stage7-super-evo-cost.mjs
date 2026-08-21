import fs from "node:fs";

const path = "js/battle-engine-v5.js";
let source = fs.readFileSync(path, "utf8");

const spendBefore = `    if (action.kind !== "evolve") continue;\n    const superMode = Boolean(action.superMode);`;
const spendAfter = `    if (action.kind !== "evolve" && action.kind !== "super-evolve") continue;\n    const superMode = action.kind === "super-evolve" || Boolean(action.superMode);`;
if (!source.includes(spendBefore) && !source.includes(spendAfter)) {
  throw new Error("Stage 7 Super Evo spend-cost anchor not found");
}
source = source.replace(spendBefore, spendAfter);

const preserveBefore = `    if (context.normalEquivalent) score -= 6;`;
const preserveAfter = `    if (context.normalEquivalent) score -= 12;`;
if (!source.includes(preserveBefore) && !source.includes(preserveAfter)) {
  throw new Error("Stage 7 normal-equivalent preservation anchor not found");
}
source = source.replace(preserveBefore, preserveAfter);

fs.writeFileSync(path, source);
console.log("Stage 7 now strongly preserves Super Evo when normal Evo solves the same line.");
