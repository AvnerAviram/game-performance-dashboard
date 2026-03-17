// Sidebar toggle and dark mode functionality
// Use immediate execution to ensure it runs after DOM loads
import { log } from './lib/env.js';

(function() {
    'use strict';
    
    log('🔧 Interactions.js loading...');
    
    function initInteractions() {
        log('🎯 Initializing interactions...');
        
        // Sidebar toggle
        const sidebar = document.getElementById('sidebar');
        const sidebarToggle = document.getElementById('sidebar-toggle');
        const toggleIcon = sidebarToggle?.querySelector('.toggle-icon');
        
        log('Sidebar:', sidebar);
        log('Toggle button:', sidebarToggle);
        log('Toggle icon:', toggleIcon);
        
        if (sidebarToggle && sidebar) {
            sidebarToggle.addEventListener('click', function(e) {
                e.preventDefault();
                log('🖱️ Sidebar toggle clicked!');
                sidebar.classList.toggle('collapsed');
                if (toggleIcon) {
                    toggleIcon.textContent = sidebar.classList.contains('collapsed') ? '▶' : '◀';
                }
                log('Sidebar collapsed:', sidebar.classList.contains('collapsed'));
            });
            log('✅ Sidebar toggle attached');
        } else {
            console.error('❌ Sidebar or toggle button not found!');
        }
        
        // Dark mode toggle
        const darkModeToggle = document.getElementById('dark-mode-toggle');
        const lightIcon = document.querySelector('.light-icon');
        const darkIcon = document.querySelector('.dark-icon');
        
        log('Dark mode button:', darkModeToggle);
        log('Light icon:', lightIcon);
        log('Dark icon:', darkIcon);
        
        if (darkModeToggle) {
            darkModeToggle.addEventListener('click', function(e) {
                e.preventDefault();
                log('🌙 Dark mode toggle clicked!');
                document.documentElement.classList.toggle('dark');
                const isDark = document.documentElement.classList.contains('dark');
                
                if (lightIcon && darkIcon) {
                    lightIcon.style.display = isDark ? 'none' : 'inline';
                    darkIcon.style.display = isDark ? 'inline' : 'none';
                }
                
                // Save preference
                localStorage.setItem('darkMode', isDark);
                log('Dark mode:', isDark);
            });
            log('✅ Dark mode toggle attached');
        } else {
            console.error('❌ Dark mode button not found!');
        }
        
        // Load dark mode preference
        const savedDarkMode = localStorage.getItem('darkMode') === 'true';
        log('Saved dark mode preference:', savedDarkMode);
        if (savedDarkMode) {
            document.documentElement.classList.add('dark');
            if (lightIcon && darkIcon) {
                lightIcon.style.display = 'none';
                darkIcon.style.display = 'inline';
            }
        }
        
        log('✅ Interactions initialized!');
    }
    
    // Try multiple initialization strategies
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initInteractions);
    } else {
        // DOM already loaded
        initInteractions();
    }
    
    // Backup: try again after a short delay
    setTimeout(initInteractions, 500);
})();
