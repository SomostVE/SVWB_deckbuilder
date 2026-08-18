from pathlib import Path

ENGINE = Path("js/battle-engine-v5.js")
RULES = Path("js/battle-rules.js")
engine = ENGINE.read_text(encoding="utf-8")
rules = RULES.read_text(encoding="utf-8")

# battle-rules.js: natural comma lifecycle triggers are real lifecycle events.
old = '''export function getTriggeredText(card, event, mode = null) {
  // Lifecycle events are emitted centrally by the battle engine. Injecting
  // destruction/turn-end hooks here made those events run once per unit text
  // and then again through the engine's explicit event dispatch.
  const base = core.getTriggeredText(card, event, mode);
  if (base) return base;
  // [[battle-natural-evolve-trigger-v5]]
  if (event === "evolve") {
    const text = String(card?.text ?? "").toLowerCase().replace(/[’‘]/g, "'").replace(/\\s+/g, " ").trim();
    const reactive = text.match(/when this follower evolves,\\s*([^.]*(?:\\.|$))/i);
    if (reactive) return reactive[1].trim();
  }
  return "";
}
'''
new = '''function extractNaturalLifecycleText(card, event) {
  const text = String(card?.text ?? "").replace(/[’‘]/g, "'").replace(/\\s+/g, " ").trim();
  const starts = {
    evolve: /\\bwhen this follower evolves,\\s*/i,
    turnEnd: /\\bat the end of your turn,\\s*/i,
    turnStart: /\\bat the start of your turn,\\s*/i
  };
  const startPattern = starts[event];
  if (!startPattern) return "";
  const match = startPattern.exec(text);
  if (!match) return "";
  const tail = text.slice(match.index + match[0].length);
  const next = tail.search(/\\b(?:Fanfare|Last Words|Strike|Clash|Evolve|Super-Evolve|Enhance\\s*\\(?\\s*\\d+\\s*\\)?|Accelerate\\s*\\(?\\s*\\d+\\s*\\)?|Crystallize\\s*\\(?\\s*\\d+\\s*\\)?|Engage\\s*\\(?\\s*\\d*\\s*\\)?|On Spellboost)\\s*:|\\b(?:at the end of your turn|at the start of your turn|when this follower evolves),\\s*/i);
  return (next < 0 ? tail : tail.slice(0, next)).trim();
}

export function getTriggeredText(card, event, mode = null) {
  // Lifecycle events are emitted centrally by the battle engine. Injecting
  // destruction/turn-end hooks here made those events run once per unit text
  // and then again through the engine's explicit event dispatch.
  const base = core.getTriggeredText(card, event, mode);
  if (base) return base;
  // [[battle-natural-lifecycle-trigger-v5]]
  return extractNaturalLifecycleText(card, event);
}
'''
if old not in rules:
    raise SystemExit("Missing battle-rules natural evolve anchor")
rules = rules.replace(old, new, 1)

# V5 section extraction must stop before natural lifecycle clauses so Fanfare
# resolution never executes a deferred end-turn/evolve effect early.
old = '''  const next = markers.find(marker => marker.start > hit.start);
  return text.slice(hit.end, next?.start ?? text.length).trim();
}'''
new = '''  const next = markers.find(marker => marker.start > hit.start);
  const tailEnd = next?.start ?? text.length;
  const tail = text.slice(hit.end, tailEnd);
  const natural = tail.search(/\\b(?:at the end of your turn|at the start of your turn|when this follower evolves),\\s*/i);
  return (natural < 0 ? tail : tail.slice(0, natural)).trim();
}'''
if old not in engine:
    raise SystemExit("Missing V5 section tail anchor")
engine = engine.replace(old, new, 1)

old = '''function baseText(text) {
  const clean = stripFuseAbilityText(text);
  const fanfare = section(clean, "fanfare");
  if (fanfare) return fanfare;
  const index = String(clean).search(/\\b(?:Last Words|Strike|Clash|Evolve|Super-Evolve|Enhance|Accelerate|Crystallize|Engage|On Spellboost|At the start of your turn|At the end of your turn)\\s*\\(?\\s*\\d*\\s*\\)?\\s*:/i);
  return index < 0 ? String(clean) : String(clean).slice(0, index).trim();
}'''
new = '''function baseText(text) {
  const clean = stripFuseAbilityText(text);
  const fanfare = section(clean, "fanfare");
  if (fanfare) return fanfare;
  const value = String(clean);
  const colonIndex = value.search(/\\b(?:Last Words|Strike|Clash|Evolve|Super-Evolve|Enhance|Accelerate|Crystallize|Engage|On Spellboost|At the start of your turn|At the end of your turn)\\s*\\(?\\s*\\d*\\s*\\)?\\s*:/i);
  const naturalIndex = value.search(/\\b(?:At the end of your turn|At the start of your turn|When this follower evolves),\\s*/i);
  const indexes = [colonIndex, naturalIndex].filter(index => index >= 0);
  const index = indexes.length ? Math.min(...indexes) : -1;
  return index < 0 ? value : value.slice(0, index).trim();
}'''
if old not in engine:
    raise SystemExit("Missing V5 baseText anchor")
engine = engine.replace(old, new, 1)

ENGINE.write_text(engine, encoding="utf-8")
RULES.write_text(rules, encoding="utf-8")
print("Materialized natural-language Battle Sim lifecycle dispatch.")
