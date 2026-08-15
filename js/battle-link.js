const actions = document.querySelector(".header-actions");

if (actions && !actions.querySelector('[href="./battle.html"]')) {
  const link = document.createElement("a");
  link.className = "button page-nav-button";
  link.href = "./battle.html";
  link.textContent = "Battle Sim";
  actions.insertBefore(link, actions.firstChild);
}
