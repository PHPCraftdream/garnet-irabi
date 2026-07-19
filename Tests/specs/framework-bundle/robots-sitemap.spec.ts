/**
 * SEO hygiene: /robots.txt and /sitemap.xml must be served at the domain
 * root (NOT under /system), without auth, with correct Content-Types.
 *
 * Regression for content audit 15-content-copywriting-seo.md findings:
 *   - M-1: no robots.txt existed — /robots.txt fell through to the HTML
 *     404 handler.
 *   - M-2: no sitemap.xml existed. The sitemap must be DYNAMIC (generated
 *     from published static pages) so it can't rot when an owner edits
 *     content via the Dashboard.
 *
 * What this guards:
 *   1. GET /robots.txt → 200, text/plain, contains `User-agent: *` and an
 *      absolute `Sitemap: <host>/sitemap.xml` line.
 *   2. GET /sitemap.xml → 200, application/xml, well-formed <urlset>, with
 *      an absolute <loc> for every published static page reachable by an
 *      anonymous visitor (home/terms/privacy/cookies).
 *   3. Both endpoints respond to an unauthenticated request (no storage
 *      state on the request context).
 *   4. Both are served from the domain root, not /system/robots.txt —
 *      verified by the literal request paths below.
 *
 * The request context carries the X-Test-Worker header so the sitemap's
 * StaticPagesService read targets the per-worker seeded tables (where the
 * 4 canonical pages exist), exactly like every other DB-touching spec.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:8001';
const WORKER = process.env.TEST_PARALLEL_INDEX ?? '0';

const scopeHeaders = () => ({ 'X-Test-Worker': WORKER });

test.describe('SEO: robots.txt and sitemap.xml', () => {
    test('/robots.txt is served at root, text/plain, with a sitemap reference', async ({ request }) => {
        const res = await request.get(`${BASE}/robots.txt`, { headers: scopeHeaders() });

        expect(res.status(), `expected 200 for /robots.txt`).toBe(200);

        const contentType = res.headers()['content-type'] ?? '';
        expect(
            contentType,
            `expected text/plain content-type, got '${contentType}'`,
        ).toMatch(/^text\/plain/i);

        const body = await res.text();

        // Core directives.
        expect(body).toContain('User-agent: *');
        expect(body).toContain('Allow: /');

        // The functional/personal app surface lives under /system — keep it
        // out of the index. (See RobotsController docblock for rationale.)
        expect(body).toMatch(/Disallow:\s*\/system\/?/);

        // Absolute sitemap reference — host must come from app.ini base_url,
        // never hardcoded. Only assert the shape, not the literal host, so
        // the spec is portable across dev/test/prod base URLs.
        expect(body).toMatch(/Sitemap:\s+https?:\/\/[^\s]+\/sitemap\.xml/);
    });

    test('/sitemap.xml is valid XML listing every published page with absolute URLs', async ({ request }) => {
        const res = await request.get(`${BASE}/sitemap.xml`, { headers: scopeHeaders() });

        expect(res.status(), `expected 200 for /sitemap.xml`).toBe(200);

        const contentType = res.headers()['content-type'] ?? '';
        expect(
            contentType,
            `expected application/xml (or text/xml) content-type, got '${contentType}'`,
        ).toMatch(/^(application|text)\/xml/i);

        const body = await res.text();

        // Well-formed urlset with the standard sitemap namespace.
        expect(body).toContain('<urlset');
        expect(body).toContain('http://www.sitemaps.org/schemas/sitemap/0.9');
        expect(body.trim().endsWith('</urlset>')).toBe(true);

        // Extract every <loc> so assertions are precise and the failure
        // message shows the actual set when something drifts.
        const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
        expect(locs.length, `expected at least 4 <loc> entries, got ${locs.length}`).toBeGreaterThanOrEqual(4);

        // Every <loc> must be an absolute URL (host from app.ini base_url).
        for (const loc of locs) {
            expect(loc, `loc is not an absolute URL: '${loc}'`).toMatch(/^https?:\/\//);
        }

        // One absolute loc per published, anon-reachable page. home is served
        // at the bare root; the rest at /page/view~{slug}.
        const absHost = String.raw`https?://[^/]+`;
        expect(locs, `missing home loc (/)`).toContainEqual(expect.stringMatching(new RegExp(`^${absHost}/$`)));
        expect(locs, `missing terms loc`).toContainEqual(expect.stringMatching(new RegExp(`^${absHost}/page/view~terms$`)));
        expect(locs, `missing privacy loc`).toContainEqual(expect.stringMatching(new RegExp(`^${absHost}/page/view~privacy$`)));
        expect(locs, `missing cookies loc`).toContainEqual(expect.stringMatching(new RegExp(`^${absHost}/page/view~cookies$`)));
    });

    test('both endpoints are reachable anonymously (no auth state)', async ({ request }) => {
        // A bare APIRequestContext (no storageState, no cookies) stands in
        // for a search-engine crawler. Both must return 2xx without login.
        const robots = await request.get(`${BASE}/robots.txt`, { headers: scopeHeaders() });
        const sitemap = await request.get(`${BASE}/sitemap.xml`, { headers: scopeHeaders() });

        expect(robots.status()).toBe(200);
        expect(sitemap.status()).toBe(200);
    });
});
