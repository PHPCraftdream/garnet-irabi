/**
 * `php garnet deploy:diff --file=PATH` (files mode / point-deploy) tests.
 *
 * Exercises the --file / --files flags in dry-run mode:
 *   1. Missing path → non-zero exit + stderr mentions the path
 *   2. Single Framework PHP file → upload preview, no rspack message
 *   3. public/<App>/ asset → auto-included 4 *Gen.php
 */

import { test, expect } from '../../helpers/scoped-test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';
import * as fs from 'node:fs';

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

test.describe('deploy:diff --file (files mode)', () => {
    test('missing path errors out with clear message', async () => {
        const result = await runGarnet([
            'deploy:diff',
            '--file=does-not-exist.php',
            '--dry-run',
        ]);

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain('does-not-exist.php');
    });

    test('dry-run lists a single Framework PHP file without rspack rebuild', async () => {
        const result = await runGarnet([
            'deploy:diff',
            '--file=Framework/Bundle/Modules/Auth/Middlewares/RegMiddleware.php',
            '--dry-run',
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('RegMiddleware.php');
        expect(result.stdout).toContain('files mode');
        expect(result.stdout).not.toContain('rspack');
        expect(result.stdout).not.toContain('frontend rebuild');
    });

    test('auto-includes 4 *Gen.php when public/* asset is listed', async () => {
        // Asset hashes change on every bundle. Pick the current
        // foreground.foreground.<hash>.gen.js so this test survives the next
        // FrontBuilder run without manual updates.
        const assetDir = path.join(GARNET_ROOT, 'Apps', 'IRabi', 'Public', 'assets', 'irabi', 'gen', 'js');
        const assetFile = fs.readdirSync(assetDir)
            .find(f => /^foreground\.foreground\.[a-f0-9]+\.gen\.js$/.test(f));
        expect(assetFile, 'no foreground.foreground.<hash>.gen.js — rebuild first').toBeTruthy();

        const result = await runGarnet([
            'deploy:diff',
            `--file=Apps/IRabi/Public/assets/irabi/gen/js/${assetFile}`,
            '--dry-run',
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('auto-included');
        expect(result.stdout).toContain('Gen.php');
    });
});
