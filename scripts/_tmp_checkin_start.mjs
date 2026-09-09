export default async function run(page, ui) {
  await ui.click('@e18');
  await page.waitForTimeout(5000);
  const snap = await ui.snapshot({ full: true });
  return { url: page.url(), snap };
}
