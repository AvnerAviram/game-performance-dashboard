#!/usr/bin/env python3
"""
Art classification pipeline v2.
- Claude Vision + SC review text (dual-source)
- IS/IS NOT classification cards for every dimension
- Specific color vocabulary (up to 3 colors, not buckets)
- art_style dropped
- Confidence scoring per dimension
- Deterministic post-processing
"""

import base64
import json
import os
import re
import sys
import time

from bs4 import BeautifulSoup

sys.stdout.reconfigure(line_buffering=True)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SC_DIR = os.path.join(SCRIPT_DIR, '_legacy', 'sc_cache')
SCREENSHOT_DIR = os.path.join(SCRIPT_DIR, 'screenshots')
MASTER_PATH = os.path.join(SCRIPT_DIR, 'game_data_master.json')
ENV_PATH = os.path.join(SCRIPT_DIR, '.env')

PIPELINE_DIR = os.path.join(SCRIPT_DIR, 'art_pipeline')
GT_V2_PATH = os.path.join(PIPELINE_DIR, 'ground_truth.json')
CORRECTIONS_PATH = os.path.join(PIPELINE_DIR, 'corrections.json')
RESULTS_PATH = os.path.join(PIPELINE_DIR, 'results.json')
USER_REVIEWS_PATH = os.path.join(PIPELINE_DIR, 'user_reviews.json')
RUN_LOG_PATH = os.path.join(PIPELINE_DIR, 'run_log.json')
OUTPUT_PATH = os.path.join(SCRIPT_DIR, 'art_v2_results.json')

MODEL = "claude-sonnet-4-20250514"

# ─── Color Vocabulary (specific colors, not buckets) ─────────────
COLOR_VOCABULARY = [
    "Gold", "Red", "Blue", "Green", "Purple", "Black", "White",
    "Silver", "Orange", "Pink", "Brown", "Teal", "Bronze", "Amber",
    "Crimson", "Yellow", "Copper", "Neon Blue", "Neon Green", "Neon Pink",
    "Gray", "Light Blue", "Beige", "Dark Green",
]
COLOR_SET = {c.lower() for c in COLOR_VOCABULARY}

# ─── Theme Vocabulary ────────────────────────────────────────────
VALID_THEMES = [
    "Egyptian/Pharaoh", "Ancient Greece/Rome", "Norse/Viking Realm", "Aztec/Mayan",
    "Asian Temple/Garden", "Arabian Palace/Bazaar", "Indian/South Asian",
    "Medieval Castle", "Prehistoric/Primordial", "Irish/Celtic Highlands",
    "Jungle/Rainforest", "Deep Ocean/Underwater", "Tropical Island/Beach",
    "Arctic/Snow", "Desert/Sahara", "Mountain/Volcano", "Savanna/Wildlife",
    "Prairie/Plains/Grassland", "Australian Outback", "Sky/Clouds",
    "Lakeside/River/Fishing Dock", "Farm/Countryside", "Forest/Woodland",
    "Fantasy/Fairy Tale", "Haunted Manor/Graveyard", "Outer Space",
    "Urban/Modern City", "Neon/Cyber City", "Casino Floor", "Luxury/VIP",
    "Wild West/Frontier", "Pirate Ship/Port", "Crime/Heist", "Sports",
    "Music/Entertainment", "Food/Cooking", "Mexican/Latin Village",
    "Steampunk/Victorian", "Circus/Carnival", "Branded/Licensed",
    "Classic Slots", "Fruit Machine", "Candy/Sweet World",
    "Royal Palace/Court", "Treasure Cave/Mine", "Tavern/Saloon",
    "Laboratory/Workshop", "Festive/Holiday",
]
THEME_SET = set(VALID_THEMES)

# ─── Mood Vocabulary ─────────────────────────────────────────────
VALID_MOODS = [
    "Epic/Grand/Heroic", "Dark/Mysterious", "Bright/Fun/Cheerful",
    "Spooky/Horror/Creepy", "Romantic/Dreamy", "Adventurous/Exciting",
    "Serene/Calm/Peaceful", "Intense/Action/Thrilling", "Retro/Nostalgic/Classic",
    "Cartoon/Playful/Fun", "Luxurious/Elegant/Premium", "Rugged/Gritty",
    "Mystical/Magical/Ethereal", "Festive/Holiday/Celebratory",
]
MOOD_SET = set(VALID_MOODS)

# ─── Character Category Mapping (specific name → broad category) ──
CHARACTER_CATEGORIES = {
    "Leprechaun": "Leprechaun",
    "Dragon": "Dragon",
    "Wizard": "Wizard/Sorcerer", "Sorcerer": "Wizard/Sorcerer", "Magician": "Wizard/Sorcerer",
    "Witch": "Wizard/Sorcerer",
    "Warrior": "Warrior/Knight", "Knight": "Warrior/Knight", "Gladiator": "Warrior/Knight",
    "Spartan": "Warrior/Knight", "Soldier": "Warrior/Knight",
    "King": "King/Queen/Royalty", "Queen": "King/Queen/Royalty", "Prince": "King/Queen/Royalty",
    "Princess": "King/Queen/Royalty", "Emperor": "King/Queen/Royalty",
    "Explorer": "Explorer/Adventurer", "Adventurer": "Explorer/Adventurer",
    "Rich Wilde": "Explorer/Adventurer",
    "Pirate": "Pirate", "Captain": "Pirate",
    "Mermaid": "Mermaid/Siren", "Siren": "Mermaid/Siren",
    "Fairy": "Fairy/Elf", "Elf": "Fairy/Elf", "Pixie": "Fairy/Elf",
    "Vampire": "Vampire/Werewolf", "Werewolf": "Vampire/Werewolf", "Dracula": "Vampire/Werewolf",
    "Cowboy": "Cowboy", "Cowgirl": "Cowboy",
    "Ra": "Egyptian Deity", "Anubis": "Egyptian Deity", "Cleopatra": "Egyptian Deity",
    "Horus": "Egyptian Deity", "Isis": "Egyptian Deity", "Osiris": "Egyptian Deity",
    "Bastet": "Egyptian Deity", "Pharaoh": "Egyptian Deity",
    "Zeus": "Greek/Roman Deity", "Poseidon": "Greek/Roman Deity", "Athena": "Greek/Roman Deity",
    "Apollo": "Greek/Roman Deity", "Ares": "Greek/Roman Deity", "Hades": "Greek/Roman Deity",
    "Hermes": "Greek/Roman Deity", "Medusa": "Greek/Roman Deity",
    "Hercules": "Greek/Roman Deity", "Aphrodite": "Greek/Roman Deity",
    "Thor": "Norse Deity", "Odin": "Norse Deity", "Loki": "Norse Deity",
    "Freya": "Norse Deity", "Viking": "Norse Deity",
    "Lion": "Wild Animals", "Wolf": "Wild Animals", "Eagle": "Wild Animals",
    "Bear": "Wild Animals", "Tiger": "Wild Animals", "Panther": "Wild Animals",
    "Gorilla": "Wild Animals", "Elephant": "Wild Animals", "Rhino": "Wild Animals",
    "Jaguar": "Wild Animals", "Stag": "Wild Animals", "Deer": "Wild Animals",
    "Buffalo": "Wild Animals", "Bull": "Wild Animals", "Bison": "Wild Animals",
    "Shark": "Sea Creatures", "Octopus": "Sea Creatures", "Fish": "Sea Creatures",
    "Whale": "Sea Creatures", "Dolphin": "Sea Creatures", "Turtle": "Sea Creatures",
    "Seahorse": "Sea Creatures",
    "Phoenix": "Mythical Beast", "Griffin": "Mythical Bear", "Unicorn": "Mythical Beast",
    "Pegasus": "Mythical Beast", "Hydra": "Mythical Beast", "Minotaur": "Mythical Beast",
    "Cerberus": "Mythical Beast",
    "Robot": "Robot/Android", "Android": "Robot/Android",
    "Ninja": "Ninja/Samurai", "Samurai": "Ninja/Samurai",
    "Alien": "Alien/Extraterrestrial",
    "Detective": "Detective/Spy", "Spy": "Detective/Spy",
    "Luchador": "Luchador/Fighter", "Boxer": "Luchador/Fighter", "Fighter": "Luchador/Fighter",
    "Monkey": "Monkey/Ape", "Ape": "Monkey/Ape", "Gorilla": "Monkey/Ape",
    "Panda": "Panda/Bear",
    "Peacock": "Bird", "Parrot": "Bird", "Owl": "Bird", "Hawk": "Bird",
    "Raven": "Bird", "Crane": "Bird", "Rooster": "Bird",
    "Dinosaur": "Dinosaur/Prehistoric Beast", "T-Rex": "Dinosaur/Prehistoric Beast",
    "Cat": "Domestic Animals", "Dog": "Domestic Animals", "Horse": "Domestic Animals",
    "Pig": "Domestic Animals", "Chicken": "Domestic Animals", "Fox": "Domestic Animals",
    "Rabbit": "Domestic Animals", "Donkey": "Domestic Animals", "Sheep": "Domestic Animals",
    "Joker": "Joker/Jester/Clown", "Jester": "Joker/Jester/Clown", "Clown": "Joker/Jester/Clown",
    "Jimi Hendrix": "Celebrity/Licensed Character", "Elvis": "Celebrity/Licensed Character",
    "Ozzy Osbourne": "Celebrity/Licensed Character", "Gordon Ramsay": "Celebrity/Licensed Character",
    "Skunk": "Skunk/Raccoon/Small Critter", "Raccoon": "Skunk/Raccoon/Small Critter",
    "Boy": "Human Character", "Girl": "Human Character", "Lady": "Human Character",
    "Man": "Human Character", "Woman": "Human Character", "Child": "Human Character",
    "Children": "Human Character", "Old Man": "Human Character",
}

VALID_CHARACTERS = list(set(
    list(CHARACTER_CATEGORIES.keys())
    + ["No Characters (symbol-only game)", "Celebrity/Licensed Character",
       "Cartoon/Mascot Character"]
))
CHARACTER_SET = set(VALID_CHARACTERS)

# ─── Element Vocabulary (visual screen elements, NOT reel symbols) ──
# Only distinctive effects that define a game's visual identity
VALID_ELEMENTS_EFFECTS = [
    "Fire/Flames", "Lightning/Electricity", "Fog/Mist/Smoke",
    "Water Effects", "Snow/Ice Effects", "Neon Glow", "Bubbles",
    "Magic Energy/Spell Effects", "Fireworks",
]
VALID_ELEMENTS_FRAME = [
    "Stone Frame", "Wood Frame",
    "Crystal/Glass Frame", "Metal Frame", "Marble Frame",
    "Bamboo Frame", "Neon/LED Frame", "Colored Frame",
    "Minimal/No Frame",
]
VALID_ELEMENTS_SCENE = [
    "Pyramids/Temples", "Mountains", "Castle/Fortress/Tower",
    "Trees/Forest", "Coral Reef/Underwater", "Fields/Grassland",
    "Village/Town", "Farmhouse/Barn", "Mansion/Palace",
    "Victorian Buildings", "Arab/Middle Eastern Architecture",
    "Asian Architecture", "Stone Arch/Gateway",
    "Underwater Structures", "Sports Arena/Stadium",
    "Casino Interior", "Kitchen/Appliances",
    "Japanese Garden/Trees", "Bamboo/Tropical Plants",
    "Bank/Vault Building", "Viking Ship/Village",
    "Basketball Court", "Stairs/Steps",
]
VALID_ELEMENTS_DECOR = [
    "Torches", "Lanterns", "Candles",
    "Columns/Pillars",
    "Vines/Ivy/Plants", "Statues/Sculptures",
    "Masks/Tribal Art", "Weapons (swords/shields)",
    "Books/Scrolls/Maps", "Chains/Locks/Keys", "Musical Instruments",
    "Food/Drinks", "Clocks/Gears/Mechanical", "Banners/Flags",
    "Skulls/Bones", "Crowns/Royal Jewelry",
    "Animals (decorative)", "Ships/Boats",
    "Speakers/DJ Equipment", "Hieroglyphs/Ancient Writing",
    "Disco Ball", "Stage Lights", "Badge/Shield Emblem",
    "Chandeliers", "Christmas Decorations", "Snowflakes/Snow",
    "Rope Frame", "Stars/Planets",
    "Ancient Stone Carvings", "Asian Lanterns/Decorations",
    "Fighting Ring/Cage", "Safe/Vault/Chest",
    "Spacecraft/UFO/Sci-Fi Objects", "Office Items",
    "City Landmarks/Skyline", "Train/Railway Station",
    "Gifts/Wrapped Presents", "Coin Stacks",
]
VALID_ELEMENTS = VALID_ELEMENTS_EFFECTS + VALID_ELEMENTS_FRAME + VALID_ELEMENTS_SCENE + VALID_ELEMENTS_DECOR
ELEMENT_SET = set(VALID_ELEMENTS)

# ─── Narrative Vocabulary ────────────────────────────────────────
VALID_NARRATIVES = [
    "Treasure Hunt", "Quest/Adventure/Journey", "Battle/Combat/War",
    "Discovery/Exploration", "Magic Show/Sorcery", "Heist/Robbery/Escape",
    "Rescue Mission", "Competition/Tournament/Race", "Celebration/Festival/Party",
    "Collection/Harvest/Gathering", "Survival/Horror", "Love Story/Romance",
    "Fairy Tale/Storybook", "Wealth/Fortune/Prosperity", "Fishing/Angling",
    "Music/Performance/Concert", "Crime/Mystery/Detective",
    "Branded/Licensed Story (TV, movie, celebrity)",
    "Cultural/Mythological Story", "No Narrative (classic/abstract)",
]
NARRATIVE_SET = set(VALID_NARRATIVES)

# ═══════════════════════════════════════════════════════════════════
# IS/IS NOT CLASSIFICATION CARDS
# ═══════════════════════════════════════════════════════════════════

THEME_CARDS = """
CLASSIC SLOTS:
  IS: Games with traditional 3-reel or 5-reel simple layouts featuring classic symbols: bars, sevens (7s), bells, single/double/triple diamonds, cherries. Abstract background, minimal theming. The visual identity IS the simplicity. Includes multiplier-themed games (2x, 3x, 10x) that are fundamentally classic slot machines with a gimmick.
  NOT: Fruit Machine (which has a UK fruit machine aesthetic with holds/nudges). Games that have a clear themed setting (Egyptian, pirate, etc.) even if they use a simple reel layout.
  CRITICAL: If the game name contains multiplier numbers (2x, 3x, 10x) AND has classic slot symbols (bars, sevens, diamonds) → Classic Slots. If it has fire/flame effects but classic symbols → still Classic Slots (mood = Intense, not theme = something else). "Blazing" or "Flaming" + classic symbols = Classic Slots with Intense mood.

FRUIT MACHINE:
  IS: Specifically British-style pub fruit machines with holds, nudges, trails, feature boards. UK aesthetic with fruits, nudge buttons, hold buttons.
  NOT: Classic Slots that happen to have fruit symbols. American-style slots with fruits. Any non-UK-style fruit game.
  CRITICAL: Most slots with fruit symbols are Classic Slots, NOT Fruit Machine. Only use Fruit Machine for explicit UK pub machine aesthetic.

CASINO FLOOR:
  IS: Games visually set ON a casino floor — you see card tables, roulette wheels, casino interior, chips, dealers. The SETTING is inside a casino.
  NOT: Games about money/cash/gold that have no actual casino interior. Games with multiplier symbols. Abstract games with gold colors. "Cash" in the name does NOT mean Casino Floor.
  CRITICAL: 10X Cash, Dollar signs, green money themes → NOT Casino Floor (those are wealth-themed Classic Slots or Luxury/VIP). Casino Floor requires visual casino SETTING.

LUXURY/VIP:
  IS: Games with a wealthy, high-roller, champagne-and-diamonds aesthetic. Limo, penthouse, jewelry, VIP lounge vibe.
  NOT: Standard gold-colored games. Casino Floor (casino interior). Classic Slots with gold.

EGYPTIAN/PHARAOH:
  IS: Ancient Egypt setting — pyramids, pharaohs, hieroglyphics, Nile, scarabs, Book of the Dead.
  NOT: Generic ancient or mysterious themes without Egyptian elements.

AZTEC/MAYAN:
  IS: Pre-Columbian Mesoamerican setting — temples, jungle pyramids, stone carvings, Aztec/Mayan iconography.
  NOT: Generic jungle (use Jungle/Rainforest). Native American themes.
  CRITICAL: Aztec Chief-type games are warriors/chieftains, NOT King/Queen/Royalty. Aztec leaders are warriors, not European royalty.

ANCIENT GREECE/ROME:
  IS: Greek/Roman mythology, temples, columns, togas, gods (Zeus, Apollo, Athena, Poseidon).
  NOT: Renaissance art. Generic ancient themes.
"""

MOOD_CARDS = """
INTENSE/ACTION/THRILLING:
  IS: High energy, adrenaline, fire, explosions, dramatic tension. Games with flames, blazing effects, lightning, powerful energy.
  NOT: Simple bright/colorful games. Games that are merely dramatic in theme but calm in visual presentation.
  CRITICAL: If the game has fire/flame effects → Intense, NOT Bright/Fun/Cheerful. "Blazing", "Flaming", "Fire", "Inferno" → always Intense. Blue flames are still Intense.

BRIGHT/FUN/CHEERFUL:
  IS: Light, happy, colorful, upbeat. Candy, fruits, cartoons, party vibes. No darkness or intensity.
  NOT: Games with fire (those are Intense). Games with just bright colors but intense/dramatic mood.

RETRO/NOSTALGIC/CLASSIC:
  IS: Games that evoke nostalgia for classic slot machines. Simple, traditional, "old school" feel. Muted or traditional color palettes.
  NOT: Modern-looking games that happen to have classic symbols. Games with neon/flashy effects.

EPIC/GRAND/HEROIC:
  IS: Sweeping, majestic, powerful. Gods, warriors, vast landscapes, heroic music feel. Grand scale.
  NOT: Simply "big" looking games. Games that are intense but not grand in scope.

LUXURIOUS/ELEGANT/PREMIUM:
  IS: Sophisticated, wealthy, refined. Gold, diamonds, champagne, velvet. High-end casino feel.
  NOT: Games that just have gold colors. Casino Floor games (which are about the setting, not the mood).

DARK/MYSTERIOUS:
  IS: Shadowy, enigmatic, twilight tones. Mystery, hidden secrets, deep blues/purples.
  NOT: Horror/creepy (use Spooky). Simply night-themed.

MYSTICAL/MAGICAL/ETHEREAL:
  IS: Otherworldly, enchanted, dreamy magic. Fairy dust, glowing runes, enchanted forests.
  NOT: Epic/heroic (which is grand and powerful, not ethereal). Simple fantasy without magical atmosphere.
"""

COLOR_CARDS = """
COLOR CLASSIFICATION RULES:
  You must list the 1-3 DOMINANT colors you actually SEE on screen (or would see based on the review description).
  Order by visual dominance: the color that takes the most screen area is first.

  IS: The actual pigment/hue visible in the game's background, frame, effects, and overall color palette.
  NOT: The color of individual reel symbols. The color described in the game name (unless it matches what you see).

  CRITICAL RULES:
  - "Warm" is NOT a color. List the actual colors: Gold, Red, Orange, Amber, etc.
  - "Cool" is NOT a color. List the actual colors: Blue, Purple, Silver, Teal, etc.
  - A game with gold accents on a green background → ["Green", "Gold"], not "Warm"
  - A game with purple background and gold trim → ["Purple", "Gold"]
  - Fire/flame games: what color are the flames? Blue fire → "Blue". Orange fire → "Orange". Red fire → "Red".
  - If the background is predominantly one color with small accents, list only the dominant 1-2 colors.
  - If screenshot is available, use what you ACTUALLY SEE, not what you'd guess from the theme.
  - IGNORE the operator/casino website header bar at the very top of screenshots — it is NOT part of the game's art.
    A thin blue/green/red bar at the top edge is the website UI, not the game's color palette.
"""

CHARACTER_CARDS = """
CHARACTER CLASSIFICATION RULES:
  Characters are LARGE, PROMINENT character artwork visible on the screen OUTSIDE the reel grid — NOT reel symbols.

  MANY slot games DO have characters — look carefully! Common locations:
  - ABOVE the reels (mascots, game heroes, themed characters)
  - LEFT/RIGHT side panels (flanking characters, standing figures)
  - BELOW the reels or integrated into the frame
  - BACKGROUND artwork (large characters behind the reels)

  IS: Large character illustrations flanking the reels (left/right side panels). Big artwork ABOVE or BELOW the reels.
  A prominent figure that is part of the game's visual FRAME or BACKGROUND — visible whether the reels are spinning or not.
  IS NOT: A character that only appears in the game LOGO/TITLE — logo mascots are NOT real characters.
  Only count characters that are large standalone artwork elements on the game screen itself.
  Examples: A tiger sitting above the reels, a magician beside the reels with a crystal ball, a leprechaun on a side panel,
  an explorer character on the left of the screen, a deity figure above the game title.
  NOT: Images that ONLY appear ON the spinning reels as symbols. This includes:
  - High-paying symbol artwork (gods, warriors, animals, people) shown ONLY on the reel grid
  - Playing card symbols (J, Q, K, A). Tiny background figures.

  THE REEL TEST: Look at the screenshot. Mentally draw a rectangle around the reel grid (where symbols spin).
  Now look ONLY at the area OUTSIDE that rectangle. Do you see a large character there? If YES → classify it.
  If ALL character-like images are INSIDE the reel rectangle → "No Characters (symbol-only game)".

  IMPORTANT: If a character appears BOTH as a reel symbol AND as large artwork outside the reels, it IS a character.

  USE SPECIFIC NAMES — NOT CATEGORIES:
  - Use the SPECIFIC character name: "Tiger", "Apollo", "Anubis", "Phoenix", "Leprechaun", "Magician", "Rich Wilde"
  - Do NOT use broad categories like "Wild Animals", "Greek/Roman Deity", "Egyptian Deity"
  - If unknown, use the most specific descriptive name: "Asian Boy", "Lady in Red", "Old Wizard"

  CRITICAL RULES:
  - A god/animal/person appearing ONLY as a reel symbol → "No Characters (symbol-only game)"
  - A god/animal/person with LARGE artwork OUTSIDE the reel area → classify with SPECIFIC name
  - Aztec/Mayan chiefs → "Warrior" or "Chief", NOT "King"
  - EXCEPTION for cluster/grid games (Reactoonz, etc.): In games where cartoon/alien characters fill the ENTIRE grid
    (not traditional spinning reels), these characters often ALSO appear as large art in the background or frame.
    If you see such characters as both grid pieces AND prominent background/frame art, classify them.
  - When in doubt, look harder at the area outside the reels before defaulting to "No Characters".
"""

ELEMENT_CARDS = """
ELEMENT CLASSIFICATION RULES:
  Elements are visual design components you can see OUTSIDE the reel grid.
  Draw a rectangle around the spinning reels. Everything OUTSIDE that rectangle is where elements live:
  the background scene, the frame/border, side panels, top area, bottom area.

  IS an element: A pyramid in the background. A mountain range behind the reels. A stone frame around the reels.
    Statues flanking the reels. Trees in the background. A farmhouse in the distance. Fire effects on the frame.
  NOT an element: A pyramid that only appears as a small image ON the spinning reels (that is a SYMBOL).
    Generic glow, sparkles, light rays, shimmer — ignore these, they appear in almost every slot and are not useful.

  WHAT TO LOOK FOR (scan the ENTIRE screen outside the reels):
  1. BACKGROUND SCENE — What is behind/around the reels?
     Pyramids, mountains, castles, temples, forests, ocean floor, villages, cities, farmland, arenas,
     Japanese gardens, Arab/Middle Eastern buildings, Victorian streets, Asian architecture, underwater ruins
  2. FRAME/BORDER — What material is the frame made of?
     Gold, stone, wood, metal, crystal, marble, bamboo, neon, colored (purple/red/blue), or minimal/none
  3. DECORATIVE OBJECTS — What objects are placed around the reels?
     Statues, columns, torches, lanterns, candles, weapons, shields, bamboo, vines, chandeliers,
     disco balls, speakers, hieroglyphs, stone carvings, Asian lanterns, skulls, banners,
     fireworks, Christmas decorations, snowflakes, books/scrolls, musical instruments
  4. PROMINENT EFFECTS — Only effects that DEFINE the game's look:
     Fire/flames, lightning, fog/smoke, water, snow/ice, neon glow, magic energy, bubbles, fireworks
     (Do NOT list glow, sparkles, light rays, shimmer — these are generic and not useful)

  CRITICAL: Be thorough. Scan every corner. Most games have 3-6 elements. List what makes THIS game visually unique.
"""


# ═══════════════════════════════════════════════════════════════════
# CROSS-CUTTING CRITICAL RULES
# ═══════════════════════════════════════════════════════════════════

CRITICAL_RULES = """
1. FIRE = INTENSE: Any game with fire, flames, blazing, inferno effects → mood MUST be "Intense/Action/Thrilling", NEVER "Bright/Fun/Cheerful". This is the #1 most common error.
2. MONEY ≠ CASINO FLOOR: Games about money, cash, gold, dollar signs are NOT "Casino Floor". Casino Floor requires a visual casino interior (tables, roulette, dealers). Money/cash themed games are usually "Classic Slots" or "Luxury/VIP".
3. 3-REEL + 7s/BARS = CLASSIC SLOTS: If the game has 3 reels with sevens, bars, diamonds, or bells → "Classic Slots", regardless of color effects or name gimmicks (2x, 3x, 10x, etc.).
4. AZTEC WARRIORS ≠ ROYALTY: Aztec/Mayan chieftains and warriors are NOT "King/Queen/Royalty". They're "Explorer/Adventurer" or "Warrior/Knight".
5. FLAMES COLOR: Blue fire → color is "Blue". Orange fire → "Orange". Red fire → "Red". Don't default to "Warm" or "Gold" for fire.
6. FRUIT MACHINE IS RARE: Most games with fruit symbols are "Classic Slots", NOT "Fruit Machine". Only use Fruit Machine for explicitly British-style pub fruit machines.
7. COLOR FROM EYES, NOT THEME: Classify colors based on what you ACTUALLY SEE (or what the review describes seeing), not what you'd assume from the theme name. An "Egyptian" game could be blue, purple, or gold — look at the actual visual.
8. MOOD FROM VISUALS, NOT NAME: A game called "Lucky" isn't automatically "Bright/Fun/Cheerful". Look at the actual visual mood — dark games with "Lucky" in the name are still "Dark/Mysterious".
9. SECONDARY THEME NEEDS EVIDENCE: Only assign a secondary theme if there is EXPLICIT visual evidence. Don't infer secondary themes from abstract concepts.
10. ELEMENTS ARE SCREEN-LEVEL: Elements describe the background, frame, effects, and decorative objects — NOT the symbols on the reels.
"""


# ─── Symbol→Element keyword mapping ──────────────────────────────
SYMBOL_ELEMENT_HINTS = {
    r'\bpyramid': 'Pyramids/Temples/Ancient Structures',
    r'\btemple': 'Pyramids/Temples/Ancient Structures',
    r'\bstatue': 'Statues/Sculptures',
    r'\bsculpture': 'Statues/Sculptures',
    r'\bvault': 'Safe/Vault/Chest',
    r'\bsafe\b': 'Safe/Vault/Chest',
    r'\bchest\b': 'Safe/Vault/Chest',
    r'\btorch': 'Torches',
    r'\blantern': 'Lanterns',
    r'\bcandle': 'Candles',
    r'\bcoin': 'Coins/Gold Piles',
    r'\bgold\b': 'Coins/Gold Piles',
    r'\bgem': 'Gems/Jewels',
    r'\bjewel': 'Gems/Jewels',
    r'\bcrystal': 'Gems/Jewels',
    r'\bdiamond': 'Gems/Jewels',
    r'\bruby': 'Gems/Jewels',
    r'\bsapphire': 'Gems/Jewels',
    r'\bemerald': 'Gems/Jewels',
    r'\bsword': 'Weapons (swords/shields)',
    r'\bshield': 'Weapons (swords/shields)',
    r'\baxe\b': 'Weapons (swords/shields)',
    r'\bdagger': 'Weapons (swords/shields)',
    r'\bbook\b': 'Books/Scrolls/Maps',
    r'\bscroll': 'Books/Scrolls/Maps',
    r'\bmap\b': 'Books/Scrolls/Maps',
    r'\bskull': 'Skulls/Bones',
    r'\bbone': 'Skulls/Bones',
    r'\bcrown': 'Crowns/Royal Jewelry',
    r'\btiara': 'Crowns/Royal Jewelry',
    r'\bfountain': 'Statues/Sculptures',
    r'\bgate\b': 'Columns/Pillars',
    r'\bcolumn': 'Columns/Pillars',
    r'\bpillar': 'Columns/Pillars',
    r'\bmask': 'Masks/Tribal Art',
    r'\bpotion': 'Potions/Bottles',
    r'\bship\b': 'Ships/Boats',
    r'\bboat\b': 'Ships/Boats',
    r'\bspaceship': 'Spacecraft/UFO/Sci-Fi Objects',
    r'\bufo\b': 'Spacecraft/UFO/Sci-Fi Objects',
    r'\bflame': 'Fire/Flames',
    r'\bfire\b': 'Fire/Flames',
    r'\blightning': 'Lightning/Electricity',
    r'\bthunder': 'Lightning/Electricity',
    r'\bvine': 'Vines/Ivy/Plants',
    r'\bivy\b': 'Vines/Ivy/Plants',
    r'\bflower': 'Vines/Ivy/Plants',
    r'\bmusic': 'Musical Instruments',
    r'\bguitar': 'Musical Instruments',
    r'\bdrum': 'Musical Instruments',
    r'\bchain': 'Chains/Locks/Keys',
    r'\block\b': 'Chains/Locks/Keys',
    r'\bkey\b': 'Chains/Locks/Keys',
    r'\bgear': 'Clocks/Gears/Mechanical',
    r'\bclock': 'Clocks/Gears/Mechanical',
    r'\bbanner': 'Banners/Flags/Ribbons',
    r'\bflag': 'Banners/Flags/Ribbons',
}


def load_game_symbols():
    """Load symbol names from game_data_master.json, indexed by normalized game name."""
    if not os.path.exists(MASTER_PATH):
        return {}
    with open(MASTER_PATH) as f:
        games = json.load(f)
    index = {}
    for g in games:
        name = g.get('name', '')
        syms = g.get('symbols', [])
        if syms:
            sym_names = []
            for s in syms:
                if isinstance(s, dict):
                    sym_names.append(s.get('name', ''))
                elif isinstance(s, str):
                    sym_names.append(s)
            index[name.lower().strip()] = sym_names
    return index


def find_symbols_for_game(symbol_index, game_name):
    """Match game name to symbol index. Strict matching to avoid cross-contamination."""
    name_lower = game_name.lower().strip()
    name_clean = re.sub(
        r'\s*(slot|demo|review|free|play|🎰|✔️|&|by ags).*', '',
        name_lower, flags=re.IGNORECASE,
    ).strip()

    if name_clean in symbol_index:
        return symbol_index[name_clean]

    for key, syms in symbol_index.items():
        if name_clean == key:
            return syms

    for key, syms in symbol_index.items():
        if name_clean in key or key in name_clean:
            name_words = set(name_clean.split())
            key_words = set(key.split())
            overlap = name_words & key_words
            non_generic = overlap - {'the', 'of', 'and', 'a', 'link', 'diamond', 'gold', 'mega', 'super'}
            if len(non_generic) >= 2:
                return syms

    return []


def load_api_key():
    with open(ENV_PATH) as f:
        for line in f:
            if line.startswith('ANTHROPIC_API_KEY='):
                return line.strip().split('=', 1)[1]
    raise RuntimeError('ANTHROPIC_API_KEY not found in .env')


def load_ground_truth():
    if not os.path.exists(GT_V2_PATH):
        return []
    with open(GT_V2_PATH) as f:
        gt = json.load(f)
    games = gt.get('games', [])
    if isinstance(games, dict):
        return list(games.values())
    return games


def load_corrections():
    if not os.path.exists(CORRECTIONS_PATH):
        return {}
    with open(CORRECTIONS_PATH) as f:
        data = json.load(f)
    return data.get('corrections', {})


def build_training_examples(gt_games):
    lines = []
    for g in gt_games:
        colors = g.get('art_color_tone', [])
        color_str = ', '.join(colors) if isinstance(colors, list) else str(colors)
        chars = g.get('art_characters', [])
        char_str = ', '.join(chars[:2])
        sec = f" + {g['art_theme_secondary']}" if g.get('art_theme_secondary') else ""
        lines.append(
            f'  {g["name"]}: theme={g["art_theme"]}{sec}, '
            f'mood={g.get("art_mood","?")}, colors=[{color_str}], '
            f'chars=[{char_str}]'
        )
    return '\n'.join(lines)


def build_system_prompt(training_ref):
    return f"""You are an expert slot game visual art classifier. You analyze game screenshots and/or human-written reviews to classify a game's visual art across multiple dimensions.

You MUST follow the classification cards below. Each card defines what IS and what is NOT a valid classification for that value.

## THEME CLASSIFICATION CARDS
{THEME_CARDS}

## COLOR CLASSIFICATION CARDS
{COLOR_CARDS}

## CHARACTER CLASSIFICATION CARDS
{CHARACTER_CARDS}

## ELEMENT CLASSIFICATION CARDS
{ELEMENT_CARDS}

## CRITICAL CROSS-CUTTING RULES
{CRITICAL_RULES}

## VERIFIED TRAINING EXAMPLES (use as reference):
{training_ref}

## ALLOWED VALUES (use EXACTLY as written):
THEME: {json.dumps(sorted(VALID_THEMES))}
COLOR (pick 2-4, check ENTIRE screen including background sky, side panels, frame border): {json.dumps(COLOR_VOCABULARY)}
CHARACTER: {json.dumps(VALID_CHARACTERS)}
ELEMENTS (pick all that apply):
  EFFECTS: {json.dumps(VALID_ELEMENTS_EFFECTS)}
  FRAME: {json.dumps(VALID_ELEMENTS_FRAME)}
  SCENE: {json.dumps(VALID_ELEMENTS_SCENE)}
  DECOR: {json.dumps(VALID_ELEMENTS_DECOR)}
NARRATIVE: {json.dumps(VALID_NARRATIVES)}

## OUTPUT FORMAT
Return ONLY a raw JSON object (no markdown, no backticks):
{{
  "art_theme": "...",
  "art_theme_secondary": "..." or null,
  "art_color_tone": ["Primary", "Secondary", "Tertiary"],
  "art_characters": ["Tiger", "Apollo", ...] or ["No Characters (symbol-only game)"],
  "art_character_locations": {{"character_name": "outside_reels" or "reel_only"}},
  "art_elements": ["..."],
  "art_narrative": "...",
  "is_branded": true/false,
  "confidence": {{
    "theme": 1-5,
    "color": 1-5,
    "characters": 1-5,
    "elements": 1-5,
    "narrative": 1-5
  }}
}}

IMPORTANT for art_character_locations: For EACH character you list, you MUST specify where it appears:
- "outside_reels" = character artwork is OUTSIDE the reel grid (side panels, above/below reels, background)
- "reel_only" = character ONLY appears as a symbol ON the spinning reels
Only characters with "outside_reels" should be in art_characters. If ALL are "reel_only", use ["No Characters (symbol-only game)"].

IMPORTANT for art_color_tone: Output EXACTLY 4 colors in most cases. After identifying the 3 most dominant colors, ALWAYS look for a 4th:
- Is there a visible sky/background color? → "Light Blue", "Blue"
- Is the frame/border a distinct color? → "Gray", "Brown", "Gold"
- Are there accent/highlight colors? → "Pink", "White", "Teal"
- Check: reel area, background BEHIND reels, frame/border material, side panels, top/bottom areas
Only use 3 colors for truly monochrome/limited-palette games (e.g., black + red + gold with nothing else).
Include background colors like sky blue ("Light Blue"), frame gray ("Gray"), pink accents, etc."""


def extract_review(fname):
    path = os.path.join(SC_DIR, fname)
    with open(path, encoding='utf-8', errors='replace') as f:
        html = f.read()
    soup = BeautifulSoup(html, 'html.parser')
    h1 = soup.find('h1')
    name = h1.get_text(strip=True) if h1 else fname.replace('.html', '')
    review_h2 = soup.find('h2', string=re.compile(r'Review', re.IGNORECASE))
    review_text = ''
    if review_h2:
        current = review_h2.find_next_sibling()
        while current:
            if current.name == 'h2':
                break
            t = current.get_text(strip=True) if current.name else ''
            if t and len(t) > 20:
                review_text += t + '\n'
            current = current.find_next_sibling()
    return name, review_text


def detect_media_type(filepath):
    with open(filepath, 'rb') as f:
        header = f.read(16)
    if header[:4] == b'RIFF' and header[8:12] == b'WEBP':
        return 'image/webp'
    if header[:3] == b'\xff\xd8\xff':
        return 'image/jpeg'
    if header[:8] == b'\x89PNG\r\n\x1a\n':
        return 'image/png'
    if header[:3] == b'GIF':
        return 'image/gif'
    return 'image/jpeg'


def load_screenshot(fname):
    slug = fname.replace('.html', '')
    for ext in ['.jpg', '.png', '.webp']:
        path = os.path.join(SCREENSHOT_DIR, slug + ext)
        if os.path.exists(path):
            media_type = detect_media_type(path)
            with open(path, 'rb') as f:
                data = f.read()
            return base64.standard_b64encode(data).decode('utf-8'), media_type
    return None, None


def create_masked_screenshot(fname):
    """Black out the reel grid area to help Claude focus on frame/background/decorations."""
    from PIL import Image as PILImage, ImageDraw
    from io import BytesIO

    slug = fname.replace('.html', '')
    for ext in ['.jpg', '.png', '.webp']:
        path = os.path.join(SCREENSHOT_DIR, slug + ext)
        if os.path.exists(path):
            img = PILImage.open(path)
            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGB')
            w, h = img.size
            masked = img.copy()
            draw = ImageDraw.Draw(masked)
            draw.rectangle([int(w * 0.18), int(h * 0.18), int(w * 0.82), int(h * 0.82)],
                           fill=(0, 0, 0))
            buf = BytesIO()
            masked.save(buf, format='JPEG', quality=85)
            return base64.standard_b64encode(buf.getvalue()).decode('utf-8')
    return None


def build_user_message(name, review_text, screenshot_b64=None, media_type=None,
                       symbol_names=None, game_corrections=None, masked_b64=None,
                       rules_text="", description_text=""):
    content = []

    correction_hint = ""
    if game_corrections:
        notes = game_corrections.get('notes', '')
        if notes:
            correction_hint = f"\n\nKNOWN FACTS (verified by human reviewer):\n{notes}\n"

    symbol_hint = ""
    if symbol_names:
        sym_str = ', '.join(s for s in symbol_names if s and len(s) > 1)
        if sym_str:
            symbol_hint = (
                f"\n\nGAME REEL SYMBOLS: {sym_str}\n"
                f"IMPORTANT — THESE ARE REEL SYMBOLS, NOT CHARACTERS:\n"
                f"1. ELEMENT HINTS: Symbol names hint at decorative elements on screen. "
                f"If symbols include 'pyramid', check for pyramids in the background. "
                f"If symbols include 'vault', look for safes/vaults.\n"
                f"2. CHARACTER EXCLUSION: ALL of the above are REEL SYMBOLS that spin on the reels. "
                f"They are NOT characters unless they ALSO appear as LARGE artwork OUTSIDE the reel grid. "
                f"This applies to ALL symbol types — gods, animals, people, creatures, jokers — "
                f"if they only appear ON the reels, they are symbols. "
                f"Do NOT classify any of these as characters unless you can clearly see them "
                f"as large artwork OUTSIDE the reel area in the screenshot."
            )

    extra_context = ""
    if rules_text:
        extra_context += f"\n\nGAME RULES/PAYTABLE TEXT:\n{rules_text[:1500]}\n"
    if description_text:
        extra_context += f"\n\nGAME DESCRIPTION:\n{description_text[:500]}\n"

    if screenshot_b64 and media_type:
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": media_type,
                "data": screenshot_b64,
            }
        })
        content.append({
            "type": "text",
            "text": (
                f"Game: {name}\n\n"
                f"IMAGE 1 above: Full game screenshot. Use for theme, colors, and characters.\n\n"
            ),
        })

        if masked_b64:
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": masked_b64,
                }
            })
            content.append({
                "type": "text",
                "text": (
                    f"IMAGE 2 above: Same screenshot with the reel area blacked out. "
                    f"Use this for ELEMENTS — everything you see here is background, frame, or decoration. "
                    f"Scan all visible areas systematically: top, left, right, bottom, background.\n\n"
                ),
            })

        content.append({
            "type": "text",
            "text": (
                f"Review:\n{review_text[:2500]}"
                f"{symbol_hint}"
                f"{extra_context}"
                f"{correction_hint}"
            ),
        })
    else:
        content.append({
            "type": "text",
            "text": (
                f"Game: {name}\nReview:\n{review_text[:2500]}"
                f"{symbol_hint}"
                f"{extra_context}"
                f"{correction_hint}"
            ),
        })

    return content


# ═══════════════════════════════════════════════════════════════════
# POST-PROCESSING (deterministic fixes)
# ═══════════════════════════════════════════════════════════════════

COLOR_ALIASES = {
    "golden": "Gold", "gilded": "Gold", "yellow-gold": "Gold",
    "dark red": "Crimson", "deep red": "Crimson", "maroon": "Crimson",
    "turquoise": "Teal", "aqua": "Teal", "cyan": "Teal",
    "grey": "Gray", "chrome": "Silver",
    "sky blue": "Light Blue", "light blue": "Light Blue", "pale blue": "Light Blue",
    "tan": "Beige", "cream": "Beige", "sand": "Beige", "khaki": "Beige", "ivory": "Beige",
    "forest green": "Dark Green", "dark green": "Dark Green", "emerald green": "Dark Green",
    "olive": "Dark Green",
    "beige": "Beige",
    "magenta": "Pink", "fuchsia": "Pink", "rose": "Pink",
    "indigo": "Purple", "violet": "Purple", "lavender": "Purple",
    "emerald": "Green", "lime": "Green",
    "navy": "Blue", "cobalt": "Blue", "sapphire": "Blue", "royal blue": "Blue",
    "ruby": "Red", "scarlet": "Red",
    "platinum": "Silver", "pewter": "Silver",
}

ELEMENT_ALIASES = {
    "fire": "Fire/Flames", "flames": "Fire/Flames", "fire effects": "Fire/Flames",
    "lightning": "Lightning/Electricity", "electricity": "Lightning/Electricity",
    "fog": "Fog/Mist/Smoke", "mist": "Fog/Mist/Smoke", "smoke": "Fog/Mist/Smoke",
    "neon": "Neon Glow",
    "gold frame": "Gold Frame", "golden frame": "Gold Frame", "ornate gold frame": "Gold Frame",
    "gold/gilded ornate frame": "Gold Frame", "gilded frame": "Gold Frame",
    "stone frame": "Stone Frame", "carved stone frame": "Stone Frame",
    "wood frame": "Wood Frame", "wood/rustic frame": "Wood Frame", "rustic frame": "Wood Frame",
    "metal frame": "Metal Frame", "metal/iron/steel frame": "Metal Frame", "iron frame": "Metal Frame",
    "marble frame": "Marble Frame", "marble/classical frame": "Marble Frame",
    "bamboo frame": "Bamboo Frame", "bamboo/natural frame": "Bamboo Frame",
    "purple frame": "Colored Frame", "purple/colored frame": "Colored Frame",
    "colored frame": "Colored Frame", "red frame": "Colored Frame",
    "crystal frame": "Crystal/Glass Frame",
    "torches": "Torches", "torch": "Torches",
    "candles": "Candles", "candle": "Candles",
    "lanterns": "Lanterns", "lantern": "Lanterns",
    "torches/lanterns/candles": "Torches",
    "columns": "Columns/Pillars", "pillars": "Columns/Pillars",
    "vines": "Vines/Ivy/Plants", "ivy": "Vines/Ivy/Plants",
    "skulls": "Skulls/Bones", "bones": "Skulls/Bones",
    "mountains": "Mountains", "mountain": "Mountains",
    "mountains/landscape background": "Mountains",
    "trees": "Trees/Forest", "forest": "Trees/Forest",
    "trees/forest background": "Trees/Forest",
    "fields": "Fields/Grassland", "grassland": "Fields/Grassland", "meadow": "Fields/Grassland",
    "fields/grassland/meadow": "Fields/Grassland",
    "pyramids": "Pyramids/Temples", "temples": "Pyramids/Temples",
    "pyramids/temples/ancient structures": "Pyramids/Temples",
    "coral reef": "Coral Reef/Underwater", "coral": "Coral Reef/Underwater",
    "coral reef/underwater structures": "Coral Reef/Underwater",
    "farmhouse": "Farmhouse/Barn", "barn": "Farmhouse/Barn",
    "farmhouse/barn/rural buildings": "Farmhouse/Barn",
    "village": "Village/Town", "town": "Village/Town", "settlement": "Village/Town",
    "village/town/settlement": "Village/Town",
    "mansion": "Mansion/Palace", "palace": "Mansion/Palace", "grand building": "Mansion/Palace",
    "mansion/palace/grand building": "Mansion/Palace",
    "chandeliers": "Chandeliers", "chandeliers/luxury fixtures": "Chandeliers",
    "christmas trees": "Christmas Decorations", "christmas": "Christmas Decorations",
    "christmas trees/holiday decor": "Christmas Decorations",
    "stage lights": "Stage Lights", "stage lights/concert lights": "Stage Lights",
    "disco ball": "Disco Ball", "disco ball/mirror ball": "Disco Ball",
    "ancient stone carvings": "Ancient Stone Carvings",
    "ancient stone carvings/reliefs": "Ancient Stone Carvings",
    "badge": "Badge/Shield Emblem", "badge/star/shield emblem": "Badge/Shield Emblem",
    "basketball court": "Basketball Court", "sports arena": "Sports Arena/Stadium",
    "basketball court/sports arena": "Basketball Court",
    "rope frame": "Rope Frame", "rope border": "Rope Frame",
    "stairs": "Stairs/Steps", "steps": "Stairs/Steps", "staircase": "Stairs/Steps",
    "stars": "Stars/Planets", "planets": "Stars/Planets", "stars and planets": "Stars/Planets",
    "slot machines": "Casino Interior", "casino equipment": "Casino Interior",
    "slot machines/casino equipment": "Casino Interior",
    "banners": "Banners/Flags", "flags": "Banners/Flags",
    "banners/flags/ribbons": "Banners/Flags",
    "office items": "Office Items", "office items (desk, pencils, mugs)": "Office Items",
    "bank": "Bank/Vault Building", "vault building": "Bank/Vault Building",
    "viking ship": "Ships/Boats", "viking village": "Viking Ship/Village",
    "weapons": "Weapons (swords/shields)",
    "asian lanterns": "Asian Lanterns/Decorations",
    "asian decorations": "Asian Lanterns/Decorations",
    "fighting cage": "Fighting Ring/Cage", "fighting ring": "Fighting Ring/Cage",
    "kitchen": "Kitchen/Appliances", "fridge": "Kitchen/Appliances",
    "victorian buildings": "Victorian Buildings", "victorian scenery": "Victorian Buildings",
    "japanese garden": "Japanese Garden/Trees", "japanese trees": "Japanese Garden/Trees",
    "arab architecture": "Arab/Middle Eastern Architecture",
    "middle eastern architecture": "Arab/Middle Eastern Architecture",
    "stone arch": "Stone Arch/Gateway", "gateway": "Stone Arch/Gateway",
    "asian architecture": "Asian Architecture", "asian house": "Asian Architecture",
    "asian statue": "Statues/Sculptures",
    "underwater structures": "Underwater Structures",
    # Map removed noise elements to None (will be filtered)
    "sparkles": None, "glitter": None, "sparkles/glitter": None,
    "glow": None, "aura": None, "glow/aura": None,
    "light rays": None, "beams": None, "light rays/beams": None,
    "shimmer": None, "metallic shine": None, "shimmer/metallic shine": None,
    "floating particles": None, "particles": None,
    "ornate scrollwork": None, "filigree": None, "ornate scrollwork/filigree": None,
    "coins": None, "gold coins": None, "coins/gold piles": None,
    "gems": None, "jewels": None, "gems/jewels": None,
    "dust": None, "sand": None, "dust/sand": None,
    "wind": None, "motion lines": None, "wind/motion lines": None,
    "city landmarks": "City Landmarks/Skyline", "skyline": "City Landmarks/Skyline",
    "landmarks": "City Landmarks/Skyline", "eiffel tower": "City Landmarks/Skyline",
    "statue of liberty": "City Landmarks/Skyline", "city skyline": "City Landmarks/Skyline",
    "train": "Train/Railway Station", "train station": "Train/Railway Station",
    "railway": "Train/Railway Station", "railway station": "Train/Railway Station",
    "tube station": "Train/Railway Station",
    "gifts": "Gifts/Wrapped Presents", "wrapped presents": "Gifts/Wrapped Presents",
    "presents": "Gifts/Wrapped Presents", "gift boxes": "Gifts/Wrapped Presents",
    "coin stacks": "Coin Stacks", "stacked coins": "Coin Stacks",
    "coin piles": "Coin Stacks", "treasure coins": "Coin Stacks",
}


def normalize_color(c):
    if not isinstance(c, str):
        return None
    c_stripped = c.strip()
    if c_stripped.lower() in COLOR_SET:
        for cv in COLOR_VOCABULARY:
            if cv.lower() == c_stripped.lower():
                return cv
        return None
    alias = COLOR_ALIASES.get(c_stripped.lower())
    if alias:
        return alias
    return None


NOISE_ELEMENTS = {
    "Sparkles/Glitter", "Glow/Aura", "Light Rays/Beams",
    "Shimmer/Metallic Shine", "Floating Particles", "Dust/Sand",
    "Wind/Motion Lines", "Ornate Scrollwork/Filigree",
    "Coins/Gold Piles", "Gems/Jewels",
    "Gold Frame",
}


def normalize_element(e):
    if not isinstance(e, str):
        return None
    e_stripped = e.strip()
    if e_stripped in NOISE_ELEMENTS:
        return None
    if e_stripped in ELEMENT_SET:
        return e_stripped
    for ev in VALID_ELEMENTS:
        if ev.lower() == e_stripped.lower():
            return ev
    e_lower = e_stripped.lower()
    if e_lower in ELEMENT_ALIASES:
        aliased = ELEMENT_ALIASES[e_lower]
        if aliased in NOISE_ELEMENTS:
            return None
        return aliased
    return None


THEME_ELEMENT_HINTS = {
    'Egyptian/Pharaoh': [
        'Pyramids/Temples', 'Hieroglyphs/Ancient Writing',
        'Torches', 'Columns/Pillars',
        'Statues/Sculptures',
    ],
    'Asian Temple/Garden': [
        'Asian Lanterns/Decorations', 'Bamboo/Tropical Plants',
        'Asian Architecture',
    ],
    'Norse/Viking Realm': [
        'Viking Ship/Village', 'Weapons (swords/shields)',
        'Ancient Stone Carvings',
    ],
    'Irish/Celtic Highlands': [
        'Fields/Grassland', 'Trees/Forest',
    ],
    'Underwater Kingdom': [
        'Coral Reef/Underwater', 'Bubbles',
    ],
    'Ancient Greece/Rome': [
        'Columns/Pillars', 'Stone Frame',
    ],
    'Haunted Manor/Graveyard': [
        'Skulls/Bones', 'Candles', 'Torches',
    ],
    'Farm/Countryside': [
        'Farmhouse/Barn', 'Fields/Grassland', 'Trees/Forest',
    ],
    'Casino Floor': [
        'Casino Interior', 'City Landmarks/Skyline',
    ],
    'Classic Slots': [
        'Casino Interior',
    ],
    'Sports': [
        'Sports Arena/Stadium', 'Basketball Court',
    ],
    'Steampunk/Victorian': [
        'Clocks/Gears/Mechanical', 'Victorian Buildings',
    ],
    'Aztec/Mayan': [
        'Pyramids/Temples', 'Ancient Stone Carvings',
        'Torches',
    ],
    'Arabian Palace/Bazaar': [
        'Arab/Middle Eastern Architecture', 'Lanterns',
    ],
    'Forest/Woodland': [
        'Trees/Forest', 'Vines/Ivy/Plants',
    ],
    'Prairie/Plains/Grassland': [
        'Fields/Grassland',
    ],
    'Pirate/Treasure Island': [
        'Ships/Boats', 'Skulls/Bones',
    ],
    'Jungle/Rainforest': [
        'Trees/Forest', 'Vines/Ivy/Plants', 'Ancient Stone Carvings',
        'Statues/Sculptures',
    ],
    'Festive/Holiday': [
        'Christmas Decorations', 'Snowflakes/Snow', 'Gifts/Wrapped Presents',
    ],
    'Treasure Cave/Mine': [
        'Coin Stacks', 'Safe/Vault/Chest', 'Torches',
    ],
    'Luxury/VIP': [
        'Coin Stacks',
    ],
    'Money/Gold/Luxury': [
        'Coin Stacks',
    ],
    'Outer Space': [
        'Stars/Planets', 'Neon Glow',
    ],
    'Royal Palace/Court': [
        'Candles', 'Chandeliers', 'Columns/Pillars',
    ],
    'Laboratory/Workshop': [
        'Candles', 'Books/Scrolls/Maps',
    ],
    'Deep Ocean/Underwater': [
        'Coral Reef/Underwater', 'Underwater Structures', 'Bubbles',
    ],
    'Medieval Castle': [
        'Castle/Fortress/Tower', 'Torches', 'Banners/Flags',
    ],
    'Pirate Ship/Port': [
        'Ships/Boats', 'Skulls/Bones', 'Wood Frame',
    ],
}

DESC_ELEMENT_KEYWORDS = {
    r'\bunderwater\b|\bocean\b|\bsea\b|\baquatic\b': 'Coral Reef/Underwater',
    r'\bpyramid\b|\bpharaoh\b|\begypt\b': 'Pyramids/Temples',
    r'\bhieroglyphs?\b': 'Hieroglyphs/Ancient Writing',
    r'\bviking\b|\bnorse\b|\bvalhalla\b': 'Viking Ship/Village',
    r'\bbamboo\b': 'Bamboo/Tropical Plants',
    r'\bfarm\b|\bbarn\b': 'Farmhouse/Barn',
    r'\bstadium\b|\barena\b|\bfight(?:er|ing)\b|\bbox(?:er|ing)\b|\bwrestl': 'Sports Arena/Stadium',
    r'\bcasino\b|\bslot\s*machine': 'Casino Interior',
    r'\bsteampunk\b|\bvictorian\b': 'Victorian Buildings',
    r'\bcolosseum\b|\bparthenon\b|\bgreek\s*temple': 'Columns/Pillars',
    r'\blazer\b|\bneon\b(?!.*frame)': 'Neon Glow',
    r'\bcoral\s*reef\b': 'Coral Reef/Underwater',
    r'\btrain\b|\btube\b|\brailway\b|\bunderground\b': 'Train/Railway Station',
    r'\bvegas\b|\blas\s*vegas\b': 'City Landmarks/Skyline',
    r'\bgifts?\b|\bpresents?\b|\bwrapped\b': 'Gifts/Wrapped Presents',
    r'\bbasketball\b': 'Basketball Court',
    r'\bstair(s|case)?\b|\bsteps?\b': 'Stairs/Steps',
    r'\bplanet(s|ary)?\b|\bcomet\b|\bconstellation': 'Stars/Planets',
    r'\brope\s*(frame|border)\b': 'Rope Frame',
    r'\bpanda\b|\bchinese\b|\basian\b(?!.*slot)': 'Asian Lanterns/Decorations',
}


def post_process(result, name="", symbol_names=None, game_corrections=None, game_description=""):
    fixes = []
    name_lower = name.lower()

    # Fix 1: Mood in theme slot
    if result.get('art_theme') in MOOD_SET:
        if result.get('art_theme_secondary') in THEME_SET:
            fixes.append(f"theme '{result['art_theme']}' is a mood → swapped with secondary")
            result['art_theme'] = result['art_theme_secondary']
            result['art_theme_secondary'] = None
        else:
            fixes.append(f"theme '{result['art_theme']}' is a mood → flagged")
            result['_needs_review'] = True

    # Fix 2: Invalid secondary theme
    if result.get('art_theme_secondary'):
        if result['art_theme_secondary'] not in THEME_SET:
            fixes.append(f"secondary theme '{result['art_theme_secondary']}' invalid → null")
            result['art_theme_secondary'] = None
        elif result['art_theme_secondary'] == result['art_theme']:
            fixes.append("secondary == primary → null")
            result['art_theme_secondary'] = None

    # Fix 3: Normalize colors
    raw_colors = result.get('art_color_tone', [])
    if isinstance(raw_colors, str):
        raw_colors = [raw_colors]
    normalized_colors = []
    seen_colors = set()
    for c in raw_colors[:3]:
        nc = normalize_color(c)
        if nc and nc not in seen_colors:
            normalized_colors.append(nc)
            seen_colors.add(nc)
    if not normalized_colors and raw_colors:
        fixes.append(f"colors {raw_colors} could not be normalized")
    result['art_color_tone'] = normalized_colors

    # Fix 4: Normalize elements
    raw_elems = result.get('art_elements', [])
    normalized_elems = []
    seen_elems = set()
    for e in raw_elems:
        ne = normalize_element(e)
        if ne and ne not in seen_elems:
            normalized_elems.append(ne)
            seen_elems.add(ne)
    result['art_elements'] = normalized_elems

    # Fix 4b: Remove elements that are actually reel symbols (not background)
    ELEM_SYMBOL_EXCLUSIONS = {
        'Mountains/Landscape Background': [r'\bmountain\b', r'\bmt\.?\b'],
        'Pyramids/Temples/Ancient Structures': [r'\bpyramid\b'],
        'Castle/Fortress/Tower': [r'\bcastle\b', r'\btower\b', r'\bfortress\b'],
        'Waterfall': [r'\bwaterfall\b'],
        'Ships/Boats': [r'\bship\b', r'\bboat\b', r'\bgalleon\b', r'\bvessel\b'],
    }
    sym_text = ' '.join(symbol_names).lower()
    elems_before = len(result['art_elements'])
    result['art_elements'] = [
        e for e in result['art_elements']
        if not (e in ELEM_SYMBOL_EXCLUSIONS and
                any(re.search(p, sym_text) for p in ELEM_SYMBOL_EXCLUSIONS[e]) and
                not any(e.lower().split('/')[0] in kw for kw in ['pyram', 'mountain', 'castle']))
    ]
    # Only remove if the element keyword appears in symbols AND there's no
    # explicit background version. Check if 'Volcano' is a symbol but
    # 'Mountains' appears as background → allow
    elems_to_remove = []
    for elem in result['art_elements']:
        patterns = ELEM_SYMBOL_EXCLUSIONS.get(elem, [])
        if not patterns:
            continue
        if any(re.search(p, sym_text) for p in patterns):
            elems_to_remove.append(elem)
            fixes.append(f"element '{elem}' likely a reel symbol → removed")
    for e in elems_to_remove:
        result['art_elements'].remove(e)

    # Fix 4c: Theme-based element hints — add high-confidence elements Claude missed,
    # but only when Claude already detected at least one element from the same hint list
    theme = result.get('art_theme', '')
    hint_elems = THEME_ELEMENT_HINTS.get(theme, [])
    current_elems = set(result.get('art_elements', []))
    claude_confirmed = any(he in current_elems for he in hint_elems)
    if current_elems and claude_confirmed:
        for he in hint_elems:
            if he not in current_elems and he in ELEMENT_SET:
                sym_patterns = ELEM_SYMBOL_EXCLUSIONS.get(he, [])
                if sym_patterns and any(re.search(p, sym_text) for p in sym_patterns):
                    continue
                result['art_elements'].append(he)
                fixes.append(f"theme_hint:{theme}→{he}")

    # Fix 4d: Description-based element cross-reference
    desc_lower = (game_description or '').lower()
    if desc_lower and len(desc_lower) > 20:
        current_elems = set(result.get('art_elements', []))
        for pattern, elem in DESC_ELEMENT_KEYWORDS.items():
            if elem not in current_elems and elem in ELEMENT_SET:
                if re.search(pattern, desc_lower):
                    sym_patterns = ELEM_SYMBOL_EXCLUSIONS.get(elem, [])
                    if sym_patterns and any(re.search(p, sym_text) for p in sym_patterns):
                        continue
                    result['art_elements'].append(elem)
                    current_elems.add(elem)
                    fixes.append(f"desc_hint:{elem}")

    # Fix 5: Classic slot patterns → Classic Slots theme
    if re.search(r'\b(\d+x\s|triple|double)\b', name_lower) and result.get('art_theme') == 'Casino Floor':
        fixes.append(f"multiplier game misclassified as Casino Floor → Classic Slots")
        result['art_theme'] = 'Classic Slots'

    # Fix 6: Branded over-classification — historical figures are NOT branded
    if result.get('art_theme') == 'Branded/Licensed':
        not_branded_patterns = [
            r'\bda\s*vinci\b', r'\bcleopatra\b', r'\bgenghis\b', r'\bmarco\s*polo\b',
            r'\bcolumbus\b', r'\bnapoleon\b', r'\bsherlock\b',
        ]
        if any(re.search(p, name_lower) for p in not_branded_patterns):
            if result.get('art_theme_secondary') and result['art_theme_secondary'] in THEME_SET:
                fixes.append(f"'{name_lower}' is historical, not branded → using secondary theme")
                result['art_theme'] = result['art_theme_secondary']
                result['art_theme_secondary'] = None
            else:
                fixes.append(f"'{name_lower}' is historical, not branded → needs visual setting")

    # Fix 6b: Branded games should prefer visual setting as primary
    # BUT only if the game is NOT explicitly branded (is_branded=true means keep Branded as primary)
    if (result.get('art_theme') == 'Branded/Licensed'
            and result.get('art_theme_secondary') in THEME_SET
            and not result.get('is_branded', False)):
        fixes.append(f"branded with visual setting → swap: {result['art_theme_secondary']} primary, Branded secondary")
        primary = result['art_theme_secondary']
        result['art_theme_secondary'] = 'Branded/Licensed'
        result['art_theme'] = primary

    # Fix 6c: Vampire/gothic games → Haunted Manor, not Fantasy/Luxury
    if re.search(r'\b(vampire|immortal|dracula|blood\s*suck|fang|undead|nosferatu)\b', name_lower):
        if result.get('art_theme') not in ('Haunted Manor/Graveyard', 'Branded/Licensed'):
            old = result.get('art_theme')
            fixes.append(f"vampire game '{old}' → Haunted Manor/Graveyard")
            if old in THEME_SET and old != 'Haunted Manor/Graveyard':
                result['art_theme_secondary'] = old
            result['art_theme'] = 'Haunted Manor/Graveyard'

    # Fix 6c2: Renaissance art → Royal Palace/Court (not Ancient Greece)
    if re.search(r'\b(da\s*vinci|renaissance|mona\s*lisa|michelangelo)\b', name_lower):
        if result.get('art_theme') in ('Ancient Greece/Rome', 'Fantasy/Fairy Tale', 'Classic Slots'):
            fixes.append(f"Renaissance art → Royal Palace/Court")
            result['art_theme'] = 'Royal Palace/Court'

    # Fix 6d: "Neon" in name → likely Neon/Cyber City
    if re.search(r'\bneon\b', name_lower):
        if result.get('art_theme') in ('Classic Slots', 'Casino Floor'):
            fixes.append(f"'neon' in name → Neon/Cyber City")
            result['art_theme'] = 'Neon/Cyber City'
        if result.get('art_theme_secondary') == result.get('art_theme'):
            result['art_theme_secondary'] = None

    # Fix 6e: Irish/Celtic games — Irish primary even if in a tavern/pub
    if re.search(r'\b(finn|irish|celtic|leprechaun|shamrock|clover|emerald isle)\b', name_lower):
        if result.get('art_theme') in ('Tavern/Saloon', 'Farm/Countryside', 'Forest/Woodland'):
            old_theme = result['art_theme']
            fixes.append(f"Irish game in {old_theme} → Irish/Celtic primary, {old_theme} secondary")
            result['art_theme_secondary'] = old_theme
            result['art_theme'] = 'Irish/Celtic Highlands'

    # Fix 6f: "Fruity" in name → Fruit Machine, not Classic Slots
    if re.search(r'\bfruit[iy]\b', name_lower):
        if result.get('art_theme') == 'Classic Slots':
            fixes.append(f"'fruity' in name → Fruit Machine")
            result['art_theme'] = 'Fruit Machine'

    # Fix 7: Aztec warriors are not royalty
    if result.get('art_theme') == 'Aztec/Mayan':
        chars = result.get('art_characters', [])
        if 'King/Queen/Royalty' in chars:
            chars.remove('King/Queen/Royalty')
            if 'Warrior/Knight' not in chars and 'Explorer/Adventurer' not in chars:
                chars.append('Explorer/Adventurer')
            fixes.append("Aztec royalty → Explorer/Adventurer")
            result['art_characters'] = chars

    # Fix 7: Validate narrative
    if result.get('art_narrative') and result['art_narrative'] not in NARRATIVE_SET:
        fixes.append(f"narrative '{result['art_narrative']}' invalid → cleared")
        result['art_narrative'] = None

    # Fix 8: Character location filtering — remove characters Claude marked as "reel_only"
    char_locations = result.get('art_character_locations', {})
    if char_locations:
        chars = result.get('art_characters', [])
        no_char = "No Characters (symbol-only game)"
        reel_only_chars = []
        for char_name, location in char_locations.items():
            if location == 'reel_only':
                for c in chars:
                    if c != no_char and (char_name.lower() in c.lower() or c.lower() in char_name.lower()):
                        reel_only_chars.append(c)
                        fixes.append(f"char '{c}' marked reel_only by Claude → removed")
        if reel_only_chars:
            remaining = [c for c in chars if c not in reel_only_chars]
            if not remaining:
                remaining = [no_char]
            result['art_characters'] = remaining

    # Fix 8b: Broad symbol-based character exclusion — if characters match reel symbols
    # AND the character is NOT in the game name, demote to No Characters.
    # EXCEPTION: If Claude marked the character as "outside_reels", trust Claude's judgment.
    outside_reels_chars = set()
    for char_name, location in char_locations.items():
        if location == 'outside_reels':
            outside_reels_chars.add(char_name.lower())

    if symbol_names:
        sym_text_lower = ' '.join(s.lower() for s in symbol_names if s)
        chars = result.get('art_characters', [])
        no_char = "No Characters (symbol-only game)"

        # With specific character names, directly check if the character name
        # appears in the symbol list → likely just a reel symbol
        chars_to_remove = []
        for char in chars:
            if char == no_char:
                continue
            char_lower = char.lower()
            # Protected if character name is in the game name
            if char_lower in name_lower:
                fixes.append(f"char '{char}' matches reel symbol BUT is in game name → kept")
                continue
            # Protected if Claude marked as outside_reels
            if any(char_lower in orc or orc in char_lower for orc in outside_reels_chars):
                fixes.append(f"char '{char}' matches symbol BUT Claude confirmed outside_reels → kept")
                continue
            # Protected if 3+ symbols contain this character's name (game is themed around it)
            sym_matches = sum(1 for s in symbol_names if char_lower in s.lower())
            if sym_matches >= 3:
                fixes.append(f"char '{char}' matches symbols BUT game themed around it (3+ matches) → kept")
                continue
            # If any symbol name matches the character name → likely just a reel symbol
            if any(char_lower in s.lower() or s.lower() in char_lower for s in symbol_names if len(s) > 1):
                chars_to_remove.append(char)
                fixes.append(f"char '{char}' matches reel symbol (not in game name) → removed")
        if chars_to_remove:
            remaining = [c for c in chars if c not in chars_to_remove]
            if not remaining:
                remaining = [no_char]
            result['art_characters'] = remaining

    # Symbol hints removed: elements should come from Claude Vision
    # detecting them OUTSIDE the reels, not from symbol name matching

    # Fix 9: Map specific character names to categories; keep valid names
    chars = result.get('art_characters', [])
    no_char = "No Characters (symbol-only game)"
    categories = {}
    valid_chars = []
    for c in chars:
        if c == no_char:
            continue
        cat = CHARACTER_CATEGORIES.get(c)
        if cat:
            categories[c] = cat
            valid_chars.append(c)
        elif c in CHARACTER_SET:
            valid_chars.append(c)
        else:
            # Try fuzzy match: check if any known name is a substring
            matched = False
            for known_name, known_cat in CHARACTER_CATEGORIES.items():
                if known_name.lower() in c.lower() or c.lower() in known_name.lower():
                    categories[c] = known_cat
                    valid_chars.append(c)
                    matched = True
                    break
            if not matched:
                valid_chars.append(c)
    if valid_chars:
        result['art_characters'] = valid_chars
        if categories:
            result['art_character_categories'] = categories
    elif not chars:
        result['art_characters'] = [no_char]

    # Fix 9b: Vegas games → Casino Floor + Urban/Modern City
    if re.search(r'\bvegas\b', name_lower):
        theme = result.get('art_theme', '')
        secondary = result.get('art_theme_secondary')
        if theme == 'Casino Floor' and not secondary:
            result['art_theme_secondary'] = 'Urban/Modern City'
            fixes.append("Vegas game → added Urban/Modern City secondary")
        elif theme != 'Casino Floor' and not secondary:
            result['art_theme_secondary'] = 'Casino Floor'
            fixes.append("Vegas game → added Casino Floor secondary")

    # Fix 9c: Branded games — inject character from game name for known celebrities
    branded_name_chars = {
        r'\bjimi[\s-]*hendrix\b': 'Jimi Hendrix',
        r'\belvis\b': 'Elvis',
        r'\bozzy[\s-]*osbourne\b': 'Ozzy Osbourne',
        r'\bgordon[\s-]*ramsay\b': 'Gordon Ramsay',
    }
    no_char = "No Characters (symbol-only game)"
    for pattern, char_name in branded_name_chars.items():
        if re.search(pattern, name_lower):
            chars = result.get('art_characters', [])
            if chars == [no_char] or not chars:
                result['art_characters'] = [char_name]
                fixes.append(f"branded game '{char_name}' → injected as character")
            elif char_name not in chars:
                result['art_characters'].append(char_name)
                fixes.append(f"branded game '{char_name}' → added to characters")

    # Fix 10: Enforce persistent user corrections
    if game_corrections:
        must_have = game_corrections.get('must_have_elements', [])
        for elem in must_have:
            if elem not in result.get('art_elements', []):
                result.setdefault('art_elements', []).append(elem)
                fixes.append(f"correction_add_elem:{elem}")
        must_not = game_corrections.get('must_not_elements', [])
        for elem in must_not:
            if elem in result.get('art_elements', []):
                result['art_elements'].remove(elem)
                fixes.append(f"correction_rm_elem:{elem}")
        override_chars = game_corrections.get('override_characters')
        if override_chars is not None:
            result['art_characters'] = override_chars
            fixes.append("correction_override_chars")
        override_theme = game_corrections.get('override_theme')
        if override_theme:
            result['art_theme'] = override_theme
            fixes.append(f"correction_override_theme:{override_theme}")
        override_theme2 = game_corrections.get('override_theme_secondary')
        if override_theme2:
            result['art_theme_secondary'] = override_theme2
            fixes.append(f"correction_override_theme2:{override_theme2}")
        colors_remove = game_corrections.get('override_colors_remove', [])
        for col in colors_remove:
            if col in result.get('art_color_tone', []):
                result['art_color_tone'].remove(col)
                fixes.append(f"correction_rm_color:{col}")
        override_colors = game_corrections.get('override_colors')
        if override_colors is not None:
            result['art_color_tone'] = override_colors
            fixes.append(f"correction_override_colors:{override_colors}")
        override_elements = game_corrections.get('override_elements')
        if override_elements is not None:
            result['art_elements'] = override_elements
            fixes.append(f"correction_override_elements:{override_elements}")
        must_colors = game_corrections.get('must_have_colors', [])
        for col in must_colors:
            if col not in result.get('art_color_tone', []):
                result.setdefault('art_color_tone', []).append(col)
                fixes.append(f"correction_add_color:{col}")

    return result, fixes


# ═══════════════════════════════════════════════════════════════════
# MAIN CLASSIFICATION FUNCTION
# ═══════════════════════════════════════════════════════════════════

def classify_game(client, system_prompt, fname, use_vision=True, symbol_names=None,
                   game_corrections=None, game_description=""):
    name, review = extract_review(fname)
    if not review or len(review) < 50:
        return None, name, 'no review'

    screenshot_b64, media_type = None, None
    masked_b64 = None
    if use_vision:
        screenshot_b64, media_type = load_screenshot(fname)
        if screenshot_b64:
            masked_b64 = create_masked_screenshot(fname)

    user_content = build_user_message(name, review, screenshot_b64, media_type,
                                      symbol_names, game_corrections, masked_b64,
                                      description_text=game_description)
    has_image = screenshot_b64 is not None

    max_retries = 3
    for attempt in range(max_retries):
        resp = client.messages.create(
            model=MODEL,
            max_tokens=1000,
            system=system_prompt,
            messages=[{"role": "user", "content": user_content}],
        )
        raw = resp.content[0].text.strip()
        raw = re.sub(r'^```\w*\n?', '', raw)
        raw = re.sub(r'\n?```$', '', raw)

        try:
            result = json.loads(raw)
            break
        except json.JSONDecodeError:
            json_match = re.search(r'\{[\s\S]*\}', raw)
            if json_match:
                try:
                    result = json.loads(json_match.group())
                    break
                except json.JSONDecodeError:
                    pass
            if attempt < max_retries - 1:
                time.sleep(2)
                continue
            raise

    result, fixes = post_process(result, name, symbol_names, game_corrections, game_description)
    result['_has_screenshot'] = has_image

    return result, name, fixes


def load_game_descriptions():
    master_path = MASTER_PATH
    if not os.path.exists(master_path):
        return {}
    with open(master_path) as f:
        games = json.load(f)
    desc_index = {}
    for g in games:
        name = (g.get('name') or '').lower().strip()
        desc = g.get('description') or ''
        if name and desc:
            desc_index[name] = desc
    return desc_index


def find_description_for_game(desc_index, name_preview):
    name_low = name_preview.lower().strip()
    if name_low in desc_index:
        return desc_index[name_low]
    for key, desc in desc_index.items():
        if name_low == key:
            return desc
    slug_words = set(name_low.replace('-', ' ').split())
    if not slug_words:
        return ''
    best_match, best_score = '', 0.0
    for key, desc in desc_index.items():
        key_words = set(key.split())
        overlap = len(slug_words & key_words)
        ratio = overlap / max(len(slug_words), len(key_words))
        if ratio > best_score and ratio >= 0.75:
            best_score = ratio
            best_match = desc
    return best_match


def run_batch(files, use_vision=True, output_path=None):
    import anthropic

    api_key = load_api_key()
    client = anthropic.Anthropic(api_key=api_key)
    gt_games = load_ground_truth()
    training_ref = build_training_examples(gt_games)
    system_prompt = build_system_prompt(training_ref)
    symbol_index = load_game_symbols()
    corrections_db = load_corrections()
    desc_index = load_game_descriptions()

    results = []
    errors = 0

    for i, fname in enumerate(files):
        print(f"\n[{i + 1}/{len(files)}] {fname}", flush=True)
        try:
            game_corrections = corrections_db.get(fname)
            if game_corrections:
                print(f"  CORRECTIONS DB: {list(game_corrections.keys())}", flush=True)

            name_preview = fname.replace('.html', '').replace('-', ' ')
            sym_names = find_symbols_for_game(symbol_index, name_preview)
            if sym_names:
                print(f"  Symbols: {[s for s in sym_names if s and len(s) > 1][:8]}", flush=True)

            game_desc = find_description_for_game(desc_index, name_preview)
            result, name, fixes = classify_game(client, system_prompt, fname, use_vision,
                                                sym_names, game_corrections, game_desc)
            if result is None:
                print(f"  SKIP: {fixes}", flush=True)
                continue

            if fixes:
                for fix in fixes:
                    print(f"  FIX: {fix}", flush=True)

            entry = {
                'file': fname,
                'name': name,
                'art_theme': result['art_theme'],
                'art_theme_secondary': result.get('art_theme_secondary'),
                'art_color_tone': result.get('art_color_tone', []),
                'art_characters': result.get('art_characters', []),
                'art_character_categories': result.get('art_character_categories', {}),
                'art_elements': result.get('art_elements', []),
                'art_narrative': result.get('art_narrative', ''),
                'is_branded': result.get('is_branded', False),
                'confidence': result.get('confidence', {}),
                '_has_screenshot': result.get('_has_screenshot', False),
            }
            results.append(entry)

            print(f"  Theme:    {entry['art_theme']}", flush=True)
            if entry['art_theme_secondary']:
                print(f"  Theme2:   {entry['art_theme_secondary']}", flush=True)
            print(f"  Colors:   {entry['art_color_tone']}", flush=True)
            print(f"  Chars:    {entry['art_characters']}", flush=True)
            if entry.get('art_character_categories'):
                print(f"  CharCats: {entry['art_character_categories']}", flush=True)
            print(f"  Elements: {entry['art_elements'][:5]}{'...' if len(entry.get('art_elements', [])) > 5 else ''}", flush=True)
            print(f"  Vision:   {'Yes' if entry['_has_screenshot'] else 'No'}", flush=True)

        except Exception as e:
            errors += 1
            print(f"  ERROR: {e}", flush=True)

        time.sleep(0.5)

    if output_path:
        with open(output_path, 'w') as f:
            json.dump({'results': results, 'errors': errors}, f, indent=2)
        print(f"\nSaved {len(results)} results to {output_path}", flush=True)

    save_batch_to_pipeline(results, errors, files)
    return results


def run_batch_api(files, use_vision=True):
    """Use Anthropic Message Batches API for 50% cost reduction."""
    import anthropic
    from datetime import datetime

    api_key = load_api_key()
    client = anthropic.Anthropic(api_key=api_key)
    gt_games = load_ground_truth()
    training_ref = build_training_examples(gt_games)
    system_prompt = build_system_prompt(training_ref)
    symbol_index = load_game_symbols()
    corrections_db = load_corrections()
    desc_index = load_game_descriptions()

    requests = []
    valid_files = []

    for fname in files:
        name, review = extract_review(fname)
        if not review or len(review) < 50:
            print(f"  SKIP {fname}: no review", flush=True)
            continue

        game_corrections = corrections_db.get(fname)
        name_preview = fname.replace('.html', '').replace('-', ' ')
        sym_names = find_symbols_for_game(symbol_index, name_preview)
        game_desc = find_description_for_game(desc_index, name_preview)

        screenshot_b64, media_type, masked_b64 = None, None, None
        if use_vision:
            screenshot_b64, media_type = load_screenshot(fname)
            if screenshot_b64:
                masked_b64 = create_masked_screenshot(fname)

        user_content = build_user_message(name, review, screenshot_b64, media_type,
                                          sym_names, game_corrections, masked_b64,
                                          description_text=game_desc)

        custom_id = fname.replace('.html', '').replace('.', '_')
        requests.append({
            "custom_id": custom_id,
            "params": {
                "model": MODEL,
                "max_tokens": 1000,
                "system": [{"type": "text", "text": system_prompt}],
                "messages": [{"role": "user", "content": user_content}],
            }
        })
        valid_files.append(fname)

    if not requests:
        print("No valid games to classify.", flush=True)
        return []

    print(f"\nSubmitting batch of {len(requests)} games to Anthropic Batch API...", flush=True)
    batch = client.messages.batches.create(requests=requests)
    batch_id = batch.id
    print(f"Batch ID: {batch_id}", flush=True)
    print(f"Status: {batch.processing_status}", flush=True)

    # Poll for completion
    import time
    poll_interval = 10
    while True:
        batch = client.messages.batches.retrieve(batch_id)
        status = batch.processing_status
        counts = batch.request_counts
        print(f"  Status: {status} | succeeded={counts.succeeded} errored={counts.errored} "
              f"processing={counts.processing} pending={getattr(counts, 'pending', '?')}", flush=True)

        if status == "ended":
            break
        time.sleep(poll_interval)
        poll_interval = min(poll_interval * 1.5, 60)

    # Build reverse map: custom_id → filename
    id_to_fname = {f.replace('.html', '').replace('.', '_'): f for f in valid_files}

    # Collect results
    results = []
    errors = 0

    for result in client.messages.batches.results(batch_id):
        fname = id_to_fname.get(result.custom_id, result.custom_id + '.html')
        if result.result.type == "succeeded":
            try:
                raw = result.result.message.content[0].text.strip()
                raw = re.sub(r'^```\w*\n?', '', raw)
                raw = re.sub(r'\n?```$', '', raw)
                parsed = json.loads(raw)

                game_corrections = corrections_db.get(fname)
                name_preview = fname.replace('.html', '').replace('-', ' ')
                sym_names = find_symbols_for_game(symbol_index, name_preview)
                game_desc = find_description_for_game(desc_index, name_preview)

                processed, fixes = post_process(
                    parsed, name_preview,
                    sym_names or [],
                    game_corrections,
                    game_desc or "",
                )

                entry = {
                    'file': fname,
                    'name': name_preview,
                    'art_theme': processed['art_theme'],
                    'art_theme_secondary': processed.get('art_theme_secondary'),
                    'art_color_tone': processed.get('art_color_tone', []),
                    'art_characters': processed.get('art_characters', []),
                    'art_character_categories': processed.get('art_character_categories', {}),
                    'art_elements': processed.get('art_elements', []),
                    'art_narrative': processed.get('art_narrative', ''),
                    'is_branded': processed.get('is_branded', False),
                    'confidence': processed.get('confidence', {}),
                    '_has_screenshot': use_vision,
                }
                results.append(entry)
                print(f"  OK: {fname} → {entry['art_theme']}", flush=True)
            except Exception as e:
                errors += 1
                print(f"  PARSE ERROR: {fname}: {e}", flush=True)
        else:
            errors += 1
            print(f"  API ERROR: {fname}: {result.result.type}", flush=True)

    print(f"\nBatch complete: {len(results)} succeeded, {errors} errors", flush=True)
    save_batch_to_pipeline(results, errors, valid_files)
    return results


# ═══════════════════════════════════════════════════════════════════
# PIPELINE DATA MANAGEMENT
# ═══════════════════════════════════════════════════════════════════


def save_batch_to_pipeline(results, errors, files):
    """Merge batch results into art_pipeline/results.json and log the run."""
    from datetime import datetime

    # Merge into results.json
    existing = {}
    if os.path.exists(RESULTS_PATH):
        with open(RESULTS_PATH) as f:
            data = json.load(f)
        existing = data.get('games', {})

    for r in results:
        fname = r['file']
        entry = dict(r)
        entry.pop('file', None)
        entry['_classified_at'] = datetime.utcnow().isoformat() + 'Z'
        entry['_is_v2'] = True
        existing[fname] = entry

    out = {
        'version': '1.0',
        'last_updated': datetime.utcnow().isoformat() + 'Z',
        'description': 'Canonical classification results. One entry per game, latest pipeline version wins.',
        'total_games': len(existing),
        'games': dict(sorted(existing.items())),
    }
    with open(RESULTS_PATH, 'w') as f:
        json.dump(out, f, indent=2)
    print(f"\nMerged {len(results)} results into {RESULTS_PATH} (total: {len(existing)})", flush=True)

    # Append to run_log.json
    log = {'runs': []}
    if os.path.exists(RUN_LOG_PATH):
        with open(RUN_LOG_PATH) as f:
            log = json.load(f)

    log['runs'].append({
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'games_attempted': len(files),
        'games_succeeded': len(results),
        'games_failed': errors,
        'files': [r['file'] for r in results],
    })
    with open(RUN_LOG_PATH, 'w') as f:
        json.dump(log, f, indent=2)


def load_user_reviews():
    """Return set of filenames the user has already reviewed."""
    if not os.path.exists(USER_REVIEWS_PATH):
        return set()
    with open(USER_REVIEWS_PATH) as f:
        data = json.load(f)
    return set(data.get('games', {}).keys())


def save_user_reviews(reviews_dict):
    """Save user reviews to art_pipeline/user_reviews.json, preserving existing metadata."""
    data = {}
    if os.path.exists(USER_REVIEWS_PATH):
        with open(USER_REVIEWS_PATH) as f:
            data = json.load(f)

    existing = data.get('games', {})
    existing.update(reviews_dict)

    data['version'] = '1.0'
    data['description'] = 'User review verdicts per game per dimension. If a game is here, do NOT ask the user to review it again.'
    data['total_reviewed'] = len(existing)
    data['games'] = dict(sorted(existing.items()))

    with open(USER_REVIEWS_PATH, 'w') as f:
        json.dump(data, f, indent=2)
    return len(existing)


def select_new_batch(n, require_screenshot=True):
    """Pick N games that have NOT been reviewed yet, with reviews and optionally screenshots."""
    import glob as glob_mod

    reviewed = load_user_reviews()
    v2_results = set()
    if os.path.exists(RESULTS_PATH):
        with open(RESULTS_PATH) as f:
            data = json.load(f)
        v2_results = set(f for f, g in data.get('games', {}).items()
                         if len(g.get('art_elements', [])) > 0)

    already_seen = reviewed | v2_results

    screenshots = set()
    if require_screenshot:
        for ext in ['*.jpg', '*.png', '*.webp']:
            for f in glob_mod.glob(os.path.join(SCREENSHOT_DIR, ext)):
                slug = os.path.basename(f).rsplit('.', 1)[0]
                screenshots.add(slug + '.html')

    candidates = []
    for f in sorted(glob_mod.glob(os.path.join(SC_DIR, '*.html'))):
        fname = os.path.basename(f)
        if fname in already_seen:
            continue
        if require_screenshot and fname not in screenshots:
            continue
        size = os.path.getsize(f)
        if size > 5000:
            candidates.append(fname)

    import random
    random.seed(42)
    selected = sorted(random.sample(candidates, min(n, len(candidates))))
    return selected


def run_regression():
    """Classify GT games with current pipeline and report accuracy per dimension."""
    import anthropic

    gt_games = load_ground_truth()
    if not gt_games:
        print("No ground truth games found.")
        return

    gt_by_file = {}
    if isinstance(gt_games[0], dict) and 'sc_file' in gt_games[0]:
        gt_by_file = {g['sc_file']: g for g in gt_games}
    else:
        gt_by_file = {g.get('file', ''): g for g in gt_games}

    gt_files = sorted(gt_by_file.keys())
    print(f"Running regression on {len(gt_files)} GT games...", flush=True)

    results = run_batch(gt_files, use_vision=True)

    dims = ['art_theme', 'art_color_tone', 'art_characters', 'art_elements']
    total = 0
    matches = 0
    dim_scores = {d: {'match': 0, 'total': 0} for d in dims}

    for r in results:
        gt = gt_by_file.get(r['file'])
        if not gt:
            continue
        for d in dims:
            total += 1
            dim_scores[d]['total'] += 1
            gt_val = gt.get(d)
            r_val = r.get(d)
            if d in ('art_color_tone', 'art_characters', 'art_elements'):
                gt_set = set(gt_val) if isinstance(gt_val, list) else {gt_val}
                r_set = set(r_val) if isinstance(r_val, list) else {r_val}
                gt_set.discard(None)
                r_set.discard(None)
                if gt_set <= r_set:
                    matches += 1
                    dim_scores[d]['match'] += 1
            elif d == 'art_theme':
                r_secondary = r.get('art_theme_secondary')
                gt_secondary = gt.get('art_theme_secondary')
                if _theme_matches(gt_val, r_val, r_secondary, gt_secondary):
                    matches += 1
                    dim_scores[d]['match'] += 1
            else:
                if gt_val == r_val:
                    matches += 1
                    dim_scores[d]['match'] += 1

    print(f"\n{'=' * 50}")
    print(f"REGRESSION RESULTS")
    print(f"{'=' * 50}")
    print(f"Overall: {matches}/{total} = {matches/total*100:.1f}%\n")
    for d in dims:
        s = dim_scores[d]
        pct = s['match'] / s['total'] * 100 if s['total'] > 0 else 0
        print(f"  {d}: {s['match']}/{s['total']} = {pct:.1f}%")

    return matches, total


def _theme_matches(gt_theme, result_theme, result_secondary=None, gt_secondary=None):
    """Check if theme matches, accepting secondary theme as a valid match."""
    if gt_theme == result_theme:
        return True
    if gt_secondary and gt_secondary == result_theme:
        return True
    if result_secondary and result_secondary == gt_theme:
        return True
    return False


def _fix_note_matches_theme(note, result_theme, result_secondary):
    """Check if a user's fix note is satisfied by the current theme/secondary.

    Splits theme names and note into keyword tokens and looks for significant overlap.
    """
    import re
    note_lower = note.lower()
    stop_words = {'not', 'more', 'like', 'should', 'also', 'say', 'its', 'i', 'think',
                  'the', 'a', 'an', 'is', 'but', 'and', 'or', 'be', 'really', 'kind', 'of'}

    def tokenize(s):
        return {w for w in re.split(r'[^a-z]+', s.lower()) if w and w not in stop_words}

    note_tokens = tokenize(note_lower)
    theme_tokens = tokenize(result_theme)
    secondary_tokens = tokenize(result_secondary) if result_secondary else set()

    if note_tokens & theme_tokens:
        return True
    if secondary_tokens and note_tokens & secondary_tokens:
        return True
    return False


def run_expanded_regression():
    """Score current results.json against all 192 human-reviewed games.

    No API calls — purely offline comparison of stored results vs stored verdicts.
    OK verdicts (empty note) = dimension was correct at review time.
    Fix verdicts (non-empty note) = dimension was wrong, check if corrections fixed it.
    """
    if not os.path.exists(USER_REVIEWS_PATH):
        print("No user_reviews.json found.")
        return
    if not os.path.exists(RESULTS_PATH):
        print("No results.json found.")
        return

    with open(USER_REVIEWS_PATH) as f:
        reviews = json.load(f)
    with open(RESULTS_PATH) as f:
        results = json.load(f)

    auto_rounds = {'auto_v11_5', 'auto_text_v11_5'}
    r_games = results.get('games', {})
    rev_games = reviews.get('games', {})

    dims = ['art_theme', 'art_characters', 'art_elements', 'art_color_tone']
    dim_ok = {d: 0 for d in dims}
    dim_total = {d: 0 for d in dims}
    dim_fix_resolved = {d: 0 for d in dims}
    dim_fix_total = {d: 0 for d in dims}
    per_game_issues = []

    human_count = 0
    missing_from_results = 0

    for fname, rev in rev_games.items():
        rnd = rev.get('review_round', '')
        if rnd in auto_rounds:
            continue
        human_count += 1

        r = r_games.get(fname)
        if not r:
            missing_from_results += 1
            continue

        verdicts = rev.get('verdicts', {})
        for d in dims:
            v = verdicts.get(d, {})
            note = (v.get('note') or '').strip()
            dim_total[d] += 1

            if not note:
                dim_ok[d] += 1
            elif note.upper().startswith('INVALID'):
                dim_fix_total[d] += 1
                dim_fix_resolved[d] += 1
            else:
                dim_fix_total[d] += 1
                if d == 'art_theme':
                    result_theme = r.get('art_theme', '')
                    result_secondary = r.get('art_theme_secondary', '')
                    if _fix_note_matches_theme(note, result_theme, result_secondary):
                        dim_fix_resolved[d] += 1
                    else:
                        per_game_issues.append((fname, d, note[:60], result_theme, result_secondary))

    total_verdicts = sum(dim_total.values())
    total_ok = sum(dim_ok.values())
    total_fix_resolved = sum(dim_fix_resolved.values())
    total_pass = total_ok + total_fix_resolved

    print(f"\n{'=' * 60}")
    print(f"EXPANDED REGRESSION — {human_count} human-reviewed games")
    print(f"{'=' * 60}")
    print(f"Reviewed: {human_count} games, {total_verdicts} verdicts")
    if missing_from_results:
        print(f"Missing from results.json: {missing_from_results}")
    print()

    print(f"{'Dimension':<18s} {'OK':>5s} {'Fix':>5s} {'Resolvd':>7s} {'Base%':>7s} {'Adj%':>7s}")
    print('-' * 54)
    for d in dims:
        label = d.replace('art_', '')
        ok = dim_ok[d]
        fix_total = dim_fix_total[d]
        fix_resolved = dim_fix_resolved[d]
        total = dim_total[d]
        base_pct = ok / total * 100 if total > 0 else 0
        adj_pct = (ok + fix_resolved) / total * 100 if total > 0 else 0
        print(f"  {label:<16s} {ok:>5d} {fix_total:>5d} {fix_resolved:>7d} {base_pct:>6.1f}% {adj_pct:>6.1f}%")

    base_all = total_ok / total_verdicts * 100 if total_verdicts > 0 else 0
    adj_all = (total_ok + total_fix_resolved) / total_verdicts * 100 if total_verdicts > 0 else 0
    print(f"\n  {'OVERALL':<16s} {total_ok:>5d} {sum(dim_fix_total.values()):>5d} "
          f"{total_fix_resolved:>7d} {base_all:>6.1f}% {adj_all:>6.1f}%")
    print(f"\n  Base% = OK verdicts only; Adj% = OK + resolved Fix verdicts")

    if per_game_issues:
        print(f"\n{'─' * 60}")
        print(f"Theme fix verdicts still unresolved ({len(per_game_issues)}):")
        for item in per_game_issues:
            fname, d, note = item[0], item[1], item[2]
            got = item[3] if len(item) > 3 else '?'
            secondary = item[4] if len(item) > 4 else ''
            print(f"  {fname:40s} note: {note}")
            print(f"  {'':40s} got:  {got}" + (f" / {secondary}" if secondary else ""))

    return dim_ok, dim_total


# ═══════════════════════════════════════════════════════════════════
# CLI INTERFACE
# ═══════════════════════════════════════════════════════════════════

def preflight_screenshot_check(files):
    """Check screenshot coverage before classification. Returns (has_ss, missing_ss) counts."""
    has_ss = 0
    missing_ss = []
    for fname in files:
        ss_data, _ = load_screenshot(fname)
        if ss_data:
            has_ss += 1
        else:
            missing_ss.append(fname)
    total = len(files)
    pct = (has_ss / total * 100) if total > 0 else 0
    print(f"\n{'='*60}", flush=True)
    print(f"PRE-FLIGHT SCREENSHOT CHECK", flush=True)
    print(f"  Total games in batch: {total}", flush=True)
    print(f"  With screenshot:      {has_ss} ({pct:.1f}%)", flush=True)
    print(f"  WITHOUT screenshot:   {len(missing_ss)} ({100-pct:.1f}%)", flush=True)
    print(f"{'='*60}", flush=True)
    return has_ss, missing_ss, pct


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Art classification v2')
    parser.add_argument('files', nargs='*', help='SC cache HTML filenames to classify')
    parser.add_argument('--no-vision', action='store_true', help='Disable screenshot analysis')
    parser.add_argument('--output', '-o', default=None, help='Output JSON path')
    parser.add_argument('--gt-compare', action='store_true', help='Compare results against GT')
    parser.add_argument('--regression', action='store_true', help='Run regression test against GT')
    parser.add_argument('--regression-full', action='store_true', help='Run expanded regression against all 192 reviewed games')
    parser.add_argument('--select-batch', type=int, metavar='N', help='Select N new unreviewed games')
    parser.add_argument('--no-screenshot', action='store_true', help='Include games without screenshots in batch')
    parser.add_argument('--stats', action='store_true', help='Show pipeline stats')
    parser.add_argument('--batch-api', action='store_true', help='Use Anthropic Batch API (50% cheaper, async)')
    parser.add_argument('--allow-text-only', action='store_true', help='Allow batch to proceed even if <80%% have screenshots')
    args = parser.parse_args()

    if args.stats:
        reviewed = load_user_reviews()
        results_count = 0
        if os.path.exists(RESULTS_PATH):
            with open(RESULTS_PATH) as f:
                results_count = json.load(f).get('total_games', 0)
        gt_count = len(load_ground_truth())
        print(f"Pipeline Stats:")
        print(f"  Results:    {results_count} games classified")
        print(f"  Reviewed:   {len(reviewed)} games user-reviewed")
        print(f"  GT:         {gt_count} games in ground truth")
        print(f"  Corrections: {len(load_corrections())} game overrides")
        return

    if args.select_batch:
        selected = select_new_batch(args.select_batch, require_screenshot=not args.no_screenshot)
        print(f"Selected {len(selected)} new games:")
        for s in selected:
            print(f"  {s}")
        return

    if args.regression:
        run_regression()
        return

    if args.regression_full:
        run_expanded_regression()
        return

    if not args.files:
        print("Usage:")
        print("  python3 classify_art_v2.py file1.html file2.html  # classify specific games")
        print("  python3 classify_art_v2.py --select-batch 50       # pick 50 unreviewed games")
        print("  python3 classify_art_v2.py --regression            # run GT regression test")
        print("  python3 classify_art_v2.py --stats                 # show pipeline stats")
        sys.exit(1)

    if not args.no_vision and args.files:
        has_ss, missing_ss, pct = preflight_screenshot_check(args.files)
        if pct < 80 and not args.allow_text_only:
            print(f"\n  BLOCKED: Only {pct:.1f}% of games have screenshots (threshold: 80%).", flush=True)
            print(f"  To proceed with text-only classification, add --allow-text-only", flush=True)
            print(f"  To get screenshots first, run: node download_sc_screenshots.mjs --download", flush=True)
            if missing_ss:
                print(f"\n  Games missing screenshots (first 10):", flush=True)
                for m in missing_ss[:10]:
                    print(f"    {m}", flush=True)
            sys.exit(1)

    if args.batch_api:
        results = run_batch_api(
            args.files,
            use_vision=not args.no_vision,
        )
    else:
        results = run_batch(
            args.files,
            use_vision=not args.no_vision,
            output_path=args.output,
        )

    if args.gt_compare and os.path.exists(GT_V2_PATH):
        gt_games = load_ground_truth()
        gt_by_file = {g['sc_file']: g for g in gt_games}
        print("\n" + "=" * 60)
        print("GROUND TRUTH COMPARISON")
        print("=" * 60)

        matches = {'theme': 0, 'color': 0, 'characters': 0, 'elements': 0}
        total = 0

        for r in results:
            gt = gt_by_file.get(r['file'])
            if not gt:
                continue
            total += 1
            print(f"\n{r['name']}:")

            # Theme
            if r['art_theme'] == gt['art_theme']:
                matches['theme'] += 1
                print(f"  Theme:  ✓ {r['art_theme']}")
            else:
                print(f"  Theme:  ✗ got={r['art_theme']}, expected={gt['art_theme']}")

            # Colors — check overlap (GT is subset of result or exact match)
            gt_colors = set(gt.get('art_color_tone', []))
            r_colors = set(r.get('art_color_tone', []))
            if gt_colors <= r_colors or r_colors == gt_colors:
                matches['color'] += 1
                print(f"  Colors: ✓ {list(r_colors)}")
            else:
                missing = gt_colors - r_colors
                print(f"  Colors: ✗ got={list(r_colors)}, expected={list(gt_colors)}, missing={list(missing)}")

            # Characters — compare using categories if needed
            gt_chars = set(gt.get('art_characters', []))
            r_chars = set(r.get('art_characters', []))
            r_cats = r.get('art_character_categories', {})
            r_char_cats = set(r_cats.values()) if r_cats else set()
            gt_cats_data = gt.get('art_character_categories', {})
            gt_char_cats = set(gt_cats_data.values()) if gt_cats_data else set()
            if r_chars == gt_chars:
                matches['characters'] += 1
                print(f"  Chars:  ✓ {list(r_chars)}")
            elif r_char_cats and gt_char_cats and r_char_cats == gt_char_cats:
                matches['characters'] += 1
                print(f"  Chars:  ✓ (categories match) {list(r_chars)} → {list(r_char_cats)}")
            else:
                print(f"  Chars:  ✗ got={list(r_chars)}, expected={list(gt_chars)}")

            # Elements — GT elements should be subset of result (result can have extras)
            gt_elems = set(gt.get('art_elements', []))
            r_elems = set(r.get('art_elements', []))
            if gt_elems <= r_elems:
                matches['elements'] += 1
                print(f"  Elems:  ✓ {len(r_elems)} elements (includes all {len(gt_elems)} GT)")
            else:
                missing = gt_elems - r_elems
                print(f"  Elems:  ✗ missing={list(missing)}")

        if total > 0:
            print(f"\n{'=' * 60}")
            print(f"ACCURACY (out of {total} GT games):")
            for dim, count in matches.items():
                pct = count / total * 100
                print(f"  {dim:12s}: {count}/{total} = {pct:.0f}%")


if __name__ == '__main__':
    main()
