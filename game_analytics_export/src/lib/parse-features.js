import { HIDDEN_FEATURES } from './shared-config.js';

/**
 * Feature parsing utility - shared across all modules.
 * Handles both array (runtime) and JSON string (DuckDB) formats.
 * Filters out HIDDEN_FEATURES (e.g. "Multiplier") automatically.
 */
export function parseFeatures(val) {
    let arr;
    if (Array.isArray(val)) {
        arr = val;
    } else if (!val) {
        return [];
    } else {
        const s = String(val).trim();
        if (!s || s === 'null') return [];
        try {
            const a = JSON.parse(s);
            arr = Array.isArray(a) ? a : [];
        } catch {
            return [];
        }
    }
    return arr.filter(f => !HIDDEN_FEATURES.has(f));
}
