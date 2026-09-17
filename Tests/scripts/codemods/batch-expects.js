#!/usr/bin/env node
// Find runs of ≥2 consecutive `await expect(...).<polling-matcher>(...)` lines
// at the same indentation and collapse them into a single
// `await Promise.all([...])` block. Polling matchers run their own timeout
// loop, so serial calls add up sequentially; in Promise.all they share
// wall time, capping at max(polls) instead of sum.
//
// Conservative rules — only collapse when ALL lines in the run:
//   - start with the SAME indent prefix
//   - match `^${indent}await expect(...)` — full line, no trailing branch
//   - end with a recognised polling matcher: toBeVisible, toBeHidden,
//     toBeAttached, toBeEnabled, toBeDisabled, toBeChecked, toBeEditable,
//     toBeFocused, toBeInViewport, toBeEmpty, toHaveText, toHaveAttribute,
//     toHaveCount, toHaveValue, toContainText, toHaveClass, toHaveCSS,
//     toHaveURL, toHaveTitle, toHaveScreenshot ... including `.not.X`.
//
// Skip the run entirely if any of:
//   - It's only 1 line.
//   - One of the lines straddles multiple physical lines (we want
//     single-line statements only — keeps the rewrite syntactically safe).
//   - There's an explicit `;` followed by anything other than the inline
//     comment shape we expect.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'specs');

const matchers = [
    'toBeVisible', 'toBeHidden', 'toBeAttached',
    'toBeEnabled', 'toBeDisabled', 'toBeChecked',
    'toBeEditable', 'toBeFocused', 'toBeInViewport', 'toBeEmpty',
    'toHaveText', 'toHaveAttribute', 'toHaveCount', 'toHaveValue',
    'toContainText', 'toHaveClass', 'toHaveCSS', 'toHaveURL', 'toHaveTitle',
];
const matcherAlt = matchers.join('|');
// `await expect(<expr>).(not\.)?<matcher>(<args>);?` -- single line
const lineRe = new RegExp(
    `^(\\s*)await\\s+expect\\(.+\\)\\.(?:not\\.)?(?:${matcherAlt})\\(.*\\)\\s*;?\\s*$`
);

function walk(dir, out = []) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p, out);
        else if (ent.isFile() && p.endsWith('.spec.ts')) out.push(p);
    }
    return out;
}

let totalRuns = 0;
let totalLines = 0;
let filesEdited = 0;

for (const file of walk(root)) {
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split('\n');
    const out = [];
    let i = 0;
    let mutated = false;
    while (i < lines.length) {
        const m = lines[i].match(lineRe);
        if (!m) { out.push(lines[i]); i++; continue; }
        const indent = m[1];
        // Greedy collect contiguous siblings with same indent. Allow
        // blank lines and single-line `//` comments between sibling
        // awaits — those just narrate the next assertion and don't run
        // anything. Reject anything else (statements, control flow,
        // multi-line comments, JSX) — those break the parallel-safety
        // assumption (sibling tests must be evaluated against the same
        // point-in-time DOM).
        const run = [];          // matched expect lines
        const filler = [];       // collected blanks/comments to re-emit between them
        let j = i;
        while (j < lines.length) {
            const m2 = lines[j].match(lineRe);
            if (m2 && m2[1] === indent) {
                run.push({ line: lines[j], filler: filler.slice() });
                filler.length = 0;
                j++;
                continue;
            }
            const t = lines[j].trim();
            // Allow blank lines and single-line `// ...` comments at any
            // indent — they're cosmetic.
            if (t === '' || t.startsWith('//')) {
                filler.push(lines[j]);
                j++;
                continue;
            }
            break;
        }
        if (run.length >= 2) {
            // Build the Promise.all block. Each captured expect line
            // becomes one entry; inter-line comments that originally
            // sat between siblings are re-emitted on their own lines
            // inside the array so authorial intent isn't lost.
            out.push(`${indent}await Promise.all([`);
            for (const entry of run) {
                for (const fil of entry.filler) out.push(fil);
                let body = entry.line.slice(indent.length);
                body = body.replace(/^await\s+/, '');
                body = body.replace(/;\s*$/, '');
                out.push(`${indent}\t${body},`);
            }
            out.push(`${indent}]);`);
            mutated = true;
            totalRuns++;
            totalLines += run.length;
            i = j;
        } else {
            out.push(lines[i]);
            i++;
        }
    }
    if (mutated) {
        const next = out.join('\n');
        // Sanity-check: the rewrite must still parse. Some files have
        // multi-line `expect(...)` calls whose closing paren and matcher
        // sit on different physical lines; my single-line regex won't
        // collapse those, but a sibling line above/below could land in a
        // greedy run that then accidentally swallows the multi-line
        // call's trailing bracket. node --check is the cheapest
        // off-the-shelf JS parser — TS specifics aren't an issue here
        // because the lines we touch contain no type syntax.
        const prev = fs.readFileSync(file, 'utf8');
        fs.writeFileSync(file, next);
        const res = require('child_process').spawnSync(
            process.execPath, ['--check', file], { encoding: 'utf8' }
        );
        if (res.status !== 0) {
            fs.writeFileSync(file, prev);
            console.log('SKIPPED (syntax broke):', path.relative(root, file));
            continue;
        }
        filesEdited++;
        const rel = path.relative(root, file);
        console.log('edited:', rel);
    }
}
console.log(`\nFiles edited: ${filesEdited}   Runs collapsed: ${totalRuns}   Lines folded: ${totalLines}`);
