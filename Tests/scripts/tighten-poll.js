#!/usr/bin/env node
// Adds `intervals: [50, 150, 400]` to every `expect.poll(..., { timeout: N })`
// call that doesn't already have an `intervals:` key. Default Playwright
// polling cadence is [100, 250, 500, 1000], so a `.count()` that flips at
// t=120ms gets noticed at t=250ms — 130ms of pure wait. Tightening shaves
// 50-150ms per poll × ~30 polls across the suite.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'specs');
function walk(dir, out = []) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p, out);
        else if (ent.isFile() && p.endsWith('.spec.ts')) out.push(p);
    }
    return out;
}

let edits = 0;
for (const file of walk(root)) {
    const src = fs.readFileSync(file, 'utf8');
    // Match expect.poll(..., { timeout: N }) where the opts object does NOT
    // contain `intervals`. Use a permissive match — the opts braces don't
    // contain `{` or `}`, so we capture { ... } as a single group.
    const next = src.replace(
        /expect\.poll\(([\s\S]*?),\s*\{\s*([^{}]*?)\}\s*\)/g,
        (m, expr, opts) => {
            if (opts.includes('intervals')) return m;
            const trimmed = opts.trim().replace(/,\s*$/, '');
            const newOpts = trimmed
                ? `{ ${trimmed}, intervals: [50, 150, 400] }`
                : `{ intervals: [50, 150, 400] }`;
            return `expect.poll(${expr}, ${newOpts})`;
        }
    );
    if (next !== src) {
        fs.writeFileSync(file, next);
        edits++;
        console.log('edited:', path.relative(root, file));
    }
}
console.log(`\nTotal files edited: ${edits}`);
