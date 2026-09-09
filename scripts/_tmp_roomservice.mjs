export default async function run(page, ui) {
  // Click "Room Service (PMS)"
  await ui.click('@e24');
  await page.waitForTimeout(2000);
  
  const snap = await ui.snapshot({ full: true });
  return { url: page.url(), snap };
}
