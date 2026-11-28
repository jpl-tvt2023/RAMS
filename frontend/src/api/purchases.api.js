import api from './axios';

// Purchase Reports -> Warehouse and Stitching (backend controllers/purchases.controller.js):
// ROMS's receipts and challans as records, each with its files, bill check and
// the Purchase Head -> Accountant Head approval. Seeing it is purchases.view;
// the bill check and files are purchases.check; each head's step is its own
// permission. Files on a record go through api/files.api.js with
// { purchaseRecordId }.

// page: 'warehouse' | 'stitching'.
// -> { rows: [record], total, page, page_size, counts: { <status>: n, all },
//      companies: [{ id, name }], months: ['YYYY-MM'], roms: { connected, read_at, error } }
// record: { id, kind, status, label, date, incoming, no_incoming, billing: [], vendor, party,
//           lines: [{ key, incoming, date, billing, po, article, rate, qty, uom, from_stage, to_stage, removed? }],
//           files, check: { name, at, note }, purchase_approval, accounts_approval,
//           sent_back: { name, at, step, reason }, changed: { at, changes }, last_change }
export async function getPurchaseRecords(page, params) {
  const { data } = await api.get(`/purchases/${page}/records`, { params });
  return data;
}

// Read ROMS now. -> { ok, error?, roms }
export async function refreshPurchases() {
  const { data } = await api.post('/purchases/refresh');
  return data;
}

// Save the bill check: the record goes to the Purchase Head. -> record
export async function saveBillCheck(id, note) {
  const { data } = await api.post(`/purchases/records/${id}/check`, { note });
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
