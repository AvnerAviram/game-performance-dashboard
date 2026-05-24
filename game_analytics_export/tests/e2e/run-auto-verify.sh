#!/bin/bash
# AUTO-VERIFY: Run after every code change
# Usage: ./tests/run-auto-verify.sh

echo "🤖 AUTO-VERIFICATION SCRIPT"
echo "=========================="
echo ""

# Check if server is running
if ! curl -s http://localhost:8002/ > /dev/null 2>&1; then
    echo "❌ Server not running on port 8002"
    echo "Please start server first: cd game_analytics_export && python3 -m http.server 8002"
    exit 1
fi

echo "✅ Server is running"
echo ""

# Switch to Node 20 if using fnm
if command -v fnm &> /dev/null; then
    echo "🔧 Switching to Node 20..."
    eval "$(fnm env)"
    fnm use 20 2>/dev/null || fnm use node 2>/dev/null
fi

# Run the test
echo "🧪 Running auto-verification..."
echo ""

cd "$(dirname "$0")/.." || exit 1
npx playwright test AUTO-VERIFY-ALL.spec.js --reporter=line

# Check exit code
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ ✅ ✅ VERIFICATION PASSED ✅ ✅ ✅"
    echo ""
    exit 0
else
    echo ""
    echo "❌ ❌ ❌ VERIFICATION FAILED ❌ ❌ ❌"
    echo ""
    echo "Check screenshots in: tests/screenshots/AUTO-*.png"
    exit 1
fi
