from pathlib import Path

ENGINE = Path("js/battle-engine-v5.js")
text = ENGINE.read_text(encoding="utf-8")


def once(old: str, new: str, label: str):
    global text
    if old not in text:
        raise SystemExit(f"Missing anchor: {label}")
    text = text.replace(old, new, 1)


# State needed by generic high-risk mechanics.
once(
    '    leaderDamageCap: null, leaderDamageCapUntilOpponentTurnEnd: false, leaderBarrier: 0,',
    '    leaderDamageCap: null, leaderDamageCapUntilOpponentTurnEnd: false, leaderBarrier: 0, leaderDamageTakenBonus: 0,',
    'leader damage bonus state',
)
once(
    '    banished: [], fusedCards: [], destroyedFollowers: [], deckOut: false, isActive: false,',
    '    banished: [], fusedCards: [], destroyedFollowers: [], destroyedAmulets: [], artifactFollowerNamesEntered: [], deckOut: false, isActive: false,',
    'history state',
)
once(
    '    destroyedFollowers: (source.destroyedFollowers ?? []).map(item => ({ ...item, card: item.card })),\n    crests: (source.crests ?? []).map(crest => ({ ...crest, card: crest.card }))',
    '    destroyedFollowers: (source.destroyedFollowers ?? []).map(item => ({ ...item, card: item.card })),\n    destroyedAmulets: (source.destroyedAmulets ?? []).map(item => ({ ...item, card: item.card })),\n    artifactFollowerNamesEntered: [...(source.artifactFollowerNamesEntered ?? [])],\n    crests: (source.crests ?? []).map(crest => ({ ...crest, card: crest.card }))',
    'planning clone history',
)

# Apply persistent "takes N more damage" in the central HP guard so every damage
# path, including generic effects, combat and class-specific rules, sees it.
once(
    '''      if (next < value && Number.isFinite(player.leaderDamageCap)) {
        const requestedLoss = value - next;
        value -= Math.min(requestedLoss, Math.max(0, Number(player.leaderDamageCap) || 0));
        return;
      }
      value = next;''',
    '''      if (next < value) {
        const requestedLoss = value - next + Math.max(0, Number(player.leaderDamageTakenBonus) || 0);
        if (Number.isFinite(player.leaderDamageCap)) {
          value -= Math.min(requestedLoss, Math.max(0, Number(player.leaderDamageCap) || 0));
          return;
        }
        value -= requestedLoss;
        return;
      }
      value = next;''',
    'leader damage guard bonus',
)

# Artifact history must be real match state rather than a QA-only injected value.
once(
    '''function applyPortalcraftEntryEvents(ctx, unit) {
  const actions = [];
  if (!unit || unit.type !== "Follower") return actions;
''',
    '''function applyPortalcraftEntryEvents(ctx, unit) {
  const actions = [];
  if (!unit || unit.type !== "Follower") return actions;
  // [[battle-high-risk-artifact-history]]
  if ((unit.card?.traits ?? []).some(trait => norm(trait) === "artifact")) {
    ctx.player.artifactFollowerNamesEntered ??= [];
    ctx.player.artifactFollowerNamesEntered.push(norm(unit.name));
  }
''',
    'Artifact entry history',
)

# Destroyed amulets are needed by several Havencraft match-history effects.
once(
    '''function destroyObject(player, opponent, unit, playerIndex, enemyIndex, stats, rng, map, lastWordsEnabled) {
  // [[battle-havencraft-faith-amulet-destroyed]]
  if (unit?.type === "Amulet" && player.havenFaithActive) player.faith = (Number(player.faith) || 0) + 1;''',
    '''function destroyObject(player, opponent, unit, playerIndex, enemyIndex, stats, rng, map, lastWordsEnabled) {
  // [[battle-high-risk-destroyed-amulet-history]]
  if (unit?.type === "Amulet") {
    player.destroyedAmulets ??= [];
    player.destroyedAmulets.push({ card: unit.card });
  }
  // [[battle-havencraft-faith-amulet-destroyed]]
  if (unit?.type === "Amulet" && player.havenFaithActive) player.faith = (Number(player.faith) || 0) + 1;''',
    'destroyed amulet history',
)

# Earth Rite card data uses both ':' and '-' separators.
text = text.replace(
    r'/Earth Rite\s*\(?\s*(\d+)?\s*\)?\s*:/i',
    r'/Earth Rite\s*\(?\s*(\d+)?\s*\)?\s*[-–—:]/i'
)
text = text.replace(
    r'/Earth Rite\s*\(?\s*\d*\s*\)?\s*:/i',
    r'/Earth Rite\s*\(?\s*\d*\s*\)?\s*[-–—:]/i'
)

helpers = r'''
// [[battle-high-risk-generic-foundation]]
function highRiskWordNumber(value, fallback = 1) {
  const map = { a:1, an:1, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10 };
  const key = norm(value);
  return Number.isFinite(Number(value)) ? Number(value) : (map[key] ?? fallback);
}

function highRiskIsArtifact(card) {
  return card?.type === "Follower" && (card.traits ?? []).some(trait => norm(trait) === "artifact");
}

function highRiskCopyInstance(player, source) {
  const card = source?.card ?? source;
  if (!card) return null;
  const copy = instance(player, card);
  if (source?.card) {
    for (const key of ["spellboost", "costDelta", "attackBonus", "defenseBonus", "skyboundEvolutions", "x"]) {
      if (Number.isFinite(Number(source[key]))) copy[key] = Number(source[key]);
    }
    copy.fusedThisTurn = Boolean(source.fusedThisTurn);
    copy.fusedCards = [...(source.fusedCards ?? [])];
    copy.fusedNames = [...(source.fusedNames ?? [])];
  }
  return copy;
}

function highRiskAddCopyToHand(ctx, source, { exact = false, costDelta = 0 } = {}) {
  const item = exact ? highRiskCopyInstance(ctx.player, source) : instance(ctx.player, source?.card ?? source);
  if (!item) return null;
  if (source?.type === "Follower" && source.card) {
    item.attackBonus = (Number(source.attack) || 0) - (Number(source.card.attack) || 0);
    item.defenseBonus = (Number(source.maxDefense ?? source.defense) || 0) - (Number(source.card.defense) || 0);
  }
  item.costDelta = (Number(item.costDelta) || 0) + Number(costDelta || 0);
  if (ctx.player.hand.length >= 9) {
    toCemetery(ctx.player, item, false);
    ctx.stats.cardsBurned[ctx.playerIndex] += 1;
    return null;
  }
  ctx.player.hand.push(item);
  ctx.stats.cardsGenerated[ctx.playerIndex] += 1;
  return item;
}

function highRiskSummonExactFromHand(ctx, source, delayed = false) {
  if (!source?.card || source.card.type !== "Follower" || ctx.player.board.length >= 5) return null;
  const inst = highRiskCopyInstance(ctx.player, source);
  const unit = boardFollower(inst);
  if (delayed) unit.highRiskDestroyAtOpponentTurnEnd = true;
  ctx.player.board.push(unit);
  ctx.player.rally += 1;
  ctx.__sideActions?.push?.(`summon exact copy of ${unit.name}`, ...applyEntryEvents(ctx, unit));
  return unit;
}

function highRiskSummonExactFromUnit(ctx, source, delayed = false) {
  if (!source || source.type !== "Follower" || ctx.player.board.length >= 5) return null;
  const unit = summonExactFollowerCopy(ctx, source, 0);
  if (!unit) return null;
  if (delayed) unit.highRiskDestroyAtOpponentTurnEnd = true;
  ctx.__sideActions?.push?.(...applyEntryEvents(ctx, unit));
  return unit;
}

function highRiskSummonAmulet(ctx, card) {
  if (!card || card.type !== "Amulet" || ctx.player.board.length >= 5) return null;
  const unit = boardAmulet(instance(ctx.player, card));
  ctx.player.board.push(unit);
  return unit;
}

function highRiskHistoryCards(entries, count, predicate, rng, differentNames = true) {
  let pool = (entries ?? []).map(entry => entry.card ?? entry).filter(Boolean).filter(card => !predicate || predicate(card));
  if (differentNames) {
    const seen = new Set();
    pool = pool.filter(card => { const key = norm(card.name); if (seen.has(key)) return false; seen.add(key); return true; });
  }
  const out = [];
  while (out.length < count && pool.length) {
    const index = Math.floor(rng() * pool.length);
    out.push(pool.splice(index, 1)[0]);
  }
  return out;
}

function highRiskDiscardItems(ctx, items, actions) {
  const ids = new Set(items.filter(Boolean).map(item => item.uid));
  const discarded = ctx.player.hand.filter(item => ids.has(item.uid));
  ctx.player.hand = ctx.player.hand.filter(item => !ids.has(item.uid));
  for (const item of discarded) {
    toCemetery(ctx.player, item, false);
    triggerDiscardedCard(ctx, item, actions);
  }
  return discarded.length;
}

function highRiskReplayFanfare(ctx, actions) {
  const depth = Math.max(0, Number(ctx.__highRiskFanfareDepth) || 0);
  if (depth >= 16) {
    ctx.__highRiskNestedUnresolved = true;
    actions.push("Fanfare replay safety limit");
    return false;
  }
  const fanfare = section(ctx.card?.text, "fanfare");
  if (!fanfare) return false;
  const nestedCtx = { ...ctx, __highRiskFanfareDepth: depth + 1 };
  const nested = resolveText(fanfare, nestedCtx);
  actions.push("replicate Fanfare", ...nested.actions);
  if (nested.unresolved || nestedCtx.__highRiskNestedUnresolved) ctx.__highRiskNestedUnresolved = true;
  return true;
}

function highRiskRandomAbilitySegments(raw) {
  const matches = [...String(raw).matchAll(/(?:^|\s)(\d+)\.\s*/g)];
  return matches.map((match, index) => ({
    number: Number(match[1]),
    text: String(raw).slice(match.index + match[0].length, matches[index + 1]?.index ?? String(raw).length).trim()
  })).filter(item => item.text);
}

function highRiskApplyEndOpponentTurnDestruction(owner) {
  for (const unit of owner.board ?? []) {
    if (unit.type === "Follower" && unit.highRiskDestroyAtOpponentTurnEnd) unit.defense = 0;
  }
}

function highRiskRestoreOpponentHandCosts(player) {
  for (const item of player.hand ?? []) {
    const amount = Number(item.highRiskOpponentTempCost) || 0;
    if (!amount) continue;
    item.costDelta = (Number(item.costDelta) || 0) - amount;
    delete item.highRiskOpponentTempCost;
  }
}

function resolveHighRiskGenericText(textValue, ctx) {
  let text = String(textValue ?? "");
  const actions = [];

  // General Fanfare replay used by many Evolve/Super-Evolve/Engage abilities.
  const replicate = /Replicate the effects of this card'?s Fanfare ability\.?/i;
  if (replicate.test(text)) {
    highRiskReplayFanfare(ctx, actions);
    text = text.replace(replicate, " ");
  }
  const activateFanfare = /Activate (?:this card'?s|its) Fanfare ability\.?/i;
  if (activateFanfare.test(text)) {
    highRiskReplayFanfare(ctx, actions);
    text = text.replace(activateFanfare, " ");
  }

  // Random numbered ability lists (Kitty Cunning / Omegotep family).
  const randomAbilities = text.match(/Activate\s+(a|an|one|two|three|four|five|\d+)\s+random abilities? from the following\.\s*([\s\S]*)$/i);
  if (randomAbilities) {
    const count = highRiskWordNumber(randomAbilities[1], 1);
    const pool = highRiskRandomAbilitySegments(randomAbilities[2]);
    const chosen = [];
    while (chosen.length < count && pool.length) chosen.push(pool.splice(Math.floor(ctx.rng() * pool.length), 1)[0]);
    for (const option of chosen) {
      const nested = resolveText(option.text, ctx);
      actions.push(`random ability ${option.number}`, ...nested.actions);
      if (nested.unresolved) ctx.__highRiskNestedUnresolved = true;
    }
    text = text.slice(0, randomAbilities.index).trim();
  }

  // Hand discard / redraw primitives.
  const discardOne = /Select a card in your hand and discard it\.?/i;
  if (discardOne.test(text)) {
    const item = [...ctx.player.hand].sort((a,b) => costOf(a) - costOf(b))[0] ?? null;
    const count = item ? highRiskDiscardItems(ctx, [item], actions) : 0;
    actions.push(`discard ${count} selected card`);
    text = text.replace(discardOne, " ");
  }
  const discardThree = /Select 3 cards in your hand and discard them\.?/i;
  if (discardThree.test(text)) {
    const items = [...ctx.player.hand].slice(0, 3);
    const count = highRiskDiscardItems(ctx, items, actions);
    actions.push(`discard ${count} selected cards`);
    text = text.replace(discardThree, " ");
  }
  const discardHand = /Discard your hand\.?/i;
  if (discardHand.test(text)) {
    const count = highRiskDiscardItems(ctx, [...ctx.player.hand], actions);
    actions.push(`discard hand (${count})`);
    text = text.replace(discardHand, " ");
  }
  const returnAllDrawX = /Return your hand to (?:your )?deck\.\s*Draw X cards\.\s*X is the number of cards you returned\.?/i;
  if (returnAllDrawX.test(text)) {
    const returned = [...ctx.player.hand];
    ctx.player.hand = [];
    ctx.player.deck.push(...returned);
    shuffle(ctx.player.deck, ctx.rng);
    const drawn = drawCards(ctx.player, returned.length, ctx.stats, ctx.playerIndex);
    actions.push(`return hand ${returned.length} · draw ${drawn}`);
    text = text.replace(returnAllDrawX, " ");
  }
  const returnOneDraw = /Select a card in your hand and return it to (?:your )?deck\.\s*Draw a card\.?/i;
  if (returnOneDraw.test(text)) {
    const item = ctx.player.hand[0] ?? null;
    if (item) {
      ctx.player.hand = ctx.player.hand.filter(entry => entry.uid !== item.uid);
      ctx.player.deck.push(item);
      shuffle(ctx.player.deck, ctx.rng);
    }
    const drawn = drawCards(ctx.player, 1, ctx.stats, ctx.playerIndex);
    actions.push(`return selected hand card · draw ${drawn}`);
    text = text.replace(returnOneDraw, " ");
  }

  // Exact-copy / cross-zone primitives.
  const banishEnemySummonCopy = /Select an enemy follower(?: on the field)?(?: with (\d+) attack or less)?, banish it, and summon an exact copy of it\.?/i;
  const banishCopyMatch = text.match(banishEnemySummonCopy);
  if (banishCopyMatch) {
    const limit = banishCopyMatch[1] ? Number(banishCopyMatch[1]) : Infinity;
    const candidates = ctx.opponent.board.filter(unit => unit.type === "Follower" && (Number(unit.attack) || 0) <= limit);
    const target = choosePlannedTarget(ctx, candidates);
    if (target) {
      banish(ctx.opponent, target);
      const copy = highRiskSummonExactFromUnit(ctx, target, false);
      actions.push(`banish ${target.name} · summon exact copy${copy ? "" : " failed"}`);
    }
    text = text.replace(banishEnemySummonCopy, " ");
  }
  const banishEnemyAddCopy = /Select an enemy card on the field, banish it, and add a copy of it to your hand\.?/i;
  if (banishEnemyAddCopy.test(text)) {
    const target = [...ctx.opponent.board].sort((a,b) => (Number(b.card?.cost)||0) - (Number(a.card?.cost)||0))[0] ?? null;
    if (target) {
      banish(ctx.opponent, target);
      highRiskAddCopyToHand(ctx, target.card, { exact: false });
      actions.push(`banish ${target.name} · add copy`);
    }
    text = text.replace(banishEnemyAddCopy, " ");
  }
  const addFieldCopy = /Select an allied follower on the field with a base cost of at least\s*(\d+), add a copy of it to your hand, and reduce the cost of the copy by\s*(\d+)\.?/i;
  const addFieldMatch = text.match(addFieldCopy);
  if (addFieldMatch) {
    const minCost = Number(addFieldMatch[1]) || 0;
    const reduction = Number(addFieldMatch[2]) || 0;
    const source = ctx.player.board.filter(unit => unit.type === "Follower" && (Number(unit.card?.cost)||0) >= minCost)
      .sort((a,b) => (Number(b.card?.cost)||0) - (Number(a.card?.cost)||0))[0] ?? null;
    const copy = source ? highRiskAddCopyToHand(ctx, source, { exact: false, costDelta: -reduction }) : null;
    actions.push(`field copy to hand${copy ? ` (${copy.card.name})` : " unavailable"}`);
    text = text.replace(addFieldCopy, " ");
  }
  const opponentHandCopy = /Add an exact copy of a random card in your opponent'?s hand to your hand(?: without revealing it)? and reduce its cost by\s*(\d+)\.\s*Draw a card\.?/i;
  const opponentHandMatch = text.match(opponentHandCopy);
  if (opponentHandMatch) {
    const pool = ctx.opponent.hand ?? [];
    const source = pool.length ? pool[Math.floor(ctx.rng() * pool.length)] : null;
    if (source) highRiskAddCopyToHand(ctx, source, { exact: true, costDelta: -Number(opponentHandMatch[1] || 0) });
    const drawn = drawCards(ctx.player, 1, ctx.stats, ctx.playerIndex);
    actions.push(`copy opponent hand · draw ${drawn}`);
    text = text.replace(opponentHandCopy, " ");
  }
  const opponentDeckFive = /Add exact copies of 5 random cards from your opponent'?s deck to your hand without revealing them\.?/i;
  if (opponentDeckFive.test(text)) {
    const pool = [...(ctx.opponent.deck ?? [])];
    let added = 0;
    while (added < 5 && pool.length) {
      const source = pool.splice(Math.floor(ctx.rng() * pool.length), 1)[0];
      if (highRiskAddCopyToHand(ctx, source, { exact: true })) added += 1;
    }
    actions.push(`copy ${added} opponent-deck cards`);
    text = text.replace(opponentDeckFive, " ");
  }

  const summonHandCopies = text.match(/Select\s+(?:(a|an|one|two|three|four|five|\d+)\s+)?Artifact followers? in your hand that costs? 5 or less, summon an exact copy of (?:it|each)(?:,? and give (?:the copy|them) ["“]At the end of your opponent'?s turn, destroy this card\.["”])?\.?/i);
  if (summonHandCopies) {
    const count = highRiskWordNumber(summonHandCopies[1] ?? "one", 1);
    const delayed = /end of your opponent'?s turn, destroy this card/i.test(summonHandCopies[0]);
    const candidates = ctx.player.hand.filter(item => highRiskIsArtifact(item.card) && costOf(item) <= 5).slice(0, count);
    let summoned = 0;
    for (const item of candidates) if (highRiskSummonExactFromHand(ctx, item, delayed)) summoned += 1;
    actions.push(`summon ${summoned} exact Artifact hand cop${summoned === 1 ? "y" : "ies"}`);
    text = text.replace(summonHandCopies[0], " ");
  }

  const summonThisCopies = text.match(/Summon\s+(?:(a|an|one|two|three|four|five|\d+)\s+)?exact copies? of (?:this card|it)\.?/i);
  if (summonThisCopies && ctx.sourceUnit) {
    const count = highRiskWordNumber(summonThisCopies[1] ?? "one", 1);
    let summoned = 0;
    for (let i = 0; i < count; i += 1) if (highRiskSummonExactFromUnit(ctx, ctx.sourceUnit, false)) summoned += 1;
    actions.push(`summon ${summoned} exact self cop${summoned === 1 ? "y" : "ies"}`);
    text = text.replace(summonThisCopies[0], " ");
  }

  // Destroyed-follower history copies.
  const destroyedTwo = /Add copies of 2 random differently named allied followers destroyed this match to your hand\.?/i;
  if (destroyedTwo.test(text)) {
    const cards = highRiskHistoryCards(ctx.player.destroyedFollowers, 2, null, ctx.rng, true);
    for (const card of cards) highRiskAddCopyToHand(ctx, card);
    actions.push(`destroyed follower copies ${cards.length}`);
    text = text.replace(destroyedTwo, " ");
  }
  const destroyedArtifact = /Add a copy of a random allied Artifact follower destroyed this match to your hand\.?/i;
  if (destroyedArtifact.test(text)) {
    const cards = highRiskHistoryCards(ctx.player.destroyedFollowers, 1, highRiskIsArtifact, ctx.rng, true);
    for (const card of cards) highRiskAddCopyToHand(ctx, card);
    actions.push(`destroyed Artifact copy ${cards.length}`);
    text = text.replace(destroyedArtifact, " ");
  }
  const destroyedOne = /Add a copy of a random allied follower destroyed this match to your hand\.?/i;
  if (destroyedOne.test(text)) {
    const cards = highRiskHistoryCards(ctx.player.destroyedFollowers, 1, null, ctx.rng, true);
    for (const card of cards) highRiskAddCopyToHand(ctx, card);
    actions.push(`destroyed follower copy ${cards.length}`);
    text = text.replace(destroyedOne, " ");
  }

  // Destroyed-amulet history summons.
  const destroyedAmuletsTwo = /Summon copies of 2 random differently named allied amulets with Last Words abilities and base costs of 2 or less destroyed this match\.?/i;
  if (destroyedAmuletsTwo.test(text)) {
    const cards = highRiskHistoryCards(ctx.player.destroyedAmulets, 2, card => card.type === "Amulet" && /Last Words\s*:/i.test(String(card.text ?? "")) && (Number(card.cost)||0) <= 2, ctx.rng, true);
    let count = 0; for (const card of cards) if (highRiskSummonAmulet(ctx, card)) count += 1;
    actions.push(`summon ${count} destroyed amulet copies`);
    text = text.replace(destroyedAmuletsTwo, " ");
  }
  const destroyedAmuletRandom = /Summon a copy of a random allied amulet with a Last Words ability and a base cost of 2 or less destroyed this match\.?/i;
  if (destroyedAmuletRandom.test(text)) {
    const cards = highRiskHistoryCards(ctx.player.destroyedAmulets, 1, card => card.type === "Amulet" && /Last Words\s*:/i.test(String(card.text ?? "")) && (Number(card.cost)||0) <= 2, ctx.rng, true);
    const count = cards[0] && highRiskSummonAmulet(ctx, cards[0]) ? 1 : 0;
    actions.push(`summon ${count} destroyed amulet copy`);
    text = text.replace(destroyedAmuletRandom, " ");
  }
  const destroyedAmuletHighest = /Summon a copy of a random allied amulet destroyed this match with the highest base cost\.?/i;
  if (destroyedAmuletHighest.test(text)) {
    const pool = (ctx.player.destroyedAmulets ?? []).map(entry => entry.card).filter(Boolean);
    const highest = Math.max(-Infinity, ...pool.map(card => Number(card.cost)||0));
    const candidates = pool.filter(card => (Number(card.cost)||0) === highest);
    const card = candidates.length ? candidates[Math.floor(ctx.rng() * candidates.length)] : null;
    const count = card && highRiskSummonAmulet(ctx, card) ? 1 : 0;
    actions.push(`summon ${count} highest-cost destroyed amulet copy`);
    text = text.replace(destroyedAmuletHighest, " ");
  }

  // Artifact match-history conditions.
  const artifactHistory = new Set((ctx.player.artifactFollowerNamesEntered ?? []).map(norm)).size;
  const artifactEp = /If at least 3 differently named allied Artifact followers have entered the field this match, recover 1 evolution point\.?/i;
  if (artifactEp.test(text)) {
    if (artifactHistory >= 3) ctx.player.ep = Math.min(2, (Number(ctx.player.ep)||0) + 1);
    actions.push(`Artifact history ${artifactHistory}${artifactHistory >= 3 ? " · recover EP" : ""}`);
    text = text.replace(artifactEp, " ");
  }
  const artifactDamage = /Deal X damage to all enemy followers\.\s*X is the number of differently named allied Artifact followers that have entered the field this match\.\s*Deal 1 damage to the enemy leader\.?/i;
  if (artifactDamage.test(text)) {
    for (const unit of ctx.opponent.board.filter(unit => unit.type === "Follower")) damageUnit(unit, artifactHistory, ctx.opponent, ctx.player, ctx, actions);
    const dealt = damageLeader(ctx.opponent, 1); ctx.stats.damageDealt[ctx.playerIndex] += dealt;
    actions.push(`Artifact history ${artifactHistory}: board ${artifactHistory} · leader ${dealt}`);
    text = text.replace(artifactDamage, " ");
  }
  const artifactSummons = /If at least 3 differently named allied Artifact followers have entered the field this match, summon an Ancient Artifact and a Mystic Artifact\.?/i;
  if (artifactSummons.test(text)) {
    if (artifactHistory >= 3) {
      for (const tokenName of ["Ancient Artifact", "Mystic Artifact"]) {
        const token = findByName(ctx.cardMap, tokenName);
        if (token) summonWithEvents(ctx.player, token, 1, ctx.playerIndex, ctx);
      }
    }
    actions.push(`Artifact history ${artifactHistory}: conditional Artifact summons`);
    text = text.replace(artifactSummons, " ");
  }

  // Persistent damage and temporary opponent-hand cost modifiers.
  const takesMore = text.match(/Give the enemy leader ["“]Takes\s+(\d+)\s+more damage\.?["”]/i);
  if (takesMore) {
    ctx.opponent.leaderDamageTakenBonus = (Number(ctx.opponent.leaderDamageTakenBonus)||0) + Number(takesMore[1]||0);
    actions.push(`enemy leader takes +${takesMore[1]} damage per instance`);
    text = text.replace(takesMore[0], " ");
  }
  const opponentCost = text.match(/Increase the cost of all cards in your opponent'?s hand by\s*(\d+)\s*until the end of their turn\.?/i);
  if (opponentCost) {
    const amount = Number(opponentCost[1]) || 0;
    for (const item of ctx.opponent.hand ?? []) {
      item.costDelta = (Number(item.costDelta)||0) + amount;
      item.highRiskOpponentTempCost = (Number(item.highRiskOpponentTempCost)||0) + amount;
    }
    actions.push(`opponent hand cost +${amount} this turn`);
    text = text.replace(opponentCost[0], " ");
  }

  // Generic selected-target lockdown used by Friendly Blue Ogre.
  const lock = /Select an enemy follower on the field and give it ["“]Can'?t attack followers or leaders["”] until the end of your opponent'?s turn\.?/i;
  if (lock.test(text)) {
    const target = choosePlannedTarget(ctx, ctx.opponent.board.filter(unit => unit.type === "Follower"));
    if (target) { target.yuriusAttackLocked = true; target.canAttackLeader = false; target.canAttackFollower = false; actions.push(`lock ${target.name} until owner turn end`); }
    text = text.replace(lock, " ");
  }

  // Common board-wide "all enemies" wording means followers plus leader.
  for (const match of [...text.matchAll(/Deal\s+(\d+)\s+damage to all enemies\.?/gi)]) {
    const amount = Number(match[1]) || 0;
    for (const unit of ctx.opponent.board.filter(unit => unit.type === "Follower")) damageUnit(unit, amount, ctx.opponent, ctx.player, ctx, actions);
    const dealt = damageLeader(ctx.opponent, amount); ctx.stats.damageDealt[ctx.playerIndex] += dealt;
    actions.push(`${amount} damage to all enemies`);
    text = text.replace(match[0], " ");
  }

  // Silence + fixed damage to two selected followers (Beelzebub grammar).
  const silenceTwo = text.match(/Select 2 enemy followers on the field, remove all abilities from them, and deal them\s*(\d+)\s+damage\.?/i);
  if (silenceTwo) {
    const targets = [...ctx.opponent.board].filter(unit => unit.type === "Follower").sort((a,b) => followerThreatValue(b)-followerThreatValue(a)).slice(0,2);
    for (const target of targets) { silenceFollower(target); damageUnit(target, Number(silenceTwo[1])||0, ctx.opponent, ctx.player, ctx, actions); }
    actions.push(`silence/damage ${targets.length} enemy followers`);
    text = text.replace(silenceTwo[0], " ");
  }

  // Trait-restricted keyword grant used by Spirited Skipper.
  const pixieBane = /Give all allied Pixie followers on the field Bane\.?/i;
  if (pixieBane.test(text)) {
    for (const unit of ctx.player.board.filter(unit => unit.type === "Follower" && (unit.card?.traits ?? []).some(trait => norm(trait) === "pixie"))) giveKeyword(unit, "Bane");
    actions.push("all allied Pixies gain Bane");
    text = text.replace(pixieBane, " ");
  }

  // Base-cost hand comparison used by Behemoth General.
  const topThree = /If the sum of the 3 highest base costs of cards in your hand is greater than that of your opponent'?s, destroy all enemy followers\.?/i;
  if (topThree.test(text)) {
    const sum = hand => [...hand].map(item => Number(item.card?.cost)||0).sort((a,b)=>b-a).slice(0,3).reduce((a,b)=>a+b,0);
    const own = sum(ctx.player.hand), enemy = sum(ctx.opponent.hand);
    if (own > enemy) for (const unit of ctx.opponent.board.filter(unit => unit.type === "Follower")) destroyUnit(ctx.opponent, unit);
    actions.push(`top-3 hand cost ${own} vs ${enemy}`);
    text = text.replace(topThree, " ");
  }

  // Goddess of Starlight: after the discard primitive, copy the 3 leftmost survivors.
  const leftmostCopies = /Add exact copies of the 3 leftmost cards in your hand to your hand\.?/i;
  if (leftmostCopies.test(text)) {
    const sources = ctx.player.hand.slice(0,3);
    let added = 0; for (const source of sources) if (highRiskAddCopyToHand(ctx, source, { exact:true })) added += 1;
    actions.push(`copy ${added} leftmost hand cards`);
    text = text.replace(leftmostCopies, " ");
  }

  // Selected allied-card destruction, with amulets preferred when a follow-up
  // explicitly rewards destroying an allied amulet.
  const destroyAnother = /Select another allied card on the field and destroy it\.?/i;
  if (destroyAnother.test(text)) {
    const pool = ctx.player.board.filter(unit => unit.uid !== ctx.sourceUnit?.uid);
    const wantsAmulet = /if (?:the card|it) is an allied amulet/i.test(text);
    const target = (wantsAmulet ? pool.find(unit => unit.type === "Amulet") : null) ?? pool[0] ?? null;
    if (target) actions.push(...destroyObject(ctx.player, ctx.opponent, target, ctx.playerIndex, ctx.enemyIndex, ctx.stats, ctx.rng, ctx.cardMap, true));
    ctx.__highRiskDestroyedSelectedAmulet = target?.type === "Amulet";
    actions.push(`destroy selected allied card${target ? ` ${target.name}` : " unavailable"}`);
    text = text.replace(destroyAnother, " ");
  }
  const destroyedAmuletPp = /If (?:the card|it) is an allied amulet, recover\s*(\d+)\s+play points\.?/i;
  const destroyedAmuletPpMatch = text.match(destroyedAmuletPp);
  if (destroyedAmuletPpMatch) {
    if (ctx.__highRiskDestroyedSelectedAmulet) ctx.player.pp = Math.min(ctx.player.maxPp, ctx.player.pp + Number(destroyedAmuletPpMatch[1]||0));
    actions.push(`destroyed-amulet PP condition ${ctx.__highRiskDestroyedSelectedAmulet ? "active" : "inactive"}`);
    text = text.replace(destroyedAmuletPp, " ");
  }

  return { text: text.replace(/\s+/g, " ").trim(), actions: uniq(actions) };
}

'''
once('function resolveText(raw, ctx) {', helpers + 'function resolveText(raw, ctx) {', 'high-risk helper insertion')

# Run generic high-risk resolver after class-specific exact handlers and resource
# gates, but before the fallback generic parser.
once(
    '''  const abysscraft = resolveAbysscraftCardText(text, ctx);
  text = abysscraft.text;
  actions.push(...abysscraft.actions);

  const x = ctx.instance?.x ?? ctx.sourceUnit?.x ?? 0;''',
    '''  const abysscraft = resolveAbysscraftCardText(text, ctx);
  text = abysscraft.text;
  actions.push(...abysscraft.actions);

  // [[battle-high-risk-generic-resolve]]
  const highRisk = resolveHighRiskGenericText(text, ctx);
  text = highRisk.text;
  actions.push(...highRisk.actions);

  const x = ctx.instance?.x ?? ctx.sourceUnit?.x ?? 0;''',
    'high-risk resolver dispatch',
)

# Propagate nested replay failures instead of hiding them behind an outer matched
# clause.
once(
    '  return { applied: actions.length > 0 || core.applied, actions: uniq(actions), unresolved: core.unresolved };',
    '  return { applied: actions.length > 0 || core.applied, actions: uniq(actions), unresolved: core.unresolved || Boolean(ctx.__highRiskNestedUnresolved) };',
    'nested unresolved propagation',
)

# Temporary opponent hand cost increases expire at the end of that opponent's turn;
# exact-copy tokens with the same timing marker are destroyed there too.
once(
    '''  // [[battle-portalcraft-temp-cost-expiry]]
  restorePortalcraftTemporaryCosts(player);''',
    '''  // [[battle-high-risk-opponent-turn-expiry]]
  highRiskRestoreOpponentHandCosts(player);
  highRiskApplyEndOpponentTurnDestruction(opponent);
  // [[battle-portalcraft-temp-cost-expiry]]
  restorePortalcraftTemporaryCosts(player);''',
    'high-risk turn-end expiry',
)

ENGINE.write_text(text, encoding="utf-8")
print("Materialized Battle Sim high-risk generic foundation.")
