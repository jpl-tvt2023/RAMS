// Help: Attachments (the page at /reports/attachments) -- each month's invoices,
// payments, debit and credit notes as Tally's registers show them, with each
// voucher's document (PDF, photo or email) and narration.
export const attachmentsHelp = {
  id: 'attachments',
  path: '/reports/attachments',
  area: 'Tally Reports',
  title: 'Attachments',
  who: 'Seeing it, and viewing and downloading files: "See Attachments". Adding and removing files: "Attach files" (the same as on Party Statements). Admin and Owner always can. Accountants can see and attach files by default, and Viewers can see.',
  summary: 'A company’s vouchers in a financial year, the way Tally’s registers show them: Invoice (Sales), Payments, DN (debit notes) and CN (credit notes), month by month. For each month: how many vouchers, how many need attention — no file, or no narration where one is needed — and the Debit, Credit and Closing balance. Click a month to see its vouchers, each with its ledger, city, amount, e-invoice number, files, narration, and who last changed it in RAMS. Every figure comes from Tally; RAMS never writes anything into Tally.',
  flows: [
    {
      title: 'Read a month like Tally’s register',
      steps: [
        'Tally Reports → Attachments. It opens on the default company (the star on Admin → Tally companies) and this financial year, on the Invoice tab.',
        'Pick a tab: Invoice (Tally’s Sales), Payments (money paid out), DN (Tally’s debit notes) or CN (Tally’s credit notes). The number next to each is its vouchers this year.',
        'Each row is a month, April to March, as in Tally’s register: the vouchers, how many need attention, the Debit or Credit, and the Closing balance — the running total from April.',
        'Invoices and debit notes are on the Credit side, payments and credit notes on the Debit side, as Tally shows them. The Closing says Cr or Dr the same way.',
        'Grand Total at the bottom adds up the year.',
      ],
    },
    {
      title: 'See a month’s vouchers',
      steps: [
        'Click a month’s name. Its vouchers are listed in Tally’s order, by date.',
        'Each row shows the number and date, the ledger, the city, the amount, the e-invoice’s Ack No, the files, whether there is a narration, and the last change made in RAMS.',
        'On Payments, Ledger is who was paid (the ledger the payment debits), not the bank or cash it was paid from. “+1 more” means it paid several; hover over it to see them all.',
        'Type in the search box to find a number, ledger, city or Ack No. Download CSV saves what is listed.',
        'Click “All months” to go back.',
      ],
    },
    {
      title: 'Clear what needs attention',
      steps: [
        'In the month list, the Needs attention number says how many have no file or no narration, with the split under it. Click it to open the month showing only those.',
        'Or, in a month, tick “Needs attention only”.',
        'An orange row has no file: add its document (below). A yellow “No narration” means Tally has no narration on it: ask the accountant to add one in Tally, and it clears after the next sync.',
        'When both are done the voucher drops off “Needs attention only”, and the month’s count goes down.',
      ],
    },
    {
      title: 'Attach an invoice PDF or any voucher’s document',
      steps: [
        'Open the month. A row without a file is orange, and its Invoice PDF (or Files) column says “No file”.',
        'Click Add on that row. A window opens for it.',
        'Drag the files onto the window, click Choose files, or copy a screenshot or file and press Ctrl+V. PDFs, photos (JPG, PNG or WebP) and emails (.eml or .msg) can be added, several at once.',
        'Each file shows “Sending…”, then appears in the list. The row stops being orange.',
        'Click a row’s file count to view a PDF or photo in RAMS, download a file, or remove one (the bin, then Remove).',
      ],
    },
    {
      title: 'Check an e-invoice and copy its IRN',
      steps: [
        'The E-Invoice column shows the Ack No Tally holds for the voucher, with the Ack date under it.',
        'Hover over the Ack No to see the full IRN. Click the copy button next to it to copy the IRN, for example to paste on the e-invoice portal.',
        '“IRN cancelled” means the e-invoice was cancelled on the portal. A dash means Tally has no e-invoice on it.',
        '“Not read yet” means RAMS hasn’t read that voucher’s e-invoice: it comes after the Connector (0.8.0 or later) has loaded all of Tally into RAMS again.',
      ],
    },
    {
      title: 'See who changed a voucher in RAMS',
      steps: [
        'The Audit Log column shows who last changed the voucher in RAMS — added or removed a file — and when.',
        'Click it to see the voucher’s whole history, newest first.',
        'A dash means nobody has changed it in RAMS yet. Changes made in Tally itself are in Tally’s own Edit Log.',
      ],
    },
    {
      title: 'Change the company or financial year',
      steps: [
        'Choose another company in the first box. Attachments shows one company at a time, as Tally does.',
        'Choose another year in the FY box. RAMS holds Tally from 1 April 2026.',
        'Either goes back to the list of months.',
      ],
    },
  ],
  faq: [
    { q: 'What does “needs attention” mean?', a: 'The voucher has no file attached, or it has no narration while the narration check asks for one. The narration check (which voucher types, and from which date) is set by an Admin on Admin → Tally companies.' },
    { q: 'Why aren’t April and May vouchers yellow when they have no narration?', a: 'The narration check starts on the date an Admin set on Admin → Tally companies (8 June 2026 to begin with). Vouchers before it are never flagged for a narration. Move the date to 1 April to check the whole year.' },
    { q: 'Why does Payments show a different ledger from Tally’s party?', a: 'In Tally a payment’s party is often the bank or cash it was paid from. Attachments shows who was paid — the ledger the payment debits — since that is whose bill or receipt belongs on it.' },
    { q: 'Where does the City come from?', a: 'From the ledger’s address in Tally when its City is filled in. Until then, from the ROMS PO the invoice is linked to, or the party’s latest ROMS PO (it then says “from ROMS”). Fill in City on the ledger’s address in Tally and it shows everywhere after the next sync. Hover over a city to see where it came from and the PIN code.' },
    { q: 'Why is a marketplace’s DN under CN here, but in the DN column on Party Statements?', a: 'Attachments follows Tally’s own voucher types: a marketplace’s DN is booked in Tally as a Credit Note, so it is under CN. DN lists Tally’s Debit Notes (our returns to suppliers). Party Statements reads the DN number in the narration to put it in its DN column.' },
    { q: 'Are these the same files as on Party Statements and Bills Receivable?', a: 'Yes. A file sits on the Tally voucher, so one added here shows on Party Statements and Bills Receivable too, and the other way round.' },
    { q: 'Why are some vouchers missing?', a: 'Cancelled and optional vouchers aren’t listed, nor ones deleted in Tally. Receipts, journals, purchases and contras have no tab here.' },
    { q: 'Why does a month say “Not in RAMS”?', a: 'RAMS holds Tally from 1 April 2026. Months before that aren’t in its copy.' },
    { q: 'What does “Not read yet” mean in E-Invoice?', a: 'That voucher came into RAMS before the Connector read e-invoices. Once the Connector (0.8.0 or later) has loaded all of Tally into RAMS again, every voucher shows its Ack No, or a dash when it has none.' },
    { q: 'Does anything here change Tally?', a: 'No. RAMS only reads Tally. Files and their history are kept in RAMS.' },
  ],
};
