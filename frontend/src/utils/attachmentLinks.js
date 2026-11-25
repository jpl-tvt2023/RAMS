import { writeSessionState } from '../hooks/useSessionState';

// What Attachments (/reports/attachments) has chosen, kept per tab
// (useSessionState): the company, financial year, tab, the open month, and
// whether only what needs attention is shown.
export const ATTACHMENTS_KEY = 'reports.attachments';
export const ATTACHMENTS_DEFAULTS = {
  company_id: 'default', fy: '', tab: 'invoice', month: '', only: false, q: '',
};

// Tally's base type -> the Attachments tab that lists it.
export const TAB_OF = {
  Sales: 'invoice', Payment: 'payment', 'Debit Note': 'dn', 'Credit Note': 'cn',
};

/**
 * Makes Attachments open on the month of a voucher dated `date`, on the tab
 * of its type, the next time it is shown in this tab -- for a link from
 * another page (File storage). Returns false when no tab lists that type.
 */
export function openAttachmentsAt({ companyId, baseType, date }) {
  const tab = TAB_OF[baseType];
  if (!tab || !/^\d{4}-\d{2}/.test(date || '')) return false;
  const [y, m] = date.split('-').map(Number);
  writeSessionState(ATTACHMENTS_KEY, {
    ...ATTACHMENTS_DEFAULTS, company_id: String(companyId), fy: String(m >= 4 ? y : y - 1), tab, month: date.slice(0, 7),
  });
  return true;
}
