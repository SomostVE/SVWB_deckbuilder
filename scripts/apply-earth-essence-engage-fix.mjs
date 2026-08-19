import fs from "node:fs";

const path = "js/battle-engine-v5.js";
let src = fs.readFileSync(path, "utf8");

const before = `  unit.engagedThisTurn = true;
  const reactions = [];
  const engageCtx = { player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map, card: unit.card, sourceUnit: unit };
  const result = resolveText(info.text, engageCtx);`;
const after = `  unit.engagedThisTurn = true;
  const reactions = [];
  const engageCtx = { player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map, card: unit.card, sourceUnit: unit };
  if (Number(unit.card?.id) === 90031210 && isEarthSigilAmulet(unit)) {
    gainEarthSigils(engageCtx, 1, reactions);
    reactions.push(\`Earth Essence Engage: Earth Sigils ${'${player.earthSigils}'}\`);
    return { applied: true, actions: reactions };
  }
  const result = resolveText(info.text, engageCtx);`;
if (!src.includes(before)) throw new Error("Missing resolveEngage target");
src = src.replace(before, after);

const probeBefore = `    const generatedSigil = findEarthSigilAmulet(generated.player);
    const generatedCount = generatedSigil?.earthSigilCount ?? null;
    const beforeRiteCemetery = generated.player.shadows;
    performEarthRite(generated.player, 2, []);`;
const probeAfter = `    const generatedSigil = findEarthSigilAmulet(generated.player);
    const generatedCount = generatedSigil?.earthSigilCount ?? null;
    generated.player.pp = 1;
    const engageResult = generatedSigil ? resolveEngage(generatedSigil, generated.player, generated.opponent, 0, 1, generated.stats, generated.rng, map) : { applied: false, actions: [] };
    const afterEngage = { count: generatedSigil?.earthSigilCount ?? null, pp: generated.player.pp, applied: Boolean(engageResult?.applied) };
    const beforeRiteCemetery = generated.player.shadows;
    performEarthRite(generated.player, 3, []);`;
if (!src.includes(probeBefore)) throw new Error("Missing Earth Essence audit probe target");
src = src.replace(probeBefore, probeAfter);

const resultBefore = `      generated: { name: generatedSigil?.name ?? null, count: generatedCount },
      rite: { board: generated.player.board.filter(isEarthSigilAmulet).length, cemeteryDelta: generated.player.shadows - beforeRiteCemetery },`;
const resultAfter = `      generated: { name: generatedSigil?.name ?? null, count: generatedCount },
      engage: afterEngage,
      rite: { board: generated.player.board.filter(isEarthSigilAmulet).length, cemeteryDelta: generated.player.shadows - beforeRiteCemetery },`;
if (!src.includes(resultBefore)) throw new Error("Missing Earth Essence audit result target");
src = src.replace(resultBefore, resultAfter);

fs.writeFileSync(path, src);
console.log("Earth Essence Engage fix materialized");
