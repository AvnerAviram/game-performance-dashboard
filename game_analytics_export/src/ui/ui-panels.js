// ==========================================
// GAME DETAIL PANEL - REFACTORED WITH COMPONENTS
// ==========================================

import { gameData } from '../lib/data.js';
import { log } from '../lib/env.js';
import {
    PanelSection,
    MetricGrid,
    Metric,
    GameListItem,
    VolatilityBadge,
    AnomalyBadge,
    GRADIENTS,
    ACCENTS,
    EmptyState,
} from '../components/dashboard-components.js';
import { SYMBOL_CATEGORIES, SYMBOL_CAT_COLORS, categorizeSymbol, parseSymbols } from '../lib/symbol-utils.js';
import { apiPost } from '../lib/api-client.js';
import { escapeHtml, escapeAttr, safeOnclick, sanitizeUrl } from '../lib/sanitize.js';
import { PROVIDER_URLS } from '../config/provider-urls.js';
import { parseFeatures } from '../lib/parse-features.js';
import { collapsibleList } from './collapsible-list.js';
import { F, isReliableConfidence } from '../lib/game-fields.js';

export function showGameDetails(gameName) {
    const game = gameData.allGames.find(g => g.name === gameName);
    if (!game) return;

    log('🎮 Opening game panel for:', gameName);

    const gamePanelTitle = document.getElementById('game-panel-title');
    if (gamePanelTitle) gamePanelTitle.textContent = game.name;

    // ===== DESCRIPTION SECTION =====
    let descriptionSection = '';
    if (game.description) {
        const descContent = `<p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">${escapeHtml(game.description)}</p>`;
        descriptionSection = PanelSection({
            title: 'About',
            icon: '📖',
            gradient: GRADIENTS.category,
            accent: ACCENTS.category,
            content: descContent,
        });
    }

    // ===== PLAY NOW =====
    const searchQuery = encodeURIComponent(`${game.name} play online slot casino`);
    const playNowUrl = `https://www.google.com/search?q=${searchQuery}`;
    const playNowHtml = `<div class="my-2">
        <a href="${sanitizeUrl(playNowUrl)}" target="_blank" rel="noopener noreferrer"
           class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-xl transition-colors border border-indigo-200 dark:border-indigo-800">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
            🎰 Play Now
        </a>
    </div>`;

    // ===== PERFORMANCE SECTION =====
    const performanceMetrics = [
        {
            label: 'Rank',
            value: `<span class="whitespace-nowrap">#${game.performance_rank || 'N/A'}${game.performance_anomaly ? AnomalyBadge(game.performance_anomaly) : ''}</span>`,
        },
        { label: 'Theo Win', value: game.performance_theo_win?.toFixed(2) || 'N/A' },
        {
            label: 'Market Share %',
            value:
                game.performance_market_share_percent != null
                    ? `${game.performance_market_share_percent.toFixed(2)}%`
                    : 'N/A',
        },
        { label: 'Percentile', value: game.performance_percentile || 'N/A' },
    ];

    // Performance insight: clear, actionable explanation
    let insightHtml = '';
    if (game.performance_theo_win != null) {
        const themeEntry = gameData.themes?.find(
            t => (t.Theme || t.theme) === (game.theme_consolidated || game.theme_primary)
        );
        const themeAvg = themeEntry ? themeEntry.avg_theo_win || themeEntry['Avg Theo Win Index'] || 0 : 0;
        const themeCount = themeEntry ? themeEntry.game_count || themeEntry['Game Count'] || 0 : 0;
        const themeName = game.theme_consolidated || game.theme_primary || 'Unknown';
        const tw = game.performance_theo_win;
        const pctRaw = game.performance_percentile ? parseInt(game.performance_percentile) : null;
        const pct = Number.isFinite(pctRaw) ? pctRaw : null;

        const lines = [];
        if (themeAvg > 0) {
            const diff = ((tw - themeAvg) / themeAvg) * 100;
            const isAbove = tw >= themeAvg;
            const icon = isAbove ? '▲' : '▼';
            const color = isAbove ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400';
            lines.push(
                `<span class="${color} font-semibold">${icon} ${Math.abs(diff).toFixed(0)}%</span> ${isAbove ? 'above' : 'below'} the average "${escapeHtml(themeName)}" game (avg: ${themeAvg.toFixed(1)})`
            );
        }
        if (pct != null) {
            const tier =
                pct >= 90
                    ? 'Top 10%'
                    : pct >= 75
                      ? 'Top 25%'
                      : pct >= 50
                        ? 'Above median'
                        : pct >= 25
                          ? 'Below median'
                          : 'Bottom 25%';
            const tierColor =
                pct >= 75
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : pct >= 50
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-amber-600 dark:text-amber-400';
            lines.push(
                `Ranked <span class="${tierColor} font-semibold">${tier}</span> across all ${themeCount} "${escapeHtml(themeName)}" games`
            );
        }
        // Provider context — how does this studio compare?
        const providerName = F.provider(game);
        if (providerName && providerName !== 'Unknown') {
            const provGames = (gameData.allGames || []).filter(
                g => F.provider(g) === providerName && g.performance_theo_win != null
            );
            if (provGames.length >= 3) {
                const provAvg = provGames.reduce((s, g) => s + g.performance_theo_win, 0) / provGames.length;
                const vsProvider = ((tw - provAvg) / provAvg) * 100;
                if (Math.abs(vsProvider) >= 10) {
                    const isAboveProv = vsProvider > 0;
                    const provColor = isAboveProv
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400';
                    lines.push(
                        `<span class="${provColor} font-semibold">${isAboveProv ? '▲' : '▼'} ${Math.abs(vsProvider).toFixed(0)}%</span> vs ${escapeHtml(providerName)}'s average (${provAvg.toFixed(2)}) across ${provGames.length} games`
                    );
                }
            }
        }

        // Volatility insight — does this vol level help or hurt in this theme?
        const vol = game.specs_volatility;
        if (vol && themeCount >= 5) {
            const sameVolGames = (gameData.allGames || []).filter(
                g =>
                    g.specs_volatility === vol &&
                    (g.theme_consolidated || g.theme_primary) === themeName &&
                    g.performance_theo_win != null
            );
            const diffVolGames = (gameData.allGames || []).filter(
                g =>
                    g.specs_volatility &&
                    g.specs_volatility !== vol &&
                    (g.theme_consolidated || g.theme_primary) === themeName &&
                    g.performance_theo_win != null
            );
            if (sameVolGames.length >= 2 && diffVolGames.length >= 2) {
                const sameAvg = sameVolGames.reduce((s, g) => s + g.performance_theo_win, 0) / sameVolGames.length;
                const diffAvg = diffVolGames.reduce((s, g) => s + g.performance_theo_win, 0) / diffVolGames.length;
                const volLift = ((sameAvg - diffAvg) / diffAvg) * 100;
                if (Math.abs(volLift) >= 10) {
                    const volHelps = volLift > 0;
                    lines.push(
                        `${escapeHtml(vol)} volatility ${volHelps ? '<span class="text-emerald-600 dark:text-emerald-400 font-semibold">boosts</span>' : '<span class="text-amber-600 dark:text-amber-400 font-semibold">drags</span>'} performance in ${escapeHtml(themeName)} (${volHelps ? '+' : ''}${volLift.toFixed(0)}% vs other vol levels)`
                    );
                }
            }
        }

        // Market niche vs saturation
        if (themeCount > 0) {
            const allThemes = gameData.themes || [];
            const medianCount =
                allThemes.length > 0
                    ? [...allThemes].sort(
                          (a, b) => (a['Game Count'] || a.game_count || 0) - (b['Game Count'] || b.game_count || 0)
                      )[Math.floor(allThemes.length / 2)]['Game Count'] || 0
                    : 0;
            if (themeCount <= 5) {
                lines.push(
                    `Niche market — only ${themeCount} "${escapeHtml(themeName)}" games exist, ${tw >= themeAvg ? 'standing out is easier' : 'even niche themes struggle here'}`
                );
            } else if (themeCount > medianCount * 2) {
                lines.push(
                    `Highly competitive theme — ${themeCount} games in "${escapeHtml(themeName)}"${tw >= themeAvg ? ', yet still outperforms' : ', hard to stand out'}`
                );
            }
        }

        if (lines.length === 0 && game.performance_theo_win != null) {
            const globalAvg =
                (gameData.allGames || []).reduce((s, g) => s + (g.performance_theo_win || 0), 0) /
                ((gameData.allGames || []).length || 1);
            const vsGlobal = ((game.performance_theo_win - globalAvg) / globalAvg) * 100;
            const gColor =
                vsGlobal >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400';
            lines.push(
                `<span class="${gColor} font-semibold">${vsGlobal >= 0 ? '▲' : '▼'} ${Math.abs(vsGlobal).toFixed(0)}%</span> ${vsGlobal >= 0 ? 'above' : 'below'} the global average (${globalAvg.toFixed(2)})`
            );
        }

        if (lines.length > 0) {
            insightHtml = `<div class="mt-2 px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed space-y-1">${lines.map(l => `<div>${l}</div>`).join('')}</div>`;
        }
    }

    const performanceSection = PanelSection({
        title: 'Performance',
        icon: '📊',
        gradient: GRADIENTS.performance,
        accent: ACCENTS.performance,
        content: MetricGrid(performanceMetrics) + insightHtml,
    });

    // ===== DIFFERENTIATORS SECTION =====
    let diffSection = '';
    const thisFeats = parseFeatures(game.features);
    const themeName2 = game.theme_consolidated || game.theme_primary || '';
    if (thisFeats.length > 0 && themeName2) {
        const themeGamesAll = (gameData.allGames || []).filter(
            g => (g.theme_consolidated || g.theme_primary) === themeName2 && g.name !== game.name
        );
        if (themeGamesAll.length >= 5) {
            const n = themeGamesAll.length;
            const featFreq = {};
            themeGamesAll.forEach(g => {
                parseFeatures(g.features).forEach(f => {
                    featFreq[f] = (featFreq[f] || 0) + 1;
                });
            });
            const rare = thisFeats.filter(f => (featFreq[f] || 0) / n < 0.2);
            const common = thisFeats.filter(f => (featFreq[f] || 0) / n >= 0.5);
            if (rare.length || common.length) {
                let diffContent = `<div class="flex items-center gap-1.5 mb-2">
                    <span class="text-[10px] text-gray-400 dark:text-gray-500">How this game's features compare to others in the <strong>${escapeHtml(themeName2)}</strong> theme</span>
                    <div class="relative group"><button class="w-3.5 h-3.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-400 hover:bg-indigo-100 hover:text-indigo-600 flex items-center justify-center text-[8px] font-bold leading-none flex-shrink-0 cursor-help">?</button><div class="hidden group-hover:block absolute right-0 top-full mt-1 w-56 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-[9999] text-[10px] text-gray-600 dark:text-gray-400 leading-relaxed font-normal"><strong>Rare</strong> = less than 20% of ${escapeHtml(themeName2)} games have this feature. <strong>Common</strong> = 50%+ of theme games share it.</div></div>
                </div>`;
                if (rare.length) {
                    diffContent += `<div class="flex flex-wrap gap-1 mb-1.5">${rare
                        .map(
                            f =>
                                `<span class="px-2 py-0.5 text-[10px] font-medium rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700">${escapeHtml(f)} <span class="text-emerald-400">rare</span></span>`
                        )
                        .join('')}</div>`;
                    diffContent += `<div class="text-[10px] text-gray-400 mb-2">Only &lt;20% of ${escapeHtml(themeName2)} games have ${rare.length === 1 ? 'this' : 'these'}</div>`;
                }
                if (common.length) {
                    diffContent += `<div class="flex flex-wrap gap-1">${common
                        .map(
                            f =>
                                `<span class="px-2 py-0.5 text-[10px] font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500">${escapeHtml(f)} <span class="text-gray-400">common</span></span>`
                        )
                        .join('')}</div>`;
                }
                diffSection = PanelSection({
                    title: 'vs Theme Peers',
                    icon: '💡',
                    gradient: GRADIENTS.performance,
                    accent: ACCENTS.performance,
                    content: diffContent,
                });
            }
        }
    }

    // ===== SPECS SECTION =====
    const specVal = (raw, formatted, confidence) => {
        if (!raw) return 'N/A';
        if (isReliableConfidence(confidence)) {
            const dotColor = confidence === 'verified' ? 'bg-emerald-500' : 'bg-blue-500';
            const dotTip = confidence === 'verified' ? 'Provider verified' : 'Extracted from game rules';
            return (
                formatted +
                `<span class="relative group inline-flex ml-1">` +
                `<span class="w-1.5 h-1.5 rounded-full ${dotColor} inline-block"></span>` +
                `<span class="hidden group-hover:block absolute left-full top-0 ml-1 w-36 p-1.5 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-[9999] text-[10px] text-gray-500 dark:text-gray-400 font-normal">${dotTip}</span>` +
                `</span>`
            );
        }
        const tip = escapeAttr(`Estimated: ${raw} (unverified source, may be inaccurate)`);
        return (
            `<span class="text-gray-400 dark:text-gray-500">N/A</span>` +
            `<span class="relative group inline-flex ml-1">` +
            `<button class="w-3.5 h-3.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-500 flex items-center justify-center text-[8px] font-bold leading-none cursor-help">?</button>` +
            `<span class="hidden group-hover:block absolute left-full top-0 ml-1 w-48 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-[9999] text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed font-normal">${tip}</span>` +
            `</span>`
        );
    };

    const specsMetrics = [
        {
            label: 'Layout',
            value: specVal(
                game.specs_reels,
                `${game.specs_reels || 'N/A'}x${game.specs_rows || 'N/A'}`,
                F.reelsConfidence(game)
            ),
        },
        { label: 'Paylines', value: specVal(game.specs_paylines, game.specs_paylines, F.paylinesConfidence(game)) },
        { label: 'RTP', value: specVal(game.specs_rtp, `${game.specs_rtp}%`, F.rtpConfidence(game)) },
        {
            label: 'Volatility',
            value: specVal(game.specs_volatility, VolatilityBadge(game.specs_volatility), F.volatilityConfidence(game)),
        },
        {
            label: 'Min Bet',
            value: specVal(game.min_bet, `$${Number(game.min_bet).toFixed(2)}`, F.minBetConfidence(game)),
        },
        {
            label: 'Max Bet',
            value: specVal(game.max_bet, `$${Number(game.max_bet).toFixed(0)}`, F.maxBetConfidence(game)),
        },
        {
            label: 'Max Win',
            value: specVal(game.max_win, `${Number(game.max_win).toLocaleString()}x`, F.maxWinConfidence(game)),
        },
    ];

    const engagementMetrics = [];
    if (game.avg_bet) engagementMetrics.push({ label: 'Avg Bet', value: `$${Number(game.avg_bet).toFixed(2)}` });
    if (game.games_played_index)
        engagementMetrics.push({ label: 'Play Index', value: Number(game.games_played_index).toFixed(1) });
    if (game.coin_in_index)
        engagementMetrics.push({ label: 'Coin-In Index', value: Number(game.coin_in_index).toFixed(1) });
    if (game.sites) engagementMetrics.push({ label: 'Casinos', value: Number(game.sites).toLocaleString() });

    // Data Quality summary bar
    const confFields = [
        F.reelsConfidence(game),
        F.paylinesConfidence(game),
        F.rtpConfidence(game),
        F.volatilityConfidence(game),
        F.minBetConfidence(game),
        F.maxBetConfidence(game),
        F.maxWinConfidence(game),
    ];
    const confTotal = confFields.length;
    const confVerified = confFields.filter(c => c === 'verified').length;
    const confExtracted = confFields.filter(c => c === 'extracted').length;
    const confEstimated = confFields.filter(c => c && c !== 'verified' && c !== 'extracted').length;
    const confMissing = confTotal - confVerified - confExtracted - confEstimated;
    const confReliable = confVerified + confExtracted;
    const confLabel =
        confReliable === confTotal
            ? 'Fully verified'
            : confReliable >= 4
              ? `${confReliable}/${confTotal} verified`
              : confReliable > 0
                ? `${confReliable}/${confTotal} verified`
                : 'Unverified';
    const confBadgeColor =
        confReliable >= 5
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
            : confReliable >= 2
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400';
    const barW = c => `${((c / confTotal) * 100).toFixed(0)}%`;

    const confidenceSummary = `<div class="flex items-center justify-between mb-3 pb-2 border-b border-gray-100 dark:border-gray-700/50">
        <div class="flex items-center gap-2">
            <span class="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Data Quality</span>
            <span class="text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${confBadgeColor}">${confLabel}</span>
        </div>
    </div>
    <div class="flex h-1.5 rounded-full overflow-hidden mb-3 bg-gray-100 dark:bg-gray-700/50">
        <div class="bg-emerald-500" style="width:${barW(confVerified)}"></div>
        <div class="bg-blue-500" style="width:${barW(confExtracted)}"></div>
        <div class="bg-amber-400" style="width:${barW(confEstimated)}"></div>
        <div class="bg-gray-300 dark:bg-gray-600" style="width:${barW(confMissing)}"></div>
    </div>`;

    const confidenceLegend = `<div class="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700/50 flex items-center gap-3 text-[9px] text-gray-400 dark:text-gray-500">
        <span class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span> Verified</span>
        <span class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block"></span> Extracted</span>
        <span class="flex items-center gap-1"><span class="w-3.5 h-3.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-500 inline-flex items-center justify-center text-[7px] font-bold">?</span> Estimated</span>
    </div>`;

    const naCount = specsMetrics.filter(m => String(m.value).includes('N/A')).length;
    const specsSection = PanelSection({
        title: naCount >= 5 ? `Game Specs (${naCount} N/A)` : 'Game Specs',
        icon: '⚙️',
        gradient: GRADIENTS.specs,
        accent: ACCENTS.specs,
        collapsed: naCount >= 5,
        content:
            confidenceSummary +
            MetricGrid(specsMetrics) +
            confidenceLegend +
            (engagementMetrics.length > 0
                ? `<div class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700"><div class="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Player Engagement</div>${MetricGrid(engagementMetrics)}</div>`
                : ''),
    });

    // ===== THEME & MECHANIC SECTION =====
    const features = parseFeatures(game.features);
    const featuresHtml =
        features.length > 0
            ? features
                  .map(
                      f =>
                          `<span class="inline-block px-2.5 py-1 text-xs font-medium rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300 mr-1.5 mb-1.5">${escapeHtml(f)}</span>`
                  )
                  .join('')
            : '<span class="text-sm text-gray-500 dark:text-gray-400">No features detected</span>';

    const allThemes = parseFeatures(game.themes_all);
    const allThemesHtml =
        allThemes.length > 0
            ? allThemes
                  .map(
                      t =>
                          `<span class="inline-block px-2 py-0.5 text-[11px] font-medium rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 mr-1 mb-1 cursor-pointer hover:ring-2 hover:ring-emerald-400 transition-all" onclick="${safeOnclick('window.showThemeDetails', t)}">${escapeHtml(t)}</span>`
                  )
                  .join('')
            : '';

    const themeMechContent = `
        <div class="space-y-3">
            ${game.theme_primary ? `<div class="flex items-center gap-2"><span class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Primary Theme</span><span class="text-sm font-semibold text-emerald-700 dark:text-emerald-300 cursor-pointer hover:underline" onclick="${safeOnclick('window.showThemeDetails', game.theme_primary)}">${escapeHtml(game.theme_primary)}</span></div>` : Metric('Primary Theme', 'N/A')}
            ${game.theme_secondary ? `<div class="text-sm text-gray-600 dark:text-gray-400 ml-0">Secondary: <span class="cursor-pointer hover:underline hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors" onclick="${safeOnclick('window.showThemeDetails', game.theme_secondary)}">${escapeHtml(game.theme_secondary)}</span></div>` : ''}
            ${allThemesHtml ? `<div class="pt-1"><div class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">All Themes</div><div class="flex flex-wrap">${allThemesHtml}</div></div>` : ''}
            <div class="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3"></div>
            <div class="pt-1">
                <div class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Mechanics (${features.length})</div>
                <div class="flex flex-wrap">${featuresHtml}</div>
            </div>
        </div>
    `;

    const themeMechSection = PanelSection({
        title: 'Theme & Mechanic',
        icon: '🎨',
        gradient: GRADIENTS.category,
        accent: ACCENTS.category,
        content: themeMechContent,
    });

    // ===== PROVIDER SECTION =====
    const providerContent = `
        <div class="space-y-2">
            <div class="text-base font-semibold text-gray-900 dark:text-white cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                 onclick="${safeOnclick('window.showProviderDetails', F.provider(game))}">${escapeHtml(F.provider(game))}</div>
            ${
                game.provider_parent && game.provider_parent !== F.provider(game)
                    ? `<div class="text-sm text-gray-600 dark:text-gray-400">Parent: ${escapeHtml(game.provider_parent)}</div>`
                    : ''
            }
        </div>
    `;

    const providerSection = PanelSection({
        title: 'Provider',
        icon: '🏢',
        gradient: GRADIENTS.provider,
        accent: ACCENTS.provider,
        content: providerContent,
    });

    // ===== DEMO URL SECTION =====
    let demoSection = '';
    if (game.demo_url) {
        const demoContent = `
            <a href="${sanitizeUrl(game.demo_url)}" target="_blank" rel="noopener noreferrer"
               style="background: linear-gradient(to right, #22c55e, #059669); color: #fff;"
               class="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all shadow-md">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                Play Demo
            </a>
        `;
        demoSection = PanelSection({
            title: 'Demo',
            icon: '🎮',
            gradient: GRADIENTS.performance,
            accent: ACCENTS.performance,
            content: demoContent,
        });
    }

    // ===== SYMBOLS SECTION =====
    let rawSymbols = game.symbols;
    if (typeof rawSymbols === 'string') {
        try {
            rawSymbols = JSON.parse(rawSymbols);
        } catch {
            rawSymbols = [];
        }
    }
    if (!Array.isArray(rawSymbols)) rawSymbols = [];
    const symbolObjects = rawSymbols
        .map(s => {
            if (typeof s === 'object' && s !== null) return s;
            if (typeof s === 'string') return { name: s, type: '', description: '' };
            return null;
        })
        .filter(Boolean);
    let symbolsSection = '';
    if (symbolObjects.length > 0) {
        const TYPE_COLORS = {
            wild: SYMBOL_CAT_COLORS['Wild'],
            scatter: SYMBOL_CAT_COLORS['Scatter/Bonus'],
            bonus: SYMBOL_CAT_COLORS['Scatter/Bonus'],
            special: SYMBOL_CAT_COLORS['Cash/Collect'],
            themed: SYMBOL_CAT_COLORS['Themed'],
            card: SYMBOL_CAT_COLORS['Card'],
        };

        const pillsHtml = symbolObjects
            .map(s => {
                const name = escapeHtml(s.name || '');
                const type = (s.type || '').toLowerCase();
                const col = TYPE_COLORS[type] || SYMBOL_CAT_COLORS['Themed'];
                return `<span class="inline-flex items-center px-1.5 py-0.5 text-[11px] rounded-md ring-1 ${col.cls} ${col.ring}">${name}</span>`;
            })
            .join('');

        const hasDetails = symbolObjects.some(s => s.description || s.type);
        const detailId = `sym-detail-${Date.now()}`;

        let detailsHtml = '';
        if (hasDetails) {
            const TYPE_ORDER = ['wild', 'scatter', 'bonus', 'special', 'themed', 'card'];
            const TYPE_LABELS = {
                wild: 'Wild',
                scatter: 'Scatter',
                bonus: 'Bonus',
                special: 'Special',
                themed: 'Themed',
                card: 'Card',
            };
            const grouped = {};
            symbolObjects.forEach(s => {
                const type = (s.type || '').toLowerCase();
                const bucket = TYPE_ORDER.includes(type)
                    ? type
                    : categorizeSymbol(s.name || '') === 'Card'
                      ? 'card'
                      : 'themed';
                if (!grouped[bucket]) grouped[bucket] = [];
                grouped[bucket].push(s);
            });
            const detailRows = TYPE_ORDER.filter(t => grouped[t])
                .map(t => {
                    const col = TYPE_COLORS[t] || SYMBOL_CAT_COLORS['Themed'];
                    const label = TYPE_LABELS[t] || t;
                    const items = grouped[t]
                        .map(s => {
                            const nm = escapeHtml(s.name || '');
                            const desc = escapeHtml(s.description || '');
                            return `<div class="flex items-start gap-2 py-1 px-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-700/30">
                            <div class="w-0.5 self-stretch rounded-full ${col.bar} shrink-0"></div>
                            <div class="min-w-0 flex-1">
                                <span class="text-xs font-medium text-gray-900 dark:text-white">${nm}</span>
                                ${desc ? `<p class="text-[10px] text-gray-500 dark:text-gray-400 leading-snug">${desc}</p>` : ''}
                            </div>
                        </div>`;
                        })
                        .join('');
                    return `<div class="mb-2 last:mb-0">
                        <span class="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded ${col.cls}">${escapeHtml(label)}</span>
                        ${items}
                    </div>`;
                })
                .join('');
            detailsHtml = `
                <div id="${escapeAttr(detailId)}" class="hidden mt-2 pt-2 border-t border-gray-100 dark:border-gray-700/50">
                    ${detailRows}
                </div>
                <button onclick="(function(){ var el=document.getElementById('${escapeAttr(detailId)}'); var btn=event.currentTarget; if(el.classList.contains('hidden')){el.classList.remove('hidden');btn.textContent='Hide details';}else{el.classList.add('hidden');btn.textContent='Show details';} })()"
                    class="mt-2 text-[10px] font-medium text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 cursor-pointer transition-colors">Show details</button>`;
        }

        symbolsSection = PanelSection({
            title: `Symbols (${symbolObjects.length})`,
            icon: '🍒',
            gradient: GRADIENTS.specs,
            accent: ACCENTS.specs,
            content: `<div class="flex flex-wrap gap-1">${pillsHtml}</div>${detailsHtml}`,
        });
    }

    // ===== RELEASE INFO SECTION =====
    const hasOriginal = game.original_release_year && game.original_release_year !== game.release_year;
    const releaseMetrics = [];
    if (hasOriginal) {
        releaseMetrics.push({ label: 'Global Release', value: game.original_release_year });
        if (game.original_release_month) {
            releaseMetrics.push({ label: 'Global Month', value: game.original_release_month });
        }
        releaseMetrics.push({ label: 'NJ Launch', value: game.release_year || 'N/A' });
    } else {
        releaseMetrics.push({ label: 'Year', value: game.original_release_year || game.release_year || 'N/A' });
        releaseMetrics.push({ label: 'Month', value: game.original_release_month || game.release_month || 'N/A' });
    }

    const releaseAllNa = releaseMetrics.every(m => String(m.value) === 'N/A');
    const releaseSection = PanelSection({
        title: releaseAllNa ? 'Release Info (N/A)' : 'Release Info',
        icon: '📅',
        gradient: GRADIENTS.release,
        accent: ACCENTS.release,
        collapsed: releaseAllNa,
        content: MetricGrid(releaseMetrics),
    });

    // ===== SIMILAR GAMES SECTION =====
    const gameFeats = new Set(parseFeatures(game.features));
    const gameTheme = F.themeConsolidated(game);
    const gameVol = (game.specs_volatility || game.volatility || '').trim();
    const gameLayout =
        (game.specs_reels || game.reels) && (game.specs_rows || game.rows)
            ? `${game.specs_reels || game.reels}x${game.specs_rows || game.rows}`
            : '';

    const similarGames = gameData.allGames
        .filter(g => g.name !== game.name)
        .map(g => {
            const gFeats = new Set(parseFeatures(g.features));
            const intersection = [...gameFeats].filter(f => gFeats.has(f)).length;
            const union = new Set([...gameFeats, ...gFeats]).size;
            const featJaccard = union > 0 ? intersection / union : 0;
            const themeMatch = F.themeConsolidated(g) === gameTheme && gameTheme !== 'Unknown' ? 0.3 : 0;
            const volMatch = gameVol && (g.specs_volatility || g.volatility || '').trim() === gameVol ? 0.05 : 0;
            const gLayout =
                (g.specs_reels || g.reels) && (g.specs_rows || g.rows)
                    ? `${g.specs_reels || g.reels}x${g.specs_rows || g.rows}`
                    : '';
            const layoutMatch = gameLayout && gLayout === gameLayout ? 0.05 : 0;
            const similarity = featJaccard * 0.6 + themeMatch + volMatch + layoutMatch;
            return {
                game: g,
                similarity,
                sharedFeats: [...gameFeats].filter(f => gFeats.has(f)),
                themeMatch: themeMatch > 0,
            };
        })
        .filter(s => s.similarity > 0.05)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 10);

    let similarGamesContent;
    if (similarGames.length > 0) {
        const INITIAL_SHOW = 5;
        const simUid = 'sim-' + Math.random().toString(36).slice(2, 8);

        const renderSimRow = s => {
            const g = s.game;
            const reasons = [];
            if (s.themeMatch) reasons.push(F.themeConsolidated(s.game));
            if (s.sharedFeats.length) reasons.push(s.sharedFeats.slice(0, 3).join(', '));
            const matchPct = Math.round(s.similarity * 100);
            const reasonText = reasons.length ? reasons.join(' + ') : '';

            return `<div class="flex items-center gap-2 py-2 px-3 border-b border-gray-100 dark:border-gray-700 last:border-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors" onclick="${safeOnclick('window.showGameDetails', g.name)}">
                <div class="min-w-0 flex-1">
                    <div class="text-sm font-semibold text-gray-900 dark:text-white truncate">${escapeHtml(g.name)}</div>
                    <div class="text-[10px] text-gray-400 truncate">${escapeHtml(F.provider(g))}${reasonText ? ` · ${escapeHtml(reasonText)}` : ''}</div>
                </div>
                <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 font-bold shrink-0">${matchPct}%</span>
                <span class="text-xs font-bold text-gray-700 dark:text-gray-300 w-10 text-right shrink-0">${(g.performance_theo_win || 0).toFixed(1)}</span>
            </div>`;
        };

        const visibleList = similarGames.slice(0, INITIAL_SHOW).map(renderSimRow).join('');
        const hiddenList = similarGames.slice(INITIAL_SHOW).map(renderSimRow).join('');
        const hasMore = similarGames.length > INITIAL_SHOW;

        const avgSimilarTheo =
            similarGames.reduce((s, sg) => s + (sg.game.performance_theo_win || 0), 0) / similarGames.length;
        const gameTheo = game.performance_theo_win || 0;
        const vsSimilar = avgSimilarTheo > 0 ? ((gameTheo - avgSimilarTheo) / avgSimilarTheo) * 100 : 0;
        const vsColor = vsSimilar >= 0 ? 'text-emerald-600' : 'text-red-500';

        similarGamesContent = `<div class="space-y-0">${visibleList}${hasMore ? `<div id="${simUid}-more" class="hidden">${hiddenList}</div>` : ''}</div>
            ${hasMore ? `<button id="${simUid}-btn" onclick="(function(){var m=document.getElementById('${simUid}-more'),b=document.getElementById('${simUid}-btn');if(m.classList.contains('hidden')){m.classList.remove('hidden');b.textContent='Show less';}else{m.classList.add('hidden');b.textContent='Show ${similarGames.length - INITIAL_SHOW} more…';}})()" class="text-[11px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium mt-2 px-3 cursor-pointer">Show ${similarGames.length - INITIAL_SHOW} more…</button>` : ''}
            <div class="mt-2 px-3 py-2 bg-gray-50 dark:bg-gray-700/30 rounded-lg text-[10px] text-gray-500">
                vs similar avg: <span class="font-bold ${vsColor}">${vsSimilar >= 0 ? '+' : ''}${vsSimilar.toFixed(0)}%</span>
                (${gameTheo.toFixed(1)} vs ${avgSimilarTheo.toFixed(1)})
            </div>`;
    } else {
        similarGamesContent = EmptyState('No similar games found');
    }

    const similarSection = PanelSection({
        title: 'Similar Games',
        icon: '🎯',
        gradient: GRADIENTS.similar,
        accent: ACCENTS.similar,
        content: similarGamesContent,
    });

    // ===== FEEDBACK SECTION =====
    const feedbackGameName = game.name || game.game_name || 'Unknown';
    const feedbackContent = `
    <button onclick="${safeOnclick('window.openFeedbackModal', feedbackGameName)}"
        class="w-full px-4 py-2.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-xl transition-colors flex items-center justify-center gap-2 border border-indigo-200 dark:border-indigo-800 cursor-pointer">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"/></svg>
        Report an issue with this game
    </button>
`;

    const feedbackSection = PanelSection({
        title: 'Feedback',
        icon: '📝',
        gradient: GRADIENTS.release,
        accent: ACCENTS.feedback,
        content: feedbackContent,
    });

    // ===== DATA QUALITY SECTION =====
    let dataQualitySection = '';
    if (game.data_quality) {
        const qualityColors = {
            verified: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
            high: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
            medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
            low: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300',
            insufficient: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
        };
        const qColor = qualityColors[game.data_quality] || qualityColors.medium;
        const qContent = `<span class="inline-block px-3 py-1 text-xs font-semibold rounded-full ${qColor}">${escapeHtml(game.data_quality)}</span>`;
        dataQualitySection = PanelSection({
            title: 'Data Quality',
            icon: '✅',
            gradient: GRADIENTS.release,
            accent: ACCENTS.release,
            content: qContent,
        });
    }

    // ===== ART DESIGN SECTION =====
    let artSection = '';
    const artSetting = F.artSetting(game);
    if (artSetting) {
        const artChars = F.artCharacters(game);
        const artElems = F.artElements(game);
        const artMood = F.artMood(game);
        const artNarr = F.artNarrative(game);

        const artPills = (items, bgClass) =>
            items
                .map(
                    t =>
                        `<span class="inline-block px-2.5 py-1 text-xs font-medium rounded-full ${bgClass} mr-1.5 mb-1.5">${escapeHtml(t)}</span>`
                )
                .join('');

        const artMetrics = [
            {
                label: 'Environment',
                value: `<span class="font-bold text-gray-900 dark:text-white">${escapeHtml(artSetting)}</span>`,
            },
        ];
        if (artMood) artMetrics.push({ label: 'Mood', value: escapeHtml(artMood) });
        if (artNarr) artMetrics.push({ label: 'Narrative', value: escapeHtml(artNarr) });

        const artContent =
            MetricGrid(artMetrics) +
            (artChars.length
                ? `<div class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                       <div class="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Characters (${artChars.length})</div>
                       <div class="flex flex-wrap">${artPills(artChars, 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300')}</div>
                   </div>`
                : '') +
            (artElems.length
                ? `<div class="${artChars.length ? 'mt-2' : 'mt-3 pt-3 border-t border-gray-200 dark:border-gray-700'}">
                       <div class="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Visual Elements (${artElems.length})</div>
                       <div class="flex flex-wrap">${artPills(artElems, 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300')}</div>
                   </div>`
                : '');

        artSection = PanelSection({
            title: 'Art Insights',
            icon: '🎨',
            gradient: GRADIENTS.category,
            accent: ACCENTS.category,
            content: artContent,
        });
    }

    // ===== RENDER ALL SECTIONS =====
    const _set = (id, html) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    };
    _set('game-description', descriptionSection);
    _set('game-performance', performanceSection);
    _set('game-differentiators', diffSection);
    _set('game-specs', specsSection);
    _set('game-theme-mechanic', themeMechSection);
    _set('game-art', artSection);
    _set('game-demo', demoSection);
    _set('game-symbols', symbolsSection);
    _set('game-provider', providerSection);
    _set('game-release', releaseSection);
    _set('game-data-quality', dataQualitySection);
    _set('game-similar', similarSection);
    _set('game-feedback', feedbackSection);
    _set('game-play-now', playNowHtml);

    // Close any other open panel first, then show this one
    if (window.closeAllPanels) window.closeAllPanels('game-panel');
    const panel = document.getElementById('game-panel');
    const backdrop = document.getElementById('mechanic-backdrop');

    if (panel) {
        panel.scrollTop = 0;
        panel.style.right = '0px';
    }
    if (backdrop) {
        backdrop.classList.remove('hidden');
        backdrop.classList.add('block');
    }
    document.body.style.overflow = 'hidden';
}

window.showGameDetails = showGameDetails;

import { restorePageScroll } from './panel-utils.js';

export function closeGamePanel() {
    const panel = document.getElementById('game-panel');
    const backdrop = document.getElementById('mechanic-backdrop');

    if (panel) panel.style.right = '-650px';
    if (backdrop) {
        backdrop.classList.add('hidden');
        backdrop.classList.remove('block');
    }
    restorePageScroll(panel);
}

window.closeGamePanel = closeGamePanel;

// ==========================================
// PROVIDER DETAIL PANEL
// ==========================================

export function showProviderDetails(providerName) {
    const providerGames = gameData.allGames.filter(g => F.provider(g) === providerName);
    if (providerGames.length === 0) return;

    log('🏢 Opening provider panel for:', providerName);

    const parent = providerGames[0].provider_parent;
    const provPanelTitle = document.getElementById('provider-panel-title');
    if (provPanelTitle) provPanelTitle.textContent = providerName;

    const gameCount = providerGames.length;
    const avgTheo = providerGames.reduce((sum, g) => sum + (F.theoWin(g) || 0), 0) / gameCount;
    const totalMarketShare = providerGames.reduce((sum, g) => sum + (g.performance_market_share_percent || 0), 0);
    const gamesWithRTP = providerGames.filter(g => g.specs_rtp);
    const avgRTP = gamesWithRTP.length
        ? gamesWithRTP.reduce((sum, g) => sum + g.specs_rtp, 0) / gamesWithRTP.length
        : null;

    // Aggregate specs
    const gamesWithBet = providerGames.filter(g => g.min_bet > 0);
    const avgMinBet = gamesWithBet.length
        ? gamesWithBet.reduce((s, g) => s + Number(g.min_bet), 0) / gamesWithBet.length
        : null;
    const avgMaxBet = gamesWithBet.length
        ? gamesWithBet.reduce((s, g) => s + Number(g.max_bet || 0), 0) / gamesWithBet.length
        : null;
    const gamesWithMaxWin = providerGames.filter(g => g.max_win > 0);
    const avgMaxWin = gamesWithMaxWin.length
        ? gamesWithMaxWin.reduce((s, g) => s + Number(g.max_win), 0) / gamesWithMaxWin.length
        : null;
    const gamesWithSites = providerGames.filter(g => g.sites > 0);
    const avgSites = gamesWithSites.length
        ? Math.round(gamesWithSites.reduce((s, g) => s + Number(g.sites), 0) / gamesWithSites.length)
        : null;
    const gamesWithPlayIdx = providerGames.filter(g => g.games_played_index > 0);
    const avgPlayIdx = gamesWithPlayIdx.length
        ? gamesWithPlayIdx.reduce((s, g) => s + Number(g.games_played_index), 0) / gamesWithPlayIdx.length
        : null;

    // ===== STATISTICS SECTION =====
    const statsMetrics = [
        { label: 'Total Games', value: gameCount },
        { label: 'Avg Performance Index', value: avgTheo.toFixed(2) },
        { label: 'Market Share %', value: `${totalMarketShare.toFixed(2)}%` },
        { label: 'Avg RTP', value: avgRTP ? avgRTP.toFixed(1) + '%' : 'N/A' },
        {
            label: 'Bet Range',
            value: avgMinBet ? `$${avgMinBet.toFixed(2)} – $${avgMaxBet ? avgMaxBet.toFixed(0) : '?'}` : 'N/A',
        },
        { label: 'Avg Max Win', value: avgMaxWin ? `${Math.round(avgMaxWin).toLocaleString()}x` : 'N/A' },
    ];

    if (parent && parent !== providerName) {
        statsMetrics.push({ label: 'Parent Company', value: parent });
    }
    if (avgSites) statsMetrics.push({ label: 'Avg Casinos/Game', value: avgSites.toLocaleString() });
    if (avgPlayIdx) statsMetrics.push({ label: 'Avg Play Index', value: avgPlayIdx.toFixed(1) });

    // ===== PERFORMANCE SECTION =====
    const highPerformers = providerGames.filter(g => g.performance_anomaly === 'high').length;
    const lowPerformers = providerGames.filter(g => g.performance_anomaly === 'low').length;
    const topRank = Math.min(...providerGames.map(g => g.performance_rank || 999));

    const perfMetrics = [
        { label: 'Best Rank', value: `#${topRank}` },
        { label: 'High Performers', value: highPerformers },
        { label: 'Low Performers', value: lowPerformers },
        { label: 'Quality Index', value: avgTheo.toFixed(2) },
    ];

    // ===== TOP GAMES SECTION =====
    const allProvGames = [...providerGames].sort((a, b) => (F.theoWin(b) || 0) - (F.theoWin(a) || 0));

    const GAMES_INIT = 5;
    const topGamesItems = allProvGames
        .map((g, i) => {
            const hidden = i >= GAMES_INIT ? ' style="display:none"' : '';
            return `<div data-cl-item${hidden}>${GameListItem({ ...g, extra: F.themeConsolidated(g) })}</div>`;
        })
        .join('');

    const topGamesHtml =
        allProvGames.length > GAMES_INIT
            ? collapsibleList(topGamesItems, allProvGames.length, GAMES_INIT, 'prov-games')
            : topGamesItems;

    // ===== TOP THEMES SECTION =====
    const themes = {};
    providerGames.forEach(g => {
        const theme = F.themeConsolidated(g) || 'Unknown';
        if (!themes[theme]) themes[theme] = { count: 0, totalTheo: 0 };
        themes[theme].count++;
        themes[theme].totalTheo += F.theoWin(g) || 0;
    });

    const allThemes = Object.entries(themes)
        .map(([name, data]) => ({ name, ...data, avgTheo: data.totalTheo / data.count }))
        .sort((a, b) => b.count - a.count);

    const THEMES_INIT = 5;
    const maxThemeCount = allThemes.length ? allThemes[0].count : 1;
    const themeItems = allThemes
        .map((t, i) => {
            const hidden = i >= THEMES_INIT ? ' style="display:none"' : '';
            const barW = ((t.count / maxThemeCount) * 100).toFixed(0);
            return `<div data-cl-item class="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 rounded-lg px-2 transition-colors"
                     onclick="${safeOnclick('window.showThemeForProvider', t.name, providerName)}"${hidden}>
                    <span class="text-[13px] font-medium text-gray-800 dark:text-gray-200 w-28 truncate flex-shrink-0">${escapeHtml(t.name)}</span>
                    <div class="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full bg-violet-400 dark:bg-violet-500 rounded-full" style="width:${barW}%"></div></div>
                    <span class="text-[11px] text-gray-400 dark:text-gray-500 w-10 text-right flex-shrink-0">${t.count}</span>
                </div>`;
        })
        .join('');

    const themesContent = `<div class="space-y-0.5">${allThemes.length > THEMES_INIT ? collapsibleList(themeItems, allThemes.length, THEMES_INIT, 'prov-themes') : themeItems}</div>`;

    // ===== TOP FEATURES SECTION =====
    const mechanics = {};
    providerGames.forEach(g => {
        parseFeatures(g.features).forEach(feat => {
            if (!mechanics[feat]) mechanics[feat] = { count: 0, totalTheo: 0 };
            mechanics[feat].count++;
            mechanics[feat].totalTheo += F.theoWin(g) || 0;
        });
    });

    const allMechanics = Object.entries(mechanics)
        .map(([name, data]) => ({ name, ...data, avgTheo: data.totalTheo / data.count }))
        .sort((a, b) => b.count - a.count);

    const MECHS_INIT = 5;
    const maxMechCount = allMechanics.length ? allMechanics[0].count : 1;
    const mechItems = allMechanics
        .map((m, i) => {
            const hidden = i >= MECHS_INIT ? ' style="display:none"' : '';
            const barW = ((m.count / maxMechCount) * 100).toFixed(0);
            return `<div data-cl-item class="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 rounded-lg px-2 transition-colors"
                     onclick="${safeOnclick('window.showMechForProvider', m.name, providerName)}"${hidden}>
                    <span class="text-[13px] font-medium text-gray-800 dark:text-gray-200 w-28 truncate flex-shrink-0">${escapeHtml(m.name)}</span>
                    <div class="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full bg-purple-400 dark:bg-purple-500 rounded-full" style="width:${barW}%"></div></div>
                    <span class="text-[11px] text-gray-400 dark:text-gray-500 w-10 text-right flex-shrink-0">${m.count}</span>
                </div>`;
        })
        .join('');

    const mechanicsContent = `<div class="space-y-0.5">${allMechanics.length > MECHS_INIT ? collapsibleList(mechItems, allMechanics.length, MECHS_INIT, 'prov-mechs') : mechItems}</div>`;

    // ===== VOLATILITY DISTRIBUTION SECTION =====
    const volatility = {};
    providerGames.forEach(g => {
        const vol = F.volatility(g) || 'Unknown';
        volatility[vol] = (volatility[vol] || 0) + 1;
    });

    const maxVolCount = Math.max(...Object.values(volatility));
    const volContent = `
        <div class="space-y-2">
            ${Object.entries(volatility)
                .sort((a, b) => b[1] - a[1])
                .map(([vol, count]) => {
                    const percent = ((count / gameCount) * 100).toFixed(0);
                    const barW = ((count / maxVolCount) * 100).toFixed(0);
                    return `
                    <div class="flex items-center gap-2">
                        <div class="w-20 flex-shrink-0">${VolatilityBadge(vol)}</div>
                        <div class="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full bg-gray-300 dark:bg-gray-500 rounded-full" style="width:${barW}%"></div></div>
                        <span class="text-[11px] text-gray-400 dark:text-gray-500 w-12 text-right flex-shrink-0">${count} (${percent}%)</span>
                    </div>
                `;
                })
                .join('')}
        </div>
    `;

    const panelContent = document.getElementById('provider-panel-content');
    let html = '';
    const providerUrl = sanitizeUrl(PROVIDER_URLS[providerName]);
    if (providerUrl) {
        html += `<div class="mb-3"><a href="${providerUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>Visit Official Site</a></div>`;
    }
    html += PanelSection({
        title: 'Statistics',
        icon: '📊',
        gradient: GRADIENTS.performance,
        accent: ACCENTS.performance,
        content: MetricGrid(statsMetrics),
    });
    html += PanelSection({
        title: 'Performance',
        icon: '🎯',
        gradient: GRADIENTS.specs,
        accent: ACCENTS.specs,
        content: MetricGrid(perfMetrics),
    });
    html += PanelSection({
        title: 'Themes',
        icon: '🎨',
        gradient: GRADIENTS.category,
        accent: ACCENTS.category,
        content: themesContent,
    });
    html += PanelSection({
        title: 'Mechanics',
        icon: '⚙️',
        gradient: GRADIENTS.similar,
        accent: ACCENTS.similar,
        content: mechanicsContent,
    });
    html += PanelSection({
        title: 'Volatility Distribution',
        icon: '🎲',
        gradient: GRADIENTS.stats,
        accent: ACCENTS.stats,
        content: volContent,
    });
    html += PanelSection({
        title: `Top Games (${allProvGames.length})`,
        icon: '🎮',
        gradient: GRADIENTS.provider,
        accent: ACCENTS.provider,
        content: `<div class="space-y-0">${topGamesHtml}</div>`,
    });
    if (panelContent) panelContent.innerHTML = html;

    if (window.closeAllPanels) window.closeAllPanels('provider-panel');
    const panel = document.getElementById('provider-panel');
    const backdrop = document.getElementById('mechanic-backdrop');

    if (panel) {
        panel.scrollTop = 0;
        panel.style.right = '0px';
    }
    if (backdrop) {
        backdrop.classList.remove('hidden');
        backdrop.classList.add('block');
    }
    document.body.style.overflow = 'hidden';
}

window.showProviderDetails = showProviderDetails;

export function closeProviderPanel() {
    const panel = document.getElementById('provider-panel');
    const backdrop = document.getElementById('mechanic-backdrop');

    if (panel) panel.style.right = '-650px';
    if (backdrop) {
        backdrop.classList.add('hidden');
        backdrop.classList.remove('block');
    }
    restorePageScroll(panel);
}

window.closeProviderPanel = closeProviderPanel;

// Update closeAnyPanel to include new panels
window.closeAnyPanel = function () {
    closeGamePanel();
    closeProviderPanel();
    if (window.closeThemePanel) window.closeThemePanel();
    if (window.closeMechanicPanel) window.closeMechanicPanel();
};

// --- Feedback modal (used by hamburger menu and game panel) ---
window.openFeedbackModal = function (gameName) {
    const modal = document.getElementById('feedback-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    if (gameName) {
        const gameInput = document.getElementById('modal-feedback-game');
        if (gameInput) gameInput.value = gameName;
    }
    // Close hamburger dropdown
    const dropdown = document.getElementById('hamburger-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
};

window.closeFeedbackModal = function () {
    const modal = document.getElementById('feedback-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.style.overflow = '';
    // Reset form
    const gameInput = document.getElementById('modal-feedback-game');
    const descInput = document.getElementById('modal-feedback-desc');
    const statusEl = document.getElementById('modal-feedback-status');
    if (gameInput) gameInput.value = '';
    if (descInput) descInput.value = '';
    if (statusEl) statusEl.classList.add('hidden');
};

window.submitModalTicket = async function () {
    const gameName = document.getElementById('modal-feedback-game')?.value?.trim();
    const issueType = document.getElementById('modal-feedback-type')?.value;
    const description = document.getElementById('modal-feedback-desc')?.value?.trim();
    const statusEl = document.getElementById('modal-feedback-status');

    if (!gameName || !description) {
        if (statusEl) {
            statusEl.textContent = 'Please fill in game name and description';
            statusEl.className = 'text-sm text-red-500';
            statusEl.classList.remove('hidden');
        }
        return;
    }
    if (gameName.length > 500 || description.length > 500) {
        if (statusEl) {
            statusEl.textContent = 'Fields must be under 500 characters';
            statusEl.className = 'text-sm text-red-500';
            statusEl.classList.remove('hidden');
        }
        return;
    }

    try {
        await apiPost('/api/tickets', { gameName, issueType, description });
        if (statusEl) {
            statusEl.innerHTML = '✓ Feedback submitted successfully!';
            statusEl.className = 'text-sm text-green-600 dark:text-green-400 font-medium';
            statusEl.classList.remove('hidden');
        }
        setTimeout(() => window.closeFeedbackModal(), 1500);
    } catch (err) {
        if (statusEl) {
            statusEl.textContent = 'Error: ' + err.message;
            statusEl.className = 'text-sm text-red-500';
            statusEl.classList.remove('hidden');
        }
    }
};
