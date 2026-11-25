/**
 * `php garnet deploy:diff --file=PATH` (files mode / point-deploy) tests.
 *
 * Exercises the --file / --files flags in dry-run mode:
 *   1. Missing path → non-zero exit + stderr mentions the path
 *   2. Single Framework PHP file → upload preview, no rspack message
 *   3. public/<App>/ asset → auto-included *Gen.php
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
// Assets live under Public/assets/<app dir name>/ — the checkout need not be called IRabi.
const APP_ASSETS = path.basename(GARNET_ROOT).toLowerCase();

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
    // Help output and the pure PHP unit need no deploy host; the dry-run cases do.
    test.beforeEach(({}, testInfo) => {
        test.skip(!SSH_CONFIGURED && !/help|perAppIndexContent/.test(testInfo.title), 'deploy:diff needs a deploy host in WorkDir/ConfigDev/ssh.ini');
    });
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
            '--file=vendor/phpcraftdream/garnet-framework/Bundle/Modules/Accounts/Auth/Middlewares/RegMiddleware.php',
            '--dry-run',
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('RegMiddleware.php');
        expect(result.stdout).toContain('files mode');
        expect(result.stdout).not.toContain('rspack');
        expect(result.stdout).not.toContain('frontend rebuild');
    });

    test('auto-includes the *Gen.php files when public/* asset is listed', async () => {
        // Asset hashes change on every bundle. Pick the current
        // foreground.foreground.<hash>.gen.js so this test survives the next
        // FrontBuilder run without manual updates.
        const assetDir = path.join(GARNET_ROOT, 'Public', 'assets', APP_ASSETS, 'gen', 'js');
        const assetFile = fs.readdirSync(assetDir)
            .find(f => /^foreground\.foreground\.[a-f0-9]+\.gen\.js$/.test(f));
        expect(assetFile, 'no foreground.foreground.<hash>.gen.js — rebuild first').toBeTruthy();

        const result = await runGarnet([
            'deploy:diff',
            `--file=Public/assets/${APP_ASSETS}/gen/js/${assetFile}`,
            '--dry-run',
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('auto-included');
        expect(result.stdout).toContain('Gen.php');
    });
});
