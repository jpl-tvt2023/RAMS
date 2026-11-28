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
  'reports.view': ['/reports/bills-receivable', '/reports/invoices', '/reports/notes', '/reports/transfers', '/reports/receivables', '/reports/exceptions'],
  'reports.settings': ['/admin/credit-terms', '/reports/receivables'],
  'sync.run': ['/sync'],
  'statements.view': ['/reports/party-statements'],
  'statements.files': ['/reports/party-statements', '/reports/attachments'],
  'statements.settings': ['/reports/party-statements'],
  'attachments.view': ['/reports/attachments'],
  'purchases.view': ['/purchases/warehouse', '/purchases/stitching'],
  'purchases.check': ['/purchases/warehouse', '/purchases/stitching'],
  'purchases.approve_purchase': ['/purchases/warehouse', '/purchases/stitching'],
  'purchases.approve_accounts': ['/purchases/warehouse', '/purchases/stitching'],
};

export const permissionReleased = (key) => !PERM_SCREENS[key] || PERM_SCREENS[key].some(isReleased);
