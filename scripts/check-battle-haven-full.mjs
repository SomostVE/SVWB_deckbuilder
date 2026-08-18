import fs from "node:fs";
import { analyzeCardSupport, inspectHavenFullRules } from "../js/battle-engine-v5.js";

const cards = JSON.parse(fs.readFileSync(new URL("../data/official/cards.json", import.meta.url), "utf8"));
const byName = new Map(cards.map(card => [String(card.name ?? "").toLowerCase(), card]));

const names = [
  "Supplicant of Repose",
  "Sacred Griffon",
  "Lapis, Shining Seraph"
];

const selected = Object.fromEntries(names.map(name => {
  const card = byName.get(name.toLowerCase());
  if (!card) throw new Error(`Missing card in official database: ${name}`);
  const support = analyzeCardSupport(card);
  if (support.level !== "full") {
    throw new Error(`${name} is still ${support.level}: ${support.reason}`);
  }
  return [name, card];
}));

const qa = inspectHavenFullRules({
  supplicant: selected["Supplicant of Repose"],
  sacredGriffon: selected["Sacred Griffon"],
  lapis: selected["Lapis, Shining Seraph"]
});

if (qa.supplicant.countdown !== 4) throw new Error(`Supplicant Crest countdown expected 4, got ${qa.supplicant.countdown}`);
if (!qa.supplicant.healsWithoutAttack) throw new Error("Supplicant Crest did not heal when no allied follower attacked");
if (!qa.supplicant.blocksHealAfterAttack) throw new Error("Supplicant Crest healed despite an allied follower attacking");
if (!qa.sacredGriffon.gainsStormOnEngage) throw new Error("Sacred Griffon did not gain Storm after Engage");
if (qa.lapis.countdown !== 2) throw new Error(`Lapis Crest countdown expected 2, got ${qa.lapis.countdown}`);
if (!qa.lapis.summonsWithStorm) throw new Error("Lapis Crest did not summon Lapis with Storm on expiry");
if (!qa.lapis.crestRemoved) throw new Error("Expired Lapis Crest was not removed before resummon");

console.log("Remaining Havencraft player-deck rules: full");
console.table({
  "Supplicant of Repose": {
    support: "full",
    countdown: qa.supplicant.countdown,
    rule: "heal only if no allied follower attacked"
  },
  "Sacred Griffon": {
    support: "full",
    countdown: "-",
    rule: "gain Storm when an allied Amulet is Engaged"
  },
  "Lapis, Shining Seraph": {
    support: "full",
    countdown: qa.lapis.countdown,
    rule: "Crest expiry summons Lapis with Storm"
  }
});
