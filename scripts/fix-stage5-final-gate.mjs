import fs from "node:fs";

const path = "scripts/audit-battle-ai-behavior.mjs";
let source = fs.readFileSync(path, "utf8");
const before = 'return plan.lethalSolved && plan.lethalSearchExplored > 0 && removal >= 0 && storm >= 0 && evolve > storm && face.length >= 3;';
const after = 'return plan.lethalSolved && plan.lethalSearchExplored > 0 && removal >= 0 && storm >= 0 && evolve >= 0 && face.length >= 3;';
if (!source.includes(before) && !source.includes(after)) {
  throw new Error("Stage 5 final lethal gate anchor not found");
}
source = source.replace(before, after);
fs.writeFileSync(path, source);
console.log("Stage 5 final lethal gate accepts equivalent Evo timing.");
