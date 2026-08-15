import * as core from "./battle-rules-core.js";

export * from "./battle-rules-core.js";

const ENTRY_HOOK = "[[battle-entry-hook]]";
const GAP_HOOK = "[[battle-rule-gap-hook]]";
const TURN_END_HOOK = "[[battle-crest-turn-end-hook]]";

export function getTriggeredText(card, event, mode = null) {
  const base = core.getTriggeredText(card, event, mode);
  if (event !== "turnEnd") return base;
  return `${base ? `${base} ` : ""}${TURN_END_HOOK}`.trim();
}

export function executeGenericEffects(textValue, context) {
  let text = String(textValue ?? "");
  const actions = [];
  let applied = false;
  let gapEncountered = false;

  if (containsHook(text, GAP_HOOK)) {
    text = stripHook(text, GAP_HOOK);
    context.stats.unsupportedEffects[context.playerIndex] += 1;
    gapEncountered = true;
  }

  if (containsHook(text, ENTRY_HOOK)) {
    text = stripHook(text, ENTRY_HOOK);
    const entryActions = applyEntryCrestEffects(context, context.sourceUnit);
    if (entryActions.length) {
      actions.push(...entryActions);
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

  const superEvolvedCondition = text.match(/if there(?:'|’)s a super-evolved allied follower on the field,\s*(.*)$/i);
  if (superEvolvedCondition) {
    text = context.player.board.some(unit => unit.type === "Follower" && unit.superEvolved)
      ? superEvolvedCondition[1]
      : "";
  }

  const wrappedContext = {
    ...context,
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
      }
      return count;
    }
  };

  const result = core.executeGenericEffects(text, wrappedContext);
  return {
    applied: applied || result.applied,
    actions: unique([...actions, ...(result.actions ?? [])]),
    unresolved: gapEncountered || result.unresolved
  };
}

export function applyEntryCrestEffects(context, unit) {
  if (!unit || unit.type !== "Follower" || unit.__entryCrestsApplied) return [];
  unit.__entryCrestsApplied = true;
  const actions = [];

  for (const crest of context.player.crests ?? []) {
    const name = normalize(crest.name);
    if (name === "wilbert, desolate paladin" && hasKeyword(unit, "Ward")) {
      context.buffUnit(unit, 1, 2);
      actions.push(`Wilbert Crest: +1/+2 ${unit.name}`);
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
      const leaderHeal = Math.max(0, Math.min(1, player.maxHp - player.hp));
      player.hp += leaderHeal;
      context.stats.healing[context.playerIndex] += leaderHeal;
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

function containsHook(text, hook) {
  return String(text).toLowerCase().includes(hook);
}

function stripHook(text, hook) {
  return String(text).replace(new RegExp(escapeRegex(hook), "gi"), " ").replace(/\s+/g, " ").trim();
}

function hasKeyword(unit, keyword) {
  return (unit.keywords ?? []).some(value => normalize(value) === normalize(keyword));
}

function normalize(value) {
  return String(value ?? "").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
