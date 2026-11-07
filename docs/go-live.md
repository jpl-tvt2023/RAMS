# RAMS go-live runbook (M8)

This takes RAMS from the test setup to production, step by step. It also covers installing the Connector on the office PC and the trial weeks before auto-fill writes to ROMS on its own.

For the day itself, `go-live-cheatsheet.md` has the same steps as commands and clicks, plus the reset of a production database that began as a copy of the test one. `demo-cheatsheet.md` is the running order for showing the client.

**Who does what:**
- **You** do every step that touches production, the office PC or a secret.
- **I** (or whoever maintains RAMS) do the steps marked *maintainer*. None of them changes production until you've done your part.

**What RAMS changes in production:**
- **Tally:** nothing. It is only read.
- **ROMS:** one new system user (migration 094), and, once a field's auto-fill is switched on, that field's values.

---

## 0. Open decisions to settle first

1. **S100: which Bill No should ROMS show?** It says `758` today.
   - Invoice 758 was fully returned by CN 841 (19 Aug 2026) and re-invoiced as `1193/RM/26-27` (12 Sep), against the re-issued PO.
   - A person decides. RAMS won't change it by itself, because 758 isn't a form of 1193.
   - The choice is made either in ROMS, or in RAMS: pick 1193 on Match review, then **Write Tally's number** on Auto-fill.
2. **S292: staff fix the Bill No "1819" in ROMS.** The client confirmed it is a typo for 1219.
   - In RAMS the link is already confirmed. The row is under *Needs a person* on Auto-fill, where an Admin can write `1219/RM/26-27` instead.
3. **Rotate the RAMS Turso token.** The test database's token was once pasted into a chat.
   - Make a new one in Turso.
   - Put it in Vercel (RAMS project → Environment Variables → `TURSO_AUTH_TOKEN`) and in `backend/.env`.
   - Redeploy.
4. **The Flipkart / Amazon stock-transfer linking key** is still open.
   - Until it's decided, those vendors stay *Stock transfer — not matched* (Matching rules → Vendors).
5. **Vercel region (done):** both projects are set to Mumbai (bom1).
   - RAMS production runs there since the M7 deploy (PR #9, 2026-10-06).
   - ROMS production moves there on its next production deploy.
6. **Ledgers openings (settled):** Connector 0.6.0 reads every ledger's balance from Tally at the end of each sync (migration 017 holds them), and Ledgers starts each party from it. The ₹10,000 placeholder is used only when a sync couldn't read the balances, for example while the office PC still runs Connector 0.5.0.
7. **Ledger states and narrations (Connector 0.7.0, migration 018):** 0.7.0 reads each ledger's latest dated address and GST registration (older Connectors took the oldest, and sometimes a GST rate block's "Any"), and keeps narrations up to 2,000 characters. RAMS stores the corrected state and GSTIN on the first end-of-day run after 0.7.0 starts; an older Connector can't undo them. Migration 018 adds the Ledgers marketplaces list (Minutes, Now, Zepto), the booking window, and the narration check.

## 1. The production database for RAMS (you, then maintainer)

1. **You:** create the Turso database `royalmart-rams` in the `royalmart` org, region `aws-ap-south-1` (Mumbai), and make a token for it.
2. **Maintainer:**
   1. In `backend/.env`, set `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` to it. **Check the URL twice:** `npm run migrate` writes to whatever it points at.
   2. `npm run migrate`, which applies 001–018.
   3. `RAMS_ADMIN_USERNAME=… RAMS_ADMIN_PASSWORD='…' npm run bootstrap-admin`. It creates the first Admin, who changes the password at first sign-in.
   4. `npm run agent-token -- --name "Office PC" --rotate`. It prints the Connector token **once**; hand it to you privately. `--rotate` retires every other token first, such as one copied over with a test database.
3. **You:** in Vercel (RAMS project → Environment Variables, **Production**):
   - Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` to the production database.
   - Set new `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`. This signs everyone out of the test setup.
   - Redeploy.

## 2. ROMS production: switch the integration on (you, maintainer helps)

1. **Maintainer**, with your OK: apply ROMS migration **094** to the ROMS production database. It only adds the `tally-sync` system user, and nobody can sign in as it. First check that `Royal Mart Portal/backend/.env` points at production.
2. **You:** generate a long random token. In Vercel (ROMS project `royalmartportal` → Environment Variables, **Production**), set `INTEGRATION_TOKEN` to it, then redeploy ROMS production.
3. **You:** in the RAMS project (Production), set:
   - `ROMS_API_URL` = `https://api.theroyalmart.co.in/api`
   - `ROMS_INTEGRATION_TOKEN` = the same token

   Then redeploy RAMS.
4. **Check:** RAMS → Matching → Match review → **Match now**. It should say "ROMS read", with counts similar to the test setup.

Until step 2 is done, ROMS production answers RAMS with "The integration is not configured", and nothing can be read or written.

## 3. The Connector on the office PC (you, at the PC)

1. **Maintainer:** `npm run package` in `agent/`, zip the folder `agent/dist/rams-connector` and copy it to the office PC (USB stick, shared drive or remote session). It carries its own Node.js, so nothing else needs installing.
2. **In RAMS:** Admin → Tally companies. Turn sync **on** for MH, HR and WB, so the first load includes them. A fresh database lists them only after the Connector has checked in once: in that case run Setup, turn them on, then run Setup again with the load box ticked.
3. **You:** on the office PC, signed in as the Windows user who runs Tally:
   1. Open TallyPrime and the three companies (MH, HR, WB).
   2. Unzip the folder (right-click → *Extract All*) and double-click **Setup RAMS Connector**.
   3. Paste the Connector token (from step 1) into *Connector code*, leave **Load all of Tally into RAMS now** ticked, and click **Connect**.
      - It checks that Tally answers and lists the open companies. If Tally doesn't answer, it says what to set in TallyPrime (F1 → Settings → Connectivity → Client/Server configuration: *TallyPrime acts as* Both, port **9000**). Then click *Try again*.
      - It checks the code with RAMS before saving it. A wrong code is refused and nothing is saved.
      - It installs the Connector in `C:\RAMS\Connector` with the task **RAMS Connector** (it starts when you sign in, in a hidden window, and restarts if it stops), loads Tally into RAMS (a few minutes for MH; Tally stays usable), and starts it.
   4. When every line is ticked, RAMS's Dashboard **Tally sync** card says *Connector online* within a minute.
4. **In RAMS:**
   - Click the **star** on MH, so Reports → Debtors opens on it. A fresh database has no default company until this is done, and the report opens on all companies instead.
   - Open **Ledgers** on a Zepto party: its opening should say *From Tally*, not *Placeholder*.
   - Matching → Party ledgers should show no "State differs" on *Flipkart India Private Limited - Bengalore* (it reads Karnataka now).
   - `C:\RAMS\Connector\rams-connector.cmd status` on the office PC shows the version: it must be **0.7.1**.
5. **Stop the dev PC's Connector** if it points at the production site, so two Connectors don't sync the same books. One that feeds the test site can keep running.

Running Setup again later checks the connection, or takes a new code. Logs are in `C:\ProgramData\RAMS\logs`. To remove the Connector, run `uninstall-service.ps1`. To install by hand instead, `install-service.ps1` still works (it needs `connector.json` filled in first).

## 4. The trial weeks (auto-fill)

Each step is a setting on **Matching → Auto-fill**, not a deploy. It can be put back to **Off** at any moment.

| Week | Bill No + Bill Date | CN No + CN Date | What to watch |
|---|---|---|---|
| 1 | **Preview** | **Preview** | *To write*: does each change look right? *Refused by ROMS*: anything unexpected? |
| 2 | **Ask first**: approve a few rows, check them in ROMS (Builty page, history says "Tally Sync"), then **Approve all** | Preview | ROMS's Builty and RTV pages show the new numbers; nothing else changed |
| 3 | **Automatic** | **Ask first**, then **Approve all** | Written to ROMS each hour; *Needs a person* on Auto-fill stays short |
| 4 | Automatic | **Automatic** | — |

**Before week 1:** on Roles & permissions, decide who may approve (default: Accountants) and who may switch modes (default: Admin and Owner).

## 5. After go-live

- **Daily:** Matching → Match review → *Needs review*, and Matching → Auto-fill → *Needs a person* and *Refused by ROMS*.
- **Daily:** **Ledgers** → *Needs attention*: the days where what was entered for a party differs from Tally.
- **Weekly:** Matching → Party ledgers → *Not set*. Map any new ledger, including head-office ledgers that marketplaces pay into.
- **Weekly:** Reports → **Debtors**, status *Overdue*: chase what is past its credit days. Status *No PO*: invoices to link to a ROMS PO.
- **If something looks old:** the Dashboard's **Tally sync** card says whether the Connector is online, Tally is answering, and when each company last synced.
- These checks gain the other report screens (Exceptions, Receivables, Sync health) as each one is delivered.
- **To stop all writing into ROMS at once:** set both auto-fill fields to Off. Or remove `INTEGRATION_TOKEN` from ROMS and redeploy.
