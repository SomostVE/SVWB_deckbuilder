import fs from "node:fs/promises";
import { inspectHighRiskCandidateResolution } from "../js/battle-engine-v5.js";

const cards = JSON.parse(await fs.readFile(new URL("../data/official/cards.json", import.meta.url), "utf8"));
const fanfareCards = cards.filter(card => /\bfanfare\s*:/i.test(String(card.text ?? "")));
const cardIds = fanfareCards.map(card => Number(card.id));
const results = inspectHighRiskCandidateResolution({ cards, cardIds, seed: "fanfare-ci" });
const fanfareRows = results.filter(row => String(row.event ?? "").toLowerCase().includes("fanfare") || String(row.event ?? "").toLowerCase() === "base");
const unresolved = fanfareRows.filter(row => row.unresolved);

console.log(`Fanfare runtime audit: ${fanfareCards.length} cards · ${fanfareRows.length} base/Fanfare sections · ${unresolved.length} unresolved`);
for (const row of unresolved) {
  console.log(`UNRESOLVED|${row.className}|${row.id}|${row.name}|${row.event}|${String(row.raw ?? "").replace(/\s+/g, " ").trim()}`);
}

const jeanne = fanfareRows.find(row => String(row.name ?? "").toLowerCase() === "jeanne, saintly knight");
if (!jeanne) throw new Error("Jeanne, Saintly Knight is missing from the Fanfare audit.");
if (jeanne.unresolved) throw new Error("Jeanne, Saintly Knight Fanfare still has unresolved runtime text.");

if (unresolved.length) {
  const affected = new Set(unresolved.map(row => Number(row.id))).size;
  throw new Error(`${unresolved.length} unresolved Fanfare section(s) across ${affected} card(s).`);
}

console.log(`Fanfare runtime gate: ${fanfareCards.length}/${fanfareCards.length} official Fanfare cards resolved.`);
