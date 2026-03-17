#!/usr/bin/env node
/**
 * Dashboard Integration Test Script
 * 
 * Tests that the updated games_master.json works correctly with the dashboard
 * Verifies all queries and calculations function properly
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Test 1: Load JSON (no parse errors)
 */
function testLoadJSON(jsonPath) {
  console.log('\n1️⃣  Test: Load JSON');
  console.log('═══════════════════════════════════════');
  
  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    console.log(`✅ JSON loaded successfully`);
    console.log(`   Total games: ${data.games.length}`);
    console.log(`   Metadata version: ${data.metadata.version}`);
    return { passed: true, data };
  } catch (error) {
    console.log(`❌ Failed to load JSON: ${error.message}`);
    return { passed: false, error };
  }
}

/**
 * Test 2: Filter by data_validity
 */
function testFilterValidGames(data) {
  console.log('\n2️⃣  Test: Filter by data_validity');
  console.log('═══════════════════════════════════════');
  
  try {
    const validGames = data.games.filter(g => 
      g.data_validity === 'valid' || g.data_validity === 'valid_with_limitations'
    );
    
    const validCount = validGames.filter(g => g.data_validity === 'valid').length;
    const limitedCount = validGames.filter(g => g.data_validity === 'valid_with_limitations').length;
    const invalidCount = data.games.length - validGames.length;
    
    console.log(`✅ Filter successful`);
    console.log(`   Valid: ${validCount}`);
    console.log(`   Valid with limitations: ${limitedCount}`);
    console.log(`   Invalid/Other: ${invalidCount}`);
    console.log(`   Total valid games: ${validGames.length}`);
    
    return { passed: true, validGames };
  } catch (error) {
    console.log(`❌ Filter failed: ${error.message}`);
    return { passed: false, error };
  }
}

/**
 * Test 3: Query top 50 by theo_win
 */
function testTopPerformers(validGames) {
  console.log('\n3️⃣  Test: Query top 50 by theo_win');
  console.log('═══════════════════════════════════════');
  
  try {
    const sorted = [...validGames].sort((a, b) => 
      (b.performance?.theo_win || 0) - (a.performance?.theo_win || 0)
    );
    
    const top50 = sorted.slice(0, 50);
    
    console.log(`✅ Query successful`);
    console.log(`   Top performer: ${top50[0].name} (${top50[0].performance.theo_win})`);
    console.log(`   #50: ${top50[49]?.name} (${top50[49]?.performance?.theo_win || 'N/A'})`);
    
    // Verify sorted correctly
    let isSorted = true;
    for (let i = 0; i < top50.length - 1; i++) {
      if ((top50[i].performance?.theo_win || 0) < (top50[i + 1].performance?.theo_win || 0)) {
        isSorted = false;
        break;
      }
    }
    
    if (!isSorted) {
      console.log(`⚠️  Warning: Results not properly sorted`);
    }
    
    return { passed: true, top50 };
  } catch (error) {
    console.log(`❌ Query failed: ${error.message}`);
    return { passed: false, error };
  }
}

/**
 * Test 4: Group by provider
 */
function testGroupByProvider(validGames) {
  console.log('\n4️⃣  Test: Group by provider');
  console.log('═══════════════════════════════════════');
  
  try {
    const providerCounts = {};
    
    validGames.forEach(game => {
      const provider = game.provider?.studio || 'Unknown';
      providerCounts[provider] = (providerCounts[provider] || 0) + 1;
    });
    
    const topProviders = Object.entries(providerCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    console.log(`✅ Grouping successful`);
    console.log(`   Total providers: ${Object.keys(providerCounts).length}`);
    console.log(`   Top 5 providers:`);
    topProviders.slice(0, 5).forEach(([provider, count]) => {
      console.log(`     ${provider}: ${count} games`);
    });
    
    return { passed: true, providerCounts, topProviders };
  } catch (error) {
    console.log(`❌ Grouping failed: ${error.message}`);
    return { passed: false, error };
  }
}

/**
 * Test 5: Group by mechanic
 */
function testGroupByMechanic(validGames) {
  console.log('\n5️⃣  Test: Group by mechanic');
  console.log('═══════════════════════════════════════');
  
  try {
    const mechanicCounts = {};
    
    validGames.forEach(game => {
      const mechanic = game.mechanic?.primary || 'Unknown';
      mechanicCounts[mechanic] = (mechanicCounts[mechanic] || 0) + 1;
    });
    
    const topMechanics = Object.entries(mechanicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    console.log(`✅ Grouping successful`);
    console.log(`   Total mechanics: ${Object.keys(mechanicCounts).length}`);
    console.log(`   Top 5 mechanics:`);
    topMechanics.slice(0, 5).forEach(([mechanic, count]) => {
      console.log(`     ${mechanic}: ${count} games`);
    });
    
    return { passed: true, mechanicCounts, topMechanics };
  } catch (error) {
    console.log(`❌ Grouping failed: ${error.message}`);
    return { passed: false, error };
  }
}

/**
 * Test 6: Calculate KPIs
 */
function testCalculateKPIs(validGames) {
  console.log('\n6️⃣  Test: Calculate KPIs');
  console.log('═══════════════════════════════════════');
  
  try {
    // Total theo_win
    const totalTheoWin = validGames.reduce((sum, g) => 
      sum + (g.performance?.theo_win || 0), 0
    );
    
    // Average theo_win
    const avgTheoWin = totalTheoWin / validGames.length;
    
    // Average RTP
    const gamesWithRTP = validGames.filter(g => g.specs?.rtp);
    const avgRTP = gamesWithRTP.length > 0 
      ? gamesWithRTP.reduce((sum, g) => sum + g.specs.rtp, 0) / gamesWithRTP.length
      : 0;
    
    // Games by volatility
    const volatilityCounts = {};
    validGames.forEach(g => {
      const vol = g.specs?.volatility || 'Unknown';
      volatilityCounts[vol] = (volatilityCounts[vol] || 0) + 1;
    });
    
    console.log(`✅ KPI calculations successful`);
    console.log(`   Total games: ${validGames.length}`);
    console.log(`   Total Theo Win: $${totalTheoWin.toFixed(2)}M`);
    console.log(`   Average Theo Win: $${avgTheoWin.toFixed(2)}M`);
    console.log(`   Average RTP: ${avgRTP.toFixed(2)}% (${gamesWithRTP.length} games)`);
    console.log(`   Volatility distribution:`);
    Object.entries(volatilityCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([vol, count]) => {
        console.log(`     ${vol}: ${count} games`);
      });
    
    return { 
      passed: true, 
      kpis: { totalTheoWin, avgTheoWin, avgRTP, volatilityCounts } 
    };
  } catch (error) {
    console.log(`❌ KPI calculation failed: ${error.message}`);
    return { passed: false, error };
  }
}

/**
 * Test 7: Verify no duplicates
 */
function testNoDuplicates(data) {
  console.log('\n7️⃣  Test: Verify no duplicates');
  console.log('═══════════════════════════════════════');
  
  try {
    const names = new Set();
    const duplicates = [];
    
    data.games.forEach(game => {
      if (names.has(game.name)) {
        duplicates.push(game.name);
      }
      names.add(game.name);
    });
    
    if (duplicates.length === 0) {
      console.log(`✅ No duplicates found`);
      console.log(`   All ${data.games.length} games have unique names`);
      return { passed: true };
    } else {
      console.log(`❌ Found ${duplicates.length} duplicates:`);
      duplicates.forEach(dup => console.log(`     ${dup}`));
      return { passed: false, duplicates };
    }
  } catch (error) {
    console.log(`❌ Duplicate check failed: ${error.message}`);
    return { passed: false, error };
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🧪 Dashboard Integration Testing');
  console.log('═══════════════════════════════════════');
  console.log('Testing updated games_master.json\n');
  
  const jsonPath = path.join(__dirname, '../../data/games_master.json');
  
  // Run all tests
  const results = [];
  
  // Test 1: Load JSON
  const loadResult = testLoadJSON(jsonPath);
  results.push({ name: 'Load JSON', ...loadResult });
  
  if (!loadResult.passed) {
    console.log('\n❌ Cannot proceed - JSON failed to load');
    process.exit(1);
  }
  
  const data = loadResult.data;
  
  // Test 2: Filter valid games
  const filterResult = testFilterValidGames(data);
  results.push({ name: 'Filter Valid Games', ...filterResult });
  
  if (!filterResult.passed) {
    console.log('\n❌ Cannot proceed - Filter failed');
    process.exit(1);
  }
  
  const validGames = filterResult.validGames;
  
  // Test 3: Top performers
  const topResult = testTopPerformers(validGames);
  results.push({ name: 'Top Performers Query', ...topResult });
  
  // Test 4: Group by provider
  const providerResult = testGroupByProvider(validGames);
  results.push({ name: 'Group by Provider', ...providerResult });
  
  // Test 5: Group by mechanic
  const mechanicResult = testGroupByMechanic(validGames);
  results.push({ name: 'Group by Mechanic', ...mechanicResult });
  
  // Test 6: Calculate KPIs
  const kpiResult = testCalculateKPIs(validGames);
  results.push({ name: 'Calculate KPIs', ...kpiResult });
  
  // Test 7: No duplicates
  const dupResult = testNoDuplicates(data);
  results.push({ name: 'No Duplicates', ...dupResult });
  
  // Summary
  console.log('\n\n📊 Test Summary');
  console.log('═══════════════════════════════════════');
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  results.forEach(result => {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} - ${result.name}`);
  });
  
  console.log('\n═══════════════════════════════════════');
  console.log(`Passed: ${passed}/${results.length}`);
  console.log(`Failed: ${failed}/${results.length}`);
  
  if (failed === 0) {
    console.log('\n✅ ALL TESTS PASSED!');
    console.log('Dashboard is ready to use with updated data.');
  } else {
    console.log('\n❌ Some tests failed. Review errors above.');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { 
  testLoadJSON, 
  testFilterValidGames, 
  testTopPerformers, 
  testGroupByProvider, 
  testGroupByMechanic, 
  testCalculateKPIs, 
  testNoDuplicates 
};
