import { CheckCircle2, Clock, Minus } from 'lucide-react';
import { approvalOf } from '../../utils/purchaseText';
import { formatDateTime } from '../../utils/formatters';

// One head's approval of a line, in its own column (Purchase Head, Accountant
// Head): "Approved by <name>" on green with the time, else "Pending approval"
// on that head's turn, else "Not approved". Green is the page's one meaning:
// approved. Icon and words, never colour alone.
//
// onSendBack: given when this person holds that head's step and may still
// change their mind (the user, 2026-11-29) -- a plain "Send back" link under
// the green approval. Plain, not red: red stays for a line that is sent back.
export default function ApprovalCell({ record, step, onSendBack }) {
  const a = approvalOf(record, step);
  if (a.state === 'approved') {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <span className="inline-flex flex-col items-start gap-0.5 rounded-md border border-green-200 bg-green-100 px-2 py-1 text-green-800">
          <span className="inline-flex items-center gap-1 font-medium whitespace-nowrap"><CheckCircle2 size={14} aria-hidden="true" />{a.text}</span>
          {a.at && <span className="text-xs text-green-700 whitespace-nowrap">{formatDateTime(a.at)}</span>}
        </span>
        {onSendBack && (
          <button
            type="button"
            onClick={onSendBack}
            aria-label={`Send back after approving: ${record.label}`}
            className="text-xs text-gray-600 underline decoration-dotted underline-offset-2 hover:text-gray-900"
          >
            Send back
          </button>
        )}
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
