import fs from "node:fs";

const path = "js/battle-engine-v5.js";
let src = fs.readFileSync(path, "utf8");
const before = `  drawCards(cemetery.player, 1, cemetery.stats, 0);\n  const bounceTarget = boardFollower(instance(cemetery.player, syntheticFollower("Bounce Target")));`;
const after = `  drawCards(cemetery.player, 1, cemetery.stats, 0);\n  const cemeteryAfterDraw = cemetery.player.shadows;\n  const bounceTarget = boardFollower(instance(cemetery.player, syntheticFollower("Bounce Target")));`;
if (!src.includes(before)) throw new Error("Missing cemetery audit probe target");
src = src.replace(before, after);
const returnBefore = `    cemetery: { drawOverflowDelta: cemeteryBeforeDraw == null ? null : cemetery.player.shadows - cemeteryBeforeBounce, bounceOverflowDelta: cemetery.player.shadows - cemeteryBeforeBounce },`;
const returnAfter = `    cemetery: { drawOverflowDelta: cemeteryAfterDraw - cemeteryBeforeDraw, bounceOverflowDelta: cemetery.player.shadows - cemeteryBeforeBounce },`;
if (!src.includes(returnBefore)) throw new Error("Missing cemetery audit result target");
src = src.replace(returnBefore, returnAfter);
fs.writeFileSync(path, src);
