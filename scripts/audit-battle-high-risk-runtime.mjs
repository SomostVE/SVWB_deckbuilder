import fs from "node:fs/promises";
import { analyzeCardSupport, inspectHighRiskCandidateResolution } from "../js/battle-engine-v5.js";

const cards = JSON.parse(await fs.readFile(new URL("../data/official/cards.json", import.meta.url), "utf8"));
const norm = value => String(value ?? "").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
const criticalPatterns = [
  /exact copy|add a copy|summon a copy|transform .* copy|copy of/i,
  /replace your deck|apocalypse deck|victory card/i,
  /activate .*random abilities|replicate the effects|activate its fanfare/i,
  /highest base costs|sum of the .* base costs|opponent'?s hand|opponent'?s deck/i,
  /can'?t take more than|prevent .*damage|takes .* more damage/i,
  /different(?:ly)? named .* this match|entered the field this match|destroyed this match/i
];

const scriptNames = (await fs.readdir(new URL("./", import.meta.url)))
  .filter(name => /^check-battle-.*\.mjs$/i.test(name));
const checkCorpus = (await Promise.all(scriptNames.map(name => fs.readFile(new URL(name, import.meta.url), "utf8")))).join("\n").toLowerCase();
const engineV5 = (await fs.readFile(new URL("../js/battle-engine-v5.js", import.meta.url), "utf8")).toLowerCase();
const engineV4 = (await fs.readFile(new URL("../js/battle-engine-v4.js", import.meta.url), "utf8")).toLowerCase();

const criticalCards = cards.filter(card => {
  if (analyzeCardSupport(card).level !== "full") return false;
  const text = String(card.text ?? "");
  if (!criticalPatterns.some(pattern => pattern.test(text))) return false;
  const name = norm(card.name);
  if (checkCorpus.includes(name)) return false;
  if (engineV4.includes(name)) return false;
  // Explicit V5 class-specific implementations already have their own class
  // behavioral contracts. The generic audit targets the remaining false-Full risk.
  const explicitNeedle = `["${name}"`;
  if (engineV5.includes(explicitNeedle)) return false;
  return true;
});
const criticalIds = criticalCards.map(card => Number(card.id));

const results = inspectHighRiskCandidateResolution({ cards, cardIds: criticalIds });
const unresolved = results.filter(row => row.unresolved);
console.log(`Runtime high-risk probe: ${criticalIds.length} cards · ${results.length} event/mode sections · ${unresolved.length} unresolved sections`);
for (const row of unresolved) {
  const raw = String(row.raw ?? "").replace(/\s+/g, " ").trim();
  console.log(`UNRESOLVED|${row.className}|${row.id}|${row.name}|${row.event}|mode=${row.modeIndex}|${raw}`);
}
console.log("\nResolved sections by card:");
for (const card of criticalCards) {
  const rows = results.filter(row => row.id === Number(card.id));
  const bad = rows.filter(row => row.unresolved).length;
  console.log(`${card.id}|${card.name}|${rows.length - bad}/${rows.length} resolved`);
}

if (unresolved.length) {
  throw new Error(`High-risk runtime audit still has ${unresolved.length} unresolved section(s).`);
}
console.log(`High-risk runtime critical gate: ${criticalIds.length}/${criticalIds.length} cards resolved.`);
