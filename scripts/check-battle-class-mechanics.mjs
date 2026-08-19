import fs from "node:fs";
import assert from "node:assert/strict";
import { inspectSpellboostBoundary, isSpellboostRecipient } from "../js/battle-engine-v5.js";

const cards = JSON.parse(fs.readFileSync("data/official/cards.json", "utf8"));
const byName = name => cards.find(card => card.name === name);

const lapis = byName("Lapis, Shining Seraph");
const suframare = byName("Suframare, Wandering Tutor");
const recipient = cards.find(card =>
  card.class === "Runecraft" &&
  (card.keywords ?? []).some(keyword => String(keyword).toLowerCase() === "on spellboost")
);

assert.ok(lapis, "Lapis, Shining Seraph must exist in the card snapshot");
assert.equal(lapis.class, "Havencraft", "Lapis must remain a Havencraft card");
assert.equal(isSpellboostRecipient(lapis), false, "Havencraft cards without On Spellboost must never receive Spellboost state");

assert.ok(suframare, "Suframare, Wandering Tutor must exist in the card snapshot");
assert.equal(suframare.class, "Runecraft", "Suframare must remain Runecraft");
assert.match(String(suframare.text), /spellboost your hand/i, "Suframare must exercise the enabler-vs-recipient distinction");
assert.equal(isSpellboostRecipient(suframare), false, "A card that spellboosts the hand is not automatically an On Spellboost recipient");

assert.ok(recipient, "The snapshot must contain at least one explicit Runecraft On Spellboost recipient");
assert.equal(isSpellboostRecipient(recipient), true, "Explicit On Spellboost cards must receive Spellboost state");

const state = inspectSpellboostBoundary(cards, {
  handNames: [lapis.name, suframare.name, recipient.name],
  amount: 1
});
const stateByName = new Map(state.map(row => [row.name, row]));
assert.equal(stateByName.get(lapis.name)?.spellboost, 0, "Playing a spell must not put Spellboost on Havencraft cards");
assert.equal(stateByName.get(suframare.name)?.spellboost, 0, "Spellboost enablers without On Spellboost must not show a counter");
assert.equal(stateByName.get(recipient.name)?.spellboost, 1, "On Spellboost recipient must advance exactly once");

const currentRecipients = cards.filter(isSpellboostRecipient);
assert.ok(currentRecipients.length > 0, "Spellboost recipient inventory must not be empty");
const offClass = currentRecipients.filter(card => card.class !== "Runecraft");
assert.deepEqual(
  offClass.map(card => `${card.class}: ${card.name}`),
  [],
  "On Spellboost is currently Runecraft-specific; new off-class recipients require an explicit mechanics review"
);

const havenRecipients = cards.filter(card => card.class === "Havencraft" && isSpellboostRecipient(card));
assert.equal(havenRecipients.length, 0, "Havencraft must not inherit Runecraft Spellboost mechanics");

console.log(`Battle Sim class mechanic boundaries: OK · ${currentRecipients.length} On Spellboost recipient(s), all Runecraft`);
