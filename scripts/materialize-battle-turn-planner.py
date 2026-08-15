from pathlib import Path

path = Path('js/battle-engine-v5.js')
text = path.read_text(encoding='utf-8')

def repl(old, new, label, count=1):
    global text
    if old not in text:
        raise SystemExit(f'missing patch anchor: {label}')
    text = text.replace(old, new, count)

# Replace the fixed phase ordering with a receding-horizon full-turn planner.
start = text.index('// [[battle-ai-v2-sequencing]]')
end = text.index('// [[battle-fuse-v1]]', start)
old_turn = text[start:end]
new_turn = r'''// [[battle-ai-full-turn-planner-v1]]
function runTurnAi({ player, opponent, playerIndex, enemyIndex, stats, frames, players, round, rng, map, record }) {
  let safety = 0;
  while (safety++ < MAX_ACTIONS) {
    // Extra PP remains a public, explicit resource. Re-evaluate it between
    // planned actions; the turn planner then sees the resulting PP budget.
    useBonusPpIfUseful(player, opponent);

    // Exact board lethal is resolved immediately instead of spending planner
    // budget proving something already certain.
    if (hasCollectiveBoardLethal(player, opponent)) {
      attackPhase(player, opponent, playerIndex, enemyIndex, stats, frames, players, round, rng, map, record);
      return;
    }

    const plan = planCurrentTurn({ player, opponent, playerIndex, enemyIndex, stats, map });
    const decision = plan.sequence[0] ?? { kind: "end" };
    if (decision.kind === "end") {
      if (hasAnyPlannerAction(player, opponent, map)) {
        snap(frames, players, {
          round,
          active: playerIndex,
          phase: "decision",
          action: `${player.name} ends the action sequence and keeps the remaining resources.`
        }, stats, record);
      }
      break;
    }

    const outcome = executePlannerAction(
      { player, opponent, playerIndex, enemyIndex, stats },
      decision,
      map,
      rng
    );
    if (!outcome.applied) break;
    snap(frames, players, {
      round,
      active: playerIndex,
      phase: outcome.phase,
      action: outcome.action
    }, stats, record);
    if (player.hp <= 0 || opponent.hp <= 0) return;
  }
}

function clonePlanningItem(item) {
  return {
    ...item,
    card: item.card,
    fusedCards: [...(item.fusedCards ?? [])].map(value => ({ ...value, traits: [...(value.traits ?? [])] })),
    fusedNames: [...(item.fusedNames ?? [])]
  };
}

function clonePlanningUnit(unit) {
  return {
    ...unit,
    card: unit.card,
    keywords: [...(unit.keywords ?? [])],
    fusedCards: [...(unit.fusedCards ?? [])].map(value => ({ ...value, traits: [...(value.traits ?? [])] })),
    fusedNames: [...(unit.fusedNames ?? [])]
  };
}

function clonePlanningPlayer(source) {
  const clone = {
    ...source,
    hp: Number(source.hp) || 0,
    strategy: source.strategy,
    deck: (source.deck ?? []).map(clonePlanningItem),
    hand: (source.hand ?? []).map(clonePlanningItem),
    board: (source.board ?? []).map(clonePlanningUnit),
    cemetery: (source.cemetery ?? []).map(item => ({ ...item, card: item.card })),
    banished: (source.banished ?? []).map(item => ({ ...item, card: item.card })),
    fusedCards: (source.fusedCards ?? []).map(item => ({ ...item, card: item.card })),
    destroyedFollowers: (source.destroyedFollowers ?? []).map(item => ({ ...item, card: item.card })),
    crests: (source.crests ?? []).map(crest => ({ ...crest, card: crest.card }))
  };
  installLeaderDamageGuard(clone);
  return clone;
}

function clonePlanningState(state) {
  return {
    player: clonePlanningPlayer(state.player),
    opponent: clonePlanningPlayer(state.opponent),
    playerIndex: state.playerIndex,
    enemyIndex: state.enemyIndex,
    stats: cloneStats(state.stats)
  };
}

function planningPublicSeed(player, opponent) {
  const ownHand = player.hand.map(item => `${item.card?.id}:${item.spellboost ?? 0}:${item.x ?? 0}`).sort().join(",");
  const ownDeck = player.deck.map(item => Number(item.card?.id) || 0).sort((a,b)=>a-b).join(",");
  // Hand count is public; identities are deliberately mixed with the remaining
  // deck before planning so the AI cannot peek at the opponent's hidden hand.
  const enemyUnknown = [...opponent.hand, ...opponent.deck].map(item => Number(item.card?.id) || 0).sort((a,b)=>a-b).join(",");
  const visibleEnemy = opponent.board.map(unit => `${unit.cardId}:${unit.attack}:${unit.defense}`).sort().join(",");
  return [
    "turn-planner-v1", player.personalTurn, player.hp, player.pp, player.maxPp,
    player.ep, player.sep, ownHand, ownDeck,
    opponent.hp, opponent.hand.length, enemyUnknown, visibleEnemy
  ].join("|");
}

function makePlanningRoot({ player, opponent, playerIndex, enemyIndex, stats }) {
  const root = {
    player: clonePlanningPlayer(player),
    opponent: clonePlanningPlayer(opponent),
    playerIndex,
    enemyIndex,
    stats: cloneStats(stats)
  };
  const seed = planningPublicSeed(player, opponent);
  const rng = createRng(seed);

  // Own deck order is unknown to the player. Shuffle a planning copy so draw
  // effects cannot reveal the real future topdeck to the AI.
  shuffle(root.player.deck, rng);

  // Preserve only the public opponent hand count. The unknown-zone multiset is
  // redistributed independently from the actual hidden hand/deck split.
  const handCount = root.opponent.hand.length;
  const unknown = [...root.opponent.hand, ...root.opponent.deck];
  shuffle(unknown, rng);
  root.opponent.hand = unknown.slice(0, handCount);
  root.opponent.deck = unknown.slice(handCount);
  return { state: root, seed };
}

function plannerCardResourceValue(item) {
  const card = item?.card;
  if (!card) return 0;
  const text = norm(card.text);
  let value = .6 + Math.min(8, Math.max(0, Number(card.cost) || 0)) * .16;
  if (/draw|add .* to your hand/.test(text)) value += .35;
  if (/destroy|banish|return .*enemy follower/.test(text)) value += .45;
  if (/restore .*leader/.test(text)) value += .3;
  if (has(card, "Storm")) value += .4;
  return value;
}

function plannerBoardValue(player) {
  return player.board.reduce((sum, unit) => {
    if (unit.type === "Amulet") {
      const text = norm(unit.card?.text);
      return sum + 1.2 + (/engage|countdown|at the end of your turn|at the start of your turn/.test(text) ? 1.1 : 0);
    }
    let value = Math.max(0, Number(unit.attack) || 0) * 1.55 + Math.max(0, Number(unit.defense) || 0) * .9;
    if (hasU(unit, "Ward")) value += 2;
    if (hasU(unit, "Bane")) value += 1.7;
    if (hasU(unit, "Storm")) value += 1;
    if (unit.evolved) value += .8;
    if (unit.superEvolved) value += 1.2;
    if (unit.aura) value += 1.1;
    return sum + value;
  }, 0);
}

function plannerStateValue(state, ended = false) {
  const player = state.player, opponent = state.opponent;
  if (opponent.hp <= 0) return 100000;
  if (player.hp <= 0) return -100000;
  const style = String(player.strategy?.style ?? "midrange");
  const faceWeight = style === "aggro" ? 3.2 : style === "buff-tempo" || style === "puppetry-tempo" ? 2.6 : 2.1;
  const boardWeight = style === "control" || style === "ward-control" ? 1.25 : 1;
  const enemyBoard = plannerBoardValue(opponent);
  const ownBoard = plannerBoardValue(player);
  const incoming = estimateVisibleIncomingDamage(player, opponent);
  const margin = player.hp - incoming;
  const ownHand = player.hand.reduce((sum, item) => sum + plannerCardResourceValue(item), 0);
  let score = (20 - opponent.hp) * faceWeight + player.hp * .7;
  score += (ownBoard - enemyBoard * 1.08) * boardWeight;
  score += ownHand * .42;
  score += Math.max(0, player.ep) * .55 + Math.max(0, player.sep) * .8;
  if (margin <= 0) score -= 65;
  else if (margin <= 3) score -= 22;
  else if (margin <= 6) score -= 8;
  else score += Math.min(5, margin * .18);
  if (opponent.hp <= 6) score += Math.max(0, 7 - opponent.hp) * 2.5;
  if (ended) {
    score += scorePassDecision(player, opponent) * .65;
    score -= Math.max(0, Number(player.pp) || 0) * (style === "aggro" ? .38 : .22);
  }
  return score;
}

function actionKey(action) {
  if (!action) return "none";
  if (action.kind === "play") return `play:${action.instanceUid}:${action.mode?.kind}:${action.mode?.cost}:${action.targetPlan?.enemyUid ?? ""}`;
  if (action.kind === "fuse") return `fuse:${action.targetUid}:${action.materialUids.join(",")}`;
  if (action.kind === "engage") return `engage:${action.unitUid}`;
  if (action.kind === "evolve") return `evolve:${action.unitUid}:${action.superMode ? 1 : 0}:${action.targetPlan?.enemyUid ?? ""}`;
  if (action.kind === "attack") return `attack:${action.attackerUid}:${action.leader ? "leader" : action.targetUid}`;
  return action.kind;
}

function plannerAttackPrior(attacker, target, leader, player, opponent) {
  if (leader) {
    const damage = Math.max(0, Number(attacker.attack) || 0);
    return (damage >= opponent.hp ? 1000 : 8 + damage * (player.strategy?.style === "aggro" ? 2.4 : 1.5));
  }
  const removes = target && canCombatRemove(attacker, target);
  const survives = target ? !willFollowerDieInCombat(attacker, target, player) : false;
  return (removes ? 18 : 2) + followerThreatValue(target) * .55 + (survives ? 5 : 0) - followerThreatValue(attacker) * (survives ? .04 : .18);
}

function enumerateAttackDecisions(player, opponent) {
  const wards = activeWards(opponent.board);
  const targets = wards.length ? wards : attackable(opponent.board);
  const out = [];
  for (const attacker of player.board.filter(unit => unit.type === "Follower" && unit.attacksMade < unit.maxAttacks)) {
    if (attacker.canAttackFollower) {
      for (const target of targets) {
        out.push({
          kind: "attack", attackerUid: attacker.uid, targetUid: target.uid, leader: false,
          prior: plannerAttackPrior(attacker, target, false, player, opponent)
        });
      }
    }
    if (!wards.length && attacker.canAttackLeader) {
      out.push({
        kind: "attack", attackerUid: attacker.uid, targetUid: null, leader: true,
        prior: plannerAttackPrior(attacker, null, true, player, opponent)
      });
    }
  }
  return out.sort((a,b)=>b.prior-a.prior);
}

function evolutionTargetPlans(unit, superMode, opponent) {
  const evolveText = getUnitTriggeredText(unit, "evolve") || "";
  const superText = superMode ? (getUnitTriggeredText(unit, "superEvolve") || "") : "";
  const pseudo = { instance: { x: unit.x ?? 0, card: unit.card }, mode: { text: `${evolveText} ${superText}` } };
  const spec = targetEffectSpec(pseudo);
  if (!spec) return [null];
  const targets = targetableEnemyFollowers(opponent.board);
  return targets.length
    ? targets.map(target => ({ enemyUid: target.uid, enemyName: target.name, kind: spec.kind, amount: spec.amount }))
    : [null];
}

function enumerateEvolutionDecisions(player, opponent) {
  if (player.evolutionActionUsed) return [];
  const normalAvailable = player.personalTurn >= (player.goingFirst ? 5 : 4) && player.ep > 0;
  const superAvailable = player.personalTurn >= (player.goingFirst ? 7 : 6) && player.sep > 0;
  if (!normalAvailable && !superAvailable) return [];
  const units = player.board.filter(unit => unit.type === "Follower" && !unit.evolved && !unit.superEvolved && !unit.attacked);
  const out = [];
  for (const unit of units) {
    if (normalAvailable) {
      for (const targetPlan of evolutionTargetPlans(unit, false, opponent)) {
        out.push({ kind: "evolve", unitUid: unit.uid, superMode: false, targetPlan, prior: scoreEvolutionCandidate(unit, player, opponent, false) + targetBranchValue(targetPlan, opponent) * .25 });
      }
    }
    if (superAvailable) {
      for (const targetPlan of evolutionTargetPlans(unit, true, opponent)) {
        out.push({ kind: "evolve", unitUid: unit.uid, superMode: true, targetPlan, prior: scoreEvolutionCandidate(unit, player, opponent, true) + targetBranchValue(targetPlan, opponent) * .25 });
      }
    }
  }
  return out.sort((a,b)=>b.prior-a.prior);
}

function enumerateEngageDecisions(player, opponent) {
  return player.board.filter(unit => unit.type === "Amulet" && !unit.engagedThisTurn)
    .map(unit => ({ unit, ...engageInfo(unit) }))
    .filter(item => item.text != null && item.cost <= player.pp)
    .map(item => ({ kind: "engage", unitUid: item.unit.uid, prior: scoreEngage(item, player, opponent) }))
    .sort((a,b)=>b.prior-a.prior);
}

function diversifyPlannerActions(groups, limit = 8) {
  const chosen = [];
  const rest = [];
  for (const group of groups) {
    if (!group.length) continue;
    chosen.push(group[0]);
    rest.push(...group.slice(1));
  }
  rest.sort((a,b)=>(b.prior ?? 0)-(a.prior ?? 0));
  for (const action of rest) {
    if (chosen.length >= limit) break;
    chosen.push(action);
  }
  return chosen.sort((a,b)=>(b.prior ?? 0)-(a.prior ?? 0)).slice(0, limit);
}

function enumeratePlannerActions(player, opponent, map) {
  const plays = scoredPlayOptions(player, opponent, false).slice(0, 4).map(item => ({
    kind: "play", instanceUid: item.instance.uid, mode: { ...item.mode }, targetPlan: item.targetPlan ? { ...item.targetPlan } : null, prior: item.score
  }));
  const fuses = getFuseActions(player, opponent, map).slice(0, 3).map(item => ({
    kind: "fuse", targetUid: item.target.uid, materialUids: item.materials.map(material => material.uid), prior: item.score
  }));
  const engages = enumerateEngageDecisions(player, opponent).slice(0, 2);
  const evolutions = enumerateEvolutionDecisions(player, opponent).slice(0, 4);
  const attacks = enumerateAttackDecisions(player, opponent).slice(0, 5);
  const actions = diversifyPlannerActions([plays, fuses, engages, evolutions, attacks], 8);
  actions.push({ kind: "end", prior: scorePassDecision(player, opponent) });
  return actions;
}

function hasAnyPlannerAction(player, opponent, map) {
  return enumeratePlannerActions(player, opponent, map).some(action => action.kind !== "end");
}

function executeEvolutionDecision(state, action, map, rng) {
  const { player, opponent, playerIndex, enemyIndex, stats } = state;
  if (player.evolutionActionUsed) return { applied: false, actions: [] };
  const unit = player.board.find(item => item.uid === action.unitUid);
  if (!unit || unit.type !== "Follower" || unit.evolved || unit.superEvolved || unit.attacked) return { applied: false, actions: [] };
  const superMode = Boolean(action.superMode);
  const unlockTurn = player.goingFirst ? (superMode ? 7 : 5) : (superMode ? 6 : 4);
  if (player.personalTurn < unlockTurn || player[superMode ? "sep" : "ep"] <= 0) return { applied: false, actions: [] };

  const bonus = superMode ? 3 : 2;
  player[superMode ? "sep" : "ep"] -= 1;
  player.evolutionActionUsed = true;
  unit.attack += bonus;
  unit.defense += bonus;
  unit.maxDefense += bonus;
  unit.canAttackFollower = !/can't attack followers or leaders/i.test(String(unit.card?.text ?? ""));
  if (/can't attack followers or leaders/i.test(String(unit.card?.text ?? ""))) unit.canAttackLeader = false;
  unit.evolved = true;
  unit.superEvolved = superMode;
  player.evolutionsThisMatch += 1;
  recordHandEvolution(player);
  if (superMode) stats.superEvolutions[playerIndex] += 1;
  else stats.evolutions[playerIndex] += 1;
  const actions = [];
  const evolveText = getUnitTriggeredText(unit, "evolve");
  if (evolveText) actions.push(...resolveText(evolveText, { card: unit.card, sourceUnit: unit, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map, targetPlan: action.targetPlan ?? null }).actions);
  if (superMode) {
    const superText = getUnitTriggeredText(unit, "superEvolve");
    if (superText) actions.push(...resolveText(superText, { card: unit.card, sourceUnit: unit, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map, targetPlan: action.targetPlan ?? null }).actions);
  }
  actions.push(...cleanup(opponent, player, enemyIndex, playerIndex, stats, rng, map));
  return {
    applied: true,
    actions,
    phase: superMode ? "super-evolve" : "evolve",
    action: compact(`${player.name} ${superMode ? "super-evolves" : "evolves"} ${unit.name}.`, actions)
  };
}

function executeSingleAttackDecision(state, action, map, rng) {
  const { player, opponent, playerIndex, enemyIndex, stats } = state;
  const attacker = player.board.find(unit => unit.uid === action.attackerUid);
  if (!attacker || attacker.type !== "Follower" || attacker.attacksMade >= attacker.maxAttacks) return { applied: false, actions: [] };
  const wards = activeWards(opponent.board);
  let target = action.leader ? null : opponent.board.find(unit => unit.uid === action.targetUid);
  if (action.leader) {
    if (wards.length || !attacker.canAttackLeader) return { applied: false, actions: [] };
  } else {
    if (!target || !attacker.canAttackFollower || target.intimidate || target.ambush) return { applied: false, actions: [] };
    if (wards.length && !wards.includes(target)) return { applied: false, actions: [] };
  }

  const actions = [];
  if (target && attacker.superEvolved && hasCrest(player, "Verdilia & Castelle, Sisters")) {
    attacker.maxAttacks = Math.max(attacker.maxAttacks, 2);
    actions.push("Verdilia & Castelle Crest: can attack twice this turn");
  }
  if (action.leader && hasU(attacker, "Storm") && hasCrest(opponent, "Lu Woh, Light Personified")) {
    const reduction = Math.min(3, Math.max(0, attacker.attack));
    attacker.attack -= reduction;
    attacker.tempAttackPenalty = (Number(attacker.tempAttackPenalty) || 0) + reduction;
    actions.push(`Lu Woh Crest: ${attacker.name} -${reduction}/-0 this turn`);
  }

  attacker.attacksMade += 1;
  attacker.attacked = attacker.attacksMade >= attacker.maxAttacks;
  stats.attacks[playerIndex] += 1;
  if (attacker.ambush) {
    attacker.ambush = false;
    attacker.keywords = attacker.keywords.filter(keyword => keyword !== "Ambush");
  }

  if (action.leader) {
    actions.push(...strike(attacker, player, opponent, playerIndex, enemyIndex, stats, rng, map));
    actions.push(...cleanup(opponent, player, enemyIndex, playerIndex, stats, rng, map), ...cleanup(player, opponent, playerIndex, enemyIndex, stats, rng, map));
    let dealt = 0;
    if (player.board.includes(attacker) && opponent.hp > 0) {
      dealt = damageLeader(opponent, Math.max(0, attacker.attack));
      stats.damageDealt[playerIndex] += dealt;
      if (hasU(attacker, "Drain")) {
        const healed = healPlayer(player, dealt, stats, playerIndex);
        if (healed) actions.push(`Drain heals ${healed}`);
        actions.push(...afterLeaderHeal(player, healed, stats, playerIndex));
      }
    }
    return { applied: true, actions, phase: "attack", action: compact(`${attacker.name} attacks ${opponent.name}'s leader for ${dealt}.`, actions) };
  }

  const declaredName = target.name;
  actions.push(...strike(attacker, player, opponent, playerIndex, enemyIndex, stats, rng, map));
  const clashAttacker = getUnitTriggeredText(attacker, "clash");
  const clashTarget = getUnitTriggeredText(target, "clash");
  if (clashAttacker) actions.push(...resolveText(clashAttacker, { card: attacker.card, sourceUnit: attacker, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map }).actions);
  if (clashTarget) actions.push(...resolveText(clashTarget, { card: target.card, sourceUnit: target, player: opponent, opponent: player, playerIndex: enemyIndex, enemyIndex: playerIndex, stats, rng, cardMap: map }).actions);
  actions.push(...cleanup(player, opponent, playerIndex, enemyIndex, stats, rng, map), ...cleanup(opponent, player, enemyIndex, playerIndex, stats, rng, map));
  const attackerAlive = player.board.includes(attacker);
  const targetAlive = opponent.board.includes(target);
  if (!attackerAlive || !targetAlive) {
    if (attackerAlive && attacker.superEvolved && !targetAlive && target.defense <= 0) {
      const dealt = damageLeader(opponent, 1);
      stats.damageDealt[playerIndex] += dealt;
      if (dealt) actions.push("Super-Evolution deals 1 leader damage");
    }
    return { applied: true, actions, phase: "attack", action: compact(`${attacker.name} attacks ${declaredName}.`, actions) };
  }

  const outgoing = Math.max(0, attacker.attack);
  const incoming = Math.max(0, target.attack);
  const dealtToTarget = damageUnit(target, outgoing, opponent, player, { player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map }, actions);
  damageUnit(attacker, incoming, player, opponent, { player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map }, actions);
  if (hasU(attacker, "Bane")) destroyUnit(opponent, target);
  if (hasU(target, "Bane")) destroyUnit(player, attacker);
  if (hasU(attacker, "Drain")) {
    const healed = healPlayer(player, dealtToTarget, stats, playerIndex);
    if (healed) actions.push(`Drain heals ${healed}`);
    actions.push(...afterLeaderHeal(player, healed, stats, playerIndex));
  }
  if (attacker.superEvolved && target.defense <= 0) {
    const dealt = damageLeader(opponent, 1);
    stats.damageDealt[playerIndex] += dealt;
    if (dealt) actions.push("Super-Evolution deals 1 leader damage");
  }
  actions.push(...cleanup(opponent, player, enemyIndex, playerIndex, stats, rng, map), ...cleanup(player, opponent, playerIndex, enemyIndex, stats, rng, map));
  return { applied: true, actions, phase: "attack", action: compact(`${attacker.name} attacks ${declaredName}.`, actions) };
}

function executePlannerAction(state, action, map, rng) {
  const { player, opponent, playerIndex, enemyIndex, stats } = state;
  if (action.kind === "play") {
    const inst = player.hand.find(item => item.uid === action.instanceUid);
    if (!inst) return { applied: false, actions: [] };
    const legal = modes(inst, player).find(mode => mode.kind === action.mode.kind && mode.cost === action.mode.cost && (mode.modeIndex ?? 0) === (action.mode.modeIndex ?? 0));
    if (!legal) return { applied: false, actions: [] };
    const result = playCard(inst, legal, player, opponent, playerIndex, enemyIndex, stats, rng, map, { targetPlan: action.targetPlan ?? null });
    return { applied: true, actions: result.actions, phase: "play", action: compact(`${player.name} plays ${inst.card.name} (${legal.cost} PP${legal.kind !== "base" ? ` · ${cap(legal.kind)}` : ""}).`, result.actions) };
  }
  if (action.kind === "fuse") {
    const target = player.hand.find(item => item.uid === action.targetUid);
    const materials = action.materialUids.map(uid => player.hand.find(item => item.uid === uid)).filter(Boolean);
    if (!target || !materials.length) return { applied: false, actions: [] };
    const result = resolveFuseAction({ target, targetName: target.card.name, materials }, player, opponent, playerIndex, enemyIndex, stats, rng, map);
    return { applied: Boolean(result.applied), actions: result.actions, phase: "fuse", action: compact(`${player.name} Fuses ${materials.map(item => item.card.name).join(" + ")} into ${target.card.name}.`, result.actions) };
  }
  if (action.kind === "engage") {
    const unit = player.board.find(item => item.uid === action.unitUid);
    if (!unit || unit.engagedThisTurn) return { applied: false, actions: [] };
    const result = resolveEngage(unit, player, opponent, playerIndex, enemyIndex, stats, rng, map);
    return { applied: true, actions: result.actions, phase: "play", action: compact(`${player.name} engages ${unit.name}.`, result.actions) };
  }
  if (action.kind === "evolve") return executeEvolutionDecision(state, action, map, rng);
  if (action.kind === "attack") return executeSingleAttackDecision(state, action, map, rng);
  return { applied: false, actions: [] };
}

function plannerNodeScore(node, ended = false) {
  return plannerStateValue(node.state, ended) + node.priorTotal * .14 - node.sequence.length * .04;
}

function planCurrentTurn({ player, opponent, playerIndex, enemyIndex, stats, map }, options = {}) {
  const { state: root, seed } = makePlanningRoot({ player, opponent, playerIndex, enemyIndex, stats });
  const depthLimit = Math.max(1, Number(options.depth ?? (player.personalTurn <= 2 ? 2 : 4)) || 4);
  const beamWidth = Math.max(2, Number(options.beamWidth ?? 4) || 4);
  let beam = [{ state: root, sequence: [], priorTotal: 0, score: plannerStateValue(root, false) }];
  const terminal = [];

  for (let depth = 0; depth < depthLimit; depth += 1) {
    const expanded = [];
    for (const node of beam) {
      const candidates = enumeratePlannerActions(node.state.player, node.state.opponent, map);
      for (const action of candidates) {
        if (action.kind === "end") {
          const finished = { ...node, sequence: [...node.sequence, action], priorTotal: node.priorTotal + (action.prior ?? 0) * .25 };
          finished.score = plannerNodeScore(finished, true);
          terminal.push(finished);
          continue;
        }
        const childState = clonePlanningState(node.state);
        const sequence = [...node.sequence, action];
        const branchRng = createRng(`${seed}|${sequence.map(actionKey).join(">")}`);
        const outcome = executePlannerAction(childState, action, map, branchRng);
        if (!outcome.applied) continue;
        const child = {
          state: childState,
          sequence,
          priorTotal: node.priorTotal + Math.max(-20, Math.min(40, Number(action.prior) || 0))
        };
        child.score = plannerNodeScore(child, false);
        if (childState.player.hp <= 0 || childState.opponent.hp <= 0) terminal.push(child);
        else expanded.push(child);
      }
    }
    if (!expanded.length) break;
    expanded.sort((a,b)=>b.score-a.score || a.sequence.map(actionKey).join("|").localeCompare(b.sequence.map(actionKey).join("|")));
    beam = expanded.slice(0, beamWidth);
  }

  const finalists = [...terminal, ...beam.map(node => ({ ...node, score: plannerNodeScore(node, true) }))]
    .filter(node => node.sequence.length > 0)
    .sort((a,b)=>b.score-a.score || a.sequence.length-b.sequence.length);
  const best = finalists[0] ?? { sequence: [{ kind: "end" }], score: plannerStateValue(root, true) };
  return { sequence: best.sequence, score: best.score, explored: finalists.length };
}

function plannerActionView(action, state) {
  if (action.kind === "play") {
    const item = state.player.hand.find(entry => entry.uid === action.instanceUid);
    return { kind: "play", card: item?.card?.name ?? null, target: action.targetPlan?.enemyName ?? null };
  }
  if (action.kind === "fuse") {
    const target = state.player.hand.find(entry => entry.uid === action.targetUid);
    return { kind: "fuse", card: target?.card?.name ?? null };
  }
  if (action.kind === "engage") {
    const unit = state.player.board.find(entry => entry.uid === action.unitUid);
    return { kind: "engage", card: unit?.name ?? null };
  }
  if (action.kind === "evolve") {
    const unit = state.player.board.find(entry => entry.uid === action.unitUid);
    return { kind: action.superMode ? "super-evolve" : "evolve", card: unit?.name ?? null, target: action.targetPlan?.enemyName ?? null };
  }
  if (action.kind === "attack") {
    const attacker = state.player.board.find(entry => entry.uid === action.attackerUid);
    const target = action.leader ? "leader" : state.opponent.board.find(entry => entry.uid === action.targetUid)?.name;
    return { kind: "attack", card: attacker?.name ?? null, target: target ?? null };
  }
  return { kind: "end", card: null, target: null };
}

export function inspectTurnPlan({
  hand = [], board = [], opponentBoard = [], pp = 0, maxPp = pp, hp = 20, opponentHp = 20,
  personalTurn = 5, goingFirst = true, goingSecond = false, ep = 2, sep = 2,
  strategy = {}, depth = 4, beamWidth = 4
} = {}) {
  const allCards = [...hand, ...board.map(value => value.card).filter(Boolean), ...opponentBoard.map(value => value.card).filter(Boolean)];
  const map = new Map(allCards.filter(Boolean).map(card => [Number(card.id), card]));
  const rng = createRng("inspect-turn-plan");
  const player = makePlayer("You", [], strategy, map, rng);
  const opponent = makePlayer("Opponent", [], {}, map, rng);
  player.isActive = true;
  opponent.isActive = false;
  player.goingFirst = Boolean(goingFirst);
  player.goingSecond = Boolean(goingSecond);
  player.personalTurn = Math.max(1, Number(personalTurn) || 1);
  player.pp = Math.max(0, Number(pp) || 0);
  player.maxPp = Math.max(0, Number(maxPp) || 0);
  player.hp = Number(hp) || 0;
  player.ep = Math.max(0, Number(ep) || 0);
  player.sep = Math.max(0, Number(sep) || 0);
  opponent.hp = Number(opponentHp) || 0;

  player.hand = hand.map(card => instance(player, card));
  const makeUnit = (spec, owner, prefix, index) => {
    const card = spec.card ?? {
      id: spec.id ?? (-20000 - index), name: spec.name ?? `${prefix} ${index + 1}`, class: "Neutral", type: "Follower",
      cost: Number(spec.cost) || 1, attack: Number(spec.attack) || 0, defense: Number(spec.defense) || 1,
      text: spec.text ?? "", keywords: [...(spec.keywords ?? [])], traits: []
    };
    const unit = boardFollower(instance(owner, card));
    unit.name = spec.name ?? card.name;
    unit.attack = Number(spec.attack ?? unit.attack) || 0;
    unit.defense = Number(spec.defense ?? unit.defense) || 1;
    unit.maxDefense = Number(spec.maxDefense ?? unit.defense) || unit.defense;
    unit.summonedThisTurn = Boolean(spec.summonedThisTurn);
    unit.canAttackLeader = spec.canAttackLeader ?? (!unit.summonedThisTurn || has(card, "Storm"));
    unit.canAttackFollower = spec.canAttackFollower ?? (!unit.summonedThisTurn || has(card, "Rush") || has(card, "Storm"));
    unit.attacked = Boolean(spec.attacked);
    unit.attacksMade = Number(spec.attacksMade) || 0;
    unit.permanentAttackLock = Boolean(spec.permanentAttackLock);
    if (spec.permanentAttackLock) { unit.canAttackLeader = false; unit.canAttackFollower = false; }
    return unit;
  };
  player.board = board.map((spec, index) => makeUnit(spec, player, "Ally", index));
  opponent.board = opponentBoard.map((spec, index) => makeUnit(spec, opponent, "Enemy", index));
  const state = { player, opponent, playerIndex: 0, enemyIndex: 1, stats: createStats() };
  const plan = planCurrentTurn({ ...state, map }, { depth, beamWidth });

  // Decode views against a cloned state as the plan advances, so transformed or
  // removed objects still produce useful QA labels.
  const viewState = clonePlanningState(state);
  const views = [];
  for (const action of plan.sequence) {
    views.push(plannerActionView(action, viewState));
    if (action.kind === "end") break;
    executePlannerAction(viewState, action, map, createRng(`inspect-view:${views.length}`));
  }
  return { sequence: views, score: plan.score, explored: plan.explored };
}

'''
text = text[:start] + new_turn + text[end:]

# Make maybeEvolve use the exact same forced-evolution executor as the planner.
old_tail = r'''  const unit = choice.unit;
  const bonus = superMode ? 3 : 2;
  player[superMode ? "sep" : "ep"] -= 1;
  player.evolutionActionUsed = true;
  unit.attack += bonus;
  unit.defense += bonus;
  unit.maxDefense += bonus;
  unit.canAttackFollower = !/can't attack followers or leaders/i.test(String(unit.card?.text ?? ""));
  if (/can't attack followers or leaders/i.test(String(unit.card?.text ?? ""))) unit.canAttackLeader = false;
  unit.evolved = true;
  unit.superEvolved = superMode;
  player.evolutionsThisMatch += 1;
  recordHandEvolution(player);
  if (superMode) stats.superEvolutions[playerIndex] += 1;
  else stats.evolutions[playerIndex] += 1;
  const actions = [];
  const evolveText = getUnitTriggeredText(unit, "evolve");
  if (evolveText) actions.push(...resolveText(evolveText, { card: unit.card, sourceUnit: unit, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map }).actions);
  if (superMode) {
    const superText = getUnitTriggeredText(unit, "superEvolve");
    if (superText) actions.push(...resolveText(superText, { card: unit.card, sourceUnit: unit, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap: map }).actions);
  }
  actions.push(...cleanup(opponent, player, enemyIndex, playerIndex, stats, rng, map));
  return { super: superMode, action: compact(`${player.name} ${superMode ? "super-evolves" : "evolves"} ${unit.name}.`, actions) };'''
new_tail = r'''  const result = executeEvolutionDecision(
    { player, opponent, playerIndex, enemyIndex, stats },
    { kind: "evolve", unitUid: choice.unit.uid, superMode, targetPlan: null },
    map,
    rng
  );
  return result.applied ? { super: superMode, action: result.action } : null;'''
repl(old_tail, new_tail, 'unify evolution execution')

path.write_text(text, encoding='utf-8')
print('Battle Sim full-turn planner materialized')
