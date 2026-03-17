# GOLD STANDARD VERIFICATION PROTOCOL
## Zero Mistakes Methodology

**Date Created:** January 26, 2026  
**Goal:** 100% accuracy for all game data  
**Method:** Provider Gold Standard + Triple Verification + Validation Rules

---

## VERIFICATION HIERARCHY

### 🥇 PRIMARY SOURCE: Official Provider Website
- **Authority:** Highest (direct from game creator)
- **Use for:** ALL specs (RTP, reels, rows, paylines), primary mechanic, features
- **Required:** Must find provider site for every game

### ✅ VERIFICATION 1: SlotCatalog
- **Authority:** High (structured database, 35K+ games)
- **Use for:** Cross-check all specs, features, mechanics
- **Action:** Flag discrepancies for review

### ✅ VERIFICATION 2: Casino Operator Site
- **Authority:** Medium (player-facing, marketing focus)
- **Use for:** Confirm game exists, cross-check features
- **Action:** Flag discrepancies for review

---

## FIELDS TO VERIFY (PER GAME)

| Field | Required | Validation | Example |
|-------|----------|------------|---------|
| **Primary Mechanic** | ✅ YES | Approved list | "Hold & Win" |
| **Features (complete list)** | ✅ YES | Non-empty array | ["Free Spins", "Wild Symbols (2x-10x)", "Jackpots (4 tiers)"] |
| **Reels** | ✅ YES | 3-8 or format string | 5 or "6x2-7" |
| **Rows** | ✅ YES | 1-7 or format string | 3 or "2-7 (variable)" |
| **Paylines/Ways** | ✅ YES | Number or string | 20 or "243 ways" |
| **RTP** | ✅ YES | 85-99% | 96.0 |
| **Volatility** | ⚠️ IF AVAILABLE | Approved list or N/A | "high" |

---

## VALIDATION RULES

```python
RULES = {
    "rtp": lambda x: 85 <= float(x) <= 99,
    "reels": lambda x: x in [3,5,6,7,8] or isinstance(x, str),
    "rows": lambda x: x in [1,3,4,5,6,7] or isinstance(x, str),
    "primary_mechanic": lambda x: x in [
        "Free Spins", "Hold & Win", "Megaways", "Progressive Jackpot",
        "Wheel Bonus", "Cascading Reels", "Link & Win", "Money Collect",
        "Multipliers", "Other"
    ],
    "features": lambda x: isinstance(x, list) and len(x) > 0,
}
```

---

## VERIFICATION WORKFLOW

### STEP 1: Extract from Provider Site (Gold Standard)
```
Search: "[Game Name] [Provider] official site game"
Find: Official game page or interactive demo
Extract:
  ✓ Reels x Rows
  ✓ Paylines/Ways
  ✓ RTP %
  ✓ Primary mechanic (from description/features)
  ✓ ALL features (from feature list/description)
  ✓ Volatility (if stated)
Document: URL + date accessed
```

### STEP 2: Verify with SlotCatalog
```
Search: "slotcatalog.com/en/slots/[game-name-slug]"
Extract: Same fields as Step 1
Compare: 
  - Match? → Good
  - Differ? → Flag with details
```

### STEP 3: Verify with Casino Site
```
Search: "[Game Name] [Provider] betmgm OR draftkings OR caesars"
Extract: Available specs and features
Compare:
  - Confirm game exists and is live
  - Cross-check any visible specs
```

### STEP 4: Automatic Comparison
```
IF all 3 sources agree:
  → Accept data (Provider version as gold standard)
ELIF Provider + 1 other agree:
  → Accept data with note
ELIF all 3 differ:
  → FLAG FOR MANUAL REVIEW
```

### STEP 5: Validation Rules
```
Run automatic checks:
  ✓ RTP in range 85-99%
  ✓ Reels valid
  ✓ Rows valid
  ✓ Primary mechanic in approved list
  ✓ Features non-empty
  ✓ All required fields present
```

### STEP 6: Apply to Database
```
ONLY after all checks pass:
  - Update games_master.json
  - Document verification status
  - Mark as "gold_standard_verified"
```

---

## DOCUMENTATION FORMAT

For each game, create detailed record:

```markdown
GAME: [Name]
PROVIDER: [Studio] (from CSV)
THEO WIN: $[Amount]M
STATUS: [In Progress / Verified / Flagged]

---

SOURCE 1 - PROVIDER SITE (🥇 Gold Standard):
URL: [exact URL]
Date: [YYYY-MM-DD]
Specs: [reels]x[rows], [paylines], RTP [%], [volatility]
Primary: [mechanic]
Features: [detailed list with specifics]
Notes: [any observations]

---

SOURCE 2 - SLOTCATALOG (✅ Verification 1):
URL: [exact URL]
Specs: [reels]x[rows], [paylines], RTP [%]
Primary: [mechanic]
Features: [list]
Notes: [any observations]

---

SOURCE 3 - CASINO SITE (✅ Verification 2):
URL: [exact URL]
Site: [BetMGM/DraftKings/Caesars/etc]
Specs: [any visible]
Features: [any listed]
Notes: [any observations]

---

COMPARISON ANALYSIS:
Primary Mechanic: ✅/⚠️/❌ [details]
Features: ✅/⚠️/❌ [details]
Reels: ✅/⚠️/❌ [details]
Rows: ✅/⚠️/❌ [details]
Paylines: ✅/⚠️/❌ [details]
RTP: ✅/⚠️/❌ [details]

DISCREPANCIES: [list any conflicts]

---

VALIDATION CHECKS:
✅/❌ RTP in range (85-99%)
✅/❌ Reels valid (3-8)
✅/❌ Rows valid (1-7)
✅/❌ Paylines valid
✅/❌ Primary in approved list
✅/❌ Features non-empty
✅/❌ All required fields present

---

FINAL VERIFIED DATA:
Primary: [accepted value]
Features: [accepted complete list]
Specs: [reels]x[rows], [paylines], RTP [%]
Status: ✅ VERIFIED / ⚠️ NEEDS REVIEW / ❌ CONFLICT

---

APPLIED TO DATABASE: ✅ YES / ❌ NO
Last Updated: [timestamp]
```

---

## ERROR HANDLING

### If Provider Site Not Found:
1. Try provider's interactive demo site
2. Try provider's game portfolio PDF
3. Try regulatory filing (if available)
4. If none found → Flag as "Provider source unavailable"
5. Use SlotCatalog as fallback gold standard (document this)

### If Sources Conflict:
1. Document exact conflict
2. Prioritize: Provider > SlotCatalog > Casino
3. If critical conflict (RTP, reels, rows) → MANUAL REVIEW required
4. Mark game as "Needs Review" until resolved

### If Validation Fails:
1. Do not apply to database
2. Flag for manual review
3. Document which validation failed
4. Re-verify with fresh search

---

## QUALITY CONTROL

### After Each Batch:
- Calculate verification success rate
- List games flagged for review
- Identify common issues
- Document error patterns

### Random Re-Verification:
- 10% of each batch re-verified from scratch
- Different search approach used
- Compare results to database
- Catch systematic errors

---

## SUCCESS CRITERIA

✅ **VERIFIED:** All checks pass, sources agree, data applied
⚠️ **NEEDS REVIEW:** Minor discrepancies, 2/3 sources agree
❌ **FAILED:** Major conflicts, validation failed, manual review required

**Target:** 98%+ verified, <2% needs review, 0% failed

---

**Protocol Version:** 2.0  
**Last Updated:** January 26, 2026  
**Next Review:** After Top 20 completion
