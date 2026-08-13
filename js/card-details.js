export function showCardDetails(dialog, contentRoot, card, onAdd) {
  contentRoot.innerHTML = `
    <div class="card-detail">
      <div>
        <img src="${escapeAttr(card.image)}" alt="${escapeAttr(card.name)}">
      </div>
      <div class="card-detail-text">
        <h2>${escapeHtml(card.name)}</h2>
        <p class="muted">${escapeHtml(card.class)} · ${escapeHtml(card.rarity)} · ${escapeHtml(card.set)}</p>

        <p><strong>Cost:</strong> ${card.cost}
        ${card.type === "Follower" ? ` · <strong>ATK:</strong> ${card.attack} · <strong>Defense:</strong> ${card.defense}` : ""}</p>

        <div class="keyword-chips">
          ${(card.keywords ?? []).map(k => `<span class="keyword-chip">${escapeHtml(k)}</span>`).join("")}
        </div>

        <h3>Effect</h3>
        <div>${sanitizeSkillText(card.text)}</div>

        ${card.flavourText ? `<h3>Flavor</h3><p>${escapeHtml(card.flavourText).replaceAll("\n", "<br>")}</p>` : ""}

        <button id="dialog-add-card" class="button" type="button">Add to deck</button>
      </div>
    </div>
  `;

  contentRoot.querySelector("#dialog-add-card").addEventListener("click", () => onAdd(card));
  dialog.showModal();
}

function sanitizeSkillText(value) {
  let text = String(value ?? "");
  text = text
    .replaceAll("<hr>", "<hr>")
    .replace(/<b>/g, "<strong>")
    .replace(/<\/b>/g, "</strong>")
    .replace(/<color=Keyword>/g, "<strong>")
    .replace(/<\/color>/g, "</strong>")
    .replace(/<ev>|<\/ev>|<sev>|<\/sev>|<ridx=\d+>|<\/ridx>/g, "");
  return text;
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
