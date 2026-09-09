export default async function run(page, ui) {
  // Click on "Old Delhi Butter Chicken" menu item
  const menuItem = page.locator('h4:has-text("Old Delhi Butter Chicken")').first();
  await menuItem.click();
  await page.waitForTimeout(1000);
  
  // Check if it was added to cart
  const snap = await ui.snapshot({ full: true });
  return { snap };
}
