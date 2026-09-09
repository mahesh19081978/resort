/**
 * PRICING INTEGRITY REGRESSION TESTS
 *
 * Verifies the single-source-of-truth pricing architecture implemented to fix
 * the critical booking-price-change bug (Screen 1 vs Screen 2 discrepancy).
 *
 * Business rule:
 *   Standard Heritage Room: 5500/night + 12% GST = 5500 + 660 = 6160
 */

import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";
import {
  calculateNights,
  calculateReservationPricing,
  roundCurrency,
  calculateBookingPrice,
} from "../pricing-calculator";

// ---------------------------------------------------------------------------
// A. Pure-math unit tests (no DB, deterministic)
// ---------------------------------------------------------------------------
describe("A. PURE PRICING MATH — Decimal Arithmetic & Banker's Rounding", () => {
  it("A1 — Standard Heritage Room: 5500 x 1 night x 12% GST = total 6160", () => {
    const r = calculateReservationPricing({
      items: [{ roomTypeId: "r1", roomsCount: 1, basePrice: new Prisma.Decimal("5500.00"), nights: 1 }],
      taxRatePercent: new Prisma.Decimal("12.00"),
      depositRatio: 1.0,
    });
    expect(r.subtotal.toFixed(2)).toBe("5500.00");
    expect(r.discountAmount.toFixed(2)).toBe("0.00");
    expect(r.netTaxableAmount.toFixed(2)).toBe("5500.00");
    expect(r.taxAmount.toFixed(2)).toBe("660.00");
    expect(r.totalAmount.toFixed(2)).toBe("6160.00");
    expect(r.requiredAdvanceAmount.toFixed(2)).toBe("6160.00");
  });

  it("A2 — 18% would yield 6490 (regression target) — NOT the authoritative total", () => {
    const r = calculateReservationPricing({
      items: [{ roomTypeId: "r", roomsCount: 1, basePrice: new Prisma.Decimal("5500"), nights: 1 }],
      taxRatePercent: new Prisma.Decimal("18"),
    });
    expect(r.totalAmount.toFixed(2)).toBe("6490.00");
    expect(r.totalAmount.toFixed(2)).not.toBe("6160.00");
  });

  it("A3 — Multi-night: 5500 x 3 nights x 12% = 18480", () => {
    const r = calculateReservationPricing({
      items: [{ roomTypeId: "r", roomsCount: 1, basePrice: new Prisma.Decimal("5500"), nights: 3 }],
      taxRatePercent: new Prisma.Decimal("12"),
    });
    expect(r.subtotal.toFixed(2)).toBe("16500.00");
    expect(r.taxAmount.toFixed(2)).toBe("1980.00");
    expect(r.totalAmount.toFixed(2)).toBe("18480.00");
  });

  it("A4 — Multi-room: 2x 5500 rooms, 1 night, 12% = 12320", () => {
    const r = calculateReservationPricing({
      items: [{ roomTypeId: "r", roomsCount: 2, basePrice: new Prisma.Decimal("5500"), nights: 1 }],
      taxRatePercent: new Prisma.Decimal("12"),
    });
    expect(r.subtotal.toFixed(2)).toBe("11000.00");
    expect(r.taxAmount.toFixed(2)).toBe("1320.00");
    expect(r.totalAmount.toFixed(2)).toBe("12320.00");
  });

  it("A5 — Mixed rooms: proportional tax allocation is lossless", () => {
    const r = calculateReservationPricing({
      items: [
        { roomTypeId: "r1", roomsCount: 1, basePrice: new Prisma.Decimal("5500"), nights: 1 },
        { roomTypeId: "r2", roomsCount: 1, basePrice: new Prisma.Decimal("3500"), nights: 1 },
      ],
      taxRatePercent: new Prisma.Decimal("12"),
    });
    expect(r.subtotal.toFixed(2)).toBe("9000.00");
    expect(r.taxAmount.toFixed(2)).toBe("1080.00");
    expect(r.totalAmount.toFixed(2)).toBe("10080.00");
    const lineTaxSum = r.lines.reduce((s, l) => s.add(l.taxAmount), new Prisma.Decimal(0));
    expect(lineTaxSum.toFixed(2)).toBe(r.taxAmount.toFixed(2));
  });

  it("A6 — Banker's rounding: 1.005 rounds to 1.00 (even), 2.015 rounds to 2.02 (even)", () => {
    expect(roundCurrency(new Prisma.Decimal("1.005")).toFixed(2)).toBe("1.00");
    expect(roundCurrency(new Prisma.Decimal("2.015")).toFixed(2)).toBe("2.02");
  });

  it("A7 — 100% advance: requiredAdvanceAmount === totalAmount", () => {
    const r = calculateReservationPricing({
      items: [{ roomTypeId: "r", roomsCount: 1, basePrice: new Prisma.Decimal("5500"), nights: 1 }],
      taxRatePercent: new Prisma.Decimal("12"),
      depositRatio: 1.0,
    });
    expect(r.requiredAdvanceAmount.toFixed(2)).toBe(r.totalAmount.toFixed(2));
    expect(r.requiredAdvanceAmount.toFixed(2)).toBe("6160.00");
  });

  it("A8 — Discount reduces taxable base (not applied post-tax)", () => {
    const r = calculateReservationPricing({
      items: [{ roomTypeId: "r", roomsCount: 1, basePrice: new Prisma.Decimal("5500"), nights: 1 }],
      taxRatePercent: new Prisma.Decimal("12"),
      discountAmount: new Prisma.Decimal("500"),
    });
    expect(r.subtotal.toFixed(2)).toBe("5500.00");
    expect(r.discountAmount.toFixed(2)).toBe("500.00");
    expect(r.netTaxableAmount.toFixed(2)).toBe("5000.00");
    expect(r.taxAmount.toFixed(2)).toBe("600.00");
    expect(r.totalAmount.toFixed(2)).toBe("5600.00");
  });

  it("A9 — Idempotency: same input produces identical result on repeated calls", () => {
    const input = {
      items: [{ roomTypeId: "r", roomsCount: 1, basePrice: new Prisma.Decimal("5500"), nights: 1 }],
      taxRatePercent: new Prisma.Decimal("12"),
    };
    const r1 = calculateReservationPricing(input);
    const r2 = calculateReservationPricing(input);
    expect(r1.totalAmount.toFixed(2)).toBe(r2.totalAmount.toFixed(2));
    expect(r1.taxAmount.toFixed(2)).toBe(r2.taxAmount.toFixed(2));
  });
});

// ---------------------------------------------------------------------------
// B. Calendar nights calculation
// ---------------------------------------------------------------------------
describe("B. CALENDAR NIGHTS CALCULATION", () => {
  it("B1 — 1 night: 2026-09-08 to 2026-09-09", () => {
    expect(calculateNights("2026-09-08", "2026-09-09")).toBe(1);
  });

  it("B2 — 3 nights: 2026-09-08 to 2026-09-11", () => {
    expect(calculateNights("2026-09-08", "2026-09-11")).toBe(3);
  });

  it("B3 — DST boundary dates do not drift (UTC-anchored calculation)", () => {
    expect(calculateNights("2026-03-28", "2026-03-29")).toBe(1);
    expect(calculateNights("2026-10-25", "2026-10-26")).toBe(1);
  });

  it("B4 — Same day (0 nights) throws", () => {
    expect(() => calculateNights("2026-09-08", "2026-09-08")).toThrow();
  });

  it("B5 — Check-out before check-in throws", () => {
    expect(() => calculateNights("2026-09-09", "2026-09-08")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// C. calculateBookingPrice — DB-integrated canonical engine (mocked client)
// ---------------------------------------------------------------------------
describe("C. CANONICAL PRICING ENGINE — calculateBookingPrice() with mocked DB", () => {
  function makeClient(opts: { taxRate?: string; taxFound?: boolean; roomFound?: boolean } = {}) {
    const { taxRate = "12.00", taxFound = true, roomFound = true } = opts;
    return {
      roomType: {
        findMany: vi.fn().mockResolvedValue(
          roomFound
            ? [{ id: "rt-std", name: "Standard Heritage Room", basePrice: new Prisma.Decimal("5500.00"), isActive: true }]
            : []
        ),
      },
      tax: {
        findFirst: vi.fn().mockResolvedValue(
          taxFound
            ? { id: "t1", code: "ROOM_GST", rate: new Prisma.Decimal(taxRate), isActive: true, name: "Room GST" }
            : null
        ),
      },
    } as unknown as Prisma.TransactionClient;
  }

  const STD: import("../pricing-calculator").CalculateBookingPriceInput = {
    checkInDate: "2026-09-08",
    checkOutDate: "2026-09-09",
    rooms: [{ roomTypeId: "rt-std", roomsCount: 1 }],
  };

  it("C1 — STD room 1 night: subtotal=5500, tax=660, total=6160", async () => {
    const r = await calculateBookingPrice(STD, makeClient());
    expect(r.subtotal.toFixed(2)).toBe("5500.00");
    expect(r.taxAmount.toFixed(2)).toBe("660.00");
    expect(r.totalAmount.toFixed(2)).toBe("6160.00");
    expect(r.requiredAdvanceAmount.toFixed(2)).toBe("6160.00");
    expect(r.taxRatePercent.toFixed(2)).toBe("12.00");
    expect(r.taxCode).toBe("ROOM_GST");
    expect(r.nights).toBe(1);
    expect(r.currency).toBe("INR");
  });

  it("C2 — CRITICAL: Fails closed when ROOM_GST is missing — no silent fallback", async () => {
    await expect(calculateBookingPrice(STD, makeClient({ taxFound: false }))).rejects.toThrow(
      "Active room accommodation tax configuration (code: 'ROOM_GST') not found in database."
    );
  });

  it("C3 — Fails closed when room type is not found / inactive", async () => {
    await expect(calculateBookingPrice(STD, makeClient({ roomFound: false }))).rejects.toThrow(
      "One or more selected room types are invalid or inactive."
    );
  });

  it("C4 — Throws when rooms array is empty", async () => {
    await expect(calculateBookingPrice({ ...STD, rooms: [] }, makeClient())).rejects.toThrow(
      "At least one room is required"
    );
  });

  it("C5 — Throws when dates are empty strings", async () => {
    await expect(
      calculateBookingPrice({ checkInDate: "", checkOutDate: "", rooms: STD.rooms }, makeClient())
    ).rejects.toThrow("Check-in and check-out dates are required.");
  });

  it("C6 — Throws when check-out is before check-in", async () => {
    await expect(
      calculateBookingPrice({ checkInDate: "2026-09-09", checkOutDate: "2026-09-08", rooms: STD.rooms }, makeClient())
    ).rejects.toThrow();
  });

  it("C7 — Tax lookup uses code='ROOM_GST' and isActive=true (not GST_ROOM_12 or GST_ROOM_18)", async () => {
    const client = makeClient();
    await calculateBookingPrice(STD, client);
    const callArg = (client.tax.findFirst as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.where.code).toBe("ROOM_GST");
    expect(callArg.where.isActive).toBe(true);
  });

  it("C8 — Preview total === reservation total (independent recalculation idempotency)", async () => {
    const preview = await calculateBookingPrice(STD, makeClient());
    const reservation = await calculateBookingPrice(STD, makeClient());
    expect(preview.totalAmount.toFixed(2)).toBe(reservation.totalAmount.toFixed(2));
    expect(preview.taxAmount.toFixed(2)).toBe(reservation.taxAmount.toFixed(2));
    expect(preview.totalAmount.toFixed(2)).toBe("6160.00");
  });

  it("C9 — roomDetails populated with correct room name and rate", async () => {
    const r = await calculateBookingPrice(STD, makeClient());
    expect(r.roomDetails).toHaveLength(1);
    expect(r.roomDetails[0].name).toBe("Standard Heritage Room");
    expect(r.roomDetails[0].ratePerNight.toFixed(2)).toBe("5500.00");
    expect(r.roomDetails[0].totalNights).toBe(1);
  });

  it("C10 — Multi-night via canonical engine: 3 nights = 18480", async () => {
    const r = await calculateBookingPrice(
      { checkInDate: "2026-09-08", checkOutDate: "2026-09-11", rooms: [{ roomTypeId: "rt-std", roomsCount: 1 }] },
      makeClient()
    );
    expect(r.nights).toBe(3);
    expect(r.subtotal.toFixed(2)).toBe("16500.00");
    expect(r.taxAmount.toFixed(2)).toBe("1980.00");
    expect(r.totalAmount.toFixed(2)).toBe("18480.00");
  });
});

// ---------------------------------------------------------------------------
// D. Financial Invariants
// ---------------------------------------------------------------------------
describe("D. FINANCIAL INVARIANTS", () => {
  it("D1 — totalAmount = netTaxableAmount + taxAmount (invariant holds across configs)", () => {
    const testCases = [
      { price: "5500", nights: 1, tax: "12", disc: "0" },
      { price: "5500", nights: 3, tax: "12", disc: "500" },
      { price: "8000", nights: 2, tax: "18", disc: "0" },
      { price: "3500", nights: 1, tax: "5",  disc: "200" },
    ];
    for (const tc of testCases) {
      const r = calculateReservationPricing({
        items: [{ roomTypeId: "r", roomsCount: 1, basePrice: new Prisma.Decimal(tc.price), nights: tc.nights }],
        taxRatePercent: new Prisma.Decimal(tc.tax),
        discountAmount: new Prisma.Decimal(tc.disc),
      });
      expect(r.netTaxableAmount.add(r.taxAmount).toFixed(2)).toBe(r.totalAmount.toFixed(2));
    }
  });

  it("D2 — All pricing results are Prisma.Decimal instances (no JS float contamination)", () => {
    const r = calculateReservationPricing({
      items: [{ roomTypeId: "r", roomsCount: 1, basePrice: new Prisma.Decimal("5500"), nights: 1 }],
      taxRatePercent: new Prisma.Decimal("12"),
    });
    expect(r.subtotal).toBeInstanceOf(Prisma.Decimal);
    expect(r.taxAmount).toBeInstanceOf(Prisma.Decimal);
    expect(r.totalAmount).toBeInstanceOf(Prisma.Decimal);
    expect(r.requiredAdvanceAmount).toBeInstanceOf(Prisma.Decimal);
    for (const line of r.lines) {
      expect(line.ratePerNight).toBeInstanceOf(Prisma.Decimal);
      expect(line.taxAmount).toBeInstanceOf(Prisma.Decimal);
      expect(line.lineTotal).toBeInstanceOf(Prisma.Decimal);
    }
  });

  it("D3 — Oversized discount is capped at subtotal (tax never negative)", () => {
    const r = calculateReservationPricing({
      items: [{ roomTypeId: "r", roomsCount: 1, basePrice: new Prisma.Decimal("5500"), nights: 1 }],
      taxRatePercent: new Prisma.Decimal("12"),
      discountAmount: new Prisma.Decimal("99999"),
    });
    expect(r.discountAmount.toFixed(2)).toBe("5500.00");
    expect(r.netTaxableAmount.toFixed(2)).toBe("0.00");
    expect(r.taxAmount.toFixed(2)).toBe("0.00");
    expect(r.totalAmount.toFixed(2)).toBe("0.00");
  });
});
