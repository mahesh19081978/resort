export default async function run(page, ui) {
  // Click "Generate Restaurant Bill"
  const genBillBtn = page.locator('button:has-text("Generate Restaurant Bill")');
  await genBillBtn.click();
  await page.waitForTimeout(5000);
  
  const snap = await ui.snapshot({ full: true });
  return { url: page.url(), snap };
}
