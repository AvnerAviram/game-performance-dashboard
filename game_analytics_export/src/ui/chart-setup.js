/**
 * Chart.js ESM setup — tree-shaken import of only the components we use.
 * Every file that needs Chart must import from here.
 */
import {
    Chart,
    BarController,
    BubbleController,
    DoughnutController,
    LineController,
    ArcElement,
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
    DoughnutController,
    LineController,
    ArcElement,
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

window.Chart = Chart;
export { Chart, Tooltip };
