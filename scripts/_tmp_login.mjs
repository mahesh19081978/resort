export default async function run(page, ui) {
  await ui.fill('@e1', 'admin@royalreserve.com');
  await ui.fill('@e2', '12345678');
  await page.waitForTimeout(300);
  await ui.click('@e4');
  await page.waitForTimeout(5000);
  const snap = await ui.snapshot({ full: true });
  return { url: page.url(), snap };
}
