export default async function run(page, ui) {
  let snap = await ui.snapshot();
  let btn = snap.match(/@(e\d+) button "Continue to Final Review"/)?.[1];
  if (!btn) return { error: 'Continue to Final Review not found' };
  
  await ui.click(btn);
  await page.waitForTimeout(3000);
  
  snap = await ui.snapshot({ full: true });
  return { url: page.url(), snap };
}
