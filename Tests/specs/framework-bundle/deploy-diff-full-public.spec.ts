/**
 * `php garnet deploy:diff --full-public` tests.
 *
 * Three tests:
 *   1. Dry-run prints the full-public marker line (no "no commits selected")
 *   2. Warns when combined with --commit=HEAD
 *   3. Help shows --full-public in FLAGS section
 */

import { test, expect } from '../../helpers/scoped-test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';

const execAsync = promisify(execFile);

const GARNET_ROOT = path.resolve(__dirname, '../../..');

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
