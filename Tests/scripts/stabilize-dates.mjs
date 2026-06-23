// Replace module-level `Date.now()` in test fixture identifiers with
// the worker index — Playwright reloads the module on each retry so
// `Date.now()` would otherwise change between attempts, leaving rows
// from the first try orphaned.
import * as fs from 'node:fs';

const files = [
    'D:/dev/garnet-team/tests/specs/iRabi/batch-slots.spec.ts',
    'D:/dev/garnet-team/tests/specs/iRabi/expert-flow.spec.ts',
    'D:/dev/garnet-team/tests/specs/iRabi/auth/email-auth.spec.ts',
    'D:/dev/garnet-team/tests/specs/framework-bundle/idempotency.spec.ts',
    'D:/dev/garnet-team/tests/specs/iRabi/grid-accounts.spec.ts',
    'D:/dev/garnet-team/tests/specs/iRabi/user-flow.spec.ts',
];

for (const f of files) {
    let src = fs.readFileSync(f, 'utf-8');
    const before = src;
    src = src.replace(
        /\$\{Date\.now\(\)\}@irabi\.test/g,
        '${process.env.TEST_PARALLEL_INDEX ?? "0"}@irabi.test'
    );
    if (src !== before) {
        fs.writeFileSync(f, src);
        console.log('updated', f.split('/').pop());
    } else {
        console.log('no change', f.split('/').pop());
    }
}
