import fs from "node:fs/promises";
import { inspectHighRiskCandidateResolution } from "../js/battle-engine-v5.js";

const cards = JSON.parse(await fs.readFile(new URL("../data/official/cards.json", import.meta.url), "utf8"));
const criticalIds = [
  10352210,10851130,10351110,10551120,10352110,10353110,10552120,10752110,10852120,10652310,10554120,
  10842120,10141140,90044310,10443310,10643110,10444110,
  10311110,10514110,10111120,10811120,10514120,10712120,10513110,10312110,
  10761210,10561110,10664110,10663210,10061130,10861130,10662120,10764120,10162130,
  10803110,10102110,10802310,10502120,10502110,10604110,
  90074320,10271210,10572310,10871130,10372110,10173110,10873310,10773310,10572110,10272120,10173140,10172320,10274120,10772120,10071110,10774130,10474120,
  10532310,10731120,10831110,10333110,10331120,10232120,10733110,10234120,
  10121120,10821110
];

const results = inspectHighRiskCandidateResolution({ cards, cardIds: criticalIds });
const unresolved = results.filter(row => row.unresolved);
console.log(`Runtime high-risk probe: ${criticalIds.length} cards · ${results.length} event/mode sections · ${unresolved.length} unresolved sections`);
for (const row of unresolved) {
  const raw = String(row.raw ?? "").replace(/\s+/g, " ").trim();
  console.log(`UNRESOLVED|${row.className}|${row.id}|${row.name}|${row.event}|mode=${row.modeIndex}|${raw}`);
}
console.log("\nResolved sections by card:");
for (const id of criticalIds) {
  const rows = results.filter(row => row.id === id);
  const bad = rows.filter(row => row.unresolved).length;
  const name = rows[0]?.name ?? cards.find(card => Number(card.id) === id)?.name ?? String(id);
  console.log(`${id}|${name}|${rows.length - bad}/${rows.length} resolved`);
}
