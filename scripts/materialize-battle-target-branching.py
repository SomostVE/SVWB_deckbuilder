from pathlib import Path

path = Path('js/battle-engine-v5.js')
text = path.read_text(encoding='utf-8')

def repl(old, new, label, count=1):
    global text
    if old not in text:
        raise SystemExit(f'missing patch anchor: {label}')
    text = text.replace(old, new, count)

old_best = '''function bestPlay(player, opponent) {\n  const options = getModesForHand(player)\n    .map(item => ({ ...item, score: scorePlay(item, player, opponent) }))\n    .sort((a,b)=>b.score-a.score || b.mode.cost-a.mode.cost);\n  const best = options[0] ?? null;\n  if (!best) return null;\n  return best.score > scorePassDecision(player, opponent) ? best : null;\n}\n'''
new_best = r'''function targetableEnemyFollowers(board) {
  return board.filter(unit => unit.type === "Follower" && !unit.aura && !unit.ambush);
}

function targetEffectSpec(item) {
  const text = String(item?.mode?.text || item?.instance?.card?.text || "");
  let match = text.match(/deal\s+(\d+)\s+damage to (?:an|a|the) enemy follower/i);
  if (match) return { kind: "damage", amount: Number(match[1]) || 0 };
  if (/destroy (?:an|a|the) enemy follower/i.test(text)) return { kind: "destroy", amount: 0 };
  if (/banish (?:an|a|the) enemy follower/i.test(text)) return { kind: "banish", amount: 0 };
  if (/return (?:an|a|the) enemy follower to (?:its owner'?s|their) hand/i.test(text)) return { kind: "return", amount: 0 };
  if (/deal X damage to (?:an|a|the) enemy follower/i.test(text)) return { kind: "damage", amount: Math.max(0, Number(item?.instance?.x) || 0), x: true };

  match = text.match(/select an enemy follower(?: on the field)? and deal it\s+(\d+)\s+damage/i);
  if (match) return { kind: "damage", amount: Number(match[1]) || 0, selectedGrammar: true };
  if (/select an enemy follower(?: on the field)? and destroy it/i.test(text)) return { kind: "destroy", amount: 0, selectedGrammar: true };
  if (/select an enemy follower(?: on the field)? and banish it/i.test(text)) return { kind: "banish", amount: 0, selectedGrammar: true };
  return null;
}

function followerThreatValue(unit) {
  if (!unit) return 0;
  const attack = Math.max(0, Number(unit.attack) || 0);
  const defense = Math.max(0, Number(unit.defense) || 0);
  const text = norm(unit.card?.text ?? "");
  return attack * 2.5 + defense
    + (hasU(unit, "Ward") ? 2.5 : 0)
    + (hasU(unit, "Bane") ? 2.5 : 0)
    + (hasU(unit, "Storm") ? 2 : 0)
    + (unit.evolved ? 1.5 : 0)
    + (unit.superEvolved ? 2.5 : 0)
    + (/at the (?:start|end) of your turn|whenever|once on each/.test(text) ? 2 : 0);
}

function targetBranchValue(plan, opponent) {
  if (!plan?.enemyUid) return 0;
  const unit = opponent.board.find(item => item.uid === plan.enemyUid);
  if (!unit) return -6;
  const threat = followerThreatValue(unit);
  const text = norm(unit.card?.text ?? "");
  const lastWords = /last words\s*:/.test(text);
  const fanfare = /fanfare\s*:/.test(text);
  if (plan.kind === "banish") return 8 + threat + (lastWords ? 7 : 0);
  if (plan.kind === "destroy") return 8 + threat - (lastWords ? 4 : 0);
  if (plan.kind === "return") return 5 + threat + Math.max(0, Number(unit.card?.cost) || 0) * .6 - (fanfare ? 3 : 0);
  if (plan.kind === "damage") {
    const amount = Math.max(0, Number(plan.amount) || 0);
    const barrier = Math.max(0, Number(unit.barrier) || 0) > 0;
    const kill = !barrier && amount >= Math.max(1, Number(unit.defense) || 1);
    const effective = barrier ? 0 : Math.min(amount, Math.max(0, Number(unit.defense) || 0));
    const overkill = kill ? Math.max(0, amount - Math.max(0, Number(unit.defense) || 0)) : 0;
    return (kill ? 12 + threat : effective * .9 + threat * .16) - overkill * .35;
  }
  return 0;
}

function expandPlayTargetBranches(item, opponent) {
  const spec = targetEffectSpec(item);
  if (!spec) return [{ ...item, targetPlan: null }];
  const targets = targetableEnemyFollowers(opponent.board);
  if (!targets.length) return [{ ...item, targetPlan: null }];
  return targets.map(unit => ({
    ...item,
    targetPlan: { enemyUid: unit.uid, enemyName: unit.name, kind: spec.kind, amount: spec.amount, selectedGrammar: Boolean(spec.selectedGrammar) }
  }));
}

function scoredPlayOptions(player, opponent, includeContinuation = true) {
  return getModesForHand(player)
    .flatMap(item => expandPlayTargetBranches(item, opponent))
    .map(item => ({ ...item, score: scorePlay(item, player, opponent, includeContinuation) }))
    .sort((a,b)=>b.score-a.score || b.mode.cost-a.mode.cost || String(a.targetPlan?.enemyUid ?? "").localeCompare(String(b.targetPlan?.enemyUid ?? "")));
}

function bestPlay(player, opponent) {
  const options = scoredPlayOptions(player, opponent, true);
  const best = options[0] ?? null;
  if (!best) return null;
  return best.score > scorePassDecision(player, opponent) ? best : null;
}
'''
repl(old_best, new_best, 'bestPlay target branching')

# QA state: represent targetability flags faithfully and reuse branched scoring.
repl(
'''    ambush: Boolean(unit.ambush),\n    intimidate: Boolean(unit.intimidate),''',
'''    aura: Boolean(unit.aura) || (unit.keywords ?? unit.card?.keywords ?? []).some(keyword => norm(keyword) === "aura"),\n    ambush: Boolean(unit.ambush) || (unit.keywords ?? unit.card?.keywords ?? []).some(keyword => norm(keyword) === "ambush"),\n    intimidate: Boolean(unit.intimidate) || (unit.keywords ?? unit.card?.keywords ?? []).some(keyword => norm(keyword) === "intimidate"),''',
'QA target flags')

repl(
'''  const options = getModesForHand(player)\n    .map(item => ({ ...item, score: scorePlay(item, player, opponent) }))\n    .sort((a,b)=>b.score-a.score || b.mode.cost-a.mode.cost);''',
'''  const options = scoredPlayOptions(player, opponent, true);''',
'inspect branched options')

repl(
'''    mode: selected?.mode?.kind ?? null,\n    score: selected ? selected.score : passScore,''',
'''    mode: selected?.mode?.kind ?? null,\n    targetName: selected?.targetPlan?.enemyName ?? null,\n    targetKind: selected?.targetPlan?.kind ?? null,\n    score: selected ? selected.score : passScore,''',
'inspect target result')

# Add QA hook for true random target selection.
qa_anchor = '''function scorePassDecision(player, opponent) {'''
qa_insert = r'''export function inspectRandomEnemyTargets(board = [], seeds = []) {
  const units = board.map((unit, index) => ({
    uid: unit.uid ?? `random-${index}`,
    type: "Follower",
    name: unit.name ?? `Follower ${index + 1}`,
    attack: Math.max(0, Number(unit.attack) || 0),
    defense: Math.max(1, Number(unit.defense) || 1),
    card: { name: unit.name ?? `Follower ${index + 1}`, text: unit.text ?? "", keywords: [...(unit.keywords ?? [])] },
    keywords: [...(unit.keywords ?? [])],
    aura: Boolean(unit.aura), ambush: Boolean(unit.ambush)
  }));
  return seeds.map(seed => chooseRandomTarget(units, createRng(String(seed)))?.name ?? null);
}

'''
repl(qa_anchor, qa_insert + qa_anchor, 'random target QA hook')

# Make defensive projection follow the actual branch instead of inventing another target.
old_projection = '''  const enemyFollowers = projectedOpponent.board.filter(unit => unit.type === "Follower");\n  const allRemoval = /(?:destroy|banish|return)[^.]*all enemy followers/.test(text);\n  if (allRemoval) {\n    projectedOpponent.board = projectedOpponent.board.filter(unit => unit.type !== "Follower");\n  } else if (/(?:destroy|banish|return)[^.]*enemy follower/.test(text) && enemyFollowers.length) {\n    const target = [...enemyFollowers].sort((a,b)=>(Number(b.attack)||0)-(Number(a.attack)||0))[0];\n    projectedOpponent.board = projectedOpponent.board.filter(unit => unit !== target);\n  } else {\n    const damage = Number(text.match(/deal\\s+(\\d+)\\s+damage to (?:an?|the selected )?enemy follower/i)?.[1] ?? 0);\n    if (damage > 0) {\n      const killable = enemyFollowers\n        .filter(unit => (Number(unit.defense) || 0) <= damage)\n        .sort((a,b)=>(Number(b.attack)||0)-(Number(a.attack)||0));\n      if (killable.length) projectedOpponent.board = projectedOpponent.board.filter(unit => unit !== killable[0]);\n    }\n  }'''
new_projection = '''  const enemyFollowers = projectedOpponent.board.filter(unit => unit.type === "Follower");\n  const allRemoval = /(?:destroy|banish|return)[^.]*all enemy followers/.test(text);\n  const planned = item.targetPlan?.enemyUid ? enemyFollowers.find(unit => unit.uid === item.targetPlan.enemyUid) : null;\n  if (allRemoval) {\n    projectedOpponent.board = projectedOpponent.board.filter(unit => unit.type !== "Follower");\n  } else if (planned && ["destroy", "banish", "return"].includes(item.targetPlan.kind)) {\n    projectedOpponent.board = projectedOpponent.board.filter(unit => unit !== planned);\n  } else if (planned && item.targetPlan.kind === "damage") {\n    const damage = Math.max(0, Number(item.targetPlan.amount) || 0);\n    if (!(Number(planned.barrier) > 0) && damage >= (Number(planned.defense) || 0)) projectedOpponent.board = projectedOpponent.board.filter(unit => unit !== planned);\n  } else if (/(?:destroy|banish|return)[^.]*enemy follower/.test(text) && enemyFollowers.length) {\n    const target = [...enemyFollowers].sort((a,b)=>(Number(b.attack)||0)-(Number(a.attack)||0))[0];\n    projectedOpponent.board = projectedOpponent.board.filter(unit => unit !== target);\n  } else {\n    const damage = Number(text.match(/deal\\s+(\\d+)\\s+damage to (?:an?|the selected )?enemy follower/i)?.[1] ?? 0);\n    if (damage > 0) {\n      const killable = enemyFollowers\n        .filter(unit => (Number(unit.defense) || 0) <= damage)\n        .sort((a,b)=>(Number(b.attack)||0)-(Number(a.attack)||0));\n      if (killable.length) projectedOpponent.board = projectedOpponent.board.filter(unit => unit !== killable[0]);\n    }\n  }'''
repl(old_projection, new_projection, 'target-aware survival projection')

repl(
'''  score += timingLookaheadValue(item, player, opponent);\n  score += survivalLookaheadValue(item, player, opponent);''',
'''  score += targetBranchValue(item.targetPlan, opponent);\n  score += timingLookaheadValue(item, player, opponent);\n  score += survivalLookaheadValue(item, player, opponent);''',
'target branch scoring')

repl(
'''    bestFollowUp = getModesForHand(player)\n      .map(other => ({ ...other, score: scorePlay(other, player, opponent, false) }))\n      .sort((a,b)=>b.score-a.score || b.mode.cost-a.mode.cost)[0] ?? null;''',
'''    bestFollowUp = scoredPlayOptions(player, opponent, false)[0] ?? null;''',
'continuation target branching')

# Execute the branch that was scored.
repl(
'''      const result = playCard(play.instance, play.mode, player, opponent, playerIndex, enemyIndex, stats, rng, map);''',
'''      const result = playCard(play.instance, play.mode, player, opponent, playerIndex, enemyIndex, stats, rng, map, { targetPlan: play.targetPlan });''',
'runTurn planned target')

repl(
'''function playCard(inst, mode, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap) {''',
'''function playCard(inst, mode, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap, options = {}) {''',
'playCard options')

repl(
'''    const result = resolveText(mode.text || card.text, { card, instance: inst, sourceUnit: source, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap });''',
'''    const result = resolveText(mode.text || card.text, { card, instance: inst, sourceUnit: source, player, opponent, playerIndex, enemyIndex, stats, rng, cardMap, targetPlan: options.targetPlan ?? null });''',
'pass target plan into resolver')

# Target resolution: selected targets obey the plan; random targets use actual RNG.
old_targets = r'''  for (const match of [...text.matchAll(/deal (\d+) damage to (a random|random|an|a|the) enemy follower/gi)]) {
    const random = /random/i.test(match[2]);
    const target = chooseTarget(ctx.opponent.board, !random);
    if (target) {
      damageUnit(target, Number(match[1]), ctx.opponent, ctx.player, ctx, actions);
      actions.push(`${match[1]} to ${target.name}`);
    }
    text = text.replace(match[0], "");
  }'''
new_targets = r'''  for (const match of [...text.matchAll(/deal (\d+) damage to (a random|random|an|a|the) enemy follower/gi)]) {
    const random = /random/i.test(match[2]);
    const target = random ? chooseRandomTarget(ctx.opponent.board, ctx.rng) : choosePlannedTarget(ctx, ctx.opponent.board);
    if (target) {
      damageUnit(target, Number(match[1]), ctx.opponent, ctx.player, ctx, actions);
      actions.push(`${match[1]} to ${target.name}`);
    }
    text = text.replace(match[0], "");
  }'''
repl(old_targets, new_targets, 'damage target resolution')

repl(
'''    const unit = chooseTarget(ctx.opponent.board, true);\n    if (unit && destroyUnit(ctx.opponent, unit)) actions.push(`destroy ${unit.name}`);''',
'''    const unit = choosePlannedTarget(ctx, ctx.opponent.board);\n    if (unit && destroyUnit(ctx.opponent, unit)) actions.push(`destroy ${unit.name}`);''',
'destroy planned target')
repl(
'''    const unit = chooseTarget(ctx.opponent.board, false);\n    if (unit && destroyUnit(ctx.opponent, unit)) actions.push(`destroy ${unit.name}`);''',
'''    const unit = chooseRandomTarget(ctx.opponent.board, ctx.rng);\n    if (unit && destroyUnit(ctx.opponent, unit)) actions.push(`destroy ${unit.name}`);''',
'destroy random target')
repl(
'''    const unit = chooseTarget(ctx.opponent.board, true);\n    if (unit) { banish(ctx.opponent, unit); actions.push(`banish ${unit.name}`); }''',
'''    const unit = choosePlannedTarget(ctx, ctx.opponent.board);\n    if (unit) { banish(ctx.opponent, unit); actions.push(`banish ${unit.name}`); }''',
'banish planned target')
repl(
'''    const unit = chooseTarget(ctx.opponent.board, true);\n    if (unit) { bounce(ctx.opponent, unit); actions.push(`return ${unit.name}`); }''',
'''    const unit = choosePlannedTarget(ctx, ctx.opponent.board);\n    if (unit) { bounce(ctx.opponent, unit); actions.push(`return ${unit.name}`); }''',
'bounce planned target')
repl(
'''    const target = chooseTarget(ctx.opponent.board, true);\n    if (target) { damageUnit(target, x, ctx.opponent, ctx.player, ctx, actions); actions.push(`${x} to ${target.name}`); }''',
'''    const target = choosePlannedTarget(ctx, ctx.opponent.board);\n    if (target) { damageUnit(target, x, ctx.opponent, ctx.player, ctx, actions); actions.push(`${x} to ${target.name}`); }''',
'X planned target')

# Generic rules also honor an explicitly planned enemy target.
repl(
'''    chooseEnemyFollower: board => chooseTarget(board, true),''',
'''    chooseEnemyFollower: board => choosePlannedTarget(ctx, board),''',
'generic target plan')

old_choose = '''function chooseTarget(board, targeted) {\n  return board.filter(unit => unit.type === "Follower" && (!targeted || (!unit.aura && !unit.ambush))).sort((a,b)=>b.attack+b.defense-a.attack-a.defense)[0] ?? null;\n}\n'''
new_choose = r'''function chooseTarget(board, targeted) {
  return board.filter(unit => unit.type === "Follower" && (!targeted || (!unit.aura && !unit.ambush))).sort((a,b)=>b.attack+b.defense-a.attack-a.defense)[0] ?? null;
}

function choosePlannedTarget(ctx, board) {
  const legal = targetableEnemyFollowers(board);
  const planned = ctx?.targetPlan?.enemyUid ? legal.find(unit => unit.uid === ctx.targetPlan.enemyUid) : null;
  return planned ?? legal.sort((a,b)=>followerThreatValue(b)-followerThreatValue(a))[0] ?? null;
}

function chooseRandomTarget(board, rng) {
  const eligible = board.filter(unit => unit.type === "Follower");
  if (!eligible.length) return null;
  return eligible[Math.floor(rng() * eligible.length)] ?? eligible[0];
}
'''
repl(old_choose, new_choose, 'planned/random target primitives')

path.write_text(text, encoding='utf-8')
print('Battle Sim target branching materialized')
