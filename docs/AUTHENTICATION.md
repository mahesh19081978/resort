# RESORT & RESTAURANT MANAGEMENT SYSTEM — AUTHENTICATION & RBAC SPECIFICATION

**System:** The Royal Reserve Resort Management System  
**Phase:** 0.3.1 Production Authentication Security Hardening  
**Framework:** Next.js 16.3.3 App Router & Prisma ORM  

---

## 1. Authentication Security & Fail-Closed Policy

### 1.1 Strict Fail-Closed Policy
* **Database Unavailable $\rightarrow$ Authentication Denied:** Under no circumstances does the system fall back to hardcoded, static, or offline credentials. If PostgreSQL is unreachable or connection fails, the login action immediately terminates and returns a safe generic system error.
* **Database Unavailable $\rightarrow$ Session Access Denied:** An existing valid JWT session is never trusted if the database is offline. Every protected server request requires live verification of user existence, active status (`isActive === true`), and session version alignment against PostgreSQL.
* **Missing or Invalid `AUTH_SECRET` $\rightarrow$ Crash / Refusal:** The application strictly enforces that `AUTH_SECRET` is defined and has a minimum length of 32 characters. It will never fall back to an insecure default secret string.

### 1.2 Session Authority vs. JWT Transport
* **JWT = Transport / Cryptographic Proof:** The signed token simply proves that a session was issued to a given `userId` within the last 7 days.
* **Database User = Authoritative State:** Real-time account attributes (active status, password modifications, forced logouts) reside in PostgreSQL.
* **Session Version Invalidation (`sessionVersion`):** When a user changes their password, is downgraded, or is deactivated, their database `sessionVersion` increments. All existing JWTs carrying previous versions are immediately rejected.
* **Database Role / Permissions = Authoritative Authorization:** Roles and permissions are never blindly read from the JWT for authorization decisions; they are re-queried or strictly validated from the live database record.

### 1.3 Password Security & Timing Hardening
* Passwords are never stored in plaintext. They are hashed using `bcryptjs` with 12 salt rounds (`SALT_ROUNDS = 12`) in [src/lib/auth/password.ts](file:///d:/xampp/htdocs/Projects--git/resort/src/lib/auth/password.ts).
* Password hashes are excluded from client bundles, public responses, and standard audit logs.
* Email addresses are normalized (`normalizeEmail: trim().toLowerCase()`).
* **Timing Hardening:** If an email is not found or the user is inactive, `loginAction` performs a dummy bcrypt comparison against `DUMMY_BCRYPT_HASH` to eliminate response latency discrepancies and prevent user enumeration.

### 1.4 Development Credentials Policy
* **Zero Credentials in UI:** The login form ([src/app/admin/login/page.tsx](file:///d:/xampp/htdocs/Projects--git/resort/src/app/admin/login/page.tsx)) contains empty initial inputs. No development passwords, demo defaults, or production hints are rendered in HTML.
* **Seed Bootstrap Security:** In [prisma/seed.ts](file:///d:/xampp/htdocs/Projects--git/resort/prisma/seed.ts), bootstrap administrator credentials must be provided via `DEV_ADMIN_PASSWORD`. If not provided during local seeding, a temporary 16-character cryptographically random password is generated and output only in the local console.

---

## 2. Rate Limiting Architecture

### 2.1 Interface & Separation of Concerns
* Rate limiting logic in [src/lib/auth/rate-limit.ts](file:///d:/xampp/htdocs/Projects--git/resort/src/lib/auth/rate-limit.ts) is abstracted behind the `RateLimiter` interface (`check(key)`, `record(key, success)`).
* **Local Development:** Uses `InMemoryRateLimiter` (sliding window of 5 failed attempts per 15 minutes per IP/email).
* **Production Deployment (Vercel Serverless):** In production, `RateLimiter` must be backed by a shared/distributed storage adapter (e.g. Upstash Redis or a PostgreSQL rate-limit table) because in-memory state is isolated per serverless lambda instance.

---

## 3. Centralized RBAC & Server Action Enforcement

### 3.1 Granular Permission Verification
* All sensitive Server Actions must invoke `requirePermission(permission)`:
  ```typescript
  import { requirePermission } from '@/lib/auth/auth';

  export async function modifySomethingAction(formData: FormData) {
    const user = await requirePermission('folio:update');
    // Proceeds only if active user has the specified permission
  }
  ```
* Middleware acts only as an edge router guard (`/admin/*`), redirecting unauthenticated traffic to `/admin/login`. **Middleware is never the authoritative authorization layer.**

### 3.2 Super Administrator Protection Invariant
* At least one active `SUPER_ADMIN` must remain in the system at all times.
* The helper `assertSuperAdminInvariant(userId, newRole, newActiveStatus)` ensures that operations attempting to deactivate, delete, or downgrade the sole remaining Super Administrator fail with a `BUSINESS_RULE_VIOLATION`.

---

## 4. Security Audit Logging
* Events logged to `AuditLog`: `LOGIN_SUCCESS`, `LOGIN_FAILURE`, `LOGIN_RATE_LIMITED`, `LOGIN_SYSTEM_ERROR`, and `LOGOUT`.
* Automatic redaction of sensitive parameters (`password`, `passwordHash`, `token`, `secret`, `authSecret`) in [src/lib/auth/audit.ts](file:///d:/xampp/htdocs/Projects--git/resort/src/lib/auth/audit.ts).