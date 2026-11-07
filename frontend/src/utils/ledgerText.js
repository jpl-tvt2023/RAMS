// The words, colours and icons the Ledgers page uses for what RAMS found, in
// one place so the badges, the statement's cells, the legend and the Help say
// the same thing. One colour, one meaning: CHECK holds them, and a test fails
// if a colour is used for two.
import {
  CircleCheck, EqualNot, Scale, Hourglass, CircleX,
} from 'lucide-react';
import { formatDay, formatRupees } from './formatters';

// What can be typed here. Both take the balance down.
export const KINDS = [
  {
    key: 'debit_note', label: 'Marketplace DN', long: 'marketplace debit note', numberLabel: 'DN number', placeholder: 'e.g. FKIDN51463346',
  },
  {
    key: 'credit_note', label: 'Our CN', long: 'credit note', numberLabel: 'CN number (as in Tally)', placeholder: 'e.g. 709',
  },
];
export const KIND = Object.fromEntries(KINDS.map((k) => [k.key, k]));

// The statement's columns, in order.
export const COLUMNS = [
  { key: 'invoice', label: 'Invoice' },
  { key: 'dn', label: 'DN' },
  { key: 'cn', label: 'CN' },
  { key: 'tds', label: 'TDS' },
  { key: 'journal', label: 'Journal / Adj' },
  { key: 'receipt', label: 'Receipt' },
];
export const COLUMN = Object.fromEntries(COLUMNS.map((c) => [c.key, c]));

// The meanings, each with its own colour.
export const CHECK = {
  match: {
    color: 'green', icon: CircleCheck, label: 'Matches', help: 'What is typed here and Tally agree.',
  },
  differs: {
    color: 'purple', icon: EqualNot, label: 'Differs', help: 'Two sources disagree: an amount, a DN booked twice in Tally, or a party’s state in Tally and in its GSTIN.',
  },
  by_amount: {
    color: 'blue', icon: Scale, label: 'Matched by amount', help: 'Tally has a credit note for the same amount, but its narration doesn’t name the DN. Add the DN number to its narration in Tally.',
  },
  waiting: {
    color: 'gray', icon: Hourglass, label: 'Waiting', help: 'Not on the other side yet, but still within the days allowed.',
  },
  missing: {
    color: 'red', icon: CircleX, label: 'Missing', help: 'On one side only: typed here but not in Tally, or in Tally but not typed here.',
  },
};
export const LEGEND = Object.entries(CHECK).map(([key, c]) => ({ key, ...c }));

// Each status the backend sends, by meaning.
const MEANING = {
  in_tally: 'match',
  entered: 'match',
  amount_differs: 'differs',
  booked_twice: 'differs',
  by_amount: 'by_amount',
  waiting: 'waiting',
  missing: 'missing',
  not_entered: 'missing',
};
const as = (status, label, detail) => ({ ...CHECK[MEANING[status]], meaning: MEANING[status], label, detail });
const cnName = (t) => (t ? `${t.voucher_type === 'Credit Note' || !t.voucher_type ? 'CN' : t.voucher_type} ${t.number || ''}`.trim() : '');

// A note typed here, against Tally.
export function entryStatus(e, settings = {}) {
  const t = e.tally;
  switch (e.status) {
    case 'in_tally': return as('in_tally', 'In Tally', t ? `${cnName(t)} on ${formatDay(t.date)}` : '');
    case 'amount_differs': return as('amount_differs', 'Amount differs', t ? `Tally has ${formatRupees(t.amount_paise)} on ${cnName(t)}` : '');
    case 'by_amount': return as('by_amount', 'Matched by amount', t ? `${cnName(t)} on ${formatDay(t.date)} has the same amount. Add ${e.number} to its narration in Tally.` : '');
    case 'waiting': return as('waiting', 'Not in Tally yet', `Tally may take up to ${settings.match_window_days ?? 60} days to book it.`);
    case 'missing': return as('missing', 'Not in Tally', 'No credit note in Tally names it or has its amount.');
    default: return { color: 'gray', label: e.status, detail: '' };
  }
}

// A Tally credit note, against the notes typed here. Not checked is plain
// text, not a badge: it is no finding.
export function noteStatus(note) {
  if (!note) return null;
  const typed = note.entries.map((e) => `${KIND[e.kind]?.label || e.kind} ${e.number}`).join(', ');
  switch (note.status) {
    case 'entered': return as('entered', 'Entered here', `as ${typed}`);
    case 'amount_differs': return as('amount_differs', 'Amount differs', `Entered here as ${typed} for ${formatRupees(note.entries.reduce((a, e) => a + e.amount_paise, 0))}`);
    case 'by_amount': return as('by_amount', 'Matched by amount', `to ${typed}`);
    case 'booked_twice': return as('booked_twice', 'DN booked twice', note.also_on ? `Also on CN ${note.also_on.number} of ${formatDay(note.also_on.date)}` : '');
    case 'waiting': return as('waiting', 'Not entered here yet', '');
    case 'not_entered': return as('not_entered', 'Not entered here', note.named?.length ? `It names ${note.named.join(', ')}. Type that DN here.` : 'No DN or CN typed here pairs with it.');
    case 'not_checked': return { color: null, label: 'Not checked', detail: 'Before this party’s first entry' };
    default: return { color: 'gray', label: note.status, detail: '' };
  }
}

// A statement cell's findings: icon-and-count chips by meaning, the cell's
// tint (its most urgent colour) and the sentence for hovering.
const COUNT_WORDS = {
  missing: (n, k) => `${n} ${k} not in Tally`,
  not_entered: (n) => `${n} in Tally not entered here`,
  amount_differs: (n) => `${n} amount differs`,
  booked_twice: (n) => `${n} DN booked twice`,
  by_amount: (n) => `${n} matched by amount`,
  waiting: (n) => `${n} waiting`,
};
const URGENCY = ['missing', 'differs', 'by_amount'];
const TINT = { missing: 'bg-red-50', differs: 'bg-purple-50', by_amount: 'bg-blue-50' };

export function cellFindings(counts = {}, kind = 'DN') {
  const byMeaning = {};
  for (const [status, n] of Object.entries(counts)) {
    if (!n) continue;
    const m = MEANING[status];
    byMeaning[m] = (byMeaning[m] || 0) + n;
  }
  const chips = ['missing', 'differs', 'by_amount', 'waiting'].filter((m) => byMeaning[m]).map((m) => ({ meaning: m, count: byMeaning[m], ...CHECK[m] }));
  const worst = URGENCY.find((m) => byMeaning[m]);
  const sentence = Object.entries(counts).filter(([, n]) => n).map(([s, n]) => COUNT_WORDS[s]?.(n, kind)).filter(Boolean).join(', ');
  return { chips, tint: worst ? TINT[worst] : '', sentence };
}

export const STATE_DIFFERS = { ...CHECK.differs, label: 'State differs' };

// Labels that only inform are grey.
export const OPENING_SOURCE = {
  tally: { label: 'From Tally' },
  loaded: { label: 'Loaded' },
  placeholder: { label: 'Placeholder, not from Tally' },
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

// "+₹100.00" / "−₹3.00" / "—" for a movement.
export const signed = (effect) => (effect ? `${effect > 0 ? '+' : '−'}${formatRupees(Math.abs(effect))}` : '—');
