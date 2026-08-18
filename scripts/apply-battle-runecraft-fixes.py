from pathlib import Path

path = Path("js/battle-engine-v5.js")
source = path.read_text(encoding="utf-8")

old = '''  for (const unit of units) if (unit.type === "Follower") ctx.__sideActions?.push?.(...applyEntryEvents(local, unit));
  return units.length;
}'''
new = '''  // [[battle-runecraft-summon-entry-events]]
  // Entry effects are game state, not optional replay text. Always execute them;
  // only buffering their action strings is optional.
  for (const unit of units) {
    if (unit.type !== "Follower") continue;
    const entryActions = applyEntryEvents(local, unit);
    if (entryActions.length) ctx.__sideActions?.push?.(...entryActions);
  }
  return units.length;
}'''

if "[[battle-runecraft-summon-entry-events]]" not in source:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"summonWithEvents anchor expected once, found {count}")
    source = source.replace(old, new, 1)

path.write_text(source, encoding="utf-8")
print("Runecraft follow-up fixes materialized.")
