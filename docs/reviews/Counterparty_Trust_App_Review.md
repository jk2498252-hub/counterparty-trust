> Historical review of commit `e0f32ab`. Some findings were repaired later. See [current production status](../PRODUCTION_READINESS.md) for v0.2.1.

# Counterparty Trust app review

Reviewed 3 October 2026. Repository: [jk2498252-hub/counterparty-trust](https://github.com/jk2498252-hub/counterparty-trust). Branch: main. Commit: e0f32abce2abad5a064a33bc2169e246e9d25407. Main still pointed to this commit at the end of the review.

The existing app is a substantial internal verification workbench. Continue from this repository. The next software task is to close its review, evidence and release-control gaps before using it for live client decisions.

## What already exists

| Area | Implementation inspected |
| --- | --- |
| Case workflow | Intake, assignment, seven checks, discrepancies, outcomes, human QC, release and correction workflows |
| Evidence | Case-linked source records, findings linked to evidence, uploaded documents and file hashes |
| Reports | Client report preview and frozen JSON snapshots with SHA-256 fingerprints at release |
| Payment integrity | Encrypted account numbers, independently documented confirmation, distinct approvals, supersession and revocation |
| Internal operations | Supplier history, case time recording, provisional fees/cost configuration, team roles and audit events |
| Security | Password hashing, MFA enrollment/login, session invalidation, authenticated document downloads and upload checks |
| Deployment | Next.js server with PostgreSQL, plus an Electron Windows desktop build using PGlite |

The seven check tabs include tax compliance. Discrepancies are handled separately, across the checks. This is an internal team application; its README explicitly records manual source checks, no client portal and one organisation.

A public [v0.1.0 release](https://github.com/jk2498252-hub/counterparty-trust/releases/tag/v0.1.0) contains a Windows installer. Its build workflow succeeded. The installer was not executed during this review.

## Findings to resolve before live release

All five findings below follow from inspected code, with the relevant pure-function behaviour also exercised locally. The full server actions were not executed against a database in this review.

### 1. Bank changes do not invalidate the case review — high priority

After a case passes QC, a privileged user can revoke its confirmed bank instruction. The payment action updates the instruction and audit log but does not change the linked case version or status. Release checks status, version and review; it does not repeat the beneficiary confirmation check. Report construction reads current payment records.

Consequently, a case can still qualify for release with a VERIFIED_WITHIN_SCOPE outcome and a REVOKED payment in its report. The submission-time beneficiary guard does not protect this later path.

Code: [revocation action](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/app/actions/payments.ts#L153-L164), [release action](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/app/actions/cases.ts#L594-L615), [release gate](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/lib/workflow.ts#L131-L151).

Required change: make report-relevant payment changes invalidate affected pending reviews, and repeat the current beneficiary and evidence checks during release. Preserve previously released snapshots and record subsequent revocations separately.

Acceptance check: revoke or supersede a bank confirmation after QC; releasing the case must require reassessment and fresh review.

### 2. Shared supplier changes can bypass another case's review — high priority

Intake edits update the shared counterparty record, then call touchCase only for the case being edited. Other cases for that supplier read the changed shared identity through loadCase. A previously approved case can therefore acquire a different legal name or registration number without a new case version or review.

The local probe confirmed that changing supplier identity changes the report data and fingerprint while the old review still satisfies the release gate. Previously released report snapshots remain frozen; the gap concerns approved cases that have not yet been released.

Code: [intake edit](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/app/actions/cases.ts#L178-L202), [case loading](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/lib/cases.ts#L41-L49), [report supplier identity](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/lib/report.ts#L112-L120).

Required change: pin the reviewed supplier identity to the case, or invalidate all affected pending reviews when shared report data changes. Bind QC to the exact report-relevant content.

Acceptance check: approve case A, change that supplier through case B, then attempt to release A. The approved content must remain pinned or require a new review.

### 3. Independent review checks assignment, rather than contributors — high priority

Finding edits are available to any authenticated role. Review eligibility only compares the reviewer ID with the current assigned analyst ID. A reviewer can contribute findings to a case, then pass QC on that same version after the assigned analyst submits it. Reassignment also changes the identity used by the independence check.

The database records a finding's latest editor, but the review gate does not inspect that field or the broader contribution history.

Code: [finding edit permissions](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/app/actions/cases.ts#L321-L358), [assignment action](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/app/actions/cases.ts#L240-L251), [review gate](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/lib/workflow.ts#L117-L129).

Required change: define and enforce independence against people who produced material content for the reviewed version. Validate analyst assignment against active, permitted team members. Use content permissions and contribution history together.

Acceptance check: a reviewer who changed a material finding cannot pass QC on that version; assigning another analyst cannot remove the restriction.

### 4. Citing a missing source can satisfy the evidence gate — high priority

Submission checks that each finding cites at least one evidence ID. It does not check the cited record's access result or provenance. The server action supplies only an evidence count to this gate.

A VERIFIED finding can therefore cite only an ACCESS_REQUIRED record, and still satisfy submission checks. An EXAMINED source can also be saved without a URL, locator or capture. The reviewer checklist offers a human safeguard, but the software permits these unsupported states.

Code: [submission gate](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/lib/workflow.ts#L93-L114), [inputs passed to that gate](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/app/actions/cases.ts#L277-L299), [evidence creation](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/app/actions/cases.ts#L438-L468).

Required change: validate whether examined evidence supports a VERIFIED claim and carries sufficient provenance. Continue to allow missing-source records to document an honest gap; they should not establish verification.

Acceptance check: a critical VERIFIED claim supported only by failed, inaccessible or absent-source records cannot pass submission or release.

### 5. The outcome ranking permits unsupported material red flags — high priority

isOutcomeAllowed permits any outcome ranked below the engine's suggestion. This allows MATERIAL_RED_FLAGS even when every finding is VERIFIED and there are no discrepancies. The existing tests also intentionally permit it under an INSUFFICIENT_EVIDENCE suggestion.

A material-red-flag classification needs established evidence of the relevant contradiction. It is a different factual conclusion, so being less favourable does not establish it.

Code: [outcome selection rule](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/lib/outcome.ts#L118-L121), [outcome save action](https://github.com/jk2498252-hub/counterparty-trust/blob/e0f32abce2abad5a064a33bc2169e246e9d25407/src/app/actions/cases.ts#L539-L562).

Required change: validate each outcome against its own prerequisites. A conservative insufficient-evidence result can remain available where justified; a red-flag result needs an established unresolved material contradiction or equivalent evidence-backed finding.

Acceptance check: all verified findings with no issues cannot produce MATERIAL_RED_FLAGS. Established unresolved material contradictions must still produce that result.

## Verification and limits

The [CI run for the reviewed commit](https://github.com/jk2498252-hub/counterparty-trust/actions/runs/37143962626/job/111263976194) succeeded at dependency installation, type checking, unit tests, database migration, production build and a browser walkthrough. The [Windows packaging run](https://github.com/jk2498252-hub/counterparty-trust/actions/runs/37143988138) also succeeded.

I inspected 38 files, including the server actions, business rules, schema, report builder, authentication, file handling, tests, CI and desktop launcher. No AGENTS.md was present in the complete repository tree.

Local Node 24 probes executed the repository's pure functions. Five baseline assertions confirmed the ordinary positive path, critical-gap handling and stale-version rejection. Five additional scenarios exposed the gaps above. These probes corroborate rule behaviour and were combined with inspection of the actions that call the rules; they are not browser/database reproductions. The app's full dependency stack was not installed or rerun locally.

This review does not establish production deployment health, source access rights, real bank ownership, representative authority, customer demand or Kenyan legal readiness. It is a focused implementation review, not a complete security audit.

## Revised next action

Use the existing workbench as the software starting point. The earlier manual-first delivery recommendation can be carried out through this app after the control gaps are fixed; a new platform build is unnecessary.

First repair the five gaps and add server/database regression coverage for post-QC changes, contributor independence, missing evidence and outcome prerequisites. Make report mutations, version changes, review and release atomic so concurrent edits cannot leave an approval attached to different content.

Then run one authorised case through source checks, independent QC and release while recording actual costs and client understanding. Keep the operating pack as the standard against which app behaviour is tested.

The inspected implementation handles source checks manually. AI extraction, comparison suggestions and draft assembly remain later additions, with evidence links and human decisions retained.

No repository files, commits, releases or GitHub settings were changed by this review.
