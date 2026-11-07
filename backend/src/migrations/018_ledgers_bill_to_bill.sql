-- Ledgers v2: a bill-to-bill statement per party, and the narration check.
--
-- ledger_marketplaces   the marketplaces Ledgers covers -- the ones that pay
--                       bill to bill. Set on Ledger settings (audited). Others
--                       show "coming soon" on the page.
-- ledger_settings       match_window_days: how long Tally may take to book a
--                       debit or credit note typed in RAMS. A typed note waits
--                       this long before it is flagged, and a debit note found
--                       by amount must be booked within it. grace_days now
--                       means how long a Tally credit note may wait to be
--                       typed here.
-- narration_settings    (one row) which Tally records need a narration.
--   types               JSON list of Tally base types, NULL for every type
--   required_from       records dated before this are never flagged
--
-- No semicolons may appear in these comments -- migrate.js splits on them.

CREATE TABLE IF NOT EXISTS ledger_marketplaces (
  vendor   TEXT PRIMARY KEY,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  added_by INTEGER REFERENCES users(id)
);

INSERT OR IGNORE INTO ledger_marketplaces (vendor) VALUES ('Minutes'), ('Now'), ('Zepto');

ALTER TABLE ledger_settings ADD COLUMN match_window_days INTEGER NOT NULL DEFAULT 60;

CREATE TABLE IF NOT EXISTS narration_settings (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  types         TEXT,
  required_from TEXT NOT NULL DEFAULT '2026-06-08',
  updated_at    TEXT,
  updated_by    INTEGER REFERENCES users(id)
);

INSERT OR IGNORE INTO narration_settings (id) VALUES (1)
