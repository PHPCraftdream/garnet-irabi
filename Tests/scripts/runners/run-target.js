#!/usr/bin/env node
// `npm test` entry point — dispatches to a local Playwright run or to the
// remote (prod) orchestrator depending on the configured default target.
// See helpers/target-config.js for how the target is resolved (#395).
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { resolveTarget } = require('../../helpers/target-config');

const APP_ROOT = path.resolve(__dirname, '..', '..', '..');
const passthrough = process.argv.slice(2);

if (resolveTarget() === 'remote') {
    const baseUrl = process.env.PW_REMOTE_BASE_URL || 'https://slotbook.ru';
    console.log(`[run-target] PW_TARGET=remote — routing through 'php garnet test:remote --base-url=${baseUrl}'`);
    const res = spawnSync(
        'php',
        ['garnet', 'test:remote', `--base-url=${baseUrl}`, ...passthrough],
        { stdio: 'inherit', cwd: APP_ROOT, shell: true },
    );
    process.exit(res.status ?? 1);
}

const res = spawnSync('npx', ['playwright', 'test', ...passthrough], { stdio: 'inherit', shell: true });
process.exit(res.status ?? 1);
