from pathlib import Path

ENGINE = Path("js/battle-engine-v5.js")
RULES = Path("js/battle-rules.js")

rules = RULES.read_text(encoding="utf-8")
old_rules = '''    if (isPixie && /Whenever an allied Pixie follower enters the field, give this follower \\+1\\/\\+0/i.test(String(source.card?.text ?? ""))) {
      context.buffUnit(source, 1, 0);
      actions.push(`${source.name}: +1/+0 after Pixie entry`);
    }'''
new_rules = '''    if (isPixie && name === "*** the fairy blade") {
      context.buffUnit(source, 1, 0);
      actions.push(`${source.name}: +1/+0 after Pixie entry`);
    }'''
if old_rules in rules:
    rules = rules.replace(old_rules, new_rules, 1)
elif new_rules not in rules:
    raise SystemExit("Missing Fairy Blade materialized entry anchor")
RULES.write_text(rules, encoding="utf-8")

engine = ENGINE.read_text(encoding="utf-8")
old_engine = '''  const override = FULL_OVERRIDES.get(norm(card.name));
  return override ? { ...base, level: "full", reason: `Battle Sim v5: ${override}` } : base;'''
new_engine = '''  // [[battle-forestcraft-fairy-blade-id]]
  // The upstream English data currently masks this card's leading name segment
  // as "***". Keep an ID fallback so coverage is stable if that masked segment
  // contains invisible/source-specific characters.
  const override = FULL_OVERRIDES.get(norm(card.name))
    ?? (Number(card.id) === 10311120 ? "Pixie-entry permanent attack reaction is modeled" : null);
  return override ? { ...base, level: "full", reason: `Battle Sim v5: ${override}` } : base;'''
if old_engine in engine:
    engine = engine.replace(old_engine, new_engine, 1)
elif new_engine not in engine:
    raise SystemExit("Missing analyzeCardSupport materialized anchor")
ENGINE.write_text(engine, encoding="utf-8")

print("Applied Forestcraft materializer fixes.")
