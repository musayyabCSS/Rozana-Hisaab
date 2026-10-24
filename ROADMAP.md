# Rozana Hisaab Roadmap

Rozana Hisaab is growing from a daily expense tracker into a budgeting app for Pakistan.

## Phase 1: in progress

### Bill connections
- **Consumer numbers.** Save the consumer, reference or account number read from scanned bills (LESCO, SNGPL, PTCL and so on).
- **Saved connections ("My Bills").** Recognise a bill's number on later scans and link it to a saved connection with a nickname, such as "Home – LESCO".
- **Expected-bill reminders.** Bills are issued around the same day each month. Use each connection's last issue date to remind the user when the next bill should arrive.

## Phase 2: planned

### Bill connections
- **Per-connection history.** Month-by-month amounts and units consumed, with charts and averages, and duplicate detection for the same connection and billing month.
- **Automatic bill fetching.** Look up new bills from providers' public bill pages by reference number. First check each provider's terms and whether they offer an official API.

### Data and sync
- **Complete cloud sync.** Back up everything to the cloud, including receipt photos and voice notes that currently stay on the device. Likely a paid tier.

### Money
- **Multiple currencies.** Record transactions in other currencies, converted automatically to PKR at the rate on the transaction date (open-market and State Bank of Pakistan rates).
- **Receivables and payables ledger.** A separate ledger per person or party for money owed to and by the user, with partial payments and running balances, instead of only marking items paid or received.
- **Budgeting.** Monthly budgets per category, building on the ledger and categories.

### Languages
- **Regional languages.** Add Punjabi, Saraiki, Pashto, Sindhi, Balochi and others one at a time, depending on how available and accurate voice and text parsing is for each.
