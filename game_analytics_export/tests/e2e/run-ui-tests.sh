#!/bin/bash

# ==========================================
# Automated UI Testing Runner
# ==========================================

echo "🚀 Starting Automated UI Tests"
echo "═══════════════════════════════════════"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if server is running
if ! lsof -ti:8000 > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Server not running on port 8000${NC}"
    echo "Starting server..."
    cd /Users/avner/Projects/game-performace-dashboard
    python3 -m http.server 8000 > /dev/null 2>&1 &
    SERVER_PID=$!
    echo "Server started (PID: $SERVER_PID)"
    sleep 3
else
    echo -e "${GREEN}✅ Server already running on port 8000${NC}"
    SERVER_PID=""
fi

# Run Playwright tests
echo ""
echo "🔬 Running UI Tests..."
echo "─────────────────────────────────────"

cd /Users/avner/Projects/game-performace-dashboard/game_analytics_export

# Run tests with Playwright
npx playwright test tests/e2e/automated-ui-check.spec.js --reporter=line

TEST_EXIT_CODE=$?

# Cleanup
if [ ! -z "$SERVER_PID" ]; then
    echo ""
    echo "Stopping test server (PID: $SERVER_PID)..."
    kill $SERVER_PID 2>/dev/null
fi

echo ""
echo "═══════════════════════════════════════"

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✅ ALL TESTS PASSED!${NC}"
    echo "No visual bugs or duplicates found."
else
    echo -e "${RED}❌ SOME TESTS FAILED${NC}"
    echo "Check the output above for details."
fi

echo "═══════════════════════════════════════"

exit $TEST_EXIT_CODE
