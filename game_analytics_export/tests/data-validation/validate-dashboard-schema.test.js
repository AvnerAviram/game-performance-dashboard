import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const DATA_DIR = resolve(import.meta.dirname, '../../data');

describe('games_dashboard.json schema validation', () => {
  let games;
  let themeMap;

  beforeAll(() => {
    games = JSON.parse(readFileSync(resolve(DATA_DIR, 'games_dashboard.json'), 'utf-8'));
    themeMap = JSON.parse(readFileSync(resolve(DATA_DIR, 'theme_consolidation_map.json'), 'utf-8'));
  });

  test('file is a flat JSON array', () => {
    expect(Array.isArray(games)).toBe(true);
    expect(games.length).toBeGreaterThan(0);
  });

  test('every game has required fields: id, name, provider', () => {
    const missing = games.filter(g => !g.id || !g.name || !g.provider);
    expect(missing.length).toBe(0);
  });

  test('no duplicate game IDs', () => {
    const ids = games.map(g => g.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });

  test('features arrays should contain non-empty strings', () => {
    const violations = [];

    for (const g of games) {
      if (!Array.isArray(g.features)) continue;
      for (const f of g.features) {
        if (typeof f !== 'string' || f.trim() === '') {
          violations.push({ game: g.name, feature: f });
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test('features field is array or absent (never a string)', () => {
    const bad = games.filter(g => g.features && !Array.isArray(g.features));
    expect(bad.map(g => g.name)).toEqual([]);
  });

  test('themes_all field is array or absent', () => {
    const bad = games.filter(g => g.themes_all && !Array.isArray(g.themes_all));
    expect(bad.map(g => g.name)).toEqual([]);
  });

  test('symbols field is array or absent', () => {
    const bad = games.filter(g => g.symbols && !Array.isArray(g.symbols));
    expect(bad.map(g => g.name)).toEqual([]);
  });

  test('every non-empty theme_primary maps in theme_consolidation_map', () => {
    const unmapped = [];
    for (const g of games) {
      const t = g.theme_primary;
      if (t && !(t in themeMap)) {
        unmapped.push({ game: g.name, theme: t });
      }
    }
    expect(unmapped).toEqual([]);
  });

  test('rtp values are in valid range when present', () => {
    const bad = games.filter(g => g.rtp != null && (g.rtp < 50 || g.rtp > 100));
    expect(bad.map(g => ({ name: g.name, rtp: g.rtp }))).toEqual([]);
  });

  test('reels are positive numbers when present; rows can be number or variable-layout string', () => {
    const bad = games.filter(g => {
      if (g.reels != null && (typeof g.reels !== 'number' || g.reels < 1)) return true;
      if (g.rows != null && typeof g.rows !== 'number' && typeof g.rows !== 'string') return true;
      if (typeof g.rows === 'number' && g.rows < 1) return true;
      return false;
    });
    expect(bad.map(g => g.name)).toEqual([]);
  });

  test('at least 80% of games have features (enrichment coverage)', () => {
    const withFeatures = games.filter(g => Array.isArray(g.features) && g.features.length > 0);
    const ratio = withFeatures.length / games.length;
    expect(ratio).toBeGreaterThan(0.8);
  });
});
