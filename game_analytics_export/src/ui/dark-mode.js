import { refreshCharts } from './charts-modern.js';
import { warn } from '../lib/env.js';

const TOGGLE_HTML = `<button id="dark-mode-toggle" aria-label="Toggle dark mode"
    class="dm-toggle relative w-[46px] h-[26px] rounded-full bg-gray-200 dark:bg-gray-700 border border-gray-300/40 dark:border-gray-600/40 shadow-sm hover:shadow-md cursor-pointer transition-colors duration-200 flex-shrink-0" style="display:block">
    <span class="absolute left-[6px] top-1/2 -translate-y-1/2 text-amber-400 pointer-events-none">
        <svg class="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clip-rule="evenodd"/></svg>
    </span>
    <span class="absolute right-[6px] top-1/2 -translate-y-1/2 text-indigo-300 pointer-events-none">
        <svg class="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/></svg>
    </span>
    <span class="dm-knob absolute left-[3px] top-1/2 w-5 h-5 rounded-full bg-white shadow-md pointer-events-none" style="transform:translateY(-50%);transition:transform .2s"></span>
</button>`;

function setKnobPosition(toggle, isDark) {
    const knob = toggle?.querySelector('.dm-knob');
    if (knob) knob.style.transform = isDark ? 'translate(18px, -50%)' : 'translate(0, -50%)';
}

function injectToggle() {
    if (document.getElementById('dark-mode-toggle')) return;
    const hamburger = document.getElementById('hamburger-btn');
    if (!hamburger) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'dm-injected';
    wrapper.className = 'flex items-center';
    wrapper.innerHTML = TOGGLE_HTML;
    hamburger.parentElement.insertBefore(wrapper, hamburger);

    const toggle = document.getElementById('dark-mode-toggle');
    const isDark = document.documentElement.classList.contains('dark');
    setKnobPosition(toggle, isDark);
    toggle.addEventListener('click', handleToggle);
}

async function handleToggle() {
    document.documentElement.classList.toggle('dark');
    const isDarkNow = document.documentElement.classList.contains('dark');
    localStorage.setItem('darkMode', isDarkNow);

    const toggle = document.getElementById('dark-mode-toggle');
    setKnobPosition(toggle, isDarkNow);

    try {
        setTimeout(() => refreshCharts(), 100);
    } catch (err) {
        warn('Could not refresh charts:', err);
    }

    if (document.getElementById('overall-trend-chart')) {
        try {
            const { renderTrends } = await import('../features/trends.js');
            setTimeout(() => renderTrends(), 150);
        } catch (err) {
            warn('Could not refresh trends:', err);
        }
    }
}

export function setupDarkMode() {
    const isDark = localStorage.getItem('darkMode') === 'true';
    if (isDark) document.documentElement.classList.add('dark');

    injectToggle();

    const container = document.getElementById('page-container');
    if (container) {
        const obs = new MutationObserver(() => injectToggle());
        obs.observe(container, { childList: true, subtree: false });
    }
}
