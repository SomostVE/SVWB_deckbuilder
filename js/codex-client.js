export const BEYOND_CODEX_BASE = "https://raw.githubusercontent.com/SomostVE/beyond_codex/main/api/v1";
const LOCAL_OFFICIAL_BASE = "./data/official";

let officialDataPromise = null;
let changelogPromise = null;

export function loadOfficialCardData() {
  if (!officialDataPromise) officialDataPromise = loadOfficialCardDataOnce();
  return officialDataPromise;
}

export function loadOfficialChangelog() {
  if (!changelogPromise) changelogPromise = loadJsonWithFallback("changelog.json");
  return changelogPromise;
}

export function codexEndpoint(file) {
  return `${BEYOND_CODEX_BASE}/${String(file).replace(/^\/+/, "")}`;
}

async function loadOfficialCardDataOnce() {
  const [cards, metadata] = await Promise.all([
    loadJsonWithFallback("cards.json"),
    loadJsonWithFallback("metadata.json", {})
  ]);

  if (!Array.isArray(cards) || !cards.length) {
    throw new Error("Beyond Codex returned an invalid card database");
  }

  return { cards, metadata };
}

async function loadJsonWithFallback(file, fallbackValue = null) {
  try {
    const response = await fetch(codexEndpoint(file), { cache: "default" });
    if (!response.ok) throw new Error(`Beyond Codex ${file}: HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn(`[Beyond Decks] Beyond Codex unavailable for ${file}; using embedded fallback.`, error);
    const response = await fetch(`${LOCAL_OFFICIAL_BASE}/${file}`, { cache: "no-store" });
    if (!response.ok) {
      if (fallbackValue !== null) return fallbackValue;
      throw new Error(`Unable to load Beyond Codex or local fallback for ${file}`);
    }
    return response.json();
  }
}
