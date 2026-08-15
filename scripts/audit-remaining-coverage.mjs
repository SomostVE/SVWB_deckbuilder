import fs from "node:fs/promises";
import { analyzeCardSupport } from "../js/battle-engine.js";

const cards = JSON.parse(await fs.readFile(new URL("../data/official/cards.json", import.meta.url), "utf8"));

const groups = {
  current: [
    "Abyll, Moonstruck Vampire",
    "Fiole, Devilish Matriarch",
    "Adhime, Anathema of Death"
  ],
  forest: [
    "Ruflet, Primeval Fairy",
    "Tia, Eternal Crystalian",
    "Krulle, Heir to Unkilling",
    "Bayle, Luxglaive Warrior"
  ],
  sword: [
    "Luminous Lancetrooper",
    "Yidmetra, Eld Sword",
    "Gildaria, Anathema of Attunement",
    "Mars, Conflagrant Commander"
  ],
  dragon: [
    "Zooey, Ally of the World"
  ],
  ward: [
    "Galleon, Earth Personified",
    "Sofina, Inspiring Strength",
    "Aether, Empyrean Guardian",
    "Edeth, Voice of Heaven"
  ]
};

for (const [group, names] of Object.entries(groups)) {
  console.log(`\n=== ${group.toUpperCase()} ===`);
  for (const name of names) {
    const card = cards.find(item => item.name === name);
    if (!card) {
      console.log(`MISSING | ${name}`);
      continue;
    }
    const support = analyzeCardSupport(card);
    console.log(`\n${card.name}`);
    console.log(`id=${card.id} class=${card.class} type=${card.type} cost=${card.cost} traits=${(card.traits ?? []).join(",") || "-"}`);
    console.log(`support=${support.level} reason=${support.reason}`);
    console.log(`keywords=${(card.keywords ?? []).join(",") || "-"}`);
    console.log(`related=${(card.relatedCards ?? []).join(",") || "-"}`);
    console.log(`text=${String(card.text ?? "").replace(/\s+/g, " ").trim()}`);
  }
}
