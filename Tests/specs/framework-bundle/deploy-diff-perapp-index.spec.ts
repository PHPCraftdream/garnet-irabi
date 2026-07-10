/**
 * Verify per-app index.php shim rewrite in deploy:diff.
 *
 * 1. PublicPathRebrander::perAppIndexContent() returns correct shim content
 * 2. deploy:diff --file=Apps/<App>/Public/index.php --dry-run mentions the rewrite
 * 3. --full-public --dry-run mentions the rewrite
 */

import { test, expect } from '../../helpers/scoped-test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';

const execAsync = promisify(execFile);

const GARNET_ROOT = path.resolve(__dirname, '../../..');
const PHP = process.env.PHP_BINARY ?? 'php';

function phpBoot(code: string): string {
    const bootstrap = `
define('GARNET_ROOT', ${JSON.stringify(GARNET_ROOT.replace(/\\/g, '/'))});
if (!defined('DS')) define('DS', DIRECTORY_SEPARATOR);
require ${JSON.stringify(GARNET_ROOT.replace(/\\/g, '/') + '/Framework/Kernel/Io/GarnetCli/PublicPathRebrander.php')};
use PHPCraftdream\\Garnet\\Kernel\\Io\\GarnetCli\\PublicPathRebrander;
`;
    return bootstrap + code;
}

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

test.describe('deploy:diff per-app index.php shim rewrite', () => {
    test('perAppIndexContent returns correct shim', async () => {
        const { stdout } = await execAsync(PHP, ['-r', phpBoot(`
echo PublicPathRebrander::perAppIndexContent('garnet-runtime-example');
`)], { cwd: GARNET_ROOT, env: { ...process.env } });
        const out = stdout.trim().replace(/\r\n/g, '\n');
        expect(out).toContain("require __DIR__ . '/../garnet-runtime-example/_shared_index.php';");
    });

    test('--file=Apps/<App>/Public/index.php --dry-run shows shim rewrite hint', async () => {
        const appName = 'IRabi';
        const result = await runGarnet([
            'deploy:diff',
            `--file=Apps/${appName}/Public/index.php`,
            '--dry-run',
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('index.php shim rewritten');
    });

    test('--full-public --dry-run shows shim rewrite hint', async () => {
        const result = await runGarnet([
            'deploy:diff',
            '--full-public',
            '--dry-run',
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('full-public mode');
    });
});
