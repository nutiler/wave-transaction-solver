# Dandelion's Wave Transaction Solver

A local Chrome extension for organizing Wave accounting transactions from an accounting CSV export. It proposes merchant categories and transfer matches, checks transaction details against Wave, and builds draft session plans. It currently reads Wave data without saving categories, matching transfers, or marking records reviewed.

## Install

1. Download or clone this repository.
2. Open chrome://extensions and enable Developer mode.
3. Choose Load unpacked and select the extension folder.
4. Open your Wave business and launch Dandelion's Wave Transaction Solver.
5. Import accounting.csv from Wave's data export.

See [the extension guide](extension/README.md) for account-name collection, rules, live checks, export shortcuts, and session restoration.

## Local data

CSV exports, working sessions, rules, and collected account names stay on your computer. The extension requests access only to next.waveapps.com for its DOM readers. Configure your personal export URL in the ignored extension/settings.local.js file, using settings.example.js as a template. Accounting exports, screenshots, ZIP files, and local settings are excluded from Git.

## Development

Requires Node.js 20 or later. No package installation is needed.

Run node --test for the automated checks. Run node server.mjs and open http://127.0.0.1:4317/extension/app.html to preview the interface. Live Wave checks require the installed extension. The DOM test harness is at /extension/reader-fixture.html.

The earlier standalone CSV organizer remains available at http://127.0.0.1:4317/.

See [development milestones](CHANGELOG.md) for the work included in this prototype.
