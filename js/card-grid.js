let hoverTimer = null;
let hideTimer = null;
let hoverCard = null;
let lastPointer = { x: 0, y: 0 };
let history = [];

const PREVIEW_DELAY = 1000;
const PREVIEW_HIDE_DELAY = 1000;

export function renderCardGrid(root, cards, handlers) {
  root.innerHTML = "";

  for (const card of cards) {
    const article = document.createElement("article");
    article.className = "card-tile";

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

    article.addEventListener("pointerenter", event => {
      lastPointer = { x: event.clientX, y: event.clientY };
      cancelHide();
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => showHoverCard(card, handlers), PREVIEW_DELAY);
    });

    article.addEventListener("pointerleave", () => {
      clearTimeout(hoverTimer);
      scheduleHide();
    });

    root.appendChild(article);
  }
}

function showHoverCard(card, handlers) {
  hideHoverCard();
  history = [];

  const preview = document.createElement("div");
  preview.className = "card-hover-preview";

  preview.addEventListener("pointerenter", cancelHide);
  preview.addEventListener("pointerleave", scheduleHide);

  document.body.appendChild(preview);
  hoverCard = preview;
  renderPreviewContent(card, handlers);

  // Position once when the preview opens. It deliberately does not follow the cursor
  // and it stays at the same top/left position when navigating related cards.
  positionHoverCard(preview);
}

function renderPreviewContent(card, handlers) {
  if (!hoverCard) return;

  cancelHide();

  const relatedCards = (card.relatedCards ?? [])
    .map(id => handlers.getCardById?.(id))
    .filter(Boolean);

  hoverCard.innerHTML = `
    <div class="card-hover-main">
      <img class="card-hover-main-image" src="${escapeAttr(card.image)}" alt="${escapeAttr(card.name)}">
      <div class="card-hover-content">
        <div class="card-hover-title-row">
          <h3>${escapeHtml(card.name)}</h3>
          ${history.length ? `<button class="card-hover-back" type="button">← Back</button>` : ""}
        </div>
        <div class="card-hover-meta">${escapeHtml(card.class)} · ${escapeHtml(card.rarity)} · ${escapeHtml(card.set)}</div>
        ${card.traits?.length ? `<div class="card-hover-line"><strong>Traits:</strong> ${card.traits.map(escapeHtml).join(", ")}</div>` : ""}
        ${card.keywords?.length ? `<div class="keyword-chips">${card.keywords.map(k => `<span class="keyword-chip">${escapeHtml(k)}</span>`).join("")}</div>` : ""}
        <div class="card-hover-effect">${escapeHtml(cleanPreviewText(card.text)).replaceAll("\n", "<br>")}</div>
      </div>
    </div>

    ${relatedCards.length ? `
      <div class="card-hover-related">
        <div class="card-hover-related-title">Related cards</div>
        <div class="card-hover-related-grid">
          ${relatedCards.map(related => `
            <button class="card-hover-related-card" type="button" data-related-id="${related.id}">
              <img src="${escapeAttr(related.image)}" alt="${escapeAttr(related.name)}">
              <span>${escapeHtml(related.name)}</span>
            </button>
          `).join("")}
        </div>
      </div>
    ` : ""}
  `;

  const backButton = hoverCard.querySelector(".card-hover-back");
  backButton?.addEventListener("click", event => {
    event.stopPropagation();
    const previous = history.pop();
    if (previous) renderPreviewContent(previous, handlers);
  });

  hoverCard.querySelectorAll("[data-related-id]").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      const related = handlers.getCardById?.(button.dataset.relatedId);
      if (!related) return;
      history.push(card);
      renderPreviewContent(related, handlers);
    });
  });
}

function cleanPreviewText(value) {
  return String(value ?? "")
    .replace(/<hr\s*\/?\s*>/gi, "\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function positionHoverCard(preview) {
  const gap = 14;
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

function scheduleHide() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (!hoverCard?.matches(":hover")) hideHoverCard();
  }, PREVIEW_HIDE_DELAY);
}

function cancelHide() {
  clearTimeout(hideTimer);
}

function hideHoverCard() {
  clearTimeout(hideTimer);
  hoverCard?.remove();
  hoverCard = null;
  history = [];
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
