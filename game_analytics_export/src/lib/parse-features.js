/**
 * Feature parsing utility - shared across all modules.
 * Handles both array (runtime) and JSON string (DuckDB) formats.
 */
export function parseFeatures(val) {
    if (Array.isArray(val)) return val;
    if (!val) return [];
    const s = String(val).trim();
    if (!s || s === 'null') return [];
    try { const a = JSON.parse(s); return Array.isArray(a) ? a : []; }
    catch { return []; /* malformed JSON — treat as no features */ }
}
