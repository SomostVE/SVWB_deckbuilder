export async function loadData() {
  const [cardsResponse, metadataResponse] = await Promise.all([
    fetch("./data/official/cards.json"),
    fetch("./data/official/metadata.json")
  ]);

  if (!cardsResponse.ok) {
    throw new Error("Unable to load data/official/cards.json");
  }

  const cards = await cardsResponse.json();
  const metadata = metadataResponse.ok ? await metadataResponse.json() : {};

  for (const card of cards) {
    if (card.setId === 90000 || card.set === "90000") {
      card.set = "Token";
    }

    const taggedKeywords = extractTaggedKeywords(card.rawSkillText);
    if (taggedKeywords.length) {
      card.keywords = taggedKeywords;
    } else {
      card.keywords = (card.keywords ?? [])
        .map(value => String(value).trim())
        .filter(value => value.length > 1);
    }
  }

  return { cards, metadata };
}

function extractTaggedKeywords(value) {
  const raw = String(value ?? "");
  const found = new Set();

  for (const match of raw.matchAll(/<color=Keyword>(.*?)<\/color>/g)) {
    const keyword = match[1]
      .replace(/<[^>]+>/g, "")
      .replace(/_\d+$/g, "")
      .trim();

    if (keyword && !keyword.startsWith("Quest:") && !keyword.includes("Deck")) {
      found.add(keyword);
    }
  }

  return [...found].sort();
}
