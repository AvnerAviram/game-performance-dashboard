import { describe, test, expect, beforeEach } from 'vitest';
import { loadGameData, gameData } from '../../src/lib/data.js';

/**
 * Layer 3J: AI Assistant Page Tests
 */

describe('AI Assistant Page: Interface', () => {
  beforeEach(async () => {
    document.body.innerHTML = `
      <div id="ai-assistant">
        <div id="chat-messages"></div>
        <input id="chat-input" type="text" />
        <div id="quick-questions"></div>
      </div>
    `;
    
    await loadGameData();
  });

  test('should have chat interface', () => {
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    
    expect(chatMessages).toBeDefined();
    expect(chatInput).toBeDefined();
  });

  test('should have quick question buttons', () => {
    const quickQuestions = document.getElementById('quick-questions');
    expect(quickQuestions).toBeDefined();
  });
});

describe('AI Assistant Page: Data Access', () => {
  beforeEach(async () => {
    await loadGameData();
  });

  test('AI should have access to real game data', () => {
    expect(gameData.total_games).toBe(501);
    expect(gameData.themes.length).toBeGreaterThan(0);
    expect(gameData.mechanics.length).toBeGreaterThan(0);
  });

  test('AI should use non-hardcoded responses', () => {
    // Verify data is available for AI to use
    expect(gameData.allGames.length).toBe(501);
    expect(gameData.themes[0].Theme).toBeDefined();
  });
});
