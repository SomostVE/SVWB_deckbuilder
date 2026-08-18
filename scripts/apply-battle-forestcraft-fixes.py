from pathlib import Path

RULES = Path("js/battle-rules.js")
text = RULES.read_text(encoding="utf-8")
old = '''    if (isPixie && /Whenever an allied Pixie follower enters the field, give this follower \\+1\\/\\+0/i.test(String(source.card?.text ?? ""))) {
      context.buffUnit(source, 1, 0);
      actions.push(`${source.name}: +1/+0 after Pixie entry`);
    }'''
new = '''    if (isPixie && name === "*** the fairy blade") {
      context.buffUnit(source, 1, 0);
      actions.push(`${source.name}: +1/+0 after Pixie entry`);
    }'''
if old not in text:
    raise SystemExit("Missing Fairy Blade materialized anchor")
RULES.write_text(text.replace(old, new, 1), encoding="utf-8")
print("Applied Forestcraft materializer fixes.")
