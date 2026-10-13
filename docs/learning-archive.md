# Wave Solver 0.5 → 1.0 learning archive

This is a public technical retrospective and handoff. It preserves the project's source, tests, conclusions, and proposed 2.0 direction. It is not a raw conversation export and contains no bank statements, receipts, private repair plans, real business IDs, or transaction links.

## Where the experiment ended

- Archived application version: **0.99.31**, labeled **1.0 preview**.
- The user reported finishing the bookkeeping and bringing Wave up to date.
- The automated Venmo batch reached **103 of 105 verified actions**. The user finished the final repairs manually and reported a $0 wallet balance and reconciliation.
- Apple Card imports were also completed and overlapping duplicate rows removed manually.
- The application's failed collector badge did not reflect successful manual completion.
- No fresh financial-export audit was performed as part of this archive. User-reported completion is not being relabeled as app-verified completion.
- Archive validation: `node --test` passed **530/530 tests**, with no skips or failures. No signed-in Wave operations or new browser acceptance runs were performed for this archival commit.

The original repair batch is historical evidence. **Do not replay it.** Current work must begin with fresh collection and recognition of manual outcomes.

## What was useful

Provider collection, account-scoped evidence, statement parsing, exact transaction links, categorization review, and explicit prepared actions were useful foundations. Persistent checkpoints protected uncertain saved outcomes from automatic repeat writes. The full-width Wave styling was useful and should survive the redesign.

The strongest workflow was: investigate source data, prepare specific fixes, show the intended change, and have the extension carry out that plan.

## What failed

| Failure | Consequence | Requirement for 2.0 |
|---|---|---|
| Repeated complete-history scans during repairs | Slow restarts and timeouts | Separate baseline collection from targeted execution |
| Nested category menus and delayed rendering | Search text entered without selecting the intended category | Observe the owned popup, navigate More options, select and verify |
| Multiple Amount controls in split forms | Exact transaction forms rejected | Understand original totals and allocation controls separately |
| Save confirmation dialogs | A saved or pending outcome mistaken for a failed form close | Model confirmation and uncertain outcomes explicitly |
| Stale browser tab IDs | Collection stopped after manual progress | Recover tabs and represent manual completion |
| Transfer labels used without complete relationship proof | Wrong counterpart remained unresolved | Verify both records and the actual relationship |
| Icon-only deletion controls | Final approved deletion could not execute | Support exact control identification with meaningful diagnostics |
| Confusing selected/reviewed/verified counts | User could not understand remaining work | Separate action counts, transaction counts, and failure states |
| Repeated assurances based on fixtures | Expectations exceeded actual live evidence | Label fixture, browser, live, export, and statement validation separately |

The browser executor and the financial reasoning both need improvement. Moving interpretation to a chat does not automatically fix unreliable UI control.

## Historical regression scenarios

These are anonymized scenarios, not instructions to change current records.

1. **Bank-funded wallet purchase:** a purchase is represented as an expense in both the bank and wallet. Preserve the real purchase; represent bank funding as a correctly paired transfer.
2. **Incorrect existing transfer relationship:** the bank record already displays a wallet transfer category but is linked to unrelated incoming money. The successful manual repair removed the incorrect category/relationship, saved, reopened, created the correct transfer, and saved again. Preserve the unrelated receipt.
3. **Gross/net transfer fee:** a $300 wallet withdrawal produces a $295 bank deposit. Source evidence supports a $295 transfer and $5 fee, rather than an invented balancing amount.
4. **Repeated legitimate payments:** identical dates and amounts can represent separate purchases and bank movements. Matching must preserve multiplicity.
5. **Overlapping Apple CSV:** two already recorded meal purchases of $1.50 and $26.46 have transaction dates one day earlier than clearing dates; a $19.99 purchase is missing. A safe upload includes the missing purchase once and excludes only the already represented occurrences.
6. **Manual import after collector failure:** a closed or stale tab does not invalidate a successfully imported file. Collection, import, and verification are separate states.
7. **Manual completion after an incomplete batch:** inspect fresh evidence, recognize the result, and skip writes. Do not reset checkpoints or claim the app performed the manual action.

## Agreed 2.0 direction

- Extension: gather sources, read Wave, execute approved operations, capture evidence.
- Local processing: exact arithmetic, parsing, comparisons, provenance, coverage, validation, and checkpoints.
- ChatGPT/Codex: investigate unclear records, interpret supporting evidence, and prepare structured plans.
- User: confirm purpose, approve rules and actions, provide manual evidence.
- Wave: hold the accounting records.

First prove a manually triggered collection → plan → approval → execution → verification cycle. Scheduling is a later integration milestone, not a substitute for a working manual loop.

See [the complete master plan](2.0-master-plan.md) and [the build prompt](2.0-master-prompt.md).

## Decisions that remain open

Business use of a loan does not settle its liability/equity bookkeeping. Borrower, entity type, accounting method, existing interest entries, lender evidence, and approved adjustment policy must be established before automating annual entries. Zero-value year-end placeholders are pending work, not completed expenses.

The scheduler-to-collector bridge, file access method, actual browser availability, and current supported Wave workflows must be verified during implementation.

## Preservation boundary

Public: application source, synthetic fixtures, tests, documentation, anonymized learning scenarios, and the portable 2.0 specification.

Local: statements, accounting CSVs, receipt images, original logs, tax workbooks, generated transaction links, credentials, private settings, immutable repair plans, and execution checkpoints. They remain available in the workspace but are not included in this public GitHub snapshot.
