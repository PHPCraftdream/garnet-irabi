#!/usr/bin/env node
// Wrapper: enable HTML reporter for this playwright run only.
// Used by `npm run test:report` so the default run stays lean (list
// reporter, no HTML write).
process.env.PW_HTML = '1';
const { spawnSync } = require('node:child_process');
const args = ['playwright', 'test', ...process.argv.slice(2)];
const res = spawnSync('npx', args, { stdio: 'inherit', shell: true });
process.exit(res.status ?? 1);
