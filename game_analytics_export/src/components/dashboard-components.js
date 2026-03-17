/**
 * ========================================
 * DASHBOARD COMPONENT LIBRARY
 * ========================================
 * Reusable components with Tailwind classes
 * NO inline styles - all styling via Tailwind
 * 
 * Usage: Import and use functions to generate HTML
 */
import { escapeHtml, safeOnclick } from '../lib/sanitize.js';
import { log } from '../lib/env.js';

// ==========================================
// PANEL SECTIONS
// ==========================================

/**
 * Creates a panel section with gradient header
 * @param {Object} options
 * @param {string} options.title - Section title (e.g., "Performance")
 * @param {string} options.icon - Emoji icon
 * @param {string} options.gradient - Full gradient class name
 * @param {string} options.content - HTML content for section body
 */
export const PanelSection = ({ title, icon, gradient, content }) => `
  <div class="mb-6 bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm border border-gray-200 dark:border-gray-700">
    <h4 class="px-5 py-4 font-bold text-sm uppercase tracking-wider ${gradient} border-b border-gray-200 dark:border-gray-600">
      ${icon} ${title}
    </h4>
    <div class="p-5">
      ${content}
    </div>
  </div>
`;

// ==========================================
// METRIC COMPONENTS
// ==========================================

/**
 * Creates a 2-column grid of metrics - LABEL:VALUE on same line
 * @param {Array<{label: string, value: string}>} metrics
 */
export const MetricGrid = (metrics) => `
  <div class="grid grid-cols-2 gap-x-8 gap-y-3">
    ${metrics.map(m => `
      <div class="flex items-baseline gap-2">
        <span class="text-sm font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">${m.label}:</span>
        <span class="text-base font-bold text-gray-900 dark:text-white">${m.value}</span>
      </div>
    `).join('')}
  </div>
`;

/**
 * Single metric display (horizontal)
 * @param {string} label
 * @param {string} value
 */
export const Metric = (label, value) => `
  <div class="flex items-center gap-2">
    <span class="text-sm font-semibold text-blue-600 dark:text-blue-400">${label}:</span>
    <span class="text-base font-medium text-gray-900 dark:text-white">${value}</span>
  </div>
`;

/**
 * Large metric card (for KPIs)
 * @param {Object} options
 */
export const MetricCard = ({ label, value, change, trend }) => `
  <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
    <div class="flex items-center justify-between mb-2">
      <span class="text-sm font-medium text-gray-600 dark:text-gray-400">${label}</span>
      ${change ? `<span class="text-${trend === 'up' ? 'green' : 'red'}-600 dark:text-${trend === 'up' ? 'green' : 'red'}-400 text-sm font-semibold">${change}%</span>` : ''}
    </div>
    <div class="text-3xl font-bold text-gray-900 dark:text-white">
      ${value}
    </div>
  </div>
`;

// ==========================================
// LIST COMPONENTS
// ==========================================

/**
 * Game list item for panels
 * @param {Object} game
 */
export const GameListItem = (game) => {
  // Safely extract values with fallbacks
  const provider = game.provider_studio || game.provider?.studio || game.provider || 'Unknown';
  const theoWin = game.performance_theo_win || game.performance?.theo_win || game.theoWin || 0;
  const gameName = game.name || game.game_name || 'Unknown Game';
  
  return `
  <li class="py-3 border-b border-gray-200 dark:border-gray-700 last:border-0">
    <div class="flex items-start justify-between gap-3">
      <div class="flex-1 min-w-0">
        <strong class="block text-gray-800 dark:text-gray-100 font-semibold mb-1 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                onclick="${safeOnclick('window.showGameDetails', gameName)}">${escapeHtml(gameName)}</strong>
        <div class="text-sm text-gray-600 dark:text-gray-400 space-x-2 mb-1">
          <span class="text-cyan-700 dark:text-cyan-400 font-medium">
            🎰 ${escapeHtml(provider)}
          </span>
          <span class="text-gray-400">•</span>
          <span class="text-amber-600 dark:text-amber-500 font-medium">💰 Theo Win:</span>
          <span class="text-gray-900 dark:text-white font-bold text-base">${typeof theoWin === 'number' ? theoWin.toFixed(2) : theoWin}</span>
        </div>
        ${game.extra ? `<div class="text-sm text-gray-500 dark:text-gray-400">${game.extra}</div>` : ''}
      </div>
    </div>
  </li>
`;
};

/**
 * Numbered list item (for rankings)
 * @param {number} index
 * @param {Object} item
 */
export const NumberedListItem = (index, item) => `
  <li class="flex items-start gap-3 py-3 border-b border-gray-200 dark:border-gray-700 last:border-0">
    <div class="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded text-xs font-semibold text-gray-600 dark:text-gray-300">
      ${index + 1}
    </div>
    <div class="flex-1">
      <strong class="block text-gray-900 dark:text-white font-semibold mb-1">${item.name}</strong>
      <small class="text-gray-600 dark:text-gray-400 text-sm">${item.details}</small>
    </div>
  </li>
`;

// ==========================================
// BADGE COMPONENTS
// ==========================================

/**
 * Volatility badge
 * @param {string} volatility - "Low", "Medium", "High", "Very High"
 */
export const VolatilityBadge = (volatility) => {
  const colorMap = {
    'Low': { bg: '#dcfce7', text: '#166534' },
    'Low-Medium': { bg: '#d9f99d', text: '#3f6212' },
    'Medium': { bg: '#fef9c3', text: '#854d0e' },
    'Medium-High': { bg: '#fed7aa', text: '#9a3412' },
    'High': { bg: '#ffedd5', text: '#9a3412' },
    'Very High': { bg: '#fecaca', text: '#991b1b' },
  };
  const normalized = volatility
    ? volatility.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('-')
    : 'Unknown';
  const c = colorMap[normalized] || colorMap['Medium'];
  
  return `
    <span style="display:inline-flex;align-items:center;padding:2px 10px;border-radius:9999px;font-size:0.75rem;font-weight:600;white-space:nowrap;background:${c.bg};color:${c.text}">
      ${normalized}
    </span>
  `;
};

/**
 * Anomaly badge - inline, no whitespace, SHORTER TEXT
 * @param {string} type - "high" or "low"
 */
export const AnomalyBadge = (type) => {
  const config = {
    high: { text: '⬆ High', class: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' },
    low: { text: '⬇ Low', class: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' },
  };
  
  const { text, class: colorClass } = config[type] || config.high;
  
  // Return inline with NO newlines or spaces before/after
  return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorClass} whitespace-nowrap ml-2">${text}</span>`;
};

/**
 * Generic badge
 * @param {string} text
 * @param {string} color - Tailwind color name (e.g., "blue", "green")
 */
export const Badge = (text, color = 'blue') => `
  <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-${color}-100 text-${color}-800 dark:bg-${color}-900 dark:text-${color}-300">
    ${text}
  </span>
`;

// ==========================================
// UTILITY COMPONENTS
// ==========================================

/**
 * Empty state message
 * @param {string} message
 */
export const EmptyState = (message) => `
  <div class="text-center py-12">
    <p class="text-gray-500 dark:text-gray-400 text-sm">${message}</p>
  </div>
`;

/**
 * Loading spinner
 */
export const Loading = () => `
  <div class="flex items-center justify-center py-12">
    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400"></div>
  </div>
`;

/**
 * Info box
 * @param {string} text
 * @param {string} type - "info", "success", "warning", "error"
 */
export const InfoBox = (text, type = 'info') => {
  const colors = {
    info: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300',
    success: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-300',
    error: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300',
  };
  
  return `
    <div class="p-4 rounded-lg border ${colors[type]} text-sm">
      ${text}
    </div>
  `;
};

// ==========================================
// GRADIENT PRESETS FOR SECTIONS - Subtle Color Coding
// ==========================================

export const GRADIENTS = {
  performance: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-900 dark:text-indigo-100',    // Performance - indigo
  specs: 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100',                  // Specs - blue
  category: 'bg-violet-100 dark:bg-violet-900/30 text-violet-900 dark:text-violet-100',       // Theme/Mechanic - violet
  provider: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-900 dark:text-cyan-100',               // Provider - cyan
  release: 'bg-slate-100 dark:bg-slate-800/30 text-slate-900 dark:text-slate-100',            // Release - slate
  similar: 'bg-purple-100 dark:bg-purple-900/30 text-purple-900 dark:text-purple-100',        // Similar - purple
  stats: 'bg-sky-100 dark:bg-sky-900/30 text-sky-900 dark:text-sky-100',                      // Stats - sky blue
};

// ==========================================
// TABLE COMPONENTS
// ==========================================

/**
 * Page header with title and actions
 * @param {Object} options
 */
export const PageHeader = ({ title, subtitle, count, children }) => `
  <div class="flex justify-between items-center mb-6">
    <div>
      <h2 class="text-2xl font-bold text-gray-900 dark:text-white m-0">
        ${title} ${count !== undefined ? `<span class="text-gray-500 dark:text-gray-400">(${count} total)</span>` : ''}
      </h2>
      ${subtitle ? `<p class="text-gray-600 dark:text-gray-400 text-sm mt-1">${subtitle}</p>` : ''}
    </div>
    ${children ? `<div class="flex gap-3 items-center">${children}</div>` : ''}
  </div>
`;

/**
 * Search input
 * @param {string} id
 * @param {string} placeholder
 */
export const SearchInput = (id, placeholder = '🔍 Search...') => `
  <input 
    type="text" 
    id="${id}" 
    class="px-4 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none transition-colors w-48"
    placeholder="${placeholder}"
  />
`;

/**
 * Select dropdown
 * @param {string} id
 * @param {Array<{value: string, label: string}>} options
 * @param {string} defaultLabel
 */
export const SelectDropdown = (id, options, defaultLabel = 'All') => `
  <select 
    id="${id}" 
    class="px-4 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none transition-colors">
    <option value="">${defaultLabel}</option>
    ${options.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('')}
  </select>
`;

log('✅ Dashboard component library loaded');
