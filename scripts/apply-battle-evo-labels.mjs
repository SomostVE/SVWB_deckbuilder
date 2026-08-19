import fs from "node:fs";

function replaceIn(path, replacements) {
  let text = fs.readFileSync(path, "utf8");
  const before = text;
  for (const [from, to] of replacements) text = text.replaceAll(from, to);
  if (text !== before) {
    fs.writeFileSync(path, text);
    console.log(`Updated ${path}`);
  }
}

replaceIn("js/battle.js", [
  ["<span>EP ${player.ep}</span>", "<span>Evo ${player.ep}</span>"],
  ["<span>SEP ${player.sep}</span>", "<span>Super Evo ${player.sep}</span>"]
]);

let inspector = fs.readFileSync("js/battle-replay-inspector.js", "utf8");
const inspectorBefore = inspector;
inspector = inspector
  .replace('ep: number(/\\bEP\\s*(\\d+)/i),', 'ep: number(/\\b(?:Evo|EP)\\s*(\\d+)/i),')
  .replace('sep: number(/\\bSEP\\s*(\\d+)/i),', 'sep: number(/\\b(?:Super Evo|SEP)\\s*(\\d+)/i),')
  .replace('addChange(rows, "EP", before.ep, after.ep);', 'addChange(rows, "Evo", before.ep, after.ep);')
  .replace('addChange(rows, "SEP", before.sep, after.sep);', 'addChange(rows, "Super Evo", before.sep, after.sep);')
  .replace('["EP", side.ep], ["SEP", side.sep]', '["Evo", side.ep], ["Super Evo", side.sep]');
if (inspector !== inspectorBefore) {
  fs.writeFileSync("js/battle-replay-inspector.js", inspector);
  console.log("Updated js/battle-replay-inspector.js");
}

for (const path of [
  "battle.html",
  "collection.html",
  "css/readability-fixes.css",
  "js/tool-page-nav.js",
  "js/collection-ui.js",
  "js/format-control.js",
  "js/mobile-ui.js",
  "js/battle-decision-summary.js",
  "js/battle-replay-inspector.js",
  "scripts/check-replay-inspector-ui.mjs"
]) {
  replaceIn(path, [
    ["01.03.000", "01.03.002"],
    ["01.03.001", "01.03.002"]
  ]);
}

fs.writeFileSync("version.json", `${JSON.stringify({ version: "01.03.002" }, null, 2)}\n`);
console.log("Set version 01.03.002");
