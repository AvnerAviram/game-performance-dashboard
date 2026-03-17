# Manual Visual Test Instructions

## 1. Kill ALL servers
```bash
pkill -f http-server
pkill -f python
lsof -i :8000
```

## 2. Start Fresh Server
```bash
cd /Users/avner/Projects/game-performace-dashboard/game_analytics_export
npx http-server -p 8000 -c-1
```

## 3. Open in INCOGNITO (to avoid cache)
```
http://localhost:8000
```

## 4. Test Mechanics Panel
1. Click "Mechanics" in sidebar
2. Wait for data to load
3. Click on "Free Spins" (first row)
4. Panel should slide in from right

## 5. Take Screenshot and Check:

### Panel Header Should Be:
- **Background**: Dark gray (`bg-gray-900`)
- **Text**: White, `text-lg` size
- **Close button**: White circle with hover effect

### Panel Content Should Be:
- **Background**: Light gray (`bg-gray-50` in light mode)
- **Sections**: White cards with rounded corners

### Section Headers Should Be:
- **First section (Description)**: Light indigo background (`bg-indigo-100`)
- **Second section (How It Works)**: Light blue background (`bg-blue-100`)
- **Third section**: Light violet background (`bg-violet-100`)
- etc.

---

## What to Look For:

❌ **OLD STYLING** (if you still see this, something is wrong):
- Dark slate header (`#1e293b`)
- Large padding (1.5rem)
- No color on section headers

✅ **NEW STYLING** (what you should see):
- Very dark gray header (`bg-gray-900` = `#111827`)
- Padding: `px-6 py-5` (1.5rem horizontal, 1.25rem vertical)
- Colorful pastel section headers (indigo, blue, violet, cyan, etc.)

---

## Compare

Take a screenshot and send it!
