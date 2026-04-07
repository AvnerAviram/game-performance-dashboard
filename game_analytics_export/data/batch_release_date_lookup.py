"""
Batch release date lookup via Claude for games missing original_release_year.
Groups games by provider and asks Claude to identify release years.
"""
import json
import os
import re
import sys
import time
from pathlib import Path

try:
    import anthropic
except ImportError:
    print("pip install anthropic")
    sys.exit(1)

DATA_DIR = Path(__file__).parent
MASTER_PATH = DATA_DIR / "game_data_master.json"
BATCH_SIZE = 15
SAVE_INTERVAL = 5  # save after every N batches


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


client = anthropic.Anthropic(api_key=_get_api_key())

def call_claude_batch(provider, game_names, model="claude-sonnet-4-20250514"):
    system = "You are a slot game database expert. Return ONLY valid JSON."
    
    games_list = "\n".join(f"  - {name}" for name in game_names)
    prompt = f"""For this provider: {provider}
    
These slot games need their ORIGINAL global release year (not NJ/US launch year):
{games_list}

For each game, provide the year it was FIRST released globally (not when it launched in a specific US state).

Return ONLY valid JSON in this format:
{{
  "games": [
    {{"name": "<exact name from list>", "year": <YYYY or null>, "confidence": "<high|medium|low>"}},
    ...
  ]
}}

Rules:
- Use the ORIGINAL worldwide release year, not US/NJ launch
- If you're not sure, use your best estimate with confidence "low"
- If you truly cannot determine even an approximate year, set year to null
- For sequels, the sequel's own release year (not the original game)"""

    try:
        response = client.messages.create(
            model=model,
            max_tokens=2000,
            system=system,
            messages=[{"role": "user", "content": prompt}]
        )
        text = response.content[0].text.strip()
        
        # Extract JSON
        json_match = re.search(r'\{[\s\S]*\}', text)
        if json_match:
            return json.loads(json_match.group()), response.usage
        return None, response.usage
    except Exception as e:
        print(f"  ERROR: {e}")
        return None, None


def main():
    master = json.loads(MASTER_PATH.read_text())
    master_by_name = {g['name']: g for g in master}
    
    missing = [g for g in master if g.get('game_category') == 'Slot' and not g.get('original_release_year')]
    
    # Group by provider
    by_prov = {}
    for g in missing:
        p = g.get('provider', 'Unknown')
        by_prov.setdefault(p, []).append(g['name'])
    
    total_games = len(missing)
    total_batches = sum((len(names) + BATCH_SIZE - 1) // BATCH_SIZE for names in by_prov.values())
    print(f"Games to lookup: {total_games} across {len(by_prov)} providers ({total_batches} batches)")
    
    filled = 0
    skipped = 0
    batch_num = 0
    total_in = 0
    total_out = 0
    start = time.time()
    
    for provider, names in sorted(by_prov.items(), key=lambda x: -len(x[1])):
        for i in range(0, len(names), BATCH_SIZE):
            batch = names[i:i + BATCH_SIZE]
            batch_num += 1
            
            print(f"[{batch_num}/{total_batches}] {provider} ({len(batch)} games)...", end="", flush=True)
            
            result, usage = call_claude_batch(provider, batch)
            if usage:
                total_in += usage.input_tokens
                total_out += usage.output_tokens
            
            if not result or 'games' not in result:
                print(f" FAILED")
                skipped += len(batch)
                continue
            
            batch_filled = 0
            for entry in result['games']:
                name = entry.get('name', '')
                year = entry.get('year')
                conf = entry.get('confidence', 'low')
                
                if not year or not isinstance(year, int) or year < 1990 or year > 2027:
                    continue
                
                game = master_by_name.get(name)
                if not game:
                    for n in batch:
                        if n.lower() == name.lower():
                            game = master_by_name.get(n)
                            break
                
                if game and not game.get('original_release_year'):
                    game['original_release_year'] = year
                    game['original_release_date_source'] = f'claude_lookup_{conf}'
                    batch_filled += 1
                    filled += 1
            
            print(f" +{batch_filled}")
            
            if batch_num % SAVE_INTERVAL == 0:
                MASTER_PATH.write_text(json.dumps(master, indent=2))
                elapsed = time.time() - start
                print(f"  [checkpoint: {filled} filled, {elapsed:.0f}s elapsed]")
    
    # Final save
    MASTER_PATH.write_text(json.dumps(master, indent=2))
    
    cost = (total_in * 3 + total_out * 15) / 1_000_000
    elapsed = time.time() - start
    
    remaining = sum(1 for g in master if g.get('game_category') == 'Slot' and not g.get('original_release_year'))
    total_with = sum(1 for g in master if g.get('original_release_year'))
    
    print(f"\n{'='*50}")
    print(f"Done in {elapsed:.0f}s")
    print(f"Filled: {filled}/{total_games}")
    print(f"Total with original_release_year: {total_with}")
    print(f"Slots still missing: {remaining}")
    print(f"Tokens: {total_in:,} in, {total_out:,} out")
    print(f"Est. cost: ${cost:.2f}")


if __name__ == "__main__":
    main()
