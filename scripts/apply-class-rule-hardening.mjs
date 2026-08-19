import fs from "node:fs";

const path = "js/battle-engine-v5.js";
let src = fs.readFileSync(path, "utf8");

function replaceAll(before, after, label) {
  if (src.includes(after) && !src.includes(before)) return;
  if (!src.includes(before)) throw new Error(`Missing anchor: ${label}`);
  src = src.replaceAll(before, after);
}

replaceAll(
  'import { canUseClassMechanic, classMechanicStatus, isSpellboostRecipientCard, resolveDeckClass } from "./battle-class-mechanics.js";',
  'import { canUseClassMechanic, canUseClassRules, classMechanicStatus, isSpellboostRecipientCard, resolveDeckClass } from "./battle-class-mechanics.js";',
  "class rules import"
);

for (const [fn, className] of [
  ["resolveForestcraftCardText", "Forestcraft"],
  ["resolveSwordcraftCardText", "Swordcraft"],
  ["resolveRunecraftCardText", "Runecraft"],
  ["resolveDragoncraftCardText", "Dragoncraft"],
  ["resolveAbysscraftCardText", "Abysscraft"]
]) {
  replaceAll(
    `function ${fn}(textValue, ctx) {\n  let text = String(textValue ?? "");`,
    `function ${fn}(textValue, ctx) {\n  if (!canUseClassRules(ctx.player, "${className}", ctx.card)) return { text: String(textValue ?? ""), actions: [] };\n  let text = String(textValue ?? "");`,
    `${className} bespoke rules gate`
  );
}

replaceAll(
`function performEarthRite(player, amountValue, actions = []) {
  const amount = Math.max(1, Number(amountValue) || 1);`,
`function performEarthRite(player, amountValue, actions = []) {
  if (player.className && !canUseClassMechanic(player, "earthRite")) return false;
  const amount = Math.max(1, Number(amountValue) || 1);`,
  "Earth Rite central gate"
);

replaceAll(
`  const comboOne = /Increase your Combo by 1\\.?/i;
  if (comboOne.test(text)) {
    ctx.player.cardsPlayedThisTurn += 1;
    actions.push(\`Combo +1 (\${ctx.player.cardsPlayedThisTurn})\`);
    text = text.replace(comboOne, " ");
  }`,
`  const comboOne = /Increase your Combo by 1\\.?/i;
  if (comboOne.test(text)) {
    if (canUseClassMechanic(ctx.player, "combo", ctx.card)) {
      ctx.player.cardsPlayedThisTurn += 1;
      actions.push(\`Combo +1 (\${ctx.player.cardsPlayedThisTurn})\`);
    }
    text = text.replace(comboOne, " ");
  }`,
  "Combo increment gate"
);

replaceAll(
`  const comboBuff = /Give this follower \\+X\\/\\+X\\.\\s*X is your Combo\\.?/i;
  if (comboBuff.test(text) && ctx.sourceUnit) {
    const x = Math.max(0, Number(ctx.player.cardsPlayedThisTurn) || 0);
    buff(ctx.sourceUnit, x, x);
    actions.push(\`this follower +\${x}/+\${x} from Combo\`);
    text = text.replace(comboBuff, " ");
  }`,
`  const comboBuff = /Give this follower \\+X\\/\\+X\\.\\s*X is your Combo\\.?/i;
  if (comboBuff.test(text)) {
    if (ctx.sourceUnit && canUseClassMechanic(ctx.player, "combo", ctx.card)) {
      const x = Math.max(0, Number(ctx.player.cardsPlayedThisTurn) || 0);
      buff(ctx.sourceUnit, x, x);
      actions.push(\`this follower +\${x}/+\${x} from Combo\`);
    }
    text = text.replace(comboBuff, " ");
  }`,
  "Combo scaling gate"
);

replaceAll(
`  const overflowAuto = /If you'?re in Overflow, evolve this follower\\.?/i;
  if (overflowAuto.test(text)) {
    if ((Number(ctx.player.maxPp) || 0) >= 7 && ctx.sourceUnit) evolveUnitByAbility(ctx, ctx.sourceUnit, actions);
    text = text.replace(overflowAuto, " ");
  }`,
`  const overflowAuto = /If you'?re in Overflow, evolve this follower\\.?/i;
  if (overflowAuto.test(text)) {
    if (canUseClassMechanic(ctx.player, "overflow", ctx.card) && (Number(ctx.player.maxPp) || 0) >= 7 && ctx.sourceUnit) evolveUnitByAbility(ctx, ctx.sourceUnit, actions);
    text = text.replace(overflowAuto, " ");
  }`,
  "Overflow auto-evolve gate"
);

replaceAll(
`  const overflowEvolve = /If you'?re in Overflow, evolve this follower\\.?/i;
  if (overflowEvolve.test(text)) { if((Number(ctx.player.maxPp)||0)>=7 && ctx.sourceUnit) evolveUnitByAbility(ctx,ctx.sourceUnit,actions); text=text.replace(overflowEvolve," "); }`,
`  const overflowEvolve = /If you'?re in Overflow, evolve this follower\\.?/i;
  if (overflowEvolve.test(text)) { if(canUseClassMechanic(ctx.player, "overflow", ctx.card) && (Number(ctx.player.maxPp)||0)>=7 && ctx.sourceUnit) evolveUnitByAbility(ctx,ctx.sourceUnit,actions); text=text.replace(overflowEvolve," "); }`,
  "Overflow evolve gate"
);

fs.writeFileSync(path, src);
console.log("Class-specific bespoke Battle Sim rules hardened");
