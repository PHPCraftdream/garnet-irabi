// After moving FB-module specs from various depths into specs/framework-bundle/{admin,cross-role}/
// (each 2 levels deep from specs/), normalise every relative helpers import.
import * as fs from 'node:fs';
import * as path from 'node:path';

const targets = [
    'D:/dev/garnet-team/tests/specs/framework-bundle',
    'D:/dev/garnet-team/tests/specs/iRabi/admin',
];

function walk(dir) {
    const out = [];
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full));
        else if (entry.name.endsWith('.spec.ts')) out.push(full);
    }
    return out;
}

const helpersDir = path.resolve('D:/dev/garnet-team/tests/helpers');

let touched = 0;
for (const root of targets) {
    for (const file of walk(root)) {
        let src = fs.readFileSync(file, 'utf-8');
        const before = src;

        // Compute correct depth to helpers/
        const fromDir = path.dirname(file);
        let rel = path.relative(fromDir, helpersDir).replace(/\\/g, '/');
        if (!rel.startsWith('.')) rel = './' + rel;

        // Replace any (\.\.\/)+helpers/  →  ${rel}/
        src = src.replace(
            /from\s+(['"])(\.\.\/)+helpers\//g,
            (_m, q) => `from ${q}${rel}/`
        );

        if (src !== before) {
            fs.writeFileSync(file, src);
            touched++;
            console.log('fixed', path.relative('D:/dev/garnet-team/tests', file));
        }
    }
}
console.log(`\n${touched} file(s) updated`);
