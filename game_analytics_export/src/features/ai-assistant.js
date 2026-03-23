import { gameData } from '../lib/data.js';
import { escapeHtml } from '../lib/sanitize.js';
import { F } from '../lib/game-fields.js';
import { CANONICAL_FEATURES } from '../lib/features.js';
import { parseFeatures } from '../lib/parse-features.js';
import { getProviderMetrics, getFeatureMetrics } from '../lib/metrics.js';

let chatHistory = [];

export function sendAIMessage() {
    const input = document.getElementById('ai-input');
    const question = input.value.trim();
    if (!question) return;
    askAI(question);
    input.value = '';
}

export async function askAI(question) {
    const chatDiv = document.getElementById('ai-chat');
    if (!chatDiv) return;

    const userBubble = document.createElement('div');
    userBubble.className = 'flex gap-3 justify-end';
    userBubble.innerHTML = `
        <div class="max-w-[85%]">
            <div class="bg-indigo-600 text-white rounded-xl rounded-tr-sm p-4">
                <p class="text-sm">${escapeHtml(question)}</p>
            </div>
        </div>
        <div class="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/40 rounded-lg flex items-center justify-center flex-shrink-0 text-base">👤</div>
    `;
    chatDiv.appendChild(userBubble);
    chatDiv.scrollTop = chatDiv.scrollHeight;

    const typingEl = document.createElement('div');
    typingEl.className = 'flex gap-3';
    typingEl.innerHTML = `
        <div class="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/40 rounded-lg flex items-center justify-center flex-shrink-0 text-base">🤖</div>
        <div class="max-w-[85%]">
            <div class="bg-slate-50 dark:bg-slate-700/50 rounded-xl rounded-tl-sm p-4 border border-slate-100 dark:border-slate-600">
                <div class="flex items-center gap-2 text-sm text-gray-500"><div class="animate-spin w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full"></div>Analyzing data...</div>
            </div>
        </div>
    `;
    chatDiv.appendChild(typingEl);
    chatDiv.scrollTop = chatDiv.scrollHeight;

    await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
    const response = generateSmartResponse(question);

    typingEl.remove();

    const aiBubble = document.createElement('div');
    aiBubble.className = 'flex gap-3';
    aiBubble.innerHTML = `
        <div class="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/40 rounded-lg flex items-center justify-center flex-shrink-0 text-base">🤖</div>
        <div class="flex-1 max-w-[85%]">
            <div class="bg-slate-50 dark:bg-slate-700/50 rounded-xl rounded-tl-sm p-4 border border-slate-100 dark:border-slate-600">
                <div class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed prose prose-sm dark:prose-invert max-w-none">${response}</div>
            </div>
        </div>
    `;
    chatDiv.appendChild(aiBubble);
    chatDiv.scrollTop = chatDiv.scrollHeight;
    chatHistory.push({ q: question, a: response });
    if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);
}

/* ── helpers ─────────────────────────────────────────────────────── */

function allGames() {
    return gameData.allGames || [];
}
function themes() {
    return gameData.themes || [];
}
function mechanics() {
    return gameData.mechanics || [];
}

function matchEntity(q, list, key) {
    const lo = q.toLowerCase();
    return list.find(item => lo.includes((item[key] || '').toLowerCase()) && (item[key] || '').length > 2);
}

function findThemeInQ(q) {
    return matchEntity(q, themes(), 'Theme');
}
function findMechanicInQ(q) {
    return matchEntity(q, mechanics(), 'Mechanic');
}
function findProviderInQ(q) {
    const lo = q.toLowerCase();
    const provMetrics = getProviderMetrics(allGames());
    return provMetrics.find(p => lo.includes(p.name.toLowerCase()));
}
function findFeatureInQ(q) {
    const lo = q.toLowerCase();
    return CANONICAL_FEATURES.find(f => lo.includes(f.toLowerCase()));
}

function gamesForTheme(themeName) {
    return allGames().filter(g => (F.themeConsolidated(g) || '').toLowerCase() === themeName.toLowerCase());
}
function gamesForProvider(provName) {
    return allGames().filter(g => F.provider(g) === provName);
}
function gamesWithFeature(feat) {
    return allGames().filter(g => parseFeatures(g.features).some(f => f.toLowerCase() === feat.toLowerCase()));
}

function pct(n, d) {
    return d > 0 ? ((n / d) * 100).toFixed(1) : '0';
}
function avg(arr) {
    return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

function statCard(label, value, sub) {
    return `<div class="inline-flex flex-col items-center px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 min-w-[80px]">
        <span class="text-lg font-black text-gray-900 dark:text-white">${value}</span>
        <span class="text-[10px] text-gray-500">${escapeHtml(label)}</span>
        ${sub ? `<span class="text-[9px] text-gray-400">${sub}</span>` : ''}
    </div>`;
}

function miniTable(headers, rows) {
    return `<table class="w-full text-xs mt-2 mb-2"><thead><tr>${headers.map(h => `<th class="text-left py-1 px-2 text-gray-400 font-medium border-b border-gray-200 dark:border-gray-700">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr class="border-b border-gray-100 dark:border-gray-700/50">${r.map(c => `<td class="py-1.5 px-2">${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

/* ── intent handlers ─────────────────────────────────────────────── */

function handleThemeQuery(themeName) {
    const themeObj = themes().find(t => t.Theme?.toLowerCase() === themeName.toLowerCase());
    const tGames = gamesForTheme(themeName);
    if (!themeObj && !tGames.length) return null;

    const theos = tGames.map(g => F.theoWin(g)).filter(t => t > 0);
    const avgTheo = avg(theos);
    const globalAvg = avg(
        allGames()
            .map(g => F.theoWin(g))
            .filter(t => t > 0)
    );
    const vsMarket = globalAvg > 0 ? ((avgTheo - globalAvg) / globalAvg) * 100 : 0;

    const providers = {};
    const features = {};
    tGames.forEach(g => {
        const p = F.provider(g);
        if (p && p !== 'Unknown') providers[p] = (providers[p] || 0) + 1;
        parseFeatures(g.features).forEach(f => {
            features[f] = (features[f] || 0) + 1;
        });
    });
    const topProvs = Object.entries(providers)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    const topFeats = Object.entries(features)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    const topGames = [...tGames].sort((a, b) => F.theoWin(b) - F.theoWin(a)).slice(0, 5);

    let html = `<p class="font-semibold text-gray-900 dark:text-white mb-2">${escapeHtml(themeName)} Theme Analysis</p>`;
    html += `<div class="flex flex-wrap gap-2 mb-3">`;
    html += statCard('Games', tGames.length);
    html += statCard('Avg Theo', avgTheo.toFixed(2));
    html += statCard(
        'vs Market',
        `${vsMarket >= 0 ? '+' : ''}${vsMarket.toFixed(0)}%`,
        vsMarket >= 0 ? 'above avg' : 'below avg'
    );
    if (themeObj) html += statCard('Smart Index', (themeObj['Smart Index'] || 0).toFixed(1));
    html += `</div>`;

    if (topFeats.length) {
        html += `<p class="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Most Used Features</p>`;
        html += `<div class="flex flex-wrap gap-1 mb-3">${topFeats.map(([f, c]) => `<span class="px-2 py-0.5 text-[10px] rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium">${escapeHtml(f)} (${c})</span>`).join('')}</div>`;
    }
    if (topProvs.length) {
        html += `<p class="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Top Providers</p>`;
        html += miniTable(
            ['Provider', 'Games'],
            topProvs.map(([p, c]) => [`<span class="font-medium">${escapeHtml(p)}</span>`, c])
        );
    }
    if (topGames.length) {
        html += `<p class="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Top Performers</p>`;
        html += miniTable(
            ['Game', 'Provider', 'Theo'],
            topGames.map(g => [
                `<span class="font-semibold text-gray-900 dark:text-white">${escapeHtml(F.name(g))}</span>`,
                escapeHtml(F.provider(g)),
                `<span class="font-bold text-emerald-600">${F.theoWin(g).toFixed(2)}</span>`,
            ])
        );
    }

    const suggestion =
        vsMarket > 15
            ? `<p class="mt-2 text-emerald-700 dark:text-emerald-400 text-xs font-medium">This theme outperforms the market by ${vsMarket.toFixed(0)}% — strong choice for new games.</p>`
            : vsMarket < -15
              ? `<p class="mt-2 text-red-600 dark:text-red-400 text-xs font-medium">This theme underperforms the market by ${Math.abs(vsMarket).toFixed(0)}% — consider pairing with high-performance features like ${
                    topFeats
                        .slice(0, 2)
                        .map(([f]) => f)
                        .join(', ') || 'Free Spins'
                } to compensate.</p>`
              : `<p class="mt-2 text-gray-600 dark:text-gray-400 text-xs">This theme performs near market average. Differentiation through unique feature combinations will be key.</p>`;
    html += suggestion;
    return html;
}

function handleProviderQuery(provName) {
    const pGames = gamesForProvider(provName);
    if (!pGames.length) return null;

    const theos = pGames.map(g => F.theoWin(g)).filter(t => t > 0);
    const avgTheo = avg(theos);
    const globalAvg = avg(
        allGames()
            .map(g => F.theoWin(g))
            .filter(t => t > 0)
    );

    const themeMap = {};
    const featMap = {};
    pGames.forEach(g => {
        const t = F.themeConsolidated(g);
        if (t && t !== 'Unknown') {
            if (!themeMap[t]) themeMap[t] = { count: 0, totalTheo: 0 };
            themeMap[t].count++;
            themeMap[t].totalTheo += F.theoWin(g);
        }
        parseFeatures(g.features).forEach(f => {
            featMap[f] = (featMap[f] || 0) + 1;
        });
    });

    const bestThemes = Object.entries(themeMap)
        .filter(([, d]) => d.count >= 2)
        .sort((a, b) => b[1].totalTheo / b[1].count - a[1].totalTheo / a[1].count)
        .slice(0, 5);
    const topFeats = Object.entries(featMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    const topGames = [...pGames].sort((a, b) => F.theoWin(b) - F.theoWin(a)).slice(0, 5);

    let html = `<p class="font-semibold text-gray-900 dark:text-white mb-2">${escapeHtml(provName)} Provider Analysis</p>`;
    html += `<div class="flex flex-wrap gap-2 mb-3">`;
    html += statCard('Portfolio', pGames.length, 'games');
    html += statCard('Avg Theo', avgTheo.toFixed(2));
    html += statCard('vs Market', `${(((avgTheo - globalAvg) / globalAvg) * 100).toFixed(0)}%`);
    html += statCard('Themes', Object.keys(themeMap).length);
    html += `</div>`;

    if (bestThemes.length) {
        html += `<p class="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Best Performing Themes (2+ games)</p>`;
        html += miniTable(
            ['Theme', 'Games', 'Avg Theo'],
            bestThemes.map(([t, d]) => [
                `<span class="font-medium">${escapeHtml(t)}</span>`,
                d.count,
                `<span class="font-bold">${(d.totalTheo / d.count).toFixed(2)}</span>`,
            ])
        );
    }
    if (topFeats.length) {
        html += `<p class="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Feature DNA</p>`;
        html += `<div class="flex flex-wrap gap-1 mb-3">${topFeats.map(([f, c]) => `<span class="px-2 py-0.5 text-[10px] rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium">${escapeHtml(f)} (${pct(c, pGames.length)}%)</span>`).join('')}</div>`;
    }
    if (topGames.length) {
        html += `<p class="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Top Games</p>`;
        html += miniTable(
            ['Game', 'Theme', 'Theo'],
            topGames.map(g => [
                `<span class="font-semibold text-gray-900 dark:text-white">${escapeHtml(F.name(g))}</span>`,
                escapeHtml(F.themeConsolidated(g) || ''),
                `<span class="font-bold text-emerald-600">${F.theoWin(g).toFixed(2)}</span>`,
            ])
        );
    }
    return html;
}

function handleFeatureQuery(featName) {
    const fGames = gamesWithFeature(featName);
    if (!fGames.length) return null;

    const theos = fGames.map(g => F.theoWin(g)).filter(t => t > 0);
    const avgTheo = avg(theos);
    const globalAvg = avg(
        allGames()
            .map(g => F.theoWin(g))
            .filter(t => t > 0)
    );
    const adoption = pct(fGames.length, allGames().length);

    const pairedFeats = {};
    const themePerf = {};
    fGames.forEach(g => {
        parseFeatures(g.features).forEach(f => {
            if (f.toLowerCase() !== featName.toLowerCase()) pairedFeats[f] = (pairedFeats[f] || 0) + 1;
        });
        const t = F.themeConsolidated(g);
        if (t && t !== 'Unknown') {
            if (!themePerf[t]) themePerf[t] = { count: 0, totalTheo: 0 };
            themePerf[t].count++;
            themePerf[t].totalTheo += F.theoWin(g);
        }
    });
    const bestPairs = Object.entries(pairedFeats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);
    const bestThemes = Object.entries(themePerf)
        .filter(([, d]) => d.count >= 2)
        .sort((a, b) => b[1].totalTheo / b[1].count - a[1].totalTheo / a[1].count)
        .slice(0, 5);

    let html = `<p class="font-semibold text-gray-900 dark:text-white mb-2">${escapeHtml(featName)} Feature Deep Dive</p>`;
    html += `<div class="flex flex-wrap gap-2 mb-3">`;
    html += statCard('Games', fGames.length);
    html += statCard('Adoption', `${adoption}%`);
    html += statCard('Avg Theo', avgTheo.toFixed(2));
    html += statCard('vs Market', `${(((avgTheo - globalAvg) / globalAvg) * 100).toFixed(0)}%`);
    html += `</div>`;

    if (bestPairs.length) {
        html += `<p class="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Best Feature Pairings</p>`;
        html += `<div class="flex flex-wrap gap-1 mb-3">${bestPairs
            .map(([f, c]) => {
                const paired = fGames.filter(g => parseFeatures(g.features).includes(f));
                const pairedAvg = avg(paired.map(g => F.theoWin(g)));
                return `<span class="px-2 py-1 text-[10px] rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">${escapeHtml(f)} <span class="text-[9px] text-gray-400">${c}g · ${pairedAvg.toFixed(1)} avg</span></span>`;
            })
            .join('')}</div>`;
    }
    if (bestThemes.length) {
        html += `<p class="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Best Themes for ${escapeHtml(featName)}</p>`;
        html += miniTable(
            ['Theme', 'Games', 'Avg Theo'],
            bestThemes.map(([t, d]) => [
                `<span class="font-medium">${escapeHtml(t)}</span>`,
                d.count,
                `<span class="font-bold text-emerald-600">${(d.totalTheo / d.count).toFixed(2)}</span>`,
            ])
        );
    }
    return html;
}

function handleCompare(q) {
    const lo = q.toLowerCase();
    const found = [];
    for (const t of themes()) {
        if (lo.includes((t.Theme || '').toLowerCase()) && (t.Theme || '').length > 2) found.push(t);
        if (found.length >= 2) break;
    }
    if (found.length < 2) return null;

    const [a, b] = found;
    const aGames = gamesForTheme(a.Theme);
    const bGames = gamesForTheme(b.Theme);
    const aAvg = avg(aGames.map(g => F.theoWin(g)).filter(t => t > 0));
    const bAvg = avg(bGames.map(g => F.theoWin(g)).filter(t => t > 0));

    let html = `<p class="font-semibold text-gray-900 dark:text-white mb-2">${escapeHtml(a.Theme)} vs ${escapeHtml(b.Theme)}</p>`;
    html += miniTable(
        ['Metric', escapeHtml(a.Theme), escapeHtml(b.Theme)],
        [
            ['Games', `<strong>${aGames.length}</strong>`, `<strong>${bGames.length}</strong>`],
            ['Avg Theo', `<strong>${aAvg.toFixed(2)}</strong>`, `<strong>${bAvg.toFixed(2)}</strong>`],
            [
                'Smart Index',
                `<strong>${(a['Smart Index'] || 0).toFixed(1)}</strong>`,
                `<strong>${(b['Smart Index'] || 0).toFixed(1)}</strong>`,
            ],
            ['Market Share', `${(a['Market Share %'] || 0).toFixed(1)}%`, `${(b['Market Share %'] || 0).toFixed(1)}%`],
        ]
    );
    const winner = (a['Smart Index'] || 0) > (b['Smart Index'] || 0) ? a : b;
    html += `<p class="text-xs mt-2 text-indigo-600 dark:text-indigo-400 font-medium">Based on Smart Index, <strong>${escapeHtml(winner.Theme)}</strong> is the stronger performer overall.</p>`;
    return html;
}

function handleConceptEval(q) {
    const lo = q.toLowerCase();
    const theme = findThemeInQ(q);
    const feature = findFeatureInQ(q);
    if (!theme && !feature) return null;

    const themeName = theme?.Theme;
    const tGames = themeName ? gamesForTheme(themeName) : allGames();
    let matchedGames = tGames;
    if (feature)
        matchedGames = tGames.filter(g =>
            parseFeatures(g.features).some(f => f.toLowerCase() === feature.toLowerCase())
        );

    const globalAvg = avg(
        allGames()
            .map(g => F.theoWin(g))
            .filter(t => t > 0)
    );
    const matchAvg = avg(matchedGames.map(g => F.theoWin(g)).filter(t => t > 0));
    const vsMarket = globalAvg > 0 ? ((matchAvg - globalAvg) / globalAvg) * 100 : 0;

    let html = `<p class="font-semibold text-gray-900 dark:text-white mb-2">Concept Evaluation${themeName ? `: ${escapeHtml(themeName)}` : ''}${feature ? ` + ${escapeHtml(feature)}` : ''}</p>`;
    html += `<div class="flex flex-wrap gap-2 mb-3">`;
    html += statCard('Similar Games', matchedGames.length);
    html += statCard('Avg Theo', matchAvg.toFixed(2));
    html += statCard('vs Market', `${vsMarket >= 0 ? '+' : ''}${vsMarket.toFixed(0)}%`);
    html += `</div>`;

    if (matchedGames.length === 0) {
        html += `<div class="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-xs text-amber-700 dark:text-amber-300">
            <strong>Blue Ocean Alert:</strong> No existing games match this exact combination. This could be an untapped opportunity — but verify there's audience demand before committing.
        </div>`;
    } else {
        const topEx = [...matchedGames].sort((a, b) => F.theoWin(b) - F.theoWin(a)).slice(0, 3);
        html += `<p class="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Closest Comparisons</p>`;
        html += miniTable(
            ['Game', 'Provider', 'Theo'],
            topEx.map(g => [
                `<span class="font-semibold">${escapeHtml(F.name(g))}</span>`,
                escapeHtml(F.provider(g)),
                `<span class="font-bold text-emerald-600">${F.theoWin(g).toFixed(2)}</span>`,
            ])
        );
        if (vsMarket > 10)
            html += `<p class="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1">This combination outperforms the market — strong potential.</p>`;
        else if (vsMarket < -10)
            html += `<p class="text-xs text-red-500 font-medium mt-1">This combination underperforms. Consider tweaking the feature mix or targeting a niche audience.</p>`;
    }
    return html;
}

function handleMarketGaps() {
    const gapThemes = [...themes()]
        .filter(t => (t['Game Count'] || 0) < 40 && (t['Smart Index'] || 0) > 30)
        .sort((a, b) => (b['Smart Index'] || 0) - (a['Smart Index'] || 0))
        .slice(0, 8);

    const feats = getFeatureMetrics(allGames());
    const globalAvg = avg(
        allGames()
            .map(g => F.theoWin(g))
            .filter(t => t > 0)
    );
    const underusedFeats = feats
        .filter(f => f.count < allGames().length * 0.15 && f.avgTheo > globalAvg * 1.1)
        .sort((a, b) => b.avgTheo - a.avgTheo)
        .slice(0, 5);

    let html = `<p class="font-semibold text-gray-900 dark:text-white mb-2">Market Opportunity Map</p>`;
    if (gapThemes.length) {
        html += `<p class="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">High-Potential, Low-Competition Themes</p>`;
        html += miniTable(
            ['Theme', 'Games', 'Smart Index', 'Avg Theo'],
            gapThemes.map(t => [
                `<span class="font-semibold">${escapeHtml(t.Theme)}</span>`,
                t['Game Count'] || 0,
                `<span class="font-bold text-indigo-600">${(t['Smart Index'] || 0).toFixed(1)}</span>`,
                (t['Avg Theo Win Index'] || 0).toFixed(2),
            ])
        );
    }
    if (underusedFeats.length) {
        html += `<p class="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 mt-3">Underused High-Performing Features</p>`;
        html += `<div class="flex flex-wrap gap-1 mb-2">${underusedFeats.map(f => `<span class="px-2 py-1 text-[10px] rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 font-medium">${escapeHtml(f.feature)} <span class="text-[9px]">${f.count}g · ${f.avgTheo.toFixed(1)} avg</span></span>`).join('')}</div>`;
    }
    html += `<p class="text-xs text-gray-500 mt-2">These represent combinations where market supply is low but performance is high — potential blue ocean zones for new games.</p>`;
    return html;
}

function handleTopPerformers() {
    const top = [...allGames()].sort((a, b) => F.theoWin(b) - F.theoWin(a)).slice(0, 10);
    let html = `<p class="font-semibold text-gray-900 dark:text-white mb-2">Top 10 Performing Games</p>`;
    html += miniTable(
        ['#', 'Game', 'Provider', 'Theme', 'Theo'],
        top.map((g, i) => [
            `<span class="font-medium text-gray-400">${i + 1}</span>`,
            `<span class="font-semibold text-gray-900 dark:text-white">${escapeHtml(F.name(g))}</span>`,
            escapeHtml(F.provider(g)),
            escapeHtml(F.themeConsolidated(g) || ''),
            `<span class="font-bold text-emerald-600">${F.theoWin(g).toFixed(2)}</span>`,
        ])
    );
    const themeFreq = {};
    top.forEach(g => {
        const t = F.themeConsolidated(g);
        if (t) themeFreq[t] = (themeFreq[t] || 0) + 1;
    });
    const domThemes = Object.entries(themeFreq).sort((a, b) => b[1] - a[1]);
    if (domThemes.length) {
        html += `<p class="text-xs text-gray-500 mt-2">Dominant themes among top performers: <strong>${domThemes.map(([t, c]) => `${escapeHtml(t)} (${c})`).join(', ')}</strong></p>`;
    }
    return html;
}

function handleVolatilityQuestion() {
    const games = allGames().filter(g => F.volatility(g) && F.theoWin(g) > 0);
    const byVol = {};
    games.forEach(g => {
        const v = F.volatility(g);
        if (!byVol[v]) byVol[v] = { count: 0, totalTheo: 0 };
        byVol[v].count++;
        byVol[v].totalTheo += F.theoWin(g);
    });

    const sorted = Object.entries(byVol)
        .map(([vol, d]) => ({ vol, count: d.count, avg: d.totalTheo / d.count }))
        .sort((a, b) => b.avg - a.avg);

    let html = `<p class="font-semibold text-gray-900 dark:text-white mb-2">Volatility vs Performance</p>`;
    html += miniTable(
        ['Volatility', 'Games', 'Avg Theo'],
        sorted.map(s => [
            `<span class="font-semibold">${escapeHtml(s.vol)}</span>`,
            s.count,
            `<span class="font-bold ${s.avg > avg(sorted.map(x => x.avg)) ? 'text-emerald-600' : 'text-gray-600'}">${s.avg.toFixed(2)}</span>`,
        ])
    );
    if (sorted.length) {
        const best = sorted[0];
        html += `<p class="text-xs text-gray-500 mt-2"><strong>${escapeHtml(best.vol)}</strong> volatility games have the highest average Theo (${best.avg.toFixed(2)}) across ${best.count} games in the dataset.</p>`;
    }
    return html;
}

function handleLayoutQuestion() {
    const games = allGames().filter(g => (g.specs_reels || g.reels) && (g.specs_rows || g.rows) && F.theoWin(g) > 0);
    const byLayout = {};
    games.forEach(g => {
        const l = `${g.specs_reels || g.reels}x${g.specs_rows || g.rows}`;
        if (!byLayout[l]) byLayout[l] = { count: 0, totalTheo: 0 };
        byLayout[l].count++;
        byLayout[l].totalTheo += F.theoWin(g);
    });

    const sorted = Object.entries(byLayout)
        .map(([layout, d]) => ({ layout, count: d.count, avg: d.totalTheo / d.count }))
        .filter(s => s.count >= 3)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    let html = `<p class="font-semibold text-gray-900 dark:text-white mb-2">Reel Layout Analysis</p>`;
    html += miniTable(
        ['Layout', 'Games', 'Avg Theo', 'Share'],
        sorted.map(s => [
            `<span class="font-semibold">${escapeHtml(s.layout)}</span>`,
            s.count,
            `<span class="font-bold">${s.avg.toFixed(2)}</span>`,
            `${pct(s.count, games.length)}%`,
        ])
    );
    return html;
}

function handleComboRecipe() {
    const games = allGames().filter(g => F.theoWin(g) > 0);
    const combos = {};
    games.forEach(g => {
        const feats = parseFeatures(g.features).sort();
        for (let i = 0; i < feats.length; i++) {
            for (let j = i + 1; j < feats.length; j++) {
                const key = `${feats[i]} + ${feats[j]}`;
                if (!combos[key]) combos[key] = { count: 0, totalTheo: 0 };
                combos[key].count++;
                combos[key].totalTheo += F.theoWin(g);
            }
        }
    });

    const top = Object.entries(combos)
        .filter(([, d]) => d.count >= 3)
        .map(([combo, d]) => ({ combo, count: d.count, avg: d.totalTheo / d.count }))
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 10);

    let html = `<p class="font-semibold text-gray-900 dark:text-white mb-2">Winning Feature Combinations</p>`;
    html += `<p class="text-xs text-gray-500 mb-2">Feature pairs ranked by average Theo Win (min 3 games)</p>`;
    html += miniTable(
        ['#', 'Combo', 'Games', 'Avg Theo'],
        top.map((c, i) => [
            i + 1,
            `<span class="font-medium">${escapeHtml(c.combo)}</span>`,
            c.count,
            `<span class="font-bold text-emerald-600">${c.avg.toFixed(2)}</span>`,
        ])
    );
    return html;
}

function handleMarketOverview() {
    const games = allGames();
    const globalAvg = avg(games.map(g => F.theoWin(g)).filter(t => t > 0));
    const provCount = new Set(games.map(g => F.provider(g)).filter(p => p && p !== 'Unknown')).size;
    const themeCount = new Set(games.map(g => F.themeConsolidated(g)).filter(t => t && t !== 'Unknown')).size;

    let html = `<p class="font-semibold text-gray-900 dark:text-white mb-2">Market Overview</p>`;
    html += `<div class="flex flex-wrap gap-2 mb-3">`;
    html += statCard('Total Games', games.length);
    html += statCard('Providers', provCount);
    html += statCard('Themes', themeCount);
    html += statCard('Avg Theo', globalAvg.toFixed(2));
    html += `</div>`;

    const topThemes = [...themes()].sort((a, b) => (b['Smart Index'] || 0) - (a['Smart Index'] || 0)).slice(0, 5);
    const topMechs = [...mechanics()].sort((a, b) => (b['Smart Index'] || 0) - (a['Smart Index'] || 0)).slice(0, 5);

    html += `<div class="grid grid-cols-2 gap-4">`;
    html += `<div>`;
    html += `<p class="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Top Themes</p>`;
    html += miniTable(
        ['Theme', 'SI'],
        topThemes.map(t => [
            `<span class="font-medium">${escapeHtml(t.Theme)}</span>`,
            `<span class="font-bold text-indigo-600">${(t['Smart Index'] || 0).toFixed(1)}</span>`,
        ])
    );
    html += `</div><div>`;
    html += `<p class="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Top Mechanics</p>`;
    html += miniTable(
        ['Mechanic', 'SI'],
        topMechs.map(m => [
            `<span class="font-medium">${escapeHtml(m.Mechanic)}</span>`,
            `<span class="font-bold text-indigo-600">${(m['Smart Index'] || 0).toFixed(1)}</span>`,
        ])
    );
    html += `</div></div>`;
    html += `<p class="text-xs text-gray-500 mt-2">Ask me about specific themes, features, providers, or combos to dive deeper.</p>`;
    return html;
}

/* ── intent router ───────────────────────────────────────────────── */

function generateSmartResponse(question) {
    const lo = question.toLowerCase();

    if (lo.includes('compar') || lo.includes(' vs ') || lo.includes(' versus ')) {
        const result = handleCompare(question);
        if (result) return result;
    }

    if (
        lo.includes('would') ||
        lo.includes('should i') ||
        lo.includes('good idea') ||
        lo.includes('work well') ||
        lo.includes('evaluate') ||
        lo.includes('concept')
    ) {
        const result = handleConceptEval(question);
        if (result) return result;
    }

    if (
        lo.includes('gap') ||
        lo.includes('opportunit') ||
        lo.includes('blue ocean') ||
        lo.includes('untapped') ||
        lo.includes('underserved')
    ) {
        return handleMarketGaps();
    }

    if (lo.includes('top') && (lo.includes('game') || lo.includes('performer') || lo.includes('best game'))) {
        return handleTopPerformers();
    }

    if (lo.includes('volatil') || lo.includes('variance') || lo.includes('high vol') || lo.includes('low vol')) {
        return handleVolatilityQuestion();
    }

    if (
        lo.includes('layout') ||
        lo.includes('reel') ||
        lo.includes('grid') ||
        lo.includes('5x3') ||
        lo.includes('3x3') ||
        lo.includes('rows')
    ) {
        return handleLayoutQuestion();
    }

    if (
        lo.includes('combo') ||
        lo.includes('combination') ||
        lo.includes('recipe') ||
        lo.includes('pair') ||
        lo.includes('together')
    ) {
        return handleComboRecipe();
    }

    if (
        lo.includes('overview') ||
        lo.includes('summary') ||
        lo.includes('market') ||
        lo.includes('overall') ||
        lo.includes('how many')
    ) {
        return handleMarketOverview();
    }

    const provider = findProviderInQ(question);
    if (provider) {
        const result = handleProviderQuery(provider.name);
        if (result) return result;
    }

    const feature = findFeatureInQ(question);
    if (feature) {
        const result = handleFeatureQuery(feature);
        if (result) return result;
    }

    const theme = findThemeInQ(question);
    if (theme) {
        const result = handleThemeQuery(theme.Theme);
        if (result) return result;
    }

    if (lo.includes('help') || lo.includes('what can') || lo.includes('how do')) {
        return handleMarketOverview();
    }

    return handleFallback(question);
}

function handleFallback(question) {
    const lo = question.toLowerCase();

    for (const t of themes()) {
        const words = (t.Theme || '').toLowerCase().split(/\s+/);
        if (words.some(w => w.length > 3 && lo.includes(w))) {
            const result = handleThemeQuery(t.Theme);
            if (result) return result;
        }
    }

    for (const f of CANONICAL_FEATURES) {
        const words = f.toLowerCase().split(/\s+/);
        if (words.some(w => w.length > 3 && lo.includes(w))) {
            const result = handleFeatureQuery(f);
            if (result) return result;
        }
    }

    let html = `<p class="text-gray-700 dark:text-gray-300 mb-2">I analyzed your question against our game database. Here's what I can help with:</p>`;
    html += `<div class="grid grid-cols-2 gap-2 text-[11px]">`;
    const examples = [
        ['🎨 Theme Analysis', '"Tell me about Egyptian"'],
        ['🔧 Feature Deep Dive', '"How does Free Spins perform?"'],
        ['🏢 Provider Intel', '"Analyze IGT portfolio"'],
        ['⚖️ Comparison', '"Compare Animals vs Egyptian"'],
        ['🎯 Concept Check', '"Would an Egyptian Hold & Win work?"'],
        ['🗺️ Market Gaps', '"What opportunities exist?"'],
        ['🎰 Volatility', '"High vs low volatility?"'],
        ['📐 Layouts', '"Best reel layout?"'],
        ['🔗 Combos', '"Best feature combinations?"'],
        ['📊 Overview', '"Market summary"'],
    ];
    examples.forEach(([label, ex]) => {
        html += `<div class="p-2 rounded-lg border border-gray-200 dark:border-gray-700">
            <div class="font-semibold text-gray-800 dark:text-gray-200">${label}</div>
            <div class="text-gray-400 italic">${ex}</div>
        </div>`;
    });
    html += `</div>`;
    return html;
}
