// Walk all specs, remove the hard-coded `const DB = { ... }` block and
// add `import { DB } from '../helpers/db';` at the right depth.
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve('D:/dev/garnet-team/tests/specs');

/** Recursively list .spec.ts files. */
function walk(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full));
        else if (entry.name.endsWith('.spec.ts')) out.push(full);
    }
    return out;
}

/** Relative import path from a spec file to helpers/db. */
function relImport(specFile) {
    const helpersDir = path.resolve('D:/dev/garnet-team/tests/helpers');
    const dbModule = path.join(helpersDir, 'db');
    let rel = path.relative(path.dirname(specFile), dbModule).replace(/\\/g, '/');
    if (!rel.startsWith('.')) rel = './' + rel;
    return rel;
}

// Capture the inline DB block — single-line OR multi-line — and remove it.
// Match either {...}; on one line or a multi-line block.
const dbBlockRe = /^const\s+DB\s*=\s*\{[\s\S]*?\}\s*;\s*\n?/m;

let touched = 0;
for (const file of walk(ROOT)) {
    let src = fs.readFileSync(file, 'utf-8');
    const m = src.match(dbBlockRe);
    if (!m) continue;

    // Strip the DB block.
    src = src.replace(dbBlockRe, '');

    // Inject import if not already present.
    const importPath = relImport(file);
    const importLine = `import { DB } from '${importPath}';`;
    if (!src.includes("from '" + importPath + "'") && !/from\s+['"][^'"]*\/helpers\/db['"]/.test(src)) {
        // Place right after the last existing `import ... from` line.
        const importMatches = [...src.matchAll(/^import\s.+?$/gm)];
        if (importMatches.length > 0) {
            const last = importMatches[importMatches.length - 1];
            const insertAt = last.index + last[0].length;
            src = src.slice(0, insertAt) + '\n' + importLine + src.slice(insertAt);
        } else {
            src = importLine + '\n' + src;
        }
    }

    fs.writeFileSync(file, src);
    touched++;
    console.log('updated', path.relative('D:/dev/garnet-team/tests', file));
}
console.log(`\n${touched} file(s) updated`);
