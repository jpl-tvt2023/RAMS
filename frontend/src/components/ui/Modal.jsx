import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// A popup over the page. It is drawn at the end of <body> (a portal), not
// where it is used: a History button sits in a table cell that never wraps
// (whitespace-nowrap), and a popup drawn inside it took that on, so a long
// title ran out of the box and over the close button (the user, 2026-11-29).
// From <body> it inherits nothing from the cell; a long title wraps, and the
// close button keeps its corner.
export default function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 whitespace-normal text-left font-normal">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-label={title} className={`relative bg-white rounded-2xl shadow-2xl w-full ${sizes[size]} max-h-[90vh] flex flex-col`}>
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-gray-100">
          <h2 className="min-w-0 break-words text-lg font-semibold text-brand">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="shrink-0 p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
