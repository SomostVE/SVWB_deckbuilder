import fs from "node:fs";

const path = "js/battle-engine-v5.js";
let src = fs.readFileSync(path, "utf8");
const gate = '    if (!canUseClassMechanic(ctx.player, "necromancy", ctx.card)) return { applied: false, actions: ["Necromancy unavailable outside Abysscraft"], unresolved: false };';
const triple = `${gate}\n${gate}\n${gate}`;
const double = `${gate}\n${gate}`;

if (src.includes(triple)) src = src.replace(triple, gate);
else if (src.includes(double)) src = src.replace(double, gate);
else {
  const count = src.split(gate).length - 1;
  if (count === 1) {
    console.log("Fediel class gate already clean");
    process.exit(0);
  }
  throw new Error(`Unexpected Fediel gate count: ${count}`);
}

fs.writeFileSync(path, src);
console.log("Fediel class gate deduplicated");
