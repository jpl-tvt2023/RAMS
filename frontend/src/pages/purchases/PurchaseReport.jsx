import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { RefreshCw, CircleAlert } from 'lucide-react';
import ReportFrame, { selectCls } from '../../components/reports/ReportFrame';
import RecordsTable from '../../components/purchases/RecordsTable';
import CheckDialog from '../../components/purchases/CheckDialog';
import SendBackDialog from '../../components/purchases/SendBackDialog';
import FilesDialog from '../../components/files/FilesDialog';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Pagination, { loadPersistedPageSize, persistPageSize } from '../../components/ui/Pagination';
import {
  getPurchaseRecords, refreshPurchases, saveBillCheck, approvePurchaseRecords, sendBackPurchaseRecord,
} from '../../api/purchases.api';
import { useKeyedLoad } from '../../hooks/useKeyedLoad';
import { useSessionState } from '../../hooks/useSessionState';
import { useAuth } from '../../context/AuthContext';
import { PERM } from '../../utils/roles';
import { formatDate, formatDateTime } from '../../utils/formatters';
import { downloadCsv } from '../../utils/csv';
import {
  STATUSES, statusOf, defaultStatus, stepOf, HEAD_OF, WITH_CHECKER, purchasesKey,
} from '../../utils/purchaseText';

// Purchase Reports -> Warehouse (/purchases/warehouse) and Stitching
// (/purchases/stitching): what ROMS records when goods are booked in against
// an outbound PO (a receipt) or handed on between stitching stages (a
// challan). Receipts sharing an Incoming No from one vendor are one record;
// each challan is one. On each record a person attaches the bill or challan
// and saves the bill check; the Purchase Head approves, then the Accountant
// Head. Either head can send it back with a reason. RAMS reads ROMS when the
// page opens (if its copy is more than a few minutes old) and on Refresh.
const PAGES = {
  warehouse: {
    title: 'Warehouse',
    help: 'purchases-warehouse',
    intro: 'Each delivery ROMS books in for packaging, barcodes and other goods that don’t go through Stitching, one record per Incoming No. Attach the bill, save the bill check, and it goes to the Purchase Head, then the Accountant Head.',
  },
  stitching: {
    title: 'Stitching',
    help: 'purchases-stitching',
    intro: 'Fabric and other goods that go through Stitching: each delivery ROMS books in (one record per Incoming No) and each challan between stages. Attach the bill or challan, save the bill check, and it goes to the Purchase Head, then the Accountant Head.',
  },
};
const ALL = 10000;
const monthLabel = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

export default function PurchaseReport({ page }) {
  const meta = PAGES[page];
  const { user, can } = useAuth();
  const canDo = {
    check: can(PERM.PURCHASES_CHECK),
    purchase: can(PERM.PURCHASES_APPROVE_PURCHASE),
    accounts: can(PERM.PURCHASES_APPROVE_ACCOUNTS),
  };
  // Per person: whoever signs in next on this tab opens on their own step.
  const [pick, setPick] = useSessionState(purchasesKey(page, user), () => ({
    company_id: '', status: defaultStatus(user, can, PERM), month: '', q: '',
  }));
  const [pageNo, setPageNo] = useState(1);
  const [pageSize, setPageSize] = useState(() => loadPersistedPageSize('purchases', 50));
  const [selected, setSelected] = useState(() => new Set());
  const [dialog, setDialog] = useState(null); // { type: 'check'|'files'|'sendback'|'approve', id?, ids?, step?, back? }
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const set = (patch) => { setPick((p) => ({ ...p, ...patch })); setPageNo(1); setSelected(new Set()); };

  const fetcher = useCallback((params) => getPurchaseRecords(page, params), [page]);
  const params = {
    company_id: pick.company_id, status: pick.status, month: pick.month, q: pick.q, page: pageNo, page_size: pageSize,
  };
  const list = useKeyedLoad(fetcher, params);
  const d = list.data || list.last;
  const rows = list.data?.rows || [];
  const recordOf = (id) => (d?.rows || []).find((r) => r.id === id);
  const reload = () => { setSelected(new Set()); list.reload(); };

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await refreshPurchases();
      if (res.ok) toast.success('Read ROMS again');
      else if (!res.busy) toast.error(res.error || 'ROMS could not be read');
      reload();
    } catch (err) {
      toast.error(err.response?.data?.message || 'ROMS could not be read');
    } finally { setRefreshing(false); }
  };

  const run = async (work, done) => {
    setBusy(true);
    try {
      await work();
      if (done) toast.success(done);
      setDialog(null);
      reload();
    } catch (err) {
      toast.error(err.response?.data?.message || 'That didn’t work');
    } finally { setBusy(false); }
  };

  const approve = (ids) => run(async () => {
    // A person who holds both steps (Admin) may tick records at either one.
    const byStep = { purchase: [], accounts: [] };
    for (const id of ids) {
      const s = stepOf(recordOf(id)?.status);
      if (s) byStep[s].push(id);
    }
    let approved = 0;
    const skipped = [];
    for (const s of ['purchase', 'accounts']) {
      if (!byStep[s].length) continue;
      const res = await approvePurchaseRecords(s, byStep[s]);
      approved += res.approved;
      skipped.push(...res.skipped);
    }
    if (approved) toast.success(approved === 1 ? 'Approved' : `${approved} records approved`);
    if (skipped.length) toast.error(`${skipped.length} not approved: ${skipped[0].reason}`);
  });

  const csv = async () => {
    try {
      const all = await getPurchaseRecords(page, { ...params, page: 1, page_size: ALL });
      const lines = all.rows.flatMap((r) => (r.lines.length ? r.lines : [{}]).map((l) => ({ r, l })));
      downloadCsv(`rams-purchases-${page}.csv`, [
        ['Incoming', ({ r }) => r.incoming || ''], [page === 'warehouse' ? 'Vendor' : 'Vendor / Party', ({ r }) => (r.kind === 'challan' ? r.party : r.vendor) || ''],
        ['Date', ({ l }) => (l.date ? formatDate(l.date) : '')], ['Billing / Challan', ({ l }) => l.billing || ''],
        ['From → to', ({ l }) => (l.from_stage ? `${l.from_stage} → ${l.to_stage}` : '')], ['PO', ({ l }) => l.po || ''],
        ['Article', ({ l }) => l.article || ''], ['Rate', ({ l }) => l.rate ?? ''], ['Qty', ({ l }) => l.qty ?? ''], ['UOM', ({ l }) => l.uom || ''],
        ['Files', ({ r }) => r.files.map((f) => f.name).join('; ')],
        ['Bill check by', ({ r }) => r.check?.name || ''], ['Bill check at', ({ r }) => (r.check ? formatDateTime(r.check.at) : '')],
        ['Status', ({ r }) => statusOf(r.status).label],
        ['Purchase Head', ({ r }) => (r.purchase_approval ? `${r.purchase_approval.name} ${formatDateTime(r.purchase_approval.at)}` : '')],
        ['Accountant Head', ({ r }) => (r.accounts_approval ? `${r.accounts_approval.name} ${formatDateTime(r.accounts_approval.at)}` : '')],
        ['Sent back because', ({ r }) => (r.status === 'sent_back' ? r.sent_back?.reason || '' : '')],
      ], lines);
    } catch {
      toast.error('The download failed');
    }
  };

  const open = dialog?.id != null ? recordOf(dialog.id) : null;
  const counts = d?.counts || {};
  const shownStatuses = STATUSES.filter((s) => s.key !== 'removed' || counts.removed);
  const roms = d?.roms;
  const approvable = [...selected].filter((id) => {
    const s = stepOf(recordOf(id)?.status);
    return (s === 'purchase' && canDo.purchase) || (s === 'accounts' && canDo.accounts);
  });

  return (
    <ReportFrame
      title={`Purchase Reports — ${meta.title}`}
      help={meta.help}
      intro={meta.intro}
      companies={d?.companies || []}
      companyId={pick.company_id}
      onCompany={(id) => set({ company_id: id })}
      filtersFirst
      search={pick.q}
      onSearch={(q) => set({ q })}
      searchHint="Incoming, bill or challan no, PO, article, vendor"
      onCsv={d ? csv : undefined}
      filters={(
        <select aria-label="Month" value={pick.month} onChange={(e) => set({ month: e.target.value })} className={selectCls}>
          <option value="">All months</option>
          {(d?.months || []).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      )}
    >
      <div role="tablist" aria-label="Status" className="flex flex-wrap gap-1 mb-3 border-b border-gray-200">
        {[...shownStatuses, { key: 'all', label: 'All' }].map((s) => (
          <button key={s.key} type="button" role="tab" aria-selected={pick.status === s.key} onClick={() => set({ status: s.key })}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${pick.status === s.key ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            {s.label} <span className="ml-1 text-gray-400">({(counts[s.key] ?? 0).toLocaleString('en-IN')})</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-3 text-sm text-gray-600">
        {roms && (
          <span className="inline-flex items-center gap-1">
            {roms.read_at ? `Read from ROMS ${formatDateTime(roms.read_at)}` : 'Not read from ROMS yet'}
          </span>
        )}
        <Button size="sm" variant="ghost" onClick={refresh} loading={refreshing}><RefreshCw size={14} /> Refresh from ROMS</Button>
        {roms?.error && (
          <span className="inline-flex items-center gap-1 text-gray-700"><CircleAlert size={14} aria-hidden="true" />{roms.error}</span>
        )}
        {approvable.length > 0 && (
          <Button size="sm" className="ml-auto" onClick={() => setDialog({ type: 'approve', ids: approvable })}>Approve selected ({approvable.length})</Button>
        )}
      </div>

      <RecordsTable
        rows={rows}
        loading={list.loading}
        can={canDo}
        selected={selected}
        onSelect={(id, on) => setSelected((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; })}
        onFiles={(r) => setDialog({ type: 'files', id: r.id })}
        onCheck={(r) => setDialog({ type: 'check', id: r.id })}
        onApprove={(r) => setDialog({ type: 'approve', ids: [r.id] })}
        onSendBack={(r) => setDialog({ type: 'sendback', id: r.id, step: stepOf(r.status) })}
        empty={(
          <p className="text-center text-gray-500 py-8 px-4 text-sm">
            {pick.status === 'all' && !pick.q && !pick.month && !pick.company_id
              ? `Nothing here yet. Records appear when ROMS books in a ${page === 'warehouse' ? 'delivery of goods that don’t go through Stitching' : 'delivery of stitching goods or a challan'}.`
              : 'No record matches. Try another status, month or search.'}
          </p>
        )}
      />
      <Pagination page={pageNo} pageSize={pageSize} total={list.data?.total ?? 0} onPageChange={setPageNo}
        onPageSizeChange={(s) => { setPageSize(s); persistPageSize('purchases', s); setPageNo(1); }} />

      {dialog?.type === 'check' && open && (
        <CheckDialog
          record={open}
          saving={busy}
          onClose={() => setDialog(null)}
          onFiles={() => setDialog({ type: 'files', id: open.id, back: 'check' })}
          onSave={(note) => run(() => saveBillCheck(open.id, note), 'Bill check saved — it is with the Purchase Head')}
        />
      )}
      {dialog?.type === 'files' && open && (
        <FilesDialog
          title={open.label}
          subtitle={`${statusOf(open.status).label}${open.date ? ` · ${formatDate(open.date)}` : ''}`}
          files={open.files}
          target={canDo.check && WITH_CHECKER.includes(open.status) ? { purchaseRecordId: open.id } : undefined}
          canEdit={canDo.check && WITH_CHECKER.includes(open.status)}
          onClose={() => setDialog(dialog.back ? { type: dialog.back, id: open.id } : null)}
          onChanged={list.reload}
        />
      )}
      {dialog?.type === 'sendback' && open && (
        <SendBackDialog
          record={open}
          step={dialog.step}
          saving={busy}
          onClose={() => setDialog(null)}
          onSend={(reason) => run(() => sendBackPurchaseRecord(dialog.step, open.id, reason), 'Sent back to the bill check')}
        />
      )}
      <ConfirmDialog
        isOpen={dialog?.type === 'approve'}
        onClose={() => setDialog(null)}
        onConfirm={() => approve(dialog.ids)}
        loading={busy}
        variant="primary"
        title={dialog?.ids?.length > 1 ? `Approve ${dialog.ids.length} records?` : 'Approve this record?'}
        message={dialog?.type === 'approve'
          ? (dialog.ids.length === 1
            ? `${recordOf(dialog.ids[0])?.label || 'This record'}: ${stepOf(recordOf(dialog.ids[0])?.status) === 'purchase' ? 'it goes on to the Accountant Head.' : 'this is the final approval.'}`
            : `Each is approved at the step it is waiting for${canDo.purchase && canDo.accounts ? '' : ` as ${canDo.purchase ? HEAD_OF.purchase : HEAD_OF.accounts}`}. Each approval is kept in the record’s history.`)
          : ''}
        confirmLabel="Approve"
      />
    </ReportFrame>
  );
}
