// Help: Purchase Reports -- Warehouse (/purchases/warehouse) and Stitching
// (/purchases/stitching). ROMS's receipts and challans, each with its bill or
// challan copy, a bill check, and two approvals: the Purchase Head, then the
// Accountant Head. One section per page; they share the flows.

const WHO = 'Seeing the pages and their files: “See Purchase Reports” (Accountants, Viewers and both heads by default). Attaching files and saving the bill check: “Bill check” (Accountants by default). The first approval: “Approve as Purchase Head” (the Purchase Head role). The final approval: “Approve as Accountant Head” (the Accountant Head role). Admin and Owner can do every step. All of this is set on Admin → Roles & permissions.';

const FLOWS = [
  {
    title: 'Find what is waiting for you',
    steps: [
      'Purchase Reports → Warehouse, or Purchase Reports → Stitching.',
      'It opens on the step you work on: To check for the person who checks bills, With Purchase Head for the Purchase Head, With Accountant Head for the Accountant Head. Click another tab to see the rest; the number on each tab is how many records it holds.',
      'Narrow it down with the company, the month, or the search box (Incoming No, bill or challan number, PO, article, vendor or party).',
      'The line above the table says when RAMS last read ROMS. Click Refresh from ROMS to read it now.',
      'Download CSV saves everything the filters show, one line per ROMS line.',
    ],
  },
  {
    title: 'Do the bill check',
    steps: [
      'On the To check tab, find the record and compare it with the bill or challan in your hand: the lines, rate, quantity and unit.',
      'Click Bill check. The window lists the record’s lines as ROMS has them.',
      'Click Attach the bill and drop in the bill or challan copy (a PDF, a photo, or an email), or press Ctrl+V to paste a screenshot. Close the files window to come back. A file is not compulsory.',
      'Add a note if it helps (for example what you checked or corrected), then click Save bill check.',
      'The record goes to the Purchase Head. The Bill check by column now shows your name and the time; click it to see the record’s full history.',
      'From now on the files are locked, so the heads approve exactly what you checked. Only a head sending it back unlocks them.',
    ],
  },
  {
    title: 'Approve as the Purchase Head',
    steps: [
      'Open the With Purchase Head tab.',
      'Check the record’s lines, and click its file count to view the bill.',
      'Click Approve, then Approve again to confirm. It goes on to the Accountant Head.',
      'To approve several at once, tick them on the left and click Approve selected.',
      'If something is wrong, click Send back instead and write why (required). The record goes back to the bill check, and its row turns red with your reason.',
    ],
  },
  {
    title: 'Approve as the Accountant Head',
    steps: [
      'Open the With Accountant Head tab. The Status column shows who approved it as Purchase Head.',
      'Click Approve and confirm. This is the final approval: the record turns green and moves to the Approved tab.',
      'Or click Send back and write why. It goes back to the bill check, and once it is checked again it comes to the Purchase Head first.',
    ],
  },
  {
    title: 'When a record is sent back',
    steps: [
      'Its row is red, and the Status says which head sent it back and why. It is on the Sent back tab.',
      'Sort out the problem: add the corrected bill and remove the wrong file, or get ROMS corrected.',
      'Click Check again, add a note on what you changed, and save. It starts over at the Purchase Head.',
    ],
  },
  {
    title: 'When ROMS changes a record after its bill check',
    steps: [
      'If someone changes a line in ROMS after the bill check (its quantity, rate, bill or challan number, article or Incoming No), or adds or removes a line, RAMS notices on its next read.',
      'The record shows Changed in ROMS, with what changed under it, and its approvals are cleared. Its history keeps them, and the change.',
      'Check it against the bill again and save. It goes to the Purchase Head again.',
      'If every line of a record is deleted in ROMS, it shows Removed in ROMS. It is kept, with its files and history, but can no longer be checked or approved.',
    ],
  },
];

const COMMON_FAQ = [
  { q: 'What does each column come from?', a: 'Everything except Files, Bill check by and Status is read from ROMS: the Incoming No (the gate number typed on the receipt), the Date, the bill or challan number, the PO, the article, the rate, the quantity and the unit. RAMS never changes anything in ROMS from this page.' },
  { q: 'What is the Date?', a: 'The day the receipt or challan was entered in ROMS. ROMS doesn’t keep a separate date for them.' },
  { q: 'What do the colours mean?', a: 'Green: approved by both heads. Red: sent back by a head. Nothing else is highlighted; the Status column says where every other record is.' },
  { q: 'Why can’t I add or remove a file?', a: 'Files can change only while the record is with the person who checks bills: To check, Sent back or Changed in ROMS. After the bill check is saved they are locked. Adding files also needs the “Bill check” permission.' },
  { q: 'Can the same person check and approve?', a: 'Yes, if they hold both permissions. Every step is kept in the record’s history, with who did it and when.' },
  { q: 'How fresh is it?', a: 'RAMS reads ROMS when you open the page (if it last read more than five minutes ago), when you click Refresh from ROMS, and after each matching run.' },
  { q: 'Where is the history?', a: 'Click the name in Bill check by, or the clock icon on the row. It lists every bill check, approval, send-back, file and ROMS change, newest first.' },
];

export const purchasesWarehouseHelp = {
  id: 'purchases-warehouse',
  path: '/purchases/warehouse',
  area: 'Purchase Reports',
  title: 'Purchase Reports — Warehouse',
  who: WHO,
  summary: 'Each delivery ROMS books in against an outbound PO for goods that never go through Stitching: packaging, barcodes and the like. Receipts with the same Incoming No from the same vendor are one delivery, so they are one record with their lines under it: one set of files, one bill check, one approval. Billing is the vendor’s Bill No, and Rate is the billed rate.',
  flows: FLOWS,
  faq: [
    { q: 'Why are several lines one record?', a: 'They share an Incoming No from the same vendor, so they came in as one delivery. Attach its bill once, check it once, and it is approved once.' },
    { q: 'The same Incoming No shows twice.', a: 'It was used by two different vendors, so RAMS keeps them as two deliveries. If it is a typing mistake, correct it in ROMS.' },
    { q: 'What does “No Incoming No in ROMS” mean?', a: 'The receipt has no Incoming No in ROMS, so RAMS can’t tell which delivery it belongs to and lists it alone. Add the number in ROMS; on its next read RAMS puts the receipt with the rest of its delivery. Do the bill check after that, so the files go on the right record.' },
    ...COMMON_FAQ,
  ],
};

export const purchasesStitchingHelp = {
  id: 'purchases-stitching',
  path: '/purchases/stitching',
  area: 'Purchase Reports',
  title: 'Purchase Reports — Stitching',
  who: WHO,
  summary: 'Fabric and other goods that go through Stitching. Two kinds of record: each delivery ROMS books in against an outbound PO (receipts with the same Incoming No from the same vendor are one record, Billing is the Bill No), and each challan that hands goods from one stage to the next (Billing is the Challan No, with the stages under it, for example Processing → Stitching). On a challan the Rate and Qty are in the same unit: metres out of Processing, dozens after it.',
  flows: FLOWS,
  faq: [
    { q: 'Why is each challan its own record?', a: 'A challan is its own document from the party that sent the goods, so each one is checked and approved on its own. A challan with several lines shows them together.' },
    { q: 'Why do several challans have the same Incoming No?', a: 'The Incoming No follows the goods from stage to stage in ROMS, so every challan out of one lot carries it. The challan number tells them apart.' },
    { q: 'Whose name is under the Incoming No?', a: 'On a receipt, the vendor the goods were bought from. On a challan, the party that sent the goods on.' },
    { q: 'Why does a challan have no rate?', a: 'No rate was entered on it in ROMS. Add it on ROMS’s Stitching page; RAMS shows it after its next read.' },
    ...COMMON_FAQ,
  ],
};
