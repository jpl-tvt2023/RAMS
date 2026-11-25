import toast from 'react-hot-toast';
import { Copy, Ban } from 'lucide-react';
import Badge from '../ui/Badge';
import { formatDay } from '../../utils/formatters';

export const NOT_READ_HELP = 'RAMS hasn’t read this voucher’s e-invoice yet. It comes once the Connector (0.8.0 or later) has loaded all of Tally into RAMS again.';

// A voucher's e-invoice as Tally keeps it: the Ack No with its date, the full
// IRN on hover with a button that copies it, and a grey "IRN cancelled" when
// it was cancelled on the portal. "Not read yet" when the voucher came from a
// Connector that didn't read e-invoices; a dash when Tally has none.
export default function EInvoiceCell({ einvoice, what }) {
  if (!einvoice?.read) return <span title={NOT_READ_HELP} className="text-xs text-gray-400 whitespace-nowrap">Not read yet</span>;
  if (!einvoice.ack_no && !einvoice.irn) return <span className="text-gray-400">—</span>;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(einvoice.irn);
      toast.success('IRN copied');
    } catch {
      toast.error('Couldn’t copy the IRN');
    }
  };
  return (
    <div className="whitespace-nowrap">
      <span className="inline-flex items-center gap-1">
        <span title={einvoice.irn ? `IRN ${einvoice.irn}` : undefined} className="font-mono text-xs">{einvoice.ack_no || 'IRN only'}</span>
        {einvoice.irn && (
          <button type="button" onClick={copy} aria-label={`Copy the IRN of ${what}`} title="Copy the IRN" className="text-gray-400 hover:text-brand">
            <Copy size={12} aria-hidden="true" />
          </button>
        )}
      </span>
      {einvoice.ack_date && <p className="text-xs text-gray-400">{formatDay(einvoice.ack_date)}</p>}
      {einvoice.cancelled && <Badge color="gray" icon={Ban} className="mt-0.5">IRN cancelled</Badge>}
    </div>
  );
}
