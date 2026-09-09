export default async function run(page, ui) {
  let snap = await ui.snapshot();
  let verifyBtn = snap.match(/@(e\d+) button "Verify"/)?.[1];
  if (!verifyBtn) return { error: 'Verify button not found', snap };
  
  await ui.click(verifyBtn);
  await page.waitForTimeout(3000);
  
  snap = await ui.snapshot({ full: true });
  return { afterVerify: snap };
}
