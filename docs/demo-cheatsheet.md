# RAMS client demo: flows and steps

A running order for showing the client what RAMS does today, on production (https://accounting.theroyalmart.co.in) with their own books. About 45 minutes. Each flow says what to show, the clicks, and what to say.

## Before the demo

- [ ] Go-live steps 1–6 are done (`go-live-cheatsheet.md`). The Dashboard says **Connector online**, and every company is *Up to date*.
- [ ] ROMS production is connected. **Match now** reads ROMS. Without it, skip flows 4 and 5.
- [ ] **Auto-fill is Off or Preview.** In the demo, never click *Approve*, *Approve all*, *Write now*, *Write Tally's number* or *Automatic*: they write into **production ROMS**.
- [ ] Sign in as an Admin. To show roles, have a Viewer user ready in a private browser window.
- [ ] Pick your examples in advance:
  - a Zepto party with debit/credit notes in Ledgers;
  - a PO under *Needs review*;
  - a marketplace with overdue invoices in Debtors;
  - one real marketplace DN number from the portal (to type in flow 8).
- [ ] Only **Debtors** is released under Reports. The other report screens are held and don't show in the menu, so don't promise them as done.

## Running order

| # | Flow | Minutes | Needs ROMS |
|---|---|---|---|
| 1 | Sign in and the Dashboard | 3 | — |
| 2 | Tally companies: sync, schedule, narration check | 4 | — |
| 3 | Party ledgers: which ledger is which marketplace | 4 | partly |
| 4 | Match review: every PO against its Tally invoice | 8 | yes |
| 5 | Auto-fill: Tally's numbers into ROMS, safely | 5 | yes |
| 6 | Debtors: what each marketplace owes | 6 | — |
| 7 | Credit terms | 3 | — |
| 8 | Ledgers: the bill-to-bill statement | 10 | — |
| 9 | Users, roles and permissions, audit log | 5 | — |
| 10 | Help & FAQ | 2 | — |

---

### 1. Sign in and the Dashboard
- **Show:** RAMS mirrors Tally on its own, and says when it's behind.
- **Steps:**
  1. Sign in.
  2. On the Dashboard, point at the **Tally sync** card: *Connector online*, *Tally answering*, each company *Up to date*.
  3. Then the **Matching** card.
- **Say:**
  - "A small program on your office PC reads Tally every hour in office hours, and does a full check after hours."
  - "It only reads: RAMS never changes anything in Tally."
  - "If the PC is off, nothing is lost: it catches up."

### 2. Tally companies: sync, schedule, narration check
- **Show:** the client decides what is synced and when. None of it is code.
- **Steps:**
  1. **Admin → Tally companies:** MH, HR and WB are On. The star is the company reports open on.
  2. **Sync schedule:** the office hours and the end-of-day time.
  3. **Narration check:** how many records have no narration, per voucher type. Click **Edit** to show that types can be unticked, or the start date moved.
- **Say:**
  - "Any record without a narration is highlighted in yellow everywhere in RAMS. You choose which types need one."

### 3. Party ledgers: which ledger is which marketplace
- **Show:** RAMS learns which Tally ledger belongs to which marketplace, and flags ledgers set up wrongly.
- **Steps:**
  1. **Matching → Party ledgers.** Unmapped ledgers come first, with RAMS's **suggestion** and how many POs back it.
  2. Show **Accept all suggestions**. Accept only if the list looks right.
  3. Point at a GSTIN with its state. *State differs* (purple) means Tally's state isn't the GSTIN's state.
- **Say:**
  - "New ledgers land under *Not set*. Mapping them once a week keeps every report right."
  - "Head-office ledgers that marketplaces pay into, for example Zepto's, need mapping too."

### 4. Match review: every PO against its Tally invoice
- **Show:** each ROMS PO and RTV row is matched to its Tally invoice or credit note, with the reason.
- **Steps:**
  1. **Matching → Match review.** Explain the four tabs:
     - green **Linked**;
     - amber **Needs review**;
     - grey **Waiting for Tally**;
     - blue **Not matched** (on purpose: stock transfers).
  2. Point at the legend under the table.
  3. Open a **Needs review** row. The panel shows how RAMS matched it, which checks passed, and every candidate invoice.
  4. Show the choices without clicking them: **Confirm**, **Use this invoice**, **Reject**, **Undo**.
  5. Click **Match now** to re-read ROMS on the spot.
- **Say:**
  - "RAMS matches by the Buyer's Order No in Tally, then checks vendor, SKU, quantity and dates."
  - "Only what it can't be sure of comes to a person, and your decision sticks."

### 5. Auto-fill: Tally's numbers into ROMS, safely
- **Show:** RAMS can fill ROMS's Bill No / Bill Date and RTV CN No / CN Date from Tally, in Tally's exact format.
- **Steps:**
  1. **Matching → Auto-fill.** Each field has a mode: **Off → Preview → Ask first → Automatic**.
  2. If it's on **Preview**, show **To write**: what ROMS has now → what RAMS would write, and ROMS's answer. Nothing has been written.
  3. Show the legend. Red means refused by ROMS. Amber means a person decides.
- **Say:**
  - "We switch it on one field at a time over four weeks: Preview, then Ask first, then Automatic."
  - "Every write shows in ROMS's history as *Tally Sync*. One click on Off stops it."
- **Don't:** approve or write anything.

### 6. Debtors: what each marketplace owes
- **Show:** every invoice, what settled it, and what is still owed or overdue, straight from Tally.
- **Steps:**
  1. **Reports → Debtors.** It opens on MH. Switch to **All companies** for the consolidated view.
  2. Click a marketplace tab, then the statuses **Open** and **Overdue**. The line above the table adds up invoiced, credit notes, outstanding and overdue.
  3. In the **CN** column, click an amount. The pop-up lists each credit note, with its ROMS RTV row and its narration.
  4. Choose the status **No PO**: invoices not linked to any ROMS PO.
  5. Show **Download** (CSV).
- **Say:**
  - "Overdue comes from each marketplace's credit days, which you set. That's the next flow."

### 7. Credit terms
- **Show:** credit days per marketplace, with the effect shown before saving.
- **Steps:**
  1. **Admin → Credit terms.** The default, then each marketplace (for example Minutes 15, Now 45), and when it's due.
  2. Click the pencil on Zepto and type a different number. The box says, for example, *"Of Zepto's 140 invoices still owed, 23 would become overdue"*.
  3. Click **Cancel**, unless the client wants the change. Every save is audited.

### 8. Ledgers: the bill-to-bill statement (Minutes, Now, Zepto)
- **Show:** one row per party: **Opening | Invoice | DN | CN | TDS | Journal/Adj | Receipt | Closing**. All of it is Tally's figures, and typed DNs/CNs are checked against Tally.
- **Steps:**
  1. Click **Ledgers** in the top bar. Before anything is chosen, **Needs attention** lists the parties with a problem.
  2. Choose:
     - Company **MH**;
     - Marketplace **Zepto**;
     - State **All states** → Done;
     - Party **All parties** → Done.

     The dates default to this month. Use **From** to start at 8 Jun to show more history.
  3. Read a row:
     - The opening says *From Tally*.
     - Invoices add to the balance; DN, CN, TDS and receipts take it down.
     - The closing equals Tally's balance.
     - The total row is at the bottom.
  4. Pick **Blinkit** to show *"coming soon"*. Only marketplaces that pay bill to bill are on Ledgers for now.
  5. Click a party. The detail shows:
     - both states (Tally's and the GSTIN's);
     - the notes typed here;
     - every Tally voucher with its narration and running balance.
  6. Click **Add a DN or CN** → **Marketplace DN**. Type the real DN number from the portal, its date and amount, then click **Add**. RAMS finds it in a Tally credit note's narration: ✓ *In Tally — CN … on …*.
  7. Explain the legend:
     - green ✓ matches;
     - purple ≠ differs;
     - blue ⚖ matched by amount only;
     - grey ⏳ waiting;
     - red ✗ missing;
     - yellow highlighter means no narration.
  8. After the demo, remove the test DN (**Remove** on its row), unless it was a real one.
- **Say:**
  - "Accountants type the marketplace's DNs as they arrive. RAMS tells you when Tally hasn't booked one, booked it twice, or booked a different amount."

### 9. Users, roles and permissions, audit log
- **Show:** who can do what, and that every change is recorded.
- **Steps:**
  1. **Admin → Users:** add a user and choose a role (Admin, Owner, Accountant, Viewer).
  2. **Admin → Roles & permissions:** toggle what Accountants and Viewers may do. Admin and Owner always may.
  3. **Admin → Audit Log:** filter by user or by date. Open a record's **History** from any screen (for example a credit-terms row).
  4. If you prepared a Viewer window, show the same screen without the buttons.

### 10. Help & FAQ
- **Steps:** click **Help**. Every screen has its step-by-step flows and common questions. Search it for a word, for example "narration".

---

## Quick answers to likely questions

| Question | Answer |
|---|---|
| Does RAMS change Tally? | No. It only reads. Accountants keep working in Tally as today. |
| What if the office PC is off? | RAMS shows the last data and says the Connector is offline. When the PC is back, it catches up. |
| How fresh is it? | Every hour in office hours, plus a full check after hours. Admins can change the schedule. |
| Why is something yellow? | It has no narration in Tally, and the narration check says it needs one. |
| What does *State differs* mean? | The ledger's state in Tally isn't the state of its GSTIN. The accountant corrects the address in Tally. |
| Why is Blinkit "coming soon" on Ledgers? | Ledgers covers the marketplaces that pay bill to bill (Minutes, Now, Zepto). The others pay on account, and their statement comes next. |
| Why does a Zepto party show invoices but no receipts? | Zepto pays into head-office ledgers. Map those on Party ledgers. |
| Can RAMS write a wrong number into ROMS? | ROMS accepts a write only when its current value is the one RAMS expects. Anything else goes to a person. Each field starts in Preview. |
| Where are Invoices, Notes, Receivables, Exceptions? | Built, and released one at a time after each review. Debtors is first. |
