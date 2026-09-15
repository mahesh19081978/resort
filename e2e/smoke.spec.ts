import { test, expect } from '@playwright/test';

/**
 * Phase 2E-A: Initial Browser Smoke Test
 *
 * Establishes that:
 * Browser -> Next.js -> Prisma -> Isolated Neon E2E branch
 * is correctly connected without submitting a booking.
 */
test.describe('Phase 2E-A: Browser Smoke Test (Isolated E2E Environment)', () => {
  test('1. Verify homepage loads successfully', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Infinity Resort/i);
    await expect(page.locator('body')).toBeVisible();
  });

  test('2. Verify Rooms listing displays accommodations', async ({ page }) => {
    await page.goto('/rooms');
    await expect(page).toHaveTitle(/Accommodations/i);
    // Standard Heritage Room should be rendered from the database
    await expect(page.getByText('Standard Heritage Room', { exact: false }).first()).toBeVisible({ timeout: 15000 });
  });

  test('3. Verify Standard Heritage room detail page loads', async ({ page }) => {
    await page.goto('/rooms/standard-heritage-room');
    await expect(page.getByRole('heading', { name: /Standard Heritage Room/i })).toBeVisible({ timeout: 15000 });
    // Verify base price ₹5,500 is rendered
    await expect(page.getByText('5,500', { exact: false }).first()).toBeVisible();
  });

  test('4. Verify public booking flow loads with authoritative pricing', async ({ page }) => {
    await page.goto('/booking');
    await expect(page.getByText('Reservation Details', { exact: false })).toBeVisible({ timeout: 15000 });

    // Verify room selection dropdown contains Standard Heritage Room
    const roomSelect = page.locator('select').filter({ hasText: /Standard Heritage Room/i }).first();
    await expect(roomSelect).toBeVisible({ timeout: 15000 });

    // Verify authoritative pricing preview elements:
    // Room Charges: ₹5,500
    // Tax (12%): ₹660
    // Total: ₹6,160
    await expect(page.getByText('Total Stay Amount', { exact: false })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('₹6,160', { exact: false }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('₹660', { exact: false }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('span:text-is("₹5,500")').first()).toBeVisible({ timeout: 15000 });
  });

  test('5. Verify admin login page renders and rejects invalid credentials', async ({ page }) => {
    await page.goto('/admin/login');
    await expect(page.getByText(/Staff Management Portal/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Infinity Resort/i).first()).toBeVisible({ timeout: 15000 });

    // Test real form controls
    const emailInput = page.locator('input#email-input, input[type="email"]');
    const passwordInput = page.locator('input#password-input, input[type="password"]');
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    // Verify authentication flow works with invalid credentials
    await emailInput.fill('invalid@test.com');
    await passwordInput.fill('wrongpassword');
    await page.locator('button[type="submit"]').click();

    // Verify error notification appears from server
    await expect(page.locator('div[role="alert"]')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Invalid email or password/i)).toBeVisible({ timeout: 10000 });
  });
});
