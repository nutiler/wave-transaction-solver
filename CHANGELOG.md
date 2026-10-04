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

Wave category updates, transfer matching, and marking transactions reviewed are not implemented.

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
