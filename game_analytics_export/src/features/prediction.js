// Blueprint prediction and concept analysis
import { gameData } from '../lib/data.js';
import { VALID_MECHANICS, getMechanicDefinition } from '../config/mechanics.js';
import {
    analyzeGameSuccessFactors,
    generateRecommendations,
    predictFromSimilarGames,
    getDatasetStats,
} from '../lib/game-analytics-engine.js';
import { escapeHtml, safeOnclick } from '../lib/sanitize.js';
import { log, warn } from '../lib/env.js';
import { parseFeatsLocal } from '../ui/renderers/overview-renderer.js';
import { CANONICAL_FEATURES, SHORT_FEATURE_LABELS } from '../lib/features.js';
import { F } from '../lib/game-fields.js';

// Initialize Blueprint prediction chips
export function setupPrediction() {
    log('🔮 setupPrediction() called');
    const themesContainer = document.getElementById('game-themes');
    const mechanicsContainer = document.getElementById('game-mechanics');

    if (!themesContainer || !mechanicsContainer) {
        warn('⚠️ Prediction containers not found - skipping setup');
        return;
    }

    log('  - Populating', gameData.themes.length, 'themes...');

    gameData.themes.forEach(theme => {
        const chip = document.createElement('div');
        chip.className =
            'theme-chip inline-block px-4 py-2.5 rounded-lg text-base font-medium cursor-pointer bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-indigo-100 dark:hover:bg-indigo-900 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors';
        chip.dataset.theme = theme.Theme;
        chip.textContent = `${theme.Theme} (${theme['Game Count']} games)`;
        chip.title = `Performance Index: ${theme['Smart Index'].toFixed(1)}`;

        chip.addEventListener('click', function () {
            document.querySelectorAll('#game-themes > div').forEach(c => {
                c.classList.remove('selected', 'bg-indigo-600', 'dark:bg-indigo-500', 'text-white');
                c.classList.add('bg-gray-100', 'dark:bg-gray-700', 'text-gray-800', 'dark:text-gray-200');
            });
            this.classList.add('selected', 'bg-indigo-600', 'dark:bg-indigo-500', 'text-white');
            this.classList.remove('bg-gray-100', 'dark:bg-gray-700', 'text-gray-800', 'dark:text-gray-200');
        });

        themesContainer.appendChild(chip);
    });

    const themeSearch = document.getElementById('theme-search');
    if (themeSearch) {
        themeSearch.addEventListener('input', () => {
            const q = themeSearch.value.toLowerCase();
            themesContainer.querySelectorAll('.theme-chip').forEach(chip => {
                chip.style.display = !q || chip.dataset.theme.toLowerCase().includes(q) ? '' : 'none';
            });
        });
    }

    const validMechanics = Object.keys(VALID_MECHANICS);
    validMechanics.sort().forEach(mechName => {
        const chip = document.createElement('div');
        chip.className =
            'mechanic-chip inline-block px-4 py-2.5 rounded-lg text-base font-medium cursor-pointer bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-purple-100 dark:hover:bg-purple-900 hover:text-purple-700 dark:hover:text-purple-300 transition-colors';
        chip.dataset.mechanic = mechName;

        const dataM = gameData.mechanics.find(m => m.Mechanic === mechName);
        const siText = dataM ? `PI: ${dataM['Smart Index'].toFixed(1)}` : 'New';
        chip.textContent = `${mechName} (${siText})`;

        const mechDef = getMechanicDefinition(mechName);
        if (mechDef) chip.title = mechDef.description;

        chip.addEventListener('click', function () {
            this.classList.toggle('selected');
            if (this.classList.contains('selected')) {
                this.classList.remove('bg-gray-100', 'dark:bg-gray-700', 'text-gray-800', 'dark:text-gray-200');
                this.classList.add('bg-purple-600', 'dark:bg-purple-500', 'text-white');
            } else {
                this.classList.add('bg-gray-100', 'dark:bg-gray-700', 'text-gray-800', 'dark:text-gray-200');
                this.classList.remove('bg-purple-600', 'dark:bg-purple-500', 'text-white');
            }
        });

        mechanicsContainer.appendChild(chip);
    });

    const mechanicSearch = document.getElementById('mechanic-search');
    if (mechanicSearch) {
        mechanicSearch.addEventListener('input', () => {
            const q = mechanicSearch.value.toLowerCase();
            mechanicsContainer.querySelectorAll('.mechanic-chip').forEach(chip => {
                chip.style.display = !q || chip.dataset.mechanic.toLowerCase().includes(q) ? '' : 'none';
            });
        });
    }
}

function getMechanicSmartIndexForSuggestion(mechanicName) {
    const row = gameData.mechanics?.find(m => m.Mechanic === mechanicName);
    return row ? row['Smart Index'] || 0 : 0;
}

/** Matches predictGameSuccess: 15 baseline when no mechanics with data; else SI-based /30 cap. */
function mechanicScoreComponent(mechData, maxMechSI) {
    if (!mechData.length) return 15;
    const avg = mechData.reduce((sum, m) => sum + (m['Smart Index'] || 0), 0) / mechData.length;
    return Math.min((avg / maxMechSI) * 30, 30);
}

function mechanicScoreWithAddedSi(mechData, addedSi, maxMechSI) {
    const sis = mechData.map(m => m['Smart Index'] || 0);
    sis.push(addedSi || 0);
    const avg = sis.reduce((a, b) => a + b, 0) / sis.length;
    return Math.min((avg / maxMechSI) * 30, 30);
}

function wirePredictionSuggestImprovements() {
    document.querySelectorAll('.prediction-suggest-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const section = btn.closest('.prediction-suggest-section');
            const panel = section?.querySelector('.prediction-suggestions-panel');
            if (!panel) return;
            if (panel.classList.contains('hidden')) {
                suggestImprovements(panel);
                panel.classList.remove('hidden');
            } else {
                panel.classList.add('hidden');
            }
        });
    });
}

/**
 * Ranks unselected VALID_MECHANICS by mechanic-score delta if that feature were added (Smart Index only).
 * @param {HTMLElement} container Panel element to render into
 */
export function suggestImprovements(container) {
    if (!container) return;

    const selectedMechanics = Array.from(document.querySelectorAll('#game-mechanics .mechanic-chip.selected')).map(
        chip => chip.dataset.mechanic
    );
    const mechData = selectedMechanics.map(mech => gameData.mechanics.find(m => m.Mechanic === mech)).filter(Boolean);
    const stats = getDatasetStats();
    const maxMechSI = stats?.maxMechSI || 90;
    const currentMechScore = mechanicScoreComponent(mechData, maxMechSI);

    const candidates = Object.keys(VALID_MECHANICS).filter(name => !selectedMechanics.includes(name));
    const ranked = candidates
        .map(name => {
            const si = getMechanicSmartIndexForSuggestion(name);
            const newMechScore = mechanicScoreWithAddedSi(mechData, si, maxMechSI);
            return { name, delta: newMechScore - currentMechScore };
        })
        .filter(x => x.delta > 0)
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 3);

    if (ranked.length === 0) {
        container.innerHTML = `
        <div class="mt-4 space-y-2">
            <h4 class="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">💡 Suggested Improvements</h4>
            <p class="text-xs text-gray-500 dark:text-gray-400">No mechanic additions raise your mechanic score with current data.</p>
        </div>`;
        return;
    }

    const cards = ranked
        .map(
            s => `
        <div class="flex items-center justify-between p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
            <div class="text-xs font-medium text-gray-900 dark:text-white">Add ${escapeHtml(s.name)}</div>
            <span class="text-xs font-bold text-emerald-600 dark:text-emerald-400">+${Math.round(s.delta)} pts</span>
        </div>`
        )
        .join('');

    container.innerHTML = `
        <div class="mt-4 space-y-2">
            <h4 class="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">💡 Suggested Improvements</h4>
            <div class="space-y-1.5">${cards}</div>
        </div>`;
}

// Predict game success from selected theme/mechanic chips
export function predictGameSuccess() {
    log('🎯 predictGameSuccess() called');

    const _gameName = document.getElementById('game-name').value;
    const selectedThemes = Array.from(document.querySelectorAll('#game-themes .theme-chip.selected')).map(
        chip => chip.dataset.theme
    );
    const selectedMechanics = Array.from(document.querySelectorAll('#game-mechanics .mechanic-chip.selected')).map(
        chip => chip.dataset.mechanic
    );

    if (selectedThemes.length === 0) {
        const themeSection = document.querySelector('.prediction-theme-section, #prediction-themes');
        if (themeSection) {
            themeSection.classList.add('ring-2', 'ring-red-400');
            themeSection.style.animation = 'blink-field 0.3s ease 3';
            setTimeout(() => {
                themeSection.classList.remove('ring-2', 'ring-red-400');
                themeSection.style.animation = '';
            }, 1000);
        }
        return;
    }

    const primaryTheme = selectedThemes[0];
    const similarResult = predictFromSimilarGames(primaryTheme, selectedMechanics);
    const stats = getDatasetStats();

    const themeData = selectedThemes.map(theme => gameData.themes.find(t => t.Theme === theme)).filter(Boolean);
    const mechData = selectedMechanics.map(mech => gameData.mechanics.find(m => m.Mechanic === mech)).filter(Boolean);

    const avgThemeSmartIndex = themeData.length
        ? themeData.reduce((sum, t) => sum + (t['Smart Index'] || 0), 0) / themeData.length
        : 0;
    const avgMechSmartIndex = mechData.length
        ? mechData.reduce((sum, m) => sum + (m['Smart Index'] || 0), 0) / mechData.length
        : 0;
    const avgThemePerformance = themeData.length
        ? themeData.reduce((sum, t) => sum + (t['Avg Theo Win Index'] || 0), 0) / themeData.length
        : 0;
    const themePopularity = themeData.length
        ? themeData.reduce((sum, t) => sum + (t['Game Count'] || 0), 0) / themeData.length
        : 0;

    const maxSI = stats?.maxThemeSI || 250;
    const maxMechSI = stats?.maxMechSI || 90;
    const maxCount = stats?.maxThemeCount || 500;
    const maxTheo = stats?.maxThemeTheo || 2;

    const themeScore = Math.min((avgThemeSmartIndex / maxSI) * 40, 40);
    const mechScore = mechData.length > 0 ? Math.min((avgMechSmartIndex / maxMechSI) * 30, 30) : 15;
    const popularityScore = Math.min((themePopularity / maxCount) * 15, 15);
    const performanceScore = Math.min((avgThemePerformance / maxTheo) * 15, 15);

    let totalScore = Math.min(Math.round(themeScore + mechScore + popularityScore + performanceScore), 100);
    if (similarResult) {
        const similarBoost = Math.min(similarResult.percentile * 0.3, 15);
        totalScore = Math.min(Math.round(totalScore + similarBoost), 100);
    }

    const predictedTheo = similarResult?.predictedTheo ?? avgThemePerformance;
    const zScore = gameData.allGames?.length ? (predictedTheo - 3) / 2 : 0;
    const insights = analyzeGameSuccessFactors('Predicted', predictedTheo, zScore, selectedThemes);
    const engineRecs = generateRecommendations(insights, selectedThemes, zScore);

    let mainRecText;
    if (totalScore >= 75) {
        mainRecText = similarResult
            ? `Based on <strong>${similarResult.similarCount} similar games</strong> in our database (avg Theo Win: ${predictedTheo.toFixed(2)}), your concept shows strong potential.`
            : 'Your game concept shows strong potential based on historical data. The theme and mechanic combination is proven to perform well.';
    } else if (totalScore >= 50) {
        mainRecText = similarResult
            ? `Based on ${similarResult.similarCount} similar games (avg Theo: ${predictedTheo.toFixed(2)}). Consider adding popular mechanics or refining theme selection.`
            : 'Your concept has decent potential but could be improved. Consider adding popular mechanics or refining theme selection.';
    } else {
        mainRecText = similarResult
            ? `Only ${similarResult.similarCount} similar games found (avg Theo: ${predictedTheo.toFixed(2)}). Consider themes/mechanics with stronger historical performance.`
            : 'This combination shows weak historical performance. Consider choosing themes or mechanics with higher Performance Index scores.';
    }

    const recommendationItems = [mainRecText];
    if (insights?.length) recommendationItems.push(insights.slice(0, 2).join(' '));
    engineRecs.slice(0, 1).forEach(r => recommendationItems.push(r));

    const outputDiv = document.getElementById('prediction-output');
    const sidebarOutput = document.getElementById('prediction-output-sidebar');
    const resultsDiv = document.getElementById('prediction-results');

    let categoryClass, categoryLabel;
    if (totalScore >= 75) {
        categoryClass = 'category-excellent';
        categoryLabel = '✨ Excellent Potential';
    } else if (totalScore >= 50) {
        categoryClass = 'category-good';
        categoryLabel = '👍 Good Concept';
    } else if (totalScore >= 25) {
        categoryClass = 'category-average';
        categoryLabel = '⚠️ Needs Work';
    } else {
        categoryClass = 'category-poor';
        categoryLabel = '❌ High Risk';
    }

    const htmlContent = `
        <div style="text-align: center; margin-bottom: 1.5rem;">
            <div class="prediction-score">${totalScore}</div>
            <div style="font-size: 0.875rem; color: #64748b; font-weight: 600; margin-bottom: 0.75rem;">out of 100</div>
            <span class="prediction-category ${categoryClass}">${categoryLabel}</span>
        </div>
        ${
            similarResult
                ? `
        <div class="result-section">
            <strong>📊 Based on ${similarResult.similarCount} similar games</strong>
            <div class="analysis-item"><div class="analysis-label">Predicted Theo Win</div><div class="analysis-value">${predictedTheo.toFixed(2)}</div></div>
            <div class="analysis-item"><div class="analysis-label">Percentile</div><div class="analysis-value">${similarResult.percentile.toFixed(0)}th</div></div>
            ${similarResult.similarGames?.length ? `<p class="text-xs text-slate-500 dark:text-slate-400 mt-2">Examples: ${similarResult.similarGames.map(g => escapeHtml(g.name)).join(', ')}</p>` : ''}
        </div>`
                : ''
        }
        <div class="recommendation-card" style="margin-bottom: 1.25rem;">
            ${recommendationItems.map(t => `<p class="mb-2 last:mb-0">${escapeHtml(t)}</p>`).join('')}
        </div>
        <div class="result-section">
            <strong>📊 Performance Breakdown</strong>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-top: 0.75rem;">
                <div><div style="font-size: 0.75rem; text-transform: uppercase; color: #94a3b8; font-weight: 600; letter-spacing: 0.05em;">Theme</div><div class="metric-value">${Math.round(themeScore)}<span style="font-size: 1rem; color: #94a3b8;">/40</span></div><div class="progress-bar"><div class="progress-fill" style="width: ${(themeScore / 40) * 100}%;"></div></div></div>
                <div><div style="font-size: 0.75rem; text-transform: uppercase; color: #94a3b8; font-weight: 600; letter-spacing: 0.05em;">Mechanic</div><div class="metric-value">${Math.round(mechScore)}<span style="font-size: 1rem; color: #94a3b8;">/30</span></div><div class="progress-bar"><div class="progress-fill" style="width: ${(mechScore / 30) * 100}%;"></div></div></div>
                <div><div style="font-size: 0.75rem; text-transform: uppercase; color: #94a3b8; font-weight: 600; letter-spacing: 0.05em;">Popularity</div><div class="metric-value">${Math.round(popularityScore)}<span style="font-size: 1rem; color: #94a3b8;">/15</span></div><div class="progress-bar"><div class="progress-fill" style="width: ${(popularityScore / 15) * 100}%;"></div></div></div>
                <div><div style="font-size: 0.75rem; text-transform: uppercase; color: #94a3b8; font-weight: 600; letter-spacing: 0.05em;">Performance</div><div class="metric-value">${Math.round(performanceScore)}<span style="font-size: 1rem; color: #94a3b8;">/15</span></div><div class="progress-bar"><div class="progress-fill" style="width: ${(performanceScore / 15) * 100}%;"></div></div></div>
            </div>
        </div>
        <div class="result-section">
            <strong>🎨 Theme Analysis</strong>
            ${themeData.map(t => `<div class="analysis-item"><div class="analysis-label">${escapeHtml(t.Theme)}</div><div class="analysis-value">${t['Smart Index'].toFixed(1)}</div></div>`).join('')}
        </div>
        ${mechData.length > 0 ? `<div class="result-section"><strong>⚙️ Mechanic Analysis</strong>${mechData.map(m => `<div class="analysis-item"><div class="analysis-label">${escapeHtml(m.Mechanic)}</div><div class="analysis-value">${m['Smart Index'].toFixed(1)}</div></div>`).join('')}</div>` : ''}
        <div class="prediction-suggest-section" style="margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid rgba(148, 163, 184, 0.35);">
            <button type="button" class="prediction-suggest-btn w-full py-2.5 px-4 rounded-xl text-sm font-semibold border border-emerald-600 dark:border-emerald-500 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors">Suggest Improvements</button>
            <div class="prediction-suggestions-panel hidden"></div>
        </div>
    `;

    if (sidebarOutput) {
        sidebarOutput.innerHTML = htmlContent;
        const sidebar = document.getElementById('prediction-results-sidebar');
        if (sidebar) sidebar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    if (outputDiv) outputDiv.innerHTML = htmlContent;
    wirePredictionSuggestImprovements();
    if (resultsDiv) resultsDiv.style.display = 'none';
}

// Concept analyzer (free-text game concept analysis)
function analyzeGameConcept() {
    const input = document.getElementById('concept-input');
    const resultsDiv = document.getElementById('concept-results');
    const detectedDiv = document.getElementById('concept-detected');
    const tagsDiv = document.getElementById('concept-tags');
    if (!input || !resultsDiv) return;

    const text = input.value.trim();
    if (!text) {
        input.classList.add('ring-2', 'ring-red-400');
        setTimeout(() => input.classList.remove('ring-2', 'ring-red-400'), 1500);
        return;
    }

    const lower = text.toLowerCase();
    const allThemes = (gameData.themes || []).map(t => t.Theme).filter(Boolean);
    const FEATS = CANONICAL_FEATURES;
    const shortF = SHORT_FEATURE_LABELS;

    const themeAliases = {
        egypt: 'Egyptian',
        egyptian: 'Egyptian',
        pharaoh: 'Egyptian',
        cleopatra: 'Egyptian',
        pyramid: 'Egyptian',
        asian: 'Asian',
        chinese: 'Asian',
        oriental: 'Asian',
        luck: 'Asian',
        fortune: 'Asian',
        irish: 'Irish',
        leprechaun: 'Irish',
        celtic: 'Irish',
        dragon: 'Fantasy',
        fantasy: 'Fantasy',
        wizard: 'Fantasy',
        magic: 'Fantasy',
        adventure: 'Adventure',
        explorer: 'Adventure',
        treasure: 'Adventure',
        quest: 'Adventure',
        fruit: 'Fruit',
        classic: 'Classic',
        retro: 'Classic',
        nostalgic: 'Classic',
        animal: 'Animals',
        wildlife: 'Animals',
        safari: 'Animals',
        ocean: 'Ocean',
        sea: 'Ocean',
        underwater: 'Ocean',
        fish: 'Ocean',
        greek: 'Greek/Mythology',
        mythology: 'Greek/Mythology',
        zeus: 'Greek/Mythology',
        god: 'Greek/Mythology',
        norse: 'Norse',
        viking: 'Norse',
        thor: 'Norse',
        odin: 'Norse',
        western: 'Western',
        cowboy: 'Western',
        'wild west': 'Western',
        horror: 'Horror',
        vampire: 'Horror',
        zombie: 'Horror',
        halloween: 'Horror',
        space: 'Space',
        cosmic: 'Space',
        galaxy: 'Space',
        alien: 'Space',
        pirate: 'Pirate',
        aztec: 'Aztec',
        mayan: 'Aztec',
        music: 'Music',
        rock: 'Music',
        gem: 'Gems',
        jewel: 'Gems',
    };

    const featAliases = {
        'free spin': 'Free Spins',
        freespin: 'Free Spins',
        'free game': 'Free Spins',
        'bonus spin': 'Free Spins',
        'hold and spin': 'Hold and Spin',
        'hold & spin': 'Hold and Spin',
        'lock and spin': 'Hold and Spin',
        wild: 'Wild Reels',
        wilds: 'Wild Reels',
        'wild reel': 'Wild Reels',
        expanding: 'Expanding Reels',
        expand: 'Expanding Reels',
        'expanding reel': 'Expanding Reels',
        'cash on reel': 'Cash On Reels',
        'cash reel': 'Cash On Reels',
        'coin on reel': 'Cash On Reels',
        'cash collect': 'Cash On Reels',
        nudge: 'Nudges',
        nudges: 'Nudges',
        persist: 'Persistence',
        persistence: 'Persistence',
        'pick bonus': 'Pick Bonus',
        pick: 'Pick Bonus',
        'pick game': 'Pick Bonus',
        'pick feature': 'Pick Bonus',
        respin: 'Respin',
        're-spin': 'Respin',
        jackpot: 'Static Jackpot',
        'static jackpot': 'Static Jackpot',
        'fixed jackpot': 'Static Jackpot',
        wheel: 'Wheel',
        'wheel bonus': 'Wheel',
        'wheel of fortune': 'Wheel',
        multiplier: 'Multiplier',
        multiply: 'Multiplier',
        multi: 'Multiplier',
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

    const detectedThemes = new Set();
    for (const [alias, theme] of Object.entries(themeAliases)) {
        if (lower.includes(alias)) {
            const match =
                allThemes.find(t => t.toLowerCase() === theme.toLowerCase()) ||
                allThemes.find(t => t.toLowerCase().includes(theme.toLowerCase()));
            if (match) detectedThemes.add(match);
        }
    }
    allThemes.forEach(t => {
        if (lower.includes(t.toLowerCase()) && t.length > 3) detectedThemes.add(t);
    });

    const detectedFeats = new Set();
    for (const [alias, feat] of Object.entries(featAliases)) {
        if (lower.includes(alias)) detectedFeats.add(feat);
    }
    FEATS.forEach(f => {
        if (lower.includes(f.toLowerCase())) detectedFeats.add(f);
    });

    let detectedVol = null;
    if (lower.includes('very high vol')) detectedVol = 'Very High';
    else if (lower.includes('high vol')) detectedVol = 'High';
    else if (lower.includes('medium-high') || lower.includes('medium high')) detectedVol = 'Medium-High';
    else if (lower.includes('low vol')) detectedVol = 'Low';
    else if (lower.includes('medium vol') || lower.includes('medium')) detectedVol = 'Medium';

    const themes = [...detectedThemes];
    const feats = [...detectedFeats];
    const primaryTheme = themes[0] || null;

    if (detectedDiv && tagsDiv) {
        let tags = '';
        themes.forEach(t => {
            tags += `<span class="px-2.5 py-1 text-[11px] font-semibold rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">🎨 ${escapeHtml(t)}</span>`;
        });
        feats.forEach(f => {
            tags += `<span class="px-2.5 py-1 text-[11px] font-semibold rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">⚙️ ${escapeHtml(shortF[f] || f)}</span>`;
        });
        if (detectedVol)
            tags += `<span class="px-2.5 py-1 text-[11px] font-semibold rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">🎲 ${detectedVol}</span>`;
        if (!tags)
            tags =
                '<span class="text-xs text-gray-400">No specific themes or features detected — try being more specific</span>';
        tagsDiv.innerHTML = tags;
        detectedDiv.classList.remove('hidden');
    }

    const allGames = gameData.allGames || [];
    const similarResult = primaryTheme ? predictFromSimilarGames(primaryTheme, feats) : null;
    const stats = getDatasetStats();

    const themeData = themes.map(t => gameData.themes.find(td => td.Theme === t)).filter(Boolean);

    const matchingGames = allGames
        .filter(g => {
            if (!primaryTheme) return false;
            if ((g.theme_consolidated || '').toLowerCase() !== primaryTheme.toLowerCase()) return false;
            if (feats.length === 0) return true;
            const gFeats = parseFeatsLocal(g.features);
            return feats.some(f => gFeats.includes(f));
        })
        .sort((a, b) => (b.performance_theo_win || 0) - (a.performance_theo_win || 0));

    const exactMatches =
        feats.length > 0
            ? matchingGames.filter(g => {
                  const gFeats = parseFeatsLocal(g.features);
                  return feats.every(f => gFeats.includes(f));
              })
            : [];

    const avgTheo =
        matchingGames.length > 0
            ? matchingGames.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / matchingGames.length
            : 0;
    const exactAvgTheo =
        exactMatches.length > 0
            ? exactMatches.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / exactMatches.length
            : 0;
    const globalAvg =
        allGames.length > 0 ? allGames.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / allGames.length : 0;
    const predictedTheo = exactMatches.length >= 3 ? exactAvgTheo : (similarResult?.predictedTheo ?? avgTheo);

    const themeGameCount = matchingGames.length;
    const saturation =
        themeGameCount > 50 ? 'High' : themeGameCount > 20 ? 'Moderate' : themeGameCount > 5 ? 'Low' : 'Very Low';
    const satColor = themeGameCount > 50 ? 'text-red-500' : themeGameCount > 20 ? 'text-amber-500' : 'text-emerald-500';

    const themeScore = themeData.length > 0 ? themeData[0]['Smart Index'] || 0 : 0;
    const maxSI = stats?.maxThemeSI || 250;
    const normalizedScore = Math.min(
        Math.round(
            (themeScore / maxSI) * 50 +
                (predictedTheo / (stats?.maxThemeTheo || 5)) * 30 +
                (feats.length >= 2 ? 10 : feats.length * 5) +
                (matchingGames.length >= 3 ? 10 : 0)
        ),
        100
    );

    let verdict, verdictColor, verdictBg;
    if (normalizedScore >= 75) {
        verdict = 'Strong Potential';
        verdictColor = 'text-emerald-700 dark:text-emerald-300';
        verdictBg = 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800';
    } else if (normalizedScore >= 50) {
        verdict = 'Decent Potential';
        verdictColor = 'text-blue-700 dark:text-blue-300';
        verdictBg = 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
    } else if (normalizedScore >= 25) {
        verdict = 'Needs Refinement';
        verdictColor = 'text-amber-700 dark:text-amber-300';
        verdictBg = 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800';
    } else {
        verdict = 'High Risk';
        verdictColor = 'text-red-700 dark:text-red-300';
        verdictBg = 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
    }

    let html = `
    <div class="${verdictBg} border rounded-2xl p-6">
        <div class="flex items-center justify-between mb-4">
            <div>
                <div class="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Market Analysis</div>
                <div class="text-xl font-bold ${verdictColor}">${verdict}</div>
            </div>
            <div class="text-right">
                <div class="text-4xl font-black ${verdictColor}">${normalizedScore}</div>
                <div class="text-[10px] text-gray-400 font-medium">/ 100</div>
            </div>
        </div>
        <div class="grid grid-cols-3 gap-4 mt-4">
            <div class="text-center"><div class="text-lg font-bold text-gray-900 dark:text-white">${predictedTheo ? predictedTheo.toFixed(2) : '—'}</div><div class="text-[10px] text-gray-500">Predicted Theo</div></div>
            <div class="text-center"><div class="text-lg font-bold text-gray-900 dark:text-white">${matchingGames.length}</div><div class="text-[10px] text-gray-500">Similar Games</div></div>
            <div class="text-center"><div class="text-lg font-bold ${satColor}">${saturation}</div><div class="text-[10px] text-gray-500">Market Saturation</div></div>
        </div>
    </div>`;

    if (exactMatches.length > 0 || matchingGames.length > 0) {
        const showGames = exactMatches.length >= 2 ? exactMatches.slice(0, 6) : matchingGames.slice(0, 6);
        const matchLabel =
            exactMatches.length >= 2
                ? `Games with exact recipe (${exactMatches.length})`
                : `Similar games in ${primaryTheme} (${matchingGames.length})`;
        html += `
        <div class="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-slate-600 overflow-hidden">
            <div class="px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-700">
                <div class="flex items-center justify-between">
                    <h3 class="text-sm font-bold text-gray-900 dark:text-white">🎮 ${matchLabel}</h3>
                    ${exactMatches.length >= 2 ? `<span class="text-xs text-gray-400">Avg Theo: <span class="font-bold ${exactAvgTheo >= globalAvg ? 'text-emerald-500' : 'text-red-400'}">${exactAvgTheo.toFixed(2)}</span></span>` : ''}
                </div>
            </div>
            <div class="p-4"><div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                ${showGames
                    .map(g => {
                        const gFeats = parseFeatsLocal(g.features);
                        const theo = g.performance_theo_win || 0;
                        const isAbove = theo >= globalAvg;
                        return `<div class="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition-colors cursor-pointer" onclick="${safeOnclick('window.showGameDetails', g.name)}">
                        <div class="flex-1 min-w-0"><div class="text-sm font-semibold text-gray-900 dark:text-white truncate">${escapeHtml(g.name)}</div><div class="text-[10px] text-gray-400">${escapeHtml(F.provider(g))} · ${gFeats.slice(0, 2).join(', ')}${gFeats.length > 2 ? ' +' + (gFeats.length - 2) : ''}</div></div>
                        <div class="text-right shrink-0"><div class="text-sm font-bold ${isAbove ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500'}">${theo.toFixed(2)}</div><div class="text-[9px] text-gray-400">theo</div></div>
                    </div>`;
                    })
                    .join('')}
            </div></div>
        </div>`;
    }

    if (primaryTheme && themeData.length > 0) {
        const pThemeGames = allGames.filter(
            g => (g.theme_consolidated || '').toLowerCase() === primaryTheme.toLowerCase()
        );
        const themeAvg =
            pThemeGames.length > 0
                ? pThemeGames.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / pThemeGames.length
                : 0;

        const featImpact = FEATS.map(f => {
            const withFeat = pThemeGames.filter(g => parseFeatsLocal(g.features).includes(f));
            if (withFeat.length < 2) return null;
            const avg = withFeat.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / withFeat.length;
            const lift = themeAvg > 0 ? ((avg - themeAvg) / themeAvg) * 100 : 0;
            return { feat: f, avg, lift, count: withFeat.length, selected: feats.includes(f) };
        })
            .filter(Boolean)
            .sort((a, b) => b.lift - a.lift);

        if (featImpact.length > 0) {
            html += `
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-slate-600 overflow-hidden">
                <div class="px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-700">
                    <h3 class="text-sm font-bold text-gray-900 dark:text-white">📊 Mechanic Impact for ${escapeHtml(primaryTheme)}</h3>
                    <p class="text-[10px] text-gray-400 mt-0.5">How each feature affects performance in this theme (baseline: ${themeAvg.toFixed(2)} avg theo)</p>
                </div>
                <div class="p-4 space-y-1.5">
                    ${featImpact
                        .map(fi => {
                            const isPos = fi.lift >= 0;
                            const barW = Math.min((Math.abs(fi.lift) / 30) * 100, 100);
                            return `<div class="flex items-center gap-3 py-1.5 ${fi.selected ? 'bg-indigo-50 dark:bg-indigo-900/20 -mx-2 px-2 rounded-lg ring-1 ring-indigo-200 dark:ring-indigo-800' : ''}">
                            <span class="text-xs w-24 font-medium ${fi.selected ? 'text-indigo-700 dark:text-indigo-300 font-bold' : 'text-gray-600 dark:text-gray-300'} shrink-0">${escapeHtml(shortF[fi.feat] || fi.feat)}</span>
                            <div class="flex-1 flex items-center gap-2"><div class="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden relative"><div class="absolute inset-y-0 ${isPos ? 'left-1/2' : 'right-1/2'} h-full rounded-full ${isPos ? 'bg-emerald-400' : 'bg-red-400'}" style="width:${barW / 2}%"></div></div></div>
                            <span class="text-xs font-bold tabular-nums w-14 text-right ${isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}">${isPos ? '+' : ''}${fi.lift.toFixed(0)}%</span>
                            <span class="text-[10px] text-gray-400 w-16 text-right">${fi.count} games</span>
                        </div>`;
                        })
                        .join('')}
                </div>
            </div>`;
        }
    }

    const suggestions = [];
    if (!primaryTheme)
        suggestions.push('Try mentioning a specific theme like "Egyptian", "Asian", "Fantasy", or "Adventure"');
    if (feats.length === 0)
        suggestions.push('Add specific features like "free spins", "hold and spin", "wild reels", or "jackpot"');
    if (feats.length === 1)
        suggestions.push('Games with 2-3 features tend to perform better — consider adding another mechanic');
    if (matchingGames.length > 40)
        suggestions.push(
            `${primaryTheme} is a crowded market with ${matchingGames.length} existing games — consider a less saturated theme`
        );
    if (predictedTheo > 0 && predictedTheo < globalAvg)
        suggestions.push(
            'This combination historically underperforms the market average — consider different features'
        );

    if (primaryTheme && feats.length < 3) {
        const pThemeGames = allGames.filter(
            g => (g.theme_consolidated || '').toLowerCase() === primaryTheme.toLowerCase()
        );
        const themeAvg =
            pThemeGames.length > 0
                ? pThemeGames.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / pThemeGames.length
                : 0;
        let bestUnselected = null,
            bestLift = -Infinity;
        FEATS.forEach(f => {
            if (feats.includes(f)) return;
            const wf = pThemeGames.filter(g => parseFeatsLocal(g.features).includes(f));
            if (wf.length < 3) return;
            const avg = wf.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / wf.length;
            const lift = themeAvg > 0 ? ((avg - themeAvg) / themeAvg) * 100 : 0;
            if (lift > bestLift) {
                bestLift = lift;
                bestUnselected = f;
            }
        });
        if (bestUnselected && bestLift > 0) {
            suggestions.push(
                `Consider adding <strong>${shortF[bestUnselected] || bestUnselected}</strong> — it boosts ${primaryTheme} performance by +${bestLift.toFixed(0)}%`
            );
        }
    }

    if (suggestions.length > 0) {
        html += `
        <div class="bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-900/20 dark:to-indigo-900/20 border border-violet-200 dark:border-violet-800 rounded-xl p-5">
            <div class="text-xs font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400 mb-2">💡 Suggestions</div>
            <ul class="space-y-1.5">${suggestions.map(s => `<li class="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2"><span class="text-violet-400 mt-0.5">→</span><span>${s}</span></li>`).join('')}</ul>
        </div>`;
    }

    resultsDiv.innerHTML = html;
    resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

window.analyzeGameConcept = analyzeGameConcept;

async function useOpportunityCombo(theme, mechanic) {
    const conceptInput = document.getElementById('concept-input');
    if (!conceptInput) {
        await window.showPage('prediction');
        setTimeout(() => {
            const ci = document.getElementById('concept-input');
            if (ci) {
                ci.value = `${theme} theme with ${mechanic}`;
                analyzeGameConcept();
            }
        }, 200);
        return;
    }
    conceptInput.value = `${theme} theme with ${mechanic}`;
    analyzeGameConcept();
}
window.useOpportunityCombo = useOpportunityCombo;

window.setConceptExample = function (btn) {
    const text = btn.dataset.text;
    const input = document.getElementById('concept-input');
    if (input && text) {
        input.value = text;
        input.focus();
    }
};

window.switchPredictionTab = function () {};
