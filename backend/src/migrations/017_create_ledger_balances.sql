-- Tally's closing balance of every ledger, as the Connector reads it at the
-- end of each sync run. The Ledgers page works a party's starting balance out
-- from it (src/ledgers/ledger.js) instead of the placeholder.
--
-- tally_ledger_balances  one row per ledger of a company, replaced whole by
--                        each run that sends a list
--   as_of          the date the balance is at -- the end of the sync window
--   closing_paise  Tally's way round, like its vouchers' lines (negative is a
--                  debit). For an income or expense ledger Tally gives the
--                  period's total, not a running balance. Party ledgers are
--                  balance-sheet ledgers, so the Ledgers page is unaffected
--   run_id         the run that sent it. Only the company's latest run that
--                  ended ok counts, so the balance covers exactly the vouchers
--                  RAMS holds
--
-- No semicolons may appear in these comments -- migrate.js splits on them.

CREATE TABLE IF NOT EXISTS tally_ledger_balances (
  company_id    INTEGER NOT NULL REFERENCES tally_companies(id),
  ledger_guid   TEXT    NOT NULL,
  as_of         TEXT    NOT NULL,
  closing_paise INTEGER NOT NULL,
  run_id        INTEGER NOT NULL REFERENCES tally_sync_runs(id),
  pulled_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (company_id, ledger_guid)
)
