import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import Modal from '../../components/ui/Modal';
import Pagination, { loadPersistedPageSize, persistPageSize } from '../../components/ui/Pagination';
import ReportFrame, {
  ReportTable, selectCls, td, num,
} from '../../components/reports/ReportFrame';
import { getDebtors } from '../../api/reports.api';
import { useKeyedLoad } from '../../hooks/useKeyedLoad';
import { useSessionState } from '../../hooks/useSessionState';
import { formatDay, formatRupees } from '../../utils/formatters';
import { downloadCsv, rupeesForCsv } from '../../utils/csv';

// Reports -> Debtors: each Tally sales invoice with its internal (ROMS) and
// vendor PO numbers, total, credit notes and what is still owed, a tab per
// marketplace. It opens on the company set as the default on Admin -> Tally
// companies ('default' until the person picks one). Stock transfers are left
// out.
const STATUSES = [['', 'All'], ['open', 'Open'], ['overdue', 'Overdue'], ['settled', 'Settled'], ['no_po', 'No PO']];
const STATUS_LABEL = {
  open: 'Open', overdue: 'Overdue', settled: 'Settled', not_billwise: 'Not bill-wise',
};
const DEFAULTS = {
  company_id: 'default', vendor: '', status: '', q: '',
};
const r0 = (p) => formatRupees(p, { decimals: 0 });

function Outstanding({ r }) {
  if (r.outstanding_paise == null) return <span className="text-gray-400">not bill-wise</span>;
  return (
    <>
      {r.outstanding_paise < 0 ? <span className="text-blue-700">{formatRupees(-r.outstanding_paise)} over</span> : formatRupees(r.outstanding_paise)}
      {r.overdue_days > 0 && <p className="text-xs text-danger font-normal">{r.overdue_days} days overdue</p>}
      {r.status === 'open' && <p className="text-xs text-gray-400 font-normal">due {formatDay(r.due_date)}</p>}
    </>
  );
}

function CreditNotes({ invoice, onClose }) {
  const cns = invoice?.credit_notes || [];
  return (
    <Modal isOpen={!!invoice} onClose={onClose} title={`Credit notes — ${invoice?.number}`} size="lg">
      <p className="text-sm text-gray-500 mb-3">{invoice?.party} · {invoice?.company} · invoice of {formatDay(invoice?.date)} for {formatRupees(invoice?.total_paise)}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {['CN No', 'Date', 'Type', 'Amount', 'RTV No'].map((h) => (
                <th key={h} className={`px-3 py-2 font-semibold text-gray-600 whitespace-nowrap ${h === 'Amount' ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cns.map((c) => (
              <tr key={c.guid || c.number} className="border-b border-gray-100">
                <td className={`${td} font-medium`}>{c.number}</td>
                <td className={`${td} whitespace-nowrap`}>{formatDay(c.date)}</td>
                <td className={td}>{c.voucher_type}</td>
                <td className={num}>{formatRupees(c.amount_paise)}</td>
                <td className={td}>{c.rtv_no || <span className="text-gray-400">—</span>}</td>
              </tr>
            ))}
          </tbody>
          {cns.length > 1 && (
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td className={td} colSpan={3}>Total</td>
                <td className={num}>{formatRupees(invoice.credit_notes_paise)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-xs text-gray-500 mt-3">
        Each amount is what that credit note was set against this invoice in Tally. One credit note can be split across several invoices.
        The RTV No is the ROMS return row it was linked to, when there is one.
      </p>
    </Modal>
  );
}

export default function Debtors() {
  const [filters, setFilters] = useSessionState('reports.debtors', DEFAULTS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => loadPersistedPageSize('debtors', 50));
  const [cnsOf, setCnsOf] = useState(null);
  const { data, last, loading } = useKeyedLoad(getDebtors, { ...filters, page, page_size: pageSize });
  const set = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };
  const view = data || { rows: [], total: last?.total || 0 };
  const shown = data || last;
  const companyId = filters.company_id === 'default' ? String(last?.company_id ?? '') : filters.company_id;

  const tabs = [
    ['', 'All', shown?.all],
    ...(shown?.tabs || []).map((t) => [t.vendor, t.vendor, t.count]),
    ...(shown?.unknown || filters.vendor === '-' ? [['-', 'Not known', shown?.unknown]] : []),
  ];

  const csv = async () => {
    try {
      const all = await getDebtors({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page_size: 10000 });
      downloadCsv('rams-debtors.csv', [
        ['Company', (r) => r.company], ['Invoice', (r) => r.number], ['Date', (r) => r.date], ['Party', (r) => r.party],
        ['Marketplace', (r) => r.vendor || ''], ['Internal PO no', (r) => r.pos.join(' ')], ['Vendor PO no', (r) => r.vendor_pos.join(' ')],
        ['Amount', (r) => rupeesForCsv(r.total_paise)], ['CN', (r) => rupeesForCsv(r.credit_notes_paise)], ['CN numbers', (r) => r.credit_notes.map((c) => c.number).join(' ')],
        ['Outstanding', (r) => rupeesForCsv(r.outstanding_paise)], ['Status', (r) => STATUS_LABEL[r.status] || r.status],
      ], all.rows);
    } catch { toast.error('The download failed'); }
  };

  return (
    <ReportFrame
      title="Debtors"
      help="debtors"
      intro="Each Tally sales invoice, by marketplace: its internal and vendor PO numbers, the amount, credit notes against it and what is still owed. Figures are worked out from Tally each time you open the page."
      companies={last?.companies || []}
      companyId={companyId}
      onCompany={(v) => set({ company_id: v })}
      search={filters.q}
      onSearch={(v) => set({ q: v })}
      searchHint="Invoice, party, internal or vendor PO no"
      onCsv={csv}
      filters={(
        <select aria-label="Status" value={filters.status} onChange={(e) => set({ status: e.target.value })} className={selectCls}>
          {STATUSES.map(([k, label]) => <option key={label} value={k}>{label === 'All' ? 'All statuses' : label}</option>)}
        </select>
      )}
    >
      <div role="tablist" aria-label="Marketplace" className="flex flex-wrap gap-1 mb-3 border-b border-gray-200">
        {tabs.map(([k, label, count]) => (
          <button key={k} type="button" role="tab" aria-selected={filters.vendor === k} onClick={() => set({ vendor: k })}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${filters.vendor === k ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            {label} <span className="ml-1 text-gray-400">({count ?? 0})</span>
          </button>
        ))}
      </div>
      {data?.totals && (
        <p className="text-sm text-gray-600 mb-3">
          {data.totals.invoices.toLocaleString('en-IN')} invoices · {r0(data.totals.total_paise)} invoiced · {r0(data.totals.credit_notes_paise)} credit notes ·{' '}
          <strong>{r0(data.totals.outstanding_paise)} outstanding</strong>
          {data.totals.overdue_paise ? <span className="text-danger"> · {r0(data.totals.overdue_paise)} overdue</span> : null}
        </p>
      )}
      <ReportTable
        loading={loading}
        head={['Invoice', 'Party', 'Internal PO no', 'Vendor PO no', { label: 'Amount', right: true }, { label: 'CN', right: true }, { label: 'Outstanding', right: true }]}
        empty={!loading && view.rows.length === 0 && <p className="text-center text-gray-400 py-8">No invoice matches these filters.</p>}
      >
        {view.rows.map((r) => (
          <tr key={r.guid} className="border-b border-gray-100 align-top">
            <td className={`${td} whitespace-nowrap`}><span className="font-medium">{r.number}</span><p className="text-xs text-gray-400">{r.company} · {formatDay(r.date)}</p></td>
            <td className={`${td} max-w-[16rem]`}>{r.party}</td>
            <td className={`${td} whitespace-nowrap`}>
              {r.pos.length > 0
                ? <Link to="/matching" className="text-brand hover:underline">{r.pos.join(', ')}</Link>
                : <span className="text-gray-400">—</span>}
            </td>
            <td className={td}>{r.vendor_pos.length > 0 ? r.vendor_pos.join(', ') : <span className="text-gray-400">—</span>}</td>
            <td className={num}>{formatRupees(r.total_paise)}</td>
            <td className={num}>
              {r.credit_notes.length > 0 ? (
                <button type="button" onClick={() => setCnsOf(r)} aria-label={`Credit notes on ${r.number}`} className="text-right text-brand hover:underline">
                  {formatRupees(r.credit_notes_paise)}
                  <span className="block text-xs text-gray-500 whitespace-normal">{r.credit_notes.map((c) => c.number).join(', ')}</span>
                </button>
              ) : <span className="text-gray-400">—</span>}
            </td>
            <td className={`${num} font-medium`}><Outstanding r={r} /></td>
          </tr>
        ))}
      </ReportTable>
      <Pagination page={page} pageSize={pageSize} total={view.total} onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); persistPageSize('debtors', s); setPage(1); }} />
      <CreditNotes invoice={cnsOf} onClose={() => setCnsOf(null)} />
    </ReportFrame>
  );
}
