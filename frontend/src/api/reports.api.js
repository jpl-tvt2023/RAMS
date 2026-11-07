import api from './axios';

// Reports (backend controllers/reports.controller.js), worked out from the
// Tally copy at read time. Seeing them is reports.view; credit terms and
// exception days are reports.settings.

const getter = (path) => async (params) => {
  const { data } = await api.get(`/reports/${path}`, { params });
  return data;
};

// company_id may be 'default' (the company set on Admin -> Tally companies).
// { rows, total, page, page_size, totals, tabs: [{ vendor, count }], all, unknown, companies, company_id, as_of }
export const getDebtors = getter('debtors');
// { rows, total, page, page_size, totals, vendors, companies, as_of }
export const getInvoices = getter('invoices');
// { rows, total, page, page_size, totals, companies }
export const getNotes = getter('notes');
export const getTransfers = getter('transfers');
// { rows, totals, buckets, as_of, companies, settings }
export const getReceivables = getter('receivables');
// { categories: [{ code, count, rows }], exception_days, as_of, companies }
export const getExceptions = getter('exceptions');
// { settings, terms: [{ vendor, credit_days, transfer, updated_at, updated_by_name }] }
export const getReportSettings = getter('settings');

export async function updateReportSettings(body) {
  const { data } = await api.put('/reports/settings', body);
  return data;
}

// credit_days null = the default
export async function updateTerms(vendor, creditDays) {
  const { data } = await api.put(`/reports/terms/${encodeURIComponent(vendor)}`, { credit_days: creditDays });
  return data;
}

// What a change to credit days would do, before it is saved. vendor null is
// the default; creditDays null (with a vendor) is "use the default".
// { vendor, credit_days, effective_days, open_invoices, overdue_now, overdue_after,
//   become_overdue, become_overdue_paise, stop_overdue, stop_overdue_paise }
export async function previewTerms(vendor, creditDays) {
  const { data } = await api.get('/reports/terms/preview', {
    params: { ...(vendor ? { vendor } : {}), credit_days: creditDays == null ? '' : creditDays },
  });
  return data;
}
