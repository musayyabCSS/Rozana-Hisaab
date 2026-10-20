import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  dir?: 'ltr' | 'rtl';
  closeDisabled?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  dir = 'ltr',
  closeDisabled = false,
}: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]"
        onClick={closeDisabled ? undefined : onClose}
      />
      <div
        dir={dir}
        className="relative w-full sm:max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto animate-[slideUp_0.3s_ease-out]"
      >
        <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-5 py-4 flex items-start justify-between">
          <div className={dir === 'rtl' ? 'text-right' : 'text-left'}>
            <h2 className="text-lg font-bold text-slate-100">{title}</h2>
            {subtitle && <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            disabled={closeDisabled}
            className="shrink-0 p-2 -mt-1 -me-2 rounded-full hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-100"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}
