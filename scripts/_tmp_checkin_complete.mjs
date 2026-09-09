export default async function run(page, ui) {
  let snap = await ui.snapshot();
  let btn = snap.match(/@(e\d+) button "Complete Check-In"/)?.[1];
  if (!btn) return { error: 'Complete Check-In not found' };
  
  await ui.click(btn);
  await page.waitForTimeout(5000);
  
  snap = await ui.snapshot({ full: true });
  return { url: page.url(), snap };
}
