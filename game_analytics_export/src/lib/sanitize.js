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

export function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(ESCAPE_RE, ch => ESCAPE_MAP[ch]);
}

export function escapeAttr(str) {
  return escapeHtml(str);
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
