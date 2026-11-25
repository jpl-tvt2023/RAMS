// Help: the Tally Reports screens -- Bills Receivable (/reports/bills-receivable), Invoices, Credit & debit notes, Stock
// transfers, Receivables, Exceptions and Sync health.
const SEE = 'Seeing it: "See the reports". Admin and Owner always can.';

export const billsReceivableHelp = {
  id: 'bills-receivable',
  path: '/reports/bills-receivable',
  area: 'Tally Reports',
  title: 'Bills Receivable',
  who: SEE,
  summary: 'Each Tally sales invoice since RAMS’s copy of Tally starts (1 April 2026), by marketplace: its internal and vendor PO numbers, the amount, the credit notes against it and what is still owed. RAMS works the figures out from Tally each time the page opens, so they are as fresh as the last sync. Stock transfers are left out.',
  flows: [
    {
      title: 'See what a marketplace owes',
      steps: [
        'Tally Reports → Bills Receivable. It opens on the default company (MH to begin with). Choose another company, or All companies for the consolidated view.',
        'Click a marketplace tab, for example Blinkit, or All for every marketplace. Each tab shows how many invoices it has.',
        'Choose a status: Open for invoices still owed, Overdue for those past their credit days, Settled for those paid in full.',
        'The line above the table adds up what the filters show: invoiced, credit notes, outstanding and overdue.',
      ],
    },
    {
      title: 'See an invoice’s credit notes',
      steps: [
        'In the CN column, click the amount. The CN numbers are under it.',
        'A window lists each credit note: its number, date, type, the amount set against this invoice and, when there is one, the ROMS RTV row it was linked to.',
        'The Files column shows each note’s files. Click the count to view or download them.',
      ],
    },
    {
      title: 'Clear an orange invoice (a DN or CN without its file)',
      steps: [
        'An invoice of a Minutes, Now or Zepto party is orange while a DN or CN set against it in Tally has no file. Under the CN amount it says how many, for example “1 without a file”.',
        'Click the CN amount. The note without a file is orange and says “No file”.',
        'Click “Add it on Party Statements”. Party Statements opens on that party, from the note’s date, showing just its rows without a file.',
        'Click Add on the note’s row and attach its document: the marketplace’s DN, or our CN (PDF, photo or email).',
        'Come back to Bills Receivable: once every DN and CN against the invoice has a file, it is no longer orange.',
      ],
    },
    {
      title: 'Find invoices with no PO',
      steps: [
        'Choose No PO as the status. These invoices aren’t linked to a ROMS PO.',
        'Usually the Buyer’s Order No is missing on the invoice in Tally. Once it is added and Tally syncs, the next match links it.',
        'Invoices dated before ROMS went live (8 June 2026) never have a ROMS PO: they say “Before ROMS” in the PO column and are never listed as No PO.',
      ],
    },
    {
      title: 'Find one invoice',
      steps: ['Type the invoice number, the party, the internal PO no (for example B002) or the vendor PO no in the search box and press Enter.'],
    },
    {
      title: 'Download it',
      steps: ['Click Download CSV. It downloads every invoice the filters show, not just this page, for Excel.'],
    },
    {
      title: 'See an invoice’s files',
      steps: [
        'In the Files column, click the count (for example “1 file”). A dash means the invoice has no file.',
        'Click View to see a PDF or a photo inside RAMS, or Download to save it.',
        'Files are added on Attachments (any invoice) or on Party Statements (in the party’s “In Tally” list). Bills Receivable only shows them.',
      ],
    },
  ],
  faq: [
    { q: 'Where do the files come from?', a: 'They are attached on Attachments or Party Statements, to the invoice’s or the note’s row, by anyone with “Attach files”. Bills Receivable shows the same files.' },
    { q: 'Why is an invoice orange?', a: 'A DN or CN set against it in Tally has no file yet. Click its CN amount to see which, and add the file on Party Statements or Attachments. Only Minutes, Now and Zepto invoices turn orange: those are the parties on Party Statements, where files are added.' },
    { q: 'One credit note is against two invoices. Do I add its file twice?', a: 'No. Add it once, on the note’s row on Party Statements. Every invoice it is set against stops being orange.' },
    { q: 'Why is a narration highlighted in yellow?', a: 'Tally has no narration on that record, and the narration check (Admin → Tally companies) says it needs one. Ask the accountant to add it in Tally; it shows after the next sync.' },
    { q: 'Where are the credit days set?', a: 'On Admin → Credit terms, for anyone with “Change credit terms” (Accountants by default). A change shows what it would do before it is saved.' },
    { q: 'What is the difference between Internal PO no and Vendor PO no?', a: 'Internal PO no is ROMS’s own PO id (for example B002). Vendor PO no is the marketplace’s purchase order number, as typed in ROMS.' },
    { q: 'What is the difference between Amount and Outstanding?', a: 'Amount is the invoice’s total. Outstanding is what is still owed after receipts, credit notes, TDS and other adjustments set against it in Tally.' },
    { q: 'Which credit notes count in CN?', a: 'Every credit note entered "Agst Ref" against the invoice’s bill in Tally. A credit note entered On Account isn’t set against any invoice, so it doesn’t show here.' },
    { q: 'What decides the marketplace?', a: 'The PO RAMS linked the invoice to. Without one, the party ledger’s mapping on Matching → Party ledgers, or RAMS’s suggestion for it. Invoices with neither are under Not known.' },
    { q: 'When is an invoice overdue?', a: 'When it is still owed after its marketplace’s credit days (30 by default), counted from the invoice date.' },
    { q: 'Which company does it open on?', a: 'The default company, MH to begin with. An Admin or Owner can change it on Admin → Tally companies by clicking the star on another company. Once you pick a company here, RAMS keeps your choice until you close the tab.' },
    { q: 'Why does an invoice say "not bill-wise"?', a: 'Its party ledger isn’t kept bill-wise in Tally, so Tally has no bill to settle and RAMS can’t tell what is owed on it.' },
  ],
};

export const invoicesHelp = {
  id: 'invoices',
  path: '/reports/invoices',
  area: 'Tally Reports',
  title: 'Invoices',
  who: SEE,
  summary: 'Every Tally sales invoice since RAMS’s copy of Tally starts (1 April 2026), with its marketplace and PO, what settled it and what is still owed. RAMS works the figures out from Tally each time the page opens, so they are as fresh as the last sync.',
  flows: [
    {
      title: 'Find what is owed',
      steps: [
        'Tally Reports → Invoices. Choose a company, or All companies for the consolidated view.',
        'Click Overdue to see invoices past their credit days, or Open for everything still owed.',
        'Sort by Most outstanding or Most overdue to see the biggest first.',
        'Each row shows the total, what was received, credit notes plus TDS and adjustments, and what is still outstanding.',
      ],
    },
    {
      title: 'Find invoices with no PO',
      steps: [
        'Click the No PO tab. These invoices aren’t linked to a ROMS PO.',
        'Usually the Buyer’s Order No is missing on the invoice in Tally. Once it is added and Tally syncs, the next match links it.',
        'Invoices dated before ROMS went live (8 June 2026) never have a ROMS PO, so they aren’t listed here.',
      ],
    },
    {
      title: 'Download it',
      steps: ['Click Download CSV. It downloads every invoice the filters show, not just this page, for Excel.'],
    },
  ],
  faq: [
    { q: 'How does RAMS know an invoice is paid?', a: 'From Tally’s bill-wise details. A receipt, credit note or journal entered "Agst Ref" against the invoice’s bill settles it. Money entered On Account isn’t set against any invoice, so the invoice stays open; Receivables shows that money apart.' },
    { q: 'What decides the marketplace?', a: 'The PO RAMS linked the invoice to. Without one, the party ledger’s mapping on Party ledgers, or RAMS’s suggestion for it.' },
    { q: 'When is an invoice overdue?', a: 'When it is still owed after its marketplace’s credit days, counted from the invoice date. Credit days are set on Receivables.' },
    { q: 'Why does an invoice say "Not bill-wise"?', a: 'Its party ledger isn’t kept bill-wise in Tally, so Tally has no bill to settle and RAMS can’t tell what is owed on it.' },
    { q: 'An invoice shows "over"?', a: 'More was set against it in Tally than its total, usually a rounding difference or a receipt allocated to the wrong bill.' },
  ],
};

export const notesHelp = {
  id: 'credit-debit-notes',
  path: '/reports/notes',
  area: 'Tally Reports',
  title: 'Credit & debit notes',
  who: SEE,
  summary: 'Each Tally credit note and debit note, the invoice it settles (its Agst Ref in Tally), that invoice’s PO, and the RTV row RAMS linked it to, with whether its number is in ROMS yet.',
  flows: [
    {
      title: 'Check a return’s credit note',
      steps: [
        'Tally Reports → Credit & debit notes, Credit notes tab.',
        'Search by the RTV No, the PO or the CN number.',
        'The row shows the invoice it settles and the RTV row; under it, whether auto-fill has put the CN No into ROMS.',
      ],
    },
  ],
  faq: [
    { q: 'A note says "(before RAMS)".', a: 'It settles an invoice dated before RAMS started, so that invoice isn’t in RAMS.' },
    { q: 'Why does a debit note have no PO?', a: 'Tally’s debit notes are almost all for suppliers. Marketplace shortfalls are recorded on ROMS’s GRN page, not as debit notes in Tally.' },
  ],
};

export const transfersHelp = {
  id: 'stock-transfers',
  path: '/reports/transfers',
  area: 'Tally Reports',
  title: 'Stock transfers',
  who: SEE,
  summary: 'Sales from one Roymax registration to another, for example MH to HR. They move our own stock, so they stay out of receivables.',
  flows: [
    {
      title: 'Mark a ledger as our own registration',
      steps: [
        'Most are found by themselves: the ledger’s GSTIN carries Roymax’s PAN.',
        'For any other, Matching → Party ledgers, and choose Our own registration for that ledger.',
      ],
    },
  ],
  faq: [
    { q: 'Are Flipkart and Amazon here?', a: 'Their stock goes out as transfers, but how to link those to ROMS’s Flipkart and Amazon rows is still to be decided.' },
  ],
};

export const receivablesHelp = {
  id: 'receivables',
  path: '/reports/receivables',
  area: 'Tally Reports',
  title: 'Receivables',
  who: `${SEE} Changing credit terms: "Change credit terms".`,
  summary: 'What each marketplace owes, per company: invoiced, received, credit notes, TDS and adjustments, outstanding, overdue, and how old it is (0–30, 31–60, 61–90, 90+ days since the invoice). Stock transfers are left out.',
  flows: [
    {
      title: 'Read it',
      steps: [
        'Tally Reports → Receivables. Choose a company, or All companies for the consolidated figures.',
        'Outstanding is what invoices still owe. Received on account is money a marketplace paid that Tally holds without setting it against an invoice.',
        'Net outstanding = Outstanding − Received on account: what the marketplace really still owes.',
        'Download CSV gives the same table for Excel.',
      ],
    },
    {
      title: 'Set credit terms and exception days',
      steps: [
        'Each marketplace’s credit days, and the default, are set on Admin → Credit terms.',
        'Here, under Exception days, set how many days before an invoice with no PO or an RTV row with no credit note becomes an exception.',
        'Every change is recorded; the History button shows them.',
      ],
    },
  ],
  faq: [
    { q: 'Why is so much under "Not known"?', a: 'Marketplaces often pay into a head-office ledger (for example "Blinkit Commerce Pvt Ltd") rather than the warehouse ledger the invoices use. Map that ledger to its marketplace on Matching → Party ledgers and its money moves to the right row.' },
    { q: 'Why does a marketplace show nothing received?', a: 'Its receipts are entered On Account in Tally, not against invoices. They show as Received on account, and Net outstanding takes them off. Setting them against invoices in Tally makes the invoice-level figures right too.' },
    { q: 'What about bills from before RAMS started?', a: 'RAMS holds Tally from 1 April 2026. Older invoices, and payments against them, aren’t counted here.' },
  ],
};

export const exceptionsHelp = {
  id: 'exceptions',
  path: '/reports/exceptions',
  area: 'Tally Reports',
  title: 'Exceptions',
  who: SEE,
  summary: 'Everything that needs a person, by kind, each saying where it is fixed. Fixed items drop off by themselves after the next match.',
  flows: [
    {
      title: 'Work through them',
      steps: [
        'Tally Reports → Exceptions. Each kind shows how many there are; click one to see them.',
        'Follow the link to where it is fixed: Match review, Auto-fill or Invoices.',
        'The kinds: a Bill No or CN No in ROMS that Tally doesn’t have; a Tally invoice with no PO; ROMS and Tally disagreeing; more than one possible invoice or credit note; an RTV row with no credit note yet; and an auto-fill ROMS refused.',
      ],
    },
  ],
  faq: [
    { q: 'How long before an invoice with no PO counts?', a: 'The exception days set on Receivables (15 to begin with), counted from the invoice date. For an RTV row, from the GRN date.' },
  ],
};

export const syncHealthHelp = {
  id: 'sync-health',
  path: '/sync',
  area: 'Tally Reports',
  title: 'Sync health',
  who: 'Everyone sees it. Sync now: "Sync now". Admin and Owner always can.',
  summary: 'Whether the RAMS Connector on the office PC is checking in, whether Tally answers, where each company stands, and every sync run with its errors.',
  flows: [
    {
      title: 'Bring a company up to date now',
      steps: [
        'Tally Reports → Sync health.',
        'Click Sync now on the company, or Sync all now.',
        'The Connector picks it up at its next check-in (within a minute or two) and syncs the changes from Tally, even outside office hours. The run appears under Sync runs.',
      ],
    },
    {
      title: 'Find out why data looks old',
      steps: [
        'Connector offline: the office PC is off or asleep, or the Connector isn’t running there.',
        'Tally not answering: TallyPrime isn’t open on that PC.',
        'Not open in Tally: that company isn’t loaded in Tally. Open it.',
        'A failed run shows its error. The Connector tries again at its next check-in.',
      ],
    },
  ],
  faq: [
    { q: 'Does Sync now change anything in Tally?', a: 'No. The Connector only ever reads Tally.' },
  ],
};
