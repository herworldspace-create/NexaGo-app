# NEXA — Nigerian Ride-Hailing Platform

NEXA is an original ride-hailing and mobility platform for Nigeria, architecturally
inspired by services like Bolt/Uber but built with entirely original branding,
code, and design.

**Products:** NEXA Ride (first), with NEXA Delivery, NEXA Bike, NEXA Business,
and NEXA Logistics planned for later.

This repository is being built in controlled phases.

- **Phase 1 (complete):** backend foundation — auth, RBAC, identity
  verification architecture, driver verification architecture, documents,
  security foundation.
- **Phase 2 (complete):** admin verification dashboard backend — driver/
  passenger review endpoints, document approval workflow, audit logging,
  admin account bootstrapping.
- **Phase 3 (complete):** fare configuration engine — versioned per-area/
  per-vehicle-category pricing, admin-managed surge overrides, a pure/
  exhaustively-tested fare calculation engine, and a passenger-facing
  fare estimate endpoint.
- **Phase 4 (complete):** ride request & matching engine — driver
  availability/location, vehicle registration, nearby-driver matching with
  full eligibility filtering, atomic (race-safe) ride acceptance, and the
  full ride lifecycle through to completion or cancellation.
- **Phase 5 (complete):** real-time tracking over WebSockets — JWT-authed
  Socket.IO gateway, in-trip driver location push, and ride status push
  to both parties, decoupled from `RidesService` via a domain event.
- **Phase 6 (complete):** payments — a real Paystack integration (not a
  stub) with signature-verified, idempotent webhook settlement; cash
  payment as an explicit driver-attestation model; atomic driver wallet
  crediting and withdrawal-request debiting.
- **Phase 7 (complete):** admin ride & financial management — live/
  historical ride views with admin/support cancellation, payment listing
  with an explicitly-labeled bookkeeping-only refund marker, and a manual
  withdrawal-resolution workflow (complete/fail/reject, with atomic
  balance reversal on failure) standing in for the still-unimplemented
  automated payout.
- **Phase 8 (complete):** notifications — a real FCM integration (via the
  official `firebase-admin` SDK), an in-app notification inbox, and
  event-driven push for ride status changes and payment receipts,
  including the dispatch-broadcast-to-nearby-drivers piece explicitly
  deferred since Phase 5.
- **Phase 9 (complete):** ratings & complaints — one rating per (ride,
  rater) enforced by a race-safe DB unique constraint, atomically
  maintained rating aggregates on driver/passenger profiles, and a
  complaint-raising + admin-resolution workflow.
- **Phase 10 (complete):** multi-service expansion — a locked-in fixed
  price with an explicit, versioned destination-update path; vehicle
  category classification (passenger vs. delivery); a full parallel
  "Nexa Deliver" courier/logistics system with PIN-verified recipient
  confirmation; and a real Mapbox routing integration powering distance/
  ETA/polyline data for both rides and deliveries.
- **Phase 11 (complete):** deliveries wired into the formal payment
  system — the scope boundary flagged at the end of Phase 10. `Payment`
  now generalizes to either a ride or a delivery; deliveries settle
  through the exact same signature-verified webhook / driver-attested
  cash path rides use, instead of crediting the wallet directly at
  completion.

Still not built: passenger/driver/admin UI, actual payout transfers to
driver bank accounts, actual gateway refunds.

---

## 1. Repository layout

```
nexa/
├── backend/          # NestJS + TypeScript + Prisma API (Phase 1 focus)
│   ├── src/
│   │   ├── config/           # env validation, typed config, Prisma service
│   │   ├── common/            # guards, decorators, filters, enums, crypto utils
│   │   └── modules/
│   │       ├── auth/                    # OTP-based auth, JWT, device sessions
│   │       ├── users/                    # current-user profile
│   │       ├── identity-verification/    # IdentityVerificationService abstraction
│   │       ├── driver-verification/      # onboarding state machine
│   │       └── documents/                # secure document upload abstraction
│   ├── prisma/schema.prisma
│   ├── test/                 # e2e tests
│   ├── Dockerfile
│   └── .env.example
├── apps/
│   ├── passenger/    # placeholder — Flutter app, later phase
│   ├── driver/       # placeholder — Flutter app, later phase
│   └── admin/        # placeholder — Next.js dashboard, later phase
├── docker-compose.yml
└── README.md
```

---

## 2. Architecture summary

- **Backend:** NestJS (TypeScript), modular by domain (auth, identity
  verification, driver verification, documents, users).
- **Database:** PostgreSQL via Prisma ORM. Schema currently covers users,
  roles, passenger/driver profiles, identity verification, driver documents,
  vehicles, device sessions, consent records, and admin audit logs.
  Ride/payment/wallet tables are intentionally deferred to their own phases.
- **Auth:** Phone number + OTP. Access tokens are short-lived JWTs bound to a
  specific device session; refresh tokens are opaque, stored only as a hash,
  and rotated on every use. Every route requires authentication by default —
  routes must explicitly opt out with `@Public()`.
- **RBAC:** Roles are `PASSENGER`, `DRIVER`, `ADMIN`, `SUPER_ADMIN`. Enforced
  server-side via a global `RolesGuard` — never trust the frontend to hide a
  button.
- **Identity verification:** All NIN verification goes through the
  `IdentityVerificationService` interface
  (`src/modules/identity-verification/interfaces`). No code in this
  repository queries government systems directly. A `MockIdentityVerificationProvider`
  is provided for development/testing only — it performs no real lookups,
  and the app **refuses to boot with it in production** (enforced in
  `env.validation.ts`). A `LiveIdentityVerificationProvider` stub documents
  exactly what's needed to plug in a real, authorized provider.
- **Driver verification:** An explicit state machine
  (`driver-verification.state-machine.ts`) allow-lists every legal status
  transition, from `DRAFT` through to `ACTIVE`, with failure/suspension
  states. `assertCanAcceptRides()` is the single source of truth for whether
  a driver may go online — the future ride-matching service must call this
  rather than trusting a client-supplied flag.
- **Documents:** Uploads go through a `StorageProvider` abstraction. A
  `LocalStorageProvider` is provided for development; production should
  implement the same interface against private, access-controlled object
  storage (e.g. an S3-compatible bucket with no public policy).
- **Security:** Helmet, CORS restricted to configured origins, global rate
  limiting (`@nestjs/throttler`), global `class-validator` input validation
  with unknown-property rejection, HMAC-hashed OTP codes and refresh tokens,
  AES-256-GCM field encryption utility for anything sensitive that must be
  retained, and a logging interceptor that redacts sensitive field names
  (NIN, passwords, OTP codes, tokens, document images) before anything is
  logged.
- **Data minimization:** Raw NINs are never persisted — only an HMAC hash
  (for duplicate-account detection) and the identity provider's opaque
  reference. Consent is recorded as its own auditable record before any
  identity verification call is made.

---

## 3. What's implemented in Phase 1

| Area | Status |
|---|---|
| Project structure & tooling | ✅ |
| PostgreSQL + Prisma schema | ✅ (core entities; ride/payment deferred) |
| User roles & RBAC | ✅ |
| Phone OTP auth (register/login), JWT + refresh rotation, device sessions | ✅ |
| Identity verification abstraction + mock provider | ✅ (mock only — no real NIN provider wired yet) |
| Driver verification state machine + document upload | ✅ (local storage only — no S3 wired yet) |
| Security foundation (helmet, CORS, rate limiting, validation, encryption, redaction) | ✅ |
| Docker (backend + Postgres) | ✅ |
| Unit tests | ✅ (OTP flow, hashing, encryption, mock identity provider, RBAC guard, state machine) |
| E2E test skeleton | ✅ (health check, auth security posture) |

## 4. What's explicitly NOT in Phase 1

- Passenger app, driver app, admin dashboard UI
- Live location tracking / WebSockets
- Ride matching engine
- Fare engine
- Payments (Paystack/Flutterwave)
- Notifications (FCM)
- Real NIN provider integration (interface only)
- Real S3/object storage integration (interface only)
- Admin verification dashboard (backend endpoints for document review, etc.)

These are planned for subsequent phases, per the phased development plan.

---

## 5. Getting started (requires network access — not available in this sandbox)

```bash
cd backend
cp .env.example .env
# Edit .env: at minimum set JWT_ACCESS_SECRET, JWT_REFRESH_SECRET,
# and FIELD_ENCRYPTION_KEY. Generate secrets with:
#   openssl rand -base64 48   (JWT secrets)
#   openssl rand -base64 32   (FIELD_ENCRYPTION_KEY)

npm install
npx prisma generate
npx prisma migrate dev --name init

npm run start:dev
```

Or via Docker Compose (from the repo root):

```bash
cp backend/.env.example backend/.env   # then fill in secrets
docker compose up --build
```

### Running tests

```bash
cd backend
npm test           # unit tests
npm run test:cov   # unit tests with coverage
npm run test:e2e   # requires a running Postgres + full env config
npm run lint
```

> **Note on this build environment:** the code in this repository was
> written and statically cross-checked (import resolution, Prisma/TypeScript
> enum parity) in a sandbox without internet access, so `npm install` and the
> actual test run could not be executed here. Run the commands above in an
> environment with network access before relying on this as verified-passing.

---

## 5b. Phase 2 — Admin verification dashboard (backend)

New in Phase 2, all under `src/modules/admin/`:

- **Driver review** (`admin/drivers`): list/search/filter drivers by
  verification status; view full driver detail (documents, vehicle,
  identity verification summary — masked for `ADMIN`, unmasked for
  `SUPER_ADMIN`); get a short-lived signed URL to view a specific document.
- **Document workflow**: approve/reject individual documents (rejection
  requires a reason). Approving the last outstanding *mandatory* document
  type automatically advances the driver from `DOCUMENT_REVIEW` to
  `ADMIN_REVIEW` — this check lives in one place
  (`maybeAdvancePastDocumentReview`) rather than being duplicated per
  endpoint. Mandatory document types are currently a fixed list
  (`mandatory-documents.const.ts`); making this configurable per
  city/state is flagged for a later phase, as originally scoped.
- **Driver decisions**: approve → `APPROVED`, activate → `ACTIVE`, reject →
  `ADMIN_REJECTED`, suspend/reactivate, request-resubmission. Every
  transition is re-validated against the same state machine from Phase 1
  (`assertValidTransition`) — an admin cannot force an illegal jump any
  more than the driver-facing endpoints can.
- **Passenger management** (`admin/passengers`): list/search, view, suspend,
  activate. Kept intentionally minimal — ride/complaint history surfaces in
  a later phase once rides exist.
- **Admin accounts** (`admin/admins`, `SUPER_ADMIN` only): create further
  `ADMIN`/`SUPER_ADMIN` accounts. There is no public self-registration path
  for these roles — the OTP endpoint only ever creates `PASSENGER`/`DRIVER`
  accounts. A `prisma/seed.ts` script bootstraps the very first
  `SUPER_ADMIN` from `SEED_SUPER_ADMIN_PHONE`.
- **Audit logging**: a `@AuditLog({ action, targetType })` decorator +
  `AuditLogInterceptor` automatically writes an `AdminAuditLog` row after
  any decorated handler succeeds, capturing the acting admin, the target
  id, and a redacted copy of the request body/response — so audit coverage
  doesn't depend on remembering to log manually in each handler.
  `admin/audit-logs` (also `SUPER_ADMIN` only, since audit trails are
  themselves sensitive) lets you browse the trail.

### Seeding the first admin

```bash
# in backend/.env, set:
SEED_SUPER_ADMIN_PHONE=+2348000000000

npx prisma db seed
```

That account can then log in exactly like any other user — request an OTP,
verify it — and immediately has `SUPER_ADMIN` privileges to create
additional admins.

---

## 5c. Phase 3 — Fare configuration engine

New in Phase 3, split across `src/modules/fare/` (passenger-facing) and
`src/modules/admin/admin-fare.*` (admin CRUD):

- **Money convention**: every monetary field/amount in this repo is an
  integer **kobo** value (1 NGN = 100 kobo) — never a float — to avoid
  rounding drift. `koboToNaira()` handles display conversion.
- **Pure calculation core** (`fare-calculation.util.ts`): `computeFare()`
  takes a config + distance/duration/surge and returns a full breakdown
  (base, distance, time, surge adjustment, service fee, minimum-fare
  floor, total). It has no I/O and is exhaustively unit-tested — flat and
  percentage service fees, surge applied before the fee, the minimum-fare
  floor, negative-input rejection, and a fractional-input case asserting
  every output is an exact integer.
- **Versioned pricing** (`FareConfiguration`): one row per (operating
  area, vehicle category). Creating a new configuration atomically
  deactivates the previous active one inside a transaction
  (`AdminFareService.createFareConfiguration`) — pricing history is kept,
  never overwritten.
- **Surge** (`SurgeSetting`): admin-set manual multiplier, optionally
  scoped to one vehicle category within an area (falls back to an
  area-wide setting, then to 1.00x). This phase does not implement
  algorithmic/demand-based surge — that's a reasonable candidate for a
  later phase once ride-request volume data exists.
- **`POST /fares/estimate`** (passenger-only): resolves the active config
  + current surge for a given area/category and returns a fare breakdown
  for a caller-supplied distance/duration. Deliberately decoupled from
  routing/maps — real distance and duration come from a maps provider
  integrated in a later phase.
- **`admin/fare/*`** (ADMIN/SUPER_ADMIN, audit-logged): CRUD for operating
  areas and vehicle categories, create/list/deactivate fare
  configurations, set/clear surge.

---

## 5d. Phase 4 — Ride request & matching engine

New in Phase 4, in `src/modules/rides/` plus additions to
`src/modules/driver-verification/`:

- **Vehicle registration** (`drivers/vehicles`, new — this was a gap: there
  was previously no way for a driver to register a vehicle at all). A
  vehicle must reference an active `VehicleCategory` to be matchable.
- **Driver availability** (`POST /drivers/location`): reports online/offline
  status and latest lat/lng (`DriverLocation` — a single upserted row per
  driver, not a GPS trail; that's a WebSocket-phase concern). Going online
  is gated on `DriverVerificationService.assertCanAcceptRides`, which was
  extended this phase to also check licence expiry and every mandatory
  document's approval/expiry — not just the coarse status — so a document
  expiring after activation immediately disqualifies the driver again
  without needing an admin to intervene.
- **Matching** (`geo.util.ts`): a pure haversine-distance function plus a
  cheap lat/lng bounding-box pre-filter (no PostGIS in this phase — the
  box is a DB-level pre-filter, the precise haversine check happens in
  application code afterward). `GET /drivers/rides/available` excludes, in
  line with the original spec's list: offline drivers, drivers already on
  another active ride, drivers without an active vehicle in the requested
  category, and anything outside `MAX_MATCHING_RADIUS_KM` — then ranks the
  rest nearest-first.
- **Atomic acceptance** (`POST /drivers/rides/:id/accept`): uses a
  conditional `updateMany({ where: { id, status: 'REQUESTED' }, ... })`.
  If two drivers accept concurrently, exactly one update affects a row;
  the other gets `count: 0` and a `ConflictException` — no double-booking,
  no need for external locking.
- **Ride lifecycle**: `POST /rides` (passenger creates, using `FareService`
  from Phase 3 for a fare snapshot stored on the ride) →
  `available`/`accept` (driver) → `arrived` → `start` → `complete`
  (driver) → optional `cancel` (passenger or driver, disallowed once
  `IN_PROGRESS`). Every transition is validated against an explicit state
  machine (`ride-status.state-machine.ts`) and written to
  `RideStatusHistory`.
- **Explicitly deferred**: live GPS trail/WebSocket push, FCM
  notifications, actual payment capture, ratings at completion,
  algorithmic (demand-based) surge, and a ride expiry/timeout background
  job. `finalFareKobo` is currently just set equal to the estimate at
  completion, since real metered fare needs live trip telemetry that
  doesn't exist yet.

---

## 5e. Phase 5 — Real-time tracking (WebSockets)

New in Phase 5, in `src/modules/realtime/`, plus a shared auth util and one
new dependency edge (`RidesService` now emits a domain event):

- **Scope decision, stated up front**: the spec's real-time section is
  about post-match, ride-scoped tracking (driver location, ride status,
  arrival, start, completion) — not about broadcasting new ride requests
  to searching drivers. That broadcast piece stays on REST polling
  (`GET /drivers/rides/available` from Phase 4) and is flagged as a
  natural fit for a future notifications/dispatch phase, not silently
  dropped.
- **`RealtimeGateway`** (Socket.IO): authenticates every connection with
  the same JWT + revocable-session check as the REST API. The validation
  logic was extracted into `token-validation.util.ts`
  (`resolveAuthenticatedUser`) so the REST `JwtStrategy` and the WS
  gateway share one source of truth — a revoked session is rejected
  identically in both places.
- **Rooms**: `ride:{rideId}` (joined only after the server re-checks the
  same authorization rule as `GET /rides/:id` — a socket can't subscribe
  to a ride it isn't party to) and `user:{userId}` (auto-joined on
  connect, used as a fallback channel).
- **`driver:location` message**: in-trip location ping. The driver's
  active ride is looked up server-side from their own user id — never
  trusted from the payload — so a driver cannot spoof another driver's
  ride. Broadcasts only `{rideId, latitude, longitude, heading,
  timestamp}` to the ride room; no driver profile data, per the spec's
  "don't broadcast sensitive information unnecessarily."
  `DriverLocationService.updatePositionOnly()` was added so this path
  can never accidentally flip a driver's online/offline status — that
  remains exclusively a REST concern.
- **Ride status push**: `RidesService`'s `recordHistory()` — already the
  single choke point every status transition passes through — now also
  emits `ride.status_changed` via `EventEmitter2`. `RidesService` has no
  knowledge of sockets, rooms, or Socket.IO; `RealtimeGateway` is the only
  place that bridges the domain event to a broadcast. This keeps the
  domain layer transport-agnostic.
- **Known simplification, documented in code**: the gateway's CORS is
  permissive (`origin: true`) rather than reading `CORS_ALLOWED_ORIGINS`
  like the REST API does, because `@WebSocketGateway()` decorator options
  are evaluated before Nest's DI container exists. Tightening this is a
  small, isolated follow-up (a factory-based gateway registration
  pattern) rather than a design gap.
- **Tests**: `resolveAuthenticatedUser` (valid/revoked/expired/suspended/
  deleted), and `RealtimeGateway`'s handlers called directly with mocked
  collaborators — subscribe authorization, location-ping driver-only +
  active-ride gating, and status-broadcast fan-out — following the same
  "construct the class and call its methods" pattern used for guards and
  interceptors in earlier phases (a live Socket.IO connection isn't
  exercisable in this sandbox without `npm install`).

---

## 5f. Phase 6 — Payments

New in Phase 6, in `src/modules/payments/` and `src/modules/wallet/`, plus
small additions to the fare engine and `Ride`:

- **Commission snapshotting**: `FareConfiguration` gained
  `platformCommissionBasisPoints`. It's captured onto the `Ride` at
  request time (same pattern as the fare-breakdown snapshot from
  Phase 3) rather than looked up fresh at settlement — so a later
  commission-rate change never retroactively changes what a driver
  earned on a ride already booked under the old rate.
- **`PaymentProvider` abstraction with a real Paystack adapter.** Unlike
  the NIN/SMS providers (where no vendor was named and a mock/stub was
  the honest choice), Paystack is explicitly named in the spec with a
  well-documented public API — so `initialize()` makes a genuine HTTP
  call, and `verifyWebhookSignature()`/`parseWebhookEvent()` are real,
  fully unit-tested crypto/parsing. `initialize()` itself has **not**
  been exercised against Paystack's live API in this sandbox (no
  network, no real credentials) — test it against a Paystack test-mode
  key before production use.
- **The spec's money-safety rules, enforced literally and tested**:
  - *"Never trust payment status supplied by the client"* — a
    CARD/BANK_TRANSFER payment can only ever be marked `PAID` by
    `PaymentsService.handleWebhook`, which checks the Paystack HMAC
    signature (`x-paystack-signature`, SHA-512) before touching anything
    else. `main.ts` now sets `rawBody: true` so the signature is checked
    against the exact bytes Paystack signed, not a re-serialized copy.
  - *"Protect against duplicate payments / replay attacks"* — a webhook
    for an already-`PAID` payment is a safe no-op, recorded as a rejected
    duplicate in the `Transaction` ledger rather than reprocessed.
  - *"Protect against ... incorrect ride totals"* — the webhook's reported
    amount is compared against the stored `Payment.amountKobo` before any
    crediting; a mismatch fails the payment and is logged, never silently
    accepted.
  - **Cash is a different trust model, not a loophole**: there's no
    gateway to verify against, so `confirmCashPayment` is an explicit
    driver attestation — clearly documented as such, and structurally
    separate from the webhook-only path that CARD/BANK_TRANSFER must use.
- **Driver wallet** (`DriverWallet`/`WalletTransaction`): crediting on
  payment success and withdrawal-request debiting both use the same
  atomic conditional-update ("compare-and-swap") technique as the
  Phase 4 ride-acceptance race guard — two concurrent withdrawal requests
  can never both succeed and overdraw the balance.
- **Honest scope boundary**: `PaystackPayoutProvider` (actually
  transferring money to a driver's bank account) is a clearly-labeled,
  genuinely unimplemented stub — real payouts need Paystack Transfer
  Recipients and a bank-account-linking/verification flow that's a
  meaningfully larger scope. Withdrawal *requests* are fully functional
  (the wallet is debited immediately so funds can't be double-spent
  while a payout is pending); the actual transfer is not.
- **Tests**: Paystack signature verification (valid/wrong-secret/
  tampered-body/missing-header), event parsing, and — the most
  safety-critical suite in the project — `PaymentsService`'s signature
  gating, idempotency, amount-mismatch rejection, and commission-split
  wallet crediting; plus `WalletService`'s atomic credit/withdrawal
  behavior.

---

## 5g. Phase 7 — Admin ride & financial management

New in Phase 7, all in `src/modules/admin/` plus small additions to
`RidesService` and `WalletService`:

- **`admin/rides`**: list/search/filter (by status, operating area, or
  passenger/driver phone), a dedicated `live` view (requested + actively
  in-flight rides), full detail (passenger, driver, vehicle, payment +
  its transaction ledger, full status history), and admin/support
  cancellation. Cancellation goes through `RidesService.cancelBySystem`,
  which reuses the exact same state-machine check as passenger/driver
  cancellation — the one difference being it's the only actor allowed to
  cancel a trip that's already `IN_PROGRESS` (an admin/support
  intervention case the state machine already permitted since Phase 4).
- **`admin/payments`**: list/filter/detail, and a `refund` action that is
  explicitly documented as **bookkeeping only** — it marks the payment
  `REFUNDED` and logs a `Transaction` note, but does not call Paystack's
  Refund API or move any money. This is the same honest boundary as the
  payout stub from Phase 6: a real gateway refund integration is a
  separate, flagged piece of future work, not something silently faked
  here.
- **`admin/withdrawals`**: list all withdrawal requests, and
  `complete`/`fail`/`reject` actions — the interim manual-processing
  workflow standing in for the still-unimplemented `PaystackPayoutProvider`
  from Phase 6. `WalletService.resolveWithdrawal` handles this: marking
  `COMPLETED` assumes the admin transferred the money out-of-band and just
  records that; marking `FAILED` or `REJECTED` atomically **reverses the
  original debit** back into the driver's wallet (same transaction-wrapped
  balance-increment pattern used everywhere else money touches the
  wallet), so a failed payout never leaves a driver permanently short.
- **`GET /admin/drivers/:id/wallet`**: admin visibility into a specific
  driver's balance and transaction history, added to the existing
  `AdminDriversController`.
- **Tests**: `WalletService.resolveWithdrawal`'s three outcomes
  (already-resolved rejection, COMPLETED leaves the balance untouched,
  FAILED/REJECTED both reverse the debit correctly), and
  `RidesService.cancelBySystem`'s state-machine compliance (allowed
  mid-trip, rejected once already terminal).

---

## 5h. Phase 8 — Notifications

New in Phase 8, in `src/modules/notifications/`:

- **`NotificationProvider` abstraction with a real FCM adapter.** Like
  Paystack, FCM is explicitly named in the spec, so `FcmNotificationProvider`
  uses the official `firebase-admin` SDK rather than hand-rolling the
  OAuth2/JWT exchange Google's raw REST API would otherwise require. If
  `FCM_PROJECT_ID`/`FCM_CLIENT_EMAIL`/`FCM_PRIVATE_KEY` aren't set, it logs
  and skips sending rather than failing — the in-app inbox still works
  either way. **Not exercised against a live Firebase project** in this
  sandbox; verify with real credentials before production use.
- **In-app inbox is the durable source of truth; push is a delivery
  nicety on top.** `NotificationsService.notify()` always creates the
  `Notification` row first — a push failure never throws or loses the
  notification. A device the provider reports as dead
  (`messaging/registration-token-not-registered` etc.) is automatically
  deactivated so we stop wasting sends on it.
- **Fully event-driven, zero new coupling in the domain layer** — the
  same pattern as the Phase 5 realtime gateway. `RidesService` already
  emitted `ride.status_changed` at its single choke point; `PaymentsService`
  now emits `payment.paid` from the equivalent choke point
  (`creditDriverForRide`, called from both the webhook-success and
  cash-confirmation paths). `RideNotificationsListener` and
  `PaymentNotificationsListener` are the only things that know push
  notifications exist.
- **Closes the dispatch-broadcast gap flagged since Phase 5**: on a
  `REQUESTED` ride, the listener calls a new
  `RidesService.findEligibleDriverUserIdsForDispatch()` and pushes a "new
  ride nearby" nudge to each. This is explicitly a **best-effort**
  companion to, not a replacement for, the reliable REST polling from
  Phase 4 (`GET /drivers/rides/available`) — it's also deliberately
  lighter-weight than the full `assertCanAcceptRides` eligibility check
  (skips the per-document-expiry query) since it only decides who gets
  pinged; the authoritative check still happens in `acceptRide`.
- **Content mapping is a pure function** (`notification-content.util.ts`)
  — no I/O, fully unit-tested per (audience, ride-status) pair and for
  payment receipts, independent of whether a push actually gets sent.
- **Tests**: content mapping, `NotificationsService` (token
  reassignment/ownership, SENT-vs-FAILED status logic, stale-token
  deactivation, idempotent mark-as-read), and
  `RideNotificationsListener`'s routing (dispatch broadcast vs. per-party
  status notification, and graceful handling if the dispatch query
  itself throws).

---

## 5i. Phase 9 — Ratings & complaints

New in Phase 9, in `src/modules/ratings/`, `src/modules/complaints/`, and
`src/modules/admin/admin-complaints.*`:

- **One rating per (ride, rater), race-safe by construction.** The real
  enforcement is a DB unique constraint on `Rating(rideId, raterUserId)`
  — `RatingsService` catches the resulting Prisma `P2002` error and turns
  it into a clean `BadRequestException`, rather than relying solely on an
  application-level check-then-write (which would have the same
  time-of-check/time-of-use race the rest of this codebase has been
  careful to avoid, e.g. the Phase 4 ride-accept and Phase 6 withdrawal
  guards).
- **Passenger rates the driver, driver rates the passenger** — the
  "other party" is derived from the ride record, never accepted from the
  client, and only after the ride is `COMPLETED`.
- **Rating aggregates are atomic and drift-proof.** `DriverProfile`/
  `PassengerProfile` each carry `ratingsSum`/`ratingsCount` (not a stored
  running average) — every new rating is an atomic
  `{ increment: score }` / `{ increment: 1 }` pair, so concurrent
  ratings can never race into an inconsistent state, and the average
  (`sum / count`, computed on read) can never drift out of sync with its
  inputs the way a repeatedly-recomputed running average could.
- **Complaints**: `POST /complaints` (optionally tied to a ride — if so,
  the raiser must have been a party to it, and `againstUserId` defaults
  to the other party but is left unset rather than guessed when there
  isn't a clear counterpart, e.g. no driver was ever assigned).
  `admin/complaints` follows the same RBAC + audit-log pattern as the
  rest of the admin module: `OPEN → IN_REVIEW → RESOLVED/DISMISSED`,
  with resolving-an-already-resolved-complaint rejected.
- **Tests**: rating eligibility (completed-ride-only, party-only,
  correct-direction), the P2002-to-clean-error mapping (and that an
  unrelated DB error is *not* swallowed the same way), atomic aggregate
  updates targeting the correct profile, and every complaint state
  transition guard.

---

## 5j. Phase 10 — Multi-service expansion (fixed pricing refinement, Nexa Deliver, routing)

New in Phase 10. This phase built on top of a lot of existing
infrastructure rather than duplicating it — worth calling out explicitly
so it's clear what's genuinely new vs. reused:

**Shared/refactored first:**
- The OTP-delivery abstraction was relocated from the auth module into a
  new `src/modules/sms/` module (`SmsProvider`/`SMS_PROVIDER`) and
  generalized from `send(phone, code)` to `send(phone, message)` — both
  OTP codes and delivery recipient PINs need "send this phone a text",
  and there's now one abstraction for that instead of two near-identical
  ones. `AuthModule` and `DeliveriesModule` both depend on it.
- `WalletService.creditForRide` became `creditForJob`, and
  `WalletTransaction.rideId` became the generic `referenceId` — deliveries
  needed the exact same atomic crediting logic rides already had, and
  duplicating it under a ride-specific name would have been worse than a
  small, honest rename.

**1. Fixed pricing engine refinement** (`src/modules/rides/`): the fare
engine and fixed-price snapshot already existed since Phase 3/4. What's
new is the explicit exception path the spec calls for — *"prevent
mid-trip price changes unless the destination is explicitly updated"*.
`PATCH /rides/:id/destination` is now the **only** way a locked-in fare
can change: it recalculates through the same `FareService`, and every
change is versioned into a new `RideFareRevision` table (never
overwritten) — same "keep history, don't silently mutate" pattern as
`FareConfiguration` versioning from Phase 3.

**2. Multi-vehicle category selection**: `VehicleCategory` already
supported arbitrary categories (economy, comfort, etc.) since Phase 3 —
tricycle/keke, okada, delivery bikes and vans are just more rows, no
schema change needed for that part. What *is* new: a
`VehicleCategoryType` (`PASSENGER` | `DELIVERY`) classification, enforced
at request-creation time so a Ride can't be booked against a delivery-only
category and vice versa.

**3. "Nexa Deliver"** (`src/modules/deliveries/`) — a genuinely new,
parallel system to Rides rather than a bolt-on, because a delivery has no
passenger and has package/recipient concerns a ride never does:
- `Delivery` + `Parcel` (1:1) + `DeliveryStatusHistory`, mirroring
  `Ride`'s versioned-snapshot fare pattern exactly (same fixed-price
  quote via `FareService`, same commission snapshot).
- Lifecycle exactly as specified: `REQUESTED → PACKAGE_PICKUP_PENDING →
  PACKAGE_PICKED_UP → IN_TRANSIT → DELIVERED`, validated by a dedicated
  state machine (`delivery-status.state-machine.ts`), plus cancellation
  states mirroring the ride pattern.
- **PIN verification**: a 4-digit code is generated, sent to the
  recipient's phone via the shared `SmsProvider` (the recipient may not
  even have a NEXA account), and stored **only as an HMAC hash** — same
  treatment as OTP codes, never plaintext. The courier's `POST
  .../complete` call is rejected with a constant-time comparison failure
  on a wrong PIN; only a correct PIN transitions the delivery to
  `DELIVERED` and credits the driver's wallet.
- Matching/dispatch (`listAvailableForDriver`,
  `findEligibleDriverUserIdsForDispatch`) and atomic acceptance reuse the
  exact same haversine/bounding-box/compare-and-swap techniques as
  `RidesService` — deliberately not reinvented.
- **Flagged scope boundary**: deliveries are settled the same simple way
  rides' cash flow works (credited directly at completion) — there is no
  formal `Payment`/webhook flow for deliveries yet. Wiring deliveries into
  the Phase 6 payment system (generalizing `Payment.rideId` to also
  accept a delivery id) is real future work, not something quietly
  faked here.

**4. Route & map integration** (`src/modules/route/`): a `RouteProvider`
abstraction with a genuine Mapbox Directions API integration
(`MapboxRouteProvider`) — Mapbox is one of the two vendors the spec names
explicitly, so like Paystack/FCM this is real, documented-API code, not a
stub (**not exercised against a live Mapbox account** in this sandbox —
verify with a real `MAPBOX_ACCESS_TOKEN` first). A `MockRouteProvider`
(straight-line haversine estimate) is the dev default, and — like the
mock identity/OTP providers — env validation refuses to boot with it in
production, since straight-line distance would mis-price every fixed-price
quote.
- `POST /routes/preview` — call this before creating a ride/delivery to
  get real distance/duration for the fare quote, instead of guessing.
- `GET /rides/:id/route` — returns whichever leg is currently relevant
  (driver→pickup while en route, pickup→destination once under way),
  including a polyline path for the frontend map.
- `RealtimeGateway` (from Phase 5) was generalized rather than
  duplicated: `driver:location` now routes to whichever job (ride or
  delivery) the driver currently has active, and a new
  `delivery.status_changed` event bridge mirrors the existing
  `ride.status_changed` one — `delivery:subscribe`/`delivery:status`/
  `delivery:driver_location` all exist alongside the ride equivalents.

**Tests**: destination-update fare recalculation and revision recording;
delivery category validation, PIN hashing (never stores the raw PIN),
atomic accept race-safety, and PIN-verified completion (including the
correct commission-split credit and rejection of a wrong PIN); the full
delivery state-machine happy path and terminal-state guards; and the
gateway's delivery-room subscribe/location-routing/status-broadcast paths.

---

## 5k. Phase 11 — Deliveries wired into the payment system

Closes the scope boundary flagged at the end of Phase 10. Changes, in
`src/modules/payments/`, `src/modules/deliveries/`, and the `Payment`
schema:

- **`Payment` generalized**: `rideId` became nullable, a nullable
  `deliveryId` was added, both still individually `@unique`. Postgres
  treats multiple `NULL`s as distinct for a unique index, so many
  delivery-payments (`rideId = NULL`) and many ride-payments
  (`deliveryId = NULL`) coexist without conflicting, while "exactly one
  payment per ride" and "exactly one payment per delivery" both still
  hold. Exactly-one-of-the-two-set is enforced in application code.
- **`PaymentsService` rewritten around one normalized shape** (`PayableJob`)
  instead of duplicating the initiation/webhook/cash-confirmation logic
  for a second entity type. A small `getRequiredPayableJob(jobType, id)`
  maps either a `Ride` or a `Delivery` into the same shape
  (`payerUserId`, `driverUserId`, `finalFareKobo`, commission, completion
  check) — every safety property from Phase 6 (signature verification
  before anything else runs, idempotent replay handling, amount-mismatch
  rejection, cash-as-a-different-trust-model) now applies identically to
  both, because it's the same code path, not a parallel one that could
  drift out of sync.
- **`DeliveriesService.completeDelivery` no longer credits the wallet
  directly.** It marks the delivery `DELIVERED` and stops — exactly like
  `RidesService.completeRide` — leaving settlement to
  `POST /deliveries/:id/payment` (cash or card) and, for card, the
  Paystack webhook. This was the actual fix; PIN verification behavior is
  unchanged.
- **New endpoints**: `POST/GET /deliveries/:id/payment`,
  `POST /drivers/deliveries/:id/payment/confirm-cash` — mirroring the
  ride payment endpoints exactly. The Paystack webhook endpoint is
  unchanged (`POST /payments/webhook/paystack`) and now resolves either a
  ride or a delivery from the payment reference automatically.
- **Notification event generalized**: `payment.paid` now carries
  `{ jobType, jobId, ... }` instead of being ride-specific;
  `PaymentNotificationsListener` was updated accordingly (still the only
  place that knows push notifications exist).
- One small unrelated cleanup enabled by this: `DeliveriesModule` no
  longer needs `WalletModule` at all, now that it doesn't touch the
  wallet directly.
- **Tests**: the full `PaymentsService` spec was extended (not just
  patched) to cover delivery-specific initiation, webhook settlement, and
  cash confirmation alongside the existing ride cases — including that a
  delivery payment is linked by `deliveryId` and never accidentally by
  `rideId`.

---

## 6. Configuration & secrets

See `backend/.env.example` for the full list of environment variables. Key
points:

- The app **will not start** if required secrets are missing or too short
  (see `src/config/env.validation.ts`).
- The app **will not start in production** with `IDENTITY_PROVIDER=mock` or
  `OTP_PROVIDER=console` — these are hard-blocked to prevent an accidental
  production deployment without real providers configured.
- Nothing in this repository hardcodes API keys or credentials; everything
  flows through environment variables.

---

## 7. Compliance & scope notes

- No government database is scraped or accessed directly. NIN verification
  is architected exclusively through an authorized third-party provider,
  which has not yet been selected/contracted — that is a business decision
  outside this codebase's scope.
- Driver "background check" is represented only as an interface point in
  the state machine (`BACKGROUND_CHECK_PENDING`); no background-check claim
  or integration is implemented, per instruction.
- Before production launch, this architecture should be reviewed against
  applicable Nigerian data protection (NDPA) and transport regulations, and
  a real identity verification and storage provider contracted.

---

## 8. What's next (Phase 12 candidate scope)

Pending your approval, the two remaining genuine integration gaps are
real Paystack payout transfers (bank-account linking + Transfer
Recipients) and real Paystack refunds — both flagged, both unimplemented.
Beyond that, the backend now covers the full ride and delivery
lifecycle end-to-end for both cash and card, real-time tracking/routing,
admin tooling, notifications, and ratings/complaints — a reasonable point
to seriously consider starting the actual frontends (passenger/driver
Flutter apps or the admin Next.js dashboard) instead of further backend
phases. Let me know which you'd like, or flag anything in Phases 1–11
you want changed first.
