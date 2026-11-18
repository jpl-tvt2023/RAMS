import { writeSessionState } from '../hooks/useSessionState';

// What Ledgers has chosen, kept per tab (useSessionState): the company, the
// marketplace, states, parties, the range, the open party, and whether only
// the rows without a file are shown. It opens on the default company (the
// star on Admin -> Tally companies; 'default' until the page knows which),
// every bill-to-bill marketplace, all states and parties, this month. (The key
// moved to .v2 when it stopped opening on nothing chosen.)
export const FILTERS_KEY = 'ledgers.filters.v2';
export const DEFAULTS = {
  company: 'default', vendor: 'all', states: 'all', parties: 'all', from: '', to: '', open: null, nofile: false,
};

/**
 * Makes Ledgers open on one party, from `date` to today, the next time it is
 * shown in this tab -- for a link from another page (File storage, Debtors).
 * A date before RAMS's copy of Tally starts begins at its start. nofile shows
 * only the rows without a file.
 */
export function openLedgersAt({
  companyId, vendor, guid, date, syncFrom, nofile = false,
}) {
  const key = `${companyId}:${guid}`;
  const from = date && syncFrom && date < syncFrom ? syncFrom : (date || '');
  writeSessionState(FILTERS_KEY, {
    ...DEFAULTS, company: String(companyId), vendor, states: 'all', parties: [key], from, to: '', open: key, nofile,
  });
}
