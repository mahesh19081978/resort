export default async function run(page, ui) {
  await ui.click('@e5');
  await page.waitForTimeout(8000);
  const snap = await ui.snapshot({ full: true });
  return { status: 'clicked simulate payment', url: page.url(), snap };
}
