// Help: Ledgers -- a party's day, entered in RAMS and checked against Tally.
export const ledgersHelp = {
  id: 'ledgers',
  path: '/ledgers',
  area: 'Ledgers',
  title: 'Ledgers',
  who: 'Seeing it: "See Ledgers". Adding, changing and removing entries: "Record ledger entries". The settings: "Change ledger settings". Admin and Owner always can. Accountants can see and record by default, and Viewers can see.',
  summary: 'One party’s day: its opening balance, the invoices, debit notes, credit notes and receipts entered for it in RAMS, and the closing. RAMS checks each entry against Tally’s vouchers for that party and day, and flags any difference. RAMS never writes anything into Tally — accountants post in Tally as before.',
  flows: [
    {
      title: 'Open a party’s ledger',
      steps: [
        'Click Ledgers in the top bar. It opens on the default company (MH to begin with).',
        'Choose the marketplace, for example Blinkit. The list shows how many parties it has, and how many days need checking.',
        'Choose the party, for example BLINK COMMERCE PVT LTD(MUMBAI M12). With many parties, type part of the name in the filter box first.',
        'The day is today. Use the arrows or the date box for another day, and Today to come back.',
      ],
    },
    {
      title: 'Enter the day’s invoices, notes and receipts',
      steps: [
        'Open the party and the day.',
        'Click “Add an entry”.',
        'Choose what it is: Invoice, Debit note, Credit note or Receipt.',
        'Type its number. For an invoice, the serial (607) or the full number (607/RM/26-27) both work. A receipt’s number is optional, but type the bank reference (UTR) when you have it, so RAMS can find it in Tally.',
        'Type the amount in rupees, for example 1180.50. The line under it says whether it adds to or takes off what the party owes.',
        'Click “Add entry”. It appears in the table with what RAMS found in Tally.',
      ],
    },
    {
      title: 'Read the check',
      steps: [
        'The banner says how the day stands: Matches Tally, Waiting for Tally, or Differs from Tally by an amount.',
        'The four boxes show the opening, the closing worked out from the entries here, Tally’s closing, and the difference between the two closings.',
        'Each entry says what Tally has for it: In Tally, Amount differs, Different day, Not in Tally yet, or Not in Tally.',
        'Under “In Tally, not entered here” are Tally’s vouchers on this party and day that nobody entered here.',
      ],
    },
    {
      title: 'Fix a difference',
      steps: [
        'If the entry here is wrong, click the pencil next to it, correct it and save.',
        'If Tally is wrong or missing something, ask the accountant to correct it in Tally. RAMS sees the change after the next sync.',
        'If something was entered here by mistake, click the bin to remove it. It is kept in the audit log.',
      ],
    },
    {
      title: 'See what needs attention',
      steps: [
        'Open Ledgers without choosing a party. “Needs attention” lists every day where an entry and Tally differ, newest first.',
        'Click a row to open that party and day.',
      ],
    },
    {
      title: 'Change the settings (Admin, Owner, or anyone given the permission)',
      steps: [
        'Open any party’s day and click Ledger settings at the bottom.',
        'Days to wait: how long an entry may wait for Tally, or a Tally voucher for an entry here, before it is flagged. 2 by default.',
        'Amount tolerance: amounts this close count as the same, for rounding. ₹1 by default.',
        'Placeholder opening: the starting balance for a party whose real balance isn’t loaded yet. ₹10,000 by default.',
        'Click Save. The change is in the audit log.',
      ],
    },
  ],
  faq: [
    { q: 'Where does the opening balance come from?', a: 'From the party’s starting balance on 8 June 2026, the day RAMS’s copy of Tally begins, plus every Tally voucher on the party since then up to the day before. So each day opens where Tally’s closing of the day before left off.' },
    { q: 'Why does the opening say “Placeholder, not from Tally”?', a: 'The party’s real starting balance hasn’t been loaded yet, so RAMS starts it at ₹10,000 (the placeholder in the settings). The day-to-day movement still comes from Tally’s real vouchers, and so does the check: entries and the difference between the closings are exact. Only the level of the balance is a placeholder until the real figures are loaded.' },
    { q: 'What is the difference between “Not in Tally yet” and “Not in Tally”?', a: 'Tally is often written up a day or two later. For the first few days (2 by default) an entry missing from Tally is “Not in Tally yet”, in amber. After that it is “Not in Tally”, in red, and the day needs attention.' },
    { q: 'How does RAMS find an entry in Tally?', a: 'It looks at that party’s Tally vouchers on the same day, of the same kind: an invoice is a Sales voucher, a debit note a Debit Note, a credit note a Credit Note and a receipt a Receipt. Invoices and notes are paired by number. Receipts are paired by the bank reference when one is typed, otherwise by amount.' },
    { q: 'What does “Different day” mean?', a: 'Tally has the same number for this party within a week of the day, but on another date. Either the date here or the date in Tally is wrong. The other day shows it too.' },
    { q: 'Why does a journal or TDS entry show under “In Tally, not entered here”?', a: 'Only invoices, debit notes, credit notes and receipts are entered here, but every Tally voucher on the party moves its balance, including journals and TDS. They show so the difference between the closings can be explained.' },
    { q: 'Why isn’t an earlier day checked?', a: 'A party is checked from the first day anyone entered something for it here. Earlier days show Tally’s vouchers marked “Not checked”.' },
    { q: 'Can I change or remove an entry?', a: 'Yes, with “Record ledger entries”. Click the pencil to change it or the bin to remove it. The clock icon shows each entry’s history: who changed what, and when.' },
    { q: 'Does RAMS change anything in Tally?', a: 'No. Ledgers only reads Tally. Accountants post in Tally as they always have.' },
    { q: 'Why is a party marked “suggested”?', a: 'RAMS thinks it belongs to that marketplace, but nobody has confirmed it yet. Confirm or change it on Matching → Party ledgers.' },
    { q: 'A party is missing from the list. Why?', a: 'Only party ledgers mapped to a marketplace (or suggested for one) on Matching → Party ledgers are listed. Marketplaces often pay into a head-office ledger, so map that ledger to its marketplace too, to enter receipts against it.' },
  ],
};
