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
