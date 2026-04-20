import { readFileSync, writeFileSync } from 'fs';

const comparison = JSON.parse(readFileSync('year_comparison.json', 'utf8'));
const master = JSON.parse(readFileSync('game_data_master.json', 'utf8'));
const masterById = Object.fromEntries(master.map(g => [g.id, g]));

function esc(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function scLink(name) {
    const slug = name
        .replace(/['']/g, '')
        .replace(/&/g, 'and')
        .replace(/[^a-zA-Z0-9 ]/g, '')
        .trim()
        .replace(/\s+/g, '-');
    return `https://slotcatalog.com/en/slots/${slug}`;
}

function sraLink(slug) {
    return slug ? `https://slot.report/en/${slug}` : null;
}

function googleLink(name) {
    return `https://www.google.com/search?q=${encodeURIComponent(name + ' slot online release date')}`;
}

// Group and sort by status
const sections = [
    {
        key: 'STRIPPED_NO_RECOVERY',
        title: 'Stripped Claude Years (No External Source Found)',
        color: '#f85149',
        desc: 'These had Claude-guessed years that were stripped. NJ release_year is used as fallback. No SC/SR/slot.report match found.',
    },
    {
        key: 'NO_SOURCE',
        title: 'No Year Source',
        color: '#8b949e',
        desc: 'No original_release_year and no source. NJ release_year used as fallback.',
    },
    {
        key: 'AGS_VERIFIED',
        title: 'AGS Provider Verified',
        color: '#238636',
        desc: 'Year verified from AGS provider Excel data.',
    },
    {
        key: 'EXISTING_SOURCE',
        title: 'Existing Source (SC/SR)',
        color: '#3fb950',
        desc: 'Year from SlotCatalog or SlotReport. ~80% accurate based on AGS calibration.',
    },
];

const gamesBySection = {};
for (const s of sections) gamesBySection[s.key] = [];
for (const r of comparison) {
    if (gamesBySection[r.status]) gamesBySection[r.status].push(r);
}

// Sort each section by provider then name
for (const arr of Object.values(gamesBySection)) {
    arr.sort((a, b) => (a.provider || '').localeCompare(b.provider || '') || (a.name || '').localeCompare(b.name || ''));
}

let globalIdx = 0;

function renderGameCard(r, idx) {
    const g = masterById[r.id] || {};
    const yearDisplay = r.our_year || r.nj_year || '-';
    const sourceDisplay = r.our_source || 'NJ fallback';
    const isStripped = r.status === 'STRIPPED_NO_RECOVERY' || r.status === 'NO_SOURCE';

    const statusBadge = isStripped
        ? '<span style="background:#f85149;color:#fff;padding:2px 8px;border-radius:4px;font-size:0.75em;font-weight:bold;">NEEDS YEAR</span>'
        : r.status === 'AGS_VERIFIED'
          ? '<span style="background:#238636;color:#fff;padding:2px 8px;border-radius:4px;font-size:0.75em;font-weight:bold;">VERIFIED</span>'
          : '<span style="background:#3fb950;color:#000;padding:2px 8px;border-radius:4px;font-size:0.75em;font-weight:bold;">SC/SR</span>';

    let sourcesHtml = '';
    const addSource = (label, year, date, link) => {
        if (!year && !date) return;
        const linkHtml = link ? ` <a href="${esc(link)}" target="_blank" style="color:#58a6ff;font-size:0.8em;">[link]</a>` : '';
        const dateStr = date ? ` (${esc(date)})` : '';
        sourcesHtml += `<div class="dim"><div class="dim-left"><div class="dim-label">${esc(label)}</div><div class="dim-value">${esc(String(year))}${dateStr}${linkHtml}</div></div></div>\n`;
    };

    addSource('Our Year', r.our_year, null, null);
    addSource('Our Source', r.our_source, null, null);
    addSource('NJ Year', r.nj_year, null, null);
    if (r.sr_year) addSource('SlotReport (cache)', r.sr_year, r.sr_date, null);
    if (r.sc_year) addSource('SlotCatalog', r.sc_year, r.sc_date, scLink(r.name));
    if (r.sra_year) addSource('slot.report API', r.sra_year, r.sra_date, sraLink(r.sra_slug));

    return `<div class="game" id="g${idx}-wrap">
<div class="game-header">
  <div class="game-num">${idx + 1}</div>
  <div class="game-name">${esc(r.name)} <span style="color:#8b949e;font-size:0.6em;font-weight:normal;">(${esc(r.provider)})</span> ${statusBadge}</div>
  <div class="game-links">
    <a href="${esc(scLink(r.name))}" target="_blank">SlotCatalog</a>
    <a href="${esc(googleLink(r.name))}" target="_blank">Google</a>
  </div>
</div>
<div class="dims">
${sourcesHtml}
<div class="dim" style="border:1px solid #ffd700;">
  <div class="dim-left">
    <div class="dim-label">Year Decision</div>
    <div class="dim-value" style="color:#ffd700;">${isStripped ? 'NJ fallback: ' + (r.nj_year || 'none') : 'Current: ' + yearDisplay}</div>
  </div>
  <div class="dim-status">
    <button class="btn-ok" onclick="markOk('g${idx}')">OK</button>
    <button class="btn-wrong" onclick="markWrong('g${idx}')">FIX</button>
  </div>
</div>
<input class="correction-input" id="g${idx}-fix" placeholder="Type correct year (e.g. 2019) + optional note..." data-game="${esc(r.name)}" data-provider="${esc(r.provider)}" data-current="${yearDisplay}" data-id="${esc(r.id)}">
</div>
</div>`;
}

let html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Year Review - ${comparison.length} Games</title>
<style>
* { box-sizing: border-box; }
body { font-family: -apple-system, sans-serif; background: #0d1117; color: #e6edf3; max-width: 1400px; margin: 0 auto; padding: 20px; }
h1 { text-align: center; color: #ffd700; margin-bottom: 5px; }
h2 { color: #ffd700; margin: 32px 0 8px; }
.subtitle { text-align: center; color: #8b949e; margin-bottom: 20px; font-size: 0.9em; }
.game { background: #161b22; border-radius: 12px; margin: 16px 0; padding: 20px; border: 1px solid #30363d; }
.game-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.game-num { background: #ffd700; color: #000; font-weight: bold; border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 0.95em; }
.game-name { font-size: 1.3em; font-weight: bold; color: #fff; flex: 1; }
.game-links { display: flex; gap: 8px; }
.game-links a { background: #21262d; color: #58a6ff; padding: 5px 12px; border-radius: 6px; text-decoration: none; font-size: 0.8em; border: 1px solid #30363d; }
.game-links a:hover { background: #30363d; }
.dims { display: flex; flex-direction: column; gap: 4px; }
.dim { padding: 8px 12px; background: #0d1117; border-radius: 6px; border: 1px solid #21262d; display: flex; align-items: center; gap: 12px; }
.dim-left { flex: 1; }
.dim-label { color: #ffd700; font-weight: bold; font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.5px; }
.dim-value { margin-top: 2px; font-size: 0.95em; }
.dim-status { display: flex; gap: 4px; align-items: center; }
.btn-ok, .btn-wrong { border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 0.85em; font-weight: bold; }
.btn-ok { background: #238636; color: #fff; }
.btn-ok:hover { background: #2ea043; }
.btn-ok.active { box-shadow: 0 0 0 2px #238636; }
.btn-wrong { background: #da3633; color: #fff; }
.btn-wrong:hover { background: #f85149; }
.btn-wrong.active { box-shadow: 0 0 0 2px #da3633; }
.correction-input { display: none; margin-top: 6px; width: 100%; padding: 6px 10px; background: #0d1117; border: 1px solid #f85149; border-radius: 4px; color: #fff; font-size: 0.9em; }
.correction-input.visible { display: block; }
.summary-bar { position: fixed; bottom: 0; left: 0; right: 0; background: #161b22; border-top: 2px solid #ffd700; padding: 12px 20px; display: flex; justify-content: center; gap: 20px; align-items: center; z-index: 100; }
.export-btn { background: #ffd700; color: #000; border: none; padding: 8px 24px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 1em; }
.export-btn:hover { background: #ffed4a; }
.section-header { cursor: pointer; user-select: none; display: flex; align-items: center; gap: 8px; }
.section-header:hover { opacity: 0.8; }
.section-count { font-size: 0.7em; color: #8b949e; font-weight: normal; }
.collapsed .section-body { display: none; }
.toggle-arrow { font-size: 0.8em; transition: transform 0.2s; }
.collapsed .toggle-arrow { transform: rotate(-90deg); }
.filter-bar { display: flex; gap: 8px; justify-content: center; margin: 16px 0; flex-wrap: wrap; }
.filter-btn { background: #21262d; color: #c9d1d9; border: 1px solid #30363d; padding: 6px 16px; border-radius: 6px; cursor: pointer; font-size: 0.85em; }
.filter-btn:hover { background: #30363d; }
.filter-btn.active { background: #ffd700; color: #000; border-color: #ffd700; }
</style></head><body>
<h1>Year Review &mdash; ${comparison.length} Games</h1>
<p class="subtitle">
Stripped ${gamesBySection.STRIPPED_NO_RECOVERY?.length || 0} Claude-guessed years |
${gamesBySection.NO_SOURCE?.length || 0} no source |
${gamesBySection.AGS_VERIFIED?.length || 0} AGS verified |
${gamesBySection.EXISTING_SOURCE?.length || 0} SC/SR sourced
</p>
<div class="filter-bar">
  <button class="filter-btn active" onclick="filterSection('all')">All</button>
  <button class="filter-btn" onclick="filterSection('STRIPPED_NO_RECOVERY')">Stripped (${gamesBySection.STRIPPED_NO_RECOVERY?.length || 0})</button>
  <button class="filter-btn" onclick="filterSection('NO_SOURCE')">No Source (${gamesBySection.NO_SOURCE?.length || 0})</button>
  <button class="filter-btn" onclick="filterSection('AGS_VERIFIED')">AGS Verified (${gamesBySection.AGS_VERIFIED?.length || 0})</button>
  <button class="filter-btn" onclick="filterSection('EXISTING_SOURCE')">SC/SR (${gamesBySection.EXISTING_SOURCE?.length || 0})</button>
</div>
`;

for (const sec of sections) {
    const games = gamesBySection[sec.key] || [];
    if (games.length === 0) continue;

    const collapsed = sec.key === 'EXISTING_SOURCE' || sec.key === 'AGS_VERIFIED' ? ' collapsed' : '';

    html += `<div class="section${collapsed}" id="section-${sec.key}" data-section="${sec.key}">
<h2 class="section-header" onclick="toggleSection('${sec.key}')" style="border-left: 4px solid ${sec.color}; padding-left: 12px;">
  <span class="toggle-arrow">&#9660;</span> ${sec.title} <span class="section-count">(${games.length} games)</span>
</h2>
<p style="color:#8b949e;font-size:0.8em;margin:0 0 12px 16px;">${sec.desc}</p>
<div class="section-body">\n`;

    for (const r of games) {
        html += renderGameCard(r, globalIdx);
        globalIdx++;
    }

    html += `</div></div>\n`;
}

html += `
<div class="summary-bar">
  <span id="stats">Reviewed: 0 | OK: 0 | Fix: 0</span>
  <button class="export-btn" onclick="exportResults()">Export Results</button>
</div>
<div style="height: 80px;"></div>
<script>
const state = {};

function markOk(id) {
  state[id] = {status: 'ok'};
  document.querySelector('#' + id + '-wrap .btn-ok').classList.add('active');
  document.querySelector('#' + id + '-wrap .btn-wrong').classList.remove('active');
  document.getElementById(id + '-fix').classList.remove('visible');
  updateStats();
}

function markWrong(id) {
  state[id] = {status: 'wrong', correction: ''};
  document.querySelector('#' + id + '-wrap .btn-wrong').classList.add('active');
  document.querySelector('#' + id + '-wrap .btn-ok').classList.remove('active');
  var input = document.getElementById(id + '-fix');
  input.classList.add('visible');
  input.focus();
  input.onchange = function() { state[id].correction = input.value; };
  input.oninput = function() { state[id].correction = input.value; };
  updateStats();
}

function updateStats() {
  var all = Object.values(state);
  var ok = all.filter(function(s) { return s.status === 'ok'; }).length;
  var fix = all.filter(function(s) { return s.status === 'wrong'; }).length;
  document.getElementById('stats').textContent = 'Reviewed: ' + all.length + ' | OK: ' + ok + ' | Fix: ' + fix;
}

function toggleSection(key) {
  var el = document.getElementById('section-' + key);
  el.classList.toggle('collapsed');
}

function filterSection(key) {
  document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
  event.target.classList.add('active');
  document.querySelectorAll('.section').forEach(function(s) {
    if (key === 'all') {
      s.style.display = '';
    } else {
      s.style.display = s.dataset.section === key ? '' : 'none';
    }
  });
}

function exportResults() {
  var total = Object.keys(state).length;
  var wrong = Object.values(state).filter(function(s) { return s.status === 'wrong'; }).length;
  var ok = Object.values(state).filter(function(s) { return s.status === 'ok'; }).length;

  var text = "YEAR REVIEW RESULTS\\n";
  text += "Date: " + new Date().toISOString().slice(0, 10) + "\\n";
  text += "Reviewed: " + total + " | OK: " + ok + " | Fix: " + wrong + "\\n";
  text += "========================\\n\\n";

  if (wrong > 0) {
    text += "CORRECTIONS:\\n";
    for (var id in state) {
      var s = state[id];
      if (s.status === 'wrong') {
        var input = document.getElementById(id + '-fix');
        var game = input.dataset.game;
        var provider = input.dataset.provider;
        var current = input.dataset.current;
        var gameId = input.dataset.id;
        text += "- ID: " + gameId + " | Game: " + game + " | Provider: " + provider + " | Current: " + current + " | Correct: " + (s.correction || "(not specified)") + "\\n";
      }
    }
    text += "\\n";
  }

  if (ok > 0) {
    text += "CONFIRMED OK:\\n";
    for (var id in state) {
      var s = state[id];
      if (s.status === 'ok') {
        var input = document.getElementById(id + '-fix');
        var game = input.dataset.game;
        text += "- " + game + "\\n";
      }
    }
    text += "\\n";
  }

  text += "========================\\n";
  text += "UNREVIEWED: " + (${comparison.length} - total) + " games\\n";

  var blob = new Blob([text], {type: 'text/plain'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'year_review_results.txt';
  a.click();
}
</script></body></html>`;

writeFileSync('YEAR_REVIEW.html', html);
console.log(`Generated YEAR_REVIEW.html (${(html.length / 1024).toFixed(0)} KB)`);
console.log(`Sections:`);
for (const sec of sections) {
    console.log(`  ${sec.title}: ${(gamesBySection[sec.key] || []).length} games`);
}
