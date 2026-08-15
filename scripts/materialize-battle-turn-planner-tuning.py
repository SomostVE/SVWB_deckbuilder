from pathlib import Path
path = Path('js/battle-engine-v5.js')
text = path.read_text(encoding='utf-8')
old = '''  if (ended) {\n    score += scorePassDecision(player, opponent) * .65;\n    score -= Math.max(0, Number(player.pp) || 0) * (style === "aggro" ? .38 : .22);\n  }'''
new = '''  if (ended) {\n    // Unspent PP is not inherently a mistake. Passing can be the correct\n    // decision when every available play destroys future card value. Keep a\n    // small tempo cost for floating PP, but let the explicit pass/hold policy\n    // dominate rather than forcing the planner to dump context-only cards.\n    score += scorePassDecision(player, opponent) * .9;\n    score -= Math.max(0, Number(player.pp) || 0) * (style === "aggro" ? .12 : .04);\n  }'''
if old not in text:
    raise SystemExit('planner terminal valuation anchor missing')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('Battle Sim planner terminal valuation tuned')
