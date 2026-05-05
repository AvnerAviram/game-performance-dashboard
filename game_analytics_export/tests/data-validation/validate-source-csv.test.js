import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const SOURCES_DIR = resolve(import.meta.dirname, '../../data/sources');
const OLD_CSV = resolve(SOURCES_DIR, 'eilers_nov25.csv');
const NEW_TSV = resolve(SOURCES_DIR, 'eilers_mar26.tsv');

const EXPECTED_COLUMNS = [
    'Month of Data Date',
    'State On/Off',
    'Index',
    'Game Name',
    'Parent Supplier',
    'Game Category',
    'Month, Year of OGPD Release Date',
    'Casinos (Sites)',
    'Avg. Average Bet',
    'Median Avg Bet',
    'Avg. Games Played Index',
    'Avg. Coin In Index',
    'Theo Win Index',
    'Avg. Theo Win Index Game Category',
    '% of Total GGR',
];

function parseOldCsv(path) {
    const raw = readFileSync(path, 'utf-8');
    const lines = raw
        .replace(/^\uFEFF/, '')
        .split('\n')
        .filter(l => l.trim());
    return lines;
}

function parseNewTsv(path) {
    const buf = readFileSync(path);
    const hasBOM = buf[0] === 0xff && buf[1] === 0xfe;
    const decoded = buf.toString('utf16le');
    const clean = hasBOM ? decoded.slice(1) : decoded;
    const lines = clean.split(/\r?\n/).filter(l => l.trim());
    return lines;
}

describe('Source CSV/TSV Archive Integrity', () => {
    test('old CSV (eilers_nov25.csv) exists and is readable', () => {
        expect(existsSync(OLD_CSV)).toBe(true);
        const lines = parseOldCsv(OLD_CSV);
        expect(lines.length).toBeGreaterThan(4500);
    });

    test('new TSV (eilers_mar26.tsv) exists and is UTF-16 LE with BOM', () => {
        expect(existsSync(NEW_TSV)).toBe(true);
        const buf = readFileSync(NEW_TSV);
        expect(buf[0]).toBe(0xff);
        expect(buf[1]).toBe(0xfe);
    });

    test('new TSV is TAB-delimited with expected row count', () => {
        const lines = parseNewTsv(NEW_TSV);
        expect(lines.length).toBeGreaterThan(5000);
        const firstDataRow = lines[1];
        const tabs = (firstDataRow.match(/\t/g) || []).length;
        expect(tabs).toBe(EXPECTED_COLUMNS.length - 1);
    });

    test('old CSV has expected column count', () => {
        const lines = parseOldCsv(OLD_CSV);
        const header = lines[0];
        const commaCount = (header.match(/,/g) || []).length;
        expect(commaCount).toBeGreaterThanOrEqual(EXPECTED_COLUMNS.length - 2);
    });

    test('new TSV headers match expected columns', () => {
        const lines = parseNewTsv(NEW_TSV);
        const headers = lines[0].split('\t').map(h => h.trim());
        for (const col of EXPECTED_COLUMNS) {
            const found = headers.some(h => h.includes(col) || col.includes(h));
            expect(found, `Missing column: ${col}`).toBe(true);
        }
    });

    test('new TSV has no completely empty rows in data section', () => {
        const lines = parseNewTsv(NEW_TSV);
        const dataLines = lines.slice(1);
        const emptyRows = dataLines.filter(l => l.split('\t').every(c => !c.trim()));
        expect(emptyRows.length).toBe(0);
    });

    test('new TSV Game Name column has no empty values (except garbage rows)', () => {
        const lines = parseNewTsv(NEW_TSV);
        const headers = lines[0].split('\t').map(h => h.trim());
        const nameIdx = headers.findIndex(h => h === 'Game Name');
        expect(nameIdx).toBeGreaterThan(-1);

        const dataLines = lines.slice(1);
        const emptyNames = dataLines.filter(l => {
            const cols = l.split('\t');
            return !cols[nameIdx]?.trim();
        });
        expect(emptyNames.length).toBeLessThan(5);
    });
});
