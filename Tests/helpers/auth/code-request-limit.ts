import { createHash } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The server caps code requests at 30 per IP per 10 minutes and keeps the counter in a file of the
 * temp dir. Every worker reaches the server from the same IP, so a long run exhausts the cap
 * and the next code request answers 429. A test owns its emails, never the shared IP counter:
 * clear it, which only loosens the cap. A file the server holds at that instant stays and is
 * cleared before the next test.
 */
const LOCAL_IPS = ['127.0.0.1', '::1'];

export function resetCodeRequestIpLimit(): void {
    for (const ip of LOCAL_IPS) {
        const name = `rl_${createHash('md5').update(`email_auth_ip:${ip}`).digest('hex')}.json`;
        try {
            rmSync(join(tmpdir(), name), { force: true });
        } catch {
            // busy: the server is writing it right now
        }
    }
}
