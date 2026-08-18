from pathlib import Path

ENGINE = Path("js/battle-engine-v5.js")
text = ENGINE.read_text(encoding="utf-8")

old = '''  const devoteeUnit = boardFollower(instance(devotee.player, byName("Devotee of Disdain")));
  devotee.player.board = [devoteeUnit];'''
new = '''  const devoteeUnit = boardFollower(instance(devotee.player, byName("Devotee of Disdain")));
  // Give the QA subject enough defense to survive two separate damage events;
  // the card only draws when the damage event does not destroy it.
  devoteeUnit.defense += 2;
  devoteeUnit.maxDefense += 2;
  devotee.player.board = [devoteeUnit];'''
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit("Missing Devotee QA anchor")

ENGINE.write_text(text, encoding="utf-8")
print("Applied Dragoncraft materializer fixes.")
