// Help: Ledgers -- the bill-to-bill statement per party, with the debit and
// credit notes typed in RAMS checked against Tally.
export const ledgersHelp = {
  id: 'ledgers',
  path: '/ledgers',
  area: 'Ledgers',
  title: 'Ledgers',
  who: 'Seeing it: "See Ledgers". Adding, changing and removing debit and credit notes: "Record ledger entries". The settings: "Change ledger settings". Admin and Owner always can. Accountants can see and record by default, and Viewers can see.',
  summary: 'The statement of each party of the marketplaces that pay bill to bill (Minutes, Now and Zepto to start), over the dates you choose: its opening balance, invoices, debit notes, credit notes, TDS, journals, receipts and closing. Every figure comes from Tally. Debit and credit notes are also typed here from the marketplace’s portal, and RAMS checks each one against Tally’s credit notes. RAMS never writes anything into Tally.',
  flows: [
    {
      title: 'Open the statement',
      steps: [
        'Click Ledgers in the top bar. Nothing is chosen yet.',
        'Choose the company, or All companies.',
        'Choose the marketplace, or All. Blinkit and Scootsy say “coming soon”: they don’t pay bill to bill, and their statement is still being worked out.',
        'Tick the states you want, or All states, and click Done. A party whose state in Tally and in its GSTIN differ is listed under both.',
        'Tick the parties, or All parties, and click Done. With many parties, type part of a name in the search box first.',
        'The dates are this month to date. Change From or To for another range; “This month” brings it back.',
      ],
    },
    {
      title: 'Read the statement',
      steps: [
        'Each row is one party: Opening, then Invoice, DN, CN, TDS, Journal / Adj and Receipt for the dates chosen, then Closing.',
        '+ adds to what the party owes, − takes it off. Opening and Closing say Dr when the party owes us and Cr when we owe the party.',
        'Opening plus the six columns is the Closing, which is Tally’s own balance at the end of the range and the next range’s opening.',
        'The Total row adds the parties up. It says when an opening is a placeholder, not from Tally.',
        'Under each party’s name: its state, a purple “State differs” when Tally and the GSTIN disagree, and how many of its records have no narration.',
      ],
    },
    {
      title: 'Read the colours',
      steps: [
        'Each colour means one thing, and every badge also has an icon and words. The legend under the table says what each is.',
        'Green ✓ matches: what is typed here and Tally agree.',
        'Purple ≠ differs: two sources disagree — an amount, a DN booked twice in Tally, or a party’s state.',
        'Blue ⚖ matched by amount: Tally has a credit note for the same amount, but its narration doesn’t name the DN.',
        'Grey ⏳ waiting: not on the other side yet, but still within the days allowed.',
        'Red ✗ missing: on one side only — typed here but not in Tally, or in Tally but not typed here.',
        'Yellow “No narration”: Tally has no narration on that record.',
        'A DN or CN figure is tinted with its most urgent colour, with a count per kind under it. Hover over it for the sentence.',
      ],
    },
    {
      title: 'Open a party',
      steps: [
        'Click a party’s name in the statement. With one party chosen, it opens by itself.',
        'The top shows the party, its marketplace and states, and where its opening came from.',
        '“Debit and credit notes entered here” lists what was typed for these dates, each with what Tally has for it.',
        '“In Tally” lists every Tally voucher on the party for these dates, with its narration, the column it counts in and the running balance, from the opening to the closing.',
        'Click the X to close it.',
      ],
    },
    {
      title: 'Enter a marketplace debit note or our credit note',
      steps: [
        'Open the party and click “Add a DN or CN”.',
        'Marketplace DN: a debit note Minutes, Now or Zepto raised on us, for example FKIDN51463346. Type its number as on the portal, and the date on the DN.',
        'Our CN: a credit note we issued, for example a monthly discount. Type Tally’s credit note number, for example 709.',
        'Against invoice is optional: the invoice it is for, for example 556/RM/26-27. It helps when several credit notes look alike.',
        'Type the amount in rupees and click Add. Both take the balance down. The note appears with what RAMS found in Tally.',
      ],
    },
    {
      title: 'Fix a difference',
      steps: [
        'If what was typed here is wrong, click the pencil next to it, correct it and save.',
        'If Tally is wrong or missing something, ask the accountant to correct it in Tally. RAMS sees the change after the next sync.',
        'For “Matched by amount”, ask the accountant to add the DN number to that credit note’s narration in Tally; it then shows as In Tally.',
        'For “Not entered here”, type the DN or CN it is for. The note’s narration often names the DN number.',
        'If something was typed by mistake, click the bin to remove it. It is kept in the audit log.',
      ],
    },
    {
      title: 'See what needs attention',
      steps: [
        'Open Ledgers before choosing parties. “Needs attention” lists every party with a red or purple finding, and every party whose state differs, with since when.',
        'Click a party to open it, from its oldest problem to today.',
      ],
    },
    {
      title: 'Change the settings (Admin, Owner, or anyone given the permission)',
      steps: [
        'Click Ledger settings at the bottom of the page.',
        'Marketplaces on Ledgers: tick the marketplaces that pay bill to bill. The others show “coming soon”.',
        'Days Tally may take to book a DN or CN: a note typed here waits this long before it turns red. 60 by default.',
        'Days to type a note that’s in Tally: a Tally credit note waits this long to be typed here before it turns red. 2 by default.',
        'Amount tolerance and the placeholder opening work as before. Click Save; the change is in the audit log.',
      ],
    },
  ],
  faq: [
    { q: 'What do the colours and icons mean?', a: 'Green ✓ matches, purple ≠ differs, blue ⚖ matched by amount, grey ⏳ waiting, red ✗ missing, and the yellow highlight is a record with no narration. Each colour means only that, on this page, and the legend under the table repeats it.' },
    { q: 'Why aren’t invoices and receipts typed any more?', a: 'They come straight from Tally. Only debit and credit notes are typed here, because the marketplaces raise them on their portals and they reach Tally later.' },
    { q: 'Where do the TDS and Journal / Adj figures come from?', a: 'From Tally. TDS is a journal with a TDS ledger on it (TDS Receivable), the same rule the invoice reports use. Journal / Adj is every other voucher on the party, such as discount round-offs.' },
    { q: 'Why is a marketplace’s debit note a credit note in Tally?', a: 'A debit note the marketplace raises takes down what it owes us, so the accountants book it in Tally as a credit note, with the DN number in the narration. RAMS looks for the number typed here in those narrations, on any date: they are often booked weeks later.' },
    { q: 'What does “Matched by amount” mean?', a: 'No credit note in Tally names the DN, but one booked soon after it has the same amount. It is probably the same note. Ask the accountant to add the DN number to its narration in Tally.' },
    { q: 'What does “DN booked twice” mean?', a: 'Two credit notes in Tally name the same marketplace DN, so the deduction may be counted twice. Ask the accountant to check and remove the extra one.' },
    { q: 'Why does a record say “No narration”?', a: 'Tally has no narration on it. Narrations explain each voucher, so RAMS highlights the missing ones on every screen. Which voucher types need one, and from which date, is set on Admin → Tally companies (Narration check).' },
    { q: 'Why does a state say “differs”?', a: 'The state on the ledger in Tally and the state of its GSTIN disagree. The GSTIN’s is shown, and the party is listed under both. Correct the ledger’s state in Tally.' },
    { q: 'Why are Blinkit and Scootsy “coming soon”?', a: 'Ledgers covers the marketplaces that pay bill to bill. The statement for the others is still being worked out.' },
    { q: 'Where does the opening balance come from?', a: 'From Tally: each sync reads every ledger’s balance, so the opening on any date is the party’s balance in Tally at the start of that day. If the last sync couldn’t read it, the party starts on the placeholder (₹10,000 on 8 June 2026), still carried forward by Tally’s real vouchers.' },
    { q: 'Why does a Zepto party show invoices but no receipts?', a: 'Zepto pays into its head-office ledgers in Tally (ZEPTO PAYMENT, ZEPTO PVT LTD), not each warehouse. Map those ledgers to Zepto on Matching → Party ledgers and they appear with the receipts.' },
    { q: 'A party is missing from the list. Why?', a: 'Only party ledgers mapped to a marketplace (or suggested for one) on Matching → Party ledgers are listed. Map it there.' },
    { q: 'Does RAMS change anything in Tally?', a: 'No. Ledgers only reads Tally. Accountants post in Tally as they always have.' },
  ],
};
