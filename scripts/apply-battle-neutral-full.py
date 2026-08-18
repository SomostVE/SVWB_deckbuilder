from pathlib import Path

ENGINE = Path('js/battle-engine-v5.js')
text = ENGINE.read_text(encoding='utf-8')


def once(old, new, label):
    global text
    if old not in text:
        raise SystemExit(f'Missing Neutral anchor: {label}')
    text = text.replace(old, new, 1)

# Coverage declarations, backed by the behavior-lock regression below.
once('''  ["camiscilla, unfeeling heart", "Base-5-entry automatic evolution and Super-Evolve leader damage are modeled"]
]);''', '''  ["camiscilla, unfeeling heart", "Base-5-entry automatic evolution and Super-Evolve leader damage are modeled"],
  // [[battle-neutral-full-overrides]]
  ["world of games", "Cross-field same-base-cost play trigger, Countdown advance and Last Words are modeled"],
  ["encroached world", "Engage hand transformation into an exact copy of a random opponent-deck card is modeled"],
  ["mjerrabaine, great manifest", "Exact 76-card Heirs deck replacement, end-turn hand purge/draw and victory-on-exhaustion Crest are modeled"],
  ["katalina, sky's protector", "Per-instance 3-damage cap is enforced by the shared damage engine"],
  ["illamrita, designated target", "Follower Strike lockdown/Barrier, timed banish and Countdown Crest resummon/evolution are modeled"],
  ["alabaster bahamut", "All three global banish Modes for followers, amulets and Crests are modeled"],
  ["ruler of cocytus", "Exact 10-card Apocalypse Deck replacement is modeled"],
  ["astaroth's reckoning", "Enemy max-defense set-to-1 effect is modeled"]
]);''', 'full overrides')

# Remove the World of Games reactive sentence from the generic parser; the play
# event hook below owns it exactly.
once('''  /Whenever another allied follower with a base cost of 5 or more enters the field, evolve it\\.?/gi,
  /Whenever an allied follower with Ward is destroyed, give this follower \\+1\\/\\+1\\.?/gi,''', '''  /Whenever another allied follower with a base cost of 5 or more enters the field, evolve it\\.?/gi,
  // [[battle-neutral-reactive-clauses]]
  /Whenever you play another card, if there's a card on the field other than it with the same base cost, advance this amulet's count by 1\\.?/gi,
  /Whenever an allied follower with Ward is destroyed, give this follower \\+1\\/\\+1\\.?/gi,''', 'reactive clause')

# Special-victory state.
once('''    banished: [], fusedCards: [], destroyedFollowers: [], deckOut: false, isActive: false
  };''', '''    banished: [], fusedCards: [], destroyedFollowers: [], deckOut: false, isActive: false,
    // [[battle-neutral-special-victory-state]]
    mjerrabaineVictoryOnEmpty: false, specialVictory: false
  };''', 'player state')

# Drawing the conceptual Victory card at the bottom of Mjerrabaine Deck is
# represented as victory when the 76 real cards have been exhausted.
once('''    if (!player.deck.length) { player.deckOut = true; break; }
    const item = player.deck.shift();''', '''    if (!player.deck.length) {
      if (player.mjerrabaineVictoryOnEmpty) {
        player.specialVictory = true;
        break;
      }
      player.deckOut = true;
      break;
    }
    const item = player.deck.shift();''', 'draw victory')

# Main battle loop recognizes the special victory both on the normal draw and
# on Mjerrabaine's end-turn six-card draw.
once('''      drawCards(p, 1, stats, active);
      if (p.deckOut) {''', '''      drawCards(p, 1, stats, active);
      if (p.specialVictory) {
        winner = active;
        snap(frames, players, { round, active, phase: "draw", action: `${p.name} draws the Victory card and wins.` }, stats, recordFrames);
        break outer;
      }
      if (p.deckOut) {''', 'normal draw victory')
once('''      snap(frames, players, { round, active, phase: "turn-end", action: compact(`${p.name} ends turn ${p.personalTurn}.`, end) }, stats, recordFrames);
      if (p.hp <= 0) { winner = enemy; break outer; }''', '''      snap(frames, players, { round, active, phase: "turn-end", action: compact(`${p.name} ends turn ${p.personalTurn}.`, end) }, stats, recordFrames);
      if (p.specialVictory) { winner = active; break outer; }
      if (p.hp <= 0) { winner = enemy; break outer; }''', 'turn-end victory')

# World of Games observes every played card after it resolves onto the field.
once('''    // [[battle-portalcraft-spell-play-trigger]]
    actions.push(...applyPortalcraftSpellPlayedTriggers({ card, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap }));
  }

  actions.push(...cleanup(player, opponent, playerIndex, enemyIndex, stats, rng, cardMap),''', '''    // [[battle-portalcraft-spell-play-trigger]]
    actions.push(...applyPortalcraftSpellPlayedTriggers({ card, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap }));
  }

  // [[battle-neutral-card-play-trigger]]
  actions.push(...applyNeutralCardPlayedTriggers({ card, sourceUnit: source, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap }));

  actions.push(...cleanup(player, opponent, playerIndex, enemyIndex, stats, rng, cardMap),''', 'card played hook')

# Neutral resolver runs before the class-specific resolvers.
once('''  // [[battle-portalcraft-resolve-text]]
  const portalcraft = resolvePortalcraftCardText(text, ctx);''', '''  // [[battle-neutral-resolve-text]]
  const neutral = resolveNeutralCardText(text, ctx);
  text = neutral.text;
  actions.push(...neutral.actions);

  // [[battle-portalcraft-resolve-text]]
  const portalcraft = resolvePortalcraftCardText(text, ctx);''', 'neutral resolver hook')

# Illamrita Countdown Crest.
once('''  // [[battle-portalcraft-crest-countdowns]]
  if (normalized === "eudie, maiden reborn") return 3;''', '''  // [[battle-neutral-crest-countdowns]]
  if (normalized === "illamrita, designated target") return 2;
  // Mjerrabaine is persistent and intentionally has no Countdown.
  // [[battle-portalcraft-crest-countdowns]]
  if (normalized === "eudie, maiden reborn") return 3;''', 'crest countdown')

# Neutral Crest Last Words before the generic Lapis fallback.
once('''    // [[battle-abysscraft-crest-last-words]]
    if (abysscraftCrestLastWords(crest, player, opponent, playerIndex, enemyIndex, stats, rng, map, actions)) continue;
    if (norm(crest.name) !== "lapis, shining seraph") continue;''', '''    // [[battle-abysscraft-crest-last-words]]
    if (abysscraftCrestLastWords(crest, player, opponent, playerIndex, enemyIndex, stats, rng, map, actions)) continue;
    // [[battle-neutral-crest-last-words]]
    if (neutralCrestLastWords(crest, player, opponent, playerIndex, enemyIndex, stats, rng, map, actions)) continue;
    if (norm(crest.name) !== "lapis, shining seraph") continue;''', 'crest last words')

# Mjerrabaine end-turn Crest and Illamrita granted banish.
once('''  // [[battle-portalcraft-crest-turn-end]]
  actions.push(...applyPortalcraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map));
  for (const crest of player.crests ?? []) {''', '''  // [[battle-portalcraft-crest-turn-end]]
  actions.push(...applyPortalcraftCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map));
  // [[battle-neutral-crest-turn-end]]
  actions.push(...applyNeutralCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map));
  for (const crest of player.crests ?? []) {''', 'crest turn end')
once('''  // [[battle-swordcraft-yurius-lock-expiry]]
  clearSwordcraftTurnLocks(player);
  actions.push(...cleanup(player, opponent, playerIndex, enemyIndex, stats, rng, map),''', '''  // [[battle-swordcraft-yurius-lock-expiry]]
  clearSwordcraftTurnLocks(player);
  // [[battle-neutral-illamrita-end-banish]]
  actions.push(...applyNeutralMarkedEndTurnBanish(player));
  actions.push(...cleanup(player, opponent, playerIndex, enemyIndex, stats, rng, map),''', 'marked banish')

# Give Strike resolution the exact opposing follower. There are two attack
# execution paths; the optional argument remains null for leader strikes.
old_call = 'actions.push(...strike(attacker, player, opponent, playerIndex, enemyIndex, stats, rng, map));'
new_call = 'actions.push(...strike(attacker, player, opponent, playerIndex, enemyIndex, stats, rng, map, typeof target !== "undefined" ? target : null));'
if old_call not in text:
    raise SystemExit('Missing Neutral anchor: strike calls')
text = text.replace(old_call, new_call)
once('''function strike(attacker, player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const text = getUnitTriggeredText(attacker, "strike");
  if (!text) return [];
  stats.strikeTriggered[playerIndex] += 1;
  const result = resolveText(text, { card: attacker.card, sourceUnit: attacker, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map });''', '''function strike(attacker, player, opponent, playerIndex, enemyIndex, stats, rng, map, opposingFollower = null) {
  const text = getUnitTriggeredText(attacker, "strike");
  if (!text) return [];
  stats.strikeTriggered[playerIndex] += 1;
  const result = resolveText(text, { card: attacker.card, sourceUnit: attacker, opposingFollower, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map });''', 'strike context')

neutral_rules = r'''

// [[battle-neutral-full-rules]]
function replaceWithMjerrabaineDeck(ctx, actions) {
  const cards = [...ctx.cardMap.values()]
    .filter(card => Number(card?.setId) === 10003 && Number(card?.baseCardId ?? card?.id) !== 10304110 && !card?.token);
  // The official Mjerrabaine Deck is exactly one copy of every other Heirs of
  // the Omen main-set card: 76 real cards. The bottom Reaper is represented by
  // mjerrabaineVictoryOnEmpty and becomes the conceptual Victory card.
  ctx.player.deck = cards.map(card => instance(ctx.player, card));
  shuffle(ctx.player.deck, ctx.rng);
  ctx.player.deckOut = false;
  ctx.player.specialVictory = false;
  ctx.player.mjerrabaineVictoryOnEmpty = true;
  actions.push(`Mjerrabaine Crest: replace deck with ${ctx.player.deck.length}-card Mjerrabaine Deck`);
}

function replaceWithApocalypseDeck(ctx, actions) {
  const spec = [
    ["Silent Rider", 3],
    ["Servant of Cocytus", 3],
    ["Demon of Purgatory", 3],
    ["Astaroth's Reckoning", 1]
  ];
  const next = [];
  for (const [name, count] of spec) {
    const card = findByName(ctx.cardMap, name);
    if (!card) continue;
    for (let index = 0; index < count; index += 1) next.push(instance(ctx.player, card));
  }
  ctx.player.deck = next;
  shuffle(ctx.player.deck, ctx.rng);
  ctx.player.deckOut = false;
  ctx.player.specialVictory = false;
  ctx.player.mjerrabaineVictoryOnEmpty = false;
  actions.push(`Ruler of Cocytus: replace deck with ${next.length}-card Apocalypse Deck`);
}

function applyNeutralCardPlayedTriggers(ctx) {
  const actions = [];
  if (!ctx?.card) return actions;
  const baseCost = Math.max(0, Number(ctx.card.cost) || 0);
  const field = [...(ctx.player.board ?? []), ...(ctx.opponent.board ?? [])];
  for (const amulet of [...(ctx.player.board ?? [])].filter(unit => unit.type === "Amulet" && norm(unit.name) === "world of games")) {
    // A World of Games does not trigger for the event that put that same copy
    // onto the field, but older copies do trigger when another World is played.
    if (ctx.sourceUnit && amulet.uid === ctx.sourceUnit.uid) continue;
    const match = field.some(unit => (!ctx.sourceUnit || unit.uid !== ctx.sourceUnit.uid) && Math.max(0, Number(unit.card?.cost) || 0) === baseCost);
    if (!match || !Number.isFinite(amulet.countdown)) continue;
    amulet.countdown -= 1;
    actions.push(`World of Games: countdown ${Math.max(0, amulet.countdown)}`);
  }
  return actions;
}

function neutralCrestLastWords(crest, player, opponent, playerIndex, enemyIndex, stats, rng, map, actions) {
  if (norm(crest?.name) !== "illamrita, designated target") return false;
  if (player.board.length >= 5) {
    actions.push("Illamrita Crest: field full, summon skipped");
    return true;
  }
  const card = crest.card ?? findByName(map, "Illamrita, Designated Target");
  if (!card) return true;
  const unit = boardFollower(instance(player, card));
  player.board.push(unit);
  player.rally += 1;
  const ctx = { player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map };
  actions.push(`Illamrita Crest: summon ${unit.name}`);
  actions.push(...applyEntryEvents(ctx, unit));
  evolveUnitByAbility(ctx, unit, actions);
  return true;
}

function applyNeutralMarkedEndTurnBanish(player) {
  const actions = [];
  for (const unit of [...(player.board ?? [])]) {
    if (!unit.illamritaBanishAtOwnTurnEnd) continue;
    banish(player, unit);
    actions.push(`Illamrita: banish ${unit.name} at end of its controller's turn`);
  }
  return actions;
}

function applyNeutralCrestTurnEnd(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
  const actions = [];
  if (!hasCrest(player, "Mjerrabaine, Great Manifest")) return actions;
  const kept = [];
  const discarded = [];
  for (const item of player.hand ?? []) {
    if (norm(item.card?.name) === "great testimony") kept.push(item);
    else discarded.push(item);
  }
  player.hand = kept;
  const ctx = { player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map };
  for (const item of discarded) {
    toCemetery(player, item, false);
    triggerDiscardedCard(ctx, item, actions);
  }
  if (discarded.length) actions.push(`Mjerrabaine Crest: discard ${discarded.length} non-Testimony card${discarded.length === 1 ? "" : "s"}`);
  const drawn = drawCards(player, 6, stats, playerIndex);
  actions.push(`Mjerrabaine Crest: draw ${drawn}${player.specialVictory ? " · Victory" : ""}`);
  return uniq(actions);
}

function resolveNeutralCardText(raw, ctx) {
  let text = String(raw ?? "").trim();
  const actions = [];
  const name = norm(ctx.card?.name);

  if (name === "encroached world") {
    const clause = /Select a card in your hand and transform it into an exact copy of a random card in your opponent'?s deck\.?/i;
    if (clause.test(text)) {
      const target = ctx.player.hand?.[0] ?? null;
      const opponentCard = ctx.opponent.deck?.length ? ctx.opponent.deck[Math.floor(ctx.rng() * ctx.opponent.deck.length)]?.card : null;
      if (target && opponentCard) {
        transformHandInstance(target, opponentCard);
        actions.push(`Encroached World: transform hand card into ${opponentCard.name}`);
      } else actions.push("Encroached World: no valid hand/deck transformation");
      text = text.replace(clause, " ");
    }
  }

  if (name === "mjerrabaine, great manifest") {
    const clause = /Gain Crest:\s*Mjerrabaine, Great Manifest\.?/i;
    if (clause.test(text)) {
      if (gainCrest(ctx.player, "Mjerrabaine, Great Manifest", ctx.card)) replaceWithMjerrabaineDeck(ctx, actions);
      text = text.replace(clause, " ");
    }
  }

  if (name === "illamrita, designated target") {
    if (ctx.opposingFollower && /Give this follower Barrier/i.test(text)) {
      giveKeyword(ctx.sourceUnit, "Barrier");
      ctx.opposingFollower.permanentAttackLock = true;
      ctx.opposingFollower.canAttackLeader = false;
      ctx.opposingFollower.canAttackFollower = false;
      ctx.opposingFollower.illamritaBanishAtOwnTurnEnd = true;
      actions.push(`Illamrita: Barrier · lock ${ctx.opposingFollower.name} · banish at turn end`);
      text = "";
    }
    const crestClause = /Gain Crest:\s*Illamrita, Designated Target\.?/i;
    if (crestClause.test(text)) {
      if (gainCrest(ctx.player, "Illamrita, Designated Target", ctx.card)) actions.push("Crest: Illamrita, Designated Target");
      text = text.replace(crestClause, " ");
    }
  }

  if (name === "alabaster bahamut") {
    const followers = /Banish all other followers from the field\.?/i;
    const amulets = /Banish all amulets from the field\.?/i;
    const crests = /Banish all crests\.?/i;
    if (followers.test(text)) {
      let count = 0;
      for (const owner of [ctx.player, ctx.opponent]) for (const unit of [...owner.board]) {
        if (unit.type !== "Follower" || unit === ctx.sourceUnit) continue;
        banish(owner, unit); count += 1;
      }
      actions.push(`Alabaster Bahamut: banish ${count} other followers`);
      text = text.replace(followers, " ");
    }
    if (amulets.test(text)) {
      let count = 0;
      for (const owner of [ctx.player, ctx.opponent]) for (const unit of [...owner.board]) {
        if (unit.type !== "Amulet") continue;
        banish(owner, unit); count += 1;
      }
      actions.push(`Alabaster Bahamut: banish ${count} amulets`);
      text = text.replace(amulets, " ");
    }
    if (crests.test(text)) {
      const count = (ctx.player.crests?.length ?? 0) + (ctx.opponent.crests?.length ?? 0);
      ctx.player.crests = [];
      ctx.opponent.crests = [];
      actions.push(`Alabaster Bahamut: banish ${count} Crests`);
      text = text.replace(crests, " ");
    }
  }

  if (name === "ruler of cocytus") {
    const clause = /Replace your deck with the Apocalypse Deck\.?/i;
    if (clause.test(text)) {
      replaceWithApocalypseDeck(ctx, actions);
      text = text.replace(clause, " ");
    }
  }

  if (name === "astaroth's reckoning") {
    const clause = /Set the enemy leader'?s max defense to 1\.?/i;
    if (clause.test(text)) {
      ctx.opponent.maxHp = 1;
      ctx.opponent.hp = Math.min(ctx.opponent.hp, 1);
      actions.push("Astaroth's Reckoning: enemy max defense set to 1");
      text = text.replace(clause, " ");
    }
  }

  return { text: text.replace(/\s+/g, " ").trim(), actions: uniq(actions) };
}

'''
once('// [[battle-portalcraft-full-rules]]\n', neutral_rules + '// [[battle-portalcraft-full-rules]]\n', 'neutral rule block')

qa = r'''

// [[battle-neutral-full-qa]]
export function inspectNeutralFullRules({ cards = [] } = {}) {
  const rawMap = new Map(cards.map(card => [Number(card.id), card]));
  const map = prepareSimulationCardMap(rawMap);
  const byName = name => findByName(map, name);
  const makePair = seed => {
    const rng = createRng(`neutral-full-qa:${seed}`);
    const stats = createStats();
    const player = makePlayer("You", [], {}, map, rng);
    const opponent = makePlayer("Opponent", [], {}, map, rng);
    player.isActive = true;
    player.personalTurn = 6;
    opponent.personalTurn = 5;
    return { rng, stats, player, opponent, ctx() { return { player, opponent, playerIndex: 0, enemyIndex: 1, stats, rng, cardMap: map }; } };
  };
  const synthetic = (name, cost = 1, type = "Follower") => ({ id: -930000 - name.length, name, class: "Neutral", type, cost, attack: 1, defense: 5, text: "", keywords: [], traits: [], relatedCards: [] });

  const world = makePair("world");
  const worldAmulet = boardAmulet(instance(world.player, byName("World of Games")));
  worldAmulet.countdown = 5;
  world.player.board = [worldAmulet];
  world.opponent.board = [boardFollower(instance(world.opponent, synthetic("Opponent Four", 4)))];
  applyNeutralCardPlayedTriggers({ ...world.ctx(), card: synthetic("Played Four", 4, "Spell"), sourceUnit: null });
  const worldCountdown = worldAmulet.countdown;

  const enc = makePair("encroached");
  const original = instance(enc.player, synthetic("Disposable", 2));
  enc.player.hand = [original];
  enc.opponent.deck = [instance(enc.opponent, byName("Silent Rider"))];
  resolveNeutralCardText("Select a card in your hand and transform it into an exact copy of a random card in your opponent's deck.", { ...enc.ctx(), card: byName("Encroached World"), sourceUnit: boardAmulet(instance(enc.player, byName("Encroached World"))) });
  const encroachedCopy = enc.player.hand[0]?.card?.name ?? null;

  const mj = makePair("mjerrabaine");
  resolveNeutralCardText("Gain Crest: Mjerrabaine, Great Manifest.", { ...mj.ctx(), card: byName("Mjerrabaine, Great Manifest"), sourceUnit: boardFollower(instance(mj.player, byName("Mjerrabaine, Great Manifest"))) });
  const mjDeck = { count: mj.player.deck.length, distinct: new Set(mj.player.deck.map(item => Number(item.card?.baseCardId ?? item.card?.id))).size, victory: mj.player.mjerrabaineVictoryOnEmpty };
  const testimony = instance(mj.player, byName("Great Testimony"));
  const discard = instance(mj.player, synthetic("Mj Discard", 2));
  mj.player.hand = [testimony, discard];
  mj.player.deck = Array.from({ length: 6 }, (_, index) => instance(mj.player, synthetic(`Mj Draw ${index}`, index + 1)));
  applyNeutralCrestTurnEnd(mj.player, mj.opponent, 0, 1, mj.stats, mj.rng, map);
  const mjTurnEnd = { testimony: mj.player.hand.some(item => norm(item.card.name) === "great testimony"), hand: mj.player.hand.length, discarded: mj.player.cemetery.some(item => item.card.name === "Mj Discard") };
  mj.player.hand = []; mj.player.deck = []; mj.player.specialVictory = false; mj.player.deckOut = false; mj.player.mjerrabaineVictoryOnEmpty = true;
  drawCards(mj.player, 1, mj.stats, 0);
  const mjVictory = { victory: mj.player.specialVictory, deckOut: mj.player.deckOut };

  const kat = makePair("katalina");
  const katalina = boardFollower(instance(kat.player, byName("Katalina, Sky's Protector")));
  kat.player.board = [katalina];
  const katBefore = katalina.defense;
  damageUnit(katalina, 10, kat.player, kat.opponent, kat.ctx(), []);
  const katalinaDamage = katBefore - katalina.defense;

  const ill = makePair("illamrita");
  const illamrita = boardFollower(instance(ill.player, byName("Illamrita, Designated Target")));
  const victim = boardFollower(instance(ill.opponent, synthetic("Illamrita Victim", 3)));
  ill.player.board = [illamrita]; ill.opponent.board = [victim];
  resolveNeutralCardText('Give this follower Barrier. Give the opposing follower "Can\'t attack followers or leaders" and "At the end of your turn, banish this card."', { ...ill.ctx(), card: illamrita.card, sourceUnit: illamrita, opposingFollower: victim });
  const illStrike = { barrier: illamrita.barrier, locked: victim.permanentAttackLock, marked: victim.illamritaBanishAtOwnTurnEnd };
  applyNeutralMarkedEndTurnBanish(ill.opponent);
  const illBanish = ill.opponent.board.length;
  ill.player.board = [];
  gainCrest(ill.player, "Illamrita, Designated Target", byName("Illamrita, Designated Target"));
  const illCrest = ill.player.crests.find(crest => norm(crest.name) === "illamrita, designated target");
  illCrest.countdown = 1; illCrest.gainedTurn = 0; ill.player.personalTurn = 2;
  tickCrests(ill.player, ill.opponent, 0, 1, ill.stats, ill.rng, map, []);
  const illSummon = ill.player.board.find(unit => norm(unit.name) === "illamrita, designated target");
  const illCrestResult = { summoned: Boolean(illSummon), evolved: Boolean(illSummon?.evolved) };

  const bahFollowers = makePair("bah-followers");
  const bah = boardFollower(instance(bahFollowers.player, byName("Alabaster Bahamut")));
  bahFollowers.player.board = [bah, boardFollower(instance(bahFollowers.player, synthetic("Ally")))];
  bahFollowers.opponent.board = [boardFollower(instance(bahFollowers.opponent, synthetic("Enemy")))];
  resolveNeutralCardText("Banish all other followers from the field.", { ...bahFollowers.ctx(), card: bah.card, sourceUnit: bah });
  const bahamutFollowers = { allied: bahFollowers.player.board.length, enemy: bahFollowers.opponent.board.length, survived: bahFollowers.player.board[0]?.name === "Alabaster Bahamut" };

  const bahAmulets = makePair("bah-amulets");
  const bahA = boardFollower(instance(bahAmulets.player, byName("Alabaster Bahamut")));
  bahAmulets.player.board = [bahA, boardAmulet(instance(bahAmulets.player, synthetic("Ally Amulet", 2, "Amulet")))];
  bahAmulets.opponent.board = [boardAmulet(instance(bahAmulets.opponent, synthetic("Enemy Amulet", 2, "Amulet")))];
  resolveNeutralCardText("Banish all amulets from the field.", { ...bahAmulets.ctx(), card: bahA.card, sourceUnit: bahA });
  const bahamutAmulets = [bahAmulets.player.board.filter(unit => unit.type === "Amulet").length, bahAmulets.opponent.board.filter(unit => unit.type === "Amulet").length];

  const bahCrests = makePair("bah-crests");
  gainCrest(bahCrests.player, "Grimnir, Heavenly Gale", byName("Grimnir, Heavenly Gale"));
  gainCrest(bahCrests.opponent, "Grimnir, Heavenly Gale", byName("Grimnir, Heavenly Gale"));
  resolveNeutralCardText("Banish all crests.", { ...bahCrests.ctx(), card: byName("Alabaster Bahamut"), sourceUnit: null });
  const bahamutCrests = [bahCrests.player.crests.length, bahCrests.opponent.crests.length];

  const coc = makePair("cocytus");
  resolveNeutralCardText("Replace your deck with the Apocalypse Deck.", { ...coc.ctx(), card: byName("Ruler of Cocytus"), sourceUnit: boardFollower(instance(coc.player, byName("Ruler of Cocytus"))) });
  const composition = Object.fromEntries([...coc.player.deck.reduce((m, item) => m.set(item.card.name, (m.get(item.card.name) ?? 0) + 1), new Map()).entries()].sort());

  const ast = makePair("astaroth");
  ast.opponent.hp = 17; ast.opponent.maxHp = 20;
  resolveNeutralCardText("Set the enemy leader's max defense to 1.", { ...ast.ctx(), card: byName("Astaroth's Reckoning"), sourceUnit: null });
  const astaroth = { hp: ast.opponent.hp, maxHp: ast.opponent.maxHp };

  return { worldCountdown, encroachedCopy, mjDeck, mjTurnEnd, mjVictory, katalinaDamage, illStrike, illBanish, illCrestResult, bahamutFollowers, bahamutAmulets, bahamutCrests, apocalypse: { count: coc.player.deck.length, composition }, astaroth };
}

'''
once('// [[battle-portalcraft-full-qa]]\n', qa + '// [[battle-portalcraft-full-qa]]\n', 'neutral QA block')

ENGINE.write_text(text, encoding='utf-8')
print('Neutral Battle Sim rules materialized.')
