'use strict';

/**
 * Shared dimension-matching logic used by both the server provenance API
 * and data-validation QA tests. Single source of truth for how games are
 * matched to dimension values.
 *
 * IMPORTANT: any change here must be mirrored in the client-side
 * filterByDimension() in src/ui/renderers/xray-panel.js.
 */

function matchGameToDimension(game, dimension, valueLower, { normalizeProvider, getFranchiseMap, matchRtpBand } = {}) {
    const g = game;

    if (dimension === 'provider') {
        const raw = g.provider || g.provider_studio || '';
        const norm = normalizeProvider ? normalizeProvider(raw) : raw;
        return raw.toLowerCase() === valueLower || norm.toLowerCase() === valueLower;
    }

    if (dimension === 'theme') {
        return (
            (g.theme_primary || '').toLowerCase() === valueLower ||
            (g.theme_consolidated || '').toLowerCase() === valueLower
        );
    }

    if (dimension === 'feature') {
        const feats = g.features;
        if (Array.isArray(feats))
            return feats.some(f => (typeof f === 'string' ? f : f?.name || '').toLowerCase() === valueLower);
        if (typeof feats === 'string')
            return feats
                .toLowerCase()
                .split(/[,;|]/)
                .some(f => f.trim() === valueLower);
        return false;
    }

    if (dimension === 'volatility') return (g.volatility || g.specs_volatility || '').toLowerCase() === valueLower;

    if (dimension === 'rtp') {
        const rtp = parseFloat(g.rtp || g.specs_rtp);
        if (isNaN(rtp)) return false;
        return matchRtpBand ? matchRtpBand(rtp, valueLower) : false;
    }

    if (dimension === 'franchise') {
        if ((g.franchise || '').toLowerCase() === valueLower) return true;
        if (getFranchiseMap) {
            const fm = getFranchiseMap();
            const slug = (g.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
            for (const [gid, entry] of Object.entries(fm)) {
                if (entry && (entry.franchise || '').toLowerCase() === valueLower && gid.includes(slug)) return true;
            }
        }
        return false;
    }

    if (dimension === 'art_theme') return (g.art_theme || '').toLowerCase() === valueLower;
    if (dimension === 'art_mood') return (g.art_mood || '').toLowerCase() === valueLower;

    if (dimension === 'art_characters') {
        const chars = g.art_characters;
        if (Array.isArray(chars)) return chars.some(c => c.toLowerCase() === valueLower);
        return (chars || '').toLowerCase() === valueLower;
    }

    if (dimension === 'art_elements') {
        const elems = g.art_elements;
        if (Array.isArray(elems)) return elems.some(el => el.toLowerCase() === valueLower);
        return (elems || '').toLowerCase() === valueLower;
    }

    if (dimension === 'art_narrative') return (g.art_narrative || '').toLowerCase() === valueLower;

    return false;
}

function defaultMatchRtpBand(rtp, band) {
    const b = String(band).trim();
    if (b.startsWith('>')) return rtp > parseFloat(b.replace(/[>%\s]/g, ''));
    if (b.startsWith('<')) return rtp < parseFloat(b.replace(/[<%\s]/g, ''));
    const range = b
        .replace(/%/g, '')
        .split('-')
        .map(s => parseFloat(s.trim()));
    if (range.length === 2 && !isNaN(range[0]) && !isNaN(range[1])) {
        return rtp >= range[0] && rtp <= range[1];
    }
    return Math.abs(rtp - parseFloat(b)) < 0.01;
}

module.exports = { matchGameToDimension, defaultMatchRtpBand };
