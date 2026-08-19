import fs from "node:fs";

const path = "js/battle-engine-v5.js";
let src = fs.readFileSync(path, "utf8");
const before = '  const boostTarget = instance(gin.player, byName("Mysterian Missile"));';
const after = '  const boostTargetCard = cards.find(card => norm(card.class) === "runecraft" && isSpellboostRecipient(card));\n  if (!boostTargetCard) throw new Error("Runecraft QA requires an On Spellboost recipient");\n  const boostTarget = instance(gin.player, boostTargetCard);';
if (!src.includes(before)) {
  if (src.includes(after)) {
    console.log("Ginger QA target already corrected");
    process.exit(0);
  }
  throw new Error("Ginger QA target anchor not found");
}
src = src.replace(before, after);
fs.writeFileSync(path, src);
console.log("Corrected Ginger QA to use an explicit On Spellboost recipient");
