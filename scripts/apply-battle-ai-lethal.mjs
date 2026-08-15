import fs from "node:fs/promises";

const path = new URL("../js/battle-engine-v5.js", import.meta.url);
let source = await fs.readFile(path, "utf8");

if (source.includes("// [[battle-ai-collective-lethal-v1]]")) {
  console.log("Collective board lethal AI already applied.");
  process.exit(0);
}

const oldDecision = `      } else if (canLeader && shouldFace(attacker, player, opponent, foes, rng)) leader = true;
      else if (canFollower && foes.length) target = tradeTarget(attacker, foes, player.strategy);`;
const newDecision = `      } else if (canLeader && hasCollectiveBoardLethal(player, opponent)) leader = true;
      else if (canLeader && shouldFace(attacker, player, opponent, foes, rng)) leader = true;
      else if (canFollower && foes.length) target = tradeTarget(attacker, foes, player.strategy);`;
if (!source.includes(oldDecision)) throw new Error("Attack face/trade decision block not found");
source = source.replace(oldDecision, newDecision);

const marker = `function shouldFace(attacker, player, opponent, foes, rng) {`;
const helper = `// [[battle-ai-collective-lethal-v1]]
function hasCollectiveBoardLethal(player, opponent) {
  if (opponent.board.some(unit => unit.type === "Follower" && hasU(unit, "Ward"))) return false;
  const hasCap = opponent.leaderDamageCap != null && Number.isFinite(Number(opponent.leaderDamageCap));
  const cap = hasCap ? Math.max(0, Number(opponent.leaderDamageCap)) : null;
  if (cap === 0) return false;

  let total = 0;
  for (const unit of player.board.filter(item => item.type === "Follower")) {
    if (!unit.canAttackLeader || unit.attacksMade >= unit.maxAttacks) continue;
    let damage = Math.max(0, Number(unit.attack) || 0);
    if (hasU(unit, "Storm") && hasCrest(opponent, "Lu Woh, Light Personified")) damage = Math.max(0, damage - 3);
    if (cap != null) damage = Math.min(damage, cap);
    total += damage * Math.max(0, (Number(unit.maxAttacks) || 1) - (Number(unit.attacksMade) || 0));
    if (total >= opponent.hp) return true;
  }
  return false;
}

`;
if (!source.includes(marker)) throw new Error("shouldFace helper marker not found");
source = source.replace(marker, helper + marker);

await fs.writeFile(path, source);
console.log("Applied collective board lethal detection.");
