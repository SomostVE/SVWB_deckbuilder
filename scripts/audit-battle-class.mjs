import fs from "node:fs/promises";
import { analyzeCardSupport } from "../js/battle-engine.js";

const requestedClass = String(process.argv[2] ?? "Runecraft").trim();
const cards = JSON.parse(await fs.readFile(new URL("../data/official/cards.json", import.meta.url), "utf8"));
const cardMap = new Map(cards.map(card => [Number(card.id), card]));
for (const card of cards) {
  card.__relatedCardObjects = (card.relatedCards ?? []).map(id => cardMap.get(Number(id))).filter(Boolean);
  card.__relatedNames = card.__relatedCardObjects.map(item => item.name);
}

const selected = cards
  .filter(card => String(card.class ?? "").toLowerCase() === requestedClass.toLowerCase())
  .sort((a, b) => Number(a.cost ?? 0) - Number(b.cost ?? 0) || String(a.type ?? "").localeCompare(String(b.type ?? "")) || String(a.name ?? "").localeCompare(String(b.name ?? "")));

if (!selected.length) throw new Error(`No cards found for class: ${requestedClass}`);

const rows = selected.map(card => {
  const support = analyzeCardSupport(card);
  return {
    id: Number(card.id),
    name: card.name,
    cost: Number(card.cost ?? 0),
    type: card.type,
    rarity: card.rarity,
    support: support.level,
    reason: support.reason,
    text: String(card.text ?? "").replace(/\s+/g, " ").trim(),
    evolvedText: String(card.evolvedText ?? card.evolveText ?? "").replace(/\s+/g, " ").trim(),
    related: (card.__relatedNames ?? []).join(" | ")
  };
});

const counts = rows.reduce((acc, row) => {
  acc[row.support] = (acc[row.support] ?? 0) + 1;
  return acc;
}, {});

console.log(`=== ${requestedClass} Battle Sim class audit ===`);
console.log(`Cards: ${rows.length} · Full: ${counts.full ?? 0} · Partial: ${counts.partial ?? 0} · Unsupported: ${counts.unsupported ?? 0}`);

const gaps = rows.filter(row => row.support !== "full");
console.log("\n=== Partial / Unsupported ===");
if (!gaps.length) console.log("None reported by analyzeCardSupport().");
for (const row of gaps) {
  console.log(`\n[${row.support.toUpperCase()}] ${row.name} · ${row.cost} PP · ${row.type} · ${row.rarity}`);
  console.log(`Reason: ${row.reason}`);
  console.log(`Text: ${row.text || "-"}`);
  if (row.evolvedText) console.log(`Evolved: ${row.evolvedText}`);
  if (row.related) console.log(`Related: ${row.related}`);
}

console.log("\n=== All cards ===");
for (const row of rows) {
  console.log(`\n[${row.support.toUpperCase()}] ${row.name} · ${row.cost} PP · ${row.type} · ${row.rarity}`);
  console.log(`Reason: ${row.reason}`);
  console.log(`Text: ${row.text || "-"}`);
  if (row.evolvedText) console.log(`Evolved: ${row.evolvedText}`);
  if (row.related) console.log(`Related: ${row.related}`);
}
