export default async function run(page, ui) {
  // Select Cash payment method
  const paymentSelect = page.locator('select').first();
  await paymentSelect.selectOption('CASH');
  await page.waitForTimeout(500);
  
  // Fill transaction reference
  const refInput = page.locator('input[placeholder*="TXN"]');
  await refInput.fill('CASH-CHECKOUT-001');
  await page.waitForTimeout(500);
  
  // Fill checkout notes
  const notesInput = page.locator('input[placeholder*="Keys returned"]');
  await notesInput.fill('Keys returned, room inspected, guest satisfied');
  await page.waitForTimeout(500);
  
  // Click "Collect Settlement & Complete Checkout"
  const checkoutBtn = page.locator('button:has-text("Collect Settlement")');
  await checkoutBtn.click();
  await page.waitForTimeout(5000);
  
  const snap = await ui.snapshot({ full: true });
  return { url: page.url(), snap };
}
