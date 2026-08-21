import fs from "node:fs/promises";

const enginePath = new URL("../js/battle-engine-v5.js", import.meta.url);
const versionPath = new URL("../version.json", import.meta.url);
const battlePath = new URL("../battle.html", import.meta.url);
const validatePath = new URL("../.github/workflows/validate-site.yml", import.meta.url);

let source = await fs.readFile(enginePath, "utf8");
const marker = "// [[battle-ai-stage7-evolution-policy]]";

if (!source.includes(marker)) {
  const evolutionAnchor = "function enumerateEvolutionDecisions(player, opponent) {";
  if (!source.includes(evolutionAnchor)) throw new Error("Stage 7: evolution decision anchor not found");

  const helpers = `${marker}
function stage7EvolutionContext(unit, player, opponent, superMode) {
  const bonus = superMode ? 3 : 2;
  const postAttack = Math.max(0, Number(unit.attack) || 0) + bonus;
  const normalPostAttack = Math.max(0, Number(unit.attack) || 0) + 2;
  const foes = opponent.board.filter(item => item.type === "Follower");
  const wards = activeWards(opponent.board);
  const canFace = Boolean(unit.canAttackLeader) && wards.length === 0;
  const lethal = canFace && postAttack >= Math.max(0, Number(opponent.hp) || 0);
  const normalLethal = canFace && normalPostAttack >= Math.max(0, Number(opponent.hp) || 0);
  const canTrade = foes.some(target => postAttack >= Math.max(0, Number(target.defense) || 0) || hasU(unit, "Bane"));
  const normalCanTrade = foes.some(target => normalPostAttack >= Math.max(0, Number(target.defense) || 0) || hasU(unit, "Bane"));
  const incoming = estimateVisibleIncomingDamage(player, opponent);
  const defensive = canTrade && (Number(player.hp) || 0) <= incoming + 3;
  const boardSwing = canTrade && foes.length >= 2;
  const evolveValue = evolutionTextValue(getUnitTriggeredText(unit, "evolve"), player, opponent, unit);
  const superValue = superMode ? evolutionTextValue(getUnitTriggeredText(unit, "superEvolve"), player, opponent, unit) : 0;
  const effectValue = evolveValue + superValue;
  const effectDriven = effectValue >= 5;
  const routine = !lethal && !defensive && !boardSwing && !effectDriven;
  const normalEquivalent = superMode
    && player.ep > 0
    && superValue < 4
    && ((lethal && normalLethal) || (canTrade && normalCanTrade));
  return { postAttack, foes, canFace, lethal, defensive, boardSwing, effectValue, routine, normalEquivalent };
}

function stage7EvolutionPrior(unit, player, opponent, superMode) {
  const context = stage7EvolutionContext(unit, player, opponent, superMode);
  const style = String(player.strategy?.style ?? "midrange");
  let score = 0;

  if (context.lethal) score += 24;
  else if (context.canFace && opponent.hp <= context.postAttack + 4) score += style === "aggro" ? 4 : 2;
  if (context.defensive) score += 9;
  if (context.boardSwing) score += 4.5;
  if (context.effectValue >= 5) score += Math.min(9, context.effectValue * .7);

  if (superMode) {
    if (context.normalEquivalent) score -= 6;
    if (player.sep <= 1 && context.routine) score -= 4.5;
    if ((style === "control" || style === "ward-control") && context.routine) score -= 2;
  } else if (player.ep <= 1 && context.routine) {
    score -= 2.25;
  }

  if (!context.foes.length && context.effectValue < 3 && !context.lethal) {
    score -= superMode ? 10 : 5.5;
  }
  return score;
}
`;
  source = source.replace(evolutionAnchor, `${helpers}\n\n${evolutionAnchor}`);

  const normalPrior = "prior: scoreEvolutionCandidate(unit, player, opponent, false) + targetBranchValue(targetPlan, opponent) * .25";
  const superPrior = "prior: scoreEvolutionCandidate(unit, player, opponent, true) + targetBranchValue(targetPlan, opponent) * .25";
  if (!source.includes(normalPrior) || !source.includes(superPrior)) throw new Error("Stage 7: evolution prior anchors not found");
  source = source.replace(normalPrior, `${normalPrior} + stage7EvolutionPrior(unit, player, opponent, false)`);
  source = source.replace(superPrior, `${superPrior} + stage7EvolutionPrior(unit, player, opponent, true)`);

  const spendStart = source.indexOf("function plannerEvolutionSpendCost(node) {");
  const spendEnd = source.indexOf("\n\nfunction plannerNodeScore", spendStart);
  if (spendStart < 0 || spendEnd < 0) throw new Error("Stage 7: planner evolution spend-cost block not found");
  const spendReplacement = `function plannerEvolutionSpendCost(node) {
  const sequence = node.sequence ?? [];
  let cost = 0;
  for (const action of sequence) {
    if (action.kind !== "evolve") continue;
    const superMode = Boolean(action.superMode);
    const player = node.state?.player;
    const opponent = node.state?.opponent;
    let actionCost = superMode ? 5.25 : 3.25;
    const unit = player?.board?.find(item => item.uid === action.unitUid) ?? null;

    if (unit && player && opponent) {
      const context = stage7EvolutionContext(unit, player, opponent, superMode);
      if (context.lethal) actionCost = 0;
      else {
        if (context.defensive) actionCost -= superMode ? 3 : 1.75;
        if (context.boardSwing) actionCost -= 1.25;
        if (context.effectValue >= 7) actionCost -= superMode ? 1.75 : 1.25;
        if (context.normalEquivalent) actionCost += 2.75;
        if (context.routine && player[superMode ? "sep" : "ep"] <= 0) actionCost += superMode ? 2.5 : 1.5;
        if (!context.foes.length && context.effectValue < 3) actionCost += superMode ? 3.5 : 2;
      }
    } else {
      const prior = Number(action.prior) || 0;
      if (prior >= 20) actionCost -= superMode ? 3.5 : 2;
      else if (prior >= 10) actionCost -= superMode ? 1.75 : 1;
    }
    cost += Math.max(0, actionCost);
  }
  return cost;
}`;
  source = source.slice(0, spendStart) + spendReplacement + source.slice(spendEnd);
  await fs.writeFile(enginePath, source);
}

await fs.writeFile(versionPath, JSON.stringify({ version: "01.05.009" }, null, 2) + "\n");

let battle = await fs.readFile(battlePath, "utf8");
battle = battle.replaceAll("01.05.006", "01.05.009").replaceAll("01.05.007", "01.05.009").replaceAll("01.05.008", "01.05.009");
await fs.writeFile(battlePath, battle);

let validate = await fs.readFile(validatePath, "utf8");
if (!validate.includes("check-battle-ai-stage7-evolution.mjs")) {
  const auditStep = "      - name: Audit Battle Sim AI behavior baseline\n        run: node scripts/audit-battle-ai-behavior.mjs";
  if (!validate.includes(auditStep)) throw new Error("Stage 7: validate-site audit anchor not found");
  validate = validate.replace(auditStep, `${auditStep}\n\n      - name: Run Battle AI Stage 7 evolution policy gates\n        run: node scripts/check-battle-ai-stage7-evolution.mjs`);
  await fs.writeFile(validatePath, validate);
}

console.log("Applied Battle AI Stage 7 evolution policy (01.05.009).");
