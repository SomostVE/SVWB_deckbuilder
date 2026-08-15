import fs from "node:fs/promises";

const path = new URL("../js/battle-engine-v5.js", import.meta.url);
let source = await fs.readFile(path, "utf8");

if (source.includes("// [[battle-ai-v1-1-extra-pp-profile]]")) {
  console.log("Battle AI v1.1 profile-aware Extra PP logic already applied.");
  process.exit(0);
}

const start = source.indexOf("// [[battle-ai-v1-extra-pp]]\nfunction useBonusPpIfUseful");
const end = source.indexOf("\nfunction bestImmediateTurnAction", start);
if (start < 0 || end < 0) throw new Error("Battle AI v1 Extra PP block not found");

const replacement = `// [[battle-ai-v1-extra-pp]]
// [[battle-ai-v1-1-extra-pp-profile]]
function useBonusPpIfUseful(player, opponent) {
  if (!player.bonusPpAvailable) return false;

  const current = bestImmediateTurnAction(player, opponent);
  const currentPp = player.pp;
  const currentSpend = estimateTurnSpend(player, currentPp);

  player.pp = currentPp + 1;
  const boosted = bestImmediateTurnAction(player, opponent);
  const boostedSpend = estimateTurnSpend(player, currentPp + 1);
  player.pp = currentPp;

  if (!boosted) return false;

  const style = String(player.strategy?.style ?? "midrange");
  const control = style === "ward-control" || style === "control";
  const tempo = style === "puppetry-tempo" || style === "buff-tempo";
  const aggro = style === "aggro";
  const currentScore = Number(current?.score ?? -Infinity);
  const boostedScore = Number(boosted.score ?? -Infinity);
  const improvement = boostedScore - currentScore;
  const curveUpgrade = boostedSpend > currentSpend;
  const firstChargeDeadline = player.personalTurn === 5 && player.bonusPpUses === 0;
  const laterCharge = player.personalTurn >= 6 && player.bonusPpUses >= 1;
  const enemyBoard = opponent.board.filter(unit => unit.type === "Follower");

  let threshold = 1.5;
  if (aggro) threshold = 1.0;
  else if (tempo) threshold = 1.65;
  else if (style === "spell-combo") threshold = 1.75;
  else if (style === "ramp") threshold = 1.25;
  else if (control) threshold = 3.0;

  // The second charge is strategically scarcer: tempo/control decks should not
  // fire it just because a slightly more expensive card became available.
  if (laterCharge) {
    if (tempo) threshold += 0.75;
    if (control) threshold += 1.5;
  }

  const clearUpgrade = !current || improvement >= threshold;
  const tacticalPressure = enemyBoard.length > 0 && improvement >= (control ? 2.5 : tempo ? 1.25 : 0.75);
  const lethalPressure = opponent.hp <= 8 && improvement > 0;
  const deadlineSpend = firstChargeDeadline && curveUpgrade && (!control || improvement >= -0.25);

  const shouldUse = clearUpgrade || tacticalPressure || lethalPressure || deadlineSpend;
  if (!shouldUse) return false;

  player.pp = currentPp + 1;
  player.bonusPpAvailable = false;
  player.bonusPpUses += 1;
  return true;
}
`;

source = source.slice(0, start) + replacement + source.slice(end);
await fs.writeFile(path, source);
console.log("Applied Battle AI v1.1 profile-aware Extra PP decision logic.");
