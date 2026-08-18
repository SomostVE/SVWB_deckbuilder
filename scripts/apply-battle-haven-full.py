from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / "js" / "battle-engine-v5.js"
engine = ENGINE.read_text(encoding="utf-8")


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


# Full support is declared only alongside the runtime rules below.
override_anchor = '  ["sinciro, heir to usurpation", "Loot Fuse distinct-name X and replicated Fanfare are modeled"]\n]);'
override_block = '''  ["sinciro, heir to usurpation", "Loot Fuse distinct-name X and replicated Fanfare are modeled"],
  // [[battle-haven-full-overrides]]
  ["supplicant of repose", "Countdown Crest and no-attack end-turn healing are modeled"],
  ["sacred griffon", "Engage-reactive Storm is modeled"],
  ["lapis, shining seraph", "Countdown Crest Last Words resummon with Storm is modeled"]
]);'''
engine = replace_once(engine, override_anchor, override_block, "Haven FULL_OVERRIDES")

# Supplicant needs a reliable per-turn attack flag, including followers that leave
# the field after attacking. Planning clones inherit this property via object spread.
engine = replace_once(
    engine,
    '      p.evolutionActionUsed = false;\n      // Fuse is usable once per turn per current Fuse card.',
    '      p.evolutionActionUsed = false;\n      p.followersAttackedThisTurn = false;\n      // Fuse is usable once per turn per current Fuse card.',
    "real-turn follower attack reset",
)
engine = replace_once(
    engine,
    '  player.evolutionActionUsed = false;\n  for (const item of player.hand) item.fusedThisTurn = false;',
    '  player.evolutionActionUsed = false;\n  player.followersAttackedThisTurn = false;\n  for (const item of player.hand) item.fusedThisTurn = false;',
    "planning-turn follower attack reset",
)

attack_anchor = '''  attacker.attacksMade += 1;
  attacker.attacked = attacker.attacksMade >= attacker.maxAttacks;
  stats.attacks[playerIndex] += 1;'''
attack_replacement = '''  // [[battle-haven-attack-tracking]]
  player.followersAttackedThisTurn = true;
  attacker.attacksMade += 1;
  attacker.attacked = attacker.attacksMade >= attacker.maxAttacks;
  stats.attacks[playerIndex] += 1;'''
if "[[battle-haven-attack-tracking]]" not in engine:
    count = engine.count(attack_anchor)
    if count != 2:
        raise RuntimeError(f"Expected 2 attack tracking anchors, found {count}")
    engine = engine.replace(attack_anchor, attack_replacement)

# Crest durations for the two remaining Havencraft Crest cards.
engine = replace_once(
    engine,
    '  if (normalized === "gildaria, anathema of attunement") return 1;\n  return null;',
    '''  if (normalized === "gildaria, anathema of attunement") return 1;
  // [[battle-haven-crest-countdowns]]
  if (normalized === "supplicant of repose") return 4;
  if (normalized === "lapis, shining seraph") return 2;
  return null;''',
    "Haven Crest countdowns",
)

# Lapis's Crest has Last Words when its Countdown reaches zero. The Crest is
# removed before the summoned Lapis enters, so a later Lapis death can grant a
# fresh Crest normally.
engine = replace_once(
    engine,
    '  tickCrests(player, actions);',
    '  tickCrests(player, opponent, playerIndex, enemyIndex, stats, rng, map, actions);',
    "tickCrests context",
)
old_tick = '''function tickCrests(player, actions) {
  const expired = new Set();
  for (const crest of player.crests ?? []) {
    if (!Number.isFinite(crest.countdown)) continue;
    if ((Number(crest.gainedTurn) || 0) >= player.personalTurn) continue;
    crest.countdown -= 1;
    actions.push(`${crest.name} Crest countdown ${Math.max(0, crest.countdown)}`);
    if (crest.countdown <= 0) expired.add(crest);
  }
  if (expired.size) player.crests = (player.crests ?? []).filter(crest => !expired.has(crest));
}'''
new_tick = '''function tickCrests(player, opponent, playerIndex, enemyIndex, stats, rng, map, actions) {
  const expired = [];
  for (const crest of player.crests ?? []) {
    if (!Number.isFinite(crest.countdown)) continue;
    if ((Number(crest.gainedTurn) || 0) >= player.personalTurn) continue;
    crest.countdown -= 1;
    actions.push(`${crest.name} Crest countdown ${Math.max(0, crest.countdown)}`);
    if (crest.countdown <= 0) expired.push(crest);
  }
  if (!expired.length) return;

  const expiredSet = new Set(expired);
  player.crests = (player.crests ?? []).filter(crest => !expiredSet.has(crest));

  // [[battle-haven-lapis-crest-last-words]]
  for (const crest of expired) {
    if (norm(crest.name) !== "lapis, shining seraph") continue;
    if (player.board.length >= 5) {
      actions.push("Lapis Crest: field full, summon skipped");
      continue;
    }
    const card = crest.card ?? findByName(map, "Lapis, Shining Seraph");
    if (!card) continue;
    const unit = boardFollower(instance(player, card));
    giveKeyword(unit, "Storm");
    player.board.push(unit);
    player.rally += 1;
    actions.push(`Lapis Crest: summon ${unit.name} with Storm`);
    actions.push(...applyEntryEvents({ player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map }, unit));
  }
}'''
engine = replace_once(engine, old_tick, new_tick, "Lapis Crest Last Words")

# Supplicant's Crest heals only when no allied follower attacked during that turn.
crest_turn_end_anchor = '''    if (name === "sandalphon, primarch successor") {'''
crest_turn_end_block = '''    // [[battle-haven-supplicant-crest]]
    if (name === "supplicant of repose" && !player.followersAttackedThisTurn) {
      const healed = healPlayer(player, 1, stats, playerIndex);
      actions.push(`Supplicant Crest: restore ${healed} leader defense${healed ? "" : " (already full)"}`);
      if (healed) actions.push(...afterLeaderHeal(player, healed, stats, playerIndex));
    }
'''
engine = insert_before(engine, crest_turn_end_anchor, crest_turn_end_block, "[[battle-haven-supplicant-crest]]")

# Sacred Griffon reacts to any allied Amulet Engage and immediately becomes able
# to attack that turn through the existing Storm keyword primitive.
score_anchor = '''  let score = 1.5 - item.cost * .15;
  if (/draw/.test(text)) score += player.hand.length >= 8 ? -3 : player.hand.length <= 5 ? 5 : 2;'''
score_replacement = '''  let score = 1.5 - item.cost * .15;
  // [[battle-haven-griffon-engage-ai]]
  const dormantGriffons = player.board.filter(unit => unit.type === "Follower" && norm(unit.name) === "sacred griffon" && !hasU(unit, "Storm"));
  if (dormantGriffons.length) {
    const attack = Math.max(...dormantGriffons.map(unit => Math.max(0, Number(unit.attack) || 0)));
    score += 6 + attack * .8;
    if (!activeWards(opponent.board).length && opponent.hp <= attack) score += 40;
  }
  if (/draw/.test(text)) score += player.hand.length >= 8 ? -3 : player.hand.length <= 5 ? 5 : 2;'''
engine = replace_once(engine, score_anchor, score_replacement, "Sacred Griffon Engage AI value")

old_resolve_engage = '''function resolveEngage(unit, player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const info = engageInfo(unit);
  if (!info) return { actions: [] };
  player.pp -= info.cost;
  stats.ppSpent[playerIndex] += info.cost;
  unit.engagedThisTurn = true;
  return resolveText(info.text, { card: unit.card, sourceUnit: unit, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map });
}'''
new_resolve_engage = '''function resolveEngage(unit, player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const info = engageInfo(unit);
  if (!info) return { actions: [] };
  player.pp -= info.cost;
  stats.ppSpent[playerIndex] += info.cost;
  unit.engagedThisTurn = true;

  // [[battle-haven-griffon-engage]]
  const reactions = [];
  for (const follower of player.board.filter(item => item.type === "Follower" && norm(item.name) === "sacred griffon")) {
    if (hasU(follower, "Storm")) continue;
    giveKeyword(follower, "Storm");
    reactions.push(`Sacred Griffon: gain Storm`);
  }

  const result = resolveText(info.text, { card: unit.card, sourceUnit: unit, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map });
  return { ...result, actions: uniq([...reactions, ...(result.actions ?? [])]) };
}'''
engine = replace_once(engine, old_resolve_engage, new_resolve_engage, "Sacred Griffon Engage trigger")

# Deterministic production-engine QA hook used only by the regression script.
qa_anchor = 'export function inspectEffectiveCost(card, { spellboost = 0, costDelta = 0 } = {}) {'
qa_block = '''// [[battle-haven-full-qa]]
export function inspectHavenFullRules({ supplicant, sacredGriffon, lapis } = {}) {
  const syntheticAmulet = {
    id: -990001,
    name: "QA Engage Amulet",
    class: "Havencraft",
    type: "Amulet",
    cost: 0,
    text: "Engage (0): Restore 1 defense to your leader.",
    keywords: ["Engage"],
    traits: [],
    relatedCards: []
  };
  const cards = [supplicant, sacredGriffon, lapis, syntheticAmulet].filter(Boolean);
  const map = new Map(cards.map(card => [Number(card.id), card]));
  const rng = createRng("haven-full-qa");
  const stats = createStats();
  const player = makePlayer("You", [], { style: "ward-control" }, map, rng);
  const opponent = makePlayer("Opponent", [], { style: "midrange" }, map, rng);
  player.isActive = true;
  opponent.isActive = false;
  player.personalTurn = 5;

  gainCrest(player, "Supplicant of Repose", supplicant);
  const supplicantCrest = player.crests.find(crest => norm(crest.name) === "supplicant of repose");
  player.hp = 10;
  player.followersAttackedThisTurn = false;
  const supplicantActions = applyCrestTurnEnd(player, opponent, 0, 1, stats, rng, map);
  const supplicantHeals = player.hp === 11;
  player.hp = 10;
  player.followersAttackedThisTurn = true;
  applyCrestTurnEnd(player, opponent, 0, 1, stats, rng, map);
  const supplicantBlocksAfterAttack = player.hp === 10;

  player.board = [];
  player.crests = [];
  player.pp = 1;
  const griffon = boardFollower(instance(player, sacredGriffon));
  const amulet = {
    uid: "qa-engage-amulet",
    card: syntheticAmulet,
    cardId: syntheticAmulet.id,
    name: syntheticAmulet.name,
    type: "Amulet",
    countdown: null,
    engagedThisTurn: false
  };
  player.board.push(griffon, amulet);
  const engageResult = resolveEngage(amulet, player, opponent, 0, 1, stats, rng, map);
  const griffonGetsStorm = hasU(griffon, "Storm") && griffon.canAttackLeader;

  player.board = [];
  player.crests = [];
  player.personalTurn = 6;
  gainCrest(player, "Lapis, Shining Seraph", lapis);
  const lapisCrest = player.crests.find(crest => norm(crest.name) === "lapis, shining seraph");
  if (lapisCrest) {
    lapisCrest.countdown = 1;
    lapisCrest.gainedTurn = 5;
  }
  const lapisActions = [];
  tickCrests(player, opponent, 0, 1, stats, rng, map, lapisActions);
  const summonedLapis = player.board.find(unit => norm(unit.name) === "lapis, shining seraph");

  return {
    supplicant: {
      countdown: supplicantCrest?.countdown ?? null,
      healsWithoutAttack: supplicantHeals,
      blocksHealAfterAttack: supplicantBlocksAfterAttack,
      actions: supplicantActions
    },
    sacredGriffon: {
      gainsStormOnEngage: griffonGetsStorm,
      actions: engageResult.actions ?? []
    },
    lapis: {
      countdown: crestCountdown("Lapis, Shining Seraph"),
      summonsWithStorm: Boolean(summonedLapis && hasU(summonedLapis, "Storm")),
      crestRemoved: !hasCrest(player, "Lapis, Shining Seraph"),
      actions: lapisActions
    }
  };
}

'''
engine = insert_before(engine, qa_anchor, qa_block, "[[battle-haven-full-qa]]")

ENGINE.write_text(engine, encoding="utf-8")
print("Remaining Havencraft deck rules materialized.")
