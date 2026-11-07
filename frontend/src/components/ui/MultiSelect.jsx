import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * A dropdown of tick boxes with "All" at the top. The value is null (nothing
 * chosen yet), 'all' (everything, including options added later) or a list of
 * option values. Ticking only changes a draft; the choice is applied when the
 * list closes (Done, Escape or a click outside), so a page doesn't reload on
 * every tick. Closes the way NavDropdown does.
 *
 * options: [{ value, label, hint? }]
 */
export default function MultiSelect({
  label, options, value, onChange, placeholder = 'Choose', allLabel = 'All', noun = 'chosen', disabled = false,
}) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [words, setWords] = useState('');

  const sameValue = (a, b) => (a === b) || (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x) => b.includes(x)));
  const close = () => {
    setOpen(false);
    setWords('');
    const next = Array.isArray(draft) && !draft.length ? null : draft;
    if (!sameValue(next, value)) onChange(next);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  });

  const toggleOpen = () => {
    if (open) { close(); return; }
    setDraft(value === 'all' ? 'all' : (value || []));
    setOpen(true);
  };
  const isOn = (v) => draft === 'all' || (Array.isArray(draft) && draft.includes(v));
  const toggle = (v) => setDraft((d) => {
    if (d === 'all') return options.map((o) => o.value).filter((x) => x !== v);
    const list = d || [];
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  });
  const shown = options.filter((o) => !words.trim() || o.label.toLowerCase().includes(words.trim().toLowerCase()));

  let text = placeholder;
  if (value === 'all') text = allLabel;
  else if (Array.isArray(value) && value.length === 1) text = options.find((o) => o.value === value[0])?.label || value[0];
  else if (Array.isArray(value) && value.length > 1) text = `${value.length} ${noun}`;

  return (
    <div className="relative min-w-0" ref={ref}>
      <button type="button" aria-label={label} aria-haspopup="true" aria-expanded={open} disabled={disabled} onClick={toggleOpen}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-left disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand/30 ${value ? 'text-gray-900' : 'text-gray-500'}`}>
        <span className="truncate">{text}</span>
        <ChevronDown size={14} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-72 max-w-[calc(100vw-1rem)] rounded-xl bg-white shadow-lg ring-1 ring-black/5 p-2 z-30">
          {options.length > 8 && (
            <input aria-label={`Search ${label.toLowerCase()}`} value={words} onChange={(e) => setWords(e.target.value)} placeholder="Type to search…"
              className="w-full mb-2 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30" />
          )}
          <div role="group" aria-label={label} className="max-h-64 overflow-y-auto">
            <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 text-sm font-medium border-b border-gray-100 mb-1">
              <input type="checkbox" className="w-4 h-4 accent-brand" checked={draft === 'all'} onChange={() => setDraft((d) => (d === 'all' ? [] : 'all'))} />
              {allLabel}
            </label>
            {shown.map((o) => (
              <label key={o.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 text-sm">
                <input type="checkbox" className="w-4 h-4 accent-brand" checked={isOn(o.value)} onChange={() => toggle(o.value)} />
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.hint && <span className="text-xs text-gray-400 shrink-0">{o.hint}</span>}
              </label>
            ))}
            {!shown.length && <p className="px-2 py-2 text-sm text-gray-400">Nothing matches.</p>}
          </div>
          <div className="flex justify-end pt-2 mt-1 border-t border-gray-100">
            <button type="button" onClick={close} className="px-3 py-1 rounded-lg text-sm font-medium bg-brand text-white hover:bg-brand-hover">Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
