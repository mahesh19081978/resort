script = r"""
import puppeteer, { Browser, Page } from 'puppeteer-core';
import { prisma } from '@/lib/db/prisma';
import { createSessionToken } from '@/lib/auth/session';
import * as fs from 'fs';
import * as path from 'path';

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

async function findAndClickButton(page: Page, texts: string[]): Promise<boolean> {
  const btns = await page.$$('button');
  for (const btn of btns) {
    const t = await page.evaluate((el: Element) => el.textContent?.trim() ?? '', btn);
    const dis = await page.evaluate((el: Element) => (el as HTMLButtonElement).disabled, btn);
    if (!dis && texts.some(x => t.includes(x))) {
      await btn.click();
      console.log('  Clicked:', t);
      return true;
    }
  }
  return false;
}

async function main() {
  console.log('\n=== REAL BROWSER CHECK-IN TEST ===');
  console.log('Reservation:', RES_NUM);

  // Step 0: App up?
  const ping = await fetch(APP_URL);
  console.log('[0] App HTTP:', ping.status);
  if (ping.status >= 500) throw new Error('App error: ' + ping.status);

  // Step 1: Session token
  console.log('[1] Minting SUPER_ADMIN session...');
  const admin = await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN', isActive: true },
    select: { id: true, email: true, sessionVersion: true, role: true },
  });
  if (!admin) throw new Error('No SUPER_ADMIN found');
  const token = await createSessionToken({ sub: admin.id, email: admin.email, sessionVersion: admin.sessionVersion, role: admin.role });
  console.log('  Token for:', admin.email);

  // Step 2: Launch Chrome
  console.log('[2] Launching Chrome...');
  const browser: Browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900'],
    defaultViewport: { width: 1400, height: 900 },
  });
  const page: Page = await browser.newPage();
  page.setDefaultTimeout(TIMEOUT);

  try {
    // Step 3: Inject auth cookie
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.setCookie({ name: 'resort_session', value: token, domain: 'localhost', path: '/', httpOnly: true, secure: false, sameSite: 'Lax' });
    console.log('[3] Session cookie set');

    // Step 4: Arrivals page
    console.log('[4] Loading Arrivals...');
    await page.goto(APP_URL + '/admin/frontdesk/arrivals', { waitUntil: 'networkidle2', timeout: TIMEOUT });
    const url = page.url();
    console.log('  URL:', url);
    if (url.includes('/login') || url.includes('/auth')) throw new Error('Auth redirect: ' + url);
    await shot(page, '01-arrivals');

    // Step 5: Find Check-In link
    const checkinHref = await page.evaluate((resNum: string) => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      for (const row of rows) {
        if (row.textContent?.includes(resNum)) {
          const a = row.querySelector('a[href*="checkin"]') as HTMLAnchorElement | null;
          return a ? a.href : null;
        }
      }
      return null;
    }, RES_NUM);
    if (!checkinHref) throw new Error('Check-In link not found for ' + RES_NUM);
    console.log('[5] Check-In href:', checkinHref);

    // Step 6: Navigate to wizard
    await page.goto(checkinHref, { waitUntil: 'networkidle2', timeout: TIMEOUT });
    await shot(page, '02-wizard');
    console.log('[6] Wizard loaded:', page.url());

    // Step 7: Navigate wizard stages until Complete Check-In
    let attempts = 20;
    let done = false;
    while (attempts-- > 0 && !done) {
      await new Promise(r => setTimeout(r, 1500));
      const body = await page.evaluate(() => document.body.innerText);

      // Select room D-2001 if visible
      if (body.includes('D-2001')) {
        const picked = await page.evaluate(() => {
          const all = Array.from(document.querySelectorAll('button, [role="radio"], div[data-room]'));
          for (const el of all) {
            if (el.textContent?.includes('D-2001')) { (el as HTMLElement).click(); return true; }
          }
          return false;
        });
        if (picked) { console.log('  Picked room D-2001'); await new Promise(r => setTimeout(r, 500)); }
      }

      // Try Complete Check-In
      const btns = await page.$$('button');
      let found = false;
      for (const btn of btns) {
        const t = await page.evaluate((el: Element) => el.textContent?.trim() ?? '', btn);
        const dis = await page.evaluate((el: Element) => (el as HTMLButtonElement).disabled, btn);
        if (t.includes('Complete Check') || t.includes('Complete check')) {
          if (!dis) {
            await btn.click();
            done = true;
            console.log('[8] Clicked: Complete Check-In');
          } else {
            found = true;
            console.log('  Complete Check-In visible but disabled, advancing...');
          }
          break;
        }
      }

      if (!done) {
        const adv = await findAndClickButton(page, ['Next', 'Continue', 'Next Step', 'Proceed', 'Skip', 'Select Room', 'Confirm']);
        if (!adv) {
          await shot(page, '0x-stuck-' + (20 - attempts));
          const pg = await page.evaluate(() => document.body.innerText.slice(0, 200));
          console.log('  Stuck:', pg);
        }
      }
    }

    if (!done) {
      await shot(page, '07-no-complete-btn');
      throw new Error('Complete Check-In not clicked after attempts');
    }

    // Step 9: Wait for success
    console.log('[9] Waiting for success...');
    await page.waitForFunction(
      () => {
        const t = document.body.innerText;
        return t.includes('Check-In Successful') || t.includes('Checked In') || t.includes('STY-') || t.includes('Successfully');
      },
      { timeout: 60_000 }
    );
    await shot(page, '08-success');
    const snippet = await page.evaluate(() => document.body.innerText.slice(0, 600));
    console.log('\n  SUCCESS:\n', snippet);

    // Step 10: DB verify
    console.log('\n[10] DB verification...');
    const res = await prisma.reservation.findUnique({
      where: { reservationNumber: RES_NUM },
      include: { stays: { include: { folio: { include: { payments: true } }, roomAssignments: { include: { room: true } } } } },
    });
    if (!res) throw new Error('Reservation not found in DB');
    if (res.stays.length === 0) throw new Error('No Stay created');
    const stay = res.stays[0];
    const folio = stay.folio;
    const room = stay.roomAssignments[0]?.room;
    console.log('  Stay:', stay.stayNumber, '|', stay.status);
    console.log('  Room:', room?.roomNumber);
    console.log('  Folio:', folio?.folioNumber);
    console.log('  Charges: INR', folio?.totalCharges?.toString());
    console.log('  Credits: INR', folio?.totalCredits?.toString());
    console.log('  Balance: INR', folio?.totalBalance?.toString());
    console.log('  Payments:', folio?.payments?.length);

    // Step 11: BAC713 untouched
    console.log('\n[11] Verifying BAC713...');
    const bac = await prisma.reservation.findUnique({ where: { reservationNumber: 'RES-20260908-BAC713' }, include: { stays: true } });
    if (!bac) throw new Error('BAC713 missing!');
    if (bac.stays.length > 0) throw new Error('BAC713 has stays — VIOLATION!');
    console.log('  BAC713:', bac.status, '| stays:', bac.stays.length, '(protected)');

    console.log('\n=== BROWSER CHECK-IN TEST PASSED ===');
    console.log('  Reservation:', RES_NUM);
    console.log('  Stay:       ', stay.stayNumber);
    console.log('  Room:       ', room?.roomNumber);
    console.log('  Folio:      ', folio?.folioNumber);
    console.log('  Balance:    INR', folio?.totalBalance?.toString());

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
"""

path = r'D:\xampp\htdocs\Projects--git\resort\scripts\browser-checkin-test.ts'
with open(path, 'w', encoding='utf-8') as f:
    f.write(script.lstrip())
print('Written', len(script), 'bytes')
