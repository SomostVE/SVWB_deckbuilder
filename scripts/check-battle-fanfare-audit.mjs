import fs from "node:fs/promises";
import { analyzeCardSupport, inspectHighRiskCandidateResolution } from "../js/battle-engine-v5.js";

const root = new URL("../", import.meta.url);
const cards = JSON.parse(await fs.readFile(new URL("data/official/cards.json", root), "utf8"));
const fanfares = cards.filter(card => /\bfanfare\s*:/i.test(String(card.text ?? "")));
const byClass = new Map();
for (const card of fanfares) byClass.set(card.class, (byClass.get(card.class) ?? 0) + 1);

const ids = fanfares.map(card => Number(card.id));
const probeRows = inspectHighRiskCandidateResolution({ cards, cardIds: ids })
  .filter(row => row.event === "base" && ids.includes(Number(row.id)));
const rowsById = new Map();
for (const row of probeRows) {
  if (!rowsById.has(Number(row.id))) rowsById.set(Number(row.id), []);
  rowsById.get(Number(row.id)).push(row);
}

const gaps = [];
for (const card of fanfares) {
  const support = analyzeCardSupport(card);
  const probes = rowsById.get(Number(card.id)) ?? [];
  const unresolved = probes.filter(row => row.unresolved);
  if (support.level !== "full" || !probes.length || unresolved.length) {
    gaps.push({ card, support, probes, unresolved });
  }
}

console.log("=== FANFARE RUNTIME AUDIT ===");
console.log(`Fanfare cards: ${fanfares.length}`);
for (const [className, count] of [...byClass.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
  console.log(`${className}: ${count}`);
}
console.log(`Runtime gaps: ${gaps.length}`);
for (const row of gaps) {
  const probeSummary = row.probes.length
    ? row.probes.map(probe => `mode${probe.modeIndex}:${probe.unresolved ? "UNRESOLVED" : "ok"}:RAW=${String(probe.raw ?? "").replace(/\s+/g, " ").trim()}:ACTIONS=${(probe.actions ?? []).join(" · ")}`).join(" || ")
    : "NO_BASE_PROBE";
  console.log(`FANFARE_GAP|${row.card.class}|${row.card.id}|${row.card.name}|support=${row.support.level}|${row.support.reason}|${probeSummary}`);
}

const jeanne = fanfares.find(card => card.name === "Jeanne, Saintly Knight");
if (!jeanne) throw new Error("Jeanne, Saintly Knight missing from official Fanfare inventory");
const jeanneProbe = rowsById.get(Number(jeanne.id)) ?? [];
if (!jeanneProbe.length || jeanneProbe.some(row => row.unresolved)) {
  throw new Error("Jeanne, Saintly Knight Fanfare must resolve through the same runtime audit as every other Fanfare");
}

if (gaps.length) {
  console.error(`Fanfare runtime audit failed: ${gaps.length}/${fanfares.length} card(s) have unresolved base-play Fanfare paths.`);
  process.exitCode = 1;
} else {
  console.log(`Fanfare runtime audit pass: ${fanfares.length}/${fanfares.length} Fanfare cards resolve in the v5 runtime probe.`);
}
