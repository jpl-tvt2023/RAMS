// The words and colours the Ledgers page uses for what RAMS found, in one
// place so the page and its Help say the same thing.
import { formatDay, formatRupees } from './formatters';

export const KINDS = [
  { key: 'invoice', label: 'Invoice', numberLabel: 'Invoice no', adds: true },
  { key: 'debit_note', label: 'Debit note', numberLabel: 'Debit note no', adds: true },
  { key: 'credit_note', label: 'Credit note', numberLabel: 'Credit note no', adds: false },
  { key: 'receipt', label: 'Receipt', numberLabel: 'Receipt no (optional)', adds: false },
];
export const KIND = Object.fromEntries(KINDS.map((k) => [k.key, k]));

// An entry typed in RAMS, against Tally.
export function entryStatus(e) {
  switch (e.status) {
    case 'in_tally': return { color: 'green', label: 'In Tally', detail: e.tally?.number ? `${e.tally.voucher_type} ${e.tally.number}` : e.tally?.voucher_type };
    case 'amount_differs': return { color: 'red', label: 'Amount differs', detail: `Tally has ${formatRupees(e.tally?.amount_paise)} on ${e.tally?.number || e.tally?.voucher_type}` };
    case 'other_date': return { color: 'red', label: 'Different day', detail: `In Tally on ${formatDay(e.tally?.date)}` };
    case 'waiting': return { color: 'amber', label: 'Not in Tally yet', detail: 'Tally may not be written up yet' };
    case 'missing': return { color: 'red', label: 'Not in Tally', detail: 'No matching voucher in Tally' };
    default: return { color: 'gray', label: e.status, detail: '' };
  }
}

// A Tally voucher nobody entered in RAMS for that day.
export function tallyOnlyStatus(v) {
  switch (v.status) {
    case 'only_in_tally': return { color: 'red', label: 'Only in Tally', detail: 'Not entered in RAMS' };
    case 'waiting': return { color: 'amber', label: 'Not entered here yet', detail: '' };
    case 'other_date': return { color: 'red', label: 'Entered on another day', detail: `Entered in RAMS on ${formatDay(v.entered_on)}` };
    case 'not_checked': return { color: 'gray', label: 'Not checked', detail: 'Before this party’s first entry' };
    default: return { color: 'gray', label: v.status, detail: '' };
  }
}

// The day as a whole.
export function dayStatus(day) {
  const diff = day.difference_paise;
  switch (day.status) {
    case 'matches': return { color: 'green', label: 'Matches Tally', detail: 'Every entry is in Tally, and Tally has nothing more.' };
    case 'waiting': return { color: 'amber', label: 'Waiting for Tally', detail: `Something is not on both sides yet. Each side has ${day.settings?.grace_days} days to catch up before it is flagged.` };
    case 'differs': return { color: 'red', label: `Differs from Tally by ${formatRupees(Math.abs(diff))}`, detail: diff > 0 ? 'RAMS’s closing is higher than Tally’s.' : diff < 0 ? 'RAMS’s closing is lower than Tally’s.' : 'The closings agree, but the entries don’t pair up.' };
    case 'not_started': return { color: 'gray', label: 'Not checked', detail: day.started_on ? `This party is checked from its first entry, on ${formatDay(day.started_on)}.` : 'Nothing has been entered for this party yet. The check starts from its first entry.' };
    case 'empty': return { color: 'gray', label: 'Nothing on this day', detail: 'No entry in RAMS and no voucher in Tally.' };
    default: return { color: 'gray', label: day.status, detail: '' };
  }
}

export const OPENING_SOURCE = {
  tally: { color: 'green', label: 'From Tally' },
  loaded: { color: 'blue', label: 'Loaded' },
  placeholder: { color: 'amber', label: 'Placeholder, not from Tally' },
};

// "1,180.50" / "₹1180.5" -> 118050 paise; null when it isn't a sum of money.
export function paiseFrom(text) {
  const s = String(text ?? '').replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

// "₹15,000.00 Dr" -- what the party owes, or "Cr" when we owe it.
export function balance(paise) {
  if (paise == null) return '—';
  if (paise === 0) return formatRupees(0);
  return `${formatRupees(Math.abs(paise))} ${paise > 0 ? 'Dr' : 'Cr'}`;
}
