"""
Clean Room Import: Build game_data_master.json from XLSX ONLY.

Source: Data Download Theme (4).xlsx
No other data sources. No old files. No enrichment.

Field mapping (XLSX column -> JSON field):
  Col 3  "Game Name"                      -> name
  Col 4  "Parent Supplier"                -> provider
  Col 5  "Game Category"                  -> game_category
  Col 6  "Month, Year of OGPD Release"    -> release_year, release_month
  Col 7  "Casinos (Sites)"                -> sites
  Col 8  "Avg. Average Bet"               -> avg_bet
  Col 9  "Median Avg Bet"                 -> median_bet
  Col 10 "Avg. Games Played Index"        -> games_played_index
  Col 11 "Avg. Coin In Index"             -> coin_in_index
  Col 12 "Theo Win Index"                 -> theo_win
  Col 14 "% of Total GGR"                -> market_share_pct

Everything else is set to null/empty.
"""

import json
import re
import sys
from pathlib import Path

DATA_DIR = Path(__file__).parent
XLSX_PATH = DATA_DIR / "Data Download Theme (4).xlsx"
OUTPUT_PATH = DATA_DIR / "game_data_master.json"

PROVIDER_NORMALIZE = {
    "Igt": "IGT",
    "Play N Go": "Play'n GO",
    "Ags": "AGS",
}


def parse_release_date(date_str):
    if not date_str:
        return None, None
    m = re.match(r"(\w+),?\s*(\d{4})", str(date_str))
    if not m:
        return None, None
    months = {
        "january": 1, "february": 2, "march": 3, "april": 4,
        "may": 5, "june": 6, "july": 7, "august": 8,
        "september": 9, "october": 10, "november": 11, "december": 12,
    }
    return int(m.group(2)), months.get(m.group(1).lower())


def round_val(val, decimals=2):
    if val is None:
        return None
    try:
        return round(float(val), decimals)
    except (ValueError, TypeError):
        return None


def normalize_provider(raw):
    if not raw:
        return "Unknown"
    name = raw.strip()
    return PROVIDER_NORMALIZE.get(name, name)


def main():
    try:
        import openpyxl
    except ImportError:
        print("ERROR: pip install openpyxl")
        sys.exit(1)

    print(f"Reading XLSX: {XLSX_PATH}")
    wb = openpyxl.load_workbook(str(XLSX_PATH), read_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    wb.close()

    headers = rows[0]
    print(f"Headers: {headers}")
    print(f"Data rows: {len(rows) - 1}")

    seen_names = set()
    games = []
    duplicates = 0

    for i, row in enumerate(rows[1:], start=1):
        name = str(row[3]).strip() if row[3] else ""
        if not name:
            continue

        if name in seen_names:
            duplicates += 1
            continue
        seen_names.add(name)

        provider_raw = str(row[4]).strip() if row[4] else ""
        provider = normalize_provider(provider_raw)
        category = str(row[5]).strip() if row[5] else ""
        release_year, release_month = parse_release_date(row[6])

        name_norm = re.sub(r"[^a-z0-9]", "_", name.lower()).strip("_")

        game = {
            "id": f"game-{len(games)+1:04d}-{name_norm[:40]}",
            "name": name,
            "provider": provider,
            "game_category": category,
            "release_year": release_year,
            "release_month": release_month,
            "sites": int(row[7]) if row[7] else None,
            "avg_bet": round_val(row[8]),
            "median_bet": round_val(row[9]),
            "games_played_index": round_val(row[10]),
            "coin_in_index": round_val(row[11]),
            "theo_win": round_val(row[12]),
            "market_share_pct": round_val(row[14], 6),
            # Everything below is null -- to be filled by HTML rules extraction later
            "description": None,
            "theme_primary": None,
            "themes_all": [],
            "features": [],
            "symbols": [],
            "reels": None,
            "rows": None,
            "paylines": None,
            "grid_config": None,
            "win_evaluation": None,
            "rtp": None,
            "volatility": None,
            "max_win": None,
            "min_bet": None,
            "max_bet": None,
            "default_bet": None,
            "last_modified_date": None,
            "jackpot_structure": None,
        }
        games.append(game)

    print(f"\nUnique games: {len(games)}")
    print(f"Duplicates skipped: {duplicates}")

    OUTPUT_PATH.write_text(json.dumps(games, indent=2))
    print(f"Written to: {OUTPUT_PATH}")
    print(f"File size: {OUTPUT_PATH.stat().st_size:,} bytes")

    # Verification
    from collections import Counter
    providers = Counter(g["provider"] for g in games)
    categories = Counter(g["game_category"] for g in games)

    print(f"\n--- PROVIDER DISTRIBUTION (top 20) ---")
    for p, c in providers.most_common(20):
        print(f"  {p}: {c}")

    print(f"\n--- CATEGORY DISTRIBUTION ---")
    for cat, c in categories.most_common():
        print(f"  {cat}: {c}")

    print(f"\n--- FIRST 5 GAMES ---")
    for g in games[:5]:
        print(f"  {g['name']}: provider={g['provider']}, category={g['game_category']}, "
              f"theo_win={g['theo_win']}, sites={g['sites']}")

    # Verify the 3 previously-wrong games
    print(f"\n--- VERIFICATION: Previously mislabeled games ---")
    check = ["Gold Inferno", "8x Crystal Bells", "Blazin Bank Run", "Capital Gains"]
    for g in games:
        if g["name"] in check:
            print(f"  {g['name']}: provider={g['provider']}")


if __name__ == "__main__":
    main()
