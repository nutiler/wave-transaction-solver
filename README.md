# Dandelion's Wave Transaction Solver

A local Chrome extension for organizing Wave accounting transactions from an accounting CSV export. It proposes merchant categories and transfer matches, checks transaction details against Wave, and builds draft session plans. Apply saves one planned merchant category and requests reviewed status after a fresh live check. It reloads Wave to verify saved values and records attempts locally to prevent uncertain saves from being repeated. Transfer review supports a deliberate Set transfer and request review action for one unique existing pair after its matching submenu is inspected. Both saved categories and reviewed statuses are checked separately.

## Install

1. Download or clone this repository.
2. Open chrome://extensions and enable Developer mode.
3. Choose Load unpacked and select the extension folder.
4. Open your Wave business and launch Dandelion's Wave Transaction Solver.
5. Import accounting.csv from Wave's data export.

See [the extension guide](extension/README.md) for account-name collection, rules, live checks, export shortcuts, and session restoration.

## Workspace

**Usage** groups setup, transaction runners, rules, and planning. **Debug tools** keeps diagnostics and manual troubleshooting separate. Sessions and rules stay saved while switching workspaces. The blue interface uses consistent controls and scrollable tables across window sizes.

## Local data

CSV exports, working sessions, rules, and collected account names stay on your computer. The extension requests access only to next.waveapps.com for its DOM readers and deliberate editing controls. Configure your personal export URL in the ignored extension/settings.local.js file, using settings.example.js as a template. Accounting exports, screenshots, ZIP files, and local settings are excluded from Git.

## Development

Requires Node.js 20 or later. No package installation is needed.

Run node --test for the automated checks. Run node server.mjs and open http://127.0.0.1:4317/extension/app.html to preview the interface. Live Wave checks require the installed extension. DOM checks are at /extension/reader-fixture.html; Apply mock-dialog checks are at /extension/editor-fixture.html. Responsive workspace checks are at /extension/workspace-fixture.html.

The earlier standalone CSV organizer remains available at http://127.0.0.1:4317/.

See [development milestones](CHANGELOG.md) for the work included in this prototype.

## Local rule review

Version 0.8 adds evidence-backed rule-pack previews with explicit acceptance/rejection, account/category restrictions, and conflict handling. Imported proposals stay inactive until approved. Full-history analysis and all derived financial reports stay under the ignored `local-analysis/` directory. See the extension guide for the private analysis command and synthetic browser checks.

Version 0.18 adds batch acceptance to historical merchant suggestions, visible category choices, remaining-scan priorities and detailed historical evidence. Rules are validated together and saved once; historical categories remain proposals until explicitly accepted. Private analysis can include additional conservative exact-descriptor candidates needing judgment.
