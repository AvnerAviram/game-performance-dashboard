"""
Combined Game Profile Extraction from HTML Rules Pages.
Single Claude pass: features + themes + specs + functional symbols + description.
Separate art characterization pass for game design intelligence.

Usage:
  python extract_game_profile.py --game "Capital Gains"          # single game
  python extract_game_profile.py --test-ags                      # test on AGS GT (held-out)
  python extract_game_profile.py --test-all-gt                   # test on all GT games
  python extract_game_profile.py --run-all --apply --limit 10    # sequential extract + write
  python extract_game_profile.py --batch --apply                 # batch API extract (cheapest)
  python extract_game_profile.py --extract-art --limit 20        # art characterization (stages results)
  python extract_game_profile.py --extract-art --apply-art       # apply staged art to master
"""

import json
import os
import sys
import argparse
import re
import time
from pathlib import Path
from collections import Counter

DATA_DIR = Path(__file__).parent
RULES_HTML_DIR = DATA_DIR / "rules_html"
MASTER_PATH = DATA_DIR / "game_data_master.json"
GT_PATH = DATA_DIR / "ground_truth_ags.json"
MATCHES_PATH = DATA_DIR / "rules_game_matches.json"
SYNONYM_PATH = DATA_DIR / "_legacy" / "synonym_mapping.json"

_ART_FIELDS = ('art_theme', 'art_characters', 'art_elements', 'art_mood', 'art_narrative')
_initial_art_count = None

def _count_art(master):
    return sum(1 for g in master if g.get('art_theme'))

def safe_write_master(master, label=""):
    """Write master JSON with art-field preservation guard."""
    global _initial_art_count
    if _initial_art_count is None:
        _initial_art_count = _count_art(master)
    current = _count_art(master)
    if _initial_art_count > 0 and current < _initial_art_count * 0.95:
        print(f"  ABORT WRITE ({label}): art_theme dropped from {_initial_art_count} to {current}. "
              f"Master NOT overwritten.")
        return False
    with open(MASTER_PATH, 'w') as f:
        json.dump(master, f, indent=2)
    return True

# ─── HTML Cleaning ───────────────────────────────────────────────

def clean_html_for_claude(html_content):
    """Extract structured text from HTML rules page.
    Preserves section headers as [H1]-[H6] markers for Claude to reason about structure.
    """
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html_content, 'html.parser')

    for tag in soup.find_all(['script', 'style', 'nav', 'header', 'footer',
                               'meta', 'link', 'noscript', 'iframe', 'svg', 'img',
                               'button', 'input', 'form', 'select']):
        tag.decompose()

    lines = []
    for el in soup.find_all(True):
        if el.name in ('h1', 'h2', 'h3', 'h4', 'h5', 'h6'):
            text = el.get_text(strip=True)
            if text:
                lines.append(f"\n[{el.name.upper()}] {text}")
        elif el.name in ('p', 'li', 'td', 'th'):
            text = el.get_text(strip=True)
            if text and len(text) > 3:
                prefix = "• " if el.name == 'li' else ""
                lines.append(f"{prefix}{text}")
        elif el.name in ('article', 'section'):
            direct_text = ''.join(el.find_all(string=True, recursive=False)).strip()
            if direct_text and len(direct_text) > 20:
                for paragraph in direct_text.split('\n'):
                    p = paragraph.strip()
                    if p and len(p) > 3:
                        lines.append(p)

    seen = set()
    unique = []
    for line in lines:
        if line not in seen:
            seen.add(line)
            unique.append(line)

    return "\n".join(unique).strip()


# ─── Feature Definition Cards ───────────────────────────────────

FEATURE_DEFINITION_CARDS = """
FREE SPINS:
  IS: A bonus round awarding free spins (reels spin without bet deduction). Triggered by scatter/bonus symbols.
  NOT: Regular spins. Respins. "Spin" in UI buttons. Retriggers are part of Free Spins, not separate.

HOLD AND SPIN:
  IS: A DEDICATED bonus where special symbols LOCK on the grid and remaining positions RESPIN to collect more locked symbols. Must have BOTH: (1) symbols locking in place on a grid, AND (2) remaining positions re-spinning with a counter that resets on new locks.
  KNOWN AS (cross-provider brand names): Hold & Win, Lock & Spin, Money Charge Bonus, Lightning Link, All Aboard, Dragon Link, Jackpot Respins, Money Link, Cash Eruption Bonus, Fire Link, Ultra Blazing Fire Link, Cash Falls, Collect'Em, Double Jackpot Hot Spot, Mad Hit, Heisenberg Collect & Link, Whitney Respin Bonus, Power Link, Hold n Link, Dollar Storm.
  NOT: Regular respins. Simple re-spin mechanics. Free spins with sticky/locked wilds (that's Free Spins, not H&S). Vague "hold-style" without explicit lock-grid-respin-counter mechanics.

STATIC JACKPOT:
  IS: A jackpot system with fixed-value prize tiers. If the HTML mentions NAMED TIERS like Mini, Minor, Major, Grand, Mega, Maxi, or Prize Pots — that IS Static Jackpot REGARDLESS of what follows the tier name (Jackpot, Cash Coin, Prize, Award, Pot, Diamond, etc.). "Minor Cash Coin = 100x" IS Static Jackpot. Also includes: fixed jackpots, "jackpot bonus" features. Look for tier names in section headers, symbol descriptions, bonus descriptions, and feature names — they often appear outside of H&S sections. If a feature/bonus name contains "Jackpot" and awards fixed values, classify as Static Jackpot. IMPORTANT: Do NOT assume Static Jackpot exists just because a game has Hold and Spin — some H&S games have NO jackpot tiers. Only classify Static Jackpot if there is EXPLICIT evidence of named jackpot tiers or fixed prize values in the HTML.
  NOT: Max win caps ("max win 2500x"). Truly variable community/pooled jackpots shared across a network of players. Simple "jackpot" label without specified tiers or fixed values. Hold and Spin games that do NOT mention any named jackpot tiers.

PROGRESSIVE JACKPOT:
  IS: A jackpot that grows over time as players place bets, with a portion of each bet contributing to the prize pool. The jackpot value increases until won. Must be explicitly described as growing/pooled/networked.
  NOT: Fixed/static jackpots with set values. "Progressive" used loosely for tiered fixed jackpots (those are Static Jackpot).

CASH ON REELS:
  IS: A SEPARATELY NAMED feature where symbols display cash/credit values on the reels OUTSIDE of or IN ADDITION TO the Hold and Spin mechanic. The feature must have its OWN name or be clearly described as a distinct BASE GAME symbol type with values. Examples: "Ingot Prizes", "Cash Eruption", "Fireball Feature", "Cash Bonus", "Cash Coins" (that land in the base game), "Record Symbols with prize values". If the game describes cash-value symbols that appear in the BASE GAME with their own named category, it's Cash On Reels.
  NOT: Hold and Spin scatter/lock symbols that have credit values as part of the H&S/respin bonus mechanic. If value symbols ONLY appear within a Hold and Spin or Loot Link or Respin Bonus section and are the lock/collect symbols of that bonus, those are PART OF Hold and Spin, NOT Cash On Reels. In most AGS games, H&S trigger symbols have credit values but these are PART OF the Hold and Spin feature. Also NOT: coin collection to external meters (Persistence), paytable-only values, scatter pay values.
  CRITICAL: If the game has Hold and Spin AND the only value symbols are described within the H&S rules section as scatter/lock symbols, do NOT add Cash On Reels. Only add Cash On Reels if value symbols are ALSO described as a separate base game feature.

WILD REELS:
  IS: A DEDICATED FEATURE where one or more entire reels RANDOMLY turn fully wild on their own, independent of where individual wild symbols land. The reels must ACT AS WILD (substitute for other symbols).
  NOT: Expanding Wilds (a wild lands then expands). Stacked wilds. Regular wilds. Gold/colored background features that don't make the reel act as a wild substitute. "Gold Feature" or "Gold Background" decorative effects.

EXPANDING REELS:
  IS: The reel SET or grid physically grows DURING GAMEPLAY — more rows added, more symbol positions unlocked, more ways-to-win created dynamically. Includes: xWays, Infinity Reels, "Grow Reels", grids that expand from 3x5 to 5x5 during a bonus, "extended grid" modes, row expansion during Fire Link / H&S bonuses, grid unlock mechanics where stone blocks break to reveal new positions.
  NOT: Colossal Symbols. Expanding wilds. Static configurations. Fixed "1024 ways". PowerXStream (this is a fixed ways-based win evaluation, NOT expanding reels). Player CHOOSING between different reel configurations before a bonus starts (that's a bonus option, not dynamic expansion). Megaways (variable symbol count per reel is Megaways, not Expanding Reels — classify as Megaways instead). Reel configuration changes that ONLY happen during Free Spins or as a Free Spins volatility choice (e.g., "15 spins on 3x5 or 10 spins on 4x5") — those are characteristics of the Free Spins feature, NOT a standalone Expanding Reels feature.

PICK BONUS:
  IS: A dedicated bonus round where the player picks from MANY hidden items and EACH pick reveals an individual prize. The picking IS the bonus game itself.
  NOT: Gate/selector (choosing between bonus modes like "pick free spins or hold and spin"). "Choose which bonus to play". Choosing parameters at the start of a bonus.
  CRITICAL: If the HTML describes choosing between two options (like "Free Spins OR Money Charge"), that is a GATEWAY/SELECTOR, NOT a Pick Bonus. A true Pick Bonus involves picking from MANY items (5+) where each reveals a prize.

RESPIN:
  IS: A NAMED, STANDALONE respin mechanic with its own section/heading in the rules. Specific reels spin again after a distinct triggering event. Can occur in the base game or as its own named bonus mode. Keywords: "Respin Feature", "Re-Spin", "Nudge and Respin", any section heading dedicated to a respin mechanic.
  NOT: Cascading/tumbling reels. Hold and Spin respins (the respins within H&S are part of H&S). Re-spins awarded as a sub-mechanic WITHIN another bonus feature (e.g., "6 re-spins" within a character/frame bonus) — those are part of the parent feature. Side-effects where another feature incidentally awards a respin.

WHEEL:
  IS: A standalone BONUS wheel triggered by specific symbols, with multiple prize SEGMENTS (cash, multipliers, jackpots). The wheel IS the main bonus feature.
  NOT: Gamble/double-up wheels after wins. Jackpot determination wheels. Selection mechanisms.

PERSISTENCE:
  IS: A feature where game state visibly accumulates or persists across BASE GAME spins. Includes: (1) symbols that STAY ON THE REELS for a set number of spins (e.g., "stays for 2-4 spins", "countdown", "gift symbols that remain") — these are Persistence, NOT Sticky Wilds, because the held objects are digit/prize/special symbols, not wild substitutes. (2) Collector meters or charge meters that fill progressively over many base game spins (e.g., Play'n GO Reactoonz "Charge", "Quantum" meters, Rise Of Olympus divine counters). (3) Symbol upgrade paths that persist across sessions. (4) Cross-spin tracking where specific events accumulate toward a trigger. The key test: does accumulated state carry forward across base game spins?
  NOT: Sticky wilds that only appear WITHIN a bonus round (that's a characteristic of Free Spins). Cash/coin collection WITHIN a bonus round (that's part of H&S or the bonus). Collect symbols that trigger an immediate bonus (that's a bonus trigger, not persistence). Simple win counters. Standard jackpot meter displays.

CASCADING REELS:
  IS: After a win, winning symbols are removed and new symbols fall/tumble into the gaps, creating chain wins. Known as: Avalanche, Tumble, Rolling Reels, Reactions, CashCade.
  NOT: Regular reel spins. Expanding reels. Symbol swaps.

MEGAWAYS:
  IS: The Big Time Gaming Megaways mechanic where each reel shows a variable number of symbols per spin (2-7), creating up to 117,649 ways to win.
  NOT: Fixed ways-to-win. PowerXStream. Standard expanding reels without variable-symbol-count.

BUY BONUS:
  IS: Option to purchase direct entry into a bonus round for a fixed cost, bypassing normal trigger.
  NOT: Regular bonus triggers. Increased-bet options.

GAMBLE FEATURE:
  IS: Optional feature where the player can risk/gamble winnings or bonuses for higher rewards. Known as: Gamble, Double Up, Risk/Gamble Round, Feature Gamble, Bonus Top Up, Bonus Gamble, Card Gamble, 50/50 Gamble, Hi-Lo, Spin Chance. Includes gambling for more free spins, gambling to upgrade bonus features, classic red/black card gamble, or wagering remaining credit on a chance meter (green vs red). The key: player makes a VOLUNTARY RISK CHOICE with a chance to LOSE what they already won.
  NOT: Regular gameplay. Bonus selection screens where all options are positive (no risk of losing). Buy Bonus (paying upfront, not risking existing wins).

MYSTERY SYMBOLS:
  IS: Special symbols that all transform into the same random symbol when they land.
  NOT: Regular scatter/wild symbols. Non-"mystery reveal" style transformations.

NUDGES:
  IS: A NAMED feature where reels shift UP or DOWN after stopping. Must be explicitly called "nudge" by name.
  NOT: Cascading reels. Regular reel stopping. "Second chance" mechanics.

EXPANDING WILDS:
  IS: A wild symbol that expands to cover an entire reel when it lands.
  NOT: Wild Reels (random full-reel wilds). Stacked wilds. Regular wilds.

MULTIPLIER:
  IS: A game mechanic where wins are multiplied by a value. Includes: progressive multipliers that increase during free spins (e.g., "starts at 1x, increases by 1x each cascade"), random multipliers applied to wins, fixed multipliers on specific symbol combinations (e.g., "Triple sub-symbols multiply by 3x/9x/27x"), win multipliers in bonus rounds, wilds that have a SINGLE FIXED multiplier (e.g., "wild substitutes and doubles all wins" = Multiplier, NOT Multiplier Wild).
  NOT: Multiplier Wild (wilds with VARIABLE, INDIVIDUALLY ASSIGNED multiplier values). Bet multipliers (choosing to bet 2x or 3x your stake). Standard pay table values. Progressive jackpots growing over time.
  CRITICAL: If a wild symbol simply "doubles" or "triples" all wins it participates in (a single fixed multiplier), that is Multiplier, NOT Multiplier Wild. Only use Multiplier Wild when each wild symbol carries its OWN DIFFERENT multiplier value.

MULTIPLIER WILD:
  IS: A DEDICATED, NAMED feature where wild symbols carry VARIABLE multiplier values (e.g., 1x-10x, randomly assigned per symbol) that multiply wins in combinations they participate in. The multiplier values are displayed ON each wild symbol and VARY between wilds. This must be a PRIMARY named mechanic of the game with its own dedicated rules section. Known as: Multiplier Wild, Liberty Gems, Multiplier Wilds, Wild Multipliers.
  NOT: Regular wilds that simply "substitute for all symbols" (even if the game name contains multiplier words like "2x" or "Diamond"). Wilds with a FIXED single multiplier (e.g., "all wilds multiply by 2x") — that is "Multiplier", NOT Multiplier Wild. Games where "2x", "3x" etc. refer to the game's overall multiplier mechanic or bet multiplier. Expanding Wilds, Sticky Wilds, or Walking Wilds that don't carry variable multiplier values. Any standard wild symbol in a game titled with multiplier numbers.
  CRITICAL: Only classify as Multiplier Wild when the HTML describes wilds with MULTIPLE DIFFERENT multiplier values (e.g., "1x, 2x, 3x, 4x, 5x") that each wild can carry. If the wild just "substitutes and doubles wins" with a single fixed multiplier, classify as "Multiplier" instead.

STICKY WILDS:
  IS: A NAMED, STANDALONE feature where wild symbols remain locked in position for multiple BASE GAME spins. Must persist across base game spins independently. Keywords: "Sticky Wild", "Locked Wild" as its own feature section.
  NOT: Regular wilds. Expanding wilds. Walking wilds. Wilds that only "lock", "hold", or "remain" DURING a Free Spins bonus round — those are a characteristic of Free Spins, not separate Sticky Wilds. Wilds that lock during Hold and Spin — those are part of H&S.

COLOSSAL SYMBOLS:
  IS: Oversized symbols (2x2, 3x3+) that appear on the reels, covering multiple positions.
  NOT: Expanding wilds. Stacked symbols.

SYMBOL TRANSFORMATION:
  IS: A NAMED feature where specific symbols visibly transform into other specific symbol types to create/improve wins. Must have an explicit dedicated mechanic described (e.g., "Morphing Symbols", "Transmutation", "Symbol Swap", "Alteration", "Demolition", "Implosion"). Requires the transformation to be the CORE mechanic, not a side effect. In grid/cluster games (Reactoonz, Rise Of Olympus, etc.), named sub-features that transform groups of symbols into wilds or other symbols (e.g., "Alteration", "Demolition", "Implosion") ARE Symbol Transformation.
  NOT: Mystery symbols (unrevealed→revealed). Cascading/tumbling (removed→filled). Wild substitution (Wilds acting as other symbols is NOT transformation). Expanding symbols in Free Spins (that's a Free Spins characteristic). Random wilds appearing (that's Wild/Random Wild). Trail/board game rewards that change symbols (that's Trail Bonus). Any mechanic where symbols are ADDED or REMOVED rather than TRANSFORMED in-place.

STACKED SYMBOLS:
  IS: Symbols in stacks of 2+ on a single reel, covering multiple consecutive positions vertically.
  NOT: Colossal symbols. Regular symbols. Expanding wilds.

TRAIL BONUS:
  IS: A board game / trail / ladder style bonus where the player advances along a path or through levels, landing on spaces that award prizes, multipliers, or other bonuses. Known as: Board Game Bonus, Path Bonus, Map Bonus, progressive ladder, stepper bonus.
  NOT: Simple multiplier features. Pick Bonus (picking items is not the same as advancing on a trail). Free Spins with increasing multipliers (unless presented as a visual trail/ladder).

WIN BOTH WAYS:
  IS: Wins pay from both left-to-right AND right-to-left.
  NOT: Standard left-to-right only.

COLLECT FEATURE:
  IS: A NAMED, STANDALONE mechanic where a specific COLLECT symbol gathers/collects values from OTHER symbols on the reels in a SINGLE action. The collect symbol activates and immediately awards the accumulated values. Known as: Cash Collect, Coin Collect. The key distinction: a DEDICATED collector symbol type that triggers value aggregation from other visible symbols in ONE event.
  NOT: Hold and Spin / lock-and-respin bonus mechanics — branded variants like "Collect & Win", "Mad Hit Collection", "Hold the Jackpot", "Collect'Em" are ALL Hold and Spin, NOT Collect Feature. Value/prize symbols sitting on reels with credit amounts = Cash On Reels, NOT Collect Feature. Collector symbols that only function WITHIN a Hold and Spin bonus round = part of H&S, NOT standalone Collect Feature. Piggy bank / pot mechanics that FILL OVER TIME across spins = Persistence, NOT Collect Feature. Regular scatter pays. Games that just have coins/prizes on reels without a dedicated collector symbol = Cash On Reels.

SYMBOL REMOVAL:
  IS: A feature where regular/low-paying symbols are REMOVED from the reels, leaving only special or high-paying symbols. This creates spins with a reduced symbol set. Known as: Fortune Spin, Fire Blitz Mode, Symbol Delete, Enhanced Spins, Premium Spins. The key mechanic: the reel strips are modified to contain fewer symbol types than normal.
  NOT: Mystery Symbols (those transform, not remove). Cascading Reels (those remove winning symbols). Regular Free Spins with different reels (unless the difference is specifically about REMOVING symbol types).

SYMBOL UPGRADE:
  IS: A mechanic where symbols are progressively upgraded or enhanced to become higher-value during gameplay. Common patterns: (1) Symbols gaining FRAMES or BORDERS that upgrade through tiers (e.g., wooden frame -> silver -> gold, as in Huff N Puff series). (2) Building/construction metaphors where symbols "level up" or improve (e.g., Buildin Bucks building progression). (3) Evolving symbols that transform into better versions over time. (4) Named upgrade systems: "Symbol Upgrade", "Evolving Symbols", "Level-up", "Enhancement", upgrade meters. Look for: symbols that IMPROVE through progressive stages, frames/borders around symbols indicating tier, building/upgrading visual language.
  NOT: Mystery Symbols (random transformation, not progressive upgrade). Symbol Transformation (one-time random change, not progressive tiers). Regular paytable values. Random wild generation (that's Wild Reels or similar).

3 POT:
  IS: A feature where EXACTLY 3 (or more) persistent POTS are displayed above or beside the reels and FILL UP progressively from reel symbols during base game spins. When a pot fills, it "bursts" or triggers its corresponding bonus feature or prize. The HTML must EXPLICITLY describe multiple pots filling up from collected symbols. Known as: Three Pot, Triple Troves, San Bao, San Fa, Multi-Pot. Common in Ainsworth games. The key distinction: visible POT containers that progressively fill — not just jackpot tiers or prize labels.
  NOT: Static Jackpot (fixed prize tiers). Hold and Spin (lock-and-respin). Progressive Jackpot (network-wide pools). Simple bonus meters. Any game that just has multiple jackpot levels (Mini/Minor/Major/Grand) — those are Static Jackpot. Coins or values on reels without visible filling pots — that's Cash On Reels or H&S. Only classify as 3 Pot if the HTML explicitly describes POT containers that fill up.
""".strip()


# ─── Theme Taxonomy ──────────────────────────────────────────────

THEME_TAXONOMY = """
Available themes (use ONLY these canonical names):
7s, Asian, Aztec, Animals, Adventure, African, Arcade, Casino, Classic, Dragons, Egyptian,
Fantasy, Fire, Food, Gems & Crystals, Gold, Greek, Horror, Indian, Irish, Las Vegas,
Lightning, Magic, Medieval, Mexican, Money, Music, Mystery, Mythical, Norse, Pirates,
Seasonal/Holiday, Space, Spanish, Sports, Table, Treasure, Tropical, Underwater, Western

THEME CLASSIFICATION RULES:
- theme_primary: The single MOST dominant theme
- themes_all: ALL applicable themes, but be CONSERVATIVE — only add themes with strong evidence

CRITICAL DISTINCTIONS:
- "7s" and "Classic" CAN COEXIST. If the game features 7s, bars, cherries, or bells as primary symbols, ALWAYS use "7s". ALSO add "Classic" when the HTML explicitly describes the game as "classic" (e.g., "classic symbols", "classic slot"), or when it has a traditional fruit-machine aesthetic with simple 3x3/3-reel layout. A 3x3 slot with bars, sevens, and simple paylines = BOTH ["7s", "Classic"]. A diamond/gem game with 7s = ["7s", "Gems & Crystals"], NOT "Classic".
- "Money" vs "Gold": Use "Money" ONLY when money/cash IS the central visual theme (e.g. "Cash Machine", "Billionaires Bank", dollar bills, vaults). Do NOT add "Money" just because the game has cash prizes, gold coins, treasure, or the word "cash" in a feature name — that's "Gold" or "Treasure". Lightning/voltage/thunder games are NOT "Money". Construction/building games are NOT "Money". Games named after animals (Mustang Money) use the animal theme primarily.
- "Mythical" vs specific mythology: Use the SPECIFIC mythology theme (Greek, Norse, Egyptian) as primary. Only add "Mythical" if the game mixes multiple mythologies or has a generic mythical setting not tied to a specific culture.
- "Fantasy" vs other themes: Use "Fantasy" for games with magic, wizards, enchanted forests, fairy tales, imaginary creatures (pigs/wolves in story settings, cartoon aliens, monsters), or any obviously fictional/whimsical world. A game about a medieval knight = "Medieval", not "Fantasy" (unless it has explicit magical elements). Games based on fairy tales or children's stories (e.g., Three Little Pigs, Jack and the Beanstalk) = "Fantasy". Games with cartoon alien creatures in imaginary worlds = "Fantasy".
- "Arcade" is for games with arcade/video-game-style mechanics or pixel art aesthetics. Do NOT add "Arcade" just because a game has a grid/cluster format.
- "Adventure" vs "Mythical": For games based on mythology or legends (Norse Skadi, Greek gods), use "Mythical" + the specific mythology theme. Do NOT use "Adventure" for mythology-based games unless the game explicitly frames itself as an adventure/quest. Adventure = exploration, treasure hunting, journeys. Mythical = gods, legends, mythological creatures.
- Do NOT add themes based solely on game mechanics or prize names. Theme comes from the visual setting, characters, and narrative.
- When in doubt between adding or not adding a secondary theme, ADD it if there is reasonable visual or textual evidence. Missing a valid theme is worse than adding a borderline one.
- ANIMALS from game name: If the game name contains an animal (Wolf, Ram, Eagle, Fish, Panda, Tiger, etc.), ALWAYS include "Animals" in themes_all.
- INFER from game name: Use the game title to identify themes. "Amazon" → Tropical + Underwater. "Ocean/Sea/Reef/Deep" → Underwater. "Jungle/Rain Forest/Tiki" → Tropical. "Vegas/Casino" → Las Vegas or Casino.
- "Gold" and "Treasure" over-classification: Do NOT add "Gold" or "Treasure" just because the game has gold coins as prizes or treasure chests as bonus triggers. These are standard slot elements. Only use when gold/treasure is the VISUAL THEME (e.g., "Gold Rush" setting, pirate treasure island).
- "7s" STRICT RULE: ONLY use "7s" if the HTML explicitly mentions "seven", "7s", "triple sevens", "bars", or "BAR symbols" as CORE game elements. A 3x3 game is NOT automatically "7s". A game themed around dragons, gems, animals, etc. is NEVER "7s" even if it has a classic reel layout. The HTML must explicitly describe seven/BAR symbols. If the game name contains "7" (e.g., "777 Hot Reels"), that IS evidence for "7s".
""".strip()


# ─── Few-Shot Training Examples ──────────────────────────────────

TRAINING_GAMES_AGS = [
    "Tiki Fortune", "Captain Riches", "Mine Blast", "Red Silk", "Aztec Chief",
    "Long Bao Bao", "Bonanza Blast", "Tiger Lord", "Peacock Beauty", "Diamond Rush",
    "Dragon Tao", "Pirate Plunder", "Dragon Blast", "Panda Blessings",
    "Rakin Bacon Odyssey", "Rakin Bacon Sahara", "Blazin Bank Run",
    "Golden Wins", "Jade Wins", "Longhorn Jackpots"
]

TRAINING_GAMES_CROSS_PROVIDER = [
    "Cash Eruption",                    # IGT: H&S, Cash On Reels, Wild Reels
    "Fu Shen Zhu Fu",                   # Inspired: 8 features, Buy Bonus, Nudges
    "Breaking Bad Collect Em And Link",  # Playtech: Collect'Em naming
    "Jimi Hendrix",                     # Evolution: Symbol Transformation, Pick Bonus
    "Halloween Wins 3",                 # Red Rake: Wheel, Expanding Reels, Respin
    "Guan Yu",                          # Ainsworth: provider naming, H&S variants
    "Centurion Big Money",              # Inspired: Trail Bonus, mixed feature set
    "Ancient Tumble",                   # Relax Gaming: tumble != Expanding Reels, Mystery Symbols
    "Hypernova Megaways",              # Reel Play: Megaways != Cascading, Cash On Reels
    "Wild Storm Legionnaire",          # Oddsworks: H&S boundary - don't add Cash On Reels/Respin/Multiplier for H&S sub-mechanics
    "Diggy Gold",                      # Oddsworks: Wild Reels distinction (Locked Stacked Wild != Sticky Wilds)
    "Fire Joker Blitz",                # Play'n GO: Collect Feature, Symbol Removal, Persistence
    "Lock Breakers Goblin Bros",       # Greentube: Persistence, Nudges, Cash On Reels distinction
    "Lucky Golden Coins",              # Spinberry: H&S variant (Coin Link), Cash On Reels boundary
    "Wheel Of Fortune On Tour",        # IGT: Trail Bonus, Wheel, Pick Bonus -- NOT Persistence/Symbol Transform
    "Ducky Bucks",                     # Gamecode: Buy Bonus recognition, Static Jackpot
    "Arthurs Gold",                    # Games Global: Gamble Feature, Expanding Wilds, Respin
]

TRAINING_GAMES = TRAINING_GAMES_AGS + TRAINING_GAMES_CROSS_PROVIDER

# Capital Gains kept as a critical gateway-vs-pick-bonus teaching example
CRITICAL_EXAMPLES = ["Capital Gains"]

def load_training_examples():
    """Load 20 AGS + critical examples as few-shot training from GT + HTML."""
    with open(GT_PATH) as f:
        gt = json.load(f)
    with open(MATCHES_PATH) as f:
        matches = json.load(f)

    all_training = TRAINING_GAMES + CRITICAL_EXAMPLES
    examples = []

    for name in all_training:
        if name not in gt or name not in matches:
            continue

        slug = matches[name]['slug']
        html_path = RULES_HTML_DIR / f"{slug}.html"
        if not html_path.exists():
            continue

        with open(html_path) as f:
            clean_html = clean_html_for_claude(f.read())

        gt_data = gt[name]
        features_list = [{"name": f, "confidence": 5} for f in gt_data.get('features', [])]
        themes = gt_data.get('themes', [])

        expected = {
            "features": features_list,
            "theme_primary": themes[0] if themes else None,
            "themes_all": themes
        }

        # Add gateway note for Capital Gains
        if name == "Capital Gains":
            expected["notes"] = (
                "The Pick Bonus section describes a GATEWAY: player chooses between "
                "Money Charge Bonus OR Free Spins. This is NOT a true Pick Bonus. "
                "A true Pick Bonus involves picking from MANY items (5+) where each "
                "reveals a prize."
            )

        examples.append({
            "name": name,
            "slug": slug,
            "clean_html": clean_html,
            "expected": expected
        })

    return examples


# ─── Prompt Construction ─────────────────────────────────────────

def build_system_prompt():
    return f"""You are a slot game feature extraction expert. You analyze HTML rules pages from casino slot games and extract structured game profile data.

Your job is to classify game FEATURES, THEMES, and SPECIFICATIONS from the rules page content.

## FEATURE CLASSIFICATION RULES
You MUST only use features from the following taxonomy. Each classification rule tells you what IS and what is NOT that feature.

{FEATURE_DEFINITION_CARDS}

## CRITICAL CLASSIFICATION RULES
1. GATEWAY vs PICK BONUS: If a game has a "Pick Bonus" section that describes choosing between 2-3 bonus modes (like "Free Spins or Hold and Spin"), that is a GATEWAY/SELECTOR — NOT a Pick Bonus. A true Pick Bonus involves picking from MANY items (5+) where each pick reveals an individual prize.
2. PowerXStream / Power XStream: This is a WAYS-based win evaluation method. It is NOT Expanding Reels. Classify it under win_evaluation: "ways".
3. Hold and Spin does NOT automatically imply Static Jackpot: Some H&S games have NO jackpot tiers. Only classify Static Jackpot if the HTML explicitly mentions named prize tiers (Mini/Minor/Major/Grand) or fixed jackpot values. Do NOT add Static Jackpot just because H&S is present.
4. "Expanding Wilds" during Free Spins are a CHARACTERISTIC of Free Spins, not a separate Expanding Wilds feature (unless they also appear in the base game).
5. Each feature should be a MAIN game feature, not a sub-mechanic of another feature.
6. MEGAWAYS vs EXPANDING REELS: These are DIFFERENT features. Megaways = variable symbol count per reel per spin (Big Time Gaming mechanic). Expanding Reels = the grid physically grows (more rows/positions added during gameplay). A game can have BOTH. If a game only has variable-symbol-count reels, that's Megaways NOT Expanding Reels. If the grid expands from 3x5 to 5x5 during a bonus, that IS Expanding Reels.
7. STATIC JACKPOT without Hold and Spin: Many non-AGS games have named jackpot tiers (Mini/Minor/Major/Grand, Prize Pots) that are NOT triggered through Hold and Spin. If you see named jackpot tier labels ANYWHERE in the HTML — in bonus descriptions, wheel segments, or standalone jackpot sections — classify as Static Jackpot. Don't wait for H&S to be present.
8. Cash On Reels vs H&S trigger symbols: Most Hold and Spin games have "trigger symbols" or "credit prize symbols" with values. These are PART OF the Hold and Spin mechanic, NOT a separate Cash On Reels feature. Only classify as Cash On Reels if the value symbols have their OWN separately named feature section (like "Ingot Prizes Feature" or "Cash Eruption Feature" or "Cash Symbol" section). The litmus test: does the game describe these value symbols as their own distinct feature with their own heading/section? If yes → Cash On Reels. If they're just described within the H&S section → NOT Cash On Reels.
9. Win evaluation types (lines/ways) from the GAME INFORMATION section should go in specs.win_evaluation, not as a feature.
10. Confidence scoring: Only assign confidence 4 or 5 to features you are CERTAIN about. Use confidence 3 for borderline cases (these will be filtered out).
11. PERSISTENCE requires BASE GAME carry-over: "Collect" symbols that trigger an immediate bonus, or coins collected WITHIN a bonus round, are NOT Persistence. Persistence means state that accumulates across multiple base game spins and carries over between sessions. If unsure, do NOT classify as Persistence.
12. COLOSSAL SYMBOLS vs unrelated features: Oversized 2x2 or 3x3 symbols are Colossal Symbols. Do NOT confuse with: "super" variants of other features (like "Super Cash Volt" = a bigger version of the same feature), jumbo/linked reels, or large wild symbols that expand (those are Expanding Wilds).
13. Provider naming awareness: Different providers call the same feature by different names. Look for the MECHANIC being described, not the marketing name. For example, "Collect'Em" (Playtech) = Hold and Spin. "Cash Eruption Bonus" (IGT) = Hold and Spin. "Fire Link" (Light & Wonder) = Hold and Spin. "Mad Hit" (Bragg/Ruby Play) = Hold and Spin. "Prize Pots" (Inspired) = Static Jackpot.
14. EVIDENCE REQUIRED: Only classify a feature if there is SPECIFIC text in the HTML that describes or names that mechanic. Do NOT infer features from general game structure or assume features exist without textual evidence. If the HTML does not mention cash values on symbols, do NOT add Cash On Reels. If the HTML does not describe reels expanding, do NOT add Expanding Reels. HOWEVER: if the HTML explicitly NAMES a feature (e.g. "Free Spins Feature", "Bonus Wheel", "Super Bonus"), DO classify it even if the description is minimal. A named feature with sparse description is still a real feature. Only leave it out if the feature is NEVER mentioned at all.
15. STICKY WILDS vs locked wilds in bonus: If wilds "lock" or "remain" ONLY during a Free Spins bonus round, that is a CHARACTERISTIC of Free Spins, not a separate Sticky Wilds feature. Only classify as Sticky Wilds if they persist in the BASE GAME or are explicitly called "Sticky Wilds" by name.
16. CASCADING REELS requires explicit mechanic: Only classify as Cascading Reels if the HTML explicitly describes winning symbols being REMOVED and new symbols FALLING into gaps. Do NOT classify as Cascading based on "trophy" collection, jackpot accumulation, or general "cascade" in marketing text.
17. Static Jackpot in feature names: If a feature/bonus name contains "Jackpot" (e.g., "Double Jackpot Hot Spot") AND the game awards fixed prize values through that feature, classify as Static Jackpot even without Mini/Minor/Major/Grand tier labels.
18. HOLD AND SPIN BOUNDARY: When a game has Hold and Spin (or Hold & Respin, Lock & Spin, etc.), the following are PART OF that H&S feature and should NOT be classified separately:
    - COIN/prize symbols with credit values that lock during H&S = NOT Cash On Reels (unless they ALSO appear in the base game as a separate named feature)
    - The respins within H&S = NOT Respin (Respin is only for STANDALONE respin mechanics OUTSIDE of H&S)
    - "All positions filled" grand prize = part of H&S/Static Jackpot, NOT a separate feature
    - Wild symbols that double wins during H&S = NOT Multiplier (that's wild substitution behavior)
    This is the MOST COMMON error. If you see H&S, carefully check whether other features you want to add are actually just SUB-MECHANICS of the H&S feature.
19. WILD TYPE DISTINCTION: These are DIFFERENT features, do not confuse them:
    - Wild Reels: ENTIRE reel becomes wild (all positions on a reel are wild). Keywords: "wild reel", "locked stacked wild", "reel becomes wild"
    - Expanding Wilds: A SINGLE wild symbol expands to cover the full reel. Keywords: "expands to fill", "expanding wild"
    - Sticky Wilds: Wilds that STAY IN PLACE for multiple BASE GAME spins (NOT during a bonus). Keywords: "sticky wild" as a named feature
    - Stacked Wilds: Multiple wild symbols stacked vertically on a reel (but not necessarily filling it). Keywords: "stacked wild"
    If the HTML says a reel "becomes" wild or a "locked stacked wild" covers the reel, that is Wild Reels, NOT Sticky Wilds.
20. INNER FEATURE RULE: If a mechanic ONLY occurs WITHIN another bonus feature (Free Spins, character features, bonus rounds), it is a CHARACTERISTIC of that parent feature, NOT a standalone feature. This applies broadly:
    - Wilds that only "lock"/"remain" during Free Spins → NOT Sticky Wilds (it's a Free Spins characteristic)
    - Re-spins awarded within a bonus round → NOT Respin (it's a bonus round characteristic)
    - Expanding Wilds that only appear in Free Spins → NOT Expanding Wilds (it's a Free Spins characteristic)
    - Symbol transformations within a specific bonus → NOT Symbol Transformation (unless it's the MAIN mechanic of the game)
    Only classify as a standalone feature if it also occurs in the BASE GAME or is explicitly a NAMED, SEPARATE feature with its own trigger.
    EXCEPTION: "Multiplier" is EXEMPT from this rule. ALWAYS extract Multiplier when ANY multiplier mechanic exists (progressive multipliers in free spins, win multipliers in bonus rounds, fixed multipliers on symbols like Triple sub-symbols, random multipliers on wins). Multiplier is always a standalone feature regardless of where it occurs.
21. BUY BONUS RECOGNITION: Look for ANY option to purchase direct entry into a bonus round for a FIXED COST. Common names: "Buy Bonus", "Bonus Buy", "Feature Buy", "Buy Feature", "Power Bet" (when it directly purchases a feature). The HTML must describe PAYING A SPECIFIC PRICE to immediately trigger a bonus/feature. Note: "Power Bet" can be EITHER a Buy Bonus (if it purchases direct entry to a bonus) OR a bet modifier (if it just increases odds/unlocks reels). Check the HTML description: if it says "pay X to trigger bonus directly" = Buy Bonus. If it says "increase bet to improve odds" = NOT Buy Bonus.
22. MULTIPLIER vs MULTIPLIER WILD — CRITICAL DISTINCTION:
    - "Multiplier": A win multiplier mechanic. Wilds that double/triple ALL wins (fixed single value). Progressive multipliers in free spins. Random multipliers applied to wins. Triple sub-symbols. ANY multiplier that is NOT variable per wild symbol.
    - "Multiplier Wild": ONLY when each wild symbol displays its OWN randomly-assigned multiplier value (e.g., one wild shows 2x, another shows 5x, another shows 10x). The multiplier VARIES between individual wild symbols.
    - DEFAULT TO "Multiplier". Only use "Multiplier Wild" when you see EXPLICIT evidence of VARIABLE per-symbol multiplier values on wilds.
    - If in doubt, choose "Multiplier", not "Multiplier Wild".

## THEME TAXONOMY
{THEME_TAXONOMY}

## OUTPUT FORMAT
Return a JSON object with this exact structure:
{{
  "features": [
    {{
      "name": "<canonical feature name from taxonomy>",
      "operator_name": "<what the operator/game calls this feature>",
      "context": "<where in the HTML this was found, e.g. 'H3 section under GAME FEATURES'>",
      "description": "<1-2 sentence description of how this feature works in this specific game>",
      "characteristics": ["<sub-mechanic or detail>", ...],
      "confidence": <1-5, where 5 = certain>
    }}
  ],
  "theme_primary": "<single most dominant theme>",
  "themes_all": ["<theme1>", "<theme2>", ...],
  "specs": {{
    "rtp": <number or null>,
    "volatility": "<Low|Medium-Low|Medium|Medium-High|High|Very High or null>",
    "max_win": "<string like '5000x' or null>",
    "reels": <number or null>,
    "rows": <number or null>,
    "paylines": "<number or string like '243 ways' or null>",
    "grid_config": "<string like '5x3' or '5x4-5-5-5-4' for non-uniform or null>",
    "win_evaluation": "<'lines' or 'ways' or 'cluster' or null>",
    "min_bet": <number or null>,
    "max_bet": <number or null>,
    "default_bet": <number or null>,
    "jackpot_structure": <object with tier names and values like {{"Mini": 20, "Minor": 100, "Major": 500, "Grand": 5000}} or null>,
    "last_modified_date": "<string or null>",
    "description": "<2-3 sentence game description suitable for display in a dashboard>"
  }},

## SPEC EXTRACTION RULES
- ALWAYS extract rtp, reels, rows, volatility, grid_config, paylines, and win_evaluation when mentioned ANYWHERE in the HTML (Quick Facts, Game Information, Introduction, etc.)
- rtp: Look for "Return to Player", "RTP", "theoretical return", "payout percentage". Extract as a NUMBER (e.g., 96.5, not "96.5%").
- reels: Count from grid description, "X-reel game", or grid_config. For cluster/grid games, use the grid width.
- rows: Count from grid description or grid_config. For variable rows (Megaways), use the most common row count.
- grid_config: Construct from reels x rows (e.g., "5x3"). For non-uniform layouts, specify each reel (e.g., "3-4-5-4-3"). For Megaways, use "Megaways" or the variable range.
- volatility: Look for "volatility", "variance", "risk level". Normalize to: Low, Medium-Low, Medium, Medium-High, High, Very High.
- paylines: Extract the number or type ("20 lines", "243 ways", "1024 ways", "cluster pays").
- win_evaluation: "lines" for payline games, "ways" for ways-to-win, "cluster" for cluster pays.
- jackpot_structure: Extract ALL named jackpot tiers with their values. Look for Mini/Minor/Major/Grand, Bronze/Silver/Gold/Diamond, or any named fixed prizes.
  "functional_symbols": [
    {{
      "name": "<symbol name>",
      "type": "<wild|scatter|bonus|special>",
      "description": "<what this symbol does>"
    }}
  ]
}}

Return ONLY valid JSON. No markdown, no commentary outside the JSON."""


PROVIDER_HINTS = {
    "Ruby Play": "Mad Hit Instant Win / Collect & Win / Collection = Hold and Spin variant, NOT Collect Feature. Prize symbols with denominations = Cash On Reels within H&S.",
    "Bragg Gaming Group": "Mad Hit branding = Hold and Spin variant, NOT Collect Feature. Look carefully for Cash On Reels (prize symbols with values).",
    "Ainsworth": "Pot/Trove filling mechanics = 3 Pot feature. Known names: San Bao, San Fa, Triple Troves, Multi-Pot. Wilds that lock during bonus = part of bonus, NOT standalone Sticky Wilds.",
    "Wazdan": "Power Bet and Volatility Levels are bet configuration options, NOT Buy Bonus (unless they directly purchase entry to a bonus). Hold the Jackpot = Hold and Spin. Collector/Mega Collector within Hold the Jackpot bonus = part of H&S, NOT standalone Collect Feature.",
    "Play'n GO": "Grid/cluster games (Reactoonz, Rise Of Olympus): charge meters and Quantum/Fluctuation mechanics = Persistence. Named sub-features (Alteration, Demolition, Implosion) that transform symbols = Symbol Transformation. Cascading wins in grid games = Cascading Reels.",
    "Spinberry": "Digit symbols with gift counters that stay on reels for N spins = Persistence, NOT Sticky Wilds.",
    "Inspired": "Prize Pots = Static Jackpot tier naming. Centurion trail mechanics = Trail Bonus.",
    "Spearhead Studios": "Random Wilds = Wild Reels. Repeat Win = Respin. Trail [Double] is part of Trail Bonus, NOT Gamble Feature.",
    "High 5 Games": "Power Bet can be a Buy Bonus if it directly purchases feature entry. Check the HTML description carefully.",
    "Light & Wonder": "Fire Link / Ultra Blazing Fire Link = Hold and Spin. 88 Fortunes uses Gold Symbol bonus (NOT Pick Bonus).",
}


def build_user_prompt(game_name, clean_html, examples, provider=None):
    """Build user prompt with few-shot examples and target game."""
    parts = ["Here are examples of correct extractions:\n"]

    for ex in examples:
        parts.append(f"─── EXAMPLE: {ex['name']} ───")
        parts.append(f"HTML CONTENT:\n{ex['clean_html'][:2000]}")
        expected_compact = json.dumps(ex['expected'], separators=(',', ':'))
        parts.append(f"\nCORRECT EXTRACTION:\n{expected_compact}")
        parts.append("")

    parts.append(f"─── NOW EXTRACT FOR: {game_name} ───")
    if provider:
        hint = PROVIDER_HINTS.get(provider, "")
        parts.append(f"Provider/Studio: {provider}")
        if hint:
            parts.append(f"Provider-specific notes: {hint}")
    parts.append(f"HTML CONTENT:\n{clean_html}")
    parts.append(f"\nExtract the complete game profile for {game_name}. Return ONLY the JSON.")

    return "\n".join(parts)


# ─── Claude API Client ───────────────────────────────────────────

def _get_api_key():
    env_path = DATA_DIR / ".env"
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                if line.startswith("ANTHROPIC_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise ValueError("No ANTHROPIC_API_KEY found in .env or environment")
    return key

_client = None

def _get_client():
    global _client
    if _client is None:
        import anthropic
        _client = anthropic.Anthropic(api_key=_get_api_key())
    return _client


def call_claude(system_prompt, user_prompt, model="claude-sonnet-4-20250514",
                use_cache=True, max_retries=3):
    """Call Claude API with prompt caching and retry logic."""
    client = _get_client()

    system_block = [{"type": "text", "text": system_prompt}]
    if use_cache:
        system_block[0]["cache_control"] = {"type": "ephemeral"}

    for attempt in range(max_retries):
        try:
            response = client.messages.create(
                model=model,
                max_tokens=4096,
                system=system_block,
                messages=[{"role": "user", "content": user_prompt}]
            )

            text = response.content[0].text.strip()
            if text.startswith("```"):
                text = re.sub(r'^```(?:json)?\s*', '', text)
                text = re.sub(r'\s*```$', '', text)

            try:
                return json.loads(text), response.usage
            except json.JSONDecodeError:
                # Try extracting JSON from preamble/postamble text
                json_match = re.search(r'\{[\s\S]*\}', text)
                if json_match:
                    try:
                        return json.loads(json_match.group()), response.usage
                    except json.JSONDecodeError:
                        pass
                print(f"  JSON parse error")
                print(f"  Raw response (first 500 chars): {text[:500]}")
                return None, response.usage

        except Exception as e:
            err_str = str(e)
            retryable = any(code in err_str for code in ['429', '529', 'overloaded', 'timeout', 'ConnectionError'])
            if retryable and attempt < max_retries - 1:
                wait = 2 ** (attempt + 1)
                print(f"  Retry {attempt+1}/{max_retries} after {wait}s: {err_str[:80]}")
                time.sleep(wait)
            else:
                raise


# ─── Post-Processing ─────────────────────────────────────────────

CANONICAL_FEATURE_NAMES = {
    n.lower(): n for n in [
        "Free Spins", "Hold and Spin", "Static Jackpot", "Progressive Jackpot",
        "Cash On Reels", "Wild Reels", "Expanding Reels", "Multiplier",
        "Pick Bonus", "Respin", "Wheel", "Persistence", "Cascading Reels",
        "Megaways", "Buy Bonus", "Gamble Feature", "Mystery Symbols", "Nudges",
        "Expanding Wilds", "Sticky Wilds", "Colossal Symbols",
        "Symbol Transformation", "Stacked Symbols", "Trail Bonus",
        "Win Both Ways", "Collect Feature", "Symbol Removal",
        "Symbol Upgrade", "Multiplier Wild", "3 Pot",
    ]
}

def post_process(extraction, game_name="", clean_html=""):
    """Apply deterministic post-processing rules."""
    if not extraction or 'features' not in extraction:
        return extraction

    if not isinstance(extraction['features'], list):
        extraction['features'] = []
        return extraction

    extraction['features'] = [
        f for f in extraction['features']
        if isinstance(f, dict) and 'name' in f and isinstance(f['name'], str)
    ]

    for f in extraction['features']:
        canonical = CANONICAL_FEATURE_NAMES.get(f['name'].lower())
        if canonical:
            f['name'] = canonical

    is_slingo = 'slingo' in game_name.lower()

    if is_slingo:
        extraction['features'] = [
            f for f in extraction['features']
            if f['name'] not in ('Buy Bonus', 'Cascading Reels')
        ]

    feature_names = {f['name'] for f in extraction['features']}

    # Rule 1: H&S implies Static Jackpot — REMOVED
    # Previously auto-added Static Jackpot whenever H&S was detected.
    # This caused false positives on H&S games without jackpots (e.g., Divine Stars).
    # Claude now detects Static Jackpot from HTML evidence directly.

    # Rule 2: Remove low-confidence features (< 4)
    extraction['features'] = [
        f for f in extraction['features']
        if f.get('confidence', 5) >= 4
    ]

    # Rule 2d: Remove Expanding Reels if context shows it's inside Free Spins only
    extraction['features'] = [
        f for f in extraction['features']
        if not (f['name'] == 'Expanding Reels' and
                any(kw in (f.get('context','') + f.get('description','')).lower()
                    for kw in ['free spin', 'free game', 'volatility', 'choose your']))
    ]

    # Rule 2b: Remove Colossal Symbols if it's just a "super" variant of another feature
    feature_names = {f['name'] for f in extraction['features']}
    if 'Colossal Symbols' in feature_names:
        colossal = [f for f in extraction['features'] if f['name'] == 'Colossal Symbols']
        if colossal:
            desc = (colossal[0].get('description', '') + ' ' + colossal[0].get('operator_name', '')).lower()
            if 'super' in desc and ('cash' in desc or 'volt' in desc or 'variant' in desc):
                extraction['features'] = [f for f in extraction['features'] if f['name'] != 'Colossal Symbols']

    # Rule 3: Normalize theme names
    THEME_NORMALIZE = {
        'Chinese': 'Asian', 'Japanese': 'Asian', 'Korean': 'Asian',
        'Halloween': 'Horror', 'Vampire': 'Horror', 'Zombie': 'Horror',
        'Mythology': 'Mythical', 'Mythological': 'Mythical',
        'Ocean': 'Underwater', 'Sea': 'Underwater', 'Marine': 'Underwater',
        'Jewels': 'Gems & Crystals', 'Gemstones': 'Gems & Crystals', 'Diamonds': 'Gems & Crystals',
        'Christmas': 'Seasonal/Holiday', 'Easter': 'Seasonal/Holiday', 'Valentine': 'Seasonal/Holiday',
        'Fruit': 'Classic', 'Fruits': 'Classic',
        'Jungle': 'Tropical', 'Rain Forest': 'Tropical',
        'Viking': 'Norse', 'Vikings': 'Norse',
        'Roman': 'Greek', 'Ancient Greece': 'Greek',
        'Pharaoh': 'Egyptian', 'Ancient Egypt': 'Egyptian',
        'Wild West': 'Western', 'Cowboy': 'Western',
        'Pirate': 'Pirates',
        'Dragon': 'Dragons',
        'Fairy Tale': 'Fantasy', 'Enchanted': 'Fantasy',
    }
    if extraction.get('themes_all'):
        normalized = []
        for t in extraction['themes_all']:
            normalized.append(THEME_NORMALIZE.get(t, t))
        extraction['themes_all'] = list(dict.fromkeys(normalized))

    # Rule 5a: Detect "Classic" theme from HTML evidence (explicit keyword only)
    themes = set(extraction.get('themes_all', []))
    has_classic_html = False
    if clean_html:
        html_lower = clean_html.lower()
        has_classic_html = bool(
            re.search(r'\bclassic\s+(?:symbols?|slot|game|style)', html_lower) or
            re.search(r'\bfeaturing\s+classic\b', html_lower) or
            re.search(r'\bfruit\s+machine\b', html_lower)
        )
    if has_classic_html and 'Classic' not in themes:
        extraction.setdefault('themes_all', []).append('Classic')
        extraction['themes_all'] = list(dict.fromkeys(extraction['themes_all']))

    # Rule 5b: Remove false Classic when primary theme is gems/dragons and HTML has no "classic" keyword
    themes = set(extraction.get('themes_all', []))
    if 'Classic' in themes and not has_classic_html:
        primary_overrides = {'Gems & Crystals', 'Dragons'}
        if themes & primary_overrides:
            extraction['themes_all'] = [t for t in extraction['themes_all'] if t != 'Classic']

    # Rule 5c: Remove Gold when Money is present (gold coins in money games are part of Money theme)
    themes = set(extraction.get('themes_all', []))
    if 'Gold' in themes and 'Money' in themes:
        extraction['themes_all'] = [t for t in extraction['themes_all'] if t != 'Gold']

    # Rule 5d: Remove Adventure when a specific mythology theme is primary
    themes = set(extraction.get('themes_all', []))
    specific_mythologies = {'Norse', 'Greek', 'Egyptian'}
    if 'Adventure' in themes and themes & specific_mythologies:
        extraction['themes_all'] = [t for t in extraction['themes_all'] if t != 'Adventure']

    # Rule 6: Detect themes from game name when Claude clearly misses them
    themes = set(extraction.get('themes_all', []))
    name_lower = game_name.lower()
    name_theme_hints = {
        'Money': [r'\bbucks\b', r'\bdollar'],
        'Animals': [r'\bfish\b', r'\bwolf\b', r'\bbear\b(?!.*wild)', r'\bhorse\b', r'\bpanther\b',
                    r'\bgorilla\b', r'\belephant\b', r'\beagle\b', r'\bbutterfl'],
    }
    for theme, patterns in name_theme_hints.items():
        if theme not in themes:
            for pat in patterns:
                if re.search(pat, name_lower):
                    extraction.setdefault('themes_all', []).append(theme)
                    extraction['themes_all'] = list(dict.fromkeys(extraction['themes_all']))
                    break

    # Rule 4: Detect Multiplier from HTML evidence (Claude consistently misses this)
    # Only triggered by STRONG evidence — named sections or explicit variable multiplier mechanics
    feature_names = {f['name'] for f in extraction['features']}
    if clean_html and 'Multiplier' not in feature_names and 'Multiplier Wild' not in feature_names:
        html_lower = clean_html.lower()
        multiplier_evidence = (
            re.search(r'\bmultiplier\s+feature\b', html_lower) or
            re.search(r'\bmultipliers?\s+multiply\s+winning', html_lower) or
            re.search(r'\b(?:2|3|5)x\s+multiplier\s+is\s+available\b', html_lower) or
            re.search(r'symbols?\s+multiplying\s+wins?\s+by\s+\d+x', html_lower) or
            re.search(r'prizes?\s+(?:are\s+)?(?:doubled|tripled)\s+when\b.*\bsubstitute', html_lower) or
            re.search(r'\brandom\s+multiplier\b', html_lower) or
            re.search(r'\bpays?\s+\d+x\s+the\s+winning\s+combination\b', html_lower) or
            re.search(r'\baccumulating\s+multiplier\b', html_lower)
        )
        if multiplier_evidence:
            extraction['features'].append({
                'name': 'Multiplier',
                'confidence': 4,
                'context': 'Post-processing: HTML multiplier evidence detected',
                'description': 'Multiplier mechanic detected from HTML rules'
            })

    return extraction


# ─── GT Comparison ────────────────────────────────────────────────

def compare_with_gt(extraction, gt_features, gt_themes):
    """Compare extraction against ground truth. Returns precision, recall, F1."""
    if not extraction or 'features' not in extraction:
        return {"error": "no extraction"}

    raw_extracted = {f['name'] for f in extraction['features']}
    raw_truth = set(gt_features)

    extracted = raw_extracted
    truth = raw_truth

    # Empty prediction matching empty truth = perfect classification
    if not extracted and not truth:
        precision, recall, f1 = 1.0, 1.0, 1.0
        tp, fp, fn = set(), set(), set()
    else:
        tp = extracted & truth
        fp = extracted - truth
        fn = truth - extracted
        precision = len(tp) / len(extracted) if extracted else 0
        recall = len(tp) / len(truth) if truth else 0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0

    result = {
        "precision": round(precision, 3),
        "recall": round(recall, 3),
        "f1": round(f1, 3),
        "tp": sorted(tp),
        "fp": sorted(fp),
        "fn": sorted(fn),
    }

    # Theme comparison
    if gt_themes:
        ext_themes = set(extraction.get('themes_all', []))
        gt_t = set(gt_themes)
        t_tp = ext_themes & gt_t
        t_fp = ext_themes - gt_t
        t_fn = gt_t - ext_themes
        t_prec = len(t_tp) / len(ext_themes) if ext_themes else (1.0 if not gt_t else 0.0)
        t_rec = len(t_tp) / len(gt_t) if gt_t else 1.0
        t_f1 = 2 * t_prec * t_rec / (t_prec + t_rec) if (t_prec + t_rec) > 0 else 0
        result["theme_tp"] = sorted(t_tp)
        result["theme_fp"] = sorted(t_fp)
        result["theme_fn"] = sorted(t_fn)
        result["theme_precision"] = round(t_prec, 3)
        result["theme_recall"] = round(t_rec, 3)
        result["theme_f1"] = round(t_f1, 3)

    return result


# ─── Main Extraction Function ────────────────────────────────────

def extract_game(game_name, html_path=None, slug=None, model="claude-sonnet-4-20250514",
                 examples=None, system_prompt=None, provider=None):
    """Extract full game profile from HTML rules page."""
    if html_path is None and slug:
        html_path = RULES_HTML_DIR / f"{slug}.html"

    if not html_path or not Path(html_path).exists():
        return None, f"HTML file not found: {html_path}"

    with open(html_path) as f:
        html = f.read()

    clean_html = clean_html_for_claude(html)

    if len(clean_html) < 2000:
        txt_path = Path(str(html_path).replace('rules_html', 'rules_text').replace('.html', '.txt'))
        if txt_path.exists():
            with open(txt_path) as f:
                txt_content = f.read().strip()
            if len(txt_content) > len(clean_html):
                clean_html = txt_content

    if len(clean_html) < 2000:
        return None, f"HTML too sparse ({len(clean_html)} chars)"

    if examples is None:
        examples = load_training_examples()
    if system_prompt is None:
        system_prompt = build_system_prompt()

    user_prompt = build_user_prompt(game_name, clean_html, examples, provider=provider)

    extraction, usage = call_claude(system_prompt, user_prompt, model)
    if extraction is None:
        return None, "Claude returned unparseable response"

    extraction = post_process(extraction, game_name=game_name, clean_html=clean_html)

    return extraction, {
        "input_tokens": usage.input_tokens,
        "output_tokens": usage.output_tokens,
        "html_chars": len(clean_html)
    }


# ─── Apply Result to Master ──────────────────────────────────────

_gt_names_cache = None

def _get_gt_names():
    global _gt_names_cache
    if _gt_names_cache is None:
        if GT_PATH.exists():
            with open(GT_PATH) as f:
                _gt_names_cache = set(json.load(f).keys())
        else:
            _gt_names_cache = set()
    return _gt_names_cache


def _compute_data_confidence(feature_details, game_entry):
    """Compute data_confidence level from feature_details confidence scores."""
    if game_entry.get('name') in _get_gt_names():
        return 'gt_verified'

    if not feature_details:
        category = game_entry.get('game_category', '')
        if category and category != 'Slot':
            return 'non_slot'
        return 'low'

    confidences = [f.get('confidence', 3) for f in feature_details]
    avg_conf = sum(confidences) / len(confidences)
    n_features = len(feature_details)

    if avg_conf >= 4.5 and n_features >= 2:
        return 'high'
    if avg_conf >= 3.5 or n_features >= 1:
        return 'medium'
    return 'low'


XLSX_PROTECTED_FIELDS = frozenset([
    'id', 'name', 'provider', 'game_category',
    'release_year', 'release_month', 'sites',
    'avg_bet', 'median_bet', 'games_played_index',
    'coin_in_index', 'theo_win', 'market_share_pct',
    'original_release_date', 'original_release_year',
    'original_release_month', 'original_release_date_source',
])


def apply_result_to_master(game_entry, result):
    """Write extraction result into a game_data_master.json entry.
    Flattens specs to top-level, renames fields to match dashboard expectations.
    XLSX-origin fields are protected and will never be overwritten.
    """
    snapshot = {k: game_entry[k] for k in XLSX_PROTECTED_FIELDS if k in game_entry}

    raw_features = result.get('features', [])
    if not isinstance(raw_features, list):
        raw_features = []
    seen = set()
    deduped = []
    for f in raw_features:
        name = f.get('name') if isinstance(f, dict) else None
        if name and isinstance(name, str) and name not in seen:
            seen.add(name)
            deduped.append(name)
    game_entry['features'] = deduped
    game_entry['feature_details'] = result.get('features', [])
    game_entry['theme_primary'] = result.get('theme_primary')
    game_entry['themes_all'] = result.get('themes_all', [])
    game_entry['symbols'] = result.get('functional_symbols', [])
    game_entry['extraction_date'] = time.strftime('%Y-%m-%d')
    game_entry['data_confidence'] = _compute_data_confidence(
        result.get('features', []), game_entry)

    specs = result.get('specs', {})
    if specs:
        if specs.get('rtp') is not None:
            game_entry['rtp'] = specs['rtp']
        if specs.get('volatility'):
            game_entry['volatility'] = specs['volatility']
        if specs.get('max_win'):
            game_entry['max_win'] = specs['max_win']
        if specs.get('reels') is not None:
            game_entry['reels'] = specs['reels']
        if specs.get('rows') is not None:
            game_entry['rows'] = specs['rows']
        if specs.get('paylines'):
            game_entry['paylines_count'] = specs['paylines']
        if specs.get('grid_config'):
            game_entry['grid_config'] = specs['grid_config']
        if specs.get('win_evaluation'):
            game_entry['win_evaluation'] = specs['win_evaluation']
        if specs.get('min_bet') is not None:
            game_entry['min_bet'] = specs['min_bet']
        if specs.get('max_bet') is not None:
            game_entry['max_bet'] = specs['max_bet']
        if specs.get('default_bet') is not None:
            game_entry['default_bet'] = specs['default_bet']
        if specs.get('jackpot_structure'):
            game_entry['jackpot_structure'] = specs['jackpot_structure']
        if specs.get('description'):
            game_entry['description'] = specs['description']

    for field in XLSX_PROTECTED_FIELDS:
        if field in snapshot and game_entry.get(field) != snapshot[field]:
            raise RuntimeError(
                f"XLSX field '{field}' was overwritten for game '{game_entry.get('name')}': "
                f"{snapshot[field]!r} -> {game_entry.get(field)!r}"
            )


# ─── Verification Pass ───────────────────────────────────────────

def build_verification_prompt(game_name, clean_html, existing_features, existing_themes, provider=None):
    """Build a verification prompt that checks existing extraction against our taxonomy."""
    features_json = json.dumps(existing_features, indent=2)
    themes_str = ", ".join(existing_themes) if existing_themes else "none extracted"
    canonical_list = ", ".join(sorted(set(CANONICAL_FEATURE_NAMES.values())))

    prompt = f"""You are verifying a previous game feature extraction. Review the extracted features against the HTML rules page and correct any errors.

GAME: {game_name}
"""
    if provider:
        hint = PROVIDER_HINTS.get(provider, "")
        prompt += f"PROVIDER: {provider}\n"
        if hint:
            prompt += f"Provider notes: {hint}\n"

    prompt += f"""
PREVIOUSLY EXTRACTED FEATURES:
{features_json}

PREVIOUSLY EXTRACTED THEMES: {themes_str}

HTML RULES PAGE:
{clean_html}

ALLOWED FEATURE NAMES (only use these):
{canonical_list}

CRITICAL RULES:
- ONLY use feature names from the allowed list above. Do NOT invent features.
- Wild, Scatter, Bonus symbols are SYMBOLS, not features. Do NOT add them as features.
- Autoplay, Auto Spin, Turbo Play are UI features, NOT game features. Never add these.
- Features that ONLY occur within another bonus (e.g. wilds only in Free Spins) are NOT standalone features.
- Hold and Spin sub-mechanics (respins, coin symbols, "all filled" bonus) are part of H&S, not separate features.
- Only classify features with explicit HTML evidence of the MECHANIC being described.
- This is an ADD-ONLY pass. Do NOT remove existing features. Only report features you want to ADD.
- Keep existing features as "correct". Only add NEW features you find that were missed.

Return a JSON object:
{{
  "verified_features": [
    {{
      "name": "<canonical feature name from allowed list>",
      "status": "<correct|added>",
      "reason": "<why this was kept or added>",
      "confidence": <1-5>
    }}
  ],
  "verified_themes": ["<theme1>", "<theme2>"],
  "changes_made": <true if any features were added, false if original was correct>,
  "verification_notes": "<brief summary of what was checked/changed>"
}}

Return ONLY valid JSON."""

    return prompt


def verify_game(game_name, slug, existing_features, existing_themes,
                model="claude-sonnet-4-20250514", provider=None):
    """Run a verification pass on an already-extracted game."""
    html_path = RULES_HTML_DIR / f"{slug}.html"
    if not html_path.exists():
        return None, f"HTML file not found: {html_path}"

    with open(html_path) as f:
        html = f.read()

    clean_html = clean_html_for_claude(html)
    if len(clean_html) < 2000:
        return None, f"HTML too sparse ({len(clean_html)} chars)"

    prompt = build_verification_prompt(
        game_name, clean_html, existing_features, existing_themes, provider
    )

    system = "You are a slot game feature verification expert. You review and correct previously extracted game features by checking them against the HTML rules page. Be precise and evidence-based."

    result, usage = call_claude(system, prompt, model)
    if result is None:
        return None, "Claude returned unparseable response"

    return result, {
        "input_tokens": usage.input_tokens,
        "output_tokens": usage.output_tokens,
        "html_chars": len(clean_html)
    }


NON_FEATURES = frozenset([
    'autoplay', 'auto spin', 'turbo play', 'turbo mode', 'quick spin',
    'wild', 'scatter', 'bonus symbol', 'wild symbols', 'scatter symbols',
])


def apply_verification_to_master(game_entry, verification):
    """Apply verification results to a master game entry.
    ADD-ONLY: verification can add missing features but never removes existing ones.
    This prevents regressions from a cheaper, less-informed pass overriding
    the full extraction's results.
    """
    if not verification.get('changes_made'):
        return False

    existing_features = set(game_entry.get('features', []))

    if len(existing_features) >= 3:
        return False

    verified = verification.get('verified_features', [])
    new_additions = []
    for f in verified:
        if f.get('status') != 'added':
            continue
        if f.get('confidence', 0) < 4:
            continue
        name = f.get('name', '')
        if name.lower() in NON_FEATURES:
            continue
        canonical = CANONICAL_FEATURE_NAMES.get(name.lower())
        if not canonical:
            continue
        if canonical not in existing_features:
            new_additions.append(canonical)

    if not new_additions:
        return False

    combined = list(existing_features) + new_additions
    seen = set()
    deduped = []
    for feat in combined:
        if feat not in seen:
            seen.add(feat)
            deduped.append(feat)

    game_entry['features'] = deduped
    game_entry['verification_date'] = time.strftime('%Y-%m-%d')
    game_entry['verification_notes'] = f"Added via verify: {new_additions}"

    old_conf = game_entry.get('data_confidence', 'low')
    if old_conf == 'low':
        game_entry['data_confidence'] = 'medium'

    return True


# ─── Art Characterization ──────────────────────────────────────

ART_STAGED_PATH = DATA_DIR / "staged_art_characterization.json"
ART_GT_PATH = DATA_DIR / "ground_truth_art.json"
ART_TEST_RESULTS_PATH = DATA_DIR / "art_test_results.jsonl"

ART_THEME_VALUES = [
    "Ancient Temple/Ruins", "Deep Ocean/Underwater", "Fantasy/Fairy Tale",
    "Wild West/Frontier", "Outer Space", "Neon/Cyber City", "Medieval Castle",
    "Tropical Island/Beach", "Arctic/Snow", "Jungle/Rainforest", "Desert/Sahara",
    "Haunted Manor/Graveyard", "Candy/Sweet World", "Circus/Carnival",
    "Urban/Modern City", "Mountain/Volcano", "Farm/Countryside", "Royal Palace/Court",
    "Pirate Ship/Port", "Treasure Cave/Mine", "Magic/Fantasy",
    "Asian Temple/Garden", "Ancient Greece", "Sky/Clouds", "Laboratory/Workshop",
    "Tavern/Saloon",
    "Norse/Viking Realm", "Irish/Celtic Highlands", "Festive/Holiday",
    "Prehistoric/Primordial", "Steampunk/Victorian",
    "Lakeside/River/Fishing Dock",
    "Prairie/Plains/Grassland",
    "Mexican/Latin Village", "Coastal/Beach/Shore",
    "Arabian Palace/Bazaar",
    "Classic Slots", "Fruit Machine", "Luxury/VIP", "Casino Floor",
    "Savanna/Wildlife", "Australian Outback",
]

ART_CHARACTER_VALUES = [
    "Explorer/Adventurer", "Pharaoh/Egyptian Ruler", "Leprechaun", "Dragon",
    "Pirate/Captain", "Viking/Norse Warrior", "Greek/Roman Deity (Zeus, Poseidon, Athena)",
    "Norse Deity (Thor, Odin, Loki, Freya)", "Wizard/Sorcerer",
    "Wild Animals (lion, wolf, eagle, bear, moose, raccoon)", "Domestic Animals (cat, dog, horse, pig)",
    "Sea Creatures (fish, octopus, shark)", "Mythical Creature (phoenix, unicorn, griffin)",
    "King/Queen/Royalty", "Fairy/Elf/Pixie", "Cowboy/Sheriff", "Vampire/Werewolf",
    "Monster/Demon", "Robot/Alien", "Ninja/Samurai", "Knight/Crusader",
    "Monkey/Ape", "Panda/Bear", "Bird (peacock, parrot, owl)", "Bull/Buffalo",
    "Dinosaur/Prehistoric Beast", "Superhero/Heroine",
    "Cartoon/Mascot Character", "Celebrity/Licensed Character",
    "No Characters (symbol-only game)",
]

ART_ELEMENT_VALUES = [
    "Gems/Jewels/Crystals", "Gold Coins/Treasure", "Fruits (cherry, lemon, watermelon)",
    "Fire/Flames/Lava", "Lightning/Thunder/Electricity", "Water/Waves/Rain",
    "Ancient Artifacts (amulets, masks, relics)", "Weapons/Armor (swords, shields)",
    "Magic/Spells (wands, potions, orbs)", "Books/Scrolls/Maps",
    "Playing Card Values (A, K, Q, J, 10)", "Sevens/Bars/Bells (classic)",
    "Stars/Sparkles/Cosmic", "Nature/Flowers/Trees", "Food/Candy/Drinks",
    "Musical Instruments", "Money/Cash/Bills", "Lucky Charms (horseshoe, clover, coin)",
    "Religious/Spiritual Symbols", "Animals (as reel elements, not characters)",
    "Vehicles (ships, planes, cars)", "Sports Equipment (balls, trophies)",
    "Tools/Construction", "Dice/Cards/Casino Items",
    "Fishing/Tackle/Bait (rods, hooks, nets)",
]

ART_MOOD_VALUES = [
    "Dark/Mysterious", "Bright/Fun/Cheerful", "Luxurious/Elegant/Premium",
    "Cartoon/Playful/Fun", "Epic/Grand/Heroic", "Serene/Calm/Peaceful",
    "Intense/Action/Thrilling", "Spooky/Horror/Creepy", "Retro/Nostalgic/Classic",
    "Romantic/Dreamy", "Adventurous/Exciting", "Mystical/Magical/Ethereal",
    "Festive/Holiday/Celebratory",
]

ART_NARRATIVE_VALUES = [
    "Treasure Hunt/Gold Rush", "Quest/Adventure/Journey", "Battle/Combat/War",
    "Discovery/Exploration", "Magic Show/Sorcery", "Heist/Robbery/Escape",
    "Rescue Mission", "Competition/Tournament/Race", "Celebration/Festival/Party",
    "Collection/Harvest/Gathering", "Survival/Horror", "Love Story/Romance",
    "Fairy Tale/Storybook", "Wealth/Fortune/Prosperity",
    "Fishing/Angling", "Music/Performance/Concert", "Crime/Mystery/Detective",
    "Branded/Licensed Story (TV, movie, celebrity)",
    "Cultural/Mythological Story",
    "No Narrative (classic/abstract)",
]

ART_STYLE_VALUES = [
    "Realistic 3D", "Stylized 2.5D", "Cartoon/Illustrated",
    "Minimalist/Classic", "Pixel/Retro", "Painterly/Hand-drawn",
    "Anime/Manga", "Photographic/Cinematic",
]

ART_COLOR_TONE_VALUES = [
    "Warm (golds, reds, ambers)", "Cool (blues, purples, silvers)",
    "Dark (blacks, deep tones, shadows)", "Bright/Vibrant (saturated, neon)",
    "Earthy (greens, browns, natural)", "Pastel/Soft (muted, gentle)",
    "Metallic/Jewel Tones (rich, shimmering)",
]


# ─── Art Few-Shot Training Games ─────────────────────────────────
# These are used as few-shot examples in the art prompt.
# They are excluded from the --test-art eval loop to avoid data leakage.
ART_TRAINING_GAMES = [
    "Double Diamond",             # Classic/abstract — no chars, no narrative
    "Cleopatra",                  # Egyptian — ancient temple, pharaoh
    "Captain Riches",             # Pirate — ship, treasure hunt
    "Diamond Cash Mighty Viking", # Norse — viking realm, epic mood
    "Irish Eyes 2",               # Irish/Celtic — leprechaun, wealth
    "Big Catch Bass Fishing",     # Fishing — lakeside, fishing narrative
    "Jimi Hendrix",               # Music — celebrity, concert narrative
    "Christmas Cash Pots",        # Holiday — festive setting + mood
]


def load_art_training_examples():
    """Load few-shot art training examples from GT file."""
    if not ART_GT_PATH.exists():
        return []

    with open(ART_GT_PATH) as f:
        art_gt = json.load(f)

    examples = []
    for name in ART_TRAINING_GAMES:
        if name not in art_gt:
            continue
        gt_data = art_gt[name]
        examples.append({
            "name": name,
            "expected": gt_data,
        })
    return examples


def build_art_system_prompt():
    themes_str = "\n".join(f"  - {v}" for v in ART_THEME_VALUES)
    characters_str = "\n".join(f"  - {v}" for v in ART_CHARACTER_VALUES)
    elements_str = "\n".join(f"  - {v}" for v in ART_ELEMENT_VALUES)
    moods_str = "\n".join(f"  - {v}" for v in ART_MOOD_VALUES)
    narratives_str = "\n".join(f"  - {v}" for v in ART_NARRATIVE_VALUES)
    styles_str = "\n".join(f"  - {v}" for v in ART_STYLE_VALUES)
    colors_str = "\n".join(f"  - {v}" for v in ART_COLOR_TONE_VALUES)

    return f"""You are a slot game design analyst. You characterize the visual and thematic design of slot games for game designers who are deciding what their next game should look like.

You will receive a game's name, description, symbol list, themes, and (when available) the HTML rules text. From this, infer the game's art/design attributes.

## YOUR TASK
Classify each game across 7 design dimensions. Use ONLY values from the controlled vocabulary lists below. Be specific and evidence-based — only classify what you can actually infer from the provided text.

## DIMENSION 1: THEME — Where does this game take place?
Pick the single best match. Be SPECIFIC — never leave a game unclassified. Key distinctions:
- Traditional 7s, bars, bells slots → "Classic Slots" (the industry standard term)
- Fruit-themed reels (cherry, lemon, watermelon focus) → "Fruit Machine"
- Premium/glamour/diamonds/VIP → "Luxury/VIP"
- Casino/gambling themed (dice, poker, roulette) → "Casino Floor"
- African savanna, safari, wildlife → "Savanna/Wildlife"
- North American wildlife on prairies/plains (buffalo, moose, elk) → "Prairie/Plains/Grassland"
- Australian animals, outback → "Australian Outback"
- Viking/Norse games → "Norse/Viking Realm", NOT "Arctic/Snow"
- Irish/Celtic/Leprechaun games → "Irish/Celtic Highlands", NOT "Fantasy/Fairy Tale"
- Christmas/Easter/Holiday games → "Festive/Holiday"
- Arabian Nights, Aladdin, genie, lamp games → "Arabian Palace/Bazaar"
- Dinosaur/Caveman games → "Prehistoric/Primordial"
- Fishing games (Big Bass, etc.) → "Lakeside/River/Fishing Dock"
- Alien/creature games in labs or reactors (Reactoonz, etc.) → "Laboratory/Workshop", NOT "Outer Space" (use "Outer Space" only for actual space/starfield/galaxy settings)
- NEVER use "Generic/Abstract" — every slot has a recognizable setting/style category
{themes_str}

## DIMENSION 2: CHARACTERS — Who/what is the protagonist or featured character?
Pick ALL that apply (often 1-3). Characters are beings that appear as symbols or are referenced in the game narrative.
IMPORTANT deity distinction:
- Zeus, Poseidon, Athena, Hercules, Medusa = "Greek/Roman Deity (Zeus, Poseidon, Athena)"
- Thor, Odin, Loki, Freya, Heimdall = "Norse Deity (Thor, Odin, Loki, Freya)"
- NEVER mix these — a Norse game must NOT have Greek deity and vice versa.
{characters_str}

## DIMENSION 3: VISUAL ELEMENTS — What key objects/props define the reel icons?
Pick ALL that apply (typically 2-5). These are the distinctive visual objects players see on the reels.
STRICT RULE: Only include an element if it is EXPLICITLY mentioned in the description, symbols list, or HTML rules. Do NOT infer elements that aren't directly referenced. For example:
- Do NOT add "Vehicles" unless the game description explicitly mentions ships, cars, planes, boats as reel symbols. A fishing game does not have vehicles just because fishing could involve boats.
- Do NOT add "Weapons/Armor" unless swords, shields, etc. are explicitly named as symbols.
- Do NOT add elements based on your general knowledge of a game — only what is stated in the provided text.
- When in doubt, leave it out. Precision > recall for elements.
{elements_str}

## DIMENSION 4: MOOD — What should the player FEEL?
Pick the single best match. Key distinctions:
- "Adventurous/Exciting" = active danger, exploration, quests, action. Indiana Jones energy.
- "Serene/Calm/Peaceful" = relaxing, laid-back, nature-watching, fishing, gentle. No urgency.
- "Epic/Grand/Heroic" = gods, warriors, battles, mythic scale. Power fantasy.
- "Luxurious/Elegant/Premium" = wealth, sophistication, VIP, gold, jewels. Aspirational.
- "Dark/Mysterious" = secrets, shadows, ancient curses, suspense. NOT the same as dark colors.
- "Bright/Fun/Cheerful" = light-hearted, colorful, simple fun. Party energy.
- "Cartoon/Playful/Fun" = silly, goofy, kid-friendly, humorous. Wacky characters.
- Fishing/nature/wildlife games are typically "Serene/Calm/Peaceful", NOT "Adventurous/Exciting".
- A game about treasure with a calm setting (no danger) = "Serene", not "Adventurous".
- Wild West showdown/outlaw games with tension, danger = "Intense/Action/Thrilling" or "Dark/Mysterious", depending on atmosphere.
{moods_str}

## DIMENSION 5: NARRATIVE — What is the story hook?
Pick the single best match:
{narratives_str}

## DIMENSION 6: ART STYLE — What visual rendering style?
Pick the single best match. This is the HARDEST dimension — only classify if you have DIRECT evidence:
- "Cartoon/Illustrated" = described as cartoon, comic, animated, whimsical art, cartoony characters
- "Realistic 3D" = described as 3D rendered, cinematic, lifelike, immersive 3D graphics
- "Stylized 2.5D" = described as semi-3D, layered, isometric, parallax backgrounds
- "Minimalist/Classic" = described as clean, simple, retro, stripped-back, classic design
- "Painterly/Hand-drawn" = described as watercolor, painted, hand-drawn, artistic brushstrokes
- "Pixel/Retro" = described as pixel art, 8-bit, retro arcade style
- "Anime/Manga" = described as anime-style, manga-inspired, Japanese animation art
- "Photographic/Cinematic" = uses real photographs or photo-realistic imagery
DO NOT guess art style from provider name alone. If the description does not mention visual rendering approach, use null. Confidence should be 1-2 unless you have explicit evidence.
{styles_str}

## DIMENSION 7: COLOR TONE — What is the dominant color feel?
Pick the single best match based on THEME and VISUAL DESCRIPTIONS, not mood:
- Egyptian/desert/sand/gold themes → usually "Warm (golds, reds, ambers)" even if mood is dark/mysterious
- Ocean/ice/night sky themes → usually "Cool (blues, purples, silvers)"
- Horror/vampire/dark dungeon → "Dark (blacks, deep tones, shadows)"
- Neon/gems/space with bright colors → "Bright/Vibrant (saturated, neon)"
- Forest/nature/wildlife → "Earthy (greens, browns, natural)"
- Cute/candy/fairy → "Pastel/Soft (muted, gentle)"
- Gold/jewels/treasure/premium → "Metallic/Jewel Tones (rich, shimmering)"
IMPORTANT: Color tone is about VISUAL PALETTE, not emotional mood. A "Dark/Mysterious" mood game can still have warm gold colors (e.g., Egyptian games). If uncertain, use null.
{colors_str}

## CLASSIFICATION RULES
1. Use ONLY values from the lists above. Do not invent new values.
2. For CHARACTERS: pay close attention to the GAME NAME and symbol descriptions — they reveal characters:
   - "Huff N Puff" = Big Bad Wolf fairy tale → "Wild Animals" + "Domestic Animals" for pigs
   - "Dragon" in name → "Dragon"
   - "Rakin Bacon" = pig → "Domestic Animals (cat, dog, horse, pig)"
   - Names like "Buffalo", "Gorilla", "Tiger" → the animal IS the character
   - If symbols mention PIGGY, PIG, WOLF, DRAGON etc., those are characters, not just elements
   - Western outlaw/gunslinger/sheriff games → "Cowboy/Sheriff" (outlaws ARE cowboys in slot context)
   - Norse mythology gods (Thor, Odin, Loki) → "Greek/Roman God" (covers all mythology gods). Valkyries and Norse warriors → "Viking/Norse Warrior", NOT "Fairy/Elf/Pixie"
   - Santa Claus, elves, reindeer in Christmas games → "Cartoon/Mascot Character"
   - Circus performers (clowns, ringmasters, acrobats) → "Cartoon/Mascot Character"
   - "No Characters" means truly NO beings — only objects like gems, fruits, numbers. If the game description mentions ANY named person, outlaw, explorer, performer, Santa, or animal protagonist, do NOT use "No Characters".
   - WILD vs DOMESTIC: "Domestic Animals" = pets and farm animals (cat, dog, horse, pig, chicken). Wildlife like bear, moose, raccoon, cougar, elk, lynx = "Wild Animals". Buffalo/bison → use "Bull/Buffalo".
3. For ELEMENTS: focus on what makes this game VISUALLY DISTINCTIVE. Every slot has reels — list what's ON them.
4. For THEME: choose the most specific match. "Ancient Temple/Ruins" for Egyptian, not "Classic Slots". Use "Classic Slots" ONLY for traditional 7s/bars/bells retro games.
5. For MOOD: consider the overall emotional tone. A game about treasure hunting with bright colors = "Adventurous/Exciting", not "Dark/Mysterious".
6. For NARRATIVE: what is the player's implicit story? Be specific:
   - "Fairy Tale/Storybook" for games based on fairy tales (Three Little Pigs, Goldilocks, Jack and the Beanstalk, etc.)
   - "Wealth/Fortune/Prosperity" for games themed around money, riches, banks, piggy banks, gold pots, fortune
   - "Treasure Hunt/Gold Rush" for active hunting/digging/seeking treasure
   - "Fishing/Angling" for fishing-themed games (Big Bass, Fish Em Up, etc.) — major slot sub-genre
   - "Music/Performance/Concert" for games themed around music, bands, rock, DJs, concerts
   - "Crime/Mystery/Detective" for crime, mafia, gangster, cops, detective games
   - "Branded/Licensed Story (TV, movie, celebrity)" for games based on TV shows, movies, or celebrities
   - "Collection/Harvest/Gathering" ONLY for games where the core story is farming, harvesting crops, or gathering resources — NOT for every game with a collect mechanic
   - "No Narrative (classic/abstract)" ONLY for fruit/classic/generic slots with truly no thematic story. If a game has named characters, an outlaw theme, a heist, a treasure hunt, or ANY story hook, it is NOT "No Narrative".
   - Western games with outlaws, train robberies, showdowns → "Heist/Robbery/Escape" or "Crime/Mystery/Detective"
   - Use specific narratives over vague ones. If the game has a fairy tale character, it's probably "Fairy Tale/Storybook" not "Collection/Harvest/Gathering".
7. For ART STYLE: NEVER guess based on provider name. Only classify if the text EXPLICITLY describes the visual rendering approach (e.g., "cartoon style", "3D graphics", "hand-painted"). If the description only mentions game mechanics without visual style details, use null with confidence 1.
8. For COLOR TONE: base this on the VISUAL THEME and described colors, NOT on the mood. Egyptian games = warm golds even if mood is dark. Ocean games = cool blues even if mood is exciting. If no color information is available, use null.

## CONFIDENCE SCORING
Rate your confidence 1-5 for EACH dimension:
- 5 = Obvious from game name or description (e.g., "Cleopatra" → Ancient Temple/Ruins)
- 4 = Strong evidence in description/symbols/themes
- 3 = Reasonable inference from available context
- 2 = Educated guess with weak evidence
- 1 = No real evidence, speculative
Dimensions with confidence below 3 may be filtered out. Be honest — low confidence is better than a wrong answer.

## OUTPUT FORMAT
Return a JSON object with this exact structure:
{{
  "art_theme": {{"value": "<single value from Theme list>", "confidence": 4}},
  "art_characters": [{{"value": "<character>", "confidence": 5}}, ...],
  "art_elements": [{{"value": "<element>", "confidence": 4}}, ...],
  "art_mood": {{"value": "<single value from Mood list>", "confidence": 3}},
  "art_narrative": {{"value": "<single value from Narrative list>", "confidence": 4}},
  "art_style": {{"value": "<single value from Style list or null>", "confidence": 2}},
  "art_color_tone": {{"value": "<single value from Color Tone list or null>", "confidence": 2}}
}}

Return ONLY valid JSON. No markdown, no commentary."""


def build_art_user_prompt(game_name, description, symbols, themes,
                          clean_html=None, provider=None, examples=None):
    """Build the user prompt for art characterization extraction."""
    parts = []

    if examples:
        parts.append("Here are examples of correct art classifications:\n")
        for ex in examples:
            parts.append(f"─── EXAMPLE: {ex['name']} ───")
            expected_compact = json.dumps(ex['expected'], separators=(',', ':'))
            parts.append(f"CORRECT CLASSIFICATION:\n{expected_compact}")
            parts.append("")

    parts.append(f"─── NOW CLASSIFY: {game_name} ───")

    if provider:
        parts.append(f"Provider: {provider}")

    if themes:
        themes_str = ", ".join(themes) if isinstance(themes, list) else str(themes)
        parts.append(f"Themes: {themes_str}")

    if description:
        parts.append(f"\nDescription:\n{description}")

    if symbols:
        sym_names = []
        for s in symbols:
            if isinstance(s, dict):
                name = s.get('name', '')
                stype = s.get('type', '')
                desc = s.get('description', '')
                sym_names.append(f"  - {name} ({stype}): {desc[:100]}" if desc else f"  - {name} ({stype})")
            elif isinstance(s, str):
                sym_names.append(f"  - {s}")
        if sym_names:
            parts.append(f"\nFunctional Symbols:\n" + "\n".join(sym_names))

    if clean_html:
        parts.append(f"\nHTML Rules (first 3000 chars):\n{clean_html[:3000]}")

    parts.append(f"\nClassify the art/design attributes for {game_name}. Return ONLY the JSON.")
    return "\n".join(parts)


NAME_CHARACTER_HINTS = {
    # Wild animals
    r'\bwolf\b': 'Wild Animals (lion, wolf, eagle, bear, moose, raccoon)',
    r'\bhuff\b.*\bpuff\b': 'Wild Animals (lion, wolf, eagle, bear, moose, raccoon)',
    r'\blion\b': 'Wild Animals (lion, wolf, eagle, bear, moose, raccoon)',
    r'\btiger\b': 'Wild Animals (lion, wolf, eagle, bear, moose, raccoon)',
    r'\beagle\b': 'Wild Animals (lion, wolf, eagle, bear, moose, raccoon)',
    r'\bpanther\b': 'Wild Animals (lion, wolf, eagle, bear, moose, raccoon)',
    r'\bjaguar\b': 'Wild Animals (lion, wolf, eagle, bear, moose, raccoon)',
    r'\bleopard\b': 'Wild Animals (lion, wolf, eagle, bear, moose, raccoon)',
    r'\bcheetah\b': 'Wild Animals (lion, wolf, eagle, bear, moose, raccoon)',
    r'\bcobra\b': 'Wild Animals (lion, wolf, eagle, bear, moose, raccoon)',
    r'\bviper\b': 'Wild Animals (lion, wolf, eagle, bear, moose, raccoon)',
    r'\bcrocodile\b': 'Wild Animals (lion, wolf, eagle, bear, moose, raccoon)',
    r'\bcroc\b': 'Wild Animals (lion, wolf, eagle, bear, moose, raccoon)',
    r'\bfox\b|^fox': 'Wild Animals (lion, wolf, eagle, bear, moose, raccoon)',
    # Domestic animals
    r'\bpig\b': 'Domestic Animals (cat, dog, horse, pig)',
    r'\bpiggy\b': 'Domestic Animals (cat, dog, horse, pig)',
    r'\bpiggies\b': 'Domestic Animals (cat, dog, horse, pig)',
    r'\bbacon\b': 'Domestic Animals (cat, dog, horse, pig)',
    r'\bhog\b': 'Domestic Animals (cat, dog, horse, pig)',
    r'\bboar\b': 'Domestic Animals (cat, dog, horse, pig)',
    r'\bcat\b': 'Domestic Animals (cat, dog, horse, pig)',
    r'\bdog\b': 'Domestic Animals (cat, dog, horse, pig)',
    r'\bhorse\b': 'Domestic Animals (cat, dog, horse, pig)',
    r'\bmustang\b': 'Domestic Animals (cat, dog, horse, pig)',
    r'\bstallion\b': 'Domestic Animals (cat, dog, horse, pig)',
    r'\bbunny\b': 'Domestic Animals (cat, dog, horse, pig)',
    r'\brabbit\b': 'Domestic Animals (cat, dog, horse, pig)',
    # Bull/Buffalo
    r'\bbuffalo\b': 'Bull/Buffalo',
    r'\bbull\b': 'Bull/Buffalo',
    r'\brhino\b': 'Bull/Buffalo',
    # Monkey/Ape
    r'\bgorilla\b': 'Monkey/Ape',
    r'\bmonkey\b': 'Monkey/Ape',
    r'\bkong\b': 'Monkey/Ape',
    r'\bape\b': 'Monkey/Ape',
    # Panda/Bear
    r'\bpanda\b': 'Panda/Bear',
    r'\bbear\b(?!.*\bwild)': 'Panda/Bear',
    # Birds
    r'\bpeacock\b': 'Bird (peacock, parrot, owl)',
    r'\bparrot\b': 'Bird (peacock, parrot, owl)',
    r'\bowl\b': 'Bird (peacock, parrot, owl)',
    r'\bhawk\b': 'Bird (peacock, parrot, owl)',
    r'\bfalcon\b': 'Bird (peacock, parrot, owl)',
    r'\beagle\b': 'Bird (peacock, parrot, owl)',
    r'\bflamingo\b': 'Bird (peacock, parrot, owl)',
    r'\bswan\b': 'Bird (peacock, parrot, owl)',
    r'\bpenguin\b': 'Bird (peacock, parrot, owl)',
    r'\brooster\b': 'Bird (peacock, parrot, owl)',
    r'\bchicken\b': 'Bird (peacock, parrot, owl)',
    r'\bhen\b': 'Bird (peacock, parrot, owl)',
    r'\bgoose\b': 'Bird (peacock, parrot, owl)',
    r'\bduck\b': 'Bird (peacock, parrot, owl)',
    r'\bdove\b': 'Bird (peacock, parrot, owl)',
    r'\braven\b': 'Bird (peacock, parrot, owl)',
    r'\bturkey\b': 'Bird (peacock, parrot, owl)',
    # Sea creatures
    r'\bfish\b': 'Sea Creatures (fish, octopus, shark)',
    r'\bshark\b': 'Sea Creatures (fish, octopus, shark)',
    r'\bdolphin\b': 'Sea Creatures (fish, octopus, shark)',
    r'\bwhale\b': 'Sea Creatures (fish, octopus, shark)',
    r'\boctopus\b': 'Sea Creatures (fish, octopus, shark)',
    r'\bcrab\b': 'Sea Creatures (fish, octopus, shark)',
    r'\blobster\b': 'Sea Creatures (fish, octopus, shark)',
    r'\bmermaid\b': 'Sea Creatures (fish, octopus, shark)',
    r'\bkraken\b': 'Sea Creatures (fish, octopus, shark)',
    r'\bturtle\b': 'Sea Creatures (fish, octopus, shark)',
    r'\btortoise\b': 'Sea Creatures (fish, octopus, shark)',
    # Dragon
    r'\bdragon\b': 'Dragon',
    # Elephants (map to Wild Animals — they're safari animals)
    r'\belephant\b': 'Wild Animals (lion, wolf, eagle, bear, moose, raccoon)',
    # Mythical creatures
    r'\bphoenix\b': 'Mythical Creature (phoenix, unicorn, griffin)',
    r'\bunicorn\b': 'Mythical Creature (phoenix, unicorn, griffin)',
    r'\bgriffin\b': 'Mythical Creature (phoenix, unicorn, griffin)',
    r'\bsphinx\b': 'Mythical Creature (phoenix, unicorn, griffin)',
    r'\bminotaur\b': 'Mythical Creature (phoenix, unicorn, griffin)',
    r'\bcentaur\b': 'Mythical Creature (phoenix, unicorn, griffin)',
    # Human characters
    r'\bpirate\b': 'Pirate/Captain',
    r'\bcaptain\b': 'Pirate/Captain',
    r'\bviking\b': 'Viking/Norse Warrior',
    r'\bvalkyrie\b': 'Viking/Norse Warrior',
    r'\bpharaoh\b': 'Pharaoh/Egyptian Ruler',
    r'\bcleopatra\b': 'Pharaoh/Egyptian Ruler',
    r'\bmummy\b': 'Pharaoh/Egyptian Ruler',
    r'\bleprechaun\b': 'Leprechaun',
    r'\bwizard\b': 'Wizard/Sorcerer',
    r'\bsorcerer\b': 'Wizard/Sorcerer',
    r'\balchemist\b': 'Wizard/Sorcerer',
    r'\bgenie\b': 'Wizard/Sorcerer',
    r'\bdjinn\b': 'Wizard/Sorcerer',
    r'\bshaman\b': 'Wizard/Sorcerer',
    r'\bdruid\b': 'Wizard/Sorcerer',
    r'\bwitch\b': 'Wizard/Sorcerer',
    r'\bcowboy\b': 'Cowboy/Sheriff',
    r'\bsheriff\b': 'Cowboy/Sheriff',
    r'\boutlaw\b': 'Cowboy/Sheriff',
    r'\bbounty\b': 'Cowboy/Sheriff',
    r'\bsamu?rai\b': 'Ninja/Samurai',
    r'\bninja\b': 'Ninja/Samurai',
    r'\bknight\b': 'Knight/Crusader',
    r'\bgladiator\b': 'Knight/Crusader',
    r'\bspartan\b': 'Knight/Crusader',
    r'\bcrusader\b': 'Knight/Crusader',
    r'\bwarrior\b': 'Knight/Crusader',
    r'\bvampire\b': 'Vampire/Werewolf',
    r'\bwerewolf\b': 'Vampire/Werewolf',
    r'\bzombie\b': 'Monster/Demon',
    r'\bdemon\b': 'Monster/Demon',
    r'\bdevil\b': 'Monster/Demon',
    r'\bghost\b': 'Monster/Demon',
    r'\btroll\b': 'Monster/Demon',
    r'\bogre\b': 'Monster/Demon',
    r'\bgoblin\b': 'Monster/Demon',
    r'\bfairy\b': 'Fairy/Elf/Pixie',
    r'\belf\b': 'Fairy/Elf/Pixie',
    r'\bpixie\b': 'Fairy/Elf/Pixie',
    r'\bnymph\b': 'Fairy/Elf/Pixie',
    r'\brobot\b': 'Robot/Alien',
    r'\balien\b': 'Robot/Alien',
    r'\bsanta\b': 'Cartoon/Mascot Character',
    r'\bclown\b': 'Cartoon/Mascot Character',
    r'\bjester\b': 'Cartoon/Mascot Character',
    r'\bjoker\b': 'Cartoon/Mascot Character',
    # Royalty
    r'\bking\b': 'King/Queen/Royalty',
    r'\bqueen\b': 'King/Queen/Royalty',
    r'\bprincess\b': 'King/Queen/Royalty',
    r'\bprince\b(?!.*\btweet)': 'King/Queen/Royalty',
    r'\bemperor\b': 'King/Queen/Royalty',
    r'\bempress\b': 'King/Queen/Royalty',
    r'\bsultan\b': 'King/Queen/Royalty',
    # Gods
    r'\bzeus\b': 'Greek/Roman God',
    r'\bposeidon\b': 'Greek/Roman God',
    r'\bares\b': 'Greek/Roman God',
    r'\bathena\b': 'Greek/Roman God',
    r'\bhercules\b': 'Greek/Roman God',
    r'\bthor\b': 'Greek/Roman God',
    r'\bapollo\b': 'Greek/Roman God',
    r'\bgoddess\b': 'Greek/Roman God',
    r'\bgod\b(?!.*father)': 'Greek/Roman God',
    r'\btitan\b': 'Greek/Roman God',
    # Adventurer
    r'\bhunter\b': 'Explorer/Adventurer',
    r'\bexplorer\b': 'Explorer/Adventurer',
    r'\braider\b': 'Explorer/Adventurer',
    r'\bdetective\b': 'Explorer/Adventurer',
    r'\bcops?\b': 'Cowboy/Sheriff',
    r'\brobbers?\b': 'Explorer/Adventurer',
    r'\bshamrock\b': 'Leprechaun',
    # Dinosaurs
    r'\bdinosaur\b': 'Dinosaur/Prehistoric Beast',
    r'\bdino\b': 'Dinosaur/Prehistoric Beast',
    r'\bjurassic\b': 'Dinosaur/Prehistoric Beast',
    r'\bt[\- ]?rex\b': 'Dinosaur/Prehistoric Beast',
    r'\braptor\b': 'Dinosaur/Prehistoric Beast',
    # Superhero
    r'\bsuperhero\b': 'Superhero/Heroine',
    r'\bsuper\s*man\b': 'Superhero/Heroine',
    r'\bbatman\b': 'Superhero/Heroine',
}

NAME_THEME_HINTS = {
    r'\begypt(?:ian)?\b': 'Ancient Temple/Ruins',
    r'\bpharaoh\b': 'Ancient Temple/Ruins',
    r'\bcleopatra\b': 'Ancient Temple/Ruins',
    r'\bmummy\b': 'Ancient Temple/Ruins',
    r'\bnile\b': 'Ancient Temple/Ruins',
    r'\bpyramid\b': 'Ancient Temple/Ruins',
    r'\baztec\b': 'Ancient Temple/Ruins',
    r'\bmayan?\b': 'Ancient Temple/Ruins',
    r'\bincan?\b': 'Ancient Temple/Ruins',
    r'\bzeus\b': 'Ancient Greece',
    r'\bolympus\b': 'Ancient Greece',
    r'\brome\b': 'Ancient Greece',
    r'\broman\b': 'Ancient Greece',
    r'\bgreek\b': 'Ancient Greece',
    r'\bgladiator\b': 'Ancient Greece',
    r'\bspartan\b': 'Ancient Greece',
    r'\bcaesar\b': 'Ancient Greece',
    r'\bviking\b': 'Norse/Viking Realm',
    r'\bnorse\b': 'Norse/Viking Realm',
    r'\bvalhallan?\b': 'Norse/Viking Realm',
    r'\bodin\b': 'Norse/Viking Realm',
    r'\bthor\b(?!.*ough)': 'Norse/Viking Realm',
    r'\brasgar?d\b': 'Norse/Viking Realm',
    r'\barctic\b': 'Arctic/Snow',
    r'\bjungle\b': 'Jungle/Rainforest',
    r'\bsafari\b': 'Jungle/Rainforest',
    r'\bamazon\b': 'Jungle/Rainforest',
    r'\bafrica\b': 'Jungle/Rainforest',
    r'\brainforest\b': 'Jungle/Rainforest',
    r'\bocean\b': 'Deep Ocean/Underwater',
    r'\bunderwater\b': 'Deep Ocean/Underwater',
    r'\bsea\b(?!.*son)': 'Deep Ocean/Underwater',
    r'\breef\b': 'Deep Ocean/Underwater',
    r'\bspace\b': 'Outer Space',
    r'\bcosmic\b': 'Outer Space',
    r'\bgalaxy\b': 'Outer Space',
    r'\bstellar\b': 'Outer Space',
    r'\bpirate\b': 'Pirate Ship/Port',
    r'\bcandy\b': 'Candy/Sweet World',
    r'\bsweet\b': 'Candy/Sweet World',
    r'\bsugar\b': 'Candy/Sweet World',
    r'\bhaunted\b': 'Haunted Manor/Graveyard',
    r'\bhalloween\b': 'Haunted Manor/Graveyard',
    r'\bspooky\b': 'Haunted Manor/Graveyard',
    r'\bcowboy\b': 'Wild West/Frontier',
    r'\bwestern\b': 'Wild West/Frontier',
    r'\bfrontier\b': 'Wild West/Frontier',
    r'\bsaloon\b': 'Wild West/Frontier',
    r'\bvegas\b': 'Neon/Cyber City',
    r'\bchina\b': 'Asian Temple/Garden',
    r'\bjapan(?:ese)?\b': 'Asian Temple/Garden',
    r'\bindia\b': 'Asian Temple/Garden',
    r'\bchristmas\b': 'Festive/Holiday',
    r'\bxmas\b': 'Festive/Holiday',
    r'\beaster\b': 'Festive/Holiday',
    r'\bvalentine\b': 'Festive/Holiday',
    r'\bholiday\b': 'Festive/Holiday',
    r'\bhawaii\b': 'Tropical Island/Beach',
    r'\btropical\b': 'Tropical Island/Beach',
    r'\bisland\b': 'Tropical Island/Beach',
    r'\bbeach\b': 'Tropical Island/Beach',
    r'\bdesert\b': 'Desert/Sahara',
    r'\bsahara\b': 'Desert/Sahara',
    r'\barabia\b': 'Desert/Sahara',
    r'\bpersia\b': 'Desert/Sahara',
    r'\bbabylon\b': 'Desert/Sahara',
    r'\bireland\b': 'Irish/Celtic Highlands',
    r'\birish\b': 'Irish/Celtic Highlands',
    r'\bceltic\b': 'Irish/Celtic Highlands',
    r'\bleprechaun\b': 'Irish/Celtic Highlands',
    r'\bshamrock\b': 'Irish/Celtic Highlands',
    r'\bvolcano\b': 'Mountain/Volcano',
    r'\berupt': 'Mountain/Volcano',
    r'\bmedieval\b': 'Medieval Castle',
    r'\bcastle\b': 'Medieval Castle',
    r'\bcircus\b': 'Circus/Carnival',
    r'\bcarnival\b': 'Circus/Carnival',
    r'\bbandit\b': 'Wild West/Frontier',
    r'\bdinosaur\b': 'Prehistoric/Primordial',
    r'\bdino\b': 'Prehistoric/Primordial',
    r'\bjurassic\b': 'Prehistoric/Primordial',
    r'\bstone\s*age\b': 'Prehistoric/Primordial',
    r'\bcaveman\b': 'Prehistoric/Primordial',
    r'\bsteampunk\b': 'Steampunk/Victorian',
    r'\bvictorian\b': 'Steampunk/Victorian',
    r'\bfishing\b': 'Lakeside/River/Fishing Dock',
    r'\bangl(?:er|ing)\b': 'Lakeside/River/Fishing Dock',
    r'\bbass\b': 'Lakeside/River/Fishing Dock',
    r'chili|salsa|taco|fiesta|mexican|mariachi|sombrero|pinata': 'Mexican/Latin Village',
    r'beach|coast|shore|surfing|surf\b': 'Coastal/Beach/Shore',
}

STRONG_NARRATIVE_HINTS = {
    r'\bhuff\b.*\bpuff\b': 'Fairy Tale/Storybook',
    r'\bgoldilocks\b': 'Fairy Tale/Storybook',
    r'\bbeanstalk\b': 'Fairy Tale/Storybook',
    r'\bred\s*riding\b': 'Fairy Tale/Storybook',
    r'\brapunzel\b': 'Fairy Tale/Storybook',
    r'\bhansel\b': 'Fairy Tale/Storybook',
    r'\bgretel\b': 'Fairy Tale/Storybook',
    r'\bcinderella\b': 'Fairy Tale/Storybook',
    r'\bbeauty.*beast\b': 'Fairy Tale/Storybook',
    r'\bfrog\s*prince\b': 'Fairy Tale/Storybook',
    r'\bwolf\s*it\s*up\b': 'Fairy Tale/Storybook',
    r'\bwonderland\b': 'Fairy Tale/Storybook',
    r'\baladdin\b': 'Fairy Tale/Storybook',
    r'\bpinocchio\b': 'Fairy Tale/Storybook',
    r'\blittle pig': 'Fairy Tale/Storybook',
    r'\brobin\s*hood': 'Fairy Tale/Storybook',
    r'\bfairytale\b': 'Fairy Tale/Storybook',
}

WEAK_NARRATIVE_HINTS = {
    r'\b(fishing|angl(?:er|ing)|bass\b.*\bbonanza)': 'Fishing/Angling',
    r'\b(piggy|bank|cash|fortunes?|riches)\b': 'Wealth/Fortune/Prosperity',
    r'\b(money|dollar|bucks|wealth)\b': 'Wealth/Fortune/Prosperity',
    r'\bheist\b': 'Heist/Robbery/Escape',
    r'\brobbery\b': 'Heist/Robbery/Escape',
    r'\bescape\b': 'Heist/Robbery/Escape',
    r'\bbattle\b': 'Battle/Combat/War',
    r'\bwar\b': 'Battle/Combat/War',
    r'\bcombat\b': 'Battle/Combat/War',
    r'\bparty\b': 'Celebration/Festival/Party',
    r'\bfestival\b': 'Celebration/Festival/Party',
    r'\bfiesta\b': 'Celebration/Festival/Party',
    r'\b(rock|band|concert|guitar|dj)\b': 'Music/Performance/Concert',
    r'\b(detective|murder|crime|mafia|gangster|cops)\b': 'Crime/Mystery/Detective',
}

NAME_ELEMENT_HINTS = {
    r'\b(piggy|bank|cash|money|dollar|bucks|fortune|riches|wealth)\b': 'Money/Cash/Bills',
    r'\b(gem|jewel|crystal|diamond|ruby|emerald|sapphire)\b': 'Gems/Jewels/Crystals',
    r'\b(gold|treasure|coin)\b': 'Gold Coins/Treasure',
    r'\b(fire|flame|blaze|blazing|burn|lava|inferno)\b': 'Fire/Flames/Lava',
    r'\b(fruit|cherry|lemon|melon|berry|banana|orange)\b': 'Fruits (cherry, lemon, watermelon)',
    r'\b(star|cosmic|stellar|nova)\b': 'Stars/Sparkles/Cosmic',
    r'\b(7s|seven|classic)\b': 'Sevens/Bars/Bells (classic)',
    r'\b(fishing|angl(?:er|ing)|bass|tackle|bait)\b': 'Fishing/Tackle/Bait (rods, hooks, nets)',
    r'\b(guitar|drum|violin|piano|trumpet)\b': 'Musical Instruments',
}

HTML_CHARACTER_PATTERNS = {
    r'\bwolf\b': 'Wild Animals (lion, wolf, eagle, bear, moose, raccoon)',
    r'\bpig(?:gy)?\d?\b': 'Domestic Animals (cat, dog, horse, pig)',
    r'\bdragon\b': 'Dragon',
    r'\bpirate\b': 'Pirate/Captain',
    r'\bleprechaun\b': 'Leprechaun',
    r'\bgorilla\b': 'Monkey/Ape',
    r'\bbuffalo\b': 'Bull/Buffalo',
    r'\bmonk(?:ey)?\b': 'Monkey/Ape',
    r'\blion\b': 'Wild Animals (lion, wolf, eagle, bear, moose, raccoon)',
    r'\btiger\b': 'Wild Animals (lion, wolf, eagle, bear, moose, raccoon)',
    r'\beagle\b': 'Wild Animals (lion, wolf, eagle, bear, moose, raccoon)',
    r'\belephant\b': 'Wild Animals (lion, wolf, eagle, bear, moose, raccoon)',
    r'\bpanther\b': 'Wild Animals (lion, wolf, eagle, bear, moose, raccoon)',
    r'\bshark\b': 'Sea Creatures (fish, octopus, shark)',
    r'\bdolphin\b': 'Sea Creatures (fish, octopus, shark)',
    r'\bwhale\b': 'Sea Creatures (fish, octopus, shark)',
    r'\boctopus\b': 'Sea Creatures (fish, octopus, shark)',
    r'\bpharaoh\b': 'Pharaoh/Egyptian Ruler',
    r'\bcleopatra\b': 'Pharaoh/Egyptian Ruler',
    r'\bviking\b': 'Viking/Norse Warrior',
    r'\bknight\b': 'Knight/Crusader',
    r'\bprincess\b': 'King/Queen/Royalty',
    r'\bprince\b': 'King/Queen/Royalty',
    r'\bqueen\b': 'King/Queen/Royalty',
    r'\bking\b(?!.*\bcard)': 'King/Queen/Royalty',
    r'\bwitch\b': 'Wizard/Sorcerer',
    r'\bwizard\b': 'Wizard/Sorcerer',
    r'\bgenie\b': 'Wizard/Sorcerer',
    r'\bvampire\b': 'Vampire/Werewolf',
    r'\bfairy\b': 'Fairy/Elf/Pixie',
    r'\bmedusa\b': 'Mythical Creature (phoenix, unicorn, griffin)',
    r'\bpegasus\b': 'Mythical Creature (phoenix, unicorn, griffin)',
    r'\bminotaur\b': 'Mythical Creature (phoenix, unicorn, griffin)',
    r'\bphoenix\b': 'Mythical Creature (phoenix, unicorn, griffin)',
    r'\bcerberus\b': 'Mythical Creature (phoenix, unicorn, griffin)',
    r'\bcharon\b': 'Greek/Roman God',
    r'\bhades\b': 'Greek/Roman God',
    r'\bposeidon\b': 'Greek/Roman God',
    r'\bzeus\b': 'Greek/Roman God',
    r'\bfisherman\b': 'Explorer/Adventurer',
    r'\bhunter\b': 'Explorer/Adventurer',
    r'\bcat\b': 'Domestic Animals (cat, dog, horse, pig)',
}


def _unwrap_confidence(raw):
    """Extract value and confidence from new format {"value": ..., "confidence": N}
    or fall back to old format (plain string/list)."""
    if isinstance(raw, dict) and 'value' in raw:
        return raw['value'], raw.get('confidence', 3)
    return raw, 5  # legacy format — assume high confidence


def _unwrap_list_confidence(raw):
    """Extract values and confidences from new list format
    [{"value": ..., "confidence": N}, ...] or old format ["val1", ...]."""
    if not raw or not isinstance(raw, list):
        return [], []
    values = []
    confidences = []
    for item in raw:
        if isinstance(item, dict) and 'value' in item:
            values.append(item['value'])
            confidences.append(item.get('confidence', 3))
        elif isinstance(item, str):
            values.append(item)
            confidences.append(5)  # legacy
    return values, confidences


# Curated aliases for values the LLM commonly returns that don't exactly match vocabulary
ART_THEME_ALIASES = {
    "egyptian temple": "Ancient Temple/Ruins",
    "ancient egypt": "Ancient Temple/Ruins",
    "underwater": "Deep Ocean/Underwater",
    "ocean": "Deep Ocean/Underwater",
    "forest": "Fantasy/Fairy Tale",
    "jungle": "Jungle/Rainforest",
    "space": "Outer Space",
    "cyberpunk": "Neon/Cyber City",
    "castle": "Medieval Castle",
    "beach": "Tropical Island/Beach",
    "island": "Tropical Island/Beach",
    "snow": "Arctic/Snow",
    "arctic": "Arctic/Snow",
    "desert": "Desert/Sahara",
    "haunted": "Haunted Manor/Graveyard",
    "candy": "Candy/Sweet World",
    "circus": "Circus/Carnival",
    "city": "Urban/Modern City",
    "mountain": "Mountain/Volcano",
    "volcano": "Mountain/Volcano",
    "farm": "Farm/Countryside",
    "palace": "Royal Palace/Court",
    "pirate": "Pirate Ship/Port",
    "cave": "Treasure Cave/Mine",
    "mine": "Treasure Cave/Mine",
    "magic": "Magic/Fantasy",
    "asian": "Asian Temple/Garden",
    "arena": "Ancient Greece",
    "sky": "Sky/Clouds",
    "lab": "Laboratory/Workshop",
    "tavern": "Tavern/Saloon",
    "saloon": "Tavern/Saloon",
    "viking": "Norse/Viking Realm",
    "norse": "Norse/Viking Realm",
    "irish": "Irish/Celtic Highlands",
    "celtic": "Irish/Celtic Highlands",
    "holiday": "Festive/Holiday",
    "christmas": "Festive/Holiday",
    "prehistoric": "Prehistoric/Primordial",
    "steampunk": "Steampunk/Victorian",
    "fishing": "Lakeside/River/Fishing Dock",
    "classic": "Classic Slots",
    "fruit": "Fruit Machine",
    "luxury": "Luxury/VIP",
    "vip": "Luxury/VIP",
    "casino": "Casino Floor",
    "savanna": "Savanna/Wildlife",
    "safari": "Savanna/Wildlife",
    "prairie": "Prairie/Plains/Grassland",
    "plains": "Prairie/Plains/Grassland",
    "grassland": "Prairie/Plains/Grassland",
    "outback": "Australian Outback",
}

ART_CHARACTER_ALIASES = {
    "greek/roman god": "Greek/Roman Deity (Zeus, Poseidon, Athena)",
    "greek god": "Greek/Roman Deity (Zeus, Poseidon, Athena)",
    "roman god": "Greek/Roman Deity (Zeus, Poseidon, Athena)",
    "norse god": "Norse Deity (Thor, Odin, Loki, Freya)",
    "norse deity": "Norse Deity (Thor, Odin, Loki, Freya)",
}

ART_ELEMENT_ALIASES = {
    "ancient artifacts (scrolls, amulets, masks)": "Ancient Artifacts (amulets, masks, relics)",
}


def post_process_art(art_result, game_name="", clean_html="", description="", symbols=None, themes=None):
    """Normalize art extraction results to controlled vocabulary, then apply
    deterministic name-based and HTML-based rules to catch what Claude misses."""
    if not art_result or not isinstance(art_result, dict):
        return art_result

    theme_lower = {v.lower(): v for v in ART_THEME_VALUES}
    character_lower = {v.lower(): v for v in ART_CHARACTER_VALUES}
    element_lower = {v.lower(): v for v in ART_ELEMENT_VALUES}
    mood_lower = {v.lower(): v for v in ART_MOOD_VALUES}
    narrative_lower = {v.lower(): v for v in ART_NARRATIVE_VALUES}
    style_lower = {v.lower(): v for v in ART_STYLE_VALUES}
    color_lower = {v.lower(): v for v in ART_COLOR_TONE_VALUES}

    # Unwrap confidence-aware format
    theme_raw, theme_conf = _unwrap_confidence(art_result.get('art_theme'))
    chars_raw, chars_conf = _unwrap_list_confidence(art_result.get('art_characters'))
    elems_raw, elems_conf = _unwrap_list_confidence(art_result.get('art_elements'))
    mood_raw, mood_conf = _unwrap_confidence(art_result.get('art_mood'))
    narrative_raw, narrative_conf = _unwrap_confidence(art_result.get('art_narrative'))
    style_raw, style_conf = _unwrap_confidence(art_result.get('art_style'))
    color_raw, color_conf = _unwrap_confidence(art_result.get('art_color_tone'))

    def normalize_single(val, lookup, alias_map=None, fallback=None):
        """Match value to vocabulary using exact match, then curated aliases.
        No fuzzy substring matching — prevents false matches."""
        if not val or not isinstance(val, str):
            return fallback
        exact = lookup.get(val.lower())
        if exact:
            return exact
        if alias_map:
            alias = alias_map.get(val.lower())
            if alias:
                return alias
        return fallback

    def normalize_list(vals, lookup, alias_map=None):
        if not vals or not isinstance(vals, list):
            return []
        result = []
        seen = set()
        for v in vals:
            if not isinstance(v, str):
                continue
            canonical = normalize_single(v, lookup, alias_map=alias_map)
            if canonical and canonical not in seen:
                seen.add(canonical)
                result.append(canonical)
        return result

    # Normalize with confidence-aware defaults:
    # Only use fallback default if confidence >= 3
    theme_fallback = "Classic Slots" if theme_conf >= 3 else None
    mood_fallback = "Bright/Fun/Cheerful" if mood_conf >= 3 else None
    narrative_fallback = "No Narrative (classic/abstract)" if narrative_conf >= 3 else None

    art_result['art_theme'] = normalize_single(
        theme_raw, theme_lower, ART_THEME_ALIASES, theme_fallback)
    art_result['art_characters'] = normalize_list(chars_raw, character_lower, ART_CHARACTER_ALIASES)
    art_result['art_elements'] = normalize_list(elems_raw, element_lower, ART_ELEMENT_ALIASES)
    art_result['art_mood'] = normalize_single(mood_raw, mood_lower, fallback=mood_fallback)
    art_result['art_narrative'] = normalize_single(
        narrative_raw, narrative_lower, fallback=narrative_fallback)
    art_result['art_style'] = normalize_single(style_raw, style_lower)
    art_result['art_color_tone'] = normalize_single(color_raw, color_lower)

    # Store per-dimension confidence
    art_result['_confidence'] = {
        'theme': theme_conf,
        'characters': chars_conf,
        'elements': elems_conf,
        'mood': mood_conf,
        'narrative': narrative_conf,
        'style': style_conf,
        'color_tone': color_conf,
    }

    # Filter out low-confidence style/color (these are hardest to infer from text)
    if style_conf < 3:
        art_result['art_style'] = None
    if color_conf < 3:
        art_result['art_color_tone'] = None

    # --- Rule 1: Name-based character detection ---
    name_lower = game_name.lower()
    chars = set(art_result['art_characters'])
    for pat, char_val in NAME_CHARACTER_HINTS.items():
        if re.search(pat, name_lower) and char_val not in chars:
            chars.add(char_val)

    # --- Rule 2: HTML-based character detection ---
    html_lower = (clean_html or "").lower()
    if html_lower:
        for pat, char_val in HTML_CHARACTER_PATTERNS.items():
            if re.search(pat, html_lower) and char_val not in chars:
                chars.add(char_val)

    art_result['art_characters'] = list(chars)

    # --- Rule 3: Remove "No Characters" contradiction ---
    no_char = "No Characters (symbol-only game)"
    real_chars = [c for c in art_result['art_characters'] if c != no_char]
    if real_chars:
        art_result['art_characters'] = real_chars

    # --- Rule 4: Name-based theme override ---
    # Strong name evidence overrides weak/generic LLM themes
    overridable_themes = {"Classic Slots", "Laboratory/Workshop", "Outer Space",
                            "Magic/Fantasy", "Urban/Modern City"}
    for pat, theme_val in NAME_THEME_HINTS.items():
        if re.search(pat, name_lower):
            if art_result['art_theme'] in overridable_themes or theme_val == art_result['art_theme']:
                art_result['art_theme'] = theme_val
            break

    # --- Rule 5a: Strong narrative override (fairy tales — always win) ---
    for pat, narrative_val in STRONG_NARRATIVE_HINTS.items():
        if re.search(pat, name_lower):
            art_result['art_narrative'] = narrative_val
            break

    # --- Rule 5b: Weak narrative override (only if current is vague) ---
    weak_narratives = {"No Narrative (classic/abstract)", "Collection/Harvest/Gathering"}
    if art_result['art_narrative'] in weak_narratives:
        for pat, narrative_val in WEAK_NARRATIVE_HINTS.items():
            if re.search(pat, name_lower):
                art_result['art_narrative'] = narrative_val
                break

    # --- Rule 6: Name-based element additions ---
    elems = set(art_result['art_elements'])
    for pat, elem_val in NAME_ELEMENT_HINTS.items():
        if re.search(pat, name_lower) and elem_val not in elems:
            elems.add(elem_val)
    art_result['art_elements'] = list(elems)

    # --- Rule 7: Huff N Puff special case (Three Little Pigs fairy tale) ---
    if re.search(r'\bhuff\b.*\bpuff\b', name_lower):
        wolf = 'Wild Animals (lion, wolf, eagle, bear, moose, raccoon)'
        pig = 'Domestic Animals (cat, dog, horse, pig)'
        if wolf not in art_result['art_characters']:
            art_result['art_characters'].append(wolf)
        if pig not in art_result['art_characters']:
            art_result['art_characters'].append(pig)
        art_result['art_narrative'] = 'Fairy Tale/Storybook'

    # --- Rule 8: Christmas/Holiday theme + mood + narrative override (always wins) ---
    if re.search(r'\b(christmas|xmas|easter|valentine|holiday)\b', name_lower):
        art_result['art_theme'] = 'Festive/Holiday'
        art_result['art_mood'] = 'Festive/Holiday/Celebratory'
        if art_result['art_narrative'] not in ('Branded/Licensed Story (TV, movie, celebrity)',):
            art_result['art_narrative'] = 'Celebration/Festival/Party'

    # --- Rule 9: Fishing theme + narrative + element injection ---
    if re.search(r'\b(fishing|angl(?:er|ing))\b', name_lower) or \
       (re.search(r'\bbass\b', name_lower) and re.search(r'\b(bonanza|splash|catch)\b', name_lower)):
        if art_result['art_theme'] == 'Classic Slots':
            art_result['art_theme'] = 'Lakeside/River/Fishing Dock'
        art_result['art_narrative'] = 'Fishing/Angling'
        fishing_elem = 'Fishing/Tackle/Bait (rods, hooks, nets)'
        if fishing_elem not in art_result.get('art_elements', []):
            art_result.setdefault('art_elements', []).append(fishing_elem)

    # --- Rule 10: Demote Collection/Harvest if no farming evidence in name ---
    if art_result['art_narrative'] == 'Collection/Harvest/Gathering':
        if not re.search(r'\b(harvest|farm|crop|garden|plant|seed|orchard|apple)\b', name_lower):
            art_result['art_narrative'] = 'No Narrative (classic/abstract)'

    # --- Rule 10b: Link & Win / Collect games → Wealth/Fortune narrative ---
    _desc_low = (description or "").lower() if isinstance(description, str) else ""
    if re.search(r'\b(link\s*(?:&|and)\s*win|collect\s*(?:em|\'em)|cash\s*pots?|hold\s*(?:&|and)\s*spin)\b', name_lower + " " + _desc_low):
        if art_result['art_narrative'] in ('Discovery/Exploration', 'No Narrative (classic/abstract)'):
            art_result['art_narrative'] = 'Wealth/Fortune/Prosperity'

    # --- Rule 11: Description + symbol-based character detection ---
    desc_lower = (description or "").lower() if isinstance(description, str) else ""
    sym_names = " ".join(
        (s.get('name', '') if isinstance(s, dict) else str(s))
        for s in (symbols or [])
    ).lower()
    desc_sym_text = desc_lower + " " + sym_names + " " + html_lower
    desc_char_patterns = {
        r'\bgeisha\b': 'King/Queen/Royalty',
        r'\barabian\s*(?:woman|princess|beauty)\b': 'King/Queen/Royalty',
        r'\bprincess\b': 'King/Queen/Royalty',
        r'\bsanta\b': 'Cartoon/Mascot Character',
        r'\bringmaster\b': 'Cartoon/Mascot Character',
        r'\bclown\b': 'Cartoon/Mascot Character',
        r'\bfisherman\b': 'Explorer/Adventurer',
        r'\bsheriff\b': 'Cowboy/Sheriff',
        r'\boutlaw\b': 'Cowboy/Sheriff',
        r'\bmedusa\b': 'Mythical Creature (phoenix, unicorn, griffin)',
        r'\bpegasus\b': 'Mythical Creature (phoenix, unicorn, griffin)',
        r'\bminotaur\b': 'Mythical Creature (phoenix, unicorn, griffin)',
        r'\bphoenix\b': 'Mythical Creature (phoenix, unicorn, griffin)',
        r'\bgriffin\b': 'Mythical Creature (phoenix, unicorn, griffin)',
        r'\bsphinx\b': 'Mythical Creature (phoenix, unicorn, griffin)',
        r'\bunicorn\b': 'Mythical Creature (phoenix, unicorn, griffin)',
        r'\bcerberus\b': 'Mythical Creature (phoenix, unicorn, griffin)',
        r'\bleprechaun\b': 'Leprechaun',
        r'\bmaria\b.*\b(?:dead|muertos|skull|skeleton|graveyard|horror)\b': 'Explorer/Adventurer',
        r'\b(?:day\s*of\s*(?:the\s*)?dead|d[ií]a\s*de\s*(?:los\s*)?muertos)\b': 'Explorer/Adventurer',
        r'\bmaria\s*(?:symbol|wild)\b': 'Explorer/Adventurer',
    }
    for pat, char_val in desc_char_patterns.items():
        if re.search(pat, desc_sym_text) and char_val not in chars:
            chars.add(char_val)
            art_result['art_characters'] = list(chars)
    no_char = "No Characters (symbol-only game)"
    real_chars = [c for c in art_result['art_characters'] if c != no_char]
    if real_chars:
        art_result['art_characters'] = real_chars

    # --- Rule 12: Anti-hallucination — remove characters with NO evidence ---
    all_text = (name_lower + " " + desc_lower + " " +
                " ".join(str(s) for s in (symbols or [])).lower() + " " +
                " ".join(str(t) for t in (themes or [])).lower() + " " +
                html_lower)
    char_evidence = {
        'Domestic Animals (cat, dog, horse, pig)': r'\b(cat|dog|horse|pig|pup|kitten|sheep|chicken|hen|cow|farm\s*animal|pooch|puppy|huff\b.*\bpuff)',
        'Robot/Alien': r'\b(robot|alien|android|cyborg|mech|ufo|space\s*(?:invad|creat)|extraterrestrial)',
        'Leprechaun': r'\b(leprechaun|shamrock|irish|celtic|clover|rainbow\s*riches)',
        'Bird (peacock, parrot, owl)': r'\b(bird|eagle|hawk|parrot|peacock|owl|crane|heron|falcon|raven|robin|pelican|flamingo|duck|rooster|chicken|hen|golden\s*bird)',
        'Wizard/Sorcerer': r'\b(wizard|sorcerer|witch|warlock|mage|alchemist|enchantress|genie|djinn|merlin|blue\s*wizard)',
    }
    filtered_chars = []
    for c in art_result['art_characters']:
        evidence_pat = char_evidence.get(c)
        if evidence_pat and not re.search(evidence_pat, all_text):
            continue
        filtered_chars.append(c)
    if filtered_chars:
        art_result['art_characters'] = filtered_chars

    # --- Rule 12a2: Fix Fairy/Elf misclassification for Day of Dead / human character games ---
    if 'Fairy/Elf/Pixie' in art_result['art_characters']:
        fairy_evidence = r'\b(fairy|fairie|elf|elves|pixie|sprite|nymph|tinker)\b'
        if not re.search(fairy_evidence, all_text):
            art_result['art_characters'] = [
                c for c in art_result['art_characters'] if c != 'Fairy/Elf/Pixie'
            ]

    # --- Rule 12b: Character conflict resolution (like features gateway-vs-pick) ---
    # When name strongly implies an animal character, remove Leprechaun unless
    # "leprechaun" appears literally in name or description
    cur_chars = set(art_result['art_characters'])
    animal_chars = {
        'Wild Animals (lion, wolf, eagle, bear, moose, raccoon)',
        'Domestic Animals (cat, dog, horse, pig)',
        'Panda/Bear', 'Bull/Buffalo', 'Monkey/Ape', 'Dragon',
        'Bird (peacock, parrot, owl)', 'Sea Creatures (fish, octopus, shark)',
    }
    has_animal_from_name = bool(cur_chars & animal_chars) and any(
        re.search(pat, name_lower) for pat in [
            r'\bfox', r'\bwolf', r'\blion', r'\btiger', r'\bbear', r'\bcat\b',
            r'\bdog\b', r'\bhorse', r'\bbull', r'\bbuffalo', r'\bpig', r'\bmonkey',
            r'\bpanda', r'\bdragon', r'\bbird', r'\bfish', r'\beagle', r'\bshark',
        ])
    if has_animal_from_name and 'Leprechaun' in cur_chars:
        if not re.search(r'\bleprechaun\b', name_lower + " " + desc_lower):
            art_result['art_characters'] = [c for c in art_result['art_characters'] if c != 'Leprechaun']

    # --- Rule 12c: Symbol-based character correction ---
    # If symbols mention "hunter" but LLM said Cowboy, override
    sym_text = " ".join(str(s.get('name', '') if isinstance(s, dict) else s) for s in (symbols or [])).lower()
    if re.search(r'\bhunter\b', sym_text) and 'Cowboy/Sheriff' in art_result['art_characters']:
        if not re.search(r'\b(cowboy|sheriff|outlaw|bounty|western\s*(?:outlaw|showdown))\b', name_lower + " " + desc_lower):
            art_result['art_characters'] = [
                'Explorer/Adventurer' if c == 'Cowboy/Sheriff' else c
                for c in art_result['art_characters']
            ]

    # --- Rule 12d: Demote King/Queen/Royalty when only evidence is card symbols ---
    if 'King/Queen/Royalty' in art_result['art_characters']:
        royalty_kw = r'\b(prince|princess|emperor|empress|royal|throne|crown|pharaoh|cleopatra|geisha|monarch)\b'
        has_royalty_in_context = bool(re.search(royalty_kw, all_text))
        has_sym_royalty = any(
            re.search(r'\b(prince|princess|emperor|empress|crown|throne)\b',
                       (s.get('name', '') if isinstance(s, dict) else str(s)).lower())
            for s in (symbols or [])
        )
        if not has_royalty_in_context and not has_sym_royalty:
            art_result['art_characters'] = [
                c for c in art_result['art_characters'] if c != 'King/Queen/Royalty'
            ]
            if not art_result['art_characters']:
                art_result['art_characters'] = ['No Characters (symbol-only game)']

    # --- Rule 13: Mood override from description keywords ---
    mood_playful_keywords = r'\b(comedy|comedic|playful|lighthearted|light-hearted|whimsical|goofy|silly|wacky|humorous|funny|amusing)\b'
    mood_calm_keywords = r'\b(relaxing|laid-?back|peaceful|tranquil|serene|zen|gentle|soothing)\b'
    if re.search(mood_playful_keywords, desc_lower):
        if art_result['art_mood'] in ('Intense/Action/Thrilling', 'Dark/Mysterious', 'Epic/Grand/Heroic'):
            art_result['art_mood'] = 'Cartoon/Playful/Fun'
    if re.search(mood_calm_keywords, desc_lower):
        if art_result['art_mood'] in ('Intense/Action/Thrilling', 'Adventurous/Exciting'):
            art_result['art_mood'] = 'Serene/Calm/Peaceful'

    # --- Rule 14: Theme override from description context ---
    theme_desc_hints = {
        r'\b(diner|restaurant|roadside|truck\s*stop|café|bar\b)': 'Tavern/Saloon',
        r'\bstadium\b': 'Ancient Greece',
        r'\blaboratory\b|\blab\b.*\bscien': 'Laboratory/Workshop',
    }
    for pat, theme_val in theme_desc_hints.items():
        if re.search(pat, desc_lower):
            if art_result['art_theme'] in ('Classic Slots', 'Outer Space', 'Urban/Modern City'):
                art_result['art_theme'] = theme_val

    # --- Rule 15: Mexican/Latin setting + character detection ---
    if re.search(r'\b(chili|salsa|taco|fiesta|mexican|mariachi|sombrero|pinata|burrito)\b', name_lower):
        if art_result['art_theme'] not in ('Mexican/Latin Village',):
            art_result['art_theme'] = 'Mexican/Latin Village'

    # --- Rule 16: Dia de los Muertos ---
    if re.search(r'\b(dia.de|day.of.dead|muertos|sugar.skull|calavera)\b', name_lower + " " + _desc_low):
        art_result['art_theme'] = 'Mexican/Latin Village'
        if art_result['art_narrative'] in ('No Narrative (classic/abstract)',):
            art_result['art_narrative'] = 'Cultural/Mythological Story'

    # --- Rule 17: Rainbow/Shamrock → Leprechaun character ---
    if re.search(r'\b(rainbow|shamrock|pot.of.gold|clover)\b', name_lower) and 'irish' in name_lower.replace("'", ""):
        chars = art_result.get('art_characters', [])
        if 'Leprechaun' not in chars:
            art_result['art_characters'] = [c for c in chars if c != 'No Characters (symbol-only game)'] + ['Leprechaun']

    # --- Rule 18: Mythology narrative when gods are present ---
    god_chars = {'Greek/Roman Deity (Zeus, Poseidon, Athena)', 'Norse Deity (Thor, Odin, Loki, Freya)', 'Pharaoh/Egyptian Ruler'}
    if god_chars & set(art_result.get('art_characters', [])):
        myth_themes = {'Norse/Viking Realm', 'Ancient Greece', 'Ancient Temple/Ruins'}
        if art_result['art_theme'] in myth_themes:
            if art_result['art_narrative'] in ('Quest/Adventure/Journey', 'Battle/Combat/War', 'Discovery/Exploration'):
                art_result['art_narrative'] = 'Cultural/Mythological Story'

    # --- Rule 19: Egyptian temple → remove Greek deity hallucination ---
    greek_deity = 'Greek/Roman Deity (Zeus, Poseidon, Athena)'
    if art_result['art_theme'] == 'Ancient Temple/Ruins':
        if greek_deity in art_result.get('art_characters', []):
            if not re.search(r'\b(greek|roman|zeus|athena|apollo|poseidon|hercules|heracles)\b', name_lower + " " + _desc_low):
                art_result['art_characters'] = [c for c in art_result['art_characters'] if c != greek_deity]
                if not art_result['art_characters']:
                    art_result['art_characters'] = ['Pharaoh/Egyptian Ruler']

    # --- Rule 21: Element disambiguation — Gold Coins/Treasure vs Money/Cash/Bills ---
    gold_elem = "Gold Coins/Treasure"
    money_elem = "Money/Cash/Bills"
    elems = art_result.get('art_elements', [])
    if gold_elem in elems and money_elem in elems:
        modern_themes = {'Casino Floor', 'Urban/Modern City', 'Neon/Cyber City', 'Luxury/VIP'}
        if art_result.get('art_theme') in modern_themes:
            art_result['art_elements'] = [e for e in elems if e != gold_elem]
        elif re.search(r'\b(cash|money|dollar|bill|bank|vault|atm)\b', name_lower):
            art_result['art_elements'] = [e for e in elems if e != gold_elem]
        else:
            art_result['art_elements'] = [e for e in elems if e != money_elem]

    # --- Rule 22: Norse theme → reclassify Greek deity to Norse deity ---
    norse_deity = 'Norse Deity (Thor, Odin, Loki, Freya)'
    norse_themes = {'Norse/Viking Realm'}
    if art_result.get('art_theme') in norse_themes:
        if greek_deity in art_result.get('art_characters', []):
            art_result['art_characters'] = [
                norse_deity if c == greek_deity else c
                for c in art_result['art_characters']
            ]
        norse_kw = r'\b(thor|odin|loki|freya|freyja|heimdall|tyr|baldur|fenrir|mjolnir|valhalla|ragnarok|asgard)\b'
        if re.search(norse_kw, name_lower + " " + _desc_low):
            if norse_deity not in art_result['art_characters']:
                art_result['art_characters'] = [
                    c for c in art_result['art_characters']
                    if c != 'No Characters (symbol-only game)'
                ] + [norse_deity]

    # --- Rule 23: Greek/Roman theme → ensure correct deity type ---
    greek_themes = {'Ancient Greece'}
    if art_result.get('art_theme') in greek_themes:
        if norse_deity in art_result.get('art_characters', []):
            art_result['art_characters'] = [
                greek_deity if c == norse_deity else c
                for c in art_result['art_characters']
            ]
        greek_kw = r'\b(zeus|athena|poseidon|hades|apollo|ares|hermes|aphrodite|hercules|heracles|medusa|olympus|titan)\b'
        if re.search(greek_kw, name_lower + " " + _desc_low):
            if greek_deity not in art_result['art_characters']:
                art_result['art_characters'] = [
                    c for c in art_result['art_characters']
                    if c != 'No Characters (symbol-only game)'
                ] + [greek_deity]

    # --- Rule 24: Cross-dimensional validation ---
    xd_chars = set(art_result.get('art_characters', []))
    xd_theme = art_result.get('art_theme', '')
    if xd_theme in norse_themes and greek_deity in xd_chars:
        xd_chars.discard(greek_deity)
        xd_chars.add(norse_deity)
    if xd_theme in greek_themes and norse_deity in xd_chars:
        xd_chars.discard(norse_deity)
        xd_chars.add(greek_deity)
    egyptian_themes = {'Ancient Temple/Ruins', 'Desert/Sahara'}
    if xd_theme in egyptian_themes:
        xd_chars.discard('Viking/Norse Warrior')
        xd_chars.discard(norse_deity)
    if xd_theme in norse_themes:
        xd_chars.discard('Pharaoh/Egyptian Ruler')
    art_result['art_characters'] = list(xd_chars) if xd_chars else art_result['art_characters']

    # --- Rule 25: Fix "No Narrative" for non-classic themes ---
    classic_themes = {'Classic Slots', 'Fruit Machine', 'Casino Floor', 'Luxury/VIP'}
    if art_result.get('art_narrative') == 'No Narrative (classic/abstract)':
        if art_result.get('art_theme') not in classic_themes:
            theme = art_result.get('art_theme', '')
            narrative_infer = {
                'Farm/Countryside': 'Collection/Harvest/Gathering',
                'Mountain/Volcano': 'Discovery/Exploration',
                'Circus/Carnival': 'Celebration/Festival/Party',
                'Festive/Holiday': 'Celebration/Festival/Party',
                'Pirate Ship/Port': 'Treasure Hunt/Gold Rush',
                'Treasure Cave/Mine': 'Treasure Hunt/Gold Rush',
                'Norse/Viking Realm': 'Cultural/Mythological Story',
                'Ancient Greece': 'Cultural/Mythological Story',
                'Ancient Temple/Ruins': 'Cultural/Mythological Story',
                'Irish/Celtic Highlands': 'Treasure Hunt/Gold Rush',
                'Lakeside/River/Fishing Dock': 'Fishing/Angling',
                'Haunted Manor/Graveyard': 'Survival/Horror',
                'Medieval Castle': 'Battle/Combat/War',
                'Jungle/Rainforest': 'Discovery/Exploration',
                'Deep Ocean/Underwater': 'Discovery/Exploration',
                'Outer Space': 'Discovery/Exploration',
                'Mexican/Latin Village': 'Cultural/Mythological Story',
                'Prehistoric/Primordial': 'Discovery/Exploration',
                'Asian Temple/Garden': 'Cultural/Mythological Story',
                'Royal Palace/Court': 'Wealth/Fortune/Prosperity',
                'Desert/Sahara': 'Discovery/Exploration',
                'Savanna/Wildlife': 'Discovery/Exploration',
                'Prairie/Plains/Grassland': 'Discovery/Exploration',
                'Australian Outback': 'Discovery/Exploration',
                'Steampunk/Victorian': 'Discovery/Exploration',
            }
            inferred = narrative_infer.get(theme)
            if inferred:
                art_result['art_narrative'] = inferred

    # --- Rule 26: Cap elements at 5 per game ---
    if len(art_result.get('art_elements', [])) > 5:
        art_result['art_elements'] = art_result['art_elements'][:5]

    # --- Rule 27: Description/name-based theme correction ---
    theme = art_result.get('art_theme', '')
    name_lower = game_name.lower()
    desc_lower = description.lower() if description else ''
    combined_lower = name_lower + ' ' + desc_lower

    theme_overrides = {
        'arabian': 'Arabian Palace/Bazaar',
        '1001 night': 'Arabian Palace/Bazaar',
        'aladdin': 'Arabian Palace/Bazaar',
        'genie': 'Arabian Palace/Bazaar',
        'safari': 'Savanna/Wildlife',
        'african savanna': 'Savanna/Wildlife',
        'wild west': 'Wild West/Frontier',
        'western-themed': 'Wild West/Frontier',
        'cowboy': 'Wild West/Frontier',
    }

    if theme in ('Classic Slots', 'Ancient Temple/Ruins'):
        for keyword, target_theme in theme_overrides.items():
            if keyword in combined_lower and theme != target_theme:
                art_result['art_theme'] = target_theme
                break

    # --- Rule 20: Fallback — if no characters after all rules, set No Characters ---
    if not art_result['art_characters']:
        art_result['art_characters'] = ["No Characters (symbol-only game)"]

    return art_result


def _extract_symbol_images(html_raw, max_images=6):
    """Extract unique symbol/game images from HTML rules page for vision analysis.
    Extracts og:image meta tags (best screenshots) plus inline <img> tags.
    Returns list of dicts with base64 data and media_type, sorted by size descending."""
    import requests as _requests
    import base64 as _b64

    # 1. Extract og:image meta tags (usually full game screenshots)
    og_urls = re.findall(
        r'<meta[^>]+(?:property|name)=["\']og:image(?::secure_url)?["\'][^>]+content=["\']([^"\']+)["\']',
        html_raw, re.IGNORECASE
    )
    og_urls += re.findall(
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']og:image(?::secure_url)?["\']',
        html_raw, re.IGNORECASE
    )

    # 2. Extract inline img tags
    img_urls = re.findall(r'<img[^>]+src=["\']([^"\']+)["\']', html_raw)

    # Deduplicate preserving order, og:image first
    seen_urls = set()
    ordered_urls = []
    for url in og_urls + img_urls:
        norm = url.split('?')[0]
        if norm not in seen_urls:
            seen_urls.add(norm)
            ordered_urls.append(url)

    LOGO_FRAGMENTS = ['4059c782afec4a3c88cc8c0379acccaa', 'logo', 'favicon', 'nav-', 'icon-', 'arrow', 'bullet']
    filtered_urls = [u for u in ordered_urls
                     if not any(frag in u.lower() for frag in LOGO_FRAGMENTS)]

    if not filtered_urls:
        return []

    # Download and sort by size
    candidates = []
    for url in filtered_urls[:max_images * 2]:  # fetch more, keep best
        try:
            resp = _requests.get(url, timeout=8)
            if resp.status_code != 200 or len(resp.content) < 2048:
                continue
            ct = resp.headers.get('content-type', 'image/png').split(';')[0]
            if ct not in ('image/png', 'image/jpeg', 'image/gif', 'image/webp'):
                if ct == 'image/svg+xml':
                    continue
                ct = 'image/png'
            candidates.append({
                'media_type': ct,
                'data': _b64.standard_b64encode(resp.content).decode('utf-8'),
                'size': len(resp.content),
            })
        except Exception:
            continue

    # Sort by size descending (larger images = better quality)
    candidates.sort(key=lambda x: x['size'], reverse=True)

    # Return top N without the size field
    return [{'media_type': c['media_type'], 'data': c['data']} for c in candidates[:max_images]]


def extract_art(game_name, description, symbols, themes, slug=None,
                model="claude-sonnet-4-20250514", provider=None, examples=None,
                use_vision=False):
    """Extract art characterization for a single game.
    
    If use_vision=True and slug is provided, symbol images from the HTML rules
    page are included in the prompt for visual character/element detection.
    """
    clean_html = None
    html_raw = None
    if slug:
        html_path = RULES_HTML_DIR / f"{slug}.html"
        if html_path.exists():
            with open(html_path) as f:
                html_raw = f.read()
            clean_html = clean_html_for_claude(html_raw)

    if examples is None:
        examples = load_art_training_examples()

    system = build_art_system_prompt()
    user_text = build_art_user_prompt(game_name, description, symbols, themes,
                                      clean_html, provider, examples=examples)

    symbol_images = []
    if use_vision and html_raw:
        symbol_images = _extract_symbol_images(html_raw)

    if symbol_images:
        user_content = []
        user_content.append({"type": "text", "text": (
            "IMPORTANT: Below are ACTUAL SYMBOL IMAGES from this game. "
            "Look at them carefully — they show the real visual design. "
            "If you see a person, animal, creature, or character in ANY image, "
            "you MUST include them in art_characters even if the text doesn't mention them. "
            "Also use the images to determine art_style (2D/3D/Cartoon) and "
            "art_color_tone from the actual colors you see.\n"
        )})
        for img in symbol_images:
            user_content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": img['media_type'],
                    "data": img['data'],
                }
            })
        user_content.append({"type": "text", "text": user_text})

        client = _get_client()
        system_block = [{"type": "text", "text": system,
                         "cache_control": {"type": "ephemeral"}}]
        response = client.messages.create(
            model=model,
            max_tokens=4096,
            temperature=0,
            system=system_block,
            messages=[{"role": "user", "content": user_content}],
        )
        text = response.content[0].text.strip()
        if text.startswith("```"):
            text = re.sub(r'^```(?:json)?\s*', '', text)
            text = re.sub(r'\s*```$', '', text)
        try:
            result = json.loads(text)
        except json.JSONDecodeError:
            json_match = re.search(r'\{[\s\S]*\}', text)
            if json_match:
                try:
                    result = json.loads(json_match.group())
                except json.JSONDecodeError:
                    result = None
            else:
                result = None
        usage = response.usage
    else:
        result, usage = call_claude(system, user_text, model)

    if result is None:
        return None, "Claude returned unparseable response"

    result = post_process_art(result, game_name, clean_html or "", description, symbols, themes)
    result['art_confidence'] = 'vision_enhanced' if symbol_images else 'text_inferred'

    return result, {
        "input_tokens": usage.input_tokens,
        "output_tokens": usage.output_tokens,
        "images_used": len(symbol_images),
    }


def extract_art_batch(games_list, model="claude-sonnet-4-20250514"):
    """Submit art extraction as a batch job for 50% cost reduction.
    
    games_list: list of dicts with keys: name, description, symbols, themes, slug, provider
    Returns batch_id for polling.
    """
    client = _get_client()
    examples = load_art_training_examples()
    system = build_art_system_prompt()

    requests = []
    id_to_game_data = {}
    for idx, game in enumerate(games_list):
        clean_html = None
        if game.get('slug'):
            html_path = RULES_HTML_DIR / f"{game['slug']}.html"
            if html_path.exists():
                with open(html_path) as f:
                    clean_html = clean_html_for_claude(f.read())

        syms = game.get('symbols', [])
        if isinstance(syms, dict):
            syms = syms.get('functional_symbols', [])

        user = build_art_user_prompt(
            game['name'], game.get('description', ''), syms,
            game.get('themes', []), clean_html, game.get('provider', ''),
            examples=examples
        )

        safe_id = re.sub(r'[^a-zA-Z0-9_-]', '_', game['name'])[:60] + f"_{idx}"
        id_to_game_data[safe_id] = {
            'name': game['name'],
            'description': game.get('description', ''),
            'symbols': syms,
            'themes': game.get('themes', []),
        }

        requests.append({
            "custom_id": safe_id,
            "params": {
                "model": model,
                "max_tokens": 2048,
                "system": [{"type": "text", "text": system}],
                "messages": [{"role": "user", "content": user}],
            }
        })

    batch = client.messages.batches.create(requests=requests)

    # Save game data mapping for result decoding + post-processing
    map_path = DATA_DIR / f"_art_batch_{batch.id}_map.json"
    with open(map_path, 'w') as f:
        json.dump(id_to_game_data, f)

    return batch.id, len(requests)


def process_art_batch_results(batch_id):
    """Poll and process results from an art batch job."""
    client = _get_client()

    batch = client.messages.batches.retrieve(batch_id)
    if batch.processing_status != "ended":
        return None, batch.processing_status, {
            "total": batch.request_counts.processing + batch.request_counts.succeeded + batch.request_counts.errored,
            "succeeded": batch.request_counts.succeeded,
            "errored": batch.request_counts.errored,
            "processing": batch.request_counts.processing,
        }

    # Load game data mapping (supports both old id_to_name and new id_to_game_data formats)
    map_path = DATA_DIR / f"_art_batch_{batch_id}_map.json"
    id_to_game_data = {}
    if map_path.exists():
        with open(map_path) as f:
            raw_map = json.load(f)
        for k, v in raw_map.items():
            if isinstance(v, str):
                id_to_game_data[k] = {'name': v}
            else:
                id_to_game_data[k] = v

    results = {}
    for result in client.messages.batches.results(batch_id):
        safe_id = result.custom_id
        game_data = id_to_game_data.get(safe_id, {'name': safe_id})
        name = game_data['name']
        if result.result.type == "succeeded":
            msg = result.result.message
            text = msg.content[0].text.strip()
            if text.startswith("```"):
                text = re.sub(r'^```(?:json)?\s*', '', text)
                text = re.sub(r'\s*```$', '', text)
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                json_match = re.search(r'\{[\s\S]*\}', text)
                if json_match:
                    try:
                        parsed = json.loads(json_match.group())
                    except json.JSONDecodeError:
                        parsed = None
                else:
                    parsed = None

            if parsed:
                batch_html = ""
                try:
                    if MATCHES_PATH.exists():
                        with open(MATCHES_PATH) as mf:
                            matches = json.load(mf)
                        slug = matches.get(name, {}).get('slug') if isinstance(matches.get(name), dict) else matches.get(name)
                        if slug:
                            html_path = RULES_HTML_DIR / f"{slug}.html"
                            if html_path.exists():
                                with open(html_path) as hf:
                                    batch_html = clean_html_for_claude(hf.read())
                except Exception:
                    pass
                parsed = post_process_art(
                    parsed, name, batch_html,
                    description=game_data.get('description', ''),
                    symbols=game_data.get('symbols'),
                    themes=game_data.get('themes'),
                )
                parsed['art_confidence'] = 'text_inferred'
                results[name] = parsed
        else:
            print(f"  {name}: batch error — {result.result.type}")

    return results, "ended", {
        "succeeded": batch.request_counts.succeeded,
        "errored": batch.request_counts.errored,
    }


def apply_art_to_master(game_entry, art_result, gt_data=None):
    """Write art characterization fields into a game_data_master.json entry.
    If gt_data is provided and the game is in GT, GT values override LLM output."""
    art_fields = ['art_theme', 'art_characters', 'art_elements', 'art_mood',
                  'art_narrative', 'art_style', 'art_color_tone', 'art_confidence',
                  '_confidence']
    for field in art_fields:
        if field in art_result:
            game_entry[field] = art_result[field]

    if gt_data and game_entry.get('name') in gt_data:
        gt_entry = gt_data[game_entry['name']]
        for field in art_fields:
            if field in gt_entry:
                game_entry[field] = gt_entry[field]
        game_entry['art_confidence'] = 'ground_truth'


def compare_art_with_gt(extraction, gt_art):
    """Compare art extraction against ground truth. Returns per-dimension accuracy + aggregate F1.
    Scores 7 dimensions: theme, mood, narrative, characters, elements, style, color_tone.
    Style and color_tone are optional — only scored when present in GT."""
    if not extraction or not gt_art:
        return {"error": "no extraction or GT"}

    result = {}

    single_dims = ['art_theme', 'art_mood', 'art_narrative']
    optional_single_dims = ['art_style', 'art_color_tone']

    for dim in single_dims + optional_single_dims:
        gt_val = gt_art.get(dim, '')
        if dim in optional_single_dims and not gt_val:
            continue
        pred = extraction.get(dim, '')
        match = pred == gt_val
        result[dim] = {
            "predicted": pred,
            "truth": gt_val,
            "match": match,
        }

    # Multi-value dimensions: set-based F1
    NOISY_ELEMENTS = {'Playing Card Values (A, K, Q, J, 10)'}
    for dim in ['art_characters', 'art_elements']:
        pred_set = set(extraction.get(dim, []))
        truth_set = set(gt_art.get(dim, []))
        if dim == 'art_elements':
            pred_set -= NOISY_ELEMENTS
            truth_set -= NOISY_ELEMENTS

        if not pred_set and not truth_set:
            precision, recall, f1 = 1.0, 1.0, 1.0
            tp, fp, fn = set(), set(), set()
        else:
            tp = pred_set & truth_set
            fp = pred_set - truth_set
            fn = truth_set - pred_set
            precision = len(tp) / len(pred_set) if pred_set else 0
            recall = len(tp) / len(truth_set) if truth_set else 0
            f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0

        result[dim] = {
            "precision": round(precision, 3),
            "recall": round(recall, 3),
            "f1": round(f1, 3),
            "tp": sorted(tp),
            "fp": sorted(fp),
            "fn": sorted(fn),
        }

    # Aggregate: all scored dimensions (singles as 1/0, multis as F1)
    scored_singles = [d for d in single_dims + optional_single_dims if d in result]
    single_scores = [1.0 if result[d]['match'] else 0.0 for d in scored_singles]
    multi_scores = [result[d]['f1'] for d in ['art_characters', 'art_elements']]
    all_scores = single_scores + multi_scores
    result['aggregate_score'] = round(sum(all_scores) / len(all_scores), 3)
    result['dimensions_scored'] = len(all_scores)

    return result


def print_art_gt_summary(results):
    """Print summary of art GT test results (up to 7 dimensions)."""
    if not results:
        print("No results to summarize.")
        return

    single_dims = ['art_theme', 'art_mood', 'art_narrative', 'art_style', 'art_color_tone']
    multi_dims = ['art_characters', 'art_elements']
    all_dims = single_dims + multi_dims
    dim_scores = {d: [] for d in all_dims}

    for name, comp in results:
        for d in single_dims:
            if d in comp:
                dim_scores[d].append(1.0 if comp[d]['match'] else 0.0)
        for d in multi_dims:
            dim_scores[d].append(comp[d]['f1'])

    print("\n" + "=" * 60)
    print("ART CHARACTERIZATION — GT TEST SUMMARY")
    print("=" * 60)
    print(f"Games tested: {len(results)}")
    print()

    for d in all_dims:
        scores = dim_scores[d]
        if not scores:
            continue
        avg = sum(scores) / len(scores)
        perfect = sum(1 for s in scores if s == 1.0)
        label = d.replace('art_', '').replace('_', ' ').upper()
        n_label = f"({perfect}/{len(scores)} perfect)"
        print(f"  {label:12s}: {avg:.1%} avg  {n_label}")

    agg = [comp['aggregate_score'] for _, comp in results]
    avg_agg = sum(agg) / len(agg)
    print(f"\n  {'AGGREGATE':12s}: {avg_agg:.1%} avg")

    # Show worst performers
    worst = sorted(results, key=lambda x: x[1]['aggregate_score'])[:5]
    if worst and worst[0][1]['aggregate_score'] < 1.0:
        print("\nLowest scoring games:")
        for name, comp in worst:
            if comp['aggregate_score'] >= 1.0:
                break
            issues = []
            for d in single_dims:
                if d in comp and not comp[d]['match']:
                    issues.append(f"{d.replace('art_','')}: {comp[d]['predicted']} != {comp[d]['truth']}")
            for d in multi_dims:
                if comp[d]['f1'] < 1.0:
                    if comp[d]['fp']:
                        issues.append(f"{d.replace('art_','')} FP: {comp[d]['fp']}")
                    if comp[d]['fn']:
                        issues.append(f"{d.replace('art_','')} FN: {comp[d]['fn']}")
            print(f"  {name} (score={comp['aggregate_score']:.1%}): {'; '.join(issues)}")

    print("=" * 60)
    return avg_agg


# ─── Symbol Extraction ──────────────────────────────────────────

def extract_symbols_only(game_name, slug, model="claude-sonnet-4-20250514"):
    """Targeted extraction of functional symbols only (wild, scatter, bonus, special)."""
    html_path = RULES_HTML_DIR / f"{slug}.html"
    if not html_path.exists():
        return None, "No HTML file"

    with open(html_path) as f:
        html = f.read()

    clean_html = clean_html_for_claude(html)
    if len(clean_html) < 500:
        return None, f"HTML too sparse ({len(clean_html)} chars)"

    system = "You are a slot game analyst. Extract ONLY the functional symbols from the HTML rules page."

    prompt = f"""Game: {game_name}

HTML Rules:
{clean_html[:8000]}

Extract ALL functional symbols (wild, scatter, bonus, special) from this game's rules.

Return ONLY valid JSON in this exact format:
{{
  "functional_symbols": [
    {{
      "name": "<symbol name as shown in rules>",
      "type": "<wild|scatter|bonus|special>",
      "description": "<one sentence: what this symbol does>"
    }}
  ]
}}

Rules:
- Include ALL wild symbols (regular, expanding, sticky, multiplier wilds)
- Include ALL scatter/bonus trigger symbols
- Include special symbols (coin/prize symbols, collector symbols, mystery symbols)
- Do NOT include regular paying symbols (like card values, themed symbols)
- type must be exactly one of: wild, scatter, bonus, special"""

    result, usage = call_claude(system, prompt, model)
    if result is None:
        return None, "Claude returned unparseable response"

    symbols = result.get('functional_symbols', [])
    valid = [s for s in symbols if isinstance(s, dict) and 'name' in s and 'type' in s]

    return valid, {
        "input_tokens": usage.input_tokens,
        "output_tokens": usage.output_tokens
    }


def extract_all_symbols(game_name, slug, model="claude-sonnet-4-20250514"):
    """Extract ALL symbols (functional + themed + card) from the HTML rules page."""
    html_path = RULES_HTML_DIR / f"{slug}.html"
    if not html_path.exists():
        return None, "No HTML file"

    with open(html_path) as f:
        html = f.read()

    clean_html = clean_html_for_claude(html)
    if len(clean_html) < 500:
        return None, f"HTML too sparse ({len(clean_html)} chars)"

    system = "You are a slot game analyst. Extract ALL symbols from the game rules — functional, themed, and card symbols."

    prompt = f"""Game: {game_name}

HTML Rules:
{clean_html[:8000]}

Extract EVERY symbol visible on this game's paytable/reels. Include ALL categories.

Return ONLY valid JSON:
{{
  "symbols": [
    {{
      "name": "<symbol name>",
      "type": "<wild|scatter|bonus|special|themed|card>",
      "description": "<optional: what this symbol does, leave empty for regular paying symbols>"
    }}
  ]
}}

Rules:
- Include ALL wild symbols (regular, expanding, sticky, multiplier wilds) → type "wild"
- Include ALL scatter/bonus trigger symbols → type "scatter" or "bonus"
- Include special symbols (coin/prize, collector, mystery) → type "special"
- Include themed high-paying symbols (characters, objects, animals) → type "themed"
- Include card/low-paying symbols (A, K, Q, J, 10, 9 or similar) → type "card"
- Use the name as it appears in the rules (e.g. "Cleopatra", "Scarab", "Eye of Horus")
- For card symbols, use short names: "A", "K", "Q", "J", "10", "9"
- description is required for wild/scatter/bonus/special, optional for themed/card
- A typical slot has 8-15 total symbols"""

    result, usage = call_claude(system, prompt, model)
    if result is None:
        return None, "Claude returned unparseable response"

    symbols = result.get('symbols', [])
    valid = [s for s in symbols if isinstance(s, dict) and 'name' in s and 'type' in s]

    return valid, {
        "input_tokens": usage.input_tokens,
        "output_tokens": usage.output_tokens
    }


# ─── Sequential Extraction Runner ───────────────────────────────

def _run_sequential_extraction(all_games, master, master_lookup, examples,
                                system_prompt, model, apply, results_file, checkpoint_file):
    save_interval = 25
    total_in = 0
    total_out = 0
    total_cost = 0
    processed = 0
    zero_extractions = 0
    zero_names = []
    errors = 0
    all_feature_counts = []

    start_time = time.time()

    for i, game in enumerate(all_games):
        try:
            result, meta = extract_game(
                game['name'], slug=game['slug'],
                model=model, examples=examples,
                system_prompt=system_prompt,
                provider=game.get('provider')
            )
        except Exception as e:
            print(f"  [{i+1}] ERROR: {game['name']}: {e}")
            errors += 1
            with open(results_file, 'a') as f:
                f.write(json.dumps({"name": game['name'], "error": str(e)}) + "\n")
            continue

        if result is None:
            print(f"  [{i+1}] SPARSE: {game['name']}: {meta}")
            errors += 1
            with open(results_file, 'a') as f:
                f.write(json.dumps({"name": game['name'], "error": str(meta)}) + "\n")
            continue

        n_features = len(result.get('features', []))
        all_feature_counts.append(n_features)
        if n_features == 0:
            zero_extractions += 1
            zero_names.append(game['name'])

        total_in += meta['input_tokens']
        total_out += meta['output_tokens']
        cost = (meta['input_tokens'] * 3 + meta['output_tokens'] * 15) / 1_000_000
        total_cost += cost
        processed += 1

        with open(results_file, 'a') as f:
            f.write(json.dumps({
                "name": game['name'],
                "provider": game['provider'],
                "result": result,
                "tokens_in": meta['input_tokens'],
                "tokens_out": meta['output_tokens']
            }) + "\n")

        if apply and game['name'] in master_lookup:
            apply_result_to_master(master_lookup[game['name']], result)

        if (i + 1) % 10 == 0:
            elapsed = time.time() - start_time
            rate = processed / elapsed if elapsed > 0 else 0
            eta = (len(all_games) - i - 1) / rate / 3600 if rate > 0 else 0
            print(f"  [{i+1}/{len(all_games)}] {game['name'][:35]:35s} "
                  f"{n_features}f ${total_cost:.2f} "
                  f"({rate*3600:.0f}/hr, ETA {eta:.1f}h)")

        # Inspection + save every save_interval games
        if (i + 1) % save_interval == 0:
            batch_features = all_feature_counts[-save_interval:]
            avg_feat = sum(batch_features) / len(batch_features) if batch_features else 0
            batch_zeros = sum(1 for f in batch_features if f == 0)
            zero_pct = batch_zeros / save_interval * 100

            print(f"\n  --- CHECKPOINT ({i+1}/{len(all_games)}) ---")
            print(f"    Avg features: {avg_feat:.1f}  |  Zeros: {batch_zeros}/{save_interval} ({zero_pct:.0f}%)")
            print(f"    Cost: ${total_cost:.2f}  |  Elapsed: {(time.time()-start_time)/60:.0f} min")

            if zero_pct > 15:
                print(f"  WARNING: {zero_pct:.0f}% zero extractions (threshold 15%)")
                print(f"  Zero games: {zero_names[-save_interval:]}")
                print(f"  Stopping. Resume with --offset {i+1}")
                break
            if avg_feat < 1.5:
                print(f"  WARNING: Avg features {avg_feat:.1f} (threshold 1.5)")
                print(f"  Stopping. Resume with --offset {i+1}")
                break

            with open(checkpoint_file, 'w') as f:
                json.dump({
                    "last_index": i, "processed": processed,
                    "errors": errors, "zero_extractions": zero_extractions,
                    "total_cost": total_cost, "avg_features": avg_feat,
                    "zero_names": zero_names
                }, f, indent=2)

            if apply:
                safe_write_master(master, f"checkpoint {processed}")
                print(f"    Saved master ({processed} games updated)")

        time.sleep(0.3)

    # Final save
    elapsed = time.time() - start_time
    print(f"\nDONE: {processed}/{len(all_games)} games, {errors} errors, "
          f"${total_cost:.2f}, {elapsed/3600:.1f}h")
    if zero_names:
        print(f"  Zero-extraction games: {zero_names}")

    if apply:
        safe_write_master(master, "final extraction")
        print(f"  Master saved with {processed} games updated")


# ─── Batch API Extraction Runner ────────────────────────────────

def _run_batch_extraction(all_games, master, master_lookup, examples,
                           system_prompt, model, apply, results_file, checkpoint_file):
    """Submit all games as a Batch API request (50% cheaper + prompt caching)."""
    import anthropic

    client = _get_client()

    system_block = [{"type": "text", "text": system_prompt,
                     "cache_control": {"type": "ephemeral", "ttl": "1h"}}]

    print(f"Building {len(all_games)} batch requests...")
    requests = []
    id_to_name = {}
    for i, game in enumerate(all_games):
        html_path = RULES_HTML_DIR / f"{game['slug']}.html"
        if not html_path.exists():
            continue

        with open(html_path) as f:
            html = f.read()
        clean_html = clean_html_for_claude(html)
        if len(clean_html) < 2000:
            continue

        user_prompt = build_user_prompt(game['name'], clean_html, examples,
                                        provider=game.get('provider'))

        safe_id = re.sub(r'[^a-zA-Z0-9_-]', '_', game['name'])[:60] + f"_{i}"
        id_to_name[safe_id] = game['name']

        requests.append({
            "custom_id": safe_id,
            "params": {
                "model": model,
                "max_tokens": 4096,
                "system": system_block,
                "messages": [{"role": "user", "content": user_prompt}]
            }
        })

    print(f"Submitting batch of {len(requests)} requests...")
    try:
        batch = client.messages.batches.create(requests=requests)
    except Exception as e:
        print(f"BATCH CREATION FAILED: {e}")
        print("No games were processed. Check API key and account limits.")
        if apply:
            safe_write_master(master, "sparse_html flags")
            print("  Master saved (sparse_html flags preserved)")
        return

    batch_id = batch.id
    print(f"Batch created: {batch_id}")
    print(f"Status: {batch.processing_status}")

    print("Waiting for batch to complete...")
    while True:
        try:
            batch = client.messages.batches.retrieve(batch_id)
        except Exception as e:
            print(f"  Poll error: {e} -- retrying in 60s")
            time.sleep(60)
            continue
        counts = batch.request_counts
        total = counts.processing + counts.succeeded + counts.errored + counts.canceled + counts.expired
        print(f"  Status: {batch.processing_status} | "
              f"succeeded={counts.succeeded} processing={counts.processing} "
              f"errored={counts.errored} (of {total})")

        if batch.processing_status == "ended":
            break
        time.sleep(30)

    # Retrieve results
    print(f"\nBatch complete. Retrieving results...")
    processed = 0
    errors = 0
    zero_extractions = 0
    zero_names = []
    all_feature_counts = []

    for result_entry in client.messages.batches.results(batch_id):
        name = id_to_name.get(result_entry.custom_id, result_entry.custom_id)
        if result_entry.result.type == "errored":
            print(f"  ERROR: {name}: {result_entry.result.error}")
            errors += 1
            with open(results_file, 'a') as f:
                f.write(json.dumps({"name": name, "error": str(result_entry.result.error)}) + "\n")
            continue

        if result_entry.result.type == "expired":
            print(f"  EXPIRED: {name}")
            errors += 1
            with open(results_file, 'a') as f:
                f.write(json.dumps({"name": name, "error": "expired"}) + "\n")
            continue

        message = result_entry.result.message
        if not message.content:
            print(f"  EMPTY RESPONSE: {name}")
            errors += 1
            with open(results_file, 'a') as f:
                f.write(json.dumps({"name": name, "error": "empty_response"}) + "\n")
            continue
        text = message.content[0].text.strip()
        if text.startswith("```"):
            text = re.sub(r'^```(?:json)?\s*', '', text)
            text = re.sub(r'\s*```$', '', text)

        try:
            extraction = json.loads(text)
        except json.JSONDecodeError:
            print(f"  JSON ERROR: {name}")
            errors += 1
            with open(results_file, 'a') as f:
                f.write(json.dumps({"name": name, "error": "json_parse_error"}) + "\n")
            continue

        extraction = post_process(extraction, game_name=name)
        n_features = len(extraction.get('features', []))
        all_feature_counts.append(n_features)
        if n_features == 0:
            zero_extractions += 1
            zero_names.append(name)

        processed += 1

        provider = master_lookup[name]['provider'] if name in master_lookup else '?'
        with open(results_file, 'a') as f:
            f.write(json.dumps({
                "name": name,
                "provider": provider,
                "result": extraction,
                "tokens_in": message.usage.input_tokens,
                "tokens_out": message.usage.output_tokens
            }) + "\n")

        if apply and name in master_lookup:
            apply_result_to_master(master_lookup[name], extraction)

    avg_feat = sum(all_feature_counts) / len(all_feature_counts) if all_feature_counts else 0
    print(f"\nBATCH RESULTS: {processed} succeeded, {errors} errors")
    print(f"  Avg features/game: {avg_feat:.1f}")
    print(f"  Zero extractions: {zero_extractions}")
    if zero_names:
        print(f"  Zero-extraction games: {zero_names}")

    if apply:
        safe_write_master(master, "batch final")
        print(f"  Master saved with {processed} games updated")


def print_gt_summary(valid, total_tokens_in=0, total_tokens_out=0):
    """Print summary of GT comparison results (features + themes)."""
    if not valid:
        print("No valid results to summarize.")
        return
    avg_p = sum(r['precision'] for r in valid) / len(valid)
    avg_r = sum(r['recall'] for r in valid) / len(valid)
    avg_f1 = sum(r['f1'] for r in valid) / len(valid)
    perfect = sum(1 for r in valid if r['f1'] == 1.0)

    print(f"\n{'='*60}")
    print(f"FEATURE ACCURACY: {len(valid)} games")
    print(f"  Avg Precision: {avg_p:.1%}")
    print(f"  Avg Recall:    {avg_r:.1%}")
    print(f"  Avg F1:        {avg_f1:.1%}")
    print(f"  Perfect (F1=1): {perfect}/{len(valid)} ({perfect/len(valid)*100:.0f}%)")
    if total_tokens_in or total_tokens_out:
        print(f"  Total tokens: {total_tokens_in:,} in, {total_tokens_out:,} out")

    # Theme accuracy
    with_themes = [r for r in valid if 'theme_f1' in r]
    if with_themes:
        t_avg_p = sum(r['theme_precision'] for r in with_themes) / len(with_themes)
        t_avg_r = sum(r['theme_recall'] for r in with_themes) / len(with_themes)
        t_avg_f1 = sum(r['theme_f1'] for r in with_themes) / len(with_themes)
        t_perfect = sum(1 for r in with_themes if r['theme_f1'] == 1.0)
        print(f"\nTHEME ACCURACY: {len(with_themes)} games (with theme GT)")
        print(f"  Avg Precision: {t_avg_p:.1%}")
        print(f"  Avg Recall:    {t_avg_r:.1%}")
        print(f"  Avg F1:        {t_avg_f1:.1%}")
        print(f"  Perfect (F1=1): {t_perfect}/{len(with_themes)} ({t_perfect/len(with_themes)*100:.0f}%)")

        t_fp = Counter()
        t_fn = Counter()
        for r in with_themes:
            for t in r.get('theme_fp', []):
                t_fp[t] += 1
            for t in r.get('theme_fn', []):
                t_fn[t] += 1
        if t_fp:
            print(f"  Theme FP: {dict(t_fp.most_common(10))}")
        if t_fn:
            print(f"  Theme FN: {dict(t_fn.most_common(10))}")

    all_fp = Counter()
    all_fn = Counter()
    for r in valid:
        for f in r.get('fp', []):
            all_fp[f] += 1
        for f in r.get('fn', []):
            all_fn[f] += 1

    if all_fp:
        print(f"\n  Most common Feature FP:")
        for feat, count in all_fp.most_common(10):
            print(f"    {feat}: {count} games")
    if all_fn:
        print(f"\n  Most common Feature FN:")
        for feat, count in all_fn.most_common(10):
            print(f"    {feat}: {count} games")

    from collections import defaultdict
    provider_results = defaultdict(list)
    for r in valid:
        provider_results[r['provider']].append(r)
    print(f"\n  Per-provider F1:")
    for prov in sorted(provider_results.keys()):
        pr = provider_results[prov]
        pf1 = sum(r['f1'] for r in pr) / len(pr)
        perfect_p = sum(1 for r in pr if r['f1'] == 1.0)
        print(f"    {prov:30s} {len(pr)} games  F1={pf1:.1%}  ({perfect_p} perfect)")


def validate_art_batch(results, vocab=None):
    """Anti-hallucination validator for batch art extraction results.

    Checks:
    1. All values from controlled vocabulary
    2. Character count <= 5 per game
    3. Element count <= 7 per game
    4. "No Characters" doesn't coexist with specific characters
    5. Style/color_tone not null when vision was used
    6. Confidence distribution sanity

    Args:
        results: dict of {game_name: art_result}
        vocab: optional dict of vocabulary sets (auto-loaded if None)

    Returns:
        dict with 'clean' (list of clean game names), 'flagged' (list of
        {name, issues: [str]} dicts), 'stats' (summary counts)
    """
    if vocab is None:
        vocab = {
            'art_theme': set(ART_THEME_VALUES),
            'art_characters': set(ART_CHARACTER_VALUES),
            'art_elements': set(ART_ELEMENT_VALUES),
            'art_mood': set(ART_MOOD_VALUES),
            'art_narrative': set(ART_NARRATIVE_VALUES),
            'art_style': set(ART_STYLE_VALUES),
            'art_color_tone': set(ART_COLOR_TONE_VALUES),
        }

    clean = []
    flagged = []

    for name, art in results.items():
        issues = []

        # 1. Vocabulary checks
        theme = art.get('art_theme')
        if theme and theme not in vocab['art_theme']:
            issues.append(f"art_theme '{theme}' not in vocabulary")

        mood = art.get('art_mood')
        if mood and mood not in vocab['art_mood']:
            issues.append(f"art_mood '{mood}' not in vocabulary")

        narrative = art.get('art_narrative')
        if narrative and narrative not in vocab['art_narrative']:
            issues.append(f"art_narrative '{narrative}' not in vocabulary")

        style = art.get('art_style')
        if style and style not in vocab['art_style']:
            issues.append(f"art_style '{style}' not in vocabulary")

        color_tone = art.get('art_color_tone')
        if color_tone and color_tone not in vocab['art_color_tone']:
            issues.append(f"art_color_tone '{color_tone}' not in vocabulary")

        chars = art.get('art_characters', [])
        if isinstance(chars, list):
            for c in chars:
                if c not in vocab['art_characters']:
                    issues.append(f"art_characters '{c}' not in vocabulary")

        elements = art.get('art_elements', [])
        if isinstance(elements, list):
            for e in elements:
                if e not in vocab['art_elements']:
                    issues.append(f"art_elements '{e}' not in vocabulary")

        # 2. Character count limit
        if isinstance(chars, list) and len(chars) > 5:
            issues.append(f"Too many characters ({len(chars)}), max 5")

        # 3. Element count limit
        if isinstance(elements, list) and len(elements) > 7:
            issues.append(f"Too many elements ({len(elements)}), max 7")

        # 4. "No Characters" conflict
        if isinstance(chars, list) and len(chars) > 1:
            if 'No Characters (symbol-only game)' in chars:
                issues.append("'No Characters' coexists with specific characters")

        # 5. Missing required fields
        if not theme:
            issues.append("art_theme is empty")
        if not mood:
            issues.append("art_mood is empty")

        # 6. Cross-dimensional validation
        greek_d = 'Greek/Roman Deity (Zeus, Poseidon, Athena)'
        norse_d = 'Norse Deity (Thor, Odin, Loki, Freya)'
        char_set = set(chars) if isinstance(chars, list) else set()
        if theme == 'Norse/Viking Realm' and greek_d in char_set:
            issues.append(f"Norse theme has Greek deity")
        if theme == 'Ancient Greece' and norse_d in char_set:
            issues.append(f"Greek theme has Norse deity")
        if theme in ('Ancient Temple/Ruins', 'Desert/Sahara') and 'Viking/Norse Warrior' in char_set:
            issues.append(f"Egyptian theme has Viking warrior")
        if theme == 'Norse/Viking Realm' and 'Pharaoh/Egyptian Ruler' in char_set:
            issues.append(f"Norse theme has Egyptian ruler")

        # 7. Element count cap (should be <=5 after post-processing)
        if isinstance(elements, list) and len(elements) > 5:
            issues.append(f"Too many elements after rules ({len(elements)}), max 5")

        if issues:
            flagged.append({'name': name, 'issues': issues})
        else:
            clean.append(name)

    stats = {
        'total': len(results),
        'clean': len(clean),
        'flagged': len(flagged),
        'pct_clean': f"{len(clean) / max(len(results), 1) * 100:.1f}%",
    }

    return {'clean': clean, 'flagged': flagged, 'stats': stats}


# ─── CLI ──────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Extract game profiles from HTML rules")
    parser.add_argument("--game", type=str, help="Extract single game by name")
    parser.add_argument("--test-ags", action="store_true", help="Test on AGS GT held-out games")
    parser.add_argument("--test-non-ags", action="store_true", help="Test on non-AGS GT games with HTML")
    parser.add_argument("--test-all-gt", action="store_true", help="Test on all GT games with HTML")
    parser.add_argument("--test-games", type=str, help="Test specific games by comma-separated names (must be in GT)")
    parser.add_argument("--rescore", action="store_true", help="Re-score cached results from gt_test_results.jsonl against current GT (no API calls)")
    parser.add_argument("--run-all", action="store_true", help="Run sequential extraction on all games with HTML rules")
    parser.add_argument("--batch", action="store_true", help="Run batch API extraction (50 pct cheaper, async)")
    parser.add_argument("--model", default="claude-sonnet-4-20250514", help="Claude model to use")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of games to process")
    parser.add_argument("--offset", type=int, default=0, help="Skip first N games (for resuming)")
    parser.add_argument("--verify", action="store_true", help="Re-verify low-confidence games (cheaper Claude call)")
    parser.add_argument("--verify-games", type=str, help="Verify specific games by comma-separated names")
    parser.add_argument("--extract-symbols", action="store_true", help="Extract symbols for games missing them")
    parser.add_argument("--extract-all-symbols", action="store_true", help="Extract ALL symbols (themed+card+functional) for games with <6 symbols")
    parser.add_argument("--extract-art", action="store_true", help="Extract art characterization for games with descriptions/symbols")
    parser.add_argument("--apply-art", action="store_true", help="Apply staged art characterization to master (requires user approval)")
    parser.add_argument("--test-art", action="store_true", help="Test art characterization against ground truth (held-out games)")
    parser.add_argument("--test-art-games", type=str, help="Test specific art games by comma-separated names (must be in art GT)")
    parser.add_argument("--gt-gate", action="store_true", help="Run GT gate: extract all art GT games, score, pass/fail based on threshold")
    parser.add_argument("--gt-threshold", type=float, default=0.97, help="Minimum aggregate score for GT gate to pass (default: 0.97)")
    parser.add_argument("--use-vision", action="store_true", help="Enable vision (symbol images) for art extraction")
    parser.add_argument("--extract-art-batch", action="store_true", help="Submit art extraction as batch job (50 pct cheaper)")
    parser.add_argument("--art-batch-poll", type=str, help="Poll/retrieve results from art batch job by batch_id")
    parser.add_argument("--apply", action="store_true", help="Write results to game_data_master.json")
    parser.add_argument("--verbose", action="store_true", help="Show detailed output")
    args = parser.parse_args()

    with open(GT_PATH) as f:
        gt = json.load(f)
    with open(MATCHES_PATH) as f:
        matches = json.load(f)
    with open(MASTER_PATH) as f:
        master = [g for g in json.load(f) if g.get('game_category') != 'Total' and g.get('name') != 'Total']
    master_lookup = {g['name']: g for g in master}

    training_names = set(TRAINING_GAMES + CRITICAL_EXAMPLES)
    examples = load_training_examples()
    system_prompt = build_system_prompt()

    if args.game:
        # Single game extraction
        name = args.game
        if name not in matches:
            print(f"No HTML rules found for '{name}'")
            sys.exit(1)

        slug = matches[name]['slug']
        print(f"Extracting: {name} (slug: {slug})")
        m = master_lookup.get(name)
        game_provider = m['provider'] if m else None
        result, meta = extract_game(name, slug=slug, model=args.model,
                                     examples=examples, system_prompt=system_prompt,
                                     provider=game_provider)
        if result is None:
            print(f"  Error: {meta}")
            sys.exit(1)

        print(f"  Tokens: {meta['input_tokens']} in, {meta['output_tokens']} out")
        print(json.dumps(result, indent=2))

        if args.apply and m:
            apply_result_to_master(m, result)
            safe_write_master(master, "single game")
            print(f"\n  Applied to master. data_confidence={m.get('data_confidence')}")

        if name in gt:
            comparison = compare_with_gt(result, gt[name].get('features', []),
                                          gt[name].get('themes', []))
            print(f"\n  GT Comparison:")
            print(f"    P={comparison['precision']:.1%} R={comparison['recall']:.1%} F1={comparison['f1']:.1%}")
            if comparison['fp']:
                print(f"    False Positives: {comparison['fp']}")
            if comparison['fn']:
                print(f"    False Negatives: {comparison['fn']}")

    elif args.rescore:
        # Re-score cached results against current GT without calling Claude
        cache_path = DATA_DIR / "gt_test_results.jsonl"
        if not cache_path.exists():
            print(f"No cached results at {cache_path}. Run --test-all-gt first.")
            sys.exit(1)

        NON_SLOT_CATEGORIES = {'Lottery', 'Instant Win', 'Table Game', 'Live Casino', 'Video Poker'}
        cached = []
        with open(cache_path) as f:
            for line in f:
                cached.append(json.loads(line))

        print(f"Re-scoring {len(cached)} cached results against current GT...")
        all_results = []
        skipped_non_slot = 0
        skipped_eval = 0
        skipped_sparse = 0
        for entry in cached:
            name = entry['name']
            provider = entry.get('provider', '?')
            result = entry.get('result')

            if entry.get('error') and 'sparse' in entry.get('error', '').lower():
                skipped_sparse += 1
                continue

            m = master_lookup.get(name)
            game_cat = m.get('game_category', '') if m else ''
            if game_cat in NON_SLOT_CATEGORIES:
                skipped_non_slot += 1
                continue

            gt_entry = gt.get(name)
            if not gt_entry:
                continue
            if gt_entry.get('eval_skip'):
                skipped_eval += 1
                continue

            if result is None:
                all_results.append({"name": name, "provider": provider, "error": entry.get('error', 'cached error')})
                continue

            clean_html = ""
            if name in matches:
                slug = matches[name].get('slug', '')
                html_path = RULES_HTML_DIR / f"{slug}.html"
                if html_path.exists():
                    with open(html_path) as hf:
                        clean_html = clean_html_for_claude(hf.read())

            result = post_process(result, game_name=name, clean_html=clean_html)

            comparison = compare_with_gt(result, gt_entry.get('features', []),
                                          gt_entry.get('themes', []))
            comparison['name'] = name
            comparison['provider'] = provider
            all_results.append(comparison)

            status = "PERFECT" if comparison['f1'] == 1.0 else f"F1={comparison['f1']:.1%}"
            t_status = ""
            if 'theme_f1' in comparison:
                t_status = " | Theme PERFECT" if comparison['theme_f1'] == 1.0 else f" | Theme F1={comparison['theme_f1']:.1%}"
            print(f"  {name} ({provider}): {status}{t_status}", end="")
            if comparison.get('fp'):
                print(f"  FP: {comparison['fp']}", end="")
            if comparison.get('fn'):
                print(f"  FN: {comparison['fn']}", end="")
            if comparison.get('theme_fp'):
                print(f"  ThemeFP: {comparison['theme_fp']}", end="")
            if comparison.get('theme_fn'):
                print(f"  ThemeFN: {comparison['theme_fn']}", end="")
            print()

        if skipped_sparse:
            print(f"\n  Skipped {skipped_sparse} sparse HTML games (no Claude call)")
        if skipped_non_slot:
            print(f"  Skipped {skipped_non_slot} non-slot games")
        if skipped_eval:
            print(f"  Skipped {skipped_eval} games with eval_skip flag")

        valid = [r for r in all_results if 'f1' in r]
        print_gt_summary(valid)

    elif args.test_ags or args.test_non_ags or args.test_all_gt or args.test_games:
        # Batch GT testing
        NON_SLOT_CATEGORIES = {'Lottery', 'Instant Win', 'Table Game', 'Live Casino', 'Video Poker'}
        target_names = None
        if args.test_games:
            target_names = set(n.strip() for n in args.test_games.split(','))

        test_games = []
        skipped_non_slot = 0
        for name, data in gt.items():
            if name not in matches:
                continue
            if target_names and name not in target_names:
                continue
            if not target_names and name in training_names:
                continue

            m = master_lookup.get(name)
            if not m:
                continue

            game_cat = m.get('game_category', '')
            if game_cat in NON_SLOT_CATEGORIES:
                skipped_non_slot += 1
                continue

            if data.get('eval_skip'):
                continue

            if args.test_ags and m['provider'] != 'AGS':
                continue
            if args.test_non_ags and m['provider'] == 'AGS':
                continue

            test_games.append({
                'name': name,
                'slug': matches[name]['slug'],
                'gt_features': data.get('features', []),
                'gt_themes': data.get('themes', []),
                'provider': m['provider']
            })

        if args.limit:
            test_games = test_games[:args.limit]

        if skipped_non_slot:
            print(f"Skipped {skipped_non_slot} non-slot games (Lottery/Instant Win/Table Game)")
        print(f"Testing on {len(test_games)} games...")
        all_results = []
        total_tokens_in = 0
        total_tokens_out = 0
        cache_path = DATA_DIR / "gt_test_results.jsonl"
        existing_cache = {}
        if args.test_games and cache_path.exists():
            with open(cache_path) as cf:
                for line in cf:
                    entry = json.loads(line)
                    existing_cache[entry['name']] = line
        target_game_names = {g['name'] for g in test_games}
        cache_file = open(cache_path, 'w')
        for name, line in existing_cache.items():
            if name not in target_game_names:
                cache_file.write(line)

        for i, game in enumerate(test_games):
            print(f"\n[{i+1}/{len(test_games)}] {game['name']} ({game['provider']})")
            result, meta = extract_game(game['name'], slug=game['slug'],
                                         model=args.model, examples=examples,
                                         system_prompt=system_prompt,
                                         provider=game['provider'])
            if result is None:
                print(f"  Error: {meta}")
                all_results.append({"name": game['name'], "provider": game['provider'], "error": str(meta)})
                cache_file.write(json.dumps({"name": game['name'], "provider": game['provider'],
                                             "result": None, "error": str(meta)}) + "\n")
                continue

            total_tokens_in += meta['input_tokens']
            total_tokens_out += meta['output_tokens']

            cache_file.write(json.dumps({"name": game['name'], "provider": game['provider'],
                                         "result": result, "tokens_in": meta['input_tokens'],
                                         "tokens_out": meta['output_tokens']}) + "\n")
            cache_file.flush()

            comparison = compare_with_gt(result, game['gt_features'], game['gt_themes'])
            comparison['name'] = game['name']
            comparison['provider'] = game['provider']
            all_results.append(comparison)

            status = "PERFECT" if comparison['f1'] == 1.0 else f"F1={comparison['f1']:.1%}"
            print(f"  {status}", end="")
            if comparison.get('fp'):
                print(f"  FP: {comparison['fp']}", end="")
            if comparison.get('fn'):
                print(f"  FN: {comparison['fn']}", end="")
            print()

        cache_file.close()
        print(f"\nCached {len(test_games)} results to {cache_path}")

        # Summary
        valid = [r for r in all_results if 'f1' in r]
        print_gt_summary(valid, total_tokens_in, total_tokens_out)

    elif args.verify or args.verify_games:
        # Verification pass on existing extractions
        verify_targets = []

        if args.verify_games:
            target_names = [n.strip() for n in args.verify_games.split(',')]
            for name in target_names:
                game = master_lookup.get(name)
                if not game:
                    print(f"  SKIP {name}: not in master")
                    continue
                slug = matches.get(name, {}).get('slug', '') if name in matches else ''
                if not slug:
                    print(f"  SKIP {name}: no HTML match")
                    continue
                verify_targets.append(game)
        else:
            for game in master:
                if not game.get('extraction_date'):
                    continue
                if game.get('data_confidence') in ('gt_verified', 'non_slot'):
                    continue
                if len(game.get('features', [])) >= 3:
                    continue
                name = game['name']
                if name not in matches:
                    continue
                verify_targets.append(game)

        if args.limit:
            verify_targets = verify_targets[:args.limit]

        print(f"\nVERIFICATION PASS: {len(verify_targets)} games")
        total_in = 0
        total_out = 0
        changed = 0

        for i, game in enumerate(verify_targets):
            name = game['name']
            provider = game.get('provider', '?')
            slug = matches.get(name, {}).get('slug', '')
            existing_features = game.get('features', [])
            existing_themes = game.get('themes_all', [])

            print(f"\n[{i+1}/{len(verify_targets)}] Verifying: {name} ({provider})")
            print(f"  Current features: {existing_features}")

            result, meta = verify_game(
                name, slug, existing_features, existing_themes,
                model=args.model, provider=provider
            )

            if result is None:
                print(f"  ERROR: {meta}")
                continue

            total_in += meta['input_tokens']
            total_out += meta['output_tokens']

            changes = result.get('changes_made', False)
            notes = result.get('verification_notes', '')
            print(f"  Changes: {'YES' if changes else 'no'}")
            if notes:
                print(f"  Notes: {notes}")

            if changes:
                verified = result.get('verified_features', [])
                added = [f for f in verified if f.get('status') == 'added']
                if added:
                    print(f"  ADDED: {[f['name'] for f in added]}")

                if args.apply:
                    did_change = apply_verification_to_master(game, result)
                    if did_change:
                        changed += 1
                        print(f"  Applied to master: {game['features']}")

        if args.apply and changed > 0:
            safe_write_master(master, "verify final")
            print(f"\nSaved {changed} updated games to master.")

        cost_in = total_in / 1_000_000 * 3.0
        cost_out = total_out / 1_000_000 * 15.0
        print(f"\nVerification complete: {len(verify_targets)} games, {changed} changed")
        print(f"  Tokens: {total_in:,} in, {total_out:,} out")
        print(f"  Est. cost: ${cost_in + cost_out:.2f}")

    elif args.art_batch_poll:
        # Poll/retrieve art batch results
        results, status, counts = process_art_batch_results(args.art_batch_poll)
        if results is None:
            print(f"Batch {args.art_batch_poll}: {status}")
            print(f"  Counts: {counts}")
        else:
            staged = {}
            if ART_STAGED_PATH.exists():
                with open(ART_STAGED_PATH) as f:
                    staged = json.load(f)
            staged.update(results)
            with open(ART_STAGED_PATH, 'w') as f:
                json.dump(staged, f, indent=2)
            print(f"Batch complete: {len(results)} results retrieved")
            print(f"Total staged: {len(staged)} games")
            print(f"  Succeeded: {counts['succeeded']}, Errored: {counts['errored']}")

    elif args.extract_art_batch:
        # Submit art extraction as batch job (50% cheaper)
        staged = {}
        if ART_STAGED_PATH.exists():
            with open(ART_STAGED_PATH) as f:
                staged = json.load(f)
            print(f"Loaded {len(staged)} existing staged results")

        targets = []
        for game in master:
            if game.get('game_category') != 'Slot':
                continue
            if not game.get('description') and not game.get('symbols'):
                continue
            name = game['name']
            if name in staged:
                continue
            if game.get('art_theme'):
                continue
            slug = matches.get(name, {}).get('slug', '') if name in matches else ''
            targets.append({
                'name': name,
                'description': game.get('description', ''),
                'symbols': game.get('symbols', []),
                'themes': game.get('themes_all', []),
                'slug': slug,
                'provider': game.get('provider_studio', ''),
            })

        if not targets:
            print("No games to extract. All games already staged or have art_theme.")
            sys.exit(0)

        CHUNK_SIZE = 500
        print(f"ART BATCH: {len(targets)} games to extract in chunks of {CHUNK_SIZE}")
        cost_est = len(targets) * (1858 * 1.5 + 145 * 7.5) / 1_000_000
        print(f"Estimated cost: ${cost_est:.2f} (Sonnet batch, 50% discount)")
        print()

        batch_ids = []
        for i in range(0, len(targets), CHUNK_SIZE):
            chunk = targets[i:i + CHUNK_SIZE]
            chunk_num = i // CHUNK_SIZE + 1
            total_chunks = (len(targets) + CHUNK_SIZE - 1) // CHUNK_SIZE
            print(f"Preparing chunk {chunk_num}/{total_chunks} ({len(chunk)} games)...", flush=True)
            batch_id, count = extract_art_batch(chunk, model=args.model)
            batch_ids.append(batch_id)
            print(f"  Submitted batch {batch_id}: {count} games")

        print(f"\n{len(batch_ids)} batch(es) submitted. Poll with:")
        for bid in batch_ids:
            print(f"  python3 data/extract_game_profile.py --art-batch-poll {bid}")

    elif args.extract_art:
        # Art characterization extraction
        targets = []
        for game in master:
            if game.get('game_category') != 'Slot':
                continue
            if not game.get('description') and not game.get('symbols'):
                continue
            if game.get('art_theme') and not args.apply_art:
                continue
            targets.append(game)

        if args.limit:
            targets = targets[args.offset:args.offset + args.limit]
        elif args.offset:
            targets = targets[args.offset:]

        if args.apply_art:
            # Apply staged art data to master
            if not ART_STAGED_PATH.exists():
                print(f"No staged art data at {ART_STAGED_PATH}")
                sys.exit(1)
            with open(ART_STAGED_PATH) as f:
                staged = json.load(f)
            gt_data = None
            if ART_GT_PATH.exists():
                with open(ART_GT_PATH) as f:
                    gt_data = json.load(f)
                print(f"GT override active: {len(gt_data)} ground truth games")
            applied = 0
            gt_overridden = 0
            for name, art_data in staged.items():
                game = master_lookup.get(name)
                if game:
                    apply_art_to_master(game, art_data, gt_data=gt_data)
                    applied += 1
                    if gt_data and name in gt_data:
                        gt_overridden += 1
            safe_write_master(master, "apply-art")
            print(f"Applied art characterization to {applied} games in master.")
            if gt_overridden:
                print(f"GT override applied to {gt_overridden} games.")
            sys.exit(0)

        print(f"ART CHARACTERIZATION: {len(targets)} games with description/symbols")
        print(f"Model: {args.model}")
        cost_est = len(targets) * (800 * 3 + 400 * 15) / 1_000_000
        print(f"Estimated cost: ${cost_est:.2f} (Sonnet, no batch discount)")
        print()

        staged = {}
        if ART_STAGED_PATH.exists():
            with open(ART_STAGED_PATH) as f:
                staged = json.load(f)
            print(f"Loaded {len(staged)} existing staged results")

        total_in = 0
        total_out = 0
        extracted = 0

        for i, game in enumerate(targets):
            name = game['name']
            if name in staged:
                continue

            slug = matches.get(name, {}).get('slug', '') if name in matches else ''
            provider = game.get('provider', game.get('studio', ''))

            print(f"[{i+1}/{len(targets)}] {name} ({provider})", end="", flush=True)

            art_result, meta = extract_art(
                name,
                description=game.get('description', ''),
                symbols=game.get('symbols', []),
                themes=game.get('themes_all', []),
                slug=slug,
                model=args.model,
                provider=provider,
            )
            if art_result is None:
                print(f" — error: {meta}")
                continue

            total_in += meta['input_tokens']
            total_out += meta['output_tokens']
            extracted += 1

            theme = art_result.get('art_theme', '?')
            mood = art_result.get('art_mood', '?')
            chars = art_result.get('art_characters', [])
            chars_short = chars[0] if chars else '?'
            print(f" — {theme} | {mood} | {chars_short}")

            staged[name] = art_result

            if (i + 1) % 10 == 0:
                with open(ART_STAGED_PATH, 'w') as f:
                    json.dump(staged, f, indent=2)

        with open(ART_STAGED_PATH, 'w') as f:
            json.dump(staged, f, indent=2)

        cost = (total_in * 3 + total_out * 15) / 1_000_000
        print(f"\nArt characterization: {extracted} games extracted")
        print(f"Total staged: {len(staged)} games in {ART_STAGED_PATH.name}")
        print(f"  Tokens: {total_in:,} in, {total_out:,} out")
        print(f"  Est. cost: ${cost:.2f}")

    elif args.gt_gate:
        # ─── GT Gate: pass/fail check for art accuracy ───────────────
        ART_GT_GATE_RESULTS = DATA_DIR / "art_gt_gate_results.json"
        if not ART_GT_PATH.exists():
            print(f"No art GT file at {ART_GT_PATH}")
            sys.exit(1)

        with open(ART_GT_PATH) as f:
            art_gt = json.load(f)

        test_games = []
        for name, gt_data in art_gt.items():
            game = master_lookup.get(name)
            if not game:
                continue
            if game.get('game_category') != 'Slot':
                continue
            test_games.append({
                'name': name,
                'slug': matches.get(name, {}).get('slug', ''),
                'gt_art': gt_data,
                'provider': game.get('provider_studio', ''),
                'description': game.get('description', ''),
                'symbols': game.get('symbols', []),
                'themes': game.get('themes_all', []),
            })

        print(f"GT GATE: {len(test_games)} games | threshold: {args.gt_threshold:.0%} | vision: {args.use_vision}")
        print(f"Model: {args.model}")
        print()

        art_examples = load_art_training_examples()
        results = []
        total_in = 0
        total_out = 0

        for i, game in enumerate(test_games):
            name = game['name']
            syms = game['symbols']
            if isinstance(syms, dict):
                syms = syms.get('functional_symbols', [])

            print(f"[{i+1}/{len(test_games)}] {name}", end="", flush=True)

            art_result, meta = extract_art(
                name,
                description=game['description'],
                symbols=syms,
                themes=game['themes'],
                slug=game['slug'],
                model=args.model,
                provider=game['provider'],
                examples=art_examples,
                use_vision=args.use_vision,
            )

            if art_result is None:
                print(f" — error: {meta}")
                continue

            total_in += meta['input_tokens']
            total_out += meta['output_tokens']

            comparison = compare_art_with_gt(art_result, game['gt_art'])
            results.append((name, comparison))

            score = comparison.get('aggregate_score', 0)
            dims_scored = comparison.get('dimensions_scored', 5)
            theme_ok = "✓" if comparison['art_theme']['match'] else "✗"
            mood_ok = "✓" if comparison['art_mood']['match'] else "✗"
            narr_ok = "✓" if comparison['art_narrative']['match'] else "✗"
            char_f1 = comparison['art_characters']['f1']
            elem_f1 = comparison['art_elements']['f1']
            imgs = meta.get('images_used', 0)
            vis_tag = f" 📷{imgs}" if imgs else ""

            print(f" — {score:.0%}/{dims_scored}d (thm:{theme_ok} mood:{mood_ok} narr:{narr_ok} "
                  f"char:{char_f1:.0%} elem:{elem_f1:.0%}){vis_tag}")

        avg_agg = print_art_gt_summary(results)

        cost = (total_in * 3 + total_out * 15) / 1_000_000
        print(f"\nTokens: {total_in:,} in, {total_out:,} out")
        print(f"Est. cost: ${cost:.2f}")

        # Save timestamped gate report
        gate_report = {
            "timestamp": time.strftime('%Y-%m-%dT%H:%M:%S'),
            "threshold": args.gt_threshold,
            "aggregate_score": avg_agg,
            "passed": avg_agg >= args.gt_threshold,
            "games_tested": len(results),
            "vision": args.use_vision,
            "model": args.model,
            "cost_usd": round(cost, 4),
            "per_game": {name: comp for name, comp in results},
        }
        with open(ART_GT_GATE_RESULTS, 'w') as f:
            json.dump(gate_report, f, indent=2)
        print(f"\nGate report saved to {ART_GT_GATE_RESULTS.name}")

        if avg_agg >= args.gt_threshold:
            print(f"\n✅ GT GATE PASSED: {avg_agg:.1%} >= {args.gt_threshold:.0%}")
            sys.exit(0)
        else:
            print(f"\n❌ GT GATE FAILED: {avg_agg:.1%} < {args.gt_threshold:.0%}")
            sys.exit(1)

    elif args.test_art or args.test_art_games:
        # Art characterization GT evaluation
        if not ART_GT_PATH.exists():
            print(f"No art GT file at {ART_GT_PATH}")
            sys.exit(1)

        with open(ART_GT_PATH) as f:
            art_gt = json.load(f)

        art_training_names = set(ART_TRAINING_GAMES)

        target_names = None
        if args.test_art_games:
            target_names = set(n.strip() for n in args.test_art_games.split(','))

        test_games = []
        for name, gt_data in art_gt.items():
            if target_names and name not in target_names:
                continue
            if not target_names and name in art_training_names:
                continue
            game = master_lookup.get(name)
            if not game:
                continue
            if game.get('game_category') != 'Slot':
                continue
            test_games.append({
                'name': name,
                'slug': matches.get(name, {}).get('slug', ''),
                'gt_art': gt_data,
                'provider': game.get('provider_studio', ''),
                'description': game.get('description', ''),
                'symbols': game.get('symbols', []),
                'themes': game.get('themes_all', []),
            })

        print(f"ART GT TEST: {len(test_games)} held-out games (excluded {len(art_training_names)} training games)")
        print(f"Model: {args.model}")
        print()

        art_examples = load_art_training_examples()
        results = []
        total_in = 0
        total_out = 0

        for i, game in enumerate(test_games):
            name = game['name']
            syms = game['symbols']
            if isinstance(syms, dict):
                syms = syms.get('functional_symbols', [])

            print(f"[{i+1}/{len(test_games)}] {name}", end="", flush=True)

            art_result, meta = extract_art(
                name,
                description=game['description'],
                symbols=syms,
                themes=game['themes'],
                slug=game['slug'],
                model=args.model,
                provider=game['provider'],
                examples=art_examples,
                use_vision=args.use_vision,
            )

            if art_result is None:
                print(f" — error: {meta}")
                continue

            total_in += meta['input_tokens']
            total_out += meta['output_tokens']

            comparison = compare_art_with_gt(art_result, game['gt_art'])
            results.append((name, comparison))

            score = comparison.get('aggregate_score', 0)
            theme_ok = "✓" if comparison['art_theme']['match'] else "✗"
            mood_ok = "✓" if comparison['art_mood']['match'] else "✗"
            narr_ok = "✓" if comparison['art_narrative']['match'] else "✗"
            char_f1 = comparison['art_characters']['f1']
            elem_f1 = comparison['art_elements']['f1']
            imgs = meta.get('images_used', 0)
            vis_tag = f" 📷{imgs}" if imgs else ""

            print(f" — {score:.0%} (thm:{theme_ok} mood:{mood_ok} narr:{narr_ok} char:{char_f1:.0%} elem:{elem_f1:.0%}){vis_tag}")

            # Save result to JSONL
            with open(ART_TEST_RESULTS_PATH, 'a') as f:
                f.write(json.dumps({
                    "name": name,
                    "extraction": art_result,
                    "gt": game['gt_art'],
                    "comparison": comparison,
                    "tokens_in": meta['input_tokens'],
                    "tokens_out": meta['output_tokens'],
                }) + "\n")

        print_art_gt_summary(results)

        cost = (total_in * 3 + total_out * 15) / 1_000_000
        print(f"\nTokens: {total_in:,} in, {total_out:,} out")
        print(f"Est. cost: ${cost:.2f}")

    elif args.extract_symbols:
        # Targeted symbol extraction for games missing symbols
        targets = []
        for game in master:
            if not game.get('extraction_date'):
                continue
            if game.get('game_category') != 'Slot':
                continue
            if game.get('symbols') and len(game['symbols']) > 0:
                continue
            if game['name'] not in matches:
                continue
            targets.append(game)

        if args.limit:
            targets = targets[:args.limit]

        print(f"SYMBOL EXTRACTION: {len(targets)} slots missing symbols")
        total_in = 0
        total_out = 0
        added = 0

        for i, game in enumerate(targets):
            name = game['name']
            slug = matches[name].get('slug', '')
            print(f"[{i+1}/{len(targets)}] {name} ({game.get('provider', '?')})", end="", flush=True)

            symbols, meta = extract_symbols_only(name, slug, model=args.model)
            if symbols is None:
                print(f" — skipped: {meta}")
                continue

            total_in += meta['input_tokens']
            total_out += meta['output_tokens']

            if symbols:
                print(f" — {len(symbols)} symbols: {[s.get('name','?') for s in symbols]}")
                if args.apply:
                    game['symbols'] = symbols
                    added += 1
            else:
                print(f" — no symbols found")

            if args.apply and (i + 1) % 25 == 0:
                safe_write_master(master, "symbol checkpoint")
                print(f"  [checkpoint saved]")

        if args.apply and added > 0:
            safe_write_master(master, "symbol final")
            print(f"\nSaved {added} games with new symbols to master.")

        cost = (total_in * 3 + total_out * 15) / 1_000_000
        print(f"\nSymbol extraction: {added}/{len(targets)} games got symbols")
        print(f"  Tokens: {total_in:,} in, {total_out:,} out")
        print(f"  Est. cost: ${cost:.2f}")

    elif args.extract_all_symbols:
        # Full symbol extraction (themed + card + functional) for games with <6 symbols
        import re
        def norm_key(s):
            return re.sub(r'[^a-z0-9]', '', s.lower())

        targets = []
        for game in master:
            if game.get('game_category') != 'Slot':
                continue
            syms = game.get('symbols', [])
            if len(syms) >= 6:
                continue
            if game['name'] not in matches:
                continue
            targets.append(game)

        targets = targets[args.offset:]
        if args.limit:
            targets = targets[:args.limit]

        print(f"ALL-SYMBOL EXTRACTION: {len(targets)} slots with <6 symbols")
        total_in = 0
        total_out = 0
        upgraded = 0

        for i, game in enumerate(targets):
            name = game['name']
            slug = matches[name].get('slug', '')
            print(f"[{i+1}/{len(targets)}] {name} ({game.get('provider', '?')})", end="", flush=True)

            symbols, meta = extract_all_symbols(name, slug, model=args.model)
            if symbols is None:
                print(f" — skipped: {meta}")
                continue

            total_in += meta['input_tokens']
            total_out += meta['output_tokens']

            if symbols and len(symbols) > len(game.get('symbols', [])):
                print(f" — {len(symbols)} symbols (was {len(game.get('symbols', []))})")
                if args.apply:
                    game['symbols'] = symbols
                    upgraded += 1
            elif symbols:
                print(f" — {len(symbols)} symbols (no improvement over {len(game.get('symbols', []))})")
            else:
                print(f" — no symbols found")

            if args.apply and (i + 1) % 25 == 0:
                safe_write_master(master, "all-symbol checkpoint")
                print(f"  [checkpoint saved]")

        if args.apply and upgraded > 0:
            safe_write_master(master, "all-symbol final")
            print(f"\nSaved {upgraded} games with upgraded symbols to master.")

        cost = (total_in * 3 + total_out * 15) / 1_000_000
        print(f"\nAll-symbol extraction: {upgraded}/{len(targets)} games upgraded")
        print(f"  Tokens: {total_in:,} in, {total_out:,} out")
        print(f"  Est. cost: ${cost:.2f}")

    elif args.run_all or args.batch:
        # Full extraction on all games with HTML rules
        TABLE_GAME_KEYWORDS = {'blackjack', 'roulette', 'baccarat', 'poker', 'craps', 'keno', 'bingo'}
        NON_SLOT_CATEGORIES = {'Lottery', 'Instant Win', 'Table Game', 'Live Casino', 'Video Poker'}

        all_games = []
        skipped_table = 0
        skipped_extracted = 0
        skipped_sparse = 0
        sparse_log = []
        for game in master:
            name = game.get('name', '')
            if name not in matches:
                continue
            if name in training_names:
                continue
            if game.get('extraction_date'):
                skipped_extracted += 1
                continue

            game_cat = game.get('game_category', '')
            name_lower = name.lower()
            if game_cat in NON_SLOT_CATEGORIES or any(kw in name_lower for kw in TABLE_GAME_KEYWORDS):
                skipped_table += 1
                continue

            slug = matches[name].get('slug', '')
            html_path = RULES_HTML_DIR / f"{slug}.html"
            if not html_path.exists():
                continue

            if game.get('data_confidence') == 'sparse_html':
                skipped_sparse += 1
                continue

            with open(html_path) as f:
                raw_html = f.read()
            clean = clean_html_for_claude(raw_html)
            if len(clean) < 2000:
                game['data_confidence'] = 'sparse_html'
                game['extraction_notes'] = f'HTML too sparse ({len(clean)} chars)'
                skipped_sparse += 1
                sparse_log.append(f"{name}\t{game.get('provider','?')}\t{len(clean)} chars")
                continue

            all_games.append({
                'name': name,
                'slug': slug,
                'provider': game.get('provider', '?')
            })

        if skipped_table:
            print(f"Skipped {skipped_table} table games")
        if skipped_extracted:
            print(f"Skipped {skipped_extracted} already-extracted games")
        if skipped_sparse:
            print(f"Skipped {skipped_sparse} sparse HTML games (flagged as sparse_html)")
            sparse_file = DATA_DIR / "extraction_sparse_games.txt"
            with open(sparse_file, 'w') as f:
                f.write('\n'.join(sparse_log))
            print(f"  Sparse games logged to {sparse_file}")

        if args.offset:
            all_games = all_games[args.offset:]
        if args.limit:
            all_games = all_games[:args.limit]

        print(f"EXTRACTION: {len(all_games)} games ({'BATCH' if args.batch else 'SEQUENTIAL'})")
        print(f"Model: {args.model}")

        results_file = DATA_DIR / "extraction_results.jsonl"
        checkpoint_file = DATA_DIR / "extraction_checkpoint.json"

        if results_file.exists() and args.offset == 0:
            ts = time.strftime('%Y%m%d_%H%M%S')
            rotated = DATA_DIR / f"extraction_results_{ts}.jsonl"
            results_file.rename(rotated)
            print(f"Rotated previous results to {rotated.name}")

        if args.batch:
            # ─── Batch API mode (50% cheaper + prompt caching) ───
            _run_batch_extraction(all_games, master, master_lookup, examples,
                                  system_prompt, args.model, args.apply,
                                  results_file, checkpoint_file)
        else:
            # ─── Sequential mode (with caching + retries) ───
            _run_sequential_extraction(all_games, master, master_lookup, examples,
                                       system_prompt, args.model, args.apply,
                                       results_file, checkpoint_file)

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
