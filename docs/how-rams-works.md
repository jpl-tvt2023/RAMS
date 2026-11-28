# How RAMS works

*Royal Mart Accounts (RAMS), explained without the technical words. Last updated 27 November 2026.*

---

## 1. RAMS in one paragraph

Royal Mart keeps its **accounts in Tally** and its **marketplace orders in ROMS** (the Royal Mart portal). Until now, the two never spoke to each other. Someone had to read an invoice number in Tally and type it into ROMS, and nobody could easily see which order had been invoiced, paid or credited.

**RAMS is the bridge between them.** It reads the books from Tally, matches each ROMS order to the Tally invoice that billed it, and each return to the credit note that settled it. With your permission, it then writes Tally's invoice and credit-note numbers into ROMS. Report screens, such as what every marketplace owes, follow one at a time. On **Party Statements**, each bill-to-bill party's statement comes straight from Tally, and your team attaches each row's document. On **Attachments**, every invoice, payment, debit note and credit note of the year is listed month by month, as in Tally's registers, with its document, e-invoice number and narration.

```
   TALLY                      RAMS                         ROMS
 (the accounts)          (the bridge)                (the orders portal)
                                                         
 Sales invoices   ──►  copy of Tally's books   ◄──  POs, RTV rows
 Credit notes          matches orders to             (read only)
 Receipts              invoices and returns            
 Journals              to credit notes        ──►  Bill No + Bill Date,
                       (reports to follow)         CN No + CN Date
   (only read)                                     (only these, only if
                                                    you switch it on)
```

## 2. The three systems

| | What it is | Who uses it | What RAMS does with it |
|---|---|---|---|
| **Tally** | The accounts: invoices, credit notes, receipts, journals | The accountant | **Only reads it.** RAMS can never change anything in Tally. |
| **ROMS** | The orders portal: marketplace POs, dispatch (Builty), GRN, returns (RTV) | Operations staff | Reads the orders and returns. Writes only two pairs of fields, and only when switched on. |
| **RAMS** | The bridge; report screens follow one at a time | Accounts team, owners | Its own website: `accounting.theroyalmart.co.in` |

## 3. What RAMS will never do

- **It never changes Tally.** Every request it makes to Tally is "export" (read). There is no way for it to write. What your team adds on *Party Statements* and *Attachments* stays in RAMS.
- **It never deletes anything in ROMS.**
- **It writes only four fields in ROMS:**
  - the **Bill No** and **Bill Date** of an order
  - the **Credit Note No** and **CN Date** of a return

  It writes them only after someone switches auto-fill on.
- **It never overwrites what a person typed**, unless it is the same number written differently (for example `607` for `607/RM/26-27`).
- **It never writes over a field someone changed at the same moment.** ROMS checks that the field still holds what RAMS last saw, and refuses otherwise.
- **Every change it makes is recorded in ROMS's own history as "Tally Sync",** and in RAMS's Auto-fill log with the name of whoever approved it.

## 4. How the data travels

**The Connector** is a small program on the office PC where Tally runs.
- It reads Tally over Tally's own connection, the same one Tally uses for its reports.
- It sends the books to RAMS over a secure (HTTPS) connection, using a private key that only RAMS accepts.
- **Setting it up** is one double-click on *Setup RAMS Connector*. You paste the Connector code an Admin gives you and click Connect. It checks that Tally answers and that RAMS accepts the code, and says what to change if not. It then loads Tally into RAMS the first time and starts by itself each time you sign in to Windows.

**When it reads Tally:**
- **Every minute:** it tells RAMS it's alive, and whether Tally is open.
- **Every hour, in office hours** (Mon–Sat, 09:00–19:00; changeable in RAMS): it fetches only what changed in Tally since the last time. That takes seconds.
- **Once after office hours:** a full check, which also catches anything deleted in Tally.

**If the office PC or Tally is off,** nothing is lost. RAMS keeps showing the last data it had, and the **Tally sync** card on the Dashboard says so. When the PC comes back, the Connector catches up with everything that changed.

**After each sync, RAMS matches again,** and then auto-fill writes what's due (if it is switched on).

## 5. What RAMS reads from Tally

RAMS keeps a copy of the books of **MH, HR and WB** from **1 April 2026** (the start of the financial year) onwards, so every month on *Attachments* matches Tally's registers. **Matching starts on 8 June 2026**, when ROMS went live: ROMS has no orders before then, so an earlier invoice is never called "no PO". Other companies in Tally are ignored, and an Admin chooses which companies are synced.

### Company

| In Tally | Why RAMS needs it |
|---|---|
| Company name and state | To tell MH, HR and WB apart |
| Books beginning from | To know where the books start |
| Tally's internal change counters | To fetch only what changed since last time |
| Company GSTIN (from its vouchers) | To recognise sales to our own other registrations (stock transfers) |

### Ledgers and groups

| In Tally | Why RAMS needs it |
|---|---|
| Ledger name, alias and group (for example *Sundry Debtors*, *Sales Accounts*, *Duties & Taxes*) | To know which ledgers are customers, which are sales and which are GST |
| Ledger GSTIN and state (the latest dated entry) | To tell which marketplace a party ledger belongs to and which ledgers are Roymax's own registrations, and to filter *Party Statements* by state |
| City and PIN code (the latest address) | The *City* on *Attachments*. Today no ledger in Tally has its City filled in (159 of 820 MH ledgers have a PIN code), so RAMS uses the city on the ROMS order until it is |
| Bill-wise on/off | To know whether Tally tracks a party's invoices one by one |
| Each ledger's closing balance | To start each party's balance on *Party Statements* from Tally's own figure |

### Stock items and voucher types

| In Tally | Why RAMS needs it |
|---|---|
| Stock item name, alias, unit, HSN | The marketplace's item code inside the item name is how RAMS checks that an invoice is for the products the PO ordered |
| Voucher type name and its parent | To know that "Sales - Zepto" is a kind of Sales, and so on |

### Vouchers (every voucher type)

| In Tally | Why RAMS needs it |
|---|---|
| Date, voucher type, **voucher number** | The invoice or credit note number that goes into ROMS (for example `607/RM/26-27`) |
| **Order details → Buyer's Order No** | **The main link to ROMS:** the marketplace PO number typed on the invoice finds the ROMS order |
| Party ledger, party GSTIN | Which customer and marketplace the invoice is for |
| Reference no and date | The supplier's invoice number, on purchases |
| Narration (up to 2,000 characters) | Shown next to the voucher on every screen; a voucher without one is highlighted |
| Cancelled / optional flags | Cancelled and optional vouchers are ignored |
| Total amount | Invoiced value |
| Ledger lines (ledger, amount, debit or credit) | Taxable value, GST, and TDS on journals |
| **Bill-wise details** (New Ref / Agst Ref / On Account, bill name, amount) | **What settled each invoice:** a receipt, credit note or TDS journal entered "Agst Ref" against it. A credit note's Agst Ref also tells RAMS which invoice, and so which order, a return belongs to. |
| Item lines: stock item, quantity, rate, amount, godown, order no | The product and quantity checks |
| **E-invoice:** IRN, Ack No, Ack date, cancelled or not | Shown on *Attachments* next to each invoice and credit note, with the IRN ready to copy. In August, 207 of 211 MH invoices and all 114 credit notes had one |
| Change counter and unique ID | So an edited voucher replaces the old copy, and a deleted one is noticed |

**What RAMS does not keep:** Tally sends addresses, e-way bill details and the GST breakdown along with each voucher. RAMS discards them.

## 6. What RAMS reads from ROMS

ROMS gives RAMS a read-only view. Nothing here is changed by reading it.

| In ROMS | Why RAMS needs it |
|---|---|
| **Order (PO):** PO number, vendor, marketplace PO no, PO date, status, party, city, dispatch date | To find the Tally invoice for each order |
| **Bill No and Bill Date** (Builty page) | A second way to find the invoice, and what auto-fill may update |
| GRN status, date, quantity, discrepancy | To know which orders came back or were short (the RTV page) |
| **PO lines:** item code, quantity, SKU | The product and quantity checks |
| **RTV rows:** RTV no, status, DN no, **CN No and CN Date** | To find the Tally credit note for each return |
| Products and marketplace item codes | To turn a marketplace item code into a Royal Mart SKU |

## 7. How matching works

For every ROMS order, RAMS looks for the Tally invoice:

1. **By the Buyer's Order No.** The marketplace PO number typed on the Tally invoice, for example `P4588464`, finds the order with that marketplace PO number. RAMS also understands:
   - Zepto's habit of adding a label: `P4588464- Dry` is read as `P4588464`
   - two PO numbers in one field
2. **Else by the Bill No typed in ROMS.** Staff often type just the serial, so `607` or `0607` finds invoice `607/RM/26-27`. If the same serial exists in two companies, the Bill Date and the financial year decide.
3. **For returns,** the credit note that settles the order's invoice (its *Agst Ref* in Tally), or the CN No typed on the RTV row.

**Then it checks each link.** Each check can be switched off, shown as a note, or made to stop the link for a person:
- Is the invoice billed to the right marketplace's ledger?
- Does it share a product with the PO?
- Is the quantity no more than the PO?
- Is it dated after the PO?
- Is the same invoice linked to another PO?

**Every order and return gets one status, with the reason in plain words:**

| Status | Meaning |
|---|---|
| **Linked** | Found, and every check passed |
| **Needs review** | A person should decide, for example when the Bill No typed in ROMS isn't the invoice the Buyer's Order No found |
| **Waiting for Tally** | Not in Tally yet. This is normal until the accountant enters the invoice. |
| **Not matched** | Left out on purpose (Flipkart and Amazon stock transfers, for now) |

**A person's decision always wins.** On *Match review*, anyone allowed can confirm a link, pick a different invoice, or reject one. RAMS remembers that, whatever the rules say later.

## 8. Results on Royal Mart's real data

Checked on the real books (MH, HR, WB) and the ROMS test copy, October 2026:

| | Linked | Needs review | Waiting for Tally | Not matched |
|---|---|---|---|---|
| **Orders (850, not counting deleted ones)** | **687** | 3 | 118 | 42 (Flipkart, Amazon) |
| **Returns (228)** | **96** | 18 | 100 | 14 |

- Of the 687 linked orders, 681 have a Bill No in ROMS that is a short form of Tally's number (like `607`). 6 have none. Auto-fill would write the full number into all 687.
- A trial run (ROMS was asked "what would happen", and nothing was written) said ROMS would accept all **783** writes: 687 Bill Nos and 96 CN Nos.
- 23 orders have a Bill Date in ROMS that differs from Tally's invoice date, usually by a day. By default auto-fill uses Tally's date, and this can be changed.

## 9. Auto-fill: writing Tally's numbers into ROMS

**Each field (Bill No, CN No) has its own switch**, on *Matching → Auto-fill*:

| Mode | What happens |
|---|---|
| **Off** | Nothing is sent to ROMS. This is the starting point. |
| **Preview** | RAMS asks ROMS what *would* happen and lists it. Nothing is written. |
| **Ask first** | Like Preview, then a person approves (all at once, or row by row) and RAMS writes |
| **Automatic** | RAMS writes after every match |

**The recommended path:** a week on Preview, then Ask first, then Automatic. Bill No first, then CN No.

**What is written:**
- a blank field gets Tally's number
- a short form (`607`) becomes the full number (`607/RM/26-27`)

**What is never written automatically:** a number that is *not* a form of Tally's. Those are listed under *Needs a person*; staff fix them in ROMS, or an Admin writes Tally's number deliberately.

**To stop it:** set the field to Off. It stops at once.

## 10. Reports: one screen at a time

The report screens (what has been invoiced, what has been paid, and what is still owed) are delivered **one at a time**. We go through each one with you, adjust it to what you need, and only then switch it on in RAMS.

In the top bar they are under **Tally Reports**: *Bills Receivable*, *Party Statements* (section 11) and *Attachments* (section 12). **Purchase Reports** is there too, greyed and marked *Coming soon*: it can't be clicked yet.

**New names (18 November):** *Debtors* is now **Bills Receivable**, Tally's own name for the bill-wise list of what is owed. *Ledgers* is now **Party Statements**, since it shows each party's statement from opening to closing. They are the same pages with the same permissions. Their addresses moved to */reports/bills-receivable* and */reports/party-statements*, and the old ones still lead there.

**Bills Receivable** is the first one (*Tally Reports → Bills Receivable*). It lists every sales invoice since 1 April, with a tab for each marketplace (All, Amazon, Blinkit and so on). For each invoice it shows:

| Column | What it is |
|---|---|
| Invoice | The Tally invoice number, with its company and date |
| Party | The party ledger it was billed to |
| Internal PO no | ROMS's own PO id (for example B002). An invoice from before 8 June says *Before ROMS*: it can't have one |
| Vendor PO no | The marketplace's purchase order number |
| Amount | The invoice total |
| CN | The credit notes set against it in Tally (ours, and the marketplace's DNs, which Tally books as credit notes). Click the amount to see each one: its number, date, amount, the ROMS return (RTV) it belongs to, and its files |
| Outstanding | What is still owed after receipts, credit notes, TDS and adjustments, and how many days it is overdue |
| Files | The invoice's files (PDF, photo or email), added on *Attachments* or *Party Statements*. Click to view or download them |

**An invoice is orange while a DN or CN against it has no file**, with "1 without a file" (or more) under its CN amount. In the credit-note window the note without a file is orange too, with a link, *Add it on Party Statements*, that opens that party on Party Statements showing just its rows without a file. Once each DN and CN against the invoice has its file, the orange goes. Only Minutes, Now and Zepto invoices can turn orange here, the parties Party Statements covers. (*Attachments* marks every voucher without its document, whatever the party.) A credit note set against two invoices needs its file only once.

It opens on **MH**, with all marketplaces and all statuses. You can switch to another company or to all companies together, and filter by Open, Overdue, Settled or No PO. You can search by invoice, party or either PO number, and download it for Excel.

Until the rest arrive, RAMS keeps working in the background: it copies the books, matches orders and returns, and writes the numbers into ROMS once you switch that on. Each report covers everything since 1 April, so nothing is missed by waiting.

**Something to start on in Tally now:** several marketplaces pay into a *head-office* ledger "On Account", not against the warehouse-ledger invoices. In Tally's bill-wise view, those invoices therefore look unpaid. Setting those receipts against their invoices in Tally will make the figures exact when the reports arrive.

## 11. Party Statements: the bill-to-bill statement

**Party Statements** is under *Tally Reports → Party Statements*. It shows the statement of each party of the marketplaces that **pay bill to bill**: **Minutes, Now and Zepto** to begin with. Blinkit and Scootsy say *coming soon*, while their format is worked out.

1. It opens on **MH**, **all** three marketplaces, **all** states and **all** parties, from the 1st of this month to today, with the statement already shown.
2. Narrow it by **company** (or all), **marketplace**, **states** and **parties**, and change the **dates** for another range. A new company or marketplace sets the filters after it back to *All*.
3. RAMS shows one row per party. With many parties, the list scrolls inside its own box (its headings and total stay in view), so the party you click opens just below it:

| Opening | Invoice | DN | CN | TDS | Journal / Adjustment | Receipt | Closing |
|---|---|---|---|---|---|---|---|
| 100 | +10 | −2 | −3 | −0.1 | +2 | −5 | 101.9 |

**Every row and every figure comes from Tally. Nothing is typed in RAMS.** Opening plus the six columns is the closing, which is Tally's own balance at the end of the range and the next range's opening.

| Column | From Tally |
|---|---|
| Invoice | Sales vouchers |
| DN | Credit notes booked for a debit note the marketplace raised on you (for example FKIDN51463346) |
| CN | Your other credit notes (for example the monthly discount) |
| TDS | Journals on a TDS ledger (TDS Receivable) |
| Journal / Adjustment | Every other voucher, such as discount round-offs |
| Receipt | Receipts. One receipt for several warehouses counts each warehouse's own part |

**Debit and credit notes are no longer typed in RAMS** (since 17 November). We checked first: for every Minutes, Now and Zepto party, Tally's own list of entries from 8 June matches RAMS one for one: **559 of 559**, with the same amounts, and Tally's balances agree on all 52 parties. Typing the notes again in RAMS was double work.
- There are no debit-note vouchers in Tally for these parties. A **marketplace DN** is booked as a credit note with the DN number in its narration (for example `FKIDN51463346`). Such a credit note is in the **DN** column, with the number shown beside it. Of the 81 credit notes since 8 June, 16 name a DN.
- Any other credit note (a return, a monthly discount) is **ours**, in the **CN** column. So the accountants should always write the DN number in the narration.
- **What RAMS no longer catches:** a DN the marketplace raised that nobody booked in Tally. That needed the typed notes. Compare the marketplace's DN report with the DN column now and then.

Each colour means one thing:

| Colour | Meaning |
|---|---|
| Purple ≠ | Two readings disagree: a marketplace DN on two credit notes in Tally (*DN booked twice*), or a party's state in Tally and in its GSTIN |
| Yellow | No narration (see below) |
| Orange | A row with no file yet (see below) |

Click a party to see every Tally voucher on it, with its narration, its files and the running balance. The **Needs attention** button above the statement (with how many parties) opens a list of every party with a DN booked twice, rows without a file, or a state that differs, and since when; click a party there to open it.

**The opening balance comes from Tally**, as before: each sync reads every ledger's balance. If a sync can't read it, the party starts on a placeholder of ₹10,000 on 1 April, carried forward by Tally's real vouchers.

### Files: each row's PDF, photo or email
Every row of a party can carry its proof: the invoice, the marketplace's DN, our CN, the receipt's advice or the TDS certificate.
- **Adding:** in the *Files* column, drag files in, choose them, or paste a screenshot with Ctrl+V. RAMS takes PDFs, photos (JPG, PNG, WebP) and emails saved from Gmail (.eml) or Outlook (.msg): up to 4 MB each after compression, and 10 per row.
- **A row without a file is orange**, across the whole row, until a file is added: every row from 1 April. *Needs attention* counts them for every party, and *Without a file* shows just those rows.
- **Viewing:** a PDF or a photo opens inside RAMS, and any file can be downloaded. PDFs and emails come back **exactly as they were added**. Emails are not opened in RAMS: they open in Outlook or your mail app, with their attachments.
- **Small on purpose:** photos are made smaller before they are sent (at most 2,000 pixels across; a 1.6 MB photo became 146 KB in our test, still easy to read). PDFs and emails are compressed without losing anything, and a file attached to several rows is kept once. One file for every DN, CN and invoice comes to about 1 GB a year. *Admin → File storage* shows the space used and saved, and the biggest files.
- An invoice's files, and those of the DN and CN against it, also show on *Bills Receivable*, where an invoice whose DN or CN has no file is orange (section 10).
- Adding and removing a file is in the Audit Log.

**Later, once the NAS is bought:** a shared folder that RAMS checks every few minutes, attaching each file named by its DN, CN or invoice number to the right row by itself.

### Narrations, everywhere
Every Tally record RAMS shows (on Party Statements, Bills Receivable, Match review and Auto-fill, and on the report screens still to come) now shows its **narration**. A record without one is **highlighted in yellow**, so the accountants can add it in Tally. Today almost no invoice or receipt has a narration (362 of 362 invoices on Minutes, Now and Zepto), so a lot will be highlighted at first. Which voucher types need a narration, and from which date, is a setting on *Admin → Tally companies* (*Narration check*).

### States: Tally's and the GSTIN's
Each party has two states: the one on its ledger in Tally, and the one its GSTIN belongs to (the first two digits). Where they disagree, RAMS shows **State differs** so the ledger can be corrected in Tally. The *State* filter lists a party under both, so it is never hidden. On the 4 October copy, 15 ledgers in MH disagree: all say Maharashtra in Tally. RAMS used to read the oldest address of a ledger rather than the latest; the new Connector (0.7.0) reads the latest.

**To decide together:**
- **Zepto's head-office ledgers.** Zepto pays into *ZEPTO PAYMENT* and *ZEPTO PVT LTD*, not each warehouse, so its warehouse rows show invoices but no receipts. Map those two ledgers to Zepto on *Matching → Party ledgers*. Three new Zepto dark stores (Coimbatore, Gurgaon Sohna, Hoogly) need mapping too.
- **Files volume.** No document is attached yet, so every row since 1 April starts orange: 559 rows from 8 June on Minutes, Now and Zepto today, and April and May once they are loaded. They clear as documents are added. If April and May don't need files, a setting for the date files are needed from can be added, like the narration check's.
- **Narration volume.** Until narrations are written, most invoices and receipts are highlighted. The *Narration check* can narrow it.

## 12. Attachments: every voucher's document, month by month

**Attachments** is under *Tally Reports → Attachments*. It answers one question for the whole year: **does every voucher have its document and its narration?** It looks like Tally's own registers (*Display More Reports → Account Books → Sales Register* and the others), so it reads the way your accountants already know.

**Choose the company and the year.** It opens on MH and this financial year (2026-27). One company is shown at a time, as in Tally.

**Four tabs**, each Tally's own voucher type:
| Tab | Tally's vouchers | Side, as in Tally's register |
|---|---|---|
| Invoice | Sales | Credit |
| Payments | Payment (money paid out) | Debit |
| Debit Note | Debit Note (our returns to suppliers) | Credit |
| Credit Note | Credit Note (including a marketplace's DN, which Tally books as a credit note) | Debit |

**Each tab lists the months, April to March**, with: how many vouchers, how many **need attention**, and the Debit or Credit. These are Tally's own figures: July's sales of MH on RAMS are **₹2,41,89,073.30**, August's ₹2,24,14,905.82 and September's ₹2,29,84,111.78, exactly as Tally's Sales Register shows them.

**A voucher needs attention** when it has no document attached, or no narration while the *Narration check* asks for one. Click a month's *Needs attention* number to see just those.

**Click a month to see its vouchers**, in Tally's order:
| Column | What it is |
|---|---|
| Invoice no (or Voucher, Debit Note, Credit Note no) | The Tally number and date |
| Ledger | The party. For a payment, who was paid (the ledger it debits), not the bank or cash it was paid from: in August, 135 of 243 MH payments show a different name from Tally's "party" this way |
| City | From the ledger's address in Tally. No ledger has its City filled in yet, so for now it comes from the ROMS order the invoice is linked to, or the party's latest order (marked *from ROMS*): 269 of 284 July invoices have one. Fill in City on the ledgers in Tally and it shows everywhere |
| Amount | The voucher's total |
| E-Invoice (Ack No) | The e-invoice acknowledgement number and date Tally holds (15 digits, for example 122633978676286). Hover over it to see the full IRN, and click the copy button to copy it. *IRN cancelled* when it was cancelled on the portal |
| Invoice PDF / Files | The documents attached: PDFs, photos or emails. Add, view, download or remove them here; they are the same files *Party Statements* and *Bills Receivable* show |
| Narration | *Yes* (hover to read it), or the yellow *No narration* |
| Last updated by | Who last changed the voucher in RAMS (added or removed a file) and when. Click it for the full history. Changes made in Tally itself are in Tally's own Edit Log. (This column used to be called *Audit Log*.) |

A voucher **without a document is orange**, across the row, until one is added. Tick *Needs attention only* to see only what is left to do, search by number, ledger, city or Ack No, and download the list for Excel.

**From 1 April.** RAMS's copy of Tally now starts on 1 April 2026, so every month of the year is there, as in Tally's registers. Matching still starts on 8 June (section 5).

**To decide together:**
- **Sales narrations.** None of Tally's 1,175 MH sales invoices since 8 June has a narration, so every invoice counts as needing attention. Either the accountants add one, or an Admin takes Sales out of the *Narration check*. The check starts on 8 June today; move it to 1 April to cover the whole year.
- **E-invoice numbers** show once the new Connector (0.8.0) has loaded all of Tally into RAMS again. Until then the column says *Not read yet*.

## 13. Who can do what

There are four roles. **Admin and Owner can always do everything**, and they decide what the other two may do, on *Admin → Roles & permissions*.

| | Accountant (starting setup) | Viewer (starting setup) |
|---|---|---|
| See matching and auto-fill | ✓ | ✓ |
| See Bills Receivable (Tally Reports) | ✓ | ✓ |
| See Party Statements | ✓ | ✓ |
| See Attachments | ✓ | ✓ |
| Add and remove files (on Party Statements and Attachments) | ✓ | – |
| View and download files (on Party Statements, Attachments and Bills Receivable) | ✓ | ✓ |
| Change the statement settings (marketplaces, placeholder opening) | – (Admin/Owner) | – |
| Change the credit days (*Admin → Credit terms*) | ✓ | – |
| Change the narration check | – (Admin/Owner) | – |
| Run matching, confirm or reject links, map ledgers, change matching rules | ✓ | – |
| Approve auto-fill writes | ✓ | – |
| Switch auto-fill modes, write over a different value in ROMS | – (Admin/Owner) | – |
| Users, Audit Log, Roles & permissions, File storage | Never: Admin/Owner only | Never |

Every change anyone makes in RAMS is recorded in the **Audit Log**, with who made it and when.

**Last updated by, on every screen.** Wherever something can be changed, each row has a *Last updated by* column: the name of the person who last changed it, with the date and time under it. RAMS fills it in from the account that was signed in, so nobody types it. Click the name to see every change to that row, with the old and new values. A dash means nobody has changed the row in RAMS yet. What RAMS works out by itself, what the Connector copies from Tally, and what is typed in Tally don't count. It is on Users, Tally companies, Credit terms, Roles & permissions (per permission), Match review, Matching rules (the Vendors list), Party ledgers, Auto-fill (who approved each write), Party Statements (each Tally row, for files) and Attachments. A setting that is a single form, such as the office hours or the narration check, shows the same as one line: "Last updated by Asha · 27 Nov 2026, 10:15 am".

## 14. What you can change yourselves (no programmer needed)

- **Which Tally companies sync, and the office hours**
- **Which company the reports open on** (the star on *Admin → Tally companies*; MH for now)
- **Every matching rule and check**, with a preview of the effect before saving
- **Each vendor's handling:** match it, treat it as a stock transfer, or ignore it
- **Which party ledger belongs to which marketplace**
- **Auto-fill:** each field's mode, whether to rewrite short forms, and which Bill Date to keep
- **Party Statements:** which marketplaces it covers and the placeholder opening
- **Credit terms:** each marketplace's credit days and the default, on *Admin → Credit terms*, with a preview of what a change does before it is saved
- **The narration check:** which voucher types need a narration, and from which date
- **What Accountants and Viewers may do**

## 15. Safety and privacy

- **Tally:** read only.
- **ROMS:** read, plus four fields that can only be written when switched on. Each write is checked by ROMS's own rules and recorded in its history.
- **Passwords** are stored scrambled (hashed), never as text.
- **Sessions** expire, and a password reset or role change signs that person out.
- **The Connector and ROMS** each use a private key. The key can be withdrawn at any time, which stops the connection.
- **The data** is held in a database in **Mumbai**. The website is set to run in Mumbai too, which also makes it faster.
- **Files** on Party Statements and Attachments are kept in that same database, never on a public link: only people signed in to RAMS who can see Party Statements, Attachments or Bills Receivable can open them. RAMS checks each file is really a PDF, photo or email before keeping it.
- **Every change** in RAMS is in the Audit Log; every change in ROMS is in ROMS's history.

## 16. Progress and next steps

| Step | What | State |
|---|---|---|
| Discovery | Read the real books; proved the Buyer's Order No links orders to invoices | Done |
| 1 | ROMS: accepts Tally's number format, and the safe connection for RAMS | Done (switched off in production until go-live) |
| 2 | The RAMS website: sign-in, users, audit log | Done |
| 3–4 | The Connector and the copy of Tally's books | Done, live on the test setup |
| 5 | Matching, with review screens and rules | Done, live on the test setup |
| 6 | Auto-fill into ROMS | Done, being tried on the test setup |
| 7 | The report screens | Delivered one at a time, each after you have reviewed it. Bills Receivable is out; the rest follow |
| – | Party Statements: the bill-to-bill statement for Minutes, Now and Zepto; narrations and states everywhere; Credit terms | Done, live on the test setup, with Connector 0.7.0 |
| – | Files on Party Statements: PDFs, photos and emails on each row, viewed in RAMS and shown on Bills Receivable; *File storage* | Built and tested; both databases updated for it (17 Nov) |
| – | Party Statements from Tally only: debit and credit notes no longer typed in RAMS (559 of 559 entries checked against Tally first); every row without its document is orange | Built and tested; goes on the test setup after your review |
| – | *Tally Reports* menu (Debtors and Ledgers renamed *Bills Receivable* and *Party Statements*) and *Purchase Reports* coming soon; Party Statements opens on every party, with *Needs attention* as a button and a scrolling list; Bills Receivable shows an invoice orange while a DN or CN against it has no file | Built and tested; goes on the test setup after your review |
| – | *Attachments*: every invoice, payment, debit and credit note of the year, month by month as Tally's registers, with documents, e-invoice numbers, city, narration and who changed it; RAMS's copy of Tally from 1 April (matching still from 8 June); Connector 0.8.0 | Built and tested (Tally's July–September sales figures match to the paisa); goes on the test setup after your review |
| Later | A NAS folder RAMS checks every few minutes, attaching files by their DN, CN or invoice number | Designed; waits for the NAS |
| 8 | Go-live: production database, Connector installed on the office PC, the trial weeks | Prepared (see *go-live.md*); needs the office PC and your go-ahead |

**Still to be decided:** how to link Flipkart and Amazon stock transfers to their ROMS rows.

## 17. Words used

| Word | Meaning |
|---|---|
| **PO** | A marketplace purchase order, as recorded in ROMS (for example B002) |
| **Marketplace PO no** | The marketplace's own number for the order (for example P4588464) |
| **Buyer's Order No** | The field on a Tally invoice (Order details) where the marketplace PO number is typed |
| **Bill No** | The invoice number, as recorded in ROMS on the Builty page |
| **RTV** | Return to vendor: goods a marketplace sent back, or was short |
| **CN / DN** | Credit note / debit note |
| **E-invoice, IRN, Ack No** | The GST e-invoice of a sale or credit note: the IRN is its 64-character reference number, the Ack No the 15-digit acknowledgement number printed on it |
| **Register** | Tally's month-by-month list of one voucher type (Sales Register, Payment Register and so on) |
| **Agst Ref** | Tally's "against reference": which invoice a payment or credit note settles |
| **On Account** | Money entered in Tally without saying which invoice it is for |
| **Connector** | The small RAMS program on the office PC that reads Tally |
| **Sync** | The Connector bringing RAMS's copy of Tally up to date |
| **Auto-fill** | RAMS writing Tally's numbers into ROMS |
| **Test setup** | A copy of RAMS and ROMS used for trying things, separate from the real ones |
