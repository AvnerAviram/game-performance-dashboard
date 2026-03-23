// Environment / debug flag - works with or without Vite
export const DEBUG =
    (typeof import.meta !== 'undefined' && (import.meta.env?.DEV === true || import.meta.env?.VITE_DEBUG === 'true')) ||
    (typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.search.includes('debug=1')));

export function log(...args) {
    if (DEBUG) console.log(...args);
}

export function warn(...args) {
    if (DEBUG) console.warn(...args);
}
