/**
 * Tests for sidebar collapse functionality.
 * Uses a minimal DOM with sidebar, main-content, collapse-arrow, sidebar-text, gamelab-subnav elements.
 */
import { describe, it, expect, beforeEach } from 'vitest';

// Side-effect import to register window.toggleSidebar
import '../../src/ui/sidebar-collapse.js';

describe('Sidebar Collapse', () => {
    const SIDEBAR_HTML = `
        <div id="sidebar" style="width: 240px;">
            <div class="collapse-arrow"></div>
            <div class="logo-icon"></div>
            <span class="sidebar-text">Label 1</span>
            <span class="sidebar-text">Label 2</span>
        </div>
        <main id="main-content" style="margin-left: 240px;"></main>
        <div id="gamelab-subnav" style="max-height: 100px;"></div>
        <div class="gamelab-chevron"></div>
    `;

    beforeEach(() => {
        document.body.innerHTML = SIDEBAR_HTML;
        // Ensure desktop viewport for non-mobile tests
        Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true, writable: true });
    });

    describe('window.toggleSidebar() - desktop (>= 768px)', () => {
        it('when expanded (240px): collapses to 64px, hides sidebar-text, adds collapsed class', () => {
            const sidebar = document.getElementById('sidebar');
            const mainContent = document.getElementById('main-content');
            sidebar.style.width = '240px';
            sidebar.classList.remove('collapsed');

            const sidebarTexts = document.querySelectorAll('.sidebar-text');
            sidebarTexts.forEach(el => el.classList.remove('hidden'));

            window.toggleSidebar();

            expect(sidebar.style.width).toBe('64px');
            expect(sidebar.classList.contains('collapsed')).toBe(true);
            sidebarTexts.forEach(el => expect(el.classList.contains('hidden')).toBe(true));
            expect(mainContent.style.marginLeft).toBe('64px');
        });

        it('when collapsed (64px): expands to 240px, shows sidebar-text, removes collapsed class', () => {
            const sidebar = document.getElementById('sidebar');
            const mainContent = document.getElementById('main-content');
            sidebar.style.width = '64px';
            sidebar.classList.add('collapsed');

            const sidebarTexts = document.querySelectorAll('.sidebar-text');
            sidebarTexts.forEach(el => el.classList.add('hidden'));

            window.toggleSidebar();

            expect(sidebar.style.width).toBe('240px');
            expect(sidebar.classList.contains('collapsed')).toBe(false);
            sidebarTexts.forEach(el => expect(el.classList.contains('hidden')).toBe(false));
            expect(mainContent.style.marginLeft).toBe('240px');
        });

        it('Game Lab subnav gets maxHeight: 0 on collapse', () => {
            const subnav = document.getElementById('gamelab-subnav');
            subnav.style.maxHeight = '100px';

            window.toggleSidebar(); // collapse

            expect(subnav.style.maxHeight).toBe('0');
        });

        it('arrow rotates on toggle (180deg when collapsed, 0deg when expanded)', () => {
            const arrow = document.querySelector('.collapse-arrow');
            const sidebar = document.getElementById('sidebar');

            sidebar.style.width = '240px';
            window.toggleSidebar(); // collapse
            expect(arrow.style.transform).toBe('rotate(180deg)');

            window.toggleSidebar(); // expand
            expect(arrow.style.transform).toBe('rotate(0deg)');
        });
    });

    describe('Mobile behavior (window.innerWidth < 768)', () => {
        beforeEach(() => {
            Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true, writable: true });
        });

        it('width goes to 0 and translateX(-100%) when hiding', () => {
            const sidebar = document.getElementById('sidebar');
            sidebar.style.width = '240px';
            sidebar.style.transform = '';
            sidebar.classList.remove('collapsed', 'mobile-hidden');

            const sidebarTexts = document.querySelectorAll('.sidebar-text');
            sidebarTexts.forEach(el => el.classList.remove('hidden'));

            window.toggleSidebar(); // hide on mobile

            expect(sidebar.style.width).toBe('0px');
            expect(sidebar.style.transform).toBe('translateX(-100%)');
            expect(sidebar.classList.contains('collapsed')).toBe(true);
            expect(sidebar.classList.contains('mobile-hidden')).toBe(true);
        });

        it('width goes to 240px and translateX(0) when showing from hidden', () => {
            const sidebar = document.getElementById('sidebar');
            sidebar.style.width = '0px';
            sidebar.style.transform = 'translateX(-100%)';
            sidebar.classList.add('collapsed', 'mobile-hidden');

            const sidebarTexts = document.querySelectorAll('.sidebar-text');
            sidebarTexts.forEach(el => el.classList.add('hidden'));

            window.toggleSidebar(); // show on mobile

            expect(sidebar.style.width).toBe('240px');
            expect(sidebar.style.transform).toBe('translateX(0)');
            expect(sidebar.classList.contains('mobile-hidden')).toBe(false);
            sidebarTexts.forEach(el => expect(el.classList.contains('hidden')).toBe(false));
        });
    });
});
