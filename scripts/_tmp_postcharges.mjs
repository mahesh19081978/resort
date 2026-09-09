export default async function run(page, ui) {
  // Click the first "Post Charges" button (for S-1003)
  const postBtns = page.locator('button:has-text("Post Charges")');
  const count = await postBtns.count();
  if (count > 0) {
    await postBtns.first().click();
    await page.waitForTimeout(3000);
  }
  
  const snap = await ui.snapshot({ full: true });
  return { url: page.url(), count, snap };
}
