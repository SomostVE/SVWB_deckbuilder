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

const oldBoardValue = `function plannerBoardValue(player) {
  return player.board.reduce((sum, unit) => {
    if (unit.type === "Amulet") {
      const text = norm(unit.card?.text);
      return sum + 1.2 + (/engage|countdown|at the end of your turn|at the start of your turn/.test(text) ? 1.1 : 0);
    }
    let value = Math.max(0, Number(unit.attack) || 0) * 1.55 + Math.max(0, Number(unit.defense) || 0) * .9;
    if (hasU(unit, "Ward")) value += 2;
    if (hasU(unit, "Bane")) value += 1.7;
    if (hasU(unit, "Storm")) value += 1;
    if (unit.evolved) value += .8;
    if (unit.superEvolved) value += 1.2;
    if (unit.aura) value += 1.1;
    return sum + value;
  }, 0);
}`;

const newBoardValue = `// [[battle-ai-stage4-exchange-value]]
function plannerDeathTriggerValue(unit) {
  const text = norm(getUnitTriggeredText(unit, "lastWords") || "");
  if (!text) return 0;
  let value = 1.1;
  if (/draw|add .* to your hand/.test(text)) value += 1.8;
  if (/summon/.test(text)) value += 2.4;
  if (/restore .*leader|restore .*defense/.test(text)) value += 1.2;
  if (/gain crest/.test(text)) value += 1.5;
  if (/deal .*damage/.test(text)) value += 1.7;
  if (/destroy|banish/.test(text)) value += 2.2;
  return value;
}

function plannerBoardValue(player) {
  return player.board.reduce((sum, unit) => {
    if (unit.type === "Amulet") {
      const text = norm(unit.card?.text);
      return sum + 1.2 + (/engage|countdown|at the end of your turn|at the start of your turn/.test(text) ? 1.1 : 0);
    }
    let value = Math.max(0, Number(unit.attack) || 0) * 1.55 + Math.max(0, Number(unit.defense) || 0) * .9;
    if (hasU(unit, "Ward")) value += 2;
    if (hasU(unit, "Bane")) value += 1.7;
    if (hasU(unit, "Storm")) value += 1;
    if (hasU(unit, "Drain")) value += .8;
    if (hasU(unit, "Ambush") || unit.ambush) value += 1.1;
    if (hasU(unit, "Barrier")) value += 1.4;
    if (hasU(unit, "Invincible")) value += 2.2;
    value += plannerDeathTriggerValue(unit) * .55;
    if (unit.evolved) value += .8;
    if (unit.superEvolved) value += 1.2;
    if (unit.aura) value += 1.1;
    return sum + value;
  }, 0);
}`;
engine = replaceOnce(engine, oldBoardValue, newBoardValue, "plannerBoardValue");

const oldAttackPrior = `// [[battle-ai-stage3-trade-quality]]
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

const newAttackPrior = `// [[battle-ai-stage3-trade-quality]]
// [[battle-ai-stage4-exchange-value]]
function plannerAttackPrior(attacker, target, leader, player, opponent) {
  const outgoing = Math.max(0, Number(attacker.attack) || 0);
  const missingDefense = Math.max(0, 20 - (Number(player.hp) || 0));
  const drainValue = hasU(attacker, "Drain") ? Math.min(outgoing, missingDefense) * .85 : 0;

  if (leader) {
    const damage = outgoing;
    return (damage >= opponent.hp ? 1000 : 8 + damage * (player.strategy?.style === "aggro" ? 2.4 : 1.5)) + drainValue;
  }

  if (!target) return -100;
  const removes = canCombatRemove(attacker, target);
  const survives = !willFollowerDieInCombat(attacker, target, player);
  const targetThreat = followerThreatValue(target);
  const attackerThreat = followerThreatValue(attacker);
  const targetDefense = Math.max(0, Number(target.defense) || 0);
  const overkill = removes ? Math.max(0, outgoing - targetDefense) : 0;
  const attackerHasBane = hasU(attacker, "Bane");
  const targetHasBane = hasU(target, "Bane");
  const targetHasWard = hasU(target, "Ward");
  const attackerHasWard = hasU(attacker, "Ward");
  const ownDeathValue = plannerDeathTriggerValue(attacker);
  const enemyDeathValue = plannerDeathTriggerValue(target);
  const otherThreats = (opponent.board ?? []).filter(unit => unit !== target && unit.type === "Follower");
  const highestOtherThreat = otherThreats.reduce((best, unit) => Math.max(best, followerThreatValue(unit)), 0);

  let score = removes ? 20 : 1;
  score += targetThreat * .72;
  if (survives) score += 7;
  else {
    score -= attackerThreat * .3;
    score += ownDeathValue * .8;
    if (attackerHasWard) score -= 2.5;
  }
  if (removes && survives) score += 5;
  if (targetHasWard) score += 5;

  // Killing a Last Words follower can hand the opponent material, healing,
  // board presence or a Crest. Account for that downside without refusing a
  // necessary defensive removal or a Ward clear.
  if (removes && enemyDeathValue > 0) {
    const urgency = targetHasWard || targetThreat >= 8 ? .35 : .85;
    score -= enemyDeathValue * urgency;
  }

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

  // Conversely, do not throw a premium follower into enemy Bane when the
  // exchange is materially unfavorable and another line can answer it.
  if (targetHasBane && !survives && attackerThreat > targetThreat + 3) score -= 5;

  // Drain has extra combat value while the leader is damaged, especially when
  // the trade also removes incoming damage from the next turn.
  if (hasU(attacker, "Drain")) score += Math.min(outgoing, targetDefense, missingDefense) * 1.05;

  // Partial damage can be useful as setup, but should sit behind clean trades
  // unless the target itself is an urgent threat.
  if (!removes) score -= Math.max(0, targetDefense - outgoing) * .25;
  return score;
}`;
engine = replaceOnce(engine, oldAttackPrior, newAttackPrior, "plannerAttackPrior");
fs.writeFileSync(enginePath, engine);

let audit = fs.readFileSync(auditPath, "utf8");
const auditMarker = `assert.ok(cases.length >= 12, "Behavior audit must keep broad deterministic coverage");`;
const stage4Block = `// Stage 4 exchange-value gates: combat decisions must account for persistent
// defensive value and death-trigger value instead of comparing raw stats only.
const lastWordsTrader = follower("Audit Last Words Trader", 2, 2, 2, "Last Words: Draw a card.");
const lastWordsEnemy = follower("Audit Last Words Enemy", 2, 2, 2, "Last Words: Draw a card.");
const lethalLastWordsEnemy = follower("Audit Lethal Last Words Enemy", 8, 8, 1, "Last Words: Draw a card.");

audit("Cash in own Last Words before a vanilla body", "exchange-value", () => inspectTurnPlan({
  hand: [], deck: [ownFutureDraw], pp: 0, maxPp: 5, personalTurn: 5, ep: 0, sep: 0, opponentHp: 20,
  strategy: { style: "midrange" },
  board: [
    { card: lastWordsTrader, name: lastWordsTrader.name, attack: 2, defense: 2, canAttackLeader: true, canAttackFollower: true },
    { name: "Audit Vanilla Trader", attack: 2, defense: 2, canAttackLeader: true, canAttackFollower: true }
  ],
  opponentBoard: [{ name: "Audit Forced Ward", attack: 2, defense: 2, keywords: ["Ward"] }]
}), plan => plan.sequence[0]?.kind === "attack" && plan.sequence[0]?.card === lastWordsTrader.name && plan.sequence[0]?.target === "Audit Forced Ward");

audit("Preserve Ward when a vanilla body can make the same trade", "exchange-value", () => inspectTurnPlan({
  hand: [], pp: 0, maxPp: 5, personalTurn: 5, ep: 0, sep: 0, opponentHp: 20,
  strategy: { style: "control" },
  board: [
    { name: "Audit Defensive Ward", attack: 2, defense: 2, keywords: ["Ward"], canAttackLeader: true, canAttackFollower: true },
    { name: "Audit Disposable Vanilla", attack: 2, defense: 2, canAttackLeader: true, canAttackFollower: true }
  ],
  opponentBoard: [{ name: "Audit Trade Ward", attack: 2, defense: 2, keywords: ["Ward"] }]
}), plan => plan.sequence[0]?.kind === "attack" && plan.sequence[0]?.card === "Audit Disposable Vanilla" && plan.sequence[0]?.target === "Audit Trade Ward");

audit("Avoid optional enemy Last Words when another equal threat exists", "exchange-value", () => inspectTurnPlan({
  hand: [], pp: 0, maxPp: 5, hp: 3, personalTurn: 5, ep: 0, sep: 0, opponentHp: 20,
  strategy: { style: "control" },
  board: [{ name: "Audit Single Trader", attack: 2, defense: 3, canAttackLeader: true, canAttackFollower: true }],
  opponentBoard: [
    { card: lastWordsEnemy, name: lastWordsEnemy.name, attack: 2, defense: 2 },
    { name: "Audit Plain Enemy", attack: 2, defense: 2 }
  ]
}), plan => plan.sequence.some(step => step.kind === "attack" && step.card === "Audit Single Trader" && step.target === "Audit Plain Enemy"));

audit("Remove lethal attacker even when it has Last Words", "exchange-value", () => inspectTurnPlan({
  hand: [], deck: [ownFutureDraw], pp: 0, maxPp: 5, hp: 8, personalTurn: 5, ep: 0, sep: 0, opponentHp: 20,
  strategy: { style: "control" },
  board: [{ name: "Audit Emergency Trader", attack: 1, defense: 1, canAttackLeader: true, canAttackFollower: true }],
  opponentBoard: [{ card: lethalLastWordsEnemy, name: lethalLastWordsEnemy.name, attack: 8, defense: 1 }]
}), plan => plan.sequence.some(step => step.kind === "attack" && step.card === "Audit Emergency Trader" && step.target === lethalLastWordsEnemy.name));

`;
if (!audit.includes("Stage 4 exchange-value gates")) {
  const markerIndex = audit.indexOf(auditMarker);
  if (markerIndex < 0) throw new Error("Could not locate behavior audit marker");
  audit = audit.slice(0, markerIndex) + stage4Block + audit.slice(markerIndex);
}
audit = audit.replace("Battle AI behavior baseline — 01.05.005", "Battle AI behavior baseline — 01.05.006");
audit = audit.replace("Stage 2 behavior gates are blocking: inefficient or tactically wrong lines must be fixed before release.", "Battle AI behavior gates are blocking: inefficient or tactically wrong lines must be fixed before release.");
audit = audit.replace("Battle AI stage 2 behavior gate failed", "Battle AI behavior gate failed");
fs.writeFileSync(auditPath, audit);

const version = JSON.parse(fs.readFileSync(versionPath, "utf8"));
version.version = "01.05.006";
fs.writeFileSync(versionPath, `${JSON.stringify(version, null, 2)}\n`);

let battle = fs.readFileSync(battlePath, "utf8");
battle = battle.replaceAll("01.05.005", "01.05.006");
fs.writeFileSync(battlePath, battle);

console.log("Battle AI stage 4 migration applied.");
