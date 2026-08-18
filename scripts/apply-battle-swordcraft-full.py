from pathlib import Path

ENGINE = Path("js/battle-engine-v5.js")
RULES = Path("js/battle-rules.js")

engine = ENGINE.read_text(encoding="utf-8")
rules = RULES.read_text(encoding="utf-8")


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"Missing marker for {label}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Swordcraft support declarations / handled reactive clauses.
# ---------------------------------------------------------------------------
override_marker = '  ["noble shikigami", "Destroyed-this-turn Shikigami base-stat entry scaling is modeled"]\n]);'
override_block = '''  ["noble shikigami", "Destroyed-this-turn Shikigami base-stat entry scaling is modeled"],
  // [[battle-swordcraft-full-overrides]]
  ["luminous commander", "Officer-entry temporary attack trigger and Evolve summon are modeled"],
  ["majestic conquest", "Countdown Crest, Enhanced-card summon trigger and Enhance delay are modeled"],
  ["bombastic bombardier", "In-hand cost set after allied Super-Evolution is modeled"],
  ["kagemitsu, enduring warrior", "Last Words Countdown Crest, Crest resummon and Super-Evolve Storm are modeled"],
  ["katze, magical thief", "Once-per-turn spell-play random damage and Evolve generation are modeled"],
  ["lyrala, luminous potionwright", "Officer-entry leader healing and Fanfare summon are modeled"],
  ["octrice, hollowness manifest", "Loot play/Fuse Crest advancement and Crest Last Words generation are modeled"],
  ["ancestral crown", "Countdown and allied follower entry buff are modeled"],
  ["luminous magus", "Officer-entry Ward and Fanfare summons are modeled"],
  ["unkei, goldbloom", "Countdown Crest and end-turn Glittering Gold generation are modeled"],
  ["gildaria, anathema of peace", "Pre-entry Rally Super-Evolution, allied-entry board damage and evolve summons are modeled"],
  ["amalia, luxsteel paladin", "Allied-entry attack, Rush and Ward grant is modeled"],
  ["yurius, levin authority", "Enemy-entry attack lock, leader damage/heal and enemy Knight summons are modeled"]
]);'''
engine = replace_once(engine, override_marker, override_block, "Swordcraft full overrides")

reactive_marker = '''  /Whenever an allied follower with Ward is destroyed, give this follower \\+1\\/\\+1\\.?/gi,
  /Whenever this follower is given \\+ attack or defense on the field, restore 1 defense to your leader\\.?/gi
];'''
reactive_block = '''  /Whenever an allied follower with Ward is destroyed, give this follower \\+1\\/\\+1\\.?/gi,
  /Whenever this follower is given \\+ attack or defense on the field, restore 1 defense to your leader\\.?/gi,
  // [[battle-swordcraft-reactive-clauses]]
  /Whenever an allied Officer follower enters the field, give this follower \\+1\\/\\+0 until the end of the turn\\.?/gi,
  /Activates in hand\\. Whenever an allied follower super-evolves, set the cost of this card to 1\\.?/gi,
  /Once on each of your turns, when you play a spell, deal 2 damage to a random enemy follower\\.?/gi,
  /Whenever an allied Officer follower enters the field, restore 1 defense to your leader\\.?/gi,
  /Whenever an allied follower enters the field, give it \\+1\\/\\+1\\.?/gi,
  /Whenever an allied Officer follower enters the field, give it Ward\\.?/gi,
  /Whenever another allied follower enters the field, deal 1 damage to all enemy followers\\.?/gi,
  /Whenever another allied follower enters the field, give it \\+1\\/\\+0, Rush, and Ward\\.?/gi,
  /Whenever an enemy follower enters the field, give it "Can'?t attack followers or leaders" until the end of your opponent'?s turn, deal 1 damage to the enemy leader, and restore 1 defense to your leader\\.?/gi
];'''
engine = replace_once(engine, reactive_marker, reactive_block, "Swordcraft reactive sanitizers")

# ---------------------------------------------------------------------------
# Manual Super-Evolution emits the in-hand Swordcraft event.
# ---------------------------------------------------------------------------
manual_evo_marker = '''  const actions = [];
  const evolveText = getUnitTriggeredText(unit, "evolve");'''
manual_evo_block = '''  const actions = [];
  // [[battle-swordcraft-manual-super-evolve-event]]
  if (superMode) actions.push(...applySwordcraftSuperEvolveHandTriggers(player));
  const evolveText = getUnitTriggeredText(unit, "evolve");'''
engine = replace_once(engine, manual_evo_marker, manual_evo_block, "manual Super-Evolve trigger")

# Preserve Rally before the played follower enters, for Gildaria's official timing.
play_start_marker = '''function playCard(inst, mode, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap, options = {}) {
  player.hand = player.hand.filter(item => item.uid !== inst.uid);'''
play_start_block = '''function playCard(inst, mode, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap, options = {}) {
  // [[battle-swordcraft-pre-entry-rally]]
  const rallyBeforePlay = Number(player.rally) || 0;
  player.hand = player.hand.filter(item => item.uid !== inst.uid);'''
engine = replace_once(engine, play_start_marker, play_start_block, "pre-entry Rally snapshot")

play_loot_marker = '''  // "Whenever you play ..." triggers from the play event itself.
  applyLootPlayedTrigger(player, opponent, card, playerIndex, enemyIndex, stats, rng, cardMap, actions);
  // [[battle-runecraft-play-triggers]]'''
play_loot_block = '''  // "Whenever you play ..." triggers from the play event itself.
  applyLootPlayedTrigger(player, opponent, card, playerIndex, enemyIndex, stats, rng, cardMap, actions);
  // [[battle-swordcraft-loot-play-crest]]
  if (hasTrait(card, "Loot")) applySwordcraftLootCrestEvent(player, opponent, playerIndex, enemyIndex, stats, rng, cardMap, actions, "play");
  // [[battle-runecraft-play-triggers]]'''
engine = replace_once(engine, play_loot_marker, play_loot_block, "Octrice Loot play event")

resolve_ctx_marker = '''    const result = resolveText(mode.text || card.text, { card, instance: inst, sourceUnit: source, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap, targetPlan: options.targetPlan ?? null });'''
resolve_ctx_block = '''    const result = resolveText(mode.text || card.text, { card, instance: inst, sourceUnit: source, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap, targetPlan: options.targetPlan ?? null, rallyBeforePlay });'''
engine = replace_once(engine, resolve_ctx_marker, resolve_ctx_block, "Gildaria play context")

spell_marker = '''    actions.push(...applySpellPlayedEffects(effectContext({ card, instance: inst, sourceUnit: source, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap })));
    if (player.hp > beforeHp) actions.push(...afterLeaderHeal(player, player.hp - beforeHp, stats, playerIndex));
  }

  actions.push(...cleanup(player, opponent, playerIndex, enemyIndex, stats, rng, cardMap), ...cleanup(opponent, player, enemyIndex, playerIndex, stats, rng, cardMap));'''
spell_block = '''    actions.push(...applySpellPlayedEffects(effectContext({ card, instance: inst, sourceUnit: source, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap })));
    if (player.hp > beforeHp) actions.push(...afterLeaderHeal(player, player.hp - beforeHp, stats, playerIndex));
    // [[battle-swordcraft-spell-play-trigger]]
    actions.push(...applySwordcraftSpellPlayedTriggers(player, opponent, playerIndex, enemyIndex, stats, rng, cardMap));
  }

  actions.push(...cleanup(player, opponent, playerIndex, enemyIndex, stats, rng, cardMap), ...cleanup(opponent, player, enemyIndex, playerIndex, stats, rng, cardMap));'''
engine = replace_once(engine, spell_marker, spell_block, "Katze spell trigger")

# Majestic Conquest reacts to any Enhanced card while its Crest exists.
enhance_marker = '''function applyEnhancedCardPlayed(ctx) {
  const actions = [];
  const player = ctx.player;
  if (player.faithActive) {'''
enhance_block = '''function applyEnhancedCardPlayed(ctx) {
  const actions = [];
  const player = ctx.player;
  // [[battle-swordcraft-majestic-enhanced-trigger]]
  if (hasCrest(player, "Majestic Conquest")) {
    const token = findByName(ctx.cardMap, "Fearless Soldier");
    if (token && player.board.length < 5) {
      const before = new Set(player.board.map(unit => unit.uid));
      summonWithEvents(player, token, 1, ctx.playerIndex, ctx);
      const summoned = player.board.find(unit => !before.has(unit.uid) && norm(unit.name) === "fearless soldier");
      if (summoned) {
        ctx.stats.cardsGenerated[ctx.playerIndex] += 1;
        actions.push("Majestic Conquest Crest: summon Fearless Soldier");
      }
    }
  }
  if (player.faithActive) {'''
engine = replace_once(engine, enhance_marker, enhance_block, "Majestic Enhanced trigger")

# Octrice advances once per Fuse event, regardless of how many Loot materials are fused.
fuse_marker = '''  applyFuseReactiveEffects(player, opponent, materials, playerIndex, enemyIndex, stats, rng, cardMap, actions);

  const nextName = projectedFuseTransformName(target, materials);'''
fuse_block = '''  applyFuseReactiveEffects(player, opponent, materials, playerIndex, enemyIndex, stats, rng, cardMap, actions);
  // [[battle-swordcraft-loot-fuse-crest]]
  if (materials.some(item => hasTrait(item.card, "Loot"))) {
    applySwordcraftLootCrestEvent(player, opponent, playerIndex, enemyIndex, stats, rng, cardMap, actions, "Fuse");
  }

  const nextName = projectedFuseTransformName(target, materials);'''
engine = replace_once(engine, fuse_marker, fuse_block, "Octrice Fuse event")

# ---------------------------------------------------------------------------
# Swordcraft-specific state/event helpers.
# ---------------------------------------------------------------------------
runecraft_marker = '''function runecraftCrestLastWords(crest, player, opponent, playerIndex, enemyIndex, stats, rng, map, actions) {'''
sword_helpers = r'''// [[battle-swordcraft-full-rules]]
function applySwordcraftSuperEvolveHandTriggers(player) {
  const actions = [];
  for (const item of player.hand ?? []) {
    if (norm(item.card?.name) !== "bombastic bombardier") continue;
    const base = Math.max(0, Number(item.card?.cost) || 0);
    item.costDelta = 1 - base;
    actions.push("Bombastic Bombardier: cost set to 1");
  }
  return actions;
}

function applySwordcraftSpellPlayedTriggers(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const actions = [];
  const ctx = { player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map };
  for (const source of player.board.filter(unit => unit.type === "Follower" && norm(unit.name) === "katze, magical thief")) {
    if (source.__katzeSpellTriggerTurn === player.personalTurn) continue;
    source.__katzeSpellTriggerTurn = player.personalTurn;
    const targets = opponent.board.filter(unit => unit.type === "Follower");
    if (!targets.length) {
      actions.push("Katze: spell trigger has no enemy follower");
      continue;
    }
    const target = targets[Math.floor(rng() * targets.length)];
    damageUnit(target, 2, opponent, player, ctx, actions);
    actions.push(`Katze: 2 damage to ${target.name}`);
  }
  return actions;
}

function swordcraftCrestLastWords(crest, player, opponent, playerIndex, enemyIndex, stats, rng, map, actions) {
  const name = norm(crest?.name);
  if (name === "kagemitsu, enduring warrior") {
    const card = crest.card ?? findByName(map, "Kagemitsu, Enduring Warrior");
    if (!card || player.board.length >= 5) {
      actions.push("Kagemitsu Crest Last Words: summon skipped");
      return true;
    }
    const unit = boardFollower(instance(player, card));
    player.board.push(unit);
    player.rally += 1;
    stats.cardsGenerated[playerIndex] += 1;
    actions.push("Kagemitsu Crest Last Words: summon Kagemitsu", ...applyEntryEvents({ player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map }, unit));
    return true;
  }
  if (name === "octrice, hollowness manifest") {
    const token = findByName(map, "Remnant of Hollowness") ?? related(crest.card, map).find(card => norm(card.name) === "remnant of hollowness");
    const added = token ? addHand(player, token, 1, playerIndex, stats) : 0;
    if (added) stats.cardsGenerated[playerIndex] += added;
    actions.push(`Octrice Crest Last Words: add ${added ? "Remnant of Hollowness" : "no card"}`);
    return true;
  }
  return false;
}

function applySwordcraftLootCrestEvent(player, opponent, playerIndex, enemyIndex, stats, rng, map, actions, eventName) {
  const crest = (player.crests ?? []).find(item => norm(item.name) === "octrice, hollowness manifest");
  if (!crest || !Number.isFinite(crest.countdown)) return false;
  crest.countdown = Math.max(0, crest.countdown - 1);
  actions.push(`Octrice Crest: ${eventName} advances countdown to ${crest.countdown}`);
  if (crest.countdown > 0) return true;
  player.crests = player.crests.filter(item => item !== crest);
  swordcraftCrestLastWords(crest, player, opponent, playerIndex, enemyIndex, stats, rng, map, actions);
  return true;
}

function applySwordcraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const actions = [];
  for (const crest of player.crests ?? []) {
    if (norm(crest.name) !== "unkei, goldbloom") continue;
    const token = findByName(map, "Glittering Gold") ?? related(crest.card, map).find(card => norm(card.name) === "glittering gold");
    const added = token ? addHand(player, token, 1, playerIndex, stats) : 0;
    if (added) stats.cardsGenerated[playerIndex] += added;
    actions.push(`Unkei Crest: add ${added ? "Glittering Gold" : "no card"}`);
  }
  return actions;
}

function applySwordcraftEnemyEntryEvents(ctx, unit) {
  if (!unit || unit.type !== "Follower") return [];
  const actions = [];
  for (const source of ctx.opponent.board.filter(source => source.type === "Follower" && norm(source.name) === "yurius, levin authority")) {
    unit.yuriusAttackLocked = true;
    unit.canAttackLeader = false;
    unit.canAttackFollower = false;
    const dealt = damageLeader(ctx.player, 1);
    ctx.stats.damageDealt[ctx.enemyIndex] += dealt;
    const healed = healPlayer(ctx.opponent, 1, ctx.stats, ctx.enemyIndex);
    actions.push(`Yurius: lock ${unit.name} · ${dealt} damage to enemy leader · restore ${healed} defense`);
    if (healed) actions.push(...afterLeaderHeal(ctx.opponent, healed, ctx.stats, ctx.enemyIndex));
  }
  return actions;
}

function applySwordcraftTurnStartLocks(player) {
  for (const unit of player.board.filter(unit => unit.type === "Follower" && unit.yuriusAttackLocked)) {
    unit.canAttackLeader = false;
    unit.canAttackFollower = false;
  }
}

function clearSwordcraftTurnLocks(player) {
  for (const unit of player.board.filter(unit => unit.type === "Follower" && unit.yuriusAttackLocked)) {
    unit.yuriusAttackLocked = false;
  }
}

function resolveSwordcraftCardText(textValue, ctx) {
  let text = String(textValue ?? "");
  const actions = [];
  const name = norm(ctx.card?.name);

  if (name === "majestic conquest") {
    const delay = /Delay the count of your Crest\s*:\s*Majestic Conquest by 2\.?/i;
    if (delay.test(text)) {
      if (!hasCrest(ctx.player, "Majestic Conquest")) gainCrest(ctx.player, "Majestic Conquest", ctx.card);
      const crest = ctx.player.crests.find(item => norm(item.name) === "majestic conquest");
      if (crest && Number.isFinite(crest.countdown)) {
        crest.countdown += 2;
        actions.push(`Majestic Conquest: delay Crest countdown to ${crest.countdown}`);
      }
      text = text.replace(delay, " ");
    }
  }

  if (name === "gildaria, anathema of peace") {
    const gated = /Rally\s*\(?\s*20\s*\)?\s*-\s*Super-evolve this follower\.?/i;
    if (gated.test(text)) {
      const rally = Number.isFinite(Number(ctx.rallyBeforePlay)) ? Number(ctx.rallyBeforePlay) : Math.max(0, (Number(ctx.player.rally) || 0) - 1);
      if (rally >= 20 && ctx.sourceUnit) superEvolveUnitByAbility(ctx, ctx.sourceUnit, actions);
      else actions.push(`Rally ${rally}/20`);
      text = text.replace(gated, " ");
    }
  }

  if (name === "yurius, levin authority") {
    const summon = /Summon 2 enemy copies of Knight\.?/i;
    if (summon.test(text)) {
      const token = related(ctx.card, ctx.cardMap).find(card => norm(card.name) === "knight") ?? findByName(ctx.cardMap, "Knight");
      const count = token ? summonWithEvents(ctx.opponent, token, 2, ctx.enemyIndex, ctx) : 0;
      actions.push(`Yurius: summon ${count} enemy Knight${count === 1 ? "" : "s"}`);
      text = text.replace(summon, " ");
    }
  }

  return { text: text.replace(/\s+/g, " ").trim(), actions };
}

'''
engine = replace_once(engine, runecraft_marker, sword_helpers + runecraft_marker, "Swordcraft helper block")

# Swordcraft runs before Runecraft's card-specific resolver.
resolve_text_marker = '''  // [[battle-runecraft-resolve-text]]
  const runecraft = resolveRunecraftCardText(text, ctx);'''
resolve_text_block = '''  // [[battle-swordcraft-resolve-text]]
  const swordcraft = resolveSwordcraftCardText(text, ctx);
  text = swordcraft.text;
  actions.push(...swordcraft.actions);

  // [[battle-runecraft-resolve-text]]
  const runecraft = resolveRunecraftCardText(text, ctx);'''
engine = replace_once(engine, resolve_text_marker, resolve_text_block, "Swordcraft resolveText dispatcher")

# Crest countdowns and last words.
crest_marker = '''  // [[battle-runecraft-crest-countdowns]]
  if (normalized === "pascale's dance") return 1;'''
crest_block = '''  // [[battle-swordcraft-crest-countdowns]]
  if (normalized === "majestic conquest") return 2;
  if (normalized === "kagemitsu, enduring warrior") return 2;
  if (normalized === "octrice, hollowness manifest") return 8;
  if (normalized === "unkei, goldbloom") return 4;
  // [[battle-runecraft-crest-countdowns]]
  if (normalized === "pascale's dance") return 1;'''
engine = replace_once(engine, crest_marker, crest_block, "Swordcraft Crest countdowns")

tick_marker = '''  // [[battle-haven-lapis-crest-last-words]]
  for (const crest of expired) {
    // [[battle-runecraft-crest-last-words]]
    if (runecraftCrestLastWords(crest, player, opponent, playerIndex, enemyIndex, stats, rng, map, actions)) continue;'''
tick_block = '''  // [[battle-haven-lapis-crest-last-words]]
  for (const crest of expired) {
    // [[battle-swordcraft-crest-last-words]]
    if (swordcraftCrestLastWords(crest, player, opponent, playerIndex, enemyIndex, stats, rng, map, actions)) continue;
    // [[battle-runecraft-crest-last-words]]
    if (runecraftCrestLastWords(crest, player, opponent, playerIndex, enemyIndex, stats, rng, map, actions)) continue;'''
engine = replace_once(engine, tick_marker, tick_block, "Swordcraft Crest Last Words")

crest_end_marker = '''function applyCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const actions = [];
  // [[battle-runecraft-crest-turn-end]]'''
crest_end_block = '''function applyCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const actions = [];
  // [[battle-swordcraft-crest-turn-end]]
  actions.push(...applySwordcraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map));
  // [[battle-runecraft-crest-turn-end]]'''
engine = replace_once(engine, crest_end_marker, crest_end_block, "Unkei Crest turn end")

# Enemy entry and Yurius turn-lock lifetime.
entry_marker = '''  // [[battle-runecraft-entry-events]]
  actions.push(...applyRunecraftEntryEvents(ctx, unit));'''
entry_block = '''  // [[battle-swordcraft-enemy-entry-events]]
  actions.push(...applySwordcraftEnemyEntryEvents(ctx, unit));
  // [[battle-runecraft-entry-events]]
  actions.push(...applyRunecraftEntryEvents(ctx, unit));'''
engine = replace_once(engine, entry_marker, entry_block, "Yurius enemy-entry dispatcher")

turn_start_marker = '''function turnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const actions = [];
  for (const unit of player.board) if (unit.type === "Follower") unit.reactedThisTurn = false;

  tickCrests(player, opponent, playerIndex, enemyIndex, stats, rng, map, actions);'''
turn_start_block = '''function turnStart(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const actions = [];
  for (const unit of player.board) if (unit.type === "Follower") unit.reactedThisTurn = false;
  // [[battle-swordcraft-yurius-turn-lock]]
  applySwordcraftTurnStartLocks(player);

  tickCrests(player, opponent, playerIndex, enemyIndex, stats, rng, map, actions);'''
engine = replace_once(engine, turn_start_marker, turn_start_block, "Yurius start-turn lock")

turn_end_marker = '''  restoreTemporaryAttack(player);
  actions.push(...cleanup(player, opponent, playerIndex, enemyIndex, stats, rng, map), ...cleanup(opponent, player, enemyIndex, playerIndex, stats, rng, map));'''
turn_end_block = '''  restoreTemporaryAttack(player);
  // Temporary Commander buffs can also be created during the opponent's turn by summoned Officers.
  restoreTemporaryAttack(opponent);
  // [[battle-swordcraft-yurius-lock-expiry]]
  clearSwordcraftTurnLocks(player);
  actions.push(...cleanup(player, opponent, playerIndex, enemyIndex, stats, rng, map), ...cleanup(opponent, player, enemyIndex, playerIndex, stats, rng, map));'''
engine = replace_once(engine, turn_end_marker, turn_end_block, "Swordcraft temporary effect expiry")

# Keyword/evolution attack readiness must never override Yurius's temporary lock.
give_keyword_marker = '''  if (keyword === "Storm") { unit.canAttackLeader = true; unit.canAttackFollower = true; }
  if (keyword === "Rush") unit.canAttackFollower = true;'''
give_keyword_block = '''  if (keyword === "Storm" && !unit.yuriusAttackLocked) { unit.canAttackLeader = true; unit.canAttackFollower = true; }
  if (keyword === "Rush" && !unit.yuriusAttackLocked) unit.canAttackFollower = true;'''
engine = replace_once(engine, give_keyword_marker, give_keyword_block, "Yurius keyword lock")

manual_lock_marker = '''  unit.canAttackFollower = !/can't attack followers or leaders/i.test(String(unit.card?.text ?? ""));
  if (/can't attack followers or leaders/i.test(String(unit.card?.text ?? ""))) unit.canAttackLeader = false;
  unit.evolved = true;
  unit.superEvolved = superMode;'''
manual_lock_block = '''  unit.canAttackFollower = !unit.yuriusAttackLocked && !/can't attack followers or leaders/i.test(String(unit.card?.text ?? ""));
  if (unit.yuriusAttackLocked || /can't attack followers or leaders/i.test(String(unit.card?.text ?? ""))) unit.canAttackLeader = false;
  unit.evolved = true;
  unit.superEvolved = superMode;'''
engine = replace_once(engine, manual_lock_marker, manual_lock_block, "manual evolution Yurius lock")

ability_lock_marker = '''  unit.canAttackFollower = !/can't attack followers or leaders/i.test(String(unit.card?.text ?? ""));
  if (/can't attack followers or leaders/i.test(String(unit.card?.text ?? ""))) unit.canAttackLeader = false;
  unit.evolved = true;
  ctx.player.evolutionsThisMatch += 1;'''
ability_lock_block = '''  unit.canAttackFollower = !unit.yuriusAttackLocked && !/can't attack followers or leaders/i.test(String(unit.card?.text ?? ""));
  if (unit.yuriusAttackLocked || /can't attack followers or leaders/i.test(String(unit.card?.text ?? ""))) unit.canAttackLeader = false;
  unit.evolved = true;
  ctx.player.evolutionsThisMatch += 1;'''
engine = replace_once(engine, ability_lock_marker, ability_lock_block, "ability evolution Yurius lock")

super_ability_marker = '''  unit.canAttackFollower = !/can't attack followers or leaders/i.test(String(unit.card?.text ?? ""));
  if (/can't attack followers or leaders/i.test(String(unit.card?.text ?? ""))) unit.canAttackLeader = false;
  unit.evolved = true;
  unit.superEvolved = true;'''
super_ability_block = '''  unit.canAttackFollower = !unit.yuriusAttackLocked && !/can't attack followers or leaders/i.test(String(unit.card?.text ?? ""));
  if (unit.yuriusAttackLocked || /can't attack followers or leaders/i.test(String(unit.card?.text ?? ""))) unit.canAttackLeader = false;
  unit.evolved = true;
  unit.superEvolved = true;'''
engine = replace_once(engine, super_ability_marker, super_ability_block, "ability Super-Evolve Yurius lock")

super_event_marker = '''  ctx.stats.superEvolutions[ctx.playerIndex] += 1;
  actions.push(`super-evolve ${unit.name}`);'''
super_event_block = '''  ctx.stats.superEvolutions[ctx.playerIndex] += 1;
  // [[battle-swordcraft-ability-super-evolve-event]]
  actions.push(...applySwordcraftSuperEvolveHandTriggers(ctx.player));
  actions.push(`super-evolve ${unit.name}`);'''
engine = replace_once(engine, super_event_marker, super_event_block, "ability Super-Evolve hand trigger")

# Engine context services used by Swordcraft entry rules.
context_marker = '''    recordHandEvolution: () => recordHandEvolution(ctx.player),
    draw: (player, amount, index) => drawCards(player, amount, ctx.stats, index),
    chooseEnemyFollower: board => choosePlannedTarget(ctx, board),'''
context_block = '''    recordHandEvolution: () => recordHandEvolution(ctx.player),
    draw: (player, amount, index) => drawCards(player, amount, ctx.stats, index),
    // [[battle-swordcraft-entry-context]]
    healPlayer: (player, amount, index = ctx.playerIndex) => healPlayer(player, amount, ctx.stats, index),
    damageEnemyFollower: (unit, amount, actionBuffer = []) => damageUnit(unit, amount, ctx.opponent, ctx.player, ctx, actionBuffer),
    chooseEnemyFollower: board => choosePlannedTarget(ctx, board),'''
engine = replace_once(engine, context_marker, context_block, "Swordcraft entry context services")

# Restore both positive Commander bonuses and existing temporary penalties.
restore_marker = '''function restoreTemporaryAttack(player) { for (const unit of player.board) if (unit.tempAttackPenalty) { unit.attack += unit.tempAttackPenalty; unit.tempAttackPenalty = 0; } }'''
restore_block = '''function restoreTemporaryAttack(player) {
  for (const unit of player.board) {
    if (unit.tempAttackPenalty) { unit.attack += unit.tempAttackPenalty; unit.tempAttackPenalty = 0; }
    if (unit.swordcraftTempAttackBonus) {
      unit.attack = Math.max(0, unit.attack - unit.swordcraftTempAttackBonus);
      unit.swordcraftTempAttackBonus = 0;
    }
  }
}'''
engine = replace_once(engine, restore_marker, restore_block, "temporary Commander attack restore")

# ---------------------------------------------------------------------------
# battle-rules.js allied entry sources.
# ---------------------------------------------------------------------------
entry_loop_marker = '''  for (const source of context.player.board ?? []) {
    if (source === unit || source.type !== "Follower") continue;
    const name = normalize(source.name);'''
entry_loop_block = '''  // [[battle-swordcraft-amulet-entry-rules]]
  for (const source of context.player.board ?? []) {
    if (source.type !== "Amulet" || normalize(source.name) !== "ancestral crown") continue;
    const before = { attack: Number(unit.attack) || 0, defense: Number(unit.defense) || 0 };
    context.buffUnit(unit, 1, 1);
    actions.push(`Ancestral Crown: +1/+1 ${unit.name}`);
    actions.push(...applyBuffedFollowerEffects(context, unit, before));
  }

  for (const source of context.player.board ?? []) {
    if (source === unit || source.type !== "Follower") continue;
    const name = normalize(source.name);'''
rules = replace_once(rules, entry_loop_marker, entry_loop_block, "Ancestral Crown entry rule")

source_marker = '''    if (name === "luminous lancetrooper" && isOfficer) {
      if (giveUnitKeyword(unit, "Rush")) actions.push(`Luminous Lancetrooper: ${unit.name} gains Rush`);
    }
    if (name === "gildaria, anathema of attunement" && context.player.isActive) {'''
source_block = '''    if (name === "luminous lancetrooper" && isOfficer) {
      if (giveUnitKeyword(unit, "Rush")) actions.push(`Luminous Lancetrooper: ${unit.name} gains Rush`);
    }
    // [[battle-swordcraft-allied-entry-rules]]
    if (name === "luminous commander" && isOfficer) {
      source.attack = (Number(source.attack) || 0) + 1;
      source.swordcraftTempAttackBonus = (Number(source.swordcraftTempAttackBonus) || 0) + 1;
      actions.push(`Luminous Commander: +1/+0 until turn end`);
    }
    if (name === "lyrala, luminous potionwright" && isOfficer) {
      const healed = context.healPlayer
        ? context.healPlayer(context.player, 1, context.playerIndex)
        : Math.max(0, Math.min(1, (Number(context.player.maxHp) || 20) - (Number(context.player.hp) || 0)));
      if (!context.healPlayer && healed) context.player.hp += healed;
      actions.push(`Lyrala: restore ${healed} leader defense`);
    }
    if (name === "luminous magus" && isOfficer) {
      if (giveUnitKeyword(unit, "Ward")) actions.push(`Luminous Magus: ${unit.name} gains Ward`);
    }
    if (name === "gildaria, anathema of peace") {
      const buffer = [];
      for (const enemy of context.opponent.board.filter(target => target.type === "Follower")) {
        if (context.damageEnemyFollower) context.damageEnemyFollower(enemy, 1, buffer);
        else enemy.defense -= 1;
      }
      actions.push(`Gildaria, Anathema of Peace: 1 damage to all enemy followers`, ...buffer);
    }
    if (name === "amalia, luxsteel paladin") {
      context.buffUnit(unit, 1, 0);
      giveUnitKeyword(unit, "Rush");
      giveUnitKeyword(unit, "Ward");
      actions.push(`Amalia: +1/+0, Rush, and Ward ${unit.name}`);
    }
    if (name === "gildaria, anathema of attunement" && context.player.isActive) {'''
rules = replace_once(rules, source_marker, source_block, "Swordcraft allied follower entry rules")

# ---------------------------------------------------------------------------
# QA helper: one deterministic assertion surface for all 13 special Sword cards.
# ---------------------------------------------------------------------------
qa_marker = '''export function inspectEffectiveCost(card, { spellboost = 0, costDelta = 0 } = {}) {'''
qa_block = r'''// [[battle-swordcraft-full-qa]]
export function inspectSwordcraftFullRules({ cards = [] } = {}) {
  const map = new Map(cards.map(card => [Number(card.id), card]));
  prepareOriginalCardMap(map);
  const byName = name => findByName(map, name);
  const makePair = seed => {
    const rng = createRng(`swordcraft-full-qa:${seed}`);
    const stats = createStats();
    const player = makePlayer("You", [], {}, map, rng);
    const opponent = makePlayer("Opponent", [], {}, map, rng);
    player.isActive = true;
    opponent.isActive = false;
    player.personalTurn = 6;
    opponent.personalTurn = 5;
    player.maxPp = player.pp = 10;
    opponent.maxPp = opponent.pp = 10;
    return { rng, stats, player, opponent };
  };
  const syntheticFollower = (name, traits = []) => ({ id: -700000 - name.length, name, class: "Swordcraft", type: "Follower", cost: 1, attack: 1, defense: 1, text: "", keywords: [], traits });
  const enterWith = (sourceName, entrant = syntheticFollower("QA Officer", ["Officer"])) => {
    const q = makePair(sourceName);
    const sourceCard = byName(sourceName);
    const source = sourceCard.type === "Amulet" ? boardAmulet(instance(q.player, sourceCard)) : boardFollower(instance(q.player, sourceCard));
    q.player.board.push(source);
    const unit = boardFollower(instance(q.player, entrant));
    q.player.board.push(unit);
    q.player.rally += 1;
    const actions = applyEntryEvents({ player: q.player, opponent: q.opponent, playerIndex: 0, enemyIndex: 1, stats: q.stats, rng: q.rng, cardMap: map }, unit);
    return { ...q, source, unit, actions };
  };

  const commander = enterWith("Luminous Commander");
  const commanderBuff = commander.source.attack - Number(commander.source.card.attack || 0);
  restoreTemporaryAttack(commander.player);
  const commanderRestored = commander.source.attack;

  const lyrala = enterWith("Lyrala, Luminous Potionwright");
  lyrala.player.hp = 10;
  const lyralaUnit = boardFollower(instance(lyrala.player, syntheticFollower("Second QA Officer", ["Officer"])));
  lyrala.player.board.push(lyralaUnit);
  applyEntryEvents({ player: lyrala.player, opponent: lyrala.opponent, playerIndex: 0, enemyIndex: 1, stats: lyrala.stats, rng: lyrala.rng, cardMap: map }, lyralaUnit);
  const lyralaHeal = lyrala.player.hp - 10;

  const magus = enterWith("Luminous Magus");
  const magusWard = hasU(magus.unit, "Ward");

  const crown = enterWith("Ancestral Crown", syntheticFollower("QA Crown Follower"));
  const crownBuff = [crown.unit.attack, crown.unit.defense];

  const amalia = enterWith("Amalia, Luxsteel Paladin", syntheticFollower("QA Amalia Follower"));
  const amaliaEntry = { attack: amalia.unit.attack, rush: hasU(amalia.unit, "Rush"), ward: hasU(amalia.unit, "Ward") };

  const peace = enterWith("Gildaria, Anathema of Peace", syntheticFollower("QA Peace Follower"));
  peace.opponent.board = [
    boardFollower(instance(peace.opponent, syntheticFollower("Peace Enemy A"))),
    boardFollower(instance(peace.opponent, syntheticFollower("Peace Enemy B")))
  ];
  for (const unit of peace.opponent.board) { unit.defense = 2; unit.maxDefense = 2; }
  const peaceEntry = boardFollower(instance(peace.player, syntheticFollower("QA Peace Trigger")));
  peace.player.board.push(peaceEntry);
  applyEntryEvents({ player: peace.player, opponent: peace.opponent, playerIndex: 0, enemyIndex: 1, stats: peace.stats, rng: peace.rng, cardMap: map }, peaceEntry);
  const peaceBoardDefense = peace.opponent.board.map(unit => unit.defense);

  const bomb = makePair("bombardier");
  bomb.player.hand.push(instance(bomb.player, byName("Bombastic Bombardier")));
  applySwordcraftSuperEvolveHandTriggers(bomb.player);
  const bombardierCost = costOf(bomb.player.hand[0]);

  const katze = makePair("katze");
  const katzeUnit = boardFollower(instance(katze.player, byName("Katze, Magical Thief")));
  katze.player.board.push(katzeUnit);
  const katzeEnemy = boardFollower(instance(katze.opponent, syntheticFollower("Katze Enemy")));
  katzeEnemy.defense = 5; katzeEnemy.maxDefense = 5;
  katze.opponent.board.push(katzeEnemy);
  applySwordcraftSpellPlayedTriggers(katze.player, katze.opponent, 0, 1, katze.stats, katze.rng, map);
  applySwordcraftSpellPlayedTriggers(katze.player, katze.opponent, 0, 1, katze.stats, katze.rng, map);
  const katzeDefense = katzeEnemy.defense;

  const majestic = makePair("majestic");
  gainCrest(majestic.player, "Majestic Conquest", byName("Majestic Conquest"));
  const majesticCtx = { card: byName("Majestic Conquest"), player: majestic.player, opponent: majestic.opponent, playerIndex: 0, enemyIndex: 1, stats: majestic.stats, rng: majestic.rng, cardMap: map };
  applyEnhancedCardPlayed(majesticCtx);
  resolveSwordcraftCardText("Delay the count of your Crest: Majestic Conquest by 2.", majesticCtx);
  const majesticResult = {
    countdown: majestic.player.crests.find(crest => norm(crest.name) === "majestic conquest")?.countdown ?? null,
    fearless: majestic.player.board.filter(unit => norm(unit.name) === "fearless soldier").length
  };

  const kage = makePair("kagemitsu");
  gainCrest(kage.player, "Kagemitsu, Enduring Warrior", byName("Kagemitsu, Enduring Warrior"));
  const kageCrest = kage.player.crests.find(crest => norm(crest.name) === "kagemitsu, enduring warrior");
  kageCrest.countdown = 1; kageCrest.gainedTurn = 0;
  tickCrests(kage.player, kage.opponent, 0, 1, kage.stats, kage.rng, map, []);
  const kagemitsuSummoned = kage.player.board.some(unit => norm(unit.name) === "kagemitsu, enduring warrior");

  const octrice = makePair("octrice");
  gainCrest(octrice.player, "Octrice, Hollowness Manifest", byName("Octrice, Hollowness Manifest"));
  octrice.player.hand.push(instance(octrice.player, byName("Sinciro, Heir to Usurpation")));
  octrice.player.hand.push(instance(octrice.player, byName("Gilded Blade")));
  octrice.player.hand.push(instance(octrice.player, byName("Gilded Necklace")));
  const sinciro = octrice.player.hand.find(item => norm(item.card.name) === "sinciro, heir to usurpation");
  const loot = octrice.player.hand.filter(item => ["gilded blade", "gilded necklace"].includes(norm(item.card.name)));
  resolveFuseAction({ target: sinciro, materials: loot }, octrice.player, octrice.opponent, 0, 1, octrice.stats, octrice.rng, map);
  const octriceAfterTwoLootFuse = octrice.player.crests.find(crest => norm(crest.name) === "octrice, hollowness manifest")?.countdown ?? null;
  const octriceCrest = octrice.player.crests.find(crest => norm(crest.name) === "octrice, hollowness manifest");
  if (octriceCrest) octriceCrest.countdown = 1;
  applySwordcraftLootCrestEvent(octrice.player, octrice.opponent, 0, 1, octrice.stats, octrice.rng, map, [], "play");
  const octriceRemnant = octrice.player.hand.filter(item => norm(item.card.name) === "remnant of hollowness").length;

  const unkei = makePair("unkei");
  gainCrest(unkei.player, "Unkei, Goldbloom", byName("Unkei, Goldbloom"));
  applySwordcraftCrestTurnEnd(unkei.player, unkei.opponent, 0, 1, unkei.stats, unkei.rng, map);
  const unkeiGold = unkei.player.hand.filter(item => norm(item.card.name) === "glittering gold").length;

  const gildariaAt19 = makePair("gildaria-19");
  gildariaAt19.player.rally = 19;
  const g19 = instance(gildariaAt19.player, byName("Gildaria, Anathema of Peace"));
  gildariaAt19.player.hand.push(g19);
  playCard(g19, { kind: "base", cost: 6, text: "Rally (20) - Super-evolve this follower." }, gildariaAt19.player, gildariaAt19.opponent, 0, 1, gildariaAt19.stats, gildariaAt19.rng, map);
  const gildaria19Super = Boolean(gildariaAt19.player.board.find(unit => norm(unit.name) === "gildaria, anathema of peace")?.superEvolved);

  const gildariaAt20 = makePair("gildaria-20");
  gildariaAt20.player.rally = 20;
  const g20 = instance(gildariaAt20.player, byName("Gildaria, Anathema of Peace"));
  gildariaAt20.player.hand.push(g20);
  playCard(g20, { kind: "base", cost: 6, text: "Rally (20) - Super-evolve this follower." }, gildariaAt20.player, gildariaAt20.opponent, 0, 1, gildariaAt20.stats, gildariaAt20.rng, map);
  const g20Unit = gildariaAt20.player.board.find(unit => norm(unit.name) === "gildaria, anathema of peace");
  const gildaria20 = {
    superEvolved: Boolean(g20Unit?.superEvolved),
    steelclad: gildariaAt20.player.board.filter(unit => norm(unit.name) === "steelclad knight").length,
    rush: gildariaAt20.player.board.filter(unit => norm(unit.name) === "steelclad knight" && hasU(unit, "Rush")).length
  };

  const yurius = makePair("yurius");
  yurius.player.hp = 10;
  const yuriusUnit = boardFollower(instance(yurius.player, byName("Yurius, Levin Authority")));
  yurius.player.board.push(yuriusUnit);
  const enemyEntry = boardFollower(instance(yurius.opponent, syntheticFollower("Yurius Enemy Entry")));
  yurius.opponent.board.push(enemyEntry);
  applyEntryEvents({ player: yurius.opponent, opponent: yurius.player, playerIndex: 1, enemyIndex: 0, stats: yurius.stats, rng: yurius.rng, cardMap: map }, enemyEntry);
  const yuriusEntry = { locked: Boolean(enemyEntry.yuriusAttackLocked), enemyHp: yurius.opponent.hp, ownerHp: yurius.player.hp };
  applySwordcraftTurnStartLocks(yurius.opponent);
  const yuriusLockedAtStart = !enemyEntry.canAttackLeader && !enemyEntry.canAttackFollower;
  clearSwordcraftTurnLocks(yurius.opponent);

  return {
    commander: { buff: commanderBuff, restoredAttack: commanderRestored },
    lyralaHeal,
    magusWard,
    crownBuff,
    amaliaEntry,
    peaceBoardDefense,
    bombardierCost,
    katzeDefense,
    majesticResult,
    kagemitsuSummoned,
    octriceAfterTwoLootFuse,
    octriceRemnant,
    unkeiGold,
    gildaria19Super,
    gildaria20,
    yuriusEntry,
    yuriusLockedAtStart
  };
}

'''
engine = replace_once(engine, qa_marker, qa_block + qa_marker, "Swordcraft QA helper")

ENGINE.write_text(engine, encoding="utf-8")
RULES.write_text(rules, encoding="utf-8")
print("Materialized Swordcraft Battle Sim full-class rules.")
