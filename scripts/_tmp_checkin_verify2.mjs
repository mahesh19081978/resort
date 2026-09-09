export default async function run(page, ui) {
  // Try to find and click the Verify button using Playwright locator
  const verifyBtn = page.locator('button:has-text("Verify")').first();
  const isDisabled = await verifyBtn.isDisabled();
  
  // Try clicking it anyway
  try {
    await verifyBtn.click({ timeout: 5000 });
    await page.waitForTimeout(3000);
  } catch (e) {
    // Try using evaluate to trigger React state
    await page.evaluate(() => {
      // Find all buttons
      const buttons = Array.from(document.querySelectorAll('button'));
      const verifyBtn = buttons.find(b => b.textContent?.trim() === 'Verify');
      if (verifyBtn) {
        verifyBtn.click();
      }
    });
    await page.waitForTimeout(3000);
  }
  
  const snap = await ui.snapshot({ full: true });
  return { url: page.url(), snap };
}
