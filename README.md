# Counterparty Trust Workbench (Kenya)

Internal software for running **pre-transaction supplier checks** in Kenya: open a case, record what each official source shows, decide an outcome the evidence supports, have a second person review it, and release a fingerprinted report to the client. It also handles the riskiest moment in supplier payments: **a change of bank details**.

This is version 0.3.0, built for the internal pilot. It is used by your own team (analysts, reviewers, admins). Clients do not log in yet. The [production checklist](docs/PRODUCTION_READINESS.md) distinguishes repaired controls from work still required before live client use. The [production and automation roadmap](docs/PRODUCTION_AND_AUTOMATION_ROADMAP.md) sets out the next delivery stages.

## What it does

| Area | What happens |
| --- | --- |
| **Cases** | Intake of the decision, client, supplier, representatives, scope and fee. Status runs Draft → In progress → Waiting for review → Ready to release → Released. |
| **Seven checks** | Legal identity, **Tax compliance (KRA / eTIMS)**, digital identity, representative authority, operational existence, document consistency, transaction and beneficiary. Each comes with a "what to check" list drawn from the Kenyan source map. |
| **Evidence register** | Every source examined, including ones you couldn't access, with date, category, link and optional capture file. Positive findings need a current source with an actual expiry or justified recheck date and a recorded basis. |
| **Smart case assistant** | Explains missing checks, expired evidence, payment-date concerns and review steps. Produces a handover draft with evidence codes. Guidance uses recorded data and local rules; it does not make assessments or send messages. |
| **Automatic attention queue** | Surfaces open-case work, approaching source deadlines and payment dates. The dashboard and assistant refresh every minute while visible, pausing when a field has focus. |
| **Supplier matching** | Flags possible existing profiles by PIN, registration, name or domain during intake. A person confirms the exact entity and chooses whether to reuse it. |
| **Issues** | Discrepancy register using the pack's codes (ID-01, RP-01, TX-01, ...), with severity and "established vs candidate". |
| **Outcome engine** | Works out the strongest outcome the evidence allows. The analyst can choose that or something less favourable, never better. No scores, no fraud labels. |
| **Independent review** | A reviewer who did not produce the case ticks the QC checklist. Any edit after review cancels the approval. |
| **Released reports** | Frozen with a SHA-256 fingerprint. Released cases are locked; changes need a correction, which creates a new version. |
| **Bank-detail changes** | Account numbers encrypted. A change starts **frozen**, needs confirmation through an independent channel, then two approvals from people who did not log it. Nothing here moves money. |
| **Supplier profiles** | Shows the latest released snapshot, its outcome and actual source check dates. A new report does not refresh old evidence. |
| **Pilot economics** | Log time per case. The dashboard shows real hours, cost and margin by service depth, so the pilot shows whether the prices work. |
| **Security** | Password and MFA lockouts, expiring MFA setup, session revocation on factor changes, forced replacement of initial passwords, roles and audited workflow transactions. |

## The rules it enforces

These come straight from the operating manual in the Trust Pack:

- A finding with no cited evidence cannot be sent for review.
- A critical claim that isn't verified means **Insufficient evidence**, never a positive outcome.
- An established, unresolved material contradiction means **Material red flags**. A merely possible one stays insufficient evidence.
- "Accepted with limitation" can't hide a critical issue.
- The beneficiary layer can't be marked Verified unless bank details on the case are confirmed.
- The analyst can't review or release their own case, and nor can anyone else who edited it.
- A "Verified" finding must cite at least one source that was actually examined; a source marked access required, failed or not supplied can't support it.
- Verified and partially verified findings must retain at least one cited source that is current under a recorded validity policy. Review and release evaluate the date again, including when evidence lapses after approval. Changing validity cancels an earlier review.
- "Material red flags" can only be chosen when an established contradiction or a conflicting critical finding supports it.
- Any change that affects a case after review cancels the review: bank details logged, confirmed, rejected, revoked or superseded, or shared supplier details edited from another case.
- Release re-checks every content rule, not just the review.
- A changed bank instruction can't be confirmed using contact details from the request itself, and the person who logged it can't approve it.

## Windows desktop app (easiest)

Run **Counterparty-Trust-Setup.exe**, then open **Counterparty Trust** from the Start menu or desktop. No server, database or setup:
the first screen asks you to create the admin account. Data stays on that computer (File → Back up data… to save a copy).
Details in [desktop/README.md](desktop/README.md).

Use the desktop app for a pilot on one computer. When several people on different computers need it, run the server version below.

## Try it on your computer (developer setup)

You need [Node.js 22+](https://nodejs.org) and [PostgreSQL 16](https://www.postgresql.org/download/) (or Docker).

```bash
npm install
cp .env.example .env          # then fill in SESSION_SECRET and DATA_ENCRYPTION_KEY (see comments in the file)
npm run db:migrate            # creates the tables
npm run demo:users            # three demo accounts (admin, analyst, reviewer)
npm run dev                   # open http://localhost:3000
```

Sign in as `analyst@example.test` / `analyst-password-123`. You'll be asked to scan a QR code with an authenticator app first.

## Put it online

**Option A: one server with Docker** (e.g. a small VPS)

```bash
cp .env.example .env    # fill in the secrets, and set POSTGRES_PASSWORD
docker compose up -d --build
docker compose exec app npm run user:create -- --email you@yourcompany.co.ke --name "Your Name" --role ADMIN
```

Put it behind HTTPS (e.g. Caddy or a cloud load balancer). Back up the `db-data` and `uploads` volumes.

**Option B: a managed platform** (Render, Railway, Fly.io): deploy the Dockerfile, attach a managed PostgreSQL database, set the environment variables from `.env.example`, and attach a persistent disk at `/data/uploads`.

> Keep `DATA_ENCRYPTION_KEY` safe and backed up. Without it, stored bank account numbers and two-factor secrets cannot be read.

## For developers

- **Stack:** Next.js 16 (App Router, server actions), TypeScript, PostgreSQL, Drizzle ORM, Tailwind CSS 4.
- **Business rules** are pure functions with unit tests: `src/lib/outcome.ts`, `src/lib/workflow.ts`, `src/lib/payments.ts`, `src/lib/files.ts`, `src/lib/crypto.ts`.
- **Checks guidance** lives in `src/lib/layers.ts`; edit it as the SOP evolves.
- **Database schema:** `src/db/schema.ts`. After changing it, run `npm run db:generate` and commit the new file in `drizzle/`.
- **Tests:** `npm test` (rules, accounts, automation and concurrent transactions; a fresh local database unless running in CI), `npm run test:desktop` (shutdown, encrypted backup, legacy migration, restore and administrator recovery). Browser walkthrough: `npm run test:e2e`, `node e2e/controls.mjs`, `node e2e/security.mjs`, then `node e2e/automation.mjs` with the app running and demo users.
- **Workflow transactions:** Every mutation runs through `runWorkflow()`. A database row lock serialises writes across processes, including permission checks, review invalidation and audits. Successful redirects commit; validation failures roll back. Authentication failures retain their attempt counters. This deliberately prioritises correctness for a single-organisation pilot over high write throughput.
- **Desktop releases:** Bump root and desktop versions, add `docs/releases/v<version>.md` and push to main. Successful main CI starts the tested Windows build and publishes the installer, blockmap and update manifest. See [desktop/README.md](desktop/README.md).
- **Lost sole-admin authenticator:** An operator with server/data-folder access can use `npm run user:recover -- --email admin@example.com`. See [recovery instructions](docs/RECOVERY.md). This is an audited offline procedure.

## Using the smart workflow

Open **Smart assistant** on a case for its next actions and evidence-linked handover draft. The dashboard attention queue links directly to work needing attention. It warns three days before a recorded payment date and seven days before a recorded source deadline; these reminder windows do not set source validity.

In **Evidence**, record the expiry specified by the source or a justified recheck date for the transaction, plus the basis for that date. Expiry includes the recorded day; a recheck becomes due at the start of its day, using Nairobi dates. The app supplies no default validity period. A date does not establish authenticity or prove that a source supports the finding; those remain reviewed assessments.

Existing evidence is migrated without inventing policy dates. Before an open case can retain a positive finding through review/release, set the policy for at least one examined source supporting that finding. Released reports remain frozen. Back up before upgrading.

## Known limits of v0.3.0

- Uploaded files are type-checked but **not virus-scanned**. Add a scanner (e.g. ClamAV) before accepting files from clients directly.
- Files are stored on local disk. For more than one server, switch `src/lib/storage.ts` to S3-compatible storage.
- No client portal yet: the team enters intake and sends reports by hand (print or save as PDF).
- No live data connections yet (BRS, KRA, data vendors like Smile ID or Prembly). Checks are recorded manually, which is deliberate until source rights and costs are confirmed.
- No connected AI model, OCR, automated source retrieval, background job runner or notification delivery yet. The assistant provides explainable local guidance and drafts. See the roadmap for adding document assistance and integrations with human acceptance.
- The Windows installer is not code-signed yet. Signed distribution and update verification remain production work.
- Desktop backups are password-encrypted; the live database, uploads and local key file still require protection of the computer and storage volume. Scheduled server backups and recovery objectives must be configured for the actual deployment.
- Single organisation. Multi-tenant separation is needed before offering it to other firms.
- Legal readiness (PSRA, ODPC registration, lawful basis, retention periods) is outside the software and must be settled with Kenyan counsel before live cases.
