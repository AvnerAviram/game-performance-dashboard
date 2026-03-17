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
    }
};

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { toggleSidebar: window.toggleSidebar };
}
