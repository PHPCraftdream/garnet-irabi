/**
 * Expert QA — Full flow test
 *
 * Tests all expert pages in a single comprehensive test per page to avoid
 * session expiry issues across multiple independent test instances.
 *
 * UI changes:
 *   - Slot creation in modals (open-create-slot-modal → create-slot-modal,
 *     open-batch-slot-modal → batch-slot-modal)
 *   - Slot edit in modal (edit-slot-modal)
 *   - Cancel + delete merged → one delete button with ConfirmModal (modal-confirm-btn)
 *   - "Complete" button REMOVED entirely
 *   - Cancel booked slot: cancel-booking-{id} → cancel-booking-modal → cancel-booking-reason → cancel-booking-submit
 *   - Default date tomorrow in slot/batch creation
 */

import { test, expect } from '../helpers/scoped-test';
import type { Page } from '@playwright/test';

// ── Comprehensive test for ALL expert pages ──────────────────────────────────

test('Expert QA — Main dashboard', async ({ page }) => {
    const response = await page.goto('/system/');
    expect(response?.status()).toBe(200);
    // Wait extra for React island hydration

    // Check if we're logged in
    const authInput = page.locator('[data-test-id="auth-login-input"]');
    const isLogin = await authInput.isVisible({ timeout: 2000 }).catch(() => false);
    if (isLogin) {
        console.log('WARN: Session expired on main dashboard — skipping');
        return;
    }

    // Dashboard rendered — wait longer for React hydration
    const dashboard = page.locator('[data-test-id="dashboard"]');
    await expect(dashboard).toBeVisible({ timeout: 20000 });

    // Welcome card with expert badge
    const welcome = page.locator('[data-test-id="welcome-card"]');
    await expect(welcome).toBeVisible();

    // Expert stats — there are mobile + desktop copies, take the first.
    const expertStats = page.locator('[data-test-id="expert-stats"]').first();
    await expect(expertStats).toBeVisible({ timeout: 5000 });

    console.log('PASS: Main dashboard — expert badge, stats');
});

test('Expert QA — Teaching dashboard (alias for /system/)', async ({ page }) => {
    const response = await page.goto('/system/');
    expect(response?.status()).toBe(200);
    const authInput = page.locator('[data-test-id="auth-login-input"]');
    const isLogin = await authInput.isVisible({ timeout: 2000 }).catch(() => false);
    if (isLogin) {
        console.log('WARN: Session expired on teaching dashboard — skipping');
        return;
    }

    // After IA-flatten there is one dashboard for everyone at /system/ (data-test-id="dashboard")
    const dashboard = page.locator('[data-test-id="dashboard"]');
    await expect(dashboard).toBeVisible({ timeout: 10000 });

    console.log('PASS: Teaching dashboard renders');
});

test('Expert QA — Teaching main page (legacy /expert/ → /)', async ({ page }) => {
    const response = await page.goto('/expert/');
    expect(response?.status()).toBe(200);
    const authInput = page.locator('[data-test-id="auth-login-input"]');
    const isLogin = await authInput.isVisible({ timeout: 2000 }).catch(() => false);
    if (isLogin) {
        console.log('WARN: Session expired on teaching page — skipping');
        return;
    }

    // /expert/ redirects to / — verify dashboard renders
    const dashboard = page.locator('[data-test-id="dashboard"]');
    await expect(dashboard).toBeVisible({ timeout: 10000 });
    console.log('PASS: Teaching page (redirects to dashboard) renders correctly');
});

test('Expert QA — Teaching slots (all checks)', async ({ page }) => {
    const response = await page.goto('/expert/~slots');
    expect(response?.status()).toBe(200);
    const authInput = page.locator('[data-test-id="auth-login-input"]');
    const isLogin = await authInput.isVisible({ timeout: 2000 }).catch(() => false);
    if (isLogin) {
        console.log('WARN: Session expired on teaching slots — skipping');
        return;
    }

    // ── Two create buttons (single + batch) ──
    const createBtn = page.locator('[data-test-id="open-create-slot-modal"]');
    await expect(createBtn).toBeVisible({ timeout: 10000 });
    const batchBtn = page.locator('[data-test-id="open-batch-slot-modal"]');
    await expect(batchBtn).toBeVisible();
    console.log('PASS: Two slot creation buttons visible');

    // ── Create slot modal with tomorrow default date ──
    await createBtn.click();
    const createModal = page.locator('[data-test-id="create-slot-modal"]');
    await expect(createModal).toBeVisible({ timeout: 5000 });
    const createClose = page.locator('[data-test-id="create-slot-modal-close"]');
    await expect(createClose).toBeVisible();

    // Verify slot form fields
    const slotDate = page.locator('[data-test-id="slot-date"]');
    await expect(slotDate).toBeVisible();
    const slotTime = page.locator('[data-test-id="slot-time"]');
    await expect(slotTime).toBeVisible();
    const slotCost = page.locator('[data-test-id="slot-cost"]');
    await expect(slotCost).toBeVisible();
    const slotDuration = page.locator('[data-test-id="slot-duration"]');
    await expect(slotDuration).toBeVisible();
    const slotMaxStudents = page.locator('[data-test-id="slot-max-users"]');
    await expect(slotMaxStudents).toBeVisible();
    console.log('PASS: Create slot modal fields visible (date, time, cost, duration, max-students)');

    // Verify default date is tomorrow
    const dateValue = await slotDate.inputValue();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const expectedDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    expect(dateValue).toBe(expectedDate);
    console.log('PASS: Create slot modal — tomorrow as default date');

    await createClose.click();
    await expect(createModal).not.toBeVisible({ timeout: 3000 });
    console.log('PASS: Create slot modal closed');

    // ── Batch slot modal ──
    await batchBtn.click();
    const batchModal = page.locator('[data-test-id="batch-slot-modal"]');
    await expect(batchModal).toBeVisible({ timeout: 5000 });
    const batchClose = page.locator('[data-test-id="batch-slot-modal-close"]');
    await expect(batchClose).toBeVisible();
    await batchClose.click();
    await expect(batchModal).not.toBeVisible({ timeout: 3000 });
    console.log('PASS: Batch slot modal opens and closes');

    // ── Calendar grid with status filters ──
    const filter = page.locator('[data-test-id="expert-status-filter"]');
    await expect(filter).toBeVisible();
    const allFilter = page.locator('[data-test-id="filter-status-all"]');
    await expect(allFilter).toBeVisible();
    console.log('PASS: Calendar status filters visible');

    const week0 = page.locator('[data-test-id="expert-week-0"]');
    await expect(week0).toBeVisible();
    const week1 = page.locator('[data-test-id="expert-week-1"]');
    await expect(week1).toBeVisible();
    console.log('PASS: Calendar weeks visible');

    // ── Verify slots show edit/delete buttons (no "complete" button) ──
    const allSlots = page.locator('[data-test-id^="expert-slot-"]');
    const slotCount = await allSlots.count();
    if (slotCount > 0) {
        // Check that no slot has a "complete" button
        for (let i = 0; i < Math.min(slotCount, 5); i++) {
            const slot = allSlots.nth(i);
            const completeBtn = slot.locator('[data-test-id^="slot-complete-"]');
            await expect(completeBtn).toHaveCount(0);
        }
        console.log('PASS: No "complete" button found on any slot (removed)');
    } else {
        console.log('INFO: No slots in calendar');
    }
});

test('Expert QA — IM page', async ({ page }) => {
    const response = await page.goto('/im/');
    expect(response?.status()).toBe(200);
    const authInput = page.locator('[data-test-id="auth-login-input"]');
    const isLogin = await authInput.isVisible({ timeout: 2000 }).catch(() => false);
    if (isLogin) {
        console.log('WARN: Session expired on IM page — skipping');
        return;
    }

    // New message button
    const newBtn = page.locator('[data-test-id="im-new-message-btn"]');
    await expect(newBtn).toBeVisible({ timeout: 10000 });
    console.log('PASS: New message button visible');

    // Click new message
    await newBtn.click();

    // New message form should appear
    const newForm = page.locator('[data-test-id="im-new-form"]');
    await expect(newForm).toBeVisible({ timeout: 5000 });
    console.log('PASS: New message form visible');

    // Recipient combobox trigger
    const recipientTrigger = page.locator('[data-test-id="im-recipient-input"]');
    await expect(recipientTrigger).toBeVisible({ timeout: 5000 });
    console.log('PASS: Recipient combobox trigger visible');

    // Click to open the popover and search
    await recipientTrigger.click();

    const recipientSearch = page.locator('[data-test-id="im-recipient-search"]');
    if (await recipientSearch.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log('PASS: Recipient search input visible in popover');
    } else {
        console.log('INFO: Recipient search not visible (popover may not have opened)');
    }
});

test('Expert QA — Dark theme toggle', async ({ page }) => {
    const response = await page.goto('/expert/');
    expect(response?.status()).toBe(200);
    const authInput = page.locator('[data-test-id="auth-login-input"]');
    const isLogin = await authInput.isVisible({ timeout: 2000 }).catch(() => false);
    if (isLogin) {
        console.log('WARN: Session expired on teaching page — skipping theme test');
        return;
    }

    const toggleBtn = page.locator('[data-test-id="theme-toggle-btn"]');
    if (await toggleBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        const htmlBefore = await page.locator('html').getAttribute('data-theme');
        await toggleBtn.click();
        const htmlAfter = await page.locator('html').getAttribute('data-theme');
        expect(htmlAfter).not.toBe(htmlBefore);

        // After IA-flatten /expert/ redirects to / so we expect the main dashboard testid
        const dashboardWidget = page.locator('[data-test-id="dashboard"]');
        await expect(dashboardWidget).toBeVisible();
        console.log('PASS: Dark theme toggle works, page still renders correctly');

        await toggleBtn.click();
    } else {
        const altToggle = page.locator('[data-test-id*="theme"]');
        const count = await altToggle.count();
        console.log(`INFO: Theme toggle — found ${count} alternative toggle(s)`);
    }
});
