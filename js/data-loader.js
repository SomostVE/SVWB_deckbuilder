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
  }

  return { cards, metadata };
}
