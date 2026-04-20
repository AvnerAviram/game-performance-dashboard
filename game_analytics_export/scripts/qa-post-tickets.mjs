#!/usr/bin/env node
/**
 * Post approved QA tickets to GitHub Issues.
 *
 * Reads markdown files from data/_qa_tickets/ and offers to create
 * GitHub Issues for each one (with confirmation).
 *
 * Usage: npm run qa:post-tickets
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TICKETS_DIR = path.resolve(__dirname, '..', 'data', '_qa_tickets');

function ask(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
        rl.question(question, answer => {
            rl.close();
            resolve(answer.trim().toLowerCase());
        });
    });
}

async function main() {
    if (!fs.existsSync(TICKETS_DIR)) {
        console.log('No ticket drafts found. Run "npm run qa:ai" first.');
        process.exit(0);
    }

    const files = fs.readdirSync(TICKETS_DIR).filter(f => f.endsWith('.md'));
    if (files.length === 0) {
        console.log('No ticket drafts found.');
        process.exit(0);
    }

    console.log(`Found ${files.length} ticket draft(s):\n`);

    let posted = 0;
    for (const file of files) {
        const content = fs.readFileSync(path.join(TICKETS_DIR, file), 'utf8');
        const titleMatch = content.match(/^# (.+)$/m);
        const title = titleMatch ? titleMatch[1] : file.replace('.md', '');
        const severityMatch = content.match(/\*\*Severity:\*\* (\w+)/);
        const severity = severityMatch ? severityMatch[1] : 'MEDIUM';

        console.log(`─── ${file} ───`);
        console.log(`  Title: ${title}`);
        console.log(`  Severity: ${severity}`);
        console.log(`  Preview: ${content.split('\n').slice(0, 3).join(' ').slice(0, 120)}...`);

        const answer = await ask('\n  Post this to GitHub? (y/n/q): ');
        if (answer === 'q') break;
        if (answer !== 'y') {
            console.log('  Skipped.\n');
            continue;
        }

        try {
            const bodyFile = path.join(TICKETS_DIR, file);
            const cmd = `gh issue create --title "${title.replace(/"/g, '\\"')}" --body-file "${bodyFile}" --label "data-qa,ai-flagged"`;
            const result = execSync(cmd, { encoding: 'utf8', cwd: path.resolve(__dirname, '..', '..') });
            console.log(`  Posted: ${result.trim()}`);
            posted++;
        } catch (e) {
            console.log(`  Error posting: ${e.message}`);
        }
        console.log('');
    }

    console.log(`\nDone. Posted ${posted}/${files.length} ticket(s).`);
}

main().catch(e => {
    console.error('Error:', e);
    process.exit(1);
});
