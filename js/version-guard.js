const VERSION_KEY = "svwb-app-version";
const RELOAD_KEY = "svwb-version-reload";
const MODULE_URL = import.meta.url;

checkVersion();

async function checkVersion() {
  let version = null;

  try {
    const url = new URL("../version.json", MODULE_URL);
    url.searchParams.set("_", String(Date.now()));
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    version = String(payload?.version ?? "").trim();
  } catch (error) {
    console.warn("Unable to check app version", error);
    return;
  }

  if (!/^\d{2}\.\d{2}\.\d{3}$/.test(version)) {
    console.warn("Invalid app version", version);
    return;
  }

  const localVersion = localStorage.getItem(VERSION_KEY);
  const registration = await registerWorker(version);

  if (localVersion === version) {
    sessionStorage.removeItem(RELOAD_KEY);
    removeVersionQuery(version);
    return;
  }

  // Only the application version is changed here. User workspace data is untouched.
  localStorage.setItem(VERSION_KEY, version);

  const reloadToken = `${version}:${location.pathname}`;
  if (sessionStorage.getItem(RELOAD_KEY) === reloadToken) return;
  sessionStorage.setItem(RELOAD_KEY, reloadToken);

  await waitForWorkerControl(registration);

  const next = new URL(location.href);
  next.searchParams.set("appv", version);
  location.replace(next.href);
}

async function registerWorker(version) {
  if (!("serviceWorker" in navigator)) return null;

  try {
    const workerUrl = new URL("../sw.js", MODULE_URL);
    workerUrl.searchParams.set("v", version);
    const scopeUrl = new URL("../", MODULE_URL);
    const registration = await navigator.serviceWorker.register(workerUrl, {
      scope: scopeUrl.href,
      updateViaCache: "none"
    });
    await registration.update().catch(() => {});
    return registration;
  } catch (error) {
    console.warn("Unable to register app cache worker", error);
    return null;
  }
}

async function waitForWorkerControl(registration) {
  if (!registration || !("serviceWorker" in navigator)) return;

  const candidate = registration.waiting || registration.installing;
  if (!candidate && navigator.serviceWorker.controller) return;

  await new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, 1800);
    navigator.serviceWorker.addEventListener("controllerchange", finish, { once: true });
  });
}

function removeVersionQuery(version) {
  const current = new URL(location.href);
  if (current.searchParams.get("appv") !== version) return;
  current.searchParams.delete("appv");
  history.replaceState(null, "", `${current.pathname}${current.search}${current.hash}`);
}
