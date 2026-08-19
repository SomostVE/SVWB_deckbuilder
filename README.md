# Beyond Decks

**Live site:** https://somostve.github.io/beyond_decks/

Browser-based deck builder, collection manager and Battle Sim for **Shadowverse: Worlds Beyond**.

## Main features

- Official English card database and images supplied by Beyond Codex
- Class + Neutral browsing with Cost / Type / Rarity / Set / Trait / Keyword filters
- Adaptive high-density card grid
- Deck building with Undo / Redo, saved variants and Import / Export
- Collection tracking and craft planning
- Deck analysis: curve, card types, roles, keywords and generated-card dependencies
- Battle Sim with deterministic seeds, replay and AI decision-making
- AI look-ahead, target selection, Fuse support and full-turn planning
- Benchmarks against reference decks

## Data source

Official card acquisition and normalization now live in **Beyond Codex**:

https://github.com/SomostVE/beyond_codex

Beyond Decks consumes the versioned Codex JSON API and keeps its last embedded official snapshot only as a temporary resilience fallback during the migration. Application-specific data such as packages, tags and Battle Sim reference decks remain in this repository.
