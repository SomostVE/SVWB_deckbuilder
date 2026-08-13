let hoverTimer = null;
let hoverCard = null;
let lastPointer = { x: 0, y: 0 };

export function renderCardGrid(root, cards, handlers) {
  root.innerHTML = "";

  for (const card of cards) {
    const article = document.createElement("article");
    article.className = "card-tile";
    article.title = `${card.name}\nLeft click: add card\nRight click: remove card`;

    const quantity = handlers.getQuantity?.(card) ?? 0;

    article.innerHTML = `
      <img src="${escapeAttr(card.image)}" alt="${escapeAttr(card.name)}" loading="lazy">
      ${quantity > 0 ? `<span class="card-quantity">${quantity}</span>` : ""}
    `;

    article.addEventListener("click", () => handlers.onAdd(card));

    article.addEventListener("contextmenu", event => {
      event.preventDefault();
      handlers.onRemove(card);
    });

    article.addEventListener("pointermove", event => {
      lastPointer = { x: event.clientX, y: event.clientY };
      if (hoverCard) positionHoverCard(hoverCard);
    });

    article.addEventListener("pointerenter", event => {
      lastPointer = { x: event.clientX, y: event.clientY };
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => showHoverCard(card), 1000);
    });

    article.addEventListener("pointerleave", () => {
      clearTimeout(hoverTimer);
      hideHoverCard();
    });

    root.appendChild(article);
  }
}

function showHoverCard(card) {
  hideHoverCard();

  const preview = document.createElement("div");
  preview.className = "card-hover-preview";
  preview.innerHTML = `
    <img src="${escapeAttr(card.image)}" alt="">
    <div class="card-hover-content">
      <h3>${escapeHtml(card.name)}</h3>
      <div class="card-hover-meta">${escapeHtml(card.class)} · ${escapeHtml(card.rarity)} · ${escapeHtml(card.set)}</div>
      ${card.traits?.length ? `<div class="card-hover-line"><strong>Traits:</strong> ${card.traits.map(escapeHtml).join(", ")}</div>` : ""}
      ${card.keywords?.length ? `<div class="keyword-chips">${card.keywords.map(k => `<span class="keyword-chip">${escapeHtml(k)}</span>`).join("")}</div>` : ""}
      <div class="card-hover-effect">${escapeHtml(card.text).replaceAll("\n", "<br>")}</div>
    </div>
  `;

  document.body.appendChild(preview);
  hoverCard = preview;
  positionHoverCard(preview);
}

function positionHoverCard(preview) {
  const gap = 18;
  const rect = preview.getBoundingClientRect();
  let left = lastPointer.x + gap;
  let top = lastPointer.y + gap;

  if (left + rect.width > window.innerWidth - 8) left = lastPointer.x - rect.width - gap;
  if (top + rect.height > window.innerHeight - 8) top = window.innerHeight - rect.height - 8;
  if (top < 8) top = 8;
  if (left < 8) left = 8;

  preview.style.left = `${left}px`;
  preview.style.top = `${top}px`;
}

function hideHoverCard() {
  hoverCard?.remove();
  hoverCard = null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
