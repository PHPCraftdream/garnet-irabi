// One-shot codemod: replace inline `/dev-login` blocks in cross-role specs
// with a call to the shared `roleLogin(page, role)` helper, and add its import.
// Idempotent — re-running skips files already migrated.
import fs from 'node:fs';

const FILES = [
    'Apps/IRabi/Tests/cross-role/booking-penalty-cancel.spec.ts',
    'Apps/IRabi/Tests/cross-role/booking-refund-flow.spec.ts',
    'Apps/IRabi/Tests/cross-role/expert-cancels-booking.spec.ts',
    'Apps/IRabi/Tests/cross-role/news-book-slot.spec.ts',
    'tests/specs/framework-bundle/admin/mail-log.spec.ts',
    'tests/specs/framework-bundle/admin/static-pages.spec.ts',
    'tests/specs/framework-bundle/cross-role/admin-moderates-support.spec.ts',
    'tests/specs/framework-bundle/cross-role/im-messages.spec.ts',
    'tests/specs/framework-bundle/cross-role/news-feed.spec.ts',
    'tests/specs/framework-bundle/cross-role/support-tickets.spec.ts',
];

// Matches: [const x =] await page.evaluate(async (r…) => { … /dev-login … }, role);
//          if (…) { throw new Error(`Dev[- ]login failed …`); }
const BLOCK = /(?:const\s+\w+\s*=\s*)?await\s+page\.evaluate\(\s*async\s*\(\s*r\b[^)]*\)\s*=>\s*\{[\s\S]*?\/dev-login[\s\S]*?\}\s*,\s*role\s*\)\s*;[\s\S]*?if\s*\([^)]*\)\s*\{[\s\S]*?throw\s+new\s+Error\(`Dev[- ]login failed[\s\S]*?`\)\s*;[\s\S]*?\}/g;

let total = 0;
for (const rel of FILES) {
    if (!fs.existsSync(rel)) { console.log('SKIP (missing):', rel); continue; }
    let src = fs.readFileSync(rel, 'utf8');
    const before = src;

    const count = (src.match(BLOCK) || []).length;
    if (count === 0) {
        console.log('no-block:', rel, src.includes('role-login') ? '(already migrated?)' : '');
        continue;
    }
    src = src.replace(BLOCK, 'await roleLogin(page, role);');

    // Add the import once, reusing the file's existing helpers/ base prefix.
    if (!src.includes("helpers/role-login")) {
        const m = src.match(/from\s+'([^']*helpers)\/[^']+'/);
        const base = m ? m[1] : './helpers';
        const importLine = `import { roleLogin } from '${base}/role-login';\n`;
        // insert after the last top import line
        const lastImport = [...src.matchAll(/^import .*$/gm)].pop();
        if (lastImport) {
            const idx = lastImport.index + lastImport[0].length;
            src = src.slice(0, idx) + '\n' + importLine.trimEnd() + src.slice(idx);
        } else {
            src = importLine + src;
        }
    }

    fs.writeFileSync(rel, src);
    console.log(`migrated ${count} block(s):`, rel);
    total += count;
}
console.log(`\nDone — ${total} block(s) across ${FILES.length} files.`);
