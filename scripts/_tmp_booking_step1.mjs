export default async function run(page, ui) {
  // Fill card name
  await ui.fill('@e18', 'JOHN DOE');
  await page.waitForTimeout(200);
  
  // Fill expiry
  await ui.fill('@e19', '12/28');
  await page.waitForTimeout(200);
  
  // Fill CVV
  await ui.fill('@e21', '123');
  await page.waitForTimeout(500);
  
  // Check if the button is now enabled
  const snap = await ui.snapshot();
  const proceedBtn = snap.match(/@(e\d+) button "Proceed to Online Payment/)?.[1];
  if (!proceedBtn) return { error: 'Proceed button not found', snap };
  
  // Check if disabled
  const isDisabled = snap.includes(`@${proceedBtn} button "Proceed`) && snap.includes('[disabled]');
  if (isDisabled) return { error: 'Button still disabled', snap };
  
  // Click proceed
  await ui.click(proceedBtn);
  await page.waitForTimeout(3000);
  
  const afterSnap = await ui.snapshot({ full: true });
  return { status: 'clicked proceed', afterSnap };
}
