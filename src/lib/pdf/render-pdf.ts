import { Buffer } from 'buffer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';

export interface PdfRenderOptions {
  format?: 'A4' | 'Letter';
  margin?: {
    top?: string;
    bottom?: string;
    left?: string;
    right?: string;
  };
  printBackground?: boolean;
}

/**
 * Discovers a system-installed Chromium / Google Chrome / Microsoft Edge binary.
 */
function resolveSystemBrowserPath(): string | null {
  const envPath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }

  const commonLocations = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];

  for (const loc of commonLocations) {
    try {
      if (fs.existsSync(/*turbopackIgnore: true*/ loc)) {
        return loc;
      }
    } catch {
      // ignore
    }
  }

  return null;
}

/**
 * Renders HTML directly to an authentic A4 PDF buffer using native headless Chromium / Chrome.
 * Does not require puppeteer-core package to be installed.
 */
function renderViaHeadlessCli(html: string, executablePath: string): Buffer | null {
  const tmpDir = os.tmpdir();
  const randomSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const tempHtmlPath = path.join(tmpDir, `po_${randomSuffix}.html`);
  const tempPdfPath = path.join(tmpDir, `po_${randomSuffix}.pdf`);

  try {
    fs.writeFileSync(tempHtmlPath, html, 'utf8');

    const cliArgs = [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--no-pdf-header-footer',
      '--run-all-compositor-stages-before-draw',
      `--print-to-pdf=${tempPdfPath}`,
      tempHtmlPath,
    ];

    execFileSync(executablePath, cliArgs, {
      timeout: 30000,
      stdio: 'pipe',
    });

    if (fs.existsSync(tempPdfPath)) {
      const pdfBytes = fs.readFileSync(tempPdfPath);
      return Buffer.from(pdfBytes);
    }
    return null;
  } catch (cliErr) {
    console.warn('[PDF_ENGINE] Direct Chrome CLI invocation failed:', cliErr);
    return null;
  } finally {
    try {
      if (fs.existsSync(tempHtmlPath)) fs.unlinkSync(tempHtmlPath);
      if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);
    } catch {
      // best-effort temporary file cleanup
    }
  }
}

/**
 * Authoritative PDF Buffer Generator.
 *
 * CONTRACT:
 * 1. Checks for installed Chrome/Edge on the system or CHROME_PATH.
 * 2. Renders a genuine binary Buffer containing application/pdf bytes (%PDF-).
 * 3. Falls back to puppeteer-core if available.
 * 4. Returns null if no browser engine is available.
 * 5. NEVER disguises HTML content as a PDF file.
 */
export async function renderHtmlToPdfBuffer(
  html: string,
  options: PdfRenderOptions = {}
): Promise<Buffer | null> {
  const browserPath = resolveSystemBrowserPath();
  if (!browserPath) {
    return null;
  }

  // 1. First attempt: Direct headless browser execution (Zero external npm dependency requirement)
  const cliPdfBuffer = renderViaHeadlessCli(html, browserPath);
  if (cliPdfBuffer && cliPdfBuffer.length > 0) {
    return cliPdfBuffer;
  }

  // 2. Secondary attempt: Optional puppeteer-core runtime if present
  try {
    const pkgName = 'puppeteer-core';
    const puppeteer = await import(/* webpackIgnore: true */ pkgName);
    const browser = await (puppeteer.default || puppeteer).launch({
      executablePath: browserPath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'domcontentloaded' });

      const pdfUint8Array = await page.pdf({
        format: options.format || 'A4',
        printBackground: options.printBackground !== false,
        margin: options.margin || {
          top: '12mm',
          bottom: '12mm',
          left: '12mm',
          right: '12mm',
        },
      });

      return Buffer.from(pdfUint8Array);
    } finally {
      await browser.close();
    }
  } catch (puppeteerErr) {
    console.warn('[PDF_ENGINE] Puppeteer-core fallback also failed or unavailable:', puppeteerErr);
    return null;
  }
}
