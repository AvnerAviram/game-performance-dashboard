"""
SC Cache Expansion: Fetch SlotCatalog pages for untried games.
Saves HTML to _legacy/sc_cache/, extracts specs to _sc_expand_results.json.
Resumable: skips games already processed. Never touches master.
"""
import json
import time
import sys
from pathlib import Path
from sc_extract import fetch_sc_page, extract_sc_specs, slug_variants

DATA_DIR = Path(__file__).parent
UNTRIED_PATH = DATA_DIR / "_sc_untried_games.json"
RESULTS_PATH = DATA_DIR / "_sc_expand_results.json"
NOT_FOUND_PATH = DATA_DIR / "_sc_not_found.json"
MASTER_PATH = DATA_DIR / "game_data_master.json"

DELAY = 1.5  # seconds between requests

def load_master_lookup():
    master = json.loads(MASTER_PATH.read_text())
    return {g["name"]: g for g in master}

def main():
    untried = json.loads(UNTRIED_PATH.read_text())
    print(f"Total untried games: {len(untried)}")

    results = json.loads(RESULTS_PATH.read_text()) if RESULTS_PATH.exists() else {}
    not_found = json.loads(NOT_FOUND_PATH.read_text()) if NOT_FOUND_PATH.exists() else []
    nf_set = set(x.lower() if isinstance(x, str) else x for x in not_found)

    master_lookup = load_master_lookup()

    already_done = set(results.keys()) | {n for n in untried if n.lower() in nf_set}
    remaining = [n for n in untried if n not in already_done]
    print(f"Already processed: {len(already_done)}, remaining: {len(remaining)}")

    found = 0
    missed = 0
    errors = 0
    save_interval = 25

    for i, name in enumerate(remaining):
        provider = master_lookup.get(name, {}).get("provider")
        try:
            html, slug, source = fetch_sc_page(name, provider=provider, cache=True)
        except Exception as e:
            print(f"  [{i+1}/{len(remaining)}] ERROR {name}: {e}")
            errors += 1
            time.sleep(DELAY)
            continue

        if html and slug:
            specs = extract_sc_specs(html)
            results[name] = {"slug": slug, "specs": specs, "source": "slotcatalog"}
            found += 1
            specs_str = ", ".join(f"{k}={v}" for k, v in specs.items()) if specs else "no specs"
            print(f"  [{i+1}/{len(remaining)}] FOUND {name} -> {slug} ({specs_str})")
        else:
            not_found.append(name.lower())
            nf_set.add(name.lower())
            missed += 1
            if (i + 1) % 50 == 0:
                print(f"  [{i+1}/{len(remaining)}] not found: {name}")

        if (i + 1) % save_interval == 0:
            RESULTS_PATH.write_text(json.dumps(results, indent=2))
            NOT_FOUND_PATH.write_text(json.dumps(sorted(set(not_found)), indent=2))
            print(f"  --- Progress: {i+1}/{len(remaining)} | found={found} missed={missed} errors={errors} ---")
            sys.stdout.flush()

        time.sleep(DELAY)

    # Final save
    RESULTS_PATH.write_text(json.dumps(results, indent=2))
    NOT_FOUND_PATH.write_text(json.dumps(sorted(set(not_found)), indent=2))

    print(f"\n=== COMPLETE ===")
    print(f"Found: {found}")
    print(f"Not found: {missed}")
    print(f"Errors: {errors}")
    print(f"Total results saved: {len(results)}")

if __name__ == "__main__":
    main()
