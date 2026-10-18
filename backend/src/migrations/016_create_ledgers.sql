-- Ledgers: a party's day, typed in RAMS and checked against Tally. People
-- record each day's invoices, debit notes, credit notes and receipts for one
-- party ledger here. RAMS never writes them to Tally -- accountants post in
-- Tally as before, and the Ledgers page compares the two at read time
-- (src/ledgers/ledger.js). Nothing derivable is stored.
--
-- ledger_entries    what a person typed, for one party ledger (company +
--                   ledger GUID, so a rename keeps it) on one day. kind says
--                   which way it moves the balance -- an invoice or debit
--                   note adds to what the party owes, a credit note or
--                   receipt takes it down -- so amount_paise is always
--                   positive. A removed entry keeps its row with deleted_at
--                   set, for the audit trail.
-- ledger_openings   a party's balance at the start of RAMS_SYNC_FROM, as what
--                   the party owes (a credit balance is negative). Loaded by a
--                   script later. A party without a row opens on the
--                   placeholder in ledger_settings.
-- ledger_settings   (one row) set by whoever holds ledgers.settings (audited)
--   grace_days               how long either side may wait for the other
--                            before a difference is flagged
--   amount_tolerance_paise   slack when an amount is compared with Tally's
--   default_opening_paise    the placeholder opening, 10000 rupees
--
-- No semicolons may appear in these comments -- migrate.js splits on them.

CREATE TABLE IF NOT EXISTS ledger_entries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id   INTEGER NOT NULL REFERENCES tally_companies(id),
  ledger_guid  TEXT    NOT NULL,
  date         TEXT    NOT NULL,
  kind         TEXT    NOT NULL CHECK (kind IN ('invoice','debit_note','credit_note','receipt')),
  number       TEXT,
  reference    TEXT,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  note         TEXT,
  created_by   INTEGER REFERENCES users(id),
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_by   INTEGER REFERENCES users(id),
  updated_at   TEXT,
  deleted_by   INTEGER REFERENCES users(id),
  deleted_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_party ON ledger_entries(company_id, ledger_guid, date);

CREATE TABLE IF NOT EXISTS ledger_openings (
  company_id   INTEGER NOT NULL REFERENCES tally_companies(id),
  ledger_guid  TEXT    NOT NULL,
  amount_paise INTEGER NOT NULL,
  source       TEXT    NOT NULL DEFAULT 'script' CHECK (source IN ('script')),
  loaded_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (company_id, ledger_guid)
);

CREATE TABLE IF NOT EXISTS ledger_settings (
  id                     INTEGER PRIMARY KEY CHECK (id = 1),
  grace_days             INTEGER NOT NULL DEFAULT 2,
  amount_tolerance_paise INTEGER NOT NULL DEFAULT 100,
  default_opening_paise  INTEGER NOT NULL DEFAULT 1000000,
  updated_at             TEXT,
  updated_by             INTEGER REFERENCES users(id)
);

INSERT OR IGNORE INTO ledger_settings (id) VALUES (1);

-- A party's Tally lines are found by the ledger's name, the way vouchers
-- carry it.
CREATE INDEX IF NOT EXISTS idx_tally_vch_ledger_name ON tally_vch_ledger_lines(ledger COLLATE NOCASE);

-- Who may see and change them, agreed with the Ledgers plan: Accountants see
-- Ledgers and record entries. Viewers see. The settings stay with Admin and
-- Owner until granted.
INSERT OR IGNORE INTO role_permissions (role, permission) VALUES
  ('Accountant', 'ledgers.view'),
  ('Accountant', 'ledgers.entry'),
  ('Viewer', 'ledgers.view')
