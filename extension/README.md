# Dandelion's Wave Transaction Solver

## Install in Chrome

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and choose this folder:

   `wave-solver/extension`

3. Open your business's **Transactions** page at `next.waveapps.com`. Click Chrome's Extensions button, then **Dandelion's Wave Transaction Solver**. Pin it if you want easier access.

No Node server is needed to run the extension. The earlier localhost application is separate.

## Usage and Debug tools

Version 0.14 groups the page into two workspaces. **Usage** contains session setup, transaction collection and runners, merchant rules, and planning. **Debug tools** contains chart, live-field, list, rule-check, expense-result, and transfer diagnostics, plus manual transfer-menu tools and the fictional sample. **View diagnostics** buttons open the relevant Debug card. Normal Run, retry, and recheck controls remain beside the affected transactions in Usage. Switching workspaces keeps your loaded session and selections.

The blue theme uses consistent buttons, checkboxes, collapsible cards, and scrolling tables, with compact layouts for smaller windows.

## Reloading after an update

The solver now saves the working session locally in IndexedDB, including the imported CSV. Selected business, transaction, filters, draft shortlist, unfinished rule form, and chart names return after a reload. Existing matching Wave tabs are reconnected. Import a fresh CSV for new bookkeeping work; the restored export is labeled with its original import time. Clear imported session removes the saved CSV and draft plan while preserving rules, selected business, and chart names. No additional permissions are required.

Reload the extension at chrome://extensions. Its existing solver tab refreshes automatically. Clicking the extension icon also reuses and refreshes the existing solver tab. When upgrading from 0.3.1 or earlier, select the business and import once after installing this version because earlier versions did not save the session.

## Export shortcut and compact steps

Expand **Import your session export** and click **Open Wave data export**. Copy settings.example.js to settings.local.js and configure your business UUID and export-page URL. This private file stays out of Git. The shortcut opens that accounting.waveapps.com page in a background tab without extra host permissions. Switch to Wave and request **Export all transactions as CSV**; Wave emails the ZIP. Extract it and import accounting.csv. Requesting the export remains a manual action on Wave. The shortcut is bound to the supplied business so it cannot silently open the wrong company’s export.

Click any step header to expand or collapse it. Business selection, collected chart names, CSV import, and saved rules show completion badges and fold when completed. Other headers show proposal, live-check, and draft status. Open/closed choices persist with the session. Inspecting a transaction opens its live-check section, and preparing a merchant rule opens the rule section.

## First session

1. In the solver tab, select your Wave transaction tab and click **Use selected business**. Confirm the CSV belongs to that business: Wave's accounting export does not include a business identifier.
2. A single business among your open Wave tabs is selected automatically. Multiple businesses require selecting the intended business. Import your latest `accounting.csv`. IDs are kept as text so their 19 digits remain intact. Ledger postings are grouped by ID, not treated as separate purchases.
3. Search for a transaction from your export. Click **Inspect**, then **Open this transaction in Wave**.
4. The transaction opens in a background tab, keeping the solver in front. Its live check starts after 1.5 seconds and retries briefly while Wave loads. Read live details remains available to retry manually. If the dialog does not open from the URL, open the transaction manually in the dedicated test tab. Selecting another transaction cancels the pending check.
5. Inspect the Export / Live Wave comparison. Missing fields remain **Unknown**; truncated or changed values are reported as **Different**. The NOT_VERIFIED URL filter is never treated as evidence of a transaction's reviewed state.
6. Test a transaction you previously corrected in Wave. An older CSV should report its changed category. A fresh CSV may identify it as an existing multi-account record. The extension does not overwrite either state.

The first live check is a feasibility test of the DOM reader. Wave's exact markup has not yet been inspected through this extension. If fields are unknown, open **Debug tools → Live transaction diagnostics** and click **Show field diagnostics** and share the diagnostics plus a screenshot of the dialog for an adapter adjustment. No passwords or cookies are read.

## Collect exact account and category names

Select your business under **Set up your session**. Click **Open Chart of Accounts** to load it in a background tab, wait for Wave to load, then click **Collect all five tabs** from the solver. The collector clicks only Assets, Liabilities & Credit Cards, Income, Expenses, and Equity navigation tabs. It checks selected-tab state and reads every recognized account-name row before accepting the names. Wave’s tab counters omit some built-in accounts inconsistently; the collector treats the counter as a lower bound and shows it separately from the number of collected names. Wave’s account-name cells exclude add-account buttons and empty-section messages. Account editing controls are never clicked.

Complete collections are saved locally per business and shown in searchable groups. All collected account names join the Category suggestions in the merchant-rule form, including names not present in your export. They are Chart of Accounts names; transfers, splits, and context-specific transaction options still require their own handling. A failed or partial collection does not replace the previously saved chart. Expand **Collection diagnostics** if Wave's markup is not recognized. Live compatibility still needs checking on your account.

## Analysis

### Historical rule suggestions

After importing, **Suggestions from your history** groups repeated safe purchases, removes documented bank wrappers/reference tails, and retains store numbers and processor names. Loaded proposal families supply curated alias grouping; unknown names remain exact. Incoming credits, suspected refund/transfer pairs, financing, split postings, and quoted person-to-person memos stay out. Expense and personal equity categories both count. The table shows spending, uncovered working-period counts, last-scan counts, category distributions and 2023–2024 evidence. Conflicting history leaves Category blank even when those years suggest a preferred category.

Choose exact categories, tick rows, then **Add selected rules**. **Select visible suggestions** selects only visible rows with a chosen category; all selected rows, including hidden rows, remain in the displayed selection count. The entire batch validates before one rules save and one queue rebuild. Accepted merchants move to Current rules without changing Wave. New history rules match exact cleaned aliases, apply to outgoing purchases only, and protect previously different categories. Your existing rules and imported session remain saved. **Prepare individually** opens the manual rule form.

History counts are evidence, not proof of purchase purpose or reviewed status. Use **In the last Not Reviewed scan** to focus on remaining purchases; collect a fresh scan after completing transactions. Additional pages load with **Show more historical merchants**. Analysis contexts can set `includeHistoryProposals: true` to include consistent exact-descriptor history candidates in the private proposal pack; those candidates always need judgment until approved.

### Draft session plans

Use individual **Plan** checkboxes to shortlist merchant proposals or transfer pairs. Either side of a transfer includes both records, and each pair appears once in the downloadable JSON draft. The plan contains expected IDs, original categories, account details, dates, descriptions, amounts, and export modification dates. It is explicitly unexecuted and requires live validation. There is no plan execution endpoint.

Choose the Wave business before downloading a real plan. You can later import that plan and a fresh accounting export to see which records changed or disappeared. An unchanged export comparison still does not establish live reviewed status or authorize automatic edits. Rule changes, business changes, and new CSV imports clear the shortlist. Reloading restores the CSV, shortlist, filters, selected business and transaction, and unfinished rule form. Live comparisons are not restored as current evidence. Clear imported session removes the saved CSV and draft plan. Downloaded plans contain financial details and remain wherever you save them.

Fictional samples can produce clearly marked sample plans for interface testing, but those plans are rejected against real Wave records.

- Starter fuel rules use the exact category **Equipment Fuel — Diesel, Gas, Machinery Fuel**, with Chevron and 7-Eleven/7-11/711/7-Elev aliases. First matching rule wins. You can add or replace named merchant families; a custom category must exist in the imported export or collected Chart of Accounts.
- Transfer candidates require equal amounts, opposite debit/credit account movements, different accounts, dates within five days, and payment/transfer wording. Both sides must have a unique reciprocal candidate. This is a proposal, not confirmation.
- Equal-amount opposite movements on the same account with the same recognized merchant within 60 days are shown as possible refunds. Less obvious refunds remain for manual classification.
- Transactions already containing multiple bank/card/loan postings are left for live inspection. Split transactions, exchange-rate differences, missing counterparts, same-day duplicates, and loans with other account types may need manual review.
- No reviewed status is present in accounting.csv. All proposals are historical candidates, not a live unreviewed queue.
- The table renders the first 150 matches; all imported transactions are analyzed. Search, dates, and action filters narrow the view.

## Privacy and scope

The extension requests access only to `https://next.waveapps.com/*`, plus script execution and local extension storage. It reads visible transaction fields only when **Read live details** is clicked. It uses no private API, cookies, authentication tokens, external services, or AI upload. The export stays in the solver tab's memory; closing or reloading clears it. Only merchant rules persist in local extension storage. No sync storage is used.

Apply is available for one planned, outgoing merchant purchase with two ledger postings and one category. Unique existing transfer pairs use the separate Transfer review action described below. Splits and ambiguous transfers require manual handling. It can navigate a dedicated Wave test tab when you explicitly click Open. The original working tab is preserved. Reusing the test tab navigates away from its current transaction; keep that tab for inspection rather than manual unsaved edits.

The export's reviewed status and currency context are incomplete. A successful field comparison does not establish that a transaction is unreviewed. Only clicking Apply starts an edit.

## Development checks

From the parent project directory, run `node --test`. Tests cover CSV parsing, grouping, full-precision IDs, payment pairing, ambiguous matches, refunds, existing multi-account records, merchant alias boundaries, comparison failures, and the read-only reader contract.

For mock DOM checks, run the local server and visit `/extension/reader-fixture.html`. The harness tests native labels, custom dropdowns, calendar/currency decorations, duplicate controls and dialogs, hidden dialogs, unknown review state, and absence of mutations. It supplies a fictional URL to the reader with local mock DOM data. This tests reader behavior, not compatibility with Wave's live markup.


## Apply one merchant transaction (0.7.0)

Tick the transaction's **Plan** checkbox or import its unchanged draft JSON. Inspect it, open it in Wave, and wait for all live fields to match. Its rule category must be an exact name from the collected Chart of Accounts. Section 5 shows the original category, proposed category, and **Apply this transaction** button.

Click Apply to recheck the record, select the exact category, request reviewed status, and save. The solver reloads the Wave record to confirm what persisted. Review availability is checked after category selection. If it remains disabled, the category is saved and verified without claiming that the record was marked reviewed. If reviewed status cannot be read, it reports that separately from category verification. An unsupported or ambiguous dropdown stops the attempt; **Copy diagnostics** includes the editing result. This release has been tested against local mock dialogs; the first real Wave edit still needs checking against Wave's current markup.

Apply attempts are saved locally before editing starts. After a possible Save, the button stays disabled even after an extension reload. **Recheck saved result** performs a read-only verification and never repeats Save. If category selection fails before Save, cancel the unsaved Wave dialog and read the original record again before retrying. Clearing the imported session preserves these attempt records.

The old CSV remains a historical snapshot. After a verified category save, that record is removed from the draft shortlist; the live table compares against the expected saved value. Import a fresh export for subsequent bookkeeping work.

Equity categories such as personal groceries are selected through Wave’s **Personal Expense or Withdrawal** submenu. The solver searches inside the category popup when needed and matches the exact account name, excluding icon text.

After Save, Wave may close the dialog and return to the list. Verification waits for that redirect, then opens the exact saved ID and checks a freshly loaded record. **Recheck saved result** can also replace a closed test tab without pressing Save again.

## Retry after a manual restoration

If you manually restore the original category and unreviewed state in Wave, select **Reset attempt and re-plan**. It loads the saved record again and requires every original export field to match. It preserves the previous attempt locally, adds the transaction back to the draft, and unlocks Apply. Reset does not click Save or change Wave. A still-reviewed record, changed amount, different transaction, or saved target category keeps the attempt locked.

The saved-state reader recognizes Wave’s green **Reviewed** confirmation in the Edit transaction panel. Recheck saved result uses that confirmation after reloading the record; it does not press the Reviewed button again.

## Rule proposals and full-history analysis (0.8.0)

Expand **Rule proposal review** and choose a local `proposed-rule-pack.local.json`. The preview shows exact categories, descriptor variants, date ranges, account/category distributions, supporting counts, exclusions, and provider references where supplied. **Accept rule** adds one proposal to local rules; **Reject proposal** leaves it inactive. Accept rule is your explicit approval, including for proposals needing judgment; inspect purpose and scope first. Existing approved rules are preserved, and acceptance retains eligible draft selections. Accepted proposals leave the review list and appear under **Merchant rules → Current rules**. **View current rules** opens that section. Removing an accepted rule returns its proposal to review. The pack and decisions return after reload.

A pack must match the selected business and SHA-256 of the exact imported CSV. A different export blocks acceptance until a matching pack is regenerated. Accepted rules remain business-scoped for future sessions. New proposals never modify Wave. Planning and the existing deliberate Apply workflow remain separate actions.

Matching supports whole-word, exact, and prefix descriptors, account IDs/names, excluded accounts/descriptors/categories, and allowed current categories. Reference/card tails are excluded from merchant text. Numeric aliases require the merchant position. Conflicting rule categories produce **Conflicting merchant rules** and cannot be planned. Same-category overlaps are counted once. Incoming transactions, recognized payments/financing/cash, splits, and refund pairs do not receive purchase rules. Account scopes are also honored by historical suggestions.

To regenerate private analysis with Node.js, supply your local merchant-purpose context and complete chart catalog:

```powershell
node scripts/analyze.mjs accounting.csv local-analysis/merchant-context.local.json local-analysis/catalog.local.json local-analysis
```

The generic analyzer processes every balanced transaction group, preserves string IDs and exported memos, and reconciles ledger totals. The local context has a business UUID and `groups` containing `name`, `aliases`, exact `category`, optional `excludeAliases`/`matchMode`, `purpose`, `reason`, and Boolean `approved`/`narrow` flags. These flags record user policies and independently established narrow product/service purposes; they must not be set from category frequency alone. A complete catalog uses the format produced by Collect all five tabs. Browser-approved rules cannot be read by the command; add explicit policies to your local context if you want them included in its baseline.

Outputs are written only to a directory named `local-analysis`, which is ignored by Git. It contains START-HERE.md, an offline HTML merchant review, complete JSON/CSV merchant and ambiguity reports, a source-control and transaction audit, coverage, tag suggestions, the proposal pack, a conditional proposed session plan, an approved-policy draft, and a shorter next-session review list. Historical potential is not the live unreviewed backlog. Category changes and already-matching confirmations are reported separately. Incoming amounts stay separate from gross spending; refund candidates are not confirmed links. Tags are suggestions only; an accounting export without tag fields cannot establish existing tags.

The conditional proposed-session-plan format is deliberately unsupported by Apply or draft import until rules are approved and individual records are planned. Only the approved-policy draft uses the normal draft format, and every entry still requires live validation.

Synthetic browser checks: `/extension/proposal-fixture.html` tests evidence review, source mismatch, acceptance, rejection, and session round trips. Its **Seed fictional integration session** and **Open integration preview** controls use isolated local data and mocked Chrome bindings. They never access Wave. Do not load fixture files as your extension entry page.

## Completed accounting periods (0.8.2)

**Bookkeeping starts** defaults to January 1, 2025 because earlier periods are complete. The date is saved with the session. Earlier records remain in the imported history and proposal evidence, but cannot enter the working queue, draft, or live selection. Previously shortlisted older records are removed from the working draft. Imported older plans report their excluded entries as stale. Transfers crossing the cutoff require manual review and cannot bring a completed-period counterpart into the draft. Current-period reviewed status still requires live confirmation. This local scope does not change any Wave review flags.

Accepting a proposal keeps the viewport in place. **Loaded rule pack** shows the saved filename after acceptance or reload; the browser file picker is only for importing or replacing the pack. Its native selection may be empty after reload even while the saved pack remains loaded. Clearing the imported session explicitly removes the pack and filename along with its draft data.

Open proposal cards have a blue background and border. After acceptance, the next pending proposal in the current filter/search moves into view and opens automatically. Existing policies and rejected proposals are skipped during advancement. If the current proposal is last, review wraps to an earlier pending card. Automatic opening does not accept a rule.

## Transfer review (0.9.0)

Expand Transfer review to see each reciprocal unique pair once, with both dates, accounts, descriptions, and amounts lined up. Search by account, description, date, or amount; Show more pairs reveals remaining pairs. Check both sides in Wave opens two background records and reads their live fields without applying, reviewing, or linking anything. Changed or unreadable fields require inspection. Equal amounts and payment wording remain candidate evidence, not confirmed purpose. Ambiguous matches are listed separately, and same-account refunds or closed-period counterparts cannot enter the unique-pair list. Live checks are temporary and must be repeated after a fresh export or reload. Inspect money out/in opens the existing single-record live-check workflow for manual handling.

## Transfer menu diagnostics (0.9.1)

Expand **Transfer review**, open a candidate pair, then expand **Transfer setup · menu check and copy/paste**.

1. Click **Open money-out in Wave**. It opens in the background. Switch to that Wave tab and open **Category → Transfer to Bank, Credit Card, or Loan**.
2. Leave the matching-transaction submenu open and return to the solver. Click **Read transfer menu**.
3. Click **Copy transfer diagnostics** and paste the report into your support chat. The panel also fills a local paste box; **Check pasted diagnostics** validates the record, business, exact counterpart label, and any available ID/link.

The reader collects only the visible category menu. Matching options and create-transfer options are separated. A diagnostic match does not prove a saved transfer, reviewed status, or freshness of the exported pair. These controls do not select a category, link a transfer, create records, or save. The separate Set transfer action is documented below; diagnostic reading and copying remain read-only. Menu captures are temporary and clear when the export/business/working period changes or the page reloads.

Synthetic checks: `/extension/transfer-menu-fixture.html` exercises the real read-only reader against fictional DOM menus. The integration fixture tests Read, Copy, and pasted-report validation with mocked Wave tabs.

The 0.9.2 transfer reader locates the matching-section heading even when search markup differs. If the option selector is unfamiliar, copy the report anyway: bounded menu HTML is retained for inspection. Multiple visible matching menus remain blocked. A read failure or diagnostic match never changes Wave.

Version 0.9.3 recognizes Wave's radio-style menu entries and the `Transfer to` label prefix. Captured `checked` metadata describes only the open menu selection; saved transfer and reviewed status still require a fresh record check.

## Set and review an existing transfer (0.10.0)

In **Transfer review**, open a unique pair and inspect its accounts, descriptions, dates, and amount. Under **Transfer setup**, open the money-out transaction in Wave and leave **Category → Transfer to Bank, Credit Card, or Loan** open on its matching-transaction submenu. Return to the solver and click **Read transfer menu**. If one exact existing counterpart is recognized, **Set transfer and request review** becomes available.

Clicking that button authorizes this one pair. The solver checks both original records again, chooses only the existing matching entry, confirms the selected outgoing category, and requests review and Save. It never chooses **Select Account to Create Transfer**, processes ambiguous pairs, or changes completed periods. A second background record is used to check the incoming side; both records are reloaded after the action to verify their saved transfer categories. Reviewed status is reported separately on each side. If Wave reviews only one side, finish the other manually; the solver does not toggle an uncertain state.

An attempt is stored locally before editing. From the first match-selection click onward it stays locked, because selection itself may persist in some Wave layouts. **Recheck saved transfer** reloads and reads both records without repeating selection, Review, or Save. A missing record, altered field, unexpected selected value, or unknown reviewed state prevents a complete success claim. Use **Copy transfer result** to share diagnostics. If a preflight fails before any match click, cancel the Wave dialog and restore the menu before retrying. There is no automatic retry of uncertain saves. Version 0.11.0 adds the selected-pair batch workflow described below.

This workflow is validated against synthetic dialogs modeled on the captured Wave menu and a mocked integration session. The automatic workflow still needs a first live run; unexpected Wave behavior is withheld and reported. Read-only menu diagnostics alone never approve a transfer or establish saved state.

Version 0.10.1 keeps menu diagnostics when several closed copies of the money-out tab exist and reports the exact side/field on a failed preflight. **Copy transfer result** includes both original/live comparisons and reader snapshots even if nothing was applied. The selected category remains readable while the matching submenu is open. Genuine changes and unreadable fields still block editing.

Version 0.10.2 accepts Wave's full selected matching label when its account, date, and description identify the expected counterpart. **Reset unchanged transfer attempt** offers recovery from a stopped selection: both records are freshly reloaded and must match their original export fields and prior original snapshots, with explicit unreviewed evidence. It archives the old attempt locally and requires opening and reading the matching submenu again. A saved category, changed field, reviewed status, missing original proof, or already verified receipt keeps the lock. Reset does not click Wave edit controls or Save.

## Automatic transfer runs (0.11.0)

Reload the extension, expand **Transfer review**, select recognized pairs (or **Select matching pairs**), then click **Run selected transfers**. The selection count and total appear before running. The solver processes pairs sequentially in background tabs: it opens the category and transfer submenu, checks both original records and the unique existing match, links the pair, reloads both sides, and completes missing review steps only after both saved categories verify. Completed, reviewed pairs move into **Completed transfer pairs**, with saved diagnostics retained.

**Stop after current pair** finishes the current verification before stopping. Changed fields, ambiguous menus and uncertain saves stop the run. Each transfer and follow-up review attempt is persisted before clicking; unknown outcomes stay locked, including after reload. Use **Recheck saved transfer** to read saved state without repeating edits. An already verified transfer whose review was never attempted can be selected to finish reviews without selecting the transfer again. This supersedes the manual-review limitation above; manual setup and diagnostics remain available for troubleshooting.

No create-transfer entries, same-account refunds, ambiguous pairs, or completed-period records are automatically processed. Selecting pairs and clicking Run authorizes those edits; importing an export or reading diagnostics does not. Development validation uses synthetic DOM fixtures and mocked Wave tabs only.

Validation for 0.11.0: 75 Node checks and 29 synthetic editor checks passed. The mocked integration preview verified two sequential pairs with a missing incoming review, changed-amount preflight rejection, and stop-after-current behavior. The new browser automation still needs its first user-run test in Wave.

Version 0.11.1 checks both live records before opening the transfer menu. Pairs already linked to the expected accounts with unchanged identifying fields are recognized against older exports. Fully reviewed pairs are skipped without edits; linked pairs lacking review use only the review follow-up. Genuine differences retain both field comparisons and copyable snapshots, and stop the batch. Batch results count already completed pairs separately.

Version 0.11.2 isolates read-only field mismatches in Needs attention and continues the remaining selected pairs. These pairs are excluded from Select matching pairs until deliberately retried with Retry live preflight. Partial saved transfers require individual review; they are never relinked automatically. Uncertain edit or review outcomes still stop the batch and retain their locks.

## Known expense batches (0.12.0)

Expand **Known expenses · approved rules**. Filter by merchant, account, category or date, choose individual records or **Select matching expenses**, then click **Run selected expenses**. The selection count and total appear before running. Only outgoing, single-category purchases matched by approved rules in the working period are eligible. Transfers, incoming money, refunds, splits and conflicting rules are excluded.

Each record is freshly checked in a reused background tab. If its live category already matches the approved rule, the solver only reviews it; if it is also reviewed, it is skipped without edits. A matching live category can be recognized even when an older export shows another category. Category changes require all original fields to match the export and an exact known category. Previously reviewed purchases in another category require individual review.

Changed records move to Needs attention and are excluded from bulk selection; inspect them and use **Retry expense preflight** deliberately. Unknown edit/review outcomes stop the batch and retain persisted locks. **Recheck saved expense** only reloads and reads the saved result. A category save that leaves review unfinished gets a separate review follow-up, verified after reload. **Stop after current expense** finishes the current check before stopping. Completed receipts, rules and the imported export remain local across extension reloads. The batch selection authorizes these edits directly; no separate draft download is required.

Validation: 82 automated checks passed. The fictional integration preview completed five known expenses (four matching-category review-only actions and one category change with review follow-up), isolated a changed amount while completing the others, and stopped on a lost save response. No real Wave transactions were changed during development.

Version 0.12.1 checks for a usable reviewed-state control before expense edits. Review updates panels and missing/ambiguous controls go to Needs attention while the rest of the batch continues. Explicit reviewed checkboxes and accessible icon buttons are supported; unknown checkbox states remain withheld. Receipts whose editor outcome explicitly proves a no-click preflight failure are archived and moved from locked attempts to Needs attention on reload. Unknown responses, selection-stage failures and attempted saves keep their locks. Copy expense diagnostics includes bounded review-control markup for layouts requiring further support.


## Collect the live Not Reviewed list

Open **Live Not Reviewed list** and click **Collect Not Reviewed transactions**. The solver opens your selected business's transaction list in a background tab with the Not Reviewed filter, starts at the top, scrolls, and presses the exact Load More Transactions control until it disappears. It then temporarily selects all to read the selected count and clears the selection it created. Existing selections are preserved and skip this count check. Keep that tab open until collection finishes. **Stop collecting** retains partial results.

The results contain transaction IDs, dates, descriptions, accounts, categories, amounts, and explicitly readable review statuses. Choose **Uncategorized expenses and income** to focus the results. Filter membership is recorded separately from review status: a row without an explicit readable indicator stays **Unknown**. Exact Wave verified/unverified row markers are readable evidence; conflicting indicators remain Unknown. A disabled review control is recorded separately and does not imply reviewed status. Only Load More and the temporary Select All checkbox are clicked; no edit, delete, or reviewed-state controls are used.

Snapshots are saved locally by business and survive extension reloads. **Download collected list** saves a private JSON snapshot; **Copy list diagnostics** copies table and row markup for troubleshooting. Neither is uploaded. Treat these files and diagnostics as accounting data.

Completion is count-confirmed only when the identified rows match an explicit list total. Otherwise the collector reports that it reached a stable bottom; this does not independently prove that every transaction was captured. Load More waits for additional rows before another click; an unresponsive control stops the scan with partial results. Navigation changes, interruptions, unreadable rows, and scan limits are reported. The collector stops after roughly seven minutes, 450 scrolling steps, or 20,000 rows and retains partial results.

Rows are identified by a Wave transaction ID (including the encoded BulkCheckbox identity, validated against the selected business) or a unique exact date/description/account/amount match to your imported export. Ambiguous matches stay unresolved and cannot select bookkeeping actions. **Limit known-expense batches to identified rows from this collection** is enabled automatically after a count-confirmed scan and narrows the existing expense queue; uncheck it to return to the export-based queue. The collected results show counts for approved-rule expenses, individual review, missing export records, and completed years. Use **Open known-expense runner** to reveal the expense controls. Linking does not approve rules or bypass live validation. The existing January 1, 2025 working-period cutoff still applies. Collect again before another bookkeeping session because the saved list is a snapshot.

Synthetic list checks are available at the local preview's `/extension/list-fixture.html`. They cover lazy loading, Load More pagination, temporary selection cleanup, existing selection preservation, count mismatches, returning to the top, ambiguous identities, stop/navigation handling, and completion evidence without connecting to Wave.


### Check scanned merchants against saved rules

In **Live Not Reviewed list**, click **Check merchant rules** to reload the current saved approved rules and rebuild suggestions from the imported ledger. The summary shows how many rules were checked and how many scanned rows are known, excluded, or unmatched. Each row shows its matching merchant rule and exact category, or the reason it cannot enter the expense runner. **Merchant rule results** can show only matched known expenses. **Copy rule-check diagnostics** copies the rule scopes and per-row results locally for troubleshooting; treat this as accounting data.

Click **Open known-expense runner**, then **Select matching expenses**, inspect the selection, and **Run selected expenses** to apply the known items. Opening the runner refreshes saved rules and clears an old expense search filter. Rules needing judgment remain proposals until accepted. Transfers, incoming credits, refunds, conflicting rules, split postings, and changed merchant descriptions stay outside the automatic known result. The existing live validation and uncertain-save locks still apply.


### Prepare the known expenses in one step

Click the blue **Prepare N known expenses** button in **Live Not Reviewed list**. It reloads saved approved rules, enables linking to this scan, clears the Uncategorized-only display, and opens the expense runner with only the known matched records selected. Review that selection, then click **Run selected expenses**. Preparing does not edit Wave. Existing completed records, preflight attention items, and uncertain saved attempts cannot be selected automatically.


### Workspace layout checks

At `/extension/proposal-fixture.html`, seed the fictional integration session, open its integration preview, and seed approved fictional expense rules. Then open `/extension/workspace-fixture.html` and click **Run workspace checks**. It checks Usage/Debug navigation, preserved session text, diagnostic placement, unique IDs, checkbox styling, and both workspaces at 960px, 390px, and 320px. All records and Wave bindings are fictional.


## Merchant recognition and reliable-year evidence (0.15)

The matcher ignores capitalization, accents, punctuation, and ordinary bank wrappers. Explicit **store-number aliases** support known stems such as `EXAMPLE HARDWARE TOOLS3259`; it does not strip arbitrary numbers or match pieces of reference codes. Quoted payment memos are excluded from merchant identity. New card-payment/student-loan/returned-deposit guards keep those records out of expenses. The same matcher is used for proposal generation, live-list audit, expense batches, and refund identity.

History summaries give 2023–2024 weight 5, 2025 onward weight 2, and earlier years weight 1. At least three mostly consistent purchases in the reliable years can support a proposal despite learning-year alternatives; other established categories remain excluded. Uncategorized rows are missing evidence, not contradictions. Explicit small-sample service proposals disclose their evidence and still require approval. Provider identity does not establish business purpose.

Import the latest CSV before its regenerated proposal pack. In **Rule proposal review**, choose **Backlog proposals** to prioritize records from the supplied Not Reviewed snapshot. Cards show backlog transactions, category evidence by year, aliases, account/category exclusions, sources, and scope changes. Expand **Edit aliases or category before accepting** to edit aliases, store-number stems, or the exact category. Edits take effect only on acceptance. Changing category restricts matches to that category and uncategorized records.

Accepting an upgrade replaces only the exact unchanged rule identities named in the pack and retains their previous versions in Current rules. Changed rules and rules from other businesses remain. Accepted proposals disappear from the queue and the next one opens. Browser rules, the loaded pack, imported session and execution receipts retain their existing storage behavior.

For a new local analysis, supply private `approvedRules` (from the copied rule-check audit), `backlog` (the collected JSON), `workFrom`, and curated merchant definitions in the ignored context JSON. Use `minimumKnown` only for explicitly justified small samples. The analyzer independently reconciles ledger debit/credit totals, groups every text transaction ID, counts overlaps once, excludes incoming/payment/refund/split records, and writes only to ignored `local-analysis/`. It produces historical and working-period coverage, backlog partitions and prioritized decisions, plus a non-executable session proposal limited to the supplied backlog when present. Browser storage may have changed since the copied audit; approval remains explicit.


### Batch proposal approval (0.16.0)

Select proposals from their collapsed headers, then click **Accept selected rules**. Selection is instant and does not save or enable a rule. Selection survives search and confidence filters; the count includes checked proposals hidden by those filters. **Select visible proposals** selects the current view except rejected and existing approved patterns; **Clear selection** clears the entire shortlist. Headers also offer **Accept rule** without opening reasoning.

Batch approval validates the complete selection before saving, preserves edited aliases/categories and existing rules, and saves rules and session decisions once for the batch. Accepted proposals move to Current rules. Reasoning is built only when opened, the CSV hash is reused while the export is unchanged, and coverage is reused while rules and the working period are unchanged. A changed pack, business or CSV clears pending selection. No Wave transactions are changed by approving rules.


### Confirm Wave suggestions (0.17.0)

Reload the extension, then **Collect Not Reviewed transactions** again so the scan captures suggestion controls. In Usage → Work through transactions, expand **Confirm Wave’s suggestions**, select matching rows, and click **Confirm selected suggestions**. The known-expense runner also routes eligible suggested categories through this confirmation flow.

Only exact Wave transaction identities, unchanged date/description/account/amount, outgoing single-category purchases and one approved target category qualify. The suggested category must already equal that target. Transfers, refunds, conflicting rules, disabled suggestion controls and mismatched categories are excluded. Purple dots and a Not Reviewed filter never prove reviewed status. The reader requires an explicit control label such as “Confirm the auto-updated category”; unrecognized controls remain untouched and can be inspected through Debug tools → Wave suggestion confirmation diagnostics.

Before a thumbs-up click, the runner reloads the saved transaction and checks its fields and approved category. It persists an attempt receipt, clicks only the exact confirmation control in that list row, then uses the existing expense workflow to mark reviewed without changing category and reloads to verify both. Stops and uncertain responses retain their receipts and cannot repeat the thumbs-up automatically. **Recheck saved suggestion** verifies the result; when a returned thumbs-up response was confirmed and no review action was attempted, it can finish reviewed status safely. Otherwise inspect Wave manually. Collection itself never clicks the thumbs-up or edits accounting.


Suggestion control compatibility (0.17.1): scanning and confirmation recognize Wave’s observed exact `ConfirmAutocatIcon` aria-label, as well as the explicit confirmation tooltip wording. The approve SVG alone is insufficient. After upgrading, collect the Not Reviewed list again to replace older scans that could not detect this control.


Suggestion readiness (0.17.2): **Refresh Wave suggestions** in the confirmation section recollects the live Not Reviewed list and reloads saved merchant rules. Older scans show an explicit refresh notice. The section reports scanned rows, detected suggestion controls, ready rows and exclusion reasons. Expand **Why suggestions are not ready** to compare Wave’s category with the approved target. Copied diagnostics include this audit; an empty list no longer hides rule exclusions or old scans.


Known expense readiness (0.17.3): when no known expenses remain, the runner displays the live backlog breakdown rather than an unexplained zero. It separates purchases needing approval, incoming movements, payments/loans/refunds, transfer or posting checks, missing CSV records and rule exclusions. Expand **Why remaining transactions are not known expenses** for row-level reasons, or use **Review remaining merchant decisions** to open proposal review. These explanations do not approve rules or confirm Wave suggestions.

### History review checks (0.18.0)

`node --test` covers bank-reference boundaries, personal categories, 2023–2024 weighting, account scopes, conflicting batch choices, payments/refunds and atomic preparation. `/extension/history-fixture.html` uses fictional data to check multiple approvals produce one save, failures preserve the selection, accepted rows disappear, and reload restores current rules. The integration preview exercises the same history module in the full app.

## Guided bookkeeping (0.19.0)

Usage shows one stage at a time in this order: **Set up → Collect → Review rules → Run approved work → Review the rest**. Use the step bar to revisit any stage, or use Previous/Continue to work in sequence. Your current stage is saved with your CSV, rules, proposal pack and draft. Existing sessions choose their first missing setup/scan step. Stage navigation never collects, accepts rules, selects transactions or runs edits automatically.

Setup keeps saved business/export/category panels collapsed; bookkeeping dates and clearing the session live under **Session options**. Collection opens its main action and requires a completed count-confirmed scan for the guided Continue button. You can still visit Rules directly to work on history without a live scan. Scan filters, downloads, matching shortcuts and collection scope live under **More scan options**; detailed rows expand under **Collected transactions**.

Rule approvals stay explicit. Current rules retain their own panel; **Add or edit a custom rule** is optional and opens automatically from Prepare individually. Run work opens transfers first, or expenses when no pending transfer candidates remain. Inspect reveals the individual-check stage, while Prepare known expenses reveals the expense runner. Partial scans, candidate counts and saved rules are not treated as verified bookkeeping. Collect again after runs to check what remains.

Debug tools stay separate and preserve the current Usage stage when you return. The fictional workspace fixture checks stage navigation, deep links and desktop/mobile overflow without touching Wave.

Each stage uses one expanded working panel at a time. Saved panel choices restore with the saved stage, and choosing a business opens the CSV importer when that is the next missing setup requirement. Existing captures offer **Refresh Not Reviewed transactions** so it is clear that you are checking Wave again.

The persistent activity bar shows Loading/Working while the solver restores, analyzes, collects, checks or saves. Known batch totals show actual processed counts; work without a total uses a moving bar. Ready means the interface is available, not that bookkeeping is complete. Existing Stop controls end a run after its current record.

Version 0.20 organizes bookkeeping as Import → Collect & inspect → Approve rules → Run approved work → Resolve & rescan. Remaining work defaults to the latest live Not Reviewed IDs; historical CSV candidates are an explicitly labeled advanced view. Runners require a count-confirmed live collection. The bulk inspector compares every collected list row, with an optional sequential read-only dialog pass for current-period records present in the CSV. It never clicks Save, Apply, Reviewed or transfer/category controls. Results remain local, bound to business, CSV hash, collection timestamp and working period. Stop finishes the current read; rerunning resumes and retries unreadable records. A match is evidence, not rule approval or permission to edit. Optional draft exports are under Advanced tools and do not run a batch.

Version 0.21 adds an optional unfiltered Collect all transactions panel in step 2. Full history is saved separately under solverAllLists, including explicit Reviewed/Not reviewed/Unknown status, IDs, account/category names and count evidence. The collector presses Load More Transactions until the end, checks Select All, retains partial results and refuses known active filters/searches. It is bounded to 100,000 rows/30 minutes and reports a partial collection if it hits a limit. The inspector source selector compares either collection; completed years are excluded unless you explicitly enable read-only inspection of them. Full-history collections never populate bookkeeping runners or the remaining-work queue. Inspection results are stored separately per business, source and inspection period.

Version 0.22 collects full history by calendar year. It selects Sort → Oldest to newest on the unfiltered list to discover the starting year, visits exact startDate/endDate URLs through the current year, and confirms each year independently. Resume unfinished years skips saved count-confirmed years; Collect all transactions again starts a fresh sweep. Empty years are retained, interrupted years are rescanned from their start, and combined coverage is confirmed only when every year is complete. Duplicate IDs across years or out-of-range rows prevent confirmation.

Version 0.22.1 recognizes Wave’s exact verify-icon--true reviewed marker and retains marker classes as evidence in new collections. Older collections with Unknown statuses require a fresh collection; sampled diagnostics cannot safely reconstruct statuses for every record.

## Amazon purchase solver

Version 0.23.0 adds an Amazon item-report review panel under Step 3. Load your normal accounting.csv and exact Chart of Accounts names first, then upload Amazon order/item CSV reports. Reports and decisions persist locally per Wave business in IndexedDB, independently of the accounting export and merchant rules. Only required order, item and payment fields are retained; contact and delivery columns are excluded. No report is sent to a server.

Review the product title, purpose suggestion and exact category. Check several items and choose **Approve checked items** to save once. Suggestions require confirmation of actual use; they are not a determination of deductibility. Computers, household goods and other mixed-use products remain for judgment. Completed years can be shown for reference and cannot generate current-period actions.

Open **Match Amazon payment instruments to Wave accounts** if a card cannot be identified by a unique four-digit ending. Matching requires an outgoing Amazon charge, exact cents, the same account and a payment date within five days. It excludes refunds, transfers, split postings and rewards-only payments. Multiple candidates and shared references remain unresolved. Confirm a candidate payment link yourself. A saved link is invalidated when the accounting snapshot changes.

A reconciled order with all items explicitly approved for one purpose and one category can offer **Prepare matched transaction**. This opens the existing individual live-check workflow: open Wave, inspect the live fields, prepare the change and use Apply when ready. Approval and payment-link confirmation alone do not change Wave. No whole-merchant Amazon rule is created. Mixed categories show approved item totals for a manual split in Wave. Cancelled orders, missing or inconsistent totals and shared payment references cannot generate purchase actions.

Download the local Amazon review or approved draft plan to retain a review package. Identical report uploads and overlapping parsed rows are deduplicated; item and payment totals must reconcile before an action can be prepared. Indistinguishable identical item lines are held when their totals do not reconcile.

Synthetic browser checks: open /extension/amazon-fixture.html on the local development server and select **Run synthetic interface checks**. This verifies bulk approval, payment-link confirmation, mixed-category splits, persistence and duplicate imports without connecting to Wave.

## Grouped remaining transactions

Version 0.24.0 makes **Grouped review** the default view under Step 5 → Remaining transactions. It uses the latest live backlog and existing search/date/action filters. Small groups come first; switch to largest groups or sort by name when useful. Venmo, PayPal, Zelle, Cash App, Square and Amazon have service groups with purpose-check reminders. Other entries group by approved merchant aliases or normalized descriptive words. Original descriptions, IDs, accounts, categories and separate incoming/outgoing totals remain visible; grouping never creates a categorization rule.

Open a group and choose **Set aside for later** to park it while you obtain receipts or app activity. The choice persists locally per business across reloads, fresh exports and scans. Choose **Set aside for later** in the group-scope dropdown to revisit it, then **Bring back to work** to restore it. Deferred transactions remain unreviewed in Wave and remain available to existing runners; this feature organizes only the grouped review view.

Choose **Inspect next**, then use **Inspect next in group** or **Back to this group** in the individual check. Inspecting or navigating does not mark a record completed. Rescan after reviewing in Wave. Repeated merchants without an approved alias group can offer **Prepare merchant rule**, which opens the existing rule editor for your category choice and explicit approval. Broad payment-service groups do not offer a merchant rule. Amazon groups link to the item-report solver. The original flat transaction list is available in the view dropdown.

## Venmo statement downloader

Version 0.25.2 includes **Open Venmo statement downloader** beside the export shortcut in Step 1. Its separate tab leaves the Wave workspace and accounting session intact. The downloader defaults to all calendar months from 2019 through the current month, including personal and business profiles.

1. Select **Connect Venmo** to grant optional Venmo host access and request-observation permission. No cookie, credential or request-body inspection is used.
2. Select **Choose data\venmo folder** and choose the project's existing data/venmo directory. Chrome requires this one-time folder selection; the browser cannot silently select an absolute Windows path. The folder handle is saved locally in IndexedDB, and Chrome may require access to be renewed after a restart.
3. **Open Venmo** goes directly to the current month’s All profiles Statements page. In signed-in Venmo Statements, choose **All profiles** and a month. Confirm the first transaction Download CSV is personal and the second is business, then choose **Capture both · All profiles**. The Sales tax collected download is excluded. All profiles stays selected throughout collection; both observed source URLs must differ. Alternatively, choose the personal profile and a month with a CSV available. Return to the downloader, choose its tab, confirm which profile is selected and choose **Capture Personal source**. Capture uses the visible Download CSV control and observes only the matching statement GET request from that tab; an unambiguous visible statement link can also supply the source. Repeat with the business profile.
4. Choose **Download both profiles / Resume**. An observed monthly request provides the URL format and existing profile parameters. Each response is checked for a Venmo CSV header and matching transaction dates before it is saved. Exact visible profile-switch controls may switch views automatically; otherwise the run pauses and asks you to switch to the captured profile and resume.

Files are written directly to personal/YYYY and business/YYYY beneath the chosen folder, with a private venmo-manifest.local.json checkpoint. Completed files are skipped only after their SHA-256 hashes are verified; changed statements get another filename rather than overwriting the original. Missing files are requested again, and current-month partial files are refreshed on a subsequent run. Empty valid CSV statements are retained. HTTP 204/404/410 availability results are recorded separately and retried on a later day; login failures, rate limits, unrecognized requests, redirects and profile changes stop the run. Stop preserves already saved checkpoints.

The initial native sample download triggered during Capture may remain in Chrome's Downloads folder. Bulk statement copies go directly into the project folder, so no permanent download-folder setting or native helper is needed. All data/ files, manifests, profile-source URLs, and local destination configuration stay out of Git.

This adapter still requires a live check on your signed-in Venmo page. If its CSV control/request differs, use **Read statement controls → Copy diagnostics**; it stops rather than guessing another API. Synthetic tests cannot establish which months Venmo actually retains for either profile.
