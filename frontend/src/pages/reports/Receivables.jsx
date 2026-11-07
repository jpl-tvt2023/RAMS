import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import ReportFrame, { ReportTable, td, num } from '../../components/reports/ReportFrame';
import { HistoryButton } from '../../components/shared/HistoryDrawer';
import {
  getReceivables, getReportSettings, updateReportSettings,
} from '../../api/reports.api';
import { useAuth } from '../../context/AuthContext';
import { useKeyedLoad } from '../../hooks/useKeyedLoad';
import { useSessionState } from '../../hooks/useSessionState';
import { PERM } from '../../utils/roles';
import { formatDay, formatRupees } from '../../utils/formatters';
import { downloadCsv, rupeesForCsv } from '../../utils/csv';

// Reports -> Receivables: per marketplace and company, what was invoiced, how
// it was settled, what is still owed, how old it is, and money received On
// Account (not yet set against an invoice in Tally). Stock transfers are left
// out. The exception days are set here; the credit days on Admin -> Credit
// terms.
const r0 = (p) => formatRupees(p, { decimals: 0 });
const inputCls = 'w-20 px-2 py-1 border border-gray-200 rounded-lg text-sm text-right disabled:bg-gray-50';

// The exception days are set here. Credit days moved to Admin -> Credit
// terms, so they have one place.
function TermsPanel({ canEdit, onSaved }) {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  useEffect(() => {
    getReportSettings().then(setData).catch(() => toast.error('Failed to load the report settings'));
  }, []);
  if (!data) return null;

  const save = async (value) => {
    const v = Number(value);
    if (!Number.isInteger(v) || v === data.settings.exception_days) return;
    try {
      setData(await updateReportSettings({ exception_days: v }));
      toast.success('Saved');
      onSaved();
    } catch (err) { toast.error(err.response?.data?.message || 'Save failed'); }
  };

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4 mt-4" aria-label="Report settings">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-gray-900">Exception days</h2>
        <HistoryButton entityType="report_settings" entityId={1} title="History — report settings" />
      </div>
      <p className="text-sm text-gray-500 mt-1">
        Each marketplace’s credit days are set on{' '}
        {canEdit ? <Link to="/admin/credit-terms" className="text-brand hover:underline">Admin → Credit terms</Link> : 'Admin → Credit terms'}.
      </p>
      <label className="flex items-center gap-2 text-sm mt-3">An invoice with no PO, or an RTV row with no credit note, is an exception after
        <input aria-label="Exception days" className={inputCls} disabled={!canEdit} value={draft ?? String(data.settings.exception_days)}
          onChange={(e) => setDraft(e.target.value)} onBlur={(e) => save(e.target.value)} /> days
      </label>
    </section>
  );
}

export default function Receivables() {
  const { can } = useAuth();
  const [filters, setFilters] = useSessionState('reports.receivables', { company_id: '' });
  const { data, last, loading, reload } = useKeyedLoad(getReceivables, filters);
  const view = data || { rows: [], totals: null, buckets: [] };
  const buckets = (data || last)?.buckets || [];

  const csv = () => downloadCsv('rams-receivables.csv', [
    ['Marketplace', (r) => r.vendor || 'Not known'], ['Company', (r) => r.company], ['Invoices', (r) => r.invoices],
    ['Invoiced', (r) => rupeesForCsv(r.invoiced_paise)], ['Received', (r) => rupeesForCsv(r.received_paise)], ['Credit notes', (r) => rupeesForCsv(r.credit_notes_paise)],
    ['TDS', (r) => rupeesForCsv(r.tds_paise)], ['Adjustments', (r) => rupeesForCsv(r.adjustments_paise)], ['Outstanding', (r) => rupeesForCsv(r.outstanding_paise)],
    ['Overdue', (r) => rupeesForCsv(r.overdue_paise)], ...buckets.map((b) => [b.label, (r) => rupeesForCsv(r[`${b.key}_paise`])]),
    ['Received on account', (r) => rupeesForCsv(r.unallocated_paise)], ['Net outstanding', (r) => rupeesForCsv(r.net_outstanding_paise)],
  ], view.rows);

  const row = (r, key, strong) => (
    <tr key={key} className={`border-b border-gray-100 ${strong ? 'bg-gray-50 font-semibold' : ''}`}>
      <td className={td}>{strong ? 'Total' : r.vendor || <span className="text-gray-500">Not known</span>}{!strong && <p className="text-xs text-gray-400 font-normal">{r.company} · {r.invoices} invoices, {r.open_invoices} open</p>}</td>
      <td className={num}>{r0(r.invoiced_paise)}</td>
      <td className={num}>{r0(r.received_paise)}</td>
      <td className={num}>{r0(r.credit_notes_paise)}</td>
      <td className={num}>{r0(r.tds_paise + r.adjustments_paise)}</td>
      <td className={`${num} font-semibold`}>{r0(r.outstanding_paise)}</td>
      <td className={`${num} text-danger`}>{r.overdue_paise ? r0(r.overdue_paise) : '—'}</td>
      {buckets.map((b) => <td key={b.key} className={num}>{r[`${b.key}_paise`] ? r0(r[`${b.key}_paise`]) : '—'}</td>)}
      <td className={num}>{r.unallocated_paise ? r0(r.unallocated_paise) : '—'}</td>
      <td className={`${num} font-semibold`}>{r0(r.net_outstanding_paise)}</td>
    </tr>
  );

  return (
    <ReportFrame
      title="Receivables"
      help="receivables"
      intro="What each marketplace owes, per company: invoiced, received, credit notes, TDS and adjustments, outstanding, overdue, and how old it is. Stock transfers are left out."
      companies={last?.companies || []}
      companyId={filters.company_id}
      onCompany={(v) => setFilters({ company_id: v })}
      onCsv={csv}
    >
      {data && <p className="text-sm text-gray-500 mb-2">As of {formatDay(data.as_of)}. Age is days since the invoice date.</p>}
      <ReportTable
        loading={loading}
        head={['Marketplace', { label: 'Invoiced', right: true }, { label: 'Received', right: true }, { label: 'Credit notes', right: true },
          { label: 'TDS + adj.', right: true }, { label: 'Outstanding', right: true }, { label: 'Overdue', right: true },
          ...buckets.map((b) => ({ label: b.label, right: true })), { label: 'Received on account', right: true }, { label: 'Net outstanding', right: true }]}
        empty={!loading && view.rows.length === 0 && <p className="text-center text-gray-400 py-8">No invoices yet.</p>}
        foot={view.totals && view.rows.length > 1 ? <tfoot>{row(view.totals, 'total', true)}</tfoot> : null}
      >
        {view.rows.map((r) => row(r, `${r.vendor}|${r.company_id}`))}
      </ReportTable>
      <p className="text-xs text-gray-500 mt-2">
        &ldquo;Received on account&rdquo; is money Tally holds on a marketplace&apos;s ledger without setting it against an invoice (marketplaces often pay into a
        head-office ledger). Net outstanding takes it off. A head-office ledger shows under &ldquo;Not known&rdquo; until it is mapped on{' '}
        <Link to="/matching/parties" className="text-brand hover:underline">Party ledgers</Link>.
      </p>
      <TermsPanel canEdit={can(PERM.REPORTS_SETTINGS)} onSaved={reload} />
    </ReportFrame>
  );
}
