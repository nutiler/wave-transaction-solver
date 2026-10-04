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
