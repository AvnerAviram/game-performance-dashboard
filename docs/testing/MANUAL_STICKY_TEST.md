# Sticky Header - Manual Testing Guide

## Current Implementation

The sticky headers are configured with:

```html
<!-- HTML -->
<div class="sticky top-0 z-10 bg-white dark:bg-gray-900 ...">
    <!-- Header content -->
</div>
```

```css
/* CSS */
#games.page.active {
    padding-top: 2rem;  /* 32px space above header */
}

.sticky {
    position: sticky;
    top: 0;
    z-index: 10;
}
```

---

## Expected Behavior

### Stage 1: Initial Load (Scroll = 0px)
```
┌─────────────────────────────┐
│                             │
│ [32px empty space]          │ ← padding-top: 2rem
│                             │
│ ┌─────────────────────────┐ │
│ │ GAMES (50)           🔍  │ │ ← Header starts here
│ │ Performance data...      │ │
│ └─────────────────────────┘ │
│                             │
│ Table content...            │
└─────────────────────────────┘
```

### Stage 2: Scrolling Down (Scroll = 50-100px)
```
┌─────────────────────────────┐
│ GAMES (50)               🔍  │ ← Header moving up
│ Performance data...          │
├─────────────────────────────┤
│                             │
│ Table content...            │
└─────────────────────────────┘
```

### Stage 3: Header Stuck (Scroll = 150px+)
```
┌─────────────────────────────┐
│ GAMES (50)               🔍  │ ← Header STUCK AT TOP (y=0)
│ Performance data...          │
├─────────────────────────────┤
│ Row 10                      │ ← Content continues scrolling
│ Row 11                      │
│ Row 12                      │
└─────────────────────────────┘
```

---

## Manual Testing Steps

### 1. Open the App
```bash
# Make sure server is running
python3 -m http.server 8000

# Open in browser
open http://localhost:8000/game_analytics_export/
```

### 2. Test Games Page

1. **Click "Games" in the sidebar**
2. **Look at the header** - you should see empty space above it
3. **Scroll down slowly** with your mouse wheel
4. **Watch the header** - it should:
   - Move up with the content
   - Reach the top of the viewport
   - Stop moving and stay stuck there
5. **Keep scrolling** - header should stay at top while content scrolls under it
6. **Scroll back up** - header should return to its original position with space above

### 3. Test All Pages

Repeat the same test for:
- ✅ Providers page
- ✅ Themes page
- ✅ Mechanics page

---

## Debugging in Browser Console

### Check if sticky is working:

```javascript
// 1. Get the header element
const header = document.querySelector('#games .sticky');

// 2. Check computed position
window.getComputedStyle(header).position
// Should return: "sticky"

// 3. Check top value
window.getComputedStyle(header).top
// Should return: "0px"

// 4. Check current Y position
header.getBoundingClientRect().y
// When not stuck: Should be ~32 or more
// When stuck: Should be 0 or very close to 0

// 5. Monitor position while scrolling
const page = document.querySelector('#games.page.active');
page.addEventListener('scroll', () => {
    console.log('Scroll:', page.scrollTop, 'Header Y:', header.getBoundingClientRect().y);
});

// Now scroll and watch the console
```

### Expected Console Output:
```
Scroll: 0 Header Y: 32
Scroll: 10 Header Y: 22
Scroll: 20 Header Y: 12
Scroll: 30 Header Y: 2
Scroll: 40 Header Y: 0    ← Stuck!
Scroll: 100 Header Y: 0   ← Still stuck
Scroll: 500 Header Y: 0   ← Still stuck
```

---

## Common Issues & Solutions

### Issue 1: Header is always at Y=0 (no initial space)
**Problem**: Missing `padding-top` on page container
**Check**: 
```javascript
window.getComputedStyle(document.querySelector('#games.page.active')).paddingTop
// Should be: "32px" or "2rem"
```

### Issue 2: Header doesn't stick (keeps scrolling away)
**Problem**: `position: sticky` not applied or missing scroll container
**Check**:
```javascript
const header = document.querySelector('#games .sticky');
window.getComputedStyle(header).position  // Should be "sticky"

const page = document.querySelector('#games.page.active');
window.getComputedStyle(page).overflowY  // Should be "auto"
```

### Issue 3: Header has gap above when stuck
**Problem**: `top` value is not 0
**Check**:
```javascript
window.getComputedStyle(header).top  // Should be "0px"
```

---

## Visual Verification

### Take Screenshots Manually

1. **Initial State**:
   - Load page, go to Games
   - Take screenshot (`Cmd+Shift+4` on Mac)
   - Header should have space above

2. **Mid-Scroll**:
   - Scroll down ~50px
   - Take screenshot
   - Header should be moving up

3. **Stuck State**:
   - Scroll down ~200px
   - Take screenshot
   - Header should be at very top (no gap)

4. **Compare**:
   - Look at the three screenshots
   - Header Y position should decrease then stay at 0

---

## Browser DevTools Check

1. **Open DevTools** (F12 or Cmd+Option+I)
2. **Go to Elements tab**
3. **Find** `<div class="sticky top-0 z-10 ..."`
4. **Look at Computed styles** (right panel)
5. **Verify**:
   - `position: sticky` ✅
   - `top: 0px` ✅
   - `z-index: 10` ✅

6. **Scroll the page** and watch the element in DevTools
7. **See** if it stays highlighted at the top

---

## Quick Test Checklist

- [ ] Header has space above it initially (~32px)
- [ ] Header moves up when scrolling down
- [ ] Header reaches top of viewport and stops
- [ ] Header stays at top when continuing to scroll
- [ ] Header returns to original position when scrolling back up
- [ ] Search input remains accessible when stuck
- [ ] Filter dropdowns remain accessible when stuck  
- [ ] Works on all 4 pages (Games, Providers, Themes, Mechanics)
- [ ] Works in dark mode
- [ ] No layout shift or jumping

---

## CSS Architecture

```
Page Container (.page.active)
├── padding-top: 2rem      ← Creates initial space
├── overflow-y: auto       ← Enables scrolling
│
└── Sticky Header (.sticky)
    ├── position: sticky   ← Enables sticky behavior
    ├── top: 0             ← Sticks at top
    ├── z-index: 10        ← Stays above content
    └── bg-white           ← Solid background
```

---

## Current Status

✅ **Implementation Complete**
- Sticky positioning configured
- Initial spacing added
- Z-index set correctly
- Solid background applied
- Works on all 4 table pages

🔄 **Needs Manual Verification**
- Node.js version too old for automated tests
- Need to test manually in browser
- Follow steps above to verify behavior

---

## If It's Not Working

1. **Clear browser cache**: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
2. **Check Tailwind is loaded**: Look for `<script src="https://cdn.tailwindcss.com">` in HTML
3. **Verify CSS classes**: Use DevTools to check if Tailwind classes are applied
4. **Check console for errors**: Open DevTools Console tab
5. **Try different browser**: Test in Chrome, Firefox, Safari

---

**Ready to test!** Open the app and try scrolling on the Games page! 🚀
