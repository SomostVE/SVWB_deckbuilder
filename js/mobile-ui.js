const mq = matchMedia("(max-width: 760px)");
const shell = document.querySelector(".app-shell");

if (shell) {
  const nav = document.createElement("nav");
  nav.className = "mobile-section-nav";
  nav.innerHTML = '<button type="button" data-view="cards">Cards</button><button type="button" data-view="filters">Filters</button><button type="button" data-view="deck">Deck <span class="mobile-deck-count"></span></button>';
  document.body.appendChild(nav);

  const buttons = [...nav.querySelectorAll("[data-view]")];
  const deckCount = document.getElementById("deck-count");
  const deckBadge = nav.querySelector(".mobile-deck-count");

  function choose(view, save = true) {
    const next = ["cards", "filters", "deck"].includes(view) ? view : "cards";
    document.body.dataset.mobileView = next;
    buttons.forEach(button => button.classList.toggle("active", button.dataset.view === next));
    if (save) localStorage.setItem("svwb-mobile-view", next);
  }

  function refreshMode() {
    if (mq.matches) choose(localStorage.getItem("svwb-mobile-view") || "cards", false);
    else delete document.body.dataset.mobileView;
  }

  function refreshDeckBadge() {
    if (!deckCount || !deckBadge) return;
    deckBadge.textContent = String(deckCount.textContent || "0").match(/\d+/)?.[0] || "0";
  }

  buttons.forEach(button => button.addEventListener("click", () => choose(button.dataset.view)));
  if (deckCount) new MutationObserver(refreshDeckBadge).observe(deckCount, { childList: true, subtree: true, characterData: true });
  mq.addEventListener?.("change", refreshMode);
  refreshDeckBadge();
  refreshMode();
}
