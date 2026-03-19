import { describe, it, expect, beforeAll } from 'vitest';

describe('Providers and Games Pages - Unit Tests', () => {
    let games;
    
    beforeAll(async () => {
        const fs = await import('fs/promises');
        const data = await fs.readFile('./data/games_dashboard.json', 'utf-8');
        const parsed = JSON.parse(data);
        games = Array.isArray(parsed) ? parsed : (parsed.games || []);
    });
    
    describe('Providers Aggregation Logic', () => {
        it('should correctly aggregate providers from games', () => {
            const providers = {};
            
            games.forEach(game => {
                const studio = game.provider || game.studio || 'Unknown';
                if (!providers[studio]) {
                    providers[studio] = {
                        studio: studio,
                        games: [],
                        total_theo: 0,
                        total_market: 0,
                        rtp_sum: 0,
                        rtp_count: 0
                    };
                }
                
                providers[studio].games.push(game);
                providers[studio].total_theo += game.theo_win || 0;
                providers[studio].total_market += game.market_share_pct || 0;
                
                if (game.rtp) {
                    providers[studio].rtp_sum += game.rtp;
                    providers[studio].rtp_count++;
                }
            });
            
            expect(Object.keys(providers).length).toBeGreaterThan(0);
            console.log('✅ Total providers:', Object.keys(providers).length);
            
            const totalGames = Object.values(providers).reduce((sum, p) => sum + p.games.length, 0);
            expect(totalGames).toBe(games.length);
            console.log('✅ All games accounted for:', totalGames);
            
            Object.values(providers).forEach(p => {
                expect(p.studio).toBeTruthy();
                expect(p.games.length).toBeGreaterThan(0);
                expect(p.total_theo).toBeGreaterThanOrEqual(0);
            });
            console.log('✅ All providers have valid data');
        });
        
        it('should calculate correct averages', () => {
            const providers = {};
            
            games.forEach(game => {
                const studio = game.provider || game.studio || 'Unknown';
                if (!providers[studio]) {
                    providers[studio] = {
                        games: [],
                        total_theo: 0,
                        rtp_sum: 0,
                        rtp_count: 0
                    };
                }
                
                providers[studio].games.push(game);
                providers[studio].total_theo += game.theo_win || 0;
                
                if (game.rtp) {
                    providers[studio].rtp_sum += game.rtp;
                    providers[studio].rtp_count++;
                }
            });
            
            Object.entries(providers).forEach(([name, p]) => {
                const avg_theo = p.total_theo / p.games.length;
                const avg_rtp = p.rtp_count > 0 ? p.rtp_sum / p.rtp_count : null;
                
                expect(avg_theo).toBeGreaterThanOrEqual(0);
                expect(typeof avg_theo).toBe('number');
                expect(isNaN(avg_theo)).toBe(false);
                
                if (avg_rtp !== null) {
                    expect(avg_rtp).toBeGreaterThan(0);
                    expect(avg_rtp).toBeLessThanOrEqual(100);
                }
                
                console.log(`✅ ${name}: avg_theo=${avg_theo.toFixed(2)}, avg_rtp=${avg_rtp ? avg_rtp.toFixed(1) : 'N/A'}`);
            });
        });
        
        it('should sort providers by game count correctly', () => {
            const providers = {};
            
            games.forEach(game => {
                const studio = game.provider || game.studio || 'Unknown';
                if (!providers[studio]) {
                    providers[studio] = { games: [] };
                }
                providers[studio].games.push(game);
            });
            
            const providersList = Object.entries(providers)
                .map(([name, p]) => ({ name, count: p.games.length }))
                .sort((a, b) => b.count - a.count);
            
            for (let i = 0; i < providersList.length - 1; i++) {
                expect(providersList[i].count).toBeGreaterThanOrEqual(providersList[i + 1].count);
            }
            
            console.log('✅ Top 5 providers by game count:');
            providersList.slice(0, 5).forEach((p, i) => {
                console.log(`   ${i + 1}. ${p.name}: ${p.count} games`);
            });
        });
    });
    
    describe('Games List Logic', () => {
        it('should have all required fields', () => {
            let missing = 0;
            games.forEach(game => {
                expect(game.id).toBeTruthy();
                expect(game.name).toBeTruthy();
                expect(game.provider || game.studio).toBeTruthy();
                if (typeof game.theo_win !== 'number') {
                    missing++;
                }
            });
            expect(missing).toBeLessThan(Math.ceil(games.length * 0.25));
            
            console.log(`✅ All games have required fields (${missing} missing performance data)`);
        });
        
        it('should sort by theo_win correctly', () => {
            const sorted = [...games].sort((a, b) => 
                (b.theo_win || 0) - (a.theo_win || 0)
            );
            
            for (let i = 0; i < sorted.length - 1; i++) {
                const current = sorted[i].theo_win || 0;
                const next = sorted[i + 1].theo_win || 0;
                expect(current).toBeGreaterThanOrEqual(next);
            }
            
            console.log('✅ Games sorted by theo_win correctly');
            console.log('   Top 3:', sorted.slice(0, 3).map(g => `${g.name} (${g.theo_win?.toFixed(2) || 'N/A'})`).join(', '));
        });
        
        it('should filter by provider correctly', () => {
            const allProviders = [...new Set(games.map(g => g.provider || g.studio))];
            const testProvider = allProviders[0];
            const filtered = games.filter(g => (g.provider || g.studio) === testProvider);
            
            filtered.forEach(game => {
                expect(game.provider || game.studio).toBe(testProvider);
            });
            
            console.log(`✅ Filter by provider "${testProvider}": ${filtered.length} games`);
        });
        
        it('should filter by mechanic correctly', () => {
            const allMechanics = [...new Set(games.map(g => g.mechanic_primary).filter(Boolean))];
            const testMechanic = allMechanics[0];
            const filtered = games.filter(g => g.mechanic_primary === testMechanic);
            
            filtered.forEach(game => {
                expect(game.mechanic_primary).toBe(testMechanic);
            });
            
            console.log(`✅ Filter by mechanic "${testMechanic}": ${filtered.length} games`);
        });
        
        it('should search by name correctly', () => {
            const testSearch = games[0].name.substring(0, 3).toLowerCase();
            const filtered = games.filter(g => 
                g.name.toLowerCase().includes(testSearch)
            );
            
            filtered.forEach(game => {
                expect(game.name.toLowerCase()).toContain(testSearch);
            });
            
            console.log(`✅ Search "${testSearch}": ${filtered.length} games`);
        });
        
        it('should handle combined filters correctly', () => {
            const testProvider = (games[0].provider || games[0].studio);
            const testSearch = games[0].name.substring(0, 3).toLowerCase();
            
            let filtered = games;
            filtered = filtered.filter(g => (g.provider || g.studio) === testProvider);
            filtered = filtered.filter(g => g.name.toLowerCase().includes(testSearch));
            
            filtered.forEach(game => {
                expect(game.provider || game.studio).toBe(testProvider);
                expect(game.name.toLowerCase()).toContain(testSearch);
            });
            
            console.log(`✅ Combined filter (provider="${testProvider}" AND search="${testSearch}"): ${filtered.length} games`);
        });
    });
    
    describe('Data Completeness', () => {
        it('should have high coverage for critical fields', () => {
            const stats = {
                has_provider: 0,
                has_theme: 0,
                has_mechanic: 0,
                has_performance: 0,
                has_rtp: 0,
                has_volatility: 0
            };
            
            games.forEach(g => {
                if (g.provider || g.studio) stats.has_provider++;
                if (g.theme_primary) stats.has_theme++;
                if (g.mechanic_primary) stats.has_mechanic++;
                if (g.theo_win) stats.has_performance++;
                if (g.rtp) stats.has_rtp++;
                if (g.volatility) stats.has_volatility++;
            });
            
            const total = games.length;
            
            expect(stats.has_provider / total).toBeGreaterThan(0.9);
            expect(stats.has_theme / total).toBeGreaterThan(0.9);
            expect(stats.has_mechanic / total).toBeGreaterThan(0.9);
            expect(stats.has_performance / total).toBeGreaterThan(0.75);
            expect(stats.has_volatility / total).toBeGreaterThan(0.60);
            
            console.log('✅ Data coverage:');
            console.log(`   Provider: ${stats.has_provider}/${total} (${(stats.has_provider/total*100).toFixed(1)}%)`);
            console.log(`   Theme: ${stats.has_theme}/${total} (${(stats.has_theme/total*100).toFixed(1)}%)`);
            console.log(`   Mechanic: ${stats.has_mechanic}/${total} (${(stats.has_mechanic/total*100).toFixed(1)}%)`);
            console.log(`   Performance: ${stats.has_performance}/${total} (${(stats.has_performance/total*100).toFixed(1)}%)`);
            console.log(`   RTP: ${stats.has_rtp}/${total} (${(stats.has_rtp/total*100).toFixed(1)}%)`);
            console.log(`   Volatility: ${stats.has_volatility}/${total} (${(stats.has_volatility/total*100).toFixed(1)}%)`);
        });
    });
});
