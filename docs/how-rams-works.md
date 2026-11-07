# How RAMS works

*Royal Mart Accounts (RAMS), explained without the technical words. Last updated 18 October 2026.*

---

## 1. RAMS in one paragraph

Royal Mart keeps its **accounts in Tally** and its **marketplace orders in ROMS** (the Royal Mart portal). Until now, the two never spoke to each other. Someone had to read an invoice number in Tally and type it into ROMS, and nobody could easily see which order had been invoiced, paid or credited.

**RAMS is the bridge between them.** It reads the books from Tally, matches each ROMS order to the Tally invoice that billed it, and each return to the credit note that settled it. With your permission, it then writes Tally's invoice and credit-note numbers into ROMS. Report screens, such as what every marketplace owes, follow one at a time. On **Ledgers**, your team records each party's day, and RAMS checks it against Tally.

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

- **It never changes Tally.** Every request it makes to Tally is "export" (read). There is no way for it to write. What your team enters on *Ledgers* stays in RAMS.
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

RAMS keeps a copy of the books of **MH, HR and WB** from **8 June 2026** (when ROMS went live) onwards. Other companies in Tally are ignored, and an Admin chooses which companies are synced.

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
| Ledger GSTIN and state (the latest dated entry) | To tell which marketplace a party ledger belongs to and which ledgers are Roymax's own registrations, and to filter *Ledgers* by state |
| Bill-wise on/off | To know whether Tally tracks a party's invoices one by one |
| Each ledger's closing balance | To start each party's balance on *Ledgers* from Tally's own figure |

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

**Debtors** is the first one (*Reports → Debtors*). It lists every sales invoice since 8 June, with a tab for each marketplace (All, Amazon, Blinkit and so on). For each invoice it shows:

| Column | What it is |
|---|---|
| Invoice | The Tally invoice number, with its company and date |
| Party | The party ledger it was billed to |
| Internal PO no | ROMS's own PO id (for example B002) |
| Vendor PO no | The marketplace's purchase order number |
| Amount | The invoice total |
| CN | The credit notes set against it in Tally. Click the amount to see each credit note: its number, date, amount and the ROMS return (RTV) it belongs to |
| Outstanding | What is still owed after receipts, credit notes, TDS and adjustments, and how many days it is overdue |

It opens on **MH**, with all marketplaces and all statuses. You can switch to another company or to all companies together, and filter by Open, Overdue, Settled or No PO. You can search by invoice, party or either PO number, and download it for Excel.

Until the rest arrive, RAMS keeps working in the background: it copies the books, matches orders and returns, and writes the numbers into ROMS once you switch that on. Each report covers everything since 8 June, so nothing is missed by waiting.

**Something to start on in Tally now:** several marketplaces pay into a *head-office* ledger "On Account", not against the warehouse-ledger invoices. In Tally's bill-wise view, those invoices therefore look unpaid. Setting those receipts against their invoices in Tally will make the figures exact when the reports arrive.

## 11. Ledgers: the bill-to-bill statement

**Ledgers** has its own item in the top bar. It shows the statement of each party of the marketplaces that **pay bill to bill**: **Minutes, Now and Zepto** to begin with. Blinkit and Scootsy say *coming soon*, while their format is worked out.

1. Choose the **company** (or all), the **marketplace** (or all), the **states** and the **parties** (each can be *All*). Nothing is chosen until you choose it.
2. Choose the **dates**. It starts on this month to date.
3. RAMS shows one row per party:

| Opening | Invoice | DN | CN | TDS | Journal / Adjustment | Receipt | Closing |
|---|---|---|---|---|---|---|---|
| 100 | +10 | −2 | −3 | −0.1 | +2 | −5 | 101.9 |

**Every figure comes from Tally.** The invoices and receipts are not typed in RAMS any more. Opening plus the six columns is the closing, which is Tally's own balance at the end of the range and the next range's opening.

| Column | From Tally |
|---|---|
| Invoice | Sales vouchers |
| DN | Credit notes booked for a debit note the marketplace raised on you (for example FKIDN51463346) |
| CN | Your other credit notes (for example the monthly discount) |
| TDS | Journals on a TDS ledger (TDS Receivable) |
| Journal / Adjustment | Every other voucher, such as discount round-offs |
| Receipt | Receipts. One receipt for several warehouses counts each warehouse's own part |

**Debit and credit notes are also typed in RAMS**, from the marketplace's portal, and RAMS checks each one against Tally:
- A **marketplace DN** is found by its number in a Tally credit note's narration, on any date: they are booked 6 to 46 days later. On your real books, each of the 16 DN numbers written in narrations finds exactly its own credit note.
- **Our CN** is found by Tally's credit note number.

Each colour means one thing:

| Colour | Meaning |
|---|---|
| Green ✓ | Matches: RAMS and Tally agree |
| Purple ≠ | Two sources disagree: an amount, a DN booked twice in Tally, or a party's state |
| Blue ⚖ | Matched by amount only: Tally has a credit note for the same amount, but its narration doesn't name the DN |
| Grey ⏳ | Waiting: not on the other side yet. A typed note waits up to 60 days for Tally; a Tally credit note waits 2 days to be typed (both are settings) |
| Red ✗ | Missing: typed here but not in Tally, or in Tally but not typed here |
| Yellow | No narration (see below) |

Click a party to see the notes typed for it and every Tally voucher, with its narration and the running balance. *Needs attention* lists every party with something red or purple.

**What you type stays in RAMS.** It is never sent to Tally.

**The opening balance comes from Tally**, as before: each sync reads every ledger's balance. If a sync can't read it, the party starts on a placeholder of ₹10,000 on 8 June, carried forward by Tally's real vouchers.

### Narrations, everywhere
Every Tally record RAMS shows (on Ledgers, Debtors, Match review and Auto-fill, and on the report screens still to come) now shows its **narration**. A record without one is **highlighted in yellow**, so the accountants can add it in Tally. Today almost no invoice or receipt has a narration (362 of 362 invoices on Minutes, Now and Zepto), so a lot will be highlighted at first. Which voucher types need a narration, and from which date, is a setting on *Admin → Tally companies* (*Narration check*).

### States: Tally's and the GSTIN's
Each party has two states: the one on its ledger in Tally, and the one its GSTIN belongs to (the first two digits). Where they disagree, RAMS shows **State differs** so the ledger can be corrected in Tally. The *State* filter lists a party under both, so it is never hidden. On the 4 October copy, 15 ledgers in MH disagree: all say Maharashtra in Tally. RAMS used to read the oldest address of a ledger rather than the latest; the new Connector (0.7.0) reads the latest.

**To decide together:**
- **Zepto's head-office ledgers.** Zepto pays into *ZEPTO PAYMENT* and *ZEPTO PVT LTD*, not each warehouse, so its warehouse rows show invoices but no receipts. Map those two ledgers to Zepto on *Matching → Party ledgers*. Three new Zepto dark stores (Coimbatore, Gurgaon Sohna, Hoogly) need mapping too.
- **The 60-day booking window.** A DN typed here stays grey for up to 60 days before it turns red. Shorter, if you'd like the accountants nudged sooner.
- **Narration volume.** Until narrations are written, most invoices and receipts are highlighted. The *Narration check* can narrow it.

## 12. Who can do what

There are four roles. **Admin and Owner can always do everything**, and they decide what the other two may do, on *Admin → Roles & permissions*.

| | Accountant (starting setup) | Viewer (starting setup) |
|---|---|---|
| See matching and auto-fill | ✓ | ✓ |
| See Debtors (Reports) | ✓ | ✓ |
| See Ledgers | ✓ | ✓ |
| Enter, change and remove debit and credit notes on Ledgers | ✓ | – |
| Change the ledger settings (marketplaces, days to wait, tolerance, placeholder opening) | – (Admin/Owner) | – |
| Change the credit days (*Admin → Credit terms*) | ✓ | – |
| Change the narration check | – (Admin/Owner) | – |
| Run matching, confirm or reject links, map ledgers, change matching rules | ✓ | – |
| Approve auto-fill writes | ✓ | – |
| Switch auto-fill modes, write over a different value in ROMS | – (Admin/Owner) | – |
| Users, Audit Log, Roles & permissions | Never: Admin/Owner only | Never |

Every change anyone makes in RAMS is recorded in the **Audit Log**, with who made it and when.

## 13. What you can change yourselves (no programmer needed)

- **Which Tally companies sync, and the office hours**
- **Which company the reports open on** (the star on *Admin → Tally companies*; MH for now)
- **Every matching rule and check**, with a preview of the effect before saving
- **Each vendor's handling:** match it, treat it as a stock transfer, or ignore it
- **Which party ledger belongs to which marketplace**
- **Auto-fill:** each field's mode, whether to rewrite short forms, and which Bill Date to keep
- **Ledgers:** which marketplaces it covers, how long Tally may take to book a note, how long a credit note may wait to be typed, the amount tolerance and the placeholder opening
- **Credit terms:** each marketplace's credit days and the default, on *Admin → Credit terms*, with a preview of what a change does before it is saved
- **The narration check:** which voucher types need a narration, and from which date
- **What Accountants and Viewers may do**

## 14. Safety and privacy

- **Tally:** read only.
- **ROMS:** read, plus four fields that can only be written when switched on. Each write is checked by ROMS's own rules and recorded in its history.
- **Passwords** are stored scrambled (hashed), never as text.
- **Sessions** expire, and a password reset or role change signs that person out.
- **The Connector and ROMS** each use a private key. The key can be withdrawn at any time, which stops the connection.
- **The data** is held in a database in **Mumbai**. The website is set to run in Mumbai too, which also makes it faster.
- **Every change** in RAMS is in the Audit Log; every change in ROMS is in ROMS's history.

## 15. Progress and next steps

| Step | What | State |
|---|---|---|
| Discovery | Read the real books; proved the Buyer's Order No links orders to invoices | Done |
| 1 | ROMS: accepts Tally's number format, and the safe connection for RAMS | Done (switched off in production until go-live) |
| 2 | The RAMS website: sign-in, users, audit log | Done |
| 3–4 | The Connector and the copy of Tally's books | Done, live on the test setup |
| 5 | Matching, with review screens and rules | Done, live on the test setup |
| 6 | Auto-fill into ROMS | Done, being tried on the test setup |
| 7 | The report screens | Delivered one at a time, each after you have reviewed it. Debtors is out; the rest follow |
| – | Ledgers: the bill-to-bill statement for Minutes, Now and Zepto, with debit and credit notes checked against Tally; narrations and states everywhere; Credit terms | Built and tested; goes on the test setup after your review, with Connector 0.7.0 |
| 8 | Go-live: production database, Connector installed on the office PC, the trial weeks | Prepared (see *go-live.md*); needs the office PC and your go-ahead |

**Still to be decided:** how to link Flipkart and Amazon stock transfers to their ROMS rows.

## 16. Words used

| Word | Meaning |
|---|---|
| **PO** | A marketplace purchase order, as recorded in ROMS (for example B002) |
| **Marketplace PO no** | The marketplace's own number for the order (for example P4588464) |
| **Buyer's Order No** | The field on a Tally invoice (Order details) where the marketplace PO number is typed |
| **Bill No** | The invoice number, as recorded in ROMS on the Builty page |
| **RTV** | Return to vendor: goods a marketplace sent back, or was short |
| **CN / DN** | Credit note / debit note |
| **Agst Ref** | Tally's "against reference": which invoice a payment or credit note settles |
| **On Account** | Money entered in Tally without saying which invoice it is for |
| **Connector** | The small RAMS program on the office PC that reads Tally |
| **Sync** | The Connector bringing RAMS's copy of Tally up to date |
| **Auto-fill** | RAMS writing Tally's numbers into ROMS |
| **Test setup** | A copy of RAMS and ROMS used for trying things, separate from the real ones |
