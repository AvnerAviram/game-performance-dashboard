import { gameData } from '../../lib/data.js';
import { F } from '../../lib/game-fields.js';
import { escapeHtml, safeOnclick } from '../../lib/sanitize.js';
import { parseFeatures } from '../../lib/parse-features.js';
import { SHORT_FEATURE_LABELS } from '../../lib/features.js';
import { log } from '../../lib/env.js';

export function renderFranchiseIntelligence(container) {
    if (!container) return;
    const games = gameData.allGames || [];
    if (!games.length) {
        container.innerHTML = '<p class="text-gray-400 text-sm">No game data available.</p>';
        return;
    }

    const franchiseGames = games.filter(g => F.franchise(g));
    if (!franchiseGames.length) {
        container.innerHTML =
            '<p class="text-gray-400 text-sm">No brand data available. Run generate_franchise_map.cjs to create mappings.</p>';
        return;
    }

    const buckets = {};
    for (const g of franchiseGames) {
        const key = F.franchise(g);
        if (!buckets[key]) buckets[key] = { franchise: key, type: F.franchiseType(g), games: [] };
        buckets[key].games.push(g);
    }

    const allTheo = games.filter(g => F.theoWin(g) > 0).map(g => F.theoWin(g));
    const marketMedian = allTheo.sort((a, b) => a - b)[Math.floor(allTheo.length / 2)] || 0;

    const franchises = Object.values(buckets)
        .map(b => {
            const gs = b.games;
            const totalTheo = gs.reduce((s, g) => s + F.theoWin(g), 0);
            const avgTheo = totalTheo / gs.length;
            const totalShare = gs.reduce((s, g) => s + F.marketShare(g), 0);
            const providers = [...new Set(gs.map(g => F.provider(g)).filter(p => p && p !== 'Unknown'))];
            const themes = [...new Set(gs.map(g => F.themeConsolidated(g)).filter(t => t && t !== 'Unknown'))];
            const topGame = [...gs].sort((a, c) => F.theoWin(c) - F.theoWin(a))[0];
            const vsMedian = marketMedian > 0 ? ((avgTheo - marketMedian) / marketMedian) * 100 : 0;
            return {
                franchise: b.franchise,
                type: b.type,
                count: gs.length,
                avgTheo,
                totalShare,
                providers,
                themes,
                topGame,
                vsMedian,
                games: [...gs].sort((a, c) => F.theoWin(c) - F.theoWin(a)),
            };
        })
        .filter(f => f.count >= 2)
        .sort((a, b) => b.totalShare - a.totalShare);

    const licensedIps = franchises.filter(f => f.type === 'licensed_ip');
    const gameFamilies = franchises.filter(f => f.type === 'game_family');

    const ipCount = licensedIps.reduce((s, f) => s + f.count, 0);
    const famCount = gameFamilies.reduce((s, f) => s + f.count, 0);
    const ipAvg = ipCount > 0 ? licensedIps.reduce((s, f) => s + f.avgTheo * f.count, 0) / ipCount : 0;
    const famAvg = famCount > 0 ? gameFamilies.reduce((s, f) => s + f.avgTheo * f.count, 0) / famCount : 0;

    const themesWithFranchise = new Set(franchises.flatMap(f => f.themes));
    const allThemes = [...new Set(games.map(g => F.themeConsolidated(g)).filter(t => t && t !== 'Unknown'))];
    const untappedThemes = allThemes.filter(t => !themesWithFranchise.has(t));
    const untappedWithPerf = untappedThemes
        .map(t => {
            const tg = games.filter(g => F.themeConsolidated(g) === t);
            const avg = tg.reduce((s, g) => s + F.theoWin(g), 0) / (tg.length || 1);
            return { theme: t, count: tg.length, avgTheo: avg };
        })
        .filter(t => t.count >= 3 && t.avgTheo > marketMedian)
        .sort((a, b) => b.avgTheo - a.avgTheo)
        .slice(0, 8);

    let html = '';

    html += `<div class="grid grid-cols-2 gap-4 mb-6">
    <div class="bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 rounded-lg p-4 border border-violet-200 dark:border-violet-800">
      <div class="text-[10px] font-bold uppercase tracking-wide text-violet-600 dark:text-violet-400 mb-1">Licensed IPs</div>
      <div class="text-2xl font-black text-violet-700 dark:text-violet-300">${licensedIps.length}</div>
      <div class="text-xs text-gray-500 dark:text-gray-400">${ipCount} games · Avg Theo ${ipAvg.toFixed(2)}</div>
    </div>
    <div class="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
      <div class="text-[10px] font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400 mb-1">Brands</div>
      <div class="text-2xl font-black text-blue-700 dark:text-blue-300">${gameFamilies.length}</div>
      <div class="text-xs text-gray-500 dark:text-gray-400">${famCount} games · Avg Theo ${famAvg.toFixed(2)}</div>
    </div>
  </div>`;

    html += renderFranchiseTable('Top Brands by Market Share', franchises.slice(0, 15));

    if (untappedWithPerf.length > 0) {
        html += `<div class="mt-6">
      <h4 class="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
        <span class="text-lg">💡</span> Untapped Brand Themes
        <span class="text-[10px] font-normal text-gray-400">(High-performing themes with no existing brands)</span>
      </h4>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        ${untappedWithPerf
            .map(
                t => `
          <div class="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 rounded-lg p-3 border border-emerald-200 dark:border-emerald-800 cursor-pointer hover:shadow-md transition-shadow"
               onclick="${safeOnclick('window.showThemeDetails', t.theme)}">
            <div class="text-sm font-bold text-gray-900 dark:text-white">${escapeHtml(t.theme)}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">${t.count} games · Avg Theo ${t.avgTheo.toFixed(2)}</div>
            <div class="text-[10px] font-medium ${t.avgTheo > marketMedian ? 'text-emerald-600' : 'text-red-500'} mt-1">
              ${marketMedian > 0 ? (((t.avgTheo - marketMedian) / marketMedian) * 100).toFixed(0) + '% vs median' : 'N/A'}
            </div>
          </div>
        `
            )
            .join('')}
      </div>
    </div>`;
    }

    container.innerHTML = html;
    log(`Brand Intelligence rendered: ${franchises.length} brands`);
}

function renderFranchiseTable(title, franchises) {
    if (!franchises.length) return '';

    const gameRows = (f, rowId) => {
        return f.games
            .map(g => {
                const feats = parseFeatures(g.features).slice(0, 3);
                const layout =
                    (g.specs_reels || g.reels) && (g.specs_rows || g.rows)
                        ? `${g.specs_reels || g.reels}x${g.specs_rows || g.rows}`
                        : '';
                const rtp = F.rtp(g);
                const year = F.releaseYear(g);
                return `
      <div class="flex items-center gap-2 py-2 px-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition-colors"
           onclick="${safeOnclick('window.showGameDetails', g.name || '')}">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="text-xs font-semibold text-gray-900 dark:text-white truncate">${escapeHtml(F.name(g))}</span>
            <span class="text-[9px] text-gray-400 shrink-0">${escapeHtml(F.provider(g))}</span>
          </div>
          <div class="flex items-center gap-1.5 mt-1 flex-wrap">
            ${feats.map(ft => `<span class="px-1.5 py-0.5 text-[8px] font-medium rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300">${escapeHtml(SHORT_FEATURE_LABELS[ft] || ft)}</span>`).join('')}
          </div>
        </div>
        <div class="flex items-center gap-3 shrink-0 text-[10px]">
          ${layout ? `<span class="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500">${escapeHtml(layout)}</span>` : ''}
          ${F.volatility(g) ? `<span class="text-gray-400">${F.volatility(g)}</span>` : ''}
          ${rtp ? `<span class="text-gray-400">${rtp}%</span>` : ''}
          ${year ? `<span class="text-gray-400">${year}</span>` : ''}
          <span class="text-xs font-semibold w-10 text-right ${F.theoWin(g) > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-400'}">${F.theoWin(g).toFixed(1)}</span>
        </div>
      </div>`;
            })
            .join('');
    };

    return `
    <h4 class="text-sm font-bold text-gray-900 dark:text-white mb-3">${escapeHtml(title)}</h4>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-200 dark:border-gray-700">
            <th class="text-left py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">#</th>
            <th class="text-left py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Brand</th>
            <th class="text-left py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Type</th>
            <th class="text-right py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Games</th>
            <th class="text-right py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Avg Theo</th>
            <th class="text-right py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">vs Median</th>
            <th class="text-right py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Share %</th>
            <th class="text-left py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Providers</th>
            <th class="text-left py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Top Game</th>
          </tr>
        </thead>
        <tbody>
          ${franchises
              .map((f, i) => {
                  const rowId = `franchise-games-${i}`;
                  const medal = i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : '';
                  const typeBadge =
                      f.type === 'licensed_ip'
                          ? '<span class="px-1.5 py-0.5 text-[9px] font-bold rounded bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 cursor-help" title="Licensed IP: a branded title based on an external property (e.g. Batman, Monopoly, Narcos)">IP</span>'
                          : '<span class="px-1.5 py-0.5 text-[9px] font-bold rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 cursor-help" title="Game Brand: an organic series of sequels sharing a name (e.g. Book of Dead, Starburst, Gonzo\'s Quest)">Brand</span>';
                  const vsColor = f.vsMedian >= 0 ? 'text-emerald-600' : 'text-red-500';
                  const vsArrow = f.vsMedian >= 0 ? '▲' : '▼';
                  return `
              <tr class="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer"
                  onclick="document.getElementById('${rowId}').classList.toggle('hidden')">
                <td class="py-2.5 px-3 text-gray-400 font-medium">${medal}${i + 1}</td>
                <td class="py-2.5 px-3 font-bold text-gray-900 dark:text-white">
                  <span class="flex items-center gap-1">${escapeHtml(f.franchise)}
                    <svg class="w-3 h-3 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                  </span>
                </td>
                <td class="py-2.5 px-3">${typeBadge}</td>
                <td class="py-2.5 px-3 text-right text-gray-600 dark:text-gray-300">${f.count}</td>
                <td class="py-2.5 px-3 text-right font-semibold text-gray-900 dark:text-white">${f.avgTheo.toFixed(2)}</td>
                <td class="py-2.5 px-3 text-right font-medium ${vsColor}">${vsArrow} ${Math.abs(f.vsMedian).toFixed(0)}%</td>
                <td class="py-2.5 px-3 text-right text-gray-600 dark:text-gray-300">${f.totalShare.toFixed(2)}%</td>
                <td class="py-2.5 px-3 text-gray-500 dark:text-gray-400 text-xs">${f.providers
                    .slice(0, 2)
                    .map(p => escapeHtml(p))
                    .join(', ')}${f.providers.length > 2 ? ` +${f.providers.length - 2}` : ''}</td>
                <td class="py-2.5 px-3 text-xs text-gray-500 dark:text-gray-400 truncate max-w-[150px] cursor-pointer hover:text-indigo-600"
                    onclick="event.stopPropagation();${safeOnclick('window.showGameDetails', f.topGame?.name || '')}"
                    title="${escapeHtml(f.topGame?.name || '')}">${escapeHtml(f.topGame?.name || '')}</td>
              </tr>
              <tr id="${rowId}" class="hidden">
                <td colspan="9" class="p-0">
                  <div class="bg-gray-50 dark:bg-gray-800/50 border-y border-gray-200 dark:border-gray-700 py-2 divide-y divide-gray-100 dark:divide-gray-700/50">
                    ${gameRows(f, rowId)}
                  </div>
                </td>
              </tr>`;
              })
              .join('')}
        </tbody>
      </table>
    </div>`;
}
