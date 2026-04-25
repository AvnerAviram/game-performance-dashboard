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
BATCH_GATE_PATH = os.path.join(PIPELINE_DIR, 'batch_gate.json')
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
    "Laboratory/Workshop", "Festive/Holiday", "Inferno/Fire",
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
    "Rope Frame", "Caution Tape/Crime Scene Frame",
    "Minimal/No Frame",
]
VALID_ELEMENTS_SCENE = [
    "Pyramids", "Temples", "Mountains", "Castle", "Fortress", "Tower",
    "Trees", "Forest", "Coral Reef/Underwater", "Fields/Grassland",
    "Village/Town", "Farmhouse/Barn", "Mansion/Palace",
    "Victorian Buildings", "Arab/Middle Eastern Architecture",
    "Asian Architecture", "Stone Arch/Gateway",
    "Underwater Structures", "Sports Arena/Stadium",
    "Casino Interior", "Kitchen", "Appliances",
    "Japanese Garden", "Bamboo", "Tropical Plants",
    "Bank/Vault Building", "Viking Ship", "Viking Village",
    "Basketball Court", "Stairs/Steps",
    "Beach/Shoreline", "Hut/Shack", "Palm Trees",
    "Western Town/Saloon", "Enchanted Forest",
    "Sky/Clouds",
]
VALID_ELEMENTS_DECOR = [
    "Torches", "Lanterns", "Candles",
    "Columns/Pillars",
    "Vines/Ivy/Plants", "Statues/Sculptures",
    "Masks", "Tribal Art", "Weapons (swords/shields)",
    "Books/Scrolls", "Maps", "Chains/Locks/Keys", "Musical Instruments",
    "Food", "Drinks", "Clocks/Gears/Mechanical", "Banners/Flags",
    "Skulls/Bones", "Crowns", "Royal Jewelry",
    "Animals (decorative)", "Ships/Boats",
    "Speakers", "DJ Equipment", "Hieroglyphs/Ancient Writing",
    "Disco Ball", "Stage Lights", "Badge/Shield Emblem",
    "Chandeliers", "Christmas Decorations", "Snowflakes/Snow",
    "Stars", "Planets",
    "Ancient Stone Carvings", "Asian Lanterns", "Asian Decorations",
    "Fighting Ring/Cage", "Safe/Vault", "Chest",
    "Spacecraft/UFO/Sci-Fi Objects", "Office Items",
    "City Landmarks", "Skyline", "Train/Railway Station",
    "Gifts/Wrapped Presents", "Coin Stacks",
    "Curtains/Drapes", "Gold Coins/Treasure",
    "Candy/Sweets/Lollipops",
    "Flowers/Blossoms", "Hearts/Love Symbols",
    "Wallpaper/Decorative Pattern", "Graffiti",
]
VALID_ELEMENTS = VALID_ELEMENTS_EFFECTS + VALID_ELEMENTS_SCENE + VALID_ELEMENTS_DECOR
FRAME_ELEMENTS = set(VALID_ELEMENTS_FRAME)
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
  - For ANIMALS: name the EXACT species visible: "Gorilla", "Lion", "Eagle", "Buffalo", "Panther", "Wolf"
    Do NOT use "Wild Animal" or "Big Cat" — always identify the specific animal.
  - Do NOT use broad categories like "Wild Animals", "Greek/Roman Deity", "Egyptian Deity"
  - If unknown, use the most specific descriptive name: "Asian Boy", "Lady in Red", "Old Wizard"
  - REMEMBER: reel symbols are NOT characters. Only classify artwork that appears OUTSIDE the reel grid as large standalone art.

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

  IS an element: A pyramid in the background. A mountain range behind the reels.
    Statues flanking the reels. Trees in the background. A farmhouse in the distance.
  NOT an element: A pyramid that only appears as a small image ON the spinning reels (that is a SYMBOL).
    Generic glow, sparkles, light rays, shimmer — ignore these, they appear in almost every slot and are not useful.
  NOT an element: Frame/border material (stone frame, wood frame, metal frame, etc.) — DO NOT list frames. Frames
    are art decisions, not interesting for game design. Ignore the reel border material entirely.

  WHAT TO LOOK FOR (scan the ENTIRE screen outside the reels):
  1. BACKGROUND SCENE — What is behind/around the reels?
     Pyramids, mountains, castles, temples, forests, ocean floor, villages, cities, farmland, arenas,
     Japanese gardens, Arab/Middle Eastern buildings, Victorian streets, Asian architecture, underwater ruins,
     sky/clouds
  2. DECORATIVE OBJECTS — What objects are placed around the reels?
     Statues, columns, torches, lanterns, candles, weapons, shields, bamboo, vines, chandeliers,
     disco balls, speakers, hieroglyphs, stone carvings, Asian lanterns, Asian decorations, skulls, banners,
     fireworks, Christmas decorations, snowflakes, books/scrolls, musical instruments, graffiti
  3. PROMINENT EFFECTS — Only effects that DEFINE the game's look:
     Fire/flames, lightning, fog/smoke, water, snow/ice, neon glow, magic energy, bubbles, fireworks
     (Do NOT list glow, sparkles, light rays, shimmer — these are generic and not useful)

  CRITICAL: Be thorough. Scan every corner. Most games have 3-6 elements. List what makes THIS game visually unique.

  COMMON MISSES (check these specifically):
  - Trees visible → "Trees"; Dense forest background → "Forest"; Magical/glowing forest → "Enchanted Forest"
  - Castle in background → "Castle"; Fortress walls → "Fortress"; Standalone tower → "Tower" (these are SEPARATE items)
  - Candy, lollipops, sweets, cakes visible → "Candy/Sweets/Lollipops"
  - Gold coins, treasure piles → "Gold Coins/Treasure"
  - Palm trees → "Palm Trees"
  - Beach or shoreline visible → "Beach/Shoreline"
  - Huts, shacks, thatched roof buildings → "Hut/Shack"
  - Western-style buildings, saloons → "Western Town/Saloon"
  - Curtains or drapes → "Curtains/Drapes"
  - Vines, leaves, ivy in background → "Vines/Ivy/Plants"
  - Snowy mountains → list BOTH "Mountains" AND "Snowflakes/Snow"
  - Torches visible on sides → "Torches" (separate from "Lanterns" and "Candles")
  - Village scene → specify style: "Village/Town" or "Western Town/Saloon" or "Viking Village"
  - Flowers or blossoms in background → "Flowers/Blossoms" (NOT "Vines/Ivy/Plants")
  - Hearts, love symbols in background → "Hearts/Love Symbols"
  - Wallpaper pattern, ornate background texture → "Wallpaper/Decorative Pattern"
  - Grass or lawn visible (not just fields) → "Fields/Grassland"
  - Stones, rocks, boulders in the background → "Mountains"
  - Sky visible, clouds → "Sky/Clouds"
  - Graffiti on walls or background → "Graffiti"
  - Asian lanterns (hanging paper lanterns) → "Asian Lanterns" (separate from general "Lanterns")
  - Asian decorative patterns, fans, parasols → "Asian Decorations" (separate from "Asian Lanterns")

  COMMON FALSE POSITIVES (avoid these):
  - "Statues/Sculptures": ONLY use if you see ACTUAL statues/sculptures as large background art flanking or decorating the game.
    Do NOT tag Statues/Sculptures just because statue-like images appear as REEL SYMBOLS. Apply the same reel test as characters.
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
10. ELEMENTS ARE SCREEN-LEVEL: Elements describe the background, effects, and decorative objects — NOT the symbols on the reels. DO NOT list frame/border materials (stone, wood, metal, etc.) — frames are not interesting elements.
11. STATUES/SCULPTURES REEL TEST: "Statues/Sculptures" is ONLY for actual statues visible as BACKGROUND DECOR (flanking reels, in the background scene). If statue-like imagery only appears ON the reels as spinning symbols, do NOT list "Statues/Sculptures" as an element.
12. NO FRAME ELEMENTS: Never list what the reel border/frame is made of. No "Stone Frame", "Wood Frame", "Metal Frame", "Neon/LED Frame", "Minimal/No Frame", etc. Frame material is an art production decision, not a game design element.
"""


# ─── Symbol→Element keyword mapping ──────────────────────────────
SYMBOL_ELEMENT_HINTS = {
    r'\bpyramid': 'Pyramids',
    r'\btemple': 'Temples',
    r'\bstatue': 'Statues/Sculptures',
    r'\bsculpture': 'Statues/Sculptures',
    r'\bvault': 'Safe/Vault',
    r'\bsafe\b': 'Safe/Vault',
    r'\bchest\b': 'Chest',
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
    r'\bbook\b': 'Books/Scrolls',
    r'\bscroll': 'Books/Scrolls',
    r'\bmap\b': 'Maps',
    r'\bskull': 'Skulls/Bones',
    r'\bbone': 'Skulls/Bones',
    r'\bcrown': 'Crowns',
    r'\btiara': 'Royal Jewelry',
    r'\bfountain': 'Statues/Sculptures',
    r'\bgate\b': 'Columns/Pillars',
    r'\bcolumn': 'Columns/Pillars',
    r'\bpillar': 'Columns/Pillars',
    r'\bmask': 'Masks',
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
    r'\bflower': 'Flowers/Blossoms',
    r'\bblossom': 'Flowers/Blossoms',
    r'\bheart': 'Hearts/Love Symbols',
    r'\bwallpaper': 'Wallpaper/Decorative Pattern',
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
COLOR (pick 2-4, check ENTIRE screen including background sky, side panels): {json.dumps(COLOR_VOCABULARY)}
CHARACTER: {json.dumps(VALID_CHARACTERS)}
ELEMENTS (pick all that apply — DO NOT list frame/border materials):
  EFFECTS: {json.dumps(VALID_ELEMENTS_EFFECTS)}
  SCENE: {json.dumps(VALID_ELEMENTS_SCENE)}
  DECOR: {json.dumps(VALID_ELEMENTS_DECOR)}
NARRATIVE: {json.dumps(VALID_NARRATIVES)}

## OUTPUT FORMAT
Return ONLY a raw JSON object (no markdown, no backticks):
{{
  "screenshot_quality": "gameplay" or "promotional" or "rules_page" or "no_screenshot",
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

SCREENSHOT QUALITY CHECK (MANDATORY — set screenshot_quality FIRST):
  "gameplay"      = Shows an actual slot machine with visible reel grid, symbols, and game UI (spin button, bet controls). This is what we want.
  "promotional"   = Marketing art, game logo, banner, phone mockup, app store screenshot, or any image that does NOT show the actual game reels in play.
  "rules_page"    = Paytable, rules explanation, or help screen — not the actual game.
  "no_screenshot" = No image was provided.
  If screenshot_quality is NOT "gameplay", your classification confidence should be LOW (1-2) and you should rely primarily on the text description.

IMPORTANT for art_character_locations: For EACH character you list, you MUST specify where it appears:
- "outside_reels" = character artwork is OUTSIDE the reel grid (side panels, above/below reels, background)
- "reel_only" = character ONLY appears as a symbol ON the spinning reels
Only characters with "outside_reels" should be in art_characters. If ALL are "reel_only", use ["No Characters (symbol-only game)"].

IMPORTANT for art_color_tone: Output EXACTLY 4 colors in most cases. After identifying the 3 most dominant colors, ALWAYS look for a 4th:
- Is there a visible sky/background color? → "Light Blue", "Blue"
- Are there accent/highlight colors? → "Pink", "White", "Teal"
- Check: reel area, background BEHIND reels, side panels, top/bottom areas
Only use 3 colors for truly monochrome/limited-palette games (e.g., black + red + gold with nothing else).
Include background colors like sky blue ("Light Blue"), pink accents, etc."""


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
    "trees": "Trees", "forest": "Forest",
    "trees/forest": "Trees", "trees/forest background": "Trees",
    "castle": "Castle", "fortress": "Fortress", "tower": "Tower",
    "castle/fortress/tower": "Castle",
    "candy": "Candy/Sweets/Lollipops", "sweets": "Candy/Sweets/Lollipops",
    "lollipops": "Candy/Sweets/Lollipops", "lollipop": "Candy/Sweets/Lollipops",
    "candy/sweets": "Candy/Sweets/Lollipops",
    "gold coins/treasure": "Gold Coins/Treasure",
    "caution tape": None, "crime scene tape": None,
    "caution tape/crime scene frame": None,
    "fields": "Fields/Grassland", "grassland": "Fields/Grassland", "meadow": "Fields/Grassland",
    "fields/grassland/meadow": "Fields/Grassland",
    "pyramids": "Pyramids", "temples": "Temples",
    "pyramids/temples": "Pyramids", "pyramids/temples/ancient structures": "Pyramids",
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
    "rope frame": None, "rope border": None,
    "stairs": "Stairs/Steps", "steps": "Stairs/Steps", "staircase": "Stairs/Steps",
    "stars": "Stars", "planets": "Planets", "stars and planets": "Stars",
    "stars/planets": "Stars",
    "slot machines": "Casino Interior", "casino equipment": "Casino Interior",
    "slot machines/casino equipment": "Casino Interior",
    "banners": "Banners/Flags", "flags": "Banners/Flags",
    "banners/flags/ribbons": "Banners/Flags",
    "office items": "Office Items", "office items (desk, pencils, mugs)": "Office Items",
    "bank": "Bank/Vault Building", "vault building": "Bank/Vault Building",
    "viking ship": "Viking Ship", "viking village": "Viking Village",
    "viking ship/village": "Viking Ship",
    "weapons": "Weapons (swords/shields)",
    "asian lanterns": "Asian Lanterns",
    "asian decorations": "Asian Decorations",
    "asian lanterns/decorations": "Asian Lanterns",
    "fighting cage": "Fighting Ring/Cage", "fighting ring": "Fighting Ring/Cage",
    "kitchen": "Kitchen", "fridge": "Kitchen", "appliances": "Appliances",
    "kitchen/appliances": "Kitchen",
    "victorian buildings": "Victorian Buildings", "victorian scenery": "Victorian Buildings",
    "japanese garden": "Japanese Garden", "japanese trees": "Trees",
    "japanese garden/trees": "Japanese Garden",
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
    "coins": "Gold Coins/Treasure", "gold coins": "Gold Coins/Treasure",
    "coins/gold piles": "Gold Coins/Treasure", "treasure": "Gold Coins/Treasure",
    "gems": None, "jewels": None, "gems/jewels": None,
    "dust": None, "sand": None, "dust/sand": None,
    "wind": None, "motion lines": None, "wind/motion lines": None,
    "city landmarks": "City Landmarks", "skyline": "Skyline",
    "landmarks": "City Landmarks", "eiffel tower": "City Landmarks",
    "statue of liberty": "City Landmarks", "city skyline": "Skyline",
    "city landmarks/skyline": "City Landmarks",
    "train": "Train/Railway Station", "train station": "Train/Railway Station",
    "railway": "Train/Railway Station", "railway station": "Train/Railway Station",
    "tube station": "Train/Railway Station",
    "gifts": "Gifts/Wrapped Presents", "wrapped presents": "Gifts/Wrapped Presents",
    "presents": "Gifts/Wrapped Presents", "gift boxes": "Gifts/Wrapped Presents",
    "coin stacks": "Coin Stacks", "stacked coins": "Coin Stacks",
    "coin piles": "Coin Stacks", "treasure coins": "Coin Stacks",
    "masks": "Masks", "tribal art": "Tribal Art", "masks/tribal art": "Masks",
    "books": "Books/Scrolls", "scrolls": "Books/Scrolls", "maps": "Maps",
    "books/scrolls/maps": "Books/Scrolls", "books/scrolls": "Books/Scrolls",
    "food": "Food", "drinks": "Drinks", "food/drinks": "Food",
    "crowns": "Crowns", "royal jewelry": "Royal Jewelry",
    "crowns/royal jewelry": "Crowns",
    "speakers": "Speakers", "dj equipment": "DJ Equipment",
    "speakers/dj equipment": "Speakers",
    "safe": "Safe/Vault", "vault": "Safe/Vault", "chest": "Chest",
    "safe/vault/chest": "Safe/Vault", "safe/vault": "Safe/Vault",
    "graffiti": "Graffiti", "street art": "Graffiti",
    "sky": "Sky/Clouds", "clouds": "Sky/Clouds", "sky and clouds": "Sky/Clouds",
    "sky/clouds": "Sky/Clouds",
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
    "Gems/Jewels",
    "Gold Frame", "Stone Frame", "Wood Frame", "Crystal/Glass Frame",
    "Metal Frame", "Marble Frame", "Bamboo Frame", "Neon/LED Frame",
    "Colored Frame", "Rope Frame", "Caution Tape/Crime Scene Frame",
    "Minimal/No Frame",
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
        'Pyramids', 'Temples', 'Hieroglyphs/Ancient Writing',
        'Torches', 'Columns/Pillars',
        'Statues/Sculptures',
    ],
    'Asian Temple/Garden': [
        'Asian Lanterns', 'Asian Decorations', 'Bamboo',
        'Asian Architecture',
    ],
    'Norse/Viking Realm': [
        'Viking Ship', 'Viking Village', 'Weapons (swords/shields)',
        'Ancient Stone Carvings',
    ],
    'Irish/Celtic Highlands': [
        'Fields/Grassland', 'Trees',
    ],
    'Underwater Kingdom': [
        'Coral Reef/Underwater', 'Bubbles',
    ],
    'Ancient Greece/Rome': [
        'Columns/Pillars',
    ],
    'Haunted Manor/Graveyard': [
        'Skulls/Bones', 'Candles', 'Torches',
    ],
    'Farm/Countryside': [
        'Farmhouse/Barn', 'Fields/Grassland', 'Trees',
    ],
    'Casino Floor': [
        'Casino Interior', 'City Landmarks',
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
        'Pyramids', 'Temples', 'Ancient Stone Carvings',
        'Torches',
    ],
    'Arabian Palace/Bazaar': [
        'Arab/Middle Eastern Architecture', 'Lanterns',
    ],
    'Forest/Woodland': [
        'Trees', 'Forest', 'Vines/Ivy/Plants',
    ],
    'Prairie/Plains/Grassland': [
        'Fields/Grassland',
    ],
    'Pirate/Treasure Island': [
        'Ships/Boats', 'Skulls/Bones',
    ],
    'Jungle/Rainforest': [
        'Trees', 'Vines/Ivy/Plants', 'Ancient Stone Carvings',
        'Statues/Sculptures',
    ],
    'Festive/Holiday': [
        'Christmas Decorations', 'Snowflakes/Snow', 'Gifts/Wrapped Presents',
    ],
    'Treasure Cave/Mine': [
        'Coin Stacks', 'Safe/Vault', 'Chest', 'Torches',
    ],
    'Luxury/VIP': [
        'Coin Stacks',
    ],
    'Money/Gold/Luxury': [
        'Coin Stacks',
    ],
    'Outer Space': [
        'Stars', 'Planets', 'Neon Glow',
    ],
    'Royal Palace/Court': [
        'Candles', 'Chandeliers', 'Columns/Pillars',
    ],
    'Laboratory/Workshop': [
        'Candles', 'Books/Scrolls', 'Maps',
    ],
    'Deep Ocean/Underwater': [
        'Coral Reef/Underwater', 'Underwater Structures', 'Bubbles',
    ],
    'Medieval Castle': [
        'Castle', 'Torches', 'Banners/Flags',
    ],
    'Pirate Ship/Port': [
        'Ships/Boats', 'Skulls/Bones',
    ],
    'Candy/Sweet World': [
        'Candy/Sweets/Lollipops',
    ],
    'Inferno/Fire': [
        'Fire/Flames',
    ],
}

DESC_ELEMENT_KEYWORDS = {
    r'\bunderwater\b|\bocean\b|\bsea\b|\baquatic\b': 'Coral Reef/Underwater',
    r'\bpyramid\b|\bpharaoh\b|\begypt\b': 'Pyramids',
    r'\bhieroglyphs?\b': 'Hieroglyphs/Ancient Writing',
    r'\bviking\b|\bnorse\b|\bvalhalla\b': 'Viking Ship',
    r'\bbamboo\b': 'Bamboo',
    r'\btropical\s+plants?\b': 'Tropical Plants',
    r'\bfarm\b|\bbarn\b': 'Farmhouse/Barn',
    r'\bstadium\b|\barena\b|\bfight(?:er|ing)\b|\bbox(?:er|ing)\b|\bwrestl': 'Sports Arena/Stadium',
    r'\bcasino\b|\bslot\s*machine': 'Casino Interior',
    r'\bsteampunk\b|\bvictorian\b': 'Victorian Buildings',
    r'\bcolosseum\b|\bparthenon\b|\bgreek\s*temple': 'Columns/Pillars',
    r'\blazer\b|\bneon\b(?!.*frame)': 'Neon Glow',
    r'\bcoral\s*reef\b': 'Coral Reef/Underwater',
    r'\btrain\b|\btube\b|\brailway\b|\bunderground\b': 'Train/Railway Station',
    r'\bvegas\b|\blas\s*vegas\b': 'City Landmarks',
    r'\bgifts?\b|\bpresents?\b|\bwrapped\b': 'Gifts/Wrapped Presents',
    r'\bbasketball\b': 'Basketball Court',
    r'\bstair(s|case)?\b|\bsteps?\b': 'Stairs/Steps',
    r'\bplanet(s|ary)?\b|\bcomet\b|\bconstellation': 'Planets',
    r'\bpanda\b|\bchinese\b|\basian\b(?!.*slot)': 'Asian Decorations',
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
    normalized_elems = [e for e in normalized_elems if e not in FRAME_ELEMENTS]
    result['art_elements'] = normalized_elems

    # Fix 4b: Remove elements that are actually reel symbols (not background)
    ELEM_SYMBOL_EXCLUSIONS = {
        'Mountains/Landscape Background': [r'\bmountain\b', r'\bmt\.?\b'],
        'Pyramids': [r'\bpyramid\b'],
        'Temples': [r'\btemple\b'],
        'Castle': [r'\bcastle\b'],
        'Fortress': [r'\bfortress\b'],
        'Tower': [r'\btower\b'],
        'Waterfall': [r'\bwaterfall\b'],
        'Ships/Boats': [r'\bship\b', r'\bboat\b', r'\bgalleon\b', r'\bvessel\b'],
        'Statues/Sculptures': [r'\bstatue\b', r'\bsculpture\b', r'\bsphinx\b', r'\bidol\b'],
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
                   game_corrections=None, game_description="",
                   use_masked=True, use_cache=True):
    name, review = extract_review(fname)
    if not review or len(review) < 50:
        return None, name, 'no review', {}

    screenshot_b64, media_type = None, None
    masked_b64 = None
    if use_vision:
        screenshot_b64, media_type = load_screenshot(fname)
        if screenshot_b64 and use_masked:
            masked_b64 = create_masked_screenshot(fname)

    user_content = build_user_message(name, review, screenshot_b64, media_type,
                                      symbol_names, game_corrections, masked_b64,
                                      description_text=game_description)
    has_image = screenshot_b64 is not None

    sys_content = system_prompt
    if use_cache:
        sys_content = [{"type": "text", "text": system_prompt, "cache_control": {"type": "ephemeral"}}]

    usage_data = {}
    max_retries = 3
    for attempt in range(max_retries):
        resp = client.messages.create(
            model=MODEL,
            max_tokens=1000,
            system=sys_content,
            messages=[{"role": "user", "content": user_content}],
        )
        usage_data = {
            'input_tokens': resp.usage.input_tokens,
            'output_tokens': resp.usage.output_tokens,
            'cache_creation_input_tokens': getattr(resp.usage, 'cache_creation_input_tokens', 0),
            'cache_read_input_tokens': getattr(resp.usage, 'cache_read_input_tokens', 0),
        }
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

    return result, name, fixes, usage_data


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


def run_batch(files, use_vision=True, output_path=None, use_masked=True, use_cache=True):
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
            result, name, fixes, usage = classify_game(client, system_prompt, fname, use_vision,
                                                       sym_names, game_corrections, game_desc,
                                                       use_masked=use_masked, use_cache=use_cache)
            if result is None:
                print(f"  SKIP: {fixes}", flush=True)
                continue

            if fixes:
                for fix in fixes:
                    print(f"  FIX: {fix}", flush=True)

            ss_quality = result.get('screenshot_quality', 'unknown')
            entry = {
                'file': fname,
                'name': name,
                'screenshot_quality': ss_quality,
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

            ss_warn = f"  ⚠ SCREENSHOT: {ss_quality}" if ss_quality != 'gameplay' else ""
            print(f"  Theme:    {entry['art_theme']}", flush=True)
            if entry['art_theme_secondary']:
                print(f"  Theme2:   {entry['art_theme_secondary']}", flush=True)
            print(f"  Colors:   {entry['art_color_tone']}", flush=True)
            print(f"  Chars:    {entry['art_characters']}", flush=True)
            if entry.get('art_character_categories'):
                print(f"  CharCats: {entry['art_character_categories']}", flush=True)
            print(f"  Elements: {entry['art_elements'][:5]}{'...' if len(entry.get('art_elements', [])) > 5 else ''}", flush=True)
            print(f"  Vision:   {'Yes' if entry['_has_screenshot'] else 'No'}", flush=True)
            if ss_warn:
                print(ss_warn, flush=True)

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
                "system": [{"type": "text", "text": system_prompt, "cache_control": {"type": "ephemeral"}}],
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

                ss_quality = processed.get('screenshot_quality', 'unknown')
                entry = {
                    'file': fname,
                    'name': name_preview,
                    'screenshot_quality': ss_quality,
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
                ss_flag = f" ⚠ SS:{ss_quality}" if ss_quality != 'gameplay' else ""
                print(f"  OK: {fname} → {entry['art_theme']}{ss_flag}", flush=True)
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

    if len(results) > 5:
        batch_num = len(log.get('runs', []))
        close_batch_gate(batch_num, len(results))


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


def check_batch_gate(batch_size):
    """Check the batch gate before allowing classification runs.

    Returns True if gate is open, False if closed.
    Batches of <=10 games bypass for re-verification/spot-check fixes only.
    Gate file missing = CLOSED (fail-safe). No --force-gate override exists.
    """
    if batch_size <= 10:
        print(f"  [gate] Small batch ({batch_size} games) — bypassing gate for re-verification.", flush=True)
        return True
    if not os.path.exists(BATCH_GATE_PATH):
        print(f"\n{'=' * 60}")
        print("BATCH GATE CLOSED — gate file missing (fail-safe)")
        print(f"{'=' * 60}")
        print(f"  {BATCH_GATE_PATH} does not exist.")
        print(f"  Create it with gate_open: true to proceed.\n")
        return False
    with open(BATCH_GATE_PATH) as f:
        gate = json.load(f)
    if gate.get('gate_open', False):
        return True
    last = gate.get('last_spot_check', {})
    print(f"\n{'=' * 60}")
    print("BATCH GATE CLOSED — cannot start new batch")
    print(f"{'=' * 60}")
    print(f"  Last spot-check: Batch {last.get('batch', '?')}")
    print(f"  Accuracy: {last.get('accuracy_pct', '?')}% ({last.get('ok', '?')} OK / {last.get('fix', '?')} Fix)")
    print(f"  Fixes applied: {last.get('fixes_applied', False)}")
    print(f"  Post-fix regression: {last.get('regression_post_fix', 'not run')}")
    reason = gate.get('reason', 'Spot-check issues not yet resolved')
    print(f"  Reason: {reason}")
    print(f"\nTo open the gate: fix issues, run --regression-full (auto-opens if theme ≥97%).")
    print(f"There is no bypass flag. The gate is enforced.\n")
    return False


def close_batch_gate(batch_num, game_count):
    """Auto-close the gate after a batch completes. Forces spot-check before next batch."""
    from datetime import datetime
    gate = {}
    if os.path.exists(BATCH_GATE_PATH):
        with open(BATCH_GATE_PATH) as f:
            gate = json.load(f)
    gate['gate_open'] = False
    gate['last_batch'] = {
        'batch': batch_num,
        'games_classified': game_count,
        'completed_at': datetime.utcnow().isoformat() + 'Z',
    }
    gate['reason'] = f'Batch {batch_num} ({game_count} games) completed. Spot-check required before next batch.'
    gate['updated_at'] = datetime.utcnow().strftime('%Y-%m-%d')
    with open(BATCH_GATE_PATH, 'w') as f:
        json.dump(gate, f, indent=2)
    print(f"\n  [gate] CLOSED — spot-check batch {batch_num} before starting the next one.", flush=True)


def update_gate_from_regression(theme_adj_pct, overall_adj_pct=None):
    """Called by --regression-full. Opens gate if theme ≥97% AND overall ≥95%, otherwise keeps closed."""
    from datetime import datetime
    if not os.path.exists(BATCH_GATE_PATH):
        return
    with open(BATCH_GATE_PATH) as f:
        gate = json.load(f)
    if gate.get('gate_open', False):
        return
    last_sc = gate.get('last_spot_check', {})
    last_sc['regression_post_fix'] = f"{theme_adj_pct:.1f}%"
    if overall_adj_pct is not None:
        last_sc['overall_adj_pct'] = f"{overall_adj_pct:.1f}%"
    gate['last_spot_check'] = last_sc
    gate['updated_at'] = datetime.utcnow().strftime('%Y-%m-%d')

    theme_passes = theme_adj_pct >= 97.0
    overall_passes = overall_adj_pct is None or overall_adj_pct >= 95.0
    fixes_applied = last_sc.get('fixes_applied', False)

    if theme_passes and overall_passes:
        if fixes_applied:
            gate['gate_open'] = True
            overall_str = f", overall {overall_adj_pct:.1f}%" if overall_adj_pct is not None else ""
            gate['reason'] = f'Regression passes: theme {theme_adj_pct:.1f}% (≥97%){overall_str} (≥95%). Gate opened.'
            print(f"\n  [gate] OPENED — theme {theme_adj_pct:.1f}%{overall_str} passes thresholds.", flush=True)
        else:
            gate['reason'] = f'Regression passes but fixes_applied is false. Apply fixes first.'
            print(f"\n  [gate] Still closed — regression passes but fixes_applied=false.", flush=True)
    else:
        reasons = []
        if not theme_passes:
            reasons.append(f"theme {theme_adj_pct:.1f}% < 97%")
        if not overall_passes:
            reasons.append(f"overall {overall_adj_pct:.1f}% < 95%")
        gate['reason'] = f'Regression below threshold: {", ".join(reasons)}. Fix issues and re-run.'
        print(f"\n  [gate] Still closed — {', '.join(reasons)}.", flush=True)

    with open(BATCH_GATE_PATH, 'w') as f:
        json.dump(gate, f, indent=2)


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


def _fix_resolved_characters(note, result_chars, corrections_entry):
    """Check if a character fix verdict has been resolved by current result + corrections."""
    import re
    note_lower = note.lower().strip()
    result_set = set(result_chars) if isinstance(result_chars, list) else set()
    no_chars = 'No Characters (symbol-only game)' in result_set

    override = corrections_entry.get('override_characters')
    if override and set(override) == result_set:
        return True

    no_char_phrases = ['no char', 'just symbol', 'only symbol', 'they are symbol',
                       'all symbol', 'just on symbol', 'all are symbol',
                       'only in the symbol', 'part of the logo', 'not a real char']
    if any(p in note_lower for p in no_char_phrases) and no_chars:
        return True

    note_tokens = set(re.split(r'[^a-z]+', note_lower)) - {'', 'correct', 'but', 'should',
        'say', 'more', 'like', 'a', 'an', 'the', 'its', 'is', 'not', 'really', 'yes'}
    result_lower = {c.lower() for c in result_set}
    for rt in result_lower:
        rt_tokens = set(re.split(r'[^a-z]+', rt)) - {''}
        if rt_tokens & note_tokens and len(rt_tokens & note_tokens) >= 1:
            return True

    return False


def _fix_resolved_elements(note, result_elems, corrections_entry):
    """Check if an element fix verdict has been resolved by current result + corrections."""
    import re
    note_lower = note.lower().strip()
    result_set = set(result_elems) if isinstance(result_elems, list) else set()

    override = corrections_entry.get('override_elements')
    if override is not None and set(override) == result_set:
        return True

    must_not = corrections_entry.get('must_not_elements', [])
    must_have = corrections_entry.get('must_have_elements', [])
    if must_not or must_have:
        must_not_ok = all(e not in result_set for e in must_not)
        must_have_ok = all(e in result_set for e in must_have)
        if must_not_ok and must_have_ok:
            return True

    frame_words = ['frame', 'rope frame', 'wood frame', 'stone frame', 'metal frame',
                   'neon frame', 'colored frame', 'minimal/no frame']
    if any(fw in note_lower for fw in frame_words):
        has_frames = any('Frame' in e for e in result_set) or any('Minimal' in e for e in result_set)
        if not has_frames:
            return True

    sep_words = ['separate', 'split', 'combined', 'too broad']
    if any(sw in note_lower for sw in sep_words):
        old_combos = ['Asian Lanterns/Decorations', 'Pyramids/Temples', 'Books/Scrolls/Maps',
                      'Masks/Tribal Art', 'Stars/Planets', 'Safe/Vault/Chest',
                      'Speakers/DJ Equipment', 'City Landmarks/Skyline',
                      'Japanese Garden/Trees', 'Viking Ship/Village',
                      'Crowns/Royal Jewelry', 'Kitchen/Appliances', 'Food/Drinks',
                      'Trees/Forest', 'Castle/Fortress/Tower', 'Bamboo/Tropical Plants']
        stale = any(combo in result_set for combo in old_combos)
        if not stale:
            return True

    bloat_words = ['redundant', 'bloat', 'remove redundant']
    if any(bw in note_lower for bw in bloat_words):
        noise_in_result = any('Frame' in e or 'Scrollwork' in e or 'Glitter' in e
                              for e in result_set)
        if not noise_in_result:
            return True

    return False


def _fix_resolved_color(note, result_colors, corrections_entry):
    """Check if a color fix verdict has been resolved by current result + corrections."""
    import re
    note_lower = note.lower().strip()
    result_set = set(c.lower() for c in result_colors) if isinstance(result_colors, list) else set()

    color_names = ['red', 'blue', 'green', 'gold', 'purple', 'orange', 'yellow',
                   'pink', 'silver', 'bronze', 'brown', 'black', 'white', 'gray',
                   'teal', 'light blue', 'neon']

    also_pattern = re.findall(r'also\s+(\w+)', note_lower)
    for color in also_pattern:
        if color in result_set:
            return True

    for cn in color_names:
        if cn in note_lower and cn in result_set:
            return True

    return False


def run_expanded_regression():
    """Score current results.json against all human-reviewed games.

    No API calls — purely offline comparison of stored results vs stored verdicts.
    OK verdicts (empty note) = dimension was correct at review time.
    Fix verdicts (non-empty note) = dimension was wrong, check if corrections fixed it.
    Resolution logic runs for ALL dimensions (theme, characters, elements, colors).
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

    corrections = {}
    if os.path.exists(CORRECTIONS_PATH):
        with open(CORRECTIONS_PATH) as f:
            corrections = json.load(f).get('corrections', {})

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

            note_lower = note.lower()
            is_bad_ss = any(kw in note_lower for kw in ['not a game screenshot', 'not an ingame screenshot',
                                                         'bad screenshot', 'not a game screesnhot'])
            if not note:
                dim_ok[d] += 1
            elif note.upper().startswith('INVALID'):
                dim_fix_total[d] += 1
                dim_fix_resolved[d] += 1
            elif is_bad_ss and (r.get('screenshot_quality') == 'gameplay'
                                or corrections.get(fname, {}).get('bad_screenshot_unfixable')):
                dim_fix_total[d] += 1
                dim_fix_resolved[d] += 1
            else:
                dim_fix_total[d] += 1
                corr_entry = corrections.get(fname, {})
                resolved = False

                if d == 'art_theme':
                    result_theme = r.get('art_theme', '')
                    result_secondary = r.get('art_theme_secondary', '')
                    resolved = _fix_note_matches_theme(note, result_theme, result_secondary)
                    got_str = result_theme + (f" / {result_secondary}" if result_secondary else "")
                elif d == 'art_characters':
                    result_chars = r.get('art_characters', [])
                    resolved = _fix_resolved_characters(note, result_chars, corr_entry)
                    got_str = ', '.join(str(x) for x in result_chars) if result_chars else '(empty)'
                elif d == 'art_elements':
                    result_elems = r.get('art_elements', [])
                    resolved = _fix_resolved_elements(note, result_elems, corr_entry)
                    got_str = ', '.join(str(x) for x in result_elems) if result_elems else '(empty)'
                elif d == 'art_color_tone':
                    result_colors = r.get('art_color_tone', [])
                    resolved = _fix_resolved_color(note, result_colors, corr_entry)
                    got_str = ', '.join(str(x) for x in result_colors) if result_colors else '(empty)'
                else:
                    got_val = r.get(d, '')
                    got_str = str(got_val) if got_val else '(empty)'

                if resolved:
                    dim_fix_resolved[d] += 1
                else:
                    per_game_issues.append((fname, d, note[:80], got_str))

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
        dim_labels = {'art_theme': 'THEME', 'art_characters': 'CHARACTERS',
                      'art_elements': 'ELEMENTS', 'art_color_tone': 'COLOR'}
        for d in dims:
            d_issues = [(f, dim, n, g) for f, dim, n, g in per_game_issues if dim == d]
            if not d_issues:
                continue
            label = dim_labels.get(d, d)
            print(f"\n{'─' * 60}")
            print(f"{label} — unresolved fix verdicts ({len(d_issues)}):")
            for fname, _, note, got in sorted(d_issues):
                print(f"  {fname:40s} note: {note}")
                print(f"  {'':40s} got:  {got}")

    # Metric sanity check: flag dimensions where fix-resolution logic may be broken.
    # If a dimension has many fixes but almost none resolved, the resolution code
    # is likely not covering that dimension — exactly the Incident-2 blind spot.
    sanity_failures = []
    for d in dims:
        ft = dim_fix_total[d]
        fr = dim_fix_resolved[d]
        if ft > 10 and fr < 3:
            label = d.replace('art_', '')
            sanity_failures.append(f"{label}: {ft} fixes, only {fr} resolved")
    if sanity_failures:
        print(f"\n{'!' * 60}")
        print("METRIC SANITY CHECK FAILED")
        print(f"{'!' * 60}")
        for sf in sanity_failures:
            print(f"  {sf}")
        print("\nThis likely means fix-resolution logic is missing or broken for")
        print("these dimensions. DO NOT proceed until investigated.")
        print(f"{'!' * 60}\n")

    theme_total = dim_total.get('art_theme', 0)
    overall_adj = (total_ok + total_fix_resolved) / total_verdicts * 100 if total_verdicts > 0 else 0
    if theme_total > 0:
        theme_adj = (dim_ok.get('art_theme', 0) + dim_fix_resolved.get('art_theme', 0)) / theme_total * 100
        update_gate_from_regression(theme_adj, overall_adj)

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


def repair_screenshots():
    """Find games with non-gameplay screenshots, try alternative SC images, report."""
    import urllib.request

    if not os.path.exists(RESULTS_PATH):
        print("No results.json found.")
        return

    with open(RESULTS_PATH) as f:
        results = json.load(f)

    bad_games = []
    for fname, r in results.get('games', {}).items():
        sq = r.get('screenshot_quality', 'unknown')
        if sq in ('promotional', 'rules_page'):
            bad_games.append((fname, sq))

    if not bad_games:
        print("No non-gameplay screenshots found in results.")
        return

    print(f"\nFound {len(bad_games)} games with non-gameplay screenshots:")
    for fname, sq in bad_games:
        print(f"  {fname:50s} {sq}")

    sc_dir = os.path.join(SCRIPT_DIR, '_legacy', 'sc_cache')
    base_url = 'https://slotcatalog.com'
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': base_url + '/',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
    }

    repaired = 0
    no_alternative = 0

    for fname, sq in bad_games:
        base = fname.replace('.html', '')
        sc_path = os.path.join(sc_dir, fname)
        if not os.path.exists(sc_path):
            print(f"  {base}: no SC cache, skipping")
            no_alternative += 1
            continue

        with open(sc_path) as f:
            html = f.read()

        urls = []
        for m in re.finditer(r'userfiles/image/games/[^"\'>\s]+', html):
            u = m.group()
            if u not in urls and not re.search(r'_s\.\w+$', u):
                urls.append(u)

        if len(urls) <= 2:
            print(f"  {base}: only {len(urls)} images, no better option")
            no_alternative += 1
            continue

        # Try images starting from #3 (index 2), since #1 and #2 were already tried
        downloaded = False
        for try_idx in range(2, min(len(urls), 6)):
            img_url = urls[try_idx]
            ext = os.path.splitext(img_url)[1] or '.jpg'
            dest = os.path.join(SCREENSHOT_DIR, base + ext)
            full_url = base_url + '/' + img_url

            try:
                req = urllib.request.Request(full_url, headers=headers)
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = resp.read()
                if len(data) < 1000:
                    continue

                # Remove old screenshot
                for old_ext in ['.png', '.jpg', '.jpeg', '.webp']:
                    old_path = os.path.join(SCREENSHOT_DIR, base + old_ext)
                    if old_path != dest and os.path.exists(old_path):
                        os.remove(old_path)

                with open(dest, 'wb') as f:
                    f.write(data)
                print(f"  {base}: replaced with image #{try_idx + 1} ({len(data)//1024}KB)")
                downloaded = True
                repaired += 1
                break
            except Exception as e:
                continue

        if not downloaded:
            print(f"  {base}: all alternatives failed")
            no_alternative += 1

    print(f"\nRepair summary: {repaired} re-downloaded, {no_alternative} no alternative")
    if repaired > 0:
        print(f"\nRe-classify the repaired games:")
        repair_files = [fname for fname, sq in bad_games
                        if os.path.exists(os.path.join(SCREENSHOT_DIR,
                            fname.replace('.html', '') + '.jpg')) or
                           os.path.exists(os.path.join(SCREENSHOT_DIR,
                            fname.replace('.html', '') + '.png')) or
                           os.path.exists(os.path.join(SCREENSHOT_DIR,
                            fname.replace('.html', '') + '.webp'))]
        for rf in repair_files:
            print(f"  {rf}")
        print(f"\nRun: python3 classify_art_v2.py --batch-api {' '.join(repair_files)}")


def calculate_cost(usage, is_batch=False, cache_ttl='5m'):
    """Calculate USD cost from token usage using Sonnet 4 pricing."""
    input_rate = 1.5 if is_batch else 3.0
    output_rate = 7.5 if is_batch else 15.0
    write_mult = 2.0 if cache_ttl == '1h' else 1.25

    uncached = (usage.get('input_tokens', 0) / 1e6) * input_rate
    cache_write = (usage.get('cache_creation_input_tokens', 0) / 1e6) * input_rate * write_mult
    cache_read = (usage.get('cache_read_input_tokens', 0) / 1e6) * input_rate * 0.1
    output = (usage.get('output_tokens', 0) / 1e6) * output_rate
    return uncached + cache_write + cache_read + output


def run_cost_experiment():
    """Run 4-config cost experiment on 20 human-reviewed games."""
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

    with open(USER_REVIEWS_PATH) as f:
        reviews_data = json.load(f)
    reviewed_games = reviews_data.get('games', {})

    if os.path.exists(RESULTS_PATH):
        with open(RESULTS_PATH) as f:
            results_data = json.load(f)
        results_games = results_data.get('games', {})
    else:
        results_games = {}

    auto_rounds = {'auto_v11_5', 'auto_text_v11_5'}
    candidates = []
    for fname, rev in sorted(reviewed_games.items()):
        if rev.get('round', '') in auto_rounds:
            continue
        if fname in results_games:
            candidates.append(fname)
    test_games = candidates[:20]
    print(f"Selected {len(test_games)} games for cost experiment")

    tests = {
        'T1_baseline': {'cache': False, 'masked': True, 'api': 'sync', 'cache_ttl': '5m'},
        'T2_cached': {'cache': True, 'masked': True, 'api': 'sync', 'cache_ttl': '5m'},
        'T3_no_masked': {'cache': True, 'masked': False, 'api': 'sync', 'cache_ttl': '5m'},
        'T4_batch_cached': {'cache': True, 'masked': True, 'api': 'batch', 'cache_ttl': '1h'},
    }

    all_results = {}

    for test_name, config in tests.items():
        print(f"\n{'=' * 60}")
        print(f"Running {test_name}: cache={config['cache']}, masked={config['masked']}, api={config['api']}")
        print(f"{'=' * 60}")

        test_start = time.time()
        per_game = []
        total_usage = {'input_tokens': 0, 'output_tokens': 0,
                       'cache_creation_input_tokens': 0, 'cache_read_input_tokens': 0}

        if config['api'] == 'batch':
            batch_requests = []
            batch_valid = []
            for fname in test_games:
                name, review = extract_review(fname)
                if not review or len(review) < 50:
                    continue
                game_corrections = corrections_db.get(fname)
                name_preview = fname.replace('.html', '').replace('-', ' ')
                sym_names = find_symbols_for_game(symbol_index, name_preview)
                game_desc = find_description_for_game(desc_index, name_preview)
                screenshot_b64, media_type = load_screenshot(fname)
                masked_b64 = None
                if screenshot_b64 and config['masked']:
                    masked_b64 = create_masked_screenshot(fname)
                user_content = build_user_message(name, review, screenshot_b64, media_type,
                                                  sym_names, game_corrections, masked_b64,
                                                  description_text=game_desc)
                custom_id = fname.replace('.html', '').replace('.', '_')
                sys_block = [{"type": "text", "text": system_prompt}]
                if config['cache']:
                    sys_block = [{"type": "text", "text": system_prompt,
                                  "cache_control": {"type": "ephemeral"}}]
                batch_requests.append({
                    "custom_id": custom_id,
                    "params": {
                        "model": MODEL,
                        "max_tokens": 1000,
                        "system": sys_block,
                        "messages": [{"role": "user", "content": user_content}],
                    }
                })
                batch_valid.append(fname)

            print(f"Submitting batch of {len(batch_requests)} games...", flush=True)
            batch = client.messages.batches.create(requests=batch_requests)
            batch_id = batch.id
            print(f"Batch ID: {batch_id}", flush=True)

            poll_interval = 10
            while True:
                batch = client.messages.batches.retrieve(batch_id)
                status = batch.processing_status
                counts = batch.request_counts
                print(f"  {status} | ok={counts.succeeded} err={counts.errored}", flush=True)
                if status == "ended":
                    break
                time.sleep(poll_interval)
                poll_interval = min(poll_interval * 1.5, 60)

            id_to_fname = {f.replace('.html', '').replace('.', '_'): f for f in batch_valid}
            for r in client.messages.batches.results(batch_id):
                fname = id_to_fname.get(r.custom_id, r.custom_id + '.html')
                if r.result.type == "succeeded":
                    msg = r.result.message
                    u = {
                        'input_tokens': msg.usage.input_tokens,
                        'output_tokens': msg.usage.output_tokens,
                        'cache_creation_input_tokens': getattr(msg.usage, 'cache_creation_input_tokens', 0),
                        'cache_read_input_tokens': getattr(msg.usage, 'cache_read_input_tokens', 0),
                    }
                    for k in total_usage:
                        total_usage[k] += u.get(k, 0)
                    raw = msg.content[0].text.strip()
                    raw = re.sub(r'^```\w*\n?', '', raw)
                    raw = re.sub(r'\n?```$', '', raw)
                    try:
                        parsed = json.loads(raw)
                    except json.JSONDecodeError:
                        m = re.search(r'\{[\s\S]*\}', raw)
                        parsed = json.loads(m.group()) if m else {}
                    name_preview = fname.replace('.html', '').replace('-', ' ')
                    sym_names = find_symbols_for_game(symbol_index, name_preview)
                    game_desc = find_description_for_game(desc_index, name_preview)
                    processed, _ = post_process(parsed, name_preview, sym_names,
                                                corrections_db.get(fname), game_desc)
                    per_game.append({
                        'file': fname, 'usage': u,
                        'theme': processed.get('art_theme', ''),
                        'theme_secondary': processed.get('art_theme_secondary', ''),
                        'characters': processed.get('art_characters', []),
                        'elements': processed.get('art_elements', []),
                        'colors': processed.get('art_color_tone', []),
                    })
        else:
            for i, fname in enumerate(test_games):
                print(f"  [{i+1}/{len(test_games)}] {fname}", flush=True)
                game_corrections = corrections_db.get(fname)
                name_preview = fname.replace('.html', '').replace('-', ' ')
                sym_names = find_symbols_for_game(symbol_index, name_preview)
                game_desc = find_description_for_game(desc_index, name_preview)
                try:
                    result, name, fixes, usage = classify_game(
                        client, system_prompt, fname, use_vision=True,
                        symbol_names=sym_names, game_corrections=game_corrections,
                        game_description=game_desc,
                        use_masked=config['masked'], use_cache=config['cache'])
                    if result is None:
                        continue
                    for k in total_usage:
                        total_usage[k] += usage.get(k, 0)
                    per_game.append({
                        'file': fname, 'usage': usage,
                        'theme': result.get('art_theme', ''),
                        'theme_secondary': result.get('art_theme_secondary', ''),
                        'characters': result.get('art_characters', []),
                        'elements': result.get('art_elements', []),
                        'colors': result.get('art_color_tone', []),
                    })
                except Exception as e:
                    print(f"    ERROR: {e}", flush=True)
                time.sleep(0.3)

        wall_clock = time.time() - test_start
        cost = calculate_cost(total_usage, is_batch=(config['api'] == 'batch'),
                              cache_ttl=config['cache_ttl'])

        accuracy = {'theme': 0, 'characters': 0, 'elements': 0, 'colors': 0}
        scored = 0
        for pg in per_game:
            rev = reviewed_games.get(pg['file'], {})
            verdicts = rev.get('verdicts', {})
            if not verdicts:
                continue
            scored += 1
            for dim_key, acc_key in [('art_theme', 'theme'), ('art_characters', 'characters'),
                                      ('art_elements', 'elements'), ('art_color_tone', 'colors')]:
                dv = verdicts.get(dim_key, {})
                v = dv.get('verdict') or dv.get('status', '')
                if v == 'ok' or not dv:
                    accuracy[acc_key] += 1

        acc_pct = {}
        for dim in accuracy:
            acc_pct[dim] = (accuracy[dim] / scored * 100) if scored > 0 else 0.0

        all_results[test_name] = {
            'config': config,
            'total_input_tokens': total_usage['input_tokens'],
            'total_output_tokens': total_usage['output_tokens'],
            'total_cache_creation_tokens': total_usage['cache_creation_input_tokens'],
            'total_cache_read_tokens': total_usage['cache_read_input_tokens'],
            'wall_clock_seconds': round(wall_clock, 1),
            'estimated_cost_usd': round(cost, 4),
            'accuracy': acc_pct,
            'games_scored': scored,
            'per_game': per_game,
        }

        print(f"\n  Tokens: in={total_usage['input_tokens']:,} out={total_usage['output_tokens']:,} "
              f"cache_create={total_usage['cache_creation_input_tokens']:,} "
              f"cache_read={total_usage['cache_read_input_tokens']:,}")
        print(f"  Cost: ${cost:.4f}  Time: {wall_clock:.0f}s")
        print(f"  Accuracy: theme={acc_pct['theme']:.1f}% chars={acc_pct['characters']:.1f}% "
              f"elem={acc_pct['elements']:.1f}% colors={acc_pct['colors']:.1f}%")

    experiment = {
        'timestamp': datetime.now().isoformat(),
        'games_tested': len(test_games),
        'game_files': test_games,
        'tests': all_results,
    }

    if 'T1_baseline' in all_results and 'T2_cached' in all_results:
        t1_cost = all_results['T1_baseline']['estimated_cost_usd']
        t2_cost = all_results['T2_cached']['estimated_cost_usd']
        savings = ((t1_cost - t2_cost) / t1_cost * 100) if t1_cost > 0 else 0
        experiment['comparison'] = {
            'caching_savings_pct': round(savings, 1),
        }

    exp_path = os.path.join(os.path.dirname(RESULTS_PATH), 'cost_experiment_results.json')
    with open(exp_path, 'w') as f:
        json.dump(experiment, f, indent=2)
    print(f"\nSaved experiment data to {exp_path}")

    print(f"\n{'=' * 100}")
    print(f"{'COST EXPERIMENT RESULTS':^100}")
    print(f"{'=' * 100}")
    print(f"{'Test':<14} | {'Input Tok':>10} | {'Cache Read':>10} | {'Cost':>8} | {'Time':>6} | "
          f"{'Theme':>6} | {'Chars':>6} | {'Elem':>6} | {'Colors':>6}")
    print('-' * 100)
    for tn, tr in all_results.items():
        label = tn.replace('_', ' ')
        a = tr['accuracy']
        print(f"{label:<14} | {tr['total_input_tokens']:>10,} | {tr['total_cache_read_tokens']:>10,} | "
              f"${tr['estimated_cost_usd']:>6.4f} | {tr['wall_clock_seconds']:>5.0f}s | "
              f"{a['theme']:>5.1f}% | {a['characters']:>5.1f}% | {a['elements']:>5.1f}% | {a['colors']:>5.1f}%")
    print(f"{'=' * 100}")


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
    parser.add_argument('--batch-api', action='store_true', help='Use Anthropic Batch API (50%% cheaper, async)')
    parser.add_argument('--allow-text-only', action='store_true', help='Allow batch to proceed even if under 80 pct have screenshots')
    parser.add_argument('--repair-screenshots', action='store_true',
                        help='Find non-gameplay screenshots in results, try alternative SC images, re-classify')
    parser.add_argument('--no-masked', action='store_true', help='Skip masked screenshot (send only original)')
    parser.add_argument('--no-cache', action='store_true', help='Disable prompt caching')
    parser.add_argument('--cost-experiment', action='store_true',
                        help='Run 4-config cost experiment on 20 games (caching, masked, batch)')
    # --force-gate intentionally removed — gate cannot be bypassed
    args = parser.parse_args()

    if args.stats:
        reviewed = load_user_reviews()
        results_count = 0
        ss_counts = {}
        if os.path.exists(RESULTS_PATH):
            with open(RESULTS_PATH) as f:
                data = json.load(f)
                results_count = data.get('total_games', 0)
                for g in data.get('games', {}).values():
                    q = g.get('screenshot_quality', 'unknown')
                    ss_counts[q] = ss_counts.get(q, 0) + 1
        gt_count = len(load_ground_truth())
        print(f"Pipeline Stats:")
        print(f"  Results:    {results_count} games classified")
        print(f"  Reviewed:   {len(reviewed)} games user-reviewed")
        print(f"  GT:         {gt_count} games in ground truth")
        print(f"  Corrections: {len(load_corrections())} game overrides")
        if ss_counts:
            print(f"  Screenshot quality:")
            for q, c in sorted(ss_counts.items(), key=lambda x: -x[1]):
                print(f"    {q}: {c}")
        return

    if args.select_batch:
        if not check_batch_gate(args.select_batch):
            sys.exit(1)
        selected = select_new_batch(args.select_batch, require_screenshot=not args.no_screenshot)
        print(f"Selected {len(selected)} new games:")
        for s in selected:
            print(f"  {s}")
        return

    if args.repair_screenshots:
        repair_screenshots()
        return

    if args.regression:
        run_regression()
        return

    if args.regression_full:
        run_expanded_regression()
        return

    if args.cost_experiment:
        run_cost_experiment()
        return

    if not args.files:
        print("Usage:")
        print("  python3 classify_art_v2.py file1.html file2.html  # classify specific games")
        print("  python3 classify_art_v2.py --select-batch 50       # pick 50 unreviewed games")
        print("  python3 classify_art_v2.py --regression            # run GT regression test")
        print("  python3 classify_art_v2.py --stats                 # show pipeline stats")
        sys.exit(1)

    if args.files and not check_batch_gate(len(args.files)):
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
            use_masked=not args.no_masked,
            use_cache=not args.no_cache,
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
