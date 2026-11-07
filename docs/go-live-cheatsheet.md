# RAMS production go-live: steps and cheat sheet

The short, do-it-today version of `go-live.md`. It takes RAMS production from "a copy of the test setup" to "connected to the client's TallyPrime and to ROMS production". No secrets are in this file. Tokens are shown once on screen and go straight into the place they belong.

## Where everything is

| What | Where |
|---|---|
| RAMS production | https://accounting.theroyalmart.co.in — Vercel project **`rams`**, database **`royalmart-rams`** |
| RAMS production database settings | `D:\My Projects\RAMS\.env` (the root one). **Not** `backend\.env`: that is the test database |
| ROMS production API | https://api.theroyalmart.co.in/api — Vercel project **`royalmartportal`**, database **`royalmart-roms`** |
| ROMS production database settings | `D:\My Projects\Royal Mart Portal\backend\.env.prod` |
| Connector package | `RAMS-Connector-0.7.1.zip` (how to rebuild it: at the end) |
| On the office PC | the program in `C:\RAMS\Connector`, the settings and code in `C:\ProgramData\RAMS\connector.json`, the logs in `C:\ProgramData\RAMS\logs` |

## Today, in order

| # | Step | Who | Time |
|---|---|---|---|
| 1 | Reset RAMS production | you, on this PC | 5 min |
| 2 | Make the Connector code | you, on this PC | 1 min |
| 3 | Tidy users and settings in RAMS | you, in the browser | 5 min |
| 4 | Connect ROMS production | you, on this PC and in Vercel | 15 min |
| 5 | Install the Connector on the office PC | whoever is at that PC | 10 min |
| 6 | Check everything | you, in the browser | 10 min |

---

## 1. Reset RAMS production

RAMS production started as a copy of the test database (13 Oct). It still holds the test books, test matches, the test Connector token and the test audit log. The reset empties that and keeps the setup.

| Deleted | Kept |
|---|---|
| Tally books: vouchers and their lines, balances, sync state and runs | Users, roles and permissions |
| The copy of ROMS, every match and auto-fill result | Every setting: sync schedule, matching rules, credit terms, Ledgers and narration settings |
| Ledgers' typed DN/CN and loaded openings | Party ledger maps (which ledger is which marketplace) |
| Every Connector token | Companies switched on (MH, HR, WB) and the default star |
| Companies switched off (the dev PC's "Test Company") | Tally's ledger list. The first load refreshes it |
| The audit log. One new row records the reset | Auto-fill is set to **Off** for both fields |

In PowerShell:
```powershell
cd "D:\My Projects\RAMS\backend"
Get-Content ..\.env | ForEach-Object { if ($_ -match '^\s*(TURSO_DATABASE_URL|TURSO_AUTH_TOKEN)\s*=\s*(.*)$') { Set-Item "env:$($Matches[1])" ($Matches[2].Trim().Trim('"').Trim("'")) } }
$env:TURSO_DATABASE_URL -match '//royalmart-rams-royalmart\.'      # must print True. If False, stop here
node src/seeds/resetData.js                                         # dry run: lists what would go, changes nothing
node src/seeds/resetData.js --confirm royalmart-rams-royalmart.aws-ap-south-1.turso.io
```
`--confirm` must be the database name the dry run printed, so the reset can never hit another database.

## 2. Make the Connector code

In the same PowerShell window:
```powershell
node src/seeds/agentToken.js --name "Office PC"
Remove-Item env:TURSO_DATABASE_URL, env:TURSO_AUTH_TOKEN             # back to the test database for this window
```
- The code (`rams_…`) is shown **once**. Keep it somewhere safe (a password manager) until Setup has it. Don't send it in chat.
- If it's lost, make a new one with `--rotate` added. That retires every other code at once.

## 3. Tidy users and settings in RAMS

At https://accounting.theroyalmart.co.in, signed in as `admin`:
1. **Admin → Users:**
   - Reset `admin`'s password. The test password is known to more people than it should be.
   - Reset `rahul`'s password too, or deactivate the account.
   - Add the client's people. Admin and Owner can do everything. Accountants work in RAMS. Viewers only look.
2. **Admin → Tally companies:**
   - MH, HR and WB show sync **On**, and MH has the **star** (the company reports open on).
   - **Sync schedule** shows Mon–Sat 09:00–19:00, with the end-of-day check after 19:00. Change it if the office keeps other hours.
3. **Matching → Auto-fill:** both fields say **Off**. The reset did this.

## 4. Connect ROMS production

ROMS production already has the integration code. Today it answers *"The integration is not configured"*. It needs migration 094 (the "Tally Sync" system user) and one shared token, set in both Vercel projects.

**4.1 See which ROMS migrations production lacks.** This only reads:
```powershell
cd "D:\My Projects\Royal Mart Portal\backend"
Get-Content .env.prod | ForEach-Object { if ($_ -match '^\s*(TURSO_DATABASE_URL|TURSO_AUTH_TOKEN)\s*=\s*(.*)$') { Set-Item "env:$($Matches[1])" ($Matches[2].Trim().Trim('"').Trim("'")) } }
$env:TURSO_DATABASE_URL -match '//royalmart-roms-royalmart\.'      # must print True. If False, stop here
node -e "const c=require('@libsql/client').createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});c.execute('SELECT filename FROM schema_migrations').then(r=>{const a=new Set(r.rows.map(x=>x.filename));const p=require('fs').readdirSync('src/migrations').filter(f=>f.endsWith('.sql')&&!a.has(f));console.log('Pending on ROMS production:',p.length?p.join(', '):'none')})"
```

**4.2 Apply it.** Do this **only if** the list is exactly `094_create_tally_sync_user.sql`, or `none`. Anything else is ROMS work that isn't RAMS's to apply: stop and ask.
```powershell
npm run migrate                                                     # only when 094 is the one pending
Remove-Item env:TURSO_DATABASE_URL, env:TURSO_AUTH_TOKEN
```
094 only adds the user `tally-sync`, and nobody can sign in as it. Every write RAMS makes into ROMS shows in ROMS's history as "Tally Sync".

**4.3 Make the shared token.** It is copied to the clipboard and never printed:
```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); Set-Clipboard ('romsint_' + (($b | ForEach-Object { $_.ToString('x2') }) -join '')); 'Token copied'
```

**4.4 ROMS's Vercel settings** (project `royalmartportal`, the one serving api.theroyalmart.co.in):
1. Go to Settings → Environment Variables → Add. Set **`INTEGRATION_TOKEN`** to the token (paste it), tick **Production only**, and Save.
2. Go to Deployments, open the **top Production deployment**, then ⋯ → **Redeploy**. Never redeploy an older row: that puts old code live.

**4.5 RAMS's Vercel settings** (project `rams`), both **Production only**:
1. Set `ROMS_API_URL` to `https://api.theroyalmart.co.in/api`.
2. Set `ROMS_INTEGRATION_TOKEN` to the same token.
3. Redeploy the top Production deployment.

Then clear the clipboard (copy anything else).

**4.6 Check:**
```powershell
curl.exe -s https://api.theroyalmart.co.in/api/integration/refs/pos
```
- Before: `The integration is not configured`.
- Now: `Invalid integration token`. That is right: you sent no token, so ROMS refused you.
- Then in RAMS: **Matching → Match review → Match now**. It should say ROMS was read, and the tabs fill once the Tally load (step 5) is in.

## 5. Install the Connector on the office PC

Do this at the PC where TallyPrime runs, signed in as the Windows user who uses Tally:
1. Copy `RAMS-Connector-0.7.1.zip` there and unzip it (right-click → *Extract All*).
2. Open **TallyPrime** and the three companies (MH, HR, WB).
3. Double-click **Setup RAMS Connector**. If Windows asks *"Open File – Security Warning"*, click **Run**.
4. Paste the code from step 2, leave **Load all of Tally into RAMS now** ticked, and click **Connect**. Wait until every line has a ✓ (about 5 minutes).

**What the Setup window does, line by line:**

| Line | What it checks or does | If it fails, it says… |
|---|---|---|
| Tally answers on this PC | TallyPrime replies on port 9000 | In TallyPrime press F1 → Settings → Connectivity → Client/Server configuration. Set *TallyPrime acts as* to **Both** and the port to **9000**. Then click *Try again* |
| Companies open in Tally | Lists the open companies | Open MH, HR and WB in TallyPrime |
| RAMS accepts the code | Tries the code before saving it, so a wrong code never replaces a good one. Shows which companies RAMS syncs | "RAMS refused this code": paste it again, or make a new one. "Can't reach RAMS": check the internet |
| Installed | Copies the Connector to `C:\RAMS\Connector`, and makes it start (hidden) at every Windows sign-in and restart if it stops | The reason, in words |
| Tally loaded into RAMS | The first time only: reads all of Tally from 8 Jun 2026 into RAMS. Tally stays usable meanwhile | If it stops part-way, the Connector finishes it later by itself |
| The Connector is running | Starts it | — |

- An `!` line is a warning, not a stop. For example, "Educational mode" means Tally is running without its licence.
- Running Setup again later re-checks everything, or takes a new code (leave the box empty to keep the saved one).
- If Setup says *no company is switched on yet*: turn them on in RAMS (Admin → Tally companies), then run Setup again with the load box ticked.

## 6. Check everything

| Where in RAMS | What you should see |
|---|---|
| Dashboard → Tally sync card | **Connector online**, **Tally answering**, each company *Up to date* |
| Ledgers → MH → Zepto → All states → All parties | Openings say **From Tally**, not *Placeholder*. The closing equals Tally's balance |
| Matching → Party ledgers | No *State differs* on *Flipkart India Private Limited – Bengalore*. New ledgers wait under **Not set**: accept the suggestions |
| Reports → Debtors | Today's invoices from Tally, marked overdue by the credit terms |
| Matching → Match review | Rows in Linked / Needs review / Waiting for Tally, after **Match now** |
| Admin → Audit Log | The `DATA_RESET` row, then your own changes |

On the office PC, `C:\RAMS\Connector\rams-connector.cmd status` lists every company, with version **0.7.1**.

---

## Cheat sheet

**Commands** (each in a new PowerShell window, so the database settings never leak into the next one):

| To… | Run |
|---|---|
| Point a window at RAMS **production** | `cd "D:\My Projects\RAMS\backend"`, then the `Get-Content ..\.env …` line from step 1 |
| Reset (dry run, then for real) | `node src/seeds/resetData.js`, then `node src/seeds/resetData.js --confirm royalmart-rams-royalmart.aws-ap-south-1.turso.io` |
| New Connector code, retiring the old ones | `node src/seeds/agentToken.js --name "Office PC" --rotate` |
| Retire every Connector code (stop all syncing) | `node src/seeds/agentToken.js --revoke-all` |
| Connector status (office PC) | `C:\RAMS\Connector\rams-connector.cmd status` |
| One sync now (office PC) | `C:\RAMS\Connector\rams-connector.cmd sync` |
| Remove the Connector (office PC) | in `C:\RAMS\Connector`: `powershell -ExecutionPolicy Bypass -File .\uninstall-service.ps1` |
| Rebuild the Connector zip | `cd "D:\My Projects\RAMS\agent"; npm run package; Compress-Archive -Path (Get-ChildItem dist\rams-connector \| Where-Object Name -ne 'out').FullName -DestinationPath "$env:USERPROFILE\Desktop\RAMS-Connector-0.7.1.zip" -Force` |

**When something is wrong:**

| You see | Why | Do |
|---|---|---|
| Dashboard: *Connector offline* | The office PC is off or asleep, or Windows was signed out | Sign in on that PC. The Connector starts by itself and catches up. Or run Setup again |
| Dashboard: *Tally not answering* | TallyPrime is closed, or its companies aren't open | Open TallyPrime and the companies |
| Match review: *ROMS isn't connected* | `ROMS_API_URL` / `ROMS_INTEGRATION_TOKEN` missing in `rams` Production, or not redeployed | Step 4.5 |
| *ROMS refused RAMS's integration token* | The two Vercel projects have different tokens | Make one token (4.3), set it in both, and redeploy both |
| ROMS says *The integration is not configured* | `INTEGRATION_TOKEN` missing in ROMS Production, or not redeployed | Step 4.4 |
| Ledgers opening says *Placeholder* | The first load hasn't finished, or Tally couldn't give balances | Wait for the next sync. Check the Tally sync card |
| A party says *State differs* | Its state in Tally isn't the state of its GSTIN | The accountant corrects the ledger's address in Tally. It clears after the end-of-day sync |
| A record is highlighted yellow | It has no narration in Tally | Add it in Tally, or narrow the rule: Admin → Tally companies → Narration check |
| Anything is being written into ROMS that shouldn't be | — | Matching → Auto-fill: set both fields to **Off**. To be sure, remove `INTEGRATION_TOKEN` from ROMS and redeploy |

**Auto-fill trial weeks** (a setting on Matching → Auto-fill, never a deploy; **Off** stops it at once):

| Week | Bill No + Bill Date | CN No + CN Date |
|---|---|---|
| 1 | Preview | Preview |
| 2 | Ask first: approve a few, check them in ROMS, then Approve all | Preview |
| 3 | Automatic | Ask first |
| 4 | Automatic | Automatic |

Still open from `go-live.md` §0:
- **S100:** which Bill No ROMS shows, `758` or `1193/RM/26-27`. A person decides.
- **S292:** staff fix "1819" → `1219` in ROMS.
- **The Flipkart/Amazon stock-transfer key.**
