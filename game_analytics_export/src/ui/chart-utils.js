// Shared Chart.js utilities: color palettes, gradients, tooltips, grid config, label helpers

const modernColors = {
    gold: { start: '#fbbf24', end: '#f59e0b' },
    purple: { start: '#a855f7', end: '#e879f9' },
    cyan: { start: '#06b6d4', end: '#3b82f6' },
    emerald: { start: '#10b981', end: '#059669' },
    orange: { start: '#f97316', end: '#ef4444' },
    indigo: { start: '#6366f1', end: '#8b5cf6' },
    rose: { start: '#f43f5e', end: '#fb7185' },
    amber: { start: '#fbbf24', end: '#fb923c' },
};

export function createGradient(ctx, color, direction = 'vertical') {
    const gradient =
        direction === 'vertical' ? ctx.createLinearGradient(0, 0, 0, 400) : ctx.createLinearGradient(0, 0, 400, 0);

    gradient.addColorStop(0, color.start);
    gradient.addColorStop(1, color.end);
    return gradient;
}

export function generateModernColors(ctx, count) {
    const colorKeys = ['gold', 'purple', 'cyan', 'emerald', 'orange', 'indigo', 'rose', 'amber'];
    const result = [];

    for (let i = 0; i < count; i++) {
        const colorKey = colorKeys[i % colorKeys.length];
        result.push(createGradient(ctx, modernColors[colorKey]));
    }

    return result;
}

export function getChartColors() {
    const isDark = document.documentElement.classList.contains('dark');
    return {
        textColor: isDark ? '#e2e8f0' : '#1E293B',
        gridColor: isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)',
        backgroundColor: isDark ? 'transparent' : '#ffffff',
        tooltipBg: isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        tooltipBorder: isDark ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.2)',
    };
}

export function getModernTooltipConfig() {
    const colors = getChartColors();
    return {
        enabled: true,
        backgroundColor: colors.tooltipBg,
        titleColor: colors.textColor,
        bodyColor: colors.textColor,
        borderColor: colors.tooltipBorder,
        borderWidth: 1,
        padding: 12,
        titleFont: { size: 13, weight: 'bold' },
        bodyFont: { size: 12 },
        displayColors: true,
        boxWidth: 10,
        boxHeight: 10,
        cornerRadius: 6,
        caretSize: 5,
    };
}

export function stripParenthetical(label) {
    if (typeof label !== 'string') return label;
    return label.replace(/\s*\([^)]*\)\s*$/, '').trim() || label;
}

export function wrapLabel(str, maxLen) {
    if (!str || str.length <= maxLen) return str;
    const words = str.split(/[\s/]+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
        if (cur && (cur + ' ' + w).length > maxLen) {
            lines.push(cur);
            cur = w;
        } else {
            cur = cur ? cur + ' ' + w : w;
        }
    }
    if (cur) lines.push(cur);
    return lines.length > 4 ? [...lines.slice(0, 3), lines.slice(3).join(' ')] : lines;
}

export function getModernGridConfig() {
    const colors = getChartColors();
    return {
        color: colors.gridColor,
        lineWidth: 1,
        drawBorder: false,
        drawTicks: false,
    };
}

export { modernColors };
