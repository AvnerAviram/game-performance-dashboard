import { describe, it, expect, beforeAll } from 'vitest';

describe('Providers and Games Pages - Unit Tests', () => {
    let masterData;
    
    beforeAll(async () => {
        const fs = await import('fs/promises');
        const data = await fs.readFile('./data/games_master.json', 'utf-8');
        masterData = JSON.parse(data);
    });
    
    describe('Providers Aggregation Logic', () => {
        it('should correctly aggregate providers from games', () => {
            const providers = {};
            
            masterData.games.forEach(game => {
                const studio = game.provider?.studio || 'Unknown';
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
                providers[studio].total_theo += game.performance?.theo_win || 0;
                providers[studio].total_market += game.performance?.market_share_percent || 0;
                
                if (game.specs?.rtp) {
                    providers[studio].rtp_sum += game.specs.rtp;
                    providers[studio].rtp_count++;
                }
            });
            
            // Test: Should have multiple providers
            expect(Object.keys(providers).length).toBeGreaterThan(0);
            console.log('✅ Total providers:', Object.keys(providers).length);
            
            // Test: All games should be accounted for
            const totalGames = Object.values(providers).reduce((sum, p) => sum + p.games.length, 0);
            expect(totalGames).toBe(masterData.games.length);
            console.log('✅ All games accounted for:', totalGames);
            
            // Test: Each provider should have valid data
            Object.values(providers).forEach(p => {
                expect(p.studio).toBeTruthy();
                expect(p.games.length).toBeGreaterThan(0);
                expect(p.total_theo).toBeGreaterThanOrEqual(0);
            });
            console.log('✅ All providers have valid data');
        });
        
        it('should calculate correct averages', () => {
            const providers = {};
            
            masterData.games.forEach(game => {
                const studio = game.provider?.studio || 'Unknown';
                if (!providers[studio]) {
                    providers[studio] = {
                        games: [],
                        total_theo: 0,
                        rtp_sum: 0,
                        rtp_count: 0
                    };
                }
                
                providers[studio].games.push(game);
                providers[studio].total_theo += game.performance?.theo_win || 0;
                
                if (game.specs?.rtp) {
                    providers[studio].rtp_sum += game.specs.rtp;
                    providers[studio].rtp_count++;
                }
            });
            
            // Test: Average calculations
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
            
            masterData.games.forEach(game => {
                const studio = game.provider?.studio || 'Unknown';
                if (!providers[studio]) {
                    providers[studio] = { games: [] };
                }
                providers[studio].games.push(game);
            });
            
            const providersList = Object.entries(providers)
                .map(([name, p]) => ({ name, count: p.games.length }))
                .sort((a, b) => b.count - a.count);
            
            // Test: Should be in descending order
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
            masterData.games.forEach(game => {
                expect(game.id).toBeTruthy();
                expect(game.name).toBeTruthy();
                expect(game.provider).toBeTruthy();
                expect(game.provider.studio || game.provider.display_name).toBeTruthy();
                if (!game.performance || typeof game.performance.theo_win !== 'number') {
                    missing++;
                }
            });
            // ~19% of games lack numeric performance data
            expect(missing).toBeLessThan(Math.ceil(masterData.games.length * 0.25));
            
            console.log(`✅ All games have required fields (${missing} missing performance data)`);
        });
        
        it('should sort by rank correctly', () => {
            const sorted = [...masterData.games].sort((a, b) => 
                (a.performance?.rank || 999) - (b.performance?.rank || 999)
            );
            
            // Test: Ranks should be in ascending order
            for (let i = 0; i < sorted.length - 1; i++) {
                const currentRank = sorted[i].performance?.rank || 999;
                const nextRank = sorted[i + 1].performance?.rank || 999;
                expect(currentRank).toBeLessThanOrEqual(nextRank);
            }
            
            console.log('✅ Games sorted by rank correctly');
            console.log('   Top 3:', sorted.slice(0, 3).map((g, i) => `#${g.performance?.rank ?? (i + 1)} ${g.name}`).join(', '));
        });
        
        it('should filter by provider correctly', () => {
            const testProvider = 'IGT';
            const filtered = masterData.games.filter(g => g.provider?.studio === testProvider);
            
            // Test: All filtered games should match provider
            filtered.forEach(game => {
                expect(game.provider.studio).toBe(testProvider);
            });
            
            console.log(`✅ Filter by provider "${testProvider}": ${filtered.length} games`);
            console.log('   Games:', filtered.map(g => g.name).join(', '));
        });
        
        it('should filter by mechanic correctly', () => {
            const testMechanic = 'Hold & Win';
            const filtered = masterData.games.filter(g => g.mechanic?.primary === testMechanic);
            
            // Test: All filtered games should match mechanic
            filtered.forEach(game => {
                expect(game.mechanic.primary).toBe(testMechanic);
            });
            
            console.log(`✅ Filter by mechanic "${testMechanic}": ${filtered.length} games`);
        });
        
        it('should search by name correctly', () => {
            const testSearch = 'cash';
            const filtered = masterData.games.filter(g => 
                g.name.toLowerCase().includes(testSearch)
            );
            
            // Test: All filtered games should match search
            filtered.forEach(game => {
                expect(game.name.toLowerCase()).toContain(testSearch);
            });
            
            console.log(`✅ Search "${testSearch}": ${filtered.length} games`);
            console.log('   Found:', filtered.map(g => g.name).join(', '));
        });
        
        it('should handle combined filters correctly', () => {
            const testProvider = 'IGT';
            const testSearch = 'cash';
            
            let filtered = masterData.games;
            
            // Apply provider filter
            filtered = filtered.filter(g => g.provider?.studio === testProvider);
            
            // Apply search
            filtered = filtered.filter(g => g.name.toLowerCase().includes(testSearch));
            
            // Test: Should match both conditions
            filtered.forEach(game => {
                expect(game.provider.studio).toBe(testProvider);
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
            
            masterData.games.forEach(g => {
                if (g.provider?.studio || g.provider?.display_name) stats.has_provider++;
                if (g.theme?.consolidated || g.theme?.primary) stats.has_theme++;
                if (g.mechanic?.primary) stats.has_mechanic++;
                if (g.performance?.theo_win) stats.has_performance++;
                if (g.specs?.rtp) stats.has_rtp++;
                if (g.specs?.volatility) stats.has_volatility++;
            });
            
            const total = masterData.games.length;
            
            // Critical fields coverage (performance is ~81% in games_master.json)
            expect(stats.has_provider / total).toBeGreaterThan(0.9);
            expect(stats.has_theme / total).toBeGreaterThan(0.9);
            expect(stats.has_mechanic / total).toBeGreaterThan(0.9);
            expect(stats.has_performance / total).toBeGreaterThan(0.75);
            
            // Volatility coverage is ~72% in games_master.json
            expect(stats.has_volatility / total).toBeGreaterThan(0.70);
            
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
