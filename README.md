# Game Performance Dashboard

Clean, organized analytics dashboard for slot game performance tracking.

## 🚀 Quick Start

```bash
# Start the development server
cd game_analytics_export
python3 -m http.server 8000
```

Then visit: **http://localhost:8000/**

The root `index.html` will automatically redirect to the dashboard.

## 📁 Project Structure

```
game-performace-dashboard/
├── index.html                    # Home page (redirects to dashboard)
├── game_analytics_export/        # Main dashboard application
│   ├── index.html               # Dashboard SPA
│   ├── data/                    # Game data (JSON, DuckDB)
│   ├── src/                     # JavaScript & CSS
│   ├── pages/                   # Future: Page templates
│   └── tests/                   # Test scripts & screenshots
├── docs/                         # Documentation & reports
│   ├── reports/                 # Analysis & fix reports
│   ├── verification/            # Data verification docs
│   └── testing/                 # QA & test results
└── scripts/                      # Python validation scripts
```

## 🎯 Dashboard Features

- **Overview**: Dashboard with stats and charts
- **Themes**: Theme performance analysis
- **Mechanics**: Game mechanic breakdowns  
- **Games**: Full searchable game database
- **Providers**: Provider comparison
- **Anomalies**: Performance outliers
- **Insights**: Market insights
- **Prediction**: Success prediction tool

## 🔧 Development

**Run tests:**
```bash
cd game_analytics_export
node debug-site.js
```

**Build CSS:**
```bash
npx tailwindcss -i ./src/input.css -o ./src/output.css --minify
```

## 📚 Documentation

- Architecture: `game_analytics_export/ARCHITECTURE.md`
- Reports: `docs/reports/`
- Verification: `docs/verification/`
