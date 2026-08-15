import * as core from "./battle-rules-core.js";

export * from "./battle-rules-core.js";

const ENTRY_HOOK = "[[battle-entry-hook]]";
const GAP_HOOK = "[[battle-rule-gap-hook]]";
const SPELL_HOOK = "[[battle-spell-play-hook]]";
const DESTROY_HOOK = "[[battle-follower-destroyed-hook]]";
const TURN_END_HOOK = "[[battle-crest-turn-end-hook]]";

export function getTriggeredText(card, event, mode = null) {
  // Lifecycle events are emitted centrally by the battle engine. Injecting
  // destruction/turn-end hooks here made those events run once per unit text
  // and then again through the engine's explicit event dispatch.
  return core.getTriggeredText(card, event, mode);
}

export function executeGenericEffects(textValue, context) {
  let text = String(textValue ?? "");
  const actions = [];
  let applied = false;
  let gapEncountered = false;
  const hasEntryHook = containsHook(text, ENTRY_HOOK);
  const hasSpellHook = containsHook(text, SPELL_HOOK);

  if (containsHook(text, GAP_HOOK)) {
    text = stripHook(text, GAP_HOOK);
    context.stats.unsupportedEffects[context.playerIndex] += 1;
    recordRuleGap(context);
    gapEncountered = true;
  }

  if (hasEntryHook) text = stripHook(text, ENTRY_HOOK);
  if (hasSpellHook) text = stripHook(text, SPELL_HOOK);

  const timed = resolveTimedAbilityHooks(text, context);
  text = timed.text;
  actions.push(...timed.actions);
  applied ||= timed.applied;

  if (containsHook(text, DESTROY_HOOK)) {
    text = stripHook(text, DESTROY_HOOK);
    const destroyedActions = applyFollowerDestroyedEffects(context, context.sourceUnit);
    if (destroyedActions.length) {
      actions.push(...destroyedActions);
      applied = true;
    }
  }

  if (containsHook(text, TURN_END_HOOK)) {
    text = stripHook(text, TURN_END_HOOK);
    const crestActions = applyTurnEndCrestEffects(context);
    if (crestActions.length) {
      actions.push(...crestActions);
      applied = true;
    }
  }

  if (hasEntryHook && context.sourceUnit) {
    const selfEntry = text.match(/\bwhen this (?:card|follower) enters the field,\s*([^.]*)\.?/i);
    if (selfEntry) {
      const result = core.executeGenericEffects(selfEntry[1], { ...context, card: context.sourceUnit.card, sourceUnit: context.sourceUnit });
      actions.push(...(result.actions ?? []).map(action => `${context.sourceUnit.name}: ${action}`));
      applied ||= result.applied;
      text = text.replace(selfEntry[0], " ");
    }

    const entryActions = applyEntryCrestEffects(context, context.sourceUnit);
    if (entryActions.length) {
      actions.push(...entryActions);
      applied = true;
    }
  }

  const exact = resolveCardSpecificText(text, context);
  text = exact.text;
  actions.push(...exact.actions);
  applied ||= exact.applied;

  const transform = resolveFieldTransform(text, context);
  if (transform.matched) {
    text = transform.text;
    actions.push(...transform.actions);
    applied ||= transform.applied;
  }

  const superEvolvedCondition = text.match(/if there(?:'|’)s a super-evolved allied follower on the field,\s*(.*)$/i);
  if (superEvolvedCondition) {
    text = context.player.board.some(unit => unit.type === "Follower" && unit.superEvolved)
      ? superEvolvedCondition[1]
      : "";
  }

  const wrappedContext = {
    ...context,
    buffUnit(unit, attack, defense) {
      const before = { attack: Number(unit.attack) || 0, defense: Number(unit.defense) || 0 };
      context.buffUnit(unit, attack, defense);
      const buffActions = applyBuffedFollowerEffects(context, unit, before);
      if (buffActions.length) {
        actions.push(...buffActions);
        applied = true;
      }
    },
    summon(player, card, amount, playerIndex) {
      const before = new Set(player.board.map(unit => unit.uid));
      const count = context.summon(player, card, amount, playerIndex);
      for (const unit of player.board) {
        if (before.has(unit.uid)) continue;
        const entryActions = applyEntryCrestEffects({ ...context, player, playerIndex }, unit);
        if (entryActions.length) {
          actions.push(...entryActions);
          applied = true;
        }
        const selfActions = applySummonedSelfEntry({ ...context, player, playerIndex }, unit);
        if (selfActions.length) {
          actions.push(...selfActions);
          applied = true;
        }
      }
      return count;
    }
  };

  const result = core.executeGenericEffects(text, wrappedContext);
  actions.push(...(result.actions ?? []));
  applied ||= result.applied;

  if (hasSpellHook) {
    const spellActions = applySpellPlayedEffects(wrappedContext);
    if (spellActions.length) {
      actions.push(...spellActions);
      applied = true;
    }
  }

  return {
    applied,
    actions: unique(actions),
    unresolved: gapEncountered || result.unresolved || (transform.matched && !transform.applied)
  };
}

export function applyEntryCrestEffects(context, unit) {
  if (!unit || unit.type !== "Follower" || unit.__entryEventsApplied) return [];
  unit.__entryEventsApplied = true;
  const actions = [];
  const traits = new Set((unit.card?.traits ?? []).map(normalize));

  if (traits.has("artifact")) recordArtifactEntry(context.player, unit);

  for (const crest of context.player.crests ?? []) {
    const name = normalize(crest.name);
    if (name === "wilbert, desolate paladin" && hasKeyword(unit, "Ward")) {
      const before = { attack: Number(unit.attack) || 0, defense: Number(unit.defense) || 0 };
      context.buffUnit(unit, 1, 2);
      actions.push(`Wilbert Crest: +1/+2 ${unit.name}`);
      actions.push(...applyBuffedFollowerEffects(context, unit, before));
    }
  }

  for (const source of context.player.board ?? []) {
    if (source === unit || source.type !== "Follower") continue;
    const name = normalize(source.name);

    if (name === "orchis, newfound heart" && traits.has("puppetry")) {
      const gained = [giveUnitKeyword(unit, "Storm"), giveUnitKeyword(unit, "Bane")].some(Boolean);
      if (gained) actions.push(`Orchis: ${unit.name} gains Storm and Bane`);
    }

    if (name === "zwei, symphonic heart" && traits.has("puppetry")) {
      if (giveUnitKeyword(unit, "Ward")) actions.push(`Zwei: ${unit.name} gains Ward`);
    }

    if (name === "brazen broadcaster" && traits.has("artifact")) {
      if (giveUnitKeyword(unit, "Rush")) actions.push(`Brazen Broadcaster: ${unit.name} gains Rush`);
    }
  }

  return actions;
}

export function applyFollowerDestroyedEffects(context, destroyedUnit) {
  if (!destroyedUnit || destroyedUnit.type !== "Follower" || !hasKeyword(destroyedUnit, "Ward")) return [];
  const actions = [];
  for (const source of context.player.board ?? []) {
    if (source === destroyedUnit || source.type !== "Follower") continue;
    if (normalize(source.name) !== "sarissa, luxspear al-mi'raj") continue;
    context.buffUnit(source, 1, 1);
    actions.push(`Sarissa: +1/+1 after ${destroyedUnit.name} is destroyed`);
  }
  return actions;
}

export function applyBuffedFollowerEffects(context, unit, before = null) {
  if (!unit || unit.type !== "Follower") return [];
  const gainedStats = before == null
    || (Number(unit.attack) || 0) > (Number(before.attack) || 0)
    || (Number(unit.defense) || 0) > (Number(before.defense) || 0);
  if (!gainedStats || normalize(unit.name) !== "knight of the holy order") return [];
  const healed = healLeader(context.player, 1, context.stats, context.playerIndex);
  return [`Knight of the Holy Order: restore ${healed} leader defense`];
}

export function applySpellPlayedEffects(context) {
  const actions = [];
  for (const source of [...(context.player.board ?? [])]) {
    if (normalize(source.name) !== "imari, dewdrop" || !source.evolved) continue;
    const token = relatedCardByName(source.card, "Imari's Little Buddies");
    if (!token || context.player.board.length >= 5) continue;
    const count = context.summon(context.player, token, 1, context.playerIndex);
    if (count) {
      context.stats.cardsGenerated[context.playerIndex] += count;
      actions.push(`Imari: summon ${token.name}`);
    }
  }
  return actions;
}

export function applyTurnEndCrestEffects(context) {
  const player = context.player;
  const opponent = context.opponent;
  const turnKey = Number(player.personalTurn) || 0;
  if (player.__crestTurnEndProcessed === turnKey) return [];
  player.__crestTurnEndProcessed = turnKey;

  const actions = [];
  const expired = new Set();

  for (const crest of player.crests ?? []) {
    const name = normalize(crest.name);

    if (name === "grimnir, heavenly gale") {
      if (player.board.some(unit => unit.type === "Follower" && unit.superEvolved)) {
        const targets = opponent.board.filter(unit => unit.type === "Follower");
        for (const target of targets) target.defense -= 2;
        if (targets.length) {
          context.cleanup(opponent, context.enemyIndex);
          actions.push(`Grimnir Crest: 2 damage to ${targets.length} enemy follower${targets.length === 1 ? "" : "s"}`);
        }
      }
      continue;
    }

    if (name === "sandalphon, primarch successor") {
      if (!Number.isFinite(crest.__countdownRemaining)) crest.__countdownRemaining = 2;
      const leaderHeal = healLeader(player, 1, context.stats, context.playerIndex);
      let followerHealing = 0;
      for (const unit of player.board.filter(unit => unit.type === "Follower")) {
        const before = unit.defense;
        unit.defense = Math.min(unit.maxDefense, unit.defense + 1);
        followerHealing += Math.max(0, unit.defense - before);
      }
      actions.push(`Sandalphon Crest: restore 1 defense to all allies${leaderHeal || followerHealing ? "" : " (no damaged allies)"}`);
      crest.__countdownRemaining -= 1;
      if (crest.__countdownRemaining <= 0) expired.add(crest);
    }
  }

  if (expired.size) player.crests = (player.crests ?? []).filter(crest => !expired.has(crest));
  return actions;
}

function resolveTimedAbilityHooks(textValue, context) {
  let text = String(textValue ?? "");
  const actions = [];
  let applied = false;

  const crestHook = /\[\[battle-skybound-crest:(\d+):([^\]]+)\]\]/i;
  const crest = text.match(crestHook);
  if (crest) {
    const threshold = Number(crest[1]);
    const active = skyboundCount(context.player) >= threshold;
    if (active && gainCrestDirect(context.player, crest[2].trim(), context.card)) {
      actions.push(`Skybound Art · Crest: ${crest[2].trim()}`);
      applied = true;
    }
    text = text.replace(crest[0], " ");
  }

  const superHook = /\[\[battle-super-skybound-self:(\d+)\]\]/i;
  const superSelf = text.match(superHook);
  if (superSelf) {
    const threshold = Number(superSelf[1]);
    if (skyboundCount(context.player) >= threshold && context.sourceUnit) {
      actions.push(...superEvolveByAbility(context, context.sourceUnit));
      applied = true;
    }
    text = text.replace(superSelf[0], " ");
  }

  return { text, actions, applied };
}

function resolveCardSpecificText(textValue, context) {
  let text = String(textValue ?? "");
  const actions = [];
  let applied = false;
  const cardName = normalize(context.card?.name);

  if (cardName === "freerunning" && artifactEntryCount(context.player) >= 3) {
    const hasAnalyzing = /\banalyzing artifact\b/i.test(text);
    const hasAncient = /\bancient artifact\b/i.test(text);
    if (hasAnalyzing !== hasAncient) {
      const missingName = hasAnalyzing ? "Ancient Artifact" : "Analyzing Artifact";
      const missing = relatedCardByName(context.card, missingName);
      const count = missing && typeof context.addToHand === "function"
        ? context.addToHand(context.player, missing, 1, context.playerIndex)
        : 0;
      if (count) {
        context.stats.cardsGenerated[context.playerIndex] += count;
        actions.push(`Freerunning threshold: add ${missing.name}`);
        applied = true;
      }
    }
  }

  if (cardName === "scarlet, anathema of dislocation") {
    const artifactDamage = /deal X damage to all enemy followers\.\s*X is the number of differently named allied Artifact followers that have entered the field this match\.?/i;
    if (artifactDamage.test(text)) {
      const amount = artifactEntryCount(context.player);
      const targets = context.opponent.board.filter(unit => unit.type === "Follower");
      for (const target of targets) target.defense -= amount;
      if (targets.length) context.cleanup(context.opponent, context.enemyIndex);
      actions.push(`Scarlet: ${amount} damage to ${targets.length} enemy follower${targets.length === 1 ? "" : "s"}`);
      text = text.replace(artifactDamage, " ");
      applied = true;
    }
  }

  if (cardName === "imari, dewdrop") {
    const fanfare = /select a card in your hand and discard it\.\s*draw a spell\.?/i;
    if (fanfare.test(text)) {
      const discarded = chooseDiscard(context.player.hand);
      if (discarded) {
        context.player.hand = context.player.hand.filter(instance => instance.uid !== discarded.uid);
        context.player.cemetery.push(discarded);
        actions.push(`discard ${discarded.card.name}`);
      }
      const drawn = drawMatching(context, instance => instance.card.type === "Spell", new Set());
      if (drawn) actions.push(`draw ${drawn.card.name}`);
      text = text.replace(fanfare, " ");
      applied = true;
    }

    const superDraw = /draw 2 differently named 1-cost spells\.?/i;
    if (superDraw.test(text)) {
      const names = new Set();
      for (let index = 0; index < 2; index += 1) {
        const drawn = drawMatching(context, instance => instance.card.type === "Spell" && Number(instance.card.cost) === 1, names);
        if (!drawn) break;
        names.add(normalize(drawn.card.name));
        actions.push(`draw ${drawn.card.name}`);
      }
      text = text.replace(superDraw, " ");
      applied = true;
    }
  }

  if (cardName === "vira, luminous primal knight") {
    const banishTwo = /select 2 enemy followers on the field and banish them\.?/i;
    if (banishTwo.test(text)) {
      let count = 0;
      for (let index = 0; index < 2; index += 1) {
        const target = context.chooseEnemyFollower(context.opponent.board);
        if (!target) break;
        context.banish(context.opponent, target);
        actions.push(`banish ${target.name}`);
        count += 1;
      }
      text = text.replace(banishTwo, " ");
      applied ||= count > 0;
    }
  }

  if (cardName === "lu woh, light personified") {
    const handBuff = /give all followers in your opponent'?s hand \+1\/\+0\.?/i;
    if (handBuff.test(text)) {
      const targets = context.opponent.hand.filter(instance => instance.card.type === "Follower");
      for (const target of targets) context.buffHand(target, 1, 0);
      actions.push(`Lu Woh: +1/+0 to ${targets.length} enemy hand follower${targets.length === 1 ? "" : "s"}`);
      text = text.replace(handBuff, " ");
      applied = true;
    }
  }

  return { text, actions, applied };
}

function applySummonedSelfEntry(context, unit) {
  const text = String(unit.card?.text ?? "");
  const match = text.match(/\bwhen this (?:card|follower) enters the field,\s*([^.]*)\.?/i);
  if (!match) return [];
  const result = core.executeGenericEffects(match[1], { ...context, card: unit.card, sourceUnit: unit });
  return (result.actions ?? []).map(action => `${unit.name}: ${action}`);
}

function resolveFieldTransform(textValue, context) {
  const text = String(textValue ?? "");
  const match = text.match(/select a card on the field and transform it into (?:an?\s+)?([^.;]+)\.?/i);
  if (!match) return { matched: false, applied: false, actions: [], text };

  const token = relatedCardByName(context.card, match[1].trim());
  const selected = chooseTransformTarget(context);
  if (!token || !selected) {
    return { matched: true, applied: false, actions: ["transform target unavailable"], text: text.replace(match[0], " ") };
  }

  const replacement = transformedUnit(selected.owner, selected.unit, token);
  const index = selected.owner.board.indexOf(selected.unit);
  if (index < 0) return { matched: true, applied: false, actions: ["transform target unavailable"], text: text.replace(match[0], " ") };
  selected.owner.board.splice(index, 1, replacement);
  return {
    matched: true,
    applied: true,
    actions: [`transform ${selected.unit.name} into ${token.name}`],
    text: text.replace(match[0], " ")
  };
}

function chooseTransformTarget(context) {
  let enemy = context.opponent.board.filter(unit => !unit.aura);
  const lloyd = enemy.filter(unit => normalize(unit.name) === "lloyd");
  if (lloyd.length) enemy = lloyd;
  if (enemy.length) return { owner: context.opponent, unit: [...enemy].sort((a, b) => fieldValue(b) - fieldValue(a))[0] };
  const allied = context.player.board.filter(unit => unit !== context.sourceUnit);
  if (!allied.length) return null;
  return { owner: context.player, unit: [...allied].sort((a, b) => fieldValue(a) - fieldValue(b))[0] };
}

function transformedUnit(owner, oldUnit, card) {
  const attack = Number(card.attack) || 0;
  const defense = Number(card.defense) || 0;
  const keywords = [...(card.keywords ?? [])];
  const follower = card.type === "Follower";
  return {
    uid: `${owner.name}-transform-${owner.nextSerial++}`,
    cardId: Number(card.id), card, name: card.name, image: card.image, type: card.type,
    attack: follower ? attack : 0, defense: follower ? defense : 0, maxDefense: follower ? defense : 0,
    keywords,
    barrier: hasKeywordCard(card, "Barrier") ? 1 : 0,
    ambush: hasKeywordCard(card, "Ambush"), aura: hasKeywordCard(card, "Aura"), intimidate: hasKeywordCard(card, "Intimidate"),
    summonedThisTurn: oldUnit.summonedThisTurn,
    canAttackLeader: follower && hasKeywordCard(card, "Storm"),
    canAttackFollower: follower && (hasKeywordCard(card, "Storm") || hasKeywordCard(card, "Rush")),
    attacked: follower ? false : true, attacksMade: 0, maxAttacks: 1,
    evolved: false, superEvolved: false, reactedThisTurn: false, engagedThisTurn: false
  };
}

function chooseDiscard(hand) {
  return [...hand]
    .sort((a, b) => (Number(b.card.cost) || 0) - (Number(a.card.cost) || 0) || String(a.card.name).localeCompare(String(b.card.name)))[0] ?? null;
}

function drawMatching(context, predicate, excludedNames) {
  const index = context.player.deck.findIndex(instance => predicate(instance) && !excludedNames.has(normalize(instance.card.name)));
  if (index < 0) return null;
  const [instance] = context.player.deck.splice(index, 1);
  context.stats.draws[context.playerIndex] += 1;
  if (context.player.hand.length >= 9) {
    context.player.cemetery.push(instance);
    context.stats.cardsBurned[context.playerIndex] += 1;
  } else {
    context.player.hand.push(instance);
  }
  return instance;
}

function superEvolveByAbility(context, unit) {
  if (unit.superEvolved) return [];
  unit.attack += 3;
  unit.defense += 3;
  unit.maxDefense += 3;
  unit.canAttackFollower = true;
  unit.evolved = true;
  unit.superEvolved = true;
  context.player.evolutionsThisMatch = (Number(context.player.evolutionsThisMatch) || 0) + 1;
  context.stats.superEvolutions[context.playerIndex] += 1;
  return [`Super Skybound Art · super-evolve ${unit.name}`];
}

function skyboundCount(player) {
  return (Number(player.personalTurn) || 0) + (Number(player.evolutionsThisMatch) || 0);
}

function gainCrestDirect(player, name, card) {
  if ((player.crests ?? []).some(crest => normalize(crest.name) === normalize(name))) return false;
  if ((player.crests ?? []).length >= 5) return false;
  player.crests.push({ name, card });
  return true;
}

function healLeader(player, amount, stats, playerIndex) {
  const healed = Math.max(0, Math.min(Number(amount) || 0, player.maxHp - player.hp));
  player.hp += healed;
  stats.healing[playerIndex] += healed;
  return healed;
}

function fieldValue(unit) {
  if (unit.type === "Follower") return (Number(unit.attack) || 0) + (Number(unit.defense) || 0) + (hasKeyword(unit, "Ward") ? 2 : 0);
  return 4;
}

function relatedCardByName(card, name) {
  const target = normalize(name);
  return (card?.__relatedCardObjects ?? []).find(related => normalize(related.name) === target) ?? null;
}

function recordArtifactEntry(player, unit) {
  if (!Array.isArray(player.artifactFollowerNamesEntered)) player.artifactFollowerNamesEntered = [];
  const name = normalize(unit?.name ?? unit?.card?.name);
  if (name && !player.artifactFollowerNamesEntered.includes(name)) player.artifactFollowerNamesEntered.push(name);
}

function artifactEntryCount(player) {
  return Array.isArray(player?.artifactFollowerNamesEntered) ? player.artifactFollowerNamesEntered.length : 0;
}

function giveUnitKeyword(unit, keyword) {
  if (!unit.keywords) unit.keywords = [];
  if (hasKeyword(unit, keyword)) return false;
  unit.keywords.push(keyword);
  if (keyword === "Barrier") unit.barrier = 1;
  if (keyword === "Aura") unit.aura = true;
  if (keyword === "Ambush") unit.ambush = true;
  if (keyword === "Intimidate") unit.intimidate = true;
  if (keyword === "Storm") { unit.canAttackLeader = true; unit.canAttackFollower = true; }
  if (keyword === "Rush") unit.canAttackFollower = true;
  return true;
}

function recordRuleGap(context) {
  const stats = context?.stats;
  if (!stats) return;
  if (!Array.isArray(stats.ruleGapsByCard)) stats.ruleGapsByCard = [{}, {}];
  const playerIndex = Number(context.playerIndex) === 1 ? 1 : 0;
  if (!stats.ruleGapsByCard[playerIndex]) stats.ruleGapsByCard[playerIndex] = {};
  const sourceName = String(context.card?.name ?? context.sourceUnit?.name ?? "Unknown");
  const bucket = stats.ruleGapsByCard[playerIndex];
  bucket[sourceName] = (Number(bucket[sourceName]) || 0) + 1;
}

function hasKeyword(unit, keyword) { return (unit.keywords ?? []).some(value => normalize(value) === normalize(keyword)); }
function hasKeywordCard(card, keyword) { return (card.keywords ?? []).some(value => normalize(value) === normalize(keyword)); }
function containsHook(text, hook) { return String(text).toLowerCase().includes(hook); }
function stripHook(text, hook) { return String(text).replace(new RegExp(escapeRegex(hook), "gi"), " ").replace(/\s+/g, " ").trim(); }
function normalize(value) { return String(value ?? "").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim(); }
function escapeRegex(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
