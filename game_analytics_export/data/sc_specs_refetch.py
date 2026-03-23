#!/usr/bin/env python3
"""Re-fetch specs from SlotCatalog for all found games using fixed parser."""
import json, re, time, sys
import urllib.request

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/120.0.0.0 Safari/537.36"
}

def fetch_html(url, timeout=15):
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except Exception:
        return None

def extract_specs(html):
    specs = {}
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text)

    m = re.search(r"RTP[^:]{0,30}:\s*(\d{2,3}\.?\d*)\s*%", text)
    if m:
        specs["rtp"] = m.group(1) + "%"

    m = re.search(r"Max\s*Win[^:]{0,30}:\s*x?([\d,]+\.?\d*)", text)
    if m:
        specs["max_win"] = m.group(1).replace(",", "")

    m = re.search(r"Min\s*bet[^:]{0,30}:\s*([\d.]+)", text)
    if m:
        specs["min_bet"] = float(m.group(1))

    m = re.search(r"Max\s*bet[^:]{0,30}:\s*([\d.]+)", text)
    if m:
        specs["max_bet"] = float(m.group(1))

    m = re.search(r"Variance[^:]{0,30}:\s*(Low|Med|High|Low-Med|Med-High|Very High)",
                  text, re.IGNORECASE)
    if m:
        specs["variance"] = m.group(1)

    m = re.search(r"Layout[^:]{0,30}:\s*(\d+)-(\d+)", text)
    if m:
        specs["reels"] = int(m.group(1))
        specs["rows"] = int(m.group(2))

    m = re.search(r"Betways[^:]{0,30}:\s*([\d,]+)", text)
    if m:
        specs["betways"] = int(m.group(1).replace(",", ""))

    return specs

def main():
    with open("sc_audit_report.json") as f:
        report = json.load(f)

    urls = {}
    for name, entry in report["games"].items():
        if entry.get("status") == "found" and entry.get("sc_url"):
            urls[name] = entry["sc_url"]

    results = {}
    checkpoint_file = "sc_specs_results.json"

    try:
        with open(checkpoint_file) as f:
            results = json.load(f)
        print(f"Resuming from {len(results)} already fetched")
    except FileNotFoundError:
        pass

    total = len(urls)
    done = 0
    for name, url in urls.items():
        if name in results:
            done += 1
            continue

        time.sleep(1.0)
        html = fetch_html(url)
        if html:
            specs = extract_specs(html)
            results[name] = specs
        else:
            results[name] = {"error": "fetch_failed"}

        done += 1
        if done % 25 == 0:
            with open(checkpoint_file, "w") as f:
                json.dump(results, f, indent=2)
            filled = sum(1 for r in results.values() if r.get("rtp"))
            print(f"  [{done}/{total}] checkpoint saved, {filled} with RTP so far")

        if done % 100 == 0 or done == total:
            sys.stdout.flush()

    with open(checkpoint_file, "w") as f:
        json.dump(results, f, indent=2)

    rtp_count = sum(1 for r in results.values() if r.get("rtp"))
    maxwin_count = sum(1 for r in results.values() if r.get("max_win"))
    minbet_count = sum(1 for r in results.values() if r.get("min_bet"))
    maxbet_count = sum(1 for r in results.values() if r.get("max_bet"))
    var_count = sum(1 for r in results.values() if r.get("variance"))
    layout_count = sum(1 for r in results.values() if r.get("reels"))

    print(f"\n=== SPEC EXTRACTION COMPLETE ===")
    print(f"  Total games: {len(results)}")
    print(f"  RTP: {rtp_count}")
    print(f"  Max Win: {maxwin_count}")
    print(f"  Min Bet: {minbet_count}")
    print(f"  Max Bet: {maxbet_count}")
    print(f"  Variance: {var_count}")
    print(f"  Layout (reels/rows): {layout_count}")

if __name__ == "__main__":
    main()
