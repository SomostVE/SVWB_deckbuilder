import fs from "node:fs";

const file = "js/battle-engine-v5.js";
let src = fs.readFileSync(file, "utf8");
const snippet = fs.readFileSync("scripts/fanfare-accuracy-snippet.txt", "utf8").trim();
const mark = "// [[battle-fanfare-accuracy-pass-v1]]";

if (!src.includes(mark)) {
  const helperNeedle = "function resolveHighRiskGenericText(textValue, ctx) {";
  if (!src.includes(helperNeedle)) throw new Error("resolveHighRiskGenericText anchor not found");
  src = src.replace(helperNeedle, `${snippet}\n\n${helperNeedle}`);

  const callNeedle = "  const cardName = norm(ctx.card?.name);\n\n  // Generic article-bearing tutors";
  if (!src.includes(callNeedle)) throw new Error("Fanfare pass call anchor not found");
  src = src.replace(callNeedle, "  const cardName = norm(ctx.card?.name);\n\n  const fanfarePass = resolveFanfareAccuracyPass(text, ctx);\n  text = fanfarePass.text;\n  actions.push(...fanfarePass.actions);\n\n  // Generic article-bearing tutors");

  const turnNeedle = "function highRiskHandTurnEndTriggers(player) {\n  const actions = [];";
  if (!src.includes(turnNeedle)) throw new Error("turn-end hand trigger anchor not found");
  src = src.replace(turnNeedle, "function highRiskHandTurnEndTriggers(player) {\n  const actions = [];\n  for (const item of player.hand ?? []) {\n    const amount = Number(item.raioTemporaryZeroCost) || 0;\n    if (!amount) continue;\n    item.costDelta = (Number(item.costDelta) || 0) + amount;\n    delete item.raioTemporaryZeroCost;\n    actions.push(`Raio: restore ${item.card?.name ?? \"card\"} cost`);\n  }");

  fs.writeFileSync(file, src);
  console.log("Materialized Battle Sim Fanfare accuracy pass");
} else {
  console.log("Fanfare accuracy pass already materialized");
}
