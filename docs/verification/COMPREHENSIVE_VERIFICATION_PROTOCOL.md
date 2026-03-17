# 🔍 COMPREHENSIVE DATA VERIFICATION PROTOCOL

**Created:** February 2, 2026  
**Purpose:** Verify ALL data fields with proper source-of-truth hierarchy  
**Scope:** Every field in all 500 games

---

## 🎯 SOURCE OF TRUTH HIERARCHY

### **TIER 1: CSV DATA (Primary Source of Truth)**
**Rule:** If field exists in CSV, CSV is authoritative

**CSV Fields to Verify:**
- ✅ Game Name
- ✅ Parent Supplier (Provider)
- ✅ Theo Win Index
- ✅ % of Total GGR (Market Share)
- ✅ Month, Year of Release Date
- ⚠️ Game Category
- ⚠️ Avg. Average Bet
- ⚠️ Median Avg Bet
- ⚠️ Avg. Games Played Index
- ⚠️ Avg. Coin In Index

**Verification:**
```
IF our_value != csv_value:
  → 🚩 FLAG as mismatch
  → MUST fix to match CSV (unless CSV has known error)
```

---

### **TIER 2: WEB RESEARCH (Secondary Source)**
**Rule:** For fields NOT in CSV, use 3+ web sources with reliability logic

**Web-Only Fields:**
- RTP (Return to Player %)
- Volatility (Low/Medium/High)
- Reels, Rows, Paylines
- Primary Mechanic
- Features Array
- Theme Primary/Details
- Provider Parent Company
- Exact Release Date

**Source Reliability Hierarchy:**
1. **Official Provider Website** (100% reliable)
2. **SlotCatalog.com** (95% reliable - industry standard)
3. **Casino Operator Sites** (90% reliable - verified games)
4. **Industry Press Releases** (85% reliable)
5. **Aggregator Sites** (70% reliable - community data)

**Verification Logic:**
```
IF 3+ sources agree:
  → ✅ VERIFIED (use consensus value)
  
IF 2 sources vs 1 source:
  → ⚠️ Use higher-reliability source
  → FLAG for review if low confidence
  
IF sources conflict (no consensus):
  → 🚩 FLAG for manual research
  → Use most reliable source temporarily
  
IF only 1-2 sources found:
  → ⚠️ FLAG as "Limited Data"
  → Mark confidence as 75%
```

---

### **TIER 3: CALCULATED/DERIVED (Tertiary)**
**Rule:** Fields calculated from other data

**Derived Fields:**
- Rank (from Theo Win Index sort)
- Percentile (from rank position)
- Classification confidence
- Anomaly detection

**Verification:**
```
Recalculate from source data
IF calculated != stored:
  → Update to calculated value
```

---

## 📊 COMPREHENSIVE FIELD VERIFICATION

### **SECTION 1: CORE IDENTIFICATION**

#### **1.1 Game Name** (CSV Source)
```
CSV Field: "Game Name"
Our Field: name
Priority: CRITICAL

Checks:
□ Exact match with CSV
□ If different: Is ours a full title variant? (acceptable)
□ If different: Is ours a feature name? (ERROR)
□ If different: Did we correct CSV error? (document)

Actions:
✅ Match → No action
⚠️ Variant → Document reason
🚩 Mismatch → Flag for review
❌ Feature name → CRITICAL ERROR, fix immediately
```

#### **1.2 Provider** (CSV Source)
```
CSV Field: "Parent Supplier"
Our Field: provider.studio, provider.parent
Priority: CRITICAL

Checks:
□ CSV provider matches our provider.studio OR provider.parent
□ If different: Did we correct CSV error? (verify with 3+ sources)
□ Parent company relationship correct?

Actions:
✅ Match → No action
⚠️ Parent vs Studio → Acceptable if accurate
🚩 Different → Verify with official sources
❌ Wrong → Fix to correct provider
```

---

### **SECTION 2: PERFORMANCE METRICS**

#### **2.1 Theo Win Index** (CSV Source)
```
CSV Field: "Theo Win Index"
Our Field: performance.theo_win
Priority: CRITICAL

Checks:
□ Values match within 0.01 tolerance
□ Rank order preserved (higher theo = lower rank number)

Actions:
✅ Match → No action
🚩 Mismatch → Update to CSV value (source of truth)
⚠️ Missing in CSV → Calculate from other metrics
```

#### **2.2 Market Share** (CSV Source)
```
CSV Field: "% of Total GGR"
Our Field: performance.market_share_percent
Priority: HIGH

Checks:
□ Values match within 0.01% tolerance
□ Sum of all games = reasonable total

Actions:
✅ Match → No action
🚩 Mismatch → Update to CSV value
```

#### **2.3 Other Performance** (CSV Source)
```
CSV Fields: 
- "Avg. Average Bet"
- "Median Avg Bet"
- "Avg. Games Played Index"
- "Avg. Coin In Index"

Our Fields: Currently NOT in database
Priority: MEDIUM

Actions:
⚠️ Consider adding these fields for completeness
```

---

### **SECTION 3: RELEASE DATE**

#### **3.1 Release Year/Month** (CSV Source)
```
CSV Field: "Month, Year of OGPD Release Date"
Our Field: release.year, release.month
Priority: HIGH

Checks:
□ Year matches CSV
□ Month matches CSV (if provided)
□ If CSV says "N/A" or blank: Use web research

Actions:
✅ Match → No action
⚠️ CSV blank → Use web research (3+ sources)
🚩 Mismatch → Verify which is correct
  → If CSV correct: Update ours
  → If CSV wrong: Document correction with sources
```

#### **3.2 Exact Release Date** (Web Source)
```
CSV Field: Not available
Our Field: release.exact_date
Priority: MEDIUM

Verification:
□ 3+ sources agree on exact date → ✅ High confidence
□ 2 sources agree → ⚠️ Medium confidence
□ No consensus → ⚠️ Month/year only, mark 75%
□ No date found → N/A acceptable
```

---

### **SECTION 4: GAME SPECIFICATIONS**

#### **4.1 RTP** (Web Source - 3+ sources)
```
Our Field: specs.rtp
Priority: HIGH

Source Priority:
1. Official Provider Site (100%)
2. SlotCatalog.com (95%)
3. Casino Operator Help Pages (90%)
4. Industry Databases (85%)

Verification:
□ Official provider lists RTP → Use that (authoritative)
□ 3+ sources agree → ✅ High confidence (90-100%)
□ 2 sources agree → ⚠️ Medium confidence (85%)
□ Sources conflict → 🚩 Flag for review, use provider site
□ Not publicly disclosed → Mark as "N/A" (legitimate)

Special Cases:
• Land-based games: RTP often not disclosed (acceptable)
• Regional variations: Note "Varies by market"
• Range provided: Use average or note range
```

#### **4.2 Volatility** (Web Source - 3+ sources)
```
Our Field: specs.volatility
Priority: HIGH

Verification:
□ Official provider lists volatility → Use that
□ 3+ sources agree → ✅ High confidence
□ 2 sources agree → ⚠️ Medium confidence  
□ Sources conflict → Use most reliable source
□ Not disclosed → Use "unknown" or estimate with note

Classification Standards:
• Low: Small frequent wins
• Medium: Balanced
• High: Large infrequent wins
• Very High/Extreme: Rare massive wins
```

#### **4.3 Reels, Rows, Paylines** (Web Source - 2+ sources)
```
Our Fields: specs.reels, specs.rows, specs.paylines
Priority: HIGH

Verification:
□ Official provider → Use that
□ 2+ sources agree → ✅ Verified
□ Screenshots confirm → ✅ Visual verification
□ Sources conflict → Flag for manual check

Special Cases:
• "Ways to Win" (243, 1024, etc.) → Note as paylines
• Variable reels (Megaways) → Note mechanic
• Cluster Pays → Note "cluster" for paylines
```

---

### **SECTION 5: MECHANICS & FEATURES**

#### **5.1 Primary Mechanic** (Web Source - 3+ sources)
```
Our Field: mechanic.primary
Priority: HIGH

Verification Process:
STEP 1: Verify it's a real MECHANIC, not a feature name
  □ Check against mechanic dictionary
  □ Ensure it's not a branded feature (Lightning Link, etc.)
  
STEP 2: Verify it's the PRIMARY mechanic
  □ 3+ sources describe this mechanic
  □ Provider marketing emphasizes this
  □ Game title/theme suggests this
  
STEP 3: Validate classification
  □ Matches our mechanic taxonomy
  □ Not confused with feature

Red Flags:
🚩 Mechanic is actually a branded feature name
🚩 Mechanic is provider-specific brand (Money Charge, etc.)
🚩 Multiple games have this "mechanic" → might be series
```

#### **5.2 Features Array** (Web Source - 3+ sources)
```
Our Field: mechanic.features[]
Priority: HIGH

Verification Process:
STEP 1: Verify each feature exists in game
  □ Official provider lists feature
  □ 2+ casino sites confirm feature
  □ Gameplay videos show feature
  
STEP 2: Verify feature names are accurate
  □ Not confused with game name
  □ Not confused with series name
  □ Standardized naming (Free Spins not "Free Games")
  
STEP 3: Check completeness
  □ Major features included (3+ features typical)
  □ Bonus rounds documented
  □ Special symbols noted

Common Issues:
❌ Feature name used as game name (Money Charge)
❌ Series name listed as feature
❌ Branded mechanic vs actual feature confusion
```

---

### **SECTION 6: THEME & DESCRIPTION**

#### **6.1 Theme Primary** (Web Source - 2+ sources)
```
Our Field: theme.primary
Priority: MEDIUM

Verification:
□ Visual inspection (screenshots)
□ Provider marketing materials
□ 2+ sources describe similar theme
□ Classification matches our taxonomy

Quality Check:
✅ Detailed (≥100 chars)
✅ Accurate to game visuals
✅ Not generic filler text
```

#### **6.2 Theme Details** (Web Source - multiple)
```
Our Field: theme.details
Priority: MEDIUM

Verification:
□ Minimum 100 characters (preferably 200+)
□ Describes actual game aesthetics
□ Includes color palette, symbols, atmosphere
□ Not just a copy of features list
□ Original content (not plagiarized)

Quality Standards:
✅ ≥200 chars: Excellent
⚠️ 100-199 chars: Acceptable
🚩 <100 chars: Needs expansion
```

---

## 🔧 VERIFICATION WORKFLOW

### **AUTOMATED PHASE** (Scripts)

**Script 1: CSV Reconciliation**
```python
For each game (rank 1-500):
  Compare CSV fields:
    - Game Name: exact match check
    - Provider: match check
    - Theo Win: numeric comparison (±0.01)
    - Market Share: numeric comparison (±0.01)
    - Release Date: year/month match
  
  Output:
    ✅ MATCH: All fields match
    ⚠️ PARTIAL: Some fields match
    🚩 MISMATCH: Critical fields differ
    ❌ ERROR: Feature name as game name
```

**Script 2: Web Source Counter**
```python
For each game:
  Count verification sources in audit.data_sources[]
  
  Check:
    □ Has ≥3 sources? → ✅ Well verified
    □ Has 2 sources? → ⚠️ Adequate
    □ Has 1 source? → 🚩 Insufficient
    □ Has "web_research" only? → ❌ Needs detail
```

**Script 3: Feature Name Validator**
```python
For each game name:
  Check against feature dictionary:
    - Exact match? → 🚩 FLAG (Money Charge)
    - Contains feature name? → ⚠️ REVIEW
    - Is a series name? → ⚠️ REVIEW
```

**Script 4: Data Completeness Audit**
```python
For each game:
  Check required fields:
    □ specs.rtp exists?
    □ specs.volatility exists?
    □ release.year exists?
    □ theme.details ≥100 chars?
    □ mechanic.features ≥3 items?
  
  Calculate completeness score:
    100%: All required fields present
    80-99%: Minor gaps acceptable
    <80%: Needs more research
```

---

### **MANUAL PHASE** (Human Review)

**Priority 1: Critical Errors (Fix immediately)**
```
□ Feature names used as game names (Money Charge type)
□ CSV mismatches (wrong game entirely)
□ Provider completely wrong
□ Theo Win Index wrong by >10%
```

**Priority 2: Data Quality (Fix soon)**
```
□ Missing RTP/Volatility (can find in 3+ sources)
□ Theme details <100 chars
□ Only 1-2 verification sources
□ Release date conflicts
```

**Priority 3: Enhancements (Fix when time permits)**
```
□ Expand theme details (100 → 200+ chars)
□ Add more features (3 → 5-7)
□ Find exact release dates
□ Add regional RTP variants
```

---

## 📋 VERIFICATION REPORT FORMAT

### **Per-Game Report:**
```
GAME: [Name] (Rank [X])
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CSV VERIFICATION:
  ✅ Game Name: Match
  ✅ Provider: Match  
  ✅ Theo Win: 15.23 (CSV) vs 15.23 (Ours) ✅
  🚩 Release: 2020 (CSV) vs 2021 (Ours) MISMATCH
  
WEB VERIFICATION:
  ✅ RTP: 96.5% (4 sources agree - high confidence)
  ⚠️ Volatility: High (2 sources) - medium confidence
  ✅ Specs: 5x3, 243 ways (3+ sources confirm)
  
FEATURES VERIFICATION:
  ✅ Primary: Hold & Win (confirmed - real mechanic)
  ⚠️ Features: Only 2 listed (typical is 3-5)
  
SOURCES:
  • Official Provider ✅
  • SlotCatalog.com ✅
  • Casino Operator ✅
  • Industry Press ✅
  Total: 4 sources (excellent)
  
ISSUES FOUND:
  🚩 Release year mismatch - CSV says 2020, we have 2021
  ⚠️ Only 2 features listed - could add more
  
RECOMMENDATIONS:
  1. Fix release year to 2020 (CSV is source of truth)
  2. Research and add 1-2 more features
  
OVERALL CONFIDENCE: 95% → 100% (after fixes)
```

---

## 🎯 IMPLEMENTATION: 3 OPTIONS

### **OPTION A: COMPREHENSIVE (Recommended)**
**Scope:** All 500 games, all fields  
**Time:** 4-6 hours  
**Output:** 99%+ verified accuracy

**Process:**
1. Run CSV reconciliation (10 min)
2. Review all CSV mismatches (1 hour)
3. Run web source counter (5 min)
4. Review insufficient sources (1 hour)
5. Run feature validator (5 min)
6. Fix feature errors (30 min)
7. Run data completeness (5 min)
8. Fill critical gaps (1-2 hours)
9. Generate final report (15 min)

---

### **OPTION B: TARGETED TOP 100**
**Scope:** Top 100 games only, all fields  
**Time:** 1.5-2 hours  
**Output:** 95%+ verified for top 100

**Process:**
1. Run CSV reconciliation (Top 100) (5 min)
2. Review mismatches (20 min)
3. Run feature validator (Top 100) (3 min)
4. Fix errors found (20 min)
5. Spot check sources (30 min)
6. Generate report (10 min)

---

### **OPTION C: CRITICAL FIELDS ONLY**
**Scope:** All 500 games, critical fields only  
**Time:** 1-1.5 hours  
**Output:** 90%+ core accuracy

**Fields checked:**
- Game name (CSV)
- Provider (CSV)
- Theo Win (CSV)
- RTP (Web)
- Primary mechanic (Web)

**Process:**
1. CSV reconciliation (critical fields) (10 min)
2. Fix critical mismatches (30 min)
3. Feature name validator (5 min)
4. Fix feature errors (15 min)
5. Quick report (10 min)

---

## ✅ SUCCESS CRITERIA

**After verification:**

1. **CSV Alignment:**
   - ✅ 98%+ games match CSV for: name, provider, theo win
   - ✅ 100% mismatches documented with justification
   - ✅ 0 feature names used as game names

2. **Web Verification:**
   - ✅ 90%+ games have 3+ sources
   - ✅ 95%+ games have RTP verified
   - ✅ 95%+ games have complete specs

3. **Feature Accuracy:**
   - ✅ 100% mechanics are real mechanics (not features)
   - ✅ 0 series names used as game names
   - ✅ Features verified with 2+ sources

4. **Data Quality:**
   - ✅ 95%+ games have ≥200 char theme details
   - ✅ 95%+ games have ≥3 features listed
   - ✅ 98%+ games have release year

5. **Documentation:**
   - ✅ All sources logged in audit.data_sources[]
   - ✅ All changes documented in audit.notes
   - ✅ Verification date stamped

---

## 🚀 RECOMMENDATION

**START WITH: OPTION A (Comprehensive)**

**Why:**
- Catches ALL error types (not just names)
- Verifies ALL 500 games
- Only 4-6 hours (worth it for 99%+ accuracy)
- Prevents future "Money Charge" surprises

**Then:**
- Run quarterly spot checks (Option C)
- Update when new games added

---

**READY TO BUILD THE SCRIPTS?**

I can create:
1. `csv_reconciliation.py` - Compare all CSV fields
2. `web_source_validator.py` - Check source counts
3. `feature_name_checker.py` - Find feature-as-game errors
4. `data_completeness_audit.py` - Check all fields

Just say GO! 🚀
