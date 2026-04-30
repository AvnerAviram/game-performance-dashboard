# Atlas Handoff — Image-Based Name Generator (Vision Feature)

**Status**: Code works per Playwright e2e tests, but user reports they are "still obligated to choose a theme after uploading an image." Root cause identified below.

---

## Root Cause: UX Routing — Wrong Button

There are **two generate buttons** on the Name Generator panel:

1. **"Generate Names"** (`#ng-generate`) — Big purple primary CTA. Pattern-based, free. **Always requires a theme. Completely ignores uploaded images.**
2. **"AI Generate"** (`#ng-ai-generate`) — Small secondary button inside the "AI Generation Code" section at the bottom. **This one has the image bypass logic and calls the vision endpoint.**

The user is clicking the big "Generate Names" button after uploading an image. That button has no image awareness:

```javascript
// #ng-generate handler (line 901 of name-generator.js) — NO image check
generateBtn.addEventListener('click', async () => {
    const theme = themeSelect.value;
    if (!theme) {           // <-- always requires theme
        blinkField(themeSelect);
        return;
    }
    // ... pattern-based generation, image is ignored
});
```

The image-aware handler is ONLY on the AI button:

```javascript
// #ng-ai-generate handler (line 924) — HAS image check
aiBtn.addEventListener('click', async () => {
    const theme = themeSelect.value;
    const imgData = getUploadedImage();
    const hasImage = !!imgData;
    if (!theme && !hasImage) {   // <-- skips theme when image present
        blinkField(themeSelect);
        return;
    }
    // ... routes to vision endpoint when hasImage is true
});
```

### Fix Needed

When an image is uploaded, the "Generate Names" button should also route to vision (if AI code is present), OR the UX should make it impossible to miss the correct button (e.g., when image is uploaded, disable "Generate Names" and highlight "AI Generate", or merge the two buttons into one smart button).

**Simplest fix**: add image+code check at the top of the `#ng-generate` click handler:

```javascript
generateBtn.addEventListener('click', async () => {
    const theme = themeSelect.value;
    const imgData = getUploadedImage();
    const code = document.getElementById('ng-ai-code')?.value?.trim();

    // If user uploaded image + has AI code, route to vision
    if (imgData && code) {
        aiBtn.click();  // delegate to the AI Generate handler
        return;
    }

    if (!theme) {
        blinkField(themeSelect);
        return;
    }
    // ... rest of existing pattern flow unchanged
});
```

---

## What Was Implemented (all working, tested)

### Files Modified

| File | Action | Key Changes |
|------|--------|-------------|
| `src/pages/game-lab.html` | MODIFIED | Added `#ng-image-upload` drop zone (drag/drop + click-to-browse) between Theme selector and Mechanics. Includes `#ng-image-placeholder`, `#ng-image-preview`, hidden `#ng-image-file` input. Dark mode styled. |
| `src/features/name-generator.js` | MODIFIED | DOM-based image state (`el._imageB64` on `#ng-image-upload`), `resizeImage()` (canvas, max 800px, JPEG 0.8), `processImageFile()`, `showImagePreview()`, `clearImage()`, `generateWithVision()` calling `/api/generate-names-vision`, `renderResults()` with "Vision AI" violet badge, reset handler clears image. |
| `server/routes/ai.cjs` | MODIFIED | Added `const express = require('express')`, `POST /api/generate-names-vision` with `express.json({ limit: '2mb' })` route-specific (global 100KB untouched). Reuses all security gates (auth, code, brute-force, daily cap, audit). Direct Claude Vision API call. Uses existing `validateNameResponse()`. |
| `tests/unit/vision-name-gen.test.js` | NEW | 14 tests across 3 describe blocks (image validation, response parsing, input sanitization). `@vitest-environment node`. |

### Image State Management

Originally used module-level `let uploadedImageB64` — changed to DOM-based storage to avoid any Vite module-instance edge cases:

```javascript
// Stores image data directly on the DOM element (name-generator.js lines 17-33)
function getUploadedImage() {
    const el = document.getElementById('ng-image-upload');
    if (!el || !el._imageB64) return null;
    return { b64: el._imageB64, mediaType: el._mediaType };
}

function setUploadedImage(b64, mediaType) {
    const el = document.getElementById('ng-image-upload');
    if (el) {
        el._imageB64 = b64 || null;
        el._mediaType = mediaType || null;
    }
}
```

### Build Verification

Two `name-generator-*.js` chunks in dist (expected — one is dead HTML, one is JS module):

| Chunk | Size | Content | Has Vision Code |
|-------|------|---------|----------------|
| `name-generator-C-f4dphr.js` | 11KB | Raw HTML string from `name-generator.html?raw` import (dead page, never rendered) | No |
| `name-generator-DbpGchkw.js` | 33KB | Actual JS module with all name-gen logic | Yes (`_imageB64`, `generate-names-vision`, vision badge) |

`main-D4lcv0UD.js` correctly references `name-generator-DbpGchkw.js` for the `import('../features/name-generator.js')` in the router's `game-lab` case.

---

## Test Results

### Unit Tests (Vitest)
- **105 files, 1,602 tests — ALL PASS**
- Includes new `vision-name-gen.test.js` (14 tests)

### Prettier
- All 243 files unchanged (format clean)

### Linter
- 0 errors on modified files

### Playwright E2E (3/3 pass)

```
✓ image + code → vision API called, no theme needed
  - Uploads image via file input
  - Verifies `el._imageB64` is set on DOM
  - Clicks #ng-ai-generate (the AI button)
  - Asserts /api/generate-names-vision was called
  
✓ no image + no theme → theme blinks
  - Clicks #ng-ai-generate without image or theme
  - Theme select gets ring-2 class (blink)

✓ clear button resets image  
  - Uploads image, clicks remove, verifies _imageB64 is null
```

**Key**: Playwright tests use `#ng-ai-generate` (the AI button). They pass because that button has image bypass logic. The user is likely clicking `#ng-generate` (the pattern button), which has no image awareness.

---

## Constraints Verified

- [x] HTML changes in `game-lab.html`, NOT `name-generator.html`
- [x] Global JSON limit in `server.cjs` untouched (100KB)
- [x] Route-specific 2MB limit only on `/api/generate-names-vision`
- [x] No new npm dependencies
- [x] Reuses existing `#ng-ai-code` input (no duplicate)
- [x] Client-side resize (canvas, max 800px, JPEG 0.8)
- [x] All security gates reused (auth, code validation, brute-force, daily cap, audit)
- [x] `escapeHtml()`/`escapeAttr()` used for dynamic content
- [x] Test file uses `@vitest-environment node`
- [x] Express 5.2.1 compatible

---

## Server Endpoint

`POST /api/generate-names-vision` (ai.cjs lines 212-300):
- `express.json({ limit: '2mb' })` route-specific middleware
- Validates: imageB64 required + string, mediaType in [jpeg/png/webp], estimated size < 2MB
- Security: `requireAuth`, `aiRateLimiter`, `checkCodeAttempts`, `validateCode`, `checkAndIncrementDailyCap`
- Audit log: `[AI-AUDIT] vision-name-gen | user=X | style=Y | daily=N/CAP`
- Claude Vision API: structured content blocks (`type: "image"` + `type: "text"`)
- Model: `claude-haiku-4-5-20241022` (HAIKU_MODEL)
- Response: `validateNameResponse()` (same as text endpoint)
