export default async function run(page, ui) {
  // Click "Place Order & Send KOT"
  const placeBtn = page.locator('button:has-text("Place Order")');
  await placeBtn.click();
  await page.waitForTimeout(5000);
  
  const snap = await ui.snapshot({ full: true });
  return { url: page.url(), snap };
}
