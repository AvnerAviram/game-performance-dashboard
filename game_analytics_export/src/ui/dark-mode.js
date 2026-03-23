// Dark mode toggle with chart refresh
import { refreshCharts } from './charts-modern.js';
import { warn } from '../lib/env.js';

export function setupDarkMode() {
    const toggle = document.getElementById('dark-mode-toggle');
    const lightIcon = toggle?.querySelector('.light-icon');
    const darkIcon = toggle?.querySelector('.dark-icon');

    if (!toggle) return;

    const isDark = localStorage.getItem('darkMode') === 'true';
    if (isDark) {
        document.documentElement.classList.add('dark');
        if (lightIcon) lightIcon.style.display = 'none';
        if (darkIcon) darkIcon.style.display = 'inline';
    }

    toggle.addEventListener('click', async () => {
        document.documentElement.classList.toggle('dark');
        const isDarkNow = document.documentElement.classList.contains('dark');
        localStorage.setItem('darkMode', isDarkNow);

        if (lightIcon && darkIcon) {
            lightIcon.style.display = isDarkNow ? 'none' : 'inline';
            darkIcon.style.display = isDarkNow ? 'inline' : 'none';
        }

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
    });
}
