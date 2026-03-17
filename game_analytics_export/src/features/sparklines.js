// Sparkline mini charts for stat cards
import { gameData } from '../lib/data.js';

export function createSparklines() {
    if (!gameData || !gameData.themes) return;
    
    const isDark = document.documentElement.classList.contains('dark');
    const lineColor = isDark ? '#3b82f6' : '#3b82f6';
    const pointColor = isDark ? '#60a5fa' : '#2563eb';
    
    // Games sparkline - simulate trend data
    createSparkline('sparkline-games', [450, 465, 480, 490, 495, 500], lineColor, pointColor);
    
    // Themes sparkline - use actual theme count data
    const themeTrend = gameData.themes.slice(0, 6).map(t => t['Game Count']);
    createSparkline('sparkline-themes', themeTrend, '#a855f7', '#c084fc');
    
    // Mechanics sparkline - simulate trend
    createSparkline('sparkline-mechanics', [78, 80, 82, 84, 85, 86], '#10b981', '#34d399');
}

function createSparkline(canvasId, data, color, pointColor) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Calculate points
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    
    const points = data.map((value, index) => ({
        x: (index / (data.length - 1)) * width,
        y: height - ((value - min) / range) * (height - 4) - 2
    }));
    
    // Draw line
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    
    points.forEach((point, index) => {
        if (index === 0) {
            ctx.moveTo(point.x, point.y);
        } else {
            ctx.lineTo(point.x, point.y);
        }
    });
    
    ctx.stroke();
    
    // Draw last point
    const lastPoint = points[points.length - 1];
    ctx.beginPath();
    ctx.fillStyle = pointColor;
    ctx.arc(lastPoint.x, lastPoint.y, 3, 0, Math.PI * 2);
    ctx.fill();
}

export function refreshSparklines() {
    createSparklines();
}
