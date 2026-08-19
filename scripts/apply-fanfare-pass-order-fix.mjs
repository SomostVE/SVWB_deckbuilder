import fs from "node:fs";

const file = "js/battle-engine-v5.js";
let src = fs.readFileSync(file, "utf8");
const mark = "// [[battle-fanfare-accuracy-call-early-v1]]";
if (src.includes(mark)) {
  console.log("Fanfare early resolver call already materialized");
  process.exit(0);
}

const late = "  const fanfarePass = resolveFanfareAccuracyPass(text, ctx);\n  text = fanfarePass.text;\n  actions.push(...fanfarePass.actions);\n\n";
if (!src.includes(late)) throw new Error("Late Fanfare pass call not found");
src = src.replace(late, "");

const early = "function resolveHighRiskGenericText(textValue, ctx) {\n  let text = String(textValue ?? \"\");\n  const actions = [];";
if (!src.includes(early)) throw new Error("High-risk resolver start not found");
src = src.replace(early, `function resolveHighRiskGenericText(textValue, ctx) {\n  let text = String(textValue ?? "");\n  const actions = [];\n  ${mark}\n  const fanfarePass = resolveFanfareAccuracyPass(text, ctx);\n  text = fanfarePass.text;\n  actions.push(...fanfarePass.actions);`);

fs.writeFileSync(file, src);
console.log("Moved Fanfare accuracy pass before legacy high-risk handlers");
