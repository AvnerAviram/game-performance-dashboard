/**
 * HTML Parser Utilities
 *
 * Parse rendered HTML to extract and validate displayed data.
 * Works with JSDOM in Vitest environment.
 */

/**
 * Parse table rows from HTML string or element
 */
export function parseTableRows(htmlOrElement) {
    const element = typeof htmlOrElement === 'string' ? createElementFromHTML(htmlOrElement) : htmlOrElement;

    const rows = Array.from(element.querySelectorAll('tbody tr'));

    return rows.map(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        return cells.map(cell => ({
            text: cell.textContent?.trim() || '',
            html: cell.innerHTML,
            element: cell,
        }));
    });
}

/**
 * Parse table headers
 */
export function parseTableHeaders(htmlOrElement) {
    const element = typeof htmlOrElement === 'string' ? createElementFromHTML(htmlOrElement) : htmlOrElement;

    const headers = Array.from(element.querySelectorAll('thead th, thead td'));
    return headers.map(th => th.textContent?.trim() || '');
}

/**
 * Extract data from table into array of objects
 */
export function extractTableData(htmlOrElement) {
    const headers = parseTableHeaders(htmlOrElement);
    const rows = parseTableRows(htmlOrElement);

    return rows.map(cells => {
        const obj = {};
        headers.forEach((header, index) => {
            if (cells[index]) {
                obj[header] = cells[index].text;
            }
        });
        return obj;
    });
}

/**
 * Parse specific table by ID or class
 */
export function parseTableById(htmlOrElement, id) {
    const element = typeof htmlOrElement === 'string' ? createElementFromHTML(htmlOrElement) : htmlOrElement;

    const table = element.querySelector(`#${id}`) || element.querySelector(`table#${id}`);
    if (!table) return null;

    return extractTableData(table);
}

/**
 * Count visible rows in table
 */
export function countTableRows(htmlOrElement) {
    const element = typeof htmlOrElement === 'string' ? createElementFromHTML(htmlOrElement) : htmlOrElement;

    return element.querySelectorAll('tbody tr').length;
}

/**
 * Extract value from element by selector
 */
export function extractValue(htmlOrElement, selector) {
    const element = typeof htmlOrElement === 'string' ? createElementFromHTML(htmlOrElement) : htmlOrElement;

    const target = element.querySelector(selector);
    return target?.textContent?.trim() || null;
}

/**
 * Extract all values from elements matching selector
 */
export function extractValues(htmlOrElement, selector) {
    const element = typeof htmlOrElement === 'string' ? createElementFromHTML(htmlOrElement) : htmlOrElement;

    const targets = Array.from(element.querySelectorAll(selector));
    return targets.map(el => el.textContent?.trim() || '');
}

/**
 * Parse comparison cards from Overview page
 */
export function parseComparisonCards(htmlOrElement) {
    const element = typeof htmlOrElement === 'string' ? createElementFromHTML(htmlOrElement) : htmlOrElement;

    const cards = Array.from(element.querySelectorAll('.bg-gradient-to-br'));

    return cards.map(card => {
        const title = card.querySelector('.uppercase.tracking-wide')?.textContent?.trim();
        const subtitle = card
            .querySelector(
                '.text-xs.text-amber-600, .text-xs.text-purple-600, .text-xs.text-emerald-600, .text-xs.text-red-600, .text-xs.text-cyan-600, .text-xs.text-indigo-600'
            )
            ?.textContent?.trim();
        const mainValue = card.querySelector('.text-2xl.font-black')?.textContent?.trim();
        const name = card.querySelector('.text-lg.font-bold, .text-base.font-bold')?.textContent?.trim();

        return {
            title,
            subtitle,
            name,
            mainValue,
            element: card,
        };
    });
}

/**
 * Parse anomaly cards
 */
export function parseAnomalyCards(htmlOrElement) {
    const element = typeof htmlOrElement === 'string' ? createElementFromHTML(htmlOrElement) : htmlOrElement;

    const cards = Array.from(element.querySelectorAll('.bg-white.dark\\:bg-gray-800, [class*="bg-white"]'));

    return cards.map(card => {
        const name = card.querySelector('h3, .font-bold')?.textContent?.trim();
        const theoWin = card.querySelector('[data-theo-win], .text-lg')?.textContent?.trim();

        return {
            name,
            theoWin,
            element: card,
        };
    });
}

/**
 * Parse chart data from canvas or data attributes
 */
export function extractChartData(htmlOrElement, chartId) {
    const element = typeof htmlOrElement === 'string' ? createElementFromHTML(htmlOrElement) : htmlOrElement;

    const chartElement = element.querySelector(`#${chartId}`);
    if (!chartElement) return null;

    // Try to extract from data attributes
    const dataLabels = chartElement.getAttribute('data-labels');
    const dataValues = chartElement.getAttribute('data-values');

    if (dataLabels && dataValues) {
        return {
            labels: JSON.parse(dataLabels),
            values: JSON.parse(dataValues),
        };
    }

    return null;
}

/**
 * Check if element is visible
 */
export function isVisible(element) {
    if (!element) return false;

    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && !element.classList.contains('hidden');
}

/**
 * Count visible cards/items
 */
export function countVisibleItems(htmlOrElement, selector) {
    const element = typeof htmlOrElement === 'string' ? createElementFromHTML(htmlOrElement) : htmlOrElement;

    const items = Array.from(element.querySelectorAll(selector));
    return items.filter(item => isVisible(item)).length;
}

/**
 * Extract stats from quick stats section
 */
export function parseQuickStats(htmlOrElement) {
    const element = typeof htmlOrElement === 'string' ? createElementFromHTML(htmlOrElement) : htmlOrElement;

    const stats = {};

    // Common patterns for stat cards
    const statCards = Array.from(element.querySelectorAll('[class*="stat"], .bg-white, .bg-gray-50'));

    statCards.forEach(card => {
        const label = card.querySelector('.text-xs, .text-sm, label')?.textContent?.trim();
        const value = card.querySelector('.text-2xl, .text-3xl, .text-4xl, .font-bold')?.textContent?.trim();

        if (label && value) {
            stats[label] = parseNumber(value);
        }
    });

    return stats;
}

/**
 * Parse number from string (handles commas, percentages, etc.)
 */
export function parseNumber(str) {
    if (typeof str === 'number') return str;
    if (!str) return null;

    // Remove commas, spaces, and percentage signs
    const cleaned = str.replace(/[,\s%]/g, '');
    const num = parseFloat(cleaned);

    return isNaN(num) ? null : num;
}

/**
 * Parse all numbers from table column
 */
export function parseColumnNumbers(htmlOrElement, columnIndex) {
    const rows = parseTableRows(htmlOrElement);
    return rows.map(cells => parseNumber(cells[columnIndex]?.text));
}

/**
 * Create DOM element from HTML string
 */
function createElementFromHTML(html) {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstChild || template.content;
}

/**
 * Extract pagination info
 */
export function parsePaginationInfo(htmlOrElement) {
    const element = typeof htmlOrElement === 'string' ? createElementFromHTML(htmlOrElement) : htmlOrElement;

    const paginationText = element.querySelector('[class*="pagination"], .text-sm')?.textContent;

    if (!paginationText) return null;

    // Parse "Showing 1-50 of 501" format
    const match = paginationText.match(/(\d+)-(\d+)\s+of\s+(\d+)/i);
    if (match) {
        return {
            start: parseInt(match[1]),
            end: parseInt(match[2]),
            total: parseInt(match[3]),
        };
    }

    return null;
}

/**
 * Get all filter option values
 */
export function getFilterOptions(htmlOrElement, filterId) {
    const element = typeof htmlOrElement === 'string' ? createElementFromHTML(htmlOrElement) : htmlOrElement;

    const filter = element.querySelector(`#${filterId}`);
    if (!filter) return [];

    const options = Array.from(filter.querySelectorAll('option'));
    return options.map(opt => opt.value);
}

/**
 * Check if filter is applied
 */
export function isFilterActive(htmlOrElement, filterId, value) {
    const element = typeof htmlOrElement === 'string' ? createElementFromHTML(htmlOrElement) : htmlOrElement;

    const filter = element.querySelector(`#${filterId}`);
    if (!filter) return false;

    return filter.value === value;
}

/**
 * Extract sort direction from table header
 */
export function getSortDirection(htmlOrElement, columnIndex) {
    const element = typeof htmlOrElement === 'string' ? createElementFromHTML(htmlOrElement) : htmlOrElement;

    const headers = Array.from(element.querySelectorAll('thead th'));
    if (columnIndex >= headers.length) return null;

    const header = headers[columnIndex];

    if (header.classList.contains('sort-asc') || header.textContent.includes('↑')) {
        return 'asc';
    } else if (header.classList.contains('sort-desc') || header.textContent.includes('↓')) {
        return 'desc';
    }

    return null;
}

/**
 * Verify table is sorted correctly
 */
export function verifyTableSort(htmlOrElement, columnIndex, direction = 'asc') {
    const values = parseColumnNumbers(htmlOrElement, columnIndex);

    for (let i = 0; i < values.length - 1; i++) {
        if (values[i] === null || values[i + 1] === null) continue;

        if (direction === 'asc' && values[i] > values[i + 1]) {
            return false;
        } else if (direction === 'desc' && values[i] < values[i + 1]) {
            return false;
        }
    }

    return true;
}
