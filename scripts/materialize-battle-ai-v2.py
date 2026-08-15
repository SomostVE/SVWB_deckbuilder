from pathlib import Path

path = Path("js/battle-engine-v5.js")
text = path.read_text()


def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    text = text.replace(old, new, 1)


old_turn = '''      useBonusPpIfUseful(p, o);

      let safety = 0;
      while (safety++ < MAX_ACTIONS) {
        const engage = bestEngage(p, o);
        const play = bestPlay(p, o);
        if (!engage && !play) break;
        if (engage && (!play || engage.score > play.score)) {
          const result = resolveEngage(engage.unit, p, o, active, enemy, stats, rng, simulationMap);
          snap(frames, players, { round, active, phase: "play", action: compact(`${p.name} engages ${engage.unit.name}${engage.cost ? ` (${engage.cost} PP)` : ""}.`, result.actions) }, stats, recordFrames);
        } else {
          const result = playCard(play.instance, play.mode, p, o, active, enemy, stats, rng, simulationMap);
          snap(frames, players, { round, active, phase: "play", action: compact(`${p.name} plays ${play.instance.card.name} (${play.mode.cost} PP${play.mode.kind !== "base" ? ` · ${cap(play.mode.kind)}` : ""}).`, result.actions) }, stats, recordFrames);
        }
        if (p.hp <= 0) { winner = enemy; break outer; }
        if (o.hp <= 0) { winner = active; break outer; }
      }

      const evo = maybeEvolve(p, o, active, enemy, stats, rng, simulationMap);
      if (evo) snap(frames, players, { round, active, phase: evo.super ? "super-evolve" : "evolve", action: evo.action }, stats, recordFrames);
      if (p.hp <= 0) { winner = enemy; break outer; }
      if (o.hp <= 0) { winner = active; break outer; }

      attackPhase(p, o, active, enemy, stats, frames, players, round, rng, simulationMap, recordFrames);
      if (p.hp <= 0) { winner = enemy; break outer; }
      if (o.hp <= 0) { winner = active; break outer; }
'''
new_turn = '''      useBonusPpIfUseful(p, o);
      runTurnAi({
        player: p, opponent: o, playerIndex: active, enemyIndex: enemy,
        stats, frames, players, round, rng, map: simulationMap, record: recordFrames
      });
      if (p.hp <= 0) { winner = enemy; break outer; }
      if (o.hp <= 0) { winner = active; break outer; }
'''
replace_once(old_turn, new_turn, "turn AI scheduler")

old_mulligan = '''function mulligan(player, rng, stats, index, frames, players, record) {
  const out = player.hand.filter(item => Number(item.card.cost) > player.strategy.mulliganMaxCost && !/maximum play points|draw/i.test(norm(item.card.text)));
  if (!out.length) return;
  const ids = new Set(out.map(item => item.uid));
  player.hand = player.hand.filter(item => !ids.has(item.uid));
  const replacements = [];
  while (replacements.length < out.length && player.deck.length) replacements.push(player.deck.shift());
  player.hand.push(...replacements);
  player.deck.push(...out);
  shuffle(player.deck, rng);
  snap(frames, players, { round: 0, active: index, phase: "mulligan", action: `${player.name} redraws ${out.length} opening card${out.length === 1 ? "" : "s"}.` }, stats, record);
}
'''
new_mulligan = '''function mulligan(player, rng, stats, index, frames, players, record) {
  const out = player.hand.filter(item => shouldMulligan(item, player));
  if (!out.length) return;
  const ids = new Set(out.map(item => item.uid));
  player.hand = player.hand.filter(item => !ids.has(item.uid));
  const replacements = [];
  while (replacements.length < out.length && player.deck.length) replacements.push(player.deck.shift());
  player.hand.push(...replacements);
  player.deck.push(...out);
  shuffle(player.deck, rng);
  snap(frames, players, { round: 0, active: index, phase: "mulligan", action: `${player.name} redraws ${out.length} opening card${out.length === 1 ? "" : "s"}.` }, stats, record);
}

function shouldMulligan(item, player) {
  const card = item.card;
  const cost = Math.max(0, Number(card.cost) || 0);
  const text = norm(card.text);
  const style = String(player.strategy?.style ?? "midrange");
  const maxCost = Math.max(1, Number(player.strategy?.mulliganMaxCost ?? 3));

  if (style === "aggro") {
    if (cost <= 2) return false;
    if (cost >= 4) return true;
  }
  if ((style === "buff-tempo" || style === "puppetry-tempo") && cost <= 2) return false;
  if (style === "ramp" && /maximum play points/.test(text) && cost <= 4) return false;
  if (style === "spell-combo" && cost <= 3 && (card.type === "Spell" || /draw|spellboost/.test(text))) return false;
  if ((style === "ward-control" || style === "control") && cost <= 3 && (has(card, "Ward") || /draw|restore .*leader/.test(text))) return false;

  if (cost > maxCost + 1) return true;
  if (cost > maxCost && !/draw|maximum play points/.test(text)) return true;
  return false;
}
'''
replace_once(old_mulligan, new_mulligan, "mulligan heuristics")

anchor_after_immediate = '''function bestImmediateTurnAction(player, opponent) {
  const play = bestPlay(player, opponent);
  const engage = bestEngage(player, opponent);
  if (!engage) return play;
  if (!play) return engage;
  return engage.score > play.score ? engage : play;
}
'''
insert_scheduler = anchor_after_immediate + '''

// [[battle-ai-v2-sequencing]]
function runTurnAi({ player, opponent, playerIndex, enemyIndex, stats, frames, players, round, rng, map, record }) {
  let safety = 0;
  let setupAttempts = 0;

  while (safety++ < MAX_ACTIONS) {
    // Never develop past a lethal already available on board.
    if (hasCollectiveBoardLethal(player, opponent)) {
      attackPhase(player, opponent, playerIndex, enemyIndex, stats, frames, players, round, rng, map, record);
      if (player.hp <= 0 || opponent.hp <= 0) return;
    }

    // High-impact evolution effects should resolve before committing the rest
    // of the turn, especially board clears, draws and summons.
    if (!player.evolutionActionUsed) {
      const earlyEvo = maybeEvolve(player, opponent, playerIndex, enemyIndex, stats, rng, map, { phase: "pre-development" });
      if (earlyEvo) {
        snap(frames, players, { round, active: playerIndex, phase: earlyEvo.super ? "super-evolve" : "evolve", action: earlyEvo.action }, stats, record);
        if (player.hp <= 0 || opponent.hp <= 0) return;
        continue;
      }
    }

    // If the field is full but a permanent card is otherwise playable, allow
    // a profitable sacrificial trade before development to open a board slot.
    if (hasBlockedBoardDevelopment(player) && setupAttempts < 2) {
      const attacksBefore = Number(stats.attacks?.[playerIndex]) || 0;
      const boardBefore = player.board.length;
      attackPhase(player, opponent, playerIndex, enemyIndex, stats, frames, players, round, rng, map, record, { setupOnly: true });
      if (player.hp <= 0 || opponent.hp <= 0) return;
      const attacked = (Number(stats.attacks?.[playerIndex]) || 0) > attacksBefore;
      if (attacked) {
        setupAttempts += 1;
        if (player.board.length < boardBefore || !hasBlockedBoardDevelopment(player)) continue;
      } else setupAttempts = 2;
    }

    const engage = bestEngage(player, opponent);
    const play = bestPlay(player, opponent);
    if (!engage && !play) break;

    if (engage && (!play || engage.score > play.score + .5)) {
      const result = resolveEngage(engage.unit, player, opponent, playerIndex, enemyIndex, stats, rng, map);
      snap(frames, players, { round, active: playerIndex, phase: "play", action: compact(`${player.name} engages ${engage.unit.name}${engage.cost ? ` (${engage.cost} PP)` : ""}.`, result.actions) }, stats, record);
    } else {
      const result = playCard(play.instance, play.mode, player, opponent, playerIndex, enemyIndex, stats, rng, map);
      snap(frames, players, { round, active: playerIndex, phase: "play", action: compact(`${player.name} plays ${play.instance.card.name} (${play.mode.cost} PP${play.mode.kind !== "base" ? ` · ${cap(play.mode.kind)}` : ""}).`, result.actions) }, stats, record);
    }
    if (player.hp <= 0 || opponent.hp <= 0) return;
  }

  const evo = maybeEvolve(player, opponent, playerIndex, enemyIndex, stats, rng, map, { phase: "post-development" });
  if (evo) snap(frames, players, { round, active: playerIndex, phase: evo.super ? "super-evolve" : "evolve", action: evo.action }, stats, record);
  if (player.hp <= 0 || opponent.hp <= 0) return;

  attackPhase(player, opponent, playerIndex, enemyIndex, stats, frames, players, round, rng, map, record);
}

function hasBlockedBoardDevelopment(player) {
  if (player.board.length < 5) return false;
  const pp = Math.max(0, Number(player.pp) || 0);
  return player.hand.some(item => {
    if (item.card.type === "Spell") return false;
    if (costOf(item) <= pp) return true;
    const text = String(item.card.text ?? "");
    return [...text.matchAll(/Enhance\\s*\\(?\\s*(\\d+)\\s*\\)?\\s*:/gi)].some(match => Number(match[1]) <= pp);
  });
}
'''
replace_once(anchor_after_immediate, insert_scheduler, "AI scheduler helpers")

old_best_engage = '''function bestEngage(player, opponent) {
  return player.board.filter(unit => unit.type === "Amulet" && !unit.engagedThisTurn)
    .map(unit => ({ unit, ...engageInfo(unit) }))
    .filter(item => item.text != null && item.cost <= player.pp)
    .map(item => ({ ...item, score: /draw|destroy|damage|restore|summon/i.test(item.text) ? 5 : 2 }))
    .sort((a,b)=>b.score-a.score)[0] ?? null;
}
'''
new_best_engage = '''function bestEngage(player, opponent) {
  return player.board.filter(unit => unit.type === "Amulet" && !unit.engagedThisTurn)
    .map(unit => ({ unit, ...engageInfo(unit) }))
    .filter(item => item.text != null && item.cost <= player.pp)
    .map(item => ({ ...item, score: scoreEngage(item, player, opponent) }))
    .sort((a,b)=>b.score-a.score)[0] ?? null;
}

function scoreEngage(item, player, opponent) {
  const text = norm(item.text);
  const foes = opponent.board.filter(unit => unit.type === "Follower");
  let score = 1.5 - item.cost * .15;
  if (/draw/.test(text)) score += player.hand.length >= 8 ? -3 : player.hand.length <= 5 ? 5 : 2;
  if (/destroy|banish|damage/.test(text)) score += foes.length ? 4 + Math.min(5, strongestFollowerThreat(foes) * .18) : -4;
  if (/restore/.test(text)) score += player.hp <= 10 ? 6 : player.hp <= 15 ? 3 : -1;
  if (/summon/.test(text)) score += player.board.length <= 3 ? 4 : player.board.length === 4 ? 1 : -5;
  return score;
}
'''
replace_once(old_best_engage, new_best_engage, "engage scoring")

old_score_play = '''function scorePlay(item, player, opponent) {
  const card = item.instance.card;
  const text = norm(item.mode.text || card.text);
  const cost = item.mode.cost;
  const style = player.strategy.style;
  let score = cost * 1.7 + item.mode.scoreBonus;
  if (card.type === "Follower" && !["accelerate","crystallize"].includes(item.mode.kind)) score += 2;
  if (item.mode.kind === "crystallize") score += player.personalTurn <= 3 ? 3 : 0;
  if (/draw/.test(text)) score += player.hand.length <= 5 ? 4 : 1;
  if (/destroy|banish|damage to .*enemy follower/.test(text)) score += opponent.board.some(unit => unit.type === "Follower") ? 6 : -2;
  if (/enemy leader/.test(text) || has(card, "Storm")) score += opponent.hp <= 12 ? 7 : 2;
  if (/restore .*leader/.test(text)) score += player.hp <= 13 ? 7 : -1;
  if (/maximum play points/.test(text)) score += style === "ramp" && player.maxPp < 7 ? 12 : 1;
  if (style === "aggro" && cost <= 3) score += 3;
  if (style === "spell-combo" && (card.type === "Spell" || item.mode.kind === "accelerate")) score += 5;
  if (/select a mode/i.test(card.text)) score += 2;
  return score;
}
'''
new_score_play = '''function scorePlay(item, player, opponent) {
  const card = item.instance.card;
  const text = norm(item.mode.text || card.text);
  const cost = item.mode.cost;
  const style = String(player.strategy?.style ?? "midrange");
  const foes = opponent.board.filter(unit => unit.type === "Follower");
  const boardSlots = Math.max(0, 5 - player.board.length);
  const handAfterPlay = Math.max(0, player.hand.length - 1);
  let score = 1 + cost * 1.15 + item.mode.scoreBonus;

  if (card.type === "Follower" && !["accelerate","crystallize"].includes(item.mode.kind)) score += 2.2;
  if (item.mode.kind === "crystallize") score += player.personalTurn <= 3 ? 3 : -.5;

  if (/draw/.test(text)) {
    if (handAfterPlay >= 8) score -= 5;
    else if (handAfterPlay <= 4) score += 5;
    else score += 2;
  }

  if (/destroy|banish|damage to .*enemy follower/.test(text)) {
    score += foes.length ? 4 + Math.min(7, strongestFollowerThreat(foes) * .22) : -5;
  }
  if (/return .*enemy follower/.test(text)) score += foes.length ? 4 : -4;

  if (/enemy leader/.test(text) || has(card, "Storm")) score += opponent.hp <= 8 ? 10 : opponent.hp <= 12 ? 6 : 2;
  if (/restore .*leader/.test(text)) score += player.hp <= 8 ? 9 : player.hp <= 13 ? 5 : player.hp < player.maxHp ? 1 : -3;
  if (/maximum play points/.test(text)) score += style === "ramp" && player.maxPp < 7 ? 13 : player.maxPp < 5 ? 4 : 0;

  if (/summon/.test(text)) score += boardSlots >= 2 ? 3 : boardSlots === 1 ? .5 : -6;
  if (has(card, "Ward")) score += (style === "ward-control" || style === "control") ? (player.hp <= 10 ? 4 : 2) : .5;

  if (style === "aggro") {
    if (cost <= 3) score += 3;
    if (has(card, "Storm") || /enemy leader/.test(text)) score += 2;
  }
  if (style === "buff-tempo" && /give .*\\+\\d+\\/\\+\\d+|buff/.test(text)) score += 3;
  if (style === "puppetry-tempo" && /puppet|puppetry|summon/.test(text)) score += 2.5;
  if (style === "spell-combo" && (card.type === "Spell" || item.mode.kind === "accelerate")) score += 5;
  if (/select a mode/i.test(card.text)) score += 1.5;

  score += continuationValue(item, player);
  if (cost === player.pp) score += .6;
  return score;
}

function continuationValue(item, player) {
  const remaining = Math.max(0, (Number(player.pp) || 0) - (Number(item.mode.cost) || 0));
  if (!remaining) return 0;
  const previousPp = player.pp;
  player.pp = remaining;
  let followUp = false;
  try {
    followUp = player.hand.some(other => other.uid !== item.instance.uid && modes(other, player).length > 0);
  } finally {
    player.pp = previousPp;
  }
  if (followUp) return 1.5;
  return remaining >= 2 ? -.75 : -.15;
}

function strongestFollowerThreat(foes) {
  return foes.reduce((best, unit) => Math.max(best,
    Math.max(0, Number(unit.attack) || 0) * 2.5
      + Math.max(0, Number(unit.defense) || 0)
      + (hasU(unit, "Ward") ? 2 : 0)
      + (hasU(unit, "Bane") ? 2 : 0)
  ), 0);
}
'''
replace_once(old_score_play, new_score_play, "play scoring")

old_evo_sig = '''function maybeEvolve(player, opponent, playerIndex, enemyIndex, stats, rng, map) {
'''
new_evo_sig = '''function maybeEvolve(player, opponent, playerIndex, enemyIndex, stats, rng, map, options = {}) {
'''
replace_once(old_evo_sig, new_evo_sig, "evolution options signature")

old_evo_gate = '''  const effectBest = Math.max(
    normalBest ? evolutionEffectValue(normalBest.unit, player, opponent, false) : -Infinity,
    superBest ? evolutionEffectValue(superBest.unit, player, opponent, true) : -Infinity
  );
  const tacticalNeed = opponent.board.some(unit => unit.type === "Follower")
'''
new_evo_gate = '''  const effectBest = Math.max(
    normalBest ? evolutionEffectValue(normalBest.unit, player, opponent, false) : -Infinity,
    superBest ? evolutionEffectValue(superBest.unit, player, opponent, true) : -Infinity
  );

  if (options.phase === "pre-development") {
    const style = String(player.strategy?.style ?? "midrange");
    const foeCount = opponent.board.filter(unit => unit.type === "Follower").length;
    const threshold = style === "ward-control" || style === "control" ? 5 : style === "aggro" ? 7 : 6;
    const highImpact = effectBest >= threshold;
    const urgentClear = foeCount >= 3 && effectBest >= 4;
    const crowdedSequence = player.board.length >= 4 && effectBest >= 5;
    if (!highImpact && !urgentClear && !crowdedSequence) return null;
  }

  const tacticalNeed = opponent.board.some(unit => unit.type === "Follower")
'''
replace_once(old_evo_gate, new_evo_gate, "pre-development evolution gate")

old_attack_sig = '''function attackPhase(player, opponent, playerIndex, enemyIndex, stats, frames, players, round, rng, map, record) {
  for (const attacker of [...player.board].filter(unit => unit.type === "Follower")) {
    while (player.board.includes(attacker) && attacker.attacksMade < attacker.maxAttacks) {
'''
new_attack_sig = '''function attackPhase(player, opponent, playerIndex, enemyIndex, stats, frames, players, round, rng, map, record, options = {}) {
  const setupOnly = Boolean(options.setupOnly);
  const attackers = setupOnly ? rankSetupAttackers(player, opponent) : [...player.board].filter(unit => unit.type === "Follower");
  for (const attacker of attackers) {
    if (setupOnly && player.board.length < 5) return;
    while (player.board.includes(attacker) && attacker.attacksMade < attacker.maxAttacks) {
      if (setupOnly && player.board.length < 5) return;
'''
replace_once(old_attack_sig, new_attack_sig, "attack phase options")

old_attack_choice = '''      let target = null, leader = false;
      if (wards.length) {
        if (canFollower && attackableWards.length) target = tradeTarget(attacker, attackableWards, player.strategy);
        else break;
      } else if (canLeader && hasCollectiveBoardLethal(player, opponent)) leader = true;
      else if (canLeader && shouldFace(attacker, player, opponent, foes, rng)) leader = true;
      else if (canFollower && foes.length) target = tradeTarget(attacker, foes, player.strategy);
      else if (canLeader) leader = true;
      else break;
'''
new_attack_choice = '''      let target = null, leader = false;
      if (setupOnly) {
        const candidates = wards.length ? attackableWards : foes;
        const sacrificeTargets = candidates.filter(unit => willFollowerDieInCombat(attacker, unit, player));
        if (canFollower && sacrificeTargets.length) target = tradeTarget(attacker, sacrificeTargets, player.strategy);
        else break;
      } else if (wards.length) {
        if (canFollower && attackableWards.length) target = tradeTarget(attacker, attackableWards, player.strategy);
        else break;
      } else if (canLeader && hasCollectiveBoardLethal(player, opponent)) leader = true;
      else if (canLeader && shouldFace(attacker, player, opponent, foes, rng)) leader = true;
      else if (canFollower && foes.length) target = tradeTarget(attacker, foes, player.strategy);
      else if (canLeader) leader = true;
      else break;
'''
replace_once(old_attack_choice, new_attack_choice, "setup attack choice")

old_attack_helpers = '''function attackable(board) { return board.filter(unit => unit.type === "Follower" && !unit.intimidate && !unit.ambush); }
function activeWards(board) { return board.filter(unit => unit.type === "Follower" && hasU(unit, "Ward") && !unit.intimidate && !unit.ambush); }
'''
new_attack_helpers = '''function attackable(board) { return board.filter(unit => unit.type === "Follower" && !unit.intimidate && !unit.ambush); }
function activeWards(board) { return board.filter(unit => unit.type === "Follower" && hasU(unit, "Ward") && !unit.intimidate && !unit.ambush); }

function rankSetupAttackers(player, opponent) {
  const wards = activeWards(opponent.board);
  const targets = wards.length ? wards : attackable(opponent.board);
  return player.board
    .filter(unit => unit.type === "Follower" && unit.canAttackFollower && unit.attacksMade < unit.maxAttacks)
    .map(unit => ({ unit, score: setupSacrificeScore(unit, targets, player) }))
    .filter(entry => Number.isFinite(entry.score))
    .sort((a, b) => b.score - a.score)
    .map(entry => entry.unit);
}

function setupSacrificeScore(attacker, targets, player) {
  let best = -Infinity;
  const ownValue = Math.max(0, Number(attacker.attack) || 0) * 1.6 + Math.max(0, Number(attacker.defense) || 0);
  for (const target of targets) {
    if (!willFollowerDieInCombat(attacker, target, player)) continue;
    const kills = canCombatRemove(attacker, target);
    const threat = Math.max(0, Number(target.attack) || 0) * 2.5 + Math.max(0, Number(target.defense) || 0);
    best = Math.max(best, (kills ? 18 : 4) + threat - ownValue * .35);
  }
  return best;
}

function willFollowerDieInCombat(attacker, target, owner) {
  if (!attacker || !target) return false;
  if (attacker.superEvolved && owner.isActive) return false;
  if (hasU(target, "Bane")) return true;
  if ((Number(attacker.barrier) || 0) > 0) return false;
  return Math.max(0, Number(target.attack) || 0) >= Math.max(0, Number(attacker.defense) || 0);
}
'''
replace_once(old_attack_helpers, new_attack_helpers, "setup attack helpers")

path.write_text(text)
print("Battle AI v2 materialized")
