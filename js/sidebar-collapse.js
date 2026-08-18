const STORAGE_KEY = "svwb-sidebar-collapsed:v1";
const sidebar = document.querySelector(".sidebar");
const toolbar = document.querySelector(".content-toolbar");
const resetFilters = document.getElementById("reset-filters");

// app.js creates the card-size control with insertBefore(). Keep Reset filters as a
// direct toolbar child during app initialization; header-layout.js moves it back
// into the grouped view controls once initialization is complete.
if (toolbar && resetFilters && resetFilters.parentElement !== toolbar) {
  toolbar.appendChild(resetFilters);
}

if (sidebar) {
  applySavedState();

  // Interactive filter controls must not bubble into the drawer auto-dismiss
  // listener installed later by qol.js. The control's own click/change handler
  // has already run by the time the event reaches the sidebar.
  sidebar.addEventListener("click", event => {
    if (event.target.closest("button, input, label, a")) {
      event.stopImmediatePropagation();
      return;
    }

    const sectionTitle = event.target.closest(".sidebar-collapse-title");
    if (sectionTitle) {
      const section = sectionTitle.closest(".sidebar-collapsible");
      if (section) toggle(section, section.dataset.collapseKey);
      return;
    }

    const filterTitle = event.target.closest(".filter-group-title");
    if (filterTitle) {
      const root = filterTitle.closest("#set-filter, #trait-filter, #keyword-filter");
      const group = filterTitle.closest(".filter-group");
      if (root && group) toggle(group, root.id);
    }
  });

  const search = sidebar.querySelector("#search-input");
  search?.addEventListener("keydown", event => {
    if (event.key === "Enter") event.stopImmediatePropagation();
  });

  const observer = new MutationObserver(() => applySavedState());
  observer.observe(sidebar, { childList: true, subtree: true });
}

function toggle(element, key) {
  if (!key) return;
  element.classList.toggle("collapsed");
  const state = loadState();
  state[key] = element.classList.contains("collapsed");
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function applySavedState() {
  const state = loadState();

  document.querySelectorAll(".sidebar-collapsible[data-collapse-key]").forEach(section => {
    section.classList.toggle("collapsed", Boolean(state[section.dataset.collapseKey]));
  });

  for (const id of ["set-filter", "trait-filter", "keyword-filter"]) {
    const group = document.querySelector(`#${id} .filter-group`);
    if (group) group.classList.toggle("collapsed", Boolean(state[id]));
  }
}

function loadState() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}
