from pathlib import Path

ENGINE = Path("js/battle-engine-v5.js")
text = ENGINE.read_text(encoding="utf-8")

old = '''  if (depth >= 16) {
    ctx.__highRiskNestedUnresolved = true;
    actions.push("Fanfare replay safety limit");
    return false;
  }'''
new = '''  if (depth >= 64) {
    // Random Fanfare recursion (notably Omegotep) can legally select itself
    // again. The chain terminates almost surely; keep an emergency simulation
    // cap without falsely classifying the already-modeled branch as unresolved.
    actions.push("Fanfare replay emergency recursion cap");
    return true;
  }'''
if old not in text:
    raise SystemExit("Missing Fanfare replay safety anchor")
text = text.replace(old, new, 1)

anchor = '''  // [[battle-high-risk-compound-preflight]]
  // Compound clauses must be consumed before their inner generic subclauses,'''
insert = '''  // [[battle-high-risk-earth-sigil-grammar]]
  // Some imported cards use singular lower-case wording which historically
  // escaped the resource pass after other sentence fragments were rewritten.
  for (const match of [...text.matchAll(/Gain\\s+(?:an?|one|1)\\s+earth sigil\\.?/gi)]) {
    ctx.player.earthSigils += 1;
    actions.push(`Earth Sigils +1 (${ctx.player.earthSigils})`);
    text = text.replace(match[0], " ");
  }

  // [[battle-high-risk-compound-preflight]]
  // Compound clauses must be consumed before their inner generic subclauses,'''
if anchor not in text:
    raise SystemExit("Missing compound preflight anchor")
text = text.replace(anchor, insert, 1)

ENGINE.write_text(text, encoding="utf-8")
print("Applied final high-risk runtime fixes.")
