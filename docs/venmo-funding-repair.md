# Venmo repair operation — 0.99.31

Historical documentation: the owner subsequently finished the remaining repairs manually and reported reconciliation. Do not replay the original prepared batch. These instructions describe the prototype's behavior, not a current outstanding repair request. See [the learning archive](learning-archive.md).

The live adapter uses exact bank-record edits rather than whole-ledger scans. A prepared package is still validated against the archived export, source identities and reconciled Venmo statements before running.

## Run the remaining batch

Reload the unpacked Wave Solver extension in Chrome, close old Solver tabs, and reopen Solver. The header and loaded engines must say 0.99.31. Choose Venmo balance, then Do fixes. Existing approvals and saved checkpoints are retained; do not rebuild the package or clear browser storage.

Each unfinished funding action opens its exact bank withdrawal, checks USD, identity, date, amount, account and unchanged purchase, selects Transfer to Bank, Credit Card, or Loan → the approved Venmo account, and saves. Cash-outs use Transfer from on the exact bank deposit. No descriptions, amounts, dates or reviewed controls are changed. Category branches may open on hover, and a matching-section heading is not required for a validated create-only menu. Existing matching options are not blindly replaced.

Wave may open inside the selected personal/refund category group. The fixer waits for the popup and clicks its exact More options back control before finding Transfer; scrolling the subgroup alone cannot reveal it. It also waits for the back navigation to render and clears an existing category search before going back. A stalled back control is clicked once and reported as a navigation failure rather than searched inside the wrong group. Disabled or multiple back controls are rejected. Newly created deposit fields must finish loading, and refund options can include the exact Refund for prefix.

## Verification and resume

Every potentially persistent selection has a durable checkpoint first. Each verified transfer is immediately copied to both financial stores. Completed actions are skipped on resume. An already-categorized manual transfer is adopted only after its reciprocal wallet record verifies. A prior unknown Save is checked read-only first. Do fixes permits one guarded category retry only when the exact original bank fields/reviewed state remain unchanged and a count-confirmed lookup of its posting day proves no opposite wallet entry. The earlier attempt is retained. Recheck never writes, and a spent retry cannot loop. Unresolved records are reported while independent payments continue.

Legacy recovery also adopts each verified result immediately. It does not reopen an already-verified purchase for the identical proposal. A different retained-copy proposal needs one independent read; failure holds that adoption locally. Venmo reads now use one DOM observer to wait for the exact form, avoiding repeated background snapshot polling. Saved-record navigation has an elapsed-time deadline. The latest diagnostics take precedence over stale submenu failures.

The exact Category counterpart link is used when Wave exposes it. Otherwise only the bank posting date is collected, requiring exact IDs and an independently confirmed row count. Counterpart direction, account, amount, reciprocal categories and retained purchase are read from their dialogs. Counterparts belonging to other verified repairs cannot be reused. An ambiguous relationship remains unresolved rather than being assigned by guesswork.

The newest immutable export for this business also supplies counterpart addresses. Those addresses are hints: both live transfer forms and the retained purchase must still verify. They avoid repeated date lookups for completed pairs without resetting the original plan. Wave's full generated description, `Created Transfer: <bank description>`, is accepted exactly. A same-amount real incoming payment is never adopted as generated funding. An incorrectly linked bank payment must retain its separate legitimate incoming receipt; an unresolved live relationship stays held with its exact record link while independent work continues.

Fee/deletion absence checks use that record's date. Missing-deposit duplicate checks cover plus/minus three days and distinguish incoming deposits from purchases. An already-existing exact approved deposit is adopted without another Save. An uncertain deletion or deposit still needs recovery before further writes. Protected fee records and conflicting evidence remain review work; this feature does not invent a balancing adjustment.

A split with multiple named Amount controls is passed to the independent split inspector. Its explicit USD, each allocation and the exact live-list total must agree before deletion; multiple amount controls alone never authorize a financial click. Read-only verified transfers count toward the prepared batch, and remaining versus held counts are displayed separately.

For splits arranged in separate category/amount columns, the inspector can recover allocations without assuming ordering only when all selected categories are identical and their count exactly equals the named Amount controls. Mixed or missing categories remain unsupported without explicit row pairing. Failed reads retain the category/amount counts, and unresolved bank transfers retain their current label and exact exposed counterpart links for inspection.

The focused lookup cannot expand beyond one week, rejects rows outside its URL bounds, and times out after one minute. It is explicitly a date-range report, never a claim of complete yearly history. Legacy test adapters lacking the direct hooks retain the earlier yearly-collection implementation; the installed Wave adapter supplies the direct hooks.

The projected balance is based on the saved package. After completion, compare a fresh Wave export and Venmo statement at the same cutoff date.

The October 12 export collected at 4:35 PM PDT supports 101 completed ledger effects and leaves $100 funding, $1,000 Chase funding, a $1,250 rent receipt and a $19.77 standalone fee. The existing Chase relationship remains a separate inspection item. Deposit options are scoped to their field's contained or ARIA-linked popup; split currency labels do not count as expense allocations. A recovery that stopped before any financial click in menu navigation may resume only after all original-field and no-opposite-entry checks pass again; prior attempts are retained.

## Validation

Run npm test, npm run test:list, npm run test:venmo-funding, npm run test:venmo-repairs, npm run test:venmo-direct and npm run test:venmo-read. Tests use fictional data and isolated browser contexts. The earlier direct batch regression also resumes 105 prepared actions from 11 completed, verifies the remaining 94 and resumes again with no repeated writes or complete-history scans. Read tests cover delayed DOM mounting, rejecting a different fully loaded record, serialized read-only injection and throttled navigation.

The latest regression also covers the real action mix: 89 funding repairs, two cash-outs, nine duplicates, two fees, one opening and two deposits. It resumes 63 completed actions and writes only the remaining 42. Browser validation starts with 11 stored checkpoints and 52 completed pairs found through export addresses, adopting those pairs read-only before 42 editor selections/Saves. Both use full generated labels and validate a second run makes no writes.

Live batch completion remains unverified. Computer use could not reliably determine Chrome's current URL, so live inspection and extension reload were stopped. The code/test results are not evidence that the real account already finished.

Wave documents automatic counterpart creation and the Created Transfer description in [its transfer instructions](https://support.waveapps.com/hc/en-us/articles/208621616-How-to-record-a-transfer-between-two-accounts-e-g-categorize-a-credit-card-payment).
