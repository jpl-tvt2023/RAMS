import {
  LayoutDashboard, Settings, Users, ScrollText, Building2, Link2, ListChecks, SlidersHorizontal, BookUser, ShieldCheck, LifeBuoy, PenLine,
  FileText, Receipt, ArrowLeftRight, Wallet, AlertTriangle, Activity, BarChart3, IndianRupee, BookOpen, CalendarClock, HardDrive, ShoppingCart, Paperclip,
  Warehouse, Scissors,
} from 'lucide-react';
import { isReleased } from './releases';

// The RAMS role set. MIRRORED in backend/src/middleware/rbac.js and in the
// user_roles CHECK (migration 022) -- change all three together;
// utils/__tests__/roles.test.js and the backend's tests/roles.test.js pin the
// same values. A user may hold several roles: the two heads are add-ons.
export const ROLES = {
  ADMIN: 'Admin',
  OWNER: 'Owner',
  ACCOUNTANT: 'Accountant',
  VIEWER: 'Viewer',
  PURCHASE_HEAD: 'Purchase Head',
  ACCOUNTANT_HEAD: 'Accountant Head',
};

export const ALL_ROLES = [ROLES.ADMIN, ROLES.OWNER, ROLES.ACCOUNTANT, ROLES.VIEWER, ROLES.PURCHASE_HEAD, ROLES.ACCOUNTANT_HEAD];
export const ADMIN_ONLY = [ROLES.ADMIN, ROLES.OWNER];

// What each role means, as the Users page explains it.
export const ROLE_INFO = {
  [ROLES.ADMIN]: 'Everything, including users and the audit log',
  [ROLES.OWNER]: 'Same as Admin',
  [ROLES.ACCOUNTANT]: 'Works the accounts — what exactly is set on Admin → Roles & permissions',
  [ROLES.VIEWER]: 'Reads — what exactly is set on Admin → Roles & permissions',
  [ROLES.PURCHASE_HEAD]: 'First approval on Purchase Reports. Add it to the person’s other role',
  [ROLES.ACCOUNTANT_HEAD]: 'Final approval on Purchase Reports. Add it to the person’s other role',
};

// The permission keys the UI asks about -- the catalog itself (labels, what
// each allows) comes from the API, backend/src/services/permissions.js.
export const PERM = {
  MATCHING_VIEW: 'matching.view',
  MATCHING_RUN: 'matching.run',
  MATCHING_REVIEW: 'matching.review',
  MATCHING_RULES: 'matching.rules',
  MATCHING_PARTIES: 'matching.parties',
  AUTOFILL_VIEW: 'autofill.view',
  AUTOFILL_APPROVE: 'autofill.approve',
  AUTOFILL_OVERWRITE: 'autofill.overwrite',
  AUTOFILL_SETTINGS: 'autofill.settings',
  REPORTS_VIEW: 'reports.view',
  REPORTS_SETTINGS: 'reports.settings',
  STATEMENTS_VIEW: 'statements.view',
  STATEMENTS_FILES: 'statements.files',
  STATEMENTS_SETTINGS: 'statements.settings',
  ATTACHMENTS_VIEW: 'attachments.view',
  PURCHASES_VIEW: 'purchases.view',
  PURCHASES_CHECK: 'purchases.check',
  PURCHASES_APPROVE_PURCHASE: 'purchases.approve_purchase',
  PURCHASES_APPROVE_ACCOUNTS: 'purchases.approve_accounts',
  SYNC_COMPANIES: 'sync.companies',
  SYNC_SCHEDULE: 'sync.schedule',
  NARRATION_SETTINGS: 'narration.settings',
  SYNC_RUN: 'sync.run',
};

/**
 * The top-bar navigation. Each entry is a LEAF { label, path, icon, description?,
 * roles | permission } or a GROUP { label, icon, children: [leaf, ...] }; a
 * group with no child the user may see disappears. `permission` (a key, or a
 * list where any one is enough) follows Admin -> Roles & permissions; `roles`
 * is fixed. Each screen comes with a Help section (src/help). A screen still
 * held (utils/releases.js) is left out, and a group left empty with it. A
 * COMING-SOON leaf { label, icon, comingSoon: true, roles } has no path: the
 * top bar shows it greyed with "Coming soon", and it can't be clicked.
 */
const withoutHeld = (entries) => entries
  .map((e) => (e.children ? { ...e, children: e.children.filter((c) => isReleased(c.path)) } : e))
  .filter((e) => (e.children ? e.children.length > 0 : e.comingSoon || isReleased(e.path)));

export const NAV = withoutHeld([
  {
    label: 'Dashboard',
    path: '/dashboard',
    icon: LayoutDashboard,
    roles: ALL_ROLES,
  },
  {
    label: 'Matching',
    icon: Link2,
    children: [
      {
        label: 'Match review',
        path: '/matching',
        icon: ListChecks,
        description: 'Each PO and RTV row with its Tally invoice or credit note',
        permission: PERM.MATCHING_VIEW,
      },
      {
        label: 'Matching rules',
        path: '/matching/rules',
        icon: SlidersHorizontal,
        description: 'How POs are matched, and the checks on each link',
        permission: PERM.MATCHING_VIEW,
      },
      {
        label: 'Party ledgers',
        path: '/matching/parties',
        icon: BookUser,
        description: 'Which marketplace each Tally party ledger belongs to',
        permission: PERM.MATCHING_VIEW,
      },
      {
        label: 'Auto-fill',
        path: '/matching/autofill',
        icon: PenLine,
        description: 'Tally’s numbers written into ROMS, and what ROMS refused',
        permission: PERM.AUTOFILL_VIEW,
      },
    ],
  },
  {
    label: 'Tally Reports',
    icon: BarChart3,
    children: [
      {
        label: 'Bills Receivable', path: '/reports/bills-receivable', icon: IndianRupee, description: 'Each invoice, what is still owed and how overdue', permission: PERM.REPORTS_VIEW,
      },
      {
        label: 'Party Statements', path: '/reports/party-statements', icon: BookOpen, description: 'Each party’s statement from Tally, with its documents', permission: PERM.STATEMENTS_VIEW,
      },
      {
        label: 'Attachments', path: '/reports/attachments', icon: Paperclip, description: 'Each month’s invoices, payments, debit and credit notes, with their files', permission: PERM.ATTACHMENTS_VIEW,
      },
      {
        label: 'Invoices', path: '/reports/invoices', icon: FileText, description: 'Every Tally sales invoice, what settled it and what is owed', permission: PERM.REPORTS_VIEW,
      },
      {
        label: 'Credit & debit notes', path: '/reports/notes', icon: Receipt, description: 'Each note, the invoice it settles, its PO and RTV row', permission: PERM.REPORTS_VIEW,
      },
      {
        label: 'Stock transfers', path: '/reports/transfers', icon: ArrowLeftRight, description: 'Sales between our own registrations', permission: PERM.REPORTS_VIEW,
      },
      {
        label: 'Receivables', path: '/reports/receivables', icon: Wallet, description: 'What each marketplace owes, how old, and credit terms', permission: PERM.REPORTS_VIEW,
      },
      {
        label: 'Exceptions', path: '/reports/exceptions', icon: AlertTriangle, description: 'Everything that needs a person, and where to fix it', permission: PERM.REPORTS_VIEW,
      },
      {
        label: 'Sync health', path: '/sync', icon: Activity, description: 'The Connector, Tally, each company and every sync run', roles: ALL_ROLES,
      },
    ],
  },
  {
    label: 'Purchase Reports',
    icon: ShoppingCart,
    children: [
      {
        label: 'Warehouse', path: '/purchases/warehouse', icon: Warehouse, description: 'Receipts of packaging, barcodes and goods that skip Stitching', permission: PERM.PURCHASES_VIEW,
      },
      {
        label: 'Stitching', path: '/purchases/stitching', icon: Scissors, description: 'Receipts of fabric and goods that go through Stitching, and every challan', permission: PERM.PURCHASES_VIEW,
      },
    ],
  },
  {
    label: 'Admin',
    icon: Settings,
    children: [
      {
        label: 'Users',
        path: '/admin/users',
        icon: Users,
        description: 'Accounts, roles & access',
        roles: ADMIN_ONLY,
      },
      {
        label: 'Tally companies',
        path: '/admin/companies',
        icon: Building2,
        description: 'Which Tally companies RAMS syncs, when, and the narration check',
        permission: [PERM.SYNC_COMPANIES, PERM.SYNC_SCHEDULE, PERM.NARRATION_SETTINGS],
      },
      {
        label: 'Credit terms',
        path: '/admin/credit-terms',
        icon: CalendarClock,
        description: 'How many days each marketplace has to pay',
        permission: PERM.REPORTS_SETTINGS,
      },
      {
        label: 'Roles & permissions',
        path: '/admin/permissions',
        icon: ShieldCheck,
        description: 'What Accountants and Viewers may do',
        roles: ADMIN_ONLY,
      },
      {
        label: 'Audit Log',
        path: '/admin/audit-log',
        icon: ScrollText,
        description: 'Every change, who made it and when',
        roles: ADMIN_ONLY,
      },
      {
        label: 'File storage',
        path: '/admin/files',
        icon: HardDrive,
        description: 'The space the files on Party Statements take, and the biggest ones',
        roles: ADMIN_ONLY,
      },
    ],
  },
  {
    label: 'Help',
    path: '/help',
    icon: LifeBuoy,
    roles: ALL_ROLES,
  },
]);
