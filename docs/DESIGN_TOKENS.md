# Tailwind Design Tokens - Quick Reference

## 🎨 Color System

### Text Colors
```
Primary Links (Games/Themes/Mechanics):
  Light: text-indigo-600
  Dark:  text-indigo-400
  Hover Light: hover:text-indigo-700
  Hover Dark:  hover:text-indigo-300

Provider Links:
  Light: text-cyan-600
  Dark:  text-cyan-400
  Hover Light: hover:text-cyan-700
  Hover Dark:  hover:text-cyan-300

Numeric Values (Theo Win, Performance):
  Light: text-amber-600
  Dark:  text-amber-400

Strong Text:
  Light: text-gray-900
  Dark:  text-white

Body Text:
  Light: text-gray-700
  Dark:  text-gray-300

Muted/Secondary Text:
  Light: text-gray-500 or text-gray-600
  Dark:  text-gray-400

Very Muted Text:
  Light: text-gray-400
  Dark:  text-gray-500
```

### Background Colors
```
Page Background:
  Light: bg-white
  Dark:  bg-gray-800

Card Background:
  Light: bg-white
  Dark:  bg-gray-800

Table Header:
  Light: bg-gray-50
  Dark:  bg-gray-900

Row Hover:
  Light: hover:bg-gray-50
  Dark:  hover:bg-gray-700/50

Header Hover:
  Light: hover:bg-gray-100
  Dark:  hover:bg-gray-800
```

### Border Colors
```
Subtle Borders:
  Light: border-gray-200
  Dark:  border-gray-700 or border-gray-800

Input Borders:
  Light: border-gray-200
  Hover: hover:border-gray-300
  Focus: focus:border-gray-400
  Dark:  border-gray-700
  Dark Hover: hover:border-gray-600
  Dark Focus: focus:border-gray-500

Dividers:
  Light: divide-gray-200
  Dark:  divide-gray-700
```

---

## 📐 Spacing System

### Padding
```
Table Cells:  px-4 py-3
Cards:        p-6
Headers:      px-6 pt-6 pb-4
Compact:      px-2 py-1
Spacious:     px-6 py-4
```

### Margins
```
Small Gap:    mb-2 or gap-2
Medium Gap:   mb-4 or gap-4
Large Gap:    mb-6 or gap-6
Section Gap:  mb-8
```

### Gaps (Flex/Grid)
```
Tight:   gap-2
Normal:  gap-4
Wide:    gap-6
```

---

## 🔤 Typography System

### Headers
```
Page Title:
  class="text-2xl font-semibold text-gray-900 dark:text-white m-0 mb-1"

Page Subtitle:
  class="text-sm text-gray-500 dark:text-gray-400 m-0"

Table Header:
  class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"

Section Title:
  class="text-lg font-semibold text-gray-900 dark:text-white"
```

### Body Text
```
Regular:
  class="text-sm text-gray-700 dark:text-gray-300"

Small:
  class="text-xs text-gray-600 dark:text-gray-400"

Emphasized:
  class="font-medium"

Strong:
  class="font-semibold"

Numeric:
  class="font-semibold text-amber-600 dark:text-amber-400"
```

---

## 🎯 Component Patterns

### Card Container
```html
<div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
  <!-- Content -->
</div>
```

### Table Container
```html
<table class="w-full">
  <thead class="bg-gray-50 dark:bg-gray-900">
    <tr class="border-b border-gray-200 dark:border-gray-700">
      <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        Column
      </th>
    </tr>
  </thead>
  <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
      <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
        Data
      </td>
    </tr>
  </tbody>
</table>
```

### Search Input
```html
<div class="relative">
  <input 
    type="text" 
    class="pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 hover:border-gray-300 dark:hover:border-gray-600 focus:border-gray-400 dark:focus:border-gray-500 focus:ring-1 focus:ring-gray-400 dark:focus:ring-gray-500 outline-none transition-colors w-56"
    placeholder="Search..."
  />
  <svg class="absolute left-3 top-2.5 w-4 h-4 text-gray-400">
    <!-- Icon -->
  </svg>
</div>
```

### Clickable Link
```html
<span class="text-indigo-600 dark:text-indigo-400 cursor-pointer hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors font-medium">
  Click Me
</span>
```

### Badge (Pills)
```html
<!-- Low/Success -->
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
  Low
</span>

<!-- Medium/Warning -->
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300">
  Medium
</span>

<!-- High/Alert -->
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300">
  High
</span>

<!-- Critical/Danger -->
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">
  Critical
</span>
```

### Button (Primary)
```html
<button class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-md transition-colors">
  Click Me
</button>
```

### Button (Secondary)
```html
<button class="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
  Click Me
</button>
```

---

## 🌙 Dark Mode Classes

Always pair light and dark variants:
```
bg-white dark:bg-gray-800
text-gray-900 dark:text-white
border-gray-200 dark:border-gray-700
hover:bg-gray-50 dark:hover:bg-gray-700/50
```

---

## ⚡ Common Utilities

### Layout
```
flex justify-between items-center
grid grid-cols-1 md:grid-cols-3 gap-6
w-full
overflow-hidden
```

### Sizing
```
w-56     (width: 14rem / 224px)
w-full   (width: 100%)
h-4      (height: 1rem / 16px)
h-10     (height: 2.5rem / 40px)
```

### Positioning
```
relative
absolute left-3 top-2.5
```

### Effects
```
transition-colors
hover:...
focus:...
rounded-md (border-radius: 0.375rem)
rounded-lg (border-radius: 0.5rem)
rounded-full (border-radius: 9999px)
shadow-sm
```

### States
```
cursor-pointer
outline-none
disabled:opacity-50
disabled:cursor-not-allowed
```

---

## 📋 Copy-Paste Templates

### Table Row (Data)
```html
<tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
  <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">1</td>
  <td class="px-4 py-3">
    <span class="text-indigo-600 dark:text-indigo-400 cursor-pointer hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors font-medium">
      Name
    </span>
  </td>
  <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">123</td>
  <td class="px-4 py-3">
    <span class="text-amber-600 dark:text-amber-400 font-semibold">45.67</span>
  </td>
</tr>
```

### Page Header
```html
<div class="border-b border-gray-200 dark:border-gray-800 mb-6">
  <div class="flex justify-between items-center pb-6">
    <div>
      <h2 class="text-2xl font-semibold text-gray-900 dark:text-white m-0 mb-1">
        PAGE NAME <span class="text-gray-500 dark:text-gray-400">(50)</span>
      </h2>
      <p class="text-sm text-gray-500 dark:text-gray-400 m-0">Description here</p>
    </div>
    <!-- Optional: Search or filters -->
  </div>
</div>
```

### Empty State
```html
<tr>
  <td colspan="7" class="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
    No data found
  </td>
</tr>
```

---

## 🎨 Color Palette Reference

### Gray Scale
```
50:  #F9FAFB (lightest)
100: #F3F4F6
200: #E5E7EB
300: #D1D5DB
400: #9CA3AF
500: #6B7280
600: #4B5563
700: #374151
800: #1F2937
900: #111827 (darkest)
```

### Brand Colors
```
Indigo:
  500: #6366F1
  600: #4F46E5 (default)
  700: #4338CA

Cyan:
  600: #0891B2 (default)
  700: #0E7490

Amber:
  600: #D97706 (default)
  700: #B45309
```

---

**Pro Tip**: Save this file for quick reference when building new components! 🚀
