# Wave Solver

A local Chrome extension centered on **Update my finances**: scan Wave, review supported suggestions, approve locally, then apply and verify. Daily work needs no accounting CSV. Optional exports and Amazon, PayPal and Venmo evidence add history and purchase details.

The current build is **1.0 preview (0.99.4)**. The beta and saved state remain recoverable. See [upgrade and live acceptance](docs/1.0-acceptance.md) before declaring final 1.0.

## Install

1. Download or clone this repository.
2. Open chrome://extensions and enable Developer mode.
3. Choose Load unpacked and select the extension folder.
4. Open your Wave business and launch Dandelion's Wave Transaction Solver.
5. Choose the intended business in **Data & setup**, then use **Update my finances** to scan it. Reload your existing unpacked installation in place when upgrading.

**Confirm locally** approves only the included records and makes no Wave calls. Drafts, exclusions, deferred work and grouped undo survive reloads. **Apply & verify** rechecks approved records and runs sequential verified saves. An uncertain result stops execution and remains locked until a read-only recheck. Confirming a record never creates a merchant rule.

After scanning, use the next-step panel: review purchase evidence, choose category/description and Confirm locally; inspect Approved queue, then Apply & verify. Possible source evidence is expanded with items, dates, amounts and funding details, and stays unlinked until explicitly resolved. Other groups needing review do not require you to finish all bookkeeping before applying supported approvals. Prior uncertain saves do block Apply: **Recheck saved outcomes** checks these sequentially without Save or review clicks and keeps unverifiable outcomes locked.

A failed recheck shows the exact approved/live differences and opens the blocked record's comparison. Close the Wave dialog with Cancel; it needs no Save. If a previous approval has a different category while every other field and saved Reviewed status match, **Keep current Wave category** offers an explicit local resolution. Confirming performs another fresh read and retains the original approval and observed category in history. It does not edit Wave or falsely mark the original target verified. Missing baselines, changed non-category fields, unsupported structure, unknown Reviewed status, transfers and overlapping current decisions stay locked.

Wave may display an expense refund as **Refund for [expense category]**. For an explicitly approved incoming refund to that exact category, the saved-result check recognizes this display label while retaining the original category choice. Income, ordinary deposits and purchases do not acquire refund equivalence; all other live fields and Reviewed evidence must still match. Existing affected saves can be checked with **Recheck saved result** without repeating Save.

See [the extension guide](extension/README.md) for account-name collection, rules, live checks, export shortcuts, and session restoration.

## Workspace

**Update finances** shows the selected business, last successful scan, review/approval/attention/verified counts and Scan → Review → Approve → Apply → Verify. **Data & setup** holds the shared data folder, collectors and private backups. **Rules** preserves exact business/account scopes; **Advanced** holds retained manual tools and diagnostics. The layout works on desktop and narrow windows.

Drop supported exports into the project **data** folder and refresh once. Update my finances also refreshes this folder when its saved read permission is granted. Root and nested CSV/PDF contents are recognized; originals and history stay intact and overlapping files are deduplicated. Wave files without a verified business binding need local confirmation; new exports from the verified helper carry their exact accounting hash. File failures and missing prior evidence are listed explicitly. After 30 days away, the app guides a catch-up refresh while keeping live scan freshness separate from export coverage.

Wave accounting history is Wave's transaction and ledger export, separate from Amazon, PayPal and Venmo purchase evidence. The shared refresh imports them together. Venmo status distinguishes saved files, past unconfirmed statements and the current month; an unavailable download control does not prove an empty statement.

An explicit Venmo no-transactions page can establish checked no-activity coverage for a completed month when the displayed month and both profile identities agree and loading has settled. A user-confirmed page can also supply this metadata, scoped to the same captured profiles. No CSV or transaction rows are fabricated. Current-month empty observations remain provisional.

## Local data

CSV exports, sessions, rules and account names stay on your computer. Wave readers and deliberate editing controls use next.waveapps.com; collectors request their listed optional provider/download permissions during setup. Configure private export settings in ignored extension/settings.local.js using settings.example.js as a template. Financial files, backups, screenshots, ZIPs and local settings stay excluded from Git.

Startup checkpoints all existing local features and Chrome settings before restoring them. Keep the same **extension** path to retain the storage origin. Export a private local backup in Data & setup before changing installation identity; portable restore preserves save locks and requires renewed folder permission. The extension requests unlimitedStorage so retained history, scans and recovery receipts can exceed Chrome's default local-store quota; it still stores everything locally.

## Development

Requires Node.js 20 or later. No package installation is needed.

Run `node --test` for automated checks. Run `node server.mjs` and open `http://127.0.0.1:4317/extension/app.html` for a preview. Live Wave checks require the installed extension. The isolated browser acceptance script is `node scripts/check-v1-browser.mjs`; it needs optional Playwright/Chrome paths described in the acceptance guide. Reader/editor/provider fixtures retain fictional DOM checks. `/extension/command-fixture.html#live-only` demonstrates daily work with no CSV and zero real Wave calls. Run fixtures through localhost, outside the installed extension.

The earlier standalone CSV organizer remains available at http://127.0.0.1:4317/.

Run `node scripts/audit-downloads.mjs YYYY-MM-DD` for a read-only audit of saved archives, manifest hashes, parsed originals/imports and expected report ranges. The private result stays under ignored `local-analysis/`.

See [development milestones](CHANGELOG.md) for the work included in this prototype.

## Local rule review

Version 0.8 adds evidence-backed rule-pack previews with explicit acceptance/rejection, account/category restrictions, and conflict handling. Imported proposals stay inactive until approved. Full-history analysis and all derived financial reports stay under the ignored `local-analysis/` directory. See the extension guide for the private analysis command and synthetic browser checks.

Version 0.18 adds batch acceptance to historical merchant suggestions, visible category choices, remaining-scan priorities and detailed historical evidence. Rules are validated together and saved once; historical categories remain proposals until explicitly accepted. Private analysis can include additional conservative exact-descriptor candidates needing judgment.

Version 0.19 presents a saved five-stage bookkeeping flow with Previous/Continue navigation, concise scan summaries, optional advanced controls, and automatic routing to the correct stage for inspection and expense preparation. Navigation never runs bookkeeping actions.
