import {
    renderXRayPanel,
    renderYearSummary,
    renderAggregateExplanation,
    renderDimensionYearSummary,
} from '../ui/renderers/xray-panel.js';

let xrayActive = false;

export function setupXRay() {
    xrayActive = false;
    window.xrayActive = false;

    injectIndicator();
    injectHamburgerItem();
    watchPageChanges();

    document.addEventListener('click', e => {
        const panel = document.getElementById('xray-panel');
        if (!panel || panel.style.right !== '0px') return;
        if (e.target.closest('#xray-panel')) return;
        if (e.target.closest('#xray-menu-btn')) return;
        if (e.target.closest('[data-xray]')) return;
        const backdrop = document.getElementById('mechanic-backdrop');
        if (
            e.target === backdrop ||
            (!e.target.closest('#mechanic-panel, #theme-panel, #game-panel, #provider-panel') &&
                !isControlElement(e.target))
        ) {
            window.closeXRayPanel();
        }
    });

    document.addEventListener(
        'click',
        e => {
            const shouldIntercept = xrayActive || e.metaKey || e.ctrlKey;
            if (!shouldIntercept) return;

            // Don't intercept clicks on controls/nav/X-Ray panel itself
            if (isControlElement(e.target)) return;

            // Strategy 1: explicit data-xray attribute
            const xrayEl = findXRayTarget(e.target);
            if (xrayEl) {
                e.preventDefault();
                e.stopImmediatePropagation();
                openFromAttribute(xrayEl);
                return;
            }

            // Strategy 2: onclick attribute → game/provider/theme
            const onclickCtx = extractFromOnclick(e.target);
            if (onclickCtx) {
                e.preventDefault();
                e.stopImmediatePropagation();
                if (onclickCtx.game) {
                    openXRayPanel(onclickCtx.game, onclickCtx.field);
                } else if (onclickCtx.dimension) {
                    openXRayForDimension(onclickCtx.dimension, onclickCtx.value);
                }
                return;
            }

            // Strategy 3: Chart.js canvas click → identify bar/segment
            const chartCtx = extractFromChart(e);
            if (chartCtx) {
                e.preventDefault();
                e.stopImmediatePropagation();
                openXRayForDimension(chartCtx.dimension, chartCtx.value, null, chartCtx.year);
                return;
            }

            // Strategy 4: infer from DOM context (table row, panel, card)
            const domCtx = extractFromDOMContext(e.target);
            if (domCtx) {
                e.preventDefault();
                e.stopImmediatePropagation();
                if (domCtx.game) {
                    openXRayPanel(domCtx.game, domCtx.field);
                } else if (domCtx.dimension) {
                    openXRayForDimension(domCtx.dimension, domCtx.value);
                }
                return;
            }
        },
        true
    );

    document.addEventListener('keydown', e => {
        if (e.metaKey || e.ctrlKey) document.body.classList.add('xray-cmd-held');
    });
    document.addEventListener('keyup', () => document.body.classList.remove('xray-cmd-held'));
    window.addEventListener('blur', () => document.body.classList.remove('xray-cmd-held'));
}

// ── Elements to NEVER intercept ──────────────────────────

function isControlElement(el) {
    if (!el) return true;
    const skip =
        el.closest('#xray-panel') ||
        el.closest('#xray-menu-btn') ||
        el.closest('#hamburger-dropdown') ||
        el.closest('#dark-mode-toggle') ||
        el.closest('#dm-injected') ||
        el.closest('.collapse-btn') ||
        el.closest('#sidebar nav') ||
        el.closest('#feedback-modal') ||
        el.closest('.pagination-controls') ||
        el.closest('select') ||
        el.closest('input');
    return !!skip;
}

// ── Strategy 1: data-xray attribute ─────────────────────

function findXRayTarget(target) {
    if (!target || typeof target.closest !== 'function') return null;
    const el = target.closest('[data-xray]');
    if (el) return el;
    const parent = target.closest('td, div, span, th, button, a');
    if (parent) return parent.querySelector('[data-xray]') || null;
    return null;
}

function openFromAttribute(el) {
    try {
        const raw = el.dataset.xray;
        if (raw.startsWith('{')) {
            const info = JSON.parse(raw);
            if (info.metric) {
                openXRayForAggregate(info);
            } else if (info.dimension) {
                openXRayForDimension(info.dimension, info.value, info.rank);
            } else if (info.featureName) {
                openXRayPanel(info.game, 'features', { featureName: info.featureName });
            } else {
                openXRayPanel(info.game, info.field);
            }
        } else {
            openXRayPanel(raw, null);
        }
    } catch {
        openXRayPanel(el.dataset.xray, null);
    }
}

function openXRayForAggregate(info) {
    if (window.closeAllPanels) window.closeAllPanels('xray-panel');
    const panel = document.getElementById('xray-panel');
    if (!panel) return;
    const backdrop = document.getElementById('mechanic-backdrop');
    const content = document.getElementById('xray-panel-content');
    panel.style.right = '0px';
    if (backdrop) {
        backdrop.classList.remove('hidden');
        backdrop.classList.add('block');
    }
    if (content) renderAggregateExplanation(content, info);
}

// ── Strategy 2: onclick attribute parsing ───────────────

const GAME_RE = /showGameDetails\(\s*'((?:[^'\\]|\\.)*)'\s*\)/;
const PROV_RE = /showProviderDetails\(\s*'((?:[^'\\]|\\.)*)'\s*\)/;
const THEME_RE = /showThemeDetails\(\s*'((?:[^'\\]|\\.)*)'\s*\)/;
const MECH_RE = /showMechanicDetails\(\s*'((?:[^'\\]|\\.)*)'\s*\)/;
const VOL_RE = /showVolatilityDetails\(\s*'((?:[^'\\]|\\.)*)'\s*\)/;
const RTP_BAND_RE = /showRtpBandDetails\(\s*'((?:[^'\\]|\\.)*)'\s*\)/;
const ART_THEME_RE = /showArtTheme\(\s*'((?:[^'\\]|\\.)*)'\s*\)/;
const ART_MOOD_RE = /showArtMood\(\s*'((?:[^'\\]|\\.)*)'\s*\)/;
const ART_CHAR_RE = /showArtCharacter\(\s*'((?:[^'\\]|\\.)*)'\s*\)/;
const ART_ELEM_RE = /showArtElement\(\s*'((?:[^'\\]|\\.)*)'\s*\)/;
const ART_NARR_RE = /showArtNarrative\(\s*'((?:[^'\\]|\\.)*)'\s*\)/;
const ART_RECIPE_RE = /showArtRecipe\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)/;

function extractFromOnclick(target) {
    if (!target || typeof target.closest !== 'function') return null;
    let el = target;
    for (let i = 0; i < 6 && el && el !== document.body; i++) {
        const onclick = el.getAttribute?.('onclick') || '';
        if (onclick) {
            const gm = onclick.match(GAME_RE);
            if (gm) return { game: unesc(gm[1]), field: null };

            const pm = onclick.match(PROV_RE);
            if (pm) {
                const row = el.closest('tr');
                const rowGame = findGameInRow(row);
                if (rowGame) return { game: rowGame, field: 'provider' };
                return { dimension: 'provider', value: unesc(pm[1]) };
            }

            const tm = onclick.match(THEME_RE);
            if (tm) {
                const row = el.closest('tr');
                const rowGame = findGameInRow(row);
                if (rowGame) return { game: rowGame, field: 'theme_primary' };
                return { dimension: 'theme', value: unesc(tm[1]) };
            }

            const mm = onclick.match(MECH_RE);
            if (mm) {
                const row = el.closest('tr');
                const rowGame = findGameInRow(row);
                if (rowGame) return { game: rowGame, field: null };
                return { dimension: 'feature', value: unesc(mm[1]) };
            }

            const vm = onclick.match(VOL_RE);
            if (vm) return { dimension: 'volatility', value: unesc(vm[1]) };

            const rm = onclick.match(RTP_BAND_RE);
            if (rm) return { dimension: 'rtp', value: unesc(rm[1]) };

            const artS = onclick.match(ART_THEME_RE);
            if (artS) return { dimension: 'art_theme', value: unesc(artS[1]) };

            const artM = onclick.match(ART_MOOD_RE);
            if (artM) return { dimension: 'art_mood', value: unesc(artM[1]) };

            const artC = onclick.match(ART_CHAR_RE);
            if (artC) return { dimension: 'art_characters', value: unesc(artC[1]) };

            const artE = onclick.match(ART_ELEM_RE);
            if (artE) return { dimension: 'art_elements', value: unesc(artE[1]) };

            const artN = onclick.match(ART_NARR_RE);
            if (artN) return { dimension: 'art_narrative', value: unesc(artN[1]) };

            const artR = onclick.match(ART_RECIPE_RE);
            if (artR) return { dimension: 'art_theme', value: unesc(artR[1]) };
        }
        el = el.parentElement;
    }
    return null;
}

function findGameInRow(row) {
    if (!row) return null;
    for (const cell of row.querySelectorAll('td[onclick]')) {
        const m = (cell.getAttribute('onclick') || '').match(GAME_RE);
        if (m) return unesc(m[1]);
    }
    const xrayEl = row.querySelector('[data-xray]');
    if (xrayEl) {
        try {
            return JSON.parse(xrayEl.dataset.xray).game;
        } catch {
            return xrayEl.dataset.xray;
        }
    }
    return null;
}

// ── Strategy 3: Chart.js canvas click ───────────────────

function extractFromChart(e) {
    const canvas = e.target.closest('canvas');
    if (!canvas) return null;
    try {
        const Chart = window.Chart || canvas._chartjs?.chart?.constructor;
        if (!Chart?.getChart) return null;
        const chart = Chart.getChart(canvas);
        if (!chart) return null;

        let elements = chart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, true);
        if (!elements.length) {
            elements = chart.getElementsAtEventForMode(e, 'nearest', { intersect: false }, true);
        }
        if (!elements.length) return null;

        const el = elements[0];
        const datasetLabel = chart.data.datasets[el.datasetIndex]?.label || '';
        const dataPoint = chart.data.datasets[el.datasetIndex]?.data?.[el.index];
        let label = chart.data.labels?.[el.index] || dataPoint?._label;
        if (!label) label = datasetLabel;
        if (!label) return null;

        // Skip cluster bubbles ("+N" aggregate labels in brand-landscape)
        if (/^\+\d+$/.test(label)) return null;

        const canvasId = canvas.id || '';
        const ctx = canvasId + ' ' + datasetLabel;
        let dimension = null;
        let useDatasetLabel = false;
        let trendYear = null;

        if (canvasId === 'theme-trend-chart') {
            dimension = 'theme';
            useDatasetLabel = true;
            trendYear = chart.data.labels?.[el.index];
        } else if (canvasId === 'mechanic-trend-chart') {
            dimension = 'feature';
            useDatasetLabel = true;
            trendYear = chart.data.labels?.[el.index];
        } else if (canvasId === 'provider-trend-chart') {
            dimension = 'provider';
            useDatasetLabel = true;
            trendYear = chart.data.labels?.[el.index];
        } else if (/trend/i.test(ctx)) {
            dimension = 'year';
        } else if (/art-opportunity|art-themes-chart|chart-art-themes/i.test(canvasId)) {
            dimension = 'art_theme';
        } else if (canvasId === 'art-mood-chart') {
            dimension = 'art_mood';
        } else if (canvasId === 'art-characters-chart') {
            dimension = 'art_characters';
        } else if (canvasId === 'art-elements-chart') {
            dimension = 'art_elements';
        } else if (canvasId === 'art-narrative-chart') {
            dimension = 'art_narrative';
        } else if (/art-trend/i.test(canvasId)) {
            const dimSelect = document.getElementById('art-trend-dimension');
            const activeDim = dimSelect?.value || 'environment';
            const dimMap = {
                environment: 'art_theme',
                mood: 'art_mood',
                elements: 'art_elements',
                characters: 'art_characters',
                narrative: 'art_narrative',
            };
            dimension = dimMap[activeDim] || 'art_theme';
            useDatasetLabel = true;
            trendYear = chart.data.labels?.[el.index];
        } else if (/provider/i.test(ctx)) {
            dimension = 'provider';
        } else if (/vol/i.test(ctx)) {
            dimension = 'volatility';
        } else if (/rtp/i.test(ctx)) {
            dimension = 'rtp';
        } else if (/mechanic|feature/i.test(ctx)) {
            dimension = 'feature';
        } else if (/brand|franchise/i.test(ctx)) {
            dimension = 'franchise';
        } else if (/theme/i.test(ctx)) {
            dimension = 'theme';
        } else if (/game|scatter|landscape|market/i.test(ctx)) {
            dimension = 'game';
        }

        if (!dimension) return null;

        if (useDatasetLabel && datasetLabel) label = datasetLabel;

        // Strip emoji prefixes (but NOT digits/# which Unicode tags as Emoji)
        label = label.replace(/^(?:[^\w\d#]|\p{Emoji_Presentation}|\p{Extended_Pictographic})+/u, '').trim();
        if (dimension === 'volatility') label = label.replace(/\s*Volatility$/i, '').trim();
        if (dimension === 'rtp') label = label.replace(/^RTP\s*/i, '').trim();

        if (!label) return null;
        if (dimension === 'game') return { dimension: 'game', value: label };
        const result = { dimension, value: label };
        if (trendYear) result.year = trendYear;
        return result;
    } catch {
        return null;
    }
}

// ── Strategy 4: DOM context inference ───────────────────

const NOISE_WORDS = new Set([
    'providers',
    'themes',
    'mechanics',
    'features',
    'games',
    'overview',
    'insights',
    'trends',
    'all',
    'total',
    'avg',
    'count',
    'filter',
    'sort',
    'search',
    'loading',
    'no data',
    'n/a',
]);

function extractFromDOMContext(target) {
    if (!target || typeof target.closest !== 'function') return null;
    const text = (target.textContent || '').trim();
    if (!text || text.length > 120) return null;

    // Skip headings, nav, footer, and generic UI labels
    if (target.closest('h1, h2, h3, h4, h5, h6') && !/\d/.test(text)) return null;
    if (target.closest('nav, footer, header, label, legend')) return null;
    if (NOISE_WORDS.has(text.toLowerCase())) return null;

    // Inside a game panel → extract game name from panel title
    const gamePanel = target.closest('#game-panel');
    if (gamePanel) {
        const title = gamePanel.querySelector('#game-panel-title');
        if (title) {
            const gameName = (title.textContent || '').replace(/X-Ray$/i, '').trim();
            if (gameName) return { game: gameName, field: guessFieldFromText(text, target) };
        }
    }

    // Inside a provider panel → find provider name from title
    const provPanel = target.closest('#provider-panel');
    if (provPanel) {
        const title = provPanel.querySelector('#provider-panel-title');
        if (title) return { dimension: 'provider', value: title.textContent.trim() };
    }

    // Inside a theme/detail panel (shared panel used by themes, brands, volatility, RTP bands)
    const themePanel = target.closest('#theme-panel');
    if (themePanel) {
        const title = themePanel.querySelector('#theme-panel-title');
        if (title) {
            const raw = title.textContent.trim();
            if (raw.startsWith('Brand:')) return { dimension: 'franchise', value: raw.replace('Brand:', '').trim() };
            if (raw.startsWith('RTP:')) return { dimension: 'rtp', value: raw.replace('RTP:', '').trim() };
            if (raw.endsWith('Volatility'))
                return { dimension: 'volatility', value: raw.replace(/\s*Volatility$/, '').trim() };
            return { dimension: 'theme', value: raw };
        }
    }

    // Inside a mechanic panel
    const mechPanel = target.closest('#mechanic-panel');
    if (mechPanel) {
        const title = mechPanel.querySelector('#mechanic-panel-title');
        if (title) return { dimension: 'feature', value: title.textContent.trim() };
    }

    // Table row → try to find game context or identify dimension rows
    const row = target.closest('tr');
    if (row) {
        const game = findGameInRow(row);
        if (game) return { game, field: guessFieldFromText(text, target) };

        if (
            row.closest('#themes-table') &&
            (row.classList.contains('theme-row') || row.classList.contains('sub-theme-row'))
        ) {
            const cells = row.querySelectorAll('td');
            const name = cells[1]?.textContent?.trim();
            if (name) return { dimension: 'theme', value: name };
        }
        if (row.closest('#mechanics-table')) {
            const cells = row.querySelectorAll('td');
            const name = cells[1]?.textContent?.trim();
            if (name) return { dimension: 'feature', value: name };
        }
        if (row.closest('#providers-table')) {
            const cells = row.querySelectorAll('td');
            const name = cells[1]?.textContent?.trim();
            if (name) return { dimension: 'provider', value: name };
        }
    }

    return null;
}

function guessFieldFromText(text, el) {
    const t = text.trim().toLowerCase();
    const cls = (el.className || '') + ' ' + (el.parentElement?.className || '');

    // RTP: percentage + context hint
    if (/^\d{2,3}(\.\d+)?%$/.test(text.trim()) && (t.includes('rtp') || cls.includes('rtp'))) return 'rtp';

    // Market share: percentage + context hint
    if (/^\d+(\.\d+)?%$/.test(text.trim()) && (t.includes('share') || cls.includes('share') || cls.includes('market')))
        return 'market_share';

    // Volatility: only when it's the full cell content (not part of a sentence)
    if (/^(high|medium|low|very\s*high|med-high|low-medium)$/i.test(text.trim())) return 'volatility';

    // Year: standalone 4-digit year
    const yearMatch = text.trim().match(/^(\d{4})$/);
    if (yearMatch) {
        const y = parseInt(yearMatch[1]);
        if (y > 1990 && y < 2030) return 'release_year';
    }

    // Theo win: decimal like 29.57 (not a percentage, not a year)
    if (/^\d+\.\d{2}$/.test(text.trim()) && !t.includes('%')) return 'theo_win';

    return null;
}

// ── Dimension-level X-Ray (for charts, providers, themes) ──

async function openXRayForDimension(dimension, value, tableRank, trendYear) {
    if (!value) return;

    if (dimension === 'game') {
        openXRayPanel(value, 'theo_win');
        return;
    }

    if (dimension === 'year') {
        if (window.closeAllPanels) window.closeAllPanels('xray-panel');
        const panel = document.getElementById('xray-panel');
        if (!panel) return;
        const backdrop = document.getElementById('mechanic-backdrop');
        const content = document.getElementById('xray-panel-content');
        panel.style.right = '0px';
        if (backdrop) {
            backdrop.classList.remove('hidden');
            backdrop.classList.add('block');
        }
        const allGames = window.gameData?.allGames || [];
        const year = parseInt(value, 10);
        if (content) renderYearSummary(content, year, allGames);
        return;
    }

    if (window.closeAllPanels) window.closeAllPanels('xray-panel');

    const panel = document.getElementById('xray-panel');
    if (!panel) return;
    const backdrop = document.getElementById('mechanic-backdrop');
    const content = document.getElementById('xray-panel-content');

    // Trend chart click: render dimension+year stats client-side, no server call
    if (trendYear) {
        panel.style.right = '0px';
        if (backdrop) {
            backdrop.classList.remove('hidden');
            backdrop.classList.add('block');
        }
        const allGames = window.gameData?.allGames || [];
        if (content) renderDimensionYearSummary(content, dimension, value, parseInt(trendYear, 10), allGames);
        return;
    }

    if (content) content.innerHTML = '<div class="text-center py-8 text-gray-500">Loading…</div>';
    panel.style.right = '0px';
    if (backdrop) {
        backdrop.classList.remove('hidden');
        backdrop.classList.add('block');
    }

    const yearParam = trendYear ? `&year=${encodeURIComponent(trendYear)}` : '';
    try {
        const resp = await fetch(
            `/api/data/provenance/top-game?dimension=${encodeURIComponent(dimension)}&value=${encodeURIComponent(value)}${yearParam}`,
            { credentials: 'include' }
        );
        if (resp.ok) {
            const data = await resp.json();
            if (data.gameName) {
                const extra = {};
                if (data.ranking) {
                    extra.ranking = { ...data.ranking, dimension, value };
                    if (tableRank != null) extra.ranking.tableRank = tableRank;
                    if (trendYear) extra.ranking.trendYear = trendYear;
                }
                openXRayPanel(data.gameName, null, extra);
                return;
            }
        }
    } catch {
        // fallback toast
    }

    if (content) {
        content.innerHTML = `<div class="text-center py-8 space-y-3">
            <div class="text-indigo-400 text-sm font-medium capitalize">${dimension}: ${escHtml(value)}</div>
            <div class="text-gray-300 text-sm">No games found matching "${escHtml(value)}" in ${escHtml(dimension)}.</div>
            <div class="text-gray-400 text-xs">Try clicking directly on a game name, RTP value, or other data field in the table.</div>
        </div>`;
    }
}

function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Persistent on-screen indicator ──────────────────────

function injectIndicator() {
    if (document.getElementById('xray-indicator')) return;
    const el = document.createElement('div');
    el.id = 'xray-indicator';
    el.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/></svg>X-RAY`;
    document.body.appendChild(el);
}

// ── Hamburger menu injection ────────────────────────────

function injectHamburgerItem() {
    const dropdown = document.getElementById('hamburger-dropdown');
    if (!dropdown || dropdown.querySelector('#xray-menu-btn')) return;

    const divider = document.createElement('div');
    divider.className = 'border-t border-gray-200 dark:border-gray-700 my-1';
    dropdown.appendChild(divider);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'xray-menu-btn';
    btn.className =
        'w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center gap-2 cursor-pointer';
    btn.innerHTML = `<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/></svg>Data X-Ray <span id="xray-badge" class="${xrayActive ? '' : 'hidden'} ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500 text-white font-bold">ON</span>`;
    btn.addEventListener('click', () => toggleXRay());
    dropdown.appendChild(btn);
}

function watchPageChanges() {
    const container = document.getElementById('page-container');
    if (!container) return;
    const obs = new MutationObserver(() => injectHamburgerItem());
    obs.observe(container, { childList: true, subtree: false });
}

// ── Toggle / activate / deactivate ──────────────────────

function toggleXRay() {
    xrayActive = !xrayActive;
    if (xrayActive) activateXRay(false);
    else deactivateXRay();
}

function activateXRay(silent) {
    xrayActive = true;
    window.xrayActive = true;
    document.body.classList.add('xray-active');
    const badge = document.getElementById('xray-badge');
    if (badge) badge.classList.remove('hidden');
    if (!silent) showToast('X-Ray ON — click any data element to inspect its provenance');
}

function deactivateXRay() {
    xrayActive = false;
    window.xrayActive = false;
    document.body.classList.remove('xray-active', 'xray-cmd-held');
    const badge = document.getElementById('xray-badge');
    if (badge) badge.classList.add('hidden');
    showToast('X-Ray OFF');
}

// ── Panel open / close ──────────────────────────────────

async function openXRayPanel(gameName, focusField, extraData) {
    if (!gameName) return;
    if (window.closeAllPanels) window.closeAllPanels('xray-panel');

    const panel = document.getElementById('xray-panel');
    if (!panel) {
        console.warn('[X-Ray] #xray-panel not in DOM');
        return;
    }

    const backdrop = document.getElementById('mechanic-backdrop');
    const content = document.getElementById('xray-panel-content');
    if (content) content.innerHTML = '<div class="text-center py-8 text-gray-500">Loading provenance…</div>';
    panel.style.right = '0px';
    if (backdrop) {
        backdrop.classList.remove('hidden');
        backdrop.classList.add('block');
    }

    try {
        const qs = focusField ? `?field=${encodeURIComponent(focusField)}` : '';
        const resp = await fetch(`/api/data/provenance/${encodeURIComponent(gameName)}${qs}`, {
            credentials: 'include',
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (extraData) Object.assign(data, extraData);
        renderXRayPanel(data, focusField);
    } catch (err) {
        console.error('[X-Ray]', err);
        if (content) {
            content.innerHTML = `<div class="text-center py-8 space-y-3">
                <div class="text-red-400 text-sm font-medium">Failed to load provenance</div>
                <div class="text-gray-500 text-xs">${escHtml(err.message)}</div>
                <div class="text-gray-600 text-xs">Restart the server to load the provenance API endpoints.</div>
            </div>`;
        }
    }
}

window.closeXRayPanel = function () {
    const panel = document.getElementById('xray-panel');
    const backdrop = document.getElementById('mechanic-backdrop');
    if (panel) panel.style.right = '-650px';
    if (backdrop) {
        backdrop.classList.add('hidden');
        backdrop.classList.remove('block');
    }
};

window.openXRayPanel = openXRayPanel;

function showToast(msg) {
    const existing = document.getElementById('xray-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'xray-toast';
    toast.className =
        'fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2 rounded-lg bg-gray-800/90 backdrop-blur text-sm text-white shadow-lg transition-opacity duration-500';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500);
    }, 2500);
}

function unesc(s) {
    return s.replace(/\\'/g, "'").replace(/\\x3c/gi, '<').replace(/\\x3e/gi, '>').replace(/\\\\/g, '\\');
}
