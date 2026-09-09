export default async function run(page, ui) {
  const results = {};
  
  // Stage 1: Click Continue
  let snap = await ui.snapshot();
  let btn = snap.match(/@(e\d+) button "Continue to Guest Details"/)?.[1];
  if (!btn) return { error: 'Stage 1 continue button not found' };
  await ui.click(btn);
  await page.waitForTimeout(2000);
  
  // Stage 2: Guest Info
  snap = await ui.snapshot({ full: true });
  results.stage2 = snap;
  
  // Click Continue to ID Proof
  btn = snap.match(/@(e\d+) button "Continue to ID Proof"/)?.[1];
  if (!btn) return { error: 'Stage 2 continue button not found', snap };
  await ui.click(btn);
  await page.waitForTimeout(2000);
  
  // Stage 3: ID Proof
  snap = await ui.snapshot({ full: true });
  results.stage3 = snap;
  
  // Click Continue to Photo
  btn = snap.match(/@(e\d+) button "Continue to Photo"/)?.[1];
  if (!btn) return { error: 'Stage 3 continue button not found', snap };
  await ui.click(btn);
  await page.waitForTimeout(2000);
  
  // Stage 4: Photo (webcam) - skip for now
  snap = await ui.snapshot({ full: true });
  results.stage4 = snap;
  
  // Click Skip or Continue
  btn = snap.match(/@(e\d+) button "Skip"/)?.[1] || snap.match(/@(e\d+) button "Continue to Room"/)?.[1];
  if (btn) {
    await ui.click(btn);
    await page.waitForTimeout(2000);
  }
  
  // Stage 5: Room Assignment
  snap = await ui.snapshot({ full: true });
  results.stage5 = snap;
  
  return { url: page.url(), results };
}
