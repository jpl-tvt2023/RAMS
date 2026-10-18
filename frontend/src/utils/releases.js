// The Reports screens reach the client one at a time: the full set at once was
// too much. A held screen has no top-bar entry, its URL goes to the Dashboard
// (ProtectedRoute), and it has no Help section or Roles & permissions row. The
// code, its route and its tests stay, so releasing one is taking its path off
// HELD -- then fixing any link or sentence that points at a screen still held
// (use isReleased).
export const HELD = [
  '/reports/invoices',
  '/reports/notes',
  '/reports/transfers',
  '/reports/receivables',
  '/reports/exceptions',
  '/sync',
];

export const isReleased = (path) => !HELD.includes(path);

// The screens each permission governs (keys from utils/roles.js PERM). Its row
// on Roles & permissions shows once any of them is released.
export const PERM_SCREENS = {
  'reports.view': ['/reports/debtors', '/reports/invoices', '/reports/notes', '/reports/transfers', '/reports/receivables', '/reports/exceptions'],
  'reports.settings': ['/reports/receivables'],
  'sync.run': ['/sync'],
  'ledgers.view': ['/ledgers'],
  'ledgers.entry': ['/ledgers'],
  'ledgers.settings': ['/ledgers'],
};

export const permissionReleased = (key) => !PERM_SCREENS[key] || PERM_SCREENS[key].some(isReleased);
