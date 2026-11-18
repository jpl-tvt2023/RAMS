const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

// Migration 020 (Ledgers -> Party Statements) on its own databases, built up to
// 019 the way migrate.js does: files and settings carry over under the new
// names, roles keep their ticks under the new keys, the audit log keeps its
// entries, and a typed note (or a file on one) makes it refuse with nothing
// changed.
const DIR = path.resolve(__dirname, '../src/migrations');
const TMP = path.resolve(__dirname, '.tmp');
const FILES = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
const statementsOf = (file) => fs.readFileSync(path.join(DIR, file), 'utf8').split(';').map((s) => s.trim()).filter(Boolean);
const M020 = '020_rename_party_statements.sql';

const opened = [];
async function upTo019(name) {
  const file = path.join(TMP, `${name}-${process.pid}.db`);
  fs.mkdirSync(TMP, { recursive: true });
  const db = createClient({ url: `file:${file}` });
  opened.push([db, file]);
  // A throwaway file: no need to wait for the disk on every statement.
  await db.execute('PRAGMA journal_mode = MEMORY');
  await db.execute('PRAGMA synchronous = OFF');
  for (const f of FILES.filter((x) => x < M020)) for (const sql of statementsOf(f)) await db.execute(sql);
  await db.execute("INSERT INTO tally_companies (id, guid, name) VALUES (7, 'M20-CO', 'Roymax MH')");
  await db.execute("INSERT INTO users (id, name, username, password_hash) VALUES (70, 'Asha', 'asha20', 'x')");
  await db.execute("INSERT INTO file_blobs (id, sha256, mime, size, stored_size) VALUES (5, 'abc', 'application/pdf', 10, 10)");
  return db;
}
// As migrate.js runs a file: every statement in one write transaction.
async function run020(db) {
  const tx = await db.transaction('write');
  try {
    for (const sql of statementsOf(M020)) await tx.execute(sql);
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}
const tables = async (db) => (await db.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND (name LIKE 'ledger%' OR name LIKE 'statement%' OR name = 'voucher_files') ORDER BY name")).rows.map((r) => r.name);
const perms = async (db) => (await db.execute("SELECT role || ':' || permission AS p FROM role_permissions WHERE permission LIKE 'ledgers.%' OR permission LIKE 'statements.%' ORDER BY 1")).rows.map((r) => r.p);

afterAll(() => {
  for (const [db, file] of opened) {
    db.close();
    try { fs.rmSync(file, { force: true }); } catch { /* Windows may still hold it: the next run uses another name */ }
  }
});

describe('migration 020: Ledgers becomes Party Statements', () => {
  test('tables and keys take the new names; files, settings, openings, ticks and the audit log carry over', async () => {
    const db = await upTo019('m020-ok');
    await db.execute("INSERT INTO ledger_files (id, blob_id, company_id, voucher_guid, file_name, kind, uploaded_by) VALUES (12, 5, 7, 'V-1', 'CN 1048.pdf', 'pdf', 70)");
    await db.execute('UPDATE ledger_settings SET default_opening_paise = 2500000, updated_by = 70 WHERE id = 1');
    await db.execute("INSERT INTO ledger_openings (company_id, ledger_guid, amount_paise) VALUES (7, 'L-1', 12345)");
    await db.execute("INSERT INTO ledger_marketplaces (vendor) VALUES ('Blinkit')");
    await db.execute("INSERT INTO audit_logs (user_id, action_type, description, entity_type, entity_id) VALUES (70, 'LEDGER_SETTINGS_UPDATE', 'Ledger settings changed', 'ledger_settings', 1)");
    expect(await perms(db)).toEqual(['Accountant:ledgers.entry', 'Accountant:ledgers.files', 'Accountant:ledgers.view', 'Viewer:ledgers.view']);

    await run020(db);

    expect(await tables(db)).toEqual(['statement_marketplaces', 'statement_openings', 'statement_settings', 'voucher_files']);
    expect((await db.execute('SELECT id, blob_id, company_id, voucher_guid, file_name, kind, uploaded_by FROM voucher_files')).rows.map((r) => ({ ...r }))).toEqual([
      {
        id: 12, blob_id: 5, company_id: 7, voucher_guid: 'V-1', file_name: 'CN 1048.pdf', kind: 'pdf', uploaded_by: 70,
      },
    ]);
    const cols = (await db.execute('PRAGMA table_info(voucher_files)')).rows.map((r) => r.name);
    expect(cols).not.toContain('entry_id');
    const indexes = (await db.execute("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'voucher_files' AND name NOT LIKE 'sqlite_%' ORDER BY name")).rows.map((r) => r.name);
    expect(indexes).toEqual(['idx_voucher_files_blob', 'idx_voucher_files_voucher']);
    expect((await db.execute('SELECT default_opening_paise, updated_by FROM statement_settings WHERE id = 1')).rows[0]).toMatchObject({ default_opening_paise: 2500000, updated_by: 70 });
    expect((await db.execute('SELECT amount_paise FROM statement_openings')).rows[0].amount_paise).toBe(12345);
    expect((await db.execute('SELECT vendor FROM statement_marketplaces ORDER BY vendor')).rows.map((r) => r.vendor)).toEqual(['Blinkit', 'Minutes', 'Now', 'Zepto']);
    // The same ticks under the new keys; the typed-notes key is gone.
    expect(await perms(db)).toEqual(['Accountant:statements.files', 'Accountant:statements.view', 'Viewer:statements.view']);
    expect((await db.execute("SELECT action_type, entity_type, description FROM audit_logs WHERE user_id = 70")).rows.map((r) => ({ ...r }))).toEqual([
      { action_type: 'STATEMENT_SETTINGS_UPDATE', entity_type: 'statement_settings', description: 'Ledger settings changed' },
    ]);
    expect((await db.execute('PRAGMA foreign_key_check')).rows).toEqual([]);
  });

  test('a typed note left in the database makes it refuse, and nothing changes', async () => {
    const db = await upTo019('m020-typed');
    await db.execute("INSERT INTO ledger_entries (company_id, ledger_guid, date, kind, number, amount_paise) VALUES (7, 'L-1', '2026-10-01', 'debit_note', 'FKIDN1', 100)");
    await expect(run020(db)).rejects.toThrow(/CHECK constraint failed/);
    expect(await tables(db)).toEqual(['ledger_entries', 'ledger_files', 'ledger_marketplaces', 'ledger_openings', 'ledger_settings']);
    expect(await perms(db)).toContain('Viewer:ledgers.view');
  });

  test('a file on a typed note (no voucher) makes it refuse too', async () => {
    const db = await upTo019('m020-entry-file');
    // The note itself was removed, but its file row stayed behind.
    await db.execute('PRAGMA foreign_keys = OFF');
    await db.execute("INSERT INTO ledger_files (blob_id, company_id, entry_id, file_name, kind) VALUES (5, 7, 99, 'dn.pdf', 'pdf')");
    await expect(run020(db)).rejects.toThrow(/NOT NULL constraint failed: voucher_files.voucher_guid/);
    expect(await tables(db)).toContain('ledger_files');
    expect(await tables(db)).not.toContain('voucher_files');
  });
});
