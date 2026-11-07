// Help: Users, the Audit Log and history, Tally companies, Roles & permissions.
export const users = {
  id: 'users',
  path: '/admin/users',
  area: 'Admin',
  title: 'Users',
  who: 'Admin and Owner only.',
  summary: 'Make an account for each person, choose their role, reset a forgotten password, or deactivate someone who left. Accounts are never deleted, so the history keeps their name.',
  flows: [
    {
      title: 'Add a user',
      steps: [
        'Admin → Users → Add User.',
        'Enter their full name and a User ID (small letters, digits, dot, dash or underscore).',
        'Choose the role: Admin, Owner, Accountant or Viewer. What Accountants and Viewers may do is set on Roles & permissions.',
        'Type a temporary password and save. Give it to the person; they set their own at the first sign-in.',
      ],
    },
    {
      title: 'Reset a password',
      steps: [
        'Click the key icon on the user’s row.',
        'Type a new temporary password and click Reset Password.',
        'They are signed out everywhere and must set their own password at the next sign-in.',
      ],
    },
    {
      title: 'Change a role, or deactivate',
      steps: [
        'The pencil icon changes the name or the role. A role change signs the user out, so the new role applies at once.',
        'The deactivate icon stops the account from signing in. Reactivate brings it back.',
        'You can’t deactivate yourself, and the last active Admin or Owner always stays.',
      ],
    },
  ],
  faq: [
    { q: 'Why can’t I delete a user?', a: 'So the audit log keeps saying who did what. Deactivate them instead.' },
  ],
};

export const auditLog = {
  id: 'audit-log',
  path: '/admin/audit-log',
  area: 'Admin',
  title: 'Audit Log and history',
  who: 'The full Audit Log: Admin and Owner. A record’s own history (the clock icon): anyone who can see the record.',
  summary: 'Every change in RAMS is recorded: who, when, and the old and new values. Nothing is ever purged.',
  flows: [
    {
      title: 'Find a change',
      steps: [
        'Admin → Audit Log.',
        'Filter by user, action, record type and dates, or type words from the description, then Search.',
        'Each entry shows the fields that changed, old → new.',
      ],
    },
    {
      title: 'See one record’s history',
      steps: ['Click the clock icon next to a record (a company, the sync schedule, the matching rules, a PO in Match review). A drawer lists its changes, newest first.'],
    },
  ],
  faq: [
    { q: 'What is "System" in the user column?', a: 'A change made by RAMS itself or by the Connector, not by a person.' },
  ],
};

export const tallyCompanies = {
  id: 'tally-companies',
  path: '/admin/companies',
  area: 'Admin',
  title: 'Tally companies, the sync schedule and the narration check',
  who: 'Admin and Owner, and any role given "Turn company sync on or off", "Change the sync schedule" or "Change the narration check" on Roles & permissions. The star (the default for reports) goes with "Turn company sync on or off".',
  summary: 'Companies are created in Tally by the accountants. RAMS lists every company the Connector sees loaded in Tally; you choose which ones RAMS copies, and when, and which one the reports open on.',
  flows: [
    {
      title: 'Start syncing a company',
      steps: [
        'Load the company in Tally on the office PC. Within a few minutes it appears here with sync Off.',
        'Click the power icon on its row, read the message, and click Turn on.',
        'The first time, RAMS copies everything from ROMS go-live (a backfill). It runs outside office hours unless the schedule allows otherwise.',
        'The Dashboard’s Tally sync card shows its progress.',
      ],
    },
    {
      title: 'Stop syncing a company',
      steps: ['Click the power-off icon and confirm. What RAMS already holds is kept; turning it back on carries on from where it stopped.'],
    },
    {
      title: 'Change when the Connector syncs',
      steps: [
        'In the Sync schedule panel, click Edit.',
        'Choose the office days and hours, how often the light sync checks Tally in office hours, and the time after which the end-of-day check runs.',
        'Save. The Connector picks the change up within a minute.',
      ],
    },
    {
      title: 'Choose which records need a narration',
      steps: [
        'The Narration check panel says which Tally records are highlighted when they have no narration, and how many that is today. To begin with it is every voucher type, from 8 June 2026.',
        'Click Edit. The list shows each voucher type, how many records it has and how many have no narration.',
        'Untick the types that don’t need one (for example Sales, if invoices never carry a narration), or move the From date to start later.',
        'Click Save. Every screen that lists Tally records highlights only what the rule asks for. The change is in the Audit Log.',
      ],
    },
    {
      title: 'Choose the company the reports open on',
      steps: [
        'The company marked Default for reports is the one Reports → Debtors opens on (MH to begin with).',
        'To change it, click the star on another company’s row. Only a company whose sync is on can be the default.',
        'Everyone sees the new default the next time they open the report in a new tab. The change is recorded in the Audit Log.',
      ],
    },
  ],
  faq: [
    { q: 'A company appears twice.', a: 'It was re-created in Tally, which gives it a new identity. Turn the new one on and the old one off.' },
    { q: 'Does the narration check change Tally?', a: 'No. It only decides which records RAMS highlights. Records outside it still show their narration.' },
    { q: 'What is the short code?', a: 'How lists show the company (MH, HR, WB). Click the pencil icon to change it.' },
    { q: 'Can the reports open on all companies?', a: 'Each person can choose All companies on the report itself. The default is always one company, so the star moves it rather than clearing it.' },
  ],
};

export const creditTerms = {
  id: 'credit-terms',
  path: '/admin/credit-terms',
  area: 'Admin',
  title: 'Credit terms',
  who: 'Anyone with "Change credit terms": Admin and Owner always, Accountants by default. An Admin or Owner can give it to, or take it from, other roles on Roles & permissions.',
  summary: 'How many days each marketplace has to pay an invoice. Debtors marks an invoice overdue once its days have passed. A marketplace without its own days uses the default. Each change shows what it would do before you save it.',
  flows: [
    {
      title: 'Change a marketplace’s credit days',
      steps: [
        'Admin → Credit terms.',
        'Click the pencil on the marketplace’s row.',
        'Type the days. The box under it says what changes today, for example “Of Zepto’s 140 invoices still owed, 23 would become overdue”.',
        'Click Save. Debtors uses the new days at once, and the change is in the Audit Log.',
      ],
    },
    {
      title: 'Go back to the default',
      steps: [
        'Click the pencil on the marketplace’s row.',
        'Tick “Use the default”, check what it changes, and click Save.',
      ],
    },
    {
      title: 'Change the default',
      steps: [
        'Click Edit next to the default. It applies to every marketplace without its own days, and to invoices whose marketplace isn’t known.',
        'Type the days, check what it changes, and click Save.',
      ],
    },
    {
      title: 'See who changed what',
      steps: [
        'Each row says who last changed it and when.',
        'The clock next to the default shows its full history; every change is also in the Audit Log.',
      ],
    },
  ],
  faq: [
    { q: 'What do the credit days decide?', a: 'When an invoice is overdue: its date plus the days. Debtors shows the due date and how many days overdue.' },
    { q: 'What does “Default (30)” mean?', a: 'The marketplace has no days of its own, so it uses the default, 30 days to begin with.' },
    { q: 'Why aren’t Flipkart and Amazon listed?', a: 'They are set to stock transfer on Matching rules: sales between our own registrations, so nothing is owed and nothing is overdue.' },
    { q: 'Does the preview change anything?', a: 'No. Nothing is saved until you click Save.' },
  ],
};

export const rolesPermissions = {
  id: 'roles-permissions',
  path: '/admin/permissions',
  area: 'Admin',
  title: 'Roles & permissions',
  who: 'Admin and Owner only.',
  summary: 'Admins and Owners can always do everything. Here they decide what Accountants and Viewers may do. A change applies at once, without anyone signing in again.',
  flows: [
    {
      title: 'Give or take away a permission',
      steps: [
        'Admin → Roles & permissions.',
        'Tick or untick the box for Accountant or Viewer on the permission’s row. Each row says what it allows.',
        'Click Save changes. The change is recorded in the Audit Log; the History button shows it.',
      ],
    },
  ],
  faq: [
    { q: 'Why can’t I give an Accountant the Users page?', a: 'Users, the Audit Log and this page stay with Admins and Owners, so nobody can give themselves more rights.' },
    { q: 'Someone still sees a button they shouldn’t.', a: 'It disappears when their page reloads, but RAMS refuses the action itself from the moment you save.' },
  ],
};
