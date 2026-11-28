// Help: Party Statements (the page at /reports/party-statements) -- the bill-to-bill statement per party, every row from Tally,
// with each row's document (PDF, photo or email) attached in RAMS.
export const partyStatementsHelp = {
  id: 'party-statements',
  path: '/reports/party-statements',
  area: 'Tally Reports',
  title: 'Party Statements',
  who: 'Seeing it, and viewing and downloading files: "See Party Statements". Adding and removing files: "Attach files". The settings: "Change statement settings". Admin and Owner always can. Accountants can see and attach files by default, and Viewers can see.',
  summary: 'The statement of each party of the marketplaces that pay bill to bill (Minutes, Now and Zepto to start), over the dates you choose: its opening balance, invoices, debit notes, credit notes, TDS, journals, receipts and closing. Every row and every figure comes from Tally — nothing is typed here. Each row can carry its document: the invoice, the marketplace’s DN, our CN, a photo of it, or the email it came in. A row without one is orange. RAMS never writes anything into Tally.',
  flows: [
    {
      title: 'Open the statement',
      steps: [
        'Tally Reports → Party Statements. It opens on the default company (MH to begin with), every bill-to-bill marketplace (All), All states and All parties, from the 1st of this month to today, with the statement already shown.',
        'To narrow it, choose another company, or All companies. A new company sets the marketplace, states and parties back to All.',
        'Choose a marketplace, or All. Blinkit and Scootsy say “coming soon”: they don’t pay bill to bill, and their statement is still being worked out.',
        'Tick the states you want, or All states, and click Done. A party whose state in Tally and in its GSTIN differ is listed under both.',
        'Tick the parties, or All parties, and click Done. With many parties, type part of a name in the search box first. Untick every party and RAMS asks you to choose one.',
        'Change From or To for another range; “This month” brings it back.',
      ],
    },
    {
      title: 'Read the statement',
      steps: [
        'Each row is one party: Opening, then Invoice, DN, CN, TDS, Journal / Adj and Receipt for the dates chosen, then Closing.',
        '+ adds to what the party owes, − takes it off. Opening and Closing say Dr when the party owes us and Cr when we owe the party.',
        'Opening plus the six columns is the Closing, which is Tally’s own balance at the end of the range and the next range’s opening.',
        'The Total row adds the parties up. It says when an opening is a placeholder, not from Tally.',
        'Under each party’s name: its state, a purple “State differs” when Tally and the GSTIN disagree, how many of its records have no narration (yellow), and how many of its rows have no file (orange).',
      ],
    },
    {
      title: 'Read the colours',
      steps: [
        'Each colour means one thing, and every badge also has an icon and words. The legend under the table says what each is.',
        'Purple ≠ differs: two readings disagree — a marketplace DN on two credit notes in Tally, or a party’s state in Tally and in its GSTIN.',
        'Yellow “No narration”: Tally has no narration on that record.',
        'Orange “No file”: the row has no document attached yet. The whole row is orange until one is added.',
        'A DN or CN figure with a DN booked twice is tinted purple, with the count under it. Hover over it for the sentence.',
      ],
    },
    {
      title: 'Open a party',
      steps: [
        'Click a party’s name in the statement. With one party chosen, it opens by itself.',
        'With many parties, the statement scrolls inside its own box (its headings and Total stay in view), and the party you click is brought into view under it.',
        'The top shows the party, its marketplace and states, and where its opening came from.',
        '“In Tally” lists every Tally voucher on the party for these dates, with its narration, the column it counts in, its files and the running balance, from the opening to the closing.',
        'A credit note whose narration names a marketplace DN (for example FKIDN51463346) is in the DN column, and the DN number shows under its own number. Any other credit note is ours, in the CN column.',
        'Click the X to close it.',
      ],
    },
    {
      title: 'Attach the DN’s email or PDF, or any row’s document',
      steps: [
        'Open the party. A row without a file is orange, and its Files column says “No file”.',
        'Click Add in the Files column of that row — the invoice, the credit note, the receipt or the journal. A window opens for it.',
        'Drag the files onto the window, or click Choose files. You can pick several at once: PDFs, photos (JPG, PNG or WebP) and emails (.eml or .msg).',
        'To keep an email: in Gmail, open it, click ⋮ and choose Download message (an .eml file). In Outlook, drag the email onto the desktop or use File → Save As (an .msg file). Then add that file.',
        'Each file shows “Sending…” and then appears in the list. The row stops being orange.',
        'A file on an invoice, or on a DN or CN, also shows on Tally Reports → Bills Receivable.',
      ],
    },
    {
      title: 'Paste a screenshot',
      steps: [
        'Copy a screenshot or a snip (for example with Windows + Shift + S).',
        'Open the files window of the row and press Ctrl+V.',
        'It is added as “Screenshot” with the date and time, and made smaller like any photo.',
      ],
    },
    {
      title: 'View or download a file',
      steps: [
        'Click the file count in the Files column (for example “2 files”).',
        'Click View to see a PDF or a photo inside RAMS. Use the arrows (or the ← → keys) to go through the row’s files, and Esc to close.',
        'Click Download to save it. A PDF or an email comes back exactly as it was added; an email is opened in Outlook or your mail app.',
      ],
    },
    {
      title: 'Remove a file',
      steps: [
        'Open the row’s files and click the bin next to the file, then Remove.',
        'The removal is kept in the audit log. The row turns orange again if it has no other file.',
      ],
    },
    {
      title: 'Find the rows without a file',
      steps: [
        'Click “Needs attention” above the statement. It lists every party with rows that have no file, with how many and since when.',
        'Click the party. When missing files are all that is off, it opens showing just those rows.',
        'In a party, click “Without a file” above the table to show only those rows; click it again to show every row.',
        'In the statement, the orange count under a party’s name says how many of its rows in the dates chosen have no file.',
      ],
    },
    {
      title: 'Fix what Party Statements shows',
      steps: [
        'Every row is Tally’s, so a wrong amount, date or narration is corrected in Tally by the accountant. RAMS sees the change after the next sync.',
        'For a marketplace DN, the accountant writes the DN number (for example FKIDN51463346) in the credit note’s narration in Tally. That is how RAMS puts it in the DN column.',
        'For “DN booked twice”, ask the accountant to check the two credit notes and remove the extra one in Tally.',
        'For “State differs”, correct the ledger’s state in Tally.',
      ],
    },
    {
      title: 'See what needs attention',
      steps: [
        'Click “Needs attention” above the statement; the number on it is how many parties have something off. It lists every party with a DN booked twice, rows without a file, or a state that differs, with since when. Click it again to close the list.',
        'Click a party to open it, from its oldest problem to today. The list closes.',
        'With nothing off, there is no Needs attention button.',
      ],
    },
    {
      title: 'Change the settings (Admin, Owner, or anyone given the permission)',
      steps: [
        'Click Statement settings at the bottom of the page.',
        'Marketplaces on Party Statements: tick the marketplaces that pay bill to bill. The others show “coming soon”.',
        'Placeholder opening: used only when the last sync couldn’t read a party’s balance from Tally.',
        'Click Save; the change is in the audit log.',
      ],
    },
  ],
  faq: [
    { q: 'What does Last updated by show on a party’s rows?', a: 'Who last added or removed a file on that Tally row, and when. Click it to see every change. Changes made in Tally itself are not shown; they are in Tally’s own Edit Log.' },
    { q: 'What do the colours and icons mean?', a: 'Purple ≠ differs (a DN booked twice, or a state that differs), the yellow highlight is a record with no narration, and an orange row is a Tally row with no file. Each colour means only that, on this page, and the legend under the table repeats it.' },
    { q: 'Why are debit and credit notes no longer typed here?', a: 'Everything is already in Tally: a check of every Minutes, Now and Zepto party found that RAMS holds every entry Tally has on them — 559 of 559, with the same amounts. Typing them again here was double work, so Party Statements now shows only Tally’s rows.' },
    { q: 'How does RAMS tell a marketplace DN from our own CN?', a: 'Tally has no debit notes on these parties: a DN the marketplace raises is booked as a credit note, with the DN number in its narration. A credit note whose narration names a DN number (FKIDN…, RTDN…, …DN…) is in the DN column; any other, such as a return or a monthly discount, is ours, in CN. So the accountant should always write the DN number in the narration.' },
    { q: 'Does RAMS catch a DN that nobody booked in Tally?', a: 'No. Party Statements now shows only what is in Tally, so a DN that was never booked doesn’t appear anywhere. Check the marketplace’s DN report against the DN column now and then.' },
    { q: 'Why is a row orange?', a: 'It has no file on it. Every row from 1 April 2026 should carry its document — the invoice, the marketplace’s DN, our CN, or the payment or TDS advice. Add it and the orange goes.' },
    { q: 'Which files can I add?', a: 'PDFs, photos (JPG, PNG or WebP) and emails saved as .eml (Gmail’s Download message) or .msg (Outlook). Up to 4 MB each after RAMS compresses it, and up to 10 on one row. iPhone HEIC photos can’t be read by browsers: share them as JPEG, or take a screenshot.' },
    { q: 'Does RAMS change my files?', a: 'PDFs and emails come back exactly as they were added. Photos are made smaller before they are sent (at most 2000 pixels across, as JPEG), which keeps them readable at a fraction of the size. Keep the original yourself if you need it at full size.' },
    { q: 'Why can’t I open an email inside RAMS?', a: 'RAMS keeps the email exactly as it was saved, with its attachments, and doesn’t open it. Download it and it opens in Outlook or your mail app.' },
    { q: 'A file is too big. What can I do?', a: 'For a PDF, save it smaller (for example “Reduce file size”, or print it to PDF again). For an email with large attachments, save the email without them and add the PDFs separately.' },
    { q: 'I added the same file to two rows. Does it take twice the space?', a: 'No. RAMS keeps each file once, however many rows it is on, and deletes it only when the last of those rows lets it go.' },
    { q: 'Who can add and remove files?', a: 'Anyone with “Attach files”: Admin and Owner always, Accountants by default. Files can be added on Attachments too, and anyone who can see Party Statements, Attachments or Bills Receivable can view and download them. An Admin or Owner can change this on Roles & permissions.' },
    { q: 'I attached a file to a Tally invoice. Where else does it show?', a: 'On every party that voucher is on, and on that invoice in Tally Reports → Bills Receivable.' },
    { q: 'Bills Receivable shows an invoice in orange. What does it want?', a: 'A DN or CN set against that invoice in Tally has no file. Add the note’s document on its row here; once every note against the invoice has one, Bills Receivable stops showing it orange. Its “Add it on Party Statements” link opens the party here for you.' },
    { q: 'Why does Party Statements open on every party?', a: 'It opens on the default company, all bill-to-bill marketplaces, all states and all parties for this month, so the whole picture is there at once. Narrow it with the filters; RAMS keeps your choice until you close the tab.' },
    { q: 'Where do the TDS and Journal / Adj figures come from?', a: 'From Tally. TDS is a journal with a TDS ledger on it (TDS Receivable), the same rule the invoice reports use. Journal / Adj is every other voucher on the party, such as discount round-offs.' },
    { q: 'What does “DN booked twice” mean?', a: 'Two credit notes in Tally name the same marketplace DN, so the deduction may be counted twice. Ask the accountant to check and remove the extra one.' },
    { q: 'Why does a record say “No narration”?', a: 'Tally has no narration on it. Narrations explain each voucher — and for a marketplace DN, the narration is where its number goes — so RAMS highlights the missing ones on every screen. Which voucher types need one, and from which date, is set on Admin → Tally companies (Narration check).' },
    { q: 'Why does a state say “differs”?', a: 'The state on the ledger in Tally and the state of its GSTIN disagree. The GSTIN’s is shown, and the party is listed under both. Correct the ledger’s state in Tally.' },
    { q: 'Why are Blinkit and Scootsy “coming soon”?', a: 'Party Statements covers the marketplaces that pay bill to bill. The statement for the others is still being worked out.' },
    { q: 'Where does the opening balance come from?', a: 'From Tally: each sync reads every ledger’s balance, so the opening on any date is the party’s balance in Tally at the start of that day. If the last sync couldn’t read it, the party starts on the placeholder (₹10,000 on 1 April 2026), still carried forward by Tally’s real vouchers.' },
    { q: 'Why does a Zepto party show invoices but no receipts?', a: 'Zepto pays into its head-office ledgers in Tally (ZEPTO PAYMENT, ZEPTO PVT LTD), not each warehouse. Map those ledgers to Zepto on Matching → Party ledgers and they appear with the receipts.' },
    { q: 'A party is missing from the list. Why?', a: 'Only party ledgers mapped to a marketplace (or suggested for one) on Matching → Party ledgers are listed. Map it there.' },
    { q: 'Does RAMS change anything in Tally?', a: 'No. Party Statements only reads Tally. Accountants post in Tally as they always have.' },
  ],
};
