-- Files on Ledgers rows: PDFs, photos and emails attached to a debit or credit
-- note typed in RAMS, or to a Tally voucher (an invoice, credit note, receipt,
-- TDS or journal). Debtors shows an invoice's files too.
--
-- file_blobs     each distinct file once, keyed by the SHA-256 of the bytes a
--                download gives back, so the same file on two rows is stored
--                once. size is those bytes, stored_size what is kept. encoding
--                gzip means the chunks are the gzip of the file (PDFs and
--                emails often shrink), none means they are the file itself.
-- file_chunks    the stored bytes in pieces of 512 KB, so no single request to
--                the database carries a whole file.
-- ledger_files   a file on a row: either a typed note (entry_id) or a Tally
--                voucher of the company (voucher_guid), never both. Removing
--                the last row that uses a blob deletes the blob.
--                original_size is the file as the person picked it, before the
--                browser shrank a photo -- for the space-saved figure.
--
-- Adding and removing files is ledgers.files, given to Accountants here.
-- Anyone who sees Ledgers or Debtors can view and download them.
--
-- No semicolons may appear in these comments -- migrate.js splits on them.

CREATE TABLE IF NOT EXISTS file_blobs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sha256      TEXT    NOT NULL UNIQUE,
  mime        TEXT    NOT NULL,
  size        INTEGER NOT NULL,
  stored_size INTEGER NOT NULL,
  encoding    TEXT    NOT NULL DEFAULT 'none' CHECK (encoding IN ('none','gzip')),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS file_chunks (
  blob_id INTEGER NOT NULL REFERENCES file_blobs(id) ON DELETE CASCADE,
  seq     INTEGER NOT NULL,
  data    BLOB    NOT NULL,
  PRIMARY KEY (blob_id, seq)
);

CREATE TABLE IF NOT EXISTS ledger_files (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  blob_id      INTEGER NOT NULL REFERENCES file_blobs(id),
  company_id   INTEGER NOT NULL REFERENCES tally_companies(id),
  entry_id     INTEGER REFERENCES ledger_entries(id),
  voucher_guid TEXT,
  file_name    TEXT    NOT NULL,
  kind         TEXT    NOT NULL CHECK (kind IN ('pdf','image','email')),
  original_size INTEGER,
  uploaded_by  INTEGER REFERENCES users(id),
  uploaded_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  CHECK ((entry_id IS NOT NULL) <> (voucher_guid IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_ledger_files_entry ON ledger_files(entry_id);
CREATE INDEX IF NOT EXISTS idx_ledger_files_voucher ON ledger_files(company_id, voucher_guid);
CREATE INDEX IF NOT EXISTS idx_ledger_files_blob ON ledger_files(blob_id);

INSERT OR IGNORE INTO role_permissions (role, permission) VALUES
  ('Accountant', 'ledgers.files')
