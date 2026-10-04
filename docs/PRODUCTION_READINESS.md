# Production readiness — v0.2.1

This is an internal, single-organisation pilot release. It repairs software controls; it does not certify the service for public production or settle its legal and operating requirements.

The historical reviews in [reviews/](reviews/) inspected commit `e0f32abce2abad5a064a33bc2169e246e9d25407`. Main subsequently added the five initial control repairs in `3dbcc01b2666a9dd53e698d9b03f69b1d3446d9e`, then the v0.2.0 desktop updater in `dbf9054500d518e8040c21027e61ce025ffda256`. Those changes are preserved here. Use this page for current status.

## Repaired controls

| Finding | Current behaviour | Verification |
| --- | --- | --- |
| Initial five findings | Bank changes and shared supplier edits invalidate affected reviews; case contributors cannot review/release; verified findings need an examined source; material red flags require supporting contradiction. | Rule tests and `e2e/controls.mjs`. |
| PR-01: passwords in URLs | Admin chooses the initial/reset password in a password field. Redirects contain no password. Initial/reset accounts must change their password before case/file access. Password spaces are preserved and bcrypt truncation is rejected. | Account regression tests and `e2e/security.mjs`. |
| PR-02: public administrator claim | Anonymous production setup is disabled. A server operator provisions an admin or temporarily supplies a 32+ character setup token. Desktop first run is restricted to its loopback built-in database. Concurrent first-admin requests create one account. | Bootstrap token and concurrent-claim tests. |
| PR-03: MFA controls | Five failed MFA attempts cause a 15-minute account lockout. Setup signatures expire in five minutes and bind to the user's session version. Replacement requires the existing password and factor. Enrolment/replacement revokes older sessions/forms; pending MFA clears the prior session. Audited offline sole-admin recovery is available. | Account tests, browser security checks and recovery test. |
| PR-04: concurrent/partial writes | All action mutations use one transaction and a database row lock, including checks, version changes, decisions and audits. Validation errors roll back, staged uploads are removed on failure, successful redirects commit, and authentication failures retain counters. Session cookies are set only after commit. References use the greatest existing suffix rather than a row count. | Concurrent edits/approvals/review versus edit/duplicate release; injected audit failure and staged-file cleanup. CI repeats this against PostgreSQL. |
| PR-05: file checks — partly repaired | DOCX/XLSX must contain the correct Office archive parts, with entry/expansion limits; macros and embedded executables are rejected. Text is checked beyond the first 4 KB; upload size is checked before reading. | Invalid/renamed Office ZIP, macro, binary-text and ordinary-file tests. Malware scanning remains open below. |
| PR-06: integrity | Downloads recompute size/hash; mismatches return 409 and are audited. Released snapshots are verified before display. New report snapshots pin capture IDs/hashes, and submit/release verify referenced captures. The fingerprint is explicitly described as a stored-data fingerprint, separate from a printed PDF. | Tampered document and report tests; report/browser walkthrough. Historical snapshots are not rewritten to add missing captures. |
| PR-07: dates — partly repaired | Latest supplier report is selected by actual release time, with its frozen outcome. Source check dates are distinct from report issuance. There is no automatic green 30-day reassurance. Future source check dates are refused. | Source-date tests and report rendering. Automatic source expiry/reuse rules remain open. |
| PR-08: recovery — partly repaired | Desktop backups encrypt database, files and keys using AES-256-GCM and a separately chosen password derived with scrypt. Restore requires that password and writes to a new directory. Backup/update waits for a real successful database exit; timeout/failure cancels it. | Real legacy PGlite migration, encrypted restore, bank decryption, capture/MFA/key preservation, wrong-password/tamper rejection and audited admin recovery. Server backup scheduling remains open. |
| PR-10: defaults — partly repaired | Compose requires an explicit database password and binds the app to loopback for an HTTPS proxy. Node provisioning scripts load `.env`; root and desktop versions match. | Config/code review, typecheck and build. Deployment operations remain open. |
| PR-12: release checks | Successful main CI starts the Windows release pipeline. Version/tag agreement, account/transaction tests, recovery tests, packaged Windows first run and updater asset integrity are required. Published releases cannot be overwritten. | CI and desktop workflows; installer SHA-512 checked against `latest.yml`, with blockmap required. |

## Still required before live production

| Work | Required outcome |
| --- | --- |
| Upload quarantine and scanning (PR-05) | Scan untrusted files, fail closed on scanner errors, and prevent unapproved captures from supporting findings. Office structure checks and hashes are not malware detection. PDF/image signatures are still basic checks. |
| Privacy, retention and access (PR-09) | Approve the lawful-basis/source-rights process; record required notes; define retention, holds, deletion and breach handling; decide whether staff need case-specific access. Current authenticated staff access is organisation-wide. |
| Source validity and scope (PR-07/11) | Define per-source expiry/reuse rules, document validity and transaction changes. Specify DIGITAL/ENHANCED/EXTENDED deliverables and require traceable client approval for narrowing critical scope. The app currently uses a shared gate set and a scope note. |
| Deployment operations (PR-08/10) | Configure HTTPS, protected storage, monitoring, alerting, rate limits, database privileges, scheduled encrypted database/file/key backups, restore drills, recovery objectives and an operator runbook for the chosen host. Compose alone does not provide these. |
| Signed distribution (PR-12) | Configure trusted Windows code signing and update verification; protect GitHub release authority. Current installer/update distribution is unsigned. No certificate or signing secret is fabricated by this change. |
| Legal/service readiness | Complete the service's Kenyan legal and regulatory assessment, source permissions, contracts, confidentiality terms and release accountability. Use the operating review and qualified advice for the actual service. |
| External clients or other firms | Add client/case grants and tenant separation before providing external logins or sharing an installation across organisations. No client portal or multi-tenant model is provided. |

The global workflow lock is deliberately conservative for a small internal team. Measure throughput before broadening usage. Narrower locking requires regression coverage for shared supplier/payment changes as well as individual cases.

## Release and update rule

Application updates require a new version in both packages/lockfiles and release notes. Pushing a document or code commit without increasing the version does not change an installed app. The GitHub release must contain the installer, `.blockmap` and `latest.yml`. Versions 0.1.x need a manual current-version installation once; v0.2.0 and later can discover subsequent releases automatically.
