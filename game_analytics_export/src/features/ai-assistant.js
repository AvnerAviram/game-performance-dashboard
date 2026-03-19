import { gameData } from '../lib/data.js';
import { escapeHtml } from '../lib/sanitize.js';
import { apiFetch } from '../lib/api-client.js';

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
                <div class="flex items-center gap-2 text-sm text-gray-500"><div class="animate-spin w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full"></div>Thinking...</div>
            </div>
        </div>
    `;
    chatDiv.appendChild(typingEl);
    chatDiv.scrollTop = chatDiv.scrollHeight;

    const response = await generateAIResponse(question);

    typingEl.remove();

    const aiBubble = document.createElement('div');
    aiBubble.className = 'flex gap-3';
    aiBubble.innerHTML = `
        <div class="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/40 rounded-lg flex items-center justify-center flex-shrink-0 text-base">🤖</div>
        <div class="flex-1 max-w-[85%]">
            <div class="bg-slate-50 dark:bg-slate-700/50 rounded-xl rounded-tl-sm p-4 border border-slate-100 dark:border-slate-600">
                <p class="font-semibold text-gray-900 dark:text-white mb-2 text-sm">AI Assistant</p>
                <div class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed prose prose-sm dark:prose-invert max-w-none">${response}</div>
            </div>
        </div>
    `;
    chatDiv.appendChild(aiBubble);
    chatDiv.scrollTop = chatDiv.scrollHeight;
}

function buildGameContext() {
    const themes = (gameData.themes || []).slice(0, 10);
    const mechanics = (gameData.mechanics || []).slice(0, 10);
    const topGames = (gameData.allGames || [])
        .sort((a, b) => (b.performance_theo_win || 0) - (a.performance_theo_win || 0))
        .slice(0, 10);

    let ctx = 'You have access to a game analytics dataset:\n';
    if (themes.length) {
        ctx += '\nTop themes by Smart Index:\n';
        themes.forEach(t => {
            ctx += `- ${t.Theme}: ${t['Game Count']} games, Smart Index ${(t['Smart Index'] || 0).toFixed(1)}, Market Share ${(t['Market Share %'] || 0).toFixed(1)}%, Avg Theo Win ${(t['Avg Theo Win Index'] || 0).toFixed(3)}\n`;
        });
    }
    if (mechanics.length) {
        ctx += '\nTop mechanics:\n';
        mechanics.forEach(m => {
            ctx += `- ${m.Mechanic}: ${m['Game Count']} games, Smart Index ${(m['Smart Index'] || 0).toFixed(1)}\n`;
        });
    }
    if (topGames.length) {
        ctx += '\nTop performing games:\n';
        topGames.forEach(g => {
            ctx += `- ${g.name}: theme=${g.theme_consolidated || g.theme_primary || 'N/A'}, theo_win=${(g.performance_theo_win || 0).toFixed(2)}, provider=${g.provider_studio || g.provider || 'N/A'}\n`;
        });
    }
    return ctx;
}

async function generateAIResponse(question) {
    chatHistory.push({ role: 'user', content: question });
    if (chatHistory.length > 10) chatHistory = chatHistory.slice(-10);

    try {
        const data = await apiFetch('/api/ai-chat', {
            method: 'POST',
            body: JSON.stringify({
                question,
                context: buildGameContext(),
                history: chatHistory.slice(-6),
            }),
        });

        const answer = data.response || 'I couldn\'t generate a response. Please try again.';
        chatHistory.push({ role: 'assistant', content: answer });
        return answer;
    } catch (_err) {
        const fallback = generateLocalResponse(question);
        chatHistory.push({ role: 'assistant', content: fallback });
        return fallback;
    }
}

function generateLocalResponse(question) {
    const lower = question.toLowerCase();

    if (lower.includes('jackpot')) {
        return `<p><strong>Important: "Jackpot" is NOT a game mechanic!</strong></p>
            <p>Jackpots are standard payout tiers found in almost every slot game. Focus on mechanics that change HOW the game plays:</p>
            <ul><li><strong>Hold & Win</strong> - Lock symbols and trigger respins</li><li><strong>Megaways</strong> - Dynamic reel system with up to 117,649 ways</li><li><strong>Free Spins</strong> - Bonus rounds with free games</li><li><strong>Cascade/Avalanche</strong> - Symbols drop and refill</li></ul>`;
    }

    if (lower.includes('top') && lower.includes('perform') || lower.includes('combination') || lower.includes('best theme')) {
        const top = [...(gameData.themes || [])].sort((a, b) => (b['Smart Index'] || 0) - (a['Smart Index'] || 0)).slice(0, 5);
        return `<p><strong>Top Performing Themes:</strong></p><ul>${top.map(t => `<li><strong>${escapeHtml(t.Theme)}</strong>: ${t['Game Count']} games, Smart Index ${(t['Smart Index'] || 0).toFixed(1)}</li>`).join('')}</ul>
            <p><strong>Proven combos:</strong> Megaways + Free Spins, Hold & Win + Sticky Wilds, Cascade + Multiplier.</p>`;
    }

    if (lower.includes('gap') || lower.includes('opportunity') || lower.includes('blue ocean')) {
        const gaps = (gameData.themes || []).filter(t => t['Game Count'] < 50 && (t['Smart Index'] || 0) > 50).slice(0, 5);
        return `<p><strong>Market Opportunities:</strong></p><ul>${gaps.length ? gaps.map(t => `<li><strong>${escapeHtml(t.Theme)}</strong>: Only ${t['Game Count']} games, Smart Index ${(t['Smart Index'] || 0).toFixed(1)}</li>`).join('') : '<li>No clear blue ocean in current data</li>'}</ul>`;
    }

    const themes = (gameData.themes || []).slice(0, 3);
    const mechanics = (gameData.mechanics || []).slice(0, 3);
    return `<p>Here are some insights from our database:</p>
        <p><strong>Top Themes:</strong></p><ul>${themes.map(t => `<li><strong>${escapeHtml(t.Theme)}</strong>: Smart Index ${(t['Smart Index'] || 0).toFixed(1)}</li>`).join('')}</ul>
        <p><strong>Top Mechanics:</strong></p><ul>${mechanics.map(m => `<li><strong>${escapeHtml(m.Mechanic)}</strong>: Smart Index ${(m['Smart Index'] || 0).toFixed(1)}</li>`).join('')}</ul>
        <p>Try asking about specific themes, mechanics, market gaps, or game concept evaluation!</p>`;
}
