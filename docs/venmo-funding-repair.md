# Venmo funding repair acceptance

This feature repairs supported missing transfer counterparts, rather than inserting a balancing adjustment. It uses bank movements mentioning Venmo, within the selected Wave business, with USD statement evidence identifying the exact bank ending and the exact Venmo profile/account.

## Prepared reconciliation (0.99.19)

The top of **Venmo balance** loads `data/venmo/venmo-repair-plan.local.json` from the already connected project data folder. The package contains exact ledger snapshots, source identities, monthly balance proofs, retained-copy choices, deposit categories and signed balance effects. Private packages are excluded from version control; there is no customer-specific financial data in the shipped source code.

**Do fixes** approves the displayed package as one batch. It reloads its source CSVs and archived Wave export, validates that monthly opening/activity/closing balances reconcile, then checks complete live history and exact dialog fields before mutations. It supports an opening amount derived from the opening month and pre-opening activity, missing receipts, explicitly prepared personal funding from an account absent from the Wave ledger, duplicate removal, and unsupported standalone fee removal. Fee-bearing cash-out splits and uncertain account mappings outside the prepared package remain separate review work; the tool does not invent a balancing entry.

Deletion compares the original fields and an intact retained copy. Receipts, notes, customer/vendor information, reconciliation protection, and unreadable or different split allocations hold the record. The selected retained copy's existing category is preserved. A fee split must reproduce every exported allocation, not just the aggregate amount. An ambiguous total may use an independently count-confirmed live-list total only when all live split allocations sum to the exact same amount.

Each mutation is durably checkpointed before a potentially persistent click. Exact new deposits are checked against complete live history before creation, then verified by a new ID, date, amount, description, account, type and category after save. A lost response keeps the write locked. **Recheck saved fixes** only reads outcomes; it never repeats a deletion, Save or creation. Transfers use the existing shared receipt store, including older verified or uncertain attempts. Older attempts are recovered before a duplicate copy they reference can be removed.

Opening recovery reads its exact dialog before any history collection. The approved target verifies immediately; an unexpected amount, changed field or reviewed state stops with a specific comparison. If the original amount and all checked fields are unchanged, **Do fixes** may make one additional idempotent amount assignment. Its earlier attempt remains in the checkpoint, and a failed retry cannot loop across reloads. This exception applies only to the exact opening amount, never to deletion or deposit/transfer creation. Save waits for the form to close before another navigation; validation failures preserve the attempted-save lock.

For the opening correction, Wave may show **If you change the amount, your books will be out-of-sync** and the matched-transaction confirmation text. The extension recognizes that exact warning, checks the same owned record and pending form fields again, clicks **Save changes** once and waits for both forms to close. It never chooses **Save and go to reconciliation**. Unknown, ambiguous or changed dialogs remain locked. A checkpoint from 0.99.18 that specifically timed out waiting for the form to close can receive one additional guarded recovery through **Do fixes**, even if that timeout spent the original retry. The earlier audit remains stored; recheck never clicks either Save button. If Save changes was completed manually, the target amount simply verifies.

Collections are count-confirmed for the affected calendar years, including cross-year date margins. Within a run, clean years are reused and only years affected by a mutation are collected again for verification. Deletions share a batch absence check. Transfer batches finish and checkpoint one year before starting the next; an interrupted later year does not repeat completed years. Verified custom actions are skipped on resume. Stop also interrupts an active history check without making a financial click. Unchanged scan polls are throttled in diagnostic logs so the original blocker remains visible.

Equal-date/equal-amount transfer groups verify by unchanged bank/purchase snapshots, complete new counterpart counts, and reciprocal categories. No individual association is asserted when the labels are indistinguishable. A verified counterpart already assigned to another bank movement is excluded only after its prior live proof is re-established. Both Venmo interfaces share a renewed, transactionally acquired lease to prevent concurrent runs in different solver windows.

The displayed balance remains a projection until a fresh Wave export confirms it. A changed record, unavailable UI control, incomplete collection or uncertain saved result can hold or stop part of a package. **Stop after current fix** does not cancel a potentially persistent click midway.

Run `npm test`, `npm run test:venmo-funding`, and `npm run test:venmo-repairs`. Tests use fictional records and an isolated browser; development does not modify real Wave data. Wave documents [deposit creation](https://support.waveapps.com/hc/en-us/articles/208621566-Create-an-income-transaction), [starting balances](https://support.waveapps.com/hc/en-us/articles/208622796-Starting-balances-What-they-are-and-how-to-enter-them-in-Wave), and [transaction deletion](https://support.waveapps.com/hc/en-us/articles/25233656494356-Delete-a-transaction).

## Operation

1. Refresh the data folder containing Wave `accounting.csv` and Venmo statements. Use **Venmo balance** to inspect the account history dates and candidates. Enter the actual app balance and its date if comparing balances.
2. Inspect the bank and Venmo payment links and current categories. Select matching candidates or individual repairs. An existing same-amount wallet entry must be investigated, rather than duplicated.
3. Optionally run **Check selected in Wave**. This only collects ALL history, reads records and opens the transfer menu.
4. Tick the explicit local approval checkbox and choose **Create selected transfers & verify**. It checks original fields, amount, currency, direction, identity and single-category structure. It refuses unresolved bookkeeping saves involving these records.
5. For bank-funded purchases, keep the wallet payment/category and create the missing wallet deposit through a bank transfer. For fee-free cash-outs with an exact bank receipt, create the missing wallet withdrawal through a transfer from Venmo. Both effects are shown before approval.
6. Check the verified result, then refresh the accounting export. The saved balance remains an export value; verified effects are shown separately until the new export includes them. Compare balances at the same date.

## Guarantees and limits

- Source and ledger copies are deduplicated by identity. Conflicts do not authorize repairs. A merchant/amount alone is not proof; funding/destination account details, date window, profile and purchase evidence are required.
- Live ALL collection covers the bank date plus/minus 20 days, including neighboring calendar years. It must be count-confirmed and expose exact transaction IDs. Any same-amount wallet entry besides the proved purchase blocks creation conservatively; direction is read from the exact dialog when verifying the new entry.
- The DOM action requires one matching section and one create section, an exact enabled destination account, and no existing matching option for that wallet. It does not change descriptions, dates, amounts or accounts, or press a reviewed-state control.
- A durable creation checkpoint is saved before clicking a create option, because that click may persist before Save. A disconnected or incomplete response leaves the attempt locked. Recheck reads records and ALL history, then verifies exactly one new `Created Transfer` record with the bank date, exact amount, correct direction/account and reciprocal transfer categories. It does not authorize a second creation.
- A cash-out before the Venmo account's recorded opening history may already be incorporated in its opening balance. Such movements are held. Fees, missing wallet purchases and existing counterparts require separate review. This release does not automatically split fees or link an uncertain existing counterpart.
- An export can be incomplete or stale. The actual app balance is supplied locally by the user; the tool does not log in to Venmo or claim to have fetched its live balance. A remaining difference is shown, never fabricated into an expense/income/transfer.

## Validation

Run `npm test` and `npm run test:venmo-funding`. Browser testing uses fictional records in a fresh isolated Chrome context. It covers both creation directions, preservation of reviewed controls, existing/disabled/duplicate options, currency, approval, read-only checks, persistence, verified locks, business isolation, unreadable checkpoints, unrelated approved-state preservation and desktop/mobile layout. No live Wave transactions are used as fixtures.

Wave documents the automatic missing counterpart, `Created Transfer` description and bank-date behavior in [its transfer instructions](https://support.waveapps.com/hc/en-us/articles/208621616-How-to-record-a-transfer-between-two-accounts-e-g-categorize-a-credit-card-payment).
