import api from './axios';

// Ledgers (backend controllers/ledgers.controller.js): the bill-to-bill
// statement per party, every row Tally's. Seeing it is ledgers.view, the
// settings are ledgers.settings. Files on its rows are api/files.api.js.

// { today, sync_from, month_start, companies, marketplaces: [{ vendor, parties, bill_to_bill }],
//   parties: [{ company_id, company, guid, name, vendor, suggested, state, tally_state, gst_state, state_differs }],
//   attention: [{ party, counts, since, state_differs }], attention_total }
export async function getLedgerParties() {
  const { data } = await api.get('/ledgers/parties');
  return data;
}

// A list goes as one comma-joined string ('all' for everything): the
// backend's query parser doesn't read arrays.
const listParam = (v) => (v === 'all' ? 'all' : [...v].sort().join(','));

// { company_id: 'all' | id, vendor: 'all' | name, states: 'all' | [names],
//   parties: 'all' | ['companyId:guid'], from?, to? }
// -> { from, to, today, as_of, rows: [{ party, start, opening_paise, columns, closing_paise, checks, narration_missing, rows_without_file }], totals }
export async function getLedgerStatement({
  company_id, vendor, states, parties, from, to,
}) {
  const { data } = await api.get('/ledgers/statement', {
    params: {
      company_id, vendor, states: listParam(states), parties: listParam(parties), from: from || undefined, to: to || undefined,
    },
  });
  return data;
}

// One party over a range: the statement row, and Tally's vouchers with
// narration, files and running balance.
export async function getLedgerParty(params) {
  const { data } = await api.get('/ledgers/party', { params });
  return data;
}

// { default_opening_paise, marketplaces, known_marketplaces, updated_at, updated_by_name }
export async function getLedgerSettings() {
  const { data } = await api.get('/ledgers/settings');
  return data;
}

export async function updateLedgerSettings(body) {
  const { data } = await api.put('/ledgers/settings', body);
  return data;
}
