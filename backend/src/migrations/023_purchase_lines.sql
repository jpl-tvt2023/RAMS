-- Purchase Reports, round two (the user, 2026-11-28 evening): every ROMS line
-- is its own record, with its own files, bill check and two approvals. A
-- record used to be a whole delivery (the receipts under one Incoming No from
-- one vendor, or one challan). The delivery is now only how the pages list
-- lines together, so each record keeps it:
--   delivery_key   the Incoming No (with vendor and page) or the challan the
--                  line belongs to, which was the old record's group_key
--   delivery_at    the delivery's earliest line, so the pages sort deliveries
--                  by date and keep each one's lines together
-- No row changes here. The next read of ROMS (purchases/refresh.js) gives each
-- line its own record and copies any work done on an old delivery record
-- (files, bill check, approvals) to each of its lines. The code that ran
-- before this change never reads these columns, so this can run first.

ALTER TABLE purchase_records ADD COLUMN delivery_key TEXT;

ALTER TABLE purchase_records ADD COLUMN delivery_at TEXT;

CREATE INDEX IF NOT EXISTS idx_purchase_records_delivery ON purchase_records (page, delivery_at, delivery_key)
