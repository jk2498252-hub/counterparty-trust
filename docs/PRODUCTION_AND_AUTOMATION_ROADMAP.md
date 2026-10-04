# Production and automation delivery plan

The first deployment is an internal workbench for one organisation's analysts, reviewers and administrators. Clients receive reviewed reports. This fits the present access model; external logins and multiple organisations require a separate access-isolation project.

## Delivered in v0.3.0

| Capability | Result | Boundary |
| --- | --- | --- |
| Smart case guidance | Explains missing checks, unsupported outcomes, bank-confirmation steps and source expiry. | Local rules; staff assess evidence and make decisions. |
| Attention queue | Highlights open cases, imminent source deadlines and payment dates. | Refreshes while the view is open; no background messages. |
| Supplier matching | Shows candidates based on recorded PIN, registration, name or domain. | Human confirmation; no automatic merge or risk allegation. |
| Handover drafting | Assembles recorded findings, sources, issues and next actions with evidence codes. | Internal draft requiring review; no external delivery. |
| Source validity | Requires current examined support for positive findings at submission, review and release; policy edits invalidate review. | Staff enter an actual expiry or justified recheck date and basis. Approved policy catalogue still needed. |
| GitHub releases | Passing main CI triggers packaged Windows checks and a versioned release with updater assets. | Current distribution is unsigned. Installed v0.2.x and later can receive updates. |

## Stage 1 — security and deployment acceptance

Complete these gates before using the service for live client cases. Engineering can prepare implementation while the service owner confirms operating choices.

| Work | Acceptance evidence | Accountable role |
| --- | --- | --- |
| Quarantine and malware scanning | Unscanned/rejected files cannot be downloaded or support findings; unavailable scanners fail closed. Test clean, infected, timeout, oversized and bypass attempts. | Engineering and security reviewer |
| Access, privacy and retention | Approved staff/case grants, source-use records, retention and holds; audited deletion/export and breach process. Test denied access directly, not only through hidden UI. | Service owner, qualified privacy/legal advisers and engineering |
| Source and service policy | Approved source-expiry/reuse catalogue and service-depth deliverables; narrowing critical scope requires recorded client approval. Test policy changes and transaction changes invalidate affected decisions. | Operations/service owner and engineering |
| Chosen hosting environment | HTTPS, protected persistent storage, restricted database privileges, monitoring, alerts and tested rate limits. Separate staging and production secrets/configuration. | Deployment operator |
| Backup and restore | Scheduled encrypted database, file and key backups; a restore drill on separate infrastructure. Record acceptable data loss and recovery time, retention and responsible operator. | Deployment operator and service owner |
| Trusted releases | Windows signing identity, protected release authority and signed-install/update checks. Verify the actual delivered installer and recover safely from failed updates. | Release owner |
| Independent review and pilot acceptance | Security assessment; realistic staff workflow tests, failure-path tests and a small controlled pilot. Record defects, named acceptance owners and release criteria. | Security reviewer, pilot lead and service owner |

The repository can be handed to a delivery company now as a development/pilot project. Production acceptance requires the evidence above; a successful build or installer alone is insufficient.

## Stage 2 — document assistance with accountable decisions

Select the document types and tasks that save analysts measurable time. Start with assisted extraction of names, registration numbers, PINs, expiry dates and bank-instruction fields from scanned or uploaded records.

1. Process only approved, scanned captures; agree provider, data location, permitted retention, cost limits and credentials for any external OCR/model service.
2. Keep extraction and draft results separate from accepted records. Each suggested field or claim needs its source capture and page/locator; unsupported claims remain unanswered.
3. Treat source content as untrusted data. It cannot instruct the app to change permissions, contact people, retrieve unrelated records or approve a case/payment.
4. Require staff to accept or correct proposed fields and conclusions; acceptance changes the case version and invalidates prior review. Audit the input capture, model/version, proposed value and accepted value without exposing secrets.
5. Evaluate against a reviewed test set of poor scans, contradictory documents, false identifiers and instruction-like text. Measure extraction errors and unsupported claims before enabling use.

AI may assist reading and drafting. The deterministic evidence, independence, bank-confirmation and release controls remain enforced on the server.

## Stage 3 — reliable background automation and integrations

| Workflow | Required design | Completion check |
| --- | --- | --- |
| Source recheck jobs | Approved source access/rights, API credentials, explicit expiry/reuse rules and capture provenance. Authentication or retrieval failure records a gap. | A job never reports verification without the supporting source and staff acceptance. |
| Deadline reminders | A durable job queue with explicit ownership, retries, idempotency, cancellation and audited delivery status. In-app notifications first; external delivery only to configured, authorised recipients. | Failed/repeated jobs produce one actionable reminder and can be recovered by an operator. |
| Change detection | Compare newly accepted source fields with prior records and explain the exact differences. Shared-profile changes invalidate affected reviews. | Candidate changes never silently overwrite a released snapshot or become established allegations. |
| Report assistance | Evidence-linked drafts, independent review and existing frozen release snapshots. | No automated release, payment approval or unsupported positive outcome. |

Prioritise one permitted source integration and one reminder workflow during the pilot. Add integrations only after source rights, reliability, costs and acceptance responsibilities are clear.

## Company handover package

Use this repository, the [readiness ledger](PRODUCTION_READINESS.md), [recovery runbook](RECOVERY.md), release notes and passing CI as the technical starting point. The delivery company should also receive approved service/source policies, access requirements, deployment choice, architecture and secret ownership, backup/recovery objectives, acceptance scenarios and support responsibilities. Transfer credentials through the company's approved secret-management process.

The service owner should sign off the operating/legal model and acceptance criteria; the delivery company should provide deployment, security, restore and user-acceptance evidence. Record the remaining items and owners before assigning a production launch date.
