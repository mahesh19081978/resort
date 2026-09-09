export default async function run(page, ui) {
  const results = {};
  
  // Stage 2: Guest Info - click Continue to ID Verification
  let snap = await ui.snapshot();
  let btn = snap.match(/@(e\d+) button "Continue to ID Verification"/)?.[1];
  if (!btn) return { error: 'Stage 2 button not found', snap };
  await ui.click(btn);
  await page.waitForTimeout(2000);
  
  // Stage 3: ID Proof
  snap = await ui.snapshot({ full: true });
  results.stage3 = snap;
  
  return { url: page.url(), results };
}
