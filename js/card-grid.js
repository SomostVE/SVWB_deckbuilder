export function renderCardGrid(root, cards, handlers) {
  root.innerHTML = "";

  for (const card of cards) {
    const article = document.createElement("article");
    article.className = "card-tile";

    article.innerHTML = `
      <img src="${escapeAttr(card.image)}" alt="${escapeAttr(card.name)}" loading="lazy">
      <div class="card-tile-body">
        <h3>${escapeHtml(card.name)}</h3>
        <div class="card-meta">
          ${escapeHtml(card.class)} · ${escapeHtml(card.rarity)}<br>
          ${escapeHtml(card.type)} · Cost ${card.cost}
        </div>
        <div class="card-actions">
          <button class="button" data-action="details" type="button">Details</button>
          <button class="button" data-action="add" type="button">+1</button>
        </div>
      </div>
    `;

    article.querySelector('[data-action="details"]').addEventListener("click", () => handlers.onDetails(card));
    article.querySelector('[data-action="add"]').addEventListener("click", () => handlers.onAdd(card));

    root.appendChild(article);
  }
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
