/**
 * Page Builder Utilities
 * Factory functions for creating consistent page structures
 */

import { COMPONENTS } from '../components-config.js';

/**
 * Build a simple page structure (no sticky header)
 * @param {string} id - Page ID
 * @param {string} title - Page title
 * @param {string} subtitle - Page subtitle
 * @param {string} content - HTML content for the page body
 * @returns {string} Complete page HTML
 */
export function buildSimplePage(id, title, subtitle, content = '') {
  return `
    <div id="${id}" class="${COMPONENTS.pageContainer}">
      <div class="${COMPONENTS.pageHeaderSimple}">
        <h2 class="${COMPONENTS.pageTitleSimple}">${title}</h2>
        <p class="${COMPONENTS.pageSubtitleSimple}">${subtitle}</p>
      </div>
      ${content}
    </div>
  `.trim();
}

/**
 * Build a sticky header page structure (for pages with filters/tabs)
 * @param {string} id - Page ID
 * @param {string} title - Page title
 * @param {string} subtitle - Page subtitle
 * @param {string} headerActions - HTML for header action buttons/controls
 * @param {string} content - HTML content for the page body
 * @returns {string} Complete page HTML
 */
export function buildStickyPage(id, title, subtitle, headerActions = '', content = '') {
  return `
    <div id="${id}" class="${COMPONENTS.pageContainer}">
      <div class="${COMPONENTS.stickyHeader}">
        <div class="${COMPONENTS.stickyHeaderContent}">
          <div>
            <h2 class="${COMPONENTS.stickyHeaderTitle}">${title}</h2>
            <p class="${COMPONENTS.stickyHeaderSubtitle}">${subtitle}</p>
          </div>
          ${headerActions ? `<div class="flex items-center gap-3">${headerActions}</div>` : ''}
        </div>
      </div>
      ${content}
    </div>
  `.trim();
}

/**
 * Build a card component
 * @param {string} title - Card title
 * @param {string} content - Card content HTML
 * @param {string} additionalClasses - Additional CSS classes
 * @returns {string} Card HTML
 */
export function buildCard(title, content, additionalClasses = '') {
  return `
    <div class="${COMPONENTS.card} ${additionalClasses}">
      ${title ? `<h3 class="${COMPONENTS.cardHeader}">${title}</h3>` : ''}
      ${content}
    </div>
  `.trim();
}

/**
 * Build a metric card (for overview dashboard)
 * @param {string} label - Metric label
 * @param {string} value - Metric value
 * @param {string} change - Change indicator (optional)
 * @param {string} changeType - 'positive', 'negative', or '' (optional)
 * @returns {string} Metric card HTML
 */
export function buildMetricCard(label, value, change = '', changeType = '') {
  return `
    <div class="${COMPONENTS.metricCard}">
      <p class="${COMPONENTS.metricLabel}">${label}</p>
      <p class="${COMPONENTS.metricValue}">${value}</p>
      ${change ? `<p class="${COMPONENTS.metricChange} ${changeType}">${change}</p>` : ''}
    </div>
  `.trim();
}

/**
 * Build filter tabs
 * @param {Array} tabs - Array of {id, label, active} objects
 * @param {string} onClickHandler - JavaScript function name for click handling
 * @returns {string} Filter tabs HTML
 */
export function buildFilterTabs(tabs, onClickHandler = '') {
  const tabsHtml = tabs.map(tab => {
    const activeClass = tab.active ? ' active' : '';
    const onClick = onClickHandler ? ` onclick="${onClickHandler}('${tab.id}')"` : '';
    return `<button class="${COMPONENTS.filterTab}${activeClass}" data-filter="${tab.id}"${onClick}>${tab.label}</button>`;
  }).join('\n      ');
  
  return `
    <div class="${COMPONENTS.filterTabs}">
      ${tabsHtml}
    </div>
  `.trim();
}

/**
 * Build a panel component
 * @param {string} title - Panel title
 * @param {string} content - Panel content HTML
 * @param {string} additionalClasses - Additional CSS classes
 * @returns {string} Panel HTML
 */
export function buildPanel(title, content, additionalClasses = '') {
  return `
    <div class="${COMPONENTS.panel} ${additionalClasses}">
      ${title ? `
        <div class="${COMPONENTS.panelHeader}">
          <h3 class="${COMPONENTS.panelTitle}">${title}</h3>
        </div>
      ` : ''}
      <div class="${COMPONENTS.panelBody}">
        ${content}
      </div>
    </div>
  `.trim();
}

/**
 * Build a badge
 * @param {string} text - Badge text
 * @param {string} color - Badge color ('blue', 'green', 'yellow', 'red', 'gray')
 * @returns {string} Badge HTML
 */
export function buildBadge(text, color = 'gray') {
  const colorClass = COMPONENTS[`badge${color.charAt(0).toUpperCase() + color.slice(1)}`] || COMPONENTS.badgeGray;
  return `<span class="${COMPONENTS.badge} ${colorClass}">${text}</span>`;
}

/**
 * Build a data table
 * @param {Array} headers - Array of column header strings
 * @param {Array} rows - Array of row arrays (each row is an array of cell values)
 * @param {string} additionalClasses - Additional CSS classes
 * @returns {string} Table HTML
 */
export function buildDataTable(headers, rows, additionalClasses = '') {
  const headerHtml = headers.map(h => `<th>${h}</th>`).join('');
  const rowsHtml = rows.map(row => 
    `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`
  ).join('\n        ');
  
  return `
    <div class="${COMPONENTS.tableContainer}">
      <table class="${COMPONENTS.dataTable} ${additionalClasses}">
        <thead>
          <tr>${headerHtml}</tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `.trim();
}

/**
 * Build an empty state
 * @param {string} message - Empty state message
 * @returns {string} Empty state HTML
 */
export function buildEmptyState(message) {
  return `<div class="${COMPONENTS.emptyState}">${message}</div>`;
}

/**
 * Build a loading spinner
 * @param {number} size - Size in pixels (default 40)
 * @returns {string} Loading spinner HTML
 */
export function buildLoadingSpinner(size = 40) {
  return `<div class="${COMPONENTS.loadingSpinner}" style="width: ${size}px; height: ${size}px;"></div>`;
}
