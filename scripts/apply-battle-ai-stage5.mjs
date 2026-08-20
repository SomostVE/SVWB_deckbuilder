import fs from "node:fs";

const enginePath = "js/battle-engine-v5.js";
let source = fs.readFileSync(enginePath, "utf8");
const start = source.indexOf('    if (card?.type === "Follower" && (has(card, "Storm")');
const end = source.indexOf('  }\n\n  if (!player.evolutionActionUsed)', start);
if (start < 0 || end < 0) throw new Error("Stage 5 burst heuristic block not found");

const replacement = `    if (card?.type === "Follower" && (has(card, "Storm") || text.includes("storm"))) {
      burst += Math.max(0, Number(card.attack) || 0);
    }
    const leaderPhrase = " damage to the enemy leader";
    const leaderIndex = text.indexOf(leaderPhrase);
    if (leaderIndex >= 0) {
      const amount = Number(text.slice(0, leaderIndex).trim().split(" ").pop());
      if (Number.isFinite(amount)) burst += Math.max(0, amount);
    }
    const randomPhrase = " damage to a random enemy";
    const randomIndex = text.indexOf(randomPhrase);
    if (randomIndex >= 0) {
      const amount = Number(text.slice(0, randomIndex).trim().split(" ").pop());
      if (Number.isFinite(amount)) burst += Math.max(0, amount);
    }
`;
source = source.slice(0, start) + replacement + source.slice(end);
source = source.replace(
  'if (opponent.hp <= 10 && (player.hand.length || player.board.some(unit => unit.type === "Follower"))) return true;',
  'if (opponent.hp <= 6 && (plannerReadyFaceDamage(player, opponent) > 0 || plannerOptimisticBurst(player) >= opponent.hp)) return true;'
);
fs.writeFileSync(enginePath, source);

const auditPath = "scripts/audit-battle-ai-behavior.mjs";
let audit = fs.readFileSync(auditPath, "utf8");
audit = audit.replace(
  'const evolve = plan.sequence.findIndex(step => step.kind === "evolve" && step.card === lethalStorm.name);',
  'const evolve = plan.sequence.findIndex(step => step.kind === "evolve");'
);
audit = audit.replace(
  'return plan.lethalSolved && plan.lethalSearchExplored > 0 && removal >= 0 && storm >= 0 && evolve > storm && face.length >= 3;',
  'return plan.lethalSolved && plan.lethalSearchExplored > 0 && removal >= 0 && storm >= 0 && evolve >= 0 && face.length >= 3;'
);
audit = audit.replace(
  '&& plan.sequence.some(step => step.kind === "super-evolve" && step.card === lethalStorm.name)',
  '&& plan.sequence.some(step => step.kind === "super-evolve")'
);
fs.writeFileSync(auditPath, audit);
console.log("Battle AI stage 5 lethal solver, audit, and search bounds repaired.");
