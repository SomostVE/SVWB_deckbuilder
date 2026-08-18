# Deci Builder

Deck building, collection management and battle simulation tools for **Shadowverse: Worlds Beyond**.

## Live app

**https://somostve.github.io/SVWB_deckbuilder/**

## Major features

### Card browser & deck builder

- Official English card data and card images
- All seven classes plus Neutral cards
- Dense, adaptive card grid with adjustable card size
- Filters for Cost, Set, Type, Rarity, Trait and Keyword
- Filters persist when switching classes when they remain applicable
- Advanced search such as `role:draw`, `keyword:storm`, `trait:Officer` and `related:"Bat"`
- Generated/token cards and card relationships
- Card hover profiles with related cards, generated cards, roles and keywords
- Favorites, owned-card tracking and personal exclusions
- Deck-only view
- Core / Optional / Tech deck marks
- Undo / Redo deck history
- Saved deck variants and deck comparison
- JSON import/export and shareable deck URLs

### Deck analysis

- Live deck size and mana curve
- Follower / Spell / Amulet breakdown
- Functional role detection such as Draw, Removal, Heal, Ramp, Board Clear and Finisher
- Keyword analysis
- Generated-card dependency analysis
- Deck legality checks
- Crafting / missing-card information

### Collection

- Owned-card quantities
- Collection search and filters
- Set completion tracking
- Missing-playset and owned-only views
- Collection import/export
- Craft planner using saved decks

### Battle Sim

- Deterministic seeded battle simulation
- Current deck or saved decks against reference decks
- First / Second selection
- Automatic or selectable play profiles
- Replay with turn-by-turn board state
- Deck benchmark mode with repeated matchups
- WR, First/Second WR, confidence interval, average ending turn, rules coverage and rule-gap diagnostics
- Rules engine support for normal plays, Enhance, Accelerate, Crystallize, modes, Engage, Fuse, Evolve, Super-Evolve, attacks and Pass decisions
- AI planning with target branching, full-turn sequencing and look-ahead

### Data & maintenance

- Official card database generated from the Shadowverse: Worlds Beyond Deck Portal
- Automatic card database updates through GitHub Actions
- Deterministic regression and Battle Sim validation scripts
- Custom data layer kept separate from generated official data

## Generated vs selectable cards

Cards from the Token set, cards flagged by the portal as tokens, or cards with no deck copy allowance remain in the database but are marked as not deck-selectable.

They are hidden from the normal deck pool unless **Show generated cards** is enabled. They remain accessible from the cards that generate or reference them.

## Search syntax

Normal text searches names, rules text, sets, class, type, rarity, traits, keywords, functional roles and custom tags.

Examples:

```text
storm
role:draw
role:"Board Clear"
keyword:Ward
trait:Officer
set:"Chronicle of Destiny"
related:"Bat"
```

## Project data

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

`official/` is generated automatically. The `custom/` directory is reserved for repository-specific additions and overrides.

## Official source

Card metadata is imported from the official Shadowverse: Worlds Beyond Card List endpoint:

```text
https://shadowverse-wb.com/web/CardList/cardList
```

with English data requested using:

```text
lang: en
```

English card images are generated from the image hashes returned by the official data source.

## Automatic updates

`.github/workflows/update-cards.yml` runs automatically and can also be triggered manually.

For a local card-data refresh:

```bash
node scripts/update-cards.mjs
```
