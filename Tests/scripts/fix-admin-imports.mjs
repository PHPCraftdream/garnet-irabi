// After admin specs moved one level deeper (admin/<sub>/<file>.spec.ts),
// every relative import of `helpers/` needs one extra `../`.
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve('D:/dev/garnet-team/tests/specs/iRabi/admin');

function walk(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full));
        else if (entry.name.endsWith('.spec.ts')) out.push(full);
    }
    return out;
}

let touched = 0;
for (const file of walk(ROOT)) {
    let src = fs.readFileSync(file, 'utf-8');
    const before = src;
    // Only rewrite 3-up `../../../helpers/` → 4-up `../../../../helpers/`.
    src = src.replace(/from\s+(['"])\.\.\/\.\.\/\.\.\/helpers\//g, "from $1../../../../helpers/");
    if (src !== before) {
        fs.writeFileSync(file, src);
        touched++;
        console.log('updated', path.relative('D:/dev/garnet-team/tests', file));
    }
}
console.log(`\n${touched} file(s) updated`);
