export default async function run(page, ui) {
  // Click "Confirm Room Charge"
  const confirmBtn = page.locator('button:has-text("Confirm Room Charge")');
  await confirmBtn.click();
  await page.waitForTimeout(5000);
  
  const snap = await ui.snapshot({ full: true });
  return { url: page.url(), snap };
}
