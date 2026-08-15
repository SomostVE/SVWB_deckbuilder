from pathlib import Path

path = Path('js/battle-engine-v5.js')
text = path.read_text(encoding='utf-8')


def repl(old, new, label):
    global text
    if old not in text:
        raise SystemExit(f'missing patch anchor: {label}')
    text = text.replace(old, new, 1)

# Full support is only declared alongside concrete runtime implementations below.
repl(
'''  ["edeth, voice of heaven", "Last Words resummon without Last Words and Super-Evolve destruction are modeled"]\n]);''',
'''  ["edeth, voice of heaven", "Last Words resummon without Last Words and Super-Evolve destruction are modeled"],\n  // [[battle-fuse-overrides]]\n  ["garden's allure", "Fuse material rules and fused draw replacement are modeled"],\n  ["gear of ambition", "Artifact-Amulet Fuse and Striker transformation are modeled"],\n  ["gear of remembrance", "Artifact-Amulet Fuse and Fortifier transformation are modeled"],\n  ["striker artifact", "Artifact Fuse cost tiers and Ominous transformations are modeled"],\n  ["fortifier artifact", "Artifact Fuse cost tiers and Ominous transformations are modeled"],\n  ["ominous artifact α", "Beta/Gamma Fuse tracking and Masterwork transformation are modeled"],\n  ["ancient cannon", "Whenever-you-Fuse damage trigger is modeled"],\n  ["returning slash", "Loot Fuse and fused draw bonus are modeled"],\n  ["congregant of usurpation", "Loot play/Fuse reactive damage is modeled"],\n  ["sinciro, heir to usurpation", "Loot Fuse distinct-name X and replicated Fanfare are modeled"]\n]);''',
'Fuse full overrides')

repl(
'''export function analyzeCardSupport(card) {\n  const base = analyzeCardSupportV4(card);\n  if (!card || base.level !== "partial") return base;\n  const override = FULL_OVERRIDES.get(norm(card.name));\n  return override ? { ...base, level: "full", reason: `Battle Sim v5: ${override}` } : base;\n}''',
'''export function analyzeCardSupport(card) {\n  const base = analyzeCardSupportV4(card);\n  if (!card) return base;\n  const override = FULL_OVERRIDES.get(norm(card.name));\n  return override ? { ...base, level: "full", reason: `Battle Sim v5: ${override}` } : base;\n}''',
'allow explicit full overrides for formerly unsupported mechanics')

repl(
'''      p.cardsPlayedThisTurn = 0;\n      p.spellsPlayedThisTurn = 0;\n      p.evolutionActionUsed = false;''',
'''      p.cardsPlayedThisTurn = 0;\n      p.spellsPlayedThisTurn = 0;\n      p.evolutionActionUsed = false;\n      // Fuse is usable once per turn per current Fuse card. A transformed card\n      // is a new Fuse card and resets this flag immediately in transformHandInstance.\n      for (const item of p.hand) item.fusedThisTurn = false;''',
'reset Fuse usage at turn start')

repl(
'''    evolutionsThisMatch: 0, evolutionActionUsed: false, nextSerial: 0, deck: [], hand: [], board: [], cemetery: [],\n    banished: [], destroyedFollowers: [], deckOut: false, isActive: false''',
'''    evolutionsThisMatch: 0, evolutionActionUsed: false, nextSerial: 0, deck: [], hand: [], board: [], cemetery: [],\n    banished: [], fusedCards: [], destroyedFollowers: [], deckOut: false, isActive: false''',
'player fused-card zone')

repl(
'''    damageDealt: pair(), cardsPlayed: pair(), attacks: pair(), draws: pair(), unsupportedEffects: pair(),\n    evolutions: pair(), superEvolutions: pair(), healing: pair(), followersLost: pair(), cardsGenerated: pair(),''',
'''    damageDealt: pair(), cardsPlayed: pair(), attacks: pair(), draws: pair(), unsupportedEffects: pair(),\n    evolutions: pair(), superEvolutions: pair(), healing: pair(), followersLost: pair(), cardsGenerated: pair(), cardsFused: pair(),''',
'Fuse stats')

repl(
'''    defenseBonus: 0,\n    skyboundEvolutions: 0,\n    x: initialX(card)''',
'''    defenseBonus: 0,\n    skyboundEvolutions: 0,\n    fusedThisTurn: false,\n    fusedCards: [],\n    fusedNames: [],\n    x: initialX(card)''',
'Fuse instance state')

# Prevent token Gears from being played and keep Fuse text out of normal play resolution.
repl(
'''function modes(inst, player) {\n  const card = inst.card;\n  const text = String(card.text ?? "");\n  const base = costOf(inst);''',
'''function modes(inst, player) {\n  const card = inst.card;\n  const text = String(card.text ?? "");\n  if (/\\bcan'?t be played\\b/i.test(text)) return [];\n  const base = costOf(inst);''',
'cannot-be-played mode guard')

repl(
'''function baseText(text) {\n  const fanfare = section(text, "fanfare");\n  if (fanfare) return fanfare;\n  const index = String(text).search(/\\b(?:Last Words|Strike|Clash|Evolve|Super-Evolve|Enhance|Accelerate|Crystallize|Engage|On Spellboost|At the start of your turn|At the end of your turn)\\s*\\(?\\s*\\d*\\s*\\)?\\s*:/i);\n  return index < 0 ? String(text) : String(text).slice(0, index).trim();\n}''',
'''function stripFuseAbilityText(textValue) {\n  return String(textValue ?? "")\n    .replace(/^\\s*Fuse\\s*:[^\\n]*(?:\\n+|$)/gim, "")\n    .replace(/^\\s*When you Fuse to this card,[^\\n]*(?:\\n+|$)/gim, "")\n    .replace(/^\\s*When you've Fused both to this card,[^\\n]*(?:\\n+|$)/gim, "")\n    .replace(/\\n{3,}/g, "\\n\\n")\n    .trim();\n}\n\nfunction baseText(text) {\n  const clean = stripFuseAbilityText(text);\n  const fanfare = section(clean, "fanfare");\n  if (fanfare) return fanfare;\n  const index = String(clean).search(/\\b(?:Last Words|Strike|Clash|Evolve|Super-Evolve|Enhance|Accelerate|Crystallize|Engage|On Spellboost|At the start of your turn|At the end of your turn)\\s*\\(?\\s*\\d*\\s*\\)?\\s*:/i);\n  return index < 0 ? String(clean) : String(clean).slice(0, index).trim();\n}''',
'strip Fuse ability text from play effects')

# Runtime decision: Fuse is a zero-PP hand action considered beside Play/Engage.
old_decision = '''    const playableBeforeDecision = getModesForHand(player).length;\n    const engage = bestEngage(player, opponent);\n    const play = bestPlay(player, opponent);\n    if (!engage && !play) {\n      if (playableBeforeDecision > 0) {\n        snap(frames, players, {\n          round,\n          active: playerIndex,\n          phase: "decision",\n          action: `${player.name} holds available cards for a stronger future turn.`\n        }, stats, record);\n      }\n      break;\n    }\n\n    if (engage && (!play || engage.score > play.score + .5)) {\n      const result = resolveEngage(engage.unit, player, opponent, playerIndex, enemyIndex, stats, rng, map);\n      snap(frames, players, { round, active: playerIndex, phase: "play", action: compact(`${player.name} engages ${engage.unit.name}${engage.cost ? ` (${engage.cost} PP)` : ""}.`, result.actions) }, stats, record);\n    } else {\n      const result = playCard(play.instance, play.mode, player, opponent, playerIndex, enemyIndex, stats, rng, map);\n      snap(frames, players, { round, active: playerIndex, phase: "play", action: compact(`${player.name} plays ${play.instance.card.name} (${play.mode.cost} PP${play.mode.kind !== "base" ? ` · ${cap(play.mode.kind)}` : ""}).`, result.actions) }, stats, record);\n    }'''
new_decision = '''    const playableBeforeDecision = getModesForHand(player).length;\n    const engage = bestEngage(player, opponent);\n    const play = bestPlay(player, opponent);\n    const fuse = bestFuse(player, opponent, map);\n    if (!engage && !play && !fuse) {\n      if (playableBeforeDecision > 0) {\n        snap(frames, players, {\n          round,\n          active: playerIndex,\n          phase: "decision",\n          action: `${player.name} holds available cards for a stronger future turn.`\n        }, stats, record);\n      }\n      break;\n    }\n\n    const playScore = Number(play?.score ?? -Infinity);\n    const engageScore = Number(engage?.score ?? -Infinity);\n    if (fuse && fuse.score >= Math.max(playScore, engageScore) + .25) {\n      const result = resolveFuseAction(fuse, player, opponent, playerIndex, enemyIndex, stats, rng, map);\n      snap(frames, players, { round, active: playerIndex, phase: "fuse", action: compact(`${player.name} Fuses ${fuse.materials.map(item => item.card.name).join(" + ")} into ${fuse.targetName}.`, result.actions) }, stats, record);\n    } else if (engage && (!play || engage.score > play.score + .5)) {\n      const result = resolveEngage(engage.unit, player, opponent, playerIndex, enemyIndex, stats, rng, map);\n      snap(frames, players, { round, active: playerIndex, phase: "play", action: compact(`${player.name} engages ${engage.unit.name}${engage.cost ? ` (${engage.cost} PP)` : ""}.`, result.actions) }, stats, record);\n    } else if (play) {\n      const result = playCard(play.instance, play.mode, player, opponent, playerIndex, enemyIndex, stats, rng, map);\n      snap(frames, players, { round, active: playerIndex, phase: "play", action: compact(`${player.name} plays ${play.instance.card.name} (${play.mode.cost} PP${play.mode.kind !== "base" ? ` · ${cap(play.mode.kind)}` : ""}).`, result.actions) }, stats, record);\n    } else if (fuse) {\n      const result = resolveFuseAction(fuse, player, opponent, playerIndex, enemyIndex, stats, rng, map);\n      snap(frames, players, { round, active: playerIndex, phase: "fuse", action: compact(`${player.name} Fuses ${fuse.materials.map(item => item.card.name).join(" + ")} into ${fuse.targetName}.`, result.actions) }, stats, record);\n    }'''
repl(old_decision, new_decision, 'runTurnAi Fuse decision')

fuse_helpers = r'''
// [[battle-fuse-v1]]
function fuseRequirement(inst) {
  const match = String(inst?.card?.text ?? "").match(/^\s*Fuse\s*:\s*([^\n]+)/im);
  return match ? match[1].trim() : "";
}

function hasTrait(card, trait) {
  const wanted = norm(trait);
  return (card?.traits ?? []).some(value => norm(value) === wanted);
}

function isFuseMaterial(target, material) {
  if (!target || !material || target.uid === material.uid) return false;
  const requirement = norm(fuseRequirement(target));
  const card = material.card;
  if (!requirement || !card) return false;
  if (requirement === "forestcraft cards") return norm(card.class) === "forestcraft";
  if (requirement === "artifact amulets") return card.type === "Amulet" && hasTrait(card, "Artifact");
  if (requirement === "artifact cards") return hasTrait(card, "Artifact");
  if (requirement === "loot cards") return hasTrait(card, "Loot");
  if (requirement.includes("ominous artifact β") || requirement.includes("ominous artifact γ")) {
    const name = norm(card.name);
    return name === "ominous artifact β" || name === "ominous artifact γ";
  }
  return false;
}

function materialHoldValue(item, player) {
  const card = item.card;
  const text = norm(card?.text);
  let value = 1 + Math.max(0, Number(card?.cost) || 0) * .55;
  if (/draw|add .* to your hand/.test(text)) value += 1.25;
  if (/destroy|banish|return .*enemy follower|damage to .*enemy follower/.test(text)) value += 1.75;
  if (/restore .*leader/.test(text)) value += 1.25;
  if (has(card ?? {}, "Storm")) value += 1.75;
  if (has(card ?? {}, "Ward")) value += .8;
  if (card?.type === "Follower") value += (Math.max(0, Number(card.attack) || 0) + Math.max(0, Number(card.defense) || 0)) * .08;
  if ((player.hand?.length ?? 0) >= 8) value -= 1.5;
  else if ((player.hand?.length ?? 0) >= 7) value -= .6;
  return Math.max(.15, value);
}

function enumerateSubsets(items, maxSize = 4) {
  const source = items.slice(0, 8);
  const out = [];
  const limit = 1 << source.length;
  for (let mask = 1; mask < limit; mask += 1) {
    const subset = [];
    for (let index = 0; index < source.length; index += 1) if (mask & (1 << index)) subset.push(source[index]);
    if (subset.length <= maxSize) out.push(subset);
  }
  return out;
}

function candidateFuseMaterialSets(target, eligible, player) {
  const name = norm(target.card?.name);
  if (!eligible.length) return [];
  if (name === "gear of ambition" || name === "gear of remembrance" || name === "garden's allure" || name === "returning slash") {
    return eligible.map(item => [item]);
  }
  if (name === "ominous artifact α") {
    const fused = new Set((target.fusedNames ?? []).map(norm));
    const beta = eligible.filter(item => norm(item.card.name) === "ominous artifact β" && !fused.has("ominous artifact β"));
    const gamma = eligible.filter(item => norm(item.card.name) === "ominous artifact γ" && !fused.has("ominous artifact γ"));
    const sets = [...beta.map(item => [item]), ...gamma.map(item => [item])];
    if (beta.length && gamma.length) sets.push([beta[0], gamma[0]]);
    return sets.length ? sets : eligible.map(item => [item]);
  }
  if (name === "striker artifact" || name === "fortifier artifact") {
    const byTier = new Map();
    for (const subset of enumerateSubsets(eligible, 4)) {
      const total = subset.reduce((sum, item) => sum + Math.max(0, Number(item.card.cost) || 0), 0);
      const tier = total <= 1 ? 1 : total === 2 ? 2 : 3;
      const penalty = subset.reduce((sum, item) => sum + materialHoldValue(item, player), 0);
      const previous = byTier.get(tier);
      if (!previous || penalty < previous.penalty) byTier.set(tier, { subset, penalty });
    }
    return [...byTier.values()].map(entry => entry.subset);
  }
  if (name === "sinciro, heir to usurpation") {
    const sets = enumerateSubsets(eligible, 4)
      .map(subset => ({
        subset,
        distinct: new Set(subset.map(item => norm(item.card.name))).size,
        penalty: subset.reduce((sum, item) => sum + materialHoldValue(item, player), 0)
      }))
      .sort((a, b) => b.distinct - a.distinct || a.penalty - b.penalty);
    const bestByDistinct = new Map();
    for (const entry of sets) if (!bestByDistinct.has(entry.distinct)) bestByDistinct.set(entry.distinct, entry.subset);
    return [...bestByDistinct.values()].slice(0, 4);
  }
  return eligible.map(item => [item]);
}

function projectedFuseTransformName(target, materials) {
  const name = norm(target.card?.name);
  if (name === "gear of ambition") return "Striker Artifact";
  if (name === "gear of remembrance") return "Fortifier Artifact";
  if (name === "striker artifact" || name === "fortifier artifact") {
    const total = materials.reduce((sum, item) => sum + Math.max(0, Number(item.card.cost) || 0), 0);
    return total <= 1 ? "Ominous Artifact α" : total === 2 ? "Ominous Artifact β" : "Ominous Artifact γ";
  }
  if (name === "ominous artifact α") {
    const names = new Set([...(target.fusedNames ?? []).map(norm), ...materials.map(item => norm(item.card.name))]);
    if (names.has("ominous artifact β") && names.has("ominous artifact γ")) return "Masterwork Artifact Ω";
  }
  return null;
}

function scoreFuseAction(target, materials, player, opponent) {
  const name = norm(target.card?.name);
  const materialPenalty = materials.reduce((sum, item) => sum + materialHoldValue(item, player), 0);
  const fusedBefore = new Set((target.fusedNames ?? []).map(norm));
  const fusedAfter = new Set([...fusedBefore, ...materials.map(item => norm(item.card.name))]);
  const transform = projectedFuseTransformName(target, materials);
  let score = -materialPenalty;

  if (name === "gear of ambition" || name === "gear of remembrance") score += 11;
  else if (name === "striker artifact" || name === "fortifier artifact") {
    const handNames = new Set(player.hand.map(item => norm(item.card.name)));
    if (transform && !handNames.has(norm(transform))) score += 11;
    else score += 7;
    if (transform === "Ominous Artifact γ") score += 1;
  } else if (name === "ominous artifact α") {
    const adds = [...fusedAfter].filter(value => !fusedBefore.has(value)).length;
    score += adds * 5;
    if (transform === "Masterwork Artifact Ω") score += 32;
  } else if (name === "garden's allure") score += (target.fusedCards?.length ?? 0) ? 1 : 7;
  else if (name === "returning slash") score += (target.fusedCards?.length ?? 0) ? 1 : 6;
  else if (name === "sinciro, heir to usurpation") {
    const newDistinct = [...fusedAfter].filter(value => !fusedBefore.has(value)).length;
    score += newDistinct * 4.5;
    if (player.maxPp >= 5 || player.personalTurn >= 5) score += newDistinct * 1.25;
  }

  const cannons = player.board.filter(unit => norm(unit.name) === "ancient cannon").length;
  if (cannons && opponent.board.some(unit => unit.type === "Follower")) score += cannons * 2.5;
  const congregants = player.board.filter(unit => norm(unit.name) === "congregant of usurpation").length;
  const lootCount = materials.filter(item => hasTrait(item.card, "Loot")).length;
  if (congregants && lootCount) score += congregants * lootCount * 2.75;
  if ((player.hand?.length ?? 0) >= 8) score += materials.length * 1.2;
  return score;
}

function getFuseActions(player, opponent, cardMap) {
  const actions = [];
  for (const target of player.hand) {
    if (!fuseRequirement(target) || target.fusedThisTurn) continue;
    const eligible = player.hand.filter(item => isFuseMaterial(target, item));
    for (const materials of candidateFuseMaterialSets(target, eligible, player)) {
      if (!materials.length) continue;
      actions.push({
        kind: "fuse",
        target,
        targetName: target.card.name,
        materials,
        score: scoreFuseAction(target, materials, player, opponent),
        projectedTransform: projectedFuseTransformName(target, materials)
      });
    }
  }
  return actions.sort((a, b) => b.score - a.score || a.materials.length - b.materials.length);
}

function bestFuse(player, opponent, cardMap) {
  const best = getFuseActions(player, opponent, cardMap)[0] ?? null;
  return best && best.score > 1.25 ? best : null;
}

function transformHandInstance(inst, nextCard) {
  if (!inst || !nextCard) return false;
  inst.card = nextCard;
  inst.spellboost = 0;
  inst.costDelta = 0;
  inst.attackBonus = 0;
  inst.defenseBonus = 0;
  inst.skyboundEvolutions = 0;
  inst.fusedCards = [];
  inst.fusedNames = [];
  // A transformation creates a new Fuse card. This enables the official Gear ->
  // Artifact -> Ominous chain in one turn while still enforcing once/turn on
  // non-transforming Fuse cards.
  inst.fusedThisTurn = false;
  inst.x = initialX(nextCard);
  return true;
}

function applyFuseReactiveEffects(player, opponent, materials, playerIndex, enemyIndex, stats, rng, cardMap, actions) {
  const ctx = { player, opponent, playerIndex, enemyIndex, stats, rng, cardMap };
  for (const cannon of player.board.filter(unit => unit.type === "Amulet" && norm(unit.name) === "ancient cannon")) {
    const candidates = opponent.board.filter(unit => unit.type === "Follower");
    if (!candidates.length) continue;
    const target = candidates[Math.floor(rng() * candidates.length)];
    damageUnit(target, 2, opponent, player, ctx, actions);
    actions.push(`${cannon.name}: 2 damage to ${target.name}`);
  }

  const lootMaterials = materials.filter(item => hasTrait(item.card, "Loot"));
  for (const congregant of player.board.filter(unit => unit.type === "Follower" && norm(unit.name) === "congregant of usurpation")) {
    for (const material of lootMaterials) {
      const candidates = opponent.board.filter(unit => unit.type === "Follower");
      if (!candidates.length) break;
      const target = candidates[Math.floor(rng() * candidates.length)];
      damageUnit(target, 3, opponent, player, ctx, actions);
      actions.push(`${congregant.name}: 3 damage after Fusing ${material.card.name}`);
      actions.push(...cleanup(opponent, player, enemyIndex, playerIndex, stats, rng, cardMap));
    }
  }
}

function applyLootPlayedTrigger(player, opponent, card, playerIndex, enemyIndex, stats, rng, cardMap, actions) {
  if (!hasTrait(card, "Loot")) return;
  const ctx = { player, opponent, playerIndex, enemyIndex, stats, rng, cardMap };
  for (const congregant of player.board.filter(unit => unit.type === "Follower" && norm(unit.name) === "congregant of usurpation")) {
    const candidates = opponent.board.filter(unit => unit.type === "Follower");
    if (!candidates.length) continue;
    const target = candidates[Math.floor(rng() * candidates.length)];
    damageUnit(target, 3, opponent, player, ctx, actions);
    actions.push(`${congregant.name}: 3 damage after playing ${card.name}`);
  }
}

function resolveFuseAction(action, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap) {
  const actions = [];
  const target = player.hand.find(item => item.uid === action.target.uid);
  if (!target || target.fusedThisTurn) return { actions: ["Fuse unavailable"], applied: false };
  const materials = action.materials
    .map(material => player.hand.find(item => item.uid === material.uid))
    .filter(material => material && isFuseMaterial(target, material));
  if (!materials.length) return { actions: ["No valid Fuse materials"], applied: false };

  const materialIds = new Set(materials.map(item => item.uid));
  player.hand = player.hand.filter(item => !materialIds.has(item.uid));
  target.fusedThisTurn = true;
  target.fusedCards = [...(target.fusedCards ?? []), ...materials.map(item => ({
    id: Number(item.card.id), name: item.card.name, cost: Number(item.card.cost) || 0,
    class: item.card.class, type: item.card.type, traits: [...(item.card.traits ?? [])]
  }))];
  target.fusedNames = [...new Set([...(target.fusedNames ?? []), ...materials.map(item => item.card.name)])];
  target.x = target.fusedNames.length;
  player.fusedCards.push(...materials.map(item => ({ uid: item.uid, card: item.card })));
  stats.cardsFused[playerIndex] += materials.length;
  actions.push(`Fuse ${materials.length} card${materials.length === 1 ? "" : "s"}`);

  applyFuseReactiveEffects(player, opponent, materials, playerIndex, enemyIndex, stats, rng, cardMap, actions);

  const nextName = projectedFuseTransformName(target, materials);
  if (nextName) {
    const nextCard = findByName(cardMap, nextName);
    if (nextCard) {
      const before = target.card.name;
      transformHandInstance(target, nextCard);
      actions.push(`${before} transforms into ${nextCard.name}`);
    }
  }
  actions.push(...cleanup(opponent, player, enemyIndex, playerIndex, stats, rng, cardMap));
  return { actions: uniq(actions), applied: true };
}

export function inspectFuseSequence({ cards = [], handNames = [], deckNames = [], boardNames = [], opponentBoard = [], steps = [], strategy = {} } = {}) {
  const cardMap = new Map(cards.map(card => [Number(card.id), card]));
  prepareOriginalCardMap(cardMap);
  const rng = createRng("inspect-fuse-sequence");
  const player = makePlayer("You", [], strategy, cardMap, rng);
  const opponent = makePlayer("Opponent", [], {}, cardMap, rng);
  player.isActive = true;
  player.personalTurn = 6;
  player.maxPp = 10;
  player.pp = 10;
  const addNamed = (zone, name) => {
    const card = findByName(cardMap, name);
    if (!card) throw new Error(`Unknown card: ${name}`);
    zone.push(instance(player, card));
  };
  for (const name of handNames) addNamed(player.hand, name);
  for (const name of deckNames) addNamed(player.deck, name);
  for (const name of boardNames) {
    const card = findByName(cardMap, name);
    if (!card) throw new Error(`Unknown board card: ${name}`);
    const inst = instance(player, card);
    player.board.push(card.type === "Follower" ? boardFollower(inst) : boardAmulet(inst));
  }
  for (const spec of opponentBoard) {
    const card = spec.cardName ? findByName(cardMap, spec.cardName) : {
      id: -1000 - opponent.board.length, name: spec.name ?? "Enemy", type: "Follower", cost: 1,
      attack: Number(spec.attack) || 0, defense: Number(spec.defense) || 1, text: "", keywords: [...(spec.keywords ?? [])], traits: []
    };
    const inst = instance(opponent, card);
    const unit = boardFollower(inst);
    unit.attack = Number(spec.attack ?? unit.attack) || 0;
    unit.defense = Number(spec.defense ?? unit.defense) || 1;
    unit.maxDefense = unit.defense;
    opponent.board.push(unit);
  }
  const stats = createStats();
  const log = [];
  const takeMaterials = (target, names) => {
    const used = new Set();
    return names.map(name => {
      const found = player.hand.find(item => item.uid !== target.uid && !used.has(item.uid) && norm(item.card.name) === norm(name));
      if (found) used.add(found.uid);
      return found;
    }).filter(Boolean);
  };
  for (const step of steps) {
    if (step.type === "next-turn") {
      player.personalTurn += 1;
      for (const item of player.hand) item.fusedThisTurn = false;
      log.push({ type: "next-turn" });
      continue;
    }
    if (step.type === "fuse" || step.type === "ai-fuse") {
      let action = null;
      if (step.type === "ai-fuse") action = bestFuse(player, opponent, cardMap);
      else {
        const target = player.hand.find(item => norm(item.card.name) === norm(step.target));
        if (target) action = { target, targetName: target.card.name, materials: takeMaterials(target, step.materials ?? []), score: 0 };
      }
      const result = action ? resolveFuseAction(action, player, opponent, 0, 1, stats, rng, cardMap) : { actions: ["Fuse unavailable"], applied: false };
      log.push({ type: "fuse", applied: Boolean(result.applied), actions: result.actions });
      continue;
    }
    if (step.type === "play") {
      const inst = player.hand.find(item => norm(item.card.name) === norm(step.card));
      const mode = inst ? modes(inst, player)[0] : null;
      const result = inst && mode ? playCard(inst, mode, player, opponent, 0, 1, stats, rng, cardMap) : { actions: ["Play unavailable"] };
      log.push({ type: "play", card: step.card, actions: result.actions });
    }
  }
  return {
    hand: player.hand.map(item => ({ name: item.card.name, fusedThisTurn: Boolean(item.fusedThisTurn), fusedNames: [...(item.fusedNames ?? [])], fusedCount: item.fusedCards?.length ?? 0 })),
    board: player.board.map(unit => ({ name: unit.name, attack: unit.attack, defense: unit.defense })),
    opponentHp: opponent.hp,
    opponentBoard: opponent.board.map(unit => ({ name: unit.name, attack: unit.attack, defense: unit.defense })),
    shadows: player.shadows,
    fusedZone: player.fusedCards.map(item => item.card.name),
    stats,
    log
  };
}
'''
repl('''function hasBlockedBoardDevelopment(player) {''', fuse_helpers + '\nfunction hasBlockedBoardDevelopment(player) {', 'Fuse helper insertion')

# Play-time Loot trigger and fused-card state on followers.
repl(
'''  if (mode.kind !== "crystallize") {\n    const result = resolveText(mode.text || card.text, { card, instance: inst, sourceUnit: source, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap });\n    actions.push(...result.actions);\n  }''',
'''  // "Whenever you play ... a Loot card" triggers from the play event itself.\n  applyLootPlayedTrigger(player, opponent, card, playerIndex, enemyIndex, stats, rng, cardMap, actions);\n\n  if (mode.kind !== "crystallize") {\n    const result = resolveText(mode.text || card.text, { card, instance: inst, sourceUnit: source, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap });\n    actions.push(...result.actions);\n  }''',
'Loot play trigger')

repl(
'''    attacked: false, attacksMade: 0, baseMaxAttacks, maxAttacks: baseMaxAttacks,\n    evolved: false, superEvolved: false, reactedThisTurn: false, tempAttackPenalty: 0''',
'''    attacked: false, attacksMade: 0, baseMaxAttacks, maxAttacks: baseMaxAttacks,\n    evolved: false, superEvolved: false, reactedThisTurn: false, tempAttackPenalty: 0,\n    fusedCards: [...(inst.fusedCards ?? [])], fusedNames: [...(inst.fusedNames ?? [])], x: Number(inst.x) || 0''',
'carry Fuse state onto played follower')

# Fused conditional effects are explicit so generic parsing cannot silently misread them.
repl(
'''  if (!text) return { actions, applied: false, unresolved: false };\n\n  // [[battle-gildaria-rally]]''',
'''  if (!text) return { actions, applied: false, unresolved: false };\n\n  // [[battle-fuse-play-effects]]\n  const fusedNames = ctx.instance?.fusedNames ?? ctx.sourceUnit?.fusedNames ?? [];\n  const fusedCards = ctx.instance?.fusedCards ?? ctx.sourceUnit?.fusedCards ?? [];\n  const hasFused = fusedCards.length > 0 || fusedNames.length > 0;\n  const fuseCardName = norm(ctx.card?.name);\n  if (fuseCardName === "garden's allure") {\n    const clause = /Draw a card\\.\\s*If you've Fused to this card, draw 2 instead\\.?/i;\n    if (clause.test(text)) {\n      const amount = hasFused ? 2 : 1;\n      const drawn = drawCards(ctx.player, amount, ctx.stats, ctx.playerIndex);\n      actions.push(`draw ${drawn}`);\n      text = text.replace(clause, " ");\n    }\n  }\n  if (fuseCardName === "returning slash") {\n    const clause = /If you've Fused to this card, draw a card\\.?/i;\n    if (clause.test(text)) {\n      if (hasFused) {\n        const drawn = drawCards(ctx.player, 1, ctx.stats, ctx.playerIndex);\n        actions.push(`Fuse bonus: draw ${drawn}`);\n      }\n      text = text.replace(clause, " ");\n    }\n  }\n  if (fuseCardName === "sinciro, heir to usurpation") {\n    const xValue = new Set(fusedNames.map(norm)).size;\n    const fanfare = /Deal X damage to all enemies\\.\\s*X is the number of differently named cards Fused to this card\\.?/i;\n    const replicate = /Replicate the effects of this card'?s Fanfare ability\\.?/i;\n    if (fanfare.test(text) || replicate.test(text)) {\n      for (const unit of ctx.opponent.board.filter(unit => unit.type === "Follower")) damageUnit(unit, xValue, ctx.opponent, ctx.player, ctx, actions);\n      const dealt = damageLeader(ctx.opponent, xValue);\n      ctx.stats.damageDealt[ctx.playerIndex] += dealt;\n      actions.push(`Sinciro: ${xValue} damage to all enemies`);\n      text = text.replace(fanfare, " ").replace(replicate, " ");\n    }\n  }\n\n  // [[battle-gildaria-rally]]''',
'Fuse-aware play effects')

repl('''  const x = ctx.instance?.x ?? 0;''', '''  const x = ctx.instance?.x ?? ctx.sourceUnit?.x ?? 0;''', 'X fallback from played follower')

# Replay/debug visibility.
repl(
'''      personalTurn: player.personalTurn, deckCount: player.deck.length, cemeteryCount: player.cemetery.length,\n      hand: player.hand.map(cardView), board: player.board.map(unitView), crests: player.crests.map(crest => Number.isFinite(crest.countdown) ? `${crest.name} (${crest.countdown})` : crest.name)''',
'''      personalTurn: player.personalTurn, deckCount: player.deck.length, cemeteryCount: player.cemetery.length, fusedCount: player.fusedCards?.length ?? 0,\n      hand: player.hand.map(cardView), board: player.board.map(unitView), crests: player.crests.map(crest => Number.isFinite(crest.countdown) ? `${crest.name} (${crest.countdown})` : crest.name)''',
'Fuse replay count')

repl(
'''  return { id: Number(card.id), name: card.name, image: card.image, type: card.type, cost: costOf(item), attack: (Number(card.attack)||0)+(Number(item.attackBonus)||0), defense: (Number(card.defense)||0)+(Number(item.defenseBonus)||0), spellboost: Number(item.spellboost)||0, x: Number(item.x)||0, keywords: [...(card.keywords ?? [])] };''',
'''  return { id: Number(card.id), name: card.name, image: card.image, type: card.type, cost: costOf(item), attack: (Number(card.attack)||0)+(Number(item.attackBonus)||0), defense: (Number(card.defense)||0)+(Number(item.defenseBonus)||0), spellboost: Number(item.spellboost)||0, x: Number(item.x)||0, fusedNames: [...(item.fusedNames ?? [])], keywords: [...(card.keywords ?? [])] };''',
'Fuse hand view')

path.write_text(text, encoding='utf-8')
print('Battle Sim Fuse materialized')
