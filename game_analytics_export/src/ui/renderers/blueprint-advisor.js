/**
 * Game Blueprint Advisor — interactive theme + feature selection tool
 * with live scoring, recipe analysis, competition, and symbol suggestions.
 */
import { gameData } from '../../lib/data.js';
import { escapeHtml, escapeAttr, safeOnclick } from '../../lib/sanitize.js';
import { parseFeatures as parseFeatsLocal } from '../../lib/parse-features.js';
import { SHORT_FEATURE_LABELS } from '../../lib/features.js';
import { SYMBOL_CAT_COLORS, categorizeSymbol, parseSymbols, aggregateSymbolStats, normalizeSymbolName } from '../../lib/symbol-utils.js';

const shortF = SHORT_FEATURE_LABELS;

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

    const featSet = new Set();
    allG.forEach(g => { parseFeatsLocal(g.features).forEach(f => featSet.add(f)); });
    const FEATS = [...featSet].sort();
    const featureColors = buildTailwindColorMap(FEATS);

    document.querySelectorAll('.bp-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            activeTab = tab.dataset.tab;
            document.querySelectorAll('.bp-tab').forEach(t => {
                const isActive = t.dataset.tab === activeTab;
                t.className = `bp-tab flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-all ${isActive ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/30'}`;
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
            themeConsolidationGroups[consolidated].subs[primary] = (themeConsolidationGroups[consolidated].subs[primary] || 0) + 1;
        }
    });

    const categoryList = Object.entries(themeConsolidationGroups)
        .map(([cat, data]) => ({
            cat,
            total: data._total,
            subs: Object.entries(data.subs).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }))
        }))
        .filter(c => c.total >= 5)
        .sort((a, b) => b.total - a.total);

    const selectedCategories = new Set();
    const selectedSubThemes = new Set();
    const selectedFeatures = new Set();
    const globalAvg = allG.length > 0 ? allG.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / allG.length : 0;

    const ideaFeatAliases = {
        'free spin': 'Free Spins', 'freespin': 'Free Spins', 'free spins': 'Free Spins', 'bonus spin': 'Free Spins',
        'hold and spin': 'Hold and Spin', 'hold & spin': 'Hold and Spin', 'hold & win': 'Hold and Spin', 'hold and win': 'Hold and Spin',
        'wild reel': 'Wild Reels', 'wild reels': 'Wild Reels',
        'expanding wild': 'Wild Reels', 'expanding wilds': 'Wild Reels',
        'sticky wild': 'Wild Reels', 'sticky wilds': 'Wild Reels',
        'stacked wild': 'Wild Reels', 'stacked wilds': 'Wild Reels',
        'wilds': 'Wild Reels',
        'expanding reel': 'Expanding Reels', 'expanding reels': 'Expanding Reels',
        'cash on reel': 'Cash On Reels', 'cash on reels': 'Cash On Reels', 'cash reels': 'Cash On Reels',
        'cash collect': 'Cash On Reels', 'cash collection': 'Cash On Reels',
        'nudge': 'Nudges', 'nudges': 'Nudges',
        'persistence': 'Persistence', 'persistent': 'Persistence',
        'pick bonus': 'Pick Bonus', 'pick game': 'Pick Bonus', 'pick and click': 'Pick Bonus', 'pick feature': 'Pick Bonus',
        'respin': 'Respin', 're-spin': 'Respin', 'respins': 'Respin',
        'jackpot': 'Static Jackpot', 'static jackpot': 'Static Jackpot',
        'wheel bonus': 'Wheel', 'wheel of fortune': 'Wheel', 'bonus wheel': 'Wheel',
    };

    function buildIdeaThemeAliases() {
        const map = {};
        categoryList.forEach(c => {
            const lower = c.cat.toLowerCase();
            map[lower] = c.cat;
            lower.split(/[\s&/]+/).filter(w => w.length > 2).forEach(w => { map[w] = c.cat; });
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
            applyBtn.addEventListener('click', (e) => {
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
        'adventure', 'themed', 'slot', 'game', 'with', 'and', 'featuring',
        'high volatility', 'medium volatility', 'low volatility',
        'bonus', 'scatter', 'symbol', 'reel', 'reels', 'spin', 'spins',
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
        let best = null, bestDist = Infinity;
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
            knownKeywords.filter(t => t.startsWith(lastWord) && t !== lastWord && !t.includes(' '))
                .slice(0, 2).forEach(t => {
                    if (!completions.some(c => c.display === t)) {
                        completions.push({ display: t, fullText: prefix + t });
                    }
                });
        }

        const sentenceMatches = ideaSuggestions
            .filter(s => { const sl = s.toLowerCase(); return words.some(w => w.length > 2 && sl.includes(w)); })
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
            if (corrections.length > 0 || completions.length > 0) html += '<div class="border-t border-gray-100 dark:border-gray-700 my-0.5"></div>';
            sentenceMatches.forEach((s, i) => {
                html += `<button type="button" class="bp-idea-sug w-full text-left px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-600 dark:hover:text-indigo-400 rounded transition-colors truncate italic" data-text="${escapeAttr(s)}">${escapeHtml(s)}${i === 0 && corrections.length === 0 && completions.length === 0 ? ' <span class="text-[10px] opacity-50 ml-1 not-italic">Tab ↹</span>' : ''}</button>`;
            });
        }

        sugDiv.classList.remove('hidden');
        sugDiv.innerHTML = html;
        sugDiv.querySelectorAll('.bp-idea-sug').forEach(btn => {
            btn.addEventListener('mousedown', (e) => {
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

    els.categoryPills.innerHTML = categoryList.map(c =>
        `<button class="bp-cat-pill px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:border-indigo-400 transition-all duration-150 cursor-pointer" data-cat="${escapeAttr(c.cat)}">${escapeHtml(c.cat)} <span class="text-xs text-gray-400 font-normal">${c.total}</span></button>`
    ).join('');

    function selectCategory(catName, forceOn) {
        if (forceOn) selectedCategories.add(catName);
        else if (selectedCategories.has(catName)) selectedCategories.delete(catName);
        else selectedCategories.add(catName);
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
        els.bdTheme.textContent = '—'; els.bdFeat.textContent = '—'; els.bdSyn.textContent = '—'; els.bdOpp.textContent = '—';
        els.tabsWrapper.classList.add('hidden');
    }

    function refreshCategoryUI() {
        document.querySelectorAll('.bp-cat-pill').forEach(p => {
            const isSel = selectedCategories.has(p.dataset.cat);
            p.className = `bp-cat-pill px-3 py-2 rounded-lg text-sm font-medium border transition-all duration-150 cursor-pointer ${
                isSel ? 'bg-indigo-600 text-white border-indigo-600 dark:bg-indigo-500 dark:border-indigo-500 shadow-sm' :
                'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:border-indigo-400'
            }`;
        });

        if (selectedCategories.size === 0) { resetState(); return; }

        const allSubs = [];
        selectedCategories.forEach(catName => {
            const catData = categoryList.find(c => c.cat === catName);
            if (catData) catData.subs.forEach(s => allSubs.push(s));
        });

        if (allSubs.length > 0) {
            els.subthemeRow.classList.remove('hidden');
            els.subthemeChecks.innerHTML = allSubs.map(s =>
                `<label class="inline-flex items-center gap-1.5 cursor-pointer group">
                    <input type="checkbox" value="${escapeAttr(s.name)}" class="bp-sub-cb rounded border-gray-300 dark:border-gray-600 text-indigo-500 focus:ring-indigo-500 w-3.5 h-3.5" checked>
                    <span class="text-sm text-gray-700 dark:text-gray-300 group-hover:text-indigo-600 transition-colors">${escapeHtml(s.name)} <span class="text-xs text-gray-400">(${s.count})</span></span>
                </label>`
            ).join('');
            allSubs.forEach(s => selectedSubThemes.add(s.name));

            if (els.subthemeChecks._bpHandler) els.subthemeChecks.removeEventListener('change', els.subthemeChecks._bpHandler);
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
                document.querySelectorAll('.bp-sub-cb').forEach(cb => { cb.checked = true; });
                selectedSubThemes.clear();
                allSubs.forEach(s => selectedSubThemes.add(s.name));
                renderBlueprint();
            });
            document.getElementById('bp-sub-none')?.addEventListener('click', () => {
                document.querySelectorAll('.bp-sub-cb').forEach(cb => { cb.checked = false; });
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
        renderBlueprint();
    }

    els.categoryPills.addEventListener('click', (e) => {
        const pill = e.target.closest('.bp-cat-pill');
        if (pill) selectCategory(pill.dataset.cat);
    });

    els.clearBtn.addEventListener('click', () => {
        selectedCategories.clear();
        selectedSubThemes.clear();
        selectedFeatures.clear();
        if (els.ideaTextarea) els.ideaTextarea.value = '';
        if (els.ideaTags) els.ideaTags.innerHTML = '';
        document.querySelectorAll('.bp-cat-pill').forEach(p => {
            p.className = 'bp-cat-pill px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:border-indigo-400 transition-all duration-150 cursor-pointer';
        });
        resetState();
        els.tabInsights.innerHTML = '';
        els.tabCompetition.innerHTML = '';
        els.tabSymbols.innerHTML = '';
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
        els.ideaTextarea.addEventListener('keydown', (e) => {
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
        const catScores = categoryList.map(cat => {
            const games = allG.filter(g => (g.theme_consolidated || g.theme_primary || '') === cat.cat);
            if (games.length < 3) return null;
            const avg = games.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / games.length;
            const lift = globalAvg > 0 ? (avg - globalAvg) / globalAvg * 100 : 0;
            const featResults = FEATS.map(f => {
                const withF = games.filter(g => parseFeatsLocal(g.features).includes(f));
                if (withF.length < 2) return null;
                const fAvg = withF.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / withF.length;
                return { feat: f, lift: avg > 0 ? (fAvg - avg) / avg * 100 : 0, count: withF.length };
            }).filter(Boolean);
            const topFeats = featResults.filter(f => f.lift > 0).sort((a, b) => b.lift - a.lift).slice(0, 3);
            const featBoost = topFeats.length > 0 ? topFeats.reduce((s, f) => s + f.lift, 0) / topFeats.length : 0;
            const competitors = topFeats.length > 0 ? games.filter(g => {
                const gf = parseFeatsLocal(g.features);
                return topFeats.every(tf => gf.includes(tf.feat));
            }).length : games.length;
            const oppScore = competitors === 0 ? 40 : competitors <= 3 ? 25 : competitors <= 8 ? 10 : 0;
            return { cat: cat.cat, totalScore: lift + featBoost * 0.5 + oppScore, topFeats, gameCount: games.length };
        }).filter(Boolean).sort((a, b) => b.totalScore - a.totalScore);

        if (catScores.length === 0) return;
        const topN = catScores.slice(0, Math.min(5, catScores.length));
        const minScore = Math.min(...topN.map(c => c.totalScore));
        const weights = topN.map(c => Math.max(1, c.totalScore - minScore + 10));
        const totalW = weights.reduce((a, b) => a + b, 0);
        let r = Math.random() * totalW;
        let picked = topN[0];
        for (let i = 0; i < topN.length; i++) {
            r -= weights[i];
            if (r <= 0) { picked = topN[i]; break; }
        }
        const featPool = picked.topFeats.length > 0 ? picked.topFeats : [];
        const numFeats = Math.min(featPool.length, 1 + Math.floor(Math.random() * Math.min(3, featPool.length)));
        const shuffled = [...featPool].sort(() => Math.random() - 0.5);
        const chosenFeats = shuffled.slice(0, numFeats);

        selectedCategories.clear();
        selectedSubThemes.clear();
        selectedFeatures.clear();
        selectedCategories.add(picked.cat);
        chosenFeats.forEach(f => selectedFeatures.add(f.feat));
        refreshCategoryUI();
    });

    function getThemeGames() {
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

    function computeBlueprintScore(themeGames, featScores) {
        if (themeGames.length === 0) return { score: 0, breakdown: {} };
        const themeAvg = themeGames.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / themeGames.length;
        let themeStrength = Math.min(100, Math.max(0, 50 + (themeAvg - globalAvg) / Math.max(globalAvg, 0.01) * 200));

        const ideaText = (els.ideaTextarea?.value || '').trim();
        let conceptBonus = 0;
        if (ideaText.length > 0) {
            const ideaParsed = parseIdeaText(ideaText);
            const selectedCats = [...selectedCategories];
            let alignment = 0, total = 0;
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

        let featQuality = 50;
        if (selectedFeatures.size > 0) {
            const selScores = featScores.filter(f => selectedFeatures.has(f.feat));
            let liftScore = 50;
            if (selScores.length > 0) {
                const avgLift = selScores.reduce((s, f) => s + f.lift, 0) / selScores.length;
                liftScore = Math.min(100, Math.max(0, 50 + avgLift * 3));
            }
            const matchGames = themeGames.filter(g => {
                const gf = parseFeatsLocal(g.features);
                return [...selectedFeatures].some(f => gf.includes(f));
            });
            let perfScore = 50;
            if (matchGames.length >= 2) {
                const matchAvg = matchGames.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / matchGames.length;
                perfScore = Math.min(100, Math.max(0, 50 + (matchAvg - globalAvg) / Math.max(globalAvg, 0.01) * 200));
            }
            featQuality = Math.round(perfScore * 0.6 + liftScore * 0.4);
        }
        let synergyScore = 50;
        if (selectedFeatures.size >= 2) {
            const feats = [...selectedFeatures];
            let totalSyn = 0, pairs = 0;
            for (let i = 0; i < feats.length; i++) {
                for (let j = i + 1; j < feats.length; j++) {
                    const bothGames = themeGames.filter(g => {
                        const gf = parseFeatsLocal(g.features);
                        return gf.includes(feats[i]) && gf.includes(feats[j]);
                    });
                    if (bothGames.length >= 2) {
                        const pairAvg = bothGames.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / bothGames.length;
                        totalSyn += (pairAvg - themeAvg) / Math.max(themeAvg, 0.01) * 100;
                        pairs++;
                    }
                }
            }
            if (pairs > 0) synergyScore = Math.min(100, Math.max(0, 50 + (totalSyn / pairs) * 3));
        }
        let marketOpp = 50;
        if (selectedFeatures.size > 0) {
            const exactMatches = themeGames.filter(g => {
                const gf = parseFeatsLocal(g.features);
                return [...selectedFeatures].every(f => gf.includes(f));
            }).length;
            if (exactMatches === 0) marketOpp = 95;
            else if (exactMatches <= 2) marketOpp = 80;
            else if (exactMatches <= 5) marketOpp = 65;
            else if (exactMatches <= 10) marketOpp = 45;
            else marketOpp = 25;
        }
        const score = Math.round(themeStrength * 0.25 + featQuality * 0.30 + synergyScore * 0.20 + marketOpp * 0.25);
        return { score, breakdown: { themeStrength: Math.round(themeStrength), featQuality: Math.round(featQuality), synergyScore: Math.round(synergyScore), marketOpp: Math.round(marketOpp), conceptBonus } };
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
        const gradient = s >= 70 ? 'linear-gradient(135deg,#059669,#10b981)' : s >= 40 ? 'linear-gradient(135deg,#d97706,#f59e0b)' : 'linear-gradient(135deg,#dc2626,#f43f5e)';
        els.scorePanel.style.background = gradient;
    }

    function renderBlueprint() {
        const themeGames = getThemeGames();
        if (themeGames.length === 0) {
            els.tabInsights.innerHTML = '<div class="text-center text-gray-400 text-sm py-8">No games match the selected sub-themes</div>';
            els.tabCompetition.innerHTML = '';
            els.tabSymbols.innerHTML = '';
            updateScore(0, {});
            return;
        }

        const themeAvg = themeGames.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / themeGames.length;
        const liftVsMarket = globalAvg > 0 ? ((themeAvg - globalAvg) / globalAvg * 100) : 0;

        const volMap = {};
        themeGames.forEach(g => {
            const v = (g.specs_volatility || g.volatility || '').trim();
            if (v) { if (!volMap[v]) volMap[v] = { count: 0, sum: 0 }; volMap[v].count++; volMap[v].sum += (g.performance_theo_win || 0); }
        });
        const bestVol = Object.entries(volMap).map(([n, d]) => ({ name: n, avg: d.sum / d.count })).sort((a, b) => b.avg - a.avg)[0];
        const rtps = themeGames.map(g => parseFloat(g.specs_rtp || g.rtp)).filter(r => r && !isNaN(r) && r > 80 && r < 100);
        const avgRtp = rtps.length > 0 ? rtps.reduce((s, r) => s + r, 0) / rtps.length : 0;

        const featScores = FEATS.map(f => {
            const withF = themeGames.filter(g => parseFeatsLocal(g.features).includes(f));
            const avg = withF.length >= 2 ? withF.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / withF.length : 0;
            const lift = withF.length >= 2 && themeAvg > 0 ? ((avg - themeAvg) / themeAvg * 100) : null;
            return { feat: f, count: withF.length, avg, lift };
        }).sort((a, b) => {
            if (a.lift === null && b.lift === null) return 0;
            if (a.lift === null) return 1;
            if (b.lift === null) return -1;
            return b.lift - a.lift;
        });

        const featScoresWithData = featScores.filter(f => f.lift !== null);
        const { score, breakdown } = computeBlueprintScore(themeGames, featScoresWithData);
        updateScore(score, breakdown);

        renderFeaturePills(els, featScores, selectedFeatures);
        renderSynergyPanel(els.synergyContainer, themeGames, selectedFeatures, themeAvg);
        renderInsightsTab(els.tabInsights, { themeGames, selectedFeatures, globalAvg, themeAvg, liftVsMarket, bestVol, avgRtp, FEATS, featureColors, selectedCategories });
        renderCompetitionTab(els.tabCompetition, { themeGames, selectedFeatures, FEATS, featureColors, globalAvg });
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
                const gf = parseFeatsLocal(g.features);
                return [...selectedFeatures].some(f => gf.includes(f));
            });
            if (filtered.length >= 3) symGames = filtered;
        }
        return symGames;
    }
}

function renderFeaturePills(els, featScores, selectedFeatures) {
    els.featContainer.innerHTML = featScores.map(f => {
        const isSelected = selectedFeatures.has(f.feat);
        const hasData = f.lift !== null;
        const arrow = hasData ? (f.lift >= 0 ? '↑' : '↓') : '';
        const liftLabel = hasData ? `${arrow}${Math.abs(f.lift).toFixed(0)}%` : 'new';
        const cls = isSelected
            ? 'bg-indigo-600 text-white border-indigo-600 dark:bg-indigo-500 dark:border-indigo-500 shadow-sm'
            : !hasData ? 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-dashed border-gray-300 dark:border-gray-600 hover:border-indigo-400 hover:text-indigo-600'
            : f.lift >= 10 ? 'bg-white dark:bg-gray-800 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
            : f.lift >= 0 ? 'bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20'
            : 'bg-white dark:bg-gray-800 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-700 hover:bg-rose-50 dark:hover:bg-rose-900/20';
        return `<button class="bp-feat-pill inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-all duration-150 cursor-pointer ${cls}" data-feat="${escapeAttr(f.feat)}">${isSelected ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> ' : ''}${escapeHtml(shortF[f.feat] || f.feat)} <span class="text-xs opacity-75">${liftLabel}</span></button>`;
    }).join('');

    if (selectedFeatures.size > 0) {
        els.featCountBadge.textContent = `${selectedFeatures.size} selected`;
        els.featCountBadge.classList.remove('hidden');
    } else {
        els.featCountBadge.classList.add('hidden');
    }
}

function renderSynergyPanel(container, themeGames, selectedFeatures, themeAvg) {
    let html = '';
    if (selectedFeatures.size >= 2) {
        const feats = [...selectedFeatures];
        const pairs = [];
        for (let i = 0; i < feats.length; i++) {
            for (let j = i + 1; j < feats.length; j++) {
                const bothGames = themeGames.filter(g => {
                    const gf = parseFeatsLocal(g.features);
                    return gf.includes(feats[i]) && gf.includes(feats[j]);
                });
                if (bothGames.length >= 2) {
                    const pairAvg = bothGames.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / bothGames.length;
                    const syn = themeAvg > 0 ? ((pairAvg - themeAvg) / themeAvg * 100) : 0;
                    pairs.push({ a: feats[i], b: feats[j], syn });
                }
            }
        }
        if (pairs.length > 0) {
            html = pairs.map(p => {
                const color = p.syn >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400';
                return `<div class="flex items-center gap-2 text-xs py-0.5">
                    <span class="text-gray-600 dark:text-gray-300">${escapeHtml(shortF[p.a] || p.a)} + ${escapeHtml(shortF[p.b] || p.b)}</span>
                    <span class="font-bold ${color}">${p.syn >= 0 ? '+' : ''}${p.syn.toFixed(0)}%</span>
                </div>`;
            }).join('');
        }
    }
    container.innerHTML = html;
}

function renderInsightsTab(container, ctx) {
    const { themeGames, selectedFeatures, globalAvg, themeAvg, liftVsMarket, bestVol, avgRtp, FEATS, featureColors, selectedCategories } = ctx;

    let predHtml = '';
    if (selectedFeatures.size > 0) {
        const matchingGames = themeGames.filter(g => {
            const gf = parseFeatsLocal(g.features);
            return [...selectedFeatures].some(f => gf.includes(f));
        });
        if (matchingGames.length >= 2) {
            const theos = matchingGames.map(g => g.performance_theo_win || 0).sort((a, b) => a - b);
            const p25 = theos[Math.floor(theos.length * 0.25)] || 0;
            const p75 = theos[Math.floor(theos.length * 0.75)] || 0;
            const barLeft = globalAvg > 0 ? Math.min(100, Math.max(0, (p25 / (globalAvg * 2)) * 100)) : 0;
            const barRight = globalAvg > 0 ? Math.min(100, Math.max(barLeft + 5, (p75 / (globalAvg * 2)) * 100)) : 50;
            const avgLine = globalAvg > 0 ? Math.min(100, (globalAvg / (globalAvg * 2)) * 100) : 50;
            const midpoint = (p25 + p75) / 2;
            const vsMkt = midpoint - globalAvg;
            const vsMktAbs = Math.abs(vsMkt).toFixed(1);
            const vsMktColor = vsMkt >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400';
            const vsMktLabel = vsMkt >= 0 ? `+${vsMktAbs} above market avg` : `${vsMktAbs} below market avg`;
            predHtml = `<div class="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 mb-5">
                <div class="text-xs font-medium text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-2">Predicted Performance</div>
                <div class="flex items-baseline gap-2 mb-1">
                    <span class="text-2xl font-bold text-gray-900 dark:text-white">${p25.toFixed(1)} – ${p75.toFixed(1)}</span>
                    <span class="text-sm text-gray-500">Theo Win</span>
                </div>
                <div class="text-base font-bold ${vsMktColor} mb-2">${vsMktLabel}</div>
                <div class="relative h-3 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden mb-1.5">
                    <div class="absolute h-full bg-indigo-400/60 dark:bg-indigo-500/60 rounded-full" style="left:${barLeft}%;width:${barRight - barLeft}%"></div>
                    <div class="absolute top-0 bottom-0 w-0.5 bg-gray-500 dark:bg-gray-300" style="left:${avgLine}%"></div>
                </div>
                <div class="text-xs text-gray-500">Market avg: ${globalAvg.toFixed(1)} · Based on ${matchingGames.length} games</div>
            </div>`;
        }
    }

    let recipeSection = '';
    try {
        const tGames = themeGames.map(g => ({ feats: parseFeatsLocal(g.features).sort(), theo: g.performance_theo_win || 0 }));
        const combos = [];
        for (let size = 2; size <= 4; size++) {
            const indices = [];
            const gen = (start) => {
                if (indices.length === size) {
                    const combo = indices.map(i => FEATS[i]);
                    const matching = tGames.filter(g => combo.every(f => g.feats.includes(f)));
                    if (matching.length >= 3) {
                        const avg = matching.reduce((s, g) => s + g.theo, 0) / matching.length;
                        const lift = themeAvg > 0 ? ((avg - themeAvg) / themeAvg * 100) : 0;
                        combos.push({ feats: combo, count: matching.length, avg, lift });
                    }
                    return;
                }
                for (let i = start; i < FEATS.length; i++) { indices.push(i); gen(i + 1); indices.pop(); }
            };
            gen(0);
        }
        combos.sort((a, b) => b.avg - a.avg);
        const topCombos = combos.slice(0, 5);
        if (topCombos.length > 0) {
            recipeSection = `<div class="mb-5">
                <div class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Best Feature Recipes</div>
                ${topCombos.map((c, i) => {
                    const hasSelected = selectedFeatures.size > 0 && c.feats.some(f => selectedFeatures.has(f));
                    const chips = c.feats.map(f => `<span class="px-2 py-0.5 rounded text-xs font-medium ${featureColors[f] || 'bg-gray-100 text-gray-700'}">${escapeHtml(shortF[f] || f)}</span>`).join('<span class="text-gray-400 text-[10px]">+</span>');
                    const liftColor = c.lift >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500';
                    return `<div class="flex items-center gap-2 py-2 ${i > 0 ? 'border-t border-gray-100 dark:border-gray-700' : ''} ${hasSelected ? 'bg-indigo-50/50 dark:bg-indigo-900/10 rounded px-1' : ''}">
                        <span class="text-xs text-gray-400 w-3">${i + 1}</span>
                        <div class="flex flex-wrap items-center gap-1 flex-1">${chips}</div>
                        <span class="text-xs text-gray-400">${c.count}</span>
                        <span class="text-sm font-bold ${liftColor} w-14 text-right">${c.lift >= 0 ? '+' : ''}${c.lift.toFixed(0)}%</span>
                    </div>`;
                }).join('')}
            </div>`;
        }
    } catch { /* skip */ }

    const mechMap = {};
    themeGames.forEach(g => { const m = g.mechanic_primary || g.mechanic || ''; if (m) { if (!mechMap[m]) mechMap[m] = { count: 0, sum: 0 }; mechMap[m].count++; mechMap[m].sum += (g.performance_theo_win || 0); } });
    const topMechanics = Object.entries(mechMap).map(([n, d]) => ({ name: n, count: d.count, avg: d.sum / d.count })).sort((a, b) => b.avg - a.avg).slice(0, 5);
    const provMap = {};
    themeGames.forEach(g => { const p = g.provider_studio || g.provider || ''; if (p) provMap[p] = (provMap[p] || 0) + 1; });
    const topProvs = Object.entries(provMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const themesLabel = [...selectedCategories].join(' & ');
    const featsLabel = [...selectedFeatures].map(f => shortF[f] || f);
    const topMech = topMechanics.length > 0 ? topMechanics[0].name : '';
    const topProv = topProvs.length > 0 ? topProvs[0][0] : '';
    const perfWord = liftVsMarket >= 10 ? 'strong' : liftVsMarket >= 0 ? 'solid' : 'competitive';
    const volWord = bestVol ? bestVol.name.toLowerCase() : 'mixed';
    let conceptText = `A <strong>${escapeHtml(themesLabel)}</strong>-themed slot`;
    if (featsLabel.length > 0) conceptText += ` featuring <strong>${featsLabel.map(f => escapeHtml(f)).join('</strong>, <strong>')}</strong>`;
    conceptText += `. The ${escapeHtml(themesLabel)} category has ${themeGames.length} games in market with ${perfWord} performance`;
    if (liftVsMarket !== 0) conceptText += ` (${liftVsMarket >= 0 ? '+' : ''}${liftVsMarket.toFixed(0)}% vs avg)`;
    conceptText += ` and ${volWord} volatility.`;
    if (topMech) conceptText += ` Top mechanic: <strong>${escapeHtml(topMech)}</strong>.`;
    if (topProv) conceptText += ` Market leader: ${escapeHtml(topProv)}.`;

    container.innerHTML = `
        <div class="mb-5 p-4 rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-100 dark:border-indigo-800/40">
            <div class="flex items-start gap-2"><span class="text-lg mt-0.5">💡</span><div>
                <div class="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-1">Game Concept</div>
                <div class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">${conceptText}</div>
            </div></div>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3.5 text-center"><div class="text-2xl font-bold text-gray-900 dark:text-white">${themeGames.length}</div><div class="text-xs text-gray-500">Games</div></div>
            <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3.5 text-center"><div class="text-2xl font-bold text-indigo-600 dark:text-indigo-400">${themeAvg.toFixed(1)}</div><div class="text-xs text-gray-500">Avg Theo</div></div>
            <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3.5 text-center"><div class="text-2xl font-bold ${liftVsMarket >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}">${liftVsMarket >= 0 ? '+' : ''}${liftVsMarket.toFixed(0)}%</div><div class="text-xs text-gray-500">vs Market</div></div>
            <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3.5 text-center"><div class="text-2xl font-bold text-gray-900 dark:text-white">${bestVol ? escapeHtml(bestVol.name) : '—'}</div><div class="text-xs text-gray-500">Volatility${avgRtp ? ` · ${avgRtp.toFixed(1)}%` : ''}</div></div>
        </div>
        ${predHtml}
        ${recipeSection}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div><div class="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">Top Mechanics</div><div class="space-y-1.5">${topMechanics.map((m, i) => `<div class="flex items-center gap-2 text-sm"><span class="w-4 text-gray-400">${i+1}</span><span class="flex-1 text-gray-800 dark:text-gray-200 truncate">${escapeHtml(m.name)}</span><span class="text-gray-400 text-xs">${m.count}</span><span class="text-emerald-600 dark:text-emerald-400 font-semibold w-10 text-right">${m.avg.toFixed(1)}</span></div>`).join('') || '<span class="text-sm text-gray-400">No data</span>'}</div></div>
            <div><div class="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">Active Providers</div><div class="flex flex-wrap gap-1.5">${topProvs.map(([p, c]) => `<span class="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">${escapeHtml(p)} (${c})</span>`).join('')}</div></div>
        </div>`;
}

function renderCompetitionTab(container, ctx) {
    const { themeGames, selectedFeatures, FEATS, featureColors } = ctx;
    let compGames;
    if (selectedFeatures.size > 0) {
        compGames = themeGames.map(g => {
            const gf = parseFeatsLocal(g.features);
            const featOverlap = [...selectedFeatures].filter(f => gf.includes(f)).length;
            const featTotal = new Set([...selectedFeatures, ...gf.filter(f => FEATS.includes(f))]).size;
            const jaccard = featTotal > 0 ? featOverlap / featTotal : 0;
            return { ...g, jaccard, gf };
        }).filter(g => g.jaccard > 0).sort((a, b) => b.jaccard - a.jaccard || (b.performance_theo_win || 0) - (a.performance_theo_win || 0)).slice(0, 8);
    } else {
        compGames = [...themeGames].sort((a, b) => (b.performance_theo_win || 0) - (a.performance_theo_win || 0)).slice(0, 8).map(g => ({ ...g, gf: parseFeatsLocal(g.features) }));
    }

    const blueOcean = selectedFeatures.size >= 2 && themeGames.filter(g => {
        const gf = parseFeatsLocal(g.features);
        return [...selectedFeatures].every(f => gf.includes(f));
    }).length === 0;

    const exactCount = selectedFeatures.size > 0 ? themeGames.filter(g => {
        const gf = parseFeatsLocal(g.features);
        return [...selectedFeatures].every(f => gf.includes(f));
    }).length : 0;
    const densityLabel = exactCount === 0 ? 'Blue Ocean' : exactCount <= 3 ? 'Low' : exactCount <= 8 ? 'Moderate' : 'High';
    const densityColor = exactCount === 0 ? 'text-emerald-600 dark:text-emerald-400' : exactCount <= 3 ? 'text-blue-600 dark:text-blue-400' : exactCount <= 8 ? 'text-amber-600 dark:text-amber-400' : 'text-red-500';
    const nudgeHint = selectedFeatures.size === 0 ? `<div class="mb-5 px-4 py-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg text-sm text-gray-500 dark:text-gray-400 text-center">Select features in the left panel to see competitor analysis</div>` : '';

    container.innerHTML = `
        ${nudgeHint}
        ${selectedFeatures.size > 0 ? `<div class="flex items-center gap-4 mb-5 p-4 rounded-lg bg-gray-50 dark:bg-gray-700/30">
            <div class="text-center"><div class="text-3xl font-bold ${densityColor}">${exactCount}</div><div class="text-xs text-gray-500 uppercase">Direct Rivals</div></div>
            <div class="w-px h-10 bg-gray-200 dark:bg-gray-600 shrink-0"></div>
            <div class="text-sm text-gray-600 dark:text-gray-300">Competition density: <span class="font-bold ${densityColor}">${densityLabel}</span></div>
        </div>` : ''}
        ${blueOcean ? `<div class="mb-5 px-4 py-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg text-sm text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-2"><span>💎</span> Blue Ocean — no existing game combines ${[...selectedFeatures].map(f => shortF[f] || f).join(' + ')} in this theme</div>` : ''}
        <hr class="border-gray-200 dark:border-gray-700 mb-4">
        <div class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">${selectedFeatures.size > 0 ? 'Closest Competitors' : 'Top Performers'}</div>
        <div class="space-y-2.5">
            ${compGames.map((g, idx) => {
                const theo = (g.performance_theo_win || 0).toFixed(1);
                const featPills = (g.gf || []).filter(f => FEATS.includes(f)).slice(0, 5).map(f => {
                    const isShared = selectedFeatures.has(f);
                    const cls = isShared ? featureColors[f] || 'bg-gray-100 text-gray-700' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400';
                    return `<span class="px-2 py-0.5 rounded text-xs font-medium ${cls}">${escapeHtml(shortF[f] || f)}</span>`;
                }).join('');
                const provider = g.provider_studio || g.provider || '';
                return `<div class="flex items-center gap-3 py-3 px-4 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-700/20 hover:bg-white dark:hover:bg-gray-700/40 hover:shadow-sm transition-all cursor-pointer" onclick="${safeOnclick('window.showGameDetails', g.name)}">
                    <span class="text-sm text-gray-400 font-bold w-5 shrink-0">${idx + 1}</span>
                    <div class="flex-1 min-w-0">
                        <div class="text-base font-semibold text-gray-800 dark:text-gray-200 truncate">${escapeHtml(g.name || 'Unknown')}</div>
                        ${provider ? `<div class="text-xs text-gray-400 truncate">${escapeHtml(provider)}</div>` : ''}
                        <div class="flex items-center gap-1.5 mt-1.5 flex-wrap">${featPills}</div>
                    </div>
                    <div class="text-right shrink-0 w-14"><div class="text-base font-bold text-indigo-600 dark:text-indigo-400">${theo}</div><div class="text-xs text-gray-400">theo</div></div>
                </div>`;
            }).join('')}
        </div>`;
}

function renderSymbolsTab(container, ctx) {
    const { themeGames: symGames, selectedFeatures, themeAvg } = ctx;
    if (symGames.length < 3) {
        container.innerHTML = '<div class="text-center text-gray-400 text-sm py-8">Not enough symbol data for this theme</div>';
        return;
    }

    const sorted = [...symGames].sort((a, b) => (b.performance_theo_win || 0) - (a.performance_theo_win || 0));
    const top25 = sorted.slice(0, Math.max(3, Math.ceil(sorted.length * 0.25)));
    const { catStats } = aggregateSymbolStats(symGames);

    function buildPkg(games) {
        const sf = {}, cf = {};
        games.forEach(g => {
            const syms = parseSymbols(g.symbols);
            const sc = new Set();
            syms.forEach(s => {
                const str = normalizeSymbolName(String(s));
                if (!str) return;
                const cat = categorizeSymbol(str);
                sf[str] = (sf[str] || 0) + 1;
                if (!sc.has(cat)) { cf[cat] = (cf[cat] || 0) + 1; sc.add(cat); }
            });
        });
        return {
            topSym: Object.entries(sf).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count, cat: categorizeSymbol(name) })),
            catBreak: Object.entries(cf).sort((a, b) => b[1] - a[1]).map(([cat, count]) => ({ cat, pct: (count / games.length * 100).toFixed(0) })),
            avgTheo: games.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / games.length,
            gameCount: games.length
        };
    }

    const highPerf = buildPkg(top25);
    const standard = buildPkg(symGames);
    const outlierGames = top25.filter(g => {
        const syms = parseSymbols(g.symbols).map(s => normalizeSymbolName(String(s))).filter(Boolean);
        const cats = new Set(syms.map(s => categorizeSymbol(s)));
        return [...cats].filter(c => (catStats[c]?.gameCount || 0) / symGames.length < 0.4).length >= 2;
    });
    const innovation = buildPkg(outlierGames.length >= 3 ? outlierGames : top25.slice(0, Math.ceil(top25.length / 2)));

    const ratingStars = (avg) => {
        const norm = themeAvg > 0 ? (avg / themeAvg) : 1;
        const stars = Math.min(5, Math.max(1, Math.round(norm * 3)));
        return '<span class="text-amber-400">' + '★'.repeat(stars) + '</span><span class="text-gray-300 dark:text-gray-600">' + '★'.repeat(5 - stars) + '</span>';
    };

    function renderPkgCard(pkg, title, icon, borderColor) {
        const symChips = pkg.topSym.map(s => {
            const col = SYMBOL_CAT_COLORS[s.cat];
            return `<span class="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ring-1 ${col.cls} ${col.ring}">${escapeHtml(s.name)}</span>`;
        }).join('');
        const catMini = pkg.catBreak.slice(0, 5).map(c => {
            const col = SYMBOL_CAT_COLORS[c.cat];
            return `<span class="text-xs flex items-center gap-1"><span class="w-2 h-2 rounded-full ${col?.bar || 'bg-gray-400'}"></span>${c.cat} ${c.pct}%</span>`;
        }).join('');
        return `<div class="border ${borderColor} rounded-xl p-5 bg-white dark:bg-gray-800">
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2"><span class="text-2xl">${icon}</span><span class="text-base font-bold text-gray-800 dark:text-gray-200">${title}</span></div>
                <div class="flex items-center gap-2"><span class="text-base">${ratingStars(pkg.avgTheo)}</span><span class="text-base font-bold text-gray-600 dark:text-gray-400">${pkg.avgTheo.toFixed(1)}</span></div>
            </div>
            <div class="flex flex-wrap gap-2 mb-3">${symChips}</div>
            <div class="flex flex-wrap gap-2.5 text-gray-400">${catMini}</div>
            <div class="text-xs text-gray-400 mt-2.5">Based on ${pkg.gameCount} games</div>
        </div>`;
    }

    container.innerHTML = `
        <div class="flex items-center gap-2 mb-5"><span class="text-2xl">🎲</span><div>
            <div class="text-lg font-bold text-gray-900 dark:text-white">Symbol Package Suggestions</div>
            <div class="text-xs text-gray-500">${symGames.length} games analyzed${selectedFeatures.size > 0 ? ', filtered by your features' : ''}</div>
        </div></div>
        <div class="space-y-4">
            ${renderPkgCard(highPerf, 'High Performance', '🏆', 'border-emerald-200 dark:border-emerald-800')}
            ${renderPkgCard(standard, 'Market Standard', '📊', 'border-blue-200 dark:border-blue-800')}
            ${renderPkgCard(innovation, 'Innovation Pick', '💡', 'border-violet-200 dark:border-violet-800')}
        </div>`;
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
    feats.forEach((f, i) => { map[f] = TAILWIND_PILL_CLASSES[i % TAILWIND_PILL_CLASSES.length]; });
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
        tabsWrapper: document.getElementById('bp-tabs-wrapper'),
        tabInsights: document.getElementById('bp-tab-insights'),
        tabCompetition: document.getElementById('bp-tab-competition'),
        tabSymbols: document.getElementById('bp-tab-symbols'),
        clearBtn: document.getElementById('bp-clear-btn'),
        ideaPanel: document.getElementById('bp-idea-panel'),
        ideaTextarea: document.getElementById('bp-idea-textarea'),
        ideaTags: document.getElementById('bp-idea-tags'),
    };
}

function buildBlueprintHTML() {
    return `
    <div class="flex gap-5" style="min-height:420px">
        <div class="w-[600px] shrink-0">
            <div class="sticky top-28 flex flex-col gap-3 max-h-[calc(100vh-8rem)]">
                <div id="bp-score-panel" class="rounded-xl shadow-lg p-5 text-center transition-all duration-500" style="background:linear-gradient(135deg,#94a3b8,#64748b)">
                    <div class="text-base font-semibold text-white/70 uppercase tracking-wider mb-1">Blueprint Score</div>
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
                                <button id="bp-pick-btn" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all" title="Auto-pick best combo"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> Pick for me</button>
                                <button id="bp-clear-btn" class="hidden items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-all" title="Reset"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg> Clear</button>
                            </div>
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
                <div id="bp-tabs-wrapper" class="hidden">
                    <div class="flex border-b border-gray-200 dark:border-gray-700 px-3 pt-1 gap-1">
                        <button class="bp-tab flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 transition-all" data-tab="insights">📊 Insights</button>
                        <button class="bp-tab flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-all" data-tab="symbols">🎲 Symbols</button>
                        <button class="bp-tab flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-all" data-tab="competition">⚔️ Competition</button>
                    </div>
                    <div id="bp-tab-insights" class="bp-tab-content p-6"></div>
                    <div id="bp-tab-symbols" class="bp-tab-content p-6 hidden"></div>
                    <div id="bp-tab-competition" class="bp-tab-content p-6 hidden"></div>
                </div>
            </div>
        </div>
    </div>`;
}
