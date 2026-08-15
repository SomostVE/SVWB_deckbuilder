from pathlib import Path
path = Path('js/battle-engine-v5.js')
text = path.read_text(encoding='utf-8')

old = '''  const best = finalists[0] ?? { sequence: [{ kind: "end" }], score: plannerStateValue(root, true), state: root, priorTotal: 0 };\n  const candidateLimit = Math.max(1, Number(options.candidateLimit ?? 4) || 4);\n  return {\n    sequence: best.sequence,\n    score: best.score,\n    explored: finalists.length,\n    candidates: finalists.length ? finalists.slice(0, candidateLimit) : [best]\n  };'''
new = '''  const best = finalists[0] ?? { sequence: [{ kind: "end" }], score: plannerStateValue(root, true), state: root, priorTotal: 0 };\n  const candidateLimit = Math.max(1, Number(options.candidateLimit ?? 4) || 4);\n  const diverseCandidates = [];\n  const firstActionKeys = new Set();\n  for (const candidate of (finalists.length ? finalists : [best])) {\n    const key = actionKey(candidate.sequence?.[0] ?? { kind: "end" });\n    if (firstActionKeys.has(key)) continue;\n    firstActionKeys.add(key);\n    diverseCandidates.push(candidate);\n    if (diverseCandidates.length >= candidateLimit) break;\n  }\n  return {\n    sequence: best.sequence,\n    score: best.score,\n    explored: finalists.length,\n    candidates: diverseCandidates.length ? diverseCandidates : [best]\n  };'''
if old not in text:
    raise SystemExit('two-turn candidate return anchor missing')
text = text.replace(old, new, 1)

anchor = '''function shouldUseTwoTurnLookahead(base, player, opponent, options) {'''
helper = r'''function buildFutureFirstActionCandidates({ player, opponent, playerIndex, enemyIndex, stats, map }, options = {}) {
  const { state: root, seed } = makePlanningRoot({ player, opponent, playerIndex, enemyIndex, stats });
  const rootActions = enumeratePlannerActions(root.player, root.opponent, map);
  const limit = Math.max(2, Math.min(5, Number(options.futureCandidateLimit ?? 4) || 4));
  const selected = [];
  const seen = new Set();
  for (const action of rootActions) {
    const key = actionKey(action);
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(action);
    if (selected.length >= limit) break;
  }
  if (!selected.some(action => action.kind === "end")) selected.push({ kind: "end", prior: scorePassDecision(root.player, root.opponent) });

  const candidates = [];
  for (const first of selected) {
    if (first.kind === "end") {
      candidates.push({
        state: clonePlanningState(root),
        sequence: [first],
        priorTotal: Number(first.prior) || 0,
        score: plannerStateValue(root, true)
      });
      continue;
    }

    const child = clonePlanningState(root);
    const firstRng = createRng(`${seed}|future-first|${actionKey(first)}`);
    const outcome = executePlannerAction(child, first, map, firstRng);
    if (!outcome.applied) continue;
    const sequence = [first];
    let priorTotal = Math.max(-20, Math.min(40, Number(first.prior) || 0));

    if (child.player.hp > 0 && child.opponent.hp > 0) {
      const continuation = planCurrentTurnBase(
        { ...child, map },
        {
          depth: Math.max(1, Math.min(3, Number(options.futureContinuationDepth ?? 2) || 2)),
          beamWidth: 2,
          candidateLimit: 1
        }
      );
      const remaining = continuation.sequence ?? [];
      executePlannerSequence(child, remaining, map, `${seed}|future-continuation|${actionKey(first)}`);
      sequence.push(...remaining);
    }

    candidates.push({
      state: child,
      sequence,
      priorTotal,
      score: plannerStateValue(child, true) + priorTotal * .14
    });
  }
  return candidates.sort((a,b)=>b.score-a.score);
}

'''
if anchor not in text:
    raise SystemExit('two-turn first-action helper anchor missing')
text = text.replace(anchor, helper + anchor, 1)

old_wrapper = '''function planCurrentTurn({ player, opponent, playerIndex, enemyIndex, stats, map }, options = {}) {\n  const base = planCurrentTurnBase(\n    { player, opponent, playerIndex, enemyIndex, stats, map },\n    { ...options, candidateLimit: Math.max(4, Number(options.candidateLimit ?? 4) || 4) }\n  );\n  if (!shouldUseTwoTurnLookahead(base, player, opponent, options)) {\n    return { ...base, futureEvaluated: false, immediateScore: base.score, futureScore: null, worstFutureScore: null };\n  }\n\n  const candidates = uniqueFirstActionCandidates(base.candidates, 3);\n  const evaluated = candidates.map(candidate => ({\n    candidate,\n    ...evaluateCandidateFuture(candidate, player, opponent, map, options)\n  })).sort((a,b)=>b.combined-a.combined || b.candidate.score-a.candidate.score);\n  const best = evaluated[0];\n  return {\n    sequence: best?.candidate?.sequence ?? base.sequence,\n    score: best?.combined ?? base.score,\n    explored: base.explored,\n    candidates: base.candidates,\n    futureEvaluated: true,\n    immediateScore: best?.candidate?.score ?? base.score,\n    futureScore: best?.future ?? null,\n    worstFutureScore: best?.worst ?? null,\n    futureSamples: best?.samples ?? 0\n  };\n}'''
new_wrapper = '''function planCurrentTurn({ player, opponent, playerIndex, enemyIndex, stats, map }, options = {}) {\n  const input = { player, opponent, playerIndex, enemyIndex, stats, map };\n  const base = planCurrentTurnBase(\n    input,\n    { ...options, candidateLimit: Math.max(4, Number(options.candidateLimit ?? 4) || 4) }\n  );\n  const futureCandidates = buildFutureFirstActionCandidates(input, options);\n  const futureBase = { ...base, candidates: futureCandidates };\n  if (!shouldUseTwoTurnLookahead(futureBase, player, opponent, options)) {\n    return { ...base, futureEvaluated: false, immediateScore: base.score, futureScore: null, worstFutureScore: null };\n  }\n\n  const candidates = uniqueFirstActionCandidates(futureCandidates, 4);\n  const evaluated = candidates.map(candidate => ({\n    candidate,\n    ...evaluateCandidateFuture(candidate, player, opponent, map, options)\n  })).sort((a,b)=>b.combined-a.combined || b.candidate.score-a.candidate.score);\n  const best = evaluated[0];\n  return {\n    sequence: best?.candidate?.sequence ?? base.sequence,\n    score: best?.combined ?? base.score,\n    explored: base.explored,\n    candidates: futureCandidates,\n    futureEvaluated: true,\n    immediateScore: best?.candidate?.score ?? base.score,\n    futureScore: best?.future ?? null,\n    worstFutureScore: best?.worst ?? null,\n    futureSamples: best?.samples ?? 0\n  };\n}'''
if old_wrapper not in text:
    raise SystemExit('two-turn wrapper anchor missing')
text = text.replace(old_wrapper, new_wrapper, 1)

path.write_text(text, encoding='utf-8')
print('Battle Sim future first-action search diversified')
