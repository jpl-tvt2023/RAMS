// Help: signing in and the Dashboard.
export const signingIn = {
  id: 'signing-in',
  area: 'Getting started',
  title: 'Signing in',
  who: 'Everyone with a RAMS account. Accounts are made by an Admin or Owner (see Users).',
  summary: 'RAMS has its own accounts, separate from ROMS. Your User ID and first password come from an Admin.',
  flows: [
    {
      title: 'Sign in for the first time',
      steps: [
        'Open RAMS and enter the User ID and the temporary password the Admin gave you.',
        'RAMS asks you to set your own password straight away. Type it twice and save.',
        'The password needs at least 8 characters, with a small letter, a capital letter, a number and a symbol.',
        'You land on the Dashboard. RAMS lets you do nothing else until your own password is set.',
      ],
    },
    {
      title: 'Sign out',
      steps: ['Click the sign-out icon at the top right.'],
    },
  ],
  faq: [
    { q: 'I forgot my password.', a: 'Ask an Admin or Owner to reset it (Users → the key icon). They give you a temporary password, and RAMS asks you to set your own at the next sign-in.' },
    { q: 'Can I change my password myself?', a: 'Not from a menu yet: ask an Admin to reset it, then set your own at the next sign-in.' },
    { q: 'I was signed out on my own.', a: 'That happens when your password or role was changed, or your account was deactivated. Sign in again; if it fails, ask an Admin.' },
  ],
};

export const dashboard = {
  id: 'dashboard',
  path: '/dashboard',
  area: 'Getting started',
  title: 'Dashboard',
  who: 'Everyone. The Matching card shows to anyone allowed to see matching.',
  summary: 'The Dashboard shows whether Tally is syncing into RAMS, and how far matching has got.',
  flows: [
    {
      title: 'Read the Tally sync card',
      steps: [
        '"Connector online" means the RAMS Connector on the office PC checked in within the last 3 minutes.',
        '"Tally answering" means TallyPrime is open on that PC and replying.',
        'Each company shows where it stands: Up to date, Changes waiting (the next check picks them up), or Backfilling.',
        'A yellow Educational-mode warning means Tally is running without its licence: tell the person who looks after Tally.',
      ],
    },
    {
      title: 'Read the Matching card',
      steps: [
        'Linked: POs whose Tally invoice RAMS found.',
        'Needs review: POs a person has to decide. Click it to open them in Match review.',
        'Waiting for Tally: nothing in Tally yet, which is normal until the accountant enters the invoice.',
        'The Auto-fill line (if you may see auto-fill) says each field’s mode and what RAMS wrote into ROMS today. Click it to open Matching → Auto-fill.',
      ],
    },
  ],
  faq: [
    { q: 'Why does the Connector show offline?', a: 'The office PC is off or asleep, or the Connector is not running on it. Nothing is lost: when it comes back it catches up with everything that changed in Tally.' },
    { q: 'How fresh is the data?', a: 'In office hours RAMS checks Tally every hour (the timing is on Admin → Tally companies). Changes made in Tally show after the next check; deletions show after the end-of-day check.' },
    { q: 'Where are the reports?', a: 'In the top bar under Tally Reports: Bills Receivable (each invoice and what is still owed on it) and Party Statements (each party’s statement, opening to closing). They used to be called Debtors and Ledgers. Both are worked out from Tally.' },
    { q: 'What is Purchase Reports?', a: 'What ROMS books in against outbound POs, and the challans between stitching stages, each with its bill or challan copy. A person checks each bill, then the Purchase Head and the Accountant Head approve it. Warehouse has the goods that don’t go through Stitching; Stitching has the rest, and every challan.' },
  ],
};

export const lastUpdated = {
  id: 'last-updated-by',
  area: 'Getting started',
  title: 'Last updated by',
  who: 'Everyone, on every screen where something can be changed.',
  summary: 'Every list where people change things has a Last updated by column: the name of the person who last changed that row in RAMS, with the date and time (India time) under it. RAMS fills it in from the account that was signed in when the change was saved, so nobody types it.',
  flows: [
    {
      title: 'See who changed a row, and what they changed',
      steps: [
        'Find the row. The name in Last updated by is who changed it last; the date and time under it is when.',
        'Click the name. A window lists every change to that row, newest first, with the old and new values.',
        'Close the window to go back to the list.',
      ],
    },
  ],
  faq: [
    { q: 'The column shows a dash.', a: 'Nobody has changed that row in RAMS yet. Only people’s changes in RAMS count: what RAMS works out by itself, what the Connector copies from Tally and what is typed in Tally are not shown.' },
    { q: 'Whose name is shown?', a: 'The RAMS account that was signed in when the change was saved. If that person’s name is changed later on Users, the new name shows.' },
    { q: 'Which screens have it?', a: 'Users, Tally companies, Credit terms, Roles & permissions, Match review, Matching rules (the Vendors list), Party ledgers, Auto-fill, Party Statements (each Tally row of a party) and Attachments. A setting that is a single form (the sync schedule, the narration check, the matching rules, Statement settings, the auto-fill switches and the default credit days) shows the same as one line: “Last updated by …”.' },
    { q: 'Can anyone change or clear it?', a: 'No. It comes from RAMS’s record of changes, which is never purged. Admins and Owners can see every change on Admin → Audit Log.' },
  ],
};
