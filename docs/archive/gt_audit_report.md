# Ground Truth Audit Report

Generated: 2026-03-22 19:53

## Summary

Total unsourced GT entries audited: **133** (out of 254 total GT entries)

| Category | Count | Action |
|----------|-------|--------|
| High Risk (GT disagrees with SC) | 74 | **User must review** |
| SC-Confirmed (GT matches SC) | 23 | Auto-verify with source=slotcatalog |
| Unverifiable (no SC feature data) | 36 | User manual check needed |

Total potential false positives in GT: **140**
Total potential false negatives in GT: **5**

## Systematic Issues (Feature Over-Application)

These features appear in GT but NOT in SlotCatalog for many games. They are the most likely false positives:

| Feature | Games Affected | % of High-Risk Games |
|---------|---------------|---------------------|
| Static Jackpot | 47 | 64% |
| Cash On Reels | 26 | 35% |
| Pick Bonus | 20 | 27% |
| Expanding Reels | 11 | 15% |
| Wild Reels | 10 | 14% |
| Hold and Spin | 8 | 11% |
| Multiplier | 5 | 7% |
| Free Spins | 5 | 7% |
| Persistence | 3 | 4% |
| Nudges | 2 | 3% |
| Wheel | 2 | 3% |
| Expanding Wilds | 1 | 1% |

**Key pattern**: `Static Jackpot` is the most over-applied feature (47 games). Many slot games have jackpot *labels* but not a true Static Jackpot feature. Similarly, `Cash On Reels` and `Pick Bonus` are often assigned to games where SlotCatalog does not list them.

---

## HIGH RISK: GT Disagrees with SlotCatalog (74 games)

For each game, review the side-by-side comparison and decide:
- **Keep**: GT is correct, SC is wrong/incomplete
- **Fix**: Remove false positives / add false negatives
- **Defer**: Needs more research

### 1. 10X Cash
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/10x-cash

| | Features |
|---|---------|
| **GT** | Cash On Reels, Free Spins, Multiplier |
| **SC** | Free Spins, Multiplier |

- **Potential False Positives** (in GT, not in SC): `Cash On Reels`
- Confirmed by both: Free Spins, Multiplier

### 2. 3x Ultra Diamond
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/3x-ultra-diamond

| | Features |
|---|---------|
| **GT** | Multiplier, Respin, Static Jackpot |
| **SC** | Multiplier, Respin |

- **Potential False Positives** (in GT, not in SC): `Static Jackpot`
- Confirmed by both: Multiplier, Respin

### 3. 8x Crystal Bells
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/8x-Crystal-Bells

| | Features |
|---|---------|
| **GT** | Multiplier, Static Jackpot |
| **SC** | Multiplier |

- **Potential False Positives** (in GT, not in SC): `Static Jackpot`
- Confirmed by both: Multiplier

### 4. Apollo Stacks
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Apollo-Stacks

| | Features |
|---|---------|
| **GT** | Expanding Reels, Free Spins, Static Jackpot, Symbol Transformation |
| **SC** | Free Spins, Symbol Transformation |

- **Potential False Positives** (in GT, not in SC): `Expanding Reels`, `Static Jackpot`
- Confirmed by both: Free Spins, Symbol Transformation

### 5. Aztec Chief
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Aztec-Chief

| | Features |
|---|---------|
| **GT** | Free Spins, Persistence, Pick Bonus, Progressive Jackpot, Static Jackpot, Wild Reels |
| **SC** | Free Spins, Progressive Jackpot |

- **Potential False Positives** (in GT, not in SC): `Persistence`, `Pick Bonus`, `Static Jackpot`, `Wild Reels`
- Confirmed by both: Free Spins, Progressive Jackpot

### 6. Blazin Bank Run
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/blazin-bank-run

| | Features |
|---|---------|
| **GT** | Cash On Reels, Free Spins, Hold and Spin, Multiplier, Pick Bonus, Static Jackpot |
| **SC** | Free Spins, Hold and Spin, Multiplier, Pick Bonus, Static Jackpot |

- **Potential False Positives** (in GT, not in SC): `Cash On Reels`
- Confirmed by both: Free Spins, Hold and Spin, Multiplier, Pick Bonus, Static Jackpot

### 7. Blazing Luck
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Blazing-Luck

| | Features |
|---|---------|
| **GT** | Free Spins, Hold and Spin, Static Jackpot |
| **SC** | Free Spins |

- **Potential False Positives** (in GT, not in SC): `Hold and Spin`, `Static Jackpot`
- Confirmed by both: Free Spins

### 8. Bonanza Blast
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Bonanza-Blast

| | Features |
|---|---------|
| **GT** | Expanding Reels, Free Spins, Pick Bonus, Static Jackpot |
| **SC** | Expanding Reels, Free Spins, Pick Bonus |

- **Potential False Positives** (in GT, not in SC): `Static Jackpot`
- Confirmed by both: Expanding Reels, Free Spins, Pick Bonus

### 9. Bonanza Blast UltraTap
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Bonanza-Blast

| | Features |
|---|---------|
| **GT** | Cash On Reels, Expanding Reels, Free Spins, Multiplier, Pick Bonus |
| **SC** | Expanding Reels, Free Spins, Pick Bonus |

- **Potential False Positives** (in GT, not in SC): `Cash On Reels`, `Multiplier`
- Confirmed by both: Expanding Reels, Free Spins, Pick Bonus

### 10. Capital Gains
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Capital-Gains

| | Features |
|---|---------|
| **GT** | Free Spins, Hold and Spin, Pick Bonus, Static Jackpot |
| **SC** | Free Spins, Hold and Spin, Pick Bonus |

- **Potential False Positives** (in GT, not in SC): `Static Jackpot`
- Confirmed by both: Free Spins, Hold and Spin, Pick Bonus

### 11. Capital Gains UltraTap
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Capital-Gains

| | Features |
|---|---------|
| **GT** | Free Spins, Pick Bonus |
| **SC** | Free Spins, Hold and Spin, Pick Bonus |

- **Potential False Negatives** (in SC, not in GT): `Hold and Spin`
- Confirmed by both: Free Spins, Pick Bonus

### 12. Capital Reels
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/capital-reels

| | Features |
|---|---------|
| **GT** | Cash On Reels, Multiplier, Static Jackpot |
| **SC** | Multiplier, Static Jackpot |

- **Potential False Positives** (in GT, not in SC): `Cash On Reels`
- Confirmed by both: Multiplier, Static Jackpot

### 13. Cash Cow
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Cash-Cow

| | Features |
|---|---------|
| **GT** | Cash On Reels, Expanding Reels, Free Spins, Pick Bonus, Static Jackpot |
| **SC** | Free Spins |

- **Potential False Positives** (in GT, not in SC): `Cash On Reels`, `Expanding Reels`, `Pick Bonus`, `Static Jackpot`
- Confirmed by both: Free Spins

### 14. Cash Eruption Slingo
**Provider**: Gaming Realms
**SC URL**: https://www.slotcatalog.com/en/slots/Cash-Eruption

| | Features |
|---|---------|
| **GT** | Cash On Reels, Free Spins, Hold and Spin, Multiplier, Pick Bonus, Respin, Static Jackpot |
| **SC** | Free Spins, Hold and Spin, Respin |

- **Potential False Positives** (in GT, not in SC): `Cash On Reels`, `Multiplier`, `Pick Bonus`, `Static Jackpot`
- Confirmed by both: Free Spins, Hold and Spin, Respin

### 15. Cash Zap UltraTap
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/cash-zap-ultratap

| | Features |
|---|---------|
| **GT** | Cash On Reels, Multiplier |
| **SC** | Multiplier |

- **Potential False Positives** (in GT, not in SC): `Cash On Reels`
- Confirmed by both: Multiplier

### 16. Crystal Magic
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Crystal-Magic

| | Features |
|---|---------|
| **GT** | Free Spins, Hold and Spin, Static Jackpot |
| **SC** | Free Spins, Hold and Spin |

- **Potential False Positives** (in GT, not in SC): `Static Jackpot`
- Confirmed by both: Free Spins, Hold and Spin

### 17. Diamond Cash Mighty Elephant Win Ways
**Provider**: Greentube
**SC URL**: https://www.slotcatalog.com/en/slots/diamond-cash-mighty-elephant-win-ways

| | Features |
|---|---------|
| **GT** | Cascading Reels, Expanding Reels, Free Spins, Hold and Spin, Multiplier, Persistence, Progressive Jackpot, Respin, Static Jackpot |
| **SC** | Cascading Reels, Expanding Reels, Free Spins, Hold and Spin, Multiplier, Persistence, Progressive Jackpot, Respin |

- **Potential False Positives** (in GT, not in SC): `Static Jackpot`
- Confirmed by both: Cascading Reels, Expanding Reels, Free Spins, Hold and Spin, Multiplier, Persistence, Progressive Jackpot, Respin

### 18. Diamond Nudge
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/diamond-nudge

| | Features |
|---|---------|
| **GT** | Multiplier, Nudges, Static Jackpot |
| **SC** | Multiplier, Static Jackpot |

- **Potential False Positives** (in GT, not in SC): `Nudges`
- Confirmed by both: Multiplier, Static Jackpot

### 19. Diamond Rush
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Diamond-Rush

| | Features |
|---|---------|
| **GT** | Cash On Reels, Expanding Reels, Free Spins, Multiplier, Stacked Symbols, Static Jackpot, Wild Reels |
| **SC** | Expanding Reels, Free Spins, Multiplier, Stacked Symbols |

- **Potential False Positives** (in GT, not in SC): `Cash On Reels`, `Static Jackpot`, `Wild Reels`
- Confirmed by both: Expanding Reels, Free Spins, Multiplier, Stacked Symbols

### 20. Divine Fortune Megaways
**Provider**: NetEnt
**SC URL**: https://www.slotcatalog.com/en/slots/Divine-Fortune-Megaways

| | Features |
|---|---------|
| **GT** | Expanding Reels, Expanding Wilds, Free Spins, Megaways, Multiplier, Respin, Static Jackpot |
| **SC** | Expanding Reels, Free Spins, Megaways, Respin |

- **Potential False Positives** (in GT, not in SC): `Expanding Wilds`, `Multiplier`, `Static Jackpot`
- Confirmed by both: Expanding Reels, Free Spins, Megaways, Respin

### 21. Dragon Blast
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Dragon-Blast

| | Features |
|---|---------|
| **GT** | Colossal Symbols, Expanding Reels, Free Spins, Pick Bonus, Static Jackpot |
| **SC** | Colossal Symbols, Free Spins |

- **Potential False Positives** (in GT, not in SC): `Expanding Reels`, `Pick Bonus`, `Static Jackpot`
- Confirmed by both: Colossal Symbols, Free Spins

### 22. Dragon Diamond
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Dragon-Diamond

| | Features |
|---|---------|
| **GT** | Free Spins, Multiplier, Static Jackpot |
| **SC** | Free Spins |

- **Potential False Positives** (in GT, not in SC): `Multiplier`, `Static Jackpot`
- Confirmed by both: Free Spins

### 23. Dragon Fa
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Dragon-Fa

| | Features |
|---|---------|
| **GT** | Free Spins, Pick Bonus, Progressive Jackpot, Static Jackpot |
| **SC** | Free Spins, Progressive Jackpot |

- **Potential False Positives** (in GT, not in SC): `Pick Bonus`, `Static Jackpot`
- Confirmed by both: Free Spins, Progressive Jackpot

### 24. Extra Chilli Megaways
**Provider**: Big Time Gaming
**SC URL**: https://www.slotcatalog.com/en/slots/Extra-Chilli

| | Features |
|---|---------|
| **GT** | Expanding Reels, Free Spins, Gamble Feature, Megaways, Multiplier, Wheel |
| **SC** | Free Spins, Gamble Feature, Megaways, Multiplier |

- **Potential False Positives** (in GT, not in SC): `Expanding Reels`, `Wheel`
- Confirmed by both: Free Spins, Gamble Feature, Megaways, Multiplier

### 25. Fire Wolf II
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Fire-Wolf-2

| | Features |
|---|---------|
| **GT** | Expanding Reels, Free Spins, Static Jackpot |
| **SC** | Free Spins, Static Jackpot |

- **Potential False Positives** (in GT, not in SC): `Expanding Reels`
- Confirmed by both: Free Spins, Static Jackpot

### 26. Fish Fest UltraTap
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/fish-fest-ultratap

| | Features |
|---|---------|
| **GT** | Multiplier, Pick Bonus |
| **SC** | Multiplier, Pick Bonus, Static Jackpot |

- **Potential False Negatives** (in SC, not in GT): `Static Jackpot`
- Confirmed by both: Multiplier, Pick Bonus

### 27. Flamenco Stacks
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Flamenco-Stacks

| | Features |
|---|---------|
| **GT** | Expanding Reels, Free Spins, Stacked Symbols, Static Jackpot |
| **SC** | Stacked Symbols |

- **Potential False Positives** (in GT, not in SC): `Expanding Reels`, `Free Spins`, `Static Jackpot`
- Confirmed by both: Stacked Symbols

### 28. Flaming Reels
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Flaming-Reels

| | Features |
|---|---------|
| **GT** | Cash On Reels, Gamble Feature, Stacked Symbols, Static Jackpot |
| **SC** | Gamble Feature, Stacked Symbols |

- **Potential False Positives** (in GT, not in SC): `Cash On Reels`, `Static Jackpot`
- Confirmed by both: Gamble Feature, Stacked Symbols

### 29. Forest Dragons
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Forest-Dragons

| | Features |
|---|---------|
| **GT** | Expanding Reels, Free Spins, Static Jackpot |
| **SC** | Free Spins, Static Jackpot |

- **Potential False Positives** (in GT, not in SC): `Expanding Reels`
- Confirmed by both: Free Spins, Static Jackpot

### 30. Goddess Treasures
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Goddess-Treasures

| | Features |
|---|---------|
| **GT** | Free Spins, Hold and Spin, Pick Bonus, Static Jackpot |
| **SC** | Free Spins |

- **Potential False Positives** (in GT, not in SC): `Hold and Spin`, `Pick Bonus`, `Static Jackpot`
- Confirmed by both: Free Spins

### 31. Gold Blitz Fortunes
**Provider**: Fortune Factory Studios
**SC URL**: https://www.slotcatalog.com/en/slots/gold-blitz-fortunes

| | Features |
|---|---------|
| **GT** | Buy Bonus, Cash On Reels, Free Spins, Hold and Spin, Multiplier, Persistence, Respin, Static Jackpot, Sticky Wilds, Wheel |
| **SC** | Buy Bonus, Free Spins, Multiplier, Persistence, Respin, Static Jackpot, Sticky Wilds, Wheel |

- **Potential False Positives** (in GT, not in SC): `Cash On Reels`, `Hold and Spin`
- Confirmed by both: Buy Bonus, Free Spins, Multiplier, Persistence, Respin, Static Jackpot, Sticky Wilds, Wheel

### 32. Gold Inferno
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Gold-Inferno

| | Features |
|---|---------|
| **GT** | Multiplier, Progressive Jackpot, Static Jackpot |
| **SC** | Multiplier, Progressive Jackpot |

- **Potential False Positives** (in GT, not in SC): `Static Jackpot`
- Confirmed by both: Multiplier, Progressive Jackpot

### 33. Gold Nudge
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/gold-nudge

| | Features |
|---|---------|
| **GT** | Multiplier, Nudges, Static Jackpot |
| **SC** | Multiplier, Static Jackpot |

- **Potential False Positives** (in GT, not in SC): `Nudges`
- Confirmed by both: Multiplier, Static Jackpot

### 34. Golden Blessings
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/golden-blessings

| | Features |
|---|---------|
| **GT** | Expanding Reels, Free Spins, Multiplier, Persistence, Pick Bonus, Static Jackpot |
| **SC** | Expanding Reels, Free Spins, Multiplier, Persistence, Static Jackpot |

- **Potential False Positives** (in GT, not in SC): `Pick Bonus`
- Confirmed by both: Expanding Reels, Free Spins, Multiplier, Persistence, Static Jackpot

### 35. Golden Money
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/golden-money

| | Features |
|---|---------|
| **GT** | Cash On Reels, Respin, Static Jackpot, Wheel |
| **SC** | Respin, Static Jackpot, Wheel |

- **Potential False Positives** (in GT, not in SC): `Cash On Reels`
- Confirmed by both: Respin, Static Jackpot, Wheel

### 36. Golden Nile
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Golden-Nile

| | Features |
|---|---------|
| **GT** | Cash On Reels, Free Spins, Multiplier, Static Jackpot |
| **SC** | Free Spins, Multiplier |

- **Potential False Positives** (in GT, not in SC): `Cash On Reels`, `Static Jackpot`
- Confirmed by both: Free Spins, Multiplier

### 37. Golden Ram
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Golden-Ram

| | Features |
|---|---------|
| **GT** | Free Spins, Hold and Spin, Pick Bonus, Respin, Static Jackpot |
| **SC** | Free Spins, Hold and Spin, Respin |

- **Potential False Positives** (in GT, not in SC): `Pick Bonus`, `Static Jackpot`
- Confirmed by both: Free Spins, Hold and Spin, Respin

### 38. Grand Diamond
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/grand-diamond

| | Features |
|---|---------|
| **GT** | Multiplier, Progressive Jackpot, Static Jackpot |
| **SC** | Multiplier, Progressive Jackpot |

- **Potential False Positives** (in GT, not in SC): `Static Jackpot`
- Confirmed by both: Multiplier, Progressive Jackpot

### 39. Grand Royale
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Grand-Royale

| | Features |
|---|---------|
| **GT** | Free Spins, Hold and Spin, Pick Bonus, Static Jackpot |
| **SC** | Free Spins, Pick Bonus |

- **Potential False Positives** (in GT, not in SC): `Hold and Spin`, `Static Jackpot`
- Confirmed by both: Free Spins, Pick Bonus

### 40. Hearts and Horns
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Hearts-and-Horns

| | Features |
|---|---------|
| **GT** | Free Spins, Hold and Spin, Static Jackpot |
| **SC** | Free Spins |

- **Potential False Positives** (in GT, not in SC): `Hold and Spin`, `Static Jackpot`
- Confirmed by both: Free Spins

### 41. Hypernova Megaways
**Provider**: Reel Play
**SC URL**: https://www.slotcatalog.com/en/slots/Hypernova-Megaways

| | Features |
|---|---------|
| **GT** | Cascading Reels, Cash On Reels, Expanding Reels, Hold and Spin, Megaways, Respin, Static Jackpot |
| **SC** | Cascading Reels, Expanding Reels, Hold and Spin, Megaways, Respin |

- **Potential False Positives** (in GT, not in SC): `Cash On Reels`, `Static Jackpot`
- Confirmed by both: Cascading Reels, Expanding Reels, Hold and Spin, Megaways, Respin

### 42. Kingdom of Horus
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/kingdom-of-horus

| | Features |
|---|---------|
| **GT** | Cash On Reels, Free Spins, Multiplier, Static Jackpot |
| **SC** | Free Spins, Multiplier, Static Jackpot |

- **Potential False Positives** (in GT, not in SC): `Cash On Reels`
- Confirmed by both: Free Spins, Multiplier, Static Jackpot

### 43. Liberty Diamond
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/liberty-diamond

| | Features |
|---|---------|
| **GT** | Multiplier, Static Jackpot, Wild Reels |
| **SC** | Multiplier |

- **Potential False Positives** (in GT, not in SC): `Static Jackpot`, `Wild Reels`
- Confirmed by both: Multiplier

### 44. Long Bao Bao
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/long-bao-bao

| | Features |
|---|---------|
| **GT** | Cash On Reels, Expanding Reels, Free Spins, Multiplier, Persistence, Static Jackpot |
| **SC** | Expanding Reels, Free Spins, Multiplier, Persistence, Static Jackpot |

- **Potential False Positives** (in GT, not in SC): `Cash On Reels`
- Confirmed by both: Expanding Reels, Free Spins, Multiplier, Persistence, Static Jackpot

### 45. Lucky Sky
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/lucky-sky

| | Features |
|---|---------|
| **GT** | Multiplier, Static Jackpot |
| **SC** | Multiplier |

- **Potential False Positives** (in GT, not in SC): `Static Jackpot`
- Confirmed by both: Multiplier

### 46. Mega Crown
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Mega-Crown

| | Features |
|---|---------|
| **GT** | Cash On Reels, Hold and Spin, Stacked Symbols, Static Jackpot |
| **SC** | Stacked Symbols |

- **Potential False Positives** (in GT, not in SC): `Cash On Reels`, `Hold and Spin`, `Static Jackpot`
- Confirmed by both: Stacked Symbols

### 47. Mega Diamond Wild Stacks
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/mega-diamond-wild-stacks

| | Features |
|---|---------|
| **GT** | Hold and Spin, Multiplier, Stacked Symbols, Static Jackpot |
| **SC** | Multiplier, Stacked Symbols, Static Jackpot |

- **Potential False Positives** (in GT, not in SC): `Hold and Spin`
- Confirmed by both: Multiplier, Stacked Symbols, Static Jackpot

### 48. Mermaid's Fortune
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Mermaids-Fortune

| | Features |
|---|---------|
| **GT** | Cash On Reels, Free Spins, Multiplier, Respin, Static Jackpot, Wild Reels |
| **SC** | Free Spins, Multiplier, Respin |

- **Potential False Positives** (in GT, not in SC): `Cash On Reels`, `Static Jackpot`, `Wild Reels`
- Confirmed by both: Free Spins, Multiplier, Respin

### 49. Mine Blast
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/mine-blast

| | Features |
|---|---------|
| **GT** | Free Spins, Multiplier, Persistence, Pick Bonus, Static Jackpot, Symbol Transformation, Wild Reels |
| **SC** | Free Spins, Multiplier, Pick Bonus, Static Jackpot, Symbol Transformation |

- **Potential False Positives** (in GT, not in SC): `Persistence`, `Wild Reels`
- Confirmed by both: Free Spins, Multiplier, Pick Bonus, Static Jackpot, Symbol Transformation

### 50. Money Link The Great Immortals
**Provider**: Lightning Box
**SC URL**: https://www.slotcatalog.com/en/slots/Money-Link-The-Great-Immortals

| | Features |
|---|---------|
| **GT** | Free Spins, Hold and Spin, Multiplier, Mystery Symbols, Respin, Static Jackpot |
| **SC** | Free Spins, Hold and Spin, Multiplier, Mystery Symbols, Respin |

- **Potential False Positives** (in GT, not in SC): `Static Jackpot`
- Confirmed by both: Free Spins, Hold and Spin, Multiplier, Mystery Symbols, Respin

### 51. Money Stacks
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/money-stacks

| | Features |
|---|---------|
| **GT** | Buy Bonus, Cash On Reels, Free Spins, Multiplier, Static Jackpot |
| **SC** | Buy Bonus, Free Spins, Multiplier, Static Jackpot |

- **Potential False Positives** (in GT, not in SC): `Cash On Reels`
- Confirmed by both: Buy Bonus, Free Spins, Multiplier, Static Jackpot

### 52. Panda Blessings
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Panda-Blessings

| | Features |
|---|---------|
| **GT** | Cash On Reels, Free Spins, Hold and Spin, Multiplier, Pick Bonus, Static Jackpot |
| **SC** | Free Spins, Hold and Spin, Multiplier |

- **Potential False Positives** (in GT, not in SC): `Cash On Reels`, `Pick Bonus`, `Static Jackpot`
- Confirmed by both: Free Spins, Hold and Spin, Multiplier

### 53. Pharaoh Sun
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Pharaoh-Sun

| | Features |
|---|---------|
| **GT** | Expanding Reels, Free Spins, Pick Bonus, Static Jackpot |
| **SC** | Expanding Reels, Free Spins |

- **Potential False Positives** (in GT, not in SC): `Pick Bonus`, `Static Jackpot`
- Confirmed by both: Expanding Reels, Free Spins

### 54. Phoenix Fa
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Phoenix-Fa

| | Features |
|---|---------|
| **GT** | Free Spins, Persistence, Pick Bonus, Static Jackpot |
| **SC** | Free Spins, Persistence |

- **Potential False Positives** (in GT, not in SC): `Pick Bonus`, `Static Jackpot`
- Confirmed by both: Free Spins, Persistence

### 55. Phoenix Xing
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Phoenix-Xing

| | Features |
|---|---------|
| **GT** | Free Spins, Hold and Spin, Multiplier, Pick Bonus, Static Jackpot |
| **SC** | Free Spins, Hold and Spin, Multiplier |

- **Potential False Positives** (in GT, not in SC): `Pick Bonus`, `Static Jackpot`
- Confirmed by both: Free Spins, Hold and Spin, Multiplier

### 56. Pirate Plunder
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Pirate-Plunder

| | Features |
|---|---------|
| **GT** | Expanding Reels, Free Spins, Multiplier, Pick Bonus, Progressive Jackpot, Static Jackpot |
| **SC** | Multiplier, Progressive Jackpot, Static Jackpot |

- **Potential False Positives** (in GT, not in SC): `Expanding Reels`, `Free Spins`, `Pick Bonus`
- Confirmed by both: Multiplier, Progressive Jackpot, Static Jackpot

### 57. Rainforest Riches
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Rainforest-Riches

| | Features |
|---|---------|
| **GT** | Cash On Reels, Expanding Reels, Free Spins, Multiplier, Pick Bonus, Static Jackpot |
| **SC** | Multiplier, Wheel |

- **Potential False Positives** (in GT, not in SC): `Cash On Reels`, `Expanding Reels`, `Free Spins`, `Pick Bonus`, `Static Jackpot`
- **Potential False Negatives** (in SC, not in GT): `Wheel`
- Confirmed by both: Multiplier

### 58. Rakin Bacon Odyssey
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/rakin-bacon-odyssey

| | Features |
|---|---------|
| **GT** | Expanding Reels, Free Spins, Multiplier, Persistence, Pick Bonus, Progressive Jackpot, Stacked Symbols, Static Jackpot |
| **SC** | Expanding Reels, Free Spins, Multiplier, Persistence, Pick Bonus, Progressive Jackpot, Stacked Symbols |

- **Potential False Positives** (in GT, not in SC): `Static Jackpot`
- Confirmed by both: Expanding Reels, Free Spins, Multiplier, Persistence, Pick Bonus, Progressive Jackpot, Stacked Symbols

### 59. Rakin Bacon Sahara
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/rakin-bacon-sahara

| | Features |
|---|---------|
| **GT** | Expanding Reels, Free Spins, Persistence, Pick Bonus, Progressive Jackpot, Static Jackpot |
| **SC** | Free Spins, Persistence, Pick Bonus, Progressive Jackpot |

- **Potential False Positives** (in GT, not in SC): `Expanding Reels`, `Static Jackpot`
- Confirmed by both: Free Spins, Persistence, Pick Bonus, Progressive Jackpot

### 60. Rakin' Bacon Jackpots Bonus Board
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/rakin-bacon-jackpots-bonus-board

| | Features |
|---|---------|
| **GT** | Multiplier, Pick Bonus, Static Jackpot |
| **SC** | Multiplier, Static Jackpot |

- **Potential False Positives** (in GT, not in SC): `Pick Bonus`
- Confirmed by both: Multiplier, Static Jackpot

### 61. Rakin' Bacon Jackpots Bonus Wheel
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/rakin-bacon-jackpots-bonus-wheel

| | Features |
|---|---------|
| **GT** | Cash On Reels, Pick Bonus, Static Jackpot, Wheel |
| **SC** | Multiplier, Static Jackpot |

- **Potential False Positives** (in GT, not in SC): `Cash On Reels`, `Pick Bonus`, `Wheel`
- **Potential False Negatives** (in SC, not in GT): `Multiplier`
- Confirmed by both: Static Jackpot

### 62. Red Silk
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Red-Silk

| | Features |
|---|---------|
| **GT** | Free Spins, Persistence, Pick Bonus, Static Jackpot, Sticky Wilds, Wild Reels |
| **SC** | Free Spins, Sticky Wilds |

- **Potential False Positives** (in GT, not in SC): `Persistence`, `Pick Bonus`, `Static Jackpot`, `Wild Reels`
- Confirmed by both: Free Spins, Sticky Wilds

### 63. Reign of Anubis
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/reign-of-anubis

| | Features |
|---|---------|
| **GT** | Cash On Reels, Free Spins, Multiplier, Static Jackpot |
| **SC** | Free Spins, Multiplier |

- **Potential False Positives** (in GT, not in SC): `Cash On Reels`, `Static Jackpot`
- Confirmed by both: Free Spins, Multiplier

### 64. Riches of the Nile
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Riches-of-the-Nile

| | Features |
|---|---------|
| **GT** | Cash On Reels, Free Spins, Persistence, Pick Bonus, Static Jackpot, Symbol Transformation, Wild Reels |
| **SC** | Free Spins, Persistence, Pick Bonus, Static Jackpot, Symbol Transformation |

- **Potential False Positives** (in GT, not in SC): `Cash On Reels`, `Wild Reels`
- Confirmed by both: Free Spins, Persistence, Pick Bonus, Static Jackpot, Symbol Transformation

### 65. Royal Reels
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Royal-Reels

| | Features |
|---|---------|
| **GT** | Cash On Reels, Multiplier, Pick Bonus, Static Jackpot |
| **SC** | Multiplier |

- **Potential False Positives** (in GT, not in SC): `Cash On Reels`, `Pick Bonus`, `Static Jackpot`
- Confirmed by both: Multiplier

### 66. Shamrock Fortunes
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/shamrock-fortunes

| | Features |
|---|---------|
| **GT** | Cash On Reels, Expanding Reels, Free Spins, Persistence, Static Jackpot |
| **SC** | Expanding Reels, Free Spins, Persistence, Static Jackpot |

- **Potential False Positives** (in GT, not in SC): `Cash On Reels`
- Confirmed by both: Expanding Reels, Free Spins, Persistence, Static Jackpot

### 67. Shou Hu Shen
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Shou-Hu-Shen

| | Features |
|---|---------|
| **GT** | Expanding Reels, Free Spins, Persistence, Pick Bonus, Static Jackpot, Wild Reels |
| **SC** | Expanding Reels, Free Spins, Persistence, Pick Bonus |

- **Potential False Positives** (in GT, not in SC): `Static Jackpot`, `Wild Reels`
- Confirmed by both: Expanding Reels, Free Spins, Persistence, Pick Bonus

### 68. Sizzlin' Stacks
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/sizzlin-stacks

| | Features |
|---|---------|
| **GT** | Free Spins, Multiplier, Persistence, Stacked Symbols, Static Jackpot, Wild Reels |
| **SC** | Multiplier, Persistence, Stacked Symbols |

- **Potential False Positives** (in GT, not in SC): `Free Spins`, `Static Jackpot`, `Wild Reels`
- Confirmed by both: Multiplier, Persistence, Stacked Symbols

### 69. Spin Bonanza
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/spin-bonanza

| | Features |
|---|---------|
| **GT** | Free Spins, Multiplier, Static Jackpot, Wheel |
| **SC** | Multiplier, Static Jackpot, Wheel |

- **Potential False Positives** (in GT, not in SC): `Free Spins`
- Confirmed by both: Multiplier, Static Jackpot, Wheel

### 70. Tiger Lord
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Tiger-Lord

| | Features |
|---|---------|
| **GT** | Free Spins, Hold and Spin, Pick Bonus, Static Jackpot |
| **SC** | Free Spins |

- **Potential False Positives** (in GT, not in SC): `Hold and Spin`, `Pick Bonus`, `Static Jackpot`
- Confirmed by both: Free Spins

### 71. Triple Gem Treasure
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/triple-gem-treasure

| | Features |
|---|---------|
| **GT** | Cash On Reels, Expanding Reels, Free Spins, Multiplier, Static Jackpot |
| **SC** | Free Spins, Multiplier, Static Jackpot |

- **Potential False Positives** (in GT, not in SC): `Cash On Reels`, `Expanding Reels`
- Confirmed by both: Free Spins, Multiplier, Static Jackpot

### 72. Triple Treasure
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Triple-Treasure

| | Features |
|---|---------|
| **GT** | Free Spins, Multiplier, Progressive Jackpot, Static Jackpot |
| **SC** | Free Spins, Progressive Jackpot, Wheel |

- **Potential False Positives** (in GT, not in SC): `Multiplier`, `Static Jackpot`
- **Potential False Negatives** (in SC, not in GT): `Wheel`
- Confirmed by both: Free Spins, Progressive Jackpot

### 73. Wolf Queen
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/Wolf-Queen

| | Features |
|---|---------|
| **GT** | Expanding Reels, Free Spins, Pick Bonus, Static Jackpot |
| **SC** | Expanding Reels, Free Spins |

- **Potential False Positives** (in GT, not in SC): `Pick Bonus`, `Static Jackpot`
- Confirmed by both: Expanding Reels, Free Spins

### 74. Zen Wins
**Provider**: 
**SC URL**: https://www.slotcatalog.com/en/slots/zen-wins

| | Features |
|---|---------|
| **GT** | Multiplier, Static Jackpot, Wild Reels |
| **SC** | Multiplier |

- **Potential False Positives** (in GT, not in SC): `Static Jackpot`, `Wild Reels`
- Confirmed by both: Multiplier

---

## SC-CONFIRMED: GT Matches SlotCatalog (23 games)

These entries will be auto-verified with `source: "slotcatalog"`. No action needed unless you spot an issue.

| # | Game | Provider | Features | SC URL |
|---|------|----------|----------|--------|
| 1 | 2x Spin Cycle |  | Free Spins, Multiplier, Static Jackpot, Wheel | https://www.slotcatalog.com/en/slots/2x-spin-cycle |
| 2 | Balloon Strike UltraTap |  | Free Spins, Multiplier | https://www.slotcatalog.com/en/slots/balloon-strike-ultratap |
| 3 | Buffalo Of Wealth | Play'n GO | Expanding Reels, Free Spins, Multiplier | https://www.slotcatalog.com/en/slots/buffalo-of-wealth |
| 4 | Cash Can UltraTap |  | Free Spins, Multiplier | https://www.slotcatalog.com/en/slots/cash-can-ultratap |
| 5 | Colossal Diamonds |  | Multiplier | https://www.slotcatalog.com/en/slots/colossal-diamonds |
| 6 | Crystal Treasure |  | Buy Bonus, Cascading Reels, Free Spins, Multiplier | https://www.slotcatalog.com/en/slots/crystal-treasure |
| 7 | Diamond Boost |  | Multiplier, Static Jackpot | https://www.slotcatalog.com/en/slots/diamond-boost |
| 8 | Diamond Rose |  | Multiplier, Static Jackpot | https://www.slotcatalog.com/en/slots/diamond-rose |
| 9 | Diamond Rush UltraTap |  | Free Spins, Multiplier | https://www.slotcatalog.com/en/slots/diamond-rush-ultratap |
| 10 | Double Shamrock |  | Multiplier, Static Jackpot | https://www.slotcatalog.com/en/slots/double-shamrock |
| 11 | Gold Inferno Wild Stacks |  | Multiplier, Static Jackpot | https://www.slotcatalog.com/en/slots/gold-inferno-wild-stacks |
| 12 | Golden Wins |  | Free Spins, Pick Bonus, Static Jackpot | https://www.slotcatalog.com/en/slots/Golden-Wins |
| 13 | Jade Wins |  | Free Spins, Pick Bonus, Progressive Jackpot, Static Jackpot | https://www.slotcatalog.com/en/slots/Jade-Wins |
| 14 | Longhorn Jackpots |  | Free Spins, Pick Bonus, Static Jackpot | https://www.slotcatalog.com/en/slots/Longhorn-Jackpots |
| 15 | Olympus Strikes UltraTap |  | Free Spins, Multiplier | https://www.slotcatalog.com/en/slots/olympus-strikes-ultratap |
| 16 | Platinum 8x8x8x |  | Multiplier, Static Jackpot | https://www.slotcatalog.com/en/slots/Platinum-8x8x8x |
| 17 | Rakin Bacon |  | Free Spins, Pick Bonus, Progressive Jackpot, Static Jackpot | https://www.slotcatalog.com/en/slots/Rakin-Bacon |
| 18 | Slingshot Blast UltraTap |  | Multiplier, Pick Bonus, Static Jackpot | https://www.slotcatalog.com/en/slots/slingshot-blast-ultratap |
| 19 | Straight Cash |  | Respin, Static Jackpot, Wheel | https://www.slotcatalog.com/en/slots/straight-cash |
| 20 | Straight Cash Triple Double Spin |  | Multiplier, Respin, Static Jackpot | https://www.slotcatalog.com/en/slots/straight-cash-triple-double-spin |
| 21 | Treasure Tower UltraTap |  | Free Spins, Multiplier, Pick Bonus, Static Jackpot | https://www.slotcatalog.com/en/slots/treasure-tower-ultratap |
| 22 | Triple Jelly |  | Multiplier, Static Jackpot | https://www.slotcatalog.com/en/slots/triple-jelly |
| 23 | Zodiac Spins |  | Free Spins, Multiplier, Pick Bonus | https://www.slotcatalog.com/en/slots/zodiac-spins |

---

## UNVERIFIABLE: No SlotCatalog Feature Data (36 games)

These games either don't exist on SlotCatalog or have no extracted features. They need manual verification if you want them in GT.

| # | Game | Provider | GT Features | Reason |
|---|------|----------|-------------|--------|
| 1 | 2x 3x Rush |  | Free Spins, Multiplier, Static Jackpot | Not found on SlotCatalog |
| 2 | BetMGM Fortune Vault |  | Free Spins, Hold and Spin, Pick Bonus, Static Jackpot | Not found on SlotCatalog |
| 3 | Breaking Bad Collect Em And Link | Playtech | Cash On Reels, Free Spins, Hold and Spin, Static Jackpot | Not found on SlotCatalog |
| 4 | Caesars Treasure Trio |  | Cash On Reels, Expanding Reels, Free Spins, Multiplier, Static Jackpot | Not found on SlotCatalog |
| 5 | Captain Riches |  | Free Spins, Persistence, Pick Bonus, Static Jackpot, Wild Reels | Found on SC but no features extracted ([link](https://www.slotcatalog.com/en/slots/Captain-Riches)) |
| 6 | Cash Cow Bonus Wheel |  | Static Jackpot, Wheel | Not found on SlotCatalog |
| 7 | Cash Cow Bounty Board |  | Multiplier, Static Jackpot | Not found on SlotCatalog |
| 8 | Cash Jolt Grand Palace |  | Cash On Reels, Free Spins, Static Jackpot | Not found on SlotCatalog |
| 9 | Clem's Gems |  | Cash On Reels, Free Spins, Multiplier, Static Jackpot | Not found on SlotCatalog |
| 10 | Cluck Cluck Cash |  | Cash On Reels, Free Spins, Hold and Spin, Multiplier, Persistence, Pick Bonus, Static Jackpot | Not found on SlotCatalog |
| 11 | Count Cashula's Castle of Riches |  | Free Spins, Hold and Spin, Multiplier, Pick Bonus, Static Jackpot | Not found on SlotCatalog |
| 12 | Crystal Diamond |  | Multiplier, Static Jackpot | Not found on SlotCatalog |
| 13 | Crystal Reels |  | Cash On Reels, Multiplier, Static Jackpot | Not found on SlotCatalog |
| 14 | Diamond Charge Hold And Win | Iron Dog Studio | Cash On Reels, Free Spins, Hold and Spin, Multiplier, Static Jackpot | Not found on SlotCatalog |
| 15 | Diamond Reels |  | Cash On Reels, Nudges, Static Jackpot | Not found on SlotCatalog |
| 16 | Dragon Tao |  | Free Spins, Hold and Spin, Pick Bonus, Static Jackpot | Not found on SlotCatalog |
| 17 | FanDuel Cash Haul |  | Cash On Reels, Free Spins, Hold and Spin, Pick Bonus, Static Jackpot | Not found on SlotCatalog |
| 18 | FanDuel Vegas |  | Multiplier, Static Jackpot | Not found on SlotCatalog |
| 19 | Fu Feng Bao Bao |  | Cash On Reels, Expanding Reels, Free Spins, Pick Bonus, Static Jackpot | Not found on SlotCatalog |
| 20 | Fu Long Bao Bao |  | Cash On Reels, Expanding Reels, Free Spins, Pick Bonus, Static Jackpot | Not found on SlotCatalog |
| 21 | Hard Rock Cash Lock |  | Free Spins, Hold and Spin, Pick Bonus, Respin, Static Jackpot | Not found on SlotCatalog |
| 22 | Jade Dragons |  | Free Spins, Hold and Spin, Static Jackpot | Not found on SlotCatalog |
| 23 | Liberty Nudge |  | Multiplier, Nudges, Static Jackpot | Not found on SlotCatalog |
| 24 | Luck and Luxury |  | Cash On Reels, Free Spins, Hold and Spin, Static Jackpot | Found on SC but no features extracted ([link](https://www.slotcatalog.com/en/slots/Luck-and-Luxury)) |
| 25 | Majestic Fury Megaways Jackpot Royale Express | White Hat Studios | Cash On Reels, Expanding Reels, Free Spins, Hold and Spin, Megaways, Multiplier, Static Jackpot, Wheel | Not found on SlotCatalog |
| 26 | Mega Diamond |  | Multiplier, Static Jackpot | Not found on SlotCatalog |
| 27 | Meow Meow Madness |  | Cash On Reels, Free Spins, Hold and Spin, Pick Bonus, Static Jackpot | Not found on SlotCatalog |
| 28 | RSI Blackjack Singledeck |  | (none) | Not found on SlotCatalog (no name match in SC report) |
| 29 | Rakin' Bacon Triple Oink San Shen Zhu |  | Cash On Reels, Expanding Reels, Free Spins, Hold and Spin, Static Jackpot | Not found on SlotCatalog |
| 30 | Rakin' Bacon Triple Oink Soda Fountain Fortunes |  | Cash On Reels, Expanding Reels, Free Spins, Static Jackpot | Not found on SlotCatalog |
| 31 | Raoul's Jewels |  | Cash On Reels, Free Spins, Static Jackpot | Not found on SlotCatalog |
| 32 | River Dragons |  | Cash On Reels, Expanding Reels, Free Spins, Static Jackpot | Not found on SlotCatalog |
| 33 | Scorchin' Peppers |  | Multiplier, Static Jackpot | Not found on SlotCatalog |
| 34 | Straight Fire Triple Double Spin |  | Multiplier, Nudges, Respin, Static Jackpot | Not found on SlotCatalog |
| 35 | Tiki Fortune |  | Cash On Reels, Free Spins, Persistence, Pick Bonus, Static Jackpot, Wild Reels | Found on SC but no features extracted ([link](https://www.slotcatalog.com/en/slots/Tiki-Fortune)) |
| 36 | Vegas Stacks |  | Expanding Reels, Free Spins, Static Jackpot, Wild Reels | Found on SC but no features extracted ([link](https://www.slotcatalog.com/en/slots/Vegas-Stacks)) |
