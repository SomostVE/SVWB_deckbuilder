import fs from "node:fs/promises";

const path = new URL("../js/battle-engine-v5.js", import.meta.url);
let source = await fs.readFile(path, "utf8");

if (source.includes("// [[battle-strike-precombat-v5]]")) {
  console.log("Battle combat-order fix already applied.");
  process.exit(0);
}

const oldLeader = `      if (leader) {
        const damage = Math.max(0, attacker.attack);
        opponent.hp -= damage;
        stats.damageDealt[playerIndex] += damage;
        if (hasU(attacker, "Drain")) {
          const healed = healPlayer(player, damage, stats, playerIndex);
          if (healed) actions.push(\`Drain heals \${healed}\`);
          actions.push(...afterLeaderHeal(player, healed, stats, playerIndex));
        }
        actions.push(...strike(attacker, player, opponent, playerIndex, enemyIndex, stats, rng, map));
        snap(frames, players, { round, active: playerIndex, phase: "attack", action: compact(\`\${attacker.name} attacks \${opponent.name}'s leader for \${damage}.\`, actions) }, stats, record);
        if (opponent.hp <= 0) return;
        continue;
      }
`;

const newLeader = `      if (leader) {
        // [[battle-strike-precombat-v5]] Attack/Strike abilities resolve before combat damage.
        actions.push(...strike(attacker, player, opponent, playerIndex, enemyIndex, stats, rng, map));
        actions.push(...cleanup(opponent, player, enemyIndex, playerIndex, stats, rng, map), ...cleanup(player, opponent, playerIndex, enemyIndex, stats, rng, map));
        if (!player.board.includes(attacker) || opponent.hp <= 0) {
          snap(frames, players, { round, active: playerIndex, phase: "attack", action: compact(\`\${attacker.name} attacks \${opponent.name}'s leader.\`, actions) }, stats, record);
          if (opponent.hp <= 0) return;
          break;
        }
        const damage = Math.max(0, attacker.attack);
        opponent.hp -= damage;
        stats.damageDealt[playerIndex] += damage;
        if (hasU(attacker, "Drain")) {
          const healed = healPlayer(player, damage, stats, playerIndex);
          if (healed) actions.push(\`Drain heals \${healed}\`);
          actions.push(...afterLeaderHeal(player, healed, stats, playerIndex));
        }
        snap(frames, players, { round, active: playerIndex, phase: "attack", action: compact(\`\${attacker.name} attacks \${opponent.name}'s leader for \${damage}.\`, actions) }, stats, record);
        if (opponent.hp <= 0) return;
        continue;
      }
`;

if (!source.includes(oldLeader)) throw new Error("Leader attack block not found");
source = source.replace(oldLeader, newLeader);

const oldTargetStart = `      if (target) {
        const clashAttacker = getUnitTriggeredText(attacker, "clash");
        const clashTarget = getUnitTriggeredText(target, "clash");
        if (clashAttacker) actions.push(...resolveText(clashAttacker, { card: attacker.card, sourceUnit: attacker, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map }).actions);
        if (clashTarget) actions.push(...resolveText(clashTarget, { card: target.card, sourceUnit: target, player: opponent, opponent: player, playerIndex: enemyIndex, enemyIndex: playerIndex, stats, rng, cardMap: map }).actions);
        actions.push(...cleanup(player, opponent, playerIndex, enemyIndex, stats, rng, map), ...cleanup(opponent, player, enemyIndex, playerIndex, stats, rng, map));
        if (!player.board.includes(attacker) || !opponent.board.includes(target)) {
          snap(frames, players, { round, active: playerIndex, phase: "attack", action: compact(\`\${attacker.name} clashes with \${target.name}.\`, actions) }, stats, record);
          break;
        }

        const outgoing = Math.max(0, attacker.attack);
`;

const newTargetStart = `      if (target) {
        // Attack/Strike and Clash abilities all resolve before combat damage.
        actions.push(...strike(attacker, player, opponent, playerIndex, enemyIndex, stats, rng, map));
        const clashAttacker = getUnitTriggeredText(attacker, "clash");
        const clashTarget = getUnitTriggeredText(target, "clash");
        if (clashAttacker) actions.push(...resolveText(clashAttacker, { card: attacker.card, sourceUnit: attacker, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map }).actions);
        if (clashTarget) actions.push(...resolveText(clashTarget, { card: target.card, sourceUnit: target, player: opponent, opponent: player, playerIndex: enemyIndex, enemyIndex: playerIndex, stats, rng, cardMap: map }).actions);
        actions.push(...cleanup(player, opponent, playerIndex, enemyIndex, stats, rng, map), ...cleanup(opponent, player, enemyIndex, playerIndex, stats, rng, map));
        const attackerAlive = player.board.includes(attacker);
        const targetAlive = opponent.board.includes(target);
        if (!attackerAlive || !targetAlive) {
          if (attackerAlive && attacker.superEvolved && !targetAlive && target.defense <= 0) {
            opponent.hp -= 1;
            stats.damageDealt[playerIndex] += 1;
            actions.push("Super-Evolution deals 1 leader damage");
          }
          snap(frames, players, { round, active: playerIndex, phase: "attack", action: compact(\`\${attacker.name} attacks \${target.name}.\`, actions) }, stats, record);
          if (opponent.hp <= 0) return;
          if (!attackerAlive) break;
          continue;
        }

        const outgoing = Math.max(0, attacker.attack);
`;

if (!source.includes(oldTargetStart)) throw new Error("Follower attack pre-combat block not found");
source = source.replace(oldTargetStart, newTargetStart);

const oldPostCombatStrike = `        actions.push(...cleanup(opponent, player, enemyIndex, playerIndex, stats, rng, map), ...cleanup(player, opponent, playerIndex, enemyIndex, stats, rng, map));
        if (player.board.includes(attacker)) actions.push(...strike(attacker, player, opponent, playerIndex, enemyIndex, stats, rng, map));
        snap(frames, players, { round, active: playerIndex, phase: "attack", action: compact(\`\${attacker.name} attacks \${target.name}.\`, actions) }, stats, record);
`;
const newPostCombatStrike = `        actions.push(...cleanup(opponent, player, enemyIndex, playerIndex, stats, rng, map), ...cleanup(player, opponent, playerIndex, enemyIndex, stats, rng, map));
        snap(frames, players, { round, active: playerIndex, phase: "attack", action: compact(\`\${attacker.name} attacks \${target.name}.\`, actions) }, stats, record);
`;
if (!source.includes(oldPostCombatStrike)) throw new Error("Post-combat Strike block not found");
source = source.replace(oldPostCombatStrike, newPostCombatStrike);

const oldStrike = `function strike(attacker, player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const text = getUnitTriggeredText(attacker, "strike");
  if (!text) return [];
  stats.strikeTriggered[playerIndex] += 1;
  const result = resolveText(text, { card: attacker.card, sourceUnit: attacker, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map });
  return ["Strike", ...result.actions, ...cleanup(opponent, player, enemyIndex, playerIndex, stats, rng, map)];
}
`;
const newStrike = `function strike(attacker, player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const text = getUnitTriggeredText(attacker, "strike");
  if (!text) return [];
  stats.strikeTriggered[playerIndex] += 1;
  const result = resolveText(text, { card: attacker.card, sourceUnit: attacker, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map });
  return ["Strike", ...result.actions];
}
`;
if (!source.includes(oldStrike)) throw new Error("Strike helper not found");
source = source.replace(oldStrike, newStrike);

await fs.writeFile(path, source);
console.log("Applied Battle Sim pre-combat Strike ordering and super-evolve destruction ping fix.");
