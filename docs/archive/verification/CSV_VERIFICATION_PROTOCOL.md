# 🔍 CSV-BASED VERIFICATION PROTOCOL

**Created:** February 2, 2026  
**Purpose:** Catch errors like "Money Charge" that slipped through bulletproof verification  
**Status:** CRITICAL - Required before production

---

## 🚨 THE PROBLEM WE FOUND

**Error:** "Money Charge" (Rank 8) is a FEATURE, not a game
**Impact:** 91.2% "bulletproof" database had critical error
**Root Cause:** Manual research overwrote correct CSV data

**Key Insight:** We verified games were REAL, but didn't verify they matched CSV SOURCE

---

## ✅ MOST EFFECTIVE VERIFICATION APPROACH

### **2-PHASE PROCESS:**

## **PHASE 1: CSV SOURCE RECONCILIATION** (Automated + Manual)
**Goal:** Ensure every rank matches CSV source of truth

## **PHASE 2: FEATURE/MECHANIC VALIDATION** (Manual)
**Goal:** Ensure no feature names are listed as game names

---

## 📋 PHASE 1: CSV SOURCE RECONCILIATION

### **Step 1: Automated Comparison** (5 minutes)

**Script Output:**
```
For each rank 1-500:
  ✅ MATCH: Rank, CSV name, Our name → No action
  ⚠️ MISMATCH: Rank, CSV name, Our name → Flag for review
  🚩 GAP: Rank not in CSV → Mark as added
```

**Expected Output:**
- ~400-450 matches (no action needed)
- ~50-100 mismatches (need review)
- ~0-10 gaps (added during research)

---

### **Step 2: Categorize Mismatches** (10 minutes)

**Categories:**

**A. ACCEPTABLE MISMATCHES** (No fix needed):
- ✅ CSV: "Cleopatra" → Our: "Cleopatra Plus" (variant specified)
- ✅ CSV: "Cash Eruption" → Our: "Cash Eruption" (same, spelling differs)
- ✅ Provider corrections (we verified correct provider)

**B. CRITICAL MISMATCHES** (Fix required):
- ❌ CSV: "Hypernova Megaways" → Our: "Money Charge" (WRONG GAME)
- ❌ CSV: "Game A" → Our: "Game B" (completely different)
- ❌ Our game is a feature name, not a game

**C. TITLE IMPROVEMENTS** (Already fixed):
- ✅ CSV: "Wild West" → Our: "Wild Wild West: The Great Train Heist"
- ✅ CSV: "Coin Fury" → Our: "Coin Frenzy"

---

### **Step 3: Manual Review Checklist** (Per mismatch)

For each MISMATCH, answer:

```
□ Is CSV game name in our database at different rank?
□ Is our game name actually a feature/series name?
□ Did we intentionally correct CSV error?
□ Is this a title variant (acceptable)?
□ Which is correct: CSV or Ours?
```

**Decision Matrix:**

| CSV Says | We Say | Research Shows | Action |
|----------|--------|----------------|--------|
| Game A | Game B | B is correct, A is error | ✅ Keep ours, document |
| Game A | Game B | A is correct, B is wrong | ❌ Fix to match CSV |
| Game A | Feature X | X is feature, not game | ❌ Fix to match CSV |
| Game A | Game A Plus | Same game, variant name | ✅ Keep ours (better) |

---

## 📋 PHASE 2: FEATURE/MECHANIC VALIDATION

### **Step 1: Build Feature Dictionary** (10 minutes)

**Known Feature/Mechanic Names:**

**Branded Features:**
- Lightning Link (Aristocrat)
- Dragon Link (Aristocrat)
- Fire Link (Light & Wonder)
- Cash Eruption (IGT - but also a GAME!)
- Money Charge (AGS)
- Wicked Wheel (Everi)
- Buffalo Link (Aristocrat)
- Reel King (Inspired)
- Jackpot King (Blueprint)

**Generic Mechanics:**
- Hold & Spin
- Link & Win
- Lock It Link
- Respins
- Cascading Reels
- Megaways (also in game titles)

**Series/Family Names:**
- "Money Charge Jackpots" (AGS series)
- "Lightning Link" (Aristocrat series)
- "Dragon Link" (Aristocrat series)
- "Cash Eruption" (IGT series)

---

### **Step 2: Flag Suspicious Game Names** (Automated)

**Script checks:**
```python
For each game name:
  If name matches feature dictionary exactly → 🚩 FLAG
  If name is 1-3 words AND matches feature → ⚠️ WARN
  If name ends with feature name only → 🚩 FLAG
```

**Example Flags:**
- 🚩 "Money Charge" (2 words, exact match)
- 🚩 "Lightning Link" (2 words, exact match)
- ⚠️ "Cash Eruption Hephaestus" (contains "Cash Eruption")
- ✅ "Hypernova Megaways" (Megaways is mechanic but game exists)

---

### **Step 3: Manual Verification** (Per flagged game)

**For each flagged game:**

```
□ Search "[Provider] [Game Name]" official site
□ Search SlotCatalog.com for exact game
□ Search 3+ casino operators for game
□ Check if it's listed as standalone game
□ Check if it's only a feature in other games
```

**Decision:**
- ✅ Standalone game exists → Keep, document
- ❌ Only a feature → Flag as error, find correct game
- ⚠️ Both game AND feature → Verify rank placement

---

## 🔧 IMPLEMENTATION PLAN

### **Phase 1: CSV Reconciliation (Automated)**

**Tool:** Python script
**Input:** 
- CSV file (source of truth)
- games_master.json (our database)

**Output:** `CSV_RECONCILIATION_REPORT.md`
```
MATCHES: 450 games
MISMATCHES: 48 games (need review)
  - Critical: 5 games
  - Acceptable: 40 games
  - To Review: 3 games
```

**Time:** 5 minutes script + 30 minutes review

---

### **Phase 2: Feature Validation (Manual + Automated)**

**Tool:** Python script + manual verification
**Input:**
- games_master.json
- Feature dictionary

**Output:** `FEATURE_VALIDATION_REPORT.md`
```
FLAGGED GAMES: 8
  - Money Charge (Rank 8) - NOT A GAME ❌
  - Cash Eruption (Rank 1) - IS A GAME ✅
  - Lightning Link (Rank XX) - Need to verify
  ...
```

**Time:** 10 minutes script + 1-2 hours verification

---

## 📊 VERIFICATION WORKFLOW

### **OPTION A: COMPREHENSIVE (Recommended)**
```
1. Run CSV reconciliation script → 5 min
2. Review all mismatches → 30 min
3. Fix critical errors → 15 min
4. Run feature validation script → 10 min
5. Verify flagged games (5-10 games) → 1 hour
6. Fix feature errors → 15 min
7. Re-run bulletproof check → 5 min

TOTAL TIME: ~2.5 hours
CONFIDENCE: 99%+ accuracy
```

### **OPTION B: TARGETED (Faster)**
```
1. Run CSV reconciliation for Top 100 only → 2 min
2. Review critical mismatches only → 15 min
3. Run feature validation on Top 100 → 5 min
4. Fix errors found → 10 min

TOTAL TIME: ~30 minutes
CONFIDENCE: 95%+ for top 100
```

### **OPTION C: FULL AUDIT (Most thorough)**
```
1. CSV reconciliation (all 500) → 5 min
2. Review ALL mismatches → 1 hour
3. Feature validation (all 500) → 10 min
4. Verify ALL flagged games → 2 hours
5. Cross-check with SlotCatalog → 1 hour
6. Verify mechanics/features accuracy → 2 hours
7. Re-run all validations → 15 min

TOTAL TIME: ~6-7 hours
CONFIDENCE: 99.9%+ accuracy
```

---

## ✅ SUCCESS CRITERIA

**After verification, we should have:**

1. **CSV Alignment:**
   - ✅ 95%+ exact matches with CSV
   - ✅ All mismatches documented
   - ✅ All corrections justified

2. **Feature Accuracy:**
   - ✅ No feature names listed as games
   - ✅ All flagged games verified
   - ✅ Game series properly named

3. **Documentation:**
   - ✅ Reconciliation report complete
   - ✅ All changes logged in audit trail
   - ✅ Verification date stamped

4. **Confidence:**
   - ✅ 95%+ bulletproof maintained
   - ✅ Zero critical errors
   - ✅ Ready for production

---

## 🎯 RECOMMENDATION

**START WITH: OPTION A (Comprehensive)**

**Why:**
- Only takes 2.5 hours
- Catches all "Money Charge" type errors
- Gives 99%+ confidence
- Worth the time investment

**Then:**
- Option C for final production sign-off (if needed)

---

## 📋 NEXT STEPS

**Immediate:**
1. ✅ Create CSV reconciliation script
2. ✅ Run script and generate report
3. ✅ Review critical mismatches
4. ✅ Fix errors found

**Then:**
1. ✅ Create feature validation script
2. ✅ Run script and generate report
3. ✅ Verify flagged games
4. ✅ Fix feature errors

**Finally:**
1. ✅ Re-run bulletproof check
2. ✅ Generate final audit report
3. ✅ Sign off for production

---

**READY TO START?** 

Let me know which option you prefer (A, B, or C) and I'll build the scripts!
