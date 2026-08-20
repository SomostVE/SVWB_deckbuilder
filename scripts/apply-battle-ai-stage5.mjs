import fs from "node:fs";

const enginePath = "js/battle-engine-v5.js";
const source = fs.readFileSync(enginePath, "utf8");
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

fs.writeFileSync(enginePath, source.slice(0, start) + replacement + source.slice(end));
console.log("Battle AI stage 5 burst heuristic repaired.");
