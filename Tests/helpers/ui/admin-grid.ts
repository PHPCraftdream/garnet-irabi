import type { Page, Response } from '@playwright/test';

/**
 * AdminGrid searches and sorts on the server: a change of query/sort restarts a
 * 300 ms debounce, then POSTs `{page, perPage, query, sortField, sortDir, …}`.
 * Reading the rows right after `fill()` or a header click sees the old page.
 * These helpers wait for the refetch triggered by the action and for the repaint.
 */
export interface GridRequest {
	page: number;
	perPage: number;
	query?: string;
	sortField?: string | null;
	sortDir?: string;
}

function gridRequest(response: Response): GridRequest | null {
	const request = response.request();
	if (request.method() !== 'POST') return null;
	try {
		const body = JSON.parse(request.postData() ?? '');
		return typeof body?.page === 'number' && typeof body?.perPage === 'number' ? body : null;
	} catch {
		return null;
	}
}

/** Run `trigger` and wait until the grid refetched with matching params and painted the result. */
export async function waitForGridRefetch(
	page: Page,
	trigger: () => Promise<unknown>,
	match: (request: GridRequest) => boolean = () => true,
): Promise<void> {
	const refetched = page.waitForResponse((response) => {
		const request = gridRequest(response);
		return request !== null && match(request);
	});
	await trigger();
	await (await refetched).finished();
	await page.evaluate(() => new Promise<void>((resolve) => {
		requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
	}));
}

/** Type into the grid search box and wait for the filtered page. The value must differ from the current one. */
export async function searchAdminGrid(page: Page, query: string): Promise<void> {
	const search = page.locator('[data-test-id="admin-grid-search"]');
	await waitForGridRefetch(page, () => search.fill(query), (request) => (request.query ?? '') === query);
}

/** Clear the grid search box and wait for the unfiltered page. */
export async function clearAdminGridSearch(page: Page): Promise<void> {
	await searchAdminGrid(page, '');
}
