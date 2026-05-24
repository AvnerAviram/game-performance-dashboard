#!/usr/bin/env python3
"""Re-download screenshots using image #2 (skip promotional image #1).

For SC pages with 2+ full-size images, the first image is typically
promotional art/game logo. The second image is typically an actual
gameplay screenshot. This script re-downloads using the second image.
"""

import os, re, json, time, sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SC_DIR = os.path.join(SCRIPT_DIR, '_legacy', 'sc_cache')
SS_DIR = os.path.join(SCRIPT_DIR, 'screenshots')
BASE_URL = 'https://slotcatalog.com'
LOG_PATH = os.path.join(SS_DIR, 'redownload_v2_log.json')

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': BASE_URL + '/',
    'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
}


def extract_full_images(html):
    """Extract full-size image URLs in order of appearance."""
    urls = []
    for m in re.finditer(r'userfiles/image/games/[^"\'>\s]+', html):
        u = m.group()
        if u not in urls and not re.search(r'_s\.\w+$', u):
            urls.append(u)
    return urls


def download_one(base, img_url):
    """Download a single image. Returns (base, success, msg)."""
    ext = os.path.splitext(img_url)[1] or '.jpg'
    dest = os.path.join(SS_DIR, base + ext)
    full_url = BASE_URL + '/' + img_url

    try:
        req = urllib.request.Request(full_url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = resp.read()
            if len(data) < 1000:
                return (base, False, f'too small ({len(data)} bytes)')

            # Remove old screenshot with different extension
            for old_ext in ['.png', '.jpg', '.jpeg', '.webp']:
                old_path = os.path.join(SS_DIR, base + old_ext)
                if old_path != dest and os.path.exists(old_path):
                    os.remove(old_path)

            with open(dest, 'wb') as f:
                f.write(data)
            return (base, True, f'{len(data)//1024}KB')
    except Exception as e:
        return (base, False, str(e)[:80])


def main():
    # Build list of games to re-download
    games_to_download = []
    skipped_single = 0
    skipped_no_images = 0

    sc_files = sorted(f for f in os.listdir(SC_DIR) if f.endswith('.html'))
    print(f'Scanning {len(sc_files)} SC cache files...')

    for sc_file in sc_files:
        base = sc_file.replace('.html', '')
        with open(os.path.join(SC_DIR, sc_file)) as f:
            html = f.read()

        imgs = extract_full_images(html)
        if len(imgs) >= 2:
            games_to_download.append((base, imgs[1]))
        elif len(imgs) == 1:
            skipped_single += 1
        else:
            skipped_no_images += 1

    print(f'To re-download (image #2): {len(games_to_download)}')
    print(f'Skipped (single image):    {skipped_single}')
    print(f'Skipped (no images):       {skipped_no_images}')

    # Check for resume
    done = set()
    if os.path.exists(LOG_PATH):
        with open(LOG_PATH) as f:
            log = json.load(f)
        done = {e['game'] for e in log.get('downloads', []) if e.get('success')}
        print(f'Resuming — {len(done)} already downloaded')

    remaining = [(b, u) for b, u in games_to_download if b not in done]
    print(f'Remaining: {len(remaining)}')

    if not remaining:
        print('Nothing to do.')
        return

    # Download with thread pool (8 concurrent)
    log_entries = []
    if os.path.exists(LOG_PATH):
        with open(LOG_PATH) as f:
            log_entries = json.load(f).get('downloads', [])

    success = 0
    failed = 0
    total = len(remaining)

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(download_one, b, u): b for b, u in remaining}
        for i, future in enumerate(as_completed(futures), 1):
            base, ok, msg = future.result()
            if ok:
                success += 1
                status = 'OK'
            else:
                failed += 1
                status = 'FAIL'
            log_entries.append({'game': base, 'success': ok, 'msg': msg})

            if i % 50 == 0 or i == total:
                print(f'  [{i}/{total}] {status}: {base} — {msg}  (ok={success} fail={failed})')
                with open(LOG_PATH, 'w') as f:
                    json.dump({'downloads': log_entries, 'total': len(log_entries)}, f)

    # Final save
    with open(LOG_PATH, 'w') as f:
        json.dump({'downloads': log_entries, 'total': len(log_entries)}, f, indent=2)

    print(f'\nDone: {success} downloaded, {failed} failed')


if __name__ == '__main__':
    main()
