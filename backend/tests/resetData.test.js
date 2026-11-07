// npm run reset-data, on a throwaway database of its own (not the shared test
// database, which every other suite needs): a dry run changes nothing, the
// confirm must name the database, and the reset keeps the setup.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createClient } = require('@libsql/client');
const { resetData, databaseName, parseArgs } = require('../src/seeds/resetData');

const MIGRATIONS = path.join(__dirname, '..', 'src', 'migrations');
let dir;
let file;
let client;
const n = async (sql) => Number((await client.execute(sql)).rows[0].n);

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rams-reset-'));
  file = path.join(dir, 'reset.db');
  client = createClient({ url: `file:${file}` });
  for (const f of fs.readdirSync(MIGRATIONS).filter((x) => x.endsWith('.sql')).sort()) {
    for (const stmt of fs.readFileSync(path.join(MIGRATIONS, f), 'utf8').split(';').map((s) => s.trim()).filter(Boolean)) {
      await client.execute(stmt);
    }
  }
  // A database as the test site leaves it: a company on (the default) and one
  // off, books, a Connector, a match, auto-fill on Ask first, and history.
  await client.executeMultiple(`
    INSERT INTO users (id, name, username, password_hash) VALUES (1, 'Admin', 'admin', 'x');
    INSERT INTO user_roles (user_id, role) VALUES (1, 'Admin');
    INSERT INTO tally_companies (id, guid, name, code, sync_enabled, is_default) VALUES (1, 'g-mh', 'Roymax MH', 'MH', 1, 1), (2, 'g-test', 'Test Company', NULL, 0, 0);
    INSERT INTO tally_ledgers (company_id, guid, name) VALUES (1, 'l1', 'ZEPTO PRIVATE LIMITED'), (2, 'l9', 'Test ledger');
    INSERT INTO party_ledgers (company_id, ledger_guid, kind, vendor) VALUES (1, 'l1', 'vendor', 'Zepto'), (2, 'l9', 'vendor', 'Zepto');
    INSERT INTO agents (id, name, token_hash) VALUES (1, 'Dev PC (test env)', 'h1');
    INSERT INTO tally_sync_runs (id, company_id, agent_id, kind) VALUES (1, 1, 1, 'backfill');
    INSERT INTO tally_sync_state (company_id, backfill_done) VALUES (1, 1);
    INSERT INTO tally_vouchers (id, company_id, guid, alter_id, date, voucher_type, base_type, last_run_id) VALUES (1, 1, 'v1', 5, '2026-07-01', 'Sales', 'Sales', 1);
    INSERT INTO tally_vch_ledger_lines (voucher_id, line_no, ledger, amount_paise) VALUES (1, 1, 'ZEPTO PRIVATE LIMITED', -100000);
    INSERT INTO tally_ledger_balances (company_id, ledger_guid, as_of, closing_paise, run_id) VALUES (1, 'l1', '2026-10-24', -100000, 1);
    INSERT INTO match_runs (id, trigger) VALUES (1, 'manual');
    INSERT INTO autofill_runs (id, trigger) VALUES (1, 'manual');
    UPDATE autofill_settings SET bill_mode = 'approve', cn_mode = 'approve' WHERE id = 1;
    INSERT INTO audit_logs (user_id, action_type, description) VALUES (1, 'LOGIN', 'test-site sign-in');
  `);
});

afterAll(() => {
  client.close();
  // Windows can hold the file a moment after close(); a leftover temp folder is harmless.
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* left for the OS to clear */ }
});

describe('npm run reset-data', () => {
  test('the database name is the host, or a local file\'s name', () => {
    expect(databaseName('libsql://royalmart-rams-royalmart.aws-ap-south-1.turso.io')).toBe('royalmart-rams-royalmart.aws-ap-south-1.turso.io');
    expect(databaseName('file:./local.db')).toBe('local.db');
    expect(parseArgs(['--confirm', 'x'])).toEqual({ confirm: 'x' });
    expect(() => parseArgs(['--yes'])).toThrow(/Unknown option/);
  });

  test('a dry run lists what would go and changes nothing', async () => {
    const r = await resetData(client, { url: `file:${file}` });
    expect(r.done).toBe(false);
    expect(r.database).toBe('reset.db');
    expect(r.deleted).toMatchObject({
      tally_vouchers: 1, tally_vch_ledger_lines: 1, agents: 1, tally_sync_runs: 1, match_runs: 1, audit_logs: 1, 'tally_companies (switched off)': 1,
    });
    expect(r.kept).toMatchObject({ users: 1, 'companies switched on': 1, 'party ledger maps': 1 });
    expect(await n('SELECT COUNT(*) AS n FROM tally_vouchers')).toBe(1);
  });

  test('the confirm must name this database', async () => {
    await expect(resetData(client, { url: `file:${file}`, confirm: 'royalmart-rams-test-royalmart.aws-ap-south-1.turso.io' }))
      .rejects.toThrow(/must be the database name "reset.db"/);
    expect(await n('SELECT COUNT(*) AS n FROM agents')).toBe(1);
  });

  test('the reset empties the test-period data and keeps the setup', async () => {
    const r = await resetData(client, { url: `file:${file}`, confirm: 'reset.db' });
    expect(r.done).toBe(true);
    for (const t of ['tally_vouchers', 'tally_vch_ledger_lines', 'tally_ledger_balances', 'tally_sync_runs', 'tally_sync_state', 'agents', 'match_runs', 'autofill_runs']) {
      expect(await n(`SELECT COUNT(*) AS n FROM ${t}`)).toBe(0);
    }
    // Kept: the user, the company on with its star, its masters and maps; the switched-off one is gone.
    expect(await n('SELECT COUNT(*) AS n FROM users')).toBe(1);
    expect((await client.execute('SELECT guid, is_default FROM tally_companies')).rows.map((x) => [x.guid, Number(x.is_default)])).toEqual([['g-mh', 1]]);
    expect(await n('SELECT COUNT(*) AS n FROM tally_ledgers')).toBe(1);
    expect(await n('SELECT COUNT(*) AS n FROM party_ledgers')).toBe(1);
    expect(await n("SELECT COUNT(*) AS n FROM ledger_marketplaces WHERE vendor IN ('Minutes', 'Now', 'Zepto')")).toBe(3);
    const fill = (await client.execute('SELECT bill_mode, cn_mode FROM autofill_settings WHERE id = 1')).rows[0];
    expect([fill.bill_mode, fill.cn_mode]).toEqual(['off', 'off']);
    // The audit log keeps one row: the reset itself.
    const audit = (await client.execute('SELECT action_type, user_id FROM audit_logs')).rows;
    expect(audit.map((a) => [a.action_type, a.user_id])).toEqual([['DATA_RESET', null]]);
  });
});
