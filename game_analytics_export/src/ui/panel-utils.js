/**
 * Shared panel utilities — used by ui-panels.js and panel-details.js.
 */

/**
 * Re-enable page scrolling and reset each panel's internal scroll to top.
 * Does NOT scroll the page itself — the user stays where they were.
 */
export function restorePageScroll(...panels) {
    document.body.style.overflow = '';
    panels.forEach(p => {
        if (p) p.scrollTop = 0;
    });
}
