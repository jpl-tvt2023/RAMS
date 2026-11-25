import api from './axios';

// Tally Reports -> Attachments (backend controllers/attachments.controller.js):
// a company's vouchers in a financial year, by tab and month, with what each
// still needs. Seeing it is attachments.view. Files on its rows are
// api/files.api.js.

// { company_id, companies, fy, fy_label, years: [{ fy, label }], today, sync_from, as_of,
//   narration: { types, required_from },
//   tabs: [{ key, label, base_type, side, einvoice, number_label,
//            months: [{ month, label, in_copy, from, vouchers, needs_attention, no_narration, no_file, debit_paise, credit_paise, closing_paise }],
//            totals }] }
export async function getAttachmentMonths({ company_id, fy }) {
  const { data } = await api.get('/attachments/months', { params: { company_id, fy } });
  return data;
}

// { company_id, company, fy, tab, month, label, from, counts: { all, needs_attention },
//   totals, einvoice_unread, total, page, page_size,
//   rows: [{ id, guid, number, date, voucher_type, amount_paise, party, ledger, ledgers, city, city_from, pincode,
//            einvoice: { read, irn, ack_no, ack_date, cancelled }, narration, narration_missing,
//            has_file, files, needs_attention, last_change: { user_name, at, action_type, description } | null }] }
export async function getAttachmentVouchers({
  company_id, fy, tab, month, only, q, page, page_size,
}) {
  const { data } = await api.get('/attachments/vouchers', {
    params: {
      company_id, fy, tab, month, only, q, page, page_size,
    },
  });
  return data;
}
