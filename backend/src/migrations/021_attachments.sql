-- Migration 021: Tally Reports -> Attachments (2026-11-25).
--
-- tally_vouchers gains the e-invoice Tally keeps on a voucher, read by
-- Connector 0.8.0 and later:
--   einvoice_read   1 once a Connector that reads e-invoices wrote this copy
--                   of the voucher. 0 means not read yet (an older Connector),
--                   so the page says so instead of showing no e-invoice
--   irn             the 64-character Invoice Reference Number
--   irn_ack_no      the acknowledgement number (15 digits today)
--   irn_ack_date    the acknowledgement date, YYYY-MM-DD
--   irn_cancelled   1 when the e-invoice was cancelled on the portal
-- tally_ledgers gains the City and PIN code of the ledger's latest address
-- (Connector 0.8.0 and later). An older Connector never blanks them.
--
-- attachments.view lets a person see the page, given to Accountants and
-- Viewers here. Adding and removing files stays statements.files.
--
-- It only adds, so code that doesn't know these columns keeps working: run it
-- before the deploy that reads them.
--
-- No semicolons may appear in these comments -- migrate.js splits on them.

ALTER TABLE tally_vouchers ADD COLUMN einvoice_read INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tally_vouchers ADD COLUMN irn TEXT;
ALTER TABLE tally_vouchers ADD COLUMN irn_ack_no TEXT;
ALTER TABLE tally_vouchers ADD COLUMN irn_ack_date TEXT;
ALTER TABLE tally_vouchers ADD COLUMN irn_cancelled INTEGER NOT NULL DEFAULT 0;

ALTER TABLE tally_ledgers ADD COLUMN city TEXT;
ALTER TABLE tally_ledgers ADD COLUMN pincode TEXT;

CREATE INDEX IF NOT EXISTS idx_tally_vouchers_type_date ON tally_vouchers(company_id, base_type, date);

INSERT OR IGNORE INTO role_permissions (role, permission) VALUES
  ('Accountant', 'attachments.view'),
  ('Viewer', 'attachments.view')
