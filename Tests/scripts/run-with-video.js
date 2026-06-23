#!/usr/bin/env node
// Wrapper: enable video recording for this playwright run only.
// Used by `npm run test:video` so we don't need cross-env as a dep
// and don't pay the per-test video I/O cost on every default run.
process.env.PW_VIDEO = '1';
const { spawnSync } = require('node:child_process');
const args = ['playwright', 'test', ...process.argv.slice(2)];
const res = spawnSync('npx', args, { stdio: 'inherit', shell: true });
process.exit(res.status ?? 1);
