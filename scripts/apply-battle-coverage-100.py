from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / "js" / "battle-engine-v5.js"
RULES = ROOT / "js" / "battle-rules.js"
CORE = ROOT / "js" / "battle-rules-core.js"

engine = ENGINE.read_text(encoding="utf-8")
rules = RULES.read_text(encoding="utf-8")
core = CORE.read_text(encoding="utf-8")


def replace_once(source: str, before: str, after: str, label: str) -> str:
    if after in source:
        return source
    if before not in source:
        raise RuntimeError(f"Missing replacement anchor: {label}")
    return source.replace(before, after, 1)


def insert_before(source: str, anchor: str, block: str, marker: str) -> str:
    if marker in source:
        return source
    pos = source.find(anchor)
    if pos < 0:
        raise RuntimeError(f"Missing insert-before anchor for {marker}: {anchor}")
    return source[:pos] + block + source[pos:]


def insert_after(source: str, anchor: str, block: str, marker: str) -> str:
    if marker in source:
        return source
    pos = source.find(anchor)
    if pos < 0:
        raise RuntimeError(f"Missing insert-after anchor for {marker}: {anchor}")
    pos += len(anchor)
    return source[:pos] + block + source[pos:]


# ---------------------------------------------------------------------------
# Cards whose remaining clauses are implemented by this materializer.
# ---------------------------------------------------------------------------
full_anchor = '  ["lu woh, light personified", "Storm-attack reduction Crest and Countdown are modeled"]\n]);'
full_block = '''  ["lu woh, light personified", "Storm-attack reduction Crest and Countdown are modeled"],
  // [[battle-coverage-100-overrides]]
  ["aryll, moonstruck vampire", "Bat-entry Storm and leader self-damage are modeled"],
  ["fiole, devilish matriarch", "Bat-entry Rush is modeled"],
  ["adahime, anathema of death", "Deck summons, Abysscraft-entry Rush and Super-Evolve board buff are modeled"],
  ["ruflet, primeval fairy", "Once-per-turn buff trigger and Last Words are modeled"],
  ["tia, eternal crystalian", "Enhance board buff and once-per-turn buff trigger are modeled"],
  ["krulle, heir to unkilling", "Defense debuff reaction and Countdown Crest are modeled"],
  ["bayle, luxglaive warrior", "Hand cost reduction on allied follower leaving the field is modeled"],
  ["luminous lancetrooper", "Officer-entry Rush is modeled"],
  ["yidmetra, eld sword", "Faith accumulation, Faith payment and persistent Enhance buff are modeled"],
  ["gildaria, anathema of attunement", "Rally evolve, entry Rush, evolve summon and Countdown Crest are modeled"],
  ["mars, conflagrant commander", "Officer-entry buffs and Super-Evolve summon are modeled"],
  ["zooey, ally of the world", "Enhance max-defense and temporary leader damage prevention are modeled"],
  ["galleon, earth personified", "Permanent attack lock and conditional end-turn evolution are modeled"],
  ["sofina, inspiring strength", "Mode evolutions and evolved end-turn board debuff are modeled"],
  ["aether, empyrean guardian", "Differently named deck summons and Super-Evolve Aura distribution are modeled"],
  ["edeth, voice of heaven", "Last Words resummon without Last Words and Super-Evolve destruction are modeled"]
]);'''
engine = replace_once(engine, full_anchor, full_block, "v5 FULL_OVERRIDES")

# ---------------------------------------------------------------------------
# Player state: Faith + a temporary leader damage cap for Zooey.
# ---------------------------------------------------------------------------
engine = replace_once(
    engine,
    '    shadows: 0, rally: 0, earthSigils: 0, crests: [], bonusPpAvailable: false, bonusPpUses: 0,',
    '    shadows: 0, rally: 0, earthSigils: 0, faith: 0, faithActive: false, faithEnhanceBuffs: 0, crests: [], bonusPpAvailable: false, bonusPpUses: 0,\n    leaderDamageCap: null, leaderDamageCapUntilOpponentTurnEnd: false,',
    "player Faith / leader cap state",
)
engine = insert_after(
    engine,
    '    banished: [], destroyedFollowers: [], deckOut: false, isActive: false\n  };',
    '\n  // [[battle-leader-damage-guard-install]]\n  installLeaderDamageGuard(player);',
    "[[battle-leader-damage-guard-install]]",
)
engine = insert_before(
    engine,
    '  shuffle(player.deck, rng);\n  return player;\n}',
    '  // [[battle-faith-initialization]]\n  player.faithActive = player.deck.some(item => norm(item.card?.name) === "yidmetra, eld sword");\n',
    "[[battle-faith-initialization]]",
)
engine = insert_before(
    engine,
    'function instance(player, card) {',
    '''// [[battle-leader-damage-guard]]
function installLeaderDamageGuard(player) {
  let value = Number(player.hp) || 0;
  Object.defineProperty(player, "hp", {
    enumerable: true,
    configurable: true,
    get() { return value; },
    set(nextValue) {
      const next = Number(nextValue);
      if (!Number.isFinite(next)) return;
      if (next < value && Number.isFinite(player.leaderDamageCap)) {
        const requestedLoss = value - next;
        value -= Math.min(requestedLoss, Math.max(0, Number(player.leaderDamageCap) || 0));
        return;
      }
      value = next;
    }
  });
}

''',
    "[[battle-leader-damage-guard]]",
)

# ---------------------------------------------------------------------------
# Enhanced-card lifecycle / Faith.
# ---------------------------------------------------------------------------
engine = replace_once(
    engine,
    'out.push({ kind: choice.i ? "mode" : "enhance", cost, text: choice.text, modeIndex: choice.i, scoreBonus: 5 });',
    'out.push({ kind: choice.i ? "mode" : "enhance", cost, text: choice.text, modeIndex: choice.i, scoreBonus: 5, enhanced: true });',
    "enhance mode marker",
)
engine = insert_before(
    engine,
    '  if (mode.kind !== "crystallize") {\n    const result = resolveText(mode.text || card.text, { card, instance: inst, sourceUnit: source, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap });',
    '''  // [[battle-enhance-play-event]]
  if (mode.enhanced || mode.kind === "enhance") {
    actions.push(...applyEnhancedCardPlayed({ card, instance: inst, sourceUnit: source, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap }));
  }

''',
    "[[battle-enhance-play-event]]",
)
engine = insert_before(
    engine,
    'function boardFollower(inst) {',
    '''// [[battle-enhance-play-helper]]
function applyEnhancedCardPlayed(ctx) {
  const actions = [];
  const player = ctx.player;
  if (player.faithActive) {
    player.faith += 1;
    actions.push(`Faith +1 (${player.faith})`);
  }
  const stacks = Math.max(0, Number(player.faithEnhanceBuffs) || 0);
  if (!stacks) return actions;
  const context = effectContext(ctx);
  for (const unit of player.board.filter(unit => unit.type === "Follower")) {
    const before = { attack: unit.attack, defense: unit.defense };
    context.buffUnit(unit, stacks, stacks);
    actions.push(`Faith: +${stacks}/+${stacks} ${unit.name}`);
    if ((Number(unit.attack) || 0) <= before.attack && (Number(unit.defense) || 0) <= before.defense) continue;
  }
  return uniq(actions);
}

''',
    "[[battle-enhance-play-helper]]",
)

# ---------------------------------------------------------------------------
# Galleon permanent attack lock survives refresh and both evolve paths.
# ---------------------------------------------------------------------------
engine = replace_once(
    engine,
    '      unit.canAttackLeader = true;\n      unit.canAttackFollower = true;',
    '''      const permanentlyLocked = /can't attack followers or leaders/i.test(String(unit.card?.text ?? ""));
      unit.canAttackLeader = !permanentlyLocked;
      unit.canAttackFollower = !permanentlyLocked;''',
    "readyBoard permanent attack lock",
)
engine = replace_once(
    engine,
    '  unit.canAttackFollower = true;\n  unit.evolved = true;\n  unit.superEvolved = superMode;',
    '''  unit.canAttackFollower = !/can't attack followers or leaders/i.test(String(unit.card?.text ?? ""));
  if (/can't attack followers or leaders/i.test(String(unit.card?.text ?? ""))) unit.canAttackLeader = false;
  unit.evolved = true;
  unit.superEvolved = superMode;''',
    "manual evolve permanent attack lock",
)
engine = replace_once(
    engine,
    '  unit.canAttackFollower = true;\n  unit.evolved = true;\n  ctx.player.evolutionsThisMatch += 1;',
    '''  unit.canAttackFollower = !/can't attack followers or leaders/i.test(String(unit.card?.text ?? ""));
  if (/can't attack followers or leaders/i.test(String(unit.card?.text ?? ""))) unit.canAttackLeader = false;
  unit.evolved = true;
  ctx.player.evolutionsThisMatch += 1;''',
    "ability evolve permanent attack lock",
)
engine = replace_once(
    engine,
    '  unit.canAttackFollower = true;\n  unit.evolved = true;\n  unit.superEvolved = true;',
    '''  unit.canAttackFollower = !/can't attack followers or leaders/i.test(String(unit.card?.text ?? ""));
  if (/can't attack followers or leaders/i.test(String(unit.card?.text ?? ""))) unit.canAttackLeader = false;
  unit.evolved = true;
  unit.superEvolved = true;''',
    "ability super-evolve permanent attack lock",
)

# Additional persistent Crest countdowns.
engine = replace_once(
    engine,
    '  if (normalized === "lu woh, light personified") return 2;\n  return null;',
    '  if (normalized === "lu woh, light personified") return 2;\n  if (normalized === "krulle, heir to unkilling") return 2;\n  if (normalized === "gildaria, anathema of attunement") return 1;\n  return null;',
    "additional Crest countdowns",
)

# Zooey protection ends after her opponent finishes that turn.
engine = insert_before(
    engine,
    '  return actions;\n}\n\nfunction applyCrestTurnEnd',
    '''  // [[battle-leader-cap-expiry]]
  if (opponent.leaderDamageCapUntilOpponentTurnEnd) {
    opponent.leaderDamageCap = null;
    opponent.leaderDamageCapUntilOpponentTurnEnd = false;
    actions.push("Leader damage prevention expired");
  }
''',
    "[[battle-leader-cap-expiry]]",
)

# ---------------------------------------------------------------------------
# Bayle's in-hand cost reduction whenever an allied follower leaves the field.
# ---------------------------------------------------------------------------
engine = insert_before(
    engine,
    'function cleanup(player, opponent, playerIndex, enemyIndex, stats, rng, map) {',
    '''// [[battle-follower-leaves-field]]
function notifyFollowerLeavesField(player, unit) {
  if (!unit || unit.type !== "Follower") return;
  for (const item of player.hand ?? []) {
    if (norm(item.card?.name) !== "bayle, luxglaive warrior") continue;
    item.costDelta = (Number(item.costDelta) || 0) - 1;
  }
}

''',
    "[[battle-follower-leaves-field]]",
)
engine = insert_before(
    engine,
    '      player.board = player.board.filter(item => item.uid !== unit.uid);',
    '      // [[battle-cleanup-leave-hook]]\n      notifyFollowerLeavesField(player, unit);\n',
    "[[battle-cleanup-leave-hook]]",
)
engine = insert_before(
    engine,
    '  player.board = player.board.filter(item => item.uid !== unit.uid);\n  toCemetery(player, { uid: unit.uid, card: unit.card }, true);\n  if (unit.type === "Follower") {',
    '  // [[battle-destroy-object-leave-hook]]\n  if (unit.type === "Follower") notifyFollowerLeavesField(player, unit);\n',
    "[[battle-destroy-object-leave-hook]]",
)
engine = replace_once(
    engine,
    'function banish(player, unit) { if (unit.superEvolved && player.isActive) return false; player.board = player.board.filter(item => item.uid !== unit.uid); player.banished.push({ uid: unit.uid, card: unit.card }); return true; }',
    'function banish(player, unit) { if (unit.superEvolved && player.isActive) return false; if (unit.type === "Follower") notifyFollowerLeavesField(player, unit); player.board = player.board.filter(item => item.uid !== unit.uid); player.banished.push({ uid: unit.uid, card: unit.card }); return true; }',
    "banish leave hook",
)
engine = replace_once(
    engine,
    'function bounce(player, unit) { player.board = player.board.filter(item => item.uid !== unit.uid); const item = instance(player, unit.card);',
    'function bounce(player, unit) { if (unit.type === "Follower") notifyFollowerLeavesField(player, unit); player.board = player.board.filter(item => item.uid !== unit.uid); const item = instance(player, unit.card);',
    "bounce leave hook",
)

# ---------------------------------------------------------------------------
# Engine primitives exposed to the rule layer.
# ---------------------------------------------------------------------------
engine = insert_after(
    engine,
    '    chooseHandFollower: hand => hand.filter(item => item.card.type === "Follower").sort((a,b)=>(Number(b.card.cost)||0)-(Number(a.card.cost)||0))[0] ?? null,',
    '''
    // [[battle-coverage-100-context]]
    gainCrest: (player, name, card) => gainCrest(player, name, card),
    isSuperEvolutionUnlocked: () => ctx.player.personalTurn >= (ctx.player.goingFirst ? 7 : 6),
    evolveRandomUnitByAbility: predicate => {
      const candidates = ctx.player.board.filter(unit => unit.type === "Follower" && !unit.evolved && !unit.superEvolved && (!predicate || predicate(unit)));
      if (!candidates.length) return null;
      const unit = candidates[Math.floor(ctx.rng() * candidates.length)];
      const sideActions = [];
      evolveUnitByAbility(ctx, unit, sideActions);
      if (sideActions.length) ctx.__sideActions?.push?.(...sideActions);
      return unit;
    },
    summonFromDeckDifferentNames: (limit, predicate) => summonFromDeckDifferentNames(ctx, limit, predicate),
    summonWithoutLastWords: card => summonWithoutLastWords(ctx, card),
    setLeaderDamageCap: (player, cap) => {
      player.leaderDamageCap = Math.max(0, Number(cap) || 0);
      player.leaderDamageCapUntilOpponentTurnEnd = true;
    },
    notifyLeaveField: (player, unit) => notifyFollowerLeavesField(player, unit),''',
    "[[battle-coverage-100-context]]",
)
engine = insert_before(
    engine,
    'function addHand(player, card, amount, index, stats) {',
    '''// [[battle-deck-summon-primitives]]
function summonFromDeckDifferentNames(ctx, limit, predicate) {
  const summoned = [];
  const usedNames = new Set();
  while (summoned.length < Number(limit) && ctx.player.board.length < 5) {
    const eligible = ctx.player.deck.filter(item => {
      if (item.card.type !== "Follower") return false;
      if (usedNames.has(norm(item.card.name))) return false;
      return !predicate || predicate(item.card);
    });
    if (!eligible.length) break;
    const chosen = eligible[Math.floor(ctx.rng() * eligible.length)];
    ctx.player.deck = ctx.player.deck.filter(item => item.uid !== chosen.uid);
    usedNames.add(norm(chosen.card.name));
    const unit = boardFollower(chosen);
    ctx.player.board.push(unit);
    ctx.player.rally += 1;
    summoned.push(unit);
    ctx.__sideActions?.push?.(`summon ${unit.name} from deck`, ...applyEntryEvents(ctx, unit));
  }
  return summoned;
}

function summonWithoutLastWords(ctx, card) {
  if (!card || ctx.player.board.length >= 5) return null;
  const inst = instance(ctx.player, card);
  const unit = boardFollower(inst);
  unit.overrideText = String(card.text ?? "")
    .replace(/Last Words\s*:\s*[\s\S]*?(?=\b(?:Super-Evolve|Evolve|Strike|Clash|Fanfare|Enhance|Accelerate|Engage|At the start of your turn|At the end of your turn)\s*:|$)/i, " ")
    .replace(/\s+/g, " ")
    .trim();
  ctx.player.board.push(unit);
  ctx.player.rally += 1;
  ctx.__sideActions?.push?.(`summon ${unit.name} without Last Words`, ...applyEntryEvents(ctx, unit));
  return unit;
}

''',
    "[[battle-deck-summon-primitives]]",
)

# Gildaria's Rally condition must be consumed before the generic Crest parser.
engine = insert_after(
    engine,
    '  if (!text) return { actions, applied: false, unresolved: false };',
    '''

  // [[battle-gildaria-rally]]
  if (norm(ctx.card?.name) === "gildaria, anathema of attunement") {
    const gated = /Rally\s*\(?\s*20\s*\)?\s*-\s*Gain Crest\s*:\s*Gildaria, Anathema of Attunement\.\s*Evolve this follower\.?/i;
    if (gated.test(text)) {
      if (ctx.player.rally >= 20) {
        if (gainCrest(ctx.player, "Gildaria, Anathema of Attunement", ctx.card)) actions.push("Gildaria Crest");
        if (ctx.sourceUnit) evolveUnitByAbility(ctx, ctx.sourceUnit, actions);
      } else actions.push(`Rally ${ctx.player.rally}/20`);
      text = text.replace(gated, " ");
    }
  }''',
    "[[battle-gildaria-rally]]",
)

# Generic leader damage reports actual damage after Zooey's cap.
core = replace_once(
    core,
    '      context.opponent.hp -= amount;\n      context.stats.damageDealt[context.playerIndex] += amount;\n      actions.push(`${amount} leader damage`);',
    '''      const beforeHp = context.opponent.hp;
      context.opponent.hp -= amount;
      const dealt = Math.max(0, beforeHp - context.opponent.hp);
      context.stats.damageDealt[context.playerIndex] += dealt;
      actions.push(`${dealt} leader damage`);''',
    "generic leader damage cap accounting",
)

# Krulle reacts once per own turn to any enemy defense reduction routed through
# the standard buff/debuff primitive.
old_buff = '''    buffUnit: (unit, attack, defense) => {
      const before = { attack: Number(unit.attack) || 0, defense: Number(unit.defense) || 0 };
      unit.attack += Number(attack) || 0;
      unit.defense += Number(defense) || 0;
      unit.maxDefense += Number(defense) || 0;
      const beforeHp = ctx.player.hp;
      const extra = applyBuffedFollowerEffects(effectContextBare(ctx), unit, before);
      if (ctx.player.hp > beforeHp) afterLeaderHeal(ctx.player, ctx.player.hp - beforeHp, ctx.stats, ctx.playerIndex);
      if (extra?.length) ctx.__sideActions?.push?.(...extra);
    },'''
new_buff = '''    buffUnit: (unit, attack, defense) => {
      const before = { attack: Number(unit.attack) || 0, defense: Number(unit.defense) || 0 };
      unit.attack += Number(attack) || 0;
      unit.defense += Number(defense) || 0;
      unit.maxDefense += Number(defense) || 0;
      const beforeHp = ctx.player.hp;
      const extra = applyBuffedFollowerEffects(effectContextBare(ctx), unit, before);
      if (ctx.player.hp > beforeHp) afterLeaderHeal(ctx.player, ctx.player.hp - beforeHp, ctx.stats, ctx.playerIndex);
      if (extra?.length) ctx.__sideActions?.push?.(...extra);

      // [[battle-krulle-defense-reaction]]
      if ((Number(defense) || 0) < 0 && ctx.opponent.board.includes(unit) && ctx.player.isActive) {
        const krulle = ctx.player.board.find(source => source.type === "Follower" && norm(source.name) === "krulle, heir to unkilling");
        if (krulle && krulle.__defenseReactionTurn !== ctx.player.personalTurn) {
          krulle.__defenseReactionTurn = ctx.player.personalTurn;
          const healed = healPlayer(ctx.player, 1, ctx.stats, ctx.playerIndex);
          if (healed) ctx.__sideActions?.push?.(`Krulle: restore ${healed} leader defense`, ...afterLeaderHeal(ctx.player, healed, ctx.stats, ctx.playerIndex));
        }
      }
    },'''
engine = replace_once(engine, old_buff, new_buff, "Krulle generic defense reaction")

# ---------------------------------------------------------------------------
# Rule layer: buff reactions for Ruflet/Tia, Crest/source entry reactions, and
# exact card-specific clauses.
# ---------------------------------------------------------------------------
if "[[battle-buff-reactions-100]]" not in rules:
    start = rules.find('export function applyBuffedFollowerEffects(context, unit, before = null) {')
    end = rules.find('export function applySpellPlayedEffects(context) {', start)
    if start < 0 or end < 0:
        raise RuntimeError("applyBuffedFollowerEffects block not found")
    replacement = '''export function applyBuffedFollowerEffects(context, unit, before = null) {
  // [[battle-buff-reactions-100]]
  if (!unit || unit.type !== "Follower") return [];
  const gainedStats = before == null
    || (Number(unit.attack) || 0) > (Number(before.attack) || 0)
    || (Number(unit.defense) || 0) > (Number(before.defense) || 0);
  if (!gainedStats) return [];

  const actions = [];
  const name = normalize(unit.name);
  if (name === "knight of the holy order") {
    const healed = healLeader(context.player, 1, context.stats, context.playerIndex);
    actions.push(`Knight of the Holy Order: restore ${healed} leader defense`);
  }

  if (!context.player.isActive) return actions;
  const turnKey = Number(context.player.personalTurn) || 0;
  if (unit.__buffReactionTurn === turnKey) return actions;

  if (name === "ruflet, primeval fairy") {
    const token = relatedCardByName(unit.card, "Fairy");
    const count = token ? context.summon(context.player, token, 1, context.playerIndex) : 0;
    if (count) {
      unit.__buffReactionTurn = turnKey;
      context.stats.cardsGenerated[context.playerIndex] += count;
      actions.push("Ruflet: summon Fairy");
    }
  }

  if (name === "tia, eternal crystalian") {
    const token = relatedCardByName(unit.card, "Eve, Blade of Crystalia");
    const count = token ? context.addToHand(context.player, token, 1, context.playerIndex) : 0;
    if (count) {
      unit.__buffReactionTurn = turnKey;
      context.stats.cardsGenerated[context.playerIndex] += count;
      actions.push("Tia: add Eve, Blade of Crystalia");
    }
  }

  return actions;
}

'''
    rules = rules[:start] + replacement + rules[end:]

# Insert entry-Crest effects specifically in applyEntryCrestEffects.
entry_start = rules.find('export function applyEntryCrestEffects(context, unit) {')
entry_end = rules.find('export function applyFollowerDestroyedEffects', entry_start)
if entry_start < 0 or entry_end < 0:
    raise RuntimeError("applyEntryCrestEffects section not found")
entry = rules[entry_start:entry_end]
if "[[battle-entry-crests-100]]" not in entry:
    anchor = '    const name = normalize(crest.name);'
    if anchor not in entry:
        raise RuntimeError("entry Crest loop anchor missing")
    entry = entry.replace(anchor, anchor + '''

    // [[battle-entry-crests-100]]
    if (name === "krulle, heir to unkilling") {
      context.buffUnit(unit, -1, -1);
      actions.push(`Krulle Crest: -1/-1 ${unit.name}`);
    }
    if (name === "gildaria, anathema of attunement" && context.player.isActive) {
      const beforeHp = context.opponent.hp;
      context.opponent.hp -= 1;
      const dealt = Math.max(0, beforeHp - context.opponent.hp);
      if (dealt) context.stats.damageDealt[context.playerIndex] += dealt;
      actions.push(`Gildaria Crest: ${dealt} damage to enemy leader`);
    }''', 1)
if "[[battle-entry-source-rules-100]]" not in entry:
    anchor = '    const name = normalize(source.name);'
    if anchor not in entry:
        raise RuntimeError("entry source loop anchor missing")
    entry = entry.replace(anchor, anchor + '''

    // [[battle-entry-source-rules-100]]
    const unitTraits = new Set([...(unit.card?.traits ?? []), ...(unit.card?.keywords ?? [])].map(normalize));
    const isBat = normalize(unit.name) === "bat" || unitTraits.has("bat");
    const isOfficer = unitTraits.has("officer");
    const isAbysscraft = normalize(unit.card?.class) === "abysscraft";

    if (name === "aryll, moonstruck vampire" && isBat) {
      giveUnitKeyword(unit, "Storm");
      const beforeHp = context.player.hp;
      context.player.hp -= 1;
      actions.push(`Aryll: ${unit.name} gains Storm · ${Math.max(0, beforeHp - context.player.hp)} self damage`);
    }
    if (name === "fiole, devilish matriarch" && isBat) {
      if (giveUnitKeyword(unit, "Rush")) actions.push(`Fiole: ${unit.name} gains Rush`);
    }
    if (name === "adahime, anathema of death" && isAbysscraft) {
      if (giveUnitKeyword(unit, "Rush")) actions.push(`Adahime: ${unit.name} gains Rush`);
    }
    if (name === "luminous lancetrooper" && isOfficer) {
      if (giveUnitKeyword(unit, "Rush")) actions.push(`Luminous Lancetrooper: ${unit.name} gains Rush`);
    }
    if (name === "gildaria, anathema of attunement" && context.player.isActive) {
      if (giveUnitKeyword(unit, "Rush")) actions.push(`Gildaria: ${unit.name} gains Rush`);
    }
    if (name === "mars, conflagrant commander" && isOfficer) {
      context.buffUnit(unit, 2, 0);
      giveUnitKeyword(unit, "Rush");
      context.buffUnit(source, 1, 0);
      actions.push(`Mars: +2/+0 and Rush ${unit.name} · +1/+0 Mars`);
    }''', 1)
rules = rules[:entry_start] + entry + rules[entry_end:]

# A transformed follower has left the field for Bayle.
rules = insert_before(
    rules,
    '  selected.owner.board.splice(index, 1, replacement);',
    '  // [[battle-transform-leave-hook]]\n  context.notifyLeaveField?.(selected.owner, selected.unit);\n',
    "[[battle-transform-leave-hook]]",
)

# Exact clauses inserted before existing Freerunning exact handling.
rules = insert_before(
    rules,
    '  if (cardName === "freerunning" && artifactEntryCount(context.player) >= 3) {',
    '''  // [[battle-coverage-100-card-rules]]
  if (cardName === "adahime, anathema of death") {
    const summonDeck = /summon 2 random differently named Abysscraft followers that cost 2 or less from your deck\.?/i;
    if (summonDeck.test(text)) {
      const summoned = context.summonFromDeckDifferentNames?.(2, card => normalize(card.class) === "abysscraft" && Number(card.cost) <= 2) ?? [];
      actions.push(`Adahime: summon ${summoned.length} from deck`);
      text = text.replace(summonDeck, " ");
      applied = true;
    }
    const superBuff = /give all other allied Abysscraft followers on the field \+2\/\+2\.?/i;
    if (superBuff.test(text)) {
      const targets = context.player.board.filter(unit => unit.type === "Follower" && unit !== context.sourceUnit && normalize(unit.card?.class) === "abysscraft");
      for (const target of targets) context.buffUnit(target, 2, 2);
      actions.push(`Adahime: +2/+2 to ${targets.length} Abysscraft follower${targets.length === 1 ? "" : "s"}`);
      text = text.replace(superBuff, " ");
      applied = true;
    }
  }

  if (cardName === "krulle, heir to unkilling") {
    const debuff = /give all enemy followers on the field -0\/-2\.?/i;
    if (debuff.test(text)) {
      const targets = context.opponent.board.filter(unit => unit.type === "Follower");
      for (const target of targets) context.buffUnit(target, 0, -2);
      actions.push(`Krulle: -0/-2 to ${targets.length} enemy follower${targets.length === 1 ? "" : "s"}`);
      text = text.replace(debuff, " ");
      applied = true;
    }
  }

  if (cardName === "bayle, luxglaive warrior") {
    const targeted = /select an enemy follower on the field and deal it 4 damage\.?/i;
    if (targeted.test(text)) {
      const target = context.chooseEnemyFollower?.(context.opponent.board) ?? null;
      if (target) {
        target.defense -= 4;
        actions.push(`Bayle: 4 damage to ${target.name}`);
        context.cleanup?.(context.opponent, context.enemyIndex);
      }
      text = text.replace(targeted, " ");
      applied = true;
    }
  }

  if (cardName === "yidmetra, eld sword") {
    const faithEvolve = /reduce your faith'?s value by 5 to give it ["“]Whenever you play an Enhanced card, give all allied followers on the field \+1\/\+1\.["”]/i;
    if (faithEvolve.test(text)) {
      if ((Number(context.player.faith) || 0) >= 5) {
        context.player.faith -= 5;
        context.player.faithEnhanceBuffs = (Number(context.player.faithEnhanceBuffs) || 0) + 1;
        actions.push(`Yidmetra: Faith -5 · Enhance buff ×${context.player.faithEnhanceBuffs}`);
      } else actions.push(`Yidmetra: Faith ${context.player.faith}/5`);
      text = text.replace(faithEvolve, " ");
      applied = true;
    }
  }

  if (cardName === "zooey, ally of the world") {
    const ramp = /gain 1 max play point\.?/i;
    if (ramp.test(text)) {
      const before = context.player.maxPp;
      context.player.maxPp = Math.min(10, before + 1);
      actions.push(`Zooey: +${context.player.maxPp - before} max PP`);
      text = text.replace(ramp, " ");
      applied = true;
    }
    const storm = /give this follower Storm\.?/i;
    if (storm.test(text)) {
      if (context.sourceUnit) giveUnitKeyword(context.sourceUnit, "Storm");
      text = text.replace(storm, " ");
      applied = true;
    }
    const maxDefense = /set your leader'?s max defense to 1\.?/i;
    if (maxDefense.test(text)) {
      context.player.maxHp = 1;
      context.player.hp = Math.min(context.player.hp, 1);
      text = text.replace(maxDefense, " ");
      actions.push("Zooey: leader max defense = 1");
      applied = true;
    }
    const prevent = /give your leader ["“]Can'?t take more than 0 damage at a time["”] until the end of your opponent'?s turn\.?/i;
    if (prevent.test(text)) {
      context.setLeaderDamageCap?.(context.player, 0);
      text = text.replace(prevent, " ");
      actions.push("Zooey: leader damage cap 0");
      applied = true;
    }
  }

  if (cardName === "galleon, earth personified") {
    const lock = /can'?t attack followers or leaders\.?/i;
    if (lock.test(text)) {
      if (context.sourceUnit) { context.sourceUnit.canAttackLeader = false; context.sourceUnit.canAttackFollower = false; }
      text = text.replace(lock, " ");
      applied = true;
    }
    const endEvolve = /if you(?:'|’)ve unlocked super-evolution, evolve a random unevolved allied follower on the field that didn(?:'|’)t attack this turn\.?/i;
    if (endEvolve.test(text)) {
      if (context.isSuperEvolutionUnlocked?.()) {
        const target = context.evolveRandomUnitByAbility?.(unit => !unit.attacked) ?? null;
        if (target) actions.push(`Galleon: evolve ${target.name}`);
      }
      text = text.replace(endEvolve, " ");
      applied = true;
    }
  }

  if (cardName === "sofina, inspiring strength") {
    const evolveSelf = /^evolve this follower\.?$/i;
    if (evolveSelf.test(text.trim())) {
      if (context.sourceUnit) context.evolveUnitByAbility?.(context.sourceUnit);
      text = "";
      actions.push("Sofina: evolve self");
      applied = true;
    }
    const evolveWard = /evolve another random unevolved allied follower with Ward and give it \+1\/\+1\.?/i;
    if (evolveWard.test(text)) {
      const target = context.evolveRandomUnitByAbility?.(unit => unit !== context.sourceUnit && hasKeyword(unit, "Ward")) ?? null;
      if (target) context.buffUnit(target, 1, 1);
      if (target) actions.push(`Sofina: evolve and +1/+1 ${target.name}`);
      text = text.replace(evolveWard, " ");
      applied = true;
    }
    const endDebuff = /if this follower is evolved, give all other followers on the field -1\/-1\.?/i;
    if (endDebuff.test(text)) {
      if (context.sourceUnit?.evolved || context.sourceUnit?.superEvolved) {
        for (const unit of context.player.board.filter(unit => unit.type === "Follower" && unit !== context.sourceUnit)) context.buffUnit(unit, -1, -1);
        for (const unit of context.opponent.board.filter(unit => unit.type === "Follower")) context.buffUnit(unit, -1, -1);
        context.cleanup?.(context.player, context.playerIndex);
        context.cleanup?.(context.opponent, context.enemyIndex);
        actions.push("Sofina: -1/-1 to all other followers");
      }
      text = text.replace(endDebuff, " ");
      applied = true;
    }
  }

  if (cardName === "aether, empyrean guardian") {
    const summonDeck = /summon 3 random differently named followers that cost 3 or less from your deck\.?/i;
    if (summonDeck.test(text)) {
      const summoned = context.summonFromDeckDifferentNames?.(3, card => Number(card.cost) <= 3) ?? [];
      actions.push(`Aether: summon ${summoned.length} from deck`);
      text = text.replace(summonDeck, " ");
      applied = true;
    }
    const superBuff = /give all other allied followers on the field \+0\/\+2 and Aura\.?/i;
    if (superBuff.test(text)) {
      const targets = context.player.board.filter(unit => unit.type === "Follower" && unit !== context.sourceUnit);
      for (const target of targets) { context.buffUnit(target, 0, 2); giveUnitKeyword(target, "Aura"); }
      actions.push(`Aether: +0/+2 and Aura to ${targets.length} follower${targets.length === 1 ? "" : "s"}`);
      text = text.replace(superBuff, " ");
      applied = true;
    }
  }

  if (cardName === "edeth, voice of heaven") {
    const lastWords = /summon an Edeth, Voice of Heaven and remove Last Words from it\.?/i;
    if (lastWords.test(text)) {
      const unit = context.summonWithoutLastWords?.(context.card) ?? null;
      if (unit) actions.push("Edeth: resummon without Last Words");
      text = text.replace(lastWords, " ");
      applied = true;
    }
    const superDestroy = /select an enemy follower on the field and destroy it\.?/i;
    if (superDestroy.test(text)) {
      const target = context.chooseEnemyFollower?.(context.opponent.board) ?? null;
      if (target) { target.defense = 0; context.cleanup?.(context.opponent, context.enemyIndex); actions.push(`Edeth: destroy ${target.name}`); }
      text = text.replace(superDestroy, " ");
      applied = true;
    }
  }

''',
    "[[battle-coverage-100-card-rules]]",
)

ENGINE.write_text(engine, encoding="utf-8")
RULES.write_text(rules, encoding="utf-8")
CORE.write_text(core, encoding="utf-8")
print("Battle Sim 100% coverage rules materialized.")
