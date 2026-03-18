/**
 * Sidebar Collapse Functionality - PURE JAVASCRIPT
 * Fixed to properly adjust main content width
 */

window.toggleSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');
    
    if (!sidebar) {
        console.error('❌ Sidebar not found!');
        return;
    }
    
    // Check current state by looking at inline width
    const isCollapsed = sidebar.style.width === '64px';
    
    // Get all pagination footers
    const footers = [
        document.getElementById('themes-pagination-footer'),
        document.getElementById('mechanics-pagination-footer'),
        document.getElementById('games-pagination-footer'),
        document.getElementById('providers-pagination-footer')
    ].filter(f => f);
    
    if (isCollapsed) {
        // EXPAND to 240px
        sidebar.style.width = '240px';
        sidebar.style.transform = 'none';
        sidebar.classList.remove('collapsed');
        
        if (mainContent) {
            mainContent.style.marginLeft = '240px';
            mainContent.style.width = '';
            mainContent.style.transition = 'all 0.3s ease';
        }
        
        // Show text and logo
        const sidebarTexts = document.querySelectorAll('.sidebar-text');
        sidebarTexts.forEach(el => el.classList.remove('hidden'));
        
        const logoIcon = document.querySelector('.logo-icon');
        if (logoIcon) logoIcon.classList.remove('hidden');
        
        // Flip arrow back (point left)
        const arrow = document.querySelector('.collapse-arrow');
        if (arrow) arrow.style.transform = 'rotate(0deg)';
        
        // Update footer left position for expanded sidebar
        footers.forEach(footer => {
            footer.style.left = '240px';
            footer.style.transition = 'left 0.3s ease';
        });
        
        // Re-expand game lab subnav if on game-lab page
        const currentPage = window.location.hash.replace('#', '') || 'overview';
        const subnav = document.getElementById('gamelab-subnav');
        if (currentPage === 'game-lab' && subnav) {
            subnav.style.maxHeight = subnav.scrollHeight + 'px';
            const chevron = document.querySelector('.gamelab-chevron');
            if (chevron) chevron.style.transform = 'rotate(90deg)';
        }
    } else {
        // COLLAPSE to 64px narrow width (stay visible)
        sidebar.style.width = '64px';
        sidebar.style.transform = 'none';
        sidebar.classList.add('collapsed');
        
        if (mainContent) {
            mainContent.style.marginLeft = '64px';
            mainContent.style.width = '';
            mainContent.style.transition = 'all 0.3s ease';
        }
        
        // Hide all text labels and logo
        const sidebarTexts = document.querySelectorAll('.sidebar-text');
        sidebarTexts.forEach(el => el.classList.add('hidden'));
        
        const logoIcon = document.querySelector('.logo-icon');
        if (logoIcon) logoIcon.classList.add('hidden');
        
        // Flip arrow (point right)
        const arrow = document.querySelector('.collapse-arrow');
        if (arrow) arrow.style.transform = 'rotate(180deg)';
        
        // Update footer left position for collapsed sidebar
        footers.forEach(footer => {
            footer.style.left = '64px';
            footer.style.transition = 'left 0.3s ease';
        });
        
        // Close game lab subnav on collapse
        const subnav = document.getElementById('gamelab-subnav');
        if (subnav) {
            subnav.style.maxHeight = '0';
        }
        const chevron = document.querySelector('.gamelab-chevron');
        if (chevron) chevron.style.transform = 'rotate(0deg)';
    }
};

// Mobile: auto-collapse on small screens, show overlay
function handleMobileResize() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');
    if (!sidebar || !mainContent) return;
    
    const isMobile = window.innerWidth < 768;
    const overlay = document.getElementById('sidebar-overlay');
    
    if (isMobile && sidebar.style.width !== '0px') {
        sidebar.style.width = '0px';
        sidebar.style.transform = 'translateX(-100%)';
        sidebar.classList.add('collapsed', 'mobile-hidden');
        mainContent.style.marginLeft = '0';
        mainContent.style.transition = 'all 0.3s ease';
        
        const sidebarTexts = document.querySelectorAll('.sidebar-text');
        sidebarTexts.forEach(el => el.classList.add('hidden'));
        
        const footers = document.querySelectorAll('[id$="-pagination-footer"]');
        footers.forEach(f => { f.style.left = '0'; });
        
        if (!overlay) {
            const ov = document.createElement('div');
            ov.id = 'sidebar-overlay';
            ov.className = 'fixed inset-0 bg-black/50 z-[499] hidden';
            ov.addEventListener('click', () => {
                window.toggleSidebar();
            });
            document.body.appendChild(ov);
        }
    }
}

// Mobile toggle: slide in/out as overlay
const origToggle = window.toggleSidebar;
window.toggleSidebar = function() {
    const isMobile = window.innerWidth < 768;
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    
    if (isMobile && sidebar) {
        const isHidden = sidebar.classList.contains('mobile-hidden');
        if (isHidden) {
            sidebar.style.width = '240px';
            sidebar.style.transform = 'translateX(0)';
            sidebar.classList.remove('collapsed', 'mobile-hidden');
            const sidebarTexts = document.querySelectorAll('.sidebar-text');
            sidebarTexts.forEach(el => el.classList.remove('hidden'));
            if (overlay) overlay.classList.remove('hidden');
        } else {
            sidebar.style.width = '0px';
            sidebar.style.transform = 'translateX(-100%)';
            sidebar.classList.add('collapsed', 'mobile-hidden');
            const sidebarTexts = document.querySelectorAll('.sidebar-text');
            sidebarTexts.forEach(el => el.classList.add('hidden'));
            if (overlay) overlay.classList.add('hidden');
        }
        return;
    }
    origToggle();
};

// Mobile hamburger button in headers
function injectMobileMenuBtn() {
    if (window.innerWidth >= 768) return;
    if (document.getElementById('mobile-menu-btn')) return;
    const main = document.getElementById('main-content');
    if (!main) return;
    const btn = document.createElement('button');
    btn.id = 'mobile-menu-btn';
    btn.className = 'fixed top-4 left-4 z-[600] w-10 h-10 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center md:hidden';
    btn.innerHTML = '<svg class="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>';
    btn.addEventListener('click', () => window.toggleSidebar());
    document.body.appendChild(btn);
}

window.addEventListener('resize', () => {
    handleMobileResize();
    const mobileBtn = document.getElementById('mobile-menu-btn');
    if (window.innerWidth >= 768 && mobileBtn) mobileBtn.remove();
    if (window.innerWidth < 768) injectMobileMenuBtn();
});

document.addEventListener('DOMContentLoaded', () => {
    handleMobileResize();
    injectMobileMenuBtn();
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { toggleSidebar: window.toggleSidebar };
}
