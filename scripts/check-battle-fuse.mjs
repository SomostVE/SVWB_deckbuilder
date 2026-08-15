import assert from "node:assert/strict";
import fs from "node:fs";
import {
  analyzeCardSupport,
  inspectFuseSequence,
  inspectPlayableModes
} from "../js/battle-engine-v5.js";

const raw = JSON.parse(fs.readFileSync("data/official/cards.json", "utf8"));
const cards = Array.isArray(raw) ? raw : (raw.cards ?? []);
const byName = new Map(cards.map(card => [String(card.name).toLowerCase(), card]));
const get = name => {
  const card = byName.get(String(name).toLowerCase());
  assert.ok(card, `Missing fixture card: ${name}`);
  return card;
};

const fuseNames = [
  "Garden's Allure",
  "Gear of Ambition",
  "Gear of Remembrance",
  "Striker Artifact",
  "Fortifier Artifact",
  "Ominous Artifact α",
  "Ancient Cannon",
  "Returning Slash",
  "Congregant of Usurpation",
  "Sinciro, Heir to Usurpation"
];
for (const name of fuseNames) {
  assert.equal(analyzeCardSupport(get(name)).level, "full", `${name} should be fully modeled`);
}

assert.deepEqual(
  inspectPlayableModes(get("Gear of Ambition"), { pp: 10 }),
  [],
  "Can't be played must prevent Gear of Ambition from being played normally"
);
assert.deepEqual(
  inspectPlayableModes(get("Gear of Remembrance"), { pp: 10 }),
  [],
  "Can't be played must prevent Gear of Remembrance from being played normally"
);

const chain = inspectFuseSequence({
  cards,
  handNames: ["Gear of Ambition", "Gear of Remembrance", "Fortifier Artifact"],
  steps: [
    { type: "fuse", target: "Gear of Ambition", materials: ["Gear of Remembrance"] },
    { type: "fuse", target: "Striker Artifact", materials: ["Fortifier Artifact"] }
  ]
});
assert.deepEqual(chain.log.map(step => step.applied), [true, true], "Transformed Fuse card should be usable again in the same turn");
assert.equal(chain.hand.length, 1);
assert.equal(chain.hand[0].name, "Ominous Artifact γ", "3-cost Artifact fused into Striker should produce Ominous Artifact γ");
assert.equal(chain.stats.cardsFused[0], 2);
assert.deepEqual(chain.fusedZone.sort(), ["Fortifier Artifact", "Gear of Remembrance"].sort());
assert.equal(chain.shadows, 0, "Fused materials must not create shadows");

const omega = inspectFuseSequence({
  cards,
  handNames: ["Ominous Artifact α", "Ominous Artifact β", "Ominous Artifact γ"],
  steps: [
    { type: "fuse", target: "Ominous Artifact α", materials: ["Ominous Artifact β", "Ominous Artifact γ"] }
  ]
});
assert.equal(omega.log[0].applied, true);
assert.equal(omega.hand[0].name, "Masterwork Artifact Ω", "Fusing both β and γ into α should create Masterwork Artifact Ω");
assert.equal(omega.stats.cardsFused[0], 2);

const forestMaterials = cards
  .filter(card => card.class === "Forestcraft" && card.name !== "Garden's Allure")
  .slice(0, 2);
assert.equal(forestMaterials.length, 2, "Need two Forestcraft Fuse materials for regression");
const oncePerTurn = inspectFuseSequence({
  cards,
  handNames: ["Garden's Allure", ...forestMaterials.map(card => card.name)],
  steps: [
    { type: "fuse", target: "Garden's Allure", materials: [forestMaterials[0].name] },
    { type: "fuse", target: "Garden's Allure", materials: [forestMaterials[1].name] },
    { type: "next-turn" },
    { type: "fuse", target: "Garden's Allure", materials: [forestMaterials[1].name] }
  ]
});
assert.equal(oncePerTurn.log[0].applied, true);
assert.equal(oncePerTurn.log[1].applied, false, "Same Fuse card cannot Fuse twice in one turn without transforming");
assert.equal(oncePerTurn.log[3].applied, true, "Fuse allowance should reset next turn");

const gardenDraw = inspectFuseSequence({
  cards,
  handNames: ["Garden's Allure", forestMaterials[0].name],
  deckNames: ["Ominous Artifact β", "Ominous Artifact γ", "Masterwork Artifact Ω"],
  steps: [
    { type: "fuse", target: "Garden's Allure", materials: [forestMaterials[0].name] },
    { type: "play", card: "Garden's Allure" }
  ]
});
assert.equal(gardenDraw.stats.cardsFused[0], 1);
assert.equal(gardenDraw.stats.draws[0], 2, "Fused Garden's Allure should draw 2 instead of 1");
assert.equal(gardenDraw.fusedZone.length, 1);

const lootCards = cards.filter(card => (card.traits ?? []).includes("Loot"));
assert.ok(lootCards.length >= 2, "Need Loot cards for Fuse regression");
const lootA = get("Gilded Goblet");
const lootB = get("Gilded Boots");
assert.ok((lootA.traits ?? []).includes("Loot"));
assert.ok((lootB.traits ?? []).includes("Loot"));

const returning = inspectFuseSequence({
  cards,
  handNames: ["Returning Slash", lootA.name],
  deckNames: ["Ominous Artifact β", "Ominous Artifact γ"],
  opponentBoard: [{ name: "Target", attack: 3, defense: 5 }],
  steps: [
    { type: "fuse", target: "Returning Slash", materials: [lootA.name] },
    { type: "play", card: "Returning Slash" }
  ]
});
assert.equal(returning.stats.draws[0], 1, "Fused Returning Slash should draw a card");
assert.equal(returning.opponentBoard[0].defense, 3, "Returning Slash should still resolve its normal damage");
assert.ok(returning.hand.some(item => item.name === "Gilded Blade"), "Returning Slash should add Gilded Blade");

const cannon = inspectFuseSequence({
  cards,
  boardNames: ["Ancient Cannon"],
  handNames: ["Gear of Ambition", "Gear of Remembrance"],
  opponentBoard: [{ name: "Cannon Target", attack: 2, defense: 5 }],
  steps: [{ type: "fuse", target: "Gear of Ambition", materials: ["Gear of Remembrance"] }]
});
assert.equal(cannon.opponentBoard[0].defense, 3, "Ancient Cannon should deal 2 after a Fuse action");

const congregant = inspectFuseSequence({
  cards,
  boardNames: ["Congregant of Usurpation"],
  handNames: ["Returning Slash", lootB.name],
  opponentBoard: [{ name: "Loot Target", attack: 2, defense: 6 }],
  steps: [{ type: "fuse", target: "Returning Slash", materials: [lootB.name] }]
});
assert.equal(congregant.opponentBoard[0].defense, 3, "Congregant should deal 3 when a Loot card is Fused");

const sinciro = inspectFuseSequence({
  cards,
  handNames: ["Sinciro, Heir to Usurpation", lootA.name, lootB.name],
  opponentBoard: [{ name: "Sinciro Target", attack: 2, defense: 6 }],
  steps: [
    { type: "fuse", target: "Sinciro, Heir to Usurpation", materials: [lootA.name, lootB.name] },
    { type: "play", card: "Sinciro, Heir to Usurpation" }
  ]
});
assert.equal(sinciro.opponentHp, 18, "Sinciro X should equal the number of differently named Fused cards");
assert.equal(sinciro.opponentBoard[0].defense, 4, "Sinciro Fanfare should deal X to enemy followers too");

const aiFuse = inspectFuseSequence({
  cards,
  handNames: ["Gear of Ambition", "Gear of Remembrance"],
  steps: [{ type: "ai-fuse" }]
});
assert.equal(aiFuse.log[0].applied, true, "AI should recognize a productive Gear Fuse");
assert.equal(aiFuse.hand[0].name, "Striker Artifact");

console.log("Battle Sim Fuse regression: OK");
