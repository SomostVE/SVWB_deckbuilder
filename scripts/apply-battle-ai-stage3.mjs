import fs from "node:fs";

const enginePath = "js/battle-engine-v5.js";
const auditPath = "scripts/audit-battle-ai-behavior.mjs";
const versionPath = "version.json";
const battlePath = "battle.html";

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Could not locate ${label}`);
  return source.slice(0, index) + after + source.slice(index + before.length);
}

let engine = fs.readFileSync(enginePath, "utf8");
const oldAttackPrior = `function plannerAttackPrior(attacker, target, leader, player, opponent) {
  if (leader) {
    const damage = Math.max(0, Number(attacker.attack) || 0);
    return (damage >= opponent.hp ? 1000 : 8 + damage * (player.strategy?.style === "aggro" ? 2.4 : 1.5));
  }
  const removes = target && canCombatRemove(attacker, target);
  const survives = target ? !willFollowerDieInCombat(attacker, target, player) : false;
  return (removes ? 18 : 2) + followerThreatValue(target) * .55 + (survives ? 5 : 0) - followerThreatValue(attacker) * (survives ? .04 : .18);
}`;
const newAttackPrior = `// [[battle-ai-stage3-trade-quality]]
function plannerAttackPrior(attacker, target, leader, player, opponent) {
  if (leader) {
    const damage = Math.max(0, Number(attacker.attack) || 0);
    return (damage >= opponent.hp ? 1000 : 8 + damage * (player.strategy?.style === "aggro" ? 2.4 : 1.5));
  }

  if (!target) return -100;
  const removes = canCombatRemove(attacker, target);
  const survives = !willFollowerDieInCombat(attacker, target, player);
  const targetThreat = followerThreatValue(target);
  const attackerThreat = followerThreatValue(attacker);
  const outgoing = Math.max(0, Number(attacker.attack) || 0);
  const targetDefense = Math.max(0, Number(target.defense) || 0);
  const overkill = removes ? Math.max(0, outgoing - targetDefense) : 0;
  const attackerHasBane = hasU(attacker, "Bane");
  const targetHasWard = hasU(target, "Ward");
  const otherThreats = (opponent.board ?? []).filter(unit => unit !== target && unit.type === "Follower");
  const highestOtherThreat = otherThreats.reduce((best, unit) => Math.max(best, followerThreatValue(unit)), 0);

  let score = removes ? 20 : 1;
  score += targetThreat * .72;
  if (survives) score += 7;
  else score -= attackerThreat * .3;
  if (removes && survives) score += 5;
  if (targetHasWard) score += 5;

  // Prefer the smallest sufficient body instead of cashing in a premium
  // attacker on a target a cheaper unit can already remove.
  if (removes) score -= Math.min(6, overkill * .4);

  // Bane is most valuable when it converts a tiny attacker into removal for a
  // follower that normal combat could not efficiently answer. Do not burn it
  // on a trivial target while a much larger threat remains available.
  if (attackerHasBane) {
    if (targetDefense > outgoing || targetThreat >= attackerThreat + 4) score += 8;
    if (targetThreat + 3 < highestOtherThreat) score -= 8;
  }

  // Partial damage can be useful as setup, but should sit behind clean trades
  // unless the target itself is an urgent threat.
  if (!removes) score -= Math.max(0, targetDefense - outgoing) * .25;
  return score;
}`;
engine = replaceOnce(engine, oldAttackPrior, newAttackPrior, "plannerAttackPrior");
fs.writeFileSync(enginePath, engine);

let audit = fs.readFileSync(auditPath, "utf8");
const auditMarker = `assert.ok(cases.length >= 12, "Behavior audit must keep broad deterministic coverage");`;
const stage3Block = `// Stage 3 combat-quality gates: preserve premium attackers, allocate Bane to
// the threat that actually needs it, and use cheap bodies to unlock face damage.
audit("Use the cheapest body for an even trade", "combat-efficiency", () => inspectTurnPlan({
  hand: [], pp: 0, maxPp: 5, personalTurn: 5, ep: 0, sep: 0, opponentHp: 10,
  strategy: { style: "midrange" },
  board: [
    { name: "Audit Cheap Trader", attack: 2, defense: 2, canAttackLeader: true, canAttackFollower: true },
    { name: "Audit Premium Attacker", attack: 8, defense: 8, canAttackLeader: true, canAttackFollower: true }
  ],
  opponentBoard: [{ name: "Audit Even Target", attack: 2, defense: 2 }]
}), plan => {
  const cheapTrade = plan.sequence.findIndex(step => step.kind === "attack" && step.card === "Audit Cheap Trader" && step.target === "Audit Even Target");
  const premiumFace = plan.sequence.findIndex(step => step.kind === "attack" && step.card === "Audit Premium Attacker" && step.target === "leader");
  return cheapTrade >= 0 && premiumFace > cheapTrade;
});

audit("Spend Bane on the largest live threat", "combat-efficiency", () => inspectTurnPlan({
  hand: [], pp: 0, maxPp: 5, personalTurn: 5, ep: 0, sep: 0, opponentHp: 20,
  strategy: { style: "midrange" },
  board: [
    { name: "Audit Precision Bane", attack: 1, defense: 1, keywords: ["Bane"], canAttackLeader: true, canAttackFollower: true },
    { name: "Audit Normal Trader", attack: 3, defense: 3, canAttackLeader: true, canAttackFollower: true }
  ],
  opponentBoard: [
    { name: "Audit Token Threat", attack: 1, defense: 1 },
    { name: "Audit Giant Threat", attack: 9, defense: 9 }
  ]
}), plan => plan.sequence.some(step => step.kind === "attack" && step.card === "Audit Precision Bane" && step.target === "Audit Giant Threat"));

audit("Clear Ward with cheap attacker and preserve face damage", "combat-efficiency", () => inspectTurnPlan({
  hand: [], pp: 0, maxPp: 5, personalTurn: 5, ep: 0, sep: 0, opponentHp: 7,
  strategy: { style: "midrange" },
  board: [
    { name: "Audit Ward Cleaner", attack: 2, defense: 2, canAttackLeader: true, canAttackFollower: true },
    { name: "Audit Face Finisher", attack: 7, defense: 7, canAttackLeader: true, canAttackFollower: true }
  ],
  opponentBoard: [{ name: "Audit Small Ward", attack: 1, defense: 2, keywords: ["Ward"] }]
}), plan => {
  const clear = plan.sequence.findIndex(step => step.kind === "attack" && step.card === "Audit Ward Cleaner" && step.target === "Audit Small Ward");
  const lethal = plan.sequence.findIndex(step => step.kind === "attack" && step.card === "Audit Face Finisher" && step.target === "leader");
  return clear >= 0 && lethal > clear;
});

`;
if (!audit.includes("Stage 3 combat-quality gates")) {
  const markerIndex = audit.indexOf(auditMarker);
  if (markerIndex < 0) throw new Error("Could not locate behavior audit marker");
  audit = audit.slice(0, markerIndex) + stage3Block + audit.slice(markerIndex);
}
audit = audit.replace("Battle AI behavior baseline — 01.05.004", "Battle AI behavior baseline — 01.05.005");
fs.writeFileSync(auditPath, audit);

const version = JSON.parse(fs.readFileSync(versionPath, "utf8"));
version.version = "01.05.005";
fs.writeFileSync(versionPath, `${JSON.stringify(version, null, 2)}\n`);

let battle = fs.readFileSync(battlePath, "utf8");
battle = battle.replaceAll("01.05.004", "01.05.005");
fs.writeFileSync(battlePath, battle);

console.log("Battle AI stage 3 migration applied.");
