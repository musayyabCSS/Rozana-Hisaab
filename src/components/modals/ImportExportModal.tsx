import { FileDown, FileUp } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { tr } from '@/lib/i18n';
import type { Language } from '@/types';

interface ImportExportModalProps {
  open: boolean;
  onClose: () => void;
  language: Language;
  dir: 'ltr' | 'rtl';
  onImport: () => void;
  onExport: () => void;
}

// One header button for both rarely used file tasks: importing a bank
// statement and exporting transactions.
export function ImportExportModal({ open, onClose, language, dir, onImport, onExport }: ImportExportModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={tr('importExport', language)} subtitle={tr('importExportHelp', language)} dir={dir}>
      <div className="space-y-2.5">
        <button
          type="button"
          onClick={onImport}
          className="flex w-full items-center gap-3.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-start transition-colors hover:bg-emerald-500/15"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white">
            <FileUp size={22} />
          </span>
          <span>
            <span className="block text-[15px] font-bold text-slate-100">{tr('importStatement', language)}</span>
            <span className="mt-0.5 block text-xs text-slate-400">{tr('importStatementHelp', language)}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={onExport}
          className="flex w-full items-center gap-3.5 rounded-2xl border border-slate-800 bg-slate-950/40 p-3.5 text-start transition-colors hover:bg-slate-800"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-700 text-slate-100">
            <FileDown size={22} />
          </span>
          <span>
            <span className="block text-[15px] font-bold text-slate-100">{tr('exportTransactions', language)}</span>
            <span className="mt-0.5 block text-xs text-slate-400">{tr('exportTransactionsHelp', language)}</span>
          </span>
        </button>
      </div>
    </Modal>
  );
}
