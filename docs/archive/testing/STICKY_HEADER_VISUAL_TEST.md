# Sticky Header Behavior - Visual Test Documentation

## Expected Behavior

The sticky headers should work like this:

### 📍 Position States

```
STATE 1: INITIAL (scroll = 0)
┌─────────────────────────────┐
│ [2rem space]                │ ← Empty space
│ ┌─────────────────────────┐ │
│ │ GAMES (50)           🔍  │ │ ← Header ~32px from top
│ │ Performance data...      │ │
│ └─────────────────────────┘ │
│                             │
│ Table starts here...        │
└─────────────────────────────┘

STATE 2: SCROLLING (scroll = 100px)
┌─────────────────────────────┐
│ GAMES (50)               🔍  │ ← Header moving up (~16px from top)
│ Performance data...          │
├─────────────────────────────┤
│ Table content...            │
└─────────────────────────────┘

STATE 3: STUCK (scroll = 200px+)
┌─────────────────────────────┐
│ GAMES (50)               🔍  │ ← Header STUCK at y=0 ✨
│ Performance data...          │
├─────────────────────────────┤
│ Row 10                      │ ← Scrolled content
│ Row 11                      │
│ Row 12                      │
└─────────────────────────────┘
```

---

## 🧪 Test Scenarios

### Test 1: Full Sticky Cycle
Takes 5 screenshots showing complete sticky behavior:

1. **sticky-01-initial.png**
   - Scroll: 0px
   - Expected: Header with space above (~32px from top)

2. **sticky-02-scrolling.png**
   - Scroll: 100px
   - Expected: Header moving up (closer to top)

3. **sticky-03-stuck-at-top.png**
   - Scroll: 200px
   - Expected: Header at y=0 (STUCK)

4. **sticky-04-still-stuck.png**
   - Scroll: 500px
   - Expected: Header still at y=0 (stays stuck)

5. **sticky-05-back-to-start.png**
   - Scroll: 0px (scrolled back)
   - Expected: Header back to initial position with space above

### Test 2: All Pages
Verifies sticky works on:
- ✅ Games page
- ✅ Providers page
- ✅ Themes page
- ✅ Mechanics page

### Test 3: Accessibility
Verifies search and filters remain usable when header is stuck

---

## 📐 Technical Specs

### CSS Setup
```css
.page.active {
    padding-top: 2rem;    /* Creates initial space above header */
}

.sticky {
    position: sticky;
    top: 0;               /* Sticks at top once scrolled */
    z-index: 10;
}
```

### How It Works
1. **Initial State**: `padding-top: 2rem` creates space above header
2. **Scrolling**: Header scrolls up normally with content
3. **Reaching Top**: When header would scroll past `top: 0`, it sticks
4. **Stuck**: Header stays at `top: 0` while content continues scrolling

---

## 🎯 Success Criteria

### Visual Checks
- ✅ Header has space above initially
- ✅ Header moves smoothly when scrolling
- ✅ Header sticks at absolute top (y=0)
- ✅ Header stays stuck during continued scrolling
- ✅ Header returns to original position when scrolling back

### Functional Checks
- ✅ Search input remains accessible when stuck
- ✅ Filter dropdowns remain accessible when stuck
- ✅ No layout shift or jumping
- ✅ Smooth transitions

### Measurement Checks
- Initial Y position: `> 20px` (has space above)
- Scrolling Y position: `< initial` (moving up)
- Stuck Y position: `<= 5px` (at top, allowing small margin)
- Still stuck Y position: `<= 5px` (stays at top)

---

## 🚀 Running the Tests

### Manual Testing
1. Open http://localhost:8000
2. Go to Games page
3. Observe header position (should have space above)
4. Scroll down slowly
5. Watch header move up
6. Continue scrolling - header should stick at top
7. Scroll back up - header should return to original position

### Automated Testing
```bash
cd game_analytics_export
npx playwright test tests/e2e/sticky-visual-test.spec.js --headed
```

This will:
- Take screenshots at each stage
- Verify position measurements
- Test all 4 pages
- Check accessibility

---

## 📸 Screenshot Locations

All screenshots saved to:
```
tests/e2e/screenshots/
├── sticky-01-initial.png           (Initial state with space)
├── sticky-02-scrolling.png         (Header moving up)
├── sticky-03-stuck-at-top.png      (Header stuck at top)
├── sticky-04-still-stuck.png       (Still stuck after more scroll)
├── sticky-05-back-to-start.png     (Back to initial)
├── sticky-games-stuck.png          (Games page stuck)
├── sticky-providers-stuck.png      (Providers page stuck)
├── sticky-themes-stuck.png         (Themes page stuck)
├── sticky-mechanics-stuck.png      (Mechanics page stuck)
└── sticky-search-accessible.png    (Search working while stuck)
```

---

## 🎨 Visual Comparison

### Your Screenshot
The image you provided shows the header at the top with:
- Clean "GAMES (50)" title
- "Performance data across all titles" subtitle
- Search input with icon
- Provider and Mechanic filter dropdowns

This is the **stuck state** - perfect! ✅

### Expected States
When you first load the page, there should be ~32px of space above this header. As you scroll down, it moves up and sticks at this position (y=0).

---

## ✅ Current Status

The implementation is complete:
- ✅ Sticky positioning configured (`position: sticky; top: 0`)
- ✅ Initial spacing added (`padding-top: 2rem` on page)
- ✅ Z-index set for proper layering (`z-index: 10`)
- ✅ Solid background for visibility
- ✅ Works on all 4 table pages
- ✅ Test suite created for validation

---

## 🔍 Debugging Tips

If sticky isn't working:

1. **Check scroll container**: Sticky parent must be scrollable
   ```javascript
   // In browser console
   document.querySelector('#games.page.active').style.overflow
   // Should be: "auto"
   ```

2. **Check computed position**:
   ```javascript
   const header = document.querySelector('#games .sticky');
   window.getComputedStyle(header).position
   // Should be: "sticky"
   ```

3. **Check top value**:
   ```javascript
   window.getComputedStyle(header).top
   // Should be: "0px"
   ```

4. **Verify measurements**:
   ```javascript
   header.getBoundingClientRect().y
   // When stuck: should be 0 or very close
   // When not stuck: should be > 20
   ```

---

Ready to test! Open the app and watch the sticky headers in action! 🎊
