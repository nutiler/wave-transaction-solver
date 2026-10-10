# Wave Solver

A local Chrome extension centered on **Update my finances**: scan Wave, review supported suggestions, approve locally, then apply and verify. Daily work needs no accounting CSV. Optional exports and Amazon, PayPal and Venmo evidence add history and purchase details.

The current build is **1.0 preview (0.99.15)**. The beta and saved state remain recoverable. See [upgrade and live acceptance](docs/1.0-acceptance.md) before declaring final 1.0.

## Venmo balance and funding repairs

Open **Venmo balance** after refreshing Wave accounting history and Venmo statements in **Data & setup**. The tool uses reviewed and unreviewed history, matches explicit Wells Fargo funding/destination details, and distinguishes externally funded payments from Venmo cash-outs. It shows the saved balance, the effect of selected repairs, verified repairs not yet reflected in that export, and an optional actual Venmo balance/date comparison. It never invents an adjustment to reach zero.

Filter or select the exact candidates you recognize. **Check selected in Wave** is an optional read-only preflight. Tick the local approval checkbox, then **Create selected transfers & verify**. This action performs its own live preflight: complete ALL history for the relevant years, original bank/payment fields, USD/simple structure, and the exact transfer-creation account. It changes the bank category to a transfer and lets Wave create the missing counterpart. The Venmo purchase/category and reviewed statuses are preserved. Same-amount existing Venmo entries, fees, conflicting evidence, missing purchases and transactions before the recorded account opening stay held for inspection.

The batch reuses owned background tabs, reports progress, and can stop after the current repair. Creation is checkpointed before the first possible financial click. **Recheck saved repairs** reads and verifies both transfer sides; it never repeats Save or creation. Verified and uncertain attempts survive reloads per business. Existing bookkeeping approvals and provider downloads are preserved. Refresh the Wave accounting export afterward to update the saved ledger balance. See [Venmo repair acceptance](docs/venmo-funding-repair.md).

## Install

1. Download or clone this repository.
2. Open chrome://extensions and enable Developer mode.
3. Choose Load unpacked and select the extension folder.
4. Open your Wave business and launch Dandelion's Wave Transaction Solver.
5. Choose the intended business in **Data & setup**, then use **Update my finances** to scan it. Reload your existing unpacked installation in place when upgrading.

**Confirm locally** approves only the included records and makes no Wave calls. Drafts, exclusions, deferred work and grouped undo survive reloads. **Apply & verify** rechecks approved records and runs sequential verified saves. An uncertain new Save stops the run and preserves its approval. The next **Apply & verify** checks previous saves before continuing. Confirmed category or description differences are corrected to their original approved values on the same record; already correct saved results are verified without another Save. Confirming a record never creates a merchant rule.

After scanning, use the next-step panel: review purchase evidence, choose category/description and Confirm locally; inspect Approved queue, then Apply & verify. Possible source evidence is expanded with items, dates, amounts and funding details, and stays unlinked until explicitly resolved. Other groups needing review do not require you to finish all bookkeeping before applying supported approvals. Previous saves are handled within **Apply & verify**. **Recheck saved outcomes** remains an optional read-only check. Missing baselines, changed identity/date/account/amount/direction, uncertain transfers, unsupported structure or unreadable controls still require inspection. Corrections retain the original approval, original snapshot, observed mismatch and each correction attempt in history.

A failed recheck shows the exact approved/live differences and opens the blocked record's comparison. Close the Wave dialog with Cancel; it needs no Save. If a previous approval has a different category while every other field and saved Reviewed status match, **Keep current Wave category** offers an explicit local resolution. Confirming performs another fresh read and retains the original approval and observed category in history. It does not edit Wave or falsely mark the original target verified. Missing baselines, changed non-category fields, unsupported structure, unknown Reviewed status, transfers and overlapping current decisions stay locked.

Wave may display an expense refund as **Refund for [expense category]**. For an explicitly approved incoming refund to that exact category, the saved-result check recognizes this display label while retaining the original category choice. Income, ordinary deposits and purchases do not acquire refund equivalence; all other live fields and Reviewed evidence must still match. Existing affected saves can be checked with **Recheck saved result** without repeating Save.

If a scan tab closes, collection automatically opens a replacement in the same Chrome window without taking focus. A closure during collection restarts it once. Other scan failures show their actual loading/filter/count reason. **Apply & verify** retries a failed or outdated preparation before saving queued work; only a fresh complete collection permits execution. Approvals remain saved if preparation still fails. Clear extra searches/filters or selected checkboxes in Wave only when the specific diagnostic requests it. A stable explicit empty Not Reviewed list confirms zero; missing tables, loading, missing scope, unknown totals and partial rows do not prove an empty backlog.

See [the extension guide](extension/README.md) for account-name collection, rules, live checks, export shortcuts, and session restoration.

For Wave AI-categorized transactions, **Apply & verify** opens the exact record’s **Review updates** menu. If the displayed category matches your local approval, it uses **Confirm category**; otherwise it uses **Change category** and selects your approved category. It then uses **Mark as reviewed** and verifies the saved fields and reviewed status after reopening the record. Unrecognized, disabled or ambiguous menu actions stop with diagnostics. Category confirmation is treated as a possible write and retained in the save history; an uncertain response never triggers a blind repeat.

## Activity console

Click **Console** in the top activity bar, or expand **Activity console** at the bottom of any app/helper page. It records timestamped activity, status changes, provider script/action starts and outcomes, bounded counts/flags, and error stacks. **Copy all logs** includes recent lines from all open helpers and the main app; provider/severity/search filters, Copy filtered logs and Download logs are also available. Logs persist across reloads in a separate local diagnostics database, capped at 1,000 lines. If that store is unavailable, the current page retains a bounded copy without stopping bookkeeping. Clear logs removes diagnostics only, preserving approvals, data and uncertain-save locks.

Logs strip URLs, credentials, email addresses, long IDs and local paths; code filenames/line numbers remain useful. Full CSVs, provider responses, receipts and request arguments are never serialized into the console. Visible progress may include transaction labels, so review copied logs before sharing. Nothing is sent automatically. For troubleshooting, reload the extension and close/reopen helper tabs to load the current code; reproduce the issue, click Console and paste Copy all logs. The opening line records the loaded extension version.

Amazon now reacquires fields replaced during date entry and treats missing values as a diagnostic rather than calling replace on undefined. It waits/scrolls for Custom Range, supports mousedown menu triggers, and verifies both dates before Submit. A recognized Generate step may collapse the date inputs; contradictory dates or a reset Month to date preset still prevent generation. Apple supports the observed month-year-text span, plain menu labels and flat calendar grids, and verifies the resulting date after year/month/day selection.

## Apple Card → Wave

Open **Data & setup → Collect Apple Card → Wave** after reloading the existing extension. The helper reads original Apple Card transaction CSVs already in the shared data folder, or collects a new one through Statements → Export Transactions. Connect its optional Apple/download access once and choose the shared data and browser download folders. The personal target account URL can be saved in ignored settings.local.js under appleCardAccounts; it is also editable in the helper. Check that it identifies your USD Apple Card credit-card account.

Click **Check Wave & prepare import** to read reviewed and unreviewed transactions across every posting year in the CSV. Review the missing-row preview, then **Upload missing & verify**. The importer verifies the exact business and account ID and credit-card account type, retains source originals, and saves a filtered CSV under apple-card/uploads. It uses posting dates and preserves Apple’s positive charges and negative payments/credits, consistent with [Wave’s credit-card CSV mapping guidance](https://support.waveapps.com/hc/en-us/articles/208621626-Upload-a-bank-or-credit-card-statement-in-csv-format).

The legacy Wave uploader is reached through the observed **More → Upload transactions** link from the selected business; its numeric route is never guessed or hardcoded. Its separate payment-account ID is bound to the exact configured account name and checked against the business’s credit-card chart. Later stages must retain that same business route and verified upload chain. Date, amount and description columns are clicked and their highlights checked, including the final **Upload** button. The helper also recognizes unchanged manual imports that used Transaction Date, preserving their existing dates and IDs rather than adding them again. A renamed possible manual entry is held for inspection. After upgrading, click **Connect Apple & Wave import access** to grant the newly listed legacy upload host access.

Future exports may cover the full available range again. Matching uses posting date, signed amount and original description with duplicate counts; saved Wave transaction IDs continue identifying renamed records. Same-date/amount conflicts, changed or missing prior records, incomplete collections and unknown mappings are held. Apple’s CSV has no transaction ID, so exact field agreement is evidence of an existing row, not a unique bank-issued identity. A latest imported date alone is never used to discard backfilled transactions.

A checkpoint is saved before file submission and again before final import. An uncertain outcome disables another upload; **Recheck previous import** reads Wave without repeating the file or final submission. New transactions are not categorized or marked reviewed by this helper. Existing bookkeeping approvals and recovery receipts are retained. Verified account history also becomes available to Subscription Finder; raw Apple CSV rows are not presented as Wave records before import.

Automated validation uses fictional provider pages and Wave records. Signed-in Apple calendars and Wave upload layouts still require live acceptance; unfamiliar controls or missing exact-account evidence pause with diagnostics instead of guessing. The original CSV in data is available even when automatic export needs manual date selection.

## Subscription Finder

The default **Recent findings (18 months)** view includes only patterns with a charge within the last 18 calendar months, including the cutoff date. Patterns with older last charges move to **Historical patterns** and are excluded from the main counts and current confirmed cost estimates. **All findings (all history)** shows both. All old transactions still support detection; saved names, notes and confirmations remain intact. A historical label means probably no longer subscribed under this rule, not confirmed cancellation. New matching charges can return a pattern to the recent list.

Open **Subscriptions** to analyze the selected business's available accounting history, saved full collection, confirmed live transaction details and saved observations. Reviewed transactions and earlier bookkeeping periods are included. Analysis stays local and makes no Wave calls. **Collect full Wave history** opens the existing read-only year collector; **Import history / evidence** opens Data & setup.

Cards separate likely recurring charges, weaker possible patterns and variable bills. They show typical/latest charges, frequency, estimated monthly/annual cost, the next date implied by the observed pattern, possible price increases and possible duplicate schedules. Expand a card to see original descriptions, all supporting charges and exact Wave transaction links. Filter by account, confidence, frequency and fixed/variable amount; search names, notes and descriptions. Cost sorting and totals do not convert currencies.

**Confirm subscription**, **Mark as recurring bill**, **Not recurring**, friendly names, notes and Undo change this list only. They never categorize, review, create a merchant rule or cancel a service. Choices persist per business and receive new matching charges. Names also survive descriptor changes when shared charge IDs establish continuity. Saved choices remain visible when supporting history is missing; no cancellation is inferred. Confirmed costs are estimates of the observed pattern, not a contract or guarantee of future billing.

Coverage distinguishes available date ranges from count-confirmed full collections. Incoming/refund/transfer/payment movements, conflicting copies, truncated fields, missing money direction and future-dated records are excluded explicitly. Missing currency stays unspecified and costs remain separate by account. Generic retail/processor descriptions stay tentative unless an unchanged confirmed source link identifies the merchant/service. Source guesses never become links. High-volume groups over 600 charges need more specific service/item evidence and are reported rather than silently treated as subscriptions.

Detection runs in a local worker, can be stopped, and is cached by business, input fingerprint, date and algorithm version. Timelines and large result sets load on demand. Portable backups include subscription choices and refuse conflicting replacements.

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
