import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const overviewPath = resolve(__dirname, '../../src/pages/overview.html');
const uiPanelsPath = resolve(__dirname, '../../src/ui/ui-panels.js');
const panelDetailsPath = resolve(__dirname, '../../src/ui/panel-details.js');
const insightsFranchisesPath = resolve(__dirname, '../../src/ui/renderers/insights-franchises.js');
const insightsRecipesPath = resolve(__dirname, '../../src/ui/renderers/insights-recipes.js');

describe('Tooltip Positioning – no fixed tooltips', () => {
    test('overview.html uses no fixed tooltips', () => {
        const html = readFileSync(overviewPath, 'utf8');
        expect(html).not.toContain('group-hover:block fixed');
    });

    test('ui-panels.js uses no fixed tooltips', () => {
        const src = readFileSync(uiPanelsPath, 'utf8');
        expect(src).not.toContain('group-hover:block fixed');
    });

    test('panel-details.js uses no fixed tooltips', () => {
        const src = readFileSync(panelDetailsPath, 'utf8');
        expect(src).not.toContain('group-hover:block fixed');
    });

    test('insights-franchises.js uses no fixed tooltips', () => {
        const src = readFileSync(insightsFranchisesPath, 'utf8');
        expect(src).not.toContain('group-hover:block fixed');
    });

    test('insights-recipes.js uses no fixed tooltips', () => {
        const src = readFileSync(insightsRecipesPath, 'utf8');
        expect(src).not.toContain('group-hover:block fixed');
    });

    test('overview.html tooltips all use absolute positioning', () => {
        const html = readFileSync(overviewPath, 'utf8');
        const tooltips = html.match(/group-hover:block\s+absolute/g) || [];
        expect(tooltips.length).toBe(11);
    });

    test('ui-panels.js tooltip uses absolute positioning with cursor-help', () => {
        const src = readFileSync(uiPanelsPath, 'utf8');
        const vsThemePeersTooltip = src.includes('group-hover:block absolute right-0 top-full mt-1');
        expect(vsThemePeersTooltip).toBe(true);
        expect(src).toContain('cursor-help');
    });

    test('all tooltip ? buttons use cursor-help', () => {
        const src = readFileSync(uiPanelsPath, 'utf8');
        const questionBtns = src.match(/font-bold leading-none[^>]*>(\?|&#63;)<\/button>/g) || [];
        questionBtns.forEach(btn => {
            expect(btn).toContain('cursor-help');
        });
    });
});
