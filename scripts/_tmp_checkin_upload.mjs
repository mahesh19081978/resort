export default async function run(page, ui) {
  // Create a fake file and trigger upload via JS
  const result = await page.evaluate(async () => {
    // Find the file input
    const fileInput = document.querySelector('input[type="file"]');
    if (!fileInput) return { error: 'No file input found' };
    
    // Create a small fake PNG file
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 100, 100);
    
    // Convert to blob
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const file = new File([blob], 'id-document.png', { type: 'image/png' });
    
    // Create DataTransfer and set files
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    
    // Dispatch change event
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    
    return { success: true, fileName: file.name };
  });
  
  return result;
}
