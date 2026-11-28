import { CheckCircle2, Clock, Minus } from 'lucide-react';
import { approvalOf } from '../../utils/purchaseText';
import { formatDateTime } from '../../utils/formatters';

// One head's approval of a line, in its own column (Purchase Head, Accountant
// Head): "Approved by <name>" on green with the time, else "Pending approval"
// on that head's turn, else "Not approved". Green is the page's one meaning:
// approved. Icon and words, never colour alone.
export default function ApprovalCell({ record, step }) {
  const a = approvalOf(record, step);
  if (a.state === 'approved') {
    return (
      <span className="inline-flex flex-col items-start gap-0.5 rounded-md border border-green-200 bg-green-100 px-2 py-1 text-green-800">
        <span className="inline-flex items-center gap-1 font-medium whitespace-nowrap"><CheckCircle2 size={14} aria-hidden="true" />{a.text}</span>
        {a.at && <span className="text-xs text-green-700 whitespace-nowrap">{formatDateTime(a.at)}</span>}
      </span>
    );
  }
  const Icon = a.state === 'pending' ? Clock : Minus;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap ${a.state === 'pending' ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>
      <Icon size={14} aria-hidden="true" />{a.text}
    </span>
  );
}
