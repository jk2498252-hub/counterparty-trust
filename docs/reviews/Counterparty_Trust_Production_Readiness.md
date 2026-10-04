> Historical review of commit `e0f32ab`. Some findings were repaired later. See [current production status](../PRODUCTION_READINESS.md) for v0.2.1.

# Counterparty Trust production readiness review

Reviewed 3 October 2026 at main commit e0f32abce2abad5a064a33bc2169e246e9d25407. [Repository](https://github.com/jk2498252-hub/counterparty-trust).

The existing app is a useful internal pilot workbench. I would hold a public production launch until the credential, bootstrap, MFA, concurrency and previously identified review/evidence controls are repaired.

This extends the earlier app review's five findings: bank changes retaining QC approval; shared supplier edits changing another reviewed case; contributor independence; inaccessible evidence supporting verification; and unsupported material-red-flag selection. Those remain open.

## Additional priorities

| ID | Priority | Finding |
| --- | --- | --- |
| PR-01 | Launch blocker | Temporary passwords enter URLs |
| PR-02 | Launch blocker for a public server | First administrator is publicly claimable on an empty database |
| PR-03 | Launch blocker | MFA attempts, factor replacement and recovery need stronger controls |
| PR-04 | Launch blocker | Concurrent operations and partial writes can break workflow integrity |
| PR-05 | Before importing live vendor/client files | File validation and quarantine are insufficient |
| PR-06 | Before issuing client reports | Stored hashes are not checked when files and reports are read |
| PR-07 | Before issuing client reports | Freshness is measured from release time, rather than source validity |
| PR-08 | Before live client data | Backups and key recovery are not production-ready in the repository |
| PR-09 | Before live client data | Privacy, retention and case access are mostly manual |
| PR-10 | Before external production exposure | Deployment defaults and operational safeguards need hardening |
| PR-11 | Before selling defined service tiers | Service depth and scope changes are weakly controlled |
| PR-12 | Before calling a build production-ready | Release checks do not yet cover the important failure paths |

## PR-01 — Temporary passwords enter URLs

**Launch blocker.** Account creation and reset concatenate the temporary password into a flash message. The redirect helper puts that message in the ok query parameter. It is therefore present in the URL and browser history, and can enter URL logging. The UI's promise that it is shown once is not enforced by this mechanism.

Code: [account creation](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/app/actions/team.ts#L18-L29); [reset](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/app/actions/team.ts#L50-L64); [redirect helper](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/lib/nav.ts#L4-L8).

Fix: Use a private onboarding/reset flow with expiring single-use credentials. Keep secrets out of URLs and logs, require a password change where temporary passwords remain, and invalidate the token after use.

Acceptance check: Create and reset an account. No generated password appears in URLs, redirect headers or logs; replaying the onboarding token fails.

## PR-02 — First administrator is publicly claimable on an empty database

**Launch blocker for a public server.** The only bootstrap condition is that users is empty. No invitation, deployment token or administrator authentication is required. The documented Docker sequence starts the published app before creating the admin. The transaction counts users without locking or a singleton constraint, so it also does not prove that two concurrent first-admin requests cannot both succeed.

Code: [setup page](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/app/setup/page.tsx); [bootstrap action](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/app/actions/auth.ts#L99-L117); [deployment order](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/docker-compose.yml#L1-L4).

Fix: Provision the initial administrator before exposing the server, or require a short-lived deployment secret and a serialized bootstrap operation. Keep the desktop's loopback-only onboarding as a separately controlled mode.

Acceptance check: An unauthenticated request cannot claim an unprovisioned public deployment. Two simultaneous bootstrap submissions cannot create two first administrators.

## PR-03 — MFA attempts, factor replacement and recovery need stronger controls

**Launch blocker.** Bad MFA codes are audited but are not rate-limited or counted toward a lockout. A replacement factor can be enrolled from an existing session without proving the existing factor. The setup signature has no expiry or single-use record. Enabling/replacing MFA does not bump sessionVersion, so older sessions are not revoked; in particular, an earlier pre-enrollment session can still reach the setup exception. No recovery-code flow is implemented.

Code: [MFA actions](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/app/actions/auth.ts#L53-L83); [setup signing](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/lib/mfa.ts#L8-L26); [replacement page](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/app/%28app%29/security/page.tsx#L7-L11); [session checks](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/lib/session.ts#L81-L104).

Fix: Add per-account/challenge throttling, expiring one-time enrollment, fresh authentication for replacement, session invalidation after factor changes, and a controlled recovery path for the sole admin. Do not let a pre-MFA session replace an already enrolled factor.

Acceptance check: Repeated wrong OTP attempts are throttled. Expired/replayed enrollment fails. An old pre-enrollment session cannot replace MFA after enrollment. Losing the only admin's phone has a tested recovery procedure.

## PR-04 — Concurrent operations and partial writes can break workflow integrity

**Launch blocker.** Version changes read a number and later overwrite it. Approval counts are read before insert. Case references use count plus one. Release, report insertion and audit writing are separate operations. Controlled boundary probes reproduced two edits advancing the version only once, two approvals remaining frozen, duplicate calculated references, and a persisted bank confirmation after the action failed at audit insertion. Concurrent review/edit/release paths likewise lack a shared transaction and lock.

Code: [version update](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/lib/cases.ts#L110-L120); [case numbering](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/lib/cases.ts#L25-L31); [bank approvals](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/app/actions/payments.ts#L105-L140); [report release](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/app/actions/cases.ts#L594-L614).

Fix: Use database transactions with appropriate row locks or conditional version updates. Allocate references safely, bind approval to the exact confirmation revision, prevent duplicate report release, and persist business changes and audit events atomically. A transaction alone is insufficient if the relevant reads and checks still race.

Acceptance check: Run PostgreSQL regression tests for simultaneous edits, approvals, confirmation replacement, rejection versus approval, duplicate submission and release versus edit. Inject database failures; no unlogged or partly completed decision survives.

## PR-05 — File validation and quarantine are insufficient

**Before importing live vendor/client files.** Office files are accepted on a ZIP prefix alone. A four-byte prefix passed the unchanged DOCX check in a local probe despite containing no document. PDF/image checks are similarly brief signature checks. There is no malware scanner or quarantine status. Uploaded documents are stored as plain files with restrictive filesystem permissions; they are not encrypted by the bank-field encryption code.

Code: [file checks](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/lib/files.ts#L26-L54); [document storage](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/lib/storage.ts); [known limits](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/README.md#L84-L85).

Fix: Validate real file structure with limits on archive expansion and parser work; quarantine untrusted uploads until scanning completes. Prevent quarantined/rejected files from being cited as examined evidence. Protect the storage volume and handle failed uploads/orphan files.

Acceptance check: Invalid Office archives and scan failures remain quarantined. Ordinary valid documents still work. A failed file/database operation leaves no orphan evidence entry or exposed capture.

## PR-06 — Stored hashes are not checked when files and reports are read

**Before issuing client reports.** Upload and report hashes are recorded, but the download route does not compare stored bytes against documents.sha256, and the report page displays the saved hash without recomputing it from the snapshot. The report snapshot omits capture document IDs and capture hashes. The displayed report hash covers canonical JSON, not the browser-printed PDF.

Code: [download route](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/app/api/files/%5Bid%5D/route.ts#L9-L19); [released report read](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/app/%28app%29/cases/%5Bid%5D/report/page.tsx#L27-L35); [evidence snapshot](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/lib/report.ts#L150-L162).

Fix: Check integrity on read or through a verified immutable storage process, alert on mismatch, and pin capture IDs/hashes in the reviewed evidence manifest. Explain exactly what the fingerprint covers; add final-export verification if clients need to authenticate PDFs.

Acceptance check: Changing one byte in a stored capture or altering a report snapshot causes verification failure. Old report versions remain traceable to the exact examined captures.

## PR-07 — Freshness is measured from release time, rather than source validity

**Before issuing client reports.** The supplier freshness box uses releasedAt and a fixed 30-day rule. It selects the first released case from a list sorted by case creation time, which need not be the latest release. Its green appearance does not depend on the outcome or a reopened correction. The report header labels the release-day asOf value as evidence as of, although source checkedDate values can be much older.

Code: [supplier freshness](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/app/%28app%29/suppliers/%5Bid%5D/page.tsx#L19-L43); [report date](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/app/actions/cases.ts#L610-L613); [report header](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/components/report-view.tsx#L19-L24).

Fix: Separate report issuance from evidence examination dates. Base reuse on source dates, document expiry, exact entity, transaction scope and subsequent changes. Select the latest actual released snapshot and show its outcome and correction status explicitly.

Acceptance check: Releasing a report today containing stale checks does not renew their freshness. A reopened correction or material-red-flag report does not receive a misleading reassurance.

## PR-08 — Backups and key recovery are not production-ready in the repository

**Before live client data.** Desktop backup copies the entire data folder, including config.json with the decryption keys, without backup encryption. The exported copy alone can therefore supply both encrypted records and their key. The repository provides no scheduled server backup/restore procedure or restore test. Volumes provide persistence, not a verified backup. The desktop shutdown timeout resolves after sending a kill signal, rather than explicitly waiting for successful database closure in that branch.

Code: [key file](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/desktop/main.js#L34-L42); [backup operation](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/desktop/main.js#L140-L167); [database volume](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/docker-compose.yml#L13-L14); [document volume](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/docker-compose.yml#L32-L37).

Fix: Encrypt backups with protection independent of the copied application key, protect keys appropriately, schedule server backups of both database and captures, and test restoration on a clean machine. Verify backup consistency during timeouts/crashes and define acceptable data loss and recovery time.

Acceptance check: Restore cases, captures, MFA access and bank records from a backup on a clean environment. The backup is inaccessible without separate protection; recovery works when the original machine is unavailable.

## PR-09 — Privacy, retention and case access are mostly manual

**Before live client data.** Lawful-basis and source-rights notes can be empty. There is no implemented retention schedule, purge/hold process or case-level recipient/access grant model. Any fully authenticated staff member can download an attachment by its valid ID. A single trusted internal team can deliberately choose broad access, but roles alone do not provide case-restricted confidentiality.

Code: [lawful-basis note](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/db/schema.ts#L192); [rights note](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/db/schema.ts#L284); [document access](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/app/api/files/%5Bid%5D/route.ts#L9-L16); [submission inputs](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/lib/workflow.ts#L93-L114).

Fix: Document the approved processing/source-access policy and implement the required fields, restricted case access, authorised report recipients, retention/legal holds and auditable deletion. Resolve legal readiness independently of software readiness. Add tenant separation before exposing client accounts or serving other organisations in one instance.

Acceptance check: Access outside a staff member's authorised cases is denied where the access policy requires it. Retention/deletion and hold tests behave as the approved policy specifies.

## PR-10 — Deployment defaults and operational safeguards need hardening

**Before external production exposure.** Compose falls back to a change-me database password and publishes port 3000 on all host interfaces. HTTPS is described in the README but not supplied by this template. Critical settings are checked piecemeal, rather than at startup. Runtime uses the provisioning database account. No application readiness endpoint, structured incident alerts, dependency-security check, deployment rollback or backup monitoring is implemented in the repository.

Code: [database password fallback](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/docker-compose.yml#L9-L11); [application binding](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/docker-compose.yml#L28-L31); [startup migrations](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/Dockerfile#L24); [numeric environment configuration](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/lib/env.ts).

Fix: Require strong explicit production settings, expose the app only through the approved HTTPS path, separate migration and runtime database privileges, and validate configuration before accepting traffic. Add readiness checks, redacted error/incident alerts, dependency checks and a tested rollback path. Multi-server deployment also needs shared durable document storage.

Acceptance check: Bad production settings stop startup. Direct insecure access is blocked. Database/storage failures trigger alerts. A failed deployment can be rolled back without losing reports or evidence.

## PR-11 — Service depth and scope changes are weakly controlled

**Before selling defined service tiers.** DIGITAL, ENHANCED and EXTENDED share the same generated finding rows and generic gates. Depth changes affect the label and commercial fields, but do not enforce distinct evidence requirements. A default-critical layer can be made non-critical with a free-text note saying the client agreed; no agreement artifact or explicit scope approval is required.

Code: [case depth and fee](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/app/actions/cases.ts#L139-L150); [finding generation](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/lib/cases.ts#L34-L37); [scope narrowing](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/app/actions/cases.ts#L328-L351).

Fix: Define the exact obligations and evidence thresholds for each offer, version the scope, and require traceable client agreement for material narrowing. Keep depth-of-investigation choices explicit without making a cheaper service imply that a critical claim was established.

Acceptance check: An analyst cannot silently narrow a critical check or move a case between offers without the required scope record and review.

## PR-12 — Release checks do not yet cover the important failure paths

**Before calling a build production-ready.** CI runs useful type, unit, migration, build and sequential browser checks. The desktop workflow packages the installer but does not run the supplied desktop smoke test. No CI exercise covers the controlled concurrency failures, MFA abuse/replacement, backup restore, integrity tampering, retention or operational failure recovery. Root package version is 1.0.0 while desktop/release version is 0.1.0.

Code: [server CI](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/.github/workflows/ci.yml#L24-L41); [installer CI](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/.github/workflows/desktop.yml); [unit coverage](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/tests/rules.test.ts).

Fix: Turn the identified failures into regression tests using the real database/framework, include a packaged desktop smoke/upgrade/recovery test, and align release/build identifiers. Record the report-template, rule and operating-standard version used for each issued report.

Acceptance check: A production candidate must pass those regression checks and a clean-environment install/restore exercise. A green build alone does not establish deployment readiness.

## Evidence and limits

The complete tree contained 92 files. I retrieved 87 source, configuration, documentation, migration and test text files, excluding two dependency lockfiles, a generated migration snapshot and two image assets. Review concentrated on server actions, authentication, business rules, schema, reports, storage, deployment and tests, with targeted searches across the remaining files; it was not a line-by-line audit of every file. No AGENTS.md was present. Dependency versions were not audited for known vulnerabilities.

Six local probes executed unchanged repository functions with controlled database/framework boundaries. They corroborated URL serialization of temporary credentials, lost case-version increments, duplicate reference calculations, concurrent approval counts leaving an instruction frozen, non-atomic audit failure and acceptance of an invalid DOCX prefix. The database was an in-memory boundary model, so these are reproducible code-path demonstrations, not completed PostgreSQL/Next.js integration tests. Existing CI succeeded for the reviewed commit in the earlier review.

MFA, freshness, backup, retention, scope, integrity-on-read and deployment-template findings follow from code/configuration inspection. The live host, actual TLS termination, database grants, backup provider, firewall, security settings and any external operational controls were not inspected. Where repository controls are absent, an external implementation may exist and needs verification.

Primary guidance was checked against [PostgreSQL 16 transaction isolation](https://www.postgresql.org/docs/16/transaction-iso.html), [OWASP authentication controls](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#login-throttling) and [OWASP MFA factor replacement](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html#changing-mfa-factors). PostgreSQL's ordinary transaction isolation does not make a count-then-insert bootstrap a singleton. OWASP recommends throttling login attempts and fresh proof of an existing factor when changing MFA.

## Recommended repair order

1. Close credential leakage, public bootstrap and MFA lifecycle defects.
2. Repair the five earlier decision-control gaps and make case/payment/review/release updates atomic.
3. Add file quarantine and integrity checks; correct freshness and scope handling.
4. Prove access control, retention, encrypted backup/restore, HTTPS, operational alerts and rollback.
5. Run the regression suite against a production-like server or packaged desktop build, then one controlled end-to-end live case under the approved operating process.

A client portal, external tenant accounts and AI features should follow these controls. Production of the internal team workbench does not require building every future product feature.

No GitHub source, settings, commits or releases were changed during this assessment.
