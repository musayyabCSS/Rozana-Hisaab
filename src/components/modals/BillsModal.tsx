import { ScanLine } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { PendingItemCard } from '@/components/PendingItemCard';
import { BillConnectionsSection } from '@/components/BillConnectionsSection';
import { tr } from '@/lib/i18n';
import { formatDate, formatPKR } from '@/lib/format';
import type { BillEntry, UpcomingItem } from '@/lib/upcoming';
import type { BillConnection, Language, NewTransaction } from '@/types';

interface BillsModalProps {
  open: boolean;
  onClose: () => void;
  language: Language;
  dir: 'ltr' | 'rtl';
  unpaidBills: Extract<UpcomingItem, { kind: 'pending' }>[];
  paidBills: BillEntry[];
  connections: BillConnection[];
  onConfirm: (id: string, updates: Partial<NewTransaction>) => Promise<boolean>;
  onRenameConnection: (id: string, nickname: string) => Promise<boolean>;
  onSetInterval: (id: string, months: number) => Promise<boolean>;
  onDeleteConnection: (id: string) => Promise<boolean>;
  onScanBill: () => void;
}

// Bills only: unpaid ones to settle, paid history, and saved connections.
export function BillsModal({
  open,
  onClose,
  language,
  dir,
  unpaidBills,
  paidBills,
  connections,
  onConfirm,
  onRenameConnection,
  onSetInterval,
  onDeleteConnection,
  onScanBill,
}: BillsModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={tr('bills', language)} dir={dir}>
      <div className="max-h-[calc(90dvh-7rem)] space-y-5 overflow-y-auto px-1 pb-1 text-sm">
        <section className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-amber-400">{tr('billsUnpaid', language)}</h3>
          {unpaidBills.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-700 px-3 py-3 text-center text-xs text-slate-500">
              {tr('billsNoneUnpaid', language)}
            </p>
          ) : (
            <ul className="space-y-2">
              {unpaidBills.map((item) => (
                <PendingItemCard key={item.key} item={item} language={language} onConfirm={onConfirm} />
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">{tr('billsPaid', language)}</h3>
          {paidBills.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-700 px-3 py-3 text-center text-xs text-slate-500">
              {tr('billsNonePaid', language)}
            </p>
          ) : (
            <ul className="space-y-2">
              {paidBills.map((bill) => {
                const Icon = bill.icon;
                return (
                  <li key={bill.key} className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-slate-300">
                      <Icon size={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-100">{bill.label}</p>
                      <p className="text-xs text-slate-400">
                        {tr('billsPaidOn', language).replace('{date}', formatDate(bill.date))}
                      </p>
                    </div>
                    <p dir="ltr" className="font-bold tabular-nums text-slate-100">−{formatPKR(bill.amount)}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <BillConnectionsSection
          connections={connections}
          language={language}
          onRename={onRenameConnection}
          onSetInterval={onSetInterval}
          onDelete={onDeleteConnection}
        />

        <button
          type="button"
          onClick={onScanBill}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3.5 text-sm font-bold text-white"
        >
          <ScanLine size={18} />
          {tr('billsScanNew', language)}
        </button>
      </div>
    </Modal>
  );
}
