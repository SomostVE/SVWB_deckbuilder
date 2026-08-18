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
  const base = core.getTriggeredText(card, event, mode);
  if (base) return base;
  // [[battle-natural-evolve-trigger-v5]]
  if (event === "evolve") {
    const text = String(card?.text ?? "").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
    const reactive = text.match(/when this follower evolves,\s*([^.]*(?:\.|$))/i);
    if (reactive) return reactive[1].trim();
  }
  return "";
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

  const result = core.executeGenericEffects(text.trim(), wrappedContext);
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
    }
    if (name === "wilbert, desolate paladin" && hasKeyword(unit, "Ward")) {
      const before = { attack: Number(unit.attack) || 0, defense: Number(unit.defense) || 0 };
      context.buffUnit(unit, 1, 2);
      actions.push(`Wilbert Crest: +1/+2 ${unit.name}`);
      actions.push(...applyBuffedFollowerEffects(context, unit, before));
    }
  }

  // [[battle-swordcraft-amulet-entry-rules]]
  for (const source of context.player.board ?? []) {
    if (source.type !== "Amulet" || normalize(source.name) !== "ancestral crown") continue;
    const before = { attack: Number(unit.attack) || 0, defense: Number(unit.defense) || 0 };
    context.buffUnit(unit, 1, 1);
    actions.push(`Ancestral Crown: +1/+1 ${unit.name}`);
    actions.push(...applyBuffedFollowerEffects(context, unit, before));
  }

  for (const source of context.player.board ?? []) {
    if (source === unit || source.type !== "Follower") continue;
    const name = normalize(source.name);

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
    if (name === "gildaria, anathema of attunement" && context.player.isActive) {
      if (giveUnitKeyword(unit, "Rush")) actions.push(`Gildaria: ${unit.name} gains Rush`);
    }
    if (name === "mars, conflagrant commander" && isOfficer) {
      context.buffUnit(unit, 2, 0);
      giveUnitKeyword(unit, "Rush");
      context.buffUnit(source, 1, 0);
      actions.push(`Mars: +2/+0 and Rush ${unit.name} · +1/+0 Mars`);
    }

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
    const active = skyboundCount(context) >= threshold;
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
    if (skyboundCount(context) >= threshold && context.sourceUnit) {
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


  // [[battle-focus-rules-v5]]
  if (cardName === "lovestruck puppeteer" || cardName === "cool courier") {
    const replicate = /replicate the effects of this card'?s Fanfare ability\.?/i;
    if (replicate.test(text)) {
      const generatedName = cardName === "lovestruck puppeteer" ? "Puppet" : "Ancient Artifact";
      const generated = relatedCardByName(context.card, generatedName);
      if (generated && typeof context.addToHand === "function") {
        const count = context.addToHand(context.player, generated, 1, context.playerIndex);
        if (count) {
          context.stats.cardsGenerated[context.playerIndex] += count;
          actions.push(`${context.card.name}: replicate Fanfare · add ${generated.name}`);
        }
        text = text.replace(replicate, " ");
        applied = true;
      }
    }
  }

  if (cardName === "puppet cat") {
    const conditionalPuppet = /if there(?:'|’)s a super-evolved allied follower on the field,\s*add a Puppet to your hand and give it \+3\/\+0\.?/i;
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
    const banishCard = /select an enemy card on the field and banish it\.?/i;
    if (banishCard.test(text)) {
      const targets = context.opponent.board.filter(unit => !unit.aura);
      const target = [...targets].sort((a, b) => fieldValue(b) - fieldValue(a))[0] ?? null;
      if (target && context.banish(context.opponent, target)) actions.push(`Odin: banish ${target.name}`);
      text = text.replace(banishCard, " ");
      applied = true;
    }
  }

  if (cardName === "serene sanctuary") {
    const advance = /advance this amulet'?s count by 1\.?/i;
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
    const buffOthers = /give all other allied followers on the field \+2\/\+4\.?/i;
    if (buffOthers.test(text)) {
      const targets = context.player.board.filter(unit => unit.type === "Follower" && unit !== context.sourceUnit);
      for (const target of targets) context.buffUnit(target, 2, 4);
      actions.push(`Jeanne: +2/+4 to ${targets.length} other allied follower${targets.length === 1 ? "" : "s"}`);
      text = text.replace(buffOthers, " ");
      applied = true;
    }
  }

  if (cardName === "olivia, proud dark angel") {
    const recoverSep = /recover 2 super-evolution points?\.?/i;
    if (recoverSep.test(text)) {
      const before = Number(context.player.sep) || 0;
      context.player.sep = Math.min(2, before + 2);
      actions.push(`Olivia: recover ${context.player.sep - before} SEP`);
      text = text.replace(recoverSep, " ");
      applied = true;
    }
  }

  // [[battle-asher-v5]]
  if (cardName === "asher & lydia, paths beyond") {
    const enemyWard = /select an enemy follower on the field and give it Ward\.?/i;
    if (enemyWard.test(text)) {
      const target = context.chooseEnemyFollower?.(context.opponent.board) ?? null;
      if (target && giveUnitKeyword(target, "Ward")) actions.push(`Asher & Lydia: give Ward to ${target.name}`);
      text = text.replace(enemyWard, " ");
      applied = true;
    }

    const enhanceSelf = /evolve this follower and give it Storm\.?/i;
    if (enhanceSelf.test(text)) {
      if (context.sourceUnit) {
        context.evolveUnitByAbility?.(context.sourceUnit);
        giveUnitKeyword(context.sourceUnit, "Storm");
        actions.push("Asher & Lydia: evolve and gain Storm");
      }
      text = text.replace(enhanceSelf, " ");
      applied = true;
    }

    const destroyWards = /destroy 2 random enemy followers with Ward\.?/i;
    if (destroyWards.test(text)) {
      const candidates = context.opponent.board.filter(unit => unit.type === "Follower" && hasKeyword(unit, "Ward"));
      const destroyed = [];
      for (let index = 0; index < 2 && candidates.length; index += 1) {
        const roll = Math.max(0, Math.min(candidates.length - 1, Math.floor((context.rng?.() ?? 0) * candidates.length)));
        const [target] = candidates.splice(roll, 1);
        target.defense = 0;
        destroyed.push(target.name);
      }
      if (destroyed.length) context.cleanup?.(context.opponent, context.enemyIndex);
      if (destroyed.length) actions.push(`Asher & Lydia: destroy ${destroyed.join(" + ")}`);
      text = text.replace(destroyWards, " ");
      applied = true;
    }
  }

  // [[battle-ability-evolve-v5]]
  if (cardName === "eudie, your dependable mentor") {
    const evolveOther = /select another unevolved allied follower on the field and evolve it\.?/i;
    if (evolveOther.test(text)) {
      const target = context.player.board
        .filter(unit => unit.type === "Follower" && unit !== context.sourceUnit && !unit.evolved && !unit.superEvolved)
        .sort((a, b) => fieldValue(b) - fieldValue(a))[0] ?? null;
      if (target && typeof context.evolveUnitByAbility === "function" && context.evolveUnitByAbility(target)) {
        actions.push(`Eudie: evolve ${target.name}`);
      }
      text = text.replace(evolveOther, " ");
      applied = true;
    }
  }

  // [[battle-coverage-100-card-rules]]
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
    const artifactCountText = /X is the number of differently named allied Artifact followers that have entered the field this match\.?/i;
    if (artifactCountText.test(text)) {
      actions.push(`Scarlet: X=${artifactEntryCount(context.player)}`);
      text = text.replace(artifactCountText, "").trim();
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
  // [[battle-transform-leave-hook]]
  context.notifyLeaveField?.(selected.owner, selected.unit);
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
  if (unit.evolved || unit.superEvolved) return [];
  unit.attack += 3;
  unit.defense += 3;
  unit.maxDefense += 3;
  unit.canAttackFollower = true;
  unit.evolved = true;
  unit.superEvolved = true;
  context.player.evolutionsThisMatch = (Number(context.player.evolutionsThisMatch) || 0) + 1;
  context.recordHandEvolution?.();
  context.stats.superEvolutions[context.playerIndex] += 1;
  return [`Super Skybound Art · super-evolve ${unit.name}`];
}

function skyboundCount(context) {
  return (Number(context.player?.personalTurn) || 0) + (Number(context.instance?.skyboundEvolutions) || 0);
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
  const x = artifactEntryCount(player);
  for (const instance of [...(player.hand ?? []), ...(player.deck ?? [])]) {
    if (normalize(instance?.card?.name) === "scarlet, anathema of dislocation") instance.x = x;
  }
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
