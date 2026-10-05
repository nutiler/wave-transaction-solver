# Development milestones

This repository starts with the completed local prototype. The initial commits group the existing work by component; they are not a reconstruction of earlier edit history.

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
