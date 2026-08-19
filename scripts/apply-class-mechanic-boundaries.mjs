import fs from "node:fs";

const V5 = "js/battle-engine-v5.js";
const CORE = "js/battle-engine-core.js";
const MARK = "// [[class-mechanic-boundaries-v1]]";

function patchV5() {
  let src = fs.readFileSync(V5, "utf8");
  if (!src.includes(MARK)) {
    const helperAnchor = "function spellboostHand(player, amount, cardMap, actions = []) {";
    if (!src.includes(helperAnchor)) throw new Error("v5 spellboostHand anchor missing");
    const helper = `${MARK}\nexport function isSpellboostRecipient(card) {\n  if (!card) return false;\n  const keywords = (card.keywords ?? []).map(value => norm(value));\n  return keywords.includes("on spellboost") || /\\bon spellboost\\s*:/i.test(String(card.text ?? ""));\n}\n\nexport function inspectSpellboostBoundary(cards, { handNames = [], amount = 1 } = {}) {\n  const map = new Map((cards ?? []).map(card => [Number(card.id), card]));\n  const byName = name => [...map.values()].find(card => norm(card.name) === norm(name));\n  const player = { name: "Spellboost Inspector", nextSerial: 0, hand: [] };\n  player.hand = handNames.map(name => byName(name)).filter(Boolean).map(card => instance(player, card));\n  spellboostHand(player, Math.max(0, Number(amount) || 0), map, []);\n  return player.hand.map(item => ({ name: item.card.name, class: item.card.class, spellboost: Number(item.spellboost) || 0, x: Number(item.x) || 0 }));\n}\n\n`;
    src = src.replace(helperAnchor, helper + helperAnchor);

    const loopAnchor = "    for (const inst of player.hand) {\n      inst.spellboost = (Number(inst.spellboost) || 0) + 1;";
    if (!src.includes(loopAnchor)) throw new Error("v5 spellboost loop anchor missing");
    src = src.replace(loopAnchor, "    for (const inst of player.hand) {\n      if (!isSpellboostRecipient(inst.card)) continue;\n      inst.spellboost = (Number(inst.spellboost) || 0) + 1;");

    const viewAnchor = "spellboost: Number(item.spellboost)||0";
    if (!src.includes(viewAnchor)) throw new Error("v5 cardView spellboost anchor missing");
    src = src.replaceAll(viewAnchor, "spellboost: isSpellboostRecipient(card) ? (Number(item.spellboost)||0) : 0");

    fs.writeFileSync(V5, src);
    console.log("Patched battle-engine-v5 Spellboost boundaries");
  }
}

function patchCore() {
  let src = fs.readFileSync(CORE, "utf8");
  if (!src.includes(MARK)) {
    const createAnchor = "function createInstance(player, card) {";
    if (!src.includes(createAnchor)) throw new Error("core createInstance anchor missing");
    const helper = `${MARK}\nfunction isSpellboostRecipient(card) {\n  if (!card) return false;\n  const keywords = (card.keywords ?? []).map(value => String(value).trim().toLowerCase());\n  return keywords.includes("on spellboost") || /\\bon spellboost\\s*:/i.test(String(card.text ?? ""));\n}\n\n`;
    src = src.replace(createAnchor, helper + createAnchor);

    const loopAnchor = "    for (const handCard of player.hand) handCard.spellboost = (Number(handCard.spellboost) || 0) + 1;";
    if (!src.includes(loopAnchor)) throw new Error("core spellboost loop anchor missing");
    src = src.replace(loopAnchor, "    for (const handCard of player.hand) {\n      if (!isSpellboostRecipient(handCard.card)) continue;\n      handCard.spellboost = (Number(handCard.spellboost) || 0) + 1;\n    }");

    const viewAnchor = "spellboost: Number(instance.spellboost) || 0,";
    if (!src.includes(viewAnchor)) throw new Error("core cardView spellboost anchor missing");
    src = src.replace(viewAnchor, "spellboost: isSpellboostRecipient(card) ? (Number(instance.spellboost) || 0) : 0,");

    fs.writeFileSync(CORE, src);
    console.log("Patched battle-engine-core Spellboost boundaries");
  }
}

function patchLabelsAndVersion() {
  const battlePath = "js/battle.js";
  let battle = fs.readFileSync(battlePath, "utf8");
  battle = battle.replaceAll("<span>EP ${player.ep}</span>", "<span>Evo ${player.ep}</span>");
  battle = battle.replaceAll("<span>SEP ${player.sep}</span>", "<span>Super Evo ${player.sep}</span>");
  fs.writeFileSync(battlePath, battle);

  const inspectorPath = "js/battle-replay-inspector.js";
  let inspector = fs.readFileSync(inspectorPath, "utf8");
  inspector = inspector
    .replace('ep: number(/\\bEP\\s*(\\d+)/i),', 'ep: number(/\\b(?:Evo|EP)\\s*(\\d+)/i),')
    .replace('sep: number(/\\bSEP\\s*(\\d+)/i),', 'sep: number(/\\b(?:Super Evo|SEP)\\s*(\\d+)/i),')
    .replace('addChange(rows, "EP", before.ep, after.ep);', 'addChange(rows, "Evo", before.ep, after.ep);')
    .replace('addChange(rows, "SEP", before.sep, after.sep);', 'addChange(rows, "Super Evo", before.sep, after.sep);')
    .replace('["EP", side.ep], ["SEP", side.sep]', '["Evo", side.ep], ["Super Evo", side.sep]');
  fs.writeFileSync(inspectorPath, inspector);

  fs.writeFileSync("version.json", `${JSON.stringify({ version: "01.04.003" }, null, 2)}\n`);
}

patchV5();
patchCore();
patchLabelsAndVersion();
