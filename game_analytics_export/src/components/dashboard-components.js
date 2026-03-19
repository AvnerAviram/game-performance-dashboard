/**
 * ========================================
 * DASHBOARD COMPONENT LIBRARY
 * ========================================
 * Reusable components with Tailwind classes
 * NO inline styles - all styling via Tailwind
 * 
 * Usage: Import and use functions to generate HTML
 */
import { escapeHtml, escapeAttr, safeOnclick } from '../lib/sanitize.js';
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
export const PanelSection = ({ title, icon, gradient: _gradient, content, accent }) => {
  const accentColor = accent || 'border-indigo-400 dark:border-indigo-500';
  return `
  <div class="mb-4 bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700/50">
    <div class="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700/50">
      <div class="w-1 h-5 rounded-full ${accentColor.replace('border-', 'bg-')}"></div>
      <span class="text-sm">${icon}</span>
      <h4 class="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-200 m-0">${title}</h4>
    </div>
    <div class="px-4 py-3">
      ${content}
    </div>
  </div>
`;
};

// ==========================================
// METRIC COMPONENTS
// ==========================================

/**
 * Creates a 2-column grid of metrics - LABEL:VALUE on same line
 * @param {Array<{label: string, value: string}>} metrics
 */
export const MetricGrid = (metrics) => `
  <div class="grid grid-cols-2 gap-x-6 gap-y-2">
    ${metrics.map(m => `
      <div class="flex flex-col">
        <span class="text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500 leading-none mb-1">${m.label}</span>
        <span class="text-sm font-bold text-gray-900 dark:text-white leading-tight">${m.value}</span>
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
export const GameListItem = (game, index) => {
  const provider = game.provider_studio || game.provider?.studio || game.provider || 'Unknown';
  const theoWin = game.performance_theo_win || game.performance?.theo_win || game.theoWin || 0;
  const gameName = game.name || game.game_name || 'Unknown Game';
  const theoVal = typeof theoWin === 'number' ? theoWin.toFixed(1) : theoWin;
  const rankBadge = typeof index === 'number' ? `<span class="flex-shrink-0 w-5 h-5 rounded-full ${index < 3 ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'} flex items-center justify-center text-[10px] font-bold">${index + 1}</span>` : '';
  
  return `
  <div class="flex items-center gap-2.5 py-2 border-b border-gray-100 dark:border-gray-700/50 last:border-0 group">
    ${rankBadge}
    <div class="flex-1 min-w-0">
      <div class="text-[13px] font-semibold text-gray-800 dark:text-gray-100 truncate cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
           onclick="${safeOnclick('window.showGameDetails', gameName)}">${escapeHtml(gameName)}</div>
      <div class="flex items-center gap-1.5 mt-0.5">
        <span class="text-[10px] text-gray-400 dark:text-gray-500 truncate">${escapeHtml(provider)}</span>
        ${game.extra ? `<span class="text-[10px] text-gray-400">·</span><span class="text-[10px] text-gray-400 truncate">${escapeHtml(game.extra)}</span>` : ''}
      </div>
    </div>
    <div class="flex-shrink-0 text-right">
      <span class="text-sm font-bold text-gray-900 dark:text-white">${theoVal}</span>
      <span class="text-[9px] text-gray-400 block leading-none">theo</span>
    </div>
  </div>
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
      <strong class="block text-gray-900 dark:text-white font-semibold mb-1">${escapeHtml(item.name)}</strong>
      <small class="text-gray-600 dark:text-gray-400 text-sm">${escapeHtml(item.details)}</small>
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
    'Low': 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:ring-emerald-800',
    'Low-Medium': 'bg-lime-50 text-lime-700 ring-lime-200 dark:bg-lime-900/20 dark:text-lime-300 dark:ring-lime-800',
    'Medium': 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:ring-amber-800',
    'Medium-High': 'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:ring-orange-800',
    'High': 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-900/20 dark:text-red-300 dark:ring-red-800',
    'Very High': 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:ring-rose-800',
  };
  const normalized = volatility
    ? volatility.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('-')
    : 'Unknown';
  const cls = colorMap[normalized] || colorMap['Medium'];
  return `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ring-1 ring-inset whitespace-nowrap ${cls}">${escapeHtml(normalized)}</span>`;
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
    ${escapeHtml(text)}
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
    <p class="text-gray-500 dark:text-gray-400 text-sm">${escapeHtml(message)}</p>
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
  performance: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-900 dark:text-indigo-100',
  specs: 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100',
  category: 'bg-violet-100 dark:bg-violet-900/30 text-violet-900 dark:text-violet-100',
  provider: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-900 dark:text-cyan-100',
  release: 'bg-slate-100 dark:bg-slate-800/30 text-slate-900 dark:text-slate-100',
  similar: 'bg-purple-100 dark:bg-purple-900/30 text-purple-900 dark:text-purple-100',
  stats: 'bg-sky-100 dark:bg-sky-900/30 text-sky-900 dark:text-sky-100',
};

export const ACCENTS = {
  performance: 'bg-indigo-400 dark:bg-indigo-500',
  specs: 'bg-blue-400 dark:bg-blue-500',
  category: 'bg-violet-400 dark:bg-violet-500',
  provider: 'bg-cyan-400 dark:bg-cyan-500',
  release: 'bg-slate-400 dark:bg-slate-500',
  similar: 'bg-purple-400 dark:bg-purple-500',
  stats: 'bg-sky-400 dark:bg-sky-500',
  feedback: 'bg-gray-400 dark:bg-gray-500',
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
    id="${escapeAttr(id)}" 
    class="px-4 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none transition-colors w-48"
    placeholder="${escapeAttr(placeholder)}"
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
    ${options.map(opt => `<option value="${escapeAttr(opt.value)}">${escapeHtml(opt.label)}</option>`).join('')}
  </select>
`;

log('✅ Dashboard component library loaded');
