# Development milestones

## 0.49.0 - Honor PayPal's exclusive seven-year calendar boundary

- The calendar disables the anniversary day: on October 8, 2026, new collection starts October 9, 2019 and ends December 31, 2019 for the oldest partial year. Mathematical cutoff and first selectable day are stored separately.
- Resume repairs an unsent/rejected October 8 checkpoint to October 9 before matching reports or creating requests. Other years' submitted requests and saved files remain intact; uncertain Create attempts are never rewritten.
- An older ready October 8 export remains history and cannot satisfy the corrected October 9 batch range. Resume can collect an already ready exact corrected range without opening date controls; otherwise it creates only the missing 2019 report.
- Label exact recovered reports Ready report found without claiming they were newly created. Regression tests cover the disabled-day migration, exclusion of the older report, exact matching, leap dates and year rollover.

## 0.48.0 - Visible helper states and oldest PayPal calendar boundary

- Share green Start/Complete, blue Running/Waiting, amber Resume/Paused/sign-in, and red Stop/error colors across PayPal, Amazon, Wave and Venmo helpers. Status cards and the activity bar retain explicit state labels; PayPal's yearly status cells use the same palette.
- A PayPal sign-in break pauses collection immediately and preserves submission/download checkpoints for Resume. The activity bar no longer reports Ready over a sign-in pause.
- For the oldest partial year only, inspect an explicitly disabled calendar day and commit the earliest visibly selectable date. If needed, probe up to seven successive boundary days with date preparation only. Create is clicked once after the exact dates have been verified; other years retain their original ranges.
- Persist the verified boundary and original requested date, update the displayed oldest-year range, and label its calendar adjustment. No guessed date or unconfirmed request is treated as coverage.
- Add regression coverage for adjusted boundary matching, non-boundary failures, sign-in pause/resume, and status precedence. The synthetic DOM fixture also exercises a disabled rolling-limit day.

## 0.47.0 - Fresh PayPal batches with independent download and import checkpoints

- Replace the PayPal helper's operator flow with Start fresh and Resume this batch. Fresh batches request every year in the available seven-year window, including 2025, even when older reports or local files exist. Prior files and manifests are preserved.
- Verify new report rows rather than treating existing ready duplicates as submission proof. Create all yearly reports first, wait up to ten minutes with automatic Refresh, and download the newest exact report for each range. Resume protects uncertain Create attempts from duplication.
- Save and hash-check every original before parsing any yearly file. Download failures are tracked per year; import failures cannot interrupt collection or hide a saved year. Each year displays exact dates, request status, original-file status and import status. Browser download checkpoints are retained separately for each year.
- Accept the observed hyphenated invoice/request IDs. Preserve invoice rows with no amounts as separate metadata, without inventing zero-value payments. Collapse exact repeated source rows once while retaining all original row locations and holding automatic matching.
- Verify all eight actual yearly exports: 4,058 source rows, 4,036 financial events, 19 invoice metadata rows and three exact repeats. Recover usable yearly CSVs locally, including 2025, with bytes identical to their originals. Private exports and recovery details stay outside Git.
- Add fresh-batch regression tests for every annual range, old/new duplicate reports, 2025, ten-minute waits, download retry, parse failure isolation, Stop and nested Create controls. Live signed-in browser testing remains pending because both computer-use runtimes fail to start on this host.

## 0.46.0 - Preserve personal-report fee semantics and continue batch collection

- Preserve personal Amount/Fees/Total values when Amount equals Total and fees are listed separately. Keep gross unavailable and flag fee reconciliation instead of inventing a gross amount or rejecting the whole report. Classic Gross/Fee/Net reconciliation remains strict.
- Preserve distinct ledger events sharing a transaction ID, including Pending/Completed authorization history, with stable event keys and original source IDs. Repeated IDs stay out of automatic actions; identical duplicated events remain rejected.
- Resume can reuse one hash-verified preserved response for the exact report range. Missing, changed or ambiguous raw copies require a fresh download.
- A preserved report that still fails import is checkpointed separately while the batch collects other ready years. Report-level failures remain visible and are never counted as successful imports or retried repeatedly in the same run.
- Validate the complete failing historical report, including fee-bearing rows and repeated authorization IDs, plus regression tests for continuing through a failed report to collect 2025.

## 0.45.0 - Parse the observed PayPal personal-account export

- Support the actual personal-account Amount, Fees and Total columns alongside Gross, Fee and Net. Preserve source transaction IDs, status, currency and item evidence; require the provided amounts to reconcile rather than invent fees.
- Handle a deducted fee sign convention only when Amount minus Fees exactly equals Total. Existing signed-fee reports retain their strict reconciliation checks. Ambiguous duplicate or missing amount columns remain rejected.
- Preserve the original downloaded text in ignored data/paypal/raw before parsing. A rejected CSV response is kept for inspection without being treated as validated transaction evidence; HTML/login pages and ZIP files remain rejected before raw persistence.
- Capture only a CSV blob associated with an actual download anchor, instead of taking the first unrelated blob created on the provider page.
- Validate the parser against the real local export without committing financial rows. Public regression examples use fictional records with the observed column names.

## 0.44.0 - Use PayPal available-data dates and reconcile missing years

- Read PayPal's displayed Data is updated as of date. Current-year requests end at that date when it precedes today; the rolling seven-year starting boundary still uses today's date.
- Reuse exact existing reports for the provider-supported range. Retain a superseded audit note for older longer-end request checkpoints when the actual shorter range is visible, preventing another duplicate current-year request on Resume.
- Regression coverage checks a missing previously observed 2025 row, preserves the other pending years, and verifies Resume does not create a third report for a duplicated clamped current-year range.
- No accounting files or provider transactions are changed. New report creation and current-year download remain verified by exact visible report identity and CSV validation.

## 0.43.0 - Create PayPal annual reports before any legacy download

- Remove the full-list historical download prerequisite. Once each missing year's controls are prepared, persist its request intent and immediately click Create Report, including when PayPal already shows twelve reports.
- Collect and validate requested annual CSVs first. Collect optional older exports afterward; archive download failures cannot block creating or collecting the requested years.
- Record unavailable older exports when PayPal rotates its report list, and report failed archive downloads separately without claiming complete preservation. Existing saved files and confirmed submission protections remain intact.
- Regression tests include a full list with every legacy download failing, exact prepare-to-create order, report-list rotation and a required annual download failure. Signed-in PayPal still needs verification.

## 0.42.0 - Activate nested PayPal actions and explain full-list preservation

- Click the visible inner label of PayPal Create Report and Download controls so handlers on either the label or its enclosing button receive one click. Verify the exact submitted report row as before.
- A full twelve-report list explicitly shows which existing CSV is being saved before new reports can be created. Preserve this stage in both the helper status and activity display while observing native downloads.
- A click without any recognizable CSV download exits the startup wait after fifteen seconds with a specific missing-download message; genuine recorded downloads retain their longer completion wait and Resume checkpoint.
- Synthetic coverage reproduces nested action handlers, preparation without submission, exact submission confirmation, CSV capture and full-list preservation. Signed-in PayPal remains an integration check.

## 0.41.0 - Keep PayPal requests within the confirmed seven-year window

- Clip the oldest requested year to the rolling seven-year cutoff and skip entirely unavailable years. Subsequent completed years remain Jan 1 through Dec 31; the current year ends today.
- Show the exact oldest partial-year range in setup, instead of attempting an unavailable January date and failing calendar selection. Older ready CSVs remain collectible as evidence.
- Cover the moving daily cutoff, leap-day adjustment, January boundaries and later starting years with regression tests.

## 0.40.0 - Use observed PayPal calendar arrows and verify committed dates

- Activate dropdown and date controls with pointer/mouse-down/up and click events, including menus that act before click. Reuse an already-open matching menu instead of toggling it closed.
- Read displayed months from dated calendar TDs, including headings split across caption nodes. Scope each picker to its active From/To DateInputBox.
- Target the supplied GlyphIcon prev/next spans directly, even inside a focusable wrapper. Verify each month moves once; stop for disabled, ambiguous or unresponsive controls.
- Reacquire date fields after opening/rendering, send a key-up notification after typed input, and select the exact day. Numeric range summaries must reflect the committed field before proceeding. Typed text alone cannot count as a selected calendar day.
- Add safe calendar diagnostics with displayed months, day counts and arrow tags/disabled states. Synthetic regressions reproduce December 2025 to full 2019, next-year advancement, two visible pickers, pointer-only dropdowns and ignored day selection. Signed-in provider behavior remains unverified.

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
