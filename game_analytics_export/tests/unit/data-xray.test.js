import { describe, it, expect, beforeEach } from 'vitest';

describe('Data X-Ray – universal click interception', () => {
    const GAME_RE = /showGameDetails\(\s*'((?:[^'\\]|\\.)*)'\s*\)/;
    const PROV_RE = /showProviderDetails\(\s*'((?:[^'\\]|\\.)*)'\s*\)/;
    const THEME_RE = /showThemeDetails\(\s*'((?:[^'\\]|\\.)*)'\s*\)/;
    const MECH_RE = /showMechanicDetails\(\s*'((?:[^'\\]|\\.)*)'\s*\)/;
    const VOL_RE = /showVolatilityDetails\(\s*'((?:[^'\\]|\\.)*)'\s*\)/;
    const RTP_BAND_RE = /showRtpBandDetails\(\s*'((?:[^'\\]|\\.)*)'\s*\)/;

    describe('onclick attribute parsing', () => {
        it('extracts game name from standard onclick', () => {
            const onclick = "window.showGameDetails('Buffalo Gold')";
            const m = onclick.match(GAME_RE);
            expect(m).not.toBeNull();
            expect(m[1]).toBe('Buffalo Gold');
        });

        it('extracts game name with escaped single quotes', () => {
            const onclick = "window.showGameDetails('Fortune\\'s Way')";
            const m = onclick.match(GAME_RE);
            expect(m).not.toBeNull();
            expect(m[1].replace(/\\'/g, "'")).toBe("Fortune's Way");
        });

        it('extracts provider name from showProviderDetails', () => {
            const onclick = "window.showProviderDetails('IGT')";
            const m = onclick.match(PROV_RE);
            expect(m).not.toBeNull();
            expect(m[1]).toBe('IGT');
        });

        it('extracts theme name from showThemeDetails', () => {
            const onclick = "window.showThemeDetails('Fantasy')";
            const m = onclick.match(THEME_RE);
            expect(m).not.toBeNull();
            expect(m[1]).toBe('Fantasy');
        });

        it('extracts mechanic name from showMechanicDetails', () => {
            const onclick = "window.showMechanicDetails('Free Spins')";
            const m = onclick.match(MECH_RE);
            expect(m).not.toBeNull();
            expect(m[1]).toBe('Free Spins');
        });

        it('extracts volatility level from showVolatilityDetails', () => {
            const onclick = "window.showVolatilityDetails('High')";
            const m = onclick.match(VOL_RE);
            expect(m).not.toBeNull();
            expect(m[1]).toBe('High');
        });

        it('extracts rtp band from showRtpBandDetails', () => {
            const onclick = "window.showRtpBandDetails('95-96%')";
            const m = onclick.match(RTP_BAND_RE);
            expect(m).not.toBeNull();
            expect(m[1]).toBe('95-96%');
        });

        it('does not cross-match different detail functions', () => {
            expect("window.showProviderDetails('X')".match(GAME_RE)).toBeNull();
            expect("window.showGameDetails('X')".match(PROV_RE)).toBeNull();
            expect("window.showMechanicDetails('X')".match(GAME_RE)).toBeNull();
            expect("window.showVolatilityDetails('X')".match(GAME_RE)).toBeNull();
            expect("window.showRtpBandDetails('X')".match(GAME_RE)).toBeNull();
        });
    });

    describe('data-xray attribute parsing', () => {
        it('parses JSON data-xray attribute', () => {
            const raw = '{"game":"Buffalo Gold","field":"rtp"}';
            const info = JSON.parse(raw);
            expect(info.game).toBe('Buffalo Gold');
            expect(info.field).toBe('rtp');
        });

        it('handles plain string data-xray attribute', () => {
            const raw = 'Buffalo Gold';
            expect(raw.startsWith('{')).toBe(false);
        });
    });

    describe('DOM context extraction', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <table><tbody>
                    <tr>
                        <td onclick="window.showGameDetails('Test Game')">
                            <span data-xray='{"game":"Test Game","field":"name"}'>Test Game</span>
                        </td>
                        <td onclick="window.showGameDetails('Test Game')">
                            <span data-xray='{"game":"Test Game","field":"rtp"}'>96.5%</span>
                        </td>
                        <td onclick="window.showGameDetails('Test Game')">
                            <span data-xray='{"game":"Test Game","field":"theo_win"}'>1.45</span>
                        </td>
                        <td onclick="window.showGameDetails('Test Game')">
                            <span data-xray='{"game":"Test Game","field":"market_share"}'>2.3%</span>
                        </td>
                    </tr>
                </tbody></table>
            `;
        });

        it('finds data-xray on span when clicking span directly', () => {
            const span = document.querySelector('[data-xray]');
            const el = span.closest('[data-xray]');
            expect(el).toBe(span);
            const info = JSON.parse(el.dataset.xray);
            expect(info.game).toBe('Test Game');
            expect(info.field).toBe('name');
        });

        it('finds data-xray child when clicking the td padding', () => {
            const tds = document.querySelectorAll('td');
            const td = tds[1]; // RTP cell
            let el = td.closest('[data-xray]');
            expect(el).toBeNull(); // td has no data-xray
            el = td.querySelector('[data-xray]');
            expect(el).not.toBeNull();
            expect(JSON.parse(el.dataset.xray).field).toBe('rtp');
        });

        it('extracts game from onclick as fallback when no data-xray exists', () => {
            // Simulate a td with onclick but no data-xray child
            document.body.innerHTML = `<table><tr>
                <td id="plain-cell" onclick="window.showGameDetails('Plain Game')">1.23</td>
            </tr></table>`;
            const td = document.getElementById('plain-cell');
            const onclick = td.getAttribute('onclick');
            const m = onclick.match(GAME_RE);
            expect(m).not.toBeNull();
            expect(m[1]).toBe('Plain Game');
        });
    });

    describe('field guessing from text content (tightened)', () => {
        function guessFieldFromText(text) {
            const t = text.trim().toLowerCase();
            if (/^\d{2,3}(\.\d+)?%$/.test(text.trim()) && t.includes('rtp')) return 'rtp';
            if (/^\d+(\.\d+)?%$/.test(text.trim()) && (t.includes('share') || t.includes('market')))
                return 'market_share';
            if (/^(high|medium|low|very\s*high|med-high|low-medium)$/i.test(text.trim())) return 'volatility';
            const yearMatch = text.trim().match(/^(\d{4})$/);
            if (yearMatch) {
                const y = parseInt(yearMatch[1]);
                if (y > 1990 && y < 2030) return 'release_year';
            }
            if (/^\d+\.\d{2}$/.test(text.trim()) && !t.includes('%')) return 'theo_win';
            return null;
        }

        it('guesses volatility from standalone badge text', () => {
            expect(guessFieldFromText('High')).toBe('volatility');
            expect(guessFieldFromText('Medium')).toBe('volatility');
            expect(guessFieldFromText('Very High')).toBe('volatility');
            expect(guessFieldFromText('Med-High')).toBe('volatility');
        });

        it('does NOT false-positive volatility from partial text', () => {
            expect(guessFieldFromText('High roller bonus')).toBeNull();
            expect(guessFieldFromText('Medium to high')).toBeNull();
        });

        it('guesses year from standalone 4-digit number', () => {
            expect(guessFieldFromText('2023')).toBe('release_year');
            expect(guessFieldFromText('2019')).toBe('release_year');
        });

        it('does NOT false-positive year from embedded numbers', () => {
            expect(guessFieldFromText('game-2023-v2')).toBeNull();
        });

        it('guesses theo_win from standalone decimal', () => {
            expect(guessFieldFromText('1.45')).toBe('theo_win');
            expect(guessFieldFromText('29.57')).toBe('theo_win');
        });

        it('does NOT false-positive theo_win from percentage', () => {
            expect(guessFieldFromText('96.50%')).toBeNull();
        });

        it('returns null for unknown text', () => {
            expect(guessFieldFromText('Buffalo')).toBeNull();
            expect(guessFieldFromText('Free Spins')).toBeNull();
        });
    });

    describe('field alias resolution', () => {
        const FIELD_ALIASES = {
            market_share: 'market_share_pct',
            market_share_percent: 'market_share_pct',
        };

        it('resolves market_share to market_share_pct', () => {
            expect(FIELD_ALIASES['market_share']).toBe('market_share_pct');
        });

        it('passes through unknown fields unchanged', () => {
            const field = 'rtp';
            expect(FIELD_ALIASES[field] || field).toBe('rtp');
        });

        it('resolves market_share_percent to market_share_pct', () => {
            expect(FIELD_ALIASES['market_share_percent']).toBe('market_share_pct');
        });
    });

    describe('chart dimension detection', () => {
        function getChartDimension(canvasId, datasetLabel) {
            if (canvasId === 'theme-trend-chart') return 'theme';
            if (canvasId === 'mechanic-trend-chart') return 'feature';
            if (canvasId === 'provider-trend-chart') return 'provider';
            if (/art-trend/i.test(canvasId)) return 'art_theme';
            const ctx = canvasId + ' ' + datasetLabel;
            if (/trend/i.test(ctx)) return 'year';
            if (/art-opportunity|art-themes-chart|chart-art-themes/i.test(canvasId)) return 'art_theme';
            if (canvasId === 'art-mood-chart') return 'art_mood';
            if (canvasId === 'art-characters-chart') return 'art_characters';
            if (canvasId === 'art-elements-chart') return 'art_elements';
            if (canvasId === 'art-narrative-chart') return 'art_narrative';
            if (/provider/i.test(ctx)) return 'provider';
            if (/vol/i.test(ctx)) return 'volatility';
            if (/rtp/i.test(ctx)) return 'rtp';
            if (/mechanic|feature/i.test(ctx)) return 'feature';
            if (/brand|franchise/i.test(ctx)) return 'franchise';
            if (/theme/i.test(ctx)) return 'theme';
            if (/game|scatter|landscape|market/i.test(ctx)) return 'game';
            return null;
        }

        it('detects provider charts', () => {
            expect(getChartDimension('chart-providers', '')).toBe('provider');
            expect(getChartDimension('chart-provider-landscape', '')).toBe('provider');
        });

        it('detects theme charts', () => {
            expect(getChartDimension('chart-themes', '')).toBe('theme');
        });

        it('detects volatility charts', () => {
            expect(getChartDimension('chart-volatility', '')).toBe('volatility');
            expect(getChartDimension('chart-volatility-landscape', '')).toBe('volatility');
        });

        it('detects rtp charts', () => {
            expect(getChartDimension('chart-rtp', '')).toBe('rtp');
            expect(getChartDimension('chart-rtp-landscape', '')).toBe('rtp');
        });

        it('detects feature/mechanic charts', () => {
            expect(getChartDimension('chart-mechanics', '')).toBe('feature');
        });

        it('detects brand charts', () => {
            expect(getChartDimension('chart-brands', '')).toBe('franchise');
            expect(getChartDimension('chart-brand-landscape', '')).toBe('franchise');
        });

        it('overall-trend-chart returns year', () => {
            expect(getChartDimension('overall-trend-chart', '')).toBe('year');
        });

        it('theme-trend-chart returns theme (useDatasetLabel)', () => {
            expect(getChartDimension('theme-trend-chart', 'Animals')).toBe('theme');
        });

        it('mechanic-trend-chart returns feature', () => {
            expect(getChartDimension('mechanic-trend-chart', 'Free Spins')).toBe('feature');
        });

        it('provider-trend-chart returns provider', () => {
            expect(getChartDimension('provider-trend-chart', 'IGT')).toBe('provider');
        });

        it('art charts return correct art dimensions', () => {
            expect(getChartDimension('art-opportunity-chart', '')).toBe('art_theme');
            expect(getChartDimension('art-themes-chart', '')).toBe('art_theme');
            expect(getChartDimension('chart-art-themes', '')).toBe('art_theme');
            expect(getChartDimension('art-mood-chart', '')).toBe('art_mood');
            expect(getChartDimension('art-characters-chart', '')).toBe('art_characters');
            expect(getChartDimension('art-elements-chart', '')).toBe('art_elements');
            expect(getChartDimension('art-narrative-chart', '')).toBe('art_narrative');
        });

        it('art-trend returns art_theme (dynamic dimension)', () => {
            expect(getChartDimension('art-trend-chart', '')).toBe('art_theme');
        });

        it('returns null for unknown canvas IDs', () => {
            expect(getChartDimension('', '')).toBeNull();
            expect(getChartDimension('some-random-canvas', '')).toBeNull();
        });

        it('detects game/scatter/landscape charts', () => {
            expect(getChartDimension('chart-games', '')).toBe('game');
            expect(getChartDimension('chart-scatter', '')).toBe('game');
            expect(getChartDimension('chart-market-landscape', '')).toBe('game');
        });
    });

    describe('isControlElement logic', () => {
        it('skips sidebar nav clicks', () => {
            document.body.innerHTML =
                '<nav id="sidebar"><div id="sidebar"><nav><button id="test-nav">Games</button></nav></div></nav>';
            const btn = document.getElementById('test-nav');
            const isNav = !!btn.closest('#sidebar nav');
            expect(isNav).toBe(true);
        });

        it('skips select/input elements', () => {
            document.body.innerHTML = '<select id="test-select"><option>All</option></select>';
            const sel = document.getElementById('test-select');
            expect(!!sel.closest('select')).toBe(true);
        });
    });

    describe('DOM context: theme panel routing (franchise, volatility, RTP)', () => {
        function detectThemePanelDimension(titleText) {
            const raw = titleText.trim();
            if (raw.startsWith('Brand:')) return { dimension: 'franchise', value: raw.replace('Brand:', '').trim() };
            if (raw.startsWith('RTP:')) return { dimension: 'rtp', value: raw.replace('RTP:', '').trim() };
            if (raw.endsWith('Volatility'))
                return { dimension: 'volatility', value: raw.replace(/\s*Volatility$/, '').trim() };
            return { dimension: 'theme', value: raw };
        }

        it('detects Brand: prefix as franchise', () => {
            const r = detectThemePanelDimension('Brand: Fortune Coin');
            expect(r.dimension).toBe('franchise');
            expect(r.value).toBe('Fortune Coin');
        });

        it('detects RTP: prefix as rtp', () => {
            const r = detectThemePanelDimension('RTP: 95-96%');
            expect(r.dimension).toBe('rtp');
            expect(r.value).toBe('95-96%');
        });

        it('detects Volatility suffix as volatility', () => {
            const r = detectThemePanelDimension('High Volatility');
            expect(r.dimension).toBe('volatility');
            expect(r.value).toBe('High');
        });

        it('falls through to theme for plain names', () => {
            const r = detectThemePanelDimension('Fire');
            expect(r.dimension).toBe('theme');
            expect(r.value).toBe('Fire');
        });

        it('handles "Medium Volatility" correctly', () => {
            const r = detectThemePanelDimension('Medium Volatility');
            expect(r.dimension).toBe('volatility');
            expect(r.value).toBe('Medium');
        });
    });

    describe('DOM context: sub-theme rows', () => {
        it('sub-theme-row class is detected same as theme-row', () => {
            document.body.innerHTML = `
                <table id="themes-table"><tbody>
                    <tr class="theme-row"><td>1</td><td>Asian</td><td>200</td></tr>
                    <tr class="sub-theme-row"><td></td><td>Chinese</td><td>50</td></tr>
                </tbody></table>`;
            const subRow = document.querySelector('.sub-theme-row');
            const inThemesTable = !!subRow.closest('#themes-table');
            const isSubTheme = subRow.classList.contains('sub-theme-row');
            expect(inThemesTable).toBe(true);
            expect(isSubTheme).toBe(true);
            const cells = subRow.querySelectorAll('td');
            expect(cells[1].textContent.trim()).toBe('Chinese');
        });
    });

    describe('NOISE_WORDS filter', () => {
        const NOISE_WORDS = new Set([
            'providers',
            'themes',
            'mechanics',
            'features',
            'games',
            'overview',
            'insights',
            'trends',
            'all',
            'total',
            'avg',
            'count',
            'filter',
            'sort',
            'search',
            'loading',
            'no data',
            'n/a',
        ]);

        it('blocks all known noise words', () => {
            for (const word of NOISE_WORDS) {
                expect(NOISE_WORDS.has(word.toLowerCase())).toBe(true);
            }
        });

        it('does not block legitimate dimension values', () => {
            expect(NOISE_WORDS.has('fire')).toBe(false);
            expect(NOISE_WORDS.has('igt')).toBe(false);
            expect(NOISE_WORDS.has('high')).toBe(false);
            expect(NOISE_WORDS.has('free spins')).toBe(false);
        });
    });

    describe('_label extraction from chart data points', () => {
        function extractLabel(chartDataLabels, dataPoint, datasetLabel) {
            let label = chartDataLabels || dataPoint?._label;
            if (!label) label = datasetLabel;
            if (!label) return null;
            if (/^\+\d+$/.test(label)) return null;
            label = label.replace(/^(?:[^\w\d#]|\p{Emoji_Presentation}|\p{Extended_Pictographic})+/u, '').trim();
            return label || null;
        }

        it('reads _label from data point when chart.data.labels is empty', () => {
            expect(extractLabel(undefined, { x: 1, y: 2, r: 10, _label: 'High' }, 'Volatility')).toBe('High');
        });

        it('prefers chart.data.labels over _label', () => {
            expect(extractLabel('Fire', { _label: 'Theme Fire' }, 'Themes')).toBe('Fire');
        });

        it('falls back to datasetLabel when both are missing', () => {
            expect(extractLabel(undefined, { x: 1, y: 2 }, 'Providers')).toBe('Providers');
        });

        it('returns null for cluster bubbles (+N labels)', () => {
            expect(extractLabel(undefined, { _label: '+5' }, 'brands')).toBeNull();
            expect(extractLabel('+12', {}, 'brands')).toBeNull();
        });

        it('strips emoji prefixes', () => {
            expect(extractLabel('🎲 High Volatility', {}, '')).toBe('High Volatility');
            expect(extractLabel('🏢 IGT', {}, '')).toBe('IGT');
            expect(extractLabel('📐 RTP 95-96%', {}, '')).toBe('RTP 95-96%');
        });

        it('preserves digit-starting labels like "7s"', () => {
            expect(extractLabel('7s', {}, '')).toBe('7s');
            expect(extractLabel(undefined, { _label: '7s' }, '')).toBe('7s');
        });

        it('preserves "#" prefixed labels', () => {
            expect(extractLabel('#1 Game', {}, '')).toBe('#1 Game');
        });
    });

    describe('dimension suffix stripping', () => {
        function stripSuffix(label, dimension) {
            if (dimension === 'volatility') return label.replace(/\s*Volatility$/i, '').trim();
            if (dimension === 'rtp') return label.replace(/^RTP\s*/i, '').trim();
            return label;
        }

        it('strips " Volatility" suffix for volatility dimension', () => {
            expect(stripSuffix('High Volatility', 'volatility')).toBe('High');
            expect(stripSuffix('Medium Volatility', 'volatility')).toBe('Medium');
            expect(stripSuffix('Very High Volatility', 'volatility')).toBe('Very High');
        });

        it('strips "RTP " prefix for rtp dimension', () => {
            expect(stripSuffix('RTP 95-96%', 'rtp')).toBe('95-96%');
            expect(stripSuffix('RTP 96%+', 'rtp')).toBe('96%+');
        });

        it('does not strip for other dimensions', () => {
            expect(stripSuffix('High Volatility', 'theme')).toBe('High Volatility');
            expect(stripSuffix('RTP 95-96%', 'provider')).toBe('RTP 95-96%');
        });

        it('handles labels that are already clean', () => {
            expect(stripSuffix('High', 'volatility')).toBe('High');
            expect(stripSuffix('95-96%', 'rtp')).toBe('95-96%');
        });
    });

    describe('chart-scatter dimension detection with dataset label', () => {
        function getChartDimension(canvasId, datasetLabel) {
            if (canvasId === 'theme-trend-chart') return 'theme';
            if (canvasId === 'mechanic-trend-chart') return 'feature';
            if (canvasId === 'provider-trend-chart') return 'provider';
            const ctx = canvasId + ' ' + datasetLabel;
            if (/trend/i.test(ctx)) return 'year';
            if (/provider/i.test(ctx)) return 'provider';
            if (/vol/i.test(ctx)) return 'volatility';
            if (/rtp/i.test(ctx)) return 'rtp';
            if (/mechanic|feature/i.test(ctx)) return 'feature';
            if (/brand|franchise/i.test(ctx)) return 'franchise';
            if (/theme/i.test(ctx)) return 'theme';
            if (/game|scatter|landscape|market/i.test(ctx)) return 'game';
            return null;
        }

        it('chart-scatter with "Themes" dataset returns theme, not game', () => {
            expect(getChartDimension('chart-scatter', 'Themes')).toBe('theme');
        });

        it('chart-market-landscape with "Themes" dataset returns theme, not game', () => {
            expect(getChartDimension('chart-market-landscape', 'Themes')).toBe('theme');
        });

        it('chart-volatility with "Volatility" dataset returns volatility', () => {
            expect(getChartDimension('chart-volatility', 'Volatility')).toBe('volatility');
        });

        it('chart-brands with "Top Brands" returns franchise', () => {
            expect(getChartDimension('chart-brands', 'Top Brands')).toBe('franchise');
        });

        it('chart-rtp with "RTP Bands" returns rtp', () => {
            expect(getChartDimension('chart-rtp', 'RTP Bands')).toBe('rtp');
        });

        it('overall-trend-chart returns year, specific charts return their dimension', () => {
            expect(getChartDimension('overall-trend-chart', 'Avg Performance Index')).toBe('year');
            expect(getChartDimension('theme-trend-chart', 'Fire')).toBe('theme');
            expect(getChartDimension('mechanic-trend-chart', 'Free Spins')).toBe('feature');
            expect(getChartDimension('provider-trend-chart', 'IGT')).toBe('provider');
        });
    });

    describe('RTP band matching', () => {
        function matchRtpBand(rtp, band) {
            const b = band.trim();
            if (b.startsWith('>')) return rtp > parseFloat(b.replace(/[>%\s]/g, ''));
            if (b.startsWith('<')) return rtp < parseFloat(b.replace(/[<%\s]/g, ''));
            const range = b
                .replace(/%/g, '')
                .split('-')
                .map(s => parseFloat(s.trim()));
            if (range.length === 2 && !isNaN(range[0]) && !isNaN(range[1])) {
                return rtp >= range[0] && rtp <= range[1];
            }
            return Math.abs(rtp - parseFloat(b)) < 0.01;
        }

        it('matches > 97% band', () => {
            expect(matchRtpBand(97.5, '> 97%')).toBe(true);
            expect(matchRtpBand(96.9, '> 97%')).toBe(false);
        });

        it('matches < 93% band', () => {
            expect(matchRtpBand(92.5, '< 93%')).toBe(true);
            expect(matchRtpBand(93.5, '< 93%')).toBe(false);
        });

        it('matches 95-96% range band', () => {
            expect(matchRtpBand(95.5, '95-96%')).toBe(true);
            expect(matchRtpBand(94.9, '95-96%')).toBe(false);
            expect(matchRtpBand(96.0, '95-96%')).toBe(true);
        });

        it('matches 96%-97% range band', () => {
            expect(matchRtpBand(96.5, '96%-97%')).toBe(true);
        });
    });

    describe('ancestor walking for onclick', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <table><tr>
                    <td id="outer" onclick="window.showGameDetails('Outer Game')">
                        <div id="inner"><span id="deep">Click me</span></div>
                    </td>
                </tr></table>
            `;
        });

        it('finds onclick on ancestor td from deeply nested span', () => {
            let el = document.getElementById('deep');
            let found = null;
            for (let i = 0; i < 6 && el; i++) {
                const onclick = el.getAttribute?.('onclick') || '';
                const m = onclick.match(GAME_RE);
                if (m) {
                    found = m[1];
                    break;
                }
                el = el.parentElement;
            }
            expect(found).toBe('Outer Game');
        });
    });

    describe('dimension filter logic', () => {
        const games = [
            {
                name: 'Dragon Emperor',
                theme_consolidated: 'Asian',
                provider_studio: 'IGT',
                features: ['Free Spins', 'Wild Reels'],
                specs_volatility: 'High',
                specs_rtp: 96.5,
                performance_theo_win: 5.2,
                original_release_year: 2022,
                art_theme: 'Temple',
                art_mood: 'Mystical',
                art_characters: ['Dragon', 'Emperor'],
                art_elements: ['Gold', 'Fire'],
                art_narrative: 'Quest',
            },
            {
                name: 'Lucky Panda',
                theme_consolidated: 'Asian',
                provider_studio: 'Aristocrat',
                features: ['Hold and Spin'],
                specs_volatility: 'Medium',
                specs_rtp: 95.0,
                performance_theo_win: 2.1,
                original_release_year: 2023,
                art_theme: 'Forest',
                art_mood: 'Calm',
            },
            {
                name: 'Aztec Gold',
                theme_consolidated: 'Adventure',
                provider_studio: 'IGT',
                features: ['Free Spins'],
                specs_volatility: 'High',
                specs_rtp: 97.5,
                performance_theo_win: 3.0,
                original_release_year: 2022,
            },
        ];

        function filterByDimension(gs, dimension, value) {
            const vl = value.toLowerCase();
            return gs.filter(g => {
                switch (dimension) {
                    case 'theme':
                        return (g.theme_consolidated || '').toLowerCase() === vl;
                    case 'provider':
                        return (g.provider_studio || '').toLowerCase() === vl;
                    case 'feature': {
                        const feats = g.features || [];
                        return feats.some(f => (typeof f === 'string' ? f : f?.name || '').toLowerCase() === vl);
                    }
                    case 'volatility':
                        return (g.specs_volatility || '').toLowerCase() === vl;
                    case 'art_theme':
                        return (g.art_theme || '').toLowerCase() === vl;
                    case 'art_mood':
                        return (g.art_mood || '').toLowerCase() === vl;
                    case 'art_characters': {
                        const chars = g.art_characters || [];
                        return Array.isArray(chars) ? chars.some(c => c.toLowerCase() === vl) : false;
                    }
                    default:
                        return false;
                }
            });
        }

        it('filters by theme', () => {
            const result = filterByDimension(games, 'theme', 'Asian');
            expect(result).toHaveLength(2);
            expect(result.map(g => g.name)).toEqual(['Dragon Emperor', 'Lucky Panda']);
        });

        it('filters by provider', () => {
            const result = filterByDimension(games, 'provider', 'IGT');
            expect(result).toHaveLength(2);
        });

        it('filters by feature', () => {
            const result = filterByDimension(games, 'feature', 'Free Spins');
            expect(result).toHaveLength(2);
            expect(result.map(g => g.name)).toEqual(['Dragon Emperor', 'Aztec Gold']);
        });

        it('filters by volatility', () => {
            const result = filterByDimension(games, 'volatility', 'High');
            expect(result).toHaveLength(2);
        });

        it('filters by art_theme', () => {
            const result = filterByDimension(games, 'art_theme', 'Temple');
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Dragon Emperor');
        });

        it('filters by art_mood', () => {
            const result = filterByDimension(games, 'art_mood', 'Calm');
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Lucky Panda');
        });

        it('filters by art_characters (array)', () => {
            const result = filterByDimension(games, 'art_characters', 'Dragon');
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Dragon Emperor');
        });

        it('case-insensitive matching', () => {
            expect(filterByDimension(games, 'theme', 'asian')).toHaveLength(2);
            expect(filterByDimension(games, 'theme', 'ASIAN')).toHaveLength(2);
        });

        it('returns empty for non-matching value', () => {
            expect(filterByDimension(games, 'theme', 'Sci-Fi')).toHaveLength(0);
        });

        it('dimension + year intersection', () => {
            const asian = filterByDimension(games, 'theme', 'Asian');
            const asian2022 = asian.filter(g => g.original_release_year === 2022);
            expect(asian2022).toHaveLength(1);
            expect(asian2022[0].name).toBe('Dragon Emperor');
        });

        it('trend year captures trendYear from chart context', () => {
            function extractFromChartMock(canvasId, chartLabels, datasetIndex, elementIndex) {
                let dimension = null;
                let trendYear = null;
                let useDatasetLabel = false;

                if (canvasId === 'theme-trend-chart') {
                    dimension = 'theme';
                    useDatasetLabel = true;
                    trendYear = chartLabels[elementIndex];
                } else if (canvasId === 'mechanic-trend-chart') {
                    dimension = 'feature';
                    useDatasetLabel = true;
                    trendYear = chartLabels[elementIndex];
                } else if (canvasId === 'provider-trend-chart') {
                    dimension = 'provider';
                    useDatasetLabel = true;
                    trendYear = chartLabels[elementIndex];
                }

                return { dimension, trendYear, useDatasetLabel };
            }

            const labels = [2019, 2020, 2021, 2022, 2023];
            const r1 = extractFromChartMock('theme-trend-chart', labels, 0, 3);
            expect(r1.dimension).toBe('theme');
            expect(r1.trendYear).toBe(2022);

            const r2 = extractFromChartMock('mechanic-trend-chart', labels, 0, 4);
            expect(r2.dimension).toBe('feature');
            expect(r2.trendYear).toBe(2023);

            const r3 = extractFromChartMock('provider-trend-chart', labels, 0, 0);
            expect(r3.dimension).toBe('provider');
            expect(r3.trendYear).toBe(2019);
        });
    });
});
