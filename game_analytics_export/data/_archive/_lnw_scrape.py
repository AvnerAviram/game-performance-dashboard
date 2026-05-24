"""Scrape Light & Wonder game pages for specs. Never touches master."""
import json, re, time, sys, urllib.request
from pathlib import Path

DATA_DIR = Path(__file__).parent
RESULTS_PATH = DATA_DIR / "_lnw_specs.json"
HEADERS = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}

def norm(name):
    n = name.lower().strip()
    n = re.sub(r'[\u2019\u2018\'\u00ae\u2122\u2013\u2014:]', '', n)
    n = re.sub(r'[^a-z0-9]', '', n)
    return n

def parse_rtp(raw):
    """Parse RTP like '96%' or '87% | 90% | 92% | 94% | 96%' -> take max."""
    if not raw:
        return None
    parts = re.findall(r'([\d.]+)\s*%', raw)
    if parts:
        return max(float(p) for p in parts)
    return None

def parse_lines(raw):
    """Parse '243' or '243 Ways' or '50 Lines'."""
    if not raw:
        return None, None
    num = re.search(r'([\d,]+)', raw.replace(',', ''))
    win_eval = None
    if 'way' in raw.lower():
        win_eval = 'ways'
    elif 'line' in raw.lower():
        win_eval = 'lines'
    return (int(num.group(1)) if num else None), win_eval

def parse_top_prize(raw):
    """Parse '250,000' or '5,500x'."""
    if not raw:
        return None
    s = raw.replace(',', '').strip()
    m = re.search(r'([\d.]+)', s)
    if m:
        return float(m.group(1))
    return None

def scrape_lnw_page(slug):
    url = f"https://igaming.lnw.com/games/{slug}/"
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=12) as resp:
            html = resp.read().decode('utf-8', errors='replace')

        specs = {}

        rtp_m = re.search(r'RTP[:\s]+([\d.%|\s]+?)(?:\s*<|\n)', html, re.IGNORECASE)
        if rtp_m:
            rtp = parse_rtp(rtp_m.group(1))
            if rtp and rtp > 80:
                specs['rtp'] = rtp
                specs['rtp_raw'] = rtp_m.group(1).strip()

        reels_m = re.search(r'Reels?[:\s]+([\dx\s]+?)(?:\s*<|\n)', html, re.IGNORECASE)
        if reels_m:
            raw = reels_m.group(1).strip()
            specs['reels_raw'] = raw
            if 'x' in raw.lower():
                parts = raw.lower().split('x')
                try:
                    specs['rows'] = int(parts[0].strip())
                    specs['reels'] = int(parts[1].strip())
                except:
                    pass
            else:
                num = re.search(r'(\d+)', raw)
                if num:
                    specs['reels'] = int(num.group(1))

        lines_m = re.search(r'(?:Lines?|Ways)[:/\s]+([\d,]+(?:\s*(?:Lines?|Ways))?)', html, re.IGNORECASE)
        if lines_m:
            paylines, win_eval = parse_lines(lines_m.group(1))
            if paylines:
                specs['paylines'] = paylines
            if win_eval:
                specs['win_evaluation'] = win_eval

        tp_m = re.search(r'Top\s*Prize[:\s]+([\d,x.]+)', html, re.IGNORECASE)
        if tp_m:
            specs['top_prize_raw'] = tp_m.group(1).strip()
            specs['top_prize'] = parse_top_prize(tp_m.group(1))

        minbet_m = re.search(r'Min\s*Bet[:\s]+([\d.]+)', html, re.IGNORECASE)
        if minbet_m:
            specs['min_bet'] = float(minbet_m.group(1))

        maxbet_m = re.search(r'Max\s*Bet[:\s]+([^\n<]+?)(?:\s*<|\n)', html, re.IGNORECASE)
        if maxbet_m:
            raw = maxbet_m.group(1).strip()
            specs['max_bet_raw'] = raw
            num = re.search(r'([\d.]+)', raw)
            if num:
                specs['max_bet'] = float(num.group(1))

        vol_m = re.search(r'Volatility[:\s]*([A-Za-z\s/-]+?)(?:\s*<|\n)', html, re.IGNORECASE)
        if vol_m:
            specs['volatility'] = vol_m.group(1).strip()

        return specs if specs else None
    except urllib.error.HTTPError:
        return None
    except Exception:
        return None


def main():
    master = json.loads((DATA_DIR / "game_data_master.json").read_text())
    lnw_games = [g for g in master if g.get("html_rules_available") and g.get("provider") == "Light & Wonder"]
    slug_lookup = json.loads((DATA_DIR / "_lnw_slug_lookup.json").read_text())

    norm_to_slug = {norm(title): slug for title, slug in slug_lookup.items()}

    results = json.loads(RESULTS_PATH.read_text()) if RESULTS_PATH.exists() else {}
    already = set(results.keys())
    remaining = [g for g in lnw_games if g["name"] not in already]

    print(f"L&W games: {len(lnw_games)}, already: {len(already)}, remaining: {len(remaining)}")

    found = missed = 0
    for i, game in enumerate(remaining):
        name = game["name"]
        n = norm(name)

        slug = norm_to_slug.get(n)
        if not slug:
            for api_name, api_slug in slug_lookup.items():
                if norm(api_name) == n:
                    slug = api_slug
                    break

        if not slug:
            slug = name.lower().replace("'", "").replace(":", "")
            slug = re.sub(r'[^a-z0-9\s-]', '', slug).strip()
            slug = re.sub(r'\s+', '-', slug)

        specs = scrape_lnw_page(slug)
        if specs:
            results[name] = {"slug": slug, "specs": specs}
            found += 1
            rtp = specs.get('rtp', '?')
            print(f"  [{i+1}/{len(remaining)}] ✓ {name[:40]}: RTP={rtp}")
        else:
            missed += 1
            if (i + 1) % 25 == 0:
                print(f"  [{i+1}/{len(remaining)}] ✗ {name[:40]}")

        if (i + 1) % 25 == 0:
            RESULTS_PATH.write_text(json.dumps(results, indent=2))
            print(f"  --- Progress: {i+1}/{len(remaining)} found={found} missed={missed} ---")
            sys.stdout.flush()

        time.sleep(0.8)

    RESULTS_PATH.write_text(json.dumps(results, indent=2))
    print(f"\n=== COMPLETE: L&W ===")
    print(f"Found: {found}, Missed: {missed}")
    print(f"Total results: {len(results)}")


if __name__ == "__main__":
    main()
