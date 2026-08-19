import fs from "node:fs";

const path = "js/battle-engine-v5.js";
let src = fs.readFileSync(path, "utf8");
const MARK = "// [[battle-crest-lifecycle-order-v1]]";
if (src.includes(MARK)) {
  console.log("Crest lifecycle fixes already materialized");
  process.exit(0);
}

function replaceOnce(before, after, label) {
  if (!src.includes(before)) throw new Error(`Missing anchor: ${label}`);
  src = src.replace(before, after);
}

function patchLoopFunction(name) {
  const signature = `function ${name}(player, opponent, playerIndex, enemyIndex, stats, rng, map) {`;
  const nextSignature = `function ${name}(player, opponent, playerIndex, enemyIndex, stats, rng, map, onlyCrest = null) {`;
  const start = src.indexOf(signature);
  if (start < 0) throw new Error(`Missing ${name}`);
  src = src.slice(0, start) + src.slice(start).replace(signature, nextSignature);
  const loopStart = src.indexOf("for (const crest of player.crests ?? []) {", start);
  if (loopStart < 0) throw new Error(`Missing Crest loop in ${name}`);
  src = src.slice(0, loopStart) + "for (const crest of onlyCrest ? [onlyCrest] : (player.crests ?? [])) {" + src.slice(loopStart + "for (const crest of player.crests ?? []) {".length);
}

for (const fn of [
  "applyForestCrestTurnEnd",
  "applySwordcraftCrestTurnEnd",
  "applyRunecraftCrestTurnEnd",
  "applyDragoncraftCrestTurnEnd",
  "applyAbysscraftCrestTurnEnd",
  "applyPortalcraftCrestTurnEnd",
  "applyHavencraftCrestTurnEnd"
]) patchLoopFunction(fn);

replaceOnce(
  "function applyNeutralCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map) {\n  const actions = [];\n  if (!hasCrest(player, \"Mjerrabaine, Great Manifest\")) return actions;",
  "function applyNeutralCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map, onlyCrest = null) {\n  const actions = [];\n  if (onlyCrest && norm(onlyCrest.name) !== \"mjerrabaine, great manifest\") return actions;\n  if (!hasCrest(player, \"Mjerrabaine, Great Manifest\")) return actions;",
  "neutral Crest filter"
);

// Start-turn handlers: filter each handler to the Crest currently being dispatched.
replaceOnce(
  "function applyAbysscraftCrestTurnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map) {\n  const actions = [];\n  if (!hasCrest(player, \"Charon, Stygian Oarswoman\")) return actions;",
  "function applyAbysscraftCrestTurnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map, onlyCrest = null) {\n  const actions = [];\n  if (onlyCrest && norm(onlyCrest.name) !== \"charon, stygian oarswoman\") return actions;\n  if (!hasCrest(player, \"Charon, Stygian Oarswoman\")) return actions;",
  "Abyss start Crest filter"
);

const forestSig = "function applyForestCrestTurnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map) {\n  const actions = [];";
replaceOnce(forestSig, `${forestSig.slice(0,-1)}, onlyCrest = null) {\n  const actions = [];\n  const onlyName = onlyCrest ? norm(onlyCrest.name) : null;`, "Forest start signature");
// Gate the two currently handled Forest start Crests independently.
replaceOnce('  if (hasCrest(player, "Titania, Queen of Fairies")) {', '  if ((!onlyName || onlyName === "titania, queen of fairies") && hasCrest(player, "Titania, Queen of Fairies")) {', "Titania target gate");

const runeSignature = "function applyRunecraftCrestTurnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map) {";
replaceOnce(runeSignature, "function applyRunecraftCrestTurnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map, onlyCrest = null) {", "Rune start signature");
const runeStart = src.indexOf("function applyRunecraftCrestTurnStart");
const runeLoop = src.indexOf("for (const crest of [...(player.crests ?? [])]) {", runeStart);
if (runeLoop < 0) throw new Error("Missing Rune Crest start loop");
src = src.slice(0, runeLoop) + "for (const crest of onlyCrest ? [onlyCrest] : [...(player.crests ?? [])]) {" + src.slice(runeLoop + "for (const crest of [...(player.crests ?? [])]) {".length);

replaceOnce(
  "function applyPortalcraftPreTickCrestTurnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map) {\n  const actions = [];\n  const crest = (player.crests ?? []).find(item => norm(item.name) === \"slaus, revolving wheel of fortune\");",
  "function applyPortalcraftPreTickCrestTurnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map, onlyCrest = null) {\n  const actions = [];\n  const crest = onlyCrest && norm(onlyCrest.name) === \"slaus, revolving wheel of fortune\" ? onlyCrest : (!onlyCrest ? (player.crests ?? []).find(item => norm(item.name) === \"slaus, revolving wheel of fortune\") : null);",
  "Slaus start filter"
);

// Replace fixed class-order end-turn dispatch with acquisition-order dispatch.
const oldEndDispatch = `function applyCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map) {\n  const actions = [];\n  // [[battle-forestcraft-crest-turn-end]]\n  actions.push(...applyForestCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map));\n  // [[battle-swordcraft-crest-turn-end]]\n  actions.push(...applySwordcraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map));\n  // [[battle-runecraft-crest-turn-end]]\n  actions.push(...applyRunecraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map));\n  // [[battle-dragoncraft-crest-turn-end]]\n  actions.push(...applyDragoncraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map));\n  // [[battle-abysscraft-crest-turn-end]]\n  actions.push(...applyAbysscraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map));\n  // [[battle-portalcraft-crest-turn-end]]\n  actions.push(...applyPortalcraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map));\n  // [[battle-neutral-crest-turn-end]]\n  actions.push(...applyNeutralCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map));\n  // [[battle-havencraft-final-crest-turn-end]]\n  actions.push(...applyHavencraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map));\n  for (const crest of player.crests ?? []) {`;
const newEndDispatch = `function applyCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map) {\n  const actions = [];\n  ${MARK}\n  // Crests that trigger at the same timing resolve in the order they were gained.\n  for (const crest of [...(player.crests ?? [])]) {\n    actions.push(...applyForestCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map, crest));\n    actions.push(...applySwordcraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map, crest));\n    actions.push(...applyRunecraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map, crest));\n    actions.push(...applyDragoncraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map, crest));\n    actions.push(...applyAbysscraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map, crest));\n    actions.push(...applyPortalcraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map, crest));\n    actions.push(...applyNeutralCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map, crest));\n    actions.push(...applyHavencraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map, crest));`;
replaceOnce(oldEndDispatch, newEndDispatch, "ordered end-turn Crest dispatch");

// Ordered start-turn dispatch. Countdown is ticked only after start-of-turn abilities
// have entered the resolution queue, so the expiring Countdown turn still triggers.
const orderedStartHelper = `\nfunction applyCrestTurnStartOrdered(player, opponent, playerIndex, enemyIndex, stats, rng, map) {\n  const actions = [];\n  for (const crest of [...(player.crests ?? [])]) {\n    const name = norm(crest.name);\n    actions.push(...applyPortalcraftPreTickCrestTurnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map, crest));\n    actions.push(...applyAbysscraftCrestTurnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map, crest));\n    actions.push(...applyForestCrestTurnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map, crest));\n    actions.push(...applyRunecraftCrestTurnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map, crest));\n    if (name === \"burnite, anathema of ash\") { player.hp -= 2; actions.push(\"Burnite Ash Crest: 2 damage to your leader\"); }\n    if (name === \"burnite, anathema of flame\") { player.hp -= 1; actions.push(\"Burnite Flame Crest: 1 damage to your leader\"); }\n  }\n  return actions;\n}\n`;
const turnStartAnchor = "function turnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map) {";
replaceOnce(turnStartAnchor, orderedStartHelper + "\n" + turnStartAnchor, "ordered start helper");

const startBlockStart = src.indexOf("  // Slaus's opponent Crest has a start-of-turn ability at the same timing as");
const startBlockEndMarker = '  for (const amulet of [...player.board].filter(unit => unit.type === "Amulet" && Number.isFinite(unit.countdown))) {';
const startBlockEnd = src.indexOf(startBlockEndMarker, startBlockStart);
if (startBlockStart < 0 || startBlockEnd < 0) throw new Error("Could not locate old Crest start block");
const replacementStart = `  // [[battle-crest-ordered-turn-start]]\n  actions.push(...applyCrestTurnStartOrdered(player, opponent, playerIndex, enemyIndex, stats, rng, map));\n  tickCrests(player, opponent, playerIndex, enemyIndex, stats, rng, map, actions);\n\n`;
src = src.slice(0, startBlockStart) + replacementStart + src.slice(startBlockEnd);

fs.writeFileSync(path, src);
console.log("Materialized Crest acquisition-order and expiring-turn fixes");
