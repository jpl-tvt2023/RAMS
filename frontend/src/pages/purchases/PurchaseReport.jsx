import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { RefreshCw, CircleAlert } from 'lucide-react';
import ReportFrame, { selectCls } from '../../components/reports/ReportFrame';
import RecordsTable from '../../components/purchases/RecordsTable';
import CheckDialog from '../../components/purchases/CheckDialog';
import SendBackDialog from '../../components/purchases/SendBackDialog';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Pagination, { loadPersistedPageSize, persistPageSize } from '../../components/ui/Pagination';
import {
  getPurchaseRecords, refreshPurchases, saveBillChecks, approvePurchaseRecords, sendBackPurchaseRecord, recallPurchaseRecords,
} from '../../api/purchases.api';
import { useKeyedLoad } from '../../hooks/useKeyedLoad';
import { useSessionState } from '../../hooks/useSessionState';
import { useAuth } from '../../context/AuthContext';
import { PERM } from '../../utils/roles';
import { formatDate, formatDateTime, currentMonthIst } from '../../utils/formatters';
import { downloadTable } from '../../utils/download';
import {
  STATUSES, statusOf, defaultStatus, stepOf, HEAD_OF, approvalOf, purchasesKey, notesOf, maySend, mayApprove, mayRecall,
} from '../../utils/purchaseText';

// Purchase Reports -> Warehouse (/purchases/warehouse) and Stitching
// (/purchases/stitching): what ROMS records when goods are booked in against
// an outbound PO (a receipt) or handed on between stitching stages (a
// challan). Every ROMS line is its own record (the user, 2026-11-28 evening),
// listed with the rest of its delivery -- the receipts under one Incoming No
// from one vendor, or one challan. On each line the checker attaches the bill
// ("View/Attach bill", which may cover the delivery's other lines too) and
// sends it for approval -- attaching alone sends nothing, and lines can be
// ticked and sent together (the user, 2026-11-29). The Purchase Head approves,
// then the Accountant Head, each in a column of their own. A head can send it
// back with a reason, even after approving it; whoever sent it on can recall
// it until the next person acts. The page opens on this financial year and
// month. RAMS reads ROMS when the page opens (if its copy is more than a few
// minutes old) and on Refresh.
const PAGES = {
  warehouse: {
    title: 'Warehouse',
    help: 'purchases-warehouse',
    intro: 'Each line ROMS books in for packaging, barcodes and other goods that don’t go through Stitching, listed under its Incoming No. Attach the bill and send the line for approval: it goes to the Purchase Head, then the Accountant Head.',
  },
  stitching: {
    title: 'Stitching',
    help: 'purchases-stitching',
    intro: 'Fabric and other goods that go through Stitching: each line ROMS books in (listed under its Incoming No) and each challan line between stages. Attach the bill or challan and send the line for approval: it goes to the Purchase Head, then the Accountant Head.',
  },
};
const ALL = 10000;
const monthLabel = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};
// A head's column in a download: the same words as on the page.
const approvalText = (r, step) => {
  const a = approvalOf(r, step);
  return a.state === 'approved' && a.at ? `${a.text}, ${formatDateTime(a.at)}` : a.text;
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
  // The year '' is the current one; the month opens on this month.
  const [pick, setPick] = useSessionState(purchasesKey(page, user), () => ({
    company_id: '', fy: '', month: currentMonthIst(), status: defaultStatus(user, can, PERM), q: '',
  }));
  const [pageNo, setPageNo] = useState(1);
  const [pageSize, setPageSize] = useState(() => loadPersistedPageSize('purchases', 50));
  const [selected, setSelected] = useState(() => new Set());
  const [dialog, setDialog] = useState(null); // { type: 'check'|'send'|'sendback'|'approve'|'recall', id?, ids?, step? }
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const set = (patch) => { setPick((p) => ({ ...p, ...patch })); setPageNo(1); setSelected(new Set()); };

  const fetcher = useCallback((params) => getPurchaseRecords(page, params), [page]);
  const params = {
    company_id: pick.company_id, fy: pick.fy ?? '', status: pick.status, month: pick.month, q: pick.q, page: pageNo, page_size: pageSize,
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

  const check = (ids, note) => run(async () => {
    const res = await saveBillChecks(ids, note);
    if (res.checked) toast.success(res.checked === 1 ? 'Sent for approval — it is with the Purchase Head' : `${res.checked} lines sent for approval — they are with the Purchase Head`);
    if (res.skipped.length) toast.error(`${res.skipped.length} not sent: ${res.skipped[0].reason}`);
  });

  const recall = (ids) => run(async () => {
    const res = await recallPurchaseRecords(ids.map((id) => ({ id, from: recordOf(id)?.status })));
    if (res.recalled) toast.success(res.recalled === 1 ? 'Recalled' : `${res.recalled} lines recalled`);
    if (res.skipped.length) toast.error(`${res.skipped.length} not recalled: ${res.skipped[0].reason}`);
  });

  const approve = (ids) => run(async () => {
    // A person who holds both steps (Admin) may tick lines at either one.
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
    if (approved) toast.success(approved === 1 ? 'Approved' : `${approved} lines approved`);
    if (skipped.length) toast.error(`${skipped.length} not approved: ${skipped[0].reason}`);
  });

  const download = async () => {
    try {
      const all = await getPurchaseRecords(page, { ...params, page: 1, page_size: ALL });
      const line = (r) => r.lines[0] || {};
      downloadTable(`rams-purchases-${page}-FY${all.fy_label}${pick.month ? `-${pick.month}` : ''}`, [
        ['Incoming', (r) => r.incoming || ''], [page === 'warehouse' ? 'Vendor' : 'Vendor / Party', (r) => (r.kind === 'challan' ? r.party : r.vendor) || ''],
        ['Date', (r) => (line(r).date ? formatDate(line(r).date) : '')], ['Billing / Challan', (r) => line(r).billing || ''],
        ['From → to', (r) => (line(r).from_stage ? `${line(r).from_stage} → ${line(r).to_stage}` : '')], ['PO', (r) => line(r).po || ''],
        ['Article', (r) => line(r).article || ''], ['Rate', (r) => line(r).rate ?? ''], ['Qty', (r) => line(r).qty ?? ''], ['UOM', (r) => line(r).uom || ''],
        ['Files', (r) => r.files.map((f) => f.name).join('; ')],
        ['Bill check by', (r) => r.check?.name || ''], ['Bill check at', (r) => (r.check ? formatDateTime(r.check.at) : '')],
        ['Purchase Head', (r) => approvalText(r, 'purchase')], ['Accountant Head', (r) => approvalText(r, 'accounts')],
        ['Status', (r) => statusOf(r.status).label],
        ['Note', (r) => notesOf(r).map((n) => n.text).join(' · ')],
      ], all.rows, { sheet: meta.title });
    } catch {
      toast.error('The download failed');
    }
  };

  const open = dialog?.id != null ? recordOf(dialog.id) : null;
  const counts = d?.counts || {};
  const shownStatuses = STATUSES.filter((s) => s.key !== 'removed' || counts.removed);
  const roms = d?.roms;
  // What the ticked lines allow: each button counts only the lines it fits.
  const ticked = [...selected].map(recordOf).filter(Boolean);
  const sendable = ticked.filter((r) => maySend(r, canDo)).map((r) => r.id);
  const approvable = ticked.filter((r) => mayApprove(r, canDo)).map((r) => r.id);
  const recallable = ticked.filter((r) => mayRecall(r, canDo)).map((r) => r.id);
  // A file is not required, but say so before lines go without one.
  const billWarning = (ids) => {
    const k = ids.filter((id) => !recordOf(id)?.files?.length).length;
    if (!k) return '';
    if (ids.length === 1) return ' It has no bill attached.';
    if (k === ids.length) return ' None of them has a bill attached.';
    return ` ${k} of them ${k === 1 ? 'has' : 'have'} no bill attached.`;
  };
  const fyValue = pick.fy || String(d?.fy ?? '');

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
      onDownload={d ? download : undefined}
      filters={(
        <>
          <select aria-label="Financial year" value={fyValue} onChange={(e) => set({ fy: e.target.value, month: '' })} className={selectCls}>
            {!d && <option value="">This financial year</option>}
            {(d?.years || []).map((y) => <option key={y.fy} value={String(y.fy)}>FY {y.label}</option>)}
          </select>
          <select aria-label="Month" value={pick.month} onChange={(e) => set({ month: e.target.value })} className={selectCls}>
            <option value="">All months</option>
            {(d?.months?.includes(pick.month) || !pick.month ? [] : [pick.month]).concat(d?.months || []).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </>
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
        {(sendable.length > 0 || approvable.length > 0 || recallable.length > 0) && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {sendable.length > 0 && (
              <Button size="sm" onClick={() => setDialog({ type: 'send', ids: sendable })}>Send {sendable.length} for approval</Button>
            )}
            {approvable.length > 0 && (
              <Button size="sm" onClick={() => setDialog({ type: 'approve', ids: approvable })}>Approve selected ({approvable.length})</Button>
            )}
            {recallable.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => setDialog({ type: 'recall', ids: recallable })}>Recall {recallable.length}</Button>
            )}
          </div>
        )}
      </div>

      <RecordsTable
        rows={rows}
        loading={list.loading}
        can={canDo}
        selected={selected}
        onSelect={(id, on) => setSelected((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; })}
        onSelectMany={(ids, on) => setSelected((s) => { const n = new Set(s); for (const id of ids) { if (on) n.add(id); else n.delete(id); } return n; })}
        onCheck={(r) => setDialog({ type: 'check', id: r.id })}
        onApprove={(r) => setDialog({ type: 'approve', ids: [r.id] })}
        onSendBack={(r, step) => setDialog({ type: 'sendback', id: r.id, step: step || stepOf(r.status) })}
        onRecall={(r) => setDialog({ type: 'recall', ids: [r.id] })}
        empty={(
          <p className="text-center text-gray-500 py-8 px-4 text-sm">
            {pick.status === 'all' && !pick.q && !pick.company_id
              ? `Nothing ${pick.month ? `in ${monthLabel(pick.month)}` : `in FY ${d?.fy_label || 'this year'}`} yet. Lines appear when ROMS books in a ${page === 'warehouse' ? 'delivery of goods that don’t go through Stitching' : 'delivery of stitching goods or a challan'}.`
              : `No line matches. Try another status${pick.month ? ', All months' : ''} or search.`}
          </p>
        )}
      />
      <Pagination page={pageNo} pageSize={pageSize} total={list.data?.total ?? 0} onPageChange={setPageNo}
        onPageSizeChange={(s) => { setPageSize(s); persistPageSize('purchases', s); setPageNo(1); }} />

      {dialog?.type === 'check' && open && (
        <CheckDialog
          record={open}
          canEdit={canDo.check}
          saving={busy}
          onClose={() => setDialog(null)}
          onChanged={list.reload}
          onSave={check}
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
        title={dialog?.ids?.length > 1 ? `Approve ${dialog.ids.length} lines?` : 'Approve this line?'}
        message={dialog?.type === 'approve'
          ? (dialog.ids.length === 1
            ? `${recordOf(dialog.ids[0])?.label || 'This line'}: ${stepOf(recordOf(dialog.ids[0])?.status) === 'purchase' ? 'it goes on to the Accountant Head.' : 'this is the final approval.'}`
            : `Each is approved at the step it is waiting for${canDo.purchase && canDo.accounts ? '' : ` as ${canDo.purchase ? HEAD_OF.purchase : HEAD_OF.accounts}`}. Each approval is kept in the line’s history.`)
          : ''}
        confirmLabel="Approve"
      />
      <ConfirmDialog
        isOpen={dialog?.type === 'send'}
        onClose={() => setDialog(null)}
        onConfirm={() => check(dialog.ids, '')}
        loading={busy}
        variant="primary"
        title={dialog?.ids?.length > 1 ? `Send ${dialog.ids.length} lines for approval?` : 'Send this line for approval?'}
        message={dialog?.type === 'send'
          ? `${dialog.ids.length > 1 ? 'They go' : 'It goes'} to the Purchase Head, and ${dialog.ids.length > 1 ? 'their' : 'its'} files are locked once sent. You can recall ${dialog.ids.length > 1 ? 'them' : 'it'} until the Purchase Head acts.${billWarning(dialog.ids)} To add a note, use View/Attach bill instead.`
          : ''}
        confirmLabel="Send for approval"
      />
      <ConfirmDialog
        isOpen={dialog?.type === 'recall'}
        onClose={() => setDialog(null)}
        onConfirm={() => recall(dialog.ids)}
        loading={busy}
        variant="primary"
        title={dialog?.ids?.length > 1 ? `Recall ${dialog.ids.length} lines?` : 'Recall this line?'}
        message={dialog?.type === 'recall'
          ? (dialog.ids.length === 1
            ? `${recordOf(dialog.ids[0])?.label || 'This line'}: ${recordOf(dialog.ids[0])?.status === 'with_accounts_head'
              ? 'your approval is taken back, and it waits for the Purchase Head again.'
              : 'it comes back from the Purchase Head to the bill check, its files unlocked and your note kept.'}`
            : 'Each comes back one step: from the Purchase Head to the bill check, or from the Accountant Head to the Purchase Head. Each recall is kept in the line’s history.')
          : ''}
        confirmLabel="Recall"
      />
    </ReportFrame>
  );
}
