# Dev Agent — Image-Based Name Generation for Game Name Generator

**From**: Atlas (orchestrator)
**Feature**: Upload a game screenshot/concept art to the dashboard's name generator, and get AI-generated name suggestions based on what Claude sees in the image
**Scope**: 3 files modified, 1 new test file, 0 new dependencies

---

## Overview

The dashboard has a **Game Name Generator** embedded as a tab inside the **Game Lab** page (`game-lab.html`, section `#lab-section-name-gen`). Currently it works two ways:

1. **Pattern-based** (free): Template + bigram + mashup strategies from 1,600+ real game names
2. **AI-powered** (requires access code): Sends theme/context to Claude Haiku for creative names

We're adding a third input: **image upload**. The user uploads a game screenshot, concept art, or mood board, and Claude Vision analyzes it to generate contextually relevant names. The image provides visual context that text alone can't capture — colors, art style, mood, characters, visual elements.

---

## CRITICAL — Read Before Coding

### 1. The name generator lives inside `game-lab.html`, NOT `name-generator.html`

The routing for `#name-generator` is:
```javascript
// router.js
case 'name-generator':
    await showPage('game-lab');
    window.switchLabTool('name-gen');
    return;
```
The `name-generator.html` file is effectively unused dead HTML. ALL name generator UI lives in `game-lab.html` inside `<div id="lab-section-name-gen">` (starts around line 343). The grid layout is `xl:grid-cols-5` (2-col input + 3-col results).

### 2. The AI code input already exists

In `game-lab.html` lines 444-467, there's already an "AI Generation Code" section with:
- `#ng-ai-code` — password input for the access code
- `#ng-ai-generate` — "AI Generate" button
- `#ng-ai-status` — status text element

The vision feature must reuse this SAME code input. DO NOT create a duplicate code input.

### 3. JSON body limit is 100KB globally

`server/server.cjs` line 62: `app.use(express.json({ limit: '100kb' }))`. A base64 image easily exceeds this. You MUST use a route-specific body parser with a higher limit (2MB) applied ONLY to the vision endpoint. Do NOT change the global limit.

### 4. `callClaude()` only supports text messages

The existing `callClaude(messages, maxTokens)` function (line 79 in `ai.cjs`) sends messages as plain text. Vision requires structured content blocks with `type: "image"`. Either create a `callClaudeVision()` helper or construct the API call directly for the vision endpoint.

### 5. Client-side image resizing is mandatory

Resize images in the browser before uploading:
- Max dimension: 800px (longest side)
- Output format: JPEG at 0.8 quality
- This keeps file size under ~150KB base64, Anthropic cost to ~850 tokens/image, and stays well within the 2MB route limit.

### 6. No new npm dependencies

The project does NOT have `multer` or `sharp`. Don't add them. Use JSON-base64 with a route-specific body parser. Use a `<canvas>` element for client-side resizing.

---

## Files to Modify

### File 1: `game_analytics_export/src/pages/game-lab.html`

The name generator input panel starts at the `<div id="lab-section-name-gen">` section. Add an image upload area BETWEEN the Theme selector (line ~363) and the Mechanics section (line ~365).

**UI Design:**
- Drag-and-drop zone with click-to-browse fallback
- Use a dashed border box matching the existing AI code section style
- Shows a thumbnail preview after upload with a small "x" remove button
- Accepted formats: JPEG, PNG, WebP
- Max file size label: "Max 2MB"
- Label: "Game Image (optional)" or similar
- When an image is uploaded, the theme selector becomes optional (Claude will detect theme)
- Add `id="ng-image-upload"` for the drop zone and `id="ng-image-preview"` for the preview area
- Match existing dark mode classes: `dark:bg-gray-700`, `dark:border-gray-600`, `dark:text-gray-400`, etc.
- Use consistent spacing (`mb-4`)

**Approximate HTML:**
```html
<!-- Image Upload (optional) -->
<label class="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1.5"
    >Game Image (optional)</label>
<div id="ng-image-upload" class="relative mb-4 p-4 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors cursor-pointer bg-gray-50 dark:bg-gray-700/50 text-center">
    <div id="ng-image-placeholder">
        <svg class="w-8 h-8 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        </svg>
        <p class="text-xs text-gray-500 dark:text-gray-400">Drop image here or click to browse</p>
        <p class="text-[10px] text-gray-400 dark:text-gray-500 mt-1">JPEG, PNG, WebP · Max 2MB</p>
    </div>
    <div id="ng-image-preview" class="hidden">
        <!-- JS will populate: thumbnail img + remove button -->
    </div>
    <input id="ng-image-file" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" />
</div>
```

### File 2: `game_analytics_export/src/features/name-generator.js`

Add image handling logic. The file is 1,192 lines. Key integration points:

**a) Module-level state (near top, after line 14):**
```javascript
let uploadedImageB64 = null;
let uploadedMediaType = null;
```

**b) Image upload handler — add inside `setupNameGenerator()` (after line 681):**
- Get `#ng-image-upload`, `#ng-image-file`, `#ng-image-preview`, `#ng-image-placeholder`
- Listen for click on the drop zone → trigger `#ng-image-file` click
- Listen for `change` on `#ng-image-file` → process the file
- Listen for `dragover`/`drop` on the drop zone → process the file
- Processing function: validate type/size, use `FileReader` + `<canvas>` to resize to max 800px, store base64 + mediaType in module vars, show thumbnail preview with remove button
- Remove button: clear the vars, swap preview/placeholder visibility

**c) Resize function:**
```javascript
function resizeImage(file, maxDim = 800) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                if (width > maxDim || height > maxDim) {
                    const ratio = Math.min(maxDim / width, maxDim / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                const b64 = dataUrl.split(',')[1];
                resolve({ b64, mediaType: 'image/jpeg', width, height });
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = reader.result;
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}
```

**d) Modify the generate flow:**

The existing "Generate Names" button (`#ng-generate`, line 769) does pattern-based generation. The existing "AI Generate" button (`#ng-ai-generate`, line 787) does text-based Claude generation.

When `#ng-ai-generate` is clicked AND `uploadedImageB64` is set:
- Call the vision endpoint instead of the text endpoint
- If no `uploadedImageB64`, fall through to the existing `generateWithClaude()` flow
- Theme becomes optional when an image is present

Add a new function:
```javascript
async function generateWithVision(style, features, keywords, code) {
    const patterns = analyzeNames();
    const data = await apiPost('/api/generate-names-vision', {
        imageB64: uploadedImageB64,
        mediaType: uploadedMediaType,
        style,
        features: [...features],
        keywords,
        code,
        useAI: true,
        totalGames: patterns.totalGames,
        avgWordCount: Math.round(patterns.avgWordCount * 10) / 10,
    });
    return data.names || [];
}
```

**e) Update the AI Generate click handler** (line 789):
- Before the existing theme check: if `uploadedImageB64` is set, skip the theme requirement
- If image + code present → call `generateWithVision()` instead of `generateWithClaude()`
- On success, call `renderResults(names, theme || 'Image', true)` — pass `'vision'` as the source flag

**f) Update `renderResults()` to show "Vision AI" badge:**
- Currently it shows "AI Generated" or "Pattern Based" badges (line 1014-1016)
- Add a third option: pass a `source` parameter. When `source === 'vision'`, show a distinct badge:
  ```html
  <span class="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 font-semibold">Vision AI</span>
  ```

**g) Update the Reset handler** (line 843):
- Clear `uploadedImageB64 = null; uploadedMediaType = null;`
- Swap preview/placeholder visibility back to placeholder

### File 3: `game_analytics_export/server/routes/ai.cjs`

Add a new endpoint: `POST /api/generate-names-vision`

**Top of file** — add `const express = require('express');` (the existing destructured `Router` import doesn't expose `express.json()`).

**New route — add BEFORE the `router.use('/api/generate-names', aiRateLimiter)` line (line 206):**

```javascript
const jsonLimit2mb = express.json({ limit: '2mb' });

router.post('/api/generate-names-vision', jsonLimit2mb, requireAuth, aiRateLimiter, async (req, res) => {
    const { imageB64, mediaType, keywords, code } = req.body;
    let { features, style, totalGames, avgWordCount } = req.body;

    // Validate image
    if (!imageB64 || typeof imageB64 !== 'string') {
        return res.status(400).json({ error: 'Image is required' });
    }
    const VALID_MEDIA = ['image/jpeg', 'image/png', 'image/webp'];
    if (!VALID_MEDIA.includes(mediaType)) {
        return res.status(400).json({ error: 'Invalid image format. Use JPEG, PNG, or WebP.' });
    }
    const estimatedBytes = imageB64.length * 0.75;
    if (estimatedBytes > 2 * 1024 * 1024) {
        return res.status(400).json({ error: 'Image too large. Max 2MB.' });
    }

    // Same security gates as generate-names
    if (!CLAUDE_API_KEY) return res.status(501).json({ error: 'Claude API key not configured.' });
    if (!AI_NAME_CODE) return res.status(501).json({ error: 'AI name generation not enabled.' });
    if (!checkCodeAttempts(req.session)) return res.status(429).json({ error: 'Too many invalid code attempts.' });
    if (!validateCode(code, req.session)) return res.status(403).json({ error: 'Invalid access code.' });
    if (!checkAndIncrementDailyCap()) return res.status(429).json({ error: 'Daily AI limit reached.' });

    // Sanitize
    style = ['modern', 'classic', 'playful', 'premium'].includes(style) ? style : 'modern';
    features = Array.isArray(features) ? features.map(String).slice(0, 20) : [];
    totalGames = typeof totalGames === 'number' && totalGames > 0 ? Math.min(totalGames, 10000) : 600;
    avgWordCount = typeof avgWordCount === 'number' && avgWordCount > 0 ? Math.min(avgWordCount, 10) : 3;

    const user = req.session.user?.username || 'unknown';
    console.log(`[AI-AUDIT] vision-name-gen | user=${user} | style=${style} | daily=${dailyAICalls}/${AI_DAILY_CAP}`);

    const prompt = `You are a creative slot game naming expert. Analyze this game screenshot or concept art image carefully.

Based on what you see — the theme, visual style, colors, characters, mood, and art elements — generate 10 unique, compelling slot game names.

Context: This is for a ${style}-style slot game. Average slot game name is ${avgWordCount} words.
${features.length ? `Game mechanics: ${features.join(', ')}` : ''}
${keywords ? `Additional keywords to consider: ${keywords}` : ''}

Rules:
1. Names should be 2-4 words long
2. Names must capture the visual mood and theme you see in the image
3. Match the "${style}" naming style
4. Names should be original and marketable
5. Include at least 2 names that reference specific visual elements you notice

Return ONLY a JSON array of 10 name strings. Example: ["Name One", "Name Two"]`;

    try {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': CLAUDE_API_KEY,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: HAIKU_MODEL,
                max_tokens: 400,
                messages: [{
                    role: 'user',
                    content: [
                        {
                            type: 'image',
                            source: { type: 'base64', media_type: mediaType, data: imageB64 },
                        },
                        { type: 'text', text: prompt },
                    ],
                }],
            }),
        });

        if (!resp.ok) {
            const err = await resp.text();
            console.error('Claude Vision API error:', resp.status, err);
            throw new Error('AI service error');
        }

        const data = await resp.json();
        const text = data.content?.[0]?.text || '';
        const names = validateNameResponse(text);

        if (names.length === 0) {
            return res.status(502).json({ error: 'AI could not generate names from this image. Try a different image.' });
        }

        res.json({ names, source: 'claude-vision' });
    } catch (e) {
        console.error('Claude Vision request failed:', e.message);
        res.status(502).json({ error: 'AI vision service unavailable' });
    }
});
```

**Important details:**
- Uses the SAME `HAIKU_MODEL`, `CLAUDE_API_KEY`, security gates, `validateNameResponse()`, and daily cap as the text endpoint
- `express.json({ limit: '2mb' })` is applied ONLY to this route, not globally
- Express 5.2.1 uses `express.json()` which requires the full `express` module — add `const express = require('express');` at the top of `ai.cjs`
- The `aiRateLimiter` middleware is applied inline on the route

---

## File 4 (NEW): `game_analytics_export/tests/unit/vision-name-gen.test.js`

Create a test file for the new feature. This project uses **Vitest** with `jsdom` environment and mocked `data.js`. Test files follow the pattern in `tests/unit/trademark-check.test.js` — re-implementing pure logic for unit testing since `ai.cjs` is CJS with side effects.

### Tests to include:

```javascript
/**
 * Tests for vision-based name generation.
 * Validates image validation, resize logic, and API integration.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';

// Re-implement the validation logic from ai.cjs
const VALID_MEDIA = ['image/jpeg', 'image/png', 'image/webp'];

function validateImageInput(imageB64, mediaType) {
    if (!imageB64 || typeof imageB64 !== 'string') return 'Image is required';
    if (!VALID_MEDIA.includes(mediaType)) return 'Invalid image format. Use JPEG, PNG, or WebP.';
    const estimatedBytes = imageB64.length * 0.75;
    if (estimatedBytes > 2 * 1024 * 1024) return 'Image too large. Max 2MB.';
    return null;
}

describe('Vision name generation — image validation', () => {
    it('should reject missing image', () => {
        expect(validateImageInput(null, 'image/jpeg')).toBe('Image is required');
        expect(validateImageInput('', 'image/jpeg')).toBe('Image is required');
        expect(validateImageInput(undefined, 'image/jpeg')).toBe('Image is required');
    });

    it('should reject non-string image', () => {
        expect(validateImageInput(123, 'image/jpeg')).toBe('Image is required');
        expect(validateImageInput({}, 'image/jpeg')).toBe('Image is required');
    });

    it('should reject invalid media types', () => {
        expect(validateImageInput('abc', 'image/gif')).toBe('Invalid image format. Use JPEG, PNG, or WebP.');
        expect(validateImageInput('abc', 'image/bmp')).toBe('Invalid image format. Use JPEG, PNG, or WebP.');
        expect(validateImageInput('abc', 'text/plain')).toBe('Invalid image format. Use JPEG, PNG, or WebP.');
        expect(validateImageInput('abc', '')).toBe('Invalid image format. Use JPEG, PNG, or WebP.');
    });

    it('should accept valid media types', () => {
        expect(validateImageInput('abc', 'image/jpeg')).toBeNull();
        expect(validateImageInput('abc', 'image/png')).toBeNull();
        expect(validateImageInput('abc', 'image/webp')).toBeNull();
    });

    it('should reject oversized images (>2MB estimated)', () => {
        const hugeB64 = 'A'.repeat(3 * 1024 * 1024); // ~2.25MB raw
        expect(validateImageInput(hugeB64, 'image/jpeg')).toBe('Image too large. Max 2MB.');
    });

    it('should accept images under 2MB', () => {
        const normalB64 = 'A'.repeat(100 * 1024); // ~75KB
        expect(validateImageInput(normalB64, 'image/jpeg')).toBeNull();
    });
});

describe('Vision name generation — response validation', () => {
    // Re-implement from ai.cjs
    function validateNameResponse(text) {
        try {
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (!jsonMatch) return [];
            const arr = JSON.parse(jsonMatch[0]);
            if (!Array.isArray(arr)) return [];
            return arr
                .filter(n => typeof n === 'string')
                .map(n => n.slice(0, 100).trim())
                .filter(n => n.length > 0)
                .slice(0, 10);
        } catch {
            return [];
        }
    }

    it('should parse valid JSON array from Claude response', () => {
        const text = '["Golden Dragon", "Crystal Palace", "Fire Storm"]';
        expect(validateNameResponse(text)).toEqual(['Golden Dragon', 'Crystal Palace', 'Fire Storm']);
    });

    it('should extract JSON from surrounding text', () => {
        const text = 'Here are names:\n["Golden Dragon", "Crystal Palace"]\nEnjoy!';
        expect(validateNameResponse(text)).toEqual(['Golden Dragon', 'Crystal Palace']);
    });

    it('should return empty array for invalid responses', () => {
        expect(validateNameResponse('')).toEqual([]);
        expect(validateNameResponse('no json here')).toEqual([]);
        expect(validateNameResponse('{"not": "array"}')).toEqual([]);
    });

    it('should truncate names longer than 100 chars', () => {
        const longName = 'A'.repeat(150);
        const text = `["${longName}"]`;
        const result = validateNameResponse(text);
        expect(result[0].length).toBe(100);
    });

    it('should limit to 10 names max', () => {
        const names = Array.from({ length: 15 }, (_, i) => `Name ${i}`);
        const result = validateNameResponse(JSON.stringify(names));
        expect(result.length).toBe(10);
    });

    it('should filter out non-string entries', () => {
        const text = '["Valid Name", 123, null, "Another Name", true]';
        expect(validateNameResponse(text)).toEqual(['Valid Name', 'Another Name']);
    });
});

describe('Vision name generation — input sanitization', () => {
    it('should clamp style to valid options', () => {
        const VALID_STYLES = ['modern', 'classic', 'playful', 'premium'];
        const sanitize = s => (VALID_STYLES.includes(s) ? s : 'modern');

        expect(sanitize('modern')).toBe('modern');
        expect(sanitize('classic')).toBe('classic');
        expect(sanitize('invalid')).toBe('modern');
        expect(sanitize('')).toBe('modern');
        expect(sanitize(undefined)).toBe('modern');
    });

    it('should clamp features array', () => {
        const sanitize = f => (Array.isArray(f) ? f.map(String).slice(0, 20) : []);

        expect(sanitize(['Free Spins', 'Megaways'])).toEqual(['Free Spins', 'Megaways']);
        expect(sanitize('not an array')).toEqual([]);
        expect(sanitize(null)).toEqual([]);
        expect(sanitize(Array.from({ length: 25 }, (_, i) => `feat${i}`)).length).toBe(20);
    });
});
```

---

## UI/UX Flow

1. User opens Game Lab → Name Generator tab
2. User drags an image (or clicks to browse) into the upload zone
3. Image is resized client-side and shown as thumbnail with remove button
4. User optionally selects theme, style, features, keywords (theme is optional when image is present)
5. User enters the AI code in the existing `#ng-ai-code` field
6. User clicks "AI Generate" → if image present + code valid → vision endpoint; if no image → existing text AI flow
7. Results render in the same `#ng-results` panel with a "Vision AI" badge
8. Pattern-based "Generate Names" button works unchanged (ignores image)

---

## Testing Checklist

After implementation, verify:

- [ ] Image drag-and-drop works in the upload zone
- [ ] Image click-to-browse works via hidden file input
- [ ] Large images (>800px) are resized to max 800px before base64 encoding
- [ ] Uploading without AI code shows existing behavior (code field blinks)
- [ ] Vision-generated names appear with "Vision AI" badge
- [ ] Remove/clear button removes the image and shows placeholder again
- [ ] Reset button (`#ng-reset`) clears the image too
- [ ] Existing pattern-based "Generate Names" button still works without image
- [ ] Existing "AI Generate" text-based flow still works without image
- [ ] Theme selector is optional when image is present
- [ ] Dark mode styling looks correct on the upload zone
- [ ] `npm test` passes — ALL existing tests + new `vision-name-gen.test.js`
- [ ] `npm run format` is clean (Prettier)
- [ ] Server rejects oversized images (>2MB) with 400 error
- [ ] Server rejects invalid media types with 400 error
- [ ] Server applies all security gates (auth, code, rate limit, daily cap, audit log)
- [ ] No change to global JSON body limit in `server.cjs`

---

## Non-Negotiable Rules

1. **The HTML changes go in `game-lab.html`** — NOT `name-generator.html`
2. **DO NOT increase the global JSON body limit** — only the vision endpoint gets 2MB
3. **DO NOT add new npm dependencies** — no multer, no sharp, nothing new
4. **Reuse ALL existing security gates** — auth, code validation, rate limit, daily cap, audit log
5. **Reuse the existing `#ng-ai-code` input** — do NOT create a duplicate AI code field
6. **Client-side resize is mandatory** — never send full-resolution images to the server
7. **Run `npm test` and `npm run format` before declaring done**
8. **Match existing UI styling** — same Tailwind classes, dark mode, border-radius, spacing used throughout `game-lab.html`
9. **Use `escapeHtml()` and `escapeAttr()`** from `../lib/sanitize.js` for any dynamic content in innerHTML
10. **Test file uses `@vitest-environment node`** for the server-side logic tests (see `trademark-check.test.js` as the pattern to follow)
11. **Express version is 5.2.1** (not 4) — verify API compatibility if unsure

---

## File Reference

| File | Purpose | Lines | Action |
|------|---------|-------|--------|
| `game_analytics_export/src/pages/game-lab.html` | Name gen UI (inside Game Lab) | ~508 | MODIFY — add image upload zone |
| `game_analytics_export/src/features/name-generator.js` | Frontend JS (patterns, AI, UI) | 1192 | MODIFY — add image handling + vision API |
| `game_analytics_export/server/routes/ai.cjs` | Backend API routes (Claude, security) | 428 | MODIFY — add vision endpoint |
| `game_analytics_export/tests/unit/vision-name-gen.test.js` | Unit tests for vision feature | NEW | CREATE — validation + response tests |
| `game_analytics_export/server/server.cjs` | Express setup (DO NOT modify body limit) | ~223 | READ ONLY |
| `game_analytics_export/src/lib/api-client.js` | `apiPost()` / `apiFetch()` helpers | 84 | READ ONLY |
| `game_analytics_export/src/lib/sanitize.js` | `escapeHtml()` / `escapeAttr()` | ~67 | READ ONLY — import in name-generator.js (already imported) |
| `game_analytics_export/tests/unit/trademark-check.test.js` | Example test pattern to follow | 333 | READ ONLY — reference for test structure |
| `game_analytics_export/vitest.config.js` | Test config (jsdom, forks, coverage) | 70 | READ ONLY |
| `game_analytics_export/src/pages/name-generator.html` | Dead HTML (DO NOT MODIFY) | 225 | DO NOT TOUCH |

## Architecture Notes

- **Model**: `claude-haiku-4-5-20241022` (already configured as `HAIKU_MODEL`, supports vision, very cheap — ~$0.0002/image at 800px)
- **API**: Raw `fetch()` to `https://api.anthropic.com/v1/messages` (no SDK on server)
- **Auth**: Session-based, `requireAuth` middleware
- **AI code**: Secret code validated via timing-safe comparison in `validateCode()`
- **Daily cap**: Shared counter `dailyAICalls` across all AI features (name gen + chat + vision)
- **Response validation**: `validateNameResponse()` (line 63 in `ai.cjs`) — reuse for vision responses too
- **Express version**: 5.2.1 — uses `express.json()` from the full express module
- **Test environment**: Vitest with jsdom (default), node for server-side logic tests
- **Formatting**: 4-space indent, single quotes, semicolons, 120-char width (Prettier config)
