const undoButton = document.getElementById("undo-deck");
const redoButton = document.getElementById("redo-deck");
const clearDeckButton = document.getElementById("clear-deck");
const activeFilters = document.getElementById("active-filters");

setupIconButton(undoButton, "↶", "Undo");
setupIconButton(redoButton, "↷", "Redo");
setupClearDeckConfirmation(clearDeckButton);
setupCompactActiveFilters(activeFilters);

function setupIconButton(button, glyph, label) {
  if (!button) return;
  button.textContent = glyph;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.classList.add("header-icon-button");
}

function setupClearDeckConfirmation(button) {
  if (!button) return;

  const normalLabel = "Clear deck";
  let armedUntil = 0;
  let resetTimer = 0;

  const reset = () => {
    armedUntil = 0;
    window.clearTimeout(resetTimer);
    button.classList.remove("confirming");
    button.textContent = normalLabel;
    button.setAttribute("aria-label", normalLabel);
    button.title = normalLabel;
  };

  button.title = normalLabel;

  button.addEventListener("click", event => {
    const deckCount = Number.parseInt(document.getElementById("deck-count")?.textContent ?? "0", 10) || 0;
    if (deckCount <= 0) {
      reset();
      return;
    }

    const now = performance.now();
    if (now < armedUntil) {
      reset();
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    armedUntil = now + 2600;
    button.classList.add("confirming");
    button.textContent = "Confirm";
    button.setAttribute("aria-label", "Confirm clear deck");
    button.title = "Click again to clear the deck";
    resetTimer = window.setTimeout(reset, 2600);
  }, true);

  document.addEventListener("pointerdown", event => {
    if (!armedUntil || event.target === button || button.contains(event.target)) return;
    reset();
  }, true);

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && armedUntil) reset();
  });
}

function setupCompactActiveFilters(root) {
  if (!root) return;

  const compact = () => {
    for (const button of root.querySelectorAll(".active-filter-chip")) {
      if (button.dataset.compactFilter === "1") continue;

      const raw = String(button.textContent ?? "").trim();
      const match = raw.match(/^([^:]+):\s*(.*?)\s*×$/);
      if (!match) {
        button.dataset.compactFilter = "1";
        continue;
      }

      const kind = match[1].trim();
      const value = match[2].trim();
      if (!value) continue;

      button.dataset.compactFilter = "1";
      button.dataset.filterKind = kind.toLowerCase().replace(/\s+/g, "-");
      button.title = `${kind}: ${value}`;
      button.setAttribute("aria-label", `Remove ${kind} filter: ${value}`);
      button.textContent = `${value} ×`;
    }
  };

  const observer = new MutationObserver(compact);
  observer.observe(root, { childList: true, subtree: true });
  compact();
}
