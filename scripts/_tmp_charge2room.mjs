export default async function run(page, ui) {
  // Click "Charge to Room Folio"
  const chargeBtn = page.locator('button:has-text("Charge to Room Folio")');
  await chargeBtn.click();
  await page.waitForTimeout(5000);
  
  const snap = await ui.snapshot({ full: true });
  return { url: page.url(), snap };
}
