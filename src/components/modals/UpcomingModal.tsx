import { Modal } from '@/components/ui/Modal';
import { PendingItemCard } from '@/components/PendingItemCard';
import { tr } from '@/lib/i18n';
import type { UpcomingItem } from '@/lib/upcoming';
import type { Language, NewTransaction } from '@/types';

interface UpcomingModalProps {
  open: boolean;
  onClose: () => void;
  language: Language;
  dir: 'ltr' | 'rtl';
  pendingItems: UpcomingItem[];
  onConfirm: (id: string, updates: Partial<NewTransaction>) => Promise<boolean>;
}

// Every expense and income not yet marked paid or received, overdue first.
export function UpcomingModal({ open, onClose, language, dir, pendingItems, onConfirm }: UpcomingModalProps) {
  const pending = pendingItems.filter(
    (item): item is Extract<UpcomingItem, { kind: 'pending' }> => item.kind === 'pending',
  );
  const overdue = pending.filter((item) => item.overdue);
  const comingUp = pending.filter((item) => !item.overdue);

  return (
    <Modal open={open} onClose={onClose} title={tr('upcoming', language)} subtitle={tr('upcomingHelp', language)} dir={dir}>
      <div className="max-h-[calc(90dvh-8rem)] space-y-5 overflow-y-auto px-1 pb-1 text-sm">
        {pending.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-700 px-3 py-3 text-center text-xs text-slate-500">
            {tr('upcomingNone', language)}
          </p>
        )}
        {overdue.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-rose-400">{tr('upcomingOverdue', language)}</h3>
            <ul className="space-y-2">
              {overdue.map((item) => <PendingItemCard key={item.key} item={item} language={language} onConfirm={onConfirm} />)}
            </ul>
          </section>
        )}
        {comingUp.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">{tr('upcomingComingUp', language)}</h3>
            <ul className="space-y-2">
              {comingUp.map((item) => <PendingItemCard key={item.key} item={item} language={language} onConfirm={onConfirm} />)}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
}
