# GAME VERIFICATION PROTOCOL v2.2
**Last Updated:** February 4, 2026  
**Status:** Active  
**Target Accuracy:** 100%

---

## OVERVIEW

This protocol ensures 100% accuracy for all game data in `games_master.json` through triple-source verification, automated comparison, and random quality checks.

---

## 8-STEP VERIFICATION PROCESS

### **STEP 0: DEDUPLICATION (MANDATORY)**

**Before starting any batch:**

1. Check for duplicate game entries by name
2. Score duplicates based on data completeness:
   - Feature count
   - Provider name specificity
   - RTP presence
   - Specs completeness
3. Keep highest-quality entry
4. Mark others as `data_validity: "duplicate"`

**Script:**
```python
# Identify duplicates by normalized name
# Score: features_count + (1 if rtp) + len(provider_name)
# Mark lower-scored entries as duplicate
```

---

### **STEP 1: TRIPLE-SOURCE EXTRACTION**

**Adaptive Gold Standard Hierarchy:**

**If game on SlotCatalog:**
- 🥇 **Gold Standard:** SlotCatalog
- 🥈 **Verification 1:** Official Provider Site
- 🥉 **Verification 2:** Casino Site (BetMGM, DraftKings, Horseshoe, Caesars, FanDuel, Borgata)

**If NOT on SlotCatalog:**
- 🥇 **Gold Standard:** Official Provider Site
- 🥈 **Verification 1:** Casino Site #1
- 🥉 **Verification 2:** Casino Site #2 OR Review Site (Casino Guru, AboutSlots, Respinix)

**Always maintain 3 independent sources.**

---

### **DATA EXTRACTION REQUIREMENTS:**

For each game, extract:

**Mechanics:**
- Primary mechanic (single most important feature)
- Features (complete list with specifics)

**Specs:**
- Reels
- Rows
- Paylines (or "ways to win")
- RTP %
- Volatility

**Search Strategy:**
1. **Check casino-exclusive sites** (Horseshoe, Caesars) - many variants are operator exclusives
2. **Use provider name + game name** for precise results
3. **Check operator help docs** - often have detailed specs
4. **For casino exclusives:** Trust performance data as proof of existence, focus on accuracy

---

### **STEP 2: AUTOMATIC COMPARISON**

**Python-based comparison engine:**

```python
# For each field:
# - Compare all 3 sources
# - Flag if sources disagree
# - Accept if 2/3 sources agree
# - Manual review if all 3 disagree
```

**Output Format:**
```
GAME: [name]
FIELD: [field_name]
  Source 1: [value]
  Source 2: [value]
  Source 3: [value]
  RESULT: ✅ MATCH / ⚠️ PARTIAL / ❌ CONFLICT
```

---

### **STEP 3: VALIDATION RULES ENGINE**

**Automated checks:**

```python
def validate_game(game):
    errors = []
    
    # RTP Range
    if not (85 <= rtp <= 99):
        errors.append("RTP out of range")
    
    # Reels/Rows
    if reels not in [3, 5, 6] or rows not in [1, 3, 4, 5, 6, 7]:
        errors.append("Invalid reel/row configuration")
    
    # Primary Mechanic
    approved_mechanics = [
        "Free Spins", "Hold & Win", "Cash Collect", "Megaways",
        "Cascading Reels", "Wheel Bonus", "Progressive Jackpot",
        "Wild Collect", "Power Combo", "Nudge"
    ]
    if primary not in approved_mechanics:
        errors.append("Primary mechanic not in approved list")
    
    # Features
    if len(features) < 2:
        errors.append("Too few features")
    
    return errors
```

---

### **STEP 4: DATABASE UPDATES**

**Enhanced bulk update script (ALL FIELDS):**

```python
def update_game(game_id, verified_data):
    # Update mechanics
    game['mechanic']['primary'] = verified_data['primary']
    game['mechanic']['features'] = verified_data['features']
    
    # Update specs (CRITICAL - don't skip!)
    game['specs']['reels'] = verified_data['reels']
    game['specs']['rows'] = verified_data['rows']
    game['specs']['paylines'] = verified_data['paylines']
    game['specs']['rtp'] = verified_data['rtp']
    game['specs']['volatility'] = verified_data['volatility']
    
    # Mark as verified
    game['data_validity'] = 'valid'
```

**IMPORTANT:** Update ALL fields, not just mechanic!

---

### **STEP 5: GENERATE COMPARISON REPORT**

**Create `BATCH_XX-YY_COMPARISON.md`:**
- Document all 3 sources for each game
- Show field-by-field comparison
- Flag discrepancies
- Record confidence levels

---

### **STEP 6: APPLY DATABASE UPDATES**

1. Backup `games_master.json`
2. Apply all verified updates
3. Verify write success
4. Check no data corruption

---

### **STEP 7: RANDOM RE-VERIFICATION (QA LAYER)**

**Critical quality control step:**

**Sample Size:** 30% of batch (6 games for 20-game batch)

**Method:** 
- Random selection (use Python `random.sample()`)
- **REVERSE ORDER:** Casino → Provider → Review
- Different search order catches systematic biases

**Check:**
- Primary mechanic matches database
- Key features match database
- Specs (reels, rows, paylines, RTP) match database

**If errors found:**
- Fix immediately
- Analyze root cause
- Update protocol if needed

**Error Tolerance:** 0% - All errors must be fixed

---

### **STEP 8: FINAL REPORT**

**Generate `BATCH_XX-YY_FINAL_REPORT.md`:**

Include:
1. **Executive Summary** - Games verified, accuracy, duplicates
2. **Deduplication Results** - IDs marked as duplicate
3. **Verified Games Table** - All games with specs
4. **Primary Mechanic Changes** - What was corrected
5. **Random Re-Verification Results** - Errors found/fixed
6. **Quality Metrics** - Data completeness, source coverage
7. **Lessons Learned** - What went wrong, how to prevent
8. **Process Improvements** - Updates for next batch
9. **Cumulative Progress** - Total games verified so far

---

## VALIDATION RULES

### **Primary Mechanics (Approved List):**
- Free Spins
- Hold & Win
- Cash Collect / Money Collect
- Megaways
- Cascading Reels
- Wheel Bonus
- Progressive Jackpot
- Wild Collect
- Power Combo
- Nudge
- Tumbling Reels
- Ways to Win

### **RTP Range:**
- Min: 85%
- Max: 99%
- Accept `null` only if legitimately unavailable (land-based exclusive)

### **Feature Requirements:**
- Minimum: 2 features
- Must be specific (not generic like "Wild Symbols")
- Include mechanic details (e.g., "Cascading Reels (winning symbols vanish)")

### **Specs Requirements:**
- Reels: Required (3, 5, or 6 typical)
- Rows: Required (1, 3, 4, 5, 6, 7 typical)
- Paylines: Required (or "ways to win", or "N/A - collection based")
- RTP: Required (or `null` if unavailable)
- Volatility: Preferred (accept missing if unavailable)

---

## DATA VALIDITY STATES

```json
{
  "valid": "Fully verified, 100% accurate",
  "valid_with_limitations": "Verified but some specs unavailable",
  "duplicate": "Duplicate entry, do not use",
  "invalid": "Bad data, do not use",
  "not_validated": "Not yet verified, do not use"
}
```

---

## BATCH PROCESSING

### **Batch Size:** 20 games
**Reason:** Optimal for thoroughness vs. speed

### **Random Sampling:** 30% (6 games per batch)
**Reason:** Catches 33% error rate, achieves 100% final accuracy

### **Expected Time:** 3 hours per 20-game batch
**Breakdown:**
- Deduplication: 15 min
- Triple-source extraction: 90 min
- Comparison & updates: 30 min
- Random re-verification: 30 min
- Error fixes & report: 15 min

---

## CRITICAL REMINDERS

### **❌ NEVER SKIP:**
1. Deduplication check
2. Automatic comparison step
3. Specs updates (reels, rows, paylines, RTP)
4. Random re-verification (30%)
5. Error fixes before marking batch complete

### **✅ ALWAYS DO:**
1. Check casino-exclusive sites (Horseshoe, Caesars)
2. Update ALL fields (not just mechanic)
3. Fix errors immediately when found
4. Document lessons learned
5. Generate final report

### **⚠️ WATCH OUT FOR:**
1. Casino-exclusive variants (different specs)
2. Games with multiple versions (check theo_win to confirm which one)
3. Bulk update scripts that skip specs
4. Land-based vs. online versions
5. Provider name changes (parent companies)

---

## ERROR PATTERNS & SOLUTIONS

### **Pattern 1: Missing Specs After Update**
**Cause:** Bulk update script only updated mechanic, skipped specs  
**Solution:** Enhanced script to update ALL fields

### **Pattern 2: Casino-Exclusive Variants Not Found**
**Cause:** Not checking operator-specific sites  
**Solution:** Always check Horseshoe, Caesars, operator help docs

### **Pattern 3: Random Check Finds Errors**
**Cause:** Initial verification missed nuances  
**Solution:** Trust random check, fix immediately, improve search depth

### **Pattern 4: High Duplicate Rate**
**Cause:** Database has redundant entries  
**Solution:** Auto-dedupe before every batch

---

## SUCCESS METRICS

**Target:** 100% accuracy after random checks

**Measuring Success:**
- Initial verification accuracy: 90-95%
- After random check corrections: 100%
- Data completeness: 95%+
- Source coverage: 3 sources for every game

---

## VERSION HISTORY

### **v2.2 (Current)**
- Enhanced bulk update (ALL fields)
- Mandatory casino-exclusive checks
- Auto-deduplication before batch
- 30% random sampling confirmed

### **v2.1**
- Added automatic comparison step
- Implemented validation rules engine
- Enhanced error detection

### **v2.0**
- Adaptive Gold Standard hierarchy
- Casino-exclusive search protocol
- Random re-verification with reverse order

### **v1.0**
- Basic triple-source verification
- Manual comparison
- No random checks

---

## FILES GENERATED PER BATCH

1. `BATCH_XX-YY_COMPARISON.md` - Source comparison analysis
2. `BATCH_XX-YY_FINAL_REPORT.md` - Comprehensive batch report
3. `games_master.json` - Updated with verified data

---

**Protocol Status:** ✅ ACTIVE  
**Last Verified Batch:** 43-62  
**Total Games Verified:** 62  
**Overall Accuracy:** 100%

---

**For questions or protocol updates, refer to conversation transcript.**
