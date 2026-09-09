export default async function run(page, ui) {
  // Fill document number
  const docInput = page.locator('input[placeholder*="ABCDE1234F"]');
  await docInput.fill('1234-5678-9012');
  await page.waitForTimeout(500);
  
  // Now click Continue to Live Photo
  let snap = await ui.snapshot();
  let btn = snap.match(/@(e\d+) button "Continue to Live Photo"/)?.[1];
  if (!btn) return { error: 'Continue to Live Photo not found', snap };
  await ui.click(btn);
  await page.waitForTimeout(2000);
  
  snap = await ui.snapshot({ full: true });
  return { url: page.url(), stage4: snap };
}
