const WORD_NUMBERS = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10
};

const SUPPORTED_KEYWORDS = new Set([
  "ward",
  "rush",
  "storm",
  "bane",
  "drain",
  "fanfare",
  "last words",
  "strike",
  "evolve",
  "super-evolve",
  "enhance",
  "accelerate",
  "spellboost",
  "necromancy",
  "overflow",
  "combo",
  "countdown"
]);

const HARD_UNSUPPORTED = [
  ["Crest", /\bcrest\b/i],
  ["Fuse", /\bfuse\b/i],
  ["Transmute", /\btransmute\b/i],
  ["Engage", /\bengage\b/i],
  ["Earth Rite", /\bearth rite\b/i],
  ["Reanimate", /\breanimate\b/i],
  ["Departed", /\bdeparted\b/i],
  ["Mode selection", /select a mode|choose (?:one|two|a mode)/i],
  ["Persistent leader effect", /your leader (?:has|gains)|for the rest of this match|until the end of the match/i],
  ["Reactive trigger", /\bwhenever\b|when(?:ever)? an? (?:allied|enemy) .* (?:comes into play|leaves play|is destroyed)/i],
  ["Damage prevention", /reduce .* damage|prevent .* damage|can't take more than|cannot take more than/i],
  ["Copy/transform", /\bcopy\b|\btransform\b/i]
];

const EFFECT_PATTERNS = [
  ["Draw", /\bdraw (?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+) cards?\b/i],
  ["Heal", /\b(?:restore|recover) (?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+) defense to your leader\b/i],
  ["Leader damage", /\bdeal (?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+) damage to (?:the )?enemy leader\b/i],
  ["Follower damage", /\bdeal (?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+) damage to (?:an|a|the|a random|random) enemy follower\b/i],
  ["Board damage", /\bdeal (?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+) damage to (?:all|each) enemy followers?\b/i],
  ["Destroy", /\bdestroy (?:an|a|the|a random|random) enemy follower\b/i],
  ["Banish", /\bbanish (?:an|a|the|a random|random) enemy follower\b/i],
  ["Bounce", /\breturn (?:an|a|the|a random|random) enemy follower to (?:its owner's|their) hand\b/i],
  ["Buff", /(?:give|gain) .*?\+\d+\s*\/\s*\+\d+/i],
  ["Summon", /\bsummon\b/i],
  ["Generate", /\b(?:add|put)\b.*\b(?:to|into) your hand\b/i],
  ["Ramp", /increase your maximum play points by 1|gain an empty play point orb/i],
  ["PP recovery", /restore (?:a|an|one|two|three|four|five|\d+) play points?|recover (?:a|an|one|two|three|four|five|\d+) play points?/i],
  ["Countdown", /\bcountdown\b/i],
  ["Enhance", /\benhance\b/i],
  ["Accelerate", /\baccelerate\b/i],
  ["Spellboost", /\bspellboost\b/i],
  ["Necromancy", /\bnecromancy\b/i],
  ["Combo", /\bcombo\b/i],
  ["Overflow", /\boverflow\b/i],
  ["Last Words", /\blast words\b/i],
  ["Strike", /\bstrike\b/i],
  ["Evolve trigger", /(?:^|[.\n ])evolve\s*:/i],
  ["Super-Evolve trigger", /super-evolve\s*:/i]
];

export function analyzeCardSupport(card) {
  if (!card) return { level: "unsupported", reason: "Missing card", mechanics: [] };

  const text = normalizeText(card.text);
  const mechanics = new Set();
  const unsupported = [];
  const combatKeywords = new Set(["ward", "rush", "storm", "bane", "drain"]);
  let hasCombatModel = false;

  for (const keyword of card.keywords ?? []) {
    const normalized = String(keyword).toLowerCase().trim();
    if (SUPPORTED_KEYWORDS.has(normalized)) {
      mechanics.add(keyword);
      if (combatKeywords.has(normalized)) hasCombatModel = true;
    } else {
      unsupported.push(keyword);
    }
  }

  for (const [label, pattern] of EFFECT_PATTERNS) {
    if (pattern.test(text)) mechanics.add(label);
  }

  for (const [label, pattern] of HARD_UNSUPPORTED) {
    if (pattern.test(text)) unsupported.push(label);
  }

  const executable = /\bdraw (?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+) cards?\b|\b(?:restore|recover) (?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+) defense to your leader\b|\bdeal (?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+) damage to (?:the enemy leader|enemy leader|(?:an|a|the|a random|random) enemy follower|(?:all|each) enemy followers?)\b|\b(?:destroy|banish) (?:an|a|the|a random|random) enemy follower\b|\breturn (?:an|a|the|a random|random) enemy follower to (?:its owner's|their) hand\b|(?:give|gain) .*?\+\d+\s*\/\s*\+\d+|\bsummon\b|\b(?:add|put)\b.*\b(?:to|into) your hand\b|increase your maximum play points by 1|gain an empty play point orb|\b(?:restore|recover) (?:a|an|one|two|three|four|five|\d+) play points?\b|\bcountdown\s*\(?\s*\d+|spellboost\s*:\s*subtract\s+(?:one|1|\d+)\s+from (?:this card's|the) cost/i.test(text);

  const unsupportedSpellboost = /\bspellboost\b/i.test(text) && !/spellboost\s*:\s*subtract\s+(?:one|1|\d+)\s+from (?:this card's|the) cost/i.test(text);
  if (unsupportedSpellboost) unsupported.push("Spellboost scaling");

  if (!text) {
    if (card.type === "Follower" && unsupported.length === 0) {
      return { level: "full", reason: "Base follower combat", mechanics: [...mechanics] };
    }
    return { level: unsupported.length ? "partial" : "full", reason: unsupported.length ? `Unmodeled: ${unique(unsupported).join(", ")}` : "No rules text", mechanics: [...mechanics] };
  }

  if (unsupported.length) {
    return {
      level: executable || hasCombatModel || card.type === "Follower" ? "partial" : "unsupported",
      reason: `Unmodeled: ${unique(unsupported).join(", ")}`,
      mechanics: [...mechanics]
    };
  }

  if (executable) {
    const conditional = /\bif\b|\bfor each\b|\btimes? this match\b|cards? played this turn|followers? destroyed this match/i.test(text);
    return {
      level: conditional ? "partial" : "full",
      reason: conditional ? "Core effect is modeled; conditional scaling is approximate" : "Rules text is covered by generic Battle Sim rules",
      mechanics: [...mechanics]
    };
  }

  const keywordOnlyText = text.replace(/\b(?:fanfare|ward|rush|storm|bane|drain)\b\s*:*/gi, "").replace(/[.,;\s]/g, "").length === 0;
  if (keywordOnlyText && (hasCombatModel || card.type === "Follower")) {
    return { level: "full", reason: "Base combat keyword is modeled", mechanics: [...mechanics] };
  }

  if (hasCombatModel || card.type === "Follower") {
    return { level: "partial", reason: "Base follower combat is modeled; rules text still has approximations", mechanics: [...mechanics] };
  }

  return { level: "unsupported", reason: "No executable rule recognized yet", mechanics: [...mechanics] };
}

export function getPlayModes(instance, player) {
  const card = instance?.card;
  if (!card) return [];

  const text = normalizeText(card.text);
  const baseCost = getBaseCost(instance);
  const modes = [];

  if (baseCost <= player.pp && canOccupyBoard(card, player)) {
    modes.push({ kind: "base", cost: baseCost, text: getBasePlayText(text), scoreBonus: 0 });
  }

  const enhance = firstNumber(text, /\benhance\s*\(?\s*(\d+)\s*\)?\s*:/i);
  if (enhance != null && enhance <= player.pp && canOccupyBoard(card, player)) {
    modes.push({ kind: "enhance", cost: enhance, text: extractTriggerText(text, `enhance ${enhance}`), scoreBonus: 4 + Math.max(0, enhance - baseCost) * .6 });
  }

  const accelerate = firstNumber(text, /\baccelerate\s*\(?\s*(\d+)\s*\)?\s*:/i);
  if (accelerate != null && accelerate <= player.pp) {
    modes.push({ kind: "accelerate", cost: accelerate, text: extractTriggerText(text, `accelerate ${accelerate}`), scoreBonus: baseCost > player.pp ? 5 : -1 });
  }

  return modes.sort((a, b) => b.scoreBonus - a.scoreBonus || b.cost - a.cost);
}

export function getBaseCost(instance) {
  const card = instance?.card;
  if (!card) return 0;
  let cost = Number(card.cost) || 0;
  cost += Number(instance.costDelta) || 0;

  const text = normalizeText(card.text);
  const reduction = firstNumber(text, /spellboost\s*:\s*subtract\s+(\d+)\s+from (?:this card's|the) cost/i)
    ?? (/spellboost\s*:\s*subtract\s+(?:one|1)\s+from (?:this card's|the) cost/i.test(text) ? 1 : 0);

  if (reduction > 0) cost -= (Number(instance.spellboost) || 0) * reduction;
  return Math.max(0, cost);
}

export function getTriggeredText(card, event, mode = null) {
  const text = normalizeText(card?.text);
  if (!text) return "";

  if (mode?.kind === "enhance" || mode?.kind === "accelerate") return mode.text || "";

  const aliases = {
    lastWords: ["last words"],
    strike: ["strike"],
    evolve: ["evolve"],
    superEvolve: ["super-evolve"],
    turnStart: ["at the start of your turn"],
    turnEnd: ["at the end of your turn"]
  };

  const labels = aliases[event];
  if (!labels) return "";
  for (const label of labels) {
    const found = extractTriggerText(text, label);
    if (found) return found;
  }
  return "";
}

export function getBasePlayText(textValue) {
  const text = normalizeText(textValue);
  if (!text) return "";

  const markers = findMarkers(text).filter(marker => marker.label !== "fanfare");
  if (!markers.length) return text.replace(/^fanfare\s*:\s*/i, "").trim();

  const firstDeferred = markers[0];
  return text.slice(0, firstDeferred.start).replace(/^fanfare\s*:\s*/i, "").trim();
}

export function getCountdown(card) {
  const text = normalizeText(card?.text);
  const match = text.match(/\bcountdown\s*\(?\s*(\d+)\s*\)?/i);
  return match ? Number(match[1]) : null;
}

export function resolveConditionalText(textValue, context) {
  let text = normalizeText(textValue);
  if (!text) return { text: "", active: true, notes: [] };
  const notes = [];

  const necro = text.match(/\bnecromancy\s*\(?\s*(\d+)\s*\)?\s*:\s*(.*)$/i);
  if (necro) {
    const need = Number(necro[1]);
    if ((context.player.shadows ?? 0) < need) return { text: "", active: false, notes: [`Necromancy ${need} unavailable`] };
    context.player.shadows -= need;
    text = necro[2];
    notes.push(`Necromancy ${need}`);
  }

  const combo = text.match(/\bcombo\s*\(?\s*(\d+)\s*\)?\s*:\s*(.*)$/i);
  if (combo) {
    const need = Number(combo[1]);
    if ((context.player.cardsPlayedThisTurn ?? 0) < need) return { text: "", active: false, notes: [`Combo ${need} unavailable`] };
    text = combo[2];
    notes.push(`Combo ${need}`);
  }

  const overflowPrefix = text.match(/\boverflow\s*:\s*(.*)$/i);
  if (overflowPrefix) {
    if ((context.player.maxPp ?? 0) < 7) return { text: "", active: false, notes: ["Overflow inactive"] };
    text = overflowPrefix[1];
    notes.push("Overflow");
  }

  if (/if overflow is active/i.test(text)) {
    if ((context.player.maxPp ?? 0) < 7) {
      text = text.replace(/if overflow is active[^.]*\.?/i, "");
    } else {
      text = text.replace(/if overflow is active[, ]*/i, "");
      notes.push("Overflow");
    }
  }

  return { text: text.trim(), active: Boolean(text.trim()), notes };
}

export function executeGenericEffects(textValue, context) {
  const conditional = resolveConditionalText(textValue, context);
  const text = conditional.text;
  const actions = [...conditional.notes];
  if (!conditional.active || !text) return { applied: false, actions, unresolved: Boolean(textValue) };

  let applied = false;
  let matched = false;

  for (const match of text.matchAll(/\bdraw (a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+) cards?\b/gi)) {
    matched = true;
    const amount = wordNumber(match[1]);
    if (amount > 0) {
      const drawn = context.draw(context.player, amount, context.playerIndex);
      actions.push(`draw ${drawn}`);
      applied = true;
    }
  }

  for (const match of text.matchAll(/\b(?:restore|recover) (a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+) defense to your leader\b/gi)) {
    matched = true;
    const amount = wordNumber(match[1]);
    if (amount > 0) {
      const healed = Math.max(0, Math.min(amount, context.player.maxHp - context.player.hp));
      context.player.hp += healed;
      context.stats.healing[context.playerIndex] += healed;
      actions.push(`heal ${healed}`);
      applied = true;
    }
  }

  for (const match of text.matchAll(/\bdeal (a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+) damage to (?:the )?enemy leader\b/gi)) {
    matched = true;
    const amount = wordNumber(match[1]);
    if (amount > 0) {
      const beforeHp = context.opponent.hp;
      context.opponent.hp -= amount;
      const dealt = Math.max(0, beforeHp - context.opponent.hp);
      context.stats.damageDealt[context.playerIndex] += dealt;
      actions.push(`${dealt} leader damage`);
      applied = true;
    }
  }

  for (const match of text.matchAll(/\bdeal (a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+) damage to (?:all|each) enemy followers?\b/gi)) {
    matched = true;
    const amount = wordNumber(match[1]);
    if (amount > 0) {
      for (const unit of context.opponent.board.filter(unit => unit.type === "Follower")) unit.defense -= amount;
      context.cleanup(context.opponent, context.enemyIndex);
      actions.push(`${amount} to all enemy followers`);
      applied = true;
    }
  }

  for (const match of text.matchAll(/\bdeal (a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+) damage to (?:an|a|the|a random|random) enemy follower\b/gi)) {
    matched = true;
    const amount = wordNumber(match[1]);
    const target = context.chooseEnemyFollower(context.opponent.board);
    if (amount > 0 && target) {
      target.defense -= amount;
      actions.push(`${amount} to ${target.name}`);
      context.cleanup(context.opponent, context.enemyIndex);
      applied = true;
    }
  }

  if (/\bdestroy (?:an|a|the|a random|random) enemy follower\b/i.test(text)) {
    matched = true;
    const target = context.chooseEnemyFollower(context.opponent.board);
    if (target) {
      target.defense = 0;
      actions.push(`destroy ${target.name}`);
      context.cleanup(context.opponent, context.enemyIndex);
      applied = true;
    }
  }

  if (/\bbanish (?:an|a|the|a random|random) enemy follower\b/i.test(text)) {
    matched = true;
    const target = context.chooseEnemyFollower(context.opponent.board);
    if (target) {
      context.banish(context.opponent, target);
      actions.push(`banish ${target.name}`);
      applied = true;
    }
  }

  if (/\breturn (?:an|a|the|a random|random) enemy follower to (?:its owner's|their) hand\b/i.test(text)) {
    matched = true;
    const target = context.chooseEnemyFollower(context.opponent.board);
    if (target) {
      context.returnToHand(context.opponent, target);
      actions.push(`return ${target.name}`);
      applied = true;
    }
  }

  for (const match of text.matchAll(/\b(?:give|gain) (?:this follower|it|an allied follower|a random allied follower|another allied follower) \+(\d+)\s*\/\s*\+(\d+)/gi)) {
    matched = true;
    const attack = Number(match[1]);
    const defense = Number(match[2]);
    const sourceOnly = /this follower|\bit\b/i.test(match[0]);
    const target = sourceOnly ? context.sourceUnit : context.chooseAlliedFollower(context.player.board, context.sourceUnit);
    if (target) {
      context.buffUnit(target, attack, defense);
      actions.push(`+${attack}/+${defense} ${target.name}`);
      applied = true;
    }
  }

  for (const match of text.matchAll(/\bgive (?:all|each) allied followers? \+(\d+)\s*\/\s*\+(\d+)/gi)) {
    matched = true;
    const attack = Number(match[1]);
    const defense = Number(match[2]);
    const targets = context.player.board.filter(unit => unit.type === "Follower");
    for (const target of targets) context.buffUnit(target, attack, defense);
    if (targets.length) {
      actions.push(`+${attack}/+${defense} allied board`);
      applied = true;
    }
  }

  for (const match of text.matchAll(/\bgive (?:a|an|one) follower in your hand \+(\d+)\s*\/\s*\+(\d+)/gi)) {
    matched = true;
    const target = context.chooseHandFollower(context.player.hand);
    if (target) {
      context.buffHand(target, Number(match[1]), Number(match[2]));
      actions.push(`buff ${target.card.name} in hand`);
      applied = true;
    }
  }

  for (const match of text.matchAll(/\bgive (?:all|each) followers? in your hand \+(\d+)\s*\/\s*\+(\d+)/gi)) {
    matched = true;
    const attack = Number(match[1]);
    const defense = Number(match[2]);
    const targets = context.player.hand.filter(instance => instance.card.type === "Follower");
    for (const target of targets) context.buffHand(target, attack, defense);
    if (targets.length) {
      actions.push(`buff ${targets.length} hand followers`);
      applied = true;
    }
  }

  if (/increase your maximum play points by 1|gain an empty play point orb/i.test(text)) {
    matched = true;
    const before = context.player.maxPp;
    context.player.maxPp = Math.min(10, context.player.maxPp + 1);
    if (context.player.maxPp > before) {
      actions.push("+1 max PP");
      applied = true;
    }
  }

  for (const match of text.matchAll(/\b(?:restore|recover) (a|an|one|two|three|four|five|\d+) play points?\b/gi)) {
    matched = true;
    const amount = wordNumber(match[1]);
    const before = context.player.pp;
    context.player.pp = Math.min(context.player.maxPp, context.player.pp + amount);
    const restored = context.player.pp - before;
    if (restored > 0) {
      actions.push(`restore ${restored} PP`);
      applied = true;
    }
  }

  const related = context.relatedCards(context.card);
  for (const target of related) {
    const name = normalizeText(target.name);
    if (!name || !text.includes(name)) continue;
    const escaped = escapeRegex(name);

    const summonRe = new RegExp(`summon\\s+(?:(a|an|one|two|three|four|five|\\d+)\\s+)?(?:an?\\s+)?${escaped}`, "i");
    const summon = text.match(summonRe);
    if (summon) {
      matched = true;
      const amount = wordNumber(summon[1] || "one") || 1;
      const count = context.summon(context.player, target, amount, context.playerIndex);
      if (count) {
        actions.push(`summon ${count} ${target.name}`);
        context.stats.cardsGenerated[context.playerIndex] += count;
        applied = true;
      }
    }

    const handRe = new RegExp(`(?:add|put)\\s+(?:(a|an|one|two|three|four|five|\\d+)\\s+)?(?:an?\\s+)?${escaped}[^.]{0,45}(?:to|into) your hand`, "i");
    const hand = text.match(handRe);
    if (hand) {
      matched = true;
      const amount = wordNumber(hand[1] || "one") || 1;
      const count = context.addToHand(context.player, target, amount, context.playerIndex);
      if (count) {
        actions.push(`add ${count} ${target.name}`);
        context.stats.cardsGenerated[context.playerIndex] += count;
        applied = true;
      }
    }
  }

  return { applied, actions, unresolved: !matched && Boolean(text) };
}

function canOccupyBoard(card, player) {
  if (card.type === "Spell") return true;
  return player.board.length < 5;
}

function findMarkers(text) {
  const re = /(last words|strike|super-evolve|evolve|at the start of your turn|at the end of your turn|enhance\s*\(?\s*\d+\s*\)?|accelerate\s*\(?\s*\d+\s*\)?|fanfare)\s*:/gi;
  const out = [];
  let match;
  while ((match = re.exec(text))) {
    out.push({ label: match[1].toLowerCase().replace(/\s+/g, " "), start: match.index, end: re.lastIndex });
  }
  return out;
}

function extractTriggerText(text, label) {
  const normalizedLabel = normalizeText(label).replace(/[()]/g, "").replace(/\s+/g, " ");
  const markers = findMarkers(text);
  const marker = markers.find(item => item.label.replace(/[()]/g, "").replace(/\s+/g, " ") === normalizedLabel);
  if (!marker) return "";
  const next = markers.find(item => item.start > marker.start);
  return text.slice(marker.end, next?.start ?? text.length).trim();
}

function firstNumber(text, pattern) {
  const match = text.match(pattern);
  return match ? Number(match[1]) : null;
}

function wordNumber(value) {
  const normalized = String(value ?? "").toLowerCase();
  if (/^\d+$/.test(normalized)) return Number(normalized);
  return WORD_NUMBERS[normalized] ?? 0;
}

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function unique(values) {
  return [...new Set(values.map(String).filter(Boolean))];
}
