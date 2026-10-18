-- The company the report screens open on (Reports -> Debtors first), chosen on
-- Admin -> Tally companies by whoever holds sync.companies (audited). At most
-- one company carries it. With none, the reports open on all companies.
--
-- The client asked for MH. A database that already knows MH (the test setup)
-- gets it here. A fresh one has no companies yet, so it is set by hand at
-- go-live (docs/go-live.md).
--
-- No semicolons may appear in these comments -- migrate.js splits on them.

ALTER TABLE tally_companies ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;

UPDATE tally_companies SET is_default = 1
 WHERE id = (SELECT id FROM tally_companies WHERE code = 'MH' ORDER BY sync_enabled DESC, id LIMIT 1)
