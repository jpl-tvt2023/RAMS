import api from './axios';

// Ledgers (backend controllers/ledgers.controller.js): a party's day, typed in
// RAMS and checked against Tally. Seeing it is ledgers.view, recording entries
// is ledgers.entry, the settings are ledgers.settings.

// company_id may be 'default'.
// { companies, company_id, today, sync_from, vendors: [{ vendor, flagged_days, parties: [...] }], attention: [...], attention_total }
export async function getLedgerParties(params) {
  const { data } = await api.get('/ledgers/parties', { params });
  return data;
}

// { party, date, today, sync_from, as_of, start, opening_paise, started_on, settings, entries, tally_only,
//   rams_closing_paise, tally_closing_paise, difference_paise, status, companies, company_id }
export async function getLedgerDay(params) {
  const { data } = await api.get('/ledgers/day', { params });
  return data;
}

// { company_id, ledger_guid, date, kind, number?, reference?, amount_paise, note? } -> { id }
export async function createLedgerEntry(body) {
  const { data } = await api.post('/ledgers/entries', body);
  return data;
}

export async function updateLedgerEntry(id, body) {
  const { data } = await api.put(`/ledgers/entries/${id}`, body);
  return data;
}

export async function deleteLedgerEntry(id) {
  const { data } = await api.delete(`/ledgers/entries/${id}`);
  return data;
}

// { grace_days, amount_tolerance_paise, default_opening_paise, updated_at, updated_by_name }
export async function getLedgerSettings() {
  const { data } = await api.get('/ledgers/settings');
  return data;
}

export async function updateLedgerSettings(body) {
  const { data } = await api.put('/ledgers/settings', body);
  return data;
}
