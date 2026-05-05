// RTP landscape bubble chart
import { gameData, getActiveGames } from '../lib/data.js';
import { getRtpBandMetrics } from '../lib/metrics.js';
import { median, createBubbleLandscape, injectCoveragePill } from './chart-utils.js';
import { chartInstances } from './chart-config.js';

const RTP_COLORS = ['#10b981', '#34d399', '#60a5fa', '#f59e0b', '#f97316', '#ef4444'];

export async function createRtpChart() {
    try {
        const allGames = getActiveGames();
        if (!allGames.length) return;

        const bandData = await getRtpBandMetrics(gameData.activeCategory);
        if (!bandData.length) return;

        const rtpTotal = bandData.reduce((s, b) => s + b.count, 0);
        const rtpPct = ((rtpTotal / allGames.length) * 100).toFixed(0);
        const globalAvg =
            bandData.reduce((s, x) => s + x.avgTheo * x.count, 0) / bandData.reduce((s, x) => s + x.count, 0);
        const maxCount = Math.max(...bandData.map(b => b.count), 1);

        const data = bandData.map((b, i) => ({
            name: `RTP ${b.label}`,
            shortName: `RTP ${b.label}`,
            x: b.count,
            y: b.avgTheo,
            r: Math.max(10, Math.min(28, 10 + Math.sqrt(b.count / maxCount) * 18)),
            _band: b,
            _i: i,
        }));

        createBubbleLandscape('chart-rtp', {
            data,
            instanceKey: 'rtp',
            instanceRegistry: chartInstances,
            labels: 'top',
            maxLabels: 4,
            quadrantLabels: false,
            labelPosition: 'below',
            colorFn: (d, type) => {
                const c = RTP_COLORS[d._i % RTP_COLORS.length];
                return type === 'bg' ? c + 'AA' : c;
            },
            tooltipFn: item => {
                const b = item._band;
                const diff = b.avgTheo - globalAvg;
                const arrow = diff >= 0 ? '▲' : '▼';
                return [
                    `Games: ${b.count}  |  Avg PI: ${b.avgTheo.toFixed(2)}`,
                    `${arrow} ${diff >= 0 ? '+' : ''}${diff.toFixed(2)} vs market avg (${globalAvg.toFixed(2)})`,
                    `Based on ${rtpTotal} games with RTP data (${rtpPct}%)`,
                ];
            },
            onBubbleClick: item => {
                if (item._band && window.showRtpBandDetails) window.showRtpBandDetails(item._band.label);
            },
        });
        injectCoveragePill('chart-rtp', rtpTotal, allGames.length, 'with RTP data');
    } catch (err) {
        console.error('[RTP-CHART] FAILED:', err);
    }
}

export async function createRtpLandscapeChart() {
    try {
        const allGames = getActiveGames();
        if (!allGames.length) return;

        const bandData = await getRtpBandMetrics(gameData.activeCategory);
        if (!bandData.length) return;

        const rtpTotal = bandData.reduce((s, b) => s + b.count, 0);
        const rtpPct = ((rtpTotal / allGames.length) * 100).toFixed(0);
        const maxCount = Math.max(...bandData.map(b => b.count), 1);

        const data = bandData.map((b, i) => ({
            name: `📐 RTP ${b.label}`,
            shortName: `RTP ${b.label}`,
            x: b.count,
            y: b.avgTheo,
            r: Math.max(8, Math.min(40, 8 + Math.sqrt(b.count / maxCount) * 32)),
            _band: b,
            _i: i,
        }));

        createBubbleLandscape('chart-rtp-landscape', {
            data,
            instanceKey: 'rtpLandscape',
            instanceRegistry: chartInstances,
            labels: 'all',
            colorFn: (d, type) => {
                const c = RTP_COLORS[d._i % RTP_COLORS.length];
                return type === 'bg' ? c + '99' : c;
            },
            tooltipFn: item => {
                const b = item._band;
                const pct = ((b.count / allGames.length) * 100).toFixed(1);
                return [
                    `Games: ${b.count} (${pct}%)  |  Avg PI: ${b.avgTheo.toFixed(2)}`,
                    `Based on ${rtpTotal} games with RTP data (${rtpPct}%)`,
                ];
            },
            onBubbleClick: item => {
                if (item._band && window.showRtpBandDetails) window.showRtpBandDetails(item._band.label);
            },
            coveragePill: { covered: rtpTotal, total: allGames.length, label: 'with RTP data' },
        });
    } catch (err) {
        console.error('[RTP-LANDSCAPE] FAILED:', err);
    }
}
