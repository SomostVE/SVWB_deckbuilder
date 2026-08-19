import fs from "node:fs";

const path = "js/battle-engine-v5.js";
let src = fs.readFileSync(path, "utf8");

function replaceOnce(before, after, label) {
  if (!src.includes(before)) throw new Error(`Missing cleanup target: ${label}`);
  src = src.replace(before, after);
}

// Only rules-driven countdown destruction bypasses ability-destruction immunity.
replaceOnce(
  `if (ctx.player.board.includes(ctx.sourceUnit)) actions.push(...destroyObject(ctx.player, ctx.opponent, ctx.sourceUnit, ctx.playerIndex, ctx.enemyIndex, ctx.stats, ctx.rng, ctx.cardMap, true, true));\n      const target = candidates`,
  `if (ctx.player.board.includes(ctx.sourceUnit)) actions.push(...destroyObject(ctx.player, ctx.opponent, ctx.sourceUnit, ctx.playerIndex, ctx.enemyIndex, ctx.stats, ctx.rng, ctx.cardMap, true));\n      const target = candidates`,
  "Skyfaring Vessel ability destruction"
);
replaceOnce(
  `if (ctx.sourceUnit) actions.push(...destroyObject(ctx.player, ctx.opponent, ctx.sourceUnit, ctx.playerIndex, ctx.enemyIndex, ctx.stats, ctx.rng, ctx.cardMap, true, true));\n      for (const unit of [...ctx.player.board].filter(unit => unit.type === "Follower")) destroyUnit(ctx.player, unit);`,
  `if (ctx.sourceUnit) actions.push(...destroyObject(ctx.player, ctx.opponent, ctx.sourceUnit, ctx.playerIndex, ctx.enemyIndex, ctx.stats, ctx.rng, ctx.cardMap, true));\n      for (const unit of [...ctx.player.board].filter(unit => unit.type === "Follower")) destroyUnit(ctx.player, unit);`,
  "Unholy Vessel ability destruction"
);
replaceOnce(
  `actions.push(...destroyObject(ctx.player, ctx.opponent, ctx.sourceUnit, ctx.playerIndex, ctx.enemyIndex, ctx.stats, ctx.rng, ctx.cardMap, true, true));\n    text = text.replace(destroyThis, " ");`,
  `actions.push(...destroyObject(ctx.player, ctx.opponent, ctx.sourceUnit, ctx.playerIndex, ctx.enemyIndex, ctx.stats, ctx.rng, ctx.cardMap, true));\n    text = text.replace(destroyThis, " ");`,
  "generic self ability destruction"
);

// Drop an unused mirror helper: actual synchronization happens on every legal
// Earth Sigil entry/gain/consume/banish/return path.
const syncBlock = `function syncEarthSigils(player) {
  const sigil = findEarthSigilAmulet(player);
  if (sigil) player.earthSigils = Math.max(0, Number(sigil.earthSigilCount) || 0);
  else if ((player?.board ?? []).some(isEarthSigilAmulet)) player.earthSigils = 0;
  return Math.max(0, Number(player?.earthSigils) || 0);
}

`;
if (src.includes(syncBlock)) src = src.replace(syncBlock, "");

// Capture the generated Earth Essence count before Earth Rite mutates/removes it.
replaceOnce(
  `    const generatedSigil = findEarthSigilAmulet(generated.player);\n    const beforeRiteCemetery = generated.player.shadows;\n    performEarthRite(generated.player, 2, []);`,
  `    const generatedSigil = findEarthSigilAmulet(generated.player);\n    const generatedCount = generatedSigil?.earthSigilCount ?? null;\n    const beforeRiteCemetery = generated.player.shadows;\n    performEarthRite(generated.player, 2, []);`,
  "Earth Essence QA count capture"
);
replaceOnce(
  `generated: { name: generatedSigil?.name ?? null, count: generatedSigil?.earthSigilCount ?? null },`,
  `generated: { name: generatedSigil?.name ?? null, count: generatedCount },`,
  "Earth Essence QA count result"
);

fs.writeFileSync(path, src);
console.log("Battle official-mechanics audit cleanup materialized");
