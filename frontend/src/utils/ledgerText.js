// The words, colours and icons the Ledgers page uses for what RAMS found, in
// one place so the badges, the statement's cells, the legend and the Help say
// the same thing. One colour, one meaning: CHECK holds them, and a test fails
// if a colour is used for two. Every row is Tally's -- nothing is typed on
// Ledgers -- so what RAMS can find is two readings that disagree.
import { EqualNot } from 'lucide-react';
import { formatDay, formatRupees } from './formatters';

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
  differs: {
    color: 'purple', icon: EqualNot, label: 'Differs', help: 'Two readings disagree: a marketplace DN on two credit notes in Tally, or a party’s state in Tally and in its GSTIN.',
  },
};
export const LEGEND = Object.entries(CHECK).map(([key, c]) => ({ key, ...c }));

// Each status the backend sends, by meaning.
const MEANING = { booked_twice: 'differs' };
const as = (status, label, detail) => ({ ...CHECK[MEANING[status]], meaning: MEANING[status], label, detail });

// A Tally credit note, as RAMS read it: a DN booked twice, or nothing to say.
export function noteStatus(note) {
  if (note?.status !== 'booked_twice') return null;
  return as('booked_twice', 'DN booked twice', note.also_on ? `Also on CN ${note.also_on.number} of ${formatDay(note.also_on.date)}` : '');
}

// The marketplace DN numbers a credit note's narration names, for its row:
// "DN FKIDN51803946". Empty for our own credit notes.
export const dnNumbers = (note) => (note?.named?.length ? `DN ${note.named.join(', ')}` : '');

// A statement cell's findings: icon-and-count chips by meaning, the cell's
// tint and the sentence for hovering.
const COUNT_WORDS = { booked_twice: (n) => `${n} DN booked twice` };
const TINT = { differs: 'bg-purple-50' };

export function cellFindings(counts = {}) {
  const byMeaning = {};
  for (const [status, n] of Object.entries(counts)) {
    if (!n || !MEANING[status]) continue;
    byMeaning[MEANING[status]] = (byMeaning[MEANING[status]] || 0) + n;
  }
  const chips = Object.keys(CHECK).filter((m) => byMeaning[m]).map((m) => ({ meaning: m, count: byMeaning[m], ...CHECK[m] }));
  const worst = Object.keys(CHECK).find((m) => byMeaning[m]);
  const sentence = Object.entries(counts).filter(([s, n]) => n && COUNT_WORDS[s]).map(([s, n]) => COUNT_WORDS[s](n)).join(', ');
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
