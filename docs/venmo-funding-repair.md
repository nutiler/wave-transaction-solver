# Venmo funding repair acceptance

This feature repairs supported missing transfer counterparts, rather than inserting a balancing adjustment. Its scope is Wells Fargo movements mentioning Venmo, within the selected Wave business, with USD statement evidence identifying the exact bank ending and the exact Venmo profile/account.

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
