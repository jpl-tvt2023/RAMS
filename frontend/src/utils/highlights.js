// The colours RAMS's badges and highlights use, shared by Badge, Legend and
// the Narration cell.

export const BADGE_COLORS = {
  red: 'bg-red-100 text-red-700 border-red-200',
  green: 'bg-green-100 text-green-700 border-green-200',
  blue: 'bg-blue-100 text-blue-700 border-blue-200',
  amber: 'bg-amber-100 text-amber-700 border-amber-200',
  purple: 'bg-purple-100 text-purple-700 border-purple-200',
  brand: 'bg-brand text-white border-transparent',
  gray: 'bg-gray-100 text-gray-600 border-gray-200',
};

// A Tally record without a narration, when the narration check wants one: a
// bright yellow highlighter fill with these words. Nothing else uses it.
export const NO_NARRATION = {
  label: 'No narration',
  help: 'Tally has no narration on this record. Ask the accountant to add one in Tally.',
  className: 'bg-yellow-200 text-yellow-900',
};

// A Tally row on Party Statements with no file on it (its document: the invoice, the
// marketplace's DN, our CN, the payment or TDS advice): the whole row gets a
// warm orange fill, with these words in its Files cell. Like the narration
// highlight it is a fill, never a status badge, and nothing else on the screen
// is orange. On Bills Receivable it marks an invoice (of a party on Party Statements) with a DN
// or CN against it that has no file, and that note in the CN popup.
export const NO_FILE = {
  label: 'No file',
  help: 'No PDF, photo or email on this row yet. Add its document: the invoice, the marketplace’s DN, our CN, or the payment or TDS advice.',
  invoiceHelp: 'A DN or CN against this invoice has no file yet. Open its credit notes to see which, and add it on Party Statements.',
  className: 'bg-orange-200 text-orange-900',
  row: 'bg-orange-100',
};

// For a CSV: the narration, or "(no narration)" when it is missing.
export const narrationForCsv = (r) => r.narration || (r.narration_missing ? '(no narration)' : '');
