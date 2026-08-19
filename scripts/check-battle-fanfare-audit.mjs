import fs from "node:fs/promises";
import { analyzeCardSupport } from "../js/battle-engine-v5.js";

const root = new URL("../", import.meta.url);
const cards = JSON.parse(await fs.readFile(new URL("data/official/cards.json", root), "utf8"));
const scriptNames = (await fs.readdir(new URL("scripts/", root))).filter(name => /^check-battle-.*\.mjs$/i.test(name) && name !== "check-battle-fanfare-audit.mjs");
const checkCorpus = (await Promise.all(scriptNames.map(name => fs.readFile(new URL(`scripts/${name}`, root), "utf8")))).join("\n").toLowerCase();
const engineCorpus = [
  await fs.readFile(new URL("js/battle-engine-v5.js", root), "utf8"),
  await fs.readFile(new URL("js/battle-rules.js", root), "utf8"),
  await fs.readFile(new URL("js/battle-rules-core.js", root), "utf8")
].join("\n").toLowerCase();

const norm = value => String(value ?? "").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
const fanfares = cards.filter(card => /\bfanfare\s*:/i.test(String(card.text ?? "")));
const byClass = new Map();
for (const card of fanfares) byClass.set(card.class, (byClass.get(card.class) ?? 0) + 1);

const gaps = [];
for (const card of fanfares) {
  const name = norm(card.name);
  const support = analyzeCardSupport(card);
  const tested = checkCorpus.includes(name);
  const explicit = engineCorpus.includes(name);
  if (support.level !== "full" || (!tested && !explicit)) {
    gaps.push({ card, support, tested, explicit });
  }
}

console.log("=== FANFARE INVENTORY AUDIT ===");
console.log(`Fanfare cards: ${fanfares.length}`);
for (const [className, count] of [...byClass.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
  console.log(`${className}: ${count}`);
}
console.log(`Audit gaps: ${gaps.length}`);
for (const row of gaps) {
  console.log(`FANFARE_GAP|${row.card.class}|${row.card.id}|${row.card.name}|support=${row.support.level}|tested=${row.tested ? "yes" : "no"}|explicit=${row.explicit ? "yes" : "no"}|${row.support.reason}`);
}

if (gaps.length) {
  console.error(`Fanfare audit failed: ${gaps.length} card(s) lack Full support or an executable/tested path.`);
  process.exitCode = 1;
} else {
  console.log(`Fanfare audit pass: ${fanfares.length}/${fanfares.length} Fanfare cards have Full support and a generic/explicit tested path.`);
}
