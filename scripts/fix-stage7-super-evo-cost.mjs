import fs from "node:fs";

const path = "js/battle-engine-v5.js";
let source = fs.readFileSync(path, "utf8");

const before = `    if (action.kind !== "evolve") continue;\n    const superMode = Boolean(action.superMode);`;
const after = `    if (action.kind !== "evolve" && action.kind !== "super-evolve") continue;\n    const superMode = action.kind === "super-evolve" || Boolean(action.superMode);`;

if (!source.includes(before) && !source.includes(after)) {
  throw new Error("Stage 7 Super Evo spend-cost anchor not found");
}

source = source.replace(before, after);
fs.writeFileSync(path, source);
console.log("Stage 7 planner now charges Super Evo resource spend.");

// Triggered once after installing the repair workflow.
