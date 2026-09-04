# RESORT & RESTAURANT MANAGEMENT SYSTEM — AUTHENTICATION & RBAC SPECIFICATION

**System:** The Royal Reserve Resort Management System  
**Phase:** 0.3 Authentication, Session Management, RBAC Enforcement & Admin Access  
**Framework:** Next.js 16.3.3 App Router & Prisma ORM  

---

## 1. Authentication Architecture

### 1.1 Password Security
* Passwords are never stored in plaintext. They are hashed using `bcryptjs` with 12 salt rounds (`SALT_ROUNDS = 12`) in [src/lib/auth/password.ts](file:///d:/xampp/htdocs/Projects--git/resort/src/lib/auth/password.ts).
* Password hashes are excluded from all client components, public API responses, and standard audit logs.
* Email addresses are strictly normalized via `normalizeEmail(email)` (`trim().toLowerCase()`) ensuring case-insensitive identity resolution.

### 1.2 Session Token & Cookie Security
* Session tokens are signed JSON Web Tokens (`HS256`) created via `jose` in [src/lib/auth/session.ts](file:///d:/xampp/htdocs/Projects--git/resort/src/lib/auth/session.ts).
* The session payload contains minimal identity metadata:
  ```json
  {
    "sub": "usr_cuid_12345",
    "email": "receptionist@royalreserve.com",
    "role": "RECEPTIONIST",
    "iat": 1788500000,
    "exp": 1789104800
  }
  ```
* Stale permissions, PII, and password hashes are never embedded in the JWT.
* Cookies (`resort_session`) are issued with:
  - `HttpOnly: true` (Inaccessible to client-side JavaScript / XSS protection)
  - `Secure: process.env.NODE_ENV === 'production'` (HTTPS only in production)
  - `SameSite: 'lax'` (CSRF protection across top-level cross-site navigations)
  - `Path: '/'`
  - `Max-Age: 7 days` (604,800 seconds)

### 1.3 Server-Side Session & Account Liveness Verification
* The session is validated server-side by `getCurrentUser()` in [src/lib/auth/auth.ts](file:///d:/xampp/htdocs/Projects--git/resort/src/lib/auth/auth.ts):
  1. Cryptographic JWT signature and expiration verification.
  2. Database lookup against `User` table to verify that the account still exists and `isActive === true`.
  3. If an account has been disabled after login, subsequent protected requests immediately fail with `UNAUTHORIZED`.

---

## 2. Login Flow & Brute-Force Rate Limiting

### 2.1 Constant-Time Generic Responses
* To prevent email enumeration attacks, failed login attempts return a uniform error message:
  `"Invalid email or password."`
  The application does not disclose whether the email was found or if the password was incorrect.

### 2.2 Sliding Window Rate Limiter
* Built-in in-memory sliding window rate limiter in [src/lib/auth/rate-limit.ts](file:///d:/xampp/htdocs/Projects--git/resort/src/lib/auth/rate-limit.ts):
  - Limits login attempts to **5 attempts per 15-minute window** per client IP and email combination.
  - Exceeding the threshold returns HTTP rate limit alerts with retry-after timestamps and triggers `LOGIN_RATE_LIMITED` audit logs.

### 2.3 Security Audit Logging
* Events are recorded to the `AuditLog` table:
  - `LOGIN_SUCCESS`: Records user ID, IP address, user agent, and timestamp.
  - `LOGIN_FAILURE`: Records attempted email, IP address, user agent, and failure reason (`USER_NOT_FOUND`, `USER_INACTIVE`, `INVALID_PASSWORD`).
  - `LOGIN_RATE_LIMITED`: Records rate limit breach.
  - `LOGOUT`: Records session termination.
* Sensitive fields (`password`, `passwordHash`, `token`, `secret`) are automatically redacted before storage.

---

## 3. Centralized RBAC Enforcement

### 3.1 Role Hierarchy & Granular Permissions
* Centralized permission catalog in [src/lib/permissions/rbac.ts](file:///d:/xampp/htdocs/Projects--git/resort/src/lib/permissions/rbac.ts):
  - `SUPER_ADMIN`: Full operational and administrative access.
  - `ADMIN`: Property management, pricing, operations, and reporting.
  - `RECEPTIONIST`: Front desk check-in/out, bookings, and folio posting.
  - `RESTAURANT_MANAGER`: POS order management, table assignments, and KOT lifecycles.
  - `RESTAURANT_BILLER`: Bill settlement and split payments.
  - `KITCHEN_STAFF`: Kitchen Display System (KDS) and KOT status updates.
  - `STORE_MANAGER`: Stock receipts, issues, transfers, and inventory counts.
  - `PURCHASE_MANAGER`: PO issuance, vendor bills, and approvals.
  - `CONTENT_MANAGER`: Resort public website marketing content and offers.

### 3.2 Server Action Enforcement Pattern
Server Actions must never rely on client-side state or hidden UI elements. Enforcement is performed explicitly on the server:
```typescript
import { requirePermission } from '@/lib/auth/auth';

export async function processFolioSettlementAction(folioId: string, amount: number) {
  const user = await requirePermission('folio:settle');
  // Execute transaction using verified user context...
}
```

### 3.3 Super Administrator Invariant
* At least one active `SUPER_ADMIN` account must remain in the system at all times.
* Account deactivation or role downgrades targeting the sole remaining Super Administrator must be rejected by business validation.

---

## 4. Route & Middleware Protection

* [middleware.ts](file:///d:/xampp/htdocs/Projects--git/resort/middleware.ts) acts as an edge guard:
  - All `/admin/*` routes (except `/admin/login`) require a valid, non-expired `resort_session` cookie.
  - Unauthenticated requests are redirected to `/admin/login?redirect=<target_path>`.
  - Authenticated requests visiting `/admin/login` are redirected directly to `/admin/dashboard`.
  - Server Components and Server Actions re-verify user liveness against the database before mutating state.

---

## 5. Password Reset & Future Capabilities

* **Password Reset Foundation:** Designed for single-use, cryptographically random, short-lived tokens stored as SHA-256 hashes in a dedicated `PasswordResetToken` table.
* **Turnstile Integration:** Prepared with `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in environment variables for public reservation and contact forms.