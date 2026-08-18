from pathlib import Path

ENGINE = Path("js/battle-engine-v5.js")
text = ENGINE.read_text(encoding="utf-8")
anchor = '''// [[battle-high-risk-generic-foundation]]
function highRiskWordNumber'''
replacement = '''// [[battle-high-risk-generic-foundation]]
function buff(unit, attack, defense) {
  if (!unit) return;
  unit.attack += Number(attack) || 0;
  unit.defense += Number(defense) || 0;
  unit.maxDefense += Number(defense) || 0;
}

function highRiskWordNumber'''
if anchor not in text:
    raise SystemExit("Missing high-risk foundation helper anchor")
text = text.replace(anchor, replacement, 1)
ENGINE.write_text(text, encoding="utf-8")
print("Applied high-risk grammar helper fixes.")
