import { useState } from 'react';
import toast from 'react-hot-toast';
import ReportFrame, { selectCls } from '../../components/reports/ReportFrame';
import MonthTable from '../../components/attachments/MonthTable';
import MonthVouchers from '../../components/attachments/MonthVouchers';
import FilesDialog from '../../components/files/FilesDialog';
import HistoryDrawer from '../../components/shared/HistoryDrawer';
import { loadPersistedPageSize, persistPageSize } from '../../components/ui/Pagination';
import { getAttachmentMonths, getAttachmentVouchers } from '../../api/attachments.api';
import { useKeyedLoad } from '../../hooks/useKeyedLoad';
import { useSessionState } from '../../hooks/useSessionState';
import { useAuth } from '../../context/AuthContext';
import { PERM } from '../../utils/roles';
import { formatDay } from '../../utils/formatters';
import { downloadCsv, rupeesForCsv } from '../../utils/csv';
import { narrationForCsv } from '../../utils/highlights';
import { ATTACHMENTS_KEY as KEY, ATTACHMENTS_DEFAULTS as DEFAULTS } from '../../utils/attachmentLinks';

// Tally Reports -> Attachments (/reports/attachments): a company's invoices,
// payments, debit and credit notes in a financial year, a tab each, the way
// Tally's voucher registers show them -- month by month with the Debit or
// Credit, and how many need attention (no file, or no narration where the
// narration check wants one). A month opens its vouchers:
// number, ledger, city, amount, e-invoice, the invoice PDF and other files,
// narration and the last change made in RAMS. It opens on the starred company
// and this financial year. A month is loaded whole (a few hundred vouchers at
// most), so "Needs attention only" and the search work without asking again.
const STATIC_TABS = [
  { key: 'invoice', label: 'Invoice' }, { key: 'payment', label: 'Payments' }, { key: 'dn', label: 'Debit Note' }, { key: 'cn', label: 'Credit Note' },
];
const ALL = 10000;
const matches = (q, r) => {
  const s = String(q || '').trim().toLowerCase();
  return !s || [r.number, ...r.ledgers, r.party, r.city, r.einvoice.ack_no, r.einvoice.irn]
    .some((v) => v != null && String(v).toLowerCase().includes(s));
};

export default function Attachments() {
  const { can } = useAuth();
  const [pick, setPick] = useSessionState(KEY, DEFAULTS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => loadPersistedPageSize('attachments', 50));
  const [filesOf, setFilesOf] = useState(null); // a row's guid
  const [historyOf, setHistoryOf] = useState(null); // { id, title }
  const set = (patch) => { setPick((p) => ({ ...p, ...patch })); setPage(1); };

  const months = useKeyedLoad(getAttachmentMonths, { company_id: pick.company_id, fy: pick.fy });
  const m = months.last;
  const tabs = m?.tabs || STATIC_TABS;
  const tab = tabs.find((t) => t.key === pick.tab) || tabs[0];
  // A month opens only once the page knows the company and year it is in.
  const open = Boolean(pick.month && m);
  const vouchers = useKeyedLoad(
    open ? getAttachmentVouchers : noVouchers,
    open ? {
      company_id: m.company_id, fy: m.fy, tab: tab.key, month: pick.month, page_size: ALL,
    } : {},
  );
  const v = vouchers.data;
  const list = (v?.rows || []).filter((r) => (!pick.only || r.needs_attention) && matches(pick.q, r));
  const rows = list.slice((page - 1) * pageSize, page * pageSize);
  const fileRow = filesOf && (v?.rows || vouchers.last?.rows || []).find((r) => r.guid === filesOf);
  const canFiles = can(PERM.STATEMENTS_FILES);

  const reload = () => { months.reload(); vouchers.reload(); };
  const csv = () => {
    downloadCsv(`rams-attachments-${tab.key}-${pick.month}.csv`, [
      [tab.number_label || 'No', (r) => r.number], ['Date', (r) => r.date], ['Type', (r) => r.voucher_type], ['Ledger', (r) => r.ledgers.join('; ')],
      ['City', (r) => r.city || ''], ['PIN', (r) => r.pincode || ''], ['Amount', (r) => rupeesForCsv(r.amount_paise)],
      ...(tab.einvoice ? [['Ack No', (r) => r.einvoice.ack_no || ''], ['Ack date', (r) => r.einvoice.ack_date || ''], ['IRN', (r) => r.einvoice.irn || '']] : []),
      ['Files', (r) => r.files.map((f) => f.name).join('; ')], ['Narration', narrationForCsv],
      ['Last change by', (r) => r.last_change?.user_name || ''], ['Last change at', (r) => r.last_change?.at || ''],
    ], list);
  };

  return (
    <ReportFrame
      title="Attachments"
      help="attachments"
      intro="Each month’s invoices, payments, debit and credit notes, as Tally’s registers show them, with what each still needs: its document and its narration. Everything is read from Tally; nothing here changes Tally."
      companies={m?.companies || []}
      companyId={String(m?.company_id ?? '')}
      onCompany={(id) => set({ company_id: id, month: '' })}
      allCompanies={false}
      filtersFirst
      search={open ? pick.q : undefined}
      onSearch={open ? (q) => set({ q }) : undefined}
      searchHint="Number, ledger, city or Ack No"
      onCsv={open && v ? () => { try { csv(); } catch { toast.error('The download failed'); } } : undefined}
      filters={(
        <select aria-label="Financial year" value={String(m?.fy ?? '')} onChange={(e) => set({ fy: e.target.value, month: '' })} className={selectCls}>
          {(m?.years || []).map((y) => <option key={y.fy} value={y.fy}>FY {y.label}</option>)}
        </select>
      )}
    >
      <div role="tablist" aria-label="Voucher type" className="flex flex-wrap gap-1 mb-3 border-b border-gray-200">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab.key === t.key} onClick={() => set({ tab: t.key })}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab.key === t.key ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            {t.label} <span className="ml-1 text-gray-400">({t.totals?.vouchers?.toLocaleString('en-IN') ?? 0})</span>
          </button>
        ))}
      </div>
      {m && !open && (
        <p className="text-sm text-gray-600 mb-3">
          FY {m.fy_label} · {tab.label === 'Invoice' ? 'Sales' : tab.label} register{m.as_of ? ` · Tally as of ${formatDay(String(m.as_of).slice(0, 10))}` : ''}.
          {' '}Click a month to see its vouchers, or its “Needs attention” to see only those.
        </p>
      )}
      {open ? (
        <MonthVouchers
          tab={tab}
          data={v}
          loading={vouchers.loading}
          rows={rows}
          total={list.length}
          only={pick.only}
          onOnly={(only) => set({ only })}
          onBack={() => set({ month: '', only: false, q: '' })}
          canFiles={canFiles}
          onFiles={(r) => setFilesOf(r.guid)}
          onHistory={(r) => setHistoryOf({ id: r.id, title: `History — ${r.number || ''} ${r.ledger || ''}`.trim() })}
          page={page}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={(s) => { setPageSize(s); persistPageSize('attachments', s); setPage(1); }}
        />
      ) : (
        <MonthTable
          tab={months.data ? months.data.tabs.find((t) => t.key === tab.key) : null}
          loading={months.loading}
          syncFrom={m?.sync_from}
          onOpen={(month, o = {}) => set({ month, only: Boolean(o.only), q: '' })}
        />
      )}
      {fileRow && (
        <FilesDialog
          title={`${tab.key === 'invoice' ? 'Invoice' : fileRow.voucher_type} ${fileRow.number || ''}`.trim()}
          subtitle={`${fileRow.ledger || ''} · ${v?.company || ''} · ${formatDay(fileRow.date)}`}
          files={fileRow.files}
          target={canFiles ? { companyId: m.company_id, voucherGuid: fileRow.guid } : undefined}
          canEdit={canFiles}
          onClose={() => setFilesOf(null)}
          onChanged={reload}
        />
      )}
      <HistoryDrawer open={!!historyOf} onClose={() => setHistoryOf(null)} entityType="tally_vouchers" entityId={historyOf?.id} title={historyOf?.title} />
    </ReportFrame>
  );
}

function noVouchers() {
  return Promise.resolve(null);
}
