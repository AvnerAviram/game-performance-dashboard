# Dev Agent — Fix AI Code Error Handling in Name Generator

**Priority**: Bug fix
**Estimated effort**: Small (2 files + 1 test file)
**Branch**: `fix/ai-code-error-handling`

---

## Problem

When a user enters an **incorrect AI access code** in the Name Generator and clicks "AI Generate":

1. The server correctly rejects the request with **403 + `{ error: 'Invalid access code.' }`**
2. The frontend catch block shows the error in small red text (`#ng-ai-status`)
3. **BUT it also renders 10 pattern-based fallback names** — making it look like the generation "worked"

The user sees results even though the code was wrong. The error message is easy to miss because the results grid dominates the UI.

---

## Root Cause

In `src/features/name-generator.js`, the catch block (line ~998) unconditionally renders fallback names for ALL errors — including auth errors (403) and brute-force lockout (429) that should NOT produce any results:

```javascript
} catch (e) {
    const msg = e.message || 'AI generation failed';
    if (statusEl) {
        statusEl.textContent = msg;
        statusEl.className = 'text-xs text-red-500 mt-1';
    }
    // BUG: always renders fallback names, even for auth failures
    const fallback = generatePatternNames(theme || 'Classic', selectedFeatures, selectedStyle, keywords, 10);
    renderResults(fallback, theme || 'Classic', 'pattern');
}
```

The `ApiError` class (in `src/lib/api-client.js`) already carries a `.status` field — it just isn't being checked.

---

## Files to Modify

| File | Lines | What to change |
|------|-------|----------------|
| `src/features/name-generator.js` | 1,380 | Fix catch block in AI Generate button handler (line ~998) |
| `src/lib/api-client.js` | 84 | No changes needed — `ApiError.status` already exists |
| `server/routes/ai.cjs` | 530 | No changes needed — server already returns correct status codes |
| `tests/unit/vision-name-gen.test.js` | 127 | Add tests for error handling behavior |

---

## Implementation

### 1. Fix the catch block in `name-generator.js` (line ~998)

The catch block inside the `aiBtn` click handler needs to distinguish between recoverable errors (502 service unavailable) and non-recoverable auth errors (403, 429).

**Import `ApiError`** at the top of the file (line 8 area, alongside existing imports):
```javascript
import { apiPost, apiFetch, ApiError } from '../lib/api-client.js';
```

Note: `ApiError` is already exported from `api-client.js` (line 6). Just add it to the existing destructured import on line 8.

**Replace the catch block** (lines ~998-1011) with logic that checks the error type:

```javascript
} catch (e) {
    const msg = e.message || 'AI generation failed';
    const isAuthError = e instanceof ApiError && (e.status === 403 || e.status === 429);
    if (statusEl) {
        statusEl.textContent = msg;
        statusEl.className = isAuthError
            ? 'text-sm font-medium text-red-500 mt-1'
            : 'text-xs text-red-500 mt-1';
    }
    if (isAuthError) {
        resultsDiv.innerHTML =
            '<div class="flex items-center justify-center h-[200px] text-red-400 text-sm">' +
            escapeHtml(msg) +
            '</div>';
    } else {
        const fallback = generatePatternNames(
            theme || 'Classic',
            selectedFeatures,
            selectedStyle,
            keywords,
            10
        );
        renderResults(fallback, theme || 'Classic', 'pattern');
    }
}
```

Key behaviors:
- **403 (invalid code) / 429 (too many attempts)**: Show prominent error in results area, NO fallback names
- **502 (AI service down) / other errors**: Show error text + fallback pattern names (existing behavior, appropriate for service outages)
- Auth error text is displayed larger and bolder (`text-sm font-medium` vs `text-xs`)
- The error message in the results div uses `escapeHtml()` (already imported at line 9)

### 2. Also fix the `else` branch (lines ~984-996)

The "empty names" path (when AI returns 0 names but no error) currently shows "AI unavailable" with fallback. This is fine and should NOT be changed — it's a different situation (the API responded successfully but with no usable names).

No changes needed here.

### 3. Export `ApiError` is already done

`api-client.js` already exports `ApiError` on line 6. No modification needed.

---

## Tests to Add

Add a new `describe` block in `tests/unit/vision-name-gen.test.js`:

```javascript
describe('Vision name generation — error handling', () => {
    // Mirror the ApiError class from api-client.js
    class ApiError extends Error {
        constructor(message, status, data = null) {
            super(message);
            this.name = 'ApiError';
            this.status = status;
            this.data = data;
        }
    }

    function isAuthError(e) {
        return e instanceof ApiError && (e.status === 403 || e.status === 429);
    }

    it('should identify 403 as auth error', () => {
        const err = new ApiError('Invalid access code.', 403);
        expect(isAuthError(err)).toBe(true);
    });

    it('should identify 429 as auth error', () => {
        const err = new ApiError('Too many invalid code attempts.', 429);
        expect(isAuthError(err)).toBe(true);
    });

    it('should NOT identify 502 as auth error', () => {
        const err = new ApiError('AI service unavailable', 502);
        expect(isAuthError(err)).toBe(false);
    });

    it('should NOT identify generic errors as auth error', () => {
        const err = new Error('Network failed');
        expect(isAuthError(err)).toBe(false);
    });

    it('should NOT identify 400 as auth error', () => {
        const err = new ApiError('Theme is required', 400);
        expect(isAuthError(err)).toBe(false);
    });
});
```

---

## Non-Negotiable Rules

1. **Run `npm test` before declaring done** — all 1,600+ tests must pass
2. **Run `npm run format`** — Prettier enforced (4-space indent, single quotes, semicolons)
3. **Do NOT modify `api-client.js`** — `ApiError` already works correctly
4. **Do NOT modify `server/routes/ai.cjs`** — server error responses are correct
5. **Do NOT modify `name-generator.html`** or `game-lab.html` — no HTML changes needed
6. **Use `escapeHtml()`** for any user-visible error text rendered as HTML (already imported in `name-generator.js` at line 9)
7. **Do NOT change the fallback behavior for 502 errors** — pattern-based fallback for service outages is intentional and correct

## DO NOT TOUCH

- `name-generator.html` (dead code, not used)
- `game-lab.html` (no changes needed)
- `server/routes/ai.cjs` (server is correct)
- `src/lib/api-client.js` (already exports ApiError correctly)
- Any data files
- `sw.js` or build scripts

## Verification Checklist

After implementation:
1. `npm test` — all tests pass
2. `npm run format:check` — clean
3. Manual test: enter wrong AI code → click "AI Generate" → should see error, NO fallback names
4. Manual test: enter correct AI code with Claude API key missing → should see error + fallback names (502 path)
5. Manual test: enter correct code with working API → should see AI-generated names
