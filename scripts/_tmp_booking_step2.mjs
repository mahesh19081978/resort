export default async function run(page, ui) {
  // Get all inputs
  const allInputs = await page.locator('input').all();
  const inputInfo = [];
  for (let i = 0; i < allInputs.length; i++) {
    const type = await allInputs[i].getAttribute('type');
    const val = await allInputs[i].inputValue();
    inputInfo.push({ i, type, val });
  }
  
  // Fill guest fields by index based on known layout
  // Index 2: first name, 3: last name, 4: email, 5: phone, 6: city
  await allInputs[2].fill('Rahul');
  await allInputs[3].fill('Sharma');
  await allInputs[4].fill('rahul.sharma@test.com');
  await allInputs[5].fill('+91 9999999999');
  await allInputs[6].fill('Bhopal');
  
  // Card fields already filled from before (index 7: card name, 8: expiry, 9: cvv)
  // Verify card fields are still filled
  const cardName = await allInputs[7].inputValue();
  const cardExpiry = await allInputs[8].inputValue();
  const cardCvv = await allInputs[9].inputValue();
  
  await page.waitForTimeout(500);
  
  // Click proceed button
  const proceedBtn = page.locator('button:has-text("Proceed to Online Payment")');
  const isDisabled = await proceedBtn.isDisabled();
  
  const vals = {
    firstName: await allInputs[2].inputValue(),
    lastName: await allInputs[3].inputValue(),
    email: await allInputs[4].inputValue(),
    phone: await allInputs[5].inputValue(),
    city: await allInputs[6].inputValue(),
    cardName, cardExpiry, cardCvv,
    inputCount: allInputs.length,
    inputInfo
  };
  
  if (isDisabled) return { error: 'Button still disabled', vals };
  
  await proceedBtn.click();
  await page.waitForTimeout(5000);
  
  return { vals, status: 'clicked proceed', url: page.url() };
}
