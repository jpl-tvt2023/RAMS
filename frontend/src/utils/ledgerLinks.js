import { writeSessionState } from '../hooks/useSessionState';

// What Ledgers has chosen, kept per tab (useSessionState): the company, the
// marketplace, states, parties, the range, the open party, and whether only
// the notes without a file are shown.
export const FILTERS_KEY = 'ledgers.filters';
export const DEFAULTS = {
  company: null, vendor: null, states: null, parties: null, from: '', to: '', open: null, nofile: false,
};

/**
 * Makes Ledgers open on one party, from `date` to today, the next time it is
 * shown in this tab -- for a link from another page (File storage). A date
 * before RAMS's copy of Tally starts begins at its start.
 */
export function openLedgersAt({
  companyId, vendor, guid, date, syncFrom,
}) {
  const key = `${companyId}:${guid}`;
  const from = date && syncFrom && date < syncFrom ? syncFrom : (date || '');
  writeSessionState(FILTERS_KEY, {
    ...DEFAULTS, company: String(companyId), vendor, states: 'all', parties: [key], from, to: '', open: key,
  });
}
