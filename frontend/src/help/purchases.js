// Help: Purchase Reports -- Warehouse (/purchases/warehouse) and Stitching
// (/purchases/stitching). ROMS's receipts and challans, one row per ROMS line
// (listed with the rest of its delivery), each line with its bill or challan
// copy, a bill check, and two approvals: the Purchase Head, then the Accountant
// Head. One section per page; they share the flows.

const WHO = 'Seeing the pages and their files: “See Purchase Reports” (Accountants, Viewers and both heads by default). Uploading the bill and saving the bill check: “Bill check” (Accountants by default). The first approval: “Approve as Purchase Head” (the Purchase Head role). The final approval: “Approve as Accountant Head” (the Accountant Head role). Admin and Owner can do every step. All of this is set on Admin → Roles & permissions.';

const FLOWS = [
  {
    title: 'Find what is waiting for you',
    steps: [
      'Purchase Reports → Warehouse, or Purchase Reports → Stitching.',
      'It opens on this financial year and this month. Pick another month, or All months, in the Month box; pick another year in the Financial year box (it then shows All months of that year).',
      'It opens on the step you work on: To check for the person who checks bills, With Purchase Head for the Purchase Head, With Accountant Head for the Accountant Head. Click another tab to see the rest; the number on each tab is how many lines it holds.',
      'Each row is one ROMS line. The lines of one delivery sit together under its Incoming No (with the vendor, and how many lines it has).',
      'Narrow it down with the company or the search box (Incoming No, bill or challan number, PO, article, vendor or party).',
      'The line above the table says when RAMS last read ROMS. Click Refresh from ROMS to read it now.',
      'Download CSV or Download Excel saves everything the filters show, one row per line, with both heads’ approvals.',
    ],
  },
  {
    title: 'Upload the bill and do the bill check',
    steps: [
      'On the To check tab, find the line and compare it with the bill or challan in your hand: the rate, quantity and unit.',
      'Click Upload bill & check on that line. One window does both jobs: it shows the delivery’s lines, the files, and the bill check.',
      'One bill for several lines? Tick the delivery’s other lines in the window (the line you opened is always ticked; the top tick takes every line still waiting for a check). Each line is still approved on its own.',
      'Drop the bill or challan copy into the box (a PDF, a photo, or an email), click Choose files, or press Ctrl+V to paste a screenshot. It goes on every ticked line and is stored once. A file is not compulsory.',
      'Add a note if it helps (for example what you checked or corrected), then click Save bill check. Every ticked line goes to the Purchase Head, each with its own history.',
      'The Bill check by column now shows your name and the time; click it to see the line’s full history.',
      'From now on the files are locked, so the heads approve exactly what you checked. Only a head sending a line back unlocks it.',
    ],
  },
  {
    title: 'Approve as the Purchase Head',
    steps: [
      'Open the With Purchase Head tab. Your column, Purchase Head, says Pending approval on each line waiting for you.',
      'Check the line, and click its file count to view the bill.',
      'Click Approve, then Approve again to confirm. Your column turns green with your name, and the line goes on to the Accountant Head.',
      'To approve several at once, tick them on the left and click Approve selected. A delivery with several lines waiting has an “All” tick under its Incoming No that ticks them together.',
      'If something is wrong, click Send back instead and write why (required). The line goes back to the bill check, and its row turns red with your reason.',
    ],
  },
  {
    title: 'Approve as the Accountant Head',
    steps: [
      'Open the With Accountant Head tab. The Purchase Head column shows who approved each line, in green; yours says Pending approval.',
      'Click Approve and confirm, or tick several and click Approve selected. This is the final approval: the line turns green and moves to the Approved tab.',
      'Or click Send back and write why. It goes back to the bill check, and once it is checked again it comes to the Purchase Head first.',
    ],
  },
  {
    title: 'When a line is sent back',
    steps: [
      'Its row is red, and the Status says which head sent it back and why. It is on the Sent back tab. Both head columns say Not approved again.',
      'Sort out the problem: in the window upload the corrected bill and remove the wrong file, or get ROMS corrected.',
      'Click Check again, add a note on what you changed, and save. It starts over at the Purchase Head.',
    ],
  },
  {
    title: 'When ROMS changes a line after its bill check',
    steps: [
      'If someone changes a line in ROMS after the bill check (its quantity, rate, bill or challan number, article or Incoming No), RAMS notices on its next read.',
      'The line shows Changed in ROMS, with what changed under it, and its approvals are cleared. Its history keeps them, and the change. The delivery’s other lines are not touched.',
      'Check it against the bill again and save. It goes to the Purchase Head again.',
      'If a line is deleted in ROMS, it shows Removed in ROMS. It is kept, with its files and history, but can no longer be checked or approved.',
    ],
  },
];

const COMMON_FAQ = [
  { q: 'Why is each line approved on its own?', a: 'The client asked for it (28 Nov 2026): each line of a delivery can carry its own bill and is approved by itself. When one bill covers several lines, tick them in the bill check window and upload and save once; each line still keeps its own files, history and approvals.' },
  { q: 'What do Not approved, Pending approval and Approved by mean?', a: 'Each head has a column. Pending approval: the line is waiting for that head now. Approved by <name>, in green, with the time: that head approved it. Not approved: it hasn’t reached that head yet, or a send back or a ROMS change cleared the approvals.' },
  { q: 'Where did the Add button for files go?', a: 'Files are uploaded in the bill check window: click Upload bill & check on the line. The Files column shows how many files a line has; click it to view them.' },
  { q: 'What does each column come from?', a: 'Everything except Files, Bill check by, the two head columns and Status is read from ROMS: the Incoming No (the gate number typed on the receipt), the Date, the bill or challan number, the PO, the article, the rate, the quantity and the unit. RAMS never changes anything in ROMS from this page.' },
  { q: 'What is the Date, and which month is a line in?', a: 'The day the receipt or challan was entered in ROMS (ROMS doesn’t keep a separate date for them). The Month and Financial year boxes go by that day, in Indian time.' },
  { q: 'What do the colours mean?', a: 'Green: approved (the whole row once both heads approved, and each head’s own column once that head approved). Red: sent back by a head. Nothing else is highlighted.' },
  { q: 'Why can’t I add or remove a file?', a: 'Files can change only while the line is with the person who checks bills: To check, Sent back or Changed in ROMS. After the bill check is saved they are locked. Uploading also needs the “Bill check” permission.' },
  { q: 'Can the same person check and approve?', a: 'Yes, if they hold both permissions. Every step is kept in the line’s history, with who did it and when.' },
  { q: 'How fresh is it?', a: 'RAMS reads ROMS when you open the page (if it last read more than five minutes ago), when you click Refresh from ROMS, and after each matching run.' },
  { q: 'Where is the history?', a: 'Click the name in Bill check by, or the clock icon on the row. It lists every bill check, approval, send-back, file and ROMS change on that line, newest first.' },
  { q: 'What is in the Excel download?', a: 'The same rows and columns as the CSV, ready for Excel: the header stays at the top with a filter, and rates and quantities are real numbers you can add up.' },
];

export const purchasesWarehouseHelp = {
  id: 'purchases-warehouse',
  path: '/purchases/warehouse',
  area: 'Purchase Reports',
  title: 'Purchase Reports — Warehouse',
  who: WHO,
  summary: 'Each line ROMS books in against an outbound PO for goods that never go through Stitching: packaging, barcodes and the like. Every line is a row with its own files, bill check and approvals; the lines with the same Incoming No from the same vendor (one delivery) are listed together under it. Billing is the vendor’s Bill No, and Rate is the billed rate.',
  flows: FLOWS,
  faq: [
    { q: 'Why are several lines under one Incoming No?', a: 'They share an Incoming No from the same vendor, so they came in as one delivery. Each line is still checked and approved on its own; tick them together in the bill check window when one bill covers them.' },
    { q: 'The same Incoming No shows twice.', a: 'It was used by two different vendors, so RAMS keeps them as two deliveries. If it is a typing mistake, correct it in ROMS.' },
    { q: 'What does “No Incoming No in ROMS” mean?', a: 'The receipt has no Incoming No in ROMS, so RAMS can’t tell which delivery it belongs to and lists it alone. Add the number in ROMS; on its next read RAMS lists it with the rest of its delivery, keeping its files and history.' },
    ...COMMON_FAQ,
  ],
};

export const purchasesStitchingHelp = {
  id: 'purchases-stitching',
  path: '/purchases/stitching',
  area: 'Purchase Reports',
  title: 'Purchase Reports — Stitching',
  who: WHO,
  summary: 'Fabric and other goods that go through Stitching. Two kinds of line, each a row with its own files, bill check and approvals: each line ROMS books in against an outbound PO (listed under its Incoming No; Billing is the Bill No), and each line of a challan that hands goods from one stage to the next (Billing is the Challan No, with the stages under it, for example Processing → Stitching). On a challan the Rate and Qty are in the same unit: metres out of Processing, dozens after it.',
  flows: FLOWS,
  faq: [
    { q: 'How are challans listed?', a: 'A challan’s lines sit together, and each line is checked and approved on its own. Tick them together in the bill check window when one challan covers them.' },
    { q: 'Why do several challans have the same Incoming No?', a: 'The Incoming No follows the goods from stage to stage in ROMS, so every challan out of one lot carries it. The challan number tells them apart.' },
    { q: 'Whose name is under the Incoming No?', a: 'On a receipt, the vendor the goods were bought from. On a challan, the party that sent the goods on.' },
    { q: 'Why does a challan have no rate?', a: 'No rate was entered on it in ROMS. Add it on ROMS’s Stitching page; RAMS shows it after its next read.' },
    ...COMMON_FAQ,
  ],
};
