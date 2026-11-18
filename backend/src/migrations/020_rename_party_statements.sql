-- Migration 020: the Ledgers page is now Party Statements, and Debtors is
-- Bills Receivable (2026-11-18). The page's own tables and permission keys
-- take the new name. Tally's ledgers (tally_ledgers, tally_ledger_balances,
-- party ledgers) keep theirs.
--
--   ledger_settings      -> statement_settings
--   ledger_marketplaces  -> statement_marketplaces
--   ledger_openings      -> statement_openings
--   ledger_files         -> voucher_files (every file sits on a Tally voucher,
--                           shown on Party Statements and Bills Receivable.
--                           entry_id and its check go with the typed notes)
--   ledger_entries       -> dropped (typed DN/CN were removed on 2026-11-17)
--   ledgers.view / .files / .settings -> statements.view / .files / .settings
--   ledgers.entry        -> dropped
--
-- It refuses (and nothing changes) if a typed note or a file on one exists:
-- the guard table's CHECK fails, or voucher_files' NOT NULL voucher_guid does.
-- The code that reads these names ships with it: run it together with the
-- deploy (see docs/go-live.md).

CREATE TABLE _guard_020 (typed_notes INTEGER CHECK (typed_notes = 0));
INSERT INTO _guard_020 (typed_notes) SELECT COUNT(*) FROM ledger_entries;
DROP TABLE _guard_020;

ALTER TABLE ledger_settings RENAME TO statement_settings;
ALTER TABLE ledger_marketplaces RENAME TO statement_marketplaces;
ALTER TABLE ledger_openings RENAME TO statement_openings;

CREATE TABLE IF NOT EXISTS voucher_files (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  blob_id       INTEGER NOT NULL REFERENCES file_blobs(id),
  company_id    INTEGER NOT NULL REFERENCES tally_companies(id),
  voucher_guid  TEXT    NOT NULL,
  file_name     TEXT    NOT NULL,
  kind          TEXT    NOT NULL CHECK (kind IN ('pdf','image','email')),
  original_size INTEGER,
  uploaded_by   INTEGER REFERENCES users(id),
  uploaded_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO voucher_files (id, blob_id, company_id, voucher_guid, file_name, kind, original_size, uploaded_by, uploaded_at)
  SELECT id, blob_id, company_id, voucher_guid, file_name, kind, original_size, uploaded_by, uploaded_at FROM ledger_files ORDER BY id;
DROP TABLE ledger_files;
CREATE INDEX IF NOT EXISTS idx_voucher_files_voucher ON voucher_files(company_id, voucher_guid);
CREATE INDEX IF NOT EXISTS idx_voucher_files_blob ON voucher_files(blob_id);

DROP TABLE ledger_entries;

UPDATE role_permissions SET permission = 'statements.view' WHERE permission = 'ledgers.view';
UPDATE role_permissions SET permission = 'statements.files' WHERE permission = 'ledgers.files';
UPDATE role_permissions SET permission = 'statements.settings' WHERE permission = 'ledgers.settings';
DELETE FROM role_permissions WHERE permission = 'ledgers.entry';

-- The audit log keeps every entry. Only the names it files them under change.
UPDATE audit_logs SET action_type = 'STATEMENT_SETTINGS_UPDATE', entity_type = 'statement_settings' WHERE action_type = 'LEDGER_SETTINGS_UPDATE';
UPDATE audit_logs SET entity_type = 'statement_settings' WHERE entity_type = 'ledger_settings';
