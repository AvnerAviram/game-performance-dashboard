import { escapeHtml, escapeAttr, safeOnclick } from '../lib/sanitize.js';
import { apiFetch, apiPatch, apiDelete, apiPost } from '../lib/api-client.js';

let showArchived = false;
let filterType = 'all'; // 'all' | 'corrections'

const STATUS_STYLES = {
    open: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
    'in-progress': 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
    resolved: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
    closed: 'bg-gray-100 text-gray-700 dark:bg-gray-700/50 dark:text-gray-300',
    archived: 'bg-gray-100 text-gray-500 dark:bg-gray-700/50 dark:text-gray-400',
    approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
};

export async function renderTickets() {
    const container = document.getElementById('tickets-content');
    if (!container) return;
    try {
        const [tickets, sessionData] = await Promise.all([
            apiFetch('/api/tickets'),
            apiFetch('/api/session').catch(() => ({})),
        ]);
        const userIsAdmin = sessionData?.user?.role === 'admin';

        const activeTickets = tickets.filter(t => t.status !== 'archived');
        const archivedTickets = tickets.filter(t => t.status === 'archived');
        const openCount = tickets.filter(t => t.status === 'open').length;
        const correctionCount = tickets.filter(
            t => t.issueType === 'data-correction' && t.status !== 'archived'
        ).length;
        const approvedCount = tickets.filter(t => t.issueType === 'data-correction' && t.status === 'approved').length;
        let displayTickets = showArchived ? archivedTickets : activeTickets;
        if (filterType === 'corrections') {
            displayTickets = displayTickets.filter(t => t.issueType === 'data-correction');
        }

        displayTickets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const toolbarHtml = userIsAdmin
            ? `
            <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-2">
                    <button onclick="window.setTicketFilter('all')" class="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${filterType === 'all' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-700 dark:text-indigo-300' : 'bg-white border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 hover:border-indigo-300'}">All</button>
                    <button onclick="window.setTicketFilter('corrections')" class="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${filterType === 'corrections' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-700 dark:text-indigo-300' : 'bg-white border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 hover:border-indigo-300'}">Corrections (${correctionCount})${approvedCount > 0 ? ` <span class="ml-1 px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 text-[10px]">${approvedCount} approved</span>` : ''}</button>
                    <button onclick="window.toggleArchivedView()" class="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        showArchived
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-700 dark:text-indigo-300'
                            : 'bg-white border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 hover:border-indigo-300'
                    }">
                        ${showArchived ? `Active (${activeTickets.length})` : `Archive (${archivedTickets.length})`}
                    </button>
                    ${!showArchived && openCount > 0 ? `<button onclick="window.resolveAllOpen()" class="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 border border-emerald-200 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition-colors">Resolve All Open (${openCount})</button>` : ''}
                    <button onclick="window.deleteAllVisible()" class="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-700 dark:text-red-300 hover:bg-red-100 transition-colors">Delete All (${displayTickets.length})</button>
                </div>
                <div id="bulk-actions" class="hidden flex items-center gap-2">
                    <span id="bulk-count" class="text-xs text-gray-500"></span>
                    <button onclick="window.bulkUpdateTickets('resolved')" class="px-2.5 py-1 rounded text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 hover:bg-emerald-100 transition-colors">Resolve</button>
                    <button onclick="window.bulkUpdateTickets('archived')" class="px-2.5 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 transition-colors">Archive</button>
                    <button onclick="window.bulkDeleteTickets()" class="px-2.5 py-1 rounded text-xs font-medium bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-100 transition-colors">Delete</button>
                </div>
            </div>`
            : '';

        if (displayTickets.length === 0) {
            container.innerHTML =
                toolbarHtml +
                `<div class="text-center py-12 text-gray-500 dark:text-gray-400">${showArchived ? 'No archived tickets' : 'No tickets submitted yet'}</div>`;
            return;
        }

        container.innerHTML = `
            ${toolbarHtml}
            <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <table class="w-full">
                    <thead class="bg-gray-50 dark:bg-gray-900">
                        <tr class="border-b border-gray-200 dark:border-gray-700">
                            ${userIsAdmin ? '<th class="px-3 py-3 w-8"><input type="checkbox" id="bulk-select-all" class="rounded border-gray-300 dark:border-gray-600 text-indigo-500 focus:ring-indigo-500 w-3.5 h-3.5"></th>' : ''}
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Game</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">By</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ver</th>
                            ${userIsAdmin ? '<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>' : ''}
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                        ${displayTickets
                            .map(
                                t => `
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                ${userIsAdmin ? `<td class="px-3 py-3"><input type="checkbox" class="bulk-cb rounded border-gray-300 dark:border-gray-600 text-indigo-500 focus:ring-indigo-500 w-3.5 h-3.5" data-id="${escapeAttr(t.id)}"></td>` : ''}
                                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">${new Date(t.createdAt).toLocaleDateString()}</td>
                                <td class="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">${escapeHtml(t.gameName || '')}</td>
                                <td class="px-4 py-3"><span class="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">${escapeHtml(t.issueType || '')}</span></td>
                                <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-xs truncate">${escapeHtml(t.description || '')}</td>
                                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">${escapeHtml(t.submittedBy || '')}</td>
                                <td class="px-4 py-3"><span class="px-2 py-1 text-xs rounded-full ${STATUS_STYLES[t.status] || STATUS_STYLES.open}">${escapeHtml(t.status || '')}</span></td>
                                <td class="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">${escapeHtml(t.appVersion || '')}</td>
                                ${
                                    userIsAdmin
                                        ? `<td class="px-4 py-3">
                                    <div class="flex items-center gap-2">
                                        ${t.issueType === 'data-correction' && t.status === 'open' ? `<button onclick="${safeOnclick('window.approveCorrection', t.id)}" class="text-xs text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 font-medium">Accept</button><button onclick="${safeOnclick('window.rejectCorrection', t.id)}" class="text-xs text-red-600 hover:text-red-800 dark:text-red-400 font-medium">Reject</button>` : ''}
                                        ${
                                            t.status === 'open' && t.issueType !== 'data-correction'
                                                ? `<button onclick="${safeOnclick('window.resolveTicket', t.id)}" class="text-xs text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 font-medium">Resolve</button>`
                                                : t.status !== 'archived' && t.status !== 'open'
                                                  ? `<button onclick="${safeOnclick('window.reopenTicket', t.id)}" class="text-xs text-amber-600 hover:text-amber-800 dark:text-amber-400 font-medium">Reopen</button>`
                                                  : ''
                                        }
                                        ${t.status !== 'archived' ? `<button onclick="${safeOnclick('window.editTicket', t.id, t.gameName || '', t.issueType || '', t.description || '')}" class="text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 font-medium">Edit</button>` : ''}
                                        ${t.status !== 'archived' ? `<button onclick="${safeOnclick('window.archiveTicket', t.id)}" class="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 font-medium">Archive</button>` : `<button onclick="${safeOnclick('window.reopenTicket', t.id)}" class="text-xs text-amber-600 hover:text-amber-800 dark:text-amber-400 font-medium">Restore</button>`}
                                        <button onclick="${safeOnclick('window.deleteTicket', t.id)}" class="text-xs text-red-600 hover:text-red-800 dark:text-red-400 font-medium">Delete</button>
                                    </div>
                                    ${t.issueType === 'data-correction' ? `<button onclick="window.toggleCorrectionDetail('${escapeAttr(t.id)}')" class="text-[10px] text-gray-400 hover:text-indigo-400 mt-1 block">details</button>` : ''}
                                </td>`
                                        : ''
                                }
                            </tr>
                            ${
                                t.issueType === 'data-correction'
                                    ? `<tr class="hidden correction-detail-row" data-detail-id="${escapeAttr(t.id)}">
                                <td colspan="${userIsAdmin ? 9 : 8}" class="px-4 py-3 bg-gray-50 dark:bg-gray-800/50">
                                    <div class="grid grid-cols-2 gap-2 text-xs">
                                        ${t.fieldPath ? `<div><span class="text-gray-500 dark:text-gray-400">Field:</span> <span class="font-medium text-gray-900 dark:text-white">${escapeHtml(t.fieldPath)}</span></div>` : ''}
                                        ${t.currentValue ? `<div><span class="text-gray-500 dark:text-gray-400">Current:</span> <span class="text-red-600 dark:text-red-400">${escapeHtml(t.currentValue)}</span></div>` : ''}
                                        ${t.proposedValue ? `<div><span class="text-gray-500 dark:text-gray-400">Proposed:</span> <span class="text-emerald-600 dark:text-emerald-400">${escapeHtml(t.proposedValue)}</span></div>` : ''}
                                        ${t.sourceEvidence ? `<div class="col-span-2"><span class="text-gray-500 dark:text-gray-400">Evidence:</span> <span class="bg-yellow-50 dark:bg-yellow-900/20 px-1 rounded">${escapeHtml(t.sourceEvidence)}</span></div>` : ''}
                                        ${t.diagnosis ? `<div class="col-span-2 italic text-gray-500 dark:text-gray-400">${escapeHtml(t.diagnosis)}</div>` : ''}
                                    </div>
                                </td>
                            </tr>`
                                    : ''
                            }
                        `
                            )
                            .join('')}
                    </tbody>
                </table>
            </div>
        `;

        if (userIsAdmin) {
            const selectAll = document.getElementById('bulk-select-all');
            if (selectAll) {
                selectAll.addEventListener('change', () => {
                    document.querySelectorAll('.bulk-cb').forEach(cb => {
                        cb.checked = selectAll.checked;
                    });
                    updateBulkUI();
                });
            }
            document.querySelectorAll('.bulk-cb').forEach(cb => {
                cb.addEventListener('change', updateBulkUI);
            });
        }
    } catch (_err) {
        container.innerHTML = '<div class="text-center py-8 text-red-500">Failed to load tickets</div>';
    }
}

function updateBulkUI() {
    const checked = document.querySelectorAll('.bulk-cb:checked');
    const bulkActions = document.getElementById('bulk-actions');
    const bulkCount = document.getElementById('bulk-count');
    if (!bulkActions) return;
    if (checked.length > 0) {
        bulkActions.classList.remove('hidden');
        bulkActions.classList.add('flex');
        if (bulkCount) bulkCount.textContent = `${checked.length} selected`;
    } else {
        bulkActions.classList.add('hidden');
        bulkActions.classList.remove('flex');
    }
}

window.resolveTicket = async function (id) {
    try {
        await apiPatch(`/api/tickets/${id}`, { status: 'resolved' });
        renderTickets();
    } catch (err) {
        console.error('Failed to resolve ticket:', err);
    }
};

window.reopenTicket = async function (id) {
    try {
        await apiPatch(`/api/tickets/${id}`, { status: 'open' });
        renderTickets();
    } catch (err) {
        console.error('Failed to reopen ticket:', err);
    }
};

window.archiveTicket = async function (id) {
    try {
        await apiPatch(`/api/tickets/${id}`, { status: 'archived' });
        renderTickets();
    } catch (err) {
        console.error('Failed to archive ticket:', err);
    }
};

window.deleteTicket = async function (id) {
    if (!confirm('Are you sure you want to delete this ticket?')) return;
    try {
        await apiDelete(`/api/tickets/${id}`);
        renderTickets();
    } catch (err) {
        console.error('Failed to delete ticket:', err);
    }
};

window.editTicket = function (id, gameName, issueType, description) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-black/50';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 space-y-4">
            <h3 class="text-lg font-bold text-gray-900 dark:text-white">Edit Ticket</h3>
            <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Game</label><input id="edit-ticket-game" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" value="${escapeAttr(gameName)}"></div>
            <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label><select id="edit-ticket-type" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"><option value="data-issue" ${issueType === 'data-issue' ? 'selected' : ''}>Data Issue</option><option value="ui-bug" ${issueType === 'ui-bug' ? 'selected' : ''}>UI Bug</option><option value="feature-request" ${issueType === 'feature-request' ? 'selected' : ''}>Feature Request</option><option value="other" ${issueType === 'other' ? 'selected' : ''}>Other</option></select></div>
            <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label><textarea id="edit-ticket-desc" rows="3" class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">${escapeHtml(description)}</textarea></div>
            <div class="flex justify-end gap-2"><button id="edit-ticket-cancel" class="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">Cancel</button><button id="edit-ticket-save" class="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg">Save</button></div>
        </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#edit-ticket-cancel').onclick = () => modal.remove();
    modal.querySelector('#edit-ticket-save').onclick = async () => {
        const body = {
            gameName: modal.querySelector('#edit-ticket-game').value,
            issueType: modal.querySelector('#edit-ticket-type').value,
            description: modal.querySelector('#edit-ticket-desc').value,
        };
        try {
            await apiPatch(`/api/tickets/${id}`, body);
            modal.remove();
            renderTickets();
        } catch (err) {
            console.error('Failed to edit ticket:', err);
        }
    };
};

window.toggleArchivedView = function () {
    showArchived = !showArchived;
    renderTickets();
};

window.resolveAllOpen = async function () {
    if (!confirm('Resolve all open tickets?')) return;
    try {
        const tickets = await apiFetch('/api/tickets');
        const openIds = tickets.filter(t => t.status === 'open').map(t => t.id);
        if (openIds.length === 0) return;
        await apiPatch('/api/tickets/bulk', { ids: openIds, status: 'resolved' });
        renderTickets();
    } catch (err) {
        console.error('Failed to resolve all:', err);
    }
};

window.bulkUpdateTickets = async function (status) {
    const checked = document.querySelectorAll('.bulk-cb:checked');
    const ids = [...checked].map(cb => cb.dataset.id);
    if (ids.length === 0) return;
    try {
        await apiPatch('/api/tickets/bulk', { ids, status });
        renderTickets();
    } catch (err) {
        console.error('Failed to bulk update:', err);
    }
};

window.deleteAllVisible = async function () {
    const view = showArchived ? 'archived' : 'active';
    if (!confirm(`Delete ALL ${view} tickets? This cannot be undone.`)) return;
    try {
        const tickets = await apiFetch('/api/tickets');
        const ids = tickets
            .filter(t => (showArchived ? t.status === 'archived' : t.status !== 'archived'))
            .map(t => t.id);
        if (ids.length === 0) return;
        await apiDelete('/api/tickets/bulk', { ids });
        renderTickets();
    } catch (err) {
        console.error('Failed to delete all:', err);
    }
};

window.bulkDeleteTickets = async function () {
    const checked = document.querySelectorAll('.bulk-cb:checked');
    const ids = [...checked].map(cb => cb.dataset.id);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} selected ticket(s)? This cannot be undone.`)) return;
    try {
        await apiDelete('/api/tickets/bulk', { ids });
        renderTickets();
    } catch (err) {
        console.error('Failed to bulk delete:', err);
    }
};

window.setTicketFilter = function (type) {
    filterType = type;
    renderTickets();
};

window.approveCorrection = async function (id) {
    try {
        await apiPatch(`/api/tickets/${id}`, { status: 'approved' });
        renderTickets();
    } catch (err) {
        console.error('Failed to approve correction:', err);
    }
};

window.rejectCorrection = async function (id) {
    try {
        await apiPatch(`/api/tickets/${id}`, { status: 'closed', resolution: 'Rejected by admin' });
        renderTickets();
    } catch (err) {
        console.error('Failed to reject correction:', err);
    }
};

window.toggleCorrectionDetail = function (id) {
    const row = document.querySelector(`[data-detail-id="${id}"]`);
    if (row) row.classList.toggle('hidden');
};

window.bulkApproveCorrections = async function () {
    try {
        const tickets = await apiFetch('/api/tickets');
        const ids = tickets.filter(t => t.issueType === 'data-correction' && t.status === 'open').map(t => t.id);
        if (ids.length === 0) return;
        if (!confirm(`Approve ${ids.length} data correction(s)?`)) return;
        await apiPatch('/api/tickets/bulk', { ids, status: 'approved' });
        renderTickets();
    } catch (err) {
        console.error('Failed to bulk approve:', err);
    }
};

window.renderTickets = renderTickets;
