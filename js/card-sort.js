const TYPE_ORDER = {
  Follower: 0,
  Spell: 1,
  Amulet: 2
};

const CLASS_ORDER = {
  Neutral: 0,
  Forestcraft: 1,
  Swordcraft: 2,
  Runecraft: 3,
  Dragoncraft: 4,
  Abysscraft: 5,
  Havencraft: 6,
  Portalcraft: 7
};

/**
 * Match the ordering used by Shadowverse: Worlds Beyond card browsing:
 * cost -> card type (Follower, Spell, Amulet) -> set release order -> internal card ID.
 *
 * This comparator intentionally does not sort by localized card name.
 */
export function compareGameCardOrder(a, b) {
  return number(a?.cost) - number(b?.cost)
    || typeRank(a?.type) - typeRank(b?.type)
    || setRank(a) - setRank(b)
    || number(a?.id) - number(b?.id)
    || String(a?.name ?? "").localeCompare(String(b?.name ?? ""));
}

/** Same card order, with the game's class order first. Useful for all-class views. */
export function compareGameCardOrderAllClasses(a, b) {
  return classRank(a?.class) - classRank(b?.class)
    || compareGameCardOrder(a, b);
}

function typeRank(type) {
  return TYPE_ORDER[type] ?? 99;
}

function classRank(className) {
  return CLASS_ORDER[className] ?? 99;
}

function setRank(card) {
  const setId = number(card?.setId, Number.POSITIVE_INFINITY);
  if (Number.isFinite(setId) && setId > 0) return setId;

  // Card IDs start with the release family (100 = Basic, 101 = set 1, ...).
  const id = number(card?.id, Number.POSITIVE_INFINITY);
  return Number.isFinite(id) ? Math.floor(id / 100000) : Number.POSITIVE_INFINITY;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
