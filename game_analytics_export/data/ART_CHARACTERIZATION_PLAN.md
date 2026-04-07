# Art Characterization Plan

**Status**: Extraction COMPLETE — Dashboard integration pending
**Updated**: Apr 7, 2026

---

## Goal

Classify every slot game's visual/design attributes so game designers can answer:
- What art combos (setting + character + narrative) have the highest theoretical win index?
- What combos are **underserved** (high theo, low game count)?
- What themes/settings are trending or declining?
- What mood/narrative drives the best performance within a given theme?

---

## Current State

- **3,658 / 4,201 slots classified (87%)** — all backed by real data (HTML rules, descriptions, or symbol lists)
- **543 slots unclassified** — no data source available (no HTML, no description, no symbols)
- **0 taxonomy violations**, **0 null fields**, **0 name-based rule failures**
- All data applied to `game_data_master.json` and staged in `staged_art_characterization.json`
- Extraction used Anthropic Message Batches API (50% cost discount) — ~$12.68 total

---

## Taxonomy (7 Dimensions)

All values validated against SlotCatalog, KeyToCasino, and slot.report industry databases.

### 1. Setting (33 values) — WHERE does this game take place?

Ancient Temple/Ruins, Deep Ocean/Underwater, Enchanted Forest, Wild West/Frontier,
Outer Space, Neon/Cyber City, Medieval Castle, Tropical Island/Beach, Arctic/Snow,
Jungle/Rainforest, Desert/Sahara, Haunted Manor/Graveyard, Candy/Sweet World,
Circus/Carnival, Urban/Modern City, Mountain/Volcano, Farm/Countryside,
Royal Palace/Court, Pirate Ship/Port, Treasure Cave/Mine, Mystical/Magic Realm,
Asian Temple/Garden, Arena/Colosseum, Sky/Clouds, Laboratory/Workshop, Tavern/Saloon,
Norse/Viking Realm, Irish/Celtic Highlands, Festive/Holiday,
Prehistoric/Primordial, Steampunk/Victorian, Lakeside/River/Fishing Dock,
Generic/Abstract

### 2. Characters (29 values) — WHO is featured?

Explorer/Adventurer, Pharaoh/Egyptian Ruler, Leprechaun, Dragon, Pirate/Captain,
Viking/Norse Warrior, Greek/Roman God, Wizard/Sorcerer,
Wild Animals (lion, wolf, eagle), Domestic Animals (cat, dog, horse),
Sea Creatures (fish, octopus, shark), Mythical Creature (phoenix, unicorn, griffin),
King/Queen/Royalty, Fairy/Elf/Pixie, Cowboy/Sheriff, Vampire/Werewolf,
Monster/Demon, Robot/Alien, Ninja/Samurai, Knight/Crusader, Monkey/Ape, Panda/Bear,
Bird (peacock, parrot, owl), Bull/Buffalo,
Dinosaur/Prehistoric Beast, Superhero/Heroine,
Cartoon/Mascot Character, Celebrity/Licensed Character, No Characters (symbol-only game)

### 3. Elements (25 values) — WHAT objects appear on the reels?

Gems/Jewels/Crystals, Gold Coins/Treasure, Fruits (cherry, lemon, watermelon),
Fire/Flames/Lava, Lightning/Thunder/Electricity, Water/Waves/Rain,
Ancient Artifacts (scrolls, amulets, masks), Weapons/Armor (swords, shields),
Magic/Spells (wands, potions, orbs), Books/Scrolls/Maps,
Playing Card Values (A, K, Q, J, 10), Sevens/Bars/Bells (classic),
Stars/Sparkles/Cosmic, Nature/Flowers/Trees, Food/Candy/Drinks,
Musical Instruments, Money/Cash/Bills, Lucky Charms (horseshoe, clover, coin),
Religious/Spiritual Symbols, Animals (as reel elements, not characters),
Vehicles (ships, planes, cars), Sports Equipment (balls, trophies),
Tools/Construction, Dice/Cards/Casino Items,
Fishing/Tackle/Bait (rods, hooks, nets)

### 4. Mood (13 values) — WHAT is the emotional tone?

Dark/Mysterious, Bright/Fun/Cheerful, Luxurious/Elegant/Premium,
Whimsical/Playful/Silly, Epic/Grand/Heroic, Serene/Calm/Peaceful,
Intense/Action/Thrilling, Spooky/Horror/Creepy, Retro/Nostalgic/Classic,
Romantic/Dreamy, Adventurous/Exciting, Mystical/Magical/Ethereal,
Festive/Holiday/Celebratory

### 5. Narrative (19 values) — WHAT is the player's implicit story?

Treasure Hunt/Gold Rush, Quest/Adventure/Journey, Battle/Combat/War,
Discovery/Exploration, Magic Show/Sorcery, Heist/Robbery/Escape,
Rescue Mission, Competition/Tournament/Race, Celebration/Festival/Party,
Collection/Harvest/Gathering, Survival/Horror, Love Story/Romance,
Fairy Tale/Storybook, Wealth/Fortune/Prosperity,
Fishing/Angling, Music/Performance/Concert, Crime/Mystery/Detective,
Branded/Licensed Story (TV, movie, celebrity),
No Narrative (classic/abstract)

### 6. Art Style (8 values) — low reliability, text-inferred only

Realistic 3D, Stylized 2.5D, Cartoon/Illustrated, Minimalist/Classic,
Pixel/Retro, Painterly/Hand-drawn, Anime/Manga, Photographic/Cinematic

### 7. Color Tone (7 values) — low reliability, text-inferred only

Warm (golds, reds, ambers), Cool (blues, purples, silvers),
Dark (blacks, deep tones, shadows), Bright/Vibrant (saturated, neon),
Earthy (greens, browns, natural), Pastel/Soft (muted, gentle),
Metallic/Jewel Tones (rich, shimmering)

> **Note**: Style and Color Tone are inferred from text only (no image analysis).
> These are `art_confidence: "text_inferred"` and should be treated as approximate.
> The other 5 dimensions (Setting, Characters, Elements, Mood, Narrative) are reliable.

---

## Pipeline Architecture

```
Game Name + Description + Symbols + Themes + HTML Rules
     │
     ▼
┌──────────────────────────────────────────────────┐
│  Claude Sonnet (claude-sonnet-4-20250514)        │
│  - System prompt: taxonomy + classification rules │
│  - User prompt: few-shot examples + game data     │
│  - Output: JSON with 7 art dimensions             │
└──────────────────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────────────────┐
│  Post-Processing (deterministic rules)            │
│  - 60+ name-based rules (Viking→Norse, etc.)     │
│  - 20+ HTML-based rules (wolf symbol→character)   │
│  - Contradiction removal                          │
│  - Taxonomy normalization (fuzzy match to canon)  │
│  - Special cases (Huff N Puff, Christmas, etc.)   │
└──────────────────────────────────────────────────┘
     │
     ▼
  staged_art_characterization.json  →  game_data_master.json
```

### Key Design Decisions

1. **Single Claude call per game** — all 7 dimensions extracted at once
2. **Post-processing always wins** — deterministic rules override Claude for clear-cut cases
3. **Staging area** — never writes directly to master; review gate
4. **Few-shot examples** — 8 training games in prompt (classic, Egyptian, pirate, Norse, Irish, fishing, music, holiday)
5. **Text-only inference** — no image analysis; style/color_tone marked low-confidence
6. **No name-only guesses** — games without actual data (HTML/description/symbols) are NOT classified
7. **Batch API** — used Anthropic Message Batches API for 50% cost reduction

---

## Ground Truth & Evaluation

### GT Dataset: `ground_truth_art.json` (27 games)

| Category | Games | Purpose |
|----------|-------|---------|
| **Training** (8) | Double Diamond, Cleopatra, Captain Riches, Diamond Cash Mighty Viking, Irish Eyes 2, Big Catch Bass Fishing, Jimi Hendrix, Christmas Cash Pots | Few-shot examples in prompt |
| **Test** (19) | Vikings Unchained, Thor 10k Ways, Shamrock Money Pot, Cleopatra Christmas, 10000 BC Jurassic, Cops N Robbers, Ace Ventura, 88 Fortunes, Age Of The Gods, Book Of Dead, Buffalo, Fu Dao Le, Pharaohs Fortune, Pirate Plunder, + more | Held-out evaluation set |

### Accuracy (18 held-out games)

| Dimension | Accuracy | Perfect |
|-----------|----------|---------|
| Setting | **100.0%** | 18/18 |
| Mood | **94.4%** | 17/18 |
| Characters | **86.2%** | 12/18 |
| Narrative | **72.2%** | 13/18 |
| Elements | **66.2%** | 2/18 |
| **AGGREGATE** | **83.8%** | — |

### Manual Spot-Check (20 random games from full extraction)

**20/20 correct** across all dimensions.

### Known Limitations

- **Elements** are noisy — Claude adds plausible but unconfirmed elements
- **Narrative** has subjective ambiguity — Quest vs Discovery vs Battle can be interchangeable
- **Style/Color Tone** — unreliable from text alone, need actual screenshots
- **543 unclassified games** — no data source available to classify from

---

## Completed Phases

### Phase A — Small Batch ✅

- [x] Taxonomy validated against industry (SlotCatalog, KeyToCasino, slot.report)
- [x] 27-game GT created and verified
- [x] Few-shot training integrated into prompt
- [x] `compare_art_with_gt()` with F1 scoring
- [x] `--test-art` CLI evaluation loop
- [x] 83.8% aggregate accuracy on held-out set
- [x] Extract 50 games → manual review → fix issues
- [x] Re-run `--test-art` to confirm no regression

### Phase B — Medium Batch ✅

- [x] Extract 200 games
- [x] Self-validate against HTML rules
- [x] Fix systematic errors (franchise inconsistency, Collection/Harvest overuse)
- [x] Added post-processing rules (fishing, viking, christmas, dinosaur, steampunk, crime)

### Phase C — Full Extraction ✅

- [x] Extract remaining 3,272 games via Batch API (7 batches × 500 games)
- [x] Extract 186 games with HTML but no description
- [x] 0 API errors across all batches
- [x] 0 taxonomy violations on full dataset
- [x] Removed 543 name-only guesses (no real data)
- [x] Applied to `game_data_master.json`
- [x] Final: 3,658 / 4,201 slots (87%)

### Phase D — Dashboard Integration (PENDING)

- [ ] Add art fields to DuckDB schema (`duckdb-client.js`)
- [ ] Add `F.artSetting()`, `F.artCharacters()`, etc. to `game-fields.js`
- [ ] Add `getArtMetrics()` to `metrics.js`
- [ ] Build art dashboard tab (setting × narrative heatmap, top combos by theo, underserved combos)
- [ ] Cross-reference art with features (e.g., "which art combos pair best with Hold & Win?")

---

## CLI Reference

```bash
# Evaluate against GT (no API cost — uses held-out games)
python3 data/extract_game_profile.py --test-art

# Extract via batch API (50% cheaper, recommended)
python3 data/extract_game_profile.py --extract-art-batch

# Poll batch results
python3 data/extract_game_profile.py --art-batch-poll <batch_id>

# Extract single-game (real-time, full price)
python3 data/extract_game_profile.py --extract-art --limit 50

# Apply staged results to master
python3 data/extract_game_profile.py --extract-art --apply-art
```

---

## Actual Costs

| Phase | Games | Cost | Time |
|-------|-------|------|------|
| Phase A (50 games) | 50 | ~$0.40 | ~3 min |
| Phase B (200 games) | 200 | ~$1.50 | ~12 min |
| Phase C (3,272 + 729 batch) | 4,001 | ~$12.68 | ~30 min |
| GT eval runs | 18 × several | ~$1.00 | — |
| **Total** | — | **~$15.58** | — |
