#!/usr/bin/env node
/**
 * Interactive test runner - choose which suite to run.
 * E2E, Alignment, and Visual tests start a server on 8000 automatically.
 * Auto-creates screenshot baselines on first run; suggests update if tests fail.
 */
const { spawn } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const SNAPSHOT_DIR = 'tests/playwright-consolidated.spec.js-snapshots';

// Use list reporter so Playwright exits (html reporter keeps process alive on failure)
const pwArgs = ['playwright', 'test', 'tests/playwright-consolidated.spec.js', '--project=chromium', '--reporter=list'];

function hasBaselines() {
  try {
    const dir = path.join(process.cwd(), SNAPSHOT_DIR);
    if (!fs.existsSync(dir)) return false;
    const files = fs.readdirSync(dir);
    return files.some((f) => f.endsWith('.png'));
  } catch {
    return false;
  }
}

const MENU = `
  What would you like to run?

    1) Unit + Integration (vitest) - formulas, filters, CSV, validation
    2) Playwright (E2E + Alignment + Visual) - one server start, all browser tests
    3) All (vitest + Playwright)

  Choice (1-3): `;

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer?.trim() || ''));
  });
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      shell: true,
      ...opts,
    });
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Exit ${code}`))));
    child.on('error', reject);
  });
}

async function runPlaywrightWithRetry(projectDir, npx, args = pwArgs) {
  try {
    await run(npx, args, { cwd: projectDir });
  } catch (e) {
    if (hasBaselines()) {
      const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise((res) => {
        rl2.question('\n💡 Update screenshot baselines? (y/n): ', (a) => {
          rl2.close();
          res((a || '').trim().toLowerCase());
        });
      });
      if (answer === 'y' || answer === 'yes') {
        await run(npx, [...args, '--update-snapshots'], { cwd: projectDir });
        return;
      }
    }
    throw e;
  }
}

async function main() {
  const choice = await prompt(MENU);
  rl.close();

  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const projectDir = process.cwd();

  switch (choice) {
    case '1': {
      console.log('\n▶ Running unit + integration tests (vitest)...\n');
      await run('npm', ['run', 'test:vitest'], { cwd: projectDir });
      break;
    }
    case '2': {
      const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
      if (!hasBaselines()) {
        const answer = await new Promise((res) => {
          rl2.question('\n⚠️  No screenshot baselines found. Create them? (y/n): ', (a) => {
            rl2.close();
            res((a || '').trim().toLowerCase());
          });
        });
        if (answer === 'y' || answer === 'yes') {
          console.log('\n▶ Creating baselines...\n');
          await run(npx, [...pwArgs, '--update-snapshots'], { cwd: projectDir });
        } else {
          console.log('\nSkipping Playwright. Run later with: npm run test:playwright:update\n');
        }
      } else {
        const answer = await new Promise((res) => {
          rl2.question('\n▶ Run E2E tests? (y=run / u=update baselines / n=skip): ', (a) => {
            rl2.close();
            res((a || '').trim().toLowerCase());
          });
        });
        if (answer === 'n' || answer === 'no') {
          console.log('\nSkipping Playwright.\n');
        } else if (answer === 'u' || answer === 'update') {
          console.log('\n▶ Updating baselines...\n');
          await run(npx, [...pwArgs, '--update-snapshots'], { cwd: projectDir });
        } else {
          console.log('\n▶ Running Playwright...\n');
          await runPlaywrightWithRetry(projectDir, npx, pwArgs);
        }
      }
      break;
    }
    case '3': {
      console.log('\n▶ Running all test suites...\n');
      await run('npm', ['run', 'test:vitest'], { cwd: projectDir });
      console.log('\n---\n');
      if (!hasBaselines()) {
        const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise((res) => {
          rl2.question('\n⚠️  No screenshot baselines found. Create them? (y/n): ', (a) => {
            rl2.close();
            res((a || '').trim().toLowerCase());
          });
        });
        if (answer === 'y' || answer === 'yes') {
          console.log('\n▶ Creating baselines...\n');
          await run(npx, [...pwArgs, '--update-snapshots'], { cwd: projectDir });
        } else {
          console.log('\nSkipping Playwright. Run later with: npm run test:playwright:update\n');
        }
      } else {
        const rl3 = readline.createInterface({ input: process.stdin, output: process.stdout });
        const ans = await new Promise((res) => {
          rl3.question('\n▶ Run E2E tests? (y=run / u=update baselines / n=skip): ', (a) => {
            rl3.close();
            res((a || '').trim().toLowerCase());
          });
        });
        if (ans === 'n' || ans === 'no') {
          console.log('\nSkipping Playwright.\n');
        } else if (ans === 'u' || ans === 'update') {
          console.log('\n▶ Updating baselines...\n');
          await run(npx, [...pwArgs, '--update-snapshots'], { cwd: projectDir });
        } else {
          await runPlaywrightWithRetry(projectDir, npx, pwArgs);
        }
      }
      break;
    }
    default:
      console.log('Invalid choice. Run again and pick 1-3.');
      process.exit(1);
  }

  console.log('\n✅ Done.\n');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
