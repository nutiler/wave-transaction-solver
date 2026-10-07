# Dandelion's Wave Transaction Solver

A local Chrome extension that prepares Wave exports and Amazon, PayPal and Venmo evidence, groups unfinished transactions, and prefills category and description suggestions. **Confirm saves locally and moves to the next group. Execute queued decisions applies your saved choices together, using sequential verified Wave saves.**

## Install

1. Download or clone this repository.
2. Open chrome://extensions and enable Developer mode.
3. Choose Load unpacked and select the extension folder.
4. Open your Wave business and launch Dandelion's Wave Transaction Solver.
5. Import accounting.csv from Wave's data export.

Amazon order CSVs, PayPal activity CSVs or monthly PDFs and Venmo statement CSVs can also be reviewed locally in the source evidence solvers. The Command center combines that evidence with your saved rules and working snapshot. New suggestions remain proposals until you confirm them.

See [the extension guide](extension/README.md) for account-name collection, rules, live checks, export shortcuts, and session restoration.

## Workspace

**Bookkeeping** opens the Command center for **Scan Wave → confirm groups → Run queued decisions**. Ordinary daily work does not require a CSV import. Connections and Rule library are secondary views; history and purchase-source imports are optional. **Advanced tools** holds collectors, legacy runners, historical analysis and diagnostics. Sessions and rules stay saved while switching workspaces. The blue interface uses consistent controls and scrollable tables across window sizes.

## Local data

CSV exports, working sessions, rules, and collected account names stay on your computer. The extension requests access only to next.waveapps.com for its DOM readers and deliberate editing controls. Configure your personal export URL in the ignored extension/settings.local.js file, using settings.example.js as a template. Accounting exports, screenshots, ZIP files, and local settings are excluded from Git.

## Development

Requires Node.js 20 or later. No package installation is needed.

Run node --test for the automated checks. Run node server.mjs and open http://127.0.0.1:4317/extension/app.html to preview the interface. Live Wave checks require the installed extension. DOM checks are at /extension/reader-fixture.html; Apply mock-dialog checks are at /extension/editor-fixture.html. Responsive workspace checks are at /extension/workspace-fixture.html. The command-center integration simulation is at /extension/command-fixture.html; its browser calls and saved records are fictional.

The earlier standalone CSV organizer remains available at http://127.0.0.1:4317/.

See [development milestones](CHANGELOG.md) for the work included in this prototype.

## Local rule review

Version 0.8 adds evidence-backed rule-pack previews with explicit acceptance/rejection, account/category restrictions, and conflict handling. Imported proposals stay inactive until approved. Full-history analysis and all derived financial reports stay under the ignored `local-analysis/` directory. See the extension guide for the private analysis command and synthetic browser checks.

Version 0.18 adds batch acceptance to historical merchant suggestions, visible category choices, remaining-scan priorities and detailed historical evidence. Rules are validated together and saved once; historical categories remain proposals until explicitly accepted. Private analysis can include additional conservative exact-descriptor candidates needing judgment.

Version 0.19 presents a saved five-stage bookkeeping flow with Previous/Continue navigation, concise scan summaries, optional advanced controls, and automatic routing to the correct stage for inspection and expense preparation. Navigation never runs bookkeeping actions.
