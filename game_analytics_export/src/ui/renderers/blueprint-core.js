/**
 * Game Blueprint Advisor — interactive theme + feature selection tool
 * with live scoring, recipe analysis, competition, and symbol suggestions.
 */
import { gameData } from '../../lib/data.js';
import { F } from '../../lib/game-fields.js';
import { escapeHtml, escapeAttr } from '../../lib/sanitize.js';
import { parseFeatures as parseFeatsLocal } from '../../lib/parse-features.js';
import { getReelGridCorrelation } from '../../lib/game-analytics-engine.js';
import { parseSymbols } from '../../lib/symbol-utils.js';
import { renderFeaturePills, renderSynergyPanel, renderInsightsTab } from './blueprint-insights.js';
import { renderCompetitionTab } from './blueprint-competition.js';
import { renderSymbolsTab } from './blueprint-symbols.js';

export function initBlueprint() {
    let blueprintWrapper = document.getElementById('blueprint-advisor-wrapper');
    if (!blueprintWrapper) {
        const heatmapSection = document.getElementById('heatmap-container')?.closest('.grid, .bg-white');
        if (heatmapSection) {
            blueprintWrapper = document.createElement('div');
            blueprintWrapper.id = 'blueprint-advisor-wrapper';
            blueprintWrapper.className = 'mb-4';
            heatmapSection.parentNode.insertBefore(blueprintWrapper, heatmapSection);
        }
    }
    if (!blueprintWrapper) return;

    blueprintWrapper.innerHTML = buildBlueprintHTML();

    const allG = gameData.allGames || [];
    const els = getBlueprintElements();
    let activeTab = 'insights';

    const _featCache = new WeakMap();
    function gameFeats(g) {
        let cached = _featCache.get(g);
        if (!cached) {
            cached = parseFeatsLocal(g.features);
            _featCache.set(g, cached);
        }
        return cached;
    }

    const featSet = new Set();
    allG.forEach(g => {
        gameFeats(g).forEach(f => featSet.add(f));
    });
    const FEATS = [...featSet].sort();
    const featureColors = buildTailwindColorMap(FEATS);

    document.querySelectorAll('.bp-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            activeTab = tab.dataset.tab;
            document.querySelectorAll('.bp-tab').forEach(t => {
                const isActive = t.dataset.tab === activeTab;
                t.className = `bp-tab flex items-center gap-1.5 px-5 py-3 text-sm font-bold rounded-t-lg border-b-2 transition-all ${isActive ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'border-transparent bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700/60'}`;
            });
            document.querySelectorAll('.bp-tab-content').forEach(c => c.classList.add('hidden'));
            document.getElementById(`bp-tab-${activeTab}`)?.classList.remove('hidden');
        });
    });

    const themeConsolidationGroups = {};
    allG.forEach(g => {
        const primary = g.theme_primary || '';
        const consolidated = g.theme_consolidated || primary || '';
        if (!consolidated || /^unknown$/i.test(consolidated)) return;
        if (!themeConsolidationGroups[consolidated]) themeConsolidationGroups[consolidated] = { _total: 0, subs: {} };
        themeConsolidationGroups[consolidated]._total++;
        if (primary && primary !== consolidated) {
            themeConsolidationGroups[consolidated].subs[primary] =
                (themeConsolidationGroups[consolidated].subs[primary] || 0) + 1;
        }
    });

    const categoryList = Object.entries(themeConsolidationGroups)
        .map(([cat, data]) => ({
            cat,
            total: data._total,
            subs: Object.entries(data.subs)
                .sort((a, b) => b[1] - a[1])
                .map(([name, count]) => ({ name, count })),
        }))
        .filter(c => c.total >= 5)
        .sort((a, b) => b.total - a.total);

    const selectedCategories = new Set();
    const selectedSubThemes = new Set();
    const selectedFeatures = new Set();
    let selectedLayout = null;
    let suggestPanelOpen = false;
    const globalAvg = allG.length > 0 ? allG.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / allG.length : 0;

    const ideaFeatAliases = {
        'free spin': 'Free Spins',
        freespin: 'Free Spins',
        'free spins': 'Free Spins',
        'bonus spin': 'Free Spins',
        'hold and spin': 'Hold and Spin',
        'hold & spin': 'Hold and Spin',
        'hold & win': 'Hold and Spin',
        'hold and win': 'Hold and Spin',
        'wild reel': 'Wild Reels',
        'wild reels': 'Wild Reels',
        wilds: 'Wild Reels',
        'expanding reel': 'Expanding Reels',
        'expanding reels': 'Expanding Reels',
        'cash on reel': 'Cash On Reels',
        'cash on reels': 'Cash On Reels',
        'cash reels': 'Cash On Reels',
        'cash collect': 'Cash On Reels',
        'cash collection': 'Cash On Reels',
        nudge: 'Nudges',
        nudges: 'Nudges',
        persistence: 'Persistence',
        persistent: 'Persistence',
        'pick bonus': 'Pick Bonus',
        'pick game': 'Pick Bonus',
        'pick and click': 'Pick Bonus',
        'pick feature': 'Pick Bonus',
        respin: 'Respin',
        're-spin': 'Respin',
        respins: 'Respin',
        jackpot: 'Static Jackpot',
        'static jackpot': 'Static Jackpot',
        'fixed jackpot': 'Static Jackpot',
        'wheel bonus': 'Wheel',
        'wheel of fortune': 'Wheel',
        'bonus wheel': 'Wheel',
        multiplier: 'Multiplier',
        multiply: 'Multiplier',
        megaways: 'Megaways',
        'mega ways': 'Megaways',
        cascade: 'Cascading Reels',
        cascading: 'Cascading Reels',
        avalanche: 'Cascading Reels',
        tumble: 'Cascading Reels',
        'buy bonus': 'Buy Bonus',
        'bonus buy': 'Buy Bonus',
        'feature buy': 'Buy Bonus',
        'sticky wild': 'Sticky Wilds',
        'sticky wilds': 'Sticky Wilds',
        'expanding wild': 'Expanding Wilds',
        'expanding wilds': 'Expanding Wilds',
        gamble: 'Gamble Feature',
        'double up': 'Gamble Feature',
        'risk game': 'Gamble Feature',
        mystery: 'Mystery Symbols',
        'mystery symbol': 'Mystery Symbols',
        progressive: 'Progressive Jackpot',
        'progressive jackpot': 'Progressive Jackpot',
        colossal: 'Colossal Symbols',
        'mega symbol': 'Colossal Symbols',
        'giant symbol': 'Colossal Symbols',
        stacked: 'Stacked Symbols',
        'stacked symbol': 'Stacked Symbols',
        'stacked wild': 'Stacked Symbols',
        transform: 'Symbol Transformation',
        'symbol transform': 'Symbol Transformation',
        morph: 'Symbol Transformation',
    };

    function buildIdeaThemeAliases() {
        const map = {};
        categoryList.forEach(c => {
            const lower = c.cat.toLowerCase();
            map[lower] = c.cat;
            lower
                .split(/[\s&/]+/)
                .filter(w => w.length > 2)
                .forEach(w => {
                    map[w] = c.cat;
                });
        });
        map['egypt'] = map['egyptian'] || map['egypt'];
        map['chinese'] = map['asian'] || map['chinese'];
        map['oriental'] = map['asian'] || map['oriental'];
        map['leprechaun'] = map['irish'] || map['leprechaun'];
        map['dragon'] = map['fantasy'] || map['dragon'];
        map['wizard'] = map['fantasy'] || map['wizard'];
        map['pirate'] = map['ocean'] || map['pirate'];
        map['zeus'] = map['greek'] || map['zeus'];
        map['pharaoh'] = map['egyptian'] || map['pharaoh'];
        map['vampire'] = map['horror'] || map['vampire'];
        map['cowboy'] = map['western'] || map['cowboy'];
        map['gem'] = map['wealth'] || map['gem'];
        map['jewel'] = map['wealth'] || map['jewel'];
        map['diamond'] = map['wealth'] || map['diamond'];
        map['cosmic'] = map['space'] || map['cosmic'];
        map['galaxy'] = map['space'] || map['galaxy'];
        map['safari'] = map['animals'] || map['safari'];
        map['fruit'] = map['classic'] || map['fruit'];
        map['retro'] = map['classic'] || map['retro'];
        return map;
    }
    const ideaThemeAliases = buildIdeaThemeAliases();

    function parseIdeaText(text) {
        const lower = (text || '').toLowerCase();
        if (!lower.trim()) return { themes: [], feats: [], keywords: [] };
        const detectedThemes = new Set();
        for (const [alias, theme] of Object.entries(ideaThemeAliases)) {
            if (theme && lower.includes(alias)) detectedThemes.add(theme);
        }
        const detectedFeats = new Set();
        for (const [alias, feat] of Object.entries(ideaFeatAliases)) {
            if (lower.includes(alias)) detectedFeats.add(feat);
        }
        const keywords = lower.split(/[\s,.!?;:]+/).filter(w => w.length > 3);
        return { themes: [...detectedThemes], feats: [...detectedFeats], keywords };
    }

    const ideaSuggestions = [
        'An Egyptian adventure with free spins and expanding wilds',
        'Asian luck theme with hold & win and cash on reels',
        'A fantasy dragon quest with wild reels and free spins',
        'Classic fruit machine with nudges and respin',
        'Underwater treasure hunt with pick bonus and free spins',
        'A wild safari adventure with expanding reels and persistence',
        'Horror vampire theme with sticky wilds and wheel bonus',
        'Greek mythology epic with expanding reels and free spins',
        'Space exploration with hold & win and cash on reels',
        'Irish Celtic theme with jackpot and wheel of fortune',
        'A Roman empire conquest with wild reels and free spins',
        'Pirate treasure island with free spins and expanding wilds',
        'Aztec temple ruins with cash on reels and expanding reels',
        'Chinese New Year celebration with respins and hold & win',
        'Wild West outlaw theme with hold and spin and persistence',
        'Norse Viking saga with free spins and wild reels',
        'Magical fairy forest with pick bonus and wild reels',
        'Retro arcade game with nudges and respin',
    ];

    let lastParsedUnselectedThemes = [];
    let lastParsedUnselectedFeats = [];

    function updateIdeaTags() {
        const text = els.ideaTextarea?.value || '';
        const { themes, feats } = parseIdeaText(text);
        if (!els.ideaTags) return;
        if (themes.length === 0 && feats.length === 0) {
            els.ideaTags.innerHTML = '';
            lastParsedUnselectedThemes = [];
            lastParsedUnselectedFeats = [];
            return;
        }
        const unselectedFeats = feats.filter(f => !selectedFeatures.has(f));
        const unselectedThemes = themes.filter(t => !selectedCategories.has(t));
        lastParsedUnselectedThemes = unselectedThemes;
        lastParsedUnselectedFeats = unselectedFeats;

        const tags = [
            ...themes.map(t => {
                const match = selectedCategories.has(t);
                return `<span class="inline-flex px-2 py-0.5 mr-1 mb-1 text-[10px] font-semibold rounded-full ${match ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}">${match ? '✓' : '✗'} ${escapeHtml(t)}</span>`;
            }),
            ...feats.map(f => {
                const match = selectedFeatures.has(f);
                return `<span class="inline-flex px-2 py-0.5 mr-1 mb-1 text-[10px] font-semibold rounded-full ${match ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}">${match ? '✓' : '✗'} ${escapeHtml(f)}</span>`;
            }),
        ];
        let hint = '';
        if (unselectedFeats.length > 0 || unselectedThemes.length > 0) {
            const missing = [...unselectedThemes, ...unselectedFeats];
            hint = `<div class="w-full flex items-center gap-2 mt-1">
                <span class="text-[10px] text-red-500 dark:text-red-400">Tip: select ${missing.map(f => '<strong>' + escapeHtml(f) + '</strong>').join(', ')} to boost your score</span>
                <button type="button" id="bp-idea-apply" class="shrink-0 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-sm cursor-pointer">Apply</button>
            </div>`;
        }
        els.ideaTags.innerHTML = tags.join('') + hint;

        const applyBtn = document.getElementById('bp-idea-apply');
        if (applyBtn) {
            applyBtn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                applyIdeaSelections();
            });
        }
    }

    function applyIdeaSelections() {
        const themesToAdd = lastParsedUnselectedThemes.filter(t => !selectedCategories.has(t));
        const featsToAdd = [...lastParsedUnselectedFeats];
        const existingFeats = [...selectedFeatures];

        if (themesToAdd.length === 0 && featsToAdd.length === 0) return;

        themesToAdd.forEach(t => selectedCategories.add(t));
        if (themesToAdd.length > 0) {
            selectedSubThemes.clear();
            selectedFeatures.clear();
            existingFeats.forEach(f => selectedFeatures.add(f));
        }
        featsToAdd.forEach(f => selectedFeatures.add(f));
        refreshCategoryUI();
        updateIdeaTags();
    }

    const knownKeywords = [
        ...Object.keys(ideaThemeAliases).filter(k => k.length > 2),
        ...Object.keys(ideaFeatAliases).filter(k => k.length > 3),
        'adventure',
        'themed',
        'slot',
        'game',
        'with',
        'and',
        'featuring',
        'high volatility',
        'medium volatility',
        'low volatility',
        'bonus',
        'scatter',
        'symbol',
        'reel',
        'reels',
        'spin',
        'spins',
    ];

    function editDistance(a, b) {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;
        const matrix = [];
        for (let i = 0; i <= b.length; i++) matrix[i] = [i];
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + (b[i - 1] === a[j - 1] ? 0 : 1)
                );
            }
        }
        return matrix[b.length][a.length];
    }

    function findCorrection(word) {
        if (word.length < 3) return null;
        let best = null,
            bestDist = Infinity;
        for (const kw of knownKeywords) {
            if (kw.includes(' ')) continue;
            if (kw.startsWith(word)) return { correction: kw, type: 'complete' };
            const dist = editDistance(word, kw);
            const threshold = word.length <= 4 ? 1 : 2;
            if (dist <= threshold && dist < bestDist) {
                bestDist = dist;
                best = kw;
            }
        }
        return best ? { correction: best, type: 'fix' } : null;
    }

    let pendingCorrection = null;

    function lastIndexOfCI(haystack, needle) {
        const h = haystack.toLowerCase();
        return h.lastIndexOf(needle.toLowerCase());
    }

    function updateIdeaSuggestions() {
        const sugDiv = document.getElementById('bp-idea-suggestions');
        if (!sugDiv || !els.ideaTextarea) return;
        const rawText = els.ideaTextarea.value || '';
        const text = rawText.trim().toLowerCase();
        if (text.length < 2) {
            sugDiv.classList.add('hidden');
            pendingCorrection = null;
            return;
        }
        const words = text.split(/\s+/).filter(w => w.length > 1);
        const lastWord = words[words.length - 1] || '';

        const corrections = [];
        const completions = [];

        if (lastWord.length >= 2) {
            const lastWordPos = lastIndexOfCI(rawText, lastWord);
            const prefix = lastWordPos >= 0 ? rawText.slice(0, lastWordPos) : rawText + ' ';

            const match = findCorrection(lastWord);
            if (match && match.correction !== lastWord) {
                const correctedText = prefix + match.correction;
                if (match.type === 'fix') {
                    corrections.push({ display: match.correction, original: lastWord, fullText: correctedText });
                } else {
                    completions.push({ display: match.correction, fullText: correctedText });
                }
            }
            knownKeywords
                .filter(t => t.startsWith(lastWord) && t !== lastWord && !t.includes(' '))
                .slice(0, 2)
                .forEach(t => {
                    if (!completions.some(c => c.display === t)) {
                        completions.push({ display: t, fullText: prefix + t });
                    }
                });
        }

        const sentenceMatches = ideaSuggestions
            .filter(s => {
                const sl = s.toLowerCase();
                return words.some(w => w.length > 2 && sl.includes(w));
            })
            .filter(s => s.toLowerCase() !== text)
            .slice(0, 2);

        if (corrections.length === 0 && completions.length === 0 && sentenceMatches.length === 0) {
            sugDiv.classList.add('hidden');
            pendingCorrection = null;
            return;
        }

        const firstSuggestion = corrections[0]?.fullText || completions[0]?.fullText || sentenceMatches[0] || null;
        pendingCorrection = firstSuggestion;

        let html = '';
        corrections.forEach(c => {
            html += `<button type="button" class="bp-idea-sug w-full text-left px-3 py-1.5 text-xs rounded transition-colors truncate bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 font-medium" data-text="${escapeAttr(c.fullText)}">⚡ <s class="opacity-50">${escapeHtml(c.original)}</s> → <strong>${escapeHtml(c.display)}</strong> <span class="text-[10px] opacity-60 ml-1">Tab ↹</span></button>`;
        });
        completions.forEach(c => {
            html += `<button type="button" class="bp-idea-sug w-full text-left px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-600 dark:hover:text-indigo-400 rounded transition-colors truncate" data-text="${escapeAttr(c.fullText)}"><strong>${escapeHtml(c.display)}</strong> <span class="text-[10px] opacity-50 ml-1">Tab ↹</span></button>`;
        });
        if (sentenceMatches.length > 0) {
            if (corrections.length > 0 || completions.length > 0)
                html += '<div class="border-t border-gray-100 dark:border-gray-700 my-0.5"></div>';
            sentenceMatches.forEach((s, i) => {
                html += `<button type="button" class="bp-idea-sug w-full text-left px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-600 dark:hover:text-indigo-400 rounded transition-colors truncate italic" data-text="${escapeAttr(s)}">${escapeHtml(s)}${i === 0 && corrections.length === 0 && completions.length === 0 ? ' <span class="text-[10px] opacity-50 ml-1 not-italic">Tab ↹</span>' : ''}</button>`;
            });
        }

        sugDiv.classList.remove('hidden');
        sugDiv.innerHTML = html;
        sugDiv.querySelectorAll('.bp-idea-sug').forEach(btn => {
            btn.addEventListener('mousedown', e => {
                e.preventDefault();
                els.ideaTextarea.value = btn.dataset.text;
                sugDiv.classList.add('hidden');
                pendingCorrection = null;
                els.ideaTextarea.focus();
                updateIdeaTags();
                if (selectedCategories.size > 0) renderBlueprint();
            });
        });
    }

    const allThemesTotal = categoryList.reduce((s, c) => s + c.total, 0);
    els.categoryPills.innerHTML =
        `<button class="bp-cat-pill bp-cat-all px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:border-indigo-400 transition-all duration-150 cursor-pointer" data-cat="__ALL__">All Themes <span class="text-xs text-gray-400 font-normal">${allThemesTotal}</span></button>` +
        categoryList
            .map(
                c =>
                    `<button class="bp-cat-pill px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:border-indigo-400 transition-all duration-150 cursor-pointer" data-cat="${escapeAttr(c.cat)}">${escapeHtml(c.cat)} <span class="text-xs text-gray-400 font-normal">${c.total}</span></button>`
            )
            .join('');

    let allThemesMode = false;

    function selectCategory(catName, forceOn) {
        if (catName === '__ALL__') {
            if (allThemesMode) {
                allThemesMode = false;
                selectedCategories.clear();
            } else {
                allThemesMode = true;
                selectedCategories.clear();
                categoryList.forEach(c => selectedCategories.add(c.cat));
            }
        } else {
            if (allThemesMode) {
                allThemesMode = false;
                selectedCategories.clear();
            }
            if (forceOn) selectedCategories.add(catName);
            else if (selectedCategories.has(catName)) selectedCategories.delete(catName);
            else selectedCategories.add(catName);
        }
        selectedSubThemes.clear();
        selectedFeatures.clear();
        refreshCategoryUI();
    }

    function resetState() {
        els.subthemeRow.classList.add('hidden');
        els.clearBtn.classList.add('hidden');
        els.clearBtn.classList.remove('inline-flex');
        els.featuresPanel.classList.add('hidden');
        els.ideaPanel.classList.add('hidden');
        els.emptyState.classList.remove('hidden');
        els.scorePanel.style.background = 'linear-gradient(135deg,#94a3b8,#64748b)';
        els.scoreValue.textContent = '—';
        els.scoreBar.style.width = '0%';
        els.bdTheme.textContent = '—';
        els.bdFeat.textContent = '—';
        els.bdSyn.textContent = '—';
        els.bdOpp.textContent = '—';
        els.tabsWrapper.classList.add('hidden');
        _hideOverlay();
    }

    function refreshCategoryUI() {
        document.querySelectorAll('.bp-cat-pill').forEach(p => {
            const cat = p.dataset.cat;
            const isSel = cat === '__ALL__' ? allThemesMode : selectedCategories.has(cat);
            const extraCls = cat === '__ALL__' ? ' bp-cat-all' : '';
            p.className = `bp-cat-pill${extraCls} px-3 py-2 rounded-lg text-sm font-medium border transition-all duration-150 cursor-pointer ${
                isSel
                    ? 'bg-indigo-600 text-white border-indigo-600 dark:bg-indigo-500 dark:border-indigo-500 shadow-sm'
                    : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:border-indigo-400'
            }`;
        });

        if (selectedCategories.size === 0) {
            resetState();
            return;
        }

        const allSubs = [];
        if (!allThemesMode) {
            selectedCategories.forEach(catName => {
                const catData = categoryList.find(c => c.cat === catName);
                if (catData) catData.subs.forEach(s => allSubs.push(s));
            });
        }

        if (allSubs.length > 0) {
            els.subthemeRow.classList.remove('hidden');
            els.subthemeChecks.innerHTML = allSubs
                .map(
                    s =>
                        `<label class="inline-flex items-center gap-1.5 cursor-pointer group">
                    <input type="checkbox" value="${escapeAttr(s.name)}" class="bp-sub-cb rounded border-gray-300 dark:border-gray-600 text-indigo-500 focus:ring-indigo-500 w-3.5 h-3.5" checked>
                    <span class="text-sm text-gray-700 dark:text-gray-300 group-hover:text-indigo-600 transition-colors">${escapeHtml(s.name)} <span class="text-xs text-gray-400">(${s.count})</span></span>
                </label>`
                )
                .join('');
            allSubs.forEach(s => selectedSubThemes.add(s.name));

            if (els.subthemeChecks._bpHandler)
                els.subthemeChecks.removeEventListener('change', els.subthemeChecks._bpHandler);
            els.subthemeChecks._bpHandler = () => {
                selectedSubThemes.clear();
                document.querySelectorAll('.bp-sub-cb:checked').forEach(cb => selectedSubThemes.add(cb.value));
                renderBlueprint();
            };
            els.subthemeChecks.addEventListener('change', els.subthemeChecks._bpHandler);

            ['bp-sub-all', 'bp-sub-none'].forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                const clone = el.cloneNode(true);
                el.replaceWith(clone);
            });
            document.getElementById('bp-sub-all')?.addEventListener('click', () => {
                document.querySelectorAll('.bp-sub-cb').forEach(cb => {
                    cb.checked = true;
                });
                selectedSubThemes.clear();
                allSubs.forEach(s => selectedSubThemes.add(s.name));
                renderBlueprint();
            });
            document.getElementById('bp-sub-none')?.addEventListener('click', () => {
                document.querySelectorAll('.bp-sub-cb').forEach(cb => {
                    cb.checked = false;
                });
                selectedSubThemes.clear();
                renderBlueprint();
            });
        } else {
            els.subthemeRow.classList.add('hidden');
        }

        els.clearBtn.classList.remove('hidden');
        els.clearBtn.classList.add('inline-flex');
        els.featuresPanel.classList.remove('hidden');
        els.ideaPanel.classList.remove('hidden');
        els.emptyState.classList.add('hidden');
        els.tabsWrapper.classList.remove('hidden');

        renderLayoutPills();
        renderBlueprint();
    }

    function renderLayoutPills() {
        const themeGames = getThemeGamesUnfiltered();
        const { layouts } = getReelGridCorrelation(themeGames);
        const top = layouts.filter(l => l.count >= 2).slice(0, 8);
        if (top.length > 0 && els.layoutPanel) {
            els.layoutPanel.classList.remove('hidden');
            els.layoutPills.innerHTML = top
                .map(l => {
                    const sel = selectedLayout === l.layout;
                    return `<button data-layout="${escapeAttr(l.layout)}" class="bp-layout-pill px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-150 cursor-pointer ${
                        sel
                            ? 'bg-violet-600 text-white border-violet-600 dark:bg-violet-500 dark:border-violet-500 shadow-sm'
                            : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:border-violet-400'
                    }">📐 ${escapeHtml(l.layout)} <span class="text-[10px] opacity-70">(${l.count})</span></button>`;
                })
                .join('');

            els.layoutPills.querySelectorAll('.bp-layout-pill').forEach(pill => {
                pill.addEventListener('click', () => {
                    const layout = pill.dataset.layout;
                    selectedLayout = selectedLayout === layout ? null : layout;
                    renderLayoutPills();
                    renderBlueprint();
                });
            });
            if (els.layoutClear) {
                els.layoutClear.classList.toggle('hidden', !selectedLayout);
                const clearClone = els.layoutClear.cloneNode(true);
                els.layoutClear.replaceWith(clearClone);
                els.layoutClear = clearClone;
                clearClone.addEventListener('click', () => {
                    selectedLayout = null;
                    renderLayoutPills();
                    renderBlueprint();
                });
            }
        } else if (els.layoutPanel) {
            els.layoutPanel.classList.add('hidden');
        }
    }

    function getThemeGamesUnfiltered() {
        if (selectedCategories.size === 0) return [];
        return allG.filter(g => {
            const primary = g.theme_primary || '';
            const consolidated = g.theme_consolidated || primary || '';
            if (!selectedCategories.has(consolidated)) return false;
            if (selectedSubThemes.size === 0) return true;
            if (selectedSubThemes.has(primary)) return true;
            return primary === consolidated;
        });
    }

    els.categoryPills.addEventListener('click', e => {
        const pill = e.target.closest('.bp-cat-pill');
        if (pill) selectCategory(pill.dataset.cat);
    });

    els.clearBtn.addEventListener('click', () => {
        allThemesMode = false;
        selectedCategories.clear();
        selectedSubThemes.clear();
        selectedFeatures.clear();
        selectedLayout = null;
        suggestPanelOpen = false;
        if (els.ideaTextarea) els.ideaTextarea.value = '';
        if (els.ideaTags) els.ideaTags.innerHTML = '';
        const loadedBadge = document.getElementById('bp-loaded-game');
        if (loadedBadge) {
            loadedBadge.classList.add('hidden');
            loadedBadge.classList.remove('flex');
        }
        document.querySelectorAll('.bp-cat-pill').forEach(p => {
            p.className =
                'bp-cat-pill px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:border-indigo-400 transition-all duration-150 cursor-pointer';
        });
        resetState();
        els.tabInsights.innerHTML = '';
        els.tabCompetition.innerHTML = '';
        els.tabSymbols.innerHTML = '';
        if (els.layoutPanel) els.layoutPanel.classList.add('hidden');
    });

    let ideaDebounce = null;
    if (els.ideaTextarea) {
        els.ideaTextarea.addEventListener('input', () => {
            updateIdeaSuggestions();
            clearTimeout(ideaDebounce);
            ideaDebounce = setTimeout(() => {
                updateIdeaTags();
                if (selectedCategories.size > 0) renderBlueprint();
            }, 300);
        });
        els.ideaTextarea.addEventListener('keydown', e => {
            if (e.key === 'Tab' && pendingCorrection) {
                e.preventDefault();
                els.ideaTextarea.value = pendingCorrection + ' ';
                pendingCorrection = null;
                const sugDiv = document.getElementById('bp-idea-suggestions');
                if (sugDiv) sugDiv.classList.add('hidden');
                updateIdeaTags();
                updateIdeaSuggestions();
                if (selectedCategories.size > 0) renderBlueprint();
            }
        });
        els.ideaTextarea.addEventListener('blur', () => {
            setTimeout(() => {
                const sugDiv = document.getElementById('bp-idea-suggestions');
                if (sugDiv) sugDiv.classList.add('hidden');
            }, 200);
        });
    }

    document.getElementById('bp-pick-btn').addEventListener('click', () => {
        const catScores = categoryList
            .map(cat => {
                const games = allG.filter(g => (g.theme_consolidated || g.theme_primary || '') === cat.cat);
                if (games.length < 3) return null;
                const avg = games.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / games.length;
                const lift = globalAvg > 0 ? ((avg - globalAvg) / globalAvg) * 100 : 0;
                const featResults = FEATS.map(f => {
                    const withF = games.filter(g => gameFeats(g).includes(f));
                    if (withF.length < 2) return null;
                    const fAvg = withF.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / withF.length;
                    return { feat: f, lift: avg > 0 ? ((fAvg - avg) / avg) * 100 : 0, count: withF.length };
                }).filter(Boolean);
                const topFeats = featResults
                    .filter(f => f.lift > 0)
                    .sort((a, b) => b.lift - a.lift)
                    .slice(0, 3);
                const featBoost = topFeats.length > 0 ? topFeats.reduce((s, f) => s + f.lift, 0) / topFeats.length : 0;
                const competitors =
                    topFeats.length > 0
                        ? games.filter(g => {
                              const gf = gameFeats(g);
                              return topFeats.every(tf => gf.includes(tf.feat));
                          }).length
                        : games.length;
                const oppScore = competitors === 0 ? 40 : competitors <= 3 ? 25 : competitors <= 8 ? 10 : 0;
                return {
                    cat: cat.cat,
                    totalScore: lift + featBoost * 0.5 + oppScore,
                    topFeats,
                    gameCount: games.length,
                };
            })
            .filter(Boolean)
            .sort((a, b) => b.totalScore - a.totalScore);

        if (catScores.length === 0) return;
        const topN = catScores.slice(0, Math.min(5, catScores.length));
        const minScore = Math.min(...topN.map(c => c.totalScore));
        const weights = topN.map(c => Math.max(1, c.totalScore - minScore + 10));
        const totalW = weights.reduce((a, b) => a + b, 0);
        let r = Math.random() * totalW;
        let picked = topN[0];
        for (let i = 0; i < topN.length; i++) {
            r -= weights[i];
            if (r <= 0) {
                picked = topN[i];
                break;
            }
        }
        const featPool = picked.topFeats.length > 0 ? picked.topFeats : [];
        const numFeats = Math.min(featPool.length, 1 + Math.floor(Math.random() * Math.min(3, featPool.length)));
        const shuffled = [...featPool].sort(() => Math.random() - 0.5);
        const chosenFeats = shuffled.slice(0, numFeats);

        allThemesMode = false;
        selectedCategories.clear();
        selectedSubThemes.clear();
        selectedFeatures.clear();
        selectedCategories.add(picked.cat);
        chosenFeats.forEach(f => selectedFeatures.add(f.feat));
        refreshCategoryUI();
    });

    function getThemeGames() {
        let games = getThemeGamesUnfiltered();
        if (selectedLayout) {
            const filtered = games.filter(g => {
                const reels = g.specs_reels;
                const rows = g.specs_rows;
                if (!reels || !rows) return false;
                const layout = `${Math.trunc(Number(reels))}x${Math.trunc(Number(rows))}`;
                return layout === selectedLayout;
            });
            if (filtered.length >= 2) games = filtered;
        }
        return games;
    }

    function computeBlueprintScore(themeGames, featScores, gameFeatSets, gameTheos) {
        if (themeGames.length === 0) return { score: 0, breakdown: {} };
        const themeAvg =
            themeGames.reduce((s, g) => s + (gameTheos ? gameTheos.get(g) : g.performance_theo_win || 0), 0) /
            themeGames.length;
        let themeStrength = Math.min(100, Math.max(0, 50 + ((themeAvg - globalAvg) / Math.max(globalAvg, 0.01)) * 200));

        const ideaText = (els.ideaTextarea?.value || '').trim();
        let conceptBonus = 0;
        if (ideaText.length > 0) {
            const ideaParsed = parseIdeaText(ideaText);
            const selectedCats = [...selectedCategories];
            let alignment = 0,
                total = 0;
            ideaParsed.themes.forEach(t => {
                total++;
                if (selectedCats.some(c => c === t)) alignment++;
            });
            ideaParsed.feats.forEach(f => {
                total++;
                if (selectedFeatures.has(f)) alignment++;
            });
            if (total > 0) {
                const ratio = alignment / total;
                conceptBonus = Math.round(ratio * 10);
            } else if (ideaText.length >= 20) {
                conceptBonus = 2;
            }
            themeStrength = Math.min(100, themeStrength + conceptBonus);
        }

        const selFeatsArr = [...selectedFeatures];

        let featQuality = 50;
        if (selFeatsArr.length > 0) {
            const selScores = featScores.filter(f => selectedFeatures.has(f.feat));
            let liftScore = 50;
            if (selScores.length > 0) {
                const avgLift = selScores.reduce((s, f) => s + f.lift, 0) / selScores.length;
                liftScore = Math.min(100, Math.max(0, 50 + avgLift * 3));
            }
            let matchSum = 0,
                matchCount = 0;
            themeGames.forEach(g => {
                const fs = gameFeatSets ? gameFeatSets.get(g) : new Set(gameFeats(g));
                if (selFeatsArr.some(f => fs.has(f))) {
                    matchSum += gameTheos ? gameTheos.get(g) : g.performance_theo_win || 0;
                    matchCount++;
                }
            });
            let perfScore = 50;
            if (matchCount >= 2) {
                perfScore = Math.min(
                    100,
                    Math.max(0, 50 + ((matchSum / matchCount - globalAvg) / Math.max(globalAvg, 0.01)) * 200)
                );
            }
            featQuality = Math.round(perfScore * 0.6 + liftScore * 0.4);
        }

        let synergyScore = 50;
        if (selFeatsArr.length >= 2) {
            let totalSyn = 0,
                pairs = 0;
            for (let i = 0; i < selFeatsArr.length; i++) {
                for (let j = i + 1; j < selFeatsArr.length; j++) {
                    let pairSum = 0,
                        pairCount = 0;
                    themeGames.forEach(g => {
                        const fs = gameFeatSets ? gameFeatSets.get(g) : new Set(gameFeats(g));
                        if (fs.has(selFeatsArr[i]) && fs.has(selFeatsArr[j])) {
                            pairSum += gameTheos ? gameTheos.get(g) : g.performance_theo_win || 0;
                            pairCount++;
                        }
                    });
                    if (pairCount >= 2) {
                        totalSyn += ((pairSum / pairCount - themeAvg) / Math.max(themeAvg, 0.01)) * 100;
                        pairs++;
                    }
                }
            }
            if (pairs > 0) synergyScore = Math.min(100, Math.max(0, 50 + (totalSyn / pairs) * 3));
        }

        let marketOpp = 50;
        if (selFeatsArr.length > 0) {
            let exactMatches = 0;
            themeGames.forEach(g => {
                const fs = gameFeatSets ? gameFeatSets.get(g) : new Set(gameFeats(g));
                if (selFeatsArr.every(f => fs.has(f))) exactMatches++;
            });
            if (exactMatches === 0) marketOpp = 95;
            else if (exactMatches <= 2) marketOpp = 80;
            else if (exactMatches <= 5) marketOpp = 65;
            else if (exactMatches <= 10) marketOpp = 45;
            else marketOpp = 25;
        }

        const score = Math.round(themeStrength * 0.25 + featQuality * 0.3 + synergyScore * 0.2 + marketOpp * 0.25);
        return {
            score,
            breakdown: {
                themeStrength: Math.round(themeStrength),
                featQuality: Math.round(featQuality),
                synergyScore: Math.round(synergyScore),
                marketOpp: Math.round(marketOpp),
                conceptBonus,
            },
        };
    }

    function updateScore(s, bd) {
        els.scoreValue.textContent = s;
        els.scoreBar.style.width = s + '%';
        const themeLabel = bd.conceptBonus > 0 ? `${bd.themeStrength}` : (bd.themeStrength ?? '—');
        els.bdTheme.textContent = themeLabel;
        els.bdFeat.textContent = bd.featQuality ?? '—';
        els.bdSyn.textContent = bd.synergyScore ?? '—';
        els.bdOpp.textContent = bd.marketOpp ?? '—';
        const conceptHint = document.getElementById('bp-concept-hint');
        if (conceptHint) {
            if (bd.conceptBonus > 0) {
                conceptHint.textContent = `+${bd.conceptBonus} from idea`;
                conceptHint.classList.remove('hidden');
            } else {
                conceptHint.classList.add('hidden');
            }
        }
        const gradient =
            s >= 70
                ? 'linear-gradient(135deg,#059669,#10b981)'
                : s >= 40
                  ? 'linear-gradient(135deg,#d97706,#f59e0b)'
                  : 'linear-gradient(135deg,#dc2626,#f43f5e)';
        els.scorePanel.style.background = gradient;
    }

    let _renderGen = 0;
    const OVERLAY_IDS = ['bp-loading-overlay-left', 'bp-loading-overlay-right'];
    const OVERLAY_SPINNER =
        '<div class="flex items-center gap-2 text-indigo-500"><svg class="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg><span class="text-sm font-medium">Analyzing…</span></div>';

    function _ensureOverlay(parent, id) {
        let ov = document.getElementById(id);
        if (!ov && parent) {
            parent.style.position = 'relative';
            ov = document.createElement('div');
            ov.id = id;
            ov.className =
                'absolute inset-0 z-20 flex items-center justify-center bg-white/70 dark:bg-gray-800/70 backdrop-blur-[2px] rounded-xl hidden';
            ov.innerHTML = OVERLAY_SPINNER;
            parent.appendChild(ov);
        }
        return ov;
    }

    function _showOverlay() {
        const right = _ensureOverlay(els.resultsArea, OVERLAY_IDS[1]);
        if (right) right.classList.remove('hidden');
        if (allThemesMode) {
            const left = _ensureOverlay(els.leftPanel, OVERLAY_IDS[0]);
            if (left) left.classList.remove('hidden');
        }
    }

    function _hideOverlay() {
        OVERLAY_IDS.forEach(id => {
            const ov = document.getElementById(id);
            if (ov) ov.classList.add('hidden');
        });
    }

    function renderBlueprint() {
        const gen = ++_renderGen;
        _showOverlay();
        requestAnimationFrame(() => {
            if (gen !== _renderGen) return;
            requestAnimationFrame(() => {
                if (gen !== _renderGen) return;
                _renderBlueprintSync();
                _hideOverlay();
            });
        });
    }

    function _renderBlueprintSync() {
        const themeGames = getThemeGames();
        if (themeGames.length === 0) {
            els.tabInsights.innerHTML =
                '<div class="text-center text-gray-400 text-sm py-8">No games match the selected sub-themes</div>';
            els.tabCompetition.innerHTML = '';
            els.tabSymbols.innerHTML = '';
            updateScore(0, {});
            _hideOverlay();
            return;
        }

        // Pre-compute feature Sets and theos once for all games
        const gameFeatSets = new Map();
        const gameTheos = new Map();
        themeGames.forEach(g => {
            gameFeatSets.set(g, new Set(gameFeats(g)));
            gameTheos.set(g, g.performance_theo_win || 0);
        });

        const themeAvg = themeGames.reduce((s, g) => s + gameTheos.get(g), 0) / themeGames.length;
        const liftVsMarket = globalAvg > 0 ? ((themeAvg - globalAvg) / globalAvg) * 100 : 0;

        const volatilityRollup = {};
        themeGames.forEach(g => {
            const v = (g.specs_volatility || g.volatility || '').trim();
            if (v) {
                if (!volatilityRollup[v]) volatilityRollup[v] = { count: 0, sum: 0 };
                volatilityRollup[v].count++;
                volatilityRollup[v].sum += gameTheos.get(g);
            }
        });
        const bestVol = Object.entries(volatilityRollup)
            .map(([n, d]) => ({ name: n, avg: d.sum / d.count }))
            .sort((a, b) => b.avg - a.avg)[0];
        const rtps = themeGames
            .map(g => parseFloat(g.specs_rtp || g.rtp))
            .filter(r => r && !isNaN(r) && r > 80 && r < 100);
        const avgRtp = rtps.length > 0 ? rtps.reduce((s, r) => s + r, 0) / rtps.length : 0;

        // Pre-compute per-feature game lists in a single pass
        const featGameMap = {};
        FEATS.forEach(f => {
            featGameMap[f] = [];
        });
        themeGames.forEach(g => {
            const fs = gameFeatSets.get(g);
            const theo = gameTheos.get(g);
            FEATS.forEach(f => {
                if (fs.has(f)) featGameMap[f].push(theo);
            });
        });

        const featScores = FEATS.map(f => {
            const theos = featGameMap[f];
            const count = theos.length;
            const avg = count >= 2 ? theos.reduce((s, t) => s + t, 0) / count : 0;
            const lift = count >= 2 && themeAvg > 0 ? ((avg - themeAvg) / themeAvg) * 100 : null;
            return { feat: f, count, avg, lift };
        }).sort((a, b) => {
            if (a.lift === null && b.lift === null) return 0;
            if (a.lift === null) return 1;
            if (b.lift === null) return -1;
            return b.lift - a.lift;
        });

        const featScoresWithData = featScores.filter(f => f.lift !== null);
        const { score, breakdown } = computeBlueprintScore(themeGames, featScoresWithData, gameFeatSets, gameTheos);
        updateScore(score, breakdown);

        function wouldImproveScore(feat) {
            if (selectedFeatures.has(feat)) return false;
            selectedFeatures.add(feat);
            const projected = computeBlueprintScore(themeGames, featScoresWithData, gameFeatSets, gameTheos);
            selectedFeatures.delete(feat);
            return projected.score > score;
        }

        const featOf = g => gameFeats(g);
        renderFeaturePills(els, featScores, selectedFeatures);
        renderSynergyPanel(els.synergyContainer, themeGames, selectedFeatures, themeAvg, gameFeatSets);
        renderInsightsTab(els.tabInsights, {
            themeGames,
            themeGamesUnfiltered: getThemeGamesUnfiltered(),
            selectedFeatures,
            globalAvg,
            themeAvg,
            liftVsMarket,
            bestVol,
            avgRtp,
            FEATS,
            featureColors,
            selectedCategories,
            renderBlueprint,
            wouldImproveScore,
            currentScore: score,
            gameFeatSets,
            featOf,
            get suggestPanelOpen() {
                return suggestPanelOpen;
            },
            set suggestPanelOpen(v) {
                suggestPanelOpen = v;
            },
        });
        renderCompetitionTab(els.tabCompetition, {
            themeGames,
            selectedFeatures,
            FEATS,
            featureColors,
            globalAvg,
            themeName: [...selectedCategories].join(' / '),
            gameFeatSets,
            featOf,
        });
        renderSymbolsTab(els.tabSymbols, { themeGames: symFilteredGames(themeGames), selectedFeatures, themeAvg });

        els.featContainer.querySelectorAll('.bp-feat-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                const feat = pill.dataset.feat;
                if (selectedFeatures.has(feat)) selectedFeatures.delete(feat);
                else selectedFeatures.add(feat);
                renderBlueprint();
            });
        });
    }

    function symFilteredGames(themeGames) {
        let symGames = themeGames.filter(g => parseSymbols(g.symbols).length > 0);
        if (selectedFeatures.size > 0) {
            const filtered = symGames.filter(g => {
                const gf = gameFeats(g);
                return [...selectedFeatures].some(f => gf.includes(f));
            });
            if (filtered.length >= 3) symGames = filtered;
        }
        return symGames;
    }

    function loadGameIntoBlueprint(gameName) {
        const game = allG.find(g => g.name === gameName);
        if (!game) return;

        allThemesMode = false;
        selectedCategories.clear();
        selectedSubThemes.clear();
        selectedFeatures.clear();
        selectedLayout = null;

        const consolidated = game.theme_consolidated || game.theme_primary || '';
        if (consolidated && categoryList.some(c => c.cat === consolidated)) {
            selectedCategories.add(consolidated);
        }

        const primary = game.theme_primary || '';
        if (primary && primary !== consolidated) {
            selectedSubThemes.add(primary);
        }

        gameFeats(game).forEach(f => {
            if (FEATS.includes(f)) selectedFeatures.add(f);
        });

        const reels = game.specs_reels;
        const rows = game.specs_rows;
        if (reels && rows) {
            selectedLayout = `${Math.trunc(Number(reels))}x${Math.trunc(Number(rows))}`;
        }

        refreshCategoryUI();

        const loadInput = document.getElementById('bp-load-game');
        if (loadInput) loadInput.value = '';

        const badge = document.getElementById('bp-loaded-game');
        const nameEl = document.getElementById('bp-loaded-game-name');
        const viewBtn = document.getElementById('bp-loaded-game-view');
        if (badge && nameEl) {
            nameEl.textContent = gameName;
            badge.classList.remove('hidden');
            badge.classList.add('flex');
            if (viewBtn) {
                const clone = viewBtn.cloneNode(true);
                viewBtn.replaceWith(clone);
                clone.addEventListener('click', () => {
                    if (window.showGameDetails) window.showGameDetails(gameName);
                });
            }
        }
    }

    window.loadGameIntoBlueprint = loadGameIntoBlueprint;

    const loadInput = document.getElementById('bp-load-game');
    const loadSuggestions = document.getElementById('bp-load-suggestions');
    if (loadInput && loadSuggestions) {
        let loadDebounce = null;
        let activeIdx = -1;

        function highlightItem(idx) {
            const items = loadSuggestions.querySelectorAll('[data-game]');
            items.forEach((el, i) => {
                el.classList.toggle('bg-indigo-50', i === idx);
                el.classList.toggle('dark:bg-indigo-900/30', i === idx);
            });
            activeIdx = idx;
            if (idx >= 0 && items[idx]) items[idx].scrollIntoView({ block: 'nearest' });
        }

        loadInput.addEventListener('input', () => {
            clearTimeout(loadDebounce);
            activeIdx = -1;
            const q = loadInput.value.trim().toLowerCase();
            if (q.length < 2) {
                loadSuggestions.classList.add('hidden');
                return;
            }
            loadDebounce = setTimeout(() => {
                const matches = allG.filter(g => g.name && g.name.toLowerCase().includes(q)).slice(0, 8);
                if (matches.length === 0) {
                    loadSuggestions.classList.add('hidden');
                    return;
                }
                loadSuggestions.innerHTML = matches
                    .map(
                        g =>
                            `<div class="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 cursor-pointer transition-colors" data-game="${escapeAttr(g.name)}">
                                <span class="font-medium">${escapeHtml(g.name)}</span>
                                <span class="text-xs text-gray-400 ml-1">${escapeHtml(g.theme_primary || '')} · ${escapeHtml(F.provider(g))}</span>
                            </div>`
                    )
                    .join('');
                loadSuggestions.classList.remove('hidden');
                loadSuggestions.querySelectorAll('[data-game]').forEach(el => {
                    el.addEventListener('click', () => {
                        loadGameIntoBlueprint(el.dataset.game);
                        loadSuggestions.classList.add('hidden');
                        loadInput.value = '';
                    });
                });
            }, 150);
        });

        loadInput.addEventListener('keydown', e => {
            const items = loadSuggestions.querySelectorAll('[data-game]');
            if (!items.length || loadSuggestions.classList.contains('hidden')) return;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                highlightItem(activeIdx < items.length - 1 ? activeIdx + 1 : 0);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                highlightItem(activeIdx > 0 ? activeIdx - 1 : items.length - 1);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (activeIdx >= 0 && items[activeIdx]) {
                    loadGameIntoBlueprint(items[activeIdx].dataset.game);
                    loadSuggestions.classList.add('hidden');
                    loadInput.value = '';
                }
            } else if (e.key === 'Escape') {
                loadSuggestions.classList.add('hidden');
                activeIdx = -1;
            }
        });

        loadInput.addEventListener('blur', () => {
            setTimeout(() => {
                loadSuggestions.classList.add('hidden');
                activeIdx = -1;
            }, 200);
        });
    }
}
const TAILWIND_PILL_CLASSES = [
    'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300',
    'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
    'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
    'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
    'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
    'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
    'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
    'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
    'bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300',
    'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/40 dark:text-fuchsia-300',
];

function buildTailwindColorMap(feats) {
    const map = {};
    feats.forEach((f, i) => {
        map[f] = TAILWIND_PILL_CLASSES[i % TAILWIND_PILL_CLASSES.length];
    });
    return map;
}

function getBlueprintElements() {
    return {
        categoryPills: document.getElementById('bp-category-pills'),
        subthemeRow: document.getElementById('bp-subtheme-row'),
        subthemeChecks: document.getElementById('bp-subtheme-checks'),
        featuresPanel: document.getElementById('bp-features-panel'),
        featContainer: document.getElementById('bp-feat-container'),
        featCountBadge: document.getElementById('bp-feat-count'),
        synergyContainer: document.getElementById('bp-synergy-container'),
        scorePanel: document.getElementById('bp-score-panel'),
        scoreValue: document.getElementById('bp-score-value'),
        scoreBar: document.getElementById('bp-score-bar'),
        bdTheme: document.getElementById('bp-bd-theme'),
        bdFeat: document.getElementById('bp-bd-feat'),
        bdSyn: document.getElementById('bp-bd-syn'),
        bdOpp: document.getElementById('bp-bd-opp'),
        emptyState: document.getElementById('bp-empty-state'),
        leftPanel: document.getElementById('bp-left-panel'),
        resultsArea: document.getElementById('bp-results-area'),
        tabsWrapper: document.getElementById('bp-tabs-wrapper'),
        tabInsights: document.getElementById('bp-tab-insights'),
        tabCompetition: document.getElementById('bp-tab-competition'),
        tabSymbols: document.getElementById('bp-tab-symbols'),
        clearBtn: document.getElementById('bp-clear-btn'),
        layoutPanel: document.getElementById('bp-layout-panel'),
        layoutPills: document.getElementById('bp-layout-pills'),
        layoutClear: document.getElementById('bp-layout-clear'),
        ideaPanel: document.getElementById('bp-idea-panel'),
        ideaTextarea: document.getElementById('bp-idea-textarea'),
        ideaTags: document.getElementById('bp-idea-tags'),
    };
}

function buildBlueprintHTML() {
    return `
    <div class="flex gap-5" style="min-height:420px">
        <div id="bp-left-panel" class="w-[600px] shrink-0 relative">
            <div class="sticky top-28 flex flex-col gap-3 max-h-[calc(100vh-8rem)]">
                <div id="bp-score-panel" class="rounded-xl shadow-lg p-5 text-center transition-all duration-500" style="background:linear-gradient(135deg,#94a3b8,#64748b)">
                    <div class="text-base font-semibold text-white/70 uppercase tracking-wider mb-1 flex items-center justify-center gap-1.5">Blueprint Score <span class="relative group"><button class="w-4 h-4 rounded-full bg-white/20 text-white/60 flex items-center justify-center text-[9px] font-bold leading-none hover:bg-white/30">?</button><span class="hidden group-hover:block absolute left-1/2 -translate-x-1/2 top-full mt-1 w-60 p-2.5 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-[9999] text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed font-normal">Composite score (0-100) based on Theme strength, Feature quality, Synergy between features, and Market opportunity.</span></span></div>
                    <div id="bp-score-value" class="text-6xl font-black text-white leading-none mb-2">—</div>
                    <div class="w-full h-2.5 bg-white/20 rounded-full overflow-hidden mb-3"><div id="bp-score-bar" class="h-full rounded-full transition-all duration-500 bg-white/80" style="width:0%"></div></div>
                    <div class="grid grid-cols-4 gap-1.5 text-center">
                        <div><div id="bp-bd-theme" class="text-lg font-bold text-white">—</div><div class="text-xs text-white/60">Theme</div><div id="bp-concept-hint" class="hidden text-[9px] text-emerald-200 font-medium"></div></div>
                        <div><div id="bp-bd-feat" class="text-lg font-bold text-white">—</div><div class="text-xs text-white/60">Features</div></div>
                        <div><div id="bp-bd-syn" class="text-lg font-bold text-white">—</div><div class="text-xs text-white/60">Synergy</div></div>
                        <div><div id="bp-bd-opp" class="text-lg font-bold text-white">—</div><div class="text-xs text-white/60">Opportunity</div></div>
                    </div>
                </div>
                <div class="overflow-y-auto flex-1 space-y-3 min-h-0">
                    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-indigo-200 dark:border-indigo-800 p-4">
                        <div class="flex items-center justify-between mb-3">
                            <div class="flex items-center gap-2"><span class="text-base">🎰</span><h3 class="text-base font-bold text-gray-900 dark:text-white">Game Blueprint</h3></div>
                            <div class="flex items-center gap-1.5">
                                <div class="relative">
                                    <input id="bp-load-game" type="text" placeholder="Load existing game…" autocomplete="off" class="w-36 px-2 py-1.5 rounded-lg text-xs border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
                                    <div id="bp-load-suggestions" class="hidden absolute right-0 z-50 mt-1 w-72 max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg"></div>
                                </div>
                                <button id="bp-pick-btn" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all" title="Auto-pick best combo"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> Pick for me</button>
                                <button id="bp-clear-btn" class="hidden items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-all" title="Reset"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg> Clear</button>
                            </div>
                        </div>
                        <div id="bp-loaded-game" class="hidden mb-2 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 flex items-center justify-between">
                            <span class="text-xs text-indigo-700 dark:text-indigo-300">Loaded: <strong id="bp-loaded-game-name"></strong></span>
                            <button id="bp-loaded-game-view" class="text-[10px] font-medium text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">View game</button>
                        </div>
                        <div class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">Theme Category</div>
                        <div id="bp-category-pills" class="flex flex-wrap gap-1.5"></div>
                        <div id="bp-subtheme-row" class="mt-3 hidden">
                            <div class="flex items-center justify-between mb-1.5">
                                <div class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sub-themes</div>
                                <div class="flex gap-1">
                                    <button id="bp-sub-all" class="text-[10px] px-1.5 py-0.5 rounded text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors">All</button>
                                    <button id="bp-sub-none" class="text-[10px] px-1.5 py-0.5 rounded text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/30 transition-colors">None</button>
                                </div>
                            </div>
                            <div id="bp-subtheme-checks" class="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto"></div>
                        </div>
                    </div>
                    <div id="bp-features-panel" class="hidden bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-600 p-4">
                        <div class="flex items-center justify-between mb-2">
                            <div class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Features <span class="normal-case font-normal">— click to add</span></div>
                            <span id="bp-feat-count" class="hidden text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"></span>
                        </div>
                        <div id="bp-feat-container" class="flex flex-wrap gap-1.5"></div>
                        <div id="bp-synergy-container" class="mt-2"></div>
                    </div>
                    <div id="bp-layout-panel" class="hidden bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-600 p-4">
                        <div class="flex items-center justify-between mb-2">
                            <div class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Grid Layout <span class="normal-case font-normal">— optional</span></div>
                            <button id="bp-layout-clear" class="hidden text-[10px] px-1.5 py-0.5 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors">Clear</button>
                        </div>
                        <div id="bp-layout-pills" class="flex flex-wrap gap-1.5"></div>
                    </div>
                    <div id="bp-idea-panel" class="hidden bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-600 p-4">
                        <div class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">Game Idea <span class="normal-case font-normal">— optional</span></div>
                        <div class="relative">
                            <textarea id="bp-idea-textarea" rows="2" maxlength="300" spellcheck="true" autocomplete="on" autocorrect="on" autocapitalize="sentences" placeholder="An Egyptian adventure with free spins and expanding wilds" class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 text-sm text-gray-900 dark:text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"></textarea>
                            <div id="bp-idea-suggestions" class="hidden absolute left-0 right-0 z-50 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg p-1 space-y-0.5"></div>
                        </div>
                        <div id="bp-idea-tags" class="mt-1.5 min-h-[20px]"></div>
                    </div>
                </div>
            </div>
        </div>
        <div class="flex-1 min-w-0">
            <div id="bp-results-area" class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-600 overflow-hidden">
                <div id="bp-empty-state" class="flex flex-col items-center justify-center py-24 text-gray-400 dark:text-gray-500 text-base gap-2">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="opacity-40"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
                    Choose a theme category to start building
                </div>
                <div id="bp-tabs-wrapper" class="hidden flex flex-col" style="max-height:calc(100vh - 7rem)">
                    <div class="sticky top-0 z-10 bg-white dark:bg-gray-800 flex border-b border-gray-200 dark:border-gray-700 px-3 pt-1 gap-1.5 shrink-0">
                        <button class="bp-tab flex items-center gap-1.5 px-5 py-3 text-sm font-bold rounded-t-lg border-b-2 border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 transition-all" data-tab="insights">📊 Insights</button>
                        <button class="bp-tab flex items-center gap-1.5 px-5 py-3 text-sm font-bold rounded-t-lg border-b-2 border-transparent bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700/60 transition-all" data-tab="symbols">🍒 Symbols</button>
                        <button class="bp-tab flex items-center gap-1.5 px-5 py-3 text-sm font-bold rounded-t-lg border-b-2 border-transparent bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700/60 transition-all" data-tab="competition">⚔️ Competition</button>
                    </div>
                    <div class="overflow-y-auto flex-1 min-h-0">
                        <div id="bp-tab-insights" class="bp-tab-content p-6"></div>
                        <div id="bp-tab-symbols" class="bp-tab-content p-6 hidden"></div>
                        <div id="bp-tab-competition" class="bp-tab-content p-6 hidden"></div>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}
