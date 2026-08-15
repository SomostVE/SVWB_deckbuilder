const status = document.getElementById("battle-status");

if (status) {
  let applying = false;
  const sync = () => {
    if (applying) return;
    const text = status.textContent || "";
    if (!text.includes("win-rate benchmarking stays locked")) return;
    applying = true;
    status.textContent = text.replace(
      "win-rate benchmarking stays locked until rule coverage is stronger.",
      "replay and benchmark remain experimental for this matchup."
    );
    applying = false;
  };

  new MutationObserver(sync).observe(status, { childList: true, characterData: true, subtree: true });
  sync();
}

const benchmarkResults = document.getElementById("benchmark-results");
const benchmarkStatus = document.getElementById("benchmark-status");

if (benchmarkResults || benchmarkStatus) {
  let applying = false;
  const replacements = [
    ["Unresolved / game", "Rule gaps / game"],
    ["Unresolved · A / B", "Rule gaps · A / B"],
    ["Unresolved", "Rule gaps"],
    ["unresolved-rule rate", "rule-gap exposure rate"]
  ];

  const rewriteText = root => {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      let next = node.nodeValue || "";
      for (const [from, to] of replacements) next = next.replaceAll(from, to);
      if (next !== node.nodeValue) node.nodeValue = next;
    }
  };

  const sync = () => {
    if (applying) return;
    applying = true;
    rewriteText(benchmarkResults);
    rewriteText(benchmarkStatus);
    applying = false;
  };

  if (benchmarkResults) new MutationObserver(sync).observe(benchmarkResults, { childList: true, characterData: true, subtree: true });
  if (benchmarkStatus) new MutationObserver(sync).observe(benchmarkStatus, { childList: true, characterData: true, subtree: true });
  sync();
}
