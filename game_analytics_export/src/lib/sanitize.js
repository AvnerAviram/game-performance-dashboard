/**
 * HTML/attribute escaping utilities to prevent XSS when interpolating
 * data into innerHTML or attribute values.
 */

const ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

const ESCAPE_RE = /[&<>"']/g;

// Strip ASCII control characters (except common whitespace) that can confuse parsers
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

export function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(CONTROL_RE, '')
        .replace(ESCAPE_RE, ch => ESCAPE_MAP[ch]);
}

export function escapeAttr(str) {
    return escapeHtml(str);
}

/**
 * Sanitize a URL — only allow http(s) and relative paths.
 * Returns empty string for dangerous schemes (javascript:, data:, etc.).
 */
export function sanitizeUrl(url) {
    if (url == null) return '';
    const trimmed = String(url).trim();
    if (/^(https?:\/\/|\/[^/])/i.test(trimmed)) return trimmed;
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return '';
    return trimmed;
}

/**
 * Sanitize HTML from AI/LLM responses — allow safe formatting tags only.
 * Strips scripts, event handlers, iframes, and dangerous attributes.
 */
const SAFE_TAGS = new Set([
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'ul',
    'ol',
    'li',
    'h1',
    'h2',
    'h3',
    'h4',
    'span',
    'div',
    'blockquote',
    'code',
    'pre',
    'hr',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
]);

export function sanitizeAIHtml(html) {
    if (html == null) return '';
    let s = String(html);
    s = s.replace(CONTROL_RE, '');
    s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
    s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
    s = s.replace(/<!--[\s\S]*?-->/g, '');
    s = s.replace(/<\s*(iframe|object|embed|form|input|button|link|meta|base)[^>]*>/gi, '');
    s = s.replace(/\s*on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');
    s = s.replace(/\s*href\s*=\s*["']?\s*javascript:[^"'>\s]*/gi, '');
    s = s.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (match, tag) => {
        if (SAFE_TAGS.has(tag.toLowerCase())) {
            return match.replace(/\s+(style|class)\s*=\s*("[^"]*"|'[^']*')/gi, '');
        }
        return '';
    });
    return s.trim();
}

/**
 * Wrap content with a data-xray attribute for X-Ray provenance inspection.
 * The content is NOT escaped here — caller must pre-escape it.
 */
export function xray(game, field, content) {
    return `<span data-xray='${escapeAttr(JSON.stringify({ game, field }))}'>${content}</span>`;
}

/**
 * Build a safe onclick handler string for use in HTML templates.
 * Escapes the value for both JS string context and HTML attribute context.
 */
export function safeOnclick(fn, ...args) {
    const escapedArgs = args.map(a => {
        const jsEscaped = String(a == null ? '' : a)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/"/g, '\\"')
            .replace(/</g, '\\x3c')
            .replace(/>/g, '\\x3e');
        return `'${jsEscaped}'`;
    });
    return `${fn}(${escapedArgs.join(',')})`;
}
