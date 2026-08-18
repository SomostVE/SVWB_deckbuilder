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
  let ready = true;

  if (cardSizeSlot && cardSize) {
    if (!cardSizeSlot.contains(cardSize)) cardSizeSlot.appendChild(cardSize);
  } else if (cardSizeSlot) {
    ready = false;
  }

  if (viewControls && resetFilters && resetFilters.parentElement !== viewControls) {
    viewControls.appendChild(resetFilters);
  }

  return ready;
}

if (!mountHeaderControls() && toolbar) {
  const observer = new MutationObserver(() => {
    if (!mountHeaderControls()) return;
    observer.disconnect();
  });
  observer.observe(toolbar, { childList: true, subtree: true });
}
