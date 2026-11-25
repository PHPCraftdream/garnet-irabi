/**
 * `php garnet deploy:diff --full-public` tests.
 *
 * Three tests:
 *   1. Dry-run prints the full-public marker line (no "no commits selected")
 *   2. Warns when combined with --commit=HEAD
 *   3. Help shows --full-public in FLAGS section
 */

import { test, expect } from '../../../../helpers/scoped-test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';
import * as fs from 'node:fs';

const execAsync = promisify(execFile);

const GARNET_ROOT = path.resolve(__dirname, '../../../../..');

// deploy:diff reads WorkDir/ConfigDev/ssh.ini even for --dry-run and fails with
// "host is empty" when no deploy target is configured.
const SSH_INI = path.join(GARNET_ROOT, 'WorkDir', 'ConfigDev', 'ssh.ini');
const SSH_CONFIGURED = (() => {
    try { return /^\s*host\s*=\s*["']?[^"'\s;]/m.test(fs.readFileSync(SSH_INI, 'utf8')); } catch { return false; }
})();

async function runGarnet(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
        const result = await execAsync('php', ['garnet', ...args], {
            cwd: GARNET_ROOT,
            timeout: 60000,
        });
        return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
    } catch (err: any) {
        return {
            stdout: err.stdout ?? '',
            stderr: err.stderr ?? '',
            exitCode: err.code ?? 1,
        };
    }
}

test.describe('deploy:diff --full-public', () => {
    // Help output and the pure PHP unit need no deploy host; the dry-run cases do.
    test.beforeEach(({}, testInfo) => {
        test.skip(!SSH_CONFIGURED && !/help|perAppIndexContent/.test(testInfo.title), 'deploy:diff needs a deploy host in WorkDir/ConfigDev/ssh.ini');
    });
    test('dry-run prints full-public mode line without "no commits selected"', async () => {
        const result = await runGarnet(['deploy:diff', '--full-public', '--dry-run']);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('full-public mode');
        expect(result.stdout).not.toContain('no commits selected');
        expect(result.stdout).toContain('dry-run');
    });

    test('warns when combined with --commit=HEAD', async () => {
        const result = await runGarnet(['deploy:diff', '--full-public', '--commit=HEAD', '--dry-run']);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('full-public mode');
        expect(result.stdout).toContain('warn');
        expect(result.stdout).toContain('--full-public ignores commit selectors');
    });

    test('help shows --full-public in FLAGS section', async () => {
        const result = await runGarnet(['deploy:diff:help']);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('--full-public');
    });
});
