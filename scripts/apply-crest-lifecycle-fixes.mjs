import fs from "node:fs";

const path = "js/battle-engine-v5.js";
let src = fs.readFileSync(path, "utf8");
const MARK = "// [[battle-crest-lifecycle-order-v1]]";
if (src.includes(MARK)) {
  console.log("Crest lifecycle fixes already materialized");
  process.exit(0);
}

function replaceOnce(before, after, label) {
  const index = src.indexOf(before);
  if (index < 0) throw new Error(`Missing anchor: ${label}`);
  src = src.slice(0, index) + after + src.slice(index + before.length);
}

function functionRange(name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing function ${name}`);
  const next = src.indexOf("\nfunction ", start + 10);
  return { start, end: next < 0 ? src.length : next };
}

function patchLoopFunction(name) {
  const signature = `function ${name}(player, opponent, playerIndex, enemyIndex, stats, rng, map) {`;
  const nextSignature = `function ${name}(player, opponent, playerIndex, enemyIndex, stats, rng, map, onlyCrest = null) {`;
  replaceOnce(signature, nextSignature, `${name} signature`);
  const range = functionRange(name);
  const variants = [
    "for (const crest of player.crests ?? []) {",
    "for (const crest of [...(player.crests ?? [])]) {"
  ];
  let loopStart = -1;
  let loopNeedle = null;
  for (const variant of variants) {
    const found = src.indexOf(variant, range.start);
    if (found >= 0 && found < range.end && (loopStart < 0 || found < loopStart)) {
      loopStart = found;
      loopNeedle = variant;
    }
  }
  if (loopStart < 0 || !loopNeedle) throw new Error(`Missing Crest loop in ${name}`);
  src = src.slice(0, loopStart) + "for (const crest of onlyCrest ? [onlyCrest] : [...(player.crests ?? [])]) {" + src.slice(loopStart + loopNeedle.length);
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
  "function applyNeutralCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map) {\n  const actions = [];",
  "function applyNeutralCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map, onlyCrest = null) {\n  const actions = [];\n  if (onlyCrest && norm(onlyCrest.name) !== \"mjerrabaine, great manifest\") return actions;",
  "Neutral Crest end filter"
);

replaceOnce(
  "function applyAbysscraftCrestTurnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map) {\n  const actions = [];",
  "function applyAbysscraftCrestTurnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map, onlyCrest = null) {\n  const actions = [];\n  if (onlyCrest && norm(onlyCrest.name) !== \"charon, stygian oarswoman\") return actions;",
  "Abyss Crest start filter"
);

replaceOnce(
  "function applyForestCrestTurnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map) {\n  const actions = [];\n  if (hasCrest(player, \"Titania, Queen of Fairies\")) {",
  "function applyForestCrestTurnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map, onlyCrest = null) {\n  const actions = [];\n  if ((!onlyCrest || norm(onlyCrest.name) === \"titania, queen of fairies\") && hasCrest(player, \"Titania, Queen of Fairies\")) {",
  "Forest Crest start filter"
);

replaceOnce(
  "function applyRunecraftCrestTurnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map) {",
  "function applyRunecraftCrestTurnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map, onlyCrest = null) {",
  "Runecraft Crest start signature"
);
{
  const range = functionRange("applyRunecraftCrestTurnStart");
  const variants = [
    "for (const crest of [...(player.crests ?? [])]) {",
    "for (const crest of player.crests ?? []) {"
  ];
  let loopStart = -1;
  let loopNeedle = null;
  for (const variant of variants) {
    const found = src.indexOf(variant, range.start);
    if (found >= 0 && found < range.end) { loopStart = found; loopNeedle = variant; break; }
  }
  if (loopStart < 0 || !loopNeedle) throw new Error("Missing Runecraft Crest start loop");
  src = src.slice(0, loopStart) + "for (const crest of onlyCrest ? [onlyCrest] : [...(player.crests ?? [])]) {" + src.slice(loopStart + loopNeedle.length);
}

replaceOnce(
  "function applyPortalcraftPreTickCrestTurnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map) {\n  const actions = [];\n  const crest = (player.crests ?? []).find(item => norm(item.name) === \"slaus, revolving wheel of fortune\");",
  "function applyPortalcraftPreTickCrestTurnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map, onlyCrest = null) {\n  const actions = [];\n  const crest = onlyCrest\n    ? (norm(onlyCrest.name) === \"slaus, revolving wheel of fortune\" ? onlyCrest : null)\n    : (player.crests ?? []).find(item => norm(item.name) === \"slaus, revolving wheel of fortune\");",
  "Slaus Crest start filter"
);

// End-turn Crest abilities with the same timing resolve in Crest acquisition order.
{
  const { start, end } = functionRange("applyCrestTurnEnd");
  const fn = src.slice(start, end);
  const variants = [
    "  for (const crest of player.crests ?? []) {",
    "  for (const crest of [...(player.crests ?? [])]) {"
  ];
  let loopStart = -1;
  let loopNeedle = null;
  for (const variant of variants) {
    const found = fn.indexOf(variant);
    if (found >= 0 && (loopStart < 0 || found < loopStart)) { loopStart = found; loopNeedle = variant; }
  }
  const returnStart = fn.lastIndexOf("  return actions;");
  if (loopStart < 0 || !loopNeedle || returnStart < 0 || returnStart <= loopStart) throw new Error("Could not isolate applyCrestTurnEnd generic loop");
  let loopAndTail = fn.slice(loopStart, returnStart);
  loopAndTail = loopAndTail.replace(loopNeedle, `  for (const crest of [...(player.crests ?? [])]) {\n    actions.push(...applyForestCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map, crest));\n    actions.push(...applySwordcraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map, crest));\n    actions.push(...applyRunecraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map, crest));\n    actions.push(...applyDragoncraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map, crest));\n    actions.push(...applyAbysscraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map, crest));\n    actions.push(...applyPortalcraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map, crest));\n    actions.push(...applyNeutralCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map, crest));\n    actions.push(...applyHavencraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map, crest));`);
  const rebuilt = `function applyCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map) {\n  const actions = [];\n  ${MARK}\n${loopAndTail}  return actions;\n}\n`;
  src = src.slice(0, start) + rebuilt + src.slice(end);
}

const orderedStartHelper = `function applyCrestTurnStartOrdered(player, opponent, playerIndex, enemyIndex, stats, rng, map) {\n  const actions = [];\n  for (const crest of [...(player.crests ?? [])]) {\n    const name = norm(crest.name);\n    actions.push(...applyPortalcraftPreTickCrestTurnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map, crest));\n    actions.push(...applyAbysscraftCrestTurnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map, crest));\n    actions.push(...applyForestCrestTurnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map, crest));\n    actions.push(...applyRunecraftCrestTurnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map, crest));\n    if (name === \"burnite, anathema of ash\") {\n      player.hp -= 2;\n      actions.push(\"Burnite Ash Crest: 2 damage to your leader\");\n    }\n    if (name === \"burnite, anathema of flame\") {\n      player.hp -= 1;\n      actions.push(\"Burnite Flame Crest: 1 damage to your leader\");\n    }\n  }\n  return actions;\n}\n\n`;
replaceOnce("function turnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map) {", orderedStartHelper + "function turnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map) {", "turnStart helper insertion");

// Start-of-turn Crest abilities resolve before their Countdown is decremented/expired.
{
  const range = functionRange("turnStart");
  const startMarker = "  // Slaus's opponent Crest has a start-of-turn ability at the same timing as";
  const endMarker = '  for (const amulet of [...player.board].filter(unit => unit.type === "Amulet" && Number.isFinite(unit.countdown))) {';
  const blockStart = src.indexOf(startMarker, range.start);
  const blockEnd = src.indexOf(endMarker, range.start);
  if (blockStart < 0 || blockEnd < 0 || blockEnd <= blockStart || blockEnd >= range.end) throw new Error("Could not locate legacy Crest start-turn block");
  const replacement = "  // [[battle-crest-ordered-turn-start]]\n  actions.push(...applyCrestTurnStartOrdered(player, opponent, playerIndex, enemyIndex, stats, rng, map));\n  tickCrests(player, opponent, playerIndex, enemyIndex, stats, rng, map, actions);\n\n";
  src = src.slice(0, blockStart) + replacement + src.slice(blockEnd);
}

fs.writeFileSync(path, src);
console.log("Materialized Crest acquisition-order and expiring-turn fixes");
