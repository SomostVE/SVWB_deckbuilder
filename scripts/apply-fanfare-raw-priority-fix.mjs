import fs from "node:fs";

const file = "js/battle-engine-v5.js";
let src = fs.readFileSync(file, "utf8");
const mark = "// [[battle-fanfare-raw-priority-v1]]";
const original = `  let text = String(raw ?? "").trim();\n  const actions = [];`;

const block = `  ${mark}\n  let fanfarePriorityRaw = highRiskRaw;\n  const fanfarePriorityActions = [];\n\n  if (highRiskName === "meg, girl next door") {\n    const clause = /Skybound Art\\s*:\\s*Super-evolve this follower\\.?/i;\n    if (clause.test(fanfarePriorityRaw)) {\n      const gauge = skyboundCountForInstance(ctx);\n      if (gauge >= 10 && ctx.sourceUnit) superEvolveUnitByAbility(ctx, ctx.sourceUnit, fanfarePriorityActions);\n      fanfarePriorityActions.push(\`Meg: Skybound gauge \${gauge}\`);\n      fanfarePriorityRaw = fanfarePriorityRaw.replace(clause, " ");\n    }\n  }\n\n  if (highRiskName === "katalina, sky's protector") {\n    const clause = /Skybound Art\\s*:\\s*Deal 5 damage to 2 random enemy followers\\.?/i;\n    if (clause.test(fanfarePriorityRaw)) {\n      const gauge = skyboundCountForInstance(ctx);\n      if (gauge >= 10) {\n        const pool = [...ctx.opponent.board].filter(unit => unit.type === "Follower");\n        for (let i = 0; i < 2 && pool.length; i += 1) {\n          const index = Math.floor(ctx.rng() * pool.length);\n          const target = pool.splice(index, 1)[0];\n          damageUnit(target, 5, ctx.opponent, ctx.player, ctx, fanfarePriorityActions);\n        }\n      }\n      fanfarePriorityActions.push(\`Katalina: Skybound gauge \${gauge}\`);\n      fanfarePriorityRaw = fanfarePriorityRaw.replace(clause, " ");\n    }\n    fanfarePriorityRaw = fanfarePriorityRaw.replace(/Can'?t take more than 3 damage at a time\\.?/i, " ");\n  }\n\n  if (highRiskName === "ezecrain, portent of vengeance") {\n    const clause = /Select 2 enemy followers on the field and deal them 4 damage\\.\\s*Gain 2 earth sigils\\.?/i;\n    if (clause.test(fanfarePriorityRaw)) {\n      const targets = [...ctx.opponent.board]\n        .filter(unit => unit.type === "Follower")\n        .sort((a, b) => followerThreatValue(b) - followerThreatValue(a))\n        .slice(0, 2);\n      for (const target of targets) damageUnit(target, 4, ctx.opponent, ctx.player, ctx, fanfarePriorityActions);\n      ctx.player.earthSigils = (Number(ctx.player.earthSigils) || 0) + 2;\n      fanfarePriorityActions.push(\`Ezecrain: 4 damage ×\${targets.length} · Earth Sigils +2\`);\n      fanfarePriorityRaw = fanfarePriorityRaw.replace(clause, " ");\n    }\n  }\n\n  if (highRiskName === "emperor of elements") {\n    fanfarePriorityRaw = fanfarePriorityRaw.replace(/Whenever an allied Golem follower enters the field, Earth Rite\\s*\\(?\\s*1\\s*\\)?\\s*[-–—:]\\s*Evolve it\\.?/i, " ");\n  }\n\n  let text = String(fanfarePriorityRaw ?? "").trim();\n  const actions = [...fanfarePriorityActions];`;

const markerIndex = src.indexOf(mark);
if (markerIndex >= 0) {
  const blockStart = src.lastIndexOf("  ", markerIndex);
  const blockEndNeedle = "  const actions = [...fanfarePriorityActions];";
  const endStart = src.indexOf(blockEndNeedle, markerIndex);
  if (endStart < 0) throw new Error("Existing raw-priority block end not found");
  const end = endStart + blockEndNeedle.length;
  src = src.slice(0, blockStart) + original + src.slice(end);
}

const resolveIndex = src.indexOf("function resolveText(raw, ctx) {");
if (resolveIndex < 0) throw new Error("resolveText not found");
const targetIndex = src.indexOf(original, resolveIndex);
if (targetIndex < 0) throw new Error("resolveText text/actions anchor not found");
src = src.slice(0, targetIndex) + block + src.slice(targetIndex + original.length);

fs.writeFileSync(file, src);
console.log("Materialized final Fanfare raw-priority fixes in resolveText");
