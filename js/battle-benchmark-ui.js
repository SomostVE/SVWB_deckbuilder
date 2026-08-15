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

syncControlLock();
