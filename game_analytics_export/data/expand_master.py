#!/usr/bin/env python3
"""Expand games_master.json from top 520 to top 1500 CSV slots.

Preserves existing games and their IDs. Adds new CSV games between
the existing CSV games and the AGS manual games, then re-assigns IDs.

Creates a backup before writing. Updates games_dashboard.json IDs
for any shifted AGS games.
"""

import csv
import json
import re
import shutil
import sys
import calendar
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
MASTER_PATH = SCRIPT_DIR / "games_master.json"
DASHBOARD_PATH = SCRIPT_DIR / "games_dashboard.json"
META_PATH = SCRIPT_DIR / "games_dashboard_meta.json"
CSV_PATH = Path("/Users/avner/Downloads/Data Download Theme (4).csv")
TARGET_GAMES = 1500

DRY_RUN = "--dry-run" in sys.argv


def norm(n):
    return re.sub(r"[^a-z0-9]", "", (n or "").lower())


def parse_release(release_str):
    if not release_str:
        return None, None
    parts = release_str.split(",")
    if len(parts) != 2:
        return None, None
    m_str = parts[0].strip()
    y_str = parts[1].strip()
    month_names = {m: i for i, m in enumerate(calendar.month_name) if m}
    month_abbr = {m: i for i, m in enumerate(calendar.month_abbr) if m}
    month = month_names.get(m_str) or month_abbr.get(m_str)
    try:
        year = int(y_str)
    except ValueError:
        year = None
    return year, month


def main():
    print("=== Expand games_master.json to top 1500 CSV slots ===\n")

    # Load current master
    with open(MASTER_PATH) as f:
        master = json.load(f)

    existing_games = master["games"]
    print(f"Current master: {len(existing_games)} games")

    # Split existing into CSV (with theo) and AGS (without)
    csv_existing = [g for g in existing_games if g["performance"].get("theo_win") is not None]
    ags_games = [g for g in existing_games if g["performance"].get("theo_win") is None]
    print(f"  CSV games (with theo): {len(csv_existing)}")
    print(f"  AGS games (no theo): {len(ags_games)}")

    # Build lookup of existing game names
    existing_norm_names = set()
    for g in existing_games:
        existing_norm_names.add(norm(g["name"]))

    # Parse CSV
    with open(CSV_PATH, newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = list(reader)

    csv_slots = []
    for row in rows:
        if len(row) > 14 and row[5].strip() == "Slot":
            try:
                tw = float(row[12].strip())
            except (ValueError, IndexError):
                continue
            if tw <= 0:
                continue
            ms_str = row[14].strip().rstrip("%")
            try:
                ms = float(ms_str) if ms_str else None
            except ValueError:
                ms = None
            year, month = parse_release(row[6].strip())
            csv_slots.append({
                "name": row[3].strip(),
                "provider": row[4].strip(),
                "theo": tw,
                "market_share": ms,
                "release_year": year,
                "release_month": month,
            })

    csv_slots.sort(key=lambda x: -x["theo"])
    print(f"\nCSV total slots: {len(csv_slots)}")
    print(f"Taking top {TARGET_GAMES}")

    # Find new games from CSV positions 521-1500 not already in master
    # Deduplicate by normalized name (keep highest theo)
    target_slots = csv_slots[:TARGET_GAMES]
    seen_names = set(existing_norm_names)
    new_slots = []
    for s in target_slots:
        n = norm(s["name"])
        if n not in seen_names:
            new_slots.append(s)
            seen_names.add(n)

    print(f"New slots to add: {len(new_slots)}")
    if not new_slots:
        print("No new games to add. Exiting.")
        return

    # Build new game entries
    new_games = []
    for s in new_slots:
        name_norm = s["name"].lower().replace(r"[^a-z0-9]+", "_")
        name_norm = re.sub(r"[^a-z0-9]+", "_", s["name"].lower())
        game = {
            "id": "",  # assigned later
            "name": s["name"],
            "name_normalized": name_norm,
            "theme": {"primary": None, "secondary": None, "consolidated": None},
            "mechanic": {"primary": "Slot", "features": [], "category": None},
            "specs": {"reels": None, "rows": None, "paylines": None, "volatility": None, "rtp": None},
            "provider": {
                "display_name": s["provider"],
                "studio": s["provider"],
                "parent": s["provider"],
                "verified": False,
                "aliases": [],
            },
            "release": {"year": s["release_year"], "month": s["release_month"], "exact_date": None},
            "performance": {
                "theo_win": s["theo"],
                "market_share_percent": s["market_share"],
                "percentile": None,
                "anomaly": None,
            },
            "symbols": {"not_applicable": False, "status": "pending", "deferred": True},
            "sources_ref": None,
            "process_ref": None,
            "symbols_ref": None,
            "details_ref": None,
        }
        new_games.append(game)

    print(f"\nNew games created: {len(new_games)}")
    print(f"  First: {new_games[0]['name']} (theo={new_games[0]['performance']['theo_win']})")
    print(f"  Last:  {new_games[-1]['name']} (theo={new_games[-1]['performance']['theo_win']})")

    # Combine: existing CSV + new CSV + AGS (sorted by theo, AGS at bottom)
    all_csv = csv_existing + new_games
    all_csv.sort(key=lambda g: -(g["performance"].get("theo_win") or 0))
    all_games = all_csv + ags_games  # AGS at the end (no theo)

    # Build old_id -> name mapping for AGS games (to remap dashboard)
    ags_old_ids = {norm(g["name"]): g["id"] for g in ags_games}

    # Re-assign IDs
    for i, g in enumerate(all_games):
        g["id"] = f"game-{str(i + 1).zfill(3)}-{re.sub(r'[^a-z0-9]+', '_', g['name'].lower())}"
        g["performance"]["percentile"] = f"{(len(all_games) - i) / len(all_games) * 100:.2f}"

    # Build AGS ID remap (old_id -> new_id)
    ags_new_ids = {norm(g["name"]): g["id"] for g in ags_games}
    id_remap = {}
    for name_key in ags_old_ids:
        old_id = ags_old_ids[name_key]
        new_id = ags_new_ids.get(name_key)
        if new_id and old_id != new_id:
            id_remap[old_id] = new_id

    print(f"\nTotal games: {len(all_games)}")
    print(f"  CSV with theo: {len(all_csv)}")
    print(f"  AGS without theo: {len(ags_games)}")
    print(f"  AGS IDs remapped: {len(id_remap)}")
    if id_remap:
        sample = list(id_remap.items())[:3]
        for old, new in sample:
            print(f"    {old} -> {new}")
        print(f"    ... ({len(id_remap)} total)")

    # Verify no duplicate IDs
    ids = [g["id"] for g in all_games]
    if len(ids) != len(set(ids)):
        dupes = [x for x in ids if ids.count(x) > 1]
        print(f"\nERROR: Duplicate IDs found: {set(dupes)}")
        sys.exit(1)
    print(f"\nID uniqueness: OK ({len(ids)} unique IDs)")

    # Verify no duplicate names
    names = [norm(g["name"]) for g in all_games]
    if len(names) != len(set(names)):
        from collections import Counter
        dupes = [n for n, c in Counter(names).items() if c > 1]
        print(f"WARNING: Duplicate names: {dupes[:5]}")

    if DRY_RUN:
        print("\n[DRY RUN] No files written.")
        return

    # Backup
    now = datetime.now(timezone.utc).isoformat().replace(":", "-")[:19]
    backup_master = MASTER_PATH.with_name(f"games_master.backup-{now}.json")
    shutil.copy2(MASTER_PATH, backup_master)
    print(f"\nBackup: {backup_master.name}")

    if DASHBOARD_PATH.exists():
        backup_dash = DASHBOARD_PATH.with_name(f"games_dashboard.backup-{now}.json")
        shutil.copy2(DASHBOARD_PATH, backup_dash)
        print(f"Backup: {backup_dash.name}")

    # Update master
    master["games"] = all_games
    master["metadata"]["total_games"] = len(all_games)
    master["metadata"]["last_updated"] = datetime.now(timezone.utc).isoformat()
    master["metadata"]["validation_status"] = f"expanded_to_{len(all_games)}_games"
    master["metadata"]["notes"] = (
        f"Expanded from 520 to top {TARGET_GAMES} CSV slots + {len(ags_games)} AGS manual games. "
        f"{len(new_games)} new games added."
    )
    MASTER_PATH.write_text(json.dumps(master, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {MASTER_PATH.name}: {len(all_games)} games")

    # Update dashboard IDs for remapped AGS games
    if id_remap and DASHBOARD_PATH.exists():
        with open(DASHBOARD_PATH) as f:
            dash = json.load(f)
        remapped_count = 0
        for rec in dash:
            if rec["id"] in id_remap:
                rec["id"] = id_remap[rec["id"]]
                remapped_count += 1
        DASHBOARD_PATH.write_text(json.dumps(dash, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Updated {DASHBOARD_PATH.name}: {remapped_count} IDs remapped")

    # Update meta IDs
    if id_remap and META_PATH.exists():
        with open(META_PATH) as f:
            meta = json.load(f)
        new_meta = {}
        for k, v in meta.items():
            new_meta[id_remap.get(k, k)] = v
        META_PATH.write_text(json.dumps(new_meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Updated {META_PATH.name}: IDs remapped")

    print(f"\nDone! Master expanded to {len(all_games)} games.")


if __name__ == "__main__":
    main()
