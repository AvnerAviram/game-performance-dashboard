/**
 * Chart.js ESM setup — tree-shaken import of only the components we use.
 * Every file that needs Chart must import from here.
 */
import {
    Chart,
    BarController,
    BubbleController,
    LineController,
    BarElement,
    LineElement,
    PointElement,
    CategoryScale,
    LinearScale,
    LogarithmicScale,
    Tooltip,
    Legend,
    Filler,
    Title,
} from 'chart.js';

Chart.register(
    BarController,
    BubbleController,
    LineController,
    BarElement,
    LineElement,
    PointElement,
    CategoryScale,
    LinearScale,
    LogarithmicScale,
    Tooltip,
    Legend,
    Filler,
    Title
);

// Custom plugin: draws coverage annotation text on chart canvas
Chart.register({
    id: 'coverageAnnotation',
    afterDraw(chart) {
        const txt = chart._coverageText;
        if (!txt) return;
        const { ctx, chartArea } = chart;
        if (!chartArea) return;
        ctx.save();
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(148, 163, 184, 0.55)';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(txt, chartArea.right - 4, chartArea.bottom - 4);
        ctx.restore();
    },
});

export { Chart };
