#!/usr/bin/env node
// Remove `await page.waitForLoadState('networkidle');` lines whose VERY NEXT
// non-blank line is one of:
//   await page.waitForSelector(...)
//   await expect(...).toBeVisible
//   await expect(...).toHaveText / toHaveCount / toBeEnabled / toBeChecked / toContainText
//   await expect.poll(...)
// In each case the following statement already waits on a concrete locator
// or a polling assertion, so the preceding 500ms-quiet wait is redundant.
// All other networkidle calls (alone before db reads, before evaluate, etc.)
// are left intact.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
function walk(dir, out = []) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.name === 'node_modules' || ent.name === 'test-results' || ent.name === 'playwright-report') continue;
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p, out);
        else if (ent.isFile() && (p.endsWith('.spec.ts') || p.endsWith('.ts'))) out.push(p);
    }
    return out;
}

// Safe if the next executable line is itself a Playwright auto-waiting call.
// Auto-waiting means Playwright internally polls the locator until it's
// attached/visible/actionable, so an explicit networkidle before is wasted.
//
//   await <pageVar>.waitForSelector(...)
//   await <pageVar>.locator(...).waitFor(...) / .click() / .fill() / .check() / .type() / .selectOption() / .focus() / .press(...) / .hover() / .dblclick()
//   await <pageVar>.click(...) / .fill(...) / .check(...) / etc. (string-selector shorthands)
//   await <pageVar>.goto(...)
//   await expect(...).any-matcher
//   await expect.poll(...).any-matcher
//   await Promise.all([page.waitForResponse(...), …])  -- waitForResponse drives its own wait
const actVerbs = '(?:click|fill|check|uncheck|type|press|hover|dblclick|focus|blur|tap|selectOption|setInputFiles|waitFor|waitForSelector)';
const safeNextRe = new RegExp(
    String.raw`^\s*await\s+(?:` +
    String.raw`\w+\.(?:waitForSelector|goto|locator\([^)]*\)\.${actVerbs}|${actVerbs})\b` +
    String.raw`|expect(?:\.poll)?\b` +
    String.raw`|Promise\.all\(`+
    String.raw`)`
);

let totalRemoved = 0;
let filesEdited = 0;
for (const file of walk(root)) {
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split('\n');
    let removed = 0;
    const out = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const isIdle = /^\s*await\s+\w+\.waitForLoadState\(\s*['"]networkidle['"]\s*\)\s*;?\s*$/.test(line);
        if (isIdle) {
            // Find next "meaningful" line. Skip blanks, comments, and pure
            // `const/let foo = ...` declarations that don't run any awaits —
            // those are just naming a locator; the wait happens further down.
            let j = i + 1;
            const skipRe = /^\s*(?:\/\/|\/\*|\*|const\s+\w+\s*=(?!.*\bawait\b)|let\s+\w+\s*=(?!.*\bawait\b)|$)/;
            while (j < lines.length && (lines[j].trim() === '' || skipRe.test(lines[j]))) j++;
            const next = j < lines.length ? lines[j] : '';
            if (safeNextRe.test(next)) {
                removed++;
                continue; // drop the line entirely
            }
        }
        out.push(line);
    }
    if (removed > 0) {
        fs.writeFileSync(file, out.join('\n'));
        filesEdited++;
        totalRemoved += removed;
        console.log(`${removed}× ${path.relative(root, file)}`);
    }
}
console.log(`\nFiles edited: ${filesEdited}   Removed networkidle calls: ${totalRemoved}`);
