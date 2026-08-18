const styleHref = "./css/header-layout.css";
if (!document.querySelector('link[href$="header-layout.css"]')) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = styleHref;
  document.head.appendChild(link);
}

const slot = document.getElementById("card-size-control-slot");
const toolbar = document.querySelector(".content-toolbar");

function mountCardSizeControl() {
  const control = document.querySelector(".card-size-control");
  if (!slot || !control || slot.contains(control)) return Boolean(control);
  slot.appendChild(control);
  return true;
}

if (!mountCardSizeControl() && toolbar && slot) {
  const observer = new MutationObserver(() => {
    if (!mountCardSizeControl()) return;
    observer.disconnect();
  });
  observer.observe(toolbar, { childList: true, subtree: true });
}
