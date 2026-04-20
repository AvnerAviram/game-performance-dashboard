import { escapeHtml, escapeAttr } from '../../lib/sanitize.js';
import { apiPost } from '../../lib/api-client.js';
import { F } from '../../lib/game-fields.js';

const CONF_STYLES = {
    verified: 'bg-emerald-500/20 text-emerald-400',
    gt_verified: 'bg-emerald-500/20 text-emerald-400',
    extracted: 'bg-blue-500/20 text-blue-400',
    platform: 'bg-sky-500/20 text-sky-400',
    text_inferred: 'bg-amber-500/20 text-amber-400',
    estimated: 'bg-amber-500/20 text-amber-400',
};

const SEVERITY_STYLES = {
    high: 'border-l-2 border-red-500 bg-red-500/10',
    medium: 'border-l-2 border-amber-500 bg-amber-500/10',
    low: 'border-l-2 border-blue-500 bg-blue-500/10',
};

const SOURCE_TYPE_LABELS = {
    platform: 'Performance data CSV',
    extraction: 'Extracted (rules HTML / SlotCatalog)',
    master: 'Imported (see confidence level)',
    art_characterization: 'Art characterization pipeline',
    not_extracted: 'Not available',
};

function confBadge(conf) {
    if (!conf)
        return '<span class="px-1.5 py-0.5 text-[10px] rounded-full bg-gray-500/20 text-gray-500">unknown</span>';
    const cls = CONF_STYLES[conf] || 'bg-gray-500/20 text-gray-500';
    return `<span class="px-1.5 py-0.5 text-[10px] rounded-full ${cls}">${escapeHtml(conf)}</span>`;
}

// ── Aggregate metric explanation (client-side, no API) ──

const METRIC_DEFINITIONS = {
    game_count: {
        label: 'Game Count',
        formula: 'COUNT of games where {dimension} = {value}',
        source: 'Count of games matching this filter. Each game originates from the performance data CSV; classification (theme, features, art) from rules HTML, SlotCatalog, or ground truth.',
    },
    avg_theo_win: {
        label: 'Avg Performance Index',
        formula: 'AVG(theo_win) across all games where {dimension} = {value}',
        source: 'theo_win from the performance data CSV (column: Theo Win)',
    },
    market_share: {
        label: 'Market Share',
        formula: 'SUM(market_share_pct) for games where {dimension} = {value}',
        source: 'market_share_pct from the performance data CSV (column: Market Share %)',
    },
    ggr_share: {
        label: 'GGR Share',
        formula: 'SUM(ggr_share_pct) for games where {dimension} = {value}',
        source: 'ggr_share_pct from the performance data CSV (column: GGR Share %)',
    },
    avg_rtp: {
        label: 'Avg RTP',
        formula: 'AVG(rtp) across games where {dimension} = {value}',
        source: 'RTP extracted from SlotCatalog, rules HTML, or ground truth',
    },
    dominant_volatility: {
        label: 'Volatility',
        formula: 'Most frequent volatility value among games where {dimension} = {value}',
        source: 'Volatility extracted from SlotCatalog, rules HTML, or ground truth',
    },
    smart_index: {
        label: 'Performance Index (SI)',
        formula: 'SI = (avgTheo / globalAvgTheo) * ln(1 + count) * 100',
        source: 'Computed from theo_win (performance data CSV) and game count',
    },
    total_games: {
        label: 'Total Games',
        formula: 'COUNT of all games in the dashboard',
        source: 'Total games loaded from performance data CSV. Each game may have additional fields from rules HTML, SlotCatalog, or ground truth.',
    },
    total_themes: {
        label: 'Total Themes',
        formula: 'COUNT(DISTINCT theme_consolidated) across all games',
        source: 'theme_consolidated classified from rules HTML, SlotCatalog, or ground truth',
    },
    total_mechanics: {
        label: 'Total Mechanics',
        formula: 'COUNT(DISTINCT mechanic) across all game feature lists',
        source: 'Features extracted from rules HTML, SlotCatalog, or ground truth',
    },
    total_providers: {
        label: 'Total Providers',
        formula: 'COUNT(DISTINCT provider) across all games',
        source: 'Provider from the performance data CSV, normalized via PROVIDER_NORMALIZATION_MAP',
    },
    franchise_ip_count: {
        label: 'Licensed IP Franchises',
        formula: 'COUNT of franchises with franchise_type = IP',
        source: 'franchise_mapping.json — game-to-franchise associations',
    },
    franchise_brand_count: {
        label: 'Brand Families',
        formula: 'COUNT of franchises with franchise_type = Brand',
        source: 'franchise_mapping.json — game-to-franchise associations',
    },
    vs_median_pct: {
        label: 'vs Market Median',
        formula: '((avgTheo - medianTheo) / medianTheo) * 100',
        source: 'theo_win from performance data CSV; median computed across all franchises',
    },
};

export function renderAggregateExplanation(container, info) {
    const def = METRIC_DEFINITIONS[info.metric];
    const dim = info.dimension ? escapeHtml(info.dimension) : '';
    const val = info.value ? escapeHtml(info.value) : '';
    const display = info.displayValue ? escapeHtml(info.displayValue) : '';

    let html = '<div class="space-y-4">';

    if (dim && val) {
        html += `<div class="mb-2">
            <div class="text-xs uppercase tracking-widest text-gray-500 mb-1">${dim}</div>
            <div class="text-lg font-bold text-white">${val}</div>
        </div>`;
    }

    html += `<div class="bg-gradient-to-b from-indigo-500/10 to-transparent rounded-xl p-4 border border-indigo-500/20">`;
    html += `<div class="flex items-center gap-2 mb-3">
        <span class="text-xs font-bold uppercase tracking-widest text-indigo-400">Metric</span>
        <span class="text-base font-semibold text-white">${def ? escapeHtml(def.label) : escapeHtml(info.metric)}</span>
    </div>`;

    if (display) {
        html += `<div class="text-3xl font-bold text-white mb-3">${display}</div>`;
    }

    if (def) {
        const formula = def.formula.replace(/\{dimension\}/g, dim).replace(/\{value\}/g, val);
        html += `<div class="mb-3">
            <div class="text-xs uppercase tracking-wide text-indigo-300/70 mb-1 font-medium">Formula</div>
            <div class="bg-black/40 rounded-lg p-3 text-sm font-mono text-gray-100">${escapeHtml(formula)}</div>
        </div>`;

        html += `<div>
            <div class="text-xs uppercase tracking-wide text-indigo-300/70 mb-1 font-medium">Data Source</div>
            <div class="text-sm text-gray-200">${escapeHtml(def.source)}</div>
        </div>`;
    } else {
        html += `<div class="text-sm text-gray-400 italic">No definition found for metric "${escapeHtml(info.metric)}".</div>`;
    }

    html += '</div></div>';

    container.innerHTML = html;
}

// ── Ranking explanation (dimension-level click context) ──

function renderRankingExplanation(ranking) {
    const dim = escapeHtml(ranking.dimension || '');
    const val = escapeHtml(ranking.value || '');
    const r = ranking;

    let html = `<div class="mb-5 bg-gradient-to-b from-purple-500/10 to-transparent rounded-xl p-4 border border-purple-500/20">`;
    html += `<div class="flex items-center gap-2 mb-3">
        <span class="text-xs font-bold uppercase tracking-widest text-purple-400">Ranking</span>
        <span class="text-base font-semibold text-white capitalize">${dim}: ${val}</span>
    </div>`;

    const displayRank = r.tableRank != null ? r.tableRank : r.rank;
    html += `<div class="grid grid-cols-2 gap-3 mb-3">
        <div class="bg-black/30 rounded-lg p-2.5 text-center">
            <div class="text-2xl font-bold text-white">#${displayRank}</div>
            <div class="text-[10px] text-gray-400 uppercase">of ${r.total_dimension_entries}</div>
        </div>
        <div class="bg-black/30 rounded-lg p-2.5 text-center">
            <div class="text-2xl font-bold text-white">${r.smartIndex}</div>
            <div class="text-[10px] text-gray-400 uppercase">Performance Index</div>
        </div>
    </div>`;

    html += `<div class="text-xs text-gray-300 mb-2">
        <span class="text-gray-500">Games:</span> ${r.game_count}
        <span class="text-gray-600 mx-1">&middot;</span>
        <span class="text-gray-500">Avg Theo:</span> ${r.avg_theo_win}
    </div>`;

    html += `<div class="text-[10px] text-gray-500 mb-2">SI = (avgTheo &times; &radic;gameCount) / globalAvg</div>`;

    if (r.top5 && r.top5.length > 0) {
        html += `<div class="mt-2">
            <div class="text-[10px] uppercase tracking-wide text-purple-300/70 mb-1 font-medium">Top 5</div>
            <table class="w-full text-xs">
                <thead><tr class="text-[10px] text-gray-500 uppercase border-b border-white/10">
                    <th class="py-1 px-1 text-left">#</th>
                    <th class="py-1 px-2 text-left">Name</th>
                    <th class="py-1 px-1 text-right">Games</th>
                    <th class="py-1 px-1 text-right">SI</th>
                </tr></thead><tbody>`;
        for (const row of r.top5) {
            const highlight =
                row.name.toLowerCase() === (ranking.value || '').toLowerCase() ? 'bg-purple-500/10 font-semibold' : '';
            html += `<tr class="border-b border-white/5 ${highlight}">
                <td class="py-1 px-1 text-gray-500">${row.rank}</td>
                <td class="py-1 px-2 text-white truncate max-w-[140px]">${escapeHtml(row.name)}</td>
                <td class="py-1 px-1 text-right text-gray-400">${row.game_count}</td>
                <td class="py-1 px-1 text-right text-gray-400">${row.smart_index}</td>
            </tr>`;
        }
        html += `</tbody></table></div>`;
    }

    html += '</div>';
    return html;
}

// ── Feature-specific drilldown ──

function renderFeatureDrilldown(featureName, features, data) {
    const feat = features.find(f => f.name === featureName);

    let html = `<div class="mb-5 bg-gradient-to-b from-indigo-500/10 to-transparent rounded-xl p-4 border border-indigo-500/20">`;
    html += `<div class="flex items-center gap-2 mb-3">
        <span class="text-xs font-bold uppercase tracking-widest text-indigo-400">Feature Drilldown</span>
        <span class="text-base font-semibold text-white">${escapeHtml(featureName)}</span>
    </div>`;

    if (!feat) {
        html += `<div class="text-sm text-gray-400 italic">Feature "${escapeHtml(featureName)}" not found in provenance data for this game.</div>`;
        html += '</div>';
        return html;
    }

    // 1. Source evidence
    html += `<div class="mb-4">
        <div class="text-xs uppercase tracking-wide text-indigo-300/70 mb-1.5 font-medium">1. Source text</div>`;
    if (feat.rules_evidence) {
        html += `<div class="bg-black/40 rounded-lg p-3.5 text-sm text-gray-100 font-mono leading-relaxed break-words">
            <mark class="bg-yellow-400/40 text-yellow-100 px-0.5 rounded font-bold">${escapeHtml(feat.rules_evidence)}</mark>
        </div>`;
    } else if (feat.context) {
        html += `<div class="bg-black/40 rounded-lg p-3.5 text-sm text-gray-100 font-mono leading-relaxed break-words">${escapeHtml(feat.context)}</div>`;
    } else if (data.source?.rules_url) {
        html += `<div class="text-sm text-gray-200">
            <span class="text-gray-400">Rules page:</span>
            <a href="${escapeAttr(data.source.rules_url)}" target="_blank" class="text-indigo-400 hover:underline truncate">${escapeHtml(data.source.rules_url.replace(/^https?:\/\//, '').slice(0, 60))}${data.source.rules_url.length > 70 ? '...' : ''}</a>
        </div>
        <div class="text-xs text-gray-500 mt-1">Feature keyword not captured verbatim.</div>`;
    } else {
        html += `<div class="text-sm text-gray-400 italic">No source text on disk for this feature.</div>`;
    }
    html += '</div>';

    // 2. Classification
    html += `<div class="mb-4">
        <div class="text-xs uppercase tracking-wide text-indigo-300/70 mb-1.5 font-medium">2. Classification</div>
        <div class="text-sm">
            <span class="text-white font-semibold">Rules HTML classification</span>
            <div class="text-gray-200 mt-1">Mechanic identified from game rules text based on keyword matching and feature taxonomy.</div>
        </div>`;
    if (feat.operator_name) {
        html += `<div class="mt-2 text-xs text-gray-400"><span class="text-gray-500">Operator name:</span> ${escapeHtml(feat.operator_name)}</div>`;
    }
    if (feat.confidence != null) {
        html += `<div class="mt-1 text-xs text-gray-400"><span class="text-gray-500">Confidence:</span> ${feat.confidence}/5</div>`;
    }
    if (feat.characteristics) {
        const chars = Array.isArray(feat.characteristics)
            ? feat.characteristics.join(', ')
            : String(feat.characteristics);
        html += `<div class="mt-1 text-xs text-gray-400"><span class="text-gray-500">Characteristics:</span> ${escapeHtml(chars)}</div>`;
    }
    html += '</div>';

    // 3. Result
    html += `<div>
        <div class="text-xs uppercase tracking-wide text-indigo-300/70 mb-1.5 font-medium">3. Result</div>
        <div class="flex items-center gap-3">
            <span class="text-lg font-bold text-white">${escapeHtml(featureName)}</span>
            <span class="text-xs text-gray-500">assigned to ${escapeHtml(data.game || '')}</span>
        </div>
    </div>`;

    html += '</div>';
    return html;
}

// ── Field drilldown (top of panel when a specific field is focused) ──

function renderDrilldown(fieldName, field, data) {
    const val = field.value != null && field.value !== '' ? String(field.value) : null;
    const ctx = field.context_window;
    const method = field.extraction_method;

    let html = `<div class="mb-5 bg-gradient-to-b from-indigo-500/10 to-transparent rounded-xl p-4 border border-indigo-500/20">`;
    html += `<div class="flex items-center gap-2 mb-3">
        <span class="text-xs font-bold uppercase tracking-widest text-indigo-400">Drilldown</span>
        <span class="text-base font-semibold text-white">${escapeHtml(fieldName)}</span>
        ${confBadge(field.confidence)}
    </div>`;

    // Step 1: Source — show the raw rules text with the value highlighted
    if (ctx) {
        html += `<div class="mb-4">
            <div class="text-xs uppercase tracking-wide text-indigo-300/70 mb-1.5 font-medium">1. Source text</div>
            <div class="bg-black/40 rounded-lg p-3.5 text-sm text-gray-100 font-mono leading-relaxed break-words">`;
        html += escapeHtml(ctx.before);
        html += `<mark class="bg-yellow-400/40 text-yellow-100 px-0.5 rounded font-bold">${escapeHtml(ctx.match)}</mark>`;
        html += escapeHtml(ctx.after);
        html += `</div>`;
        if (ctx.all_evidence && ctx.all_evidence.length > 0) {
            html += `<div class="mt-2 flex flex-wrap gap-1.5 items-center">
                <span class="text-xs text-gray-400">Keywords found:</span>
                ${ctx.all_evidence.map(kw => `<span class="px-1.5 py-0.5 text-[11px] rounded bg-indigo-500/20 text-indigo-300 font-medium">${escapeHtml(kw)}</span>`).join('')}
                ${ctx.evidence_count > ctx.all_evidence.length ? `<span class="text-xs text-gray-500">+${ctx.evidence_count - ctx.all_evidence.length} more</span>` : ''}
            </div>`;
        }
        html += `${data.source?.rules_url ? `<div class="mt-1.5 text-xs text-gray-500 truncate">from: ${escapeHtml(data.source.rules_url)}</div>` : ''}
        </div>`;
    } else if (field.rules_evidence) {
        html += `<div class="mb-4">
            <div class="text-xs uppercase tracking-wide text-indigo-300/70 mb-1.5 font-medium">1. Source evidence</div>
            <div class="bg-black/40 rounded-lg p-3.5 text-sm text-gray-100 font-mono leading-relaxed break-words">
                <mark class="bg-yellow-400/40 text-yellow-100 px-0.5 rounded font-bold">${escapeHtml(field.rules_evidence)}</mark>
            </div>
        </div>`;
    } else {
        html += `<div class="mb-4">
            <div class="text-xs uppercase tracking-wide text-indigo-300/70 mb-1.5 font-medium">1. Source</div>`;
        const srcLabel = field.data_source_label || field.data_source;
        if (srcLabel && val) {
            html += `<div class="bg-black/40 rounded-lg p-3 text-sm font-mono text-gray-100">
                <span class="text-gray-400">Source:</span> ${escapeHtml(srcLabel)} → <span class="text-yellow-200 font-bold">${escapeHtml(fieldName)}: ${escapeHtml(val)}</span>
            </div>`;
        } else if (srcLabel) {
            html += `<div class="bg-black/40 rounded-lg p-3 text-sm font-mono text-gray-100">
                <span class="text-gray-400">Source:</span> ${escapeHtml(srcLabel)} — <span class="text-gray-500 italic">value missing</span>
            </div>`;
        } else if (field.gt_evidence) {
            html += `<div class="bg-black/40 rounded-lg p-3 text-sm font-mono text-gray-100">
                <span class="text-gray-400">Source:</span> ${escapeHtml(field.gt_evidence.source)} → <span class="text-yellow-200 font-bold">${escapeHtml(fieldName)}: ${escapeHtml(String(field.gt_evidence.value))}</span>
            </div>`;
        } else if (field.confidence === 'gt_verified') {
            html += `<div class="text-sm text-gray-200">Ground-truth verified — confirmed by manual review.</div>`;
        } else if (field.source_type === 'platform') {
            html += `<div class="text-sm text-gray-200">From imported CSV.</div>`;
        } else if (field.source_type === 'art_characterization') {
            html += `<div class="text-sm text-gray-400 italic">No text source — see extraction method below.</div>`;
        } else if (data.source?.rules_url) {
            html += `<div class="text-sm text-gray-200">
                <span class="text-gray-400">Rules page:</span> <a href="${escapeAttr(data.source.rules_url)}" target="_blank" class="text-indigo-400 hover:underline truncate">${escapeHtml(data.source.rules_url)}</a>
            </div>
            <div class="text-xs text-gray-500 mt-1">Value not found verbatim in rules text.</div>`;
        } else {
            html += `<div class="text-sm text-gray-400 italic">No source data on disk for this field.</div>`;
        }
        html += `</div>`;
    }

    // Step 2: Classification / extraction rule
    if (method) {
        html += `<div class="mb-4">
            <div class="text-xs uppercase tracking-wide text-indigo-300/70 mb-1.5 font-medium">2. Extraction method</div>
            <div class="text-sm">
                <span class="text-white font-semibold">${escapeHtml(method.method)}</span>
                <div class="text-gray-200 mt-1">${escapeHtml(method.detail)}</div>
            </div>
        </div>`;
    }

    // GT cross-reference (if ground truth data exists for this field)
    if (field.gt_evidence && field.gt_evidence.source && val) {
        const gtVal = String(field.gt_evidence.value);
        const match = gtVal === val;
        html += `<div class="mb-4">
            <div class="text-xs uppercase tracking-wide text-indigo-300/70 mb-1.5 font-medium">Ground Truth</div>
            <div class="text-sm">
                <span class="text-gray-400">${escapeHtml(field.gt_evidence.source)}:</span>
                <span class="${match ? 'text-emerald-400' : 'text-amber-400'} font-semibold ml-1">${escapeHtml(gtVal)}</span>
                ${match ? '<span class="text-emerald-500 text-xs ml-1">✓ matches</span>' : `<span class="text-amber-500 text-xs ml-1">≠ current: ${escapeHtml(val)}</span>`}
            </div>
        </div>`;
    }

    // Theme consolidation (if theme was remapped)
    if (field.theme_consolidation) {
        html += `<div class="mb-4">
            <div class="text-xs uppercase tracking-wide text-indigo-300/70 mb-1.5 font-medium">Theme Consolidation</div>
            <div class="text-sm text-gray-200">
                <span class="text-gray-400">${escapeHtml(field.theme_consolidation.raw)}</span>
                <span class="text-gray-600 mx-1">→</span>
                <span class="text-white font-semibold">${escapeHtml(field.theme_consolidation.consolidated)}</span>
            </div>
        </div>`;
    }

    // Step 3: Result
    html += `<div>
        <div class="text-xs uppercase tracking-wide text-indigo-300/70 mb-1.5 font-medium">3. Result</div>
        <div class="flex items-center gap-2">
            <span class="text-xl font-bold text-white">${val ? escapeHtml(val) + (fieldName === 'rtp' ? '%' : '') : '<span class="text-gray-400 italic">missing</span>'}</span>
            ${confBadge(field.confidence)}
        </div>
        ${field.diagnosis ? `<div class="text-sm text-gray-200 mt-1">${escapeHtml(field.diagnosis)}</div>` : ''}
    </div>`;

    html += '</div>';
    return html;
}

// ── Field table row ──

function fieldRow(name, field, gameName, gameId, isFocused) {
    const val =
        field.value != null && field.value !== ''
            ? escapeHtml(String(field.value))
            : '<span class="text-gray-500 italic">--</span>';
    const hasIssue = field.diagnosis || field.rules_evidence;
    const rowId = `xray-field-${escapeAttr(name)}`;
    const focusCls = isFocused ? 'bg-indigo-500/10' : '';

    return `<tr id="${rowId}" class="border-b border-white/5 hover:bg-white/[0.03] transition-colors xray-field-row ${focusCls}" data-field="${escapeAttr(name)}">
        <td class="py-2 px-3 text-xs font-medium text-gray-400 whitespace-nowrap">${escapeHtml(name)}</td>
        <td class="py-2 px-3 text-sm text-white">${val}</td>
        <td class="py-2 px-3">${confBadge(field.confidence)}</td>
        <td class="py-2 px-3 whitespace-nowrap">
            <button class="xray-flag-btn text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors mr-1" data-field="${escapeAttr(name)}" data-game="${escapeAttr(gameName)}" data-game-id="${escapeAttr(gameId || '')}" data-current="${escapeAttr(field.value != null ? String(field.value) : '')}">Flag</button>
            ${hasIssue ? `<button class="xray-detail-btn text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-gray-400 hover:bg-white/20 transition-colors" data-field="${escapeAttr(name)}">detail</button>` : ''}
        </td>
    </tr>
    <tr class="xray-detail-row hidden" data-detail-for="${escapeAttr(name)}">
        <td colspan="4" class="px-3 pb-3">
            <div class="bg-white/[0.04] rounded-lg p-3 text-xs space-y-1.5">
                <div class="text-gray-500">Source: ${escapeHtml(field.data_source_label || SOURCE_TYPE_LABELS[field.source_type] || field.source_type || 'unknown')}</div>
                ${field.extraction_method ? `<div class="text-gray-400"><span class="text-gray-500">Method:</span> ${escapeHtml(field.extraction_method.method)}</div>` : ''}
                ${field.rules_evidence ? `<div class="text-gray-400"><span class="text-gray-500">Evidence:</span> <span class="bg-yellow-500/20 text-yellow-200 px-0.5 rounded">${escapeHtml(field.rules_evidence)}</span></div>` : ''}
                ${field.diagnosis ? `<div class="text-gray-400 italic">${escapeHtml(field.diagnosis)}</div>` : ''}
            </div>
        </td>
    </tr>
    <tr class="xray-flag-form hidden" data-flag-for="${escapeAttr(name)}">
        <td colspan="4" class="px-3 pb-3">
            <div class="bg-white/[0.06] rounded-lg p-3 text-xs space-y-2">
                <div class="flex items-center gap-3 text-gray-400">
                    <label class="flex items-center gap-1"><input type="radio" name="flag-type-${escapeAttr(name)}" value="missing" class="accent-red-500" checked> Missing</label>
                    <label class="flex items-center gap-1"><input type="radio" name="flag-type-${escapeAttr(name)}" value="wrong"> Wrong</label>
                    <label class="flex items-center gap-1"><input type="radio" name="flag-type-${escapeAttr(name)}" value="other"> Other</label>
                </div>
                <input type="text" placeholder="Correct value" class="xray-flag-value w-full px-2 py-1.5 rounded bg-black/30 border border-white/10 text-white text-xs placeholder-gray-600 outline-none focus:border-indigo-500">
                <input type="text" placeholder="Notes (optional)" class="xray-flag-notes w-full px-2 py-1.5 rounded bg-black/30 border border-white/10 text-white text-xs placeholder-gray-600 outline-none focus:border-indigo-500">
                <div class="flex gap-2 justify-end">
                    <button class="xray-flag-cancel px-2 py-1 rounded text-gray-500 hover:text-gray-300 transition-colors">Cancel</button>
                    <button class="xray-flag-submit px-3 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 font-medium transition-colors" data-field="${escapeAttr(name)}">Submit Flag</button>
                </div>
            </div>
        </td>
    </tr>`;
}

const FIELD_ALIASES = {
    market_share: 'market_share_pct',
    market_share_percent: 'market_share_pct',
};

// ── Compact top-game card for dimension clicks ──

function renderTopGameCard(gameName, provider, category, year, overall, fields) {
    const theoWin = fields.theo_win?.value;
    const rtp = fields.rtp?.value;
    const vol = fields.volatility?.value;
    const theme = fields.theme_primary?.value;

    let html = `<div class="mb-4 border-t border-white/10 pt-3">
        <div class="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Top game by Theo Win</div>
        <div class="bg-white/[0.03] rounded-lg p-3 cursor-pointer hover:bg-white/[0.06] transition-colors xray-top-game-link" data-game="${escapeAttr(gameName)}">
            <div class="text-sm font-bold text-white">${escapeHtml(gameName)}</div>
            <div class="flex items-center gap-2 text-xs text-gray-400 flex-wrap mt-1">
                <span>${escapeHtml(provider)}</span>
                <span class="text-gray-600">&middot;</span>
                <span>${escapeHtml(category)}</span>
                ${year ? `<span class="text-gray-600">&middot;</span><span>${year}</span>` : ''}
                <span class="text-gray-600">&middot;</span>
                ${confBadge(overall)}
            </div>`;

    const stats = [];
    if (theoWin != null)
        stats.push(
            `<span class="text-gray-500">Theo:</span> <span class="text-white">${Number(theoWin).toFixed(2)}</span>`
        );
    if (rtp != null) stats.push(`<span class="text-gray-500">RTP:</span> <span class="text-white">${rtp}%</span>`);
    if (vol)
        stats.push(
            `<span class="text-gray-500">Vol:</span> <span class="text-white">${escapeHtml(String(vol))}</span>`
        );
    if (theme)
        stats.push(
            `<span class="text-gray-500">Theme:</span> <span class="text-white">${escapeHtml(String(theme))}</span>`
        );
    if (stats.length) {
        html += `<div class="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs">${stats.join('')}</div>`;
    }

    html += `<div class="text-[10px] text-indigo-400 mt-2">Click to see full provenance →</div>`;
    html += `</div></div>`;
    return html;
}

// ── Key fields summary for game-level clicks (no focusField) ──

const KEY_FIELDS = ['theme_primary', 'provider', 'rtp', 'volatility', 'theo_win', 'release_year'];
const KEY_FIELD_LABELS = {
    theme_primary: 'Theme',
    provider: 'Provider',
    rtp: 'RTP',
    volatility: 'Volatility',
    theo_win: 'Theo Win',
    release_year: 'Release Year (OGPD)',
};

function renderKeyFieldsSummary(fields, data) {
    let html = `<div class="mb-5 bg-gradient-to-b from-indigo-500/10 to-transparent rounded-xl p-4 border border-indigo-500/20">`;
    html += `<div class="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-3">Data Provenance</div>`;

    for (const key of KEY_FIELDS) {
        const field = fields[key];
        if (!field || field.value == null || field.value === '--' || field.value === '') continue;
        const label = KEY_FIELD_LABELS[key] || key;
        const src = SOURCE_TYPE_LABELS[field.source_type] || field.data_source_label || field.source_type || '';
        html += `<div class="flex items-start gap-2 mb-2 last:mb-0">
            <div class="min-w-[80px] text-[10px] text-gray-500 uppercase pt-0.5">${escapeHtml(label)}</div>
            <div class="flex-1">
                <div class="text-sm text-white font-medium">${escapeHtml(String(field.value))}</div>
                <div class="flex items-center gap-2 mt-0.5">
                    ${confBadge(field.confidence)}
                    ${src ? `<span class="text-[10px] text-gray-500">${escapeHtml(src)}</span>` : ''}
                </div>
            </div>
        </div>`;
    }

    // Art fields (if any)
    const artKeys = Object.keys(fields).filter(
        k => k.startsWith('art_') && fields[k].value && fields[k].value !== '--'
    );
    if (artKeys.length > 0) {
        html += `<div class="border-t border-white/10 mt-3 pt-3">
            <div class="text-[10px] text-gray-500 uppercase mb-2">Art Classification</div>`;
        for (const key of artKeys) {
            const field = fields[key];
            const label = key.replace('art_', '').replace(/_/g, ' ');
            html += `<div class="flex items-start gap-2 mb-1.5">
                <div class="min-w-[80px] text-[10px] text-gray-500 capitalize pt-0.5">${escapeHtml(label)}</div>
                <div class="text-sm text-white">${escapeHtml(String(field.value))} ${confBadge(field.confidence)}</div>
            </div>`;
        }
        html += '</div>';
    }

    html += '</div>';
    return html;
}

// ── Dimension provenance (replaces old ranking-only view) ──

const DIMENSION_FIELD_MAP = {
    provider: 'provider',
    theme: 'theme_primary',
    feature: 'features',
    volatility: 'volatility',
    rtp: 'rtp',
    art_theme: 'art_theme',
    art_mood: 'art_mood',
    art_characters: 'art_characters',
    art_elements: 'art_elements',
    art_narrative: 'art_narrative',
};

const DIMENSION_SOURCE_INFO = {
    provider: {
        title: 'Provider / Studio',
        how: 'Provider names come from the performance data CSV, then normalized via PROVIDER_NORMALIZATION_MAP (e.g., "NYX" → "Light & Wonder").',
    },
    theme: {
        title: 'Theme Classification',
        how: 'Themes are classified by matching keywords in game rules HTML text (setting, symbols, characters). Ground-truth games are verified by manual review.',
    },
    feature: {
        title: 'Feature / Mechanic',
        how: 'Features are identified from game rules HTML text via keyword matching against the feature taxonomy. Each feature has a confidence score and optional rules text evidence.',
    },
    volatility: {
        title: 'Volatility',
        how: 'Volatility is extracted from rules HTML (matching "volatility"/"variance" + level keyword), SlotCatalog, or ground truth.',
    },
    rtp: {
        title: 'RTP',
        how: 'RTP is pattern-matched from rules HTML ("return to player" + percentage), or sourced from SlotCatalog / ground truth.',
    },
    art_theme: {
        title: 'Art Theme',
        how: 'Art themes are classified via the art characterization pipeline — derived from game visual analysis and rules text.',
    },
    art_mood: {
        title: 'Art Mood',
        how: 'Art mood is classified via the art characterization pipeline — derived from game visual analysis and rules text.',
    },
    art_characters: {
        title: 'Art Characters',
        how: 'Character types are classified via the art characterization pipeline.',
    },
    art_elements: {
        title: 'Art Elements',
        how: 'Visual elements are classified via the art characterization pipeline.',
    },
    art_narrative: {
        title: 'Art Narrative',
        how: 'Narrative style is classified via the art characterization pipeline.',
    },
    franchise: {
        title: 'Franchise / Brand',
        how: 'Franchise associations come from franchise_mapping.json — manually curated game-to-franchise mappings.',
    },
};

function renderDimensionProvenance(data, gameName, provider, category, year, overall, fields) {
    const ranking = data.ranking;
    const dim = ranking.dimension || '';
    const val = ranking.value || '';
    const trendYear = ranking.trendYear;
    const dimInfo = DIMENSION_SOURCE_INFO[dim] || { title: dim, how: '' };
    const fieldKey = DIMENSION_FIELD_MAP[dim];
    const field = fieldKey ? fields[fieldKey] : null;
    const features = data.features || [];

    let html = '';

    // Header
    html += `<div class="mb-4">
        <div class="text-xs uppercase tracking-widest text-indigo-400 mb-1">${escapeHtml(dimInfo.title)}</div>
        <div class="text-lg font-bold text-white">${escapeHtml(val)}${trendYear ? ` <span class="text-indigo-300 text-base font-normal">(${escapeHtml(String(trendYear))})</span>` : ''}</div>
        <div class="text-xs text-gray-400 mt-1">${ranking.game_count} games${trendYear ? ` in ${escapeHtml(String(trendYear))}` : ''} · Rank #${ranking.tableRank || ranking.rank} of ${ranking.total_dimension_entries}</div>
    </div>`;

    // How this dimension is determined
    html += `<div class="mb-5 bg-gradient-to-b from-indigo-500/10 to-transparent rounded-xl p-4 border border-indigo-500/20">`;
    html += `<div class="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-2">How is this determined?</div>`;
    html += `<div class="text-sm text-gray-200 leading-relaxed">${escapeHtml(dimInfo.how)}</div>`;
    html += '</div>';

    // Show provenance from the top game as concrete evidence
    html += `<div class="mb-4">
        <div class="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Evidence from top game</div>
        <div class="text-sm font-bold text-white">${escapeHtml(gameName)}</div>
        <div class="flex items-center gap-2 text-xs text-gray-400 flex-wrap mt-0.5">
            <span>${escapeHtml(provider)}</span>
            <span class="text-gray-600">&middot;</span>
            ${confBadge(overall)}
        </div>
    </div>`;

    // Feature-specific evidence
    if (dim === 'feature') {
        const feat = features.find(f => f.name === val);
        if (feat) {
            html += `<div class="mb-4 bg-gradient-to-b from-emerald-500/10 to-transparent rounded-xl p-4 border border-emerald-500/20">`;
            html += `<div class="text-xs uppercase tracking-wide text-emerald-300/70 mb-1.5 font-medium">1. Source text</div>`;
            if (feat.rules_evidence) {
                html += `<div class="bg-black/40 rounded-lg p-3 text-sm text-gray-100 font-mono leading-relaxed break-words">
                    <mark class="bg-yellow-400/40 text-yellow-100 px-0.5 rounded font-bold">${escapeHtml(feat.rules_evidence)}</mark>
                </div>`;
            } else if (feat.context) {
                html += `<div class="bg-black/40 rounded-lg p-3 text-sm text-gray-100 font-mono leading-relaxed break-words">${escapeHtml(feat.context)}</div>`;
            } else {
                html += `<div class="text-sm text-gray-400 italic">No verbatim evidence captured for this feature.</div>`;
            }
            if (feat.confidence != null) {
                html += `<div class="mt-2 text-xs text-gray-400"><span class="text-gray-500">Confidence:</span> ${feat.confidence}/5</div>`;
            }
            if (feat.operator_name) {
                html += `<div class="mt-1 text-xs text-gray-400"><span class="text-gray-500">Operator name:</span> ${escapeHtml(feat.operator_name)}</div>`;
            }
            html += '</div>';
        }
    } else if (field) {
        html += renderDrilldown(fieldKey, field, data);
    }

    // Stats section — game list + breakdowns from client-side data
    const allGames = window.gameData?.allGames || [];
    if (allGames.length > 0) {
        const dimGames = filterByDimension(allGames, dim, val);
        if (dimGames.length > 0) {
            html += `<div class="border-t border-white/10 pt-3 mt-3">`;
            html += renderDimensionStats(dimGames, dim, val, null);
            html += `</div>`;
        }
    }

    return html;
}

// ── Main render ──

export function renderXRayPanel(data, focusField) {
    const container = document.getElementById('xray-panel-content');
    if (!container) return;

    // Resolve aliases so client field names match server field names
    if (focusField) focusField = FIELD_ALIASES[focusField] || focusField;

    const gameName = data.game || '';
    const gameId = data.id || '';
    const provider = data.provider || '';
    const category = data.game_category || 'Slot';
    const releaseYear = F.releaseYear(data) || null;
    const year = releaseYear || '';
    const overall = data.overall_confidence;
    const rulesUrl = data.source?.rules_url;
    const extractionDate = data.extraction_date;
    const notes = data.extraction_notes;
    const inconsistencies = data.inconsistencies || [];
    const fields = data.fields || {};

    let html = '';
    const isDimensionClick = data.ranking && !focusField;

    // ── Dimension click: show provenance for how this dimension value was determined ──
    if (isDimensionClick) {
        html += renderDimensionProvenance(data, gameName, provider, category, year, overall, fields);
        container.innerHTML = html;
        bindPanelEvents(container, data);
        return;
    }

    {
        html += `<div class="mb-4">
            <div class="text-lg font-bold text-white mb-1">${escapeHtml(gameName)}</div>
            <div class="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
                <span>${escapeHtml(provider)}</span>
                <span class="text-gray-600">&middot;</span>
                <span>${escapeHtml(category)}</span>
                ${releaseYear ? `<span class="text-gray-600">&middot;</span><span>${escapeHtml(String(releaseYear))}</span>` : ''}
                <span class="text-gray-600">&middot;</span>
                ${confBadge(overall)}
            </div>
            ${rulesUrl ? `<div class="mt-2 text-xs"><a href="${escapeAttr(rulesUrl)}" target="_blank" rel="noopener" class="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 break-all">${escapeHtml(rulesUrl.replace(/^https?:\/\//, '').slice(0, 60))}${rulesUrl.length > 70 ? '...' : ''}</a></div>` : ''}
            ${extractionDate ? `<div class="mt-1 text-xs text-gray-500">Extracted ${escapeHtml(extractionDate)}</div>` : ''}
            ${notes ? `<div class="text-xs text-gray-500 italic">${escapeHtml(notes)}</div>` : ''}
            ${data.open_tickets > 0 ? `<div class="mt-1 text-xs text-amber-400">${data.open_tickets} open correction ticket(s)</div>` : ''}
        </div>`;
    }

    // ── Feature-specific drilldown (when user clicked a feature pill on a game row) ──
    if (focusField === 'features' && data.featureName) {
        html += renderFeatureDrilldown(data.featureName, data.features || [], data);
    } else if (focusField && fields[focusField]) {
        html += renderDrilldown(focusField, fields[focusField], data);
    }

    // ── Focused drilldown or key fields summary ──
    if (!focusField) {
        html += renderKeyFieldsSummary(fields, data);
    }

    // Inconsistencies (collapsed)
    if (inconsistencies.length > 0) {
        html += `<div class="mb-4">
            <button class="xray-toggle-section flex items-center gap-2 text-xs text-amber-400 font-medium mb-2 cursor-pointer hover:text-amber-300" data-section="inconsistencies">
                <span>&#9888; ${inconsistencies.length} issue${inconsistencies.length > 1 ? 's' : ''} found</span>
                <span class="xray-chevron text-[10px] transition-transform">&#9660;</span>
            </button>
            <div class="xray-section hidden space-y-1.5" data-section-content="inconsistencies">
                ${inconsistencies
                    .map(
                        inc => `<div class="rounded-lg p-2.5 text-xs ${SEVERITY_STYLES[inc.severity] || ''}">
                    <div class="font-medium text-white">${escapeHtml(inc.field)}: ${escapeHtml(inc.issue)}</div>
                    ${inc.rules_evidence ? `<div class="mt-1 text-gray-400 bg-yellow-500/10 rounded px-1.5 py-0.5 inline-block">${escapeHtml(inc.rules_evidence)}</div>` : ''}
                    ${inc.diagnosis ? `<div class="mt-1 text-gray-500 italic">${escapeHtml(inc.diagnosis)}</div>` : ''}
                </div>`
                    )
                    .join('')}
            </div>
        </div>`;
    }

    // All Fields (collapsed by default)
    const fieldNames = Object.keys(fields);
    if (fieldNames.length > 0) {
        html += `<div class="mb-4">
            <button class="xray-toggle-section flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-indigo-400 mb-2 cursor-pointer hover:text-indigo-300" data-section="all-fields">
                <span>All Fields (${fieldNames.length})</span>
                <span class="xray-chevron text-[10px] transition-transform">&#9660;</span>
            </button>
            <div class="xray-section hidden bg-white/[0.02] rounded-lg overflow-hidden" data-section-content="all-fields">
                <table class="w-full">
                    <thead>
                        <tr class="border-b border-white/10 text-[10px] text-gray-500 uppercase">
                            <th class="py-1.5 px-3 text-left">Field</th>
                            <th class="py-1.5 px-3 text-left">Value</th>
                            <th class="py-1.5 px-3 text-left">Confidence</th>
                            <th class="py-1.5 px-3 text-left">Actions</th>
                        </tr>
                    </thead>
                    <tbody>${fieldNames.map(f => fieldRow(f, fields[f], gameName, gameId, f === focusField)).join('')}</tbody>
                </table>
            </div>
        </div>`;
    }

    // Features
    const features = data.features || [];
    if (features.length > 0) {
        const featureNames = features.map(f => escapeHtml(f.name)).join(' &middot; ');
        html += `<div class="mb-4">
            <button class="xray-toggle-section flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-indigo-400 mb-2 cursor-pointer hover:text-indigo-300" data-section="features">
                <span>Features (${features.length})</span>
                <span class="xray-chevron text-[10px] transition-transform">&#9660;</span>
            </button>
            <div class="text-xs text-gray-400">${featureNames}</div>
            <div class="xray-section hidden mt-2 space-y-1.5" data-section-content="features">
                ${features
                    .map(
                        f => `<div class="bg-white/[0.04] rounded-lg p-2.5 text-xs">
                    <div class="flex items-center justify-between">
                        <span class="font-medium text-white">${escapeHtml(f.name)}</span>
                        ${f.confidence != null ? `<span class="text-gray-500">${f.confidence}/5</span>` : ''}
                    </div>
                    ${f.operator_name ? `<div class="text-gray-500 mt-0.5">Operator: ${escapeHtml(f.operator_name)}</div>` : ''}
                    ${f.context ? `<div class="text-gray-500 mt-0.5">Context: ${escapeHtml(f.context)}</div>` : ''}
                    ${f.rules_evidence ? `<div class="mt-1 bg-black/20 rounded p-1.5 text-gray-400 font-mono text-[11px]">${escapeHtml(f.rules_evidence.slice(0, 200))}</div>` : ''}
                </div>`
                    )
                    .join('')}
            </div>
        </div>`;
    }

    // Source section
    if (data.source?.rules_available) {
        html += `<div class="mb-4">
            <div class="text-[10px] font-bold uppercase tracking-widest text-indigo-400 mb-2">Source</div>
            <div class="flex gap-2">
                <button class="xray-load-rules-text px-3 py-1.5 rounded-lg bg-white/10 text-xs text-gray-400 hover:bg-white/20 hover:text-white transition-colors">View rules text</button>
                <button class="xray-load-rules-html px-3 py-1.5 rounded-lg bg-white/10 text-xs text-gray-400 hover:bg-white/20 hover:text-white transition-colors">View original HTML</button>
            </div>
            <div class="xray-rules-text-container hidden mt-2"></div>
        </div>`;
    }

    container.innerHTML = html;

    // Auto-scroll to focused field in table (drilldown is already at top)
    if (focusField) {
        const row = container.querySelector(`#xray-field-${focusField}`);
        if (row) {
            const detailRow = container.querySelector(`[data-detail-for="${focusField}"]`);
            if (detailRow) detailRow.classList.remove('hidden');
        }
    }

    bindPanelEvents(container, data);
}

function bindPanelEvents(container, data) {
    container.querySelectorAll('.xray-top-game-link').forEach(link => {
        link.addEventListener('click', () => {
            const name = link.dataset.game;
            if (name && window.openXRayPanel) window.openXRayPanel(name);
        });
    });

    const showMoreBtn = container.querySelector('.xray-show-more-games');
    if (showMoreBtn) {
        showMoreBtn.addEventListener('click', () => {
            const more = container.querySelector('.xray-more-games');
            if (more) more.classList.remove('hidden');
            showMoreBtn.remove();
        });
    }

    container.querySelectorAll('.xray-toggle-section').forEach(btn => {
        btn.addEventListener('click', () => {
            const section = btn.dataset.section;
            const content = container.querySelector(`[data-section-content="${section}"]`);
            const chevron = btn.querySelector('.xray-chevron');
            if (content) content.classList.toggle('hidden');
            if (chevron) chevron.style.transform = content?.classList.contains('hidden') ? '' : 'rotate(180deg)';
        });
    });

    container.querySelectorAll('.xray-detail-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const row = container.querySelector(`[data-detail-for="${btn.dataset.field}"]`);
            if (row) row.classList.toggle('hidden');
        });
    });

    container.querySelectorAll('.xray-flag-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const form = container.querySelector(`[data-flag-for="${btn.dataset.field}"]`);
            if (form) form.classList.toggle('hidden');
        });
    });

    container.querySelectorAll('.xray-flag-cancel').forEach(btn => {
        btn.addEventListener('click', () => {
            const form = btn.closest('.xray-flag-form');
            if (form) form.classList.add('hidden');
        });
    });

    container.querySelectorAll('.xray-flag-submit').forEach(btn => {
        btn.addEventListener('click', async () => {
            const field = btn.dataset.field;
            const form = container.querySelector(`[data-flag-for="${field}"]`);
            if (!form) return;

            const flagType = form.querySelector(`input[name="flag-type-${field}"]:checked`)?.value || 'other';
            const proposedValue = form.querySelector('.xray-flag-value')?.value || '';
            const notes = form.querySelector('.xray-flag-notes')?.value || '';
            const flagBtn = container.querySelector(`.xray-flag-btn[data-field="${field}"]`);
            const currentValue = flagBtn?.dataset.current || '';
            const gameName = flagBtn?.dataset.game || data.game;
            const gameId = flagBtn?.dataset.gameId || data.id;

            try {
                await apiPost('/api/tickets', {
                    gameName,
                    issueType: 'data-correction',
                    description: `${field} flagged as ${flagType}. Current: ${currentValue || 'MISSING'}, Proposed: ${proposedValue || 'N/A'}${notes ? '. ' + notes : ''}`,
                    gameId,
                    fieldPath: field,
                    currentValue: currentValue || null,
                    proposedValue: proposedValue || null,
                    sourceEvidence: data.fields?.[field]?.rules_evidence || '',
                    sourceUrl: data.source?.rules_url || '',
                    diagnosis: data.fields?.[field]?.diagnosis || '',
                });
                form.classList.add('hidden');
                if (flagBtn) {
                    flagBtn.textContent = 'Flagged';
                    flagBtn.disabled = true;
                    flagBtn.classList.remove('bg-red-500/10', 'text-red-400', 'hover:bg-red-500/20');
                    flagBtn.classList.add('bg-emerald-500/20', 'text-emerald-400');
                }
            } catch (err) {
                console.error('Failed to submit flag:', err);
            }
        });
    });

    const rulesTextBtn = container.querySelector('.xray-load-rules-text');
    if (rulesTextBtn) {
        rulesTextBtn.addEventListener('click', async () => {
            const target = container.querySelector('.xray-rules-text-container');
            if (!target || target.dataset.loaded) return;
            target.classList.remove('hidden');
            target.innerHTML = '<div class="text-xs text-gray-500">Loading...</div>';
            try {
                const resp = await fetch(`/api/data/provenance/${encodeURIComponent(data.game)}/rules-text`, {
                    credentials: 'include',
                });
                const json = await resp.json();
                target.innerHTML = `<pre class="bg-black/30 rounded-lg p-3 text-[11px] text-gray-400 font-mono whitespace-pre-wrap max-h-60 overflow-y-auto">${escapeHtml(json.text || 'No text available')}</pre>`;
                target.dataset.loaded = '1';
            } catch {
                target.innerHTML = '<div class="text-xs text-red-400">Failed to load rules text</div>';
            }
        });
    }

    const rulesHtmlBtn = container.querySelector('.xray-load-rules-html');
    if (rulesHtmlBtn) {
        rulesHtmlBtn.addEventListener('click', () => {
            const url = `/api/data/provenance/${encodeURIComponent(data.game)}/rules-html`;
            window.open(url, '_blank', 'width=800,height=600');
        });
    }
}

// ── Shared dimension filter ─────────────────────────────

function filterByDimension(games, dimension, value) {
    const vl = value.toLowerCase();
    return games.filter(g => {
        switch (dimension) {
            case 'theme':
                return (F.themeConsolidated(g) || '').toLowerCase() === vl;
            case 'provider':
                return (F.provider(g) || '').toLowerCase() === vl;
            case 'feature': {
                const feats = F.features(g);
                if (Array.isArray(feats))
                    return feats.some(f => (typeof f === 'string' ? f : f?.name || '').toLowerCase() === vl);
                return false;
            }
            case 'volatility':
                return (F.volatility(g) || '').toLowerCase() === vl;
            case 'rtp': {
                const rtp = F.rtp(g);
                if (!rtp || rtp <= 0) return false;
                const b = value.trim();
                if (b.startsWith('>')) return rtp > parseFloat(b.replace(/[>%\s]/g, ''));
                if (b.startsWith('<')) return rtp < parseFloat(b.replace(/[<%\s]/g, ''));
                const range = b
                    .replace(/%/g, '')
                    .split('-')
                    .map(s => parseFloat(s.trim()));
                if (range.length === 2 && !isNaN(range[0]) && !isNaN(range[1]))
                    return rtp >= range[0] && rtp <= range[1];
                return Math.abs(rtp - parseFloat(b)) < 0.01;
            }
            case 'art_theme':
                return (F.artTheme(g) || '').toLowerCase() === vl;
            case 'art_mood':
                return (F.artMood(g) || '').toLowerCase() === vl;
            case 'art_characters': {
                const chars = F.artCharacters(g);
                if (Array.isArray(chars)) return chars.some(c => c.toLowerCase() === vl);
                return (chars || '').toLowerCase() === vl;
            }
            case 'art_elements': {
                const elems = F.artElements(g);
                if (Array.isArray(elems)) return elems.some(el => el.toLowerCase() === vl);
                return (elems || '').toLowerCase() === vl;
            }
            case 'art_narrative':
                return (F.artNarrative(g) || '').toLowerCase() === vl;
            default:
                return false;
        }
    });
}

function filterByYear(games, year) {
    const ys = String(year);
    return games.filter(g => {
        const ry = F.releaseYear(g);
        return ry === year || String(ry) === ys;
    });
}

// ── Dimension stats (shared by both trend and non-trend paths) ──

function renderDimensionStats(games, dimension, value, year) {
    const total = games.length;
    if (!total)
        return `<div class="text-sm text-gray-400 italic py-4">No games found for ${escapeHtml(value)}${year ? ` in ${year}` : ''}.</div>`;

    let theoSum = 0;
    let theoCount = 0;
    const provTally = {};
    const themeTally = {};
    const featTally = {};

    for (const g of games) {
        const tw = F.theoWin(g);
        if (tw > 0) {
            theoSum += tw;
            theoCount++;
        }

        const prov = F.provider(g);
        if (prov && prov !== 'Unknown') provTally[prov] = (provTally[prov] || 0) + 1;

        const theme = F.themeConsolidated(g);
        if (theme && theme !== 'Unknown') themeTally[theme] = (themeTally[theme] || 0) + 1;

        const feats = Array.isArray(g.features) ? g.features : [];
        for (const f of feats) {
            const fn = typeof f === 'string' ? f : f?.name;
            if (fn) featTally[fn] = (featTally[fn] || 0) + 1;
        }
    }

    const avgTheo = theoCount > 0 ? (theoSum / theoCount).toFixed(2) : '—';

    const sorted = [...games].sort((a, b) => (F.theoWin(b) || 0) - (F.theoWin(a) || 0));

    let html = '';

    // Stats grid
    html += `<div class="grid grid-cols-2 gap-3 mb-4">
        <div class="bg-white/[0.04] rounded-lg p-2.5 text-center">
            <div class="text-lg font-bold text-white">${total}</div>
            <div class="text-[10px] text-gray-500">Games</div>
        </div>
        <div class="bg-white/[0.04] rounded-lg p-2.5 text-center">
            <div class="text-lg font-bold text-white">${avgTheo}</div>
            <div class="text-[10px] text-gray-500">Avg Theo Win</div>
        </div>
    </div>`;

    // Top games list
    const initialShow = 5;
    const gameRows = (list, cls) =>
        list
            .map(
                (
                    g,
                    i
                ) => `<div class="flex items-center justify-between py-1.5 ${i > 0 ? 'border-t border-white/5' : ''} ${cls}">
        <div class="flex-1 min-w-0">
            <div class="text-sm text-white font-medium truncate cursor-pointer hover:text-indigo-300 xray-top-game-link" data-game="${escapeAttr(g.name)}">${escapeHtml(g.name)}</div>
            <div class="text-[10px] text-gray-500">${escapeHtml(F.provider(g))}</div>
        </div>
        <div class="text-sm text-gray-300 font-mono ml-2">${(F.theoWin(g) || 0).toFixed(2)}</div>
    </div>`
            )
            .join('');

    html += `<div class="mb-4">
        <div class="text-[10px] font-bold uppercase tracking-widest text-indigo-400 mb-2">Top Games by Theo Win</div>
        <div class="bg-white/[0.02] rounded-lg p-2.5">
            ${gameRows(sorted.slice(0, initialShow), '')}
            ${
                sorted.length > initialShow
                    ? `<div class="xray-more-games hidden">${gameRows(sorted.slice(initialShow), '')}</div>
            <button class="xray-show-more-games mt-2 text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer">Show ${sorted.length - initialShow} more →</button>`
                    : ''
            }
        </div>
    </div>`;

    // Breakdowns — skip the dimension we're already looking at
    const renderTally = (title, entries) => {
        if (!entries.length) return '';
        let s = `<div class="mb-3">
            <div class="text-[10px] font-bold uppercase tracking-widest text-indigo-400 mb-1.5">${title}</div>
            <div class="space-y-0.5">`;
        for (const [name, count] of entries) {
            const pct = ((count / total) * 100).toFixed(0);
            s += `<div class="flex items-center justify-between text-xs">
                <span class="text-white">${escapeHtml(name)}</span>
                <span class="text-gray-400">${count} <span class="text-gray-600">(${pct}%)</span></span>
            </div>`;
        }
        s += '</div></div>';
        return s;
    };

    const topThemes = Object.entries(themeTally)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    const topProviders = Object.entries(provTally)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    const topFeatures = Object.entries(featTally)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    if (dimension !== 'theme') html += renderTally('Top Themes', topThemes);
    if (dimension !== 'feature') html += renderTally('Top Features', topFeatures);
    if (dimension !== 'provider') html += renderTally('Top Providers', topProviders);

    return html;
}

// ── Dimension + Year summary (trend chart click) ────────

export function renderDimensionYearSummary(container, dimension, value, year, allGames) {
    const dimInfo = DIMENSION_SOURCE_INFO[dimension] || { title: dimension, how: '' };
    const dimGames = filterByDimension(allGames, dimension, value);
    const yearDimGames = filterByYear(dimGames, year);

    let html = `<div class="space-y-3">
        <div class="mb-3">
            <div class="text-xs uppercase tracking-widest text-indigo-400 mb-1">${escapeHtml(dimInfo.title)}</div>
            <div class="text-lg font-bold text-white">${escapeHtml(value)} <span class="text-indigo-300 text-base font-normal">(${escapeHtml(String(year))})</span></div>
            <div class="text-xs text-gray-400 mt-0.5">${yearDimGames.length} games in ${escapeHtml(String(year))} · ${dimGames.length} total across all years</div>
        </div>`;

    html += renderDimensionStats(yearDimGames, dimension, value, year);

    // Data source
    html += `<div class="border-t border-white/10 pt-3 mt-2">
        <div class="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Data Source</div>
        <div class="text-xs text-gray-400">${escapeHtml(dimInfo.how)}</div>
    </div>`;

    html += '</div>';
    container.innerHTML = html;
    bindStatsEvents(container);
}

function bindStatsEvents(container) {
    container.querySelectorAll('.xray-top-game-link').forEach(link => {
        link.addEventListener('click', () => {
            const name = link.dataset.game;
            if (name && window.openXRayPanel) window.openXRayPanel(name);
        });
    });
    const showMoreBtn = container.querySelector('.xray-show-more-games');
    if (showMoreBtn) {
        showMoreBtn.addEventListener('click', () => {
            const more = container.querySelector('.xray-more-games');
            if (more) more.classList.remove('hidden');
            showMoreBtn.remove();
        });
    }
}

// ── Year summary (trend chart click) ────────────────────

export function renderYearSummary(container, year, allGames) {
    const yearGames = allGames.filter(g => {
        const ry = F.releaseYear(g);
        return ry === year || String(ry) === String(year);
    });

    const yearThemeTally = {};
    const yearProvTally = {};
    const yearFeatTally = {};
    let theoSum = 0;
    let theoCount = 0;
    for (const g of yearGames) {
        const theme = F.themeConsolidated(g);
        if (theme && theme !== 'Unknown') yearThemeTally[theme] = (yearThemeTally[theme] || 0) + 1;
        const prov = F.provider(g);
        if (prov && prov !== 'Unknown') yearProvTally[prov] = (yearProvTally[prov] || 0) + 1;
        const feats = Array.isArray(g.features) ? g.features : [];
        for (const f of feats) {
            if (f) yearFeatTally[f] = (yearFeatTally[f] || 0) + 1;
        }
        const tw = F.theoWin(g);
        if (tw > 0) {
            theoSum += tw;
            theoCount++;
        }
    }

    const avgTheo = theoCount > 0 ? (theoSum / theoCount).toFixed(2) : '—';
    const topThemes = Object.entries(yearThemeTally)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    const topProviders = Object.entries(yearProvTally)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    const topFeatures = Object.entries(yearFeatTally)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    const topGame =
        yearGames.length > 0
            ? yearGames.reduce((best, g) => ((F.theoWin(g) || 0) > (F.theoWin(best) || 0) ? g : best), yearGames[0])
            : null;

    let html = `<div class="space-y-4">
        <div class="mb-4">
            <div class="text-lg font-bold text-white mb-1">Year ${escapeHtml(String(year))}</div>
            <div class="text-xs text-gray-400">${yearGames.length} game${yearGames.length !== 1 ? 's' : ''} launched</div>
        </div>`;

    html += `<div class="grid grid-cols-2 gap-3 mb-1">
        <div class="bg-white/[0.04] rounded-lg p-2.5 text-center">
            <div class="text-lg font-bold text-white">${yearGames.length}</div>
            <div class="text-[10px] text-gray-500">Games</div>
        </div>
        <div class="bg-white/[0.04] rounded-lg p-2.5 text-center">
            <div class="text-lg font-bold text-white">${avgTheo}</div>
            <div class="text-[10px] text-gray-500">Avg Theo Win</div>
        </div>
    </div>`;

    const renderSection = (title, entries) => {
        if (!entries.length) return '';
        let s = `<div>
            <div class="text-[10px] font-bold uppercase tracking-widest text-indigo-400 mb-2">${title}</div>
            <div class="space-y-1">`;
        for (const [name, count] of entries) {
            const pct = yearGames.length > 0 ? ((count / yearGames.length) * 100).toFixed(0) : 0;
            s += `<div class="flex items-center justify-between text-sm">
                <span class="text-white">${escapeHtml(name)}</span>
                <span class="text-gray-400">${count} <span class="text-gray-600">(${pct}%)</span></span>
            </div>`;
        }
        s += `</div></div>`;
        return s;
    };

    html += renderSection('Top Themes', topThemes);
    html += renderSection('Top Features', topFeatures);
    html += renderSection('Top Providers', topProviders);

    if (topGame) {
        html += `<div>
            <div class="text-[10px] font-bold uppercase tracking-widest text-indigo-400 mb-2">Top Game</div>
            <div class="bg-white/[0.03] rounded-lg p-3 cursor-pointer hover:bg-white/[0.06] transition-colors xray-top-game-link" data-game="${escapeAttr(topGame.name)}">
                <div class="text-sm font-bold text-white">${escapeHtml(topGame.name)}</div>
                <div class="text-xs text-gray-400 mt-0.5">${escapeHtml(F.provider(topGame))} · Theo: ${(F.theoWin(topGame) || 0).toFixed(2)}</div>
                <div class="text-[10px] text-indigo-400 mt-1">Click for full provenance →</div>
            </div>
        </div>`;
    }

    html += `<div class="border-t border-white/10 pt-3 mt-2 space-y-1">
        <div class="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Data Sources</div>
        <div class="text-xs text-gray-400">Release year: from performance data CSV or AI web lookup</div>
        <div class="text-xs text-gray-400">Theme/features: classified from rules HTML, SlotCatalog, or ground truth</div>
        <div class="text-xs text-gray-400">Theo win: from performance data CSV</div>
    </div>`;

    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.xray-top-game-link').forEach(link => {
        link.addEventListener('click', () => {
            const name = link.dataset.game;
            if (name && window.openXRayPanel) window.openXRayPanel(name);
        });
    });
}
