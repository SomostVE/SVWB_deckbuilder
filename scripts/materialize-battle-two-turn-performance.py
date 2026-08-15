from pathlib import Path
path = Path('js/battle-engine-v5.js')
text = path.read_text(encoding='utf-8')

def repl(old, new, label):
    global text
    if old not in text:
        raise SystemExit(f'missing performance anchor: {label}')
    text = text.replace(old, new, 1)

repl(
'''      for (const item of p.hand) item.fusedThisTurn = false;''',
'''      for (const item of p.hand) item.fusedThisTurn = false;\n      p.futureLookaheadUsedThisTurn = false;''',
'reset future budget')

repl(
'''    leaderDamageCap: null, leaderDamageCapUntilOpponentTurnEnd: false,\n    goingFirst: false, goingSecond: false, personalTurn: 0, cardsPlayedThisTurn: 0, spellsPlayedThisTurn: 0,''',
'''    leaderDamageCap: null, leaderDamageCapUntilOpponentTurnEnd: false,\n    goingFirst: false, goingSecond: false, personalTurn: 0, cardsPlayedThisTurn: 0, spellsPlayedThisTurn: 0, futureLookaheadUsedThisTurn: false,''',
'initialize future budget')

repl(
'''    const plan = planCurrentTurn({ player, opponent, playerIndex, enemyIndex, stats, map });\n    const decision = plan.sequence[0] ?? { kind: "end" };''',
'''    const plan = planCurrentTurn({ player, opponent, playerIndex, enemyIndex, stats, map });\n    if (plan.futureEvaluated) player.futureLookaheadUsedThisTurn = true;\n    const decision = plan.sequence[0] ?? { kind: "end" };''',
'consume future budget')

old_gate = '''function shouldUseTwoTurnLookahead(base, player, opponent, options) {\n  if (options.disableFuture) return false;\n  const candidates = uniqueFirstActionCandidates(base.candidates, 3);\n  if (candidates.length < 2) return false;\n  if (options.forceFuture) return true;\n  if (player.personalTurn < 3) return false;\n\n  const incoming = estimateVisibleIncomingDamage(player, opponent);\n  const margin = player.hp - incoming;\n  const topGap = Math.abs((candidates[0]?.score ?? 0) - (candidates[1]?.score ?? 0));\n  const style = String(player.strategy?.style ?? "midrange");\n  const resourceSensitive = style === "control" || style === "ward-control" || style === "spell-combo" || style === "ramp";\n\n  if (margin <= 7) return true;\n  if (topGap <= 4.5 && player.hand.length >= 2) return true;\n  return resourceSensitive && topGap <= 6.5 && player.hand.length >= 3 && player.personalTurn >= 4;\n}'''
new_gate = '''function shouldUseTwoTurnLookahead(base, player, opponent, options) {\n  if (options.disableFuture) return false;\n  const candidates = uniqueFirstActionCandidates(base.candidates, 3);\n  if (candidates.length < 2) return false;\n  if (options.forceFuture) return true;\n  if (player.futureLookaheadUsedThisTurn) return false;\n  if (player.personalTurn < 4) return false;\n\n  const incoming = estimateVisibleIncomingDamage(player, opponent);\n  const margin = player.hp - incoming;\n  const topGap = Math.abs((candidates[0]?.score ?? 0) - (candidates[1]?.score ?? 0));\n  const style = String(player.strategy?.style ?? "midrange");\n  const resourceSensitive = style === "control" || style === "ward-control" || style === "spell-combo" || style === "ramp";\n\n  // Future search is a critical-decision layer, not something to run after every\n  // action. One deep check per real turn is enough; the full-turn beam planner\n  // handles ordinary sequencing. This keeps 100-1000 game benchmarks practical.\n  if (margin <= 4) return true;\n  return resourceSensitive && player.personalTurn >= 5 && player.hand.length >= 3 && topGap <= 2.5;\n}'''
repl(old_gate, new_gate, 'critical future gate')

repl(
'''  const sampleCount = Math.max(1, Math.min(3, Number(options.futureSamples ?? 2) || 2));''',
'''  const defaultSamples = options.forceFuture ? 2 : 1;\n  const sampleCount = Math.max(1, Math.min(2, Number(options.futureSamples ?? defaultSamples) || defaultSamples));''',
'future sample count')

repl(
'''  const responsePlan = planCurrentTurnBase(\n    { ...responseState, map },\n    { depth: 2, beamWidth: 2, candidateLimit: 1 }\n  );''',
'''  const responsePlan = planCurrentTurnBase(\n    { ...responseState, map },\n    { depth: 1, beamWidth: 1, candidateLimit: 1 }\n  );''',
'shallow opponent response')

old_next = '''  // The second ply values what we can actually do on our following turn rather\n  // than merely counting remaining HP. Keep it deliberately shallow so the\n  // planner remains usable inside 1000-game benchmarks.\n  const nextState = {\n    player: original,\n    opponent: enemy,\n    playerIndex: originalIndex,\n    enemyIndex,\n    stats: state.stats\n  };\n  const nextPlan = planCurrentTurnBase(\n    { ...nextState, map },\n    { depth: 2, beamWidth: 2, candidateLimit: 1 }\n  );\n  return { value: nextPlan.score, survived: original.hp > 0, state, responsePlan, nextPlan };'''
new_next = '''  // Reaching our following turn is the second ply. Evaluate that real state and\n  // its best immediate option instead of launching another beam tree: this keeps\n  // future reasoning bounded while still valuing saved cards and next-turn plays.\n  const nextState = {\n    player: original,\n    opponent: enemy,\n    playerIndex: originalIndex,\n    enemyIndex,\n    stats: state.stats\n  };\n  const immediateOptions = [\n    ...scoredPlayOptions(original, enemy, false).slice(0, 1).map(option => option.score),\n    ...getFuseActions(original, enemy, map).slice(0, 1).map(option => option.score),\n    ...enumerateEvolutionDecisions(original, enemy).slice(0, 1).map(option => option.prior),\n    ...enumerateAttackDecisions(original, enemy).slice(0, 1).map(option => option.prior)\n  ];\n  const nextActionValue = immediateOptions.length ? Math.max(...immediateOptions) : scorePassDecision(original, enemy);\n  const nextScore = plannerStateValue(nextState, false) + Math.max(-10, Math.min(30, nextActionValue)) * .18;\n  return { value: nextScore, survived: original.hp > 0, state, responsePlan, nextPlan: null };'''
repl(old_next, new_next, 'cheap following-turn valuation')

path.write_text(text, encoding='utf-8')
print('Battle Sim two-turn performance bounded')
