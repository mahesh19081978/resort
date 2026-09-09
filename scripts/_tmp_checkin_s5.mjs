export default async function run(page, ui) {
  // Click Room S-1003
  let snap = await ui.snapshot();
  let roomBtn = snap.match(/@(e\d+) button "Room S-1003/)?.[1];
  if (!roomBtn) return { error: 'Room S-1003 not found', snap };
  
  await ui.click(roomBtn);
  await page.waitForTimeout(1000);
  
  // Click Continue to Payment
  snap = await ui.snapshot();
  let continueBtn = snap.match(/@(e\d+) button "Continue to Payment"/)?.[1];
  if (!continueBtn) return { error: 'Continue to Payment not found', snap };
  
  await ui.click(continueBtn);
  await page.waitForTimeout(3000);
  
  snap = await ui.snapshot({ full: true });
  return { url: page.url(), snap };
}
