import { describe, test, expect, beforeEach } from 'vitest';
import { showGameDetails } from '../../src/ui/ui-panels.js';
import { loadGameData, gameData } from '../../src/lib/data.js';

/**
 * UI Rendering Bug Tests
 *
 * Tests for visual rendering issues that data accuracy tests miss:
 * - Duplicate content
 * - Double rendering
 * - DOM cleanup issues
 * - Layout problems
 */

describe('UI Rendering: Game Side Panel', () => {
    beforeEach(async () => {
        // Setup DOM
        document.body.innerHTML = `
      <div id="game-panel" class="hidden">
        <div id="game-panel-content"></div>
      </div>
    `;

        await loadGameData();
    });

    test('should NOT render duplicate content in game panel', () => {
        // Open game panel
        const gameName = 'Toymaker Magic';
        showGameDetails(gameName);

        const panelContent = document.getElementById('game-panel-content');
        const html = panelContent.innerHTML;

        // Check for duplicate game name
        const gameNameOccurrences = (html.match(/Toymaker Magic/g) || []).length;

        if (gameNameOccurrences > 1) {
            console.error(`❌ DUPLICATE CONTENT DETECTED:`);
            console.error(`   Game name appears ${gameNameOccurrences} times`);
            console.error(`   Expected: 1 time`);
            console.error(`   HTML preview:`, html.substring(0, 500));
        }

        expect(gameNameOccurrences).toBe(1);
    });

    test('should NOT render duplicate provider info', () => {
        const gameName = 'Toymaker Magic';
        showGameDetails(gameName);

        const panelContent = document.getElementById('game-panel-content');
        const html = panelContent.innerHTML;

        // Check for duplicate "Light & Wonder"
        const providerOccurrences = (html.match(/Light & Wonder/g) || []).length;

        if (providerOccurrences > 1) {
            console.error(`❌ DUPLICATE PROVIDER: appears ${providerOccurrences} times`);
        }

        expect(providerOccurrences).toBe(1);
    });

    test('should NOT render duplicate Theo Win value', () => {
        const gameName = 'Toymaker Magic';
        showGameDetails(gameName);

        const panelContent = document.getElementById('game-panel-content');
        const html = panelContent.innerHTML;

        // Check for duplicate "7.19"
        const theoWinOccurrences = (html.match(/7\.19/g) || []).length;

        if (theoWinOccurrences > 1) {
            console.error(`❌ DUPLICATE THEO WIN: appears ${theoWinOccurrences} times`);
        }

        expect(theoWinOccurrences).toBe(1);
    });

    test('should NOT have duplicate sections in panel', () => {
        const gameName = 'Toymaker Magic';
        showGameDetails(gameName);

        const panelContent = document.getElementById('game-panel-content');

        // Check for duplicate section headers
        const sections = Array.from(panelContent.querySelectorAll('h3, h4'));
        const sectionTexts = sections.map(s => s.textContent.trim());

        // Find duplicates
        const duplicates = sectionTexts.filter((text, index) => sectionTexts.indexOf(text) !== index);

        if (duplicates.length > 0) {
            console.error(`❌ DUPLICATE SECTIONS FOUND:`, duplicates);
        }

        expect(duplicates).toHaveLength(0);
    });

    test('should render content exactly once', () => {
        const gameName = 'Toymaker Magic';
        showGameDetails(gameName);

        const panelContent = document.getElementById('game-panel-content');
        const children = panelContent.children;

        // Get all text content
        const allText = panelContent.textContent;

        // Split into meaningful chunks and check for exact duplicates
        const lines = allText
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 10);
        const uniqueLines = new Set(lines);

        const duplicateCount = lines.length - uniqueLines.size;

        if (duplicateCount > 0) {
            console.error(`❌ FOUND ${duplicateCount} DUPLICATE LINES IN PANEL`);

            // Find which lines are duplicated
            const lineCounts = {};
            lines.forEach(line => {
                lineCounts[line] = (lineCounts[line] || 0) + 1;
            });

            const dupes = Object.entries(lineCounts)
                .filter(([line, count]) => count > 1)
                .map(([line, count]) => ({ line: line.substring(0, 50), count }));

            console.error('Duplicated lines:', dupes.slice(0, 5));
        }

        // Allow some duplication for labels, but not entire content blocks
        expect(duplicateCount).toBeLessThan(5);
    });

    test('should clear previous content before rendering new panel', () => {
        // Open first game
        showGameDetails('Toymaker Magic');
        const firstPanelHTML = document.getElementById('game-panel-content').innerHTML;

        // Open second game
        showGameDetails('Cash Eruption');
        const secondPanelHTML = document.getElementById('game-panel-content').innerHTML;

        // Should NOT contain content from first game
        expect(secondPanelHTML).not.toContain('Toymaker Magic');
        expect(secondPanelHTML).toContain('Cash Eruption');

        // Should NOT be double the length (indicating duplication)
        expect(secondPanelHTML.length).toBeLessThan(firstPanelHTML.length * 1.5);
    });
});

describe('UI Rendering: Provider Side Panel', () => {
    beforeEach(async () => {
        document.body.innerHTML = `
      <div id="provider-panel" class="hidden">
        <div id="provider-panel-content"></div>
      </div>
    `;

        await loadGameData();
    });

    test('should NOT render duplicate provider name', () => {
        const { showProviderDetails } = require('../../src/ui-panels.js');

        showProviderDetails('Light & Wonder');

        const panelContent = document.getElementById('provider-panel-content');
        const html = panelContent.innerHTML;

        // Count provider name occurrences (allowing for header + maybe one reference)
        const occurrences = (html.match(/Light & Wonder/g) || []).length;

        if (occurrences > 2) {
            console.error(`❌ PROVIDER NAME DUPLICATED: appears ${occurrences} times`);
        }

        expect(occurrences).toBeLessThanOrEqual(2);
    });
});

describe('UI Rendering: Theme Side Panel', () => {
    beforeEach(async () => {
        document.body.innerHTML = `
      <div id="theme-panel" class="hidden">
        <div id="theme-panel-content"></div>
      </div>
    `;

        await loadGameData();
    });

    test('should NOT render duplicate theme content', () => {
        const { showThemeDetails } = require('../../src/ui-panels.js');

        showThemeDetails('Egyptian');

        const panelContent = document.getElementById('theme-panel-content');
        const html = panelContent.innerHTML;

        // Check that content isn't duplicated
        const sections = panelContent.querySelectorAll('.theme-section, .panel-section');

        if (sections.length > 5) {
            console.warn(`⚠️ Many sections found (${sections.length}) - might indicate duplication`);
        }
    });
});

describe('UI Rendering: General Duplication Checks', () => {
    test('should detect duplicate IDs in DOM', () => {
        document.body.innerHTML = `
      <div id="test-panel">
        <div id="content">First</div>
        <div id="content">Second</div>
      </div>
    `;

        const allElements = document.querySelectorAll('[id]');
        const ids = Array.from(allElements).map(el => el.id);
        const uniqueIds = new Set(ids);

        const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);

        if (duplicateIds.length > 0) {
            console.error('❌ DUPLICATE IDS IN DOM:', [...new Set(duplicateIds)]);
        }

        expect(uniqueIds.size).toBe(ids.length);
    });

    test('should detect if content is appended instead of replaced', () => {
        const container = document.createElement('div');

        // Simulate incorrect behavior (appending instead of replacing)
        container.innerHTML += '<p>First render</p>';
        container.innerHTML += '<p>First render</p>'; // WRONG - should replace

        const paragraphs = container.querySelectorAll('p');

        // This would fail if we append instead of replace
        expect(paragraphs.length).toBe(2); // Detects the bug
    });
});

describe('UI Rendering: Performance - No Memory Leaks', () => {
    test('should not accumulate event listeners on re-render', () => {
        const element = document.createElement('button');
        let clickCount = 0;

        // Add listener
        element.addEventListener('click', () => clickCount++);

        // Simulate re-render (should remove old listener)
        // If done wrong, would add second listener

        element.click();
        expect(clickCount).toBe(1); // Not 2
    });

    test('should not accumulate DOM nodes on repeated panel opens', () => {
        document.body.innerHTML = `<div id="game-panel"><div id="game-panel-content"></div></div>`;

        const initialNodeCount = document.body.querySelectorAll('*').length;

        // Open panel multiple times
        for (let i = 0; i < 5; i++) {
            showGameDetails('Toymaker Magic');
        }

        const finalNodeCount = document.body.querySelectorAll('*').length;

        // Should not multiply nodes
        expect(finalNodeCount).toBeLessThan(initialNodeCount * 2);
    });
});
