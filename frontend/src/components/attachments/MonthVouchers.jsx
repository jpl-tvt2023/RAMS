import { ArrowLeft } from 'lucide-react';
import Legend from '../shared/Legend';
import Narration from '../shared/Narration';
import Pagination from '../ui/Pagination';
import FilesCell from '../files/FilesCell';
import { LastUpdatedCell } from '../shared/LastUpdated';
import { LAST_UPDATED } from '../../utils/lastUpdated';
import EInvoiceCell, { NOT_READ_HELP } from './EInvoiceCell';
import { ReportTable, td, num } from '../reports/ReportFrame';
import { NO_FILE } from '../../utils/highlights';
import { formatDay, formatRupees } from '../../utils/formatters';

const CITY_FROM = {
  tally: 'From the ledger’s address in Tally',
  po: 'From the ROMS PO this voucher is linked to (the ledger has no City in Tally)',
  party_po: 'From this party’s latest ROMS PO (the ledger has no City in Tally)',
};

// The narration as the client asked for it: Yes (the text on hover), the
// yellow "No narration" when the narration check wants one, else a grey No.
function NarrationCell({ r }) {
  if (r.narration) return <span title={r.narration} className="cursor-help">Yes</span>;
  if (r.narration_missing) return <Narration missing />;
  return <span title="The narration check (Admin → Tally companies) doesn’t ask this voucher for one" className="text-gray-400">No</span>;
}

/**
 * One tab's vouchers in one month: number and date, ledger, city, amount,
 * e-invoice, files, narration and the last change made in RAMS. A row without
 * a file is orange. `rows` is the page to show of `total` (after the
 * "needs attention only" and search filters).
 */
export default function MonthVouchers({
  tab, data, loading, rows, total, only, onOnly, onBack, canFiles, onFiles, page, pageSize, onPage, onPageSize,
}) {
  const what = (r) => `${tab.label === 'Invoice' ? 'Invoice' : r.voucher_type} ${r.number || ''}`.trim();
  const head = [
    tab.number_label, 'Ledger', 'City', { label: 'Amount', right: true },
    ...(tab.einvoice ? ['E-Invoice (Ack No)'] : []),
    tab.key === 'invoice' ? 'Invoice PDF' : 'Files', 'Narration', LAST_UPDATED,
  ];
  return (
    <section aria-label={`${tab.label} · ${data?.label || ''}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
          <ArrowLeft size={14} aria-hidden="true" /> All months
        </button>
        <h2 className="text-lg font-semibold text-gray-800">{tab.label} · {data?.label || '…'}</h2>
        {data && (
          <p className="text-sm text-gray-600">
            {data.counts.all.toLocaleString('en-IN')} vouchers · {formatRupees(data.totals.amount_paise)} ·{' '}
            <strong>{data.counts.needs_attention.toLocaleString('en-IN')} need attention</strong>
          </p>
        )}
        <label className="ml-auto inline-flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={only} onChange={(e) => onOnly(e.target.checked)} className="rounded border-gray-300" />
          Needs attention only
        </label>
      </div>
      {data?.from && <p className="text-xs text-gray-500 mb-2">RAMS’s copy of Tally starts on {formatDay(data.from)}: earlier days of this month aren’t here.</p>}
      {data?.einvoice_unread > 0 && (
        <p role="note" title={NOT_READ_HELP} className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-3">
          The e-invoice of {data.einvoice_unread.toLocaleString('en-IN')} {data.einvoice_unread === 1 ? 'voucher' : 'vouchers'} here hasn’t been read yet.
          It shows once the Connector (0.8.0 or later) has loaded all of Tally into RAMS again.
        </p>
      )}
      <ReportTable
        loading={loading}
        maxHeight="max-h-[60vh]"
        head={head}
        empty={!loading && rows.length === 0 && (
          <p className="text-center text-gray-400 py-8">{only ? 'Nothing here needs attention.' : 'No voucher matches.'}</p>
        )}
      >
        {rows.map((r) => (
          <tr key={r.guid} className={`border-b border-gray-100 align-top ${r.has_file ? '' : NO_FILE.row}`}>
            <td className={`${td} whitespace-nowrap`}>
              <span className="font-medium">{r.number || '(no number)'}</span>
              <p className="text-xs text-gray-400">{formatDay(r.date)}{r.voucher_type !== tab.base_type ? ` · ${r.voucher_type}` : ''}</p>
            </td>
            <td className={`${td} max-w-[18rem]`}>
              {r.ledger || <span className="text-gray-400">—</span>}
              {r.ledgers.length > 1 && (
                <span title={r.ledgers.join('\n')} className="block text-xs text-gray-400 cursor-help">+{r.ledgers.length - 1} more</span>
              )}
            </td>
            <td className={td}>
              {r.city ? (
                <span title={[CITY_FROM[r.city_from], r.pincode && `PIN ${r.pincode}`].filter(Boolean).join(' · ')} className="cursor-help">
                  {r.city}
                  {r.city_from !== 'tally' && <span className="block text-xs text-gray-400">from ROMS</span>}
                </span>
              ) : <span className="text-gray-400" title={r.pincode ? `PIN ${r.pincode}` : 'No City in Tally and no ROMS PO'}>—</span>}
            </td>
            <td className={num}>{formatRupees(r.amount_paise)}</td>
            {tab.einvoice && <td className={td}><EInvoiceCell einvoice={r.einvoice} what={what(r)} /></td>}
            <td className={td}>
              <FilesCell files={r.files} what={what(r)} flagged={!r.has_file} canFiles={canFiles} onOpen={() => onFiles(r)} />
            </td>
            <td className={td}><NarrationCell r={r} /></td>
            <td className={td}>
              <LastUpdatedCell
                name={r.last_change?.user_name} at={r.last_change?.at} description={r.last_change?.description}
                entityType="tally_vouchers" entityId={r.id} what={what(r)} title={`History — ${r.number || ''} ${r.ledger || ''}`.trim()}
              />
            </td>
          </tr>
        ))}
      </ReportTable>
      <Legend items={[]} withNarration withNoFile className="mt-2" />
      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={onPage} onPageSizeChange={onPageSize} />
    </section>
  );
}
