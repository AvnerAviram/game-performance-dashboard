"""
Provider Official Site Scraper — Extract specs from game maker websites.
Validates and corrects SC data against authoritative provider data.
Never touches master. Results saved to _provider_specs.json.
"""
import json
import re
import time
import sys
import urllib.request
from pathlib import Path

DATA_DIR = Path(__file__).parent
RESULTS_PATH = DATA_DIR / "_provider_specs.json"

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'en-US,en;q=0.9',
}

VOL_ORDER = ['Low', 'Low-Medium', 'Medium', 'Medium-High', 'High', 'Very High', 'Extreme']

def norm_vol(v):
    if not v:
        return None
    vl = v.lower().strip()
    if 'extreme' in vl:
        return 'Very High'
    if 'very high' in vl:
        return 'Very High'
    if 'low' in vl and ('mid' in vl or 'med' in vl):
        return 'Low-Medium'
    if ('med' in vl or 'mid' in vl) and 'high' in vl:
        return 'Medium-High'
    if 'med' in vl or 'mid' in vl:
        return 'Medium'
    if 'high' in vl:
        return 'High'
    if 'low' in vl:
        return 'Low'
    return None


def scrape_evolution(name, slug):
    """Scrape games.evolution.com for specs."""
    url = f"https://games.evolution.com/slots/{slug}/"
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=12) as resp:
            html = resp.read().decode('utf-8', errors='replace')

        specs = {}
        vol_match = re.search(r'Volatility</th>\s*<td>([^<]+)</td>', html)
        rtp_match = re.search(r'Return to Player</th>\s*<td>([\d.]+)%</td>', html)
        year_match = re.search(r'Release Year</th>\s*<td>(\d{4})</td>', html)

        if vol_match:
            raw = vol_match.group(1).strip()
            specs['volatility_raw'] = raw
            specs['volatility'] = norm_vol(raw)
        if rtp_match:
            specs['rtp'] = float(rtp_match.group(1))
        if year_match:
            specs['release_year'] = int(year_match.group(1))

        return specs if specs else None
    except urllib.error.HTTPError:
        return None
    except Exception:
        return None


def scrape_pragmatic(name, slug):
    """Scrape pragmaticplay.com — RTP only."""
    url = f"https://www.pragmaticplay.com/en/slots/{slug}/"
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=12) as resp:
            html = resp.read().decode('utf-8', errors='replace')

        specs = {}
        rtp_match = re.search(r'RTP:\s*([\d.]+)%', html)
        if rtp_match:
            specs['rtp'] = float(rtp_match.group(1))
        return specs if specs else None
    except:
        return None


PROVIDER_SCRAPERS = {
    'Evolution': scrape_evolution,
}


def main():
    sc = json.loads((DATA_DIR / "_sc_all_specs.json").read_text())
    master = json.loads((DATA_DIR / "game_data_master.json").read_text())
    html_games = {g["name"]: g for g in master if g.get("html_rules_available")}

    results = json.loads(RESULTS_PATH.read_text()) if RESULTS_PATH.exists() else {}
    
    provider = sys.argv[1] if len(sys.argv) > 1 else "Evolution"
    scraper = PROVIDER_SCRAPERS.get(provider)
    if not scraper:
        print(f"No scraper for {provider}")
        return

    games = [(n, e) for n, e in sc.items()
             if html_games.get(n, {}).get("provider") == provider]
    print(f"{provider}: {len(games)} games to scrape")

    already = {n for n, r in results.items() if r.get("provider") == provider}
    remaining = [(n, e) for n, e in games if n not in already]
    print(f"Already done: {len(already)}, remaining: {len(remaining)}")

    found = 0
    missed = 0
    for i, (name, entry) in enumerate(remaining):
        slug = name.lower().replace("'", "").replace("\u2019", "").replace(":", "")
        slug = re.sub(r'[^a-z0-9\s-]', '', slug).strip()
        slug = re.sub(r'\s+', '-', slug)

        specs = scraper(name, slug)
        if specs:
            results[name] = {
                "provider": provider,
                "provider_specs": specs,
                "sc_specs": entry.get("specs", {}),
                "slug": slug,
            }
            found += 1
            sc_vol = entry.get("specs", {}).get("volatility", "?")
            prov_vol = specs.get("volatility", "?")
            match = "=" if sc_vol == prov_vol else "!"
            print(f"  [{i+1}/{len(remaining)}] {match} {name}: prov={specs}")
        else:
            missed += 1
            if (i + 1) % 25 == 0:
                print(f"  [{i+1}/{len(remaining)}] 404: {name}")

        if (i + 1) % 25 == 0:
            RESULTS_PATH.write_text(json.dumps(results, indent=2))
            print(f"  --- Progress: {i+1}/{len(remaining)} found={found} missed={missed} ---")
            sys.stdout.flush()

        time.sleep(0.8)

    RESULTS_PATH.write_text(json.dumps(results, indent=2))
    print(f"\n=== COMPLETE: {provider} ===")
    print(f"Found: {found}, Missed: {missed}")
    print(f"Total results: {len(results)}")


if __name__ == "__main__":
    main()
