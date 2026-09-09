export default async function run(page, ui) {
  // Click the first "View Bill" button (for S-1003)
  const viewBillBtns = page.locator('button:has-text("View Bill")');
  const count = await viewBillBtns.count();
  if (count > 0) {
    await viewBillBtns.first().click();
    await page.waitForTimeout(3000);
  }
  
  const snap = await ui.snapshot({ full: true });
  return { url: page.url(), snap };
}
