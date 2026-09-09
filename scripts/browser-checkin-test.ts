import puppeteer, { Browser, Page } from 'puppeteer-core';
import { prisma } from '@/lib/db/prisma';
import { createSessionToken } from '@/lib/auth/session';
import * as fs from 'fs';
import * as path from 'path';

export {};

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_URL = 'http://localhost:3000';
const RES_NUM = 'RES-20260908-A1B43C';
const SCREENSHOT_DIR = path.join(process.cwd(), 'scripts', 'screenshots');
const TIMEOUT = 30_000;

function ensureDir() {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function shot(page: Page, name: string) {
  ensureDir();
  const fp = path.join(SCREENSHOT_DIR, name + '.png');
  await page.screenshot({ path: fp, fullPage: true });
  console.log('  Screenshot:', fp);
}

async function clickBtn(page: Page, label: string): Promise<boolean> {
  const btns = await page.$$('button');
  for (const btn of btns) {
    const t = await page.evaluate((el: Element) => el.textContent?.trim() ?? '', btn);
    const dis = await page.evaluate((el: Element) => (el as HTMLButtonElement).disabled, btn);
    if (!dis && t.includes(label)) {
      await btn.click();
      console.log('  Clicked:', t);
      return true;
    }
  }
  return false;
}

async function main() {
  console.log('\n=== REAL BROWSER CHECK-MN TEAT ===');

  const ping = await fetch(APP_URL);
  console.log('[0] App HTTP:', ping.status);

  const admin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN', isActive: true }, select: { id: true, email: true, sessionVersion: true, role: true } });
  if (!admin) throw new Error('No SUPER_ADMIN');
  const token = await createSessionToken({ sub: admin.id, email: admin.email, sessionVersion: admin.sessionVersion, role: admin.role });
  console.log('[1] Token for:', admin.email);

  const browser: Browser = await puppeteer.launch({ executablePath: CHROME, headless: false, args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900'], defaultViewport: { width: 1400, height: 900 } });
  const page: Page = await browser.newPage();
  page.setDefaultTimeout(TIMEOUT);

  try {
    // Inject auth cookie
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.setCookie({ name: 'resort_session', value: token, domain: 'localhost', path: '/', httpOnly: true, secure: false, sameSite: 'Lax' });
    console.log('[2] Cookie set');

    // Arrivals page
    await page.goto(APP_URL + '/admin/frontdesk/arrivals', { waitUntil: 'networkidle2', timeout: TIMEOUT });
    console.log('[3] Arrivals:', page.url());
    if (page.url().includes('/login')) throw new Error('Auth redirect');
    await shot(page, '01-arrivals');
    console.log('[3] Arrivals loaded');

    // Navigate directly to the check-in wizard for our reservation
    // (Check-in date is 2026-09-08 but reservation is still CONFIRMED with 0 stays)
    const RESERVATION_ID = 'cmtsn1neb000yihp8a86x1y1s';
    const checkinHref = APP_URL + '/admin/frontdesk/checkin/' + RESERVATION_ID;
    console.log('[4] Navigating directly to wizard:', checkinHref);

    // Navigate to wizard
    await page.goto(checkinHref, { waitUntil: 'networkidle2', timeout: TIMEOUT});
    await shot(page, '02-wizard');
    console.log('[5] Wizard:', page.url());

    // STAGE 1: Reservation - click Continue to Guest Details
    await new Promise(r => setTimeout(r, 1500));
    await clickBtn(page, 'Continue to Guest Details');
    console.log('[6] Stage 1: Continued to Guest Details');

    // STAGE 2: Guest Details - click Continue to ID Verification
    await new Promise(r => setTimeout(r, 1500));
    await clickBtn(page, 'Continue to ID Verification');
    console.log('[7] Stage 2: Continued to ID Verification');

    // STAGE 3: ID Verification
    // Wait for async doc fetch (getGuestDocumentsAction runs on step===3)
    await new Promise(r => setTimeout(r, 3000));

    // Use Puppeteer native click on the AADHAAR doc card div (proper React synthetic event)
    const docCardHandle = await page.evaluateHandle(() => {
      const els = Array.from(document.querySelectorAll('div'));
      for (const el of els) {
        const t = el.textContent?.trim() ?? '';
        // Match the doc card: contains AADHAAR and rte and VERIFIED, but not a button
        if (t.includes('AADHAAR') && t.includes('rte') && t.includes('VERIFIED') && el.tagName !== 'BUTTON' && t.length < 60) {
          return el;
        }
      }
      return null;
    });
    const docCardEl = docCardHandle.asElement() as import('puppeteer-core').ElementHandle<Element> | null;
    if (docCardEl) {
      await docCardEl.click();
      console.log('[8a] Clicked AADHAAR doc card (native Puppeteer)');
    } else {
      console.log('[8a] Doc card not found by text match, trying cursor-pointer divs...');
      const allDivs = await page.$$('div[class*="cursor"]');
      for (const d of allDivs) {
        const t = await page.evaluate((el: Element) => el.textContent?.trim() ?? '', d);
        if (t.includes('AADHAAR')) { await d.click(); console.log('[8a] Clicked by cursor class:', t); break; }
      }
    }
    await new Promise(r => setTimeout(r, 1000));

    // Check if Continue to Live Photo is now enabled
    const livePhotoEnabled = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      for (const btn of btns) {
        if (btn.textContent?.includes('Continue to Live Photo')) return !btn.disabled;
      }
      return false;
    });
    console.log('[8b] Continue to Live Photo enabled:', livePhotoEnabled);

    if (!livePhotoEnabled) {
      // React click may not have propagated — type document number directly into input
      console.log('[8c] Typing doc number into input field as fallback...');
      const docInput = await page.$('input[placeholder*="ABCDE"], input[id*="doc"], input[name*="doc"]');
      if (docInput) {
        await docInput.focus();
        await docInput.click();
        await page.keyboard.down('Control');
        await page.keyboard.press('a');
        await page.keyboard.up('Control');
        await page.keyboard.type('rte');
        await new Promise(r => setTimeout(r, 500));
        console.log('[8c] Typed "rte" into document number input');
      } else {
        // Try to find any input near the Document Number label
        const inputs = await page.$$('input');
        for (const inp of inputs) {
          const placeholder = await page.evaluate((el: Element) => (el as HTMLInputElement).placeholder, inp);
          if (placeholder?.toLowerCase().includes('abcde') || placeholder?.toLowerCase().includes('document')) {
            await inp.focus();
            await inp.click();
            await page.keyboard.down('Control');
            await page.keyboard.press('a');
            await page.keyboard.up('Control');
            await page.keyboard.type('rte');
            console.log('[8c] Typed into input with placeholder:', placeholder);
            break;
          }
        }
      }
      await new Promise(r => setTimeout(r, 500));
    }

    await shot(page, '03-id-stage');
    // Wait until Continue to Live Photo is actually enabled before clicking
    await page.waitForFunction(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      for (const btn of btns) {
        if (btn.textContent?.includes('Continue to Live Photo')) return !btn.disabled;
      }
      return false;
    }, { timeout: 10_000 });
    await clickBtn(page, 'Continue to Live Photo');
    console.log('[8] Stage 3: -> Live Photo');

    // STAGE 4: Photo - wait for getGuestPhotoAction to auto-load & enable button
    console.log('[9] Waiting for photo to auto-load...');
    await page.waitForFunction(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      for (const btn of btns) {
        if (btn.textContent?.includes('Continue to Room Selection')) return !btn.disabled;
      }
      return false;
    }, { timeout: 15_000 });
    await shot(page, '04-photo-stage');
    await clickBtn(page, 'Continue to Room Selection');
    console.log('[9] Stage 4: -> Room Selection');

    // STAGE 5: Room - auto-selected via useState(eligibleRooms[0]?.id)
    await new Promise(r => setTimeout(r, 1500));
    await shot(page, '05-room-stage');
    await page.waitForFunction(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      for (const btn of btns) {
        if (btn.textContent?.includes('Continue to Payment')) return !btn.disabled;
      }
      return false;
    }, { timeout: 10_000 });
    await clickBtn(page, 'Continue to Payment');
    console.log('[10] Stage 5: -> Payment');

    // STAGE 6: Payment review
    await new Promise(r => setTimeout(r, 1500));
    await shot(page, '06-payment-stage');
    await clickBtn(page, 'Continue to Final Review');
    console.log('[11] Stage 6: -> Final Review');

    // STAGE 7: Final Review - Complete Check-In
    await new Promise(r => setTimeout(r, 1500));
    await shot(page, '07-final-review');
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 200));
    console.log('  Page snippet:', bodyText);
    const submitted = await clickBtn(page, 'Complete Check-In');
    if (!submitted) {
      // Check if button exists but disabled
      const allBtnTexts = await page.$$eval('button', btns => btns.map(b => b.textContent?.trim() + ':dis=' + (b as HTMLButtonElement).disabled));
      console.log('  All buttons:', allBtnTexts);
      throw new Error('Complete Check-In button not found or disabled');
    }
    console.log('[12] Clicked: Complete Check-In');

    // Wait for success
    console.log('[13] Waiting for success...');
    await page.waitForFunction(() => {
      const t = document.body.innerText;
      return t.includes('Check-In Successful') || t.includes('Checked In') || t.includes('STY-') || t.includes('success');
    }, { timeout: 60_000 });
    await shot(page, '08-success');
    const snip = await page.evaluate(() => document.body.innerText.slice(0, 600));
    console.log('\n  SUCCESS:\n', snip);

    // DB verify
    console.log('\n[9] DABverify...');
    const res = await prisma.reservation.findUnique({
      where: { reservationNumber: RES_NUM },
      include: { stays: { include: { folio: { include: { payments: true } }, roomAssignments: { include: { room: true } } } } },
    });
    if (!res || res.stays.length === 0) throw new Error('No stay in DB');
    const stay = res.stays[0];
    const folio = stay.folio;
    const rm = stay.roomAssignments[0]?.room;
    console.log('  Stay:', stay.stayNumber, '|', stay.status);
    console.log('  Room:', rm?.roomNumber);
    console.log('  Folio:', folio?.folioNumber);
    console.log('  Balance: INR', folio?.totalBalance?.toString());

    // BAC713 untouched
    const bac = await prisma.reservation.findUnique({ where: { reservationNumber: 'RES-20260908-BAC713' }, include: { stays: true } });
    if (!bac) throw new Error('BAC713 missing');
    if (bac.stays.length > 0) throw new Error('BAC713 has stays - VIOLATION');
    console.log('  BAC713:', bac.status, '| stays:', bac.stays.length);

    console.log('\n=== BROWSER CHECK-IN TEST PASSED !==');
    console.log('  Stay:', stay.stayNumber, '| Room:', rm?.roomNumber, '| Balance: INR', folio?.totalBalance?.toString());

  } catch (err) {
    await shot(page, '99-error').catch(() => {});
    throw err;
  } finally {
    await new Promise(r => setTimeout(r, 3000));
    await browser.close();
    await prisma.$disconnect();
  }
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
