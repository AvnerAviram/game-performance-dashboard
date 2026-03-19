/**
 * Shared collapsible list helper — generates HTML that wraps items
 * with a "Show all N items" / "Show less" toggle button.
 * Relies on window._toggleCL defined in panel-details.js.
 */
export function collapsibleList(listHtml, totalCount, initialShow, containerId) {
    if (totalCount <= initialShow) return listHtml;
    const uid = containerId || ('cl-' + Math.random().toString(36).slice(2, 8));
    return `
        <div id="${uid}-wrap">
            <div id="${uid}-items">${listHtml}</div>
            <button id="${uid}-btn" onclick="window._toggleCL('${uid}',${initialShow},${totalCount})" data-expanded="0"
            class="mt-2 w-full text-center text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 cursor-pointer py-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors">
                Show all ${totalCount} items
            </button>
        </div>
    `;
}
