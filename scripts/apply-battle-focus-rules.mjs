import fs from "node:fs/promises";

const rulesUrl = new URL("../js/battle-rules.js", import.meta.url);
const engineUrl = new URL("../js/battle-engine-v4.js", import.meta.url);

let rules = await fs.readFile(rulesUrl, "utf8");
let engine = await fs.readFile(engineUrl, "utf8");

const marker = "// [[battle-focus-rules-v5]]";
if (!rules.includes(marker)) {
  const anchor = "  const cardName = normalize(context.card?.name);\n";
  if (!rules.includes(anchor)) throw new Error("battle-rules.js insertion anchor not found");

  const block = `

  ${marker}
  if (cardName === "lovestruck puppeteer" || cardName === "cool courier") {
    const replicate = /replicate the effects of this card'?s Fanfare ability\\.?/i;
    if (replicate.test(text)) {
      const generatedName = cardName === "lovestruck puppeteer" ? "Puppet" : "Ancient Artifact";
      const generated = relatedCardByName(context.card, generatedName);
      if (generated && typeof context.addToHand === "function") {
        const count = context.addToHand(context.player, generated, 1, context.playerIndex);
        if (count) {
          context.stats.cardsGenerated[context.playerIndex] += count;
          actions.push(\`${'${context.card.name}'}: replicate Fanfare · add ${'${generated.name}'}\`);
        }
        text = text.replace(replicate, " ");
        applied = true;
      }
    }
  }

  if (cardName === "puppet cat") {
    const conditionalPuppet = /if there(?:'|’)s a super-evolved allied follower on the field,\\s*add a Puppet to your hand and give it \\+3\\/\\+0\\.?/i;
    if (conditionalPuppet.test(text)) {
      const conditionMet = context.player.board.some(unit => unit.type === "Follower" && unit.superEvolved);
      if (!conditionMet) {
        text = text.replace(conditionalPuppet, " ");
        applied = true;
      } else {
        const token = relatedCardByName(context.card, "Puppet");
        if (token && typeof context.addToHand === "function") {
          const before = new Set(context.player.hand.map(item => item.uid));
          const count = context.addToHand(context.player, token, 1, context.playerIndex);
          const generated = context.player.hand.find(item => !before.has(item.uid) && normalize(item.card?.name) === "puppet");
          if (count) context.stats.cardsGenerated[context.playerIndex] += count;
          if (generated) context.buffHand(generated, 3, 0);
          if (count) actions.push("Puppet Cat: add Puppet +3/+0");
          text = text.replace(conditionalPuppet, " ");
          applied = true;
        }
      }
    }
  }

  if (cardName === "odin, twilit fate") {
    const banishCard = /select an enemy card on the field and banish it\\.?/i;
    if (banishCard.test(text)) {
      const targets = context.opponent.board.filter(unit => !unit.aura);
      const target = [...targets].sort((a, b) => fieldValue(b) - fieldValue(a))[0] ?? null;
      if (target && context.banish(context.opponent, target)) actions.push(\`Odin: banish ${'${target.name}'}\`);
      text = text.replace(banishCard, " ");
      applied = true;
    }
  }

  if (cardName === "serene sanctuary") {
    const advance = /advance this amulet'?s count by 1\\.?/i;
    if (advance.test(text) && context.sourceUnit && Number.isFinite(context.sourceUnit.countdown)) {
      context.sourceUnit.countdown = Math.max(0, context.sourceUnit.countdown - 1);
      actions.push("Serene Sanctuary: advance countdown by 1");
      if (context.sourceUnit.countdown <= 0) {
        context.player.board = context.player.board.filter(unit => unit !== context.sourceUnit && unit.uid !== context.sourceUnit.uid);
        if (!Array.isArray(context.player.cemetery)) context.player.cemetery = [];
        context.player.cemetery.push({ uid: context.sourceUnit.uid, card: context.sourceUnit.card ?? context.card });
        context.player.shadows = (Number(context.player.shadows) || 0) + 1;
        const lastWords = core.getTriggeredText(context.card, "lastWords");
        if (lastWords) {
          if (Array.isArray(context.stats.lastWordsTriggered)) context.stats.lastWordsTriggered[context.playerIndex] += 1;
          const result = core.executeGenericEffects(lastWords, context);
          actions.push("Serene Sanctuary Last Words", ...(result.actions ?? []));
        }
      }
      text = text.replace(advance, " ");
      applied = true;
    }
  }

  if (cardName === "jeanne, saintly knight") {
    const buffOthers = /give all other allied followers on the field \\+2\\/\\+4\\.?/i;
    if (buffOthers.test(text)) {
      const targets = context.player.board.filter(unit => unit.type === "Follower" && unit !== context.sourceUnit);
      for (const target of targets) context.buffUnit(target, 2, 4);
      actions.push(\`Jeanne: +2/+4 to ${'${targets.length}'} other allied follower${'${targets.length === 1 ? "" : "s"}'}\`);
      text = text.replace(buffOthers, " ");
      applied = true;
    }
  }

  if (cardName === "olivia, proud dark angel") {
    const recoverSep = /recover 2 super-evolution points?\\.?/i;
    if (recoverSep.test(text)) {
      const before = Number(context.player.sep) || 0;
      context.player.sep = Math.min(2, before + 2);
      actions.push(\`Olivia: recover ${'${context.player.sep - before}'} SEP\`);
      text = text.replace(recoverSep, " ");
      applied = true;
    }
  }
`;

  rules = rules.replace(anchor, `${anchor}${block}`);
}

const removePartialNames = [
  "serene sanctuary",
  "jeanne, saintly knight",
  "olivia, proud dark angel",
  "puppet cat",
  "lovestruck puppeteer",
  "cool courier",
  "odin, twilit fate"
];

for (const name of removePartialNames) {
  const line = new RegExp(`^\\s*\\["${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}",\\s*"[^"]+"\\],?\\r?\\n`, "mi");
  engine = engine.replace(line, "");
}

await fs.writeFile(rulesUrl, rules);
await fs.writeFile(engineUrl, engine);
console.log("Focus Battle Sim rules materialized.");
