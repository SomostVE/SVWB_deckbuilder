import fs from "node:fs/promises";

const path = new URL("../js/battle-engine-v5.js", import.meta.url);
let source = await fs.readFile(path, "utf8");

if (source.includes("// [[battle-actual-damage-v5]]")) {
  console.log("Battle actual-damage fix already applied.");
  process.exit(0);
}

const randomLeaderOld = `      if (target.leader) {
        ctx.opponent.hp -= Number(match[1]);
        ctx.stats.damageDealt[ctx.playerIndex] += Number(match[1]);
        actions.push(\`${match[1]} to enemy leader\`);
      } else {`;
const randomLeaderNew = `      if (target.leader) {
        const dealt = damageLeader(ctx.opponent, Number(match[1]));
        ctx.stats.damageDealt[ctx.playerIndex] += dealt;
        actions.push(\`${dealt} to enemy leader\`);
      } else {`;
if (!source.includes(randomLeaderOld)) throw new Error("Random leader damage block not found");
source = source.replace(randomLeaderOld, randomLeaderNew);

const leaderAttackOld = `        const damage = Math.max(0, attacker.attack);
        opponent.hp -= damage;
        stats.damageDealt[playerIndex] += damage;
        if (hasU(attacker, "Drain")) {
          const healed = healPlayer(player, damage, stats, playerIndex);
          if (healed) actions.push(\`Drain heals \${healed}\`);
          actions.push(...afterLeaderHeal(player, healed, stats, playerIndex));
        }
        snap(frames, players, { round, active: playerIndex, phase: "attack", action: compact(\`\${attacker.name} attacks \${opponent.name}'s leader for \${damage}.\`, actions) }, stats, record);`;
const leaderAttackNew = `        const damage = Math.max(0, attacker.attack);
        const dealt = damageLeader(opponent, damage);
        stats.damageDealt[playerIndex] += dealt;
        if (hasU(attacker, "Drain")) {
          const healed = healPlayer(player, dealt, stats, playerIndex);
          if (healed) actions.push(\`Drain heals \${healed}\`);
          actions.push(...afterLeaderHeal(player, healed, stats, playerIndex));
        }
        snap(frames, players, { round, active: playerIndex, phase: "attack", action: compact(\`\${attacker.name} attacks \${opponent.name}'s leader for \${dealt}.\`, actions) }, stats, record);`;
if (!source.includes(leaderAttackOld)) throw new Error("Leader attack damage block not found");
source = source.replace(leaderAttackOld, leaderAttackNew);

const preCombatPingOld = `          if (attackerAlive && attacker.superEvolved && !targetAlive && target.defense <= 0) {
            opponent.hp -= 1;
            stats.damageDealt[playerIndex] += 1;
            actions.push("Super-Evolution deals 1 leader damage");
          }`;
const preCombatPingNew = `          if (attackerAlive && attacker.superEvolved && !targetAlive && target.defense <= 0) {
            const dealt = damageLeader(opponent, 1);
            stats.damageDealt[playerIndex] += dealt;
            if (dealt) actions.push("Super-Evolution deals 1 leader damage");
          }`;
if (!source.includes(preCombatPingOld)) throw new Error("Pre-combat Super-Evolution ping block not found");
source = source.replace(preCombatPingOld, preCombatPingNew);

const combatOld = `        const outgoing = Math.max(0, attacker.attack);
        const incoming = Math.max(0, target.attack);
        damageUnit(target, outgoing, opponent, player, { player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map }, actions);
        damageUnit(attacker, incoming, player, opponent, { player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map }, actions);
        if (hasU(attacker, "Bane")) target.defense = 0;
        if (hasU(target, "Bane")) attacker.defense = 0;
        if (hasU(attacker, "Drain")) {
          const healed = healPlayer(player, outgoing, stats, playerIndex);
          if (healed) actions.push(\`Drain heals \${healed}\`);
          actions.push(...afterLeaderHeal(player, healed, stats, playerIndex));
        }
        const targetDied = target.defense <= 0;
        if (attacker.superEvolved && targetDied) {
          opponent.hp -= 1;
          stats.damageDealt[playerIndex] += 1;
          actions.push("Super-Evolution deals 1 leader damage");`;
const combatNew = `        const outgoing = Math.max(0, attacker.attack);
        const incoming = Math.max(0, target.attack);
        const dealtToTarget = damageUnit(target, outgoing, opponent, player, { player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map }, actions);
        const dealtToAttacker = damageUnit(attacker, incoming, player, opponent, { player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map }, actions);
        if (hasU(attacker, "Bane") && dealtToTarget > 0) target.defense = 0;
        if (hasU(target, "Bane") && dealtToAttacker > 0) attacker.defense = 0;
        if (hasU(attacker, "Drain")) {
          const healed = healPlayer(player, dealtToTarget, stats, playerIndex);
          if (healed) actions.push(\`Drain heals \${healed}\`);
          actions.push(...afterLeaderHeal(player, healed, stats, playerIndex));
        }
        const targetDied = target.defense <= 0;
        if (attacker.superEvolved && targetDied) {
          const dealt = damageLeader(opponent, 1);
          stats.damageDealt[playerIndex] += dealt;
          if (dealt) actions.push("Super-Evolution deals 1 leader damage");`;
if (!source.includes(combatOld)) throw new Error("Follower combat block not found");
source = source.replace(combatOld, combatNew);

const damageUnitMarker = `function damageUnit(unit, amountValue, owner, sourceOwner, ctx, actions) {`;
const helper = `// [[battle-actual-damage-v5]]
function damageLeader(player, amountValue) {
  const before = Number(player.hp) || 0;
  player.hp -= Math.max(0, Number(amountValue) || 0);
  return Math.max(0, before - (Number(player.hp) || 0));
}

`;
if (!source.includes(damageUnitMarker)) throw new Error("damageUnit helper marker not found");
source = source.replace(damageUnitMarker, helper + damageUnitMarker);

await fs.writeFile(path, source);
console.log("Applied actual damage accounting for leader caps, Drain and Bane.");
