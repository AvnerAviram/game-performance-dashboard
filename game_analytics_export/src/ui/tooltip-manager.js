// Tooltip Manager - DISABLED in favor of pure CSS hover
// The CSS handles .info-icon:hover .filter-tooltip { display: block; }
import { log } from '../lib/env.js';

class TooltipManager {
    constructor() {
        log('⚠️ TooltipManager: Using CSS hover only');
    }
    
    init() {
        // Do nothing - CSS handles it
    }
    
    showTooltip() {}
    hideTooltip() {}
}

// Initialize but don't do anything
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.tooltipManager = new TooltipManager();
    });
} else {
    window.tooltipManager = new TooltipManager();
}

export default TooltipManager;
