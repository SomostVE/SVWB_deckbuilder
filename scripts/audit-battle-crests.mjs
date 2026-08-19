import fs from "node:fs/promises";
import { analyzeCardSupport, inspectHighRiskCandidateResolution } from "../js/battle-engine-v5.js";

const CODEX_URL = "https://raw.githubusercontent.com/SomostVE/beyond_codex/main/api/v1/cards.json";
const LOCAL = new URL("../data/official/cards.json", import.meta.url);
const norm = value => String(value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

async function loadCards() {
  try {
    const response = await fetch(CODEX_URL, { headers: { "cache-control": "no-cache" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const cards = await response.json();
    console.log(`Crest audit source: Beyond Codex (${cards.length} cards)`);
    return cards;
  } catch (error) {
    const cards = JSON.parse(await fs.readFile(LOCAL, "utf8"));
    console.log(`Crest audit source: local fallback (${cards.length} cards) · ${error.message}`);
    return cards;
  }
}

const cards = await loadCards();
const crestCards = cards.filter(card => /\bcrest\b/i.test(`${card.text ?? ""}\n${card.rawSkillText ?? ""}\n${(card.keywords ?? []).join("\n")}`));
const runtimeSources = [
  "js/battle-engine-v5.js",
  "js/battle-rules.js",
  "js/battle-rules-core.js"
];
const testSources = (await fs.readdir(new URL("./", import.meta.url)))
  .filter(name => name.endsWith(".mjs") && (name.startsWith("check-battle-") || name.startsWith("audit-battle-")))
  .map(name => `scripts/${name}`);
const runtimeText = (await Promise.all(runtimeSources.map(path => fs.readFile(new URL(`../${path}`, import.meta.url), "utf8")))).join("\n").toLowerCase();
const testText = (await Promise.all(testSources.map(path => fs.readFile(new URL(`../${path}`, import.meta.url), "utf8")))).join("\n").toLowerCase();

const ids = crestCards.map(card => Number(card.id));
const probes = inspectHighRiskCandidateResolution({ cards, cardIds: ids }).filter(row => row.event === "base" || row.event === "evolved");
const probesById = new Map();
for (const row of probes) {
  if (!probesById.has(Number(row.id))) probesById.set(Number(row.id), []);
  probesById.get(Number(row.id)).push(row);
}

const rows = crestCards.map(card => {
  const support = analyzeCardSupport(card);
  const needle = norm(card.name);
  const sourceNeedle = String(card.name ?? "").toLowerCase();
  const runtimeMention = runtimeText.includes(sourceNeedle);
  const testMention = testText.includes(sourceNeedle);
  const cardProbes = probesById.get(Number(card.id)) ?? [];
  const unresolved = cardProbes.filter(row => row.unresolved);
  return {
    id: Number(card.id), name: card.name, className: card.class,
    support: support.level, reason: support.reason,
    runtimeMention, testMention,
    probeCount: cardProbes.length, unresolvedCount: unresolved.length,
    text: String(card.text ?? "").replace(/\s+/g, " ").trim(),
    raw: String(card.rawSkillText ?? "").replace(/\s+/g, " ").trim(),
    needle
  };
});

const byClass = new Map();
for (const row of rows) byClass.set(row.className, (byClass.get(row.className) ?? 0) + 1);
console.log("=== CREST INVENTORY ===");
console.log(`Crest-bearing cards: ${rows.length}`);
for (const [className, count] of [...byClass.entries()].sort((a,b) => String(a[0]).localeCompare(String(b[0])))) console.log(`${className}: ${count}`);

for (const row of rows.sort((a,b) => String(a.className).localeCompare(String(b.className)) || a.name.localeCompare(b.name))) {
  console.log(`CREST|${row.className}|${row.id}|${row.name}|support=${row.support}|runtime=${row.runtimeMention ? "yes" : "no"}|test=${row.testMention ? "yes" : "no"}|probes=${row.probeCount}|unresolved=${row.unresolvedCount}|TEXT=${row.text}`);
}

const suspicious = rows.filter(row => row.support !== "full" || row.unresolvedCount || !row.runtimeMention || !row.testMention);
console.log(`Suspicious Crest cards: ${suspicious.length}`);
for (const row of suspicious) console.log(`CREST_GAP|${row.className}|${row.id}|${row.name}|support=${row.support}|runtime=${row.runtimeMention}|test=${row.testMention}|unresolved=${row.unresolvedCount}`);

// This first pass is intentionally diagnostic. It exits successfully so the log
// can be inspected before we turn justified findings into permanent regressions.
