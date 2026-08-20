import fs from "node:fs/promises";

const root = new URL("../", import.meta.url);
const enginePath = new URL("js/battle-engine-v5.js", root);
const auditPath = new URL("scripts/audit-battle-ai-behavior.mjs", root);
const versionPath = new URL("version.json", root);
const battleHtmlPath = new URL("battle.html", root);

const ENGINE_MARKER = "// [[battle-ai-stage2-efficiency]]";

let engine = await fs.readFile(enginePath, "utf8");
if (!engine.includes(ENGINE_MARKER)) {
  const oldScore = `function plannerNodeScore(node, ended = false) {
  return plannerStateValue(node.state, ended) + node.priorTotal * .14 - node.sequence.length * .04;
}`;
  if (!engine.includes(oldScore)) throw new Error("Battle planner node score block not found");

  const newScore = `${ENGINE_MARKER}
function plannerEvolutionSpendCost(node) {
  const sequence = node.sequence ?? [];
  let cost = 0;
  for (const action of sequence) {
    if (action.kind !== "evolve") continue;
    const superMode = Boolean(action.superMode);
    cost += superMode ? 5.5 : 3.75;

    const unit = node.state?.player?.board?.find(item => item.uid === action.unitUid) ?? null;
    if (!unit) continue;
    const evolveText = getUnitTriggeredText(unit, "evolve") || "";
    const superText = superMode ? (getUnitTriggeredText(unit, "superEvolve") || "") : "";
    const attacked = Boolean(unit.attacked) || (Number(unit.attacksMade) || 0) > 0;
    const enemyFollowers = (node.state?.opponent?.board ?? []).filter(item => item.type === "Follower").length;

    // Pure stat evolutions that neither trigger an ability nor participate in
    // combat this turn are the most common way for the planner to burn a scarce
    // evolution resource for no immediate purpose. Make those lines expensive,
    // especially on an empty enemy board.
    if (!attacked && !evolveText.trim() && !superText.trim() && enemyFollowers === 0) {
      cost += superMode ? 4.5 : 3;
    }
  }
  return cost;
}

function plannerNodeScore(node, ended = false) {
  const actionCount = (node.sequence ?? []).filter(action => action.kind !== "end").length;
  const evolutionCost = plannerEvolutionSpendCost(node);

  // Once lethal has been reached, extra setup actions have no strategic value.
  // Prefer the shortest lethal line and preserve Evo / Super Evo unless the
  // resource was actually required to create lethal.
  if (node.state?.opponent?.hp <= 0) return 100000 - evolutionCost - actionCount * .1;
  if (node.state?.player?.hp <= 0) return -100000 - actionCount * .1;

  return plannerStateValue(node.state, ended)
    + node.priorTotal * .14
    - node.sequence.length * .04
    - evolutionCost;
}`;

  engine = engine.replace(oldScore, newScore);
  await fs.writeFile(enginePath, engine);
  console.log("Applied Battle AI stage 2 action-efficiency scoring.");
} else {
  console.log("Battle AI stage 2 action-efficiency scoring already applied.");
}

let audit = await fs.readFile(auditPath, "utf8");
if (!audit.includes("Stage 2 efficiency gates")) {
  const insertionPoint = `assert.ok(cases.length >= 12, "Behavior audit must keep broad deterministic coverage");`;
  if (!audit.includes(insertionPoint)) throw new Error("Behavior audit insertion point not found");

  const extraCases = `// Stage 2 efficiency gates: equivalent lines must preserve scarce actions and
// exact lethal must not be padded with unnecessary Evo / Super Evo setup.
audit("Take exact lethal without spending Evo", "efficiency", () => inspectTurnPlan({
  hand: [], pp: 0, maxPp: 5, personalTurn: 5, ep: 2, sep: 0, opponentHp: 5,
  strategy: { style: "midrange" },
  board: [{ name: "Audit Exact Finisher", attack: 5, defense: 5, canAttackLeader: true, canAttackFollower: true }],
  opponentBoard: []
}), plan => {
  const lethal = plan.sequence.findIndex(step => step.kind === "attack" && step.target === "leader");
  const evolve = plan.sequence.findIndex(step => step.kind === "evolve" || step.kind === "super-evolve");
  return lethal >= 0 && (evolve < 0 || evolve > lethal);
});

audit("Remove Ward for lethal without unnecessary Evo", "efficiency", () => inspectTurnPlan({
  hand: [destroy], pp: 2, maxPp: 5, personalTurn: 5, ep: 2, sep: 0, opponentHp: 5,
  strategy: { style: "midrange" },
  board: [{ name: "Audit Ward Finisher", attack: 5, defense: 5, canAttackLeader: true, canAttackFollower: true }],
  opponentBoard: [{ name: "Audit Lethal Ward", attack: 1, defense: 5, keywords: ["Ward"] }]
}), plan => {
  const removal = plan.sequence.findIndex(step => step.kind === "play" && step.card === destroy.name && step.target === "Audit Lethal Ward");
  const lethal = plan.sequence.findIndex(step => step.kind === "attack" && step.target === "leader");
  const evolve = plan.sequence.findIndex(step => step.kind === "evolve" || step.kind === "super-evolve");
  return removal >= 0 && lethal > removal && (evolve < 0 || evolve > lethal);
});

audit("Keep Evo after completing a clean 5 PP curve", "efficiency", () => inspectTurnPlan({
  hand: [curveTwo, curveThree], pp: 5, maxPp: 5, personalTurn: 5, ep: 2, sep: 0,
  strategy: { style: "midrange" }, opponentBoard: []
}), plan => {
  const played = new Set(plan.sequence.filter(step => step.kind === "play").map(step => step.card));
  const spentEvolution = plan.sequence.some(step => step.kind === "evolve" || step.kind === "super-evolve");
  return played.has(curveTwo.name) && played.has(curveThree.name) && !spentEvolution;
});

audit("Keep Super Evo on an idle fresh follower", "efficiency", () => inspectTurnPlan({
  hand: [], pp: 0, maxPp: 6, personalTurn: 6,
  goingFirst: false, goingSecond: true, ep: 0, sep: 1, opponentHp: 20,
  strategy: { style: "midrange" }, opponentBoard: [],
  board: [{ name: "Audit Fresh Body", attack: 4, defense: 4, summonedThisTurn: true, canAttackLeader: false, canAttackFollower: false }]
}), plan => !plan.sequence.some(step => step.kind === "super-evolve"));

${insertionPoint}`;

  audit = audit.replace(insertionPoint, extraCases);
}

audit = audit.replaceAll("01.05.003", "01.05.004");
const oldGapBlock = `if (gaps) {
  console.log("Diagnostic gaps are intentionally non-blocking in stage 1; each confirmed gap becomes a regression gate when fixed in later stages.");
}`;
const newGapBlock = `if (gaps) {
  console.log("Stage 2 behavior gates are blocking: inefficient or tactically wrong lines must be fixed before release.");
}
assert.equal(gaps, 0, \`Battle AI stage 2 behavior gate failed with \${gaps} gap(s)\`);`;
if (audit.includes(oldGapBlock)) audit = audit.replace(oldGapBlock, newGapBlock);
await fs.writeFile(auditPath, audit);

const version = JSON.parse(await fs.readFile(versionPath, "utf8"));
version.version = "01.05.004";
await fs.writeFile(versionPath, `${JSON.stringify(version, null, 2)}\n`);

let battleHtml = await fs.readFile(battleHtmlPath, "utf8");
battleHtml = battleHtml.replaceAll("01.05.003", "01.05.004");
await fs.writeFile(battleHtmlPath, battleHtml);

console.log("Battle AI stage 2 migration complete · Beyond Decks 01.05.004");
