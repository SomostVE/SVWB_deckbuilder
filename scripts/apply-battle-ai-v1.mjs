import fs from "node:fs/promises";

const path = new URL("../js/battle-engine-v5.js", import.meta.url);
let source = await fs.readFile(path, "utf8");

if (source.includes("// [[battle-ai-v1-extra-pp]]")) {
  console.log("Battle AI v1 Extra PP logic already applied.");
  process.exit(0);
}

const oldCall = "      useBonusPpIfUseful(p);";
const newCall = "      useBonusPpIfUseful(p, o);";
if (!source.includes(oldCall)) throw new Error("Extra PP call site not found");
source = source.replace(oldCall, newCall);

const oldHelper = `function useBonusPpIfUseful(player) {
  if (!player.bonusPpAvailable) return;
  if (getModesForHand(player).length) return;
  player.pp += 1;
  if (!getModesForHand(player).length) { player.pp -= 1; return; }
  player.bonusPpAvailable = false;
  player.bonusPpUses += 1;
}
`;

const newHelper = `// [[battle-ai-v1-extra-pp]]
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

  const currentScore = Number(current?.score ?? -Infinity);
  const boostedScore = Number(boosted.score ?? -Infinity);
  const scoreUpgrade = !current || boostedScore >= currentScore + 1.25;
  const curveUpgrade = boostedSpend > currentSpend;
  const firstChargeDeadline = player.personalTurn === 5 && player.bonusPpUses === 0;
  const pressureUse = (opponent.hp <= 10 || opponent.board.some(unit => unit.type === "Follower"))
    && boostedScore > currentScore + 0.25;

  // Early on, preserve the charge unless +1 PP materially improves the action.
  // By turn 5 the first charge would otherwise miss its turn-6 refresh, so use it
  // whenever it converts into additional spend. After turn 6, use it for a clear
  // tactical upgrade rather than simply because one PP is available.
  const shouldUse = scoreUpgrade || pressureUse || (firstChargeDeadline && curveUpgrade);
  if (!shouldUse) return false;

  player.pp = currentPp + 1;
  player.bonusPpAvailable = false;
  player.bonusPpUses += 1;
  return true;
}

function bestImmediateTurnAction(player, opponent) {
  const play = bestPlay(player, opponent);
  const engage = bestEngage(player, opponent);
  if (!engage) return play;
  if (!play) return engage;
  return engage.score > play.score ? engage : play;
}

function estimateTurnSpend(player, budget) {
  const previousPp = player.pp;
  player.pp = Math.max(0, Number(budget) || 0);
  const options = player.hand.map(item => {
    const available = modes(item, player);
    if (!available.length) return [];
    return [...new Set(available.map(mode => Number(mode.cost) || 0))].filter(cost => cost <= player.pp);
  });
  player.pp = previousPp;

  // Small 0/1 knapsack over hand cards. This intentionally estimates PP usage,
  // not tactical value; bestImmediateTurnAction handles tactical quality.
  const reachable = new Set([0]);
  for (const costs of options) {
    const before = [...reachable];
    for (const spent of before) {
      for (const cost of costs) {
        const total = spent + cost;
        if (total <= budget) reachable.add(total);
      }
    }
  }
  return Math.max(...reachable);
}
`;

if (!source.includes(oldHelper)) throw new Error("Legacy Extra PP helper not found");
source = source.replace(oldHelper, newHelper);

await fs.writeFile(path, source);
console.log("Applied Battle AI v1 Extra PP decision logic.");
