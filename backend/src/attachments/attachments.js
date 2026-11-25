// Attachments (Tally Reports -> Attachments): a company's vouchers in a
// financial year, the way Tally's voucher registers show them, with what each
// one still needs -- its document (a file) and its narration. Worked out at
// read time from the Tally copy. Nothing is stored here and nothing is
// written to Tally.
//
//   tabs       Invoice (Sales), Payments (Payment), DN (Debit Note) and CN
//              (Credit Note) -- Tally's own types. A marketplace DN that Tally
//              books as a Credit Note is under CN here.
//   months     April to March. Each month: how many vouchers, how many need
//              attention (no narration where the narration check asks for
//              one, or no file), and the register's Debit, Credit and running
//              Closing balance. A register's amounts sit on one side, the
//              side opposite the party's line: Sales and Debit Notes credit,
//              Payments and Credit Notes debit.
//   vouchers   one month of one tab: number, ledger, city, amount, e-invoice,
//              files, narration and the last change made in RAMS.
//
// A Payment's party in Tally is usually the bank or cash it was paid from, so
// its Ledger is the ledger it debits -- who was paid.
const { SYNC_FROM } = require('../config/env');
const { todayIst } = require('../matching/load');
const { fyOf } = require('../matching/engine');
const { loadNarrationRule, narrationOf } = require('../services/narration');
const { filesFor } = require('../services/files');

const TABS = [
  { key: 'invoice', label: 'Invoice', base_type: 'Sales', side: 'credit', number_label: 'Invoice no', einvoice: true },
  { key: 'payment', label: 'Payments', base_type: 'Payment', side: 'debit', number_label: 'Voucher no', einvoice: false },
  { key: 'dn', label: 'DN', base_type: 'Debit Note', side: 'credit', number_label: 'DN no', einvoice: true },
  { key: 'cn', label: 'CN', base_type: 'Credit Note', side: 'debit', number_label: 'CN no', einvoice: true },
];
const TAB_BY_KEY = new Map(TABS.map((t) => [t.key, t]));
const LIVE = 'v.deleted_at IS NULL AND v.is_cancelled = 0 AND v.is_optional = 0';
const NO_NARRATION = "COALESCE(TRIM(v.narration), '') = ''";
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CHUNK = 400;
const PAGE_SIZE = 50;
const PAGE_SIZE_MAX = 10000; // a CSV download asks for the whole month

const rowsOf = async (client, sql, args = []) => (await client.execute({ sql, args })).rows;
const n = (v) => (v == null ? 0 : Number(v));
const marks = (k) => Array(k).fill('?').join(',');
const chunks = (list, size = CHUNK) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};
const lower = (s) => String(s ?? '').trim().toLowerCase();
const fail = (status, message) => Object.assign(new Error(message), { status });

// ------------------------------------------------------------ the year

const fyLabel = (fy) => `${fy}-${String(fy + 1).slice(2)}`;
// The months of a financial year, April first: { month: 'YYYY-MM', from, to }.
function monthsOf(fy) {
  return Array.from({ length: 12 }, (_, i) => {
    const y = i < 9 ? fy : fy + 1;
    const m = ((i + 3) % 12) + 1;
    const month = `${y}-${String(m).padStart(2, '0')}`;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { month, from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
  });
}
const monthLabel = (month) => `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

// Every financial year RAMS's copy of Tally reaches, newest first.
function yearsOf(today) {
  const out = [];
  for (let fy = fyOf(today); fy >= fyOf(SYNC_FROM); fy -= 1) out.push({ fy, label: fyLabel(fy) });
  return out;
}

// The year asked for, else the current one. 400 outside the copy.
function pickYear(value, today) {
  const years = yearsOf(today);
  if (value == null || value === '') return { fy: years[0].fy, years };
  const fy = Number(value);
  if (!years.some((y) => y.fy === fy)) throw fail(400, `RAMS holds Tally from ${SYNC_FROM}: choose a financial year from ${years.at(-1).label} to ${years[0].label}`);
  return { fy, years };
}

// ------------------------------------------------------------ the company

// The companies whose sync is on, and the one asked for: an id, or 'default'
// (the starred company, else the first by code). One company at a time, as
// Tally's registers are.
async function pickCompany(client, value) {
  const companies = (await rowsOf(client, 'SELECT id, code, name, is_default FROM tally_companies WHERE sync_enabled = 1 ORDER BY code, id'))
    .map((c) => ({ id: Number(c.id), code: c.code, name: c.name, is_default: Boolean(c.is_default) }));
  if (!companies.length) throw fail(404, 'No Tally company is synced yet. Turn one on under Admin -> Tally companies.');
  let company;
  if (value == null || value === '' || value === 'default') company = companies.find((c) => c.is_default) || companies[0];
  else company = companies.find((c) => c.id === Number(value));
  if (!company) throw fail(404, 'That company isn’t synced');
  return { company, companies };
}

// ------------------------------------------------------------ the narration rule

// SQL for "this voucher needs a narration and has none", from the rule set on
// Admin -> Tally companies (narration_settings), as narrationOf decides it.
function noNarrationSql(rule) {
  const parts = [NO_NARRATION];
  const args = [];
  if (rule.types) {
    parts.push(`v.base_type IN (${marks(rule.types.length)})`);
    args.push(...rule.types);
  }
  if (rule.required_from) {
    parts.push('v.date >= ?');
    args.push(rule.required_from);
  }
  return { sql: `(${parts.join(' AND ')})`, args };
}

// ------------------------------------------------------------ months

/**
 * Every tab's months of one company's financial year, in one query:
 * { tabs: [{ key, label, base_type, side, einvoice, months, totals }] }.
 * A month's closing is the register's running total from April (positive is
 * Dr), blank for a month still to come or one before RAMS's copy starts.
 */
async function loadMonths(client, { companyId, fy, today = todayIst(), rule = null }) {
  const narr = noNarrationSql(rule || await loadNarrationRule(client));
  const months = monthsOf(fy);
  const rows = await rowsOf(client, `
    SELECT v.base_type, substr(v.date, 1, 7) AS month, COUNT(*) AS vouchers,
           COALESCE(SUM(ABS(v.total_paise)), 0) AS amount_paise,
           SUM(CASE WHEN ${narr.sql} THEN 1 ELSE 0 END) AS no_narration,
           SUM(CASE WHEN f.voucher_guid IS NULL THEN 1 ELSE 0 END) AS no_file,
           SUM(CASE WHEN ${narr.sql} OR f.voucher_guid IS NULL THEN 1 ELSE 0 END) AS needs_attention
      FROM tally_vouchers v
      LEFT JOIN (SELECT DISTINCT voucher_guid FROM voucher_files WHERE company_id = ?) f ON f.voucher_guid = v.guid
     WHERE v.company_id = ? AND v.base_type IN (${marks(TABS.length)}) AND v.date >= ? AND v.date <= ? AND ${LIVE}
     GROUP BY v.base_type, month`, [
    ...narr.args, ...narr.args, companyId, companyId, ...TABS.map((t) => t.base_type), months[0].from, months[11].to,
  ]);
  const found = new Map(rows.map((r) => [`${r.base_type}|${r.month}`, r]));

  const tabs = TABS.map((t) => {
    let closing = 0;
    const totals = {
      vouchers: 0, needs_attention: 0, no_narration: 0, no_file: 0, debit_paise: 0, credit_paise: 0, closing_paise: null,
    };
    const list = months.map((m) => {
      const r = found.get(`${t.base_type}|${m.month}`);
      const inCopy = m.to >= SYNC_FROM;
      const started = m.from <= today;
      const amount = n(r?.amount_paise);
      closing += t.side === 'debit' ? amount : -amount;
      const out = {
        month: m.month,
        label: monthLabel(m.month),
        in_copy: inCopy,
        from: inCopy && SYNC_FROM > m.from ? SYNC_FROM : null, // the copy starts part-way through it
        vouchers: n(r?.vouchers),
        needs_attention: n(r?.needs_attention),
        no_narration: n(r?.no_narration),
        no_file: n(r?.no_file),
        debit_paise: t.side === 'debit' ? amount : 0,
        credit_paise: t.side === 'credit' ? amount : 0,
        closing_paise: inCopy && started ? closing : null,
      };
      for (const k of ['vouchers', 'needs_attention', 'no_narration', 'no_file', 'debit_paise', 'credit_paise']) totals[k] += out[k];
      if (out.closing_paise != null) totals.closing_paise = out.closing_paise;
      return out;
    });
    return {
      key: t.key, label: t.label, base_type: t.base_type, side: t.side, einvoice: t.einvoice, number_label: t.number_label, months: list, totals,
    };
  });
  return { tabs };
}

// ------------------------------------------------------------ one month

// The ledgers each Payment debits, in Tally's line order: voucher id -> [names].
async function debitedLedgers(client, ids) {
  const out = new Map();
  for (const part of chunks(ids)) {
    const rows = await rowsOf(client, `SELECT voucher_id, ledger FROM tally_vch_ledger_lines
                                         WHERE is_debit = 1 AND voucher_id IN (${marks(part.length)}) ORDER BY voucher_id, line_no`, part);
    for (const r of rows) {
      const k = Number(r.voucher_id);
      if (!out.has(k)) out.set(k, []);
      if (!out.get(k).includes(r.ledger)) out.get(k).push(r.ledger);
    }
  }
  return out;
}

// The last change a person made in RAMS to each voucher (adding or removing a
// file, today): voucher id -> { user_name, at, action_type, description }.
async function lastChanges(client, ids) {
  const out = new Map();
  for (const part of chunks(ids)) {
    const rows = await rowsOf(client, `
      SELECT a.entity_id, a.timestamp, a.action_type, a.description, u.name AS user_name, u.username
        FROM audit_logs a
        JOIN (SELECT entity_id, MAX(id) AS id FROM audit_logs
               WHERE entity_type = 'tally_vouchers' AND user_id IS NOT NULL AND entity_id IN (${marks(part.length)})
               GROUP BY entity_id) m ON m.id = a.id
        LEFT JOIN users u ON u.id = a.user_id`, part);
    for (const r of rows) {
      out.set(Number(r.entity_id), {
        user_name: r.user_name || r.username || null, at: r.timestamp, action_type: r.action_type, description: r.description,
      });
    }
  }
  return out;
}

/**
 * Each row's city, first found: the ledger's City in Tally, else the city on
 * the ROMS PO the voucher is linked to (an invoice's PO, a credit note's RTV
 * row's PO), else on the latest PO linked to an invoice of the same party.
 * rows: [{ guid, ledger }] -> (row) => { city, city_from, pincode }.
 */
async function citiesFor(client, companyId, rows) {
  const names = [...new Set(rows.map((r) => lower(r.ledger)).filter(Boolean))];
  const guids = [...new Set(rows.map((r) => r.guid))];
  const tally = new Map();
  for (const part of chunks(names)) {
    const found = await rowsOf(client, `SELECT name, city, pincode FROM tally_ledgers
                                          WHERE company_id = ? AND deleted_at IS NULL AND lower(name) IN (${marks(part.length)})`, [companyId, ...part]);
    for (const r of found) tally.set(lower(r.name), { city: r.city || null, pincode: r.pincode || null });
  }
  const onPo = new Map();
  for (const part of chunks(guids)) {
    const found = await rowsOf(client, `
      SELECT d.voucher_guid, p.city FROM doc_links d
        JOIN match_results m ON m.target_kind = d.target_kind AND m.target_id = d.target_id AND m.outcome = 'linked'
        JOIN roms_pos p ON p.po_id = m.po_id
       WHERE d.company_id = ? AND d.status IN ('auto','confirmed') AND d.target_kind IN ('po','rtv')
         AND COALESCE(TRIM(p.city), '') <> '' AND d.voucher_guid IN (${marks(part.length)})`, [companyId, ...part]);
    for (const r of found) if (!onPo.has(r.voucher_guid)) onPo.set(r.voucher_guid, r.city);
  }
  const ofParty = new Map();
  const wanted = names.filter((nm) => !tally.get(nm)?.city);
  for (const part of chunks(wanted)) {
    // SQLite gives the city of the row holding MAX(v.date): the latest PO.
    const found = await rowsOf(client, `
      SELECT lower(v.party) AS party, p.city, MAX(v.date) AS at FROM tally_vouchers v
        JOIN doc_links d ON d.company_id = v.company_id AND d.voucher_guid = v.guid AND d.target_kind = 'po' AND d.status IN ('auto','confirmed')
        JOIN match_results m ON m.target_kind = 'po' AND m.target_id = d.target_id AND m.outcome = 'linked'
        JOIN roms_pos p ON p.po_id = m.po_id
       WHERE v.company_id = ? AND v.deleted_at IS NULL AND COALESCE(TRIM(p.city), '') <> '' AND lower(v.party) IN (${marks(part.length)})
       GROUP BY lower(v.party)`, [companyId, ...part]);
    for (const r of found) ofParty.set(r.party, r.city);
  }
  return (row) => {
    const t = tally.get(lower(row.ledger)) || {};
    if (t.city) return { city: t.city, city_from: 'tally', pincode: t.pincode || null };
    if (onPo.has(row.guid)) return { city: onPo.get(row.guid), city_from: 'po', pincode: t.pincode || null };
    if (ofParty.has(lower(row.ledger))) return { city: ofParty.get(lower(row.ledger)), city_from: 'party_po', pincode: t.pincode || null };
    return { city: null, city_from: null, pincode: t.pincode || null };
  };
}

const matches = (q, ...values) => {
  const s = lower(q);
  return !s || values.some((v) => v != null && String(v).toLowerCase().includes(s));
};

/**
 * One tab's vouchers in one month, ordered as Tally's register lists them
 * (date, then entry). only='attention' keeps those that need something; q
 * finds a number, ledger, Ack No or IRN. Pages as the other reports do.
 */
async function loadVouchers(client, {
  companyId, fy, tab: tabKey, month, only = null, q = '', page = 1, pageSize = PAGE_SIZE, rule = null,
}) {
  const tab = TAB_BY_KEY.get(tabKey);
  if (!tab) throw fail(400, `Unknown tab: choose ${TABS.map((t) => t.key).join(', ')}`);
  const m = monthsOf(fy).find((x) => x.month === month);
  if (!m) throw fail(400, `Choose a month of ${fyLabel(fy)} (YYYY-MM)`);
  if (m.to < SYNC_FROM) throw fail(400, `${monthLabel(month)} is before RAMS’s copy of Tally, which starts on ${SYNC_FROM}`);
  const r = rule || await loadNarrationRule(client);

  const vouchers = (await rowsOf(client, `
    SELECT v.id, v.guid, v.number, v.date, v.voucher_type, v.base_type, v.party, v.narration, v.total_paise,
           v.einvoice_read, v.irn, v.irn_ack_no, v.irn_ack_date, v.irn_cancelled,
           EXISTS (SELECT 1 FROM voucher_files f WHERE f.company_id = v.company_id AND f.voucher_guid = v.guid) AS has_file
      FROM tally_vouchers v
     WHERE v.company_id = ? AND v.base_type = ? AND v.date >= ? AND v.date <= ? AND ${LIVE}
     ORDER BY v.date, v.id`, [companyId, tab.base_type, m.from, m.to])).map((v) => ({ ...v, id: Number(v.id) }));

  const debited = tab.base_type === 'Payment' ? await debitedLedgers(client, vouchers.map((v) => v.id)) : new Map();
  const all = vouchers.map((v) => {
    const ledgers = tab.base_type === 'Payment' ? (debited.get(v.id) || []) : [];
    const ledger = ledgers[0] || v.party || null;
    const narration = narrationOf(r, v);
    const hasFile = Boolean(Number(v.has_file));
    return {
      id: v.id,
      guid: v.guid,
      number: v.number,
      date: v.date,
      voucher_type: v.voucher_type,
      amount_paise: Math.abs(n(v.total_paise)),
      party: v.party,
      ledger,
      ledgers: ledgers.length ? ledgers : (ledger ? [ledger] : []),
      einvoice: {
        read: Boolean(Number(v.einvoice_read)),
        irn: v.irn || null,
        ack_no: v.irn_ack_no || null,
        ack_date: v.irn_ack_date || null,
        cancelled: Boolean(Number(v.irn_cancelled)),
      },
      ...narration,
      has_file: hasFile,
      needs_attention: narration.narration_missing || !hasFile,
    };
  });

  const list = all.filter((v) => (only !== 'attention' || v.needs_attention)
    && matches(q, v.number, ...v.ledgers, v.party, v.einvoice.ack_no, v.einvoice.irn));
  const size = Math.min(PAGE_SIZE_MAX, Math.max(1, Number.parseInt(pageSize, 10) || PAGE_SIZE));
  const pageNo = Math.max(1, Number.parseInt(page, 10) || 1);
  const rows = list.slice((pageNo - 1) * size, pageNo * size);

  const [found, changes, cityOf] = await Promise.all([
    filesFor(client, { vouchers: rows.map((v) => [companyId, v.guid]) }),
    lastChanges(client, rows.map((v) => v.id)),
    citiesFor(client, companyId, rows),
  ]);
  return {
    tab: tab.key,
    month,
    label: monthLabel(month),
    from: SYNC_FROM > m.from ? SYNC_FROM : null,
    counts: { all: all.length, needs_attention: all.filter((v) => v.needs_attention).length },
    totals: { vouchers: list.length, amount_paise: list.reduce((a, v) => a + v.amount_paise, 0) },
    einvoice_unread: tab.einvoice ? all.filter((v) => !v.einvoice.read).length : 0,
    total: list.length,
    page: pageNo,
    page_size: size,
    rows: rows.map((v) => ({
      ...v, ...cityOf(v), files: found.voucher(companyId, v.guid), last_change: changes.get(v.id) || null,
    })),
  };
}

module.exports = {
  TABS, monthsOf, fyLabel, yearsOf, pickYear, pickCompany, loadMonths, loadVouchers, citiesFor,
};
