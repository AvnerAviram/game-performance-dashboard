/**
 * Tooltip Manager — fixes two issues:
 *   1. Tooltips clipped by overflow containers (e.g. table with overflow-x-auto)
 *   2. Tooltips that overflow the viewport edge
 *
 * Strategy: CSS handles show/hide via :hover. This JS detects when the
 * tooltip overflows its container or viewport, and switches it to
 * position:fixed with computed coordinates.
 */
import { log } from '../lib/env.js';

function reposition(icon) {
    const tooltip = icon.querySelector('.filter-tooltip, .info-tooltip');
    if (!tooltip) return;

    const ir = icon.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const overflowParent = icon.closest('[class*="overflow-x"], [class*="overflow-auto"], [style*="overflow"]');

    const tw = 320;
    const predictedLeft = ir.left + ir.width / 2 - tw / 2;
    const predictedRight = predictedLeft + tw;
    const wouldClipViewport = predictedRight > vw - 8 || predictedLeft < 8;

    let wouldClipContainer = false;
    if (overflowParent) {
        const pr = overflowParent.getBoundingClientRect();
        wouldClipContainer = predictedRight > pr.right || predictedLeft < pr.left;
    }

    if (!wouldClipViewport && !wouldClipContainer) {
        tooltip.classList.remove('tooltip-fixed');
        tooltip.style.left = '';
        tooltip.style.top = '';
        return;
    }

    // Compute position BEFORE switching to fixed so there's no flash
    let left = ir.left + ir.width / 2 - tw / 2;
    if (left < 8) left = 8;
    if (left + tw > vw - 8) left = vw - tw - 8;

    let top = ir.bottom + 8;

    // Apply class AND position synchronously to avoid a frame with wrong coords
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.classList.add('tooltip-fixed');

    // After render, check if bottom is clipped and flip above if needed
    requestAnimationFrame(() => {
        const tooltipH = tooltip.offsetHeight || 200;
        if (top + tooltipH > vh - 8) {
            top = ir.top - tooltipH - 8;
            if (top < 8) top = 8;
            tooltip.style.top = `${top}px`;
        }
    });
}

function resetTooltip(icon) {
    const tooltip = icon.querySelector('.filter-tooltip, .info-tooltip');
    if (!tooltip) return;
    tooltip.classList.remove('tooltip-fixed');
    tooltip.style.left = '';
    tooltip.style.top = '';
}

function init() {
    document.addEventListener(
        'mouseover',
        e => {
            const icon = e.target.closest('.info-icon');
            if (!icon) return;
            reposition(icon);
        },
        true
    );

    document.addEventListener(
        'mouseout',
        e => {
            const icon = e.target.closest('.info-icon');
            if (!icon) return;
            if (!icon.contains(e.relatedTarget)) {
                resetTooltip(icon);
            }
        },
        true
    );

    log('Tooltip overflow detection active');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
