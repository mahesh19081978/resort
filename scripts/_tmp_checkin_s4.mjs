export default async function run(page, ui) {
  // Click Continue to Live Photo
  const snap = await ui.snapshot();
  let btn = snap.match(/@(e\d+) button "Continue to Live Photo"/)?.[1];
  if (!btn) return { error: 'Continue to Live Photo not found' };
  
  await ui.click(btn);
  await page.waitForTimeout(3000);
  
  const snap2 = await ui.snapshot({ full: true });
  return { url: page.url(), snap: snap2 };
}
