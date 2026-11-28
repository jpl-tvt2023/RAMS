-- Purchase Reports (Warehouse + Stitching), agreed with the user on 2026-11-28.
--
-- RAMS reads what ROMS records when goods are booked in against an outbound PO
-- (a receipt) or handed on between stitching stages (a challan). A person
-- attaches the bill or challan, saves a bill check, and the record is approved
-- by the Purchase Head and then the Accountant Head.
--
-- 1. Two new roles, Purchase Head and Accountant Head. A user may hold several
--    roles, and these two are add-ons that carry an approval step. SQLite cannot
--    ALTER a CHECK, so user_roles and role_permissions are rebuilt with every
--    row kept (the ROMS pattern, its 046). No table references either one.
--    MIRRORED in middleware/rbac.js, services/permissions.js (GRANTABLE_ROLES)
--    and frontend/src/utils/roles.js.

CREATE TABLE user_roles_new (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role    TEXT    NOT NULL CHECK (role IN ('Admin','Owner','Accountant','Viewer','Purchase Head','Accountant Head')),
  PRIMARY KEY (user_id, role)
);

INSERT INTO user_roles_new (user_id, role) SELECT user_id, role FROM user_roles;

DROP TABLE user_roles;

ALTER TABLE user_roles_new RENAME TO user_roles;

CREATE TABLE role_permissions_new (
  role       TEXT    NOT NULL CHECK (role IN ('Accountant','Viewer','Purchase Head','Accountant Head')),
  permission TEXT    NOT NULL,
  updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_by INTEGER REFERENCES users(id),
  PRIMARY KEY (role, permission)
);

INSERT INTO role_permissions_new (role, permission, updated_at, updated_by)
SELECT role, permission, updated_at, updated_by FROM role_permissions;

DROP TABLE role_permissions;

ALTER TABLE role_permissions_new RENAME TO role_permissions;

-- 2. RAMS's copy of ROMS's purchase references (ROMS integration resources
--    purchase-receipts and purchase-challans), keyed on ROMS's own row ids.
--    record_id is RAMS's: the purchase record the line belongs to. The copy is
--    rewritten from ROMS on every read, record_id is never sent by ROMS.

CREATE TABLE IF NOT EXISTS roms_purchase_receipts (
  id                INTEGER PRIMARY KEY,
  line_id           INTEGER,
  po_id             INTEGER,
  company_id        INTEGER,
  company_name      TEXT,
  vendor_id         INTEGER,
  vendor_name       TEXT,
  category          TEXT,
  item_name         TEXT,
  variant           TEXT,
  po_rate           REAL,
  unit_metric       TEXT,
  received_qty      REAL,
  received_rate     REAL,
  bill_no           TEXT,
  incoming_prefix   TEXT,
  incoming_no       TEXT,
  stage             TEXT,
  warehouse_name    TEXT,
  goes_to_stitching INTEGER,
  created_at        TEXT,
  updated_at        TEXT,
  record_id         INTEGER
);

CREATE INDEX IF NOT EXISTS idx_roms_purchase_receipts_record ON roms_purchase_receipts (record_id);

CREATE TABLE IF NOT EXISTS roms_purchase_challans (
  id                INTEGER PRIMARY KEY,
  challan_no        TEXT,
  challan_line_no   INTEGER,
  party_name        TEXT,
  from_stage        TEXT,
  to_stage          TEXT,
  parent_src        TEXT,
  parent_id         INTEGER,
  incoming_prefix   TEXT,
  incoming_no       TEXT,
  origin_receipt_id INTEGER,
  po_id             INTEGER,
  company_id        INTEGER,
  company_name      TEXT,
  vendor_id         INTEGER,
  vendor_name       TEXT,
  category          TEXT,
  item_name         TEXT,
  variant           TEXT,
  sent_qty          REAL,
  sent_dozens       REAL,
  received_qty      REAL,
  received_dozens   REAL,
  process_rate      REAL,
  rate_unit         TEXT,
  warehouse_name    TEXT,
  created_at        TEXT,
  updated_at        TEXT,
  record_id         INTEGER
);

CREATE INDEX IF NOT EXISTS idx_roms_purchase_challans_record ON roms_purchase_challans (record_id);

-- 3. One purchase record per Incoming No (+ vendor) on receipts, per challan on
--    challans: what gets the files, the bill check and the approvals.
--    group_key is how RAMS finds the record again on the next read of ROMS.
--    status:
--      to_check             nobody has saved a bill check yet
--      with_purchase_head   checked, waiting for the Purchase Head
--      with_accounts_head   Purchase Head approved, waiting for the Accountant Head
--      approved             both heads approved
--      sent_back            a head sent it back (sent_back_step, sent_back_reason)
--      changed              ROMS changed it after its bill check (changes)
--      removed              every line was deleted in ROMS, kept for its files and history
--    snapshot is the lines as they were when the bill check was saved, which is
--    what a later read of ROMS is compared against.

CREATE TABLE IF NOT EXISTS purchase_records (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  page                 TEXT    NOT NULL CHECK (page IN ('warehouse','stitching')),
  kind                 TEXT    NOT NULL CHECK (kind IN ('receipts','challan')),
  group_key            TEXT    NOT NULL UNIQUE,
  status               TEXT    NOT NULL DEFAULT 'to_check'
                       CHECK (status IN ('to_check','with_purchase_head','with_accounts_head','approved','sent_back','changed','removed')),
  first_at             TEXT,
  checked_by           INTEGER REFERENCES users(id),
  checked_at           TEXT,
  check_note           TEXT,
  snapshot             TEXT,
  purchase_approved_by INTEGER REFERENCES users(id),
  purchase_approved_at TEXT,
  accounts_approved_by INTEGER REFERENCES users(id),
  accounts_approved_at TEXT,
  sent_back_by         INTEGER REFERENCES users(id),
  sent_back_at         TEXT,
  sent_back_step       TEXT CHECK (sent_back_step IS NULL OR sent_back_step IN ('purchase','accounts')),
  sent_back_reason     TEXT,
  changed_at           TEXT,
  changes              TEXT,
  created_at           TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_purchase_records_page ON purchase_records (page, status, first_at);

-- 4. Files on a purchase record: the same store as files on Tally vouchers
--    (file_blobs + file_chunks, each distinct file kept once).

CREATE TABLE IF NOT EXISTS purchase_files (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  blob_id       INTEGER NOT NULL REFERENCES file_blobs(id),
  record_id     INTEGER NOT NULL REFERENCES purchase_records(id),
  file_name     TEXT    NOT NULL,
  kind          TEXT    NOT NULL,
  original_size INTEGER,
  uploaded_by   INTEGER REFERENCES users(id),
  uploaded_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_purchase_files_record ON purchase_files (record_id);

CREATE INDEX IF NOT EXISTS idx_purchase_files_blob ON purchase_files (blob_id);

-- 5. When ROMS's purchases were last read and last tried, how it went, and a
--    short lease so two page loads never read ROMS at once.

ALTER TABLE roms_refresh ADD COLUMN purchases_ok_at TEXT;

ALTER TABLE roms_refresh ADD COLUMN purchases_error TEXT;

ALTER TABLE roms_refresh ADD COLUMN purchases_attempt_at TEXT;

ALTER TABLE roms_refresh ADD COLUMN purchases_lease_until TEXT;

ALTER TABLE roms_refresh ADD COLUMN purchases_counts TEXT;

-- A go-live reset (npm run reset-data) before this migration deleted the one
-- row instead of emptying it, so it is put back.

INSERT OR IGNORE INTO roms_refresh (id) VALUES (1);

-- 6. Who may do what (Admin -> Roles & permissions). Admin and Owner hold
--    every key. The heads are add-on roles: each sees the pages and holds its
--    own step, and gets everything else from the other role a person holds.

INSERT OR IGNORE INTO role_permissions (role, permission) VALUES
  ('Accountant', 'purchases.view'),
  ('Accountant', 'purchases.check'),
  ('Viewer', 'purchases.view'),
  ('Purchase Head', 'purchases.view'),
  ('Purchase Head', 'purchases.approve_purchase'),
  ('Accountant Head', 'purchases.view'),
  ('Accountant Head', 'purchases.approve_accounts')
