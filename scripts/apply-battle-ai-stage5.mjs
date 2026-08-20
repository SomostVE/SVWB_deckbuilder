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

const plannerMarker = `function hasAnyPlannerAction(player, opponent, map) {`;
const lethalHelpers = `// [[battle-ai-stage5-lethal-solver]]
function plannerReadyFaceDamage(player, opponent) {
  if (activeWards(opponent.board).length) return 0;
  return player.board
    .filter(unit => unit.type === "Follower" && unit.canAttackLeader && unit.attacksMade < unit.maxAttacks)
    .reduce((sum, unit) => {
      const attacks = Math.max(0, (Number(unit.maxAttacks) || 1) - (Number(unit.attacksMade) || 0));
      return sum + Math.max(0, Number(unit.attack) || 0) * attacks;
    }, 0);
}

function plannerOptimisticBurst(player) {
  let burst = player.board
    .filter(unit => unit.type === "Follower" && unit.attacksMade < unit.maxAttacks)
    .reduce((sum, unit) => {
      const attacks = Math.max(0, (Number(unit.maxAttacks) || 1) - (Number(unit.attacksMade) || 0));
      return sum + Math.max(0, Number(unit.attack) || 0) * attacks;
    }, 0);

  for (const item of player.hand ?? []) {
    const legal = modes(item, player).filter(mode => mode.cost <= player.pp);
    if (!legal.length) continue;
    const card = item.card;
    const text = norm(card?.text);
    if (card?.type === "Follower" && (has(card, "Storm") || /give this follower storm|\bstorm\b/.test(text))) {
      burst += Math.max(0, Number(card.attack) || 0);
    }
    for (const match of text.matchAll(/deal\s+(\d+)\s+damage\s+to\s+(?:the\s+)?enemy\s+leader/g)) {
      burst += Math.max(0, Number(match[1]) || 0);
    }
    for (const match of text.matchAll(/deal\s+(\d+)\s+damage\s+to\s+a\s+random\s+enemy/g)) {
      burst += Math.max(0, Number(match[1]) || 0);
    }
    for (const match of text.matchAll(/give[^.\n]*\+(\d+)\s*\/\s*[+-]?\d+/g)) {
      burst += Math.max(0, Number(match[1]) || 0);
    }
  }

  if (!player.evolutionActionUsed) {
    const normalAvailable = player.personalTurn >= (player.goingFirst ? 5 : 4) && player.ep > 0;
    const superAvailable = player.personalTurn >= (player.goingFirst ? 7 : 6) && player.sep > 0;
    if (superAvailable) burst += 3;
    else if (normalAvailable) burst += 2;
  }
  return burst;
}

function shouldRunPlannerLethalSearch(root, best, options = {}) {
  if (options.disableLethalSearch) return false;
  const player = root.player, opponent = root.opponent;
  if (player.hp <= 0 || opponent.hp <= 0 || best?.state?.opponent?.hp <= 0) return false;

  // The deliberately shallow future-response planner stays cheap. Real turns
  // and explicit QA searches still get the extended lethal solver.
  if ((Number(options.depth) || 0) <= 1 && (Number(options.beamWidth) || 0) <= 1) return false;

  const projectedHp = Number(best?.state?.opponent?.hp ?? opponent.hp);
  if (projectedHp <= 6 && projectedHp < opponent.hp) return true;
  if (plannerOptimisticBurst(player) >= opponent.hp) return true;

  // At low defense, search even when generic text cannot estimate a bespoke
  // class combo. Exact simulation, not the estimate, decides whether lethal is
  // actually legal.
  if (opponent.hp <= 10 && (player.hand.length || player.board.some(unit => unit.type === "Follower"))) return true;
  return false;
}

function enumerateLethalPlannerActions(player, opponent, map) {
  const plays = scoredPlayOptions(player, opponent, false).slice(0, 8).map(item => ({
    kind: "play", instanceUid: item.instance.uid, mode: { ...item.mode }, targetPlan: item.targetPlan ? { ...item.targetPlan } : null, prior: item.score
  }));
  const fuses = getFuseActions(player, opponent, map).slice(0, 4).map(item => ({
    kind: "fuse", targetUid: item.target.uid, materialUids: item.materials.map(material => material.uid), prior: item.score
  }));
  const engages = enumerateEngageDecisions(player, opponent).slice(0, 3);
  const evolutions = enumerateEvolutionDecisions(player, opponent).slice(0, 8);
  const allAttacks = enumerateAttackDecisions(player, opponent);
  const attacks = activeWards(opponent.board).length
    ? allAttacks.slice(0, 10)
    : [...allAttacks.filter(action => action.leader), ...allAttacks.filter(action => !action.leader).slice(0, 5)].slice(0, 10);
  return diversifyPlannerActions([plays, fuses, engages, evolutions, attacks], 16)
    .filter(action => action.kind !== "end");
}

function plannerLethalSearchScore(node, startingOpponentHp) {
  const player = node.state.player, opponent = node.state.opponent;
  if (opponent.hp <= 0) return 1000000 + plannerNodeScore(node, false);
  if (player.hp <= 0) return -1000000;
  const damage = Math.max(0, startingOpponentHp - opponent.hp);
  const wards = activeWards(opponent.board);
  const wardDefense = wards.reduce((sum, unit) => sum + Math.max(0, Number(unit.defense) || 0), 0);
  const readyFace = plannerReadyFaceDamage(player, opponent);
  const remainingBurst = plannerOptimisticBurst(player);
  const actionCount = node.sequence.length;
  return damage * 70
    + readyFace * 12
    + Math.min(20, remainingBurst) * 2.5
    - wards.length * 18
    - wardDefense * 1.4
    + Math.max(0, Number(player.pp) || 0) * .4
    + node.priorTotal * .035
    - actionCount * .35;
}

function findPlannerLethal(root, map, seed, options = {}) {
  const depthLimit = Math.max(5, Math.min(8, Number(options.lethalDepth ?? 7) || 7));
  const beamWidth = Math.max(8, Math.min(24, Number(options.lethalBeamWidth ?? 16) || 16));
  const startingOpponentHp = root.opponent.hp;
  let beam = [{ state: root, sequence: [], priorTotal: 0, score: plannerLethalSearchScore({ state: root, sequence: [], priorTotal: 0 }, startingOpponentHp) }];
  const lethals = [];
  let explored = 0;

  for (let depth = 0; depth < depthLimit; depth += 1) {
    const expanded = [];
    for (const node of beam) {
      const actions = enumerateLethalPlannerActions(node.state.player, node.state.opponent, map);
      for (const action of actions) {
        explored += 1;
        const childState = clonePlanningState(node.state);
        const sequence = [...node.sequence, action];
        const branchRng = createRng(`${seed}|lethal|${sequence.map(actionKey).join(">")}`);
        const outcome = executePlannerAction(childState, action, map, branchRng);
        if (!outcome.applied) continue;
        const child = {
          state: childState,
          sequence,
          priorTotal: node.priorTotal + Math.max(-20, Math.min(40, Number(action.prior) || 0))
        };
        child.score = plannerLethalSearchScore(child, startingOpponentHp);
        if (childState.opponent.hp <= 0) lethals.push(child);
        else if (childState.player.hp > 0) expanded.push(child);
      }
    }
    if (!expanded.length) break;
    expanded.sort((a, b) => b.score - a.score || a.sequence.length - b.sequence.length || a.sequence.map(actionKey).join("|").localeCompare(b.sequence.map(actionKey).join("|")));
    beam = expanded.slice(0, beamWidth);
  }

  if (!lethals.length) return null;
  lethals.sort((a, b) => plannerNodeScore(b, false) - plannerNodeScore(a, false) || a.sequence.length - b.sequence.length);
  return { node: lethals[0], explored };
}

`;
if (!engine.includes("[[battle-ai-stage5-lethal-solver]]")) {
  const index = engine.indexOf(plannerMarker);
  if (index < 0) throw new Error("Could not locate planner insertion marker");
  engine = engine.slice(0, index) + lethalHelpers + engine.slice(index);
}

const bestMarker = `  const best = finalists[0] ?? { sequence: [{ kind: "end" }], score: plannerStateValue(root, true), state: root, priorTotal: 0 };
  const candidateLimit = Math.max(1, Number(options.candidateLimit ?? 4) || 4);`;
const bestReplacement = `  const best = finalists[0] ?? { sequence: [{ kind: "end" }], score: plannerStateValue(root, true), state: root, priorTotal: 0 };

  if (shouldRunPlannerLethalSearch(root, best, options)) {
    const solved = findPlannerLethal(root, map, seed, options);
    if (solved?.node?.state?.opponent?.hp <= 0) {
      const lethalNode = solved.node;
      return {
        sequence: lethalNode.sequence,
        score: plannerNodeScore(lethalNode, false),
        explored: finalists.length + solved.explored,
        candidates: [lethalNode],
        lethalSolved: true,
        lethalSearchExplored: solved.explored
      };
    }
  }

  const candidateLimit = Math.max(1, Number(options.candidateLimit ?? 4) || 4);`;
engine = replaceOnce(engine, bestMarker, bestReplacement, "planner best selection");

const normalReturn = `  return {
    sequence: best.sequence,
    score: best.score,
    explored: finalists.length,
    candidates: diverseCandidates.length ? diverseCandidates : [best]
  };`;
const normalReturnReplacement = `  return {
    sequence: best.sequence,
    score: best.score,
    explored: finalists.length,
    candidates: diverseCandidates.length ? diverseCandidates : [best],
    lethalSolved: Boolean(best.state?.opponent?.hp <= 0),
    lethalSearchExplored: 0
  };`;
engine = replaceOnce(engine, normalReturn, normalReturnReplacement, "planner return metadata");

const inspectReturn = `    explored: plan.explored,
    futureEvaluated: Boolean(plan.futureEvaluated),`;
const inspectReturnReplacement = `    explored: plan.explored,
    lethalSolved: Boolean(plan.lethalSolved),
    lethalSearchExplored: Number(plan.lethalSearchExplored) || 0,
    futureEvaluated: Boolean(plan.futureEvaluated),`;
engine = replaceOnce(engine, inspectReturn, inspectReturnReplacement, "inspect lethal metadata");
fs.writeFileSync(enginePath, engine);

let audit = fs.readFileSync(auditPath, "utf8");
if (!audit.includes("Stage 5 lethal-solver gates")) {
  const marker = `assert.ok(cases.length >= 12, "Behavior audit must keep broad deterministic coverage");`;
  const index = audit.indexOf(marker);
  if (index < 0) throw new Error("Could not locate behavior audit insertion point");
  const stage5 = `// Stage 5 lethal-solver gates: search beyond the ordinary four-action beam so
// removal, Storm deployment, evolution and several attacks can be combined.
const lethalStorm = follower("Audit Lethal Storm", 3, 4, 4, "Storm", ["Storm"]);

audit("Find six-action lethal through Ward with Storm and Evo", "lethal-solver", () => inspectTurnPlan({
  hand: [destroy, lethalStorm], pp: 5, maxPp: 5, personalTurn: 5, ep: 1, sep: 0, opponentHp: 10,
  strategy: { style: "midrange" },
  board: [
    { name: "Audit Lethal Body A", attack: 2, defense: 2, canAttackLeader: true, canAttackFollower: true },
    { name: "Audit Lethal Body B", attack: 2, defense: 2, canAttackLeader: true, canAttackFollower: true }
  ],
  opponentBoard: [{ name: "Audit Lethal Ward", attack: 1, defense: 8, keywords: ["Ward"] }]
}), plan => {
  const removal = plan.sequence.findIndex(step => step.kind === "play" && step.card === destroy.name && step.target === "Audit Lethal Ward");
  const storm = plan.sequence.findIndex(step => step.kind === "play" && step.card === lethalStorm.name);
  const evolve = plan.sequence.findIndex(step => step.kind === "evolve" && step.card === lethalStorm.name);
  const face = plan.sequence.filter(step => step.kind === "attack" && step.target === "leader");
  return plan.lethalSolved && plan.lethalSearchExplored > 0 && removal >= 0 && storm >= 0 && evolve > storm && face.length >= 3;
});

audit("Preserve Evo when extended lethal does not need it", "lethal-solver", () => inspectTurnPlan({
  hand: [destroy, lethalStorm], pp: 5, maxPp: 5, personalTurn: 5, ep: 2, sep: 0, opponentHp: 10,
  strategy: { style: "midrange" },
  board: [
    { name: "Audit No Evo A", attack: 2, defense: 2, canAttackLeader: true, canAttackFollower: true },
    { name: "Audit No Evo B", attack: 2, defense: 2, canAttackLeader: true, canAttackFollower: true },
    { name: "Audit No Evo C", attack: 2, defense: 2, canAttackLeader: true, canAttackFollower: true }
  ],
  opponentBoard: [{ name: "Audit No Evo Ward", attack: 1, defense: 8, keywords: ["Ward"] }]
}), plan => plan.lethalSolved
  && plan.sequence.some(step => step.kind === "play" && step.card === destroy.name)
  && plan.sequence.some(step => step.kind === "play" && step.card === lethalStorm.name)
  && plan.sequence.filter(step => step.kind === "attack" && step.target === "leader").length >= 4
  && !plan.sequence.some(step => step.kind === "evolve" || step.kind === "super-evolve"));

audit("Use Super Evo when extended lethal requires the extra attack", "lethal-solver", () => inspectTurnPlan({
  hand: [destroy, lethalStorm], pp: 5, maxPp: 6, personalTurn: 6,
  goingFirst: false, goingSecond: true, ep: 0, sep: 1, opponentHp: 11,
  strategy: { style: "midrange" },
  board: [
    { name: "Audit Super Lethal A", attack: 2, defense: 2, canAttackLeader: true, canAttackFollower: true },
    { name: "Audit Super Lethal B", attack: 2, defense: 2, canAttackLeader: true, canAttackFollower: true }
  ],
  opponentBoard: [{ name: "Audit Super Lethal Ward", attack: 1, defense: 8, keywords: ["Ward"] }]
}), plan => plan.lethalSolved
  && plan.sequence.some(step => step.kind === "super-evolve" && step.card === lethalStorm.name)
  && plan.sequence.filter(step => step.kind === "attack" && step.target === "leader").length >= 3);

`;
  audit = audit.slice(0, index) + stage5 + audit.slice(index);
}
audit = audit.replace("Battle AI behavior baseline — 01.05.006", "Battle AI behavior baseline — 01.05.007");
fs.writeFileSync(auditPath, audit);

const version = JSON.parse(fs.readFileSync(versionPath, "utf8"));
version.version = "01.05.007";
fs.writeFileSync(versionPath, `${JSON.stringify(version, null, 2)}\n`);

let battle = fs.readFileSync(battlePath, "utf8");
battle = battle.replaceAll("01.05.006", "01.05.007");
fs.writeFileSync(battlePath, battle);

console.log("Battle AI stage 5 lethal solver migration applied.");
