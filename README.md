# Beyond Decks

**Live site:** https://somostve.github.io/beyond_decks/

Browser-based deck builder, collection manager, deck analysis toolkit and Battle Sim for **Shadowverse: Worlds Beyond**.

## Main features

- Official English card database and images supplied by **Beyond Codex**
- Class + Neutral browsing with Cost / Type / Rarity / Set / Trait / Keyword filters
- Adaptive high-density card grid
- Deck building with Undo / Redo, saved variants and Import / Export
- Collection tracking, set completion and craft planning
- Deck analysis: curve, card types, roles, keywords and generated-card dependencies
- Deck Lab and Engines tools
- Battle Sim with deterministic seeds, replay inspection and AI decision-making
- AI look-ahead, target selection, Fuse support and full-turn planning
- Benchmarks against reference decks
- Responsive desktop and mobile navigation

## Battle Sim status

Battle Sim is considered **share-ready** from version **01.05.000**. The current Beyond Codex card snapshot is covered by the strict all-card audit, per-class behavior regressions, high-risk runtime checks, replay smoke tests and benchmark calibration used by CI.

Class identity is enforced at the simulation boundary: a normal deck can contain its selected class plus Neutral cards only. Mechanics that are exclusive in the official data are locked to their owning class — **Combo** to Forestcraft, **Rally** to Swordcraft, **Spellboost / Earth Rite** to Runecraft, **Overflow** to Dragoncraft and **Necromancy** to Abysscraft. Mechanics that are genuinely shared by official cards are not artificially class-locked; for example, **Reanimate** also appears on a Neutral card.

The simulator is a deterministic rules and deck-testing tool, not a tournament oracle. Its AI is deliberately intermediate: it uses tactical look-ahead, target selection and full-turn planning, but it is not intended to reproduce perfect human play. New Beyond Codex cards can intentionally fail the CI coverage/class-contract gates until their new behavior is reviewed and modeled.

## Beyond ecosystem

### Beyond Decks

Application layer: deck building, collection management, analysis tools and Battle Sim.

- Site: https://somostve.github.io/beyond_decks/
- Repository: https://github.com/SomostVE/beyond_decks

### Beyond Codex

Data layer: acquisition, normalization, versioned JSON endpoints and weekly card-data updates.

- API documentation: https://somostve.github.io/beyond_codex/
- Repository: https://github.com/SomostVE/beyond_codex
- API v1: https://somostve.github.io/beyond_codex/api/v1/
- Cards: https://somostve.github.io/beyond_codex/api/v1/cards.json
- Manifest: https://somostve.github.io/beyond_codex/api/v1/manifest.json
- Changelog: https://somostve.github.io/beyond_codex/api/v1/changelog.json

## Data architecture

```text
Official Shadowverse: Worlds Beyond Deck Portal
                    ↓
              Beyond Codex
       normalize · validate · version
                    ↓
              Beyond Decks
```

Beyond Decks consumes **Beyond Codex API v1** as its primary official card-data source. The embedded official snapshot is retained only as a resilience fallback if Codex is temporarily unavailable.

Beyond Codex refreshes its dataset automatically every Monday and can also be refreshed manually through GitHub Actions. Application-specific data such as packages, tags, reference decks, collection state and Battle Sim logic remain owned by Beyond Decks.

## API ownership

Beyond Decks does **not** query the official Shadowverse Deck Portal directly during normal use. Official card acquisition and normalization belong to Beyond Codex, while Beyond Decks focuses on application behavior and user-facing tools.
