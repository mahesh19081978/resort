# Folio & Billing Ledger Architecture

## 1. Overview

The Folio system represents the financial subledger for guest stays in the resort. Each active `Stay` has exactly one primary `Folio` (`1:1` relationship) containing itemized charges, taxes, discounts, and payments.

All monetary calculations use PostgreSQL `Decimal(12, 2)` (Prisma `Decimal`) to eliminate floating-point rounding errors.

---

## 2. Folio Lifecycle & Statuses

Folio status transitions follow strict financial accounting rules:

```text
[OPEN] ──(Stay Active: Charges/Orders Posted)
  │
  ├─► [LOCKED] (Under billing review/audit)
  │
  ├─► [SETTLED] (Final balance == 0, checkout executed)
  │
  └─► [CLOSED] (Archived after financial audit)
```

- **OPEN**: Active ledger accepting new charges (room charges, restaurant orders, minibar, spa).
- **LOCKED**: Read-only state during dispute review or night audit.
- **SETTLED**: Paid in full with zero balance; room assignment released upon checkout.
- **CLOSED**: Fully reconciled by accounting and locked from further edits.

---

## 3. Folio Items (Charges & Credits)

Every debit or credit to the folio is stored as an immutable `FolioItem`:

| `FolioItemType` | Classification | Description |
|:---|:---|:---|
| `ROOM_CHARGE` | Charge (Debit) | Base accommodation night rate |
| `RESTAURANT_CHARGE` | Charge (Debit) | Charges billed from POS restaurant orders |
| `ROOM_SERVICE_CHARGE` | Charge (Debit) | In-room dining and amenities |
| `LAUNDRY_CHARGE` | Charge (Debit) | Laundry and dry cleaning |
| `EXTRA_SERVICE_CHARGE` | Charge (Debit) | Activities, tours, or extra bed requests |
| `DAMAGE_FEE` | Charge (Debit) | Room property damage or incidentals |
| `MISC_CHARGE` | Charge (Debit) | Miscellaneous front desk fees |
| `TAX_CHARGE` | Charge (Debit) | Applicable GST/service tax items |
| `DISCOUNT_CREDIT` | Credit | Promotional discounts or manager adjustments |
| `PAYMENT_CREDIT` | Credit | Non-gateway credit allocations |
| `REFUND_DEBIT` | Debit | Post-settlement refund reversals |

### Voiding Rule:
Folio items are never deleted. When an item is contested or voided, `isVoided = true` is set along with `voidReason`. Voided items are excluded from total charges and balance calculations.

---

## 4. Payment Contexts: Reservation Advance vs Folio Settlement

The system strictly distinguishes between advance reservation deposits and stay folio settlements:

1. **`PaymentContext.RESERVATION_ADVANCE`**:
   - Recorded against the `Reservation` prior to guest arrival.
   - Tied to `reservationId`.
   - Credited towards reservation total; NOT mixed directly into stay folio payments unless explicitly allocated through domain transfer.

2. **`PaymentContext.FOLIO_SETTLEMENT`**:
   - Recorded directly against the `Folio` (`folioId = folio.id`) during in-house stay or checkout.
   - Sourced from guest payment via `CARD`, `UPI`, `CASH`, `BANK_TRANSFER`, or `ONLINE`.
   - Directly offsets running charges to achieve zero balance.

---

## 5. Balance Calculation Formula

The net balance is computed deterministically on the server:

$$\text{Total Charges} = \sum_{\text{item} \in \text{Items}, \neg\text{item.isVoided}} \text{item.amount}$$

$$\text{Total Credits} = \sum_{\text{credit} \in \text{Credits}, \neg\text{credit.isVoided}} \text{credit.amount}$$

$$\text{Total Payments} = \sum_{\text{p} \in \text{Payments}, \text{p.status} == \text{SUCCESS}} \text{p.amount}$$

$$\text{Net Balance} = \text{Total Charges} - \text{Total Credits} - \text{Total Payments}$$

Checkout cannot proceed if $\text{Net Balance} > 0.00$.
