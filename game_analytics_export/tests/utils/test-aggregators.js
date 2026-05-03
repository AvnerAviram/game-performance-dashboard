/**
 * Local aggregation helpers for data-validation tests.
 *
 * These replicate the old sync JS logic from metrics.js (pre-SQL migration)
 * so tests can validate raw game data without needing DuckDB.
 *
 * addSmartIndex/calculateSmartIndex are duplicated here to avoid importing
 * metrics.js (which now imports duckdb-client.js and triggers WASM loading).
 */
import { F } from '../../src/lib/game-fields.js';
import { parseFeatures } from '../../src/lib/parse-features.js';
import { VOLATILITY_ORDER, MIN_PROVIDER_GAMES } from '../../src/lib/shared-config.js';

export function calculateSmartIndex(avgTheo, gameCount, globalAvgTheo) {
    if (!globalAvgTheo || globalAvgTheo === 0) return 0;
    return (avgTheo * Math.sqrt(gameCount)) / globalAvgTheo;
}

export function addSmartIndex(rows) {
    if (!rows.length) return rows;
    const globalAvg = rows.reduce((s, r) => s + (r.avg_theo_win ?? r.avgTheo ?? 0), 0) / rows.length;
    return rows
        .map(r => {
            const theo = r.avg_theo_win ?? r.avgTheo ?? 0;
            const count = r.game_count ?? r.count ?? 0;
            return { ...r, smartIndex: calculateSmartIndex(theo, count, globalAvg) };
        })
        .sort((a, b) => b.smartIndex - a.smartIndex);
}

export function computeProviderMetrics(games, opts = {}) {
    const minGames = opts.minGames ?? MIN_PROVIDER_GAMES;
    const map = {};
    for (const g of games) {
        const prov = F.provider(g);
        if (!prov || prov === 'Unknown') continue;
        if (!map[prov]) map[prov] = { name: prov, count: 0, totalTheo: 0, totalMkt: 0 };
        map[prov].count++;
        map[prov].totalTheo += F.theoWin(g);
        map[prov].totalMkt += F.marketShare(g);
    }
    const rows = Object.values(map)
        .map(p => ({ ...p, avgTheo: p.count > 0 ? p.totalTheo / p.count : 0, ggrShare: p.totalMkt }))
        .filter(p => p.count >= minGames);
    return addSmartIndex(rows);
}

export function computeThemeMetrics(games) {
    const map = {};
    for (const g of games) {
        const theme = F.themeConsolidated(g);
        if (!map[theme]) map[theme] = { theme, count: 0, totalTheo: 0, totalMkt: 0 };
        map[theme].count++;
        map[theme].totalTheo += F.theoWin(g);
        map[theme].totalMkt += F.marketShare(g);
    }
    const rows = Object.values(map).map(t => ({ ...t, avgTheo: t.count > 0 ? t.totalTheo / t.count : 0 }));
    return addSmartIndex(rows);
}

export function computeFeatureMetrics(games) {
    const map = {};
    for (const g of games) {
        const feats = parseFeatures(F.features(g));
        const theo = F.theoWin(g);
        for (const feat of feats) {
            if (!feat || feat === 'Unknown') continue;
            if (!map[feat]) map[feat] = { feature: feat, count: 0, totalTheo: 0 };
            map[feat].count++;
            map[feat].totalTheo += theo;
        }
    }
    const rows = Object.values(map).map(f => ({ ...f, avgTheo: f.count > 0 ? f.totalTheo / f.count : 0 }));
    return addSmartIndex(rows);
}

export function computeVolatilityMetrics(games) {
    const map = {};
    for (const g of games) {
        const vol = F.volatility(g);
        if (!vol) continue;
        if (!map[vol]) map[vol] = { volatility: vol, count: 0, totalTheo: 0 };
        map[vol].count++;
        map[vol].totalTheo += F.theoWin(g);
    }
    const all = Object.values(map).map(v => ({ ...v, avgTheo: v.count > 0 ? v.totalTheo / v.count : 0 }));
    return VOLATILITY_ORDER.filter(v => all.find(a => a.volatility === v)).map(v => all.find(a => a.volatility === v));
}

export function computeGlobalAvgTheo(games) {
    if (!games.length) return 0;
    return games.reduce((s, g) => s + F.theoWin(g), 0) / games.length;
}

export function computeArtThemeMetrics(games) {
    const map = {};
    for (const g of games) {
        const theme = F.artTheme(g);
        if (!theme) continue;
        if (!map[theme]) map[theme] = { theme, count: 0, totalTheo: 0, totalMkt: 0 };
        map[theme].count++;
        map[theme].totalTheo += F.theoWin(g);
        map[theme].totalMkt += F.marketShare(g);
    }
    return Object.values(map)
        .map(s => ({ ...s, avgTheo: s.count > 0 ? s.totalTheo / s.count : 0 }))
        .sort((a, b) => b.count - a.count);
}

export function computeArtCharacterMetrics(games) {
    const map = {};
    for (const g of games) {
        const chars = F.artCharacters(g);
        const theo = F.theoWin(g);
        for (const ch of chars) {
            if (!ch) continue;
            if (!map[ch]) map[ch] = { character: ch, count: 0, totalTheo: 0 };
            map[ch].count++;
            map[ch].totalTheo += theo;
        }
    }
    return Object.values(map)
        .map(c => ({ ...c, avgTheo: c.count > 0 ? c.totalTheo / c.count : 0 }))
        .sort((a, b) => b.count - a.count);
}

export function computeArtElementMetrics(games) {
    const map = {};
    for (const g of games) {
        const elems = F.artElements(g);
        const theo = F.theoWin(g);
        for (const el of elems) {
            if (!el) continue;
            if (!map[el]) map[el] = { element: el, count: 0, totalTheo: 0 };
            map[el].count++;
            map[el].totalTheo += theo;
        }
    }
    return Object.values(map)
        .map(e => ({ ...e, avgTheo: e.count > 0 ? e.totalTheo / e.count : 0 }))
        .sort((a, b) => b.count - a.count);
}

export function computeArtColorToneMetrics(games) {
    const map = {};
    for (const g of games) {
        const colors = F.artColorTone(g);
        const theo = F.theoWin(g);
        for (const ct of colors) {
            if (!ct) continue;
            if (!map[ct]) map[ct] = { colorTone: ct, count: 0, totalTheo: 0 };
            map[ct].count++;
            map[ct].totalTheo += theo;
        }
    }
    return Object.values(map)
        .map(s => ({ ...s, avgTheo: s.count > 0 ? s.totalTheo / s.count : 0 }))
        .sort((a, b) => b.count - a.count);
}

export function computeArtNarrativeMetrics(games) {
    const map = {};
    for (const g of games) {
        const narr = F.artNarrative(g);
        if (!narr) continue;
        if (!map[narr]) map[narr] = { narrative: narr, count: 0, totalTheo: 0 };
        map[narr].count++;
        map[narr].totalTheo += F.theoWin(g);
    }
    return Object.values(map)
        .map(n => ({ ...n, avgTheo: n.count > 0 ? n.totalTheo / n.count : 0 }))
        .sort((a, b) => b.avgTheo - a.avgTheo);
}
