# Counterparty Trust Workbench (Kenya)

Internal software for running **pre-transaction supplier checks** in Kenya: open a case, record what each official source shows, decide an outcome the evidence supports, have a second person review it, and release a fingerprinted report to the client. It also handles the riskiest moment in supplier payments: **a change of bank details**.

This is version 0.1, built for the pilot phase. It is used by your own team (analysts, reviewers, admins). Clients do not log in yet.

## What it does

| Area | What happens |
| --- | --- |
| **Cases** | Intake of the decision, client, supplier, representatives, scope and fee. Status runs Draft → In progress → Waiting for review → Ready to release → Released. |
| **Seven checks** | Legal identity, **Tax compliance (KRA / eTIMS)**, digital identity, representative authority, operational existence, document consistency, transaction and beneficiary. Each comes with a "what to check" list drawn from the Kenyan source map. |
| **Evidence register** | Every source examined, including ones you couldn't access, with date, category, link and optional capture file. Findings must cite evidence. |
| **Issues** | Discrepancy register using the pack's codes (ID-01, RP-01, TX-01, ...), with severity and "established vs candidate". |
| **Outcome engine** | Works out the strongest outcome the evidence allows. The analyst can choose that or something less favourable, never better. No scores, no fraud labels. |
| **Independent review** | A reviewer who did not produce the case ticks the QC checklist. Any edit after review cancels the approval. |
| **Released reports** | Frozen with a SHA-256 fingerprint. Released cases are locked; changes need a correction, which creates a new version. |
| **Bank-detail changes** | Account numbers encrypted. A change starts **frozen**, needs confirmation through an independent channel, then two approvals from people who did not log it. Nothing here moves money. |
| **Supplier profiles** | Verify once, reuse with care: each supplier shows past cases, outcomes, bank history and how fresh the last report is (30-day rule). |
| **Pilot economics** | Log time per case. The dashboard shows real hours, cost and margin by service depth, so the pilot shows whether the prices work. |
| **Security** | Two-factor login (authenticator app) for everyone, account lockout, roles, full audit trail, private document storage. |

## The rules it enforces

These come straight from the operating manual in the Trust Pack:

- A finding with no cited evidence cannot be sent for review.
- A critical claim that isn't verified means **Insufficient evidence**, never a positive outcome.
- An established, unresolved material contradiction means **Material red flags**. A merely possible one stays insufficient evidence.
- "Accepted with limitation" can't hide a critical issue.
- The beneficiary layer can't be marked Verified unless bank details on the case are confirmed.
- The analyst can't review or release their own case.
- A changed bank instruction can't be confirmed using contact details from the request itself, and the person who logged it can't approve it.

## Windows desktop app (easiest)

Run **Counterparty-Trust-Setup.exe**, then open **Counterparty Trust** from the Start menu or desktop. No server, database or setup:
the first screen asks you to create the admin account. Data stays on that computer (File → Back up data… to save a copy).
Details in [desktop/README.md](desktop/README.md).

Use the desktop app for a pilot on one computer. When several people on different computers need it, run the server version below.

## Try it on your computer (developer setup)

You need [Node.js 20+](https://nodejs.org) and [PostgreSQL 16](https://www.postgresql.org/download/) (or Docker).

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
- **Tests:** `npm test` (rules) and `npm run test:e2e` (a full case with three people in a real browser; needs the app running and demo users).
- **Every server action** calls `requireUser()` and validates its input; every case edit goes through `touchCase()`, which bumps the version and cancels any review.

## Known limits of v0.1 (next steps)

- Uploaded files are type-checked but **not virus-scanned**. Add a scanner (e.g. ClamAV) before accepting files from clients directly.
- Files are stored on local disk. For more than one server, switch `src/lib/storage.ts` to S3-compatible storage.
- No client portal yet: the team enters intake and sends reports by hand (print or save as PDF).
- No live data connections yet (BRS, KRA, data vendors like Smile ID or Prembly). Checks are recorded manually, which is deliberate until source rights and costs are confirmed.
- The Windows installer is not code-signed yet, so Windows shows a SmartScreen warning on first install.
- Single organisation. Multi-tenant separation is needed before offering it to other firms.
- Legal readiness (PSRA, ODPC registration, lawful basis, retention periods) is outside the software and must be settled with Kenyan counsel before live cases.
