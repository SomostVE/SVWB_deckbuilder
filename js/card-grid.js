import { formatCardText } from "./card-text.js";

let hoverTimer = null;
let hideTimer = null;
let hoverCard = null;
let lastPointer = { x: 0, y: 0 };
let history = [];
let pinned = false;

const PREVIEW_DELAY = 1000;
const PREVIEW_HIDE_DELAY = 1000;

document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeCardPreview();
});

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
    const maxCopies = Number(card.maxCopies ?? 3);
    const deckMark = handlers.getDeckMark?.(card) ?? "";
    if (card.deckSelectable && quantity >= maxCopies) article.classList.add("maxed-card");

    article.innerHTML = `
      <img src="${escapeAttr(card.image)}" alt="${escapeAttr(card.name)}" loading="lazy">
      ${quantity > 0 ? `<span class="card-quantity">${quantity}</span>` : ""}
      ${owned > 0 ? `<span class="card-owned">O${owned}</span>` : ""}
      ${handlers.isFavorite?.(card) ? `<span class="card-favorite">★</span>` : ""}
      ${handlers.isExcluded?.(card) ? `<span class="card-excluded">Excluded</span>` : ""}
      ${deckMark ? `<span class="card-mark card-mark-${escapeAttr(deckMark.toLowerCase())}">${escapeHtml(deckMark)}</span>` : ""}
      ${!card.deckSelectable ? `<span class="card-generated-label">Generated</span>` : ""}
    `;

    article.addEventListener("click", event => {
      if (card.deckSelectable) {
        const amount = event.shiftKey ? Math.max(1, maxCopies - quantity) : 1;
        handlers.onAdd?.(card, amount);
      } else {
        showHoverCard(card, handlers);
      }
    });

    article.addEventListener("contextmenu", event => {
      event.preventDefault();
      if (!card.deckSelectable) return;
      const amount = event.shiftKey ? Math.max(1, quantity) : 1;
      handlers.onRemove?.(card, amount);
    });

    article.addEventListener("pointerenter", event => {
      lastPointer = { x: event.clientX, y: event.clientY };
      cancelHide();
      clearTimeout(hoverTimer);
      if (hoverCard && pinned) return;
      hoverTimer = setTimeout(() => showHoverCard(card, handlers), PREVIEW_DELAY);
    });

    article.addEventListener("pointerleave", () => {
      clearTimeout(hoverTimer);
      scheduleHide();
    });

    root.appendChild(article);
  }
}

export function closeCardPreview() {
  hideHoverCard(true);
}

function showHoverCard(card, handlers) {
  if (hoverCard && pinned) return;
  hideHoverCard(true);
  history = [];
  pinned = false;

  const preview = document.createElement("div");
  preview.className = "card-hover-preview";
  preview.addEventListener("pointerenter", cancelHide);
  preview.addEventListener("pointerleave", scheduleHide);

  document.body.appendChild(preview);
  hoverCard = preview;
  handlers.onPreviewOpen?.(card);
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

  hoverCard.classList.toggle("pinned", pinned);
  hoverCard.innerHTML = `
    <div class="card-hover-main">
      <img class="card-hover-main-image" src="${escapeAttr(card.image)}" alt="${escapeAttr(card.name)}">
      <div class="card-hover-content">
        <div class="card-hover-title-row">
          <div>
            <h3>${escapeHtml(card.name)}</h3>
            <div class="card-hover-meta">
              ${escapeHtml(card.class)} · ${escapeHtml(card.rarity)} ·
              <button type="button" class="preview-inline-link" data-filter-set="${escapeAttr(card.set)}">${escapeHtml(card.set)}</button>
            </div>
          </div>
          <div class="card-hover-title-actions">
            ${history.length ? `<button class="card-hover-back" type="button">← Back</button>` : ""}
            <button class="card-hover-pin ${pinned ? "active" : ""}" type="button" aria-label="${pinned ? "Unpin preview" : "Pin preview"}">${pinned ? "📌" : "Pin"}</button>
            <button class="card-hover-close" type="button" aria-label="Close">×</button>
          </div>
        </div>

        <div class="card-hover-statline">
          <span>Cost ${Number(card.cost) || 0}</span>
          ${card.type === "Follower" ? `<span>${Number(card.attack) || 0}/${Number(card.defense) || 0}</span>` : ""}
          <span>${escapeHtml(card.type)}</span>
          ${!card.deckSelectable ? `<span class="generated-status">Generated card</span>` : ""}
        </div>

        ${card.traits?.length ? `
          <div class="preview-chip-row">
            <span class="chip-label">Traits</span>
            ${card.traits.map(trait => `<button type="button" class="trait-chip" data-filter-trait="${escapeAttr(trait)}">${escapeHtml(trait)}</button>`).join("")}
          </div>
        ` : ""}
        ${card.keywords?.length ? `
          <div class="preview-chip-row">
            <span class="chip-label">Keywords</span>
            ${card.keywords.map(keyword => `<button type="button" class="keyword-chip" data-filter-keyword="${escapeAttr(keyword)}">${escapeHtml(keyword)}</button>`).join("")}
          </div>
        ` : ""}
        ${card.roles?.length ? `<div class="preview-chip-row"><span class="chip-label">Roles</span>${card.roles.map(role => `<span class="role-chip">${escapeHtml(role)}</span>`).join("")}</div>` : ""}

        <div class="card-hover-effect">${formatCardText(card.rawSkillText || card.text || "No effect text.")}</div>

        <div class="card-hover-actions">
          <button type="button" data-action="favorite">${favorite ? "★ Favorite" : "☆ Favorite"}</button>
          <button type="button" data-action="exclude">${excluded ? "Unexclude" : "Exclude"}</button>
          <button type="button" data-action="discover">Discover</button>
          <button type="button" data-action="find-linked">${card.deckSelectable ? "Find linked" : "Find cards mentioning this"}</button>
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

  hoverCard.querySelector(".card-hover-close")?.addEventListener("click", event => {
    event.stopPropagation();
    closeCardPreview();
  });

  hoverCard.querySelector(".card-hover-pin")?.addEventListener("click", event => {
    event.stopPropagation();
    pinned = !pinned;
    hoverCard?.classList.toggle("pinned", pinned);
    renderPreviewContent(card, handlers);
  });

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
      handlers.onPreviewOpen?.(related);
      renderPreviewContent(related, handlers);
    });
  });

  hoverCard.querySelectorAll("[data-filter-trait]").forEach(button => {
    button.addEventListener("dblclick", event => {
      event.stopPropagation();
      handlers.onFilterTrait?.(button.dataset.filterTrait);
      closeCardPreview();
    });
  });

  hoverCard.querySelectorAll("[data-filter-keyword]").forEach(button => {
    button.addEventListener("dblclick", event => {
      event.stopPropagation();
      handlers.onFilterKeyword?.(button.dataset.filterKeyword);
      closeCardPreview();
    });
  });

  hoverCard.querySelector("[data-filter-set]")?.addEventListener("click", event => {
    event.stopPropagation();
    handlers.onFilterSet?.(event.currentTarget.dataset.filterSet);
    closeCardPreview();
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
    closeCardPreview();
  });

  hoverCard.querySelector('[data-action="find-linked"]')?.addEventListener("click", event => {
    event.stopPropagation();
    handlers.onFindLinked?.(card);
    closeCardPreview();
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
  if (pinned) return;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (!hoverCard?.matches(":hover")) hideHoverCard();
  }, PREVIEW_HIDE_DELAY);
}

function cancelHide() {
  clearTimeout(hideTimer);
}

function hideHoverCard(force = false) {
  if (pinned && !force) return;
  clearTimeout(hideTimer);
  clearTimeout(hoverTimer);
  hoverCard?.remove();
  hoverCard = null;
  history = [];
  pinned = false;
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
