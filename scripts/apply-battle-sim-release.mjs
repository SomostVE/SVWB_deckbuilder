import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const write = (path, content) => fs.writeFileSync(path, content);

function replaceOnce(src, before, after, label) {
  if (src.includes(after)) return src;
  if (!src.includes(before)) throw new Error(`Missing anchor: ${label}`);
  return src.replace(before, after);
}

function replaceAllRequired(src, before, after, label) {
  if (src.includes(after) && !src.includes(before)) return src;
  if (!src.includes(before)) throw new Error(`Missing anchor: ${label}`);
  return src.replaceAll(before, after);
}

function patchRulesCore() {
  const path = "js/battle-rules-core.js";
  let src = read(path);
  src = replaceOnce(
    src,
    "const WORD_NUMBERS = {",
    'import { canUseClassMechanic } from "./battle-class-mechanics.js";\n\nconst WORD_NUMBERS = {',
    "rules core class import"
  );

  src = replaceOnce(src,
`  const necro = text.match(/\\bnecromancy\\s*\\(?\\s*(\\d+)\\s*\\)?\\s*:\\s*(.*)$/i);
  if (necro) {
    const need = Number(necro[1]);
    if ((context.player.shadows ?? 0) < need) return { text: "", active: false, notes: [\`Necromancy \${need} unavailable\`] };
    context.player.shadows -= need;
    text = necro[2];
    notes.push(\`Necromancy \${need}\`);
  }`,
`  const necro = text.match(/\\bnecromancy\\s*\\(?\\s*(\\d+)\\s*\\)?\\s*:\\s*(.*)$/i);
  if (necro) {
    const need = Number(necro[1]);
    if (!canUseClassMechanic(context.player, "necromancy", context.card)) return { text: "", active: false, notes: ["Necromancy unavailable outside Abysscraft"] };
    if ((context.player.shadows ?? 0) < need) return { text: "", active: false, notes: [\`Necromancy \${need} unavailable\`] };
    context.player.shadows -= need;
    text = necro[2];
    notes.push(\`Necromancy \${need}\`);
  }`, "rules core necromancy gate");

  src = replaceOnce(src,
`  const combo = text.match(/\\bcombo\\s*\\(?\\s*(\\d+)\\s*\\)?\\s*:\\s*(.*)$/i);
  if (combo) {
    const need = Number(combo[1]);
    if ((context.player.cardsPlayedThisTurn ?? 0) < need) return { text: "", active: false, notes: [\`Combo \${need} unavailable\`] };
    text = combo[2];
    notes.push(\`Combo \${need}\`);
  }`,
`  const combo = text.match(/\\bcombo\\s*\\(?\\s*(\\d+)\\s*\\)?\\s*:\\s*(.*)$/i);
  if (combo) {
    const need = Number(combo[1]);
    if (!canUseClassMechanic(context.player, "combo", context.card)) return { text: "", active: false, notes: ["Combo unavailable outside Forestcraft"] };
    if ((context.player.cardsPlayedThisTurn ?? 0) < need) return { text: "", active: false, notes: [\`Combo \${need} unavailable\`] };
    text = combo[2];
    notes.push(\`Combo \${need}\`);
  }`, "rules core combo gate");

  src = replaceOnce(src,
`  const overflowPrefix = text.match(/\\boverflow\\s*:\\s*(.*)$/i);
  if (overflowPrefix) {
    if ((context.player.maxPp ?? 0) < 7) return { text: "", active: false, notes: ["Overflow inactive"] };
    text = overflowPrefix[1];
    notes.push("Overflow");
  }

  if (/if overflow is active/i.test(text)) {
    if ((context.player.maxPp ?? 0) < 7) {
      text = text.replace(/if overflow is active[^.]*\\.?/i, "");
    } else {
      text = text.replace(/if overflow is active[, ]*/i, "");
      notes.push("Overflow");
    }
  }`,
`  const overflowPrefix = text.match(/\\boverflow\\s*:\\s*(.*)$/i);
  if (overflowPrefix) {
    if (!canUseClassMechanic(context.player, "overflow", context.card)) return { text: "", active: false, notes: ["Overflow unavailable outside Dragoncraft"] };
    if ((context.player.maxPp ?? 0) < 7) return { text: "", active: false, notes: ["Overflow inactive"] };
    text = overflowPrefix[1];
    notes.push("Overflow");
  }

  if (/if overflow is active/i.test(text)) {
    if (!canUseClassMechanic(context.player, "overflow", context.card) || (context.player.maxPp ?? 0) < 7) {
      text = text.replace(/if overflow is active[^.]*\\.?/i, "");
    } else {
      text = text.replace(/if overflow is active[, ]*/i, "");
      notes.push("Overflow");
    }
  }`, "rules core overflow gate");

  write(path, src);
}

function patchEngineV5() {
  const path = "js/battle-engine-v5.js";
  let src = read(path);
  src = replaceOnce(src,
    'import { analyzeCardSupport as analyzeCardSupportV4 } from "./battle-engine-v4.js";',
    'import { analyzeCardSupport as analyzeCardSupportV4 } from "./battle-engine-v4.js";\nimport { canUseClassMechanic, classMechanicStatus, isSpellboostRecipientCard, resolveDeckClass } from "./battle-class-mechanics.js";',
    "v5 class mechanic import"
  );

  src = replaceOnce(src,
`export function simulateBattle({ playerDeck, opponentDeck, cardMap, playerStrategy = {}, opponentStrategy = {}, seed = "deci-builder", playerSide = "random", recordFrames = true }) {
  const simulationMap = prepareSimulationCardMap(cardMap);`,
`export function simulateBattle({ playerDeck, opponentDeck, cardMap, playerStrategy = {}, opponentStrategy = {}, playerClass = null, opponentClass = null, seed = "deci-builder", playerSide = "random", recordFrames = true }) {
  const simulationMap = prepareSimulationCardMap(cardMap);
  const inferClass = (deck, requested) => {
    if (requested) return resolveDeckClass(deck, simulationMap, requested);
    try { return resolveDeckClass(deck, simulationMap); }
    catch { return null; }
  };
  const resolvedPlayerClass = inferClass(playerDeck, playerClass);
  const resolvedOpponentClass = inferClass(opponentDeck, opponentClass);`, "simulate class args");

  src = replaceOnce(src,
`  const players = [
    makePlayer("You", playerDeck, playerStrategy, simulationMap, rng),
    makePlayer("Opponent", opponentDeck, opponentStrategy, simulationMap, rng)
  ];`,
`  const players = [
    makePlayer("You", playerDeck, playerStrategy, simulationMap, rng, resolvedPlayerClass),
    makePlayer("Opponent", opponentDeck, opponentStrategy, simulationMap, rng, resolvedOpponentClass)
  ];`, "simulate class assignment");

  src = replaceAllRequired(src,
`function makePlayer(name, deck, strategy, cardMap, rng) {
  const player = {
    name, strategy: normStrategy(strategy),`,
`function makePlayer(name, deck, strategy, cardMap, rng, className = null) {
  const player = {
    name, className, strategy: normStrategy(strategy),`, "makePlayer className");

  src = replaceAllRequired(src,
`export function isSpellboostRecipient(card) {
  if (!card) return false;
  const keywords = (card.keywords ?? []).map(value => norm(value));
  return keywords.includes("on spellboost") || /\\bon spellboost\\s*:/i.test(String(card.text ?? ""));
}`,
`export function isSpellboostRecipient(card) {
  return isSpellboostRecipientCard(card);
}`, "spellboost recipient owner");

  src = replaceAllRequired(src,
`    for (const inst of player.hand) {
      if (!isSpellboostRecipient(inst.card)) continue;`,
`    for (const inst of player.hand) {
      if (!canUseClassMechanic(player, "spellboost", inst.card)) continue;
      if (!isSpellboostRecipient(inst.card)) continue;`, "spellboost class gate");

  src = replaceAllRequired(src,
`      name: player.name, hp: player.hp, maxHp: player.maxHp, pp: player.pp, maxPp: player.maxPp, ep: player.ep, sep: player.sep,
      shadows: player.shadows, rally: player.rally, bonusPpAvailable: player.bonusPpAvailable, bonusPpUses: player.bonusPpUses,`,
`      name: player.name, className: player.className, hp: player.hp, maxHp: player.maxHp, pp: player.pp, maxPp: player.maxPp, ep: player.ep, sep: player.sep,
      shadows: player.shadows, rally: player.rally, earthSigils: player.earthSigils, cardsPlayedThisTurn: player.cardsPlayedThisTurn,
      classMechanics: classMechanicStatus(player), bonusPpAvailable: player.bonusPpAvailable, bonusPpUses: player.bonusPpUses,`, "snapshot class state");

  src = replaceAllRequired(src,
`  if (!urgent && /if overflow is active/.test(norm(raw)) && (Number(player.maxPp) || 0) === 6) score -= 2.5;

  const rallyNeed = Number(raw.match(/Rally\\s*\\(?\\s*(\\d+)\\s*\\)?\\s*:/i)?.[1] ?? 0);
  if (!urgent && rallyNeed > 0 && (Number(player.rally) || 0) < rallyNeed && rallyNeed - (Number(player.rally) || 0) <= 2) score -= 1.5;

  const necroNeed = Number(raw.match(/Necromancy\\s*\\(?\\s*(\\d+)\\s*\\)?\\s*[-–—:]/i)?.[1] ?? 0);
  if (!urgent && necroNeed > 0 && (Number(player.shadows) || 0) < necroNeed) score -= 1.5;`,
`  if (!urgent && canUseClassMechanic(player, "overflow", card) && /if overflow is active/.test(norm(raw)) && (Number(player.maxPp) || 0) === 6) score -= 2.5;

  const rallyNeed = Number(raw.match(/Rally\\s*\\(?\\s*(\\d+)\\s*\\)?\\s*:/i)?.[1] ?? 0);
  if (!urgent && canUseClassMechanic(player, "rally", card) && rallyNeed > 0 && (Number(player.rally) || 0) < rallyNeed && rallyNeed - (Number(player.rally) || 0) <= 2) score -= 1.5;

  const necroNeed = Number(raw.match(/Necromancy\\s*\\(?\\s*(\\d+)\\s*\\)?\\s*[-–—:]/i)?.[1] ?? 0);
  if (!urgent && canUseClassMechanic(player, "necromancy", card) && necroNeed > 0 && (Number(player.shadows) || 0) < necroNeed) score -= 1.5;`, "AI class mechanic scoring");

  src = replaceAllRequired(src,
`  const necromancy = text.match(/Necromancy\\s*\\(?\\s*(\\d+)\\s*\\)?\\s*[-–—:]\\s*(.*)$/i);
  if (necromancy) {
    if (ctx.player.shadows < Number(necromancy[1])) return { actions: [\`Necromancy \${necromancy[1]} unavailable\`], applied: false, unresolved: false };
    ctx.player.shadows -= Number(necromancy[1]);
    actions.push(\`Necromancy \${necromancy[1]}\`);
    text = necromancy[2];
  }
  const rally = text.match(/Rally\\s*\\(?\\s*(\\d+)\\s*\\)?\\s*:\\s*(.*)$/i);
  if (rally) {
    if (ctx.player.rally < Number(rally[1])) return { actions: [\`Rally \${ctx.player.rally}/\${rally[1]}\`], applied: false, unresolved: false };
    actions.push(\`Rally \${rally[1]}\`);
    text = rally[2];
  }
  const combo = text.match(/Combo\\s*\\(?\\s*(\\d+)\\s*\\)?\\s*:\\s*(.*)$/i);
  if (combo) {
    if (ctx.player.cardsPlayedThisTurn < Number(combo[1])) return { actions: [\`Combo \${ctx.player.cardsPlayedThisTurn}/\${combo[1]}\`], applied: false, unresolved: false };
    text = combo[2];
  }`,
`  const necromancy = text.match(/Necromancy\\s*\\(?\\s*(\\d+)\\s*\\)?\\s*[-–—:]\\s*(.*)$/i);
  if (necromancy) {
    if (!canUseClassMechanic(ctx.player, "necromancy", ctx.card)) return { actions: ["Necromancy unavailable outside Abysscraft"], applied: false, unresolved: false };
    if (ctx.player.shadows < Number(necromancy[1])) return { actions: [\`Necromancy \${necromancy[1]} unavailable\`], applied: false, unresolved: false };
    ctx.player.shadows -= Number(necromancy[1]);
    actions.push(\`Necromancy \${necromancy[1]}\`);
    text = necromancy[2];
  }
  const rally = text.match(/Rally\\s*\\(?\\s*(\\d+)\\s*\\)?\\s*:\\s*(.*)$/i);
  if (rally) {
    if (!canUseClassMechanic(ctx.player, "rally", ctx.card)) return { actions: ["Rally unavailable outside Swordcraft"], applied: false, unresolved: false };
    if (ctx.player.rally < Number(rally[1])) return { actions: [\`Rally \${ctx.player.rally}/\${rally[1]}\`], applied: false, unresolved: false };
    actions.push(\`Rally \${rally[1]}\`);
    text = rally[2];
  }
  const combo = text.match(/Combo\\s*\\(?\\s*(\\d+)\\s*\\)?\\s*:\\s*(.*)$/i);
  if (combo) {
    if (!canUseClassMechanic(ctx.player, "combo", ctx.card)) return { actions: ["Combo unavailable outside Forestcraft"], applied: false, unresolved: false };
    if (ctx.player.cardsPlayedThisTurn < Number(combo[1])) return { actions: [\`Combo \${ctx.player.cardsPlayedThisTurn}/\${combo[1]}\`], applied: false, unresolved: false };
    text = combo[2];
  }`, "v5 conditional class gates");

  src = replaceAllRequired(src,
`  if (/if overflow is active/i.test(text) && ctx.player.maxPp < 7) text = text.replace(/if overflow is active[^.]*\\.?/ig, "");
  else if (/if overflow is active/i.test(text)) text = text.replace(/if overflow is active[, ]*/ig, "");
  if (/Earth Rite\\s*\\(?\\s*(\\d+)?\\s*\\)?\\s*[-–—:]/i.test(text)) {
    const amount = Number(text.match(/Earth Rite\\s*\\(?\\s*(\\d+)?/i)?.[1] ?? 1);
    if (ctx.player.earthSigils < amount) return { actions: [\`Earth Rite \${ctx.player.earthSigils}/\${amount}\`], applied: false, unresolved: false };
    performEarthRite(ctx.player, amount, actions);
    text = text.replace(/Earth Rite\\s*\\(?\\s*\\d*\\s*\\)?\\s*[-–—:]/i, "");
  }`,
`  if (/if overflow is active/i.test(text) && (!canUseClassMechanic(ctx.player, "overflow", ctx.card) || ctx.player.maxPp < 7)) text = text.replace(/if overflow is active[^.]*\\.?/ig, "");
  else if (/if overflow is active/i.test(text)) text = text.replace(/if overflow is active[, ]*/ig, "");
  if (/Earth Rite\\s*\\(?\\s*(\\d+)?\\s*\\)?\\s*[-–—:]/i.test(text)) {
    if (!canUseClassMechanic(ctx.player, "earthRite", ctx.card)) return { actions: ["Earth Rite unavailable outside Runecraft"], applied: false, unresolved: false };
    const amount = Number(text.match(/Earth Rite\\s*\\(?\\s*(\\d+)?/i)?.[1] ?? 1);
    if (ctx.player.earthSigils < amount) return { actions: [\`Earth Rite \${ctx.player.earthSigils}/\${amount}\`], applied: false, unresolved: false };
    performEarthRite(ctx.player, amount, actions);
    text = text.replace(/Earth Rite\\s*\\(?\\s*\\d*\\s*\\)?\\s*[-–—:]/i, "");
  }`, "v5 overflow earth rite gates");

  src = replaceAllRequired(src,
`      if ((card.traits ?? []).includes("Earth Sigil")) player.earthSigils += 1;`,
`      if ((card.traits ?? []).includes("Earth Sigil") && canUseClassMechanic(player, "earthRite", card)) player.earthSigils += 1;`, "earth sigil amulet class gate");

  src = replaceAllRequired(src,
`  text = text.replace(/^Earth Sigil\\.?/i, () => { ctx.player.earthSigils += 1; actions.push(\`Earth Sigils +1 (\${ctx.player.earthSigils})\`); return " "; });`,
`  text = text.replace(/^Earth Sigil\\.?/i, () => { if (canUseClassMechanic(ctx.player, "earthRite", ctx.card)) { ctx.player.earthSigils += 1; actions.push(\`Earth Sigils +1 (\${ctx.player.earthSigils})\`); } return " "; });`, "earth sigil label class gate");

  src = replaceAllRequired(src,
`  for (const match of [...text.matchAll(/Gain\\s+(?:an?|one|1)\\s+earth sigil\\.?/gi)]) {
    ctx.player.earthSigils += 1;
    actions.push(\`Earth Sigils +1 (\${ctx.player.earthSigils})\`);
    text = text.replace(match[0], " ");
  }`,
`  for (const match of [...text.matchAll(/Gain\\s+(?:an?|one|1)\\s+earth sigil\\.?/gi)]) {
    if (canUseClassMechanic(ctx.player, "earthRite", ctx.card)) {
      ctx.player.earthSigils += 1;
      actions.push(\`Earth Sigils +1 (\${ctx.player.earthSigils})\`);
    }
    text = text.replace(match[0], " ");
  }`, "earth sigil gain class gate");

  src = replaceAllRequired(src,
`    ctx.player.earthSigils += 1;
    actions.push(\`selected damage \${damageSigil[1]} · Earth Sigil +1\`);`,
`    if (canUseClassMechanic(ctx.player, "earthRite", ctx.card)) {
      ctx.player.earthSigils += 1;
      actions.push(\`selected damage \${damageSigil[1]} · Earth Sigil +1\`);
    }`, "compound earth sigil gate");

  src = replaceAllRequired(src,
`  for (const match of [...text.matchAll(/gain\\s+(an?|one|two|three|four|five|\\d+)\\s+earth sigils?/gi)]) {
    const amount = word(match[1]) || 1;
    ctx.player.earthSigils += amount;
    actions.push(\`Earth Sigils +\${amount} (\${ctx.player.earthSigils})\`);
    text = text.replace(match[0], " ");
  }`,
`  for (const match of [...text.matchAll(/gain\\s+(an?|one|two|three|four|five|\\d+)\\s+earth sigils?/gi)]) {
    const amount = word(match[1]) || 1;
    if (canUseClassMechanic(ctx.player, "earthRite", ctx.card)) {
      ctx.player.earthSigils += amount;
      actions.push(\`Earth Sigils +\${amount} (\${ctx.player.earthSigils})\`);
    }
    text = text.replace(match[0], " ");
  }`, "generic earth sigil class gate");

  // The bespoke Fediel fast-path must also honor the Abysscraft-only Necromancy contract.
  src = replaceAllRequired(src,
`  if (highRiskName === "fediel, darkness personified" && /Necromancy/i.test(highRiskRaw) && /evolve them/i.test(highRiskRaw)) {
    const actions = [];`,
`  if (highRiskName === "fediel, darkness personified" && /Necromancy/i.test(highRiskRaw) && /evolve them/i.test(highRiskRaw)) {
    const actions = [];
    if (!canUseClassMechanic(ctx.player, "necromancy", ctx.card)) return { applied: false, actions: ["Necromancy unavailable outside Abysscraft"], unresolved: false };`, "Fediel class gate");

  write(path, src);
}

function patchBattleUi() {
  const path = "js/battle.js";
  let src = read(path);
  src = replaceOnce(src,
    'import { simulateBattle, analyzeDeckCoverage } from "./battle-engine.js";',
    'import { simulateBattle, analyzeDeckCoverage } from "./battle-engine.js";\nimport { resolveDeckClass } from "./battle-class-mechanics.js";',
    "battle UI class import"
  );

  src = replaceOnce(src,
`  const ready = playerCount === 40 && opponentCount === 40;
  els.start.disabled = !ready;
  els.status.dataset.type = ready ? "info" : "warn";

  if (playerCount !== 40) {`,
`  let classError = "";
  try {
    resolveDeckClass(player.deck, state.cardMap, player.class);
    resolveDeckClass(opponentDeck, state.cardMap, opponent?.class);
  } catch (error) {
    classError = error.message;
  }

  const ready = playerCount === 40 && opponentCount === 40 && !classError;
  els.start.disabled = !ready;
  els.status.dataset.type = classError ? "error" : ready ? "info" : "warn";

  if (classError) {
    els.status.textContent = classError;
  } else if (playerCount !== 40) {`, "battle setup class validation");

  src = replaceOnce(src,
`    playerStrategy: strategy,
    opponentStrategy: opponent.strategy ?? {},
    seed: els.seed.value || makeSeed(),`,
`    playerStrategy: strategy,
    opponentStrategy: opponent.strategy ?? {},
    playerClass: player.class,
    opponentClass: opponent.class,
    seed: els.seed.value || makeSeed(),`, "battle simulation class args");

  src = replaceOnce(src,
`        <strong>${'${escapeHtml(player.name)}'}</strong>
        <span>${'${opponent ? "Opponent" : "Your deck"}'} · turn ${'${player.personalTurn}'}</span>`,
`        <strong>${'${escapeHtml(player.name)}'}</strong>
        <span>${'${opponent ? "Opponent" : "Your deck"}'}${'${player.className ? ` · ${escapeHtml(player.className)}` : ""}'} · turn ${'${player.personalTurn}'}</span>`, "battle class subtitle");

  src = replaceOnce(src,
`        <span>Evo ${'${player.ep}'}</span>
        <span>Super Evo ${'${player.sep}'}</span>
        <span>Shadows ${'${player.shadows ?? 0}'}</span>
        ${'${player.bonusPpAvailable ? "<span>+PP ready</span>" : ""}'}`,
`        <span>Evo ${'${player.ep}'}</span>
        <span>Super Evo ${'${player.sep}'}</span>
        ${'${(player.classMechanics ?? []).map(mechanic => `<span class="battle-class-mechanic" data-mechanic="${escapeAttr(mechanic.key)}">${escapeHtml(mechanic.label)} ${escapeHtml(mechanic.value)}</span>`).join("")}' }
        ${'${player.bonusPpAvailable ? "<span>+PP ready</span>" : ""}'}`, "battle class status UI");

  write(path, src);
}

function patchReplayInspector() {
  const path = "js/battle-replay-inspector.js";
  let src = read(path);
  src = replaceOnce(src,
`    shadows: number(/\\bShadows\\s*(\\d+)/i),
    handCount: number(/\\bHand\\s*(\\d+)\\/9/i),`,
`    shadows: number(/\\bShadows\\s*(\\d+)/i),
    classMechanics: [...area.querySelectorAll(".battle-class-mechanic")].map(item => String(item.textContent || "").trim()).filter(Boolean),
    handCount: number(/\\bHand\\s*(\\d+)\\/9/i),`, "inspector class mechanic capture");

  src = replaceOnce(src,
`  addChange(rows, "Shadows", before.shadows, after.shadows);
  addChange(rows, "Hand", before.handCount, after.handCount);`,
`  addChange(rows, "Shadows", before.shadows, after.shadows);
  addChange(rows, "Class mechanic", (before.classMechanics ?? []).join(" · "), (after.classMechanics ?? []).join(" · "));
  addChange(rows, "Hand", before.handCount, after.handCount);`, "inspector class mechanic changes");
  write(path, src);
}

patchRulesCore();
patchEngineV5();
patchBattleUi();
patchReplayInspector();
console.log("Battle Sim release mechanics materialized");
