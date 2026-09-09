export default async function run(page, ui) {
  // Click Upload button
  let snap = await ui.snapshot();
  let uploadBtn = snap.match(/@(e\d+) button "Upload"/)?.[1];
  if (!uploadBtn) return { error: 'Upload button not found', snap };
  
  await ui.click(uploadBtn);
  await page.waitForTimeout(5000);
  
  // Check state after upload
  snap = await ui.snapshot({ full: true });
  return { afterUpload: snap };
}
