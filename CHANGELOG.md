# Development milestones

## 0.39.0 - Read PayPal button dropdowns and request exact calendar years

- Read Transaction type and Format BUTTONs from visible text rather than their empty value property. Select anchor/nested-label menu options in the linked dropdown and verify the resulting label; disabled or ambiguous options remain blocked.
- Request Jan 1 through Dec 31 for every completed year starting with the selected year, including 2019. Do not clip the requested start or generate January-to-January ranges. Current-year requests end today; provider date rejection remains explicit.
- Require an exact saved All transactions CSV range for annual completion. Older cross-year reports remain saved evidence without suppressing the exact annual request.
- Verify report settings before preserving downloads from a full report list. Resume can recover old unconfirmed clicks from a repeatedly refreshed full ready list, while protecting previously confirmed or still-pending reports.
- Synthetic tests reproduce the supplied empty-valued BUTTON controls, anchor menus, disabled options, 2019 dates, cross-year rejection and full-list recovery. Signed-in PayPal remains an integration check.

## 0.38.0 - Verify PayPal report submissions and recover absent requests

- Create is a click intent until the exact All transactions / CSV / date-range row appears. Confirm each annual request for up to 30 seconds; the ten-minute download wait starts only for visible report rows. Missing rows produce a specific unconfirmed message.
- Resume rechecks old request checkpoints over ten seconds of refreshed, complete report-list reads. Confirmed absent checkpoints recover automatically; full, loading or partially parsed lists retain their checkpoints.
- Request missing years before downloading existing CSVs while list capacity allows. Preserve ready older exports before creating into a full twelve-row list. A stuck old download no longer blocks every new annual request.
- Lock observed PayPal calendar TD date IDs through their nested anchors and dismiss the date popup before Create. Keep exact Jan 1 through Dec 31 validation for completed calendar years.
- Read report controls, read download status and copy diagnostics remain available during collection. Synthetic coverage includes click-without-row, delayed Submitted rows, stale migration, actual date-cell markup, full/partial lists and Stop. Signed-in PayPal remains an integration check.

## 0.37.0 - One-click report batches and completed-tab cleanup

- PayPal types From, locks the calendar day, then enters To and verifies the exact report range. Preparation and Create Report are separate so Stop can prevent submission.
- Save existing ready CSVs, submit all missing annual ranges once, and refresh every five seconds for up to ten minutes while collecting Submitted reports. Resume retains uncertain/submitted request checkpoints.
- Recover missing/interrupted native CSV download IDs, accept first-party PayPal CSV download metadata beyond the reports route, and expose safe download status diagnostics. Only observed or saved IDs are queried; no download-history enumeration or added site permission.
- Download helpers use temporary provider tabs, wait for them to load, and close completed tabs they created. Waiting, sign-in and failed runs remain recoverable. Existing user tabs stay open. Shared data folders and earlier exports are preserved.
- Synthetic tests cover the full batch, timeout/resume/Stop, date lock order, native CSV recovery, tab ownership and all four helper flows. Live signed-in provider behavior still needs an integration check.

## 0.36.0 - Commit provider date selections and recognize Gmail identity variants

- Amazon prioritizes its observed Order Date control and clicks the innermost Custom Range label, including handlers attached below the menu row.
- PayPal commits one controlled date field at a time with real focus/blur, reacquires rendered fields, and falls back to bounded calendar navigation when typing fails. Exact displayed range, type and format still gate Create Report. Resume accepts an already committed range.
- Gmail verifies the active account tooltip or its mailbox title, rejects conflicting evidence, and offers address-free mailbox identity diagnostics in Advanced.
- Added synthetic regressions for nested menu handlers, replaced input nodes, calendar-only fields, ambiguous days, failed navigation, existing ranges and mailbox evidence boundaries. Signed-in provider testing remains the final integration check; financial data stays local.

## 0.30.1 — Make new-transaction readiness explicit

- Show a prominent missing-export warning and the imported CSV's latest transaction date.
- Add direct fresh-CSV import and the existing Wave export shortcut in the Command center. Import prepares the backlog again while preserving rules, source evidence and queued choices.
- Show approved-rule ready counts and explicit queue/execute guidance. Preparation remains read-only; live-only rows remain excluded from execution until exported.
- Add synthetic coverage for a newer known merchant becoming eligible after CSV import without losing existing queued decisions.


## 0.30.0 — Prepare, confirm locally, execute queue

- Added a primary Command center with prepared source/rule/history suggestions, ranked searchable categories, explicit incoming treatments, original descriptions, item/recipient enrichment, group exclusions, deferral and local undo/edit.
- Local confirmation advances immediately with coalesced persistence and no Wave calls or repeated analysis. Prepared snapshots, queued decisions and execution checkpoints survive reloads per business.
- Reused verified sequential editors and transfer runners for one explicit queued execution, safe preflight continuation, uncertain-save locking/rechecks and one final backlog collection. Added snapshot-bound description changes and saved-description verification.
- Source-backed gross/net/fee candidates remain clearly explained exceptions when Wave needs an unsupported split allocation; Unknown historical statuses never imply reviewed records.
- Moved collectors, redundant runners, manual source tooling and diagnostics into Advanced. Added synthetic command-center integration, DOM description checks and queue/interruption tests. Financial reports and source files remain local.


This repository starts with the completed local prototype. The initial commits group the existing work by component; they are not a reconstruction of earlier edit history.

## 0.15.0 · Merchant recognition and backlog proposals
- Add explicit store-number aliases, Unicode normalization, and payment-memo boundaries.
- Recognize more non-purchase card and student-loan payment descriptions.
- Weight reliable 2023–2024 categories, keep uncategorized gaps separate from contradictions, and expose annual evidence.
- Preview/edit merchant upgrades with exact replacement identities and retained previous versions.
- Prioritize backlog proposals and show affected transactions, scope changes, and distinct review buckets.
- Generate private before/after coverage, backlog decisions, and period-limited draft plans.
- Add synthetic regression tests for aliases, evidence weighting, scope preservation, payments, refunds, and replacement approvals.

## 0.14.0 · Usage and Debug workspaces
- Group setup, transaction runners, merchant rules, and planning into Usage.
- Move diagnostics, copied reports, and manual transfer-menu tools into Debug tools with direct links.
- Standardize the blue theme, checkbox alignment, button rows, card spacing, and responsive scrolling tables.
- Preserve existing sessions, selections, approved rules, saved receipts, and editing safeguards.
- Add synthetic workspace navigation and narrow-screen checks.

## CSV organizer
- Local CSV parsing, merchant alias rules, review suggestions, and review CSV export.

## Chrome extension
- Wave accounting export analysis and exact transaction IDs.
- Merchant rules, historical suggestions, and transfer/refund candidates.
- Read-only live transaction checks and draft plans.
- Chart of Accounts collection with exact category names.
- Local session restoration, background Wave tabs, and automatic live checks.
- Dark blue theme and collapsible workflow sections.
- Private, business-specific export-page shortcuts.

## Repository setup
- Private exports, previews, and local settings excluded from Git.
- Synthetic test identifiers and an automated test suite.

This initial milestone preceded deliberate category Apply and review requests, added in 0.7.0. Automatic transfer matching remains unimplemented.

## 0.7.0

- Add deliberate Apply for one planned merchant transaction, fresh field checks, exact category selection, review requests, and saved-result verification.
- Persist attempt records and offer read-only rechecks to prevent uncertain saves being repeated.
- Highlight available chart collection and add diagnostic copy buttons.

## 0.7.1

- Check review availability after selecting the category and wait briefly for it to enable. If Review remains disabled, save and verify the category while reporting reviewed status separately.

## 0.7.2

- Navigate the Personal Expense or Withdrawal submenu for Equity category names. Search within the category popup and match exact account text while excluding menu icons and unrelated page controls.

## 0.7.3

- Click Wave’s inner category toggle instead of its outer selected-value wrapper. Handle submenu links and capture category search popup markup in failure diagnostics.

## 0.7.4

- Wait for Save redirects to settle, then reopen the exact saved transaction without an immediate reload cancelling the navigation. Recover closed test tabs for read-only rechecks and keep uncertain saves blocked from repeating.

## 0.7.5

- Add an explicit Reset attempt and re-plan action after manual restoration. Recheck original fields, preserve attempt history, and unlock a new deliberate Apply without changing Wave.

## 0.7.6

- Recognize Wave’s Reviewed confirmation button in the edit dialog, excluding checkmark icon text. Verify saved review state, preserve already-reviewed records, and reject contradictory confirmation indicators.

## 0.8.0

- Add local rule-pack previews with evidence, explicit accept/reject decisions, exact CSV/business binding, and saved-session restoration.
- Support account/category scopes and exclusions, strict descriptor boundaries, and conflicting-rule review.
- Add a generic full-history analyzer with private reports, audits, coverage, conditional plans, and tag suggestions.
- Preserve exported memos and keep all derived accounting data in the ignored local-analysis directory.
- Add synthetic matching, analysis, and browser integration checks. Wave editing permissions and the deliberate Apply workflow remain unchanged.

## 0.8.1

- Move accepted proposals out of the review list and provide a shortcut to Merchant rules → Current rules. Saved rules, decisions, and drafts retain their existing persistence.

## 0.8.2

- Start the saved bookkeeping queue on January 1, 2025; retain earlier completed periods as historical rule evidence only. Withhold cross-boundary transfers and exclude older selections and plans from the working period.

## 0.8.3

- Keep the viewport in place when accepting proposals, without opening or scrolling to a selected live transaction. Persist and display the imported rule-pack filename alongside the already-saved pack and decisions.

## 0.8.4

- Highlight open rule proposals in blue. Accepting removes the current proposal and opens the next pending proposal in the filtered list, keeping the page viewport in place and showing the next card at the top of the proposal panel.

## 0.9.0

- Make proposal merchant/category headings larger and distinct. Remove the extra judgment checkbox; Accept rule is explicit approval.
- Add a searchable, deduplicated transfer-review view, paired money-out/in details, ambiguity review, and read-only two-record live verification. Keep transfer creation and linking manual.

## 0.9.1

- Add per-pair transfer setup with background money-out opening, read-only matching-menu capture, Copy diagnostics, and a local JSON paste checker.
- Keep existing matching transactions separate from create-transfer options; require exact business/record context and unique counterpart labels, with ID/link checks where available.
- Add synthetic menu-reader and interface coverage. Automatic transfer linking and reviewed-state changes remain unimplemented pending actual Wave submenu diagnostics.

## 0.9.2

- Detect the transfer matching submenu from its visible section heading, without requiring one exact search placeholder or a single category search on the page.
- Retain bounded menu markup on incomplete captures, including the first-level transfer menu, so copied diagnostics remain useful for adapting selectors.
- Avoid double-counting nested option wrappers; withhold multiple visible menus. Add six synthetic DOM regression checks.

## 0.9.3

- Recognize Wave's menuitemradio options and wv-select__menu__option containers in the existing-match and create-transfer sections.
- Accept the observed Transfer to prefix on exact counterpart labels; retain checked and disabled menu metadata without treating menu selection as a saved transfer.
- Add a synthetic reproduction of Wave's radio-menu structure and disabled/prefix boundary tests. Transfer save/review automation remains unimplemented.

## 0.10.0

- Add deliberate Set transfer and request review for one unique in-period pair after reading its existing-match menu.
- Recheck all fields on both original records, select only the exact existing-match radio entry, and confirm the outgoing transfer category before requesting review and Save. Create-transfer options are never selected.
- Persist a lock before injection and retain it from the first transfer-selection click onward, including lost responses or unexpected selection results. Recheck saved transfer only reloads/reads both exact records.
- Verify both saved transfer categories and report each reviewed status independently. Preserve imported rules/session and keep receipts local. Add Copy transfer result for failures and partial verification.
- Validate synthetic duplicate, disabled, create-only, wrong-ID, changed-value, save-on-review, response-loss, reload/recheck, changed-amount, and incomplete-save paths.

## 0.10.1

- Keep closed-copy tab diagnostics instead of discarding them when multiple money-out tabs exist; prefer the one visible matching menu and ignore inaccessible/navigated copies. Multiple open matching menus remain blocked.
- Read a Wave dropdown's selected label while its transfer submenu adds focusable controls; retain ambiguity checks for multiple owners.
- Report the exact transfer preflight side/field and original/live values. Save failed preflight comparisons and snapshots locally for Copy transfer result, without creating a save lock.
- Add duplicate-tab, open-menu field-reader, and detailed-preflight regression tests.

## 0.10.2

- Accept the exact full selected transfer label, including the expected counterpart date and description, during confirmation before Review/Save. Wrong counterpart details remain blocked.
- Verify saved short or exact full transfer categories on both sides, retaining all identity, field, and reviewed-state checks.
- Add Reset unchanged transfer attempt: reload both original records, require every original field and explicit unreviewed evidence, archive the previous attempt, and require a fresh matching-menu read before retry. Changed, saved, reviewed, or unproven records stay locked.
- Store original snapshots for new transfer attempts; support older receipts only when their prior reloaded snapshots still prove the original fields. Add long-label, wrong-date, reset, and reset/retry integration coverage.
