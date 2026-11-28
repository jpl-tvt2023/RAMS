import { ReportTable, td, num } from '../reports/ReportFrame';
import { formatDay, formatRupees } from '../../utils/formatters';

// An amount as Tally's register shows it: blank when nothing moved.
const amount = (paise) => (paise ? formatRupees(paise) : '');

/**
 * One tab's financial year, month by month, as Tally's register: how many
 * vouchers, how many need attention, and the Debit or Credit. A month opens
 * its vouchers; its "needs attention" opens only those. A month before RAMS's
 * copy of Tally starts says so.
 */
export default function MonthTable({
  tab, loading, syncFrom, onOpen,
}) {
  const months = tab?.months || [];
  const t = tab?.totals;
  return (
    <ReportTable
      loading={loading}
      head={['Month', { label: 'Vouchers', right: true }, { label: 'Needs attention', right: true }, { label: 'Debit', right: true }, { label: 'Credit', right: true }]}
      foot={t && (
        <tfoot>
          <tr className="bg-gray-50 font-semibold border-t border-gray-200">
            <td className={td}>Grand Total</td>
            <td className={num}>{t.vouchers.toLocaleString('en-IN')}</td>
            <td className={num}>{t.needs_attention.toLocaleString('en-IN')}</td>
            <td className={num}>{amount(t.debit_paise)}</td>
            <td className={num}>{amount(t.credit_paise)}</td>
          </tr>
        </tfoot>
      )}
    >
      {months.map((m) => (
        <tr key={m.month} className="border-b border-gray-100">
          <td className={td}>
            {m.in_copy && m.vouchers > 0 ? (
              <button type="button" onClick={() => onOpen(m.month)} className="font-medium text-brand hover:underline">{m.label}</button>
            ) : <span className={m.in_copy ? 'text-gray-700' : 'text-gray-400'}>{m.label}</span>}
            {!m.in_copy && <p className="text-xs text-gray-400">Not in RAMS: its copy of Tally starts on {formatDay(syncFrom)}</p>}
            {m.from && <p className="text-xs text-gray-400">From {formatDay(m.from)}, when RAMS’s copy of Tally starts</p>}
          </td>
          <td className={num}>{m.in_copy && m.vouchers ? m.vouchers.toLocaleString('en-IN') : ''}</td>
          <td className={num}>
            {m.needs_attention > 0 ? (
              <button type="button" onClick={() => onOpen(m.month, { only: true })} aria-label={`${m.needs_attention} in ${m.label} need attention`} className="text-brand hover:underline">
                {m.needs_attention.toLocaleString('en-IN')}
                <span className="block text-xs text-gray-500">
                  {[m.no_file && `${m.no_file} no file`, m.no_narration && `${m.no_narration} no narration`].filter(Boolean).join(' · ')}
                </span>
              </button>
            ) : (m.in_copy && m.vouchers ? '0' : '')}
          </td>
          <td className={num}>{amount(m.debit_paise)}</td>
          <td className={num}>{amount(m.credit_paise)}</td>
        </tr>
      ))}
    </ReportTable>
  );
}
