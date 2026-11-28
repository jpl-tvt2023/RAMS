// Help: Purchase Reports -- Warehouse (/purchases/warehouse) and Stitching
// (/purchases/stitching). ROMS's receipts and challans, one row per ROMS line
// (listed with the rest of its delivery), each line with its bill or challan
// copy, an explicit Send for approval (with recall), and two approvals: the
// Purchase Head, then the Accountant Head, who can send it back even after
// approving. One section per page; they share the flows.

const WHO = 'Seeing the pages and their bills: “See Purchase Reports” (Accountants, Viewers and both heads by default). Attaching the bill, sending a line for approval and recalling it: “Bill check” (Accountants by default). The first approval, and taking it back: “Approve as Purchase Head” (the Purchase Head role). The final approval: “Approve as Accountant Head” (the Accountant Head role). Admin and Owner can do every step. All of this is set on Admin → Roles & permissions.';

const FLOWS = [
  {
    title: 'Find what is waiting for you',
    steps: [
      'Purchase Reports → Warehouse, or Purchase Reports → Stitching.',
      'It opens on this financial year and this month. Pick another month, or All months, in the Month box; pick another year in the Financial year box (it then shows All months of that year).',
      'There are five tabs: To check (the checker’s queue), With Purchase Head, With Accountant Head, Approved, and All. It opens on the step you work on. Click another tab to see the rest; the number on each tab is how many lines it holds.',
      'Each row is one ROMS line. The lines of one delivery sit together under its Incoming No (with the vendor, and how many lines it has).',
      'The Note column tells each line’s story so far, one short note per stage: “No bill attached” at first, then the bill, who sent it for approval, each head’s approval, and a send-back in red.',
      'Narrow it down with the company or the search box (Incoming No, bill or challan number, PO, article, vendor or party).',
      'The line above the table says when RAMS last read ROMS. Click Refresh from ROMS to read it now.',
      'Download Excel saves everything the filters show, one row per line, with both heads’ approvals and the Note.',
    ],
  },
  {
    title: 'Attach the bill and send it for approval',
    steps: [
      'On the To check tab, find the line and compare it with the bill or challan in your hand: the rate, quantity and unit.',
      'Click View/Attach bill on that line. The window shows the delivery’s lines and the files on this line.',
      'One bill for several lines? Tick the delivery’s other lines in the window (the line you opened is always ticked; the top tick takes every line still with you). Each line is still approved on its own.',
      'Drop the bill or challan copy into the box (a PDF, a photo, or an email), click Choose files, or press Ctrl+V to paste a screenshot. It goes on every ticked line and is stored once. A bill is compulsory: a line can’t be sent for approval without one.',
      'Attaching sends nothing: close the window and the files stay on the line, with you. The Note says “Bill attached”.',
      'When the line is ready, add a note if it helps (for example what you checked or corrected) and click Send for approval. Every ticked line goes to the Purchase Head, each with its own history, and its files are locked. The button stays off while any ticked line has no bill.',
      'The Bill check by column now shows your name and the time; click it to see the line’s full history.',
    ],
  },
  {
    title: 'Send several lines at once',
    steps: [
      'Attach the bills first (View/Attach bill on each line); they wait with you.',
      'Tick the lines on the left. A delivery with several lines has an “All” tick under its Incoming No that ticks them together.',
      'Click Send N for approval above the table, then Send for approval to go ahead. Only lines with a bill are sent: if a ticked line has none, RAMS says so beside the button.',
      'To add a note to a line, send it from its View/Attach bill window instead.',
    ],
  },
  {
    title: 'Recall a line you sent',
    steps: [
      'Sent it too soon, or attached the wrong bill? Until the Purchase Head acts on it, click Recall on the line (or tick several and click Recall N).',
      'It comes back to To check: its files unlock, and your note is kept in the window for the next send.',
      'The Purchase Head can do the same with their approval, until the Accountant Head acts: Recall puts the line back with the Purchase Head.',
      'A line the Accountant Head sent back to the Purchase Head can’t be recalled by the checker: the Purchase Head decides whether to send it on to you.',
      'If the next person has acted already, RAMS says who and when. Ask them to send it back instead.',
      'An approved line can’t be recalled; a head can send it back (below).',
    ],
  },
  {
    title: 'Approve as the Purchase Head',
    steps: [
      'Open the With Purchase Head tab. Your column, Purchase Head, says Pending approval on each line waiting for you.',
      'Click View bill to see the bill and the checker’s note.',
      'Click Approve, then Approve again to confirm. Your column turns green with your name, and the line goes on to the Accountant Head.',
      'To approve several at once, tick them on the left and click Approve selected. A delivery with several lines waiting has an “All” tick under its Incoming No that ticks them together.',
      'If something is wrong, click Send back instead and write why (required). The line goes back to the checker, on the To check tab, and its row turns red with your reason.',
      'A line the Accountant Head sent back to you is red too, with their reason. Approve it again to send it on to them, or send it back to the checker.',
    ],
  },
  {
    title: 'Approve as the Accountant Head',
    steps: [
      'Open the With Accountant Head tab. The Purchase Head column shows who approved each line, in green; yours says Pending approval.',
      'Click View bill to see the bill, then Approve and confirm, or tick several and click Approve selected. This is the final approval: the line turns green and moves to the Approved tab.',
      'Or click Send back and write why. It goes back one step, to the Purchase Head (on the With Purchase Head tab), with the Purchase Head’s approval cleared. They approve it again, or send it on to the checker.',
    ],
  },
  {
    title: 'Change your mind after approving',
    steps: [
      'A head can turn their approval into a send-back at any time, even after the final approval.',
      'Under your green “Approved by” in your column, click Send back, write why (required) and send.',
      'Both approvals are cleared, the row turns red with your reason, and the line goes back one step before you: from the Purchase Head to the checker, from the Accountant Head to the Purchase Head. Its history keeps the approvals and the send-back.',
    ],
  },
  {
    title: 'When a line is sent back to you',
    steps: [
      'A sent-back line goes to the queue before the head who sent it: the Purchase Head’s to To check, the Accountant Head’s to With Purchase Head.',
      'Its row is red, and the Note says who sent it back and why. The head columns say Not approved again.',
      'Checker: sort out the problem. Click View/Attach bill, upload the corrected bill and remove the wrong file, or get ROMS corrected. Add a note on what you changed and click Send for approval. It goes to the Purchase Head again.',
      'Purchase Head: approve it again to send it on to the Accountant Head, or send it back to the checker with your reason.',
      'Once it is sent on, the row is no longer red. The history keeps every send-back.',
    ],
  },
  {
    title: 'When ROMS changes a line after it was sent',
    steps: [
      'If someone changes a line in ROMS after it was sent for approval (its quantity, rate, bill or challan number, article or Incoming No), RAMS notices on its next read.',
      'The line goes back to the start, the To check tab, wherever it was. Its approvals are cleared, and the Note says “Changes were made in ROMS”, with what changed. Its history keeps the approvals and the change. The delivery’s other lines are not touched.',
      'Check it against the bill again and send it for approval. It goes to the Purchase Head again.',
      'If a line is deleted in ROMS, it shows Removed in ROMS and is listed only under All. It is kept, with its files and history, but can no longer be sent or approved.',
    ],
  },
];

const COMMON_FAQ = [
  { q: 'Does attaching a file send the line for approval?', a: 'No. Attached files stay on the line, with the checker, until someone clicks Send for approval (in the View/Attach bill window, or Send N for approval for ticked lines). Only then does the line go to the Purchase Head.' },
  { q: 'How do I take a line back?', a: 'Click Recall on it, until the next person acts. The checker recalls a line from the Purchase Head (it comes back to To check, files unlocked, note kept); the Purchase Head recalls their approval from the Accountant Head. Every recall is in the line’s history.' },
  { q: 'Can an approved line be changed?', a: 'Yes. A head can send it back with a reason at any time, even after the final approval: click Send back under your green approval. It can’t be recalled, because recall is only for a step the next person hasn’t acted on yet.' },
  { q: 'Why is each line approved on its own?', a: 'The client asked for it (28 Nov 2026): each line of a delivery can carry its own bill and is approved by itself. When one bill covers several lines, tick them in the View/Attach bill window and upload and send once; each line still keeps its own files, history and approvals.' },
  { q: 'What do Not approved, Pending approval and Approved by mean?', a: 'Each head has a column. Pending approval: the line is waiting for that head now. Approved by <name>, in green, with the time: that head approved it. Not approved: it hasn’t reached that head yet, or a send back, a recall or a ROMS change cleared the approval.' },
  { q: 'What are the tabs?', a: 'One for each queue a line can be in: To check (with the checker), With Purchase Head, With Accountant Head and Approved, then All. Sent back and Changed in ROMS are not tabs: a line sent back goes to the queue before the head who sent it (red, with the reason), and a line changed in ROMS goes back to To check with a note of what changed. A line deleted in ROMS is listed only under All.' },
  { q: 'Why can’t I send this line?', a: 'It has no bill. A line is never sent for approval, or approved, without one: attach the bill or challan copy in View/Attach bill first. Lines that reached a head without a bill before this rule were sent back to the checker by RAMS, with the reason in the Note.' },
  { q: 'What is the Note column?', a: 'The line’s story in this round, one short note per stage, oldest first: No bill attached (or Bill attached, with how many files), Sent for approval by <name> with the checker’s note, each head’s approval, Sent back (in red, with who and why), Changes were made in ROMS (with what changed), Removed in ROMS. A send back, recall or ROMS change starts a new round; the full past is in the history.' },
  { q: 'Where did the Files column go?', a: 'The bill is in the line’s window: View/Attach bill if you can attach and send it, View bill if you can only look. The Note says whether a bill is attached, and how many files.' },
  { q: 'What does each column come from?', a: 'Everything except Bill check by, the two head columns and Note is read from ROMS: the Incoming No (the gate number typed on the receipt), the Date, the bill or challan number, the PO, the article, the rate, the quantity and the unit. RAMS never changes anything in ROMS from this page.' },
  { q: 'What is the Date, and which month is a line in?', a: 'The day the receipt or challan was entered in ROMS (ROMS doesn’t keep a separate date for them). The Month and Financial year boxes go by that day, in Indian time.' },
  { q: 'What do the colours mean?', a: 'Green: approved (the whole row once both heads approved, and each head’s own column once that head approved). Red: sent back, until whoever it was sent back to sends it on. Nothing else is highlighted.' },
  { q: 'Why can’t I add or remove a file?', a: 'Files can change only while the line is with the person who checks bills, on the To check tab. Once it is sent for approval they are locked: recall it, or ask the Purchase Head to send it back, to change them. Attaching also needs the “Bill check” permission.' },
  { q: 'Can the same person check and approve?', a: 'Yes, if they hold both permissions. Every step is kept in the line’s history, with who did it and when.' },
  { q: 'How fresh is it?', a: 'RAMS reads ROMS when you open the page (if it last read more than five minutes ago), when you click Refresh from ROMS, and after each matching run.' },
  { q: 'Where is the history?', a: 'Click the name in Bill check by, or the clock icon on the row. It lists every send, recall, approval, send-back, file and ROMS change on that line, newest first.' },
  { q: 'What is in the Excel download?', a: 'Every line the filters show, with the same columns as the page plus the files’ names and the status. The header stays at the top with a filter, and rates and quantities are real numbers you can add up.' },
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
    { q: 'Why are several lines under one Incoming No?', a: 'They share an Incoming No from the same vendor, so they came in as one delivery. Each line is still checked and approved on its own; tick them together in the View/Attach bill window when one bill covers them.' },
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
    { q: 'How are challans listed?', a: 'A challan’s lines sit together, and each line is checked and approved on its own. Tick them together in the View/Attach bill window when one challan covers them.' },
    { q: 'Why do several challans have the same Incoming No?', a: 'The Incoming No follows the goods from stage to stage in ROMS, so every challan out of one lot carries it. The challan number tells them apart.' },
    { q: 'Whose name is under the Incoming No?', a: 'On a receipt, the vendor the goods were bought from. On a challan, the party that sent the goods on.' },
    { q: 'Why does a challan have no rate?', a: 'No rate was entered on it in ROMS. Add it on ROMS’s Stitching page; RAMS shows it after its next read.' },
    ...COMMON_FAQ,
  ],
};
