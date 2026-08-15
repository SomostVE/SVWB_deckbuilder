from pathlib import Path
path = Path('js/battle-engine-v5.js')
text = path.read_text(encoding='utf-8')
old = '''  const best = finalists[0] ?? { sequence: [{ kind: "end" }], score: plannerStateValue(root, true), state: root, priorTotal: 0 };\n  const candidateLimit = Math.max(1, Number(options.candidateLimit ?? 4) || 4);\n  return {\n    sequence: best.sequence,\n    score: best.score,\n    explored: finalists.length,\n    candidates: finalists.length ? finalists.slice(0, candidateLimit) : [best]\n  };'''
new = '''  const best = finalists[0] ?? { sequence: [{ kind: "end" }], score: plannerStateValue(root, true), state: root, priorTotal: 0 };\n  const candidateLimit = Math.max(1, Number(options.candidateLimit ?? 4) || 4);\n  const diverseCandidates = [];\n  const firstActionKeys = new Set();\n  for (const candidate of (finalists.length ? finalists : [best])) {\n    const key = actionKey(candidate.sequence?.[0] ?? { kind: "end" });\n    if (firstActionKeys.has(key)) continue;\n    firstActionKeys.add(key);\n    diverseCandidates.push(candidate);\n    if (diverseCandidates.length >= candidateLimit) break;\n  }\n  return {\n    sequence: best.sequence,\n    score: best.score,\n    explored: finalists.length,\n    candidates: diverseCandidates.length ? diverseCandidates : [best]\n  };'''
if old not in text:
    raise SystemExit('two-turn candidate return anchor missing')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('Battle Sim future candidates diversified')
