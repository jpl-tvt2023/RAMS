import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Paperclip } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import FilesDialog from '../../components/files/FilesDialog';
import Legend from '../../components/shared/Legend';
import Pagination, { loadPersistedPageSize, persistPageSize } from '../../components/ui/Pagination';
import ReportFrame, {
  ReportTable, selectCls, td, num,
} from '../../components/reports/ReportFrame';
import { getBillsReceivable } from '../../api/reports.api';
import { useKeyedLoad } from '../../hooks/useKeyedLoad';
import { useSessionState } from '../../hooks/useSessionState';
import { formatDay, formatRupees } from '../../utils/formatters';
import { downloadCsv, rupeesForCsv } from '../../utils/csv';
import Narration from '../../components/shared/Narration';
import { narrationForCsv, NO_FILE } from '../../utils/highlights';
import { useAuth } from '../../context/AuthContext';
import { PERM } from '../../utils/roles';
import { openStatementsAt } from '../../utils/statementLinks';

// Tally Reports -> Bills Receivable (the page at /reports/bills-receivable, once called Debtors):
// each Tally sales invoice with its internal (ROMS)
// and vendor PO numbers, total, credit notes and what is still owed, a tab per
// marketplace. It opens on the company set as the default on Admin -> Tally
// companies ('default' until the person picks one). Stock transfers are left
// out. The files on an invoice and on its credit notes (added on Party Statements) can
// be viewed and downloaded. An invoice of a party on Party Statements is orange while a
// DN or CN against it has no file; the CN popup says which, and links to
// Party Statements to add it.
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

// A credit note's files in the popup: how many (they open read-only), or, for
// a party on Party Statements, an orange "No file" and a link to add it there.
function NoteFiles({
  note, invoice, canStatements, onFiles, onStatements,
}) {
  const files = note.files || [];
  if (files.length) {
    return (
      <button type="button" aria-label={`Files on ${note.voucher_type} ${note.number}`} onClick={() => onFiles(note)} className="inline-flex items-center gap-1 text-brand hover:underline whitespace-nowrap">
        <Paperclip size={14} aria-hidden="true" />
        {files.length} {files.length === 1 ? 'file' : 'files'}
      </button>
    );
  }
  if (!invoice.ledger) return <span className="text-gray-400">—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span title={NO_FILE.help} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap ${NO_FILE.className}`}>
        <Paperclip size={12} aria-hidden="true" />
        {NO_FILE.label}
      </span>
      {canStatements && (
        <button type="button" onClick={() => onStatements(note)} className="text-xs font-medium text-brand hover:underline whitespace-nowrap">Add it on Party Statements</button>
      )}
    </span>
  );
}

function CreditNotes({
  invoice, onClose, canStatements, onFiles, onStatements,
}) {
  const cns = invoice?.credit_notes || [];
  return (
    <Modal isOpen={!!invoice} onClose={onClose} title={`Credit notes — ${invoice?.number}`} size="lg">
      <p className="text-sm text-gray-500 mb-3">{invoice?.party} · {invoice?.company} · invoice of {formatDay(invoice?.date)} for {formatRupees(invoice?.total_paise)}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {['CN No', 'Date', 'Type', 'Narration', 'Amount', 'RTV No', 'Files'].map((h) => (
                <th key={h} className={`px-3 py-2 font-semibold text-gray-600 whitespace-nowrap ${h === 'Amount' ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cns.map((c) => (
              <tr key={c.guid || c.number} className={`border-b border-gray-100 ${invoice.ledger && !(c.files || []).length ? NO_FILE.row : ''}`}>
                <td className={`${td} font-medium`}>{c.number}</td>
                <td className={`${td} whitespace-nowrap`}>{formatDay(c.date)}</td>
                <td className={td}>{c.voucher_type}</td>
                <td className={td}><Narration text={c.narration} missing={c.narration_missing} /></td>
                <td className={num}>{formatRupees(c.amount_paise)}</td>
                <td className={td}>{c.rtv_no || <span className="text-gray-400">—</span>}</td>
                <td className={td}>
                  <NoteFiles note={c} invoice={invoice} canStatements={canStatements} onFiles={onFiles} onStatements={onStatements} />
                </td>
              </tr>
            ))}
          </tbody>
          {cns.length > 1 && (
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td className={td} colSpan={4}>Total</td>
                <td className={num}>{formatRupees(invoice.credit_notes_paise)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-xs text-gray-500 mt-3">
        Each amount is what that credit note was set against this invoice in Tally. One credit note can be split across several invoices.
        The RTV No is the ROMS return row it was linked to, when there is one.
        {invoice?.ledger && ' Each note’s document (the marketplace’s DN, or our CN) is added on Party Statements; until it is, the note and this invoice are orange.'}
      </p>
    </Modal>
  );
}

export default function BillsReceivable() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [filters, setFilters] = useSessionState('reports.billsReceivable', DEFAULTS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => loadPersistedPageSize('billsReceivable', 50));
  const [cnsOf, setCnsOf] = useState(null);
  const [filesOf, setFilesOf] = useState(null); // { title, subtitle, files }
  const { data, last, loading } = useKeyedLoad(getBillsReceivable, { ...filters, page, page_size: pageSize });
  const set = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };
  const view = data || { rows: [], total: last?.total || 0 };
  const shown = data || last;
  const companyId = filters.company_id === 'default' ? String(last?.company_id ?? '') : filters.company_id;
  const canStatements = can(PERM.STATEMENTS_VIEW);

  const invoiceFiles = (r) => setFilesOf({
    title: `Invoice ${r.number}`, subtitle: `${r.party} · ${r.company} · ${formatDay(r.date)}. Files are added on Party Statements or Attachments.`, files: r.files,
  });
  const noteFiles = (c) => {
    const inv = cnsOf;
    setCnsOf(null);
    setFilesOf({
      title: `${c.voucher_type} ${c.number}`, subtitle: `${inv.party} · ${inv.company} · ${formatDay(c.date)}. Files are added on Party Statements or Attachments.`, files: c.files,
    });
  };
  // Party Statements, on the invoice's party from the note's date, showing just the
  // rows without a file.
  const addOnStatements = (c) => {
    openStatementsAt({
      companyId: cnsOf.company_id, vendor: cnsOf.ledger.vendor, guid: cnsOf.ledger.guid, date: c.date, syncFrom: shown?.sync_from, nofile: true,
    });
    navigate('/reports/party-statements');
  };

  const tabs = [
    ['', 'All', shown?.all],
    ...(shown?.tabs || []).map((t) => [t.vendor, t.vendor, t.count]),
    ...(shown?.unknown || filters.vendor === '-' ? [['-', 'Not known', shown?.unknown]] : []),
  ];

  const csv = async () => {
    try {
      const all = await getBillsReceivable({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page_size: 10000 });
      downloadCsv('rams-bills-receivable.csv', [
        ['Company', (r) => r.company], ['Invoice', (r) => r.number], ['Date', (r) => r.date], ['Narration', narrationForCsv], ['Party', (r) => r.party],
        ['Marketplace', (r) => r.vendor || ''], ['Internal PO no', (r) => r.pos.join(' ')], ['Vendor PO no', (r) => r.vendor_pos.join(' ')],
        ['Amount', (r) => rupeesForCsv(r.total_paise)], ['CN', (r) => rupeesForCsv(r.credit_notes_paise)], ['CN numbers', (r) => r.credit_notes.map((c) => c.number).join(' ')],
        ['Outstanding', (r) => rupeesForCsv(r.outstanding_paise)], ['Status', (r) => STATUS_LABEL[r.status] || r.status],
        ['CN without a file', (r) => (r.ledger ? r.credit_notes.filter((c) => !(c.files || []).length).map((c) => c.number).join(' ') : '')],
      ], all.rows);
    } catch { toast.error('The download failed'); }
  };

  return (
    <ReportFrame
      title="Bills Receivable"
      help="bills-receivable"
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
        head={['Invoice', 'Party', 'Internal PO no', 'Vendor PO no', { label: 'Amount', right: true }, { label: 'CN', right: true }, { label: 'Outstanding', right: true }, 'Files']}
        empty={!loading && view.rows.length === 0 && <p className="text-center text-gray-400 py-8">No invoice matches these filters.</p>}
      >
        {view.rows.map((r) => (
          <tr key={r.guid} className={`border-b border-gray-100 align-top ${r.notes_without_file > 0 ? NO_FILE.row : ''}`}>
            <td className={`${td} whitespace-nowrap`}>
              <span className="font-medium">{r.number}</span>
              <p className="text-xs text-gray-400">{r.company} · {formatDay(r.date)}</p>
              <Narration text={r.narration} missing={r.narration_missing} className="mt-0.5 whitespace-normal" />
            </td>
            <td className={`${td} max-w-[16rem]`}>{r.party}</td>
            <td className={`${td} whitespace-nowrap`}>
              {r.pos.length > 0 && <Link to="/matching" className="text-brand hover:underline">{r.pos.join(', ')}</Link>}
              {!r.pos.length && r.before_matching && (
                <span className="text-xs text-gray-400" title={`Dated before ROMS went live (${formatDay(shown?.match_from)}): it has no ROMS PO and is never “No PO”`}>Before ROMS</span>
              )}
              {!r.pos.length && !r.before_matching && <span className="text-gray-400">—</span>}
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
              {r.notes_without_file > 0 && (
                <span title={NO_FILE.invoiceHelp} className={`mt-0.5 ml-auto flex w-fit items-center gap-1 px-1.5 rounded text-xs font-medium whitespace-nowrap ${NO_FILE.className}`}>
                  <Paperclip size={11} aria-hidden="true" />
                  {r.notes_without_file} without a file
                </span>
              )}
            </td>
            <td className={`${num} font-medium`}><Outstanding r={r} /></td>
            <td className={td}>
              {r.files?.length > 0 ? (
                <button type="button" onClick={() => invoiceFiles(r)} aria-label={`Files on ${r.number}`} className="inline-flex items-center gap-1 text-brand hover:underline whitespace-nowrap">
                  <Paperclip size={14} aria-hidden="true" />
                  {r.files.length} {r.files.length === 1 ? 'file' : 'files'}
                </button>
              ) : <span className="text-gray-400">—</span>}
            </td>
          </tr>
        ))}
      </ReportTable>
      {view.rows.some((r) => r.notes_without_file > 0) && <Legend items={[]} withNoFile className="mt-2" />}
      <Pagination page={page} pageSize={pageSize} total={view.total} onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); persistPageSize('billsReceivable', s); setPage(1); }} />
      <CreditNotes invoice={cnsOf} onClose={() => setCnsOf(null)} canStatements={canStatements} onFiles={noteFiles} onStatements={addOnStatements} />
      {filesOf && (
        <FilesDialog
          title={filesOf.title}
          subtitle={filesOf.subtitle}
          files={filesOf.files}
          onClose={() => setFilesOf(null)}
        />
      )}
    </ReportFrame>
  );
}
