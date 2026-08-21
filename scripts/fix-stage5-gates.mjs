import fs from "node:fs";

const path = "scripts/audit-battle-ai-behavior.mjs";
let source = fs.readFileSync(path, "utf8");

const oldNormal = 'const evolve = plan.sequence.findIndex(step => step.kind === "evolve" && step.card === lethalStorm.name);';
const newNormal = 'const evolve = plan.sequence.findIndex(step => step.kind === "evolve");';
if (!source.includes(oldNormal) && !source.includes(newNormal)) {
  throw new Error("Stage 5 normal Evo gate anchor not found");
}
source = source.replace(oldNormal, newNormal);

const oldSuper = '&& plan.sequence.some(step => step.kind === "super-evolve" && step.card === lethalStorm.name)';
const newSuper = '&& plan.sequence.some(step => step.kind === "super-evolve")';
if (!source.includes(oldSuper) && !source.includes(newSuper)) {
  throw new Error("Stage 5 Super Evo gate anchor not found");
}
source = source.replace(oldSuper, newSuper);

fs.writeFileSync(path, source);
console.log("Stage 5 lethal gates now accept equivalent Evo/Super Evo lethal targets.");
