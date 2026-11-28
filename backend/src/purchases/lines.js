// Purchase Reports: how ROMS's receipts and challans (RAMS's copy, migration
// 022) become the lines on the Warehouse and Stitching pages, how lines group
// into records, and what a bill check remembers of them. Pure functions -- the
// reading and writing is in refresh.js, records.js and approval.js.
//
// The user's rules (2026-11-28):
//   - a receipt is on Warehouse when its article never goes through Stitching
//     (ROMS's goes_to_stitching tick), else on Stitching. Every challan is on
//     Stitching.
//   - receipts sharing an Incoming No from one vendor are ONE record (one
//     delivery): one set of files, one bill check, one approval. The Incoming
//     No isn't unique in ROMS -- the same number from another vendor is another
//     delivery, so the vendor is part of the key. A receipt with no Incoming No
//     stands alone.
//   - each challan is its own record: its lines share the parent lot, the
//     challan no and the party (a challan into Stitching has one ROMS row per
//     line).

const PAGES = ['warehouse', 'stitching'];

const text = (v) => (v == null ? '' : String(v).trim());
const num = (v) => (v == null || v === '' ? null : Number(v));
const fold = (s) => s.toLowerCase().replace(/\s+/g, ' ');
// ROMS prints an outbound PO's number as its id, zero-padded to three digits.
const poNo = (id) => (id == null ? null : String(id).padStart(3, '0'));
const articleOf = (row) => [text(row.item_name), text(row.variant)].filter(Boolean).join(' - ') || null;
// Prefix then number, the way every ROMS screen prints it (PRC786).
const incomingOf = (row) => `${text(row.incoming_prefix)}${text(row.incoming_no)}` || null;

const pageOfReceipt = (r) => (Number(r.goes_to_stitching) === 1 ? 'stitching' : 'warehouse');

// A challan's rate and quantity in the same unit, so Rate x Qty is the job
// work: metres out of Processing, dozens after it. rate_unit says what the rate
// was written in (a few old Processing challans are per dozen), else the stage
// the goods left decides.
function challanUnit(c) {
  const perMetre = c.rate_unit ? c.rate_unit === 'metre' : c.from_stage === 'Processing';
  if (perMetre) return { qty: num(c.sent_qty), uom: 'm' };
  return { qty: num(c.sent_dozens ?? c.received_dozens), uom: 'dz' };
}

function receiptLine(r) {
  return {
    key: `r${r.id}`,
    src: 'receipt',
    id: Number(r.id),
    incoming: incomingOf(r),
    date: r.created_at || null,
    billing: text(r.bill_no) || null,
    po: poNo(r.po_id),
    article: articleOf(r),
    rate: num(r.received_rate),
    qty: num(r.received_qty),
    uom: text(r.unit_metric) || null,
    po_rate: num(r.po_rate),
    stage: r.stage || null,
    warehouse: r.warehouse_name || null,
    vendor: r.vendor_name || null,
    party: null,
    company_id: r.company_id == null ? null : Number(r.company_id),
    company: r.company_name || null,
  };
}

function challanLine(c) {
  return {
    key: `c${c.id}`,
    src: 'challan',
    id: Number(c.id),
    incoming: incomingOf(c),
    date: c.created_at || null,
    billing: text(c.challan_no) || null,
    po: poNo(c.po_id),
    article: articleOf(c),
    rate: num(c.process_rate),
    ...challanUnit(c),
    from_stage: c.from_stage || null,
    to_stage: c.to_stage || null,
    warehouse: c.warehouse_name || null,
    vendor: c.vendor_name || null,
    party: c.party_name || null,
    company_id: c.company_id == null ? null : Number(c.company_id),
    company: c.company_name || null,
  };
}

// The record a receipt belongs to: { key, page, kind }.
function receiptGroup(r) {
  const page = pageOfReceipt(r);
  const incoming = incomingOf(r);
  const key = incoming ? `inc:${page}:${Number(r.vendor_id) || 0}:${fold(incoming)}` : `rcpt:${Number(r.id)}`;
  return { key, page, kind: 'receipts' };
}

// The header a challan's lines share. The record's key is its lowest ROMS id,
// set once the lines are gathered (groupLines).
const challanHeader = (c) => [c.parent_src, Number(c.parent_id) || 0, fold(text(c.challan_no)), fold(text(c.party_name))].join('|');

/**
 * Every receipt and challan in RAMS's copy, as records:
 * Map(key -> { key, page, kind, receipts: [rows], challans: [rows], first_at }).
 */
function groupLines(receipts, challans) {
  const groups = new Map();
  const add = (g, field, row) => {
    if (!groups.has(g.key)) groups.set(g.key, { ...g, receipts: [], challans: [], first_at: null });
    const into = groups.get(g.key);
    into[field].push(row);
    if (row.created_at && (!into.first_at || row.created_at < into.first_at)) into.first_at = row.created_at;
  };
  for (const r of receipts) add(receiptGroup(r), 'receipts', r);
  const byHeader = new Map();
  for (const c of challans) {
    const h = challanHeader(c);
    if (!byHeader.has(h)) byHeader.set(h, []);
    byHeader.get(h).push(c);
  }
  for (const rows of byHeader.values()) {
    const first = Math.min(...rows.map((c) => Number(c.id)));
    for (const c of rows) add({ key: `chal:${first}`, page: 'stitching', kind: 'challan' }, 'challans', c);
  }
  return groups;
}

// A record's lines, in a stable order (ROMS id).
function linesOf({ receipts = [], challans = [] }) {
  return [...receipts.map(receiptLine), ...challans.map(challanLine)].sort((a, b) => a.key.localeCompare(b.key, 'en', { numeric: true }));
}

// What a bill check remembers: the figures the person checked, line by line.
const SNAPSHOT_FIELDS = [
  ['incoming', 'Incoming'], ['billing', 'Bill / Challan no'], ['po', 'PO'], ['article', 'Article'],
  ['rate', 'Rate'], ['qty', 'Qty'], ['uom', 'UOM'],
];

function snapshotOf(lines) {
  return {
    lines: lines.map((l) => Object.fromEntries([['key', l.key], ...SNAPSHOT_FIELDS.map(([f]) => [f, l[f] ?? null])])),
  };
}

const show = (v) => (v == null || v === '' ? null : String(v));
const lineLabel = (l) => [l.article || 'A line', l.po ? `PO ${l.po}` : null].filter(Boolean).join(', ');
const lineSummary = (l) => [l.billing, l.qty != null ? `${l.qty} ${l.uom || ''}`.trim() : null, l.rate != null ? `@ ${l.rate}` : null]
  .filter(Boolean).join(' ') || 'a line';

/**
 * What ROMS changed since the bill check, as audit changes [{ field, old, new }]:
 * a line gone, a line added, or a figure on a line.
 */
function diffSnapshot(before, lines) {
  const was = new Map(((before && before.lines) || []).map((l) => [l.key, l]));
  const now = new Map(snapshotOf(lines).lines.map((l) => [l.key, l]));
  const changes = [];
  for (const [key, old] of was) {
    const cur = now.get(key);
    if (!cur) {
      changes.push({ field: lineLabel(old), old: lineSummary(old), new: 'removed in ROMS' });
      continue;
    }
    for (const [f, label] of SNAPSHOT_FIELDS) {
      if (show(old[f]) !== show(cur[f])) changes.push({ field: `${lineLabel(cur)}: ${label}`, old: show(old[f]), new: show(cur[f]) });
    }
  }
  for (const [key, cur] of now) {
    if (!was.has(key)) changes.push({ field: lineLabel(cur), old: null, new: `added in ROMS: ${lineSummary(cur)}` });
  }
  return changes;
}

// How a record is named in its history and messages.
function recordLabel(kind, lines) {
  const first = lines[0] || {};
  if (kind === 'challan') {
    return `Challan ${first.billing || '(no number)'}${first.party ? ` from ${first.party}` : ''}`;
  }
  const who = first.vendor ? ` (${first.vendor})` : '';
  if (first.incoming) return `Incoming ${first.incoming}${who}`;
  return `Bill ${first.billing || '(no number)'}${who}`;
}

module.exports = {
  PAGES, poNo, receiptLine, challanLine, receiptGroup, groupLines, linesOf, snapshotOf, diffSnapshot, recordLabel, SNAPSHOT_FIELDS,
};
