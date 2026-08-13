import { state } from "./state.js";
import { saveWorkspace } from "./storage.js";

const toolbar = document.querySelector(".header-toolbar");
const actions = document.querySelector(".header-actions");

if (toolbar) {
  const control = document.createElement("label");
  control.className = "format-control";
  control.innerHTML = `
    <span>Format</span>
    <select id="deck-format" aria-label="Deck format">
      <option value="Rotation">Rotation</option>
      <option value="Unlimited">Unlimited</option>
      <option value="Boundless">Boundless</option>
    </select>
  `;
  const select = control.querySelector("select");
  select.value = state.format ?? "Rotation";
  select.addEventListener("change", () => {
    state.format = select.value;
    saveWorkspace(state);
    location.reload();
  });

  const typeRoot = document.getElementById("type-filter");
  if (typeRoot) typeRoot.insertAdjacentElement("afterend", control);
  else toolbar.appendChild(control);
}

if (actions) {
  const existingCollection = document.getElementById("open-collection");
  if (existingCollection) existingCollection.textContent = "Collection quick";

  if (!actions.querySelector('[href="./collection.html"]')) {
    const collection = document.createElement("a");
    collection.className = "button page-nav-button";
    collection.href = "./collection.html";
    collection.textContent = "Collection";
    actions.insertBefore(collection, actions.firstChild?.nextSibling ?? actions.firstChild);
  }

  if (!actions.querySelector('[href="./lab.html"]')) {
    const lab = document.createElement("a");
    lab.className = "button page-nav-button";
    lab.href = "./lab.html";
    lab.textContent = "Deck Lab";
    actions.insertBefore(lab, actions.firstChild?.nextSibling ?? actions.firstChild);
  }
}
