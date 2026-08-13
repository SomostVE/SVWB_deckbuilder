# Shadowverse Deck Assistant

Static GitHub Pages project for exploring Shadowverse: Worlds Beyond cards and building decks.

## Current base

- English card data imported from the official Deck Portal endpoint
- Official English card images
- Class selection
- Automatically shows selected class + Neutral
- Search
- Set / Type / Rarity / Trait / Keyword filters
- Card details modal
- Basic 40-card deck builder
- Copy limit support via `deck_enabled_num`
- LocalStorage persistence
- Separate custom data files for packages, tags and exclusions
- Scheduled/manual GitHub Action for card updates

## First run

The repository intentionally ships with an empty `data/official/cards.json`.

Generate the database:

```bash
node scripts/update-cards.mjs
```

Then run a local web server:

```bash
python -m http.server 8000
```

Open:

```text
http://localhost:8000
```

## GitHub Pages

Publish the repository with GitHub Pages from the branch containing this project.

The browser never needs to call the Shadowverse endpoint directly. The importer generates static JSON used by the site.

## Data structure

```text
data/
├── official/
│   ├── cards.json
│   └── metadata.json
└── custom/
    ├── exclusions.json
    ├── packages.json
    └── tags.json
```

`official/` is generated automatically.

`custom/` is reserved for the extra intelligence of the project:

- excluded / banned cards
- combo packages
- custom roles
- draw / removal / finisher tags
- core / optional / tech labels
- future synergy logic

## Official endpoint used

```text
https://shadowverse-wb.com/web/CardList/cardList
```

The importer sends the HTTP header:

```text
lang: en
```

Card images are built from the returned hashes:

```text
https://shadowverse-wb.com/uploads/card_image/eng/card/{card_image_hash}.png
```
