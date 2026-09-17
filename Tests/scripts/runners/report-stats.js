#!/usr/bin/env node
// Quick stats over a Playwright JSON report — top-N slowest specs/tests/files.
// Includes WALL time per file (using min start / max end across that file's tests),
// to distinguish "file is fat" from "file is fat but already parallel-distributed".
const fs = require('fs');
const path = process.argv[2] || 'test-results/report.json';
const r = JSON.parse(fs.readFileSync(path, 'utf8'));

const tests = [];
function walk(suite, parentFile = '') {
    const file = suite.file ? suite.file.replace(/\\/g, '/') : parentFile;
    for (const s of suite.suites || []) walk(s, file);
    for (const sp of suite.specs || []) {
        for (const t of sp.tests || []) {
            const last = t.results[t.results.length - 1];
            const dur = (t.results || []).reduce((s, x) => s + (x.duration || 0), 0);
            const startTime = last && last.startTime ? new Date(last.startTime).getTime() : 0;
            tests.push({
                file, project: t.projectName, title: sp.title, dur,
                startTime, endTime: startTime + (last ? last.duration : 0),
                status: last ? last.status : 'unknown',
                workerIndex: last ? last.workerIndex : -1,
                retries: (t.results || []).length,
            });
        }
    }
}
for (const s of r.suites || []) walk(s);

const total = tests.reduce((s, t) => s + t.dur, 0);
const wall = (r.stats?.duration || 0) / 1000;

console.log(`Total tests: ${tests.length}  Σdur=${(total/1000).toFixed(1)}s  wall=${wall.toFixed(1)}s  utilization=${(total/(wall*1000)).toFixed(2)}x`);
console.log(`Status: passed=${tests.filter(t=>t.status==='passed').length} failed=${tests.filter(t=>t.status==='failed').length} skipped=${tests.filter(t=>t.status==='skipped').length}`);

const byFile = new Map();
for (const t of tests) {
    const k = `${t.project}::${t.file}`;
    let f = byFile.get(k);
    if (!f) { f = { sumDur: 0, minStart: Infinity, maxEnd: 0, workers: new Set(), tests: 0 }; byFile.set(k, f); }
    f.sumDur += t.dur;
    if (t.startTime) f.minStart = Math.min(f.minStart, t.startTime);
    f.maxEnd = Math.max(f.maxEnd, t.endTime);
    f.workers.add(t.workerIndex);
    f.tests++;
}

console.log('\n=== Top 20 SLOWEST files — sumDur vs wall (= file-level critical path) ===');
console.log('sumDur   wall  workers   tests  project / file');
[...byFile.entries()]
    .sort((a,b) => Math.max(b[1].maxEnd-b[1].minStart, 0) - Math.max(a[1].maxEnd-a[1].minStart, 0))
    .slice(0,20)
    .forEach(([k,f]) => {
        const fileWall = (f.maxEnd - f.minStart) / 1000;
        const [proj, file] = k.split('::');
        const short = file.split('/').slice(-3).join('/');
        console.log(`${(f.sumDur/1000).toFixed(1).padStart(5)}s ${fileWall.toFixed(1).padStart(5)}s   ${String(f.workers.size).padStart(2)}w  ${String(f.tests).padStart(3)}t  [${proj}]  ${short}`);
    });

console.log('\n=== Top 15 SLOWEST single tests ===');
tests.sort((a,b)=>b.dur-a.dur).slice(0,15).forEach(t => {
    const f = t.file.split('/').slice(-2).join('/');
    console.log(`${(t.dur/1000).toFixed(1).padStart(5)}s  [${t.project}]  ${f}  :: ${t.title}`);
});
