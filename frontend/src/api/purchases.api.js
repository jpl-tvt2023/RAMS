import api from './axios';

// Purchase Reports -> Warehouse and Stitching (backend controllers/purchases.controller.js):
// ROMS's receipts and challans, one record per ROMS line -- listed by delivery
// (an Incoming No from one vendor, or a challan) -- each with its files, bill
// check and the Purchase Head -> Accountant Head approval. Seeing it is
// purchases.view; the bill check and files are purchases.check; each head's
// step is its own permission. Files on a record go through api/files.api.js
// with { purchaseRecordId, also }.

// page: 'warehouse' | 'stitching'. params: { company_id, fy, month, status, q, page, page_size }
// -> { rows: [record], total, page, page_size, counts: { <status>: n, all },
//      companies: [{ id, name }], fy, fy_label, years: [{ fy, label }],
//      months: ['YYYY-MM', the year's begun months, newest first], today,
//      roms: { connected, read_at, error } }
// record: { id, kind, status, label, date, delivery: { key, at, label }, incoming, no_incoming,
//           billing: [], vendor, party,
//           lines: [{ key, incoming, date, billing, po, article, rate, qty, uom, from_stage, to_stage, removed? }] (one),
//           files, check: { name, at, note }, purchase_approval, accounts_approval,
//           sent_back: { name, at, step, reason }, changed: { at, changes }, last_change }
export async function getPurchaseRecords(page, params) {
  const { data } = await api.get(`/purchases/${page}/records`, { params });
  return data;
}

// One record, with its delivery's lines for the bill check's ticks:
// record + { delivery_lines: [{ id, status, article, billing, po, qty, uom, rate, files }] }
export async function getPurchaseRecord(id) {
  const { data } = await api.get(`/purchases/records/${id}`);
  return data;
}

// Read ROMS now. -> { ok, error?, roms }
export async function refreshPurchases() {
  const { data } = await api.post('/purchases/refresh');
  return data;
}

// Save one bill check on these records (the ticked lines of a delivery): each
// goes to the Purchase Head. -> { checked, skipped: [{ id, reason }] }
export async function saveBillChecks(ids, note) {
  const { data } = await api.post('/purchases/check', { ids, note });
  return data;
}

// step: 'purchase' | 'accounts'. -> { approved, skipped: [{ id, reason }] }
export async function approvePurchaseRecords(step, ids) {
  const { data } = await api.post(`/purchases/${step === 'purchase' ? 'purchase' : 'accounts'}-head/approve`, { ids });
  return data;
}

// -> record
export async function sendBackPurchaseRecord(step, id, reason) {
  const { data } = await api.post(`/purchases/records/${id}/${step === 'purchase' ? 'purchase' : 'accounts'}-head/send-back`, { reason });
  return data;
}
