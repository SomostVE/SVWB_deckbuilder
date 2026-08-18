const styleHref = "./css/header-layout.css";
if (!document.querySelector('link[href$="header-layout.css"]')) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = styleHref;
  document.head.appendChild(link);
}

const cardSizeSlot = document.getElementById("card-size-control-slot");
const viewControls = document.querySelector(".view-controls");
const toolbar = document.querySelector(".content-toolbar");

function mountHeaderControls() {
  const cardSize = document.querySelector(".card-size-control");
  const resetFilters = document.getElementById("reset-filters");

  // app.js still creates Card size relative to Reset filters. Do not move
  // Reset filters out of the toolbar until Card size has actually been created.
  // Module scripts can otherwise execute in an order that produces a DOM race.
  if (!cardSize) return false;

  if (cardSizeSlot && !cardSizeSlot.contains(cardSize)) {
    cardSizeSlot.appendChild(cardSize);
  }

  if (viewControls && resetFilters && resetFilters.parentElement !== viewControls) {
    viewControls.appendChild(resetFilters);
  }

  return true;
}

if (!mountHeaderControls() && toolbar) {
  const observer = new MutationObserver(() => {
    if (!mountHeaderControls()) return;
    observer.disconnect();
  });
  observer.observe(toolbar, { childList: true, subtree: true });
}
