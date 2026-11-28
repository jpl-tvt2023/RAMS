// Purchase Reports: the records on one page (Warehouse or Stitching) -- one
// per ROMS line, listed by delivery -- with the line from RAMS's copy of ROMS,
// its files, the bill check and the approvals: filtered by financial year,
// month, company, status and search, counted per status and paged in the
// database.
const { lastChanges } = require('../services/lastChange');
const {
  fyOf, pickYear, monthsOf, fyLabel, begunMonths,
} = require('../services/financialYear');
const { todayIst } = require('../matching/load');
const {
  PAGES, receiptLine, challanLine, recordLabel, deliveryLabel, linesOf,
} = require('./lines');

// The status is the line's queue (the user, 2026-11-29). Sent back and Changed
// in ROMS are notes on a line now, not statuses: a filter saved with one of
// them reads as To check. A removed line is in no queue, only under All.
const STATUSES = ['to_check', 'with_purchase_head', 'with_accounts_head', 'approved', 'removed'];
const OLD_STATUSES = { sent_back: 'to_check', changed: 'to_check' };
const PAGE_SIZE = 50;
const PAGE_SIZE_MAX = 10000;
const LIST_CHUNK = 400;

const fail = (status, message) => Object.assign(new Error(message), { status });
const rowsOf = async (client, sql, args = []) => (await client.execute({ sql, args })).rows;
const marks = (n) => Array(n).fill('?').join(',');
const chunked = (list) => {
  const out = [];
  for (let i = 0; i < list.length; i += LIST_CHUNK) out.push(list.slice(i, i + LIST_CHUNK));
  return out;
};
const parse = (s) => {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
};

// The line conditions (company, search) as an EXISTS over the record's lines,
// in whichever table its kind keeps them. A removed record has no lines, so a
// company or a search leaves it out.
function lineFilter({ companyId, q }) {
  const receipt = [];
  const challan = [];
  const args = { receipt: [], challan: [] };
  if (companyId) {
    receipt.push('l.company_id = ?'); args.receipt.push(companyId);
    challan.push('l.company_id = ?'); args.challan.push(companyId);
  }
  if (q) {
    const like = `%${q.toLowerCase()}%`;
    const common = `LOWER(COALESCE(l.incoming_prefix, '') || COALESCE(l.incoming_no, '')) LIKE ? OR printf('%03d', l.po_id) LIKE ?
                    OR LOWER(COALESCE(l.item_name, '') || ' ' || COALESCE(l.variant, '')) LIKE ? OR LOWER(COALESCE(l.vendor_name, '')) LIKE ?`;
    receipt.push(`(${common} OR LOWER(COALESCE(l.bill_no, '')) LIKE ?)`);
    args.receipt.push(like, like, like, like, like);
    challan.push(`(${common} OR LOWER(COALESCE(l.challan_no, '')) LIKE ? OR LOWER(COALESCE(l.party_name, '')) LIKE ?)`);
    args.challan.push(like, like, like, like, like, like);
  }
  if (!receipt.length) return { sql: '', args: [] };
  return {
    sql: `AND ((r.kind = 'receipts' AND EXISTS (SELECT 1 FROM roms_purchase_receipts l WHERE l.record_id = r.id AND ${receipt.join(' AND ')}))
            OR (r.kind = 'challan' AND EXISTS (SELECT 1 FROM roms_purchase_challans l WHERE l.record_id = r.id AND ${challan.join(' AND ')})))`,
    args: [...args.receipt, ...args.challan],
  };
}

// A YYYY-MM month in IST, on the record's date (its line's ROMS entry).
const MONTH_SQL = "strftime('%Y-%m', r.first_at, '+330 minutes')";

// The financial year asked for (else the current one) and a month of it.
function readQuery(page, query = {}, today = todayIst()) {
  if (!PAGES.includes(page)) throw fail(404, 'Purchase Reports has a Warehouse page and a Stitching page');
  const companyId = query.company_id ? Number(query.company_id) : null;
  if (query.company_id && !(Number.isInteger(companyId) && companyId > 0)) throw fail(400, 'Choose the company');
  const month = query.month ? String(query.month) : null;
  // A month without a year is in its own year (a page left open over 1 April).
  const noYear = query.fy == null || query.fy === '';
  const { fy, years } = pickYear(noYear && month && /^\d{4}-\d{2}$/.test(month) ? fyOf(`${month}-01`) : query.fy, today);
  const fyMonths = monthsOf(fy).map((m) => m.month);
  if (month && !fyMonths.includes(month)) throw fail(400, `Choose a month of FY ${fyLabel(fy)} (YYYY-MM)`);
  const asked = query.status && query.status !== 'all' ? String(query.status) : null;
  const status = asked ? (OLD_STATUSES[asked] || asked) : null;
  if (status && !STATUSES.includes(status)) throw fail(400, `status must be one of ${STATUSES.join(', ')} or all`);
  const q = String(query.q || '').trim().slice(0, 100) || null;
  const pageNo = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number.parseInt(query.page_size, 10) || PAGE_SIZE));
  return {
    page, companyId, fy, years, from: fyMonths[0], to: fyMonths[11], month, status, q, pageNo, pageSize, today,
  };
}

// The lines of many records at once: Map(recordId -> [line]).
async function linesFor(client, ids) {
  const out = new Map(ids.map((id) => [id, { receipts: [], challans: [] }]));
  for (const part of chunked(ids)) {
    const [receipts, challans] = await Promise.all([
      rowsOf(client, `SELECT * FROM roms_purchase_receipts WHERE record_id IN (${marks(part.length)})`, part),
      rowsOf(client, `SELECT * FROM roms_purchase_challans WHERE record_id IN (${marks(part.length)})`, part),
    ]);
    for (const r of receipts) out.get(Number(r.record_id))?.receipts.push(r);
    for (const c of challans) out.get(Number(c.record_id))?.challans.push(c);
  }
  return new Map([...out].map(([id, g]) => [id, linesOf(g)]));
}

// The files on many records at once: Map(recordId -> [file]).
async function filesFor(client, ids) {
  const out = new Map();
  for (const part of chunked(ids)) {
    const rows = await rowsOf(client, `SELECT f.id, f.record_id, f.file_name, f.kind, f.uploaded_at, b.size, u.name AS uploaded_by_name
                                         FROM purchase_files f JOIN file_blobs b ON b.id = f.blob_id LEFT JOIN users u ON u.id = f.uploaded_by
                                        WHERE f.record_id IN (${marks(part.length)}) ORDER BY f.id`, part);
    for (const r of rows) {
      const id = Number(r.record_id);
      if (!out.has(id)) out.set(id, []);
      out.get(id).push({
        id: Number(r.id), name: r.file_name, kind: r.kind, size: Number(r.size), uploaded_by_name: r.uploaded_by_name ?? null, uploaded_at: r.uploaded_at, store: 'purchase',
      });
    }
  }
  return out;
}

const SELECT_RECORD = `
  SELECT r.*, ck.name AS checked_by_name, pa.name AS purchase_approved_by_name, aa.name AS accounts_approved_by_name,
         sb.name AS sent_back_by_name
    FROM purchase_records r
    LEFT JOIN users ck ON ck.id = r.checked_by
    LEFT JOIN users pa ON pa.id = r.purchase_approved_by
    LEFT JOIN users aa ON aa.id = r.accounts_approved_by
    LEFT JOIN users sb ON sb.id = r.sent_back_by`;

const stamp = (by, name, at) => (at ? { by: by == null ? null : Number(by), name: name ?? null, at } : null);
const uniq = (list) => [...new Set(list.filter((v) => v != null && v !== ''))];

// One record (one line) for the page. A removed record shows its line as it
// was when checked.
function shape(r, lines, files, last) {
  const id = Number(r.id);
  const snapshot = parse(r.snapshot);
  const shown = lines.length ? lines : ((snapshot && snapshot.lines) || []).map((l) => ({ ...l, removed: true }));
  const first = shown[0] || {};
  return {
    id,
    page: r.page,
    kind: r.kind,
    status: r.status,
    label: recordLabel(r.kind, shown),
    date: r.first_at,
    // The delivery the line is listed with: its Incoming No (or challan).
    delivery: {
      key: r.delivery_key || r.group_key, at: r.delivery_at || r.first_at, label: deliveryLabel(r.kind, shown),
    },
    incoming: uniq(shown.map((l) => l.incoming))[0] || null,
    // A receipt with no Incoming No, which ROMS should have (not one sold straight on).
    no_incoming: r.kind === 'receipts' && !first.removed && !first.incoming && first.stage !== 'Third Party',
    billing: uniq(shown.map((l) => l.billing)),
    vendor: first.vendor ?? null,
    party: first.party ?? null,
    companies: uniq(shown.map((l) => l.company)),
    lines: shown,
    files,
    check: r.checked_at ? { ...stamp(r.checked_by, r.checked_by_name, r.checked_at), note: r.check_note || null } : null,
    // The note of a send that was recalled: kept for the next send.
    draft_note: !r.checked_at && r.check_note ? r.check_note : null,
    purchase_approval: stamp(r.purchase_approved_by, r.purchase_approved_by_name, r.purchase_approved_at),
    accounts_approval: stamp(r.accounts_approved_by, r.accounts_approved_by_name, r.accounts_approved_at),
    sent_back: r.sent_back_at ? { ...stamp(r.sent_back_by, r.sent_back_by_name, r.sent_back_at), step: r.sent_back_step, reason: r.sent_back_reason } : null,
    changed: r.changed_at ? { at: r.changed_at, changes: parse(r.changes) || [] } : null,
    last_change: last || null,
  };
}

async function shapeAll(client, rows) {
  const ids = rows.map((r) => Number(r.id));
  const [lines, files, last] = await Promise.all([
    linesFor(client, ids), filesFor(client, ids), lastChanges(client, 'purchase_records', ids),
  ]);
  return rows.map((r) => shape(r, lines.get(Number(r.id)) || [], files.get(Number(r.id)) || [], last.get(String(r.id))));
}

// Deliveries newest first, each one's lines together in ROMS's order. (A
// record not yet given its delivery -- ROMS unread since migration 023 -- sorts
// by its own date and key.)
const ORDER = 'ORDER BY COALESCE(r.delivery_at, r.first_at) DESC, COALESCE(r.delivery_key, r.group_key), r.first_at, r.id';

/**
 * One page's records: { rows, total, page, page_size, counts: { status: n, all },
 * companies: [{ id, name }], fy, fy_label, years: [{ fy, label }],
 * months: [YYYY-MM, the year's begun months, newest first], today }.
 */
async function listRecords(client, pageName, query, today = todayIst()) {
  const f = readQuery(pageName, query, today);
  const lines = lineFilter(f);
  const base = `FROM purchase_records r WHERE r.page = ? AND ${MONTH_SQL} BETWEEN ? AND ?
                ${f.month ? `AND ${MONTH_SQL} = ?` : ''} ${lines.sql}`;
  const baseArgs = [f.page, f.from, f.to, ...(f.month ? [f.month] : []), ...lines.args];
  const statusSql = f.status ? 'AND r.status = ?' : '';
  const statusArgs = f.status ? [f.status] : [];

  const [countRows, [{ total }], rows, companies] = await Promise.all([
    rowsOf(client, `SELECT r.status, COUNT(*) AS n ${base} GROUP BY r.status`, baseArgs),
    rowsOf(client, `SELECT COUNT(*) AS total ${base} ${statusSql}`, [...baseArgs, ...statusArgs]),
    rowsOf(client, `${SELECT_RECORD} WHERE r.id IN (SELECT r.id ${base} ${statusSql})
                    ${ORDER} LIMIT ? OFFSET ?`,
    [...baseArgs, ...statusArgs, f.pageSize, (f.pageNo - 1) * f.pageSize]),
    rowsOf(client, `SELECT DISTINCT l.company_id AS id, l.company_name AS name FROM (
                      SELECT company_id, company_name, record_id FROM roms_purchase_receipts
                      UNION ALL SELECT company_id, company_name, record_id FROM roms_purchase_challans) l
                      JOIN purchase_records r ON r.id = l.record_id
                     WHERE r.page = ? AND l.company_id IS NOT NULL ORDER BY l.company_name`, [f.page]),
  ]);
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const c of countRows) counts[c.status] = Number(c.n);
  counts.all = Object.values(counts).reduce((a, b) => a + b, 0);
  return {
    rows: await shapeAll(client, rows),
    total: Number(total),
    page: f.pageNo,
    page_size: f.pageSize,
    counts,
    companies: companies.map((c) => ({ id: Number(c.id), name: c.name || `Company ${c.id}` })),
    fy: f.fy,
    fy_label: fyLabel(f.fy),
    years: f.years,
    months: begunMonths(f.fy, today),
    today,
  };
}

// The lines of a record's delivery, for the bill check's ticks: each one's
// record id, status, figures and file count, in ROMS's order.
async function deliveryLines(client, rec) {
  const others = await rowsOf(client, `SELECT r.id, r.status, r.kind FROM purchase_records r
                                        WHERE r.id = ? OR (r.page = ? AND r.delivery_key = ?) ORDER BY r.first_at, r.id`, [rec.id, rec.page, rec.delivery.key]);
  const ids = others.map((o) => Number(o.id));
  const [lines, fileCounts] = await Promise.all([
    linesFor(client, ids),
    rowsOf(client, `SELECT record_id, COUNT(*) AS n FROM purchase_files WHERE record_id IN (${marks(ids.length)}) GROUP BY record_id`, ids),
  ]);
  const files = new Map(fileCounts.map((f) => [Number(f.record_id), Number(f.n)]));
  return others.map((o) => {
    const id = Number(o.id);
    const l = (lines.get(id) || [])[0] || {};
    return {
      id, status: o.status, article: l.article ?? null, billing: l.billing ?? null, po: l.po ?? null, qty: l.qty ?? null, uom: l.uom ?? null, rate: l.rate ?? null, files: files.get(id) || 0,
    };
  });
}

// One record, shaped like a list row (plus its delivery's lines), or null.
async function readRecord(client, id, { delivery = false } = {}) {
  const rows = await rowsOf(client, `${SELECT_RECORD} WHERE r.id = ?`, [Number(id) || 0]);
  if (!rows.length) return null;
  const rec = (await shapeAll(client, rows))[0];
  if (delivery) rec.delivery_lines = await deliveryLines(client, rec);
  return rec;
}

// A record's current lines (for a bill check's snapshot and its label).
async function currentLines(client, id) {
  return (await linesFor(client, [Number(id)])).get(Number(id)) || [];
}

module.exports = {
  listRecords, readRecord, currentLines, linesFor, STATUSES, receiptLine, challanLine,
};
