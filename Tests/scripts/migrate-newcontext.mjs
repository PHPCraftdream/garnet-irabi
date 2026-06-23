#!/usr/bin/env node
// Mass-rewrite `browser.newContext(...)` → `newScopedContext(browser, ...)`
// across the spec tree. Required so secondary contexts created by tests
// inherit the X-Test-Worker header under PW_WORKER_ISOLATION=1.
//
// Usage:  node tests/scripts/migrate-newcontext.mjs

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPECS = path.join(ROOT, 'specs');

function listSpecFiles(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) listSpecFiles(full, out);
        else if (e.isFile() && e.name.endsWith('.ts')) out.push(full);
    }
    return out;
}

let touched = 0;
for (const f of listSpecFiles(SPECS)) {
    let src = fs.readFileSync(f, 'utf-8');
    if (!/\bbrowser\.newContext\b/.test(src)) continue;

    const before = src;
    src = src.replace(/\bbrowser\.newContext\(/g, 'newScopedContext(browser, ');
    src = src.replace(/newScopedContext\(browser,\s*\)/g, 'newScopedContext(browser)');
    if (src === before) continue;

    const fileDir = path.dirname(f);
    const target = path.join(ROOT, 'helpers', 'scoped-test');
    let rel = path.relative(fileDir, target).split(path.sep).join('/');
    if (!rel.startsWith('.')) rel = './' + rel;

    const namedRe = /import\s*\{([^}]*)\}\s*from\s*['"`]([^'"`]+scoped-test)['"`]/;
    const m = namedRe.exec(src);
    if (m) {
        const items = m[1].split(',').map((s) => s.trim()).filter(Boolean);
        if (!items.includes('newScopedContext')) {
            items.push('newScopedContext');
            src = src.replace(m[0], `import { ${items.join(', ')} } from '${m[2]}'`);
        }
    } else {
        const lines = src.split(/\r?\n/);
        let insertAt = 0;
        for (let i = 0; i < lines.length; i++) {
            const t = lines[i].trim();
            if (t.startsWith('import ') || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t === '') insertAt = i + 1;
            else break;
        }
        lines.splice(insertAt, 0, `import { newScopedContext } from '${rel}';`);
        src = lines.join('\n');
    }

    fs.writeFileSync(f, src);
    touched++;
    console.log(`[ok] ${path.relative(ROOT, f)}`);
}
console.log(`done — ${touched} files`);
