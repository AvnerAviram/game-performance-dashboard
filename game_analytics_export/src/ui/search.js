import { searchThemes } from './renderers/themes-renderer.js';
import { setupMechanicSearch } from './renderers/mechanics-renderer.js';
import { debounce } from '../lib/debounce.js';

export function setupSearch() {
    const searchInput = document.getElementById('theme-search');
    const clearBtn = document.getElementById('clear-search');

    if (searchInput) {
        const debouncedSearch = debounce(query => searchThemes(query), 300);
        searchInput.addEventListener('input', e => {
            const query = e.target.value;
            if (clearBtn) clearBtn.style.display = query ? 'block' : 'none';
            debouncedSearch(query);
        });

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                searchInput.value = '';
                clearBtn.style.display = 'none';
                searchThemes('');
                searchInput.focus();
            });
        }
    }

    setupMechanicSearch();
}
