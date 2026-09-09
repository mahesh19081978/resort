export default async function run(page, ui) {
  await ui.click('@e15');
  await page.waitForTimeout(3000);
  const snap = await ui.snapshot({ full: true });
  return { url: page.url(), snap };
}
