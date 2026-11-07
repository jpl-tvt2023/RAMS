// npm run reset-data -- the go-live reset: empties what RAMS gathered while it
// ran on test data, and keeps how it is set up. Run it once, before the office
// PC's first load (the Connector's Setup, "Load all of Tally into RAMS now").
//
//   npm run reset-data                           what it would delete; changes nothing
//   npm run reset-data -- --confirm <database>   delete it. <database> is the name
//                                                the dry run prints, so the command
//                                                can only ever hit the database it names
//
// Deleted:
//   - Tally's books: vouchers and their lines, ledger balances, sync state and runs
//   - the copy of ROMS, every match and auto-fill result
//   - Ledgers' typed DN/CN and loaded openings
//   - every Connector token, the companies switched off, and the audit log
// Kept:
//   - users, roles and permissions
//   - every setting: sync schedule, matching rules, party ledger maps, credit
//     terms, Ledgers and narration settings
//   - the companies switched on (with the default star), and Tally's masters.
//     The first load refreshes the masters
// Auto-fill is set to Off for both fields, and one audit row records the reset.
// Check which database backend/.env points at first, as for `npm run migrate`.
require('../config/env');
const db = require('../config/db');

// Children before parents, so foreign keys never block a delete.
const CLEARED = [
  'tally_vch_ledger_lines', 'tally_vch_bill_allocations', 'tally_vch_inventory_lines', 'tally_vch_orders', 'tally_vouchers',
  'tally_ledger_balances', 'sync_requests', 'ledger_entries', 'ledger_openings',
  'match_results', 'doc_links', 'match_runs', 'autofill_events', 'autofill_items', 'autofill_runs',
  'roms_po_lines', 'roms_pos', 'roms_vendor_codes', 'roms_products', 'roms_vendors', 'roms_rtv', 'roms_refresh',
  'tally_sync_runs', 'tally_sync_state', 'agents', 'audit_logs',
];
// What a company switched off still has: removed with it. RAMS lists it again
// (switched off) when the Connector next sees it open in Tally.
const OF_COMPANY = ['party_ledgers', 'tally_groups', 'tally_ledgers', 'tally_stock_items', 'tally_voucher_types'];

// "royalmart-rams-royalmart.aws-ap-south-1.turso.io", or a local file's name.
function databaseName(url) {
  const u = String(url || '');
  if (u.startsWith('file:')) return u.slice(5).split(/[\\/]/).pop();
  try { return new URL(u.replace(/^libsql:/, 'https:')).host; } catch { return u; }
}

const count = async (client, sql) => Number((await client.execute(sql)).rows[0].n);

// Returns { database, deleted: { table: rows }, kept: { what: rows }, done }.
async function resetData(client, { url, confirm = null }) {
  const database = databaseName(url);
  const tables = new Set((await client.execute("SELECT name FROM sqlite_master WHERE type = 'table'")).rows.map((r) => r.name));
  const off = 'company_id IN (SELECT id FROM tally_companies WHERE sync_enabled = 0)';

  const deleted = {};
  for (const t of CLEARED.filter((x) => tables.has(x))) deleted[t] = await count(client, `SELECT COUNT(*) AS n FROM ${t}`);
  for (const t of OF_COMPANY) deleted[`${t} (companies switched off)`] = await count(client, `SELECT COUNT(*) AS n FROM ${t} WHERE ${off}`);
  deleted['tally_companies (switched off)'] = await count(client, 'SELECT COUNT(*) AS n FROM tally_companies WHERE sync_enabled = 0');
  const kept = {
    users: await count(client, 'SELECT COUNT(*) AS n FROM users'),
    'companies switched on': await count(client, 'SELECT COUNT(*) AS n FROM tally_companies WHERE sync_enabled = 1'),
    'party ledger maps': await count(client, `SELECT COUNT(*) AS n FROM party_ledgers WHERE NOT ${off}`),
    'Tally ledgers (masters)': await count(client, `SELECT COUNT(*) AS n FROM tally_ledgers WHERE NOT ${off}`),
  };
  if (confirm === null) return { database, deleted, kept, done: false };
  if (confirm !== database) throw new Error(`--confirm must be the database name "${database}", got "${confirm}"`);

  const tx = await client.transaction('write');
  try {
    for (const t of CLEARED.filter((x) => tables.has(x))) await tx.execute(`DELETE FROM ${t}`);
    for (const t of OF_COMPANY) await tx.execute(`DELETE FROM ${t} WHERE ${off}`);
    await tx.execute('DELETE FROM tally_companies WHERE sync_enabled = 0');
    await tx.execute("UPDATE autofill_settings SET bill_mode = 'off', cn_mode = 'off', updated_at = datetime('now'), updated_by = NULL WHERE id = 1");
    const total = Object.values(deleted).reduce((n, v) => n + v, 0);
    await tx.execute({
      sql: "INSERT INTO audit_logs (user_id, action_type, description, entity_type) VALUES (NULL, 'DATA_RESET', ?, 'system')",
      args: [`Go-live reset: ${total} rows of test-period data removed (Tally books, ROMS copy, matching, auto-fill, Connector tokens, audit log). Settings, users and party ledger maps kept. Auto-fill set to Off.`],
    });
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
  return { database, deleted, kept, done: true };
}

function parseArgs(argv) {
  const out = { confirm: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--confirm') out.confirm = argv[++i] || '';
    else if (argv[i].startsWith('--confirm=')) out.confirm = argv[i].slice(10);
    else throw new Error(`Unknown option ${argv[i]}`);
  }
  return out;
}

if (require.main === module) {
  Promise.resolve()
    .then(() => resetData(db, { url: process.env.TURSO_DATABASE_URL, ...parseArgs(process.argv.slice(2)) }))
    .then((r) => {
      console.log(`Database: ${r.database}\n`);
      console.log(r.done ? 'Deleted:' : 'Would delete:');
      for (const [t, n] of Object.entries(r.deleted)) if (n) console.log(`  ${t}: ${n}`);
      console.log('\nKept:');
      for (const [t, n] of Object.entries(r.kept)) console.log(`  ${t}: ${n}`);
      console.log('  every setting; auto-fill is set to Off');
      if (!r.done) console.log(`\nNothing changed. To delete it: npm run reset-data -- --confirm ${r.database}`);
      else console.log('\nDone. Next: make the Connector token (npm run agent-token -- --name "Office PC"), then run Setup on the office PC.');
    })
    .catch((err) => {
      console.error(`reset-data failed: ${err.message}`);
      process.exitCode = 1;
    })
    .finally(() => db.close());
}

module.exports = { resetData, databaseName, parseArgs };
