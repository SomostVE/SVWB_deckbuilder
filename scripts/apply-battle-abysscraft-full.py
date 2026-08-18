from pathlib import Path

ENGINE = Path("js/battle-engine-v5.js")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing anchor for {label}")
    return text.replace(old, new, 1)


engine = ENGINE.read_text(encoding="utf-8")

# -----------------------------------------------------------------------------
# Coverage declarations for the 13 Abysscraft cards that were Partial.
# -----------------------------------------------------------------------------
engine = replace_once(
    engine,
    '''  ["wise guardian dragon", "Persistent -3 hand cost per allied Super-Evolution and Vastwing summon are modeled"]
]);''',
    '''  ["wise guardian dragon", "Persistent -3 hand cost per allied Super-Evolution and Vastwing summon are modeled"],
  // [[battle-abysscraft-full-overrides]]
  ["sham-nacha, heir to entwining", "Abyss Faith Mode accumulation/payment, extra Mode selection and Super-Evolve copy removal are modeled"],
  ["rigor of the nightblossom", "Countdown 2 draw and same-cost-hand Skeleton/Ward Crest are modeled"],
  ["valiant edge", "Countdown 2 random damage/heal Crest is modeled"],
  ["balto, dusk bounty hunter", "Countdown 4 end-turn damage-to-both-leaders Crest is modeled"],
  ["vuella, the blastwing", "Other-allied Super-Evolve +2/+0 reaction is modeled"],
  ["mukan, shadowcrypt ward", "Departed-entry Bane reaction and evolution Ghost summon are modeled"],
  ["charon, stygian oarswoman", "Departed-entry Ward and Countdown 2 start-turn Reanimate 3 Crest are modeled"],
  ["corruption", "Dual Countdown 4 self-damage Crests and Super Skybound Crest destruction are modeled"],
  ["beastmaster bones", "Departed-entry Storm and Super-Evolve allied/enemy destruction are modeled"],
  ["belial, archangel of cunning", "Countdown 4 lethal Last Words Crest and Super-Evolve count advance are modeled"],
  ["milteo & luzen", "Persistent Fanfare/Enhance suppression, played-follower evolution and evolution mass destruction are modeled"],
  ["lifestealer", "Skeleton transformation, destruction healing reaction and evolve sweep are modeled"],
  ["macmillan, reaper of ceremonies", "Own-turn Departed-entry buff/Rush/Ward and leader damage are modeled"]
]);''',
    "Abysscraft Full overrides",
)

engine = replace_once(
    engine,
    '''  /Activates in hand\\. Whenever an allied follower super-evolves, reduce the cost of this card by 3\\.?/gi
];''',
    '''  /Activates in hand\\. Whenever an allied follower super-evolves, reduce the cost of this card by 3\\.?/gi,
  // [[battle-abysscraft-reactive-clauses]]
  /Whenever another allied follower super-evolves, give it and this follower \\+2\\/\\+0\\.?/gi,
  /Whenever an allied Departed follower enters the field, give it Bane\\.?/gi,
  /Whenever an allied Departed follower enters the field, give it Ward\\.?/gi,
  /Whenever an allied Departed follower enters the field, give it Storm\\.?/gi,
  /Whenever a Skeleton is destroyed, restore 1 defense to your leader\\.?/gi,
  /During your turn, whenever an allied Departed follower enters the field, give it \\+1\\/\\+0, Rush, and Ward and deal 1 damage to the enemy leader\\.?/gi
];''',
    "Abysscraft reactive sanitization",
)

# -----------------------------------------------------------------------------
# Separate Abyss Faith from Runecraft Enhance Faith while keeping the public
# numeric Faith counter shared for snapshots/UI.
# -----------------------------------------------------------------------------
engine = replace_once(
    engine,
    '''    shadows: 0, rally: 0, earthSigils: 0, faith: 0, faithActive: false, faithEnhanceBuffs: 0, forestFaithActive: false, forestFaithEvolveDamage: 0, crests: [], bonusPpAvailable: false, bonusPpUses: 0,''',
    '''    shadows: 0, rally: 0, earthSigils: 0, faith: 0, faithActive: false, faithEnhanceBuffs: 0, forestFaithActive: false, forestFaithEvolveDamage: 0,
    abyssFaithActive: false, abyssFaithModeBonus: 0, crests: [], bonusPpAvailable: false, bonusPpUses: 0,''',
    "Abyss Faith player state",
)
engine = replace_once(
    engine,
    '''  player.faithActive = player.deck.some(item => has(item.card, "Faith")
    || ["yidmetra, eld sword", "calge-danthla, eld crystals"].includes(norm(item.card?.name)));
  // Sathanid's Faith uses evolution, not Enhanced-card events.''',
    '''  player.faithActive = player.deck.some(item => (has(item.card, "Faith") && norm(item.card?.class) !== "abysscraft")
    || ["yidmetra, eld sword", "calge-danthla, eld crystals"].includes(norm(item.card?.name)));
  // Abysscraft Faith counts Mode-selection events rather than Enhanced-card events.
  player.abyssFaithActive = player.deck.some(item => norm(item.card?.class) === "abysscraft");
  // Sathanid's Faith uses evolution, not Enhanced-card events.''',
    "Abyss Faith initialization",
)

# -----------------------------------------------------------------------------
# Mode selection: model Select N Modes and Sham-Nacha's persistent +1 selection.
# Each combination remains a separate planner branch.
# -----------------------------------------------------------------------------
engine = engine.replace('expandModes(section(text, `enhance ${cost}`))', 'expandModes(section(text, `enhance ${cost}`), player)')
engine = engine.replace('expandModes(baseText(text))', 'expandModes(baseText(text), player)')
engine = engine.replace('expandModes(section(text, `accelerate ${highestAlternativeCost}`))', 'expandModes(section(text, `accelerate ${highestAlternativeCost}`), player)')
engine = replace_once(
    engine,
    '''for (const choice of expandModes(section(text, `enhance ${cost}`), player)) out.push({ kind: choice.i ? "mode" : "enhance", cost, text: choice.text, modeIndex: choice.i, scoreBonus: 5, enhanced: true });''',
    '''for (const choice of expandModes(section(text, `enhance ${cost}`), player)) out.push({ kind: choice.i ? "mode" : "enhance", cost, text: choice.text, modeIndex: choice.i, selectedModeCount: choice.selectedModeCount ?? 0, scoreBonus: 5, enhanced: true });''',
    "Enhance Mode metadata",
)
engine = replace_once(
    engine,
    '''for (const choice of expandModes(baseText(text), player)) out.push({ kind: choice.i ? "mode" : "base", cost: base, text: choice.text, modeIndex: choice.i, scoreBonus: 0 });''',
    '''for (const choice of expandModes(baseText(text), player)) out.push({ kind: choice.i ? "mode" : "base", cost: base, text: choice.text, modeIndex: choice.i, selectedModeCount: choice.selectedModeCount ?? 0, scoreBonus: 0 });''',
    "Base Mode metadata",
)
engine = replace_once(
    engine,
    '''      out.push({ kind: "accelerate", cost: highestAlternativeCost, text: choice.text, modeIndex: choice.i, scoreBonus: 4 });''',
    '''      out.push({ kind: choice.i ? "mode" : "accelerate", cost: highestAlternativeCost, text: choice.text, modeIndex: choice.i, selectedModeCount: choice.selectedModeCount ?? 0, scoreBonus: 4, accelerated: true });''',
    "Accelerate Mode metadata",
)
engine = replace_once(
    engine,
    '''  const enhance = [...text.matchAll(/Enhance\\s*\\(?\\s*(\\d+)\\s*\\)?\\s*:/gi)]
    .map(match => Number(match[1]))
    .filter(cost => cost <= player.pp)
    .sort((a,b)=>b-a);
  if (enhance.length) {''',
    '''  const milteoSuppressesEntryAbilities = card.type === "Follower" && hasCrest(player, "Milteo & Luzen");
  const enhance = [...text.matchAll(/Enhance\\s*\\(?\\s*(\\d+)\\s*\\)?\\s*:/gi)]
    .map(match => Number(match[1]))
    .filter(cost => cost <= player.pp)
    .sort((a,b)=>b-a);
  if (enhance.length && !milteoSuppressesEntryAbilities) {''',
    "Milteo Enhance suppression in modes",
)
engine = replace_once(
    engine,
    '''function expandModes(text) {
  const choices = [...String(text).matchAll(/(?:^|\\s)(\\d+)\\.\\s*/g)];
  if (!/select a mode/i.test(text) || !choices.length) return [{ i: 0, text }];
  return choices.map((match, index) => ({
    i: Number(match[1]),
    text: String(text).slice(match.index + match[0].length, choices[index + 1]?.index ?? String(text).length).split(/\\b(?:Evolve|Super-Evolve|Last Words|Strike|Engage)\\s*:/i)[0].trim()
  }));
}''',
    '''function expandModes(text, player = null) {
  const raw = String(text ?? "");
  const choices = [...raw.matchAll(/(?:^|\\s)(\\d+)\\.\\s*/g)];
  const select = raw.match(/select\\s+(a|an|one|two|three|four|five|\\d+)\\s+modes?\\s+to activate/i);
  if (!select || !choices.length) return [{ i: 0, text: raw, selectedModeCount: 0 }];

  const segments = choices.map((match, index) => ({
    number: Number(match[1]),
    bit: 1 << Math.max(0, Number(match[1]) - 1),
    text: raw.slice(match.index + match[0].length, choices[index + 1]?.index ?? raw.length).split(/\\b(?:Evolve|Super-Evolve|Last Words|Strike|Engage)\\s*:/i)[0].trim()
  }));
  const baseCount = Math.max(1, word(select[1]) || Number(select[1]) || 1);
  const bonus = Math.max(0, Number(player?.abyssFaithModeBonus) || 0);
  const count = Math.min(segments.length, baseCount + bonus);
  const combinations = [];
  const visit = (start, picked) => {
    if (picked.length === count) { combinations.push([...picked]); return; }
    for (let index = start; index <= segments.length - (count - picked.length); index += 1) {
      picked.push(segments[index]);
      visit(index + 1, picked);
      picked.pop();
    }
  };
  visit(0, []);
  return combinations.map(combo => ({
    i: combo.reduce((mask, choice) => mask | choice.bit, 0),
    text: combo.map(choice => choice.text).filter(Boolean).join(" "),
    selectedModeCount: combo.length,
    selectedModeIndices: combo.map(choice => choice.number)
  }));
}''',
    "Mode combination expansion",
)

# -----------------------------------------------------------------------------
# Milteo changes the actual play event, not merely text resolution. Abyss Faith
# also records Mode selection at that event.
# -----------------------------------------------------------------------------
engine = replace_once(
    engine,
    '''  const card = inst.card;
  const playedWithChangedCost = card.type === "Follower" && costOf(inst) !== Math.max(0, Number(card.cost) || 0);
  const actions = [];''',
    '''  const card = inst.card;
  const playedWithChangedCost = card.type === "Follower" && costOf(inst) !== Math.max(0, Number(card.cost) || 0);
  const milteoCrest = card.type === "Follower" && hasCrest(player, "Milteo & Luzen");
  const actions = [];''',
    "Milteo play state",
)
engine = replace_once(
    engine,
    '''  // [[battle-enhance-play-event]]
  if (mode.enhanced || mode.kind === "enhance") {
    actions.push(...applyEnhancedCardPlayed({ card, instance: inst, sourceUnit: source, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap }));
  }

  // "Whenever you play ..." triggers from the play event itself.''',
    '''  // [[battle-abysscraft-mode-selection-event]]
  if (!milteoCrest && Number(mode.selectedModeCount) > 0) {
    actions.push(...recordAbyssModeSelection(player, Number(mode.selectedModeCount)));
  }

  // [[battle-enhance-play-event]]
  if (!milteoCrest && (mode.enhanced || mode.kind === "enhance")) {
    actions.push(...applyEnhancedCardPlayed({ card, instance: inst, sourceUnit: source, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap }));
  }

  // "Whenever you play ..." triggers from the play event itself.''',
    "Abyss Mode event and Milteo Enhance suppression",
)
engine = replace_once(
    engine,
    '''  if (mode.kind !== "crystallize") {
    const result = resolveText(mode.text || card.text, { card, instance: inst, sourceUnit: source, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap, targetPlan: options.targetPlan ?? null, rallyBeforePlay });
    actions.push(...result.actions);
  }

  // [[battle-runecraft-institute-trigger]]''',
    '''  if (mode.kind !== "crystallize" && !milteoCrest) {
    const result = resolveText(mode.text || card.text, { card, instance: inst, sourceUnit: source, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap, targetPlan: options.targetPlan ?? null, rallyBeforePlay });
    actions.push(...result.actions);
  }

  // [[battle-abysscraft-milteo-play-evolve]]
  if (milteoCrest && source?.type === "Follower") {
    evolveUnitByAbility({ player, opponent, playerIndex, enemyIndex, stats, rng, cardMap }, source, actions);
  }

  // [[battle-runecraft-institute-trigger]]''',
    "Milteo Fanfare suppression and played evolution",
)

# Inline Mode selections occur in Evolve/Super-Evolve abilities too. Resolve a
# deterministic branch there and count it for Abyss Faith; play-time Mode choices
# are already branched by modes().
engine = replace_once(
    engine,
    '''  if (!text) return { actions, applied: false, unresolved: false };

  // [[battle-swordcraft-resolve-text]]''',
    '''  if (!text) return { actions, applied: false, unresolved: false };

  // [[battle-inline-mode-selection]]
  if (/select\\s+(?:a|an|one|two|three|four|five|\\d+)\\s+modes?\\s+to activate/i.test(text)) {
    const choices = expandModes(text, ctx.player);
    const choice = choices[0];
    if (choice) {
      text = choice.text;
      actions.push(...recordAbyssModeSelection(ctx.player, choice.selectedModeCount ?? 0));
    }
  }

  // [[battle-swordcraft-resolve-text]]''',
    "Inline Mode resolution",
)

# Abyss-specific text is resolved after generic resource/Skybound gates so
# Super Skybound Art effects cannot fire prematurely.
engine = replace_once(
    engine,
    '''  if (/Earth Rite\\s*\\(?\\s*(\\d+)?\\s*\\)?\\s*:/i.test(text)) {
    const amount = Number(text.match(/Earth Rite\\s*\\(?\\s*(\\d+)?/i)?.[1] ?? 1);
    if (ctx.player.earthSigils < amount) return { actions: [`Earth Rite ${ctx.player.earthSigils}/${amount}`], applied: false, unresolved: false };
    performEarthRite(ctx.player, amount, actions);
    text = text.replace(/Earth Rite\\s*\\(?\\s*\\d*\\s*\\)?\\s*:/i, "");
  }

  const x = ctx.instance?.x ?? ctx.sourceUnit?.x ?? 0;''',
    '''  if (/Earth Rite\\s*\\(?\\s*(\\d+)?\\s*\\)?\\s*:/i.test(text)) {
    const amount = Number(text.match(/Earth Rite\\s*\\(?\\s*(\\d+)?/i)?.[1] ?? 1);
    if (ctx.player.earthSigils < amount) return { actions: [`Earth Rite ${ctx.player.earthSigils}/${amount}`], applied: false, unresolved: false };
    performEarthRite(ctx.player, amount, actions);
    text = text.replace(/Earth Rite\\s*\\(?\\s*\\d*\\s*\\)?\\s*:/i, "");
  }

  // [[battle-abysscraft-resolve-text]]
  const abysscraft = resolveAbysscraftCardText(text, ctx);
  text = abysscraft.text;
  actions.push(...abysscraft.actions);

  const x = ctx.instance?.x ?? ctx.sourceUnit?.x ?? 0;''',
    "Abyss resolver dispatch",
)

# -----------------------------------------------------------------------------
# Crest lifecycle hooks.
# -----------------------------------------------------------------------------
engine = replace_once(
    engine,
    '''  if (normalized === "dragon's vale elder") return 2;
  // [[battle-runecraft-crest-countdowns]]''',
    '''  if (normalized === "dragon's vale elder") return 2;
  // [[battle-abysscraft-crest-countdowns]]
  if (normalized === "rigor of the nightblossom") return 2;
  if (normalized === "valiant edge") return 2;
  if (normalized === "balto, dusk bounty hunter") return 4;
  if (normalized === "charon, stygian oarswoman") return 2;
  if (normalized === "corruption") return 4;
  if (normalized === "belial, archangel of cunning") return 4;
  // Milteo & Luzen is persistent and intentionally has no Countdown.
  // [[battle-runecraft-crest-countdowns]]''',
    "Abyss Crest countdowns",
)
engine = replace_once(
    engine,
    '''  // [[battle-dragoncraft-entry-events]]
  actions.push(...applyDragoncraftEntryEvents(ctx, unit));

  if ((unit.card?.traits ?? []).some(trait => norm(trait) === "marine")''',
    '''  // [[battle-dragoncraft-entry-events]]
  actions.push(...applyDragoncraftEntryEvents(ctx, unit));
  // [[battle-abysscraft-entry-events]]
  actions.push(...applyAbysscraftEntryEvents(ctx, unit));

  if ((unit.card?.traits ?? []).some(trait => norm(trait) === "marine")''',
    "Abyss entry dispatch",
)
engine = replace_once(
    engine,
    '''  tickCrests(player, opponent, playerIndex, enemyIndex, stats, rng, map, actions);
  // [[battle-forestcraft-crest-turn-start]]''',
    '''  tickCrests(player, opponent, playerIndex, enemyIndex, stats, rng, map, actions);
  // [[battle-abysscraft-crest-turn-start]]
  actions.push(...applyAbysscraftCrestTurnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map));
  // [[battle-forestcraft-crest-turn-start]]''',
    "Abyss Crest turn start",
)
engine = replace_once(
    engine,
    '''    // [[battle-dragoncraft-crest-last-words]]
    if (dragoncraftCrestLastWords(crest, player, opponent, playerIndex, enemyIndex, stats, rng, map, actions)) continue;
    if (norm(crest.name) !== "lapis, shining seraph") continue;''',
    '''    // [[battle-dragoncraft-crest-last-words]]
    if (dragoncraftCrestLastWords(crest, player, opponent, playerIndex, enemyIndex, stats, rng, map, actions)) continue;
    // [[battle-abysscraft-crest-last-words]]
    if (abysscraftCrestLastWords(crest, player, opponent, playerIndex, enemyIndex, stats, rng, map, actions)) continue;
    if (norm(crest.name) !== "lapis, shining seraph") continue;''',
    "Abyss Crest Last Words dispatch",
)
engine = replace_once(
    engine,
    '''  // [[battle-dragoncraft-crest-turn-end]]
  actions.push(...applyDragoncraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map));
  for (const crest of player.crests ?? []) {''',
    '''  // [[battle-dragoncraft-crest-turn-end]]
  actions.push(...applyDragoncraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map));
  // [[battle-abysscraft-crest-turn-end]]
  actions.push(...applyAbysscraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map));
  for (const crest of player.crests ?? []) {''',
    "Abyss Crest turn end",
)

# -----------------------------------------------------------------------------
# Super-Evolution reactions (Vuella) on manual and ability-driven paths.
# -----------------------------------------------------------------------------
engine = replace_once(
    engine,
    '''  // [[battle-dragoncraft-manual-super-evolve-event]]
  if (superMode) actions.push(...applyDragoncraftSuperEvolveHandTriggers(player, unit));
  // [[battle-forestcraft-manual-evolve-event]]''',
    '''  // [[battle-dragoncraft-manual-super-evolve-event]]
  if (superMode) actions.push(...applyDragoncraftSuperEvolveHandTriggers(player, unit));
  // [[battle-abysscraft-manual-super-evolve-event]]
  if (superMode) actions.push(...applyAbysscraftSuperEvolveTriggers({ player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map }, unit));
  // [[battle-forestcraft-manual-evolve-event]]''',
    "manual Abyss Super-Evolve reaction",
)
engine = replace_once(
    engine,
    '''  // [[battle-dragoncraft-ability-super-evolve-event]]
  actions.push(...applyDragoncraftSuperEvolveHandTriggers(ctx.player, unit));
  actions.push(`super-evolve ${unit.name}`);''',
    '''  // [[battle-dragoncraft-ability-super-evolve-event]]
  actions.push(...applyDragoncraftSuperEvolveHandTriggers(ctx.player, unit));
  // [[battle-abysscraft-ability-super-evolve-event]]
  actions.push(...applyAbysscraftSuperEvolveTriggers(ctx, unit));
  actions.push(`super-evolve ${unit.name}`);''',
    "ability Abyss Super-Evolve reaction",
)

# -----------------------------------------------------------------------------
# Skeleton-destruction reactions (Lifestealer) must see deaths from both normal
# cleanup and explicit destroy-object paths.
# -----------------------------------------------------------------------------
engine = replace_once(
    engine,
    '''      actions.push(...applyFollowerDestroyedEffects(effectContextBare({ player, opponent, playerIndex, enemyIndex, stats }), unit));
      const lastWords = getUnitTriggeredText(unit, "lastWords");''',
    '''      actions.push(...applyFollowerDestroyedEffects(effectContextBare({ player, opponent, playerIndex, enemyIndex, stats }), unit));
      actions.push(...applyAbysscraftFollowerDestroyedEvents(player, opponent, playerIndex, enemyIndex, stats, unit));
      const lastWords = getUnitTriggeredText(unit, "lastWords");''',
    "Abyss normal destroyed event",
)
engine = replace_once(
    engine,
    '''    applyFollowerDestroyedEffects(effectContextBare({ player, opponent, playerIndex, enemyIndex, stats }), unit);
  }
  if (!lastWordsEnabled) return [];''',
    '''    applyFollowerDestroyedEffects(effectContextBare({ player, opponent, playerIndex, enemyIndex, stats }), unit);
    applyAbysscraftFollowerDestroyedEvents(player, opponent, playerIndex, enemyIndex, stats, unit);
  }
  if (!lastWordsEnabled) return [];''',
    "Abyss explicit destroyed event",
)

# -----------------------------------------------------------------------------
# Core Abysscraft rules.
# -----------------------------------------------------------------------------
abyss_rules = r'''

// [[battle-abysscraft-full-rules]]
function recordAbyssModeSelection(player, selectedModeCount) {
  if (!player?.abyssFaithActive || Number(selectedModeCount) <= 0) return [];
  player.faith = (Number(player.faith) || 0) + 1;
  return [`Abyss Faith +1 (${player.faith})`];
}

function isDepartedFollower(unit) {
  return unit?.type === "Follower" && hasU(unit, "Departed");
}

function applyAbysscraftEntryEvents(ctx, unit) {
  const actions = [];
  if (!isDepartedFollower(unit)) return actions;
  for (const source of ctx.player.board.filter(source => source.type === "Follower" && source !== unit)) {
    const name = norm(source.name);
    if (name === "mukan, shadowcrypt ward") {
      giveKeyword(unit, "Bane");
      actions.push(`Mukan: ${unit.name} gains Bane`);
    }
    if (name === "charon, stygian oarswoman") {
      giveKeyword(unit, "Ward");
      actions.push(`Charon: ${unit.name} gains Ward`);
    }
    if (name === "beastmaster bones") {
      giveKeyword(unit, "Storm");
      actions.push(`Beastmaster Bones: ${unit.name} gains Storm`);
    }
    if (name === "macmillan, reaper of ceremonies" && ctx.player.isActive) {
      unit.attack += 1;
      giveKeyword(unit, "Rush");
      giveKeyword(unit, "Ward");
      const dealt = damageLeader(ctx.opponent, 1);
      ctx.stats.damageDealt[ctx.playerIndex] += dealt;
      actions.push(`Macmillan: ${unit.name} +1/+0, Rush, Ward · ${dealt} damage to enemy leader`);
    }
  }
  return uniq(actions);
}

function applyAbysscraftSuperEvolveTriggers(ctx, evolvedUnit) {
  const actions = [];
  if (!evolvedUnit?.superEvolved) return actions;
  for (const source of ctx.player.board.filter(unit => unit.type === "Follower" && unit !== evolvedUnit && norm(unit.name) === "vuella, the blastwing")) {
    source.attack += 2;
    evolvedUnit.attack += 2;
    actions.push(`Vuella: +2/+0 ${source.name} and ${evolvedUnit.name}`);
  }
  return actions;
}

function applyAbysscraftFollowerDestroyedEvents(owner, opponent, ownerIndex, opponentIndex, stats, destroyedUnit) {
  if (!destroyedUnit || norm(destroyedUnit.name) !== "skeleton") return [];
  const actions = [];
  for (const side of [
    { player: owner, index: ownerIndex, label: "owner" },
    { player: opponent, index: opponentIndex, label: "opponent" }
  ]) {
    for (const source of side.player.board.filter(unit => unit.type === "Follower" && norm(unit.name) === "lifestealer")) {
      const healed = healPlayer(side.player, 1, stats, side.index);
      actions.push(`Lifestealer (${side.label}): restore ${healed} leader defense`);
      if (healed) actions.push(...afterLeaderHeal(side.player, healed, stats, side.index));
    }
  }
  return actions;
}

function applyAbysscraftCrestTurnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const actions = [];
  if (!hasCrest(player, "Charon, Stygian Oarswoman")) return actions;
  const unit = reanimate(player, 3, playerIndex, map, rng);
  if (!unit) return actions;
  actions.push(`Charon Crest: Reanimate ${unit.name}`);
  actions.push(...applyEntryEvents({ player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map }, unit));
  return uniq(actions);
}

function handHasFourSameCost(player) {
  const counts = new Map();
  for (const item of player.hand ?? []) {
    const cost = costOf(item);
    counts.set(cost, (counts.get(cost) ?? 0) + 1);
    if (counts.get(cost) >= 4) return true;
  }
  return false;
}

function applyAbysscraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const actions = [];
  const ctx = { player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map };
  for (const crest of player.crests ?? []) {
    const name = norm(crest.name);
    if (name === "rigor of the nightblossom") {
      const drawn = drawCards(player, 1, stats, playerIndex);
      actions.push(`Rigor Crest: draw ${drawn}`);
      if (handHasFourSameCost(player)) {
        const skeleton = findByName(map, "Skeleton") ?? related(crest.card, map).find(card => norm(card.name) === "skeleton");
        const before = new Set(player.board.map(unit => unit.uid));
        if (skeleton) summonWithEvents(player, skeleton, 1, playerIndex, ctx);
        const unit = player.board.find(unit => !before.has(unit.uid) && norm(unit.name) === "skeleton");
        if (unit) {
          giveKeyword(unit, "Ward");
          actions.push("Rigor Crest: summon Skeleton with Ward");
        }
      }
    }
    if (name === "valiant edge") {
      const target = chooseRandomTarget(opponent.board, rng);
      if (target) {
        damageUnit(target, 2, opponent, player, ctx, actions);
        actions.push(`Valiant Edge Crest: 2 damage to ${target.name}`);
      }
      const healed = healPlayer(player, 1, stats, playerIndex);
      actions.push(`Valiant Edge Crest: restore ${healed} leader defense`);
      if (healed) actions.push(...afterLeaderHeal(player, healed, stats, playerIndex));
    }
    if (name === "balto, dusk bounty hunter") {
      const self = damageLeader(player, 1);
      const enemy = damageLeader(opponent, 1);
      stats.damageDealt[playerIndex] += enemy;
      actions.push(`Balto Crest: ${self} damage to your leader · ${enemy} damage to enemy leader`);
    }
    if (name === "corruption") {
      const self = damageLeader(player, 2);
      actions.push(`Corruption Crest: ${self} damage to your leader`);
    }
  }
  return uniq(actions);
}

function abysscraftCrestLastWords(crest, player, opponent, playerIndex, enemyIndex, stats, rng, map, actions) {
  if (norm(crest?.name) !== "belial, archangel of cunning") return false;
  const dealt = damageLeader(opponent, 20);
  stats.damageDealt[playerIndex] += dealt;
  actions.push(`Belial Crest Last Words: ${dealt} damage to enemy leader`);
  return true;
}

function destroyAbyssCrest(player, name, opponent, playerIndex, enemyIndex, stats, rng, map, actions = []) {
  const wanted = norm(name);
  const crest = (player.crests ?? []).find(item => norm(item.name) === wanted);
  if (!crest) return false;
  player.crests = player.crests.filter(item => item !== crest);
  if (wanted === "belial, archangel of cunning") abysscraftCrestLastWords(crest, player, opponent, playerIndex, enemyIndex, stats, rng, map, actions);
  return true;
}

function advanceAbyssCrest(player, name, amount, opponent, playerIndex, enemyIndex, stats, rng, map, actions = []) {
  const crest = (player.crests ?? []).find(item => norm(item.name) === norm(name));
  if (!crest || !Number.isFinite(crest.countdown)) return false;
  crest.countdown -= Math.max(0, Number(amount) || 0);
  actions.push(`${crest.name} Crest countdown ${Math.max(0, crest.countdown)}`);
  if (crest.countdown <= 0) destroyAbyssCrest(player, name, opponent, playerIndex, enemyIndex, stats, rng, map, actions);
  return true;
}

function transformFollowerInto(owner, target, card) {
  const index = owner.board.findIndex(unit => unit.uid === target.uid);
  if (index < 0 || !card) return null;
  const replacement = boardFollower(instance(owner, card));
  replacement.uid = target.uid;
  replacement.summonedThisTurn = target.summonedThisTurn;
  replacement.attacked = target.attacked;
  replacement.attacksMade = target.attacksMade;
  if (!replacement.summonedThisTurn) {
    replacement.canAttackLeader = !/can't attack followers or leaders/i.test(String(card.text ?? ""));
    replacement.canAttackFollower = replacement.canAttackLeader;
  }
  owner.board[index] = replacement;
  return replacement;
}

function resolveAbysscraftCardText(textValue, ctx) {
  let text = String(textValue ?? "");
  const actions = [];
  const name = norm(ctx.card?.name);

  if (name === "sham-nacha, heir to entwining") {
    const faith = /Reduce your faith'?s value by 10 to give it "Increase the number of Modes you can select by 1\."/i;
    if (faith.test(text)) {
      if ((Number(ctx.player.faith) || 0) >= 10) {
        ctx.player.faith -= 10;
        ctx.player.abyssFaithModeBonus = (Number(ctx.player.abyssFaithModeBonus) || 0) + 1;
        actions.push(`Sham-Nacha: Faith -10 · Mode selections +1`);
      } else actions.push(`Sham-Nacha: Faith ${ctx.player.faith}/10`);
      text = text.replace(faith, " ");
    }
    const copyRemoval = /Select an enemy follower on the field, destroy it, and add a copy of it to your hand\.?/i;
    if (copyRemoval.test(text)) {
      const target = choosePlannedTarget(ctx, ctx.opponent.board);
      if (target) {
        const copied = addHand(ctx.player, target.card, 1, ctx.playerIndex, ctx.stats);
        if (copied) ctx.stats.cardsGenerated[ctx.playerIndex] += copied;
        destroyUnit(ctx.opponent, target);
        actions.push(`Sham-Nacha: destroy ${target.name} and add a copy`);
        actions.push(...cleanup(ctx.opponent, ctx.player, ctx.enemyIndex, ctx.playerIndex, ctx.stats, ctx.rng, ctx.cardMap));
      }
      text = text.replace(copyRemoval, " ");
    }
  }

  if (name === "corruption") {
    const base = /Give all followers on the field -2\/-2\.\s*Give yourself and your opponent Crest\s*:\s*Corruption\.?/i;
    if (base.test(text)) {
      for (const unit of ctx.player.board.filter(unit => unit.type === "Follower")) {
        unit.attack -= 2; unit.defense -= 2; unit.maxDefense -= 2;
      }
      for (const unit of ctx.opponent.board.filter(unit => unit.type === "Follower")) {
        unit.attack -= 2; unit.defense -= 2; unit.maxDefense -= 2;
      }
      gainCrest(ctx.player, "Corruption", ctx.card);
      gainCrest(ctx.opponent, "Corruption", ctx.card);
      actions.push("Corruption: all followers -2/-2 · both leaders gain Crest");
      text = text.replace(base, " ");
      actions.push(...cleanup(ctx.player, ctx.opponent, ctx.playerIndex, ctx.enemyIndex, ctx.stats, ctx.rng, ctx.cardMap));
      actions.push(...cleanup(ctx.opponent, ctx.player, ctx.enemyIndex, ctx.playerIndex, ctx.stats, ctx.rng, ctx.cardMap));
    }
    const destroy = /Destroy your Crest\s*:\s*Corruption\.?/i;
    if (destroy.test(text)) {
      if (destroyAbyssCrest(ctx.player, "Corruption", ctx.opponent, ctx.playerIndex, ctx.enemyIndex, ctx.stats, ctx.rng, ctx.cardMap, actions)) actions.push("Corruption: destroy own Crest");
      text = text.replace(destroy, " ");
    }
  }

  if (name === "beastmaster bones") {
    const sacrifice = /Select another allied follower on the field\.\s*If you selected one, destroy it and a random enemy follower\.?/i;
    if (sacrifice.test(text)) {
      const allies = ctx.player.board.filter(unit => unit.type === "Follower" && unit !== ctx.sourceUnit);
      const ally = [...allies].sort((a,b)=>(a.attack+a.defense)-(b.attack+b.defense))[0] ?? null;
      const enemy = chooseRandomTarget(ctx.opponent.board, ctx.rng);
      if (ally) {
        destroyUnit(ctx.player, ally);
        if (enemy) destroyUnit(ctx.opponent, enemy);
        actions.push(`Beastmaster Bones: destroy ${ally.name}${enemy ? ` and ${enemy.name}` : ""}`);
        actions.push(...cleanup(ctx.player, ctx.opponent, ctx.playerIndex, ctx.enemyIndex, ctx.stats, ctx.rng, ctx.cardMap));
        actions.push(...cleanup(ctx.opponent, ctx.player, ctx.enemyIndex, ctx.playerIndex, ctx.stats, ctx.rng, ctx.cardMap));
      }
      text = text.replace(sacrifice, " ");
    }
  }

  if (name === "belial, archangel of cunning") {
    const sweep = /Deal 10 damage to all other followers\.?/i;
    if (sweep.test(text)) {
      for (const unit of ctx.player.board.filter(unit => unit.type === "Follower" && unit !== ctx.sourceUnit)) damageUnit(unit, 10, ctx.player, ctx.opponent, ctx, actions);
      for (const unit of ctx.opponent.board.filter(unit => unit.type === "Follower")) damageUnit(unit, 10, ctx.opponent, ctx.player, ctx, actions);
      actions.push("Belial: 10 damage to all other followers");
      text = text.replace(sweep, " ");
    }
    const advance = /Advance the count of your Crest\s*:\s*Belial, Archangel of Cunning by 1\.?/i;
    if (advance.test(text)) {
      advanceAbyssCrest(ctx.player, "Belial, Archangel of Cunning", 1, ctx.opponent, ctx.playerIndex, ctx.enemyIndex, ctx.stats, ctx.rng, ctx.cardMap, actions);
      text = text.replace(advance, " ");
    }
  }

  if (name === "milteo & luzen") {
    const destroySix = /destroy 6 other random followers\.?/i;
    if (destroySix.test(text)) {
      const candidates = [
        ...ctx.player.board.filter(unit => unit.type === "Follower" && unit !== ctx.sourceUnit).map(unit => ({ owner: ctx.player, unit })),
        ...ctx.opponent.board.filter(unit => unit.type === "Follower").map(unit => ({ owner: ctx.opponent, unit }))
      ];
      let destroyed = 0;
      while (candidates.length && destroyed < 6) {
        const index = Math.floor(ctx.rng() * candidates.length);
        const { owner, unit } = candidates.splice(index, 1)[0];
        if (destroyUnit(owner, unit)) destroyed += 1;
      }
      actions.push(`Milteo & Luzen: destroy ${destroyed} other random follower${destroyed === 1 ? "" : "s"}`);
      actions.push(...cleanup(ctx.player, ctx.opponent, ctx.playerIndex, ctx.enemyIndex, ctx.stats, ctx.rng, ctx.cardMap));
      actions.push(...cleanup(ctx.opponent, ctx.player, ctx.enemyIndex, ctx.playerIndex, ctx.stats, ctx.rng, ctx.cardMap));
      text = text.replace(destroySix, " ");
    }
  }

  if (name === "lifestealer") {
    const transform = /Transform all other followers on the field into copies of Skeleton\.?/i;
    if (transform.test(text)) {
      const skeleton = findByName(ctx.cardMap, "Skeleton") ?? related(ctx.card, ctx.cardMap).find(card => norm(card.name) === "skeleton");
      let changed = 0;
      if (skeleton) {
        for (const unit of [...ctx.player.board].filter(unit => unit.type === "Follower" && unit !== ctx.sourceUnit)) if (transformFollowerInto(ctx.player, unit, skeleton)) changed += 1;
        for (const unit of [...ctx.opponent.board].filter(unit => unit.type === "Follower")) if (transformFollowerInto(ctx.opponent, unit, skeleton)) changed += 1;
      }
      actions.push(`Lifestealer: transform ${changed} other follower${changed === 1 ? "" : "s"} into Skeleton`);
      text = text.replace(transform, " ");
    }
    const sweep = /Deal 1 damage to all other followers\.?/i;
    if (sweep.test(text)) {
      for (const unit of ctx.player.board.filter(unit => unit.type === "Follower" && unit !== ctx.sourceUnit)) damageUnit(unit, 1, ctx.player, ctx.opponent, ctx, actions);
      for (const unit of ctx.opponent.board.filter(unit => unit.type === "Follower")) damageUnit(unit, 1, ctx.opponent, ctx.player, ctx, actions);
      actions.push("Lifestealer: 1 damage to all other followers");
      text = text.replace(sweep, " ");
    }
  }

  return { text: text.replace(/\s+/g, " ").trim(), actions };
}
'''
engine = replace_once(
    engine,
    '''// [[battle-dragoncraft-full-rules]]''',
    abyss_rules + '''\n// [[battle-dragoncraft-full-rules]]''',
    "Abysscraft full rule block",
)

# -----------------------------------------------------------------------------
# Permanent QA primitive exported for the class regression.
# -----------------------------------------------------------------------------
abyss_qa = r'''

// [[battle-abysscraft-full-qa]]
export function inspectAbysscraftFullRules({ cards = [] } = {}) {
  const rawMap = new Map(cards.map(card => [Number(card.id), card]));
  const map = prepareSimulationCardMap(rawMap);
  const byName = name => findByName(map, name);
  const makePair = seed => {
    const rng = createRng(`abysscraft-full-qa:${seed}`);
    const stats = createStats();
    const player = makePlayer("You", [], { style: "midrange" }, map, rng);
    const opponent = makePlayer("Opponent", [], {}, map, rng);
    player.isActive = true;
    opponent.isActive = false;
    player.personalTurn = 7;
    opponent.personalTurn = 6;
    player.maxPp = player.pp = 10;
    opponent.maxPp = opponent.pp = 10;
    return { rng, stats, player, opponent };
  };
  const dummy = (name, cost = 2, attack = 2, defense = 4, className = "Abysscraft", text = "") => ({
    id: -940000 - name.length * 11 - cost, name, class: className, type: "Follower", cost,
    attack, defense, text, keywords: [], traits: [], relatedCards: []
  });
  const ctxOf = q => ({ player: q.player, opponent: q.opponent, playerIndex: 0, enemyIndex: 1, stats: q.stats, rng: q.rng, cardMap: map });

  // Sham-Nacha: Faith pays 10 for a persistent extra Mode selection, and Mode
  // selection itself raises Abyss Faith by one.
  const sham = makePair("sham");
  sham.player.abyssFaithActive = true;
  sham.player.faith = 10;
  const shamCard = byName("Sham-Nacha, Heir to Entwining");
  resolveAbysscraftCardText(baseText(shamCard.text), { ...ctxOf(sham), card: shamCard, sourceUnit: boardFollower(instance(sham.player, shamCard)) });
  const chaos = byName("Chaos Cyclone");
  const chaosInst = instance(sham.player, chaos);
  sham.player.hand = [chaosInst];
  const chaosModes = modes(chaosInst, sham.player);
  const chaosMode = chaosModes[0];
  if (chaosMode) playCard(chaosInst, chaosMode, sham.player, sham.opponent, 0, 1, sham.stats, sham.rng, map);
  const shamFaith = { afterPayment: sham.player.faith, bonus: sham.player.abyssFaithModeBonus, selected: chaosMode?.selectedModeCount ?? 0 };

  const shamCopy = makePair("sham-copy");
  const copyTarget = boardFollower(instance(shamCopy.opponent, dummy("Copy Target", 4, 3, 6, "Neutral")));
  shamCopy.opponent.board = [copyTarget];
  resolveAbysscraftCardText("Select an enemy follower on the field, destroy it, and add a copy of it to your hand.", { ...ctxOf(shamCopy), card: shamCard, sourceUnit: boardFollower(instance(shamCopy.player, shamCard)) });
  const shamSuperCopy = { enemyBoard: shamCopy.opponent.board.length, handName: shamCopy.player.hand[0]?.card?.name ?? null };

  const rigor = makePair("rigor");
  const sameCost = dummy("Same Cost", 2);
  rigor.player.hand = [instance(rigor.player, sameCost), instance(rigor.player, sameCost), instance(rigor.player, sameCost)];
  rigor.player.deck = [instance(rigor.player, sameCost)];
  gainCrest(rigor.player, "Rigor of the Nightblossom", byName("Rigor of the Nightblossom"));
  const rigorCrest = rigor.player.crests[0];
  applyAbysscraftCrestTurnEnd(rigor.player, rigor.opponent, 0, 1, rigor.stats, rigor.rng, map);
  const rigorSkeleton = rigor.player.board.find(unit => norm(unit.name) === "skeleton");
  const rigorResult = { countdown: rigorCrest.countdown, hand: rigor.player.hand.length, skeletonWard: Boolean(rigorSkeleton && hasU(rigorSkeleton, "Ward")) };

  const valiant = makePair("valiant");
  valiant.player.hp = 10;
  const valiantEnemy = boardFollower(instance(valiant.opponent, dummy("Valiant Enemy", 3, 2, 5, "Neutral")));
  valiant.opponent.board = [valiantEnemy];
  gainCrest(valiant.player, "Valiant Edge", byName("Valiant Edge"));
  applyAbysscraftCrestTurnEnd(valiant.player, valiant.opponent, 0, 1, valiant.stats, valiant.rng, map);
  const valiantResult = { enemyDefense: valiantEnemy.defense, hp: valiant.player.hp, countdown: valiant.player.crests[0].countdown };

  const balto = makePair("balto");
  gainCrest(balto.player, "Balto, Dusk Bounty Hunter", byName("Balto, Dusk Bounty Hunter"));
  applyAbysscraftCrestTurnEnd(balto.player, balto.opponent, 0, 1, balto.stats, balto.rng, map);
  const baltoResult = { self: balto.player.hp, enemy: balto.opponent.hp, countdown: balto.player.crests[0].countdown };

  const vuella = makePair("vuella");
  const vuellaUnit = boardFollower(instance(vuella.player, byName("Vuella, the Blastwing")));
  const vuellaTarget = boardFollower(instance(vuella.player, dummy("Super Target", 4, 2, 4)));
  vuella.player.board = [vuellaUnit, vuellaTarget];
  const vuellaBefore = [vuellaUnit.attack, vuellaTarget.attack];
  superEvolveUnitByAbility(ctxOf(vuella), vuellaTarget, []);
  const vuellaBuff = [vuellaUnit.attack - vuellaBefore[0], vuellaTarget.attack - vuellaBefore[1] - 3];

  const departed = makePair("departed");
  const mukan = boardFollower(instance(departed.player, byName("Mukan, Shadowcrypt Ward")));
  const charon = boardFollower(instance(departed.player, byName("Charon, Stygian Oarswoman")));
  const beast = boardFollower(instance(departed.player, byName("Beastmaster Bones")));
  const mac = boardFollower(instance(departed.player, byName("Macmillan, Reaper of Ceremonies")));
  const departedUnit = boardFollower(instance(departed.player, dummy("Departed QA", 3, 2, 4)));
  giveKeyword(departedUnit, "Departed");
  departed.player.board = [mukan, charon, beast, mac, departedUnit];
  const departedBaseAttack = departedUnit.attack;
  applyAbysscraftEntryEvents(ctxOf(departed), departedUnit);
  const departedResult = {
    bane: hasU(departedUnit, "Bane"), ward: hasU(departedUnit, "Ward"), storm: hasU(departedUnit, "Storm"), rush: hasU(departedUnit, "Rush"),
    attackGain: departedUnit.attack - departedBaseAttack, leaderDamage: 20 - departed.opponent.hp
  };

  const charonCrestQa = makePair("charon-crest");
  charonCrestQa.player.destroyedFollowers = [{ card: dummy("Reanimate Three", 3, 3, 3) }];
  gainCrest(charonCrestQa.player, "Charon, Stygian Oarswoman", byName("Charon, Stygian Oarswoman"));
  applyAbysscraftCrestTurnStart(charonCrestQa.player, charonCrestQa.opponent, 0, 1, charonCrestQa.stats, charonCrestQa.rng, map);
  const charonCrestResult = { countdown: charonCrestQa.player.crests[0].countdown, departed: Boolean(charonCrestQa.player.board[0] && hasU(charonCrestQa.player.board[0], "Departed")) };

  const corrupt = makePair("corruption");
  const corruptAlly = boardFollower(instance(corrupt.player, dummy("Corrupt Ally", 2, 3, 4)));
  const corruptEnemy = boardFollower(instance(corrupt.opponent, dummy("Corrupt Enemy", 2, 3, 4, "Neutral")));
  corrupt.player.board = [corruptAlly]; corrupt.opponent.board = [corruptEnemy];
  const corruptionCard = byName("Corruption");
  resolveAbysscraftCardText("Give all followers on the field -2/-2. Give yourself and your opponent Crest: Corruption.", { ...ctxOf(corrupt), card: corruptionCard });
  const corruptionCrests = { own: hasCrest(corrupt.player, "Corruption"), enemy: hasCrest(corrupt.opponent, "Corruption"), allyDefense: corruptAlly.defense, enemyDefense: corruptEnemy.defense };
  applyAbysscraftCrestTurnEnd(corrupt.player, corrupt.opponent, 0, 1, corrupt.stats, corrupt.rng, map);
  const corruptionEndDamage = 20 - corrupt.player.hp;
  destroyAbyssCrest(corrupt.player, "Corruption", corrupt.opponent, 0, 1, corrupt.stats, corrupt.rng, map, []);
  const corruptionDestroyed = !hasCrest(corrupt.player, "Corruption");

  const belial = makePair("belial");
  const belialCard = byName("Belial, Archangel of Cunning");
  gainCrest(belial.player, "Belial, Archangel of Cunning", belialCard);
  resolveAbysscraftCardText("Advance the count of your Crest: Belial, Archangel of Cunning by 1.", { ...ctxOf(belial), card: belialCard, sourceUnit: boardFollower(instance(belial.player, belialCard)) });
  const belialCountdown = belial.player.crests[0]?.countdown ?? null;
  abysscraftCrestLastWords({ name: "Belial, Archangel of Cunning", card: belialCard }, belial.player, belial.opponent, 0, 1, belial.stats, belial.rng, map, []);
  const belialDamage = 20 - belial.opponent.hp;

  const milteo = makePair("milteo");
  gainCrest(milteo.player, "Milteo & Luzen", byName("Milteo & Luzen"));
  const fanfareDummy = dummy("Milteo Play QA", 2, 2, 3, "Abysscraft", "Fanfare: Deal 5 damage to the enemy leader.");
  const milteoInst = instance(milteo.player, fanfareDummy);
  milteo.player.hand = [milteoInst];
  const milteoMode = modes(milteoInst, milteo.player)[0];
  playCard(milteoInst, milteoMode, milteo.player, milteo.opponent, 0, 1, milteo.stats, milteo.rng, map);
  const milteoPlayed = milteo.player.board.find(unit => norm(unit.name) === "milteo play qa");
  const milteoResult = { enemyHp: milteo.opponent.hp, evolved: Boolean(milteoPlayed?.evolved), countdown: milteo.player.crests[0].countdown ?? null };

  const life = makePair("lifestealer");
  life.player.hp = 10;
  const lifestealer = boardFollower(instance(life.player, byName("Lifestealer")));
  life.player.board = [lifestealer];
  const skeletonDead = boardFollower(instance(life.player, byName("Skeleton")));
  applyAbysscraftFollowerDestroyedEvents(life.player, life.opponent, 0, 1, life.stats, skeletonDead);
  const lifestealerHeal = life.player.hp - 10;

  return {
    shamFaith,
    shamSuperCopy,
    rigorResult,
    valiantResult,
    baltoResult,
    vuellaBuff,
    departedResult,
    charonCrestResult,
    corruptionCrests,
    corruptionEndDamage,
    corruptionDestroyed,
    belialCountdown,
    belialDamage,
    milteoResult,
    lifestealerHeal
  };
}
'''
engine = replace_once(
    engine,
    '''// [[battle-dragoncraft-full-qa]]''',
    abyss_qa + '''\n// [[battle-dragoncraft-full-qa]]''',
    "Abysscraft QA block",
)

ENGINE.write_text(engine, encoding="utf-8")
print("Materialized Abysscraft Battle Sim full-class rules.")
