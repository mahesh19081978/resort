# RESORT & RESTAURANT MANAGEMENT SYSTEM — ARCHITECTURE DOCUMENTATION

**System:** The Royal Reserve Resort Management System (PMS + POS + ERP)  
**Phase:** 0.1 Foundation Architecture & Initialization  
**Target Next.js Version:** 16.3.3 (App Router)  

---

## 1. Executive Summary & Overview

The Resort & Restaurant Management System is an enterprise-grade hospitality platform combining:
1. **Public Resort Website & Direct Booking Engine** (SEO-optimized, high-conversion, hospitality design aesthetic).
2. **Property Management System (PMS)** (Room inventory, reservation lifecycles, guest check-in/check-out, webcam photo verification, guest folios).
3. **Restaurant Point-of-Sale (POS)** (Dine-in, Take-away, Room service, table management, table joining/grouping, kitchen KOT lifecycle, split billing).
4. **Enterprise Inventory & Store Ledger** (Multi-department stock tracking: Kitchen, Bar, Housekeeping, Maintenance; stock movements, adjustments, wastage).
5. **Procurement & Vendor Payable Engine** (Purchase requests, PO generation, Goods Receipt Notes / GRN with partial/damaged item tracking, purchase bills, vendor ledgers).
6. **Centralized RBAC & Audit System** (Strict server-side permission checks, session management via jose, tamper-evident audit logging).

---

## 2. Technology Stack & Foundation

* **Framework:** Next.js 16.3.3 (App Router, Server Components by default, Server Actions for mutations).
* **Language & Typing:** TypeScript (Strict mode enabled, zero implicit any).
* **Styling & Design System:** Tailwind CSS with custom hospitality color palette (#FAF7F2 Warm Ivory, #1E3F20 Forest Green, #C5A059 Muted Gold, #8B5A2B Natural Wood, #22252A Dark Charcoal).
* **Database & ORM:** PostgreSQL (Neon PostgreSQL Serverless in production, pooled DATABASE_URL with unpooled DIRECT_URL for migrations) via Prisma ORM.
* **Authentication:** jose (Lightweight, standards-compliant JWT in secure HttpOnly, SameSite=Lax cookies; edge-compatible).
* **Authorization:** Custom role-based and permission-based RBAC (hasPermission(user, 'permission:key')).
* **Validation:** Zod schemas applied server-side on all Server Actions and route handlers.
* **Storage:** Vercel Blob storage prepared for guest webcam capture, identity documents, and media assets.
* **Email & Communications:** Resend integration prepared for reservation confirmations and alerts.
* **Bot Protection:** Cloudflare Turnstile integration prepared for public booking/contact endpoints.
* **Sanitization:** isomorphic-dompurify for HTML sanitization before rendering or persistence.
* **Security Headers:** Strict Content Security Policy, HSTS, X-Frame-Options (SAMEORIGIN), X-Content-Type-Options (
osniff), Permissions-Policy.

---

## 3. Repository & Folder Structure

`	ext
src/
├── app/
│   ├── (public)/                 # Public website and guest portal
│   │   ├── layout.tsx            # Warm Ivory header, navigation & footer shell
│   │   ├── page.tsx              # Resort homepage with availability bar
│   │   ├── rooms/                # Accommodations catalog
│   │   ├── services/             # Experiences, wellness & spa
│   │   ├── restaurant/           # Dining experiences & menus
│   │   ├── attractions/          # Local points of interest
│   │   ├── gallery/              # High-resolution visual gallery
│   │   ├── contact/              # Inquiries and location
│   │   └── booking/              # Online reservation engine
│   │
│   ├── admin/                    # Operational Backoffice / PMS / POS
│   │   ├── layout.tsx            # Operational sidebar, topbar & breadcrumbs
│   │   ├── login/                # Staff authentication
│   │   ├── dashboard/            # Real-time operational overview
│   │   ├── bookings/             # PMS reservation management
│   │   ├── rooms/                # Physical rooms & room types
│   │   ├── frontdesk/            # Check-in, webcam capture, ID verification
│   │   ├── folios/               # Running guest folio ledger
│   │   ├── restaurant/           # Table map, POS, KOT lifecycle
│   │   ├── inventory/            # Multi-department stock ledger
│   │   ├── procurement/          # PO, GRN, vendor payables
│   │   ├── reports/              # Financial & operational analytics
│   │   └── access/               # RBAC & staff account control
│   │
│   ├── api/                      # Webhooks & specialized REST endpoints
│   ├── globals.css               # Base Tailwind layers & hospitality palette
│   └── layout.tsx                # Root HTML document wrapper
│
├── actions/                      # Next.js Server Actions (mutations)
│   ├── auth.ts                   # Login / logout actions
│   ├── booking/                  # Availability search & booking actions
│   ├── rooms/                    # Room management actions
│   ├── guests/                   # Guest profile actions
│   ├── folio/                    # Folio transaction actions
│   ├── restaurant/               # Order, KOT, and billing actions
│   ├── inventory/                # Stock movement actions
│   └── procurement/              # Purchase order & GRN actions
│
├── components/                   # Reusable UI & presentation
│   ├── ui/                       # Design tokens (Button, Card, Input)
│   ├── layout/                   # PublicHeader, PublicFooter, AdminNavigation
│   ├── public/                   # Public widgets (hero, gallery, booking bar)
│   ├── booking/                  # Booking wizard steps
│   ├── frontdesk/                # Webcam capture, check-in dialogs
│   ├── restaurant/               # Table session grid, KOT cards
│   ├── inventory/                # Stock ledger tables
│   └── admin/                    # Backoffice tables, stat cards
│
├── features/                     # Domain business logic & services
│   ├── booking/
│   ├── rooms/
│   ├── guests/
│   ├── folio/
│   ├── restaurant/
│   ├── inventory/
│   └── procurement/
│
├── lib/                          # Core infrastructure
│   ├── auth/                     # session.ts (jose), auth.ts (cookies/context)
│   ├── db/                       # prisma.ts (singleton client)
│   ├── permissions/              # rbac.ts (centralized permission matrix)
│   ├── security/                 # sanitize.ts (DOMPurify)
│   ├── storage/                  # Blob storage helpers
│   ├── email/                    # Resend integration
│   ├── errors.ts                 # Standardized AppError & ActionResult
│   └── utils.ts                  # Classname merger (clsx + tailwind-merge)
│
├── validations/                  # Zod validation schemas
│   └── index.ts                  # Booking & login schemas
│
prisma/
├── schema.prisma                 # Database schema foundation
└── seed.ts                       # Seed scripts (users, roles, initial setup)
`

---

## 4. Architectural Domain Principles

### 4.1 Reservation ≠ Stay ≠ Physical Room
A critical domain boundary is enforced:
* **Reservation:** Represents the contractual booking agreement made in advance.
* **Stay:** Represents the actual operational guest visit upon check-in.
* **Physical Room:** The concrete physical asset (e.g. S-101) assigned during check-in or room moves.
A guest may hold a reservation without an assigned physical room until check-in. Stays can change physical rooms without modifying the historical reservation record.

### 4.2 Room Type vs. Physical Room Generation
* RoomType defines the commercial category (Standard, Deluxe, Royal Villa), pricing rules, and default amenities.
* PhysicalRoom represents the physical unit assigned a unique room number (e.g., prefix S-, starting at 101, count 10 -> S-101 through S-110). Physical rooms may override amenities (e.g., handicap accessibility or premium corner views).

### 4.3 Database-Driven Dynamic Amenities
Amenities (Wi-Fi, AC, Geyser, Jacuzzi, Balcony, Safe) are modeled as distinct database entities linked via relational tables, never hardcoded in UI templates.

### 4.4 Financial Transactions & Folio Architecture
* Folios are append-only financial ledgers. Direct alteration of 	otalBalance is strictly prohibited.
* Every debit (room charge, restaurant meal, spa service, laundry) and credit (advance payment, card swipe, cash deposit, refund) is a discrete transactional item.
* No boolean paid: true shortcuts. All balances are derived from reconciled transactions. Decimal calculations avoid JavaScript floating-point errors.

### 4.5 Restaurant Operations: 3 Channels & Decoupled State
* Channel 1: DINE_IN (requires Table/Session; KOT -> Kitchen -> Bill -> Payment OR Charge to Room Folio).
* Channel 2: TAKE_AWAY (Direct customer order -> KOT -> Kitchen -> Bill -> Payment).
* Channel 3: ROOM_SERVICE (Tied to active room stay folio -> KOT -> Delivery -> Charge to Folio OR Cash on Delivery).
* Restaurant Order, KOT, Bill, and Payment remain independent decoupled entities.

### 4.6 Table Management & Split Billing
* Physical tables (T-01, T-02) are never merged at the database record level. Multiple tables are grouped under an active TableSession / TableGroup.
* Bills support split by item, equal split, or custom amounts, with strict server-side validation ensuring the sum of splits equals the gross bill total.

### 4.7 Inventory & Stock Ledger
* Inventory is department-agnostic (Kitchen, Bar, Housekeeping, Maintenance).
* Tracks raw ingredients, linen, toiletries, and cleaning chemicals.
* Relies on a double-entry style stock ledger (StockMovement) rather than only mutating a static currentStock field.

### 4.8 Procurement Pipeline
* Sequence: PurchaseRequest -> Approval -> PurchaseOrder -> Vendor -> GoodsReceipt (GRN) -> PurchaseBill -> VendorPayment.
* Native support for partial shipments, damaged item rejections, vendor credit notes, and outstanding vendor balances.

---

## 5. Authentication, RBAC & Security Strategy

### 5.1 Authentication
Authentication utilizes JWT tokens generated via jose with HS256, stored in secure, HttpOnly, SameSite=Lax cookies (esort_session).

### 5.2 Centralized Permission RBAC
Roles include: SUPER_ADMIN, ADMIN, RECEPTIONIST, RESTAURANT_MANAGER, RESTAURANT_BILLER, KITCHEN_STAFF, STORE_MANAGER, PURCHASE_MANAGER, and CONTENT_MANAGER.
Authorization checks evaluate fine-grained permissions:
`	ypescript
hasPermission(user, 'restaurant:bill:settle')
requirePermission(user, 'folio:update')
`
Client components never make authoritative access decisions; all mutations and sensitive data fetches are guarded by Server Actions and middleware.

---

## 6. Development Conventions & Next Steps

* **Strict TypeScript:** No ny. All props, actions, and utilities are strictly typed.
* **Server Components First:** Only UI requiring interactivity (useState, usePathname, DOM listeners) utilizes 'use client'.
* **Standardized Mutation Results:** All Server Actions return ActionResult<T> with standard error codes (VALIDATION_ERROR, AUTHENTICATION_ERROR, AUTHORIZATION_ERROR, BUSINESS_RULE_VIOLATION).
* **Phase 0.2 Target:** Complete Entity Relationship Diagram (ERD), full Prisma domain schema across all 7 subsystems, database seeders, and migration scripts.