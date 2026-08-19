import fs from "node:fs";
import assert from "node:assert/strict";
import { inspectAiPlayChoice, inspectOfficialMechanicsAudit } from "../js/battle-engine-v5.js";

const cards = JSON.parse(fs.readFileSync("data/official/cards.json", "utf8"));
const engine = fs.readFileSync("js/battle-engine-v5.js", "utf8");
const audit = inspectOfficialMechanicsAudit({ cards });

// Official Transform: no leave-field trigger, no inherited attack state, and no
// attack until the transformed follower's next turn.
assert.equal(audit.transform.bayleCostDelta, 0, "Transform must not count as a follower leaving the field");
assert.equal(audit.transform.summonedThisTurn, true, "Transformed follower must wait until the next turn to attack");
assert.equal(audit.transform.attacked, false, "Transform must not inherit attacked state");
assert.equal(audit.transform.attacksMade, 0, "Transform must not inherit attacks-made state");
assert.equal(audit.transform.canAttackLeader, false, "Transformed follower must not attack the leader immediately");

// Official cemetery rules: hand-overflow draws and failed returns to a full hand
// both add one to the current cemetery resource.
assert.equal(audit.cemetery.drawOverflowDelta, 1, "Drawing beyond the nine-card hand limit must increase cemetery by 1");
assert.equal(audit.cemetery.bounceOverflowDelta, 1, "Returning a field card to a full hand must increase cemetery by 1");
assert.match(engine, /cemeteryCount:\s*player\.shadows/, "Replay Cemetery must display the current consumable cemetery value");

// Official Earth Sigil semantics: one merged field amulet, prior sigils banished,
// generated Earth Essence occupies a field slot, Earth Rite destroys it at zero,
// and Earth Sigils resist ability destruction/opponent selection.
assert.ok(audit.earth, "Earth Sigil audit requires the official Earth Essence token");
assert.deepEqual(audit.earth.merged, { count: 2, board: 1, oldBanished: true, newEngaged: false }, "Playing a second Earth Sigil must merge counts into the new amulet and banish the old one");
assert.equal(audit.earth.generated.count, 2, "Gaining +2 Earth Sigils with none in play must create a count-2 Earth Essence");
assert.equal(audit.earth.rite.board, 0, "Earth Rite consuming the last Earth Sigils must destroy the Earth Sigil amulet");
assert.equal(audit.earth.rite.cemeteryDelta, 1, "Earth Sigil destruction at zero must increase cemetery");
assert.equal(audit.earth.abilityDestroyImmune, true, "Earth Sigil amulets must not be destroyed by abilities");
assert.equal(audit.earth.fieldFullGain, 0, "Earth Sigil generation with no existing sigil must fail on a full field");
assert.match(engine, /untargetableByOpponentAbility/, "Earth Sigil opponent-selection immunity must be represented in runtime state");

const earthSigilsWithLastWords = cards.filter(card =>
  card.type === "Amulet"
  && (card.traits ?? []).some(trait => String(trait).toLowerCase() === "earth sigil")
  && /Last Words\s*:/i.test(String(card.text ?? ""))
);
assert.deepEqual(earthSigilsWithLastWords.map(card => card.name), [], "A future Earth Sigil with Last Words requires explicit zero-count destruction handling review");

// Official Ambush Q&A explicitly uses Myuu: if its Artifact-entry ability deals
// damage, Myuu loses Ambush; if it deals no damage, Ambush remains.
assert.ok(audit.myuu, "Myuu and Ancient Artifact must exist in the official snapshot");
assert.equal(audit.myuu.losesOnDamage, true, "Myuu must lose Ambush after its ability deals damage");
assert.equal(audit.myuu.keepsWithoutDamage, true, "Myuu must keep Ambush when its ability deals no damage");

// Official Select rule: a Select spell cannot be played unless all required
// targets exist. The AI must therefore have no legal play with an empty enemy field.
const selectSpell = {
  id: -999991,
  name: "QA Select Spell",
  class: "Neutral",
  type: "Spell",
  cost: 1,
  attack: null,
  defense: null,
  text: "Select an enemy follower on the field and deal it 3 damage.",
  keywords: [],
  traits: [],
  relatedCards: []
};
const illegalSelectPlay = inspectAiPlayChoice({
  hand: [selectSpell],
  pp: 10,
  maxPp: 10,
  personalTurn: 10,
  opponentBoard: [],
  strategy: { style: "midrange" }
});
assert.equal(illegalSelectPlay, null, "A Select spell with no legal target must not be a playable AI action");

// Exact/special destroy handlers must respect the same ability-destruction and
// active-turn Super-Evolve immunity as generic destruction.
assert.match(engine, /!rulesDestroy\s*&&\s*\(unit\?\.abilityDestructionImmune\s*\|\|\s*\(unit\?\.superEvolved\s*&&\s*player\?\.isActive\)\)/, "Special destroy paths must honor destruction immunity and active-turn Invincible");
assert.match(engine, /countdown <= 0[\s\S]{0,180}destroyObject\([^\n]+true, true\)/, "Rules-driven Countdown destruction must explicitly bypass ability-destruction immunity");
assert.doesNotMatch(engine, /skyfaring vessel[\s\S]{0,600}destroyObject\([^\n]+true, true\)/i, "Ability self-destruction must not be mislabeled as rules destruction");

console.log("Official Battle mechanics regression: OK · Transform · Cemetery · Earth Sigil · Ambush · Select · destruction immunity");
