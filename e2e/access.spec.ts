import { test, expect, Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.e2e'), override: true });

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

async function loginAsAdmin(page: Page): Promise<void> {
  const password = process.env.DEV_ADMIN_PASSWORD || '12345678';
  await page.goto('/admin/login');
  await page.waitForLoadState('networkidle');
  const emailInput = page.locator('input[type="email"]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  await emailInput.fill('admin@e2e-resort.test');
  await passwordInput.fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/admin/dashboard', { timeout: 25000 });
}

test.describe.serial('RBAC & Security Console Browser Verification (/admin/access)', () => {
  let sharedPage: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    sharedPage = await context.newPage();
    await loginAsAdmin(sharedPage);
  });

  test.afterAll(async () => {
    await sharedPage.context().close();
    await prisma.$disconnect();
  });

  test('1. /admin/access loads with KPI cards and tab navigation', async () => {
    await sharedPage.goto('/admin/access');
    await sharedPage.waitForLoadState('networkidle');
    await expect(sharedPage.getByRole('heading', { name: 'RBAC & Security' })).toBeVisible({ timeout: 15000 });
    await expect(sharedPage.getByText('SECURITY CONSOLE')).toBeVisible();
    await expect(sharedPage.getByText('+ Add Staff User')).toBeVisible();
    await expect(sharedPage.getByText('Total Staff Users')).toBeVisible();
    await expect(sharedPage.getByText('Active Users')).toBeVisible();
    await expect(sharedPage.getByText('System Roles')).toBeVisible();
    await expect(sharedPage.getByText('Security Events Today')).toBeVisible();
    await expect(sharedPage.getByRole('button', { name: /Users/i, exact: false }).first()).toBeVisible();
    await expect(sharedPage.getByRole('button', { name: /Roles/i, exact: false }).first()).toBeVisible();
    await expect(sharedPage.getByRole('button', { name: /Permission Matrix/i })).toBeVisible();
    await expect(sharedPage.getByRole('button', { name: /Audit Log/i, exact: false })).toBeVisible();
  });

  test('2. Users tab: search, role filter, status filter work', async () => {
    await sharedPage.goto('/admin/access');
    await sharedPage.waitForLoadState('networkidle');
    const searchInput = sharedPage.getByPlaceholder('Search staff by name or email...');
    await expect(searchInput).toBeVisible({ timeout: 15000 });
    await searchInput.fill('E2E Admin');
    await expect(sharedPage.getByText('admin@e2e-resort.test')).toBeVisible({ timeout: 10000 });
    await searchInput.fill('');
    const roleSelect = sharedPage.locator('select').first();
    await roleSelect.selectOption('SUPER_ADMIN');
    await expect(sharedPage.getByText('admin@e2e-resort.test')).toBeVisible({ timeout: 10000 });
    const statusSelect = sharedPage.locator('select').nth(1);
    await statusSelect.selectOption('ACTIVE');
    await expect(sharedPage.getByText('admin@e2e-resort.test')).toBeVisible({ timeout: 10000 });
    await roleSelect.selectOption('ALL');
    await statusSelect.selectOption('ALL');
  });

  test('3. Create Staff User modal opens and closes', async () => {
    await sharedPage.goto('/admin/access');
    await sharedPage.waitForLoadState('networkidle');
    await sharedPage.getByText('+ Add Staff User').click();
    await expect(sharedPage.getByRole('heading', { name: 'Add Staff User' })).toBeVisible({ timeout: 10000 });
    await expect(sharedPage.getByLabel('Full Name')).toBeVisible();
    await sharedPage.getByRole('button', { name: /Cancel/i, exact: false }).first().click();
    await expect(sharedPage.getByRole('heading', { name: 'Add Staff User' })).not.toBeVisible({ timeout: 5000 });
  });

  test('4. Roles tab: all 9 approved roles appear with counts', async () => {
    await sharedPage.goto('/admin/access');
    await sharedPage.waitForLoadState('networkidle');
    await sharedPage.getByRole('button', { name: /Roles/i, exact: false }).first().click();
    for (const code of ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'RESTAURANT_MANAGER', 'RESTAURANT_BILLER', 'KITCHEN_STAFF', 'STORE_MANAGER', 'PURCHASE_MANAGER', 'CONTENT_MANAGER']) {
      // Use span.font-mono selector which is what renders the role code badge on each card
      await expect(sharedPage.locator('span.font-mono', { hasText: code }).first()).toBeVisible({ timeout: 10000 });
    }
    await expect(sharedPage.getByText('staff users').first()).toBeVisible();
    await expect(sharedPage.getByText('permissions').first()).toBeVisible();
  });

  test('5. Role Detail Modal opens when clicking a role card', async () => {
    await sharedPage.goto('/admin/access');
    await sharedPage.waitForLoadState('networkidle');
    await sharedPage.getByRole('button', { name: /Roles/i, exact: false }).first().click();
    // Click the h4 card heading for Super Administrator
    await sharedPage.locator('h4', { hasText: 'Super Administrator' }).first().click();
    // Modal uses h3 for the heading — distinct from h4 on the card
    const modalHeading = sharedPage.locator('h3', { hasText: 'Super Administrator' });
    await expect(modalHeading).toBeVisible({ timeout: 10000 });
    await sharedPage.getByRole('button', { name: /Close/i, exact: false }).first().click();
    await expect(modalHeading).not.toBeVisible({ timeout: 5000 });
  });

  test('6. Permission Matrix tab: renders permission rows and role columns', async () => {
    await sharedPage.goto('/admin/access');
    await sharedPage.waitForLoadState('networkidle');
    await sharedPage.getByRole('button', { name: /Permission Matrix/i, exact: false }).click();
    await expect(sharedPage.getByText('Enterprise Role Permission Authority Matrix')).toBeVisible({ timeout: 15000 });
    await expect(sharedPage.getByText('booking:read')).toBeVisible({ timeout: 10000 });
    // Matrix has multiple "Super Admin" th headers — use first()
    await expect(sharedPage.getByRole('columnheader', { name: 'Super Admin' }).first()).toBeVisible();
    await expect(sharedPage.getByRole('columnheader', { name: 'Reception' }).first()).toBeVisible();
  });

  test('7. Audit Log tab: renders audit stream with column headers', async () => {
    await sharedPage.goto('/admin/access');
    await sharedPage.waitForLoadState('networkidle');
    await sharedPage.getByRole('button', { name: /Audit Log/i, exact: false }).click();
    await expect(sharedPage.getByRole('heading', { name: 'Security & RBAC Audit Stream' })).toBeVisible({ timeout: 15000 });
    // Use columnheader role for table header assertions
    await expect(sharedPage.getByRole('columnheader', { name: 'Timestamp' })).toBeVisible();
    await expect(sharedPage.getByRole('columnheader', { name: 'Actor' })).toBeVisible();
    await expect(sharedPage.getByRole('columnheader', { name: 'Action' })).toBeVisible();
    await expect(sharedPage.getByRole('columnheader', { name: 'Entity' })).toBeVisible();
  });

  test('8. Edit User modal opens from Users tab', async () => {
    await sharedPage.goto('/admin/access');
    await sharedPage.waitForLoadState('networkidle');
    const editButton = sharedPage.locator('button[title="Edit User Details"]').first();
    await expect(editButton).toBeVisible({ timeout: 10000 });
    await editButton.click();
    await expect(sharedPage.getByRole('heading', { name: 'Edit Staff User' })).toBeVisible({ timeout: 10000 });
    await sharedPage.getByRole('button', { name: /Cancel/i, exact: false }).first().click();
    await expect(sharedPage.getByRole('heading', { name: 'Edit Staff User' })).not.toBeVisible({ timeout: 5000 });
  });

  test('9. Revoke Sessions modal opens from Users tab', async () => {
    await sharedPage.goto('/admin/access');
    await sharedPage.waitForLoadState('networkidle');
    const revokeButton = sharedPage.locator('button[title="Revoke Active Sessions"]').first();
    await expect(revokeButton).toBeVisible({ timeout: 10000 });
    await revokeButton.click();
    await expect(sharedPage.getByRole('heading', { name: 'Revoke User Sessions' })).toBeVisible({ timeout: 10000 });
    await sharedPage.getByRole('button', { name: /Cancel/i, exact: false }).first().click();
    await expect(sharedPage.getByRole('heading', { name: 'Revoke User Sessions' })).not.toBeVisible({ timeout: 5000 });
  });

  test('10. Change Role modal opens from Users tab', async () => {
    await sharedPage.goto('/admin/access');
    await sharedPage.waitForLoadState('networkidle');
    const changeRoleButton = sharedPage.locator('button[title="Change User Role"]').first();
    await expect(changeRoleButton).toBeVisible({ timeout: 10000 });
    await changeRoleButton.click();
    await expect(sharedPage.getByRole('heading', { name: 'Change Staff Role' })).toBeVisible({ timeout: 10000 });
    await expect(sharedPage.getByText('Notice:')).toBeVisible();
    await sharedPage.getByRole('button', { name: /Cancel/i, exact: false }).first().click();
    await expect(sharedPage.getByRole('heading', { name: 'Change Staff Role' })).not.toBeVisible({ timeout: 5000 });
  });
});
