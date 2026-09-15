import { describe, it, expect } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { createSessionToken } from '@/lib/auth/session';

describe('EXECUTIVE DASHBOARD: LIVE HTTP & HTML RENDER VERIFICATION', () => {
  it('renders /admin/dashboard with complete executive hierarchy and 200 OK', async () => {
    // Find active Super Admin user
    const adminUser = await prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN', isActive: true },
      select: { id: true, email: true, sessionVersion: true, role: true },
    });

    expect(adminUser).not.toBeNull();
    if (!adminUser) return;

    const token = await createSessionToken({
      sub: adminUser.id,
      email: adminUser.email,
      sessionVersion: adminUser.sessionVersion,
      role: adminUser.role,
    });

    const res = await fetch('http://localhost:3000/admin/dashboard', {
      headers: {
        Cookie: `resort_session=${token}`,
      },
    });

    expect(res.status).toBe(200);
    const html = await res.text();

    // 1. Header & Context
    expect(html).toContain('Executive Resort Performance');
    expect(html).toContain('Infinity Resort and Restaurant');
    expect(html).toContain('TRR-MAIN');
    expect(html).toContain('Period:');

    // 2. Executive KPI Row (6 Core Cards)
    expect(html).toContain('Total Revenue');
    expect(html).toContain('Room Revenue');
    expect(html).toContain('Restaurant Revenue');
    expect(html).toContain('Actual Occupancy');
    expect(html).toContain('ADR');
    expect(html).toContain('RevPAR');

    // 3. Revenue Performance & Revenue Mix
    expect(html).toContain('Revenue Performance Trend');
    expect(html).toContain('Revenue Realization Mix');

    // 4. Commercial Bookings
    expect(html).toContain('Booking Performance — Created');
    expect(html).toContain('Booking Volume Trend');
    expect(html).toContain('Cancellation Rate');

    // 5. Restaurant Performance & Top Dishes
    expect(html).toContain('Restaurant POS &amp; Sales Performance');
    expect(html).toContain('Top-Selling Dishes (Ranked by Quantity Sold)');

    // 6. Room Performance Table
    expect(html).toContain('Room Performance &amp; Categories');
    expect(html).toContain('Current Inventory');

    // 7. Compact Operational Alerts (Bottom Section)
    expect(html).toContain('Operational Attention (Today&#x27;s Real-Time Status)');
    expect(html).toContain('Arrivals');
    expect(html).toContain('Departures');
    expect(html).toContain('In-House');
    expect(html).toContain('Low Stock');
    expect(html).toContain('Pending KOT');
    expect(html).toContain('Room Issues');
    expect(html).toContain('/admin/frontdesk/arrivals');
    expect(html).toContain('/admin/frontdesk/departures?filter=today');
  }, 25000);

  it('renders period query params accurately (?period=today)', async () => {
    const adminUser = await prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN', isActive: true },
      select: { id: true, email: true, sessionVersion: true, role: true },
    });
    if (!adminUser) return;

    const token = await createSessionToken({
      sub: adminUser.id,
      email: adminUser.email,
      sessionVersion: adminUser.sessionVersion,
      role: adminUser.role,
    });

    const res = await fetch('http://localhost:3000/admin/dashboard?period=today', {
      headers: {
        Cookie: `resort_session=${token}`,
      },
    });

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Executive Performance Summary');
    expect(html).toContain('Today');
  }, 25000);

  it('renders custom date range query params (?period=custom&start=2026-09-01&end=2026-09-10)', async () => {
    const adminUser = await prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN', isActive: true },
      select: { id: true, email: true, sessionVersion: true, role: true },
    });
    if (!adminUser) return;

    const token = await createSessionToken({
      sub: adminUser.id,
      email: adminUser.email,
      sessionVersion: adminUser.sessionVersion,
      role: adminUser.role,
    });

    const res = await fetch('http://localhost:3000/admin/dashboard?period=custom&start=2026-09-01&end=2026-09-10', {
      headers: {
        Cookie: `resort_session=${token}`,
      },
    });

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('2026-09-01 to 2026-09-10');
  }, 25000);
});
