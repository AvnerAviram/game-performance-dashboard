/**
 * Auth UI - Hamburger menu: Log in, Log out, Manage Users (admin)
 * Uses event delegation so it works when DOM is replaced on page navigation
 */
import { logout, redirectToLogin, isLoggedIn, isAdmin } from '../lib/auth.js';
import { escapeHtml, safeOnclick } from '../lib/sanitize.js';
import { apiFetch, apiPost, apiDelete } from '../lib/api-client.js';

let hamburgerOpen = false;

export function updateAuthUI() {
    const loggedIn = isLoggedIn();
    const admin = isAdmin();
    const loginBtn = document.getElementById('auth-login-btn');
    const logoutBtn = document.getElementById('auth-logout-btn');
    if (loginBtn) loginBtn.classList.toggle('hidden', loggedIn);
    if (logoutBtn) logoutBtn.classList.toggle('hidden', !loggedIn);

    // Inject admin buttons if needed
    const dropdown = document.getElementById('hamburger-dropdown');
    if (dropdown && loggedIn && admin) {
        const sep = dropdown.querySelector('.border-t');
        if (sep && !document.getElementById('admin-users-btn')) {
            const btn = document.createElement('button');
            btn.id = 'admin-users-btn';
            btn.type = 'button';
            btn.className =
                'w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center gap-2';
            btn.innerHTML =
                '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>Manage Users';
            sep.before(btn);
        }
        if (sep && !document.getElementById('admin-aicode-btn')) {
            const codeBtn = document.createElement('button');
            codeBtn.id = 'admin-aicode-btn';
            codeBtn.type = 'button';
            codeBtn.className =
                'w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center gap-2';
            codeBtn.innerHTML =
                '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>AI Name Code';
            const sep2 = dropdown.querySelectorAll('.border-t');
            const insertBefore = sep2.length > 0 ? sep2[0] : null;
            if (insertBefore) insertBefore.before(codeBtn);
            else dropdown.appendChild(codeBtn);
        }
    }
    // Remove admin buttons if not admin
    if (!admin || !loggedIn) {
        document.getElementById('admin-users-btn')?.remove();
        document.getElementById('admin-aicode-btn')?.remove();
    }
}

function toggleHamburger() {
    hamburgerOpen = !hamburgerOpen;
    const dropdown = document.getElementById('hamburger-dropdown');
    const btn = document.getElementById('hamburger-btn');
    if (dropdown) dropdown.classList.toggle('hidden', !hamburgerOpen);
    if (btn) btn.setAttribute('aria-expanded', hamburgerOpen);
}

function closeHamburger() {
    hamburgerOpen = false;
    const dropdown = document.getElementById('hamburger-dropdown');
    const btn = document.getElementById('hamburger-btn');
    if (dropdown) dropdown.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

async function handleLogout() {
    await logout();
    redirectToLogin();
}

// ============ Admin User Management Modal ============

function createUserModal() {
    if (document.getElementById('admin-users-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'admin-users-modal';
    modal.className = 'fixed inset-0 z-[2000] hidden';
    modal.innerHTML = `
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" onclick="document.getElementById('admin-users-modal').classList.add('hidden');document.body.style.overflow=''"></div>
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h2 class="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <svg class="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
                    Manage Users
                </h2>
                <button onclick="document.getElementById('admin-users-modal').classList.add('hidden');document.body.style.overflow=''" class="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            </div>
            <div class="p-6">
                <div id="admin-users-list" class="space-y-2 mb-6 max-h-[250px] overflow-y-auto"></div>
                <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-3">Add New User</h3>
                    <div class="grid grid-cols-2 gap-3 mb-3">
                        <input id="admin-new-username" type="text" placeholder="Username" class="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none">
                        <input id="admin-new-password" type="password" placeholder="Password" class="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none">
                    </div>
                    <div class="flex items-center gap-3">
                        <label class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <input id="admin-new-role" type="checkbox" class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
                            Admin role
                        </label>
                        <button id="admin-add-user-btn" class="ml-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">Add User</button>
                    </div>
                    <div id="admin-status" class="mt-3 text-sm hidden"></div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

async function loadUsersList() {
    const list = document.getElementById('admin-users-list');
    if (!list) return;
    list.innerHTML = '<div class="text-center text-gray-400 py-4">Loading...</div>';
    try {
        const users = await apiFetch('/api/admin/users');
        if (!users.length) {
            list.innerHTML = '<div class="text-center text-gray-400 py-4">No users found</div>';
            return;
        }
        list.innerHTML = users
            .map(
                u => `
            <div class="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
                <div class="flex items-center gap-2">
                    <span class="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-sm font-bold">${escapeHtml(u.username.charAt(0).toUpperCase())}</span>
                    <div>
                        <div class="text-sm font-medium text-gray-900 dark:text-white">${escapeHtml(u.username)}</div>
                        <div class="text-[10px] text-gray-500 dark:text-gray-400">${u.role === 'admin' ? '🔑 Admin' : 'User'}</div>
                    </div>
                </div>
                <div class="flex items-center gap-1.5">
                    <button onclick="${safeOnclick('window._adminChangePw', u.username)}" class="px-2.5 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors" title="Change password">Change PW</button>
                    ${u.role !== 'admin' ? `<button onclick="${safeOnclick('window._adminDeleteUser', u.username)}" class="px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="Delete user">Delete</button>` : ''}
                </div>
            </div>
        `
            )
            .join('');
    } catch (e) {
        list.innerHTML = `<div class="text-center text-red-500 py-4">${escapeHtml(e.message)}</div>`;
    }
}

function showStatus(msg, isError = false) {
    const el = document.getElementById('admin-status');
    if (!el) return;
    el.textContent = msg;
    el.className = `mt-3 text-sm ${isError ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`;
    el.classList.remove('hidden');
    if (!isError) setTimeout(() => el.classList.add('hidden'), 3000);
}

async function addUser() {
    const username = document.getElementById('admin-new-username')?.value?.trim();
    const password = document.getElementById('admin-new-password')?.value;
    const isAdminRole = document.getElementById('admin-new-role')?.checked;
    if (!username || !password) {
        showStatus('Username and password required', true);
        return;
    }
    if (password.length < 8) {
        showStatus('Password must be at least 8 characters', true);
        return;
    }
    try {
        await apiPost('/api/admin/users', { username, password, role: isAdminRole ? 'admin' : 'user' });
        showStatus(`User "${username}" created successfully`);
        document.getElementById('admin-new-username').value = '';
        document.getElementById('admin-new-password').value = '';
        document.getElementById('admin-new-role').checked = false;
        loadUsersList();
    } catch (err) {
        showStatus(err.message || 'Network error', true);
    }
}

window._adminChangePw = async function (username) {
    const newPw = prompt(`New password for "${username}":`);
    if (!newPw) return;
    if (newPw.length < 8) {
        alert('Password must be at least 8 characters');
        return;
    }
    try {
        await apiFetch(`/api/admin/users/${encodeURIComponent(username)}/password`, {
            method: 'PUT',
            body: JSON.stringify({ password: newPw }),
        });
        showStatus(`Password updated for "${username}"`);
    } catch (err) {
        showStatus(err.message || 'Network error', true);
    }
};

window._adminDeleteUser = async function (username) {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
    try {
        await apiDelete(`/api/admin/users/${encodeURIComponent(username)}`);
        showStatus(`User "${username}" deleted`);
        loadUsersList();
    } catch (err) {
        showStatus(err.message || 'Network error', true);
    }
};

function openUsersModal() {
    createUserModal();
    const modal = document.getElementById('admin-users-modal');
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    loadUsersList();
}

// ============ AI Name Code Modal ============

function createAICodeModal() {
    if (document.getElementById('admin-aicode-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'admin-aicode-modal';
    modal.className = 'fixed inset-0 z-[2000] hidden';
    modal.innerHTML = `
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" onclick="document.getElementById('admin-aicode-modal').classList.add('hidden');document.body.style.overflow=''"></div>
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h2 class="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <svg class="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>
                    AI Name Code
                </h2>
                <button onclick="document.getElementById('admin-aicode-modal').classList.add('hidden');document.body.style.overflow=''" class="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            </div>
            <div class="p-6">
                <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">Re-enter your password to reveal the AI Name Generator secret code.</p>
                <input id="aicode-password" type="password" placeholder="Your password" class="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none mb-3">
                <button id="aicode-reveal-btn" class="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors">Reveal Code</button>
                <div id="aicode-result" class="mt-4 hidden">
                    <div class="flex items-center gap-2 p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700">
                        <span class="text-sm font-mono font-bold text-indigo-700 dark:text-indigo-300 select-all flex-1" id="aicode-value"></span>
                        <button id="aicode-copy-btn" class="px-2.5 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-800/40 rounded-md transition-colors">Copy</button>
                    </div>
                </div>
                <div id="aicode-error" class="mt-3 text-sm text-red-500 hidden"></div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

async function revealAICode() {
    const pw = document.getElementById('aicode-password')?.value;
    const resultDiv = document.getElementById('aicode-result');
    const errorDiv = document.getElementById('aicode-error');
    const valueSpan = document.getElementById('aicode-value');
    const revealBtn = document.getElementById('aicode-reveal-btn');

    if (!pw) {
        errorDiv.textContent = 'Please enter your password';
        errorDiv.classList.remove('hidden');
        return;
    }
    errorDiv.classList.add('hidden');
    resultDiv.classList.add('hidden');
    revealBtn.disabled = true;
    revealBtn.textContent = 'Verifying...';

    try {
        const data = await apiPost('/api/admin/ai-code', { password: pw });
        valueSpan.textContent = data.code;
        resultDiv.classList.remove('hidden');
        document.getElementById('aicode-password').value = '';
    } catch (err) {
        errorDiv.textContent = err.message || 'Verification failed';
        errorDiv.classList.remove('hidden');
    } finally {
        revealBtn.disabled = false;
        revealBtn.textContent = 'Reveal Code';
    }
}

function copyAICode() {
    const val = document.getElementById('aicode-value')?.textContent;
    if (!val) return;
    navigator.clipboard.writeText(val).then(() => {
        const btn = document.getElementById('aicode-copy-btn');
        if (btn) {
            btn.textContent = 'Copied!';
            setTimeout(() => (btn.textContent = 'Copy'), 2000);
        }
    });
}

function openAICodeModal() {
    createAICodeModal();
    const modal = document.getElementById('admin-aicode-modal');
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    document.getElementById('aicode-result')?.classList.add('hidden');
    document.getElementById('aicode-error')?.classList.add('hidden');
    const pwInput = document.getElementById('aicode-password');
    if (pwInput) {
        pwInput.value = '';
        pwInput.focus();
    }
}

// ============ Setup ============

export function setupAuthUI() {
    updateAuthUI();

    document.addEventListener('click', e => {
        const hamburgerBtn = e.target.closest('#hamburger-btn');
        const loginBtn = e.target.closest('#auth-login-btn');
        const logoutBtn = e.target.closest('#auth-logout-btn');
        const adminBtn = e.target.closest('#admin-users-btn');
        const addUserBtn = e.target.closest('#admin-add-user-btn');
        const aiCodeBtn = e.target.closest('#admin-aicode-btn');
        const aiRevealBtn = e.target.closest('#aicode-reveal-btn');
        const aiCopyBtn = e.target.closest('#aicode-copy-btn');
        if (hamburgerBtn) {
            e.stopPropagation();
            toggleHamburger();
        } else if (loginBtn) {
            closeHamburger();
            redirectToLogin();
        } else if (logoutBtn) {
            handleLogout();
        } else if (adminBtn) {
            closeHamburger();
            openUsersModal();
        } else if (aiCodeBtn) {
            closeHamburger();
            openAICodeModal();
        } else if (aiRevealBtn) {
            revealAICode();
        } else if (aiCopyBtn) {
            copyAICode();
        } else if (addUserBtn) {
            addUser();
        } else if (hamburgerOpen) {
            const dropdown = document.getElementById('hamburger-dropdown');
            const btn = document.getElementById('hamburger-btn');
            if (dropdown && btn && !dropdown.contains(e.target) && !btn.contains(e.target)) {
                closeHamburger();
            }
        }
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (hamburgerOpen) closeHamburger();
            ['admin-users-modal', 'admin-aicode-modal'].forEach(id => {
                const modal = document.getElementById(id);
                if (modal && !modal.classList.contains('hidden')) {
                    modal.classList.add('hidden');
                    document.body.style.overflow = '';
                }
            });
        }
        if (e.key === 'Enter' && e.target.id === 'aicode-password') {
            revealAICode();
        }
    });
}
