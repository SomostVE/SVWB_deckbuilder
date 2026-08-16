const controls = [
  document.getElementById("battle-your-deck"),
  document.getElementById("battle-player-strategy"),
  document.getElementById("battle-opponent"),
  document.getElementById("benchmark-scope"),
  document.getElementById("benchmark-games"),
  document.getElementById("benchmark-compare")
].filter(Boolean);

const runButton = document.getElementById("benchmark-run");
const cancelButton = document.getElementById("benchmark-cancel");
const results = document.getElementById("benchmark-results");
const progress = document.getElementById("benchmark-progress");
const progressLabel = document.getElementById("benchmark-progress-label");

const headingLabels = new Map([
  ["Mirror win rate", "Mirror WR"],
  ["Win rate", "WR"],
  ["95% confidence interval", "95% CI"],
  ["Win rate when going first", "First WR"],
  ["Win rate when going second", "Second WR"],
  ["First/Second win-rate gap", "First/Second gap"],
  ["Wins / Losses / Draws", "W / L / D"],
  ["Average ending turn", "Avg turn"],
  ["Rule gaps per game", "Rule gaps / game"],
  ["Rules coverage", "Coverage"],
  ["Deck A win rate", "Deck A WR"],
  ["Deck B win rate", "Deck B WR"],
  ["Win-rate difference (B − A)", "WR diff (B − A)"],
  ["Deck A 95% confidence interval", "Deck A 95% CI"],
  ["Deck B 95% confidence interval", "Deck B 95% CI"],
  ["Deck A First / Second win rate", "Deck A First / Second WR"],
  ["Deck B First / Second win rate", "Deck B First / Second WR"],
  ["Rules coverage A / B", "Coverage A / B"]
]);

const metricLabels = new Map([
  ["Overall win rate", "Overall WR"],
  ["Average rounds", "Avg turns"],
  ["Average First/Second gap", "First/Second gap"],
  ["Rule gaps per game", "Rule gaps / game"],
  ["Average mirror win rate", "Mirror WR"],
  ["Average ending turn", "Avg turn"],
  ["Overall win-rate difference", "WR diff"],
  ["First/Second gap · Deck A / Deck B", "First/Second gap · A / B"],
  ["Rule gaps per game · Deck A / Deck B", "Rule gaps / game · A / B"]
]);

function isRunning() {
  return Boolean(cancelButton && !cancelButton.hidden);
}

function clearStaleOutput() {
  if (isRunning()) return;
  if (results) results.innerHTML = "";
  if (progress) {
    progress.value = 0;
    progress.hidden = true;
  }
  if (progressLabel) progressLabel.textContent = "";
}

function syncControlLock() {
  const running = isRunning();
  for (const control of controls) control.disabled = running;
}

function compactResults() {
  if (!results) return;

  results.querySelectorAll(".benchmark-note").forEach(node => node.remove());

  for (const heading of results.querySelectorAll(".benchmark-table th")) {
    const replacement = headingLabels.get(heading.textContent.trim());
    if (replacement) heading.textContent = replacement;
  }

  for (const label of results.querySelectorAll(".benchmark-overall .battle-stat span")) {
    const replacement = metricLabels.get(label.textContent.trim());
    if (replacement) label.textContent = replacement;
  }

  for (const meta of results.querySelectorAll(".benchmark-table td small")) {
    meta.textContent = meta.textContent
      .replace(/\s·\s(?:exploratory|medium|high)(?:\s+sample)?$/i, "")
      .trim();
  }

  for (const coverage of results.querySelectorAll(".benchmark-coverage.good")) {
    coverage.textContent = coverage.textContent.replace(/^Good\s*·\s*/i, "");
  }
}

for (const control of controls) {
  control.addEventListener("change", clearStaleOutput);
}

runButton?.addEventListener("click", () => {
  if (!runButton.disabled) {
    if (results) results.innerHTML = "";
    if (progressLabel) progressLabel.textContent = "";
  }
});

cancelButton?.addEventListener("click", () => {
  setTimeout(() => {
    clearStaleOutput();
    syncControlLock();
  }, 0);
});

if (cancelButton) {
  new MutationObserver(syncControlLock).observe(cancelButton, {
    attributes: true,
    attributeFilter: ["hidden"]
  });
}

if (results) {
  new MutationObserver(compactResults).observe(results, {
    childList: true,
    subtree: true
  });
}

syncControlLock();
compactResults();
