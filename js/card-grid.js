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
    if (!card.deckSelectable) article.classList.add("generated-card");
    if (handlers.isFavorite?.(card)) article.classList.add("favorite-card");
    if (handlers.isExcluded?.(card)) article.classList.add("excluded-card");

    const quantity = handlers.getQuantity?.(card) ?? 0;
    const owned = handlers.getOwned?.(card) ?? 0;

    article.innerHTML = `
      <img src="${escapeAttr(card.image)}" alt="${escapeAttr(card.name)}" loading="lazy">
      ${quantity > 0 ? `<span class="card-quantity">${quantity}</span>` : ""}
      ${owned > 0 ? `<span class="card-owned">O${owned}</span>` : ""}
      ${handlers.isFavorite?.(card) ? `<span class="card-favorite">★</span>` : ""}
      ${!card.deckSelectable ? `<span class="card-generated-label">Generated</span>` : ""}
    `;

    article.addEventListener("click", () => {
      if (card.deckSelectable) handlers.onAdd?.(card);
      else showHoverCard(card, handlers);
    });

    article.addEventListener("contextmenu", event => {
      event.preventDefault();
      if (card.deckSelectable) handlers.onRemove?.(card);
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
  positionHoverCard(preview);
}

function renderPreviewContent(card, handlers) {
  if (!hoverCard) return;
  cancelHide();

  const relatedGroups = handlers.getRelatedGroups?.(card) ?? [];
  const packages = handlers.getPackagesForCard?.(card) ?? [];
  const owned = handlers.getOwned?.(card) ?? 0;
  const favorite = Boolean(handlers.isFavorite?.(card));
  const excluded = Boolean(handlers.isExcluded?.(card));

  hoverCard.innerHTML = `
    <div class="card-hover-main">
      <img class="card-hover-main-image" src="${escapeAttr(card.image)}" alt="${escapeAttr(card.name)}">
      <div class="card-hover-content">
        <div class="card-hover-title-row">
          <div>
            <h3>${escapeHtml(card.name)}</h3>
            <div class="card-hover-meta">${escapeHtml(card.class)} · ${escapeHtml(card.rarity)} · ${escapeHtml(card.set)}</div>
          </div>
          ${history.length ? `<button class="card-hover-back" type="button">← Back</button>` : ""}
        </div>

        <div class="card-hover-statline">
          <span>Cost ${Number(card.cost) || 0}</span>
          ${card.type === "Follower" ? `<span>${Number(card.attack) || 0}/${Number(card.defense) || 0}</span>` : ""}
          <span>${escapeHtml(card.type)}</span>
          ${!card.deckSelectable ? `<span class="generated-status">Generated card</span>` : ""}
        </div>

        ${card.traits?.length ? `<div class="card-hover-line"><strong>Traits:</strong> ${card.traits.map(escapeHtml).join(", ")}</div>` : ""}
        ${card.keywords?.length ? `<div class="preview-chip-row"><span class="chip-label">Keywords</span>${card.keywords.map(k => `<span class="keyword-chip">${escapeHtml(k)}</span>`).join("")}</div>` : ""}
        ${card.roles?.length ? `<div class="preview-chip-row"><span class="chip-label">Roles</span>${card.roles.map(role => `<span class="role-chip">${escapeHtml(role)}</span>`).join("")}</div>` : ""}

        <div class="card-hover-effect">${escapeHtml(cleanPreviewText(card.text)).replaceAll("\n", "<br>")}</div>

        <div class="card-hover-actions">
          <button type="button" data-action="favorite">${favorite ? "★ Favorite" : "☆ Favorite"}</button>
          <button type="button" data-action="exclude">${excluded ? "Unexclude" : "Exclude"}</button>
          <button type="button" data-action="discover">Discover</button>
          <button type="button" data-action="find-linked">Find linked</button>
          <span class="owned-control">
            <button type="button" data-action="owned-minus">−</button>
            <span>Owned ${owned}</span>
            <button type="button" data-action="owned-plus">+</button>
          </span>
        </div>
      </div>
    </div>

    ${packages.length ? `
      <div class="card-hover-packages">
        <div class="card-hover-related-title">Packages</div>
        <div class="package-preview-list">
          ${packages.map(packageDef => `
            <button type="button" class="package-preview-button" data-package-id="${escapeAttr(packageDef.id)}">
              <strong>${escapeHtml(packageDef.name ?? packageDef.id)}</strong>
              <span>${escapeHtml(packageDef.description ?? "Add the recommended package")}</span>
            </button>
          `).join("")}
        </div>
      </div>
    ` : ""}

    ${relatedGroups.map(group => renderRelatedGroup(group)).join("")}
  `;

  hoverCard.querySelector(".card-hover-back")?.addEventListener("click", event => {
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

  hoverCard.querySelector('[data-action="favorite"]')?.addEventListener("click", event => {
    event.stopPropagation();
    handlers.onToggleFavorite?.(card);
    renderPreviewContent(card, handlers);
  });

  hoverCard.querySelector('[data-action="exclude"]')?.addEventListener("click", event => {
    event.stopPropagation();
    handlers.onToggleExclude?.(card);
    renderPreviewContent(card, handlers);
  });

  hoverCard.querySelector('[data-action="owned-minus"]')?.addEventListener("click", event => {
    event.stopPropagation();
    handlers.onOwnedChange?.(card, -1);
    renderPreviewContent(card, handlers);
  });

  hoverCard.querySelector('[data-action="owned-plus"]')?.addEventListener("click", event => {
    event.stopPropagation();
    handlers.onOwnedChange?.(card, 1);
    renderPreviewContent(card, handlers);
  });

  hoverCard.querySelector('[data-action="discover"]')?.addEventListener("click", event => {
    event.stopPropagation();
    handlers.onDiscover?.(card);
    hideHoverCard();
  });

  hoverCard.querySelector('[data-action="find-linked"]')?.addEventListener("click", event => {
    event.stopPropagation();
    handlers.onFindLinked?.(card);
    hideHoverCard();
  });

  hoverCard.querySelectorAll("[data-package-id]").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      const packageDef = packages.find(item => String(item.id) === String(button.dataset.packageId));
      if (packageDef) handlers.onAddPackage?.(packageDef, card);
    });
  });
}

function renderRelatedGroup(group) {
  const cards = group.cards ?? [];
  if (!cards.length) return "";

  return `
    <div class="card-hover-related">
      <div class="card-hover-related-title">${escapeHtml(group.title)}</div>
      <div class="card-hover-related-grid">
        ${cards.map(related => `
          <button class="card-hover-related-card" type="button" data-related-id="${related.id}">
            <img src="${escapeAttr(related.image)}" alt="${escapeAttr(related.name)}">
            <span>${escapeHtml(related.name)}</span>
          </button>
        `).join("")}
      </div>
    </div>
  `;
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
