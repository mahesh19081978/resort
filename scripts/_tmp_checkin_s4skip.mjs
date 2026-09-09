export default async function run(page, ui) {
  let snap = await ui.snapshot();
  let skipBtn = snap.match(/@(e\d+) button "Skip Photo"/)?.[1];
  if (!skipBtn) return { error: 'Skip Photo not found' };
  
  await ui.click(skipBtn);
  await page.waitForTimeout(3000);
  
  snap = await ui.snapshot({ full: true });
  return { url: page.url(), snap };
}
